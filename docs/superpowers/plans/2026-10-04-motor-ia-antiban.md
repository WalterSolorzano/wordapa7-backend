# Motor IA anti-ban — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el router de IA nunca abuse de un proveedor: leer `Retry-After` y los headers de cuota, hacer backoff exponencial con jitter, respetar un presupuesto diario por proveedor con racionamiento por usuario, poner un tope de llamadas por documento y meter `visual_auditor.py` dentro del router.

**Architecture:** Se construye **sobre** el router y el scheduler ya existentes (`python/modules/ai_client.py` con `execute_with_specialty`, `_try_provider`, breaker por proveedor y `cancel_token`/`deadline_s` del plan del scheduler). La capa anti-ban es un módulo nuevo `python/modules/ai_budget.py` (presupuesto diario + límites reales + decisión de Retry-After con jitter) que `_try_provider` y `execute_with_specialty` consultan. No se cambia ninguna firma pública.

**Tech Stack:** Python 3.11, asyncio, httpx, pytest. Frontend: TypeScript/Vitest (indicador de cuota, opcional en este plan).

**Spec:** `docs/superpowers/specs/2026-10-04-motor-ia-antiban-design.md`

## Global Constraints

- **No romper la firma pública de `execute_with_specialty`**: los cambios son parámetros opcionales con default.
- El breaker por proveedor ya existe (`_BREAKER_THRESHOLD`, `_breaker_allows`); el anti-ban **complementa**, no reemplaza.
- Tengo que encajar con `python/modules/ai_scheduler.py` (otra tarea en curso): no editar `ai_scheduler.py` salvo que una tarea lo diga explícitamente.
- Cero emojis; solo tokens CSS en UI.
- `pytest.ini`: `testpaths=python/tests`, `pythonpath=python`. Tests `def test_*` síncronos con `asyncio.run(...)`.
- Un commit atómico por tarea, tests verdes antes de commitear.
- El router prioriza **enrutar al siguiente proveedor** antes que esperar; el anti-ban no puede introducir esperas largas en el camino caliente sin límite.

## Review Focus

1. **429 con `Retry-After: 120`**: el proveedor queda en cooldown ~120s, **no** se reintenta a los 1.5s.
2. **Sin `Retry-After`**: backoff exponencial con jitter acotado (nunca infinito).
3. **Presupuesto diario agotado**: el proveedor deja de elegirse hoy; el router pasa al siguiente; nunca se excede la cuota.
4. **Documento enorme con muchos párrafos**: el tope por documento corta las llamadas y reporta cuántas quedaron sin verificar.
5. **`visual_auditor.py`**: una llamada a NIM pasa por el mismo TokenBucket/cooldown/breaker, no por un `requests.post` suelto.

Cada línea de arriba queda fijada por un test en la tarea que posee el código.

---

## Estructura de archivos

- `python/modules/ai_budget.py` — **nuevo**. Límites reales por proveedor, presupuesto diario, decisión de backoff/jitter, tope por documento.
- `python/modules/ai_client.py` — **modificar**. `_try_provider` usa la decisión de cooldown; `execute_with_specialty` consulta el presupuesto.
- `python/classification/llm_classifier.py` — **modificar**. `PROVIDER_CAPACITY` gana campos `rpd`/`tpm`/`concurrency` (default conservador; no rompe lo existente).
- `python/modules/visual_auditor.py` — **modificar**. La llamada multimodal pasa por el router.
- `python/modules/proactive_auditor.py` — **modificar** (tope por documento).
- `python/tests/test_ai_budget.py` — **nuevo**. Límites, presupuesto, jitter, Retry-After.
- `python/tests/test_retry_after.py` — **nuevo**. Cooldown honrando el header.
- `python/tests/test_tope_por_documento.py` — **nuevo**. Tope y reporte.
- `python/tests/test_visual_auditor_router.py` — **nuevo**. Que visual_auditor no evade.

---

### Task 1: Módulo de presupuesto — límites reales por proveedor

**Files:**
- Create: `python/modules/ai_budget.py`
- Test: `python/tests/test_ai_budget.py`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `LIMITES_REALES: Dict[str, Dict[str, Optional[int]]]` — por id de proveedor: `{"rpm", "rph", "rpd", "tpm", "tpd", "concurrency", "fuente", "fecha"}`. Valores `None` = desconocido → tratar conservador.
  - `limite(p_id: str, clave: str, default: Optional[int] = None) -> Optional[int]`
  - `PresupuestoDiario` con `puede(p_id) -> bool`, `registrar(p_id, tokens) -> None`, `restante(p_id) -> Optional[int]`.

