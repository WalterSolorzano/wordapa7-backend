import asyncio
import hashlib
import json
import logging
import os
import time
from contextlib import contextmanager
from asyncio import Lock
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from classification.llm_classifier import PROVIDER_CAPACITY, _get_active_providers
from modules.ai_budget import PresupuestoDiario, backoff_con_jitter, cooldown_para

logger = logging.getLogger(__name__)

CACHE_FILE_PATH = Path("storage/ai_cache.json")

# Definición de Especialidades
PROVIDER_SPECIALTIES = {
    # El orden importa y estaba mal. Una sonda contra los ocho proveedores
    # configurados (2026-09-27) dio: NVIDIA NIM 410 en TODOS sus modelos (el
    # Llama 3.1 70b murio el 2026-08-26), Groq 401 key invalida, OpenRouter 402
    # sin credito, Gemini 401, Cerebras 404 en todos los gratuitos y 402 en los
    # de pago, OpenCodeZen con DNS muerto. Los unicos que responden son ZenMux y
    # Mistral, este ultimo con throttling.
    #
    # Y `zenmux` NO estaba en HEAVY ni en FAST: era el unico que funcionaba y no
    # lo probaban nunca. Por eso caian las tres especialidades.
    #
    # Esto se va a volver a envejecer. El arreglo de raiz no es esta tabla sino
    # un cortocircuito por proveedor que deje de reintentar uno que ya respondio
    # 410 o 401. Puesto aca mientras tanto.
    "FAST": ["zenmux", "huggingface", "ollama_cloud", "aion", "kilocode",
             "groq", "cerebras", "cloudflare"],
    "HEAVY": ["ollama_cloud", "zenmux", "aion", "huggingface", "kilocode",
              "gemini", "nvidia_nim", "openrouter", "ollama_cloud"],
    "REASONING": ["ollama_cloud", "aion", "zenmux", "huggingface", "kilocode",
                  "nvidia_nim", "openrouter", "opencodezen", "ollama_cloud"],
}

# --- Predictive Token Bucket Rate Limiter ---
class TokenBucket:
    def __init__(self, capacity: int, fill_rate: float):
        self.capacity = capacity
        self.tokens = float(capacity)
        self.fill_rate = fill_rate
        self.last_update = time.time()
        self.lock = Lock()

    async def consume(self, tokens: int = 1) -> bool:
        async with self.lock:
            now = time.time()
            elapsed = now - self.last_update
            self.tokens = min(float(self.capacity), self.tokens + elapsed * self.fill_rate)
            self.last_update = now

            if self.tokens >= tokens:
                self.tokens -= tokens
                return True
            return False

