# Scheduler de IA por demanda — Plan de implementación (Fase 1: núcleo)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el núcleo del scheduler de IA: cola de prioridad, dedup por
`content_hash`, límite de concurrencia, deadline y cancelación, más el circuit
breaker por proveedor en el router.

**Architecture:** Un módulo nuevo `python/modules/ai_scheduler.py` es la única
verdad de concurrencia y tiempos. Los motores se registran como *runners* por
elemento; el scheduler deduplica por hash de contenido contra la caché durable
existente (`storage/ai_cache.json`), ejecuta con `asyncio.wait_for` y expone un
router FastAPI fino. El copiloto tendrá prioridad 0 y un carril reservado.

**Tech Stack:** Python 3.11, asyncio, FastAPI, httpx, pytest. Frontend (fases
posteriores): React 18, Vite, Zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-04-scheduler-ia-por-demanda-design.md`

## Global Constraints

- Cero emojis en cualquier cadena, UI, comentario o plantilla. Íconos solo
  `lucide-react`.
- Colores solo por tokens CSS (`var(--...)`); prohibido hex.
- Arranque **lazy on-demand**: el scheduler crea su dispatcher en el primer
  `enqueue`, **nunca** en el `lifespan_app` de `python/main.py` (línea 103).
- No romper la firma pública de `execute_with_specialty`; los cambios son
  parámetros opcionales con default.
- `pytest.ini`: `testpaths=python/tests`, `pythonpath=python`. Los tests son
  funciones `def test_*` síncronas que envuelven código async con
  `asyncio.run(...)` (no hay pytest-asyncio).
- La caché de `python/modules/ai_client.py` es el almacén durable; las claves
  nuevas usan el prefijo `sched:`.
- Un commit atómico por tarea, con tests verdes antes de commitear.

## Review Focus

1. **Reabrir un documento con un solo párrafo cambiado** no debe re-encolar el
   resto: solo el hash del párrafo distinto vuelve a pedirse.
2. **Copiloto durante un lote pesado**: su trabajo (prioridad 0) se despacha sin
   esperar por los trabajos de background.
3. **Proveedor caído (401/404/410)**: el breaker lo corta tras N fallos y no se
   martilla; el trabajo queda `pending`, nunca colgado.
4. **Cerrar/cambiar documento con trabajos en vuelo**: `cancel_session` impide
   nuevas ejecuciones y drena la cola; no quedan jobs huérfanos.
5. **Job que excede su deadline**: pasa a `pending` (reintentable), no se cuelga
   ni revienta la UI.

Cada línea de arriba queda fijada por un test en la tarea que posee el código.

---

## Estructura de archivos

- `python/modules/ai_scheduler.py` — **nuevo**. Hash de contenido, almacén de
  resultados, `Job`, `Scheduler`, registro de runners, singleton.
- `python/modules/ai_client.py` — **modificar**. Breaker por proveedor,
  `cancel_token`/`deadline_s` opcionales.
- `python/routers/ai.py` — **nuevo**. Endpoints `demand`, `run-all`, `resume`,
  `jobs`, `cancel`.
- `python/main.py` — **modificar**. `include_router(ai_scheduler.router)`.
- `python/tests/test_ai_scheduler.py` — **nuevo**. Tests del núcleo.
- `python/tests/test_ai_breaker.py` — **nuevo**. Tests del breaker.

---

### Task 1: Hash de contenido, almacén de resultados y `Job`

**Files:**
- Create: `python/modules/ai_scheduler.py`
- Test: `python/tests/test_ai_scheduler.py`

**Interfaces:**
- Produces:
  - `content_hash(motor: str, text: str, phase: str = "", params_version: str = "v1") -> str`
  - `register_runner(motor: str, fn: Callable[[Job], Awaitable[Optional[Any]]]) -> None`
  - `@dataclass Job` con campos `id, session_id, motor, element_id,
    content_hash, priority, seq, enqueued_at, deadline_s, payload, attempts,
    state, result, provider, error`
  - `get_scheduler() -> Scheduler`
  - `Scheduler.enqueue(...) -> str`, `Scheduler.status(session_id) -> dict`

- [ ] **Step 1: Escribir el test que falla (hash y dedup por caché)**

```python
# python/tests/test_ai_scheduler.py
import asyncio