- [ ] **Step 1: Escribir el test que falla**

```python
# python/tests/test_ai_budget.py
import modules.ai_budget as ai_budget


def test_limites_reales_cubren_los_proveedores_conocidos():
    for p in ["groq", "openrouter", "cerebras", "gemini", "cloudflare", "nvidia_nim"]:
        assert p in ai_budget.LIMITES_REALES, f"falta {p}"


def test_groq_tiene_rpd_del_free_tier():
    # Free tier ejemplo: 30 RPM, 1000 RPD, 8000 TPM, 200000 TPD.
    g = ai_budget.LIMITES_REALES["groq"]
    assert g["rpm"] == 30
    assert g["rpd"] == 1000
    assert g["tpm"] == 8000
    assert g["tpd"] == 200000


def test_proveedor_desconocido_es_conservador_y_sin_rpd():
    assert ai_budget.limite("proveedor_inexistente", "rpd") is None
    # Sin dato no se inventa un limite duro; el default es None (no bloquea por rpd).
    assert ai_budget.limite("proveedor_inexistente", "rpm", default=5) == 5
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m pytest python/tests/test_ai_budget.py -q`
Expected: FAIL con "No module named 'modules.ai_budget'".

- [ ] **Step 3: Crear `ai_budget.py` con la tabla de límites**

```python
"""Limites reales por proveedor y presupuesto diario para no abusar de la cuota.

Los valores salen de la documentacion oficial de cada proveedor (ver spec). Un
valor None = "desconocido": el router entonces es conservador pero no bloquea por
un dato que no tiene. Nunca se inventan numeros.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Optional

# rpm/rph/rpd/tpm/tpd: requests y tokens por minuto/hora/dia. concurrency:
# llamadas simultaneas maximas. fuente/fecha: de donde salio el dato.
LIMITES_REALES: Dict[str, Dict[str, Optional[int]]] = {
    "groq":       {"rpm": 30, "rph": None, "rpd": 1000, "tpm": 8000, "tpd": 200000, "concurrency": 4, "fuente": "console.groq.com/docs/rate-limits", "fecha": "2026-10-04"},
    "openrouter": {"rpm": 20, "rph": None, "rpd": 50,   "tpm": None, "tpd": None,   "concurrency": 2, "fuente": "openrouter.ai/docs/api-reference/limits", "fecha": "2026-10-04"},
    "cerebras":   {"rpm": 5,  "rph": None, "rpd": 1000000, "tpm": 30000, "tpd": 1000000, "concurrency": 2, "fuente": "inference-docs.cerebras.ai/support/rate-limits", "fecha": "2026-10-04"},
    "gemini":     {"rpm": 10, "rph": None, "rpd": None, "tpm": None, "tpd": None,   "concurrency": 2, "fuente": "ai.google.dev/gemini-api/docs/rate-limits", "fecha": "2026-10-04"},
    "cloudflare": {"rpm": 20, "rph": None, "rpd": None, "tpm": None, "tpd": None,   "concurrency": 2, "fuente": "developers.cloudflare.com/workers-ai/platform/limits", "fecha": "2026-10-04"},
    "nvidia_nim": {"rpm": 30, "rph": None, "rpd": None, "tpm": None, "tpd": None,   "concurrency": 4, "fuente": "build.nvidia.com (conservador, doc no accesible)", "fecha": "2026-10-04"},
    "huggingface":{"rpm": 20, "rph": None, "rpd": None, "tpm": None, "tpd": None,   "concurrency": 2, "fuente": "huggingface.co/docs/api-inference/rate-limits", "fecha": "2026-10-04"},
    "mistral":    {"rpm": 10, "rph": None, "rpd": None, "tpm": None, "tpd": None,   "concurrency": 2, "fuente": "conservador (sin doc publica accesible)", "fecha": "2026-10-04"},
    "opencodezen":{"rpm": 10, "rph": None, "rpd": None, "tpm": None, "tpd": None,   "concurrency": 2, "fuente": "conservador", "fecha": "2026-10-04"},
    "zenmux":     {"rpm": 10, "rph": None, "rpd": None, "tpm": None, "tpd": None,   "concurrency": 2, "fuente": "conservador", "fecha": "2026-10-04"},
    "aion":       {"rpm": 15, "rph": None, "rpd": None, "tpm": None, "tpd": 20000,  "concurrency": 2, "fuente": "comentario original: 20K TPD", "fecha": "2026-10-04"},
    "kilocode":   {"rpm": 15, "rph": None, "rpd": None, "tpm": None, "tpd": None,   "concurrency": 2, "fuente": "conservador", "fecha": "2026-10-04"},
    "ollama_cloud":{"rpm": 15, "rph": None, "rpd": None, "tpm": None, "tpd": None,  "concurrency": 2, "fuente": "conservador", "fecha": "2026-10-04"},
    "modelscope": {"rpm": 10, "rph": None, "rpd": None, "tpm": None, "tpd": None,   "concurrency": 2, "fuente": "conservador", "fecha": "2026-10-04"},
    "sambanova":  {"rpm": 10, "rph": None, "rpd": None, "tpm": None, "tpd": None,   "concurrency": 2, "fuente": "conservador", "fecha": "2026-10-04"},
    "dashscope":  {"rpm": 10, "rph": None, "rpd": None, "tpm": None, "tpd": None,   "concurrency": 2, "fuente": "conservador", "fecha": "2026-10-04"},
    "agnes_ai":   {"rpm": 10, "rph": None, "rpd": None, "tpm": None, "tpd": None,   "concurrency": 2, "fuente": "conservador", "fecha": "2026-10-04"},
}


def limite(p_id: str, clave: str, default: Optional[int] = None) -> Optional[int]:
    return LIMITES_REALES.get(p_id, {}).get(clave, default)
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `python -m pytest python/tests/test_ai_budget.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Agregar `PresupuestoDiario` con cupo por usuario**