class RateLimiterRegistry:
    def __init__(self):
        self.buckets: Dict[str, TokenBucket] = {}

    def get_bucket(self, provider_id: str, rpm: int) -> TokenBucket:
        if provider_id not in self.buckets:
            # Capacity = max burst (rpm / 6, min 2), fill_rate = tokens per second
            capacity = max(2, rpm // 6)
            fill_rate = rpm / 60.0
            self.buckets[provider_id] = TokenBucket(capacity=capacity, fill_rate=fill_rate)
        return self.buckets[provider_id]

_limiter_registry = RateLimiterRegistry()
_provider_cooldowns: Dict[str, float] = {}
_provider_health: Dict[str, Dict[str, Any]] = {}

# Presupuesto diario por proveedor: raciona el free tier entre usuarios. Cuando
# el cupo del proveedor se agota, el router lo salta como si estuviera en
# cooldown. Ver modules/ai_budget.py.
_presupuesto = PresupuestoDiario()

# --- Circuit breaker por proveedor ---
# Sustituye a `_provider_cooldowns` como fuente de decisión del enrutado. Los
# cooldowns se siguen escribiendo para el indicador de salud y por compatibilidad
# con los tests existentes, pero quien decide saltarse un proveedor es el breaker:
# un 401/404/410 lo abre tras `_BREAKER_THRESHOLD` fallos y solo se vuelve a
# probar en `half_open` pasado el cooldown.
_BREAKER_THRESHOLD = int(os.getenv("AI_BREAKER_THRESHOLD", "3"))
_BREAKER_COOLDOWN_S = float(os.getenv("AI_BREAKER_COOLDOWN_S", "60"))
_provider_breaker: Dict[str, Dict[str, Any]] = {}


def _breaker_estado(p_id: str) -> Dict[str, Any]:
    b = _provider_breaker.setdefault(
        p_id, {"state": "closed", "failures": 0, "opened_at": 0.0}
    )
    if b["state"] == "open" and time.time() - b["opened_at"] >= _BREAKER_COOLDOWN_S:
        b["state"] = "half_open"
    return b


def _breaker_allows(p_id: str) -> bool:
    return _breaker_estado(p_id)["state"] != "open"


def _breaker_record(p_id: str, ok: bool) -> None:
    b = _provider_breaker.setdefault(
        p_id, {"state": "closed", "failures": 0, "opened_at": 0.0}
    )
    if ok:
        b["state"] = "closed"
        b["failures"] = 0
        return
    b["failures"] += 1
    if b["failures"] >= _BREAKER_THRESHOLD or b["state"] == "half_open":
        b["state"] = "open"
        b["opened_at"] = time.time()

# --- Cache ---
# El archivo es UNO, pero lo usan dos capas con claves distintas: las respuestas
# del prompt (`sha256(prompt + system_prompt)`) y la clasificacion por elemento
# de `llm_classifier` (`_classification_cache_key`). Por eso `_save_cache` mezcla
# en vez de reemplazar: si reemplazara, cada clasificacion borraria las
# respuestas de los motores y las dos capas se pisarian en silencio.

_CACHE_MAX_ENTRADAS = 5000

# El diccionario en memoria es la VERDAD: el archivo es su forma durable. Antes
# se leia y escribia por llamada, y un lote de cuarenta parrafos leia y
# reescribia el JSON cuarenta veces.
_cache: Dict[str, str] = {}
_cache_cargada = False
_cache_sucia = False
_profundidad_de_lote = 0


def _compute_text_hash(text: str) -> str:
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()


def _cache_en_memoria() -> Dict[str, str]:
    """El diccionario compartido, leyendolo del archivo la primera vez.

    Se lee UNA vez. Leerlo por llamada no cuesta tiempo: cuesta la opcion de que
    alguien lo cambie entre medio, que es justo lo que no se quiere de una cache.
    """
    global _cache_cargada
    if not _cache_cargada:
        _cache_cargada = True
        if CACHE_FILE_PATH.exists():
            try:
                with open(CACHE_FILE_PATH, "r", encoding="utf-8") as f:
                    cargado = json.load(f)
                if isinstance(cargado, dict):
                    _cache.update(cargado)
            except Exception as e:
                # Un JSON a medias o un archivo de otra version. La cache es una
                # cache: si no se puede leer, se sigue trabajando sin ella. Y NO
                # se pisa con `{}` al primer guardado, porque eso borra lo que
                # hubiera sin que hiciera falta perderlo.
                logger.warning(f"Cache de LLM ilegible, se sigue sin el: {e}")
    return _cache


def _load_cache() -> Dict[str, str]:
    """El diccionario en memoria.

    Quien lo recibe lo puede mutar y pasar a `_save_cache` despues: es el patron
    que usa `llm_classifier`. Se devuelve el objeto compartido, no una copia,
    porque una copia obligaria a releer el archivo en cada llamada, que es
    justamente lo que se cambio.
    """
    return _cache_en_memoria()


def _poda(cache: Dict[str, str]) -> None:
    """Recorta EN SITIO. Antes hacia `cache = dict(list(cache.items())[-5000:])`,
    que reasignaba el nombre local: el archivo bajaba de 5000 entradas y la
    memoria de arriba seguia creciendo, para volver a crecer en el proximo
    guardado. Con la memoria compartida, la poda tiene que recortar la misma
    estructura que se escribe.
    """
    if len(cache) <= _CACHE_MAX_ENTRADAS:
        return
    for clave in list(cache.keys())[:-_CACHE_MAX_ENTRADAS]:
        del cache[clave]


def _volcar_cache() -> None:
    """Escribe el archivo de forma ATOMICA.

    Se escribe a un lado y se mueve con `os.replace`, que en Windows y en POSIX
    es atomico. Escribir directo abre el archivo en modo `"w"` y lo TRUNCA: si el
    proceso se corta en medio del `json.dump` —un Ctrl+C, un cierre de la app, un
    portatil que se duerme— el archivo queda en un JSON a medias, y la proxima
    `_load_cache` se come la excepcion y devuelve `{}`. O sea: **toda la cache se
    pierde en silencio**. Sin error, sin aviso, y la reauditoria siguiente vuelve
    a pagar el documento entero. Un error de cache se diagnostica; una cache que
    se vacia sola se descubre en la factura.
    """
    global _cache_sucia
    cache = _cache_en_memoria()
    _poda(cache)
    temporal = CACHE_FILE_PATH.with_name(CACHE_FILE_PATH.name + ".tmp")
    try:
        CACHE_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(temporal, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
        os.replace(temporal, CACHE_FILE_PATH)
        _cache_sucia = False
    except Exception as e:
        logger.warning(f"No se pudo guardar el cache de LLM: {e}")
    finally:
        # El temporal no puede quedar, ni en el exito ni en la excepcion: seria
        # la unica copia de una respuesta que ya se pago, en un archivo que nadie
        # va a leer. En el exito ya no existe — `os.replace` lo movio — asi que
        # esto no hace nada.
        try:
            if temporal.exists():
                temporal.unlink()
        except Exception:
            pass


def _save_cache(cache: Dict[str, str]) -> None:
    """Mezcla `cache` en la memoria y la deja durable.

    Dentro de un `lote_cache()` no toca el disco: se anota para el volteo del
    cierre del lote. Un lote de cuarenta parrafos volca una vez, no cuarenta.
    """
    global _cache_sucia
    if not cache:
        return
    memoria = _cache_en_memoria()
    # Copia previa para poder deshacer si la escritura se corta. Cuesta una copia
    # de un diccionario de cadenas y compra que la memoria nunca prometa
    # respuestas que no estan en el archivo.
    antes = dict(memoria)
    memoria.update(cache)
    _cache_sucia = True

    if _profundidad_de_lote > 0:
        return

    try:
        _volcar_cache()
    except BaseException:
        # Si la escritura se corto, la memoria queda como estaba: un estado en
        # memoria que promete respuestas que no estan en el archivo es peor que
        # no tenerlas, porque el proximo guardado las escribiria y nadie sabria
        # de donde salieron.
        memoria.clear()
        memoria.update(antes)
        raise


@contextmanager
def lote_cache():
    """Agrupa las escrituras de la cache y las hace UNA al salir.

    El LOTE es explicito y no un temporizador magico. Un debounce que depende del
    reloj decide por su cuenta cuando volcar, y la forma de que se pierda la
    ultima escritura es que nadie se acuerde de la ultima. Ademas asi el
    volteo se puede poner en el punto que el codigo conoce: el fin del lote.

    Anidable: el volteo ocurre cuando cierra el de AFUERA, que es el unico
    momento en que nadie puede volver a necesitar la cache en memoria.

    Y el volteo va en el `finally`, no despues: si el LLM tira a la mitad del
    lote, las respuestas que SI salieron valen plata pagada y no se pueden
    perder. De las cuarenta, treinta y siete son reales.
    """
    global _profundidad_de_lote
    _profundidad_de_lote += 1
    try:
        yield
    finally:
        _profundidad_de_lote -= 1
        if _profundidad_de_lote == 0 and _cache_sucia:
            _volcar_cache()


def en_lote(fn):
    """El decorador de `lote_cache()`, para funciones `async` de un lote entero.

    Existe para lo que de verdad son los lotes: una funcion que recorre el
    documento y llama al LLM una vez por elemento. Envolverla con un `with`
    exigiria reindentar el bucle entero, y reindentar a mano un bloque largo es
    la forma mas directa de corromper un archivo sin que nada falle. Con el
    decorador, el lote es una linea y el cuerpo no se toca.

    Un `with` explicito sigue siendo mejor cuando el lote es una parte del
    codigo y no la funcion entera; el decorador es para cuando la funcion ES el
    lote, que es el caso de las tres funciones que mas llaman al LLM.
    """
    import functools

    @functools.wraps(fn)
    async def envuelta(*args, **kwargs):
        with lote_cache():
            return await fn(*args, **kwargs)

    return envuelta

async def _try_provider(
    provider: Dict[str, Any],
    payload: Dict[str, Any],
    timeout: int,
    retries: int = 1 # Reducido porque preferimos enrutar al siguiente antes que esperar mucho
) -> Optional[Dict[str, Any]]:
    """Intenta llamar a un proveedor, manejando 429 con backoff rápido o fallando para el FIFO."""

    for attempt in range(retries):
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                resp = await client.post(
                    provider["url"],
                    json=payload,
                    headers=provider["headers"](provider["key"]),
                )

            if resp.status_code == 200:
                _provider_health[provider["id"]] = {"status": "healthy", "checked_at": time.time()}
                return resp.json()

            elif resp.status_code == 429:
                cd = cooldown_para(429, getattr(resp, "headers", None) or {})
                _provider_cooldowns[provider["id"]] = time.time() + cd
                _provider_health[provider["id"]] = {"status": "rate_limited", "checked_at": time.time()}
                wait_time = min(cd, backoff_con_jitter(attempt))
                logger.warning(f"[AI] {provider['name']} devolvió 429. Cooldown {cd}s, espera {wait_time:.1f}s.")
                await asyncio.sleep(wait_time)
                continue

            else:
                cooldown = cooldown_para(resp.status_code, getattr(resp, "headers", None) or {})
                _provider_cooldowns[provider["id"]] = time.time() + cooldown
                _provider_health[provider["id"]] = {
                    "status": "unavailable",
                    "http_status": resp.status_code,
                    "checked_at": time.time(),
                }
                logger.warning(f"[AI] {provider['name']} falló con status {resp.status_code}: {resp.text}")
                return None

        except (httpx.RequestError, asyncio.TimeoutError) as e:
            _provider_health[provider["id"]] = {"status": "offline", "checked_at": time.time()}
            logger.warning(f"[AI] {provider['name']} error de red/timeout: {e}")
            if attempt == retries - 1:
                return None
            await asyncio.sleep(0.5)

    return None

def _construir_messages(system_prompt: str, prompt: str,
                        image_b64: Optional[str] = None) -> List[Dict[str, Any]]:
    """Arma los mensajes del payload. Con `image_b64` el turno del usuario lleva
    un bloque multimodal (texto + imagen), que es lo que consume el modelo de
    visión. Sin imagen, es texto plano como siempre."""
    if not image_b64:
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ]
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url",
             "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
        ]},
    ]