import pytest

import modules.ai_client as ai_client
import modules.ai_scheduler as ai_scheduler


@pytest.fixture
def cache_aislada(tmp_path, monkeypatch):
    """Aísla la caché durable en un archivo temporal y sin cargar del disco."""
    monkeypatch.setattr(ai_client, "CACHE_FILE_PATH", tmp_path / "ai_cache.json")
    monkeypatch.setattr(ai_client, "_cache", {})
    monkeypatch.setattr(ai_client, "_cache_cargada", True)
    monkeypatch.setattr(ai_client, "_profundidad_de_lote", 0)
    yield
    ai_scheduler._RUNNERS.clear()


def test_hash_estable_ignora_espacios_y_distingue_motor_y_fase():
    a = ai_scheduler.content_hash("captions", "Hola   mundo\n")
    b = ai_scheduler.content_hash("captions", "Hola mundo")
    assert a == b
    assert a != ai_scheduler.content_hash("proofread", "Hola mundo")
    assert a != ai_scheduler.content_hash("captions", "Hola mundo", phase="resultados")


def test_segundo_encolado_del_mismo_contenido_no_reejecuta(cache_aislada):
    sched = ai_scheduler.Scheduler()
    llamadas = []

    async def runner(job):
        llamadas.append(job.element_id)
        return {"valor": job.element_id}

    ai_scheduler.register_runner("captions", runner)

    async def flujo():
        j1 = await sched.enqueue("s1", "captions", "p1", "texto uno")
        await _esperar(sched, "s1")
        j2 = await sched.enqueue("s1", "captions", "p1", "texto uno")
        await _esperar(sched, "s1")
        return j1, j2

    j1, j2 = asyncio.run(flujo())
    assert llamadas == ["p1"]
    assert sched.status("s1")["jobs"][0]["state"] == "done"