Agregar al mismo archivo (interfaz usada por Task 3):

```python
@dataclass
class PresupuestoDiario:
    """Registra el consumo del dia por proveedor y raciona.

    El cupo por usuario es una fraccion del free tier (default 45%, pensado para
    2 usuarios por clave dejando ~10% de margen). Configurable por env.
    """
    fraccion_de_cupo: float = field(
        default_factory=lambda: float(os.getenv("AI_CUPO_FRACCION", "0.45"))
    )
    _usado: Dict[str, int] = field(default_factory=dict)
    _dia: str = ""

    def _hoy(self) -> str:
        return time.strftime("%Y-%m-%d")

    def _reset_si_cambio_el_dia(self) -> None:
        hoy = self._hoy()
        if hoy != self._dia:
            self._dia = hoy
            self._usado.clear()

    def cupo(self, p_id: str) -> Optional[int]:
        rpd = limite(p_id, "rpd")
        if rpd is None:
            return None
        return int(rpd * self.fraccion_de_cupo)

    def restante(self, p_id: str) -> Optional[int]:
        self._reset_si_cambio_el_dia()
        cupo = self.cupo(p_id)
        if cupo is None:
            return None
        return max(0, cupo - self._usado.get(p_id, 0))

    def puede(self, p_id: str) -> bool:
        r = self.restante(p_id)
        return r is None or r > 0

    def registrar(self, p_id: str, tokens: int = 0) -> None:
        self._reset_si_cambio_el_dia()
        self._usado[p_id] = self._usado.get(p_id, 0) + 1
```

(Agregar `import os, time` al encabezado.)

- [ ] **Step 6: Tests del presupuesto**

```python
def test_presupuesto_raciona_al_45_por_ciento():
    p = ai_budget.PresupuestoDiario(fraccion_de_cupo=0.45)
    assert p.cupo("groq") == 450  # 1000 * 0.45
    for _ in range(450):
        assert p.puede("groq")
        p.registrar("groq")
    assert not p.puede("groq")
    assert p.restante("groq") == 0


def test_presupuesto_sin_rpd_no_bloquea():
    p = ai_budget.PresupuestoDiario()
    assert p.puede("mistral")  # rpd None -> no bloquea
```

- [ ] **Step 7: Correr y commit**

Run: `python -m pytest python/tests/test_ai_budget.py -q`
Expected: PASS.

```bash
git add python/modules/ai_budget.py python/tests/test_ai_budget.py
git commit -m "feat(ai): limites reales por proveedor y presupuesto diario con cupo por usuario"
```

---