async def execute_with_specialty(
    prompt: str,
    system_prompt: str,
    specialty: str = "HEAVY",
    api_key: Optional[str] = None,
    nim_url: Optional[str] = None,
    use_local: bool = False,
    temperature: float = 0.3,
    max_tokens: int = 1000,
    use_cache: bool = True,
    return_provider_info: bool = False,
    json_mode: bool = False,
    provider_id: Optional[str] = None,
    cancel_token: Optional[Any] = None,
    deadline_s: Optional[float] = None,
    image_b64: Optional[str] = None,
) -> Any:
    """
    Ejecuta un prompt enrutando predictivamente según la especialidad solicitada.
    """
    providers = _get_active_providers(api_key, nim_url, use_local, provider_id)
    if not providers:
        raise ValueError("No hay proveedores de IA configurados o activos.")

    # 1. Caché
    prompt_hash = ""
    cache = {}
    if use_cache:
        prompt_hash = _compute_text_hash(prompt + system_prompt)
        cache = _load_cache()
        if prompt_hash in cache:
            return (cache[prompt_hash], "cache", "cache") if return_provider_info else cache[prompt_hash]

    # 2. Ordenar proveedores: primero los de la especialidad, en el ORDEN que
    #    declara la especialidad, y luego el resto.
    #
    #    El orden importa porque el primero es al que se le pega primero: si
    #    empieza por uno que responde 410, cada request paga ese error antes de
    #    llegar al que sí funciona. Y antes NO tenía efecto: la lista se
    #    filtraba por pertenencia pero conservaba el orden del REGISTRO
    #    (NVIDIA 1, Groq 2, OpenRouter 3...), así que reordenar
    #    `PROVIDER_SPECIALTIES` no cambiaba nada. La sonda del 2026-09-27 dio
    #    que eso tumbaba las tres especialidades.
    specialty_ids = PROVIDER_SPECIALTIES.get(specialty, [])
    por_id = {p["id"]: p for p in providers}
    preferred_providers = [por_id[i] for i in specialty_ids if i in por_id]
    fallback_providers = [p for p in providers if p["id"] not in specialty_ids]

    routing_queue = preferred_providers + fallback_providers
    is_json = json_mode or "json" in system_prompt.lower() or "json" in prompt.lower()
    inicio = time.time()

    # 3. Enrutamiento Predictivo
    for p in routing_queue:
        p_id = p["id"]
        if cancel_token is not None and cancel_token.is_set():
            raise asyncio.CancelledError()
        if deadline_s is not None and time.time() - inicio > deadline_s:
            break
        if not _breaker_allows(p_id):
            logger.info(f"[Router] {p['name']} con breaker abierto. Saltando.")
            continue
        if not _presupuesto.puede(p_id):
            logger.info(f"[Router] {p['name']} sin presupuesto diario. Saltando.")
            continue
        capacity = PROVIDER_CAPACITY.get(p_id, {"timeout": 25, "requests_per_minute": 10})
        timeout = capacity.get("timeout", 25)
        rpm = capacity.get("requests_per_minute", 10)

        # Verificar Rate Limiter predictivo
        bucket = _limiter_registry.get_bucket(p_id, rpm)
        if not await bucket.consume(1):
            logger.info(f"[Router] {p['name']} está predictivamente OCUPADO. Saltando en FIFO.")
            continue

        payload: Dict[str, Any] = {
            "model": p["model"],
            "messages": _construir_messages(system_prompt, prompt, image_b64),
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        if is_json:
            payload["response_format"] = {"type": "json_object"}

        logger.info(f"[Router] Asignando tarea {specialty} a {p['name']}")
        result = await _try_provider(p, payload, timeout)
        _breaker_record(p_id, result is not None)

        if result and "choices" in result and len(result["choices"]) > 0:
            content = result["choices"][0]["message"]["content"]
        elif result and p_id == "cloudflare" and result.get("result", {}).get("response"):
            content = result["result"]["response"]
        else:
            content = None

        if content:

            if use_cache:
                cache[prompt_hash] = content
                _save_cache(cache)

            _presupuesto.registrar(p_id, max_tokens)
            return (content, p["name"], p["id"]) if return_provider_info else content

    # Si todos están ocupados predictivamente o fallaron, forzamos un intento con el primero disponible
    logger.warning("[Router] Todos los proveedores están ocupados o fallaron. Forzando fallback global.")
    candidato = None
    for c in routing_queue:
        if not _breaker_allows(c["id"]):
            continue
        if not _presupuesto.puede(c["id"]):
            continue
        c_cap = PROVIDER_CAPACITY.get(c["id"], {"timeout": 25, "requests_per_minute": 10})
        c_bucket = _limiter_registry.get_bucket(c["id"], c_cap.get("requests_per_minute", 10))
        if await c_bucket.consume(1):
            candidato = c
            break
    if candidato is not None:
        p = candidato
        capacity = PROVIDER_CAPACITY.get(p["id"], {"timeout": 25})
        payload = {
            "model": p["model"],
            "messages": _construir_messages(system_prompt, prompt, image_b64),
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        if is_json:
            payload["response_format"] = {"type": "json_object"}
        result = await _try_provider(p, payload, capacity.get("timeout", 25), retries=2)
        if result and "choices" in result and len(result["choices"]) > 0:
            content = result["choices"][0]["message"]["content"]
        elif result and p["id"] == "cloudflare" and result.get("result", {}).get("response"):
            content = result["result"]["response"]
        else:
            content = None
        if content:
            if use_cache:
                cache[prompt_hash] = content
                _save_cache(cache)
            _presupuesto.registrar(p["id"], max_tokens)
            return (content, p["name"], p["id"]) if return_provider_info else content

    raise RuntimeError("La infraestructura LLM colapsó (Rate limit, Timeout, o Errores).")

# Alias por compatibilidad con el código anterior
async def execute_with_fallback(*args, **kwargs) -> Any:
    return await execute_with_specialty(*args, **kwargs)

def get_ai_system_health() -> Dict[str, Any]:
    """
    Retorna el estado de los buckets de tokens de los proveedores principales
    organizados por especialidad, para el widget 'Indicador de Señal IA'.
    """
    health_data = {}
    for specialty, provider_ids in PROVIDER_SPECIALTIES.items():
        if not provider_ids:
            continue

        # Tomamos el proveedor principal (el primero) de la especialidad
        primary_id = provider_ids[0]
        capacity_rpm = PROVIDER_CAPACITY.get(primary_id, 30)

        bucket = _limiter_registry.buckets.get(primary_id)
        if bucket:
            # Forzamos una actualizacion simulada (consume=0) para que tokens este up to date
            now = time.time()
            elapsed = now - bucket.last_update
            current_tokens = min(float(bucket.capacity), bucket.tokens + elapsed * bucket.fill_rate)

            percentage = int((current_tokens / bucket.capacity) * 100)
            status = "good"
            if percentage < 20:
                status = "critical"
            elif percentage < 60:
                status = "warning"

            health_data[specialty] = {
                "provider": primary_id,
                "percentage": percentage,
                "status": status,
                "breaker": _breaker_estado(primary_id)["state"],
            }
        else:
            observed = _provider_health.get(primary_id, {}).get("status")
            health_data[specialty] = {
                "provider": primary_id,
                "percentage": 100, # Si nunca se usó, está lleno
                "status": observed or "unknown",
                "breaker": _breaker_estado(primary_id)["state"],
            }

    return health_data