```

Add this helper near the top of the test file:

```python
async def _esperar(sched, session_id, timeout=2.0):
    """Espera a que no haya jobs queued/running de la sesión."""
    import time

    fin = time.time() + timeout
    while time.time() < fin:
        jobs = sched.status(session_id)["jobs"]
        if not any(j["state"] in ("queued", "running") for j in jobs):
            return
        await asyncio.sleep(0.01)
    raise AssertionError("el scheduler no drena")
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pytest python/tests/test_ai_scheduler.py -q`
Expected: FAIL con `ModuleNotFoundError: No module named 'modules.ai_scheduler'`.

- [ ] **Step 3: Implementar el módulo**

```python
# python/modules/ai_scheduler.py
"""Cola y tiempos del trabajo LLM interno.

El scheduler es la única verdad de concurrencia: el frontend solo reporta qué
elementos se ven y los motores se ejecutan por elemento, una vez por contenido.
El dispatcher arranca en el primer encolado, nunca en el lifespan de FastAPI.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

AI_MAX_CONCURRENCY = int(os.getenv("AI_MAX_CONCURRENCY", "2"))
AI_COPILOT_RESERVED_SLOTS = int(os.getenv("AI_COPILOT_RESERVED_SLOTS", "1"))
AI_JOB_DEADLINE_S = float(os.getenv("AI_JOB_DEADLINE_S", "25"))
AI_JOB_MAX_ATTEMPTS = int(os.getenv("AI_JOB_MAX_ATTEMPTS", "3"))

PRIORITY_COPILOT = 0
PRIORITY_MANUAL = 5
PRIORITY_VISIBLE = 10
PRIORITY_BACKGROUND = 20
PRIORITY_PREFETCH = 30

_RESULT_PREFIX = "sched:"
_PARAMS_VERSION = "v1"

Runner = Callable[["Job"], Awaitable[Optional[Any]]]
_RUNNERS: Dict[str, Runner] = {}


def content_hash(motor: str, text: str, phase: str = "",
                 params_version: str = _PARAMS_VERSION) -> str:
    """Hash canónico de "esto ya se hizo". Sin session_id: reusar entre sesiones."""
    normalizado = " ".join((text or "").split())
    crudo = f"{motor}|{phase or ''}|{normalizado}|{params_version}"
    return hashlib.sha256(crudo.encode("utf-8")).hexdigest()


def _load_result(chash: str) -> Optional[Any]:
    from modules.ai_client import _load_cache

    crudo = _load_cache().get(_RESULT_PREFIX + chash)
    if crudo is None:
        return None
    try:
        return json.loads(crudo)
    except Exception:
        return None


def _store_result(chash: str, value: Any) -> None:
    from modules.ai_client import _save_cache

    _save_cache({_RESULT_PREFIX + chash: json.dumps(value, ensure_ascii=False)})


def register_runner(motor: str, fn: Runner) -> None:
    _RUNNERS[motor] = fn


@dataclass
class Job:
    id: str
    session_id: str
    motor: str
    element_id: str
    content_hash: str
    priority: int
    seq: int
    enqueued_at: float
    deadline_s: float
    payload: Dict[str, Any] = field(default_factory=dict)
    attempts: int = 0
    state: str = "queued"  # queued|running|done|pending|failed|cancelled
    result: Optional[Any] = None
    provider: Optional[str] = None
    error: Optional[str] = None


class Scheduler:
    def __init__(self) -> None:
        self._queue: "asyncio.PriorityQueue[Tuple[int, int, str]]" = asyncio.PriorityQueue()
        self._sem = asyncio.Semaphore(max(1, AI_MAX_CONCURRENCY - AI_COPILOT_RESERVED_SLOTS))
        self._jobs: Dict[str, Job] = {}
        self._by_session: Dict[str, List[str]] = {}
        self._by_hash: Dict[str, str] = {}
        self._cancelled: Dict[str, bool] = {}
        self._lock = asyncio.Lock()
        self._seq = 0
        self._dispatcher: Optional[asyncio.Task] = None
        self._tasks: set = set()

    def _ensure_dispatcher(self) -> None:
        if self._dispatcher is None or self._dispatcher.done():
            self._dispatcher = asyncio.create_task(self._serve())

    def _nuevo_id(self) -> str:
        return uuid.uuid4().hex

    async def _serve(self) -> None:  # pragma: no cover - cubierto por tests de flujo
        while True:
            _priority, _seq, job_id = await self._queue.get()
            job = self._jobs.get(job_id)
            if job is None or job.state != "queued":
                continue
            if self._cancelled.get(job.session_id):
                job.state = "cancelled"
                continue
            tarea = asyncio.create_task(self._run(job))
            self._tasks.add(tarea)
            tarea.add_done_callback(self._tasks.discard)

    async def _run(self, job: Job) -> None:
        usa_sem = job.priority > PRIORITY_COPILOT
        if usa_sem:
            await self._sem.acquire()
        try:
            job.state = "running"
            job.attempts += 1
            runner = _RUNNERS.get(job.motor)
            if runner is None:
                job.state = "failed"
                job.error = f"sin runner para {job.motor}"
                return
            try:
                resultado = await asyncio.wait_for(runner(job), timeout=job.deadline_s)
            except asyncio.TimeoutError:
                job.error = "deadline"
                resultado = None
            except Exception as e:  # noqa: BLE001 - el scheduler nunca cae por un motor
                job.error = str(e)
                logger.warning("[Scheduler] job %s falló: %s", job.id, e)
                resultado = None
            if self._cancelled.get(job.session_id):
                job.state = "cancelled"
                return
            if resultado is None:
                job.state = "failed" if job.attempts >= AI_JOB_MAX_ATTEMPTS else "pending"
                return
            job.result = resultado
            _store_result(job.content_hash, resultado)
            job.state = "done"
        finally:
            if usa_sem:
                self._sem.release()

    async def enqueue(self, session_id: str, motor: str, element_id: str,
                      text: str, *, phase: str = "",
                      priority: int = PRIORITY_BACKGROUND,
                      deadline_s: Optional[float] = None,
                      payload: Optional[Dict[str, Any]] = None,
                      params_version: str = _PARAMS_VERSION) -> str:
        chash = content_hash(motor, text, phase, params_version)
        async with self._lock:
            self._cancelled[session_id] = False
            existente = self._by_hash.get(chash)
            if existente is not None and self._jobs.get(existente) is not None \
                    and self._jobs[existente].state in ("queued", "running", "done"):
                return existente
            self._seq += 1
            base = dict(
                session_id=session_id, motor=motor, element_id=element_id,
                content_hash=chash, priority=priority, seq=self._seq,
                enqueued_at=time.time(),
                deadline_s=deadline_s or AI_JOB_DEADLINE_S, payload=payload or {},
            )
            if _load_result(chash) is not None:
                job = Job(id=self._nuevo_id(), state="done", **base)
            else:
                job = Job(id=self._nuevo_id(), **base)
            self._jobs[job.id] = job
            self._by_hash[chash] = job.id
            self._by_session.setdefault(session_id, []).append(job.id)
            if job.state == "queued":
                self._queue.put_nowait((priority, job.seq, job.id))
        self._ensure_dispatcher()
        return job.id

    async def enqueue_many(self, session_id: str, motor: str,
                           items: List[Dict[str, Any]], *,
                           priority: int = PRIORITY_BACKGROUND,
                           deadline_s: Optional[float] = None) -> List[str]:
        ids: List[str] = []
        for it in items:
            ids.append(await self.enqueue(
                session_id, motor, it["element_id"], it.get("text", ""),
                phase=it.get("phase", ""), priority=priority,
                deadline_s=deadline_s, payload=it.get("payload"),
            ))
        return ids

    def status(self, session_id: str) -> Dict[str, Any]:
        jobs = [self._jobs[j] for j in self._by_session.get(session_id, []) if j in self._jobs]
        motores: Dict[str, Dict[str, int]] = {}
        for j in jobs:
            m = motores.setdefault(j.motor, {})
            m[j.state] = m.get(j.state, 0) + 1
        return {
            "session_id": session_id,
            "motores": motores,
            "jobs": [
                {"id": j.id, "motor": j.motor, "element_id": j.element_id,
                 "state": j.state, "provider": j.provider,
                 "result": j.result if j.state == "done" else None}
                for j in jobs
            ],
        }


_SCHEDULER: Optional[Scheduler] = None


def get_scheduler() -> Scheduler:
    global _SCHEDULER
    if _SCHEDULER is None:
        _SCHEDULER = Scheduler()
    return _SCHEDULER
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pytest python/tests/test_ai_scheduler.py -q`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add python/modules/ai_scheduler.py python/tests/test_ai_scheduler.py
git commit -m "feat(ai): nucleo del scheduler por demanda (hash, jobs, dedup por cache)"
```

---

### Task 2: Deadline, reintento por demanda y prioridad

**Files:**
- Modify: `python/modules/ai_scheduler.py` (ya incluye deadline en Task 1)
- Test: `python/tests/test_ai_scheduler.py`

**Interfaces:**
- Consumes: `Scheduler`, `register_runner`, `content_hash`.
- Produces: comportamiento de deadline → `pending`; `resume_pending`;
  despacho prioritario del copiloto.

- [ ] **Step 1: Escribir los tests que fallan**

```python
def test_deadline_deja_el_job_pendiente_no_colgado(cache_aislada):
    sched = ai_scheduler.Scheduler()

    async def lento(job):
        await asyncio.sleep(5)
        return {"ok": True}

    ai_scheduler.register_runner("proofread", lento)

    async def flujo():
        await sched.enqueue("s1", "proofread", "p1", "texto", deadline_s=0.05)
        await _esperar(sched, "s1")

    asyncio.run(flujo())
    job = sched.status("s1")["jobs"][0]
    assert job["state"] == "pending"


def test_resume_pending_reejecuta(cache_aislada):
    sched = ai_scheduler.Scheduler()
    intentos = {"n": 0}

    async def falla_una_vez(job):
        intentos["n"] += 1
        if intentos["n"] == 1:
            return None
        return {"ok": True}

    ai_scheduler.register_runner("proofread", falla_una_vez)

    async def flujo():
        await sched.enqueue("s1", "proofread", "p1", "texto")
        await _esperar(sched, "s1")
        assert sched.status("s1")["jobs"][0]["state"] == "pending"
        reencolados = await sched.resume_pending("s1")
        assert reencolados == 1
        await _esperar(sched, "s1")

    asyncio.run(flujo())
    assert sched.status("s1")["jobs"][0]["state"] == "done"
    assert intentos["n"] == 2


def test_copiloto_se_despacha_antes_que_un_lote(cache_aislada):
    sched = ai_scheduler.Scheduler()
    orden = []

    async def runner(job):
        orden.append(job.motor)
        return {"ok": True}

    ai_scheduler.register_runner("proofread", runner)
    ai_scheduler.register_runner("copilot", runner)

    async def flujo():
        for i in range(4):
            await sched.enqueue("s1", "proofread", f"p{i}", f"texto {i}")
        await sched.enqueue("s1", "copilot", "sel", "instruccion",
                            priority=ai_scheduler.PRIORITY_COPILOT)
        await _esperar(sched, "s1")

    asyncio.run(flujo())
    assert orden[0] == "copilot"
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pytest python/tests/test_ai_scheduler.py -q`
Expected: FAIL en `test_resume_pending_reejecuta` con `AttributeError: 'Scheduler' object has no attribute 'resume_pending'` (los otros dos pasan ya, por Task 1).

- [ ] **Step 3: Implementar `resume_pending`**

Añadir a `Scheduler`:

```python
    async def resume_pending(self, session_id: str,
                             motors: Optional[List[str]] = None) -> int:
        async with self._lock:
            self._cancelled[session_id] = False
            n = 0
            for jid in self._by_session.get(session_id, []):
                job = self._jobs.get(jid)
                if job is None or job.state not in ("pending", "failed"):
                    continue
                if motors and job.motor not in motors:
                    continue
                job.state = "queued"
                job.attempts = 0
                self._by_hash[job.content_hash] = job.id
                self._queue.put_nowait((job.priority, job.seq, job.id))
                n += 1
        if n:
            self._ensure_dispatcher()
        return n
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pytest python/tests/test_ai_scheduler.py -q`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add python/modules/ai_scheduler.py python/tests/test_ai_scheduler.py
git commit -m "feat(ai): deadline, reintento por demanda y prioridad del copiloto"
```

---

### Task 3: Cancelación de sesión

**Files:**
- Modify: `python/modules/ai_scheduler.py`
- Test: `python/tests/test_ai_scheduler.py`

**Interfaces:**
- Produces: `Scheduler.cancel_session(session_id: str) -> int`.

- [ ] **Step 1: Escribir el test que falla**

```python
def test_cancel_session_drena_la_cola_y_no_reejecuta(cache_aislada):
    sched = ai_scheduler.Scheduler()
    llamadas = []

    async def runner(job):
        llamadas.append(job.element_id)
        await asyncio.sleep(0.05)
        return {"ok": True}

    ai_scheduler.register_runner("proofread", runner)

    async def flujo():
        for i in range(5):
            await sched.enqueue("s1", "proofread", f"p{i}", f"texto {i}")
        cancelados = await sched.cancel_session("s1")
        await asyncio.sleep(0.2)
        estados = [j["state"] for j in sched.status("s1")["jobs"]]
        return cancelados, estados

    cancelados, estados = asyncio.run(flujo())
    assert cancelados >= 1
    assert "queued" not in estados
    assert len(llamadas) < 5
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pytest python/tests/test_ai_scheduler.py::test_cancel_session_drena_la_cola_y_no_reejecuta -q`
Expected: FAIL con `AttributeError: 'Scheduler' object has no attribute 'cancel_session'`.

- [ ] **Step 3: Implementar**

Añadir a `Scheduler`:

```python
    async def cancel_session(self, session_id: str) -> int:
        async with self._lock:
            self._cancelled[session_id] = True
            n = 0
            for jid in self._by_session.get(session_id, []):
                job = self._jobs.get(jid)
                if job is not None and job.state == "queued":
                    job.state = "cancelled"
                    self._by_hash.pop(job.content_hash, None)
                    n += 1
            return n
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pytest python/tests/test_ai_scheduler.py -q`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add python/modules/ai_scheduler.py python/tests/test_ai_scheduler.py
git commit -m "feat(ai): cancelacion de sesion en el scheduler"
```

---

### Task 4: Circuit breaker por proveedor en el router

**Files:**
- Modify: `python/modules/ai_client.py` (tras las líneas 76-77 de globales)
- Test: `python/tests/test_ai_breaker.py`

**Interfaces:**
- Produces:
  - `_breaker_allows(p_id: str) -> bool`
  - `_breaker_record(p_id: str, ok: bool) -> None`
  - `_breaker_estado(p_id: str) -> Dict[str, Any]`
  - `execute_with_specialty(..., cancel_token=None, deadline_s=None)` (dos kwargs
    nuevos, opcionales).

- [ ] **Step 1: Escribir el test que falla**

```python
# python/tests/test_ai_breaker.py
import time

import modules.ai_client as ai_client


def setup_function():
    ai_client._provider_breaker.clear()


def test_abre_tras_n_fallos_y_bloquea():
    for _ in range(ai_client._BREAKER_THRESHOLD):
        ai_client._breaker_record("zenmux", ok=False)
    assert ai_client._breaker_estado("zenmux")["state"] == "open"
    assert ai_client._breaker_allows("zenmux") is False


def test_pasa_a_half_open_tras_el_cooldown():
    for _ in range(ai_client._BREAKER_THRESHOLD):
        ai_client._breaker_record("zenmux", ok=False)
    ai_client._provider_breaker["zenmux"]["opened_at"] = time.time() - ai_client._BREAKER_COOLDOWN_S - 1
    assert ai_client._breaker_estado("zenmux")["state"] == "half_open"
    assert ai_client._breaker_allows("zenmux") is True


def test_exito_cierra_el_breaker():
    for _ in range(ai_client._BREAKER_THRESHOLD):
        ai_client._breaker_record("zenmux", ok=False)
    ai_client._breaker_record("zenmux", ok=True)
    assert ai_client._breaker_estado("zenmux")["state"] == "closed"
    assert ai_client._breaker_allows("zenmux") is True
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pytest python/tests/test_ai_breaker.py -q`
Expected: FAIL con `AttributeError: module 'modules.ai_client' has no attribute '_breaker_record'`.

- [ ] **Step 3: Implementar el breaker**

Tras la línea 77 de `python/modules/ai_client.py` (`_provider_health = {}`), añadir:

```python
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
```

- [ ] **Step 4: Enrutar con el breaker (y `cancel_token`/`deadline_s`)**

En `execute_with_specialty`, cambiar la firma para añadir dos kwargs:

```python
    json_mode: bool = False,
    provider_id: Optional[str] = None,
    cancel_token: Optional[Any] = None,
    deadline_s: Optional[float] = None,
) -> Any:
```

Antes del bucle (`for p in routing_queue:`), capturar el inicio:

```python
    inicio = time.time()
```

Dentro del bucle, reemplazar el chequeo de cooldown por el del breaker y el de
cancelación/deadline:

```python
        if cancel_token is not None and cancel_token.is_set():
            raise asyncio.CancelledError()
        if deadline_s is not None and time.time() - inicio > deadline_s:
            break
        if not _breaker_allows(p_id):
            logger.info(f"[Router] {p['name']} con breaker abierto. Saltando.")
            continue
```

Tras `_try_provider`, registrar el resultado antes de interpretar `content`:

```python
        result = await _try_provider(p, payload, timeout)
        _breaker_record(p_id, result is not None)
```

Y en el bloque de *fallback forzado* (línea ~410), en vez de forzar el primero
aunque tenga el breaker abierto, elegir el primer proveedor permitido:

```python
    candidato = next((p for p in routing_queue if _breaker_allows(p["id"])), None)
    if candidato is not None:
        p = candidato
```

El resto del bloque de fallback no cambia. Si `candidato` es `None`, el
`RuntimeError` final se mantiene.

- [ ] **Step 5: Ejecutar y ver que pasa (nuevo + regresión del router)**

Run: `pytest python/tests/test_ai_breaker.py python/tests/test_proveedores.py python/tests/test_refine_por_proveedor.py -q`
Expected: PASS. Si `test_proveedores.py` dependía de `_provider_cooldowns` para
decidir el salto, seguirá viendo los cooldowns escritos (no se eliminaron).

- [ ] **Step 6: Commit**

```bash
git add python/modules/ai_client.py python/tests/test_ai_breaker.py
git commit -m "feat(ai): circuit breaker por proveedor y cancelacion cooperativa"
```

---

### Task 5: Router FastAPI del scheduler

**Files:**
- Create: `python/routers/ai.py`
- Modify: `python/main.py` (import + `include_router`, junto a las líneas 257-311)
- Test: `python/tests/test_ai_scheduler_router.py`

**Interfaces:**
- Consumes: `get_scheduler()`, `PRIORITY_MANUAL`, `PRIORITY_VISIBLE`,
  `PRIORITY_PREFETCH`.
- Produces:
  - `POST /api/ai/demand` `{session_id, element_ids, motors, prefetch?}`
  - `POST /api/ai/run-all` `{session_id, motors}`
  - `POST /api/ai/resume` `{session_id, motors?}`
  - `GET /api/ai/jobs/{session_id}`
  - `POST /api/ai/cancel` `{session_id}`

**Nota de integración:** en esta fase los motores aún no tienen runner
registrado; el endpoint `demand` debe construir los *items* con el texto del
elemento (leído de la sesión) para que el hash sea real, y encolar. El registro
de runners reales ocurre en la Fase 2. Los tests registran un runner de prueba.

- [ ] **Step 1: Escribir el test que falla**

```python
# python/tests/test_ai_scheduler_router.py
from fastapi import FastAPI
from fastapi.testclient import TestClient

import modules.ai_scheduler as ai_scheduler
from routers import ai as ai_router


def _client():
    app = FastAPI()
    app.include_router(ai_router.router)
    return TestClient(app)


def test_demand_encola_y_jobs_reporta(monkeypatch):
    sched = ai_scheduler.Scheduler()
    monkeypatch.setattr(ai_scheduler, "get_scheduler", lambda: sched)

    async def runner(job):
        return {"ok": job.element_id}

    ai_scheduler.register_runner("proofread", runner)
    cliente = _client()
    resp = cliente.post("/api/ai/demand", json={
        "session_id": "s1", "element_ids": ["p1"],
        "texts": {"p1": "texto uno"}, "motors": ["proofread"],
    })
    assert resp.status_code == 200
    assert resp.json()["ids"]
    ai_scheduler._RUNNERS.clear()
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pytest python/tests/test_ai_scheduler_router.py -q`
Expected: FAIL con `ModuleNotFoundError: No module named 'routers.ai'`.

- [ ] **Step 3: Implementar el router**

```python
# python/routers/ai.py
"""Endpoints del scheduler de IA por demanda (Fase 1 del rediseno).