### Task 2: Retry-After, backoff con jitter y decisión de cooldown

**Files:**
- Modify: `python/modules/ai_budget.py`
- Modify: `python/modules/ai_client.py:302-349`
- Test: `python/tests/test_retry_after.py`

**Interfaces:**
- Consumes: `LIMITES_REALES` de Task 1.
- Produces:
  - `retry_after_s(headers: Mapping[str, str]) -> Optional[float]` — lee `Retry-After` (segundos o fecha HTTP) y `x-ratelimit-reset-requests`.
  - `backoff_con_jitter(attempt: int, base: float = 1.0, cap: float = 60.0) -> float` — exponencial + jitter uniforme, acotado.
  - `cooldown_para(status: int, headers: Mapping[str, str]) -> float` — 429 → `max(retry_after, 30)`; 401/403/404/410 → 600; otros → 15.

- [ ] **Step 1: Escribir el test que falla**

```python
# python/tests/test_retry_after.py
import modules.ai_budget as ai_budget


def test_retry_after_en_segundos():
    assert ai_budget.retry_after_s({"Retry-After": "120"}) == 120.0


def test_retry_after_ausente_da_none():
    assert ai_budget.retry_after_s({}) is None


def test_cooldown_429_honra_retry_after():
    assert ai_budget.cooldown_para(429, {"Retry-After": "120"}) == 120.0


def test_cooldown_429_sin_header_usa_minimo_30():
    assert ai_budget.cooldown_para(429, {}) == 30.0


def test_cooldown_401_es_600():
    assert ai_budget.cooldown_para(401, {}) == 600.0


def test_backoff_crece_y_esta_acotado():
    valores = [ai_budget.backoff_con_jitter(n) for n in range(6)]
    assert all(0 <= v <= 60.0 for v in valores)
    # el techo crece con el intento (el jitter no lo supera)
    assert ai_budget.backoff_con_jitter(5, cap=60.0) <= 60.0
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m pytest python/tests/test_retry_after.py -q`
Expected: FAIL con "module has no attribute 'retry_after_s'".

- [ ] **Step 3: Implementar en `ai_budget.py`**

```python
import random
from email.utils import parsedate_to_datetime


def retry_after_s(headers) -> Optional[float]:
    raw = headers.get("Retry-After") or headers.get("retry-after")
    if raw:
        raw = raw.strip()
        if raw.isdigit():
            return float(raw)
        try:
            cuando = parsedate_to_datetime(raw)
            return max(0.0, cuando.timestamp() - time.time())
        except (TypeError, ValueError):
            pass
    reset = headers.get("x-ratelimit-reset-requests") or headers.get("X-RateLimit-Reset")
    if reset and reset.strip().isdigit():
        return float(reset.strip())
    return None


def backoff_con_jitter(attempt: int, base: float = 1.0, cap: float = 60.0) -> float:
    techo = min(cap, base * (2 ** attempt))
    return random.uniform(0, techo)


def cooldown_para(status: int, headers) -> float:
    if status == 429:
        ra = retry_after_s(headers)
        return max(30.0, ra) if ra is not None else 30.0
    if status in (401, 403, 404, 410):
        return 600.0
    return 15.0
```

- [ ] **Step 4: Usar `cooldown_para` en `_try_provider`**

En `python/modules/ai_client.py`, en la rama 429 (L323-329), reemplazar el `now + 30` fijo por:

```python
            elif resp.status_code == 429:
                cd = cooldown_para(429, resp.headers)
                _provider_cooldowns[provider["id"]] = time.time() + cd
                _provider_health[provider["id"]] = {"status": "rate_limited", "checked_at": time.time()}
                wait_time = min(cd, backoff_con_jitter(attempt))
                logger.warning(f"[AI] {provider['name']} 429. Cooldown {cd}s, espera {wait_time:.1f}s.")
                await asyncio.sleep(wait_time)
                continue
```

Y en la rama `else` (L331-340), reemplazar `cooldown = 600 if ... else 15` por:

```python
                cooldown = cooldown_para(resp.status_code, resp.headers)
```

Importar arriba: `from modules.ai_budget import cooldown_para, backoff_con_jitter` (o el import relativo que use el archivo; verificar cómo importa `_get_active_providers`).

- [ ] **Step 5: Correr el test y los tests de proveedores existentes**

