import asyncio
import hashlib
import json
import logging
import time
from asyncio import Lock
from pathlib import Path
from typing import Any, Dict, Optional

import httpx
from classification.llm_classifier import PROVIDER_CAPACITY, _get_active_providers

logger = logging.getLogger(__name__)

CACHE_FILE_PATH = Path("storage/ai_cache.json")

# Definición de Especialidades
PROVIDER_SPECIALTIES = {
    "FAST": ["groq", "cerebras", "cloudflare"],
    "HEAVY": ["gemini", "nvidia_nim", "openrouter"],
    "REASONING": ["nvidia_nim", "openrouter", "mistral", "opencodezen", "zenmux"]
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

# --- Cache ---
def _compute_text_hash(text: str) -> str:
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()

def _load_cache() -> Dict[str, str]:
    if CACHE_FILE_PATH.exists():
        try:
            with open(CACHE_FILE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def _save_cache(cache: Dict[str, str]) -> None:
    try:
        if len(cache) > 5000:
            cache = dict(list(cache.items())[-5000:])
        CACHE_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(CACHE_FILE_PATH, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning(f"No se pudo guardar el cache de LLM: {e}")

async def _try_provider(
    provider: Dict[str, Any],
    payload: Dict[str, Any],
    timeout: int,
    retries: int = 1 # Reducido porque preferimos enrutar al siguiente antes que esperar mucho
) -> Optional[Dict[str, Any]]:
    """Intenta llamar a un proveedor, manejando 429 con backoff rápido o fallando para el FIFO."""

    for attempt in range(retries):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    provider["url"],
                    json=payload,
                    headers=provider["headers"](provider["key"]),
                )

            if resp.status_code == 200:
                return resp.json()

            elif resp.status_code == 429:
                wait_time = 1.5 ** attempt
                logger.warning(f"[AI] {provider['name']} devolvió 429. Reintentando en {wait_time}s...")
                await asyncio.sleep(wait_time)
                continue

            else:
                logger.warning(f"[AI] {provider['name']} falló con status {resp.status_code}: {resp.text}")
                return None

        except (httpx.RequestError, asyncio.TimeoutError) as e:
            logger.warning(f"[AI] {provider['name']} error de red/timeout: {e}")
            if attempt == retries - 1:
                return None
            await asyncio.sleep(0.5)

    return None

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
    return_provider_info: bool = False
) -> Any:
    """
    Ejecuta un prompt enrutando predictivamente según la especialidad solicitada.
    """
    providers = _get_active_providers(api_key, nim_url, use_local)
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

    # 2. Ordenar proveedores: Primero los de la especialidad, luego el resto (FIFO Queue)
    specialty_ids = PROVIDER_SPECIALTIES.get(specialty, [])
    preferred_providers = [p for p in providers if p["id"] in specialty_ids]
    fallback_providers = [p for p in providers if p["id"] not in specialty_ids]

    routing_queue = preferred_providers + fallback_providers

    # 3. Enrutamiento Predictivo
    for p in routing_queue:
        p_id = p["id"]
        capacity = PROVIDER_CAPACITY.get(p_id, {"timeout": 25, "requests_per_minute": 10})
        timeout = capacity.get("timeout", 25)
        rpm = capacity.get("requests_per_minute", 10)

        # Verificar Rate Limiter predictivo
        bucket = _limiter_registry.get_bucket(p_id, rpm)
        if not await bucket.consume(1):
            logger.info(f"[Router] {p['name']} está predictivamente OCUPADO. Saltando en FIFO.")
            continue

        payload = {
            "model": p["model"],
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            "temperature": temperature,
            "max_tokens": max_tokens
        }

        logger.info(f"[Router] Asignando tarea {specialty} a {p['name']}")
        result = await _try_provider(p, payload, timeout)

        if result and "choices" in result and len(result["choices"]) > 0:
            content = result["choices"][0]["message"]["content"]

            if use_cache:
                cache[prompt_hash] = content
                _save_cache(cache)

            return (content, p["name"], p["id"]) if return_provider_info else content

    # Si todos están ocupados predictivamente o fallaron, forzamos un intento con el primero disponible
    logger.warning("[Router] Todos los proveedores están ocupados o fallaron. Forzando fallback global.")
    if routing_queue:
        p = routing_queue[0]
        capacity = PROVIDER_CAPACITY.get(p["id"], {"timeout": 25})
        payload = {
            "model": p["model"],
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        result = await _try_provider(p, payload, capacity.get("timeout", 25), retries=2)
        if result and "choices" in result and len(result["choices"]) > 0:
            content = result["choices"][0]["message"]["content"]
            if use_cache:
                cache[prompt_hash] = content
                _save_cache(cache)
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
                "status": status
            }
        else:
            health_data[specialty] = {
                "provider": primary_id,
                "percentage": 100, # Si nunca se usó, está lleno
                "status": "good"
            }

    return health_data