El frontend reporta que elementos se ven (`/api/ai/demand`) y lee el estado real
(`/api/ai/jobs/{session}`). El scheduler es la unica verdad de concurrencia; este
router no ejecuta LLM, solo encola y consulta.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from modules.ai_scheduler import (
    PRIORITY_MANUAL,
    PRIORITY_VISIBLE,
    get_scheduler,
)

router = APIRouter(tags=["ai-scheduler"])


class DemandRequest(BaseModel):
    session_id: str
    element_ids: List[str] = []
    texts: Dict[str, str] = {}
    motors: List[str] = ["proofread"]
    prefetch: bool = False


class MotorsRequest(BaseModel):
    session_id: str
    motors: List[str] = []


class ResumeRequest(BaseModel):
    session_id: str
    motors: Optional[List[str]] = None


class CancelRequest(BaseModel):
    session_id: str


@router.post("/api/ai/demand")
async def ai_demand(req: DemandRequest) -> dict:
    from modules.ai_scheduler import PRIORITY_PREFETCH

    sched = get_scheduler()
    priority = PRIORITY_PREFETCH if req.prefetch else PRIORITY_VISIBLE
    ids: List[str] = []
    for motor in req.motors:
        items = [
            {"element_id": eid, "text": req.texts.get(eid, ""), "payload": {"element_id": eid}}
            for eid in req.element_ids
        ]
        ids.extend(await sched.enqueue_many(req.session_id, motor, items, priority=priority))
    return {"ids": ids, "status": sched.status(req.session_id)["motores"]}