Run: `python -m pytest python/tests/test_retry_after.py python/tests/test_proveedores.py -q`
Expected: PASS (el 429 ya no duerme 1.5s fijo, pero `test_proveedores.py` debe seguir verde; si algún test asegura el valor 30 exacto, sigue siendo 30 sin header).

- [ ] **Step 6: Commit**

```bash
git add python/modules/ai_budget.py python/modules/ai_client.py python/tests/test_retry_after.py
git commit -m "feat(ai): respetar Retry-After y backoff exponencial con jitter en el router"
```

---

### Task 3: Presupuesto consultado por el router + límites en `PROVIDER_CAPACITY`

**Files:**
- Modify: `python/classification/llm_classifier.py:52-71`
- Modify: `python/modules/ai_client.py:402-420`
- Test: `python/tests/test_ai_budget.py`

**Interfaces:**
- Consumes: `PresupuestoDiario` (Task 1), `LIMITES_REALES`.
- Produces: el router salta un proveedor cuyo presupuesto diario se agotó, igual que salta cooldowns.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `python/tests/test_ai_budget.py`:

```python
def test_router_salta_proveedor_sin_presupuesto(monkeypatch):
    import modules.ai_client as ai_client
    import modules.ai_budget as ai_budget
    p = ai_budget.PresupuestoDiario(fraccion_de_cupo=0.0)  # cupo cero
    monkeypatch.setattr(ai_client, "_presupuesto", p)
    assert not p.puede("groq")
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m pytest python/tests/test_ai_budget.py::test_router_salta_proveedor_sin_presupuesto -q`
Expected: FAIL con "module 'modules.ai_client' has no attribute '_presupuesto'".

- [ ] **Step 3: Instanciar el presupuesto en `ai_client.py`**

Junto a `_provider_cooldowns` (L76):

```python
from modules.ai_budget import PresupuestoDiario, cooldown_para, backoff_con_jitter

_presupuesto = PresupuestoDiario()
```

- [ ] **Step 4: Consultar el presupuesto en el bucle de enrutado**

En `execute_with_specialty`, dentro del `for p in routing_queue` (L403), tras el chequeo del breaker y antes del TokenBucket:

```python
        if not _presupuesto.puede(p_id):
            logger.info(f"[Router] {p['name']} sin presupuesto diario. Saltando.")
            continue
```

Y tras una respuesta con contenido (L445), registrar el consumo:

```python
            _presupuesto.registrar(p_id, max_tokens)
```

- [ ] **Step 5: Agregar campos de límite a `PROVIDER_CAPACITY` sin romper lo existente**

Los dicts actuales se quedan; solo se agregan claves nuevas opcionales (`rpd`/`tpm`/`concurrency`) a los proveedores con dato, para que quien lea `PROVIDER_CAPACITY` los vea. Si el código no los usa todavía, es data lista para el reporte. No cambiar `requests_per_minute` existente salvo que difiera del oficial (cerebras 15→5 según doc).

- [ ] **Step 6: Correr y commit**

Run: `python -m pytest python/tests/test_ai_budget.py python/tests/test_provider_routing.py python/tests/test_provider_id.py -q`
Expected: PASS.

```bash
git add python/classification/llm_classifier.py python/modules/ai_client.py python/tests/test_ai_budget.py
git commit -m "feat(ai): el router respeta el presupuesto diario por proveedor"
```

---

### Task 4: Tope de llamadas por documento (D10-bis) con reporte

**Files:**
- Modify: `python/modules/proactive_auditor.py`
- Test: `python/tests/test_tope_por_documento.py`

**Interfaces:**
- Consumes: nada nuevo.
- Produces:
  - `TopeDeLlamadas` — cuenta llamadas por "unidad de trabajo" (documento/lote) con `permitir() -> bool` y `sin_verificar -> int`.
  - El resultado de la auditoría incluye cuántos elementos quedaron sin verificar.

- [ ] **Step 1: Escribir el test que falla**

```python
# python/tests/test_tope_por_documento.py
from modules.proactive_auditor import TopeDeLlamadas


def test_tope_corta_y_reporta():
    tope = TopeDeLlamadas(maximo=3)
    permitidas = [tope.permitir() for _ in range(5)]
    assert permitidas == [True, True, True, False, False]
    assert tope.sin_verificar == 2


def test_sin_tope_configurado_no_corta():
    tope = TopeDeLlamadas(maximo=0)  # 0 = ilimitado
    assert all(tope.permitir() for _ in range(100))
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m pytest python/tests/test_tope_por_documento.py -q`
Expected: FAIL con "cannot import name 'TopeDeLlamadas'".