@router.post("/api/ai/run-all")
async def ai_run_all(req: MotorsRequest) -> dict:
    """El "o lo pida": re-encola todo lo pendiente con prioridad manual."""
    sched = get_scheduler()
    reencolados = await sched.resume_pending(req.session_id, req.motors or None)
    return {"resumed": reencolados}


@router.post("/api/ai/resume")
async def ai_resume(req: ResumeRequest) -> dict:
    sched = get_scheduler()
    reencolados = await sched.resume_pending(req.session_id, req.motors)
    return {"resumed": reencolados}


@router.get("/api/ai/jobs/{session_id}")
async def ai_jobs(session_id: str) -> dict:
    return get_scheduler().status(session_id)


@router.post("/api/ai/cancel")
async def ai_cancel(req: CancelRequest) -> dict:
    cancelados = await get_scheduler().cancel_session(req.session_id)
    return {"cancelled": cancelados}
```

- [ ] **Step 4: Registrar el router en `main.py`**

Junto a los demás `include_router` (líneas 257-311), añadir el import y el registro:

```python
from routers import ai as ai_scheduler_router
app.include_router(ai_scheduler_router.router)
```

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `pytest python/tests/test_ai_scheduler_router.py python/tests/test_ai_scheduler.py -q`
Expected: PASS.

- [ ] **Step 6: Verificar que no se rompió el arranque del backend**

Run: `python -c "import main"` (desde `python/`)
Expected: sin excepción.

- [ ] **Step 7: Commit**

```bash
git add python/routers/ai.py python/main.py python/tests/test_ai_scheduler_router.py
git commit -m "feat(ai): endpoints del scheduler (demand, run-all, resume, jobs, cancel)"
```

---

## Roadmap (fases siguientes, con su propio plan)

Estas fases dependen de la interfaz real que fija la Fase 1; cada una tendrá su
propio plan al terminar el anterior.

**Fase 2 — Migrar motores a demanda** (leyendas, proofread, classify, citas):
refactorizar `ai_proactive_captioner.py`, `proactive_auditor.py` y
`llm_classifier.py` para exponer una función por elemento y registrarla como
runner; el `demand` construye el payload con contexto. Tests de dedup por
contenido reutilizando `audit_registry`.

**Fase 3 — Frontend viewport**: `api.demand/getJobs/runAll/resume/cancel` en
`src/api/backend.ts`; hook `useVisibleElements` que observa
`[id^="paper-elem-"]` (PaperCanvas.tsx:1754); quitar los disparos eager de
`documentSlice.ts:581-591`; alimentar `motoresAuditando` desde
`GET /api/ai/jobs`; botones "Revisar todo ahora" y "Reanudar pendientes".

**Fase 4 — Robustez**: prioridad 0 real del copiloto en
`ai_document_editor.py:145` (carril reservado), `cancel_session` al cerrar/cambiar
documento (`invalidarHallazgosRancios`), y verificación de suite completa
(`pytest -q`, `npx vitest run`, `npx tsc --noEmit`).

## Self-review del plan

- **Cobertura del spec:** §5.1 (Scheduler) → T1-T3; §5.2 (breaker en `ai_client`)
  → T4; §5.3 (endpoints) → T5; §7 (deadline/errores) → T2-T4. Las secciones §5.4,
  §6 (integración con motores), §9 y §10 (frontend) quedan en el roadmap de
  fases 2-4, con su propio plan.
- **Placeholders:** ninguno; cada step trae el código real.
- **Consistencia de tipos:** `content_hash`, `register_runner`,
  `enqueue_many(items: List[dict])`, `status()["jobs"][]` con claves
  `state/element_id/result`, y `PRIORITY_*` se usan igual en T1-T5.
- **Review Focus:** (1) dedup por contenido → T1; (2) prioridad copiloto → T2;
  (3) breaker → T4; (4) cancelación → T3; (5) deadline → T2.

<!-- FIN DEL PLAN -->