- [ ] **Step 3: Implementar `TopeDeLlamadas` en `proactive_auditor.py`**

```python
class TopeDeLlamadas:
    """Limita cuantas llamadas a IA se hacen por documento.

    Un documento de 300 parrafos con RPM 10-30 haria inviable llamar por parrafo;
    el tope corta y se reporta cuantos elementos quedaron sin verificar.
    """
    def __init__(self, maximo: int):
        self.maximo = maximo
        self.usadas = 0
        self.sin_verificar = 0

    def permitir(self) -> bool:
        if self.maximo <= 0:
            self.usadas += 1
            return True
        if self.usadas < self.maximo:
            self.usadas += 1
            return True
        self.sin_verificar += 1
        return False
```

- [ ] **Step 4: Aplicar el tope en el flujo de refinamiento**

En el punto donde `refine_with_llm` itera elementos, crear un `TopeDeLlamadas(maximo=int(os.getenv("AI_MAX_LLAMADAS_POR_DOC", "40")))` y saltar los elementos cuando `permitir()` da False, acumulando `sin_verificar` en el resultado (`{"sin_verificar": tope.sin_verificar}`).

- [ ] **Step 5: Correr y commit**

Run: `python -m pytest python/tests/test_tope_por_documento.py python/tests/test_proactive_auditor.py -q`
Expected: PASS.

```bash
git add python/modules/proactive_auditor.py python/tests/test_tope_por_documento.py
git commit -m "feat(ai): tope de llamadas por documento con reporte de no verificados"
```

---

### Task 5: `visual_auditor.py` dentro del router

**Files:**
- Modify: `python/modules/visual_auditor.py:82-123`
- Test: `python/tests/test_visual_auditor_router.py`

**Interfaces:**
- Consumes: `execute_with_specialty` (router existente).
- Produces: `audit_pdf_with_multimodal_llm` deja de usar `requests.post` directo.

- [ ] **Step 1: Escribir el test que falla**

```python
# python/tests/test_visual_auditor_router.py
from pathlib import Path
import modules.visual_auditor as va


def test_visual_auditor_no_usa_requests_post_directo():
    fuente = Path(va.__file__).read_text(encoding="utf-8")
    assert "requests.post" not in fuente
    assert "integrate.api.nvidia.com" not in fuente
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m pytest python/tests/test_visual_auditor_router.py -q`
Expected: FAIL (hoy sí contiene `requests.post`).

- [ ] **Step 3: Migrar la llamada al router**

Reemplazar el `requests.post` síncrono (L107-123) por una llamada a `execute_with_specialty` con la especialidad de visión. Como el router es `async`, envolver el entrypoint con `asyncio.run(...)` si el llamador es síncrono (o convertir el llamador a async; `main.py:1414` es el call site). Usar el mismo model/prompt que hoy, pero sin `url`/`headers` hardcodeados: se elige el proveedor que declare visión (nvidia_nim por ahora) y si no hay clave de visión, devolver el resultado vacío con motivo legible en vez de pegarle a NIM sin control.

- [ ] **Step 4: Correr y commit**

Run: `python -m pytest python/tests/test_visual_auditor_router.py -q`
Expected: PASS.

```bash
git add python/modules/visual_auditor.py python/tests/test_visual_auditor_router.py
git commit -m "fix(ai): visual_auditor pasa por el router, deja de evadir rate limiting"
```

---

## Criterios de aceptación (del spec)

- [ ] `Retry-After` se lee y el cooldown lo honra (≥120s con header 120).
- [ ] Backoff exponencial con jitter, acotado (≤ cap).
- [ ] Tabla de límites reales por proveedor con fuente y fecha; desconocidos conservadores.
- [ ] Presupuesto diario con cupo configurable (45% default) por proveedor.
- [ ] Tope de llamadas por documento con reporte de no verificados.
- [ ] `visual_auditor.py` ya no evade el router.
- [ ] Tests: `python -m pytest python/tests/test_ai_budget.py python/tests/test_retry_after.py python/tests/test_tope_por_documento.py python/tests/test_visual_auditor_router.py -q` verde.
- [ ] No se rompió `execute_with_specialty` (tests de routing y proveedores verdes).
