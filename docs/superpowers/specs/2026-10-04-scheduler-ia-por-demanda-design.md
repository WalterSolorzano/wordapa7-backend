# Scheduler de IA por demanda — Diseño

- **Fecha:** 2026-10-04
- **Estado:** aprobado (diseño); pendiente spec-review del usuario y plan de implementación
- **Ámbito:** `python/modules/ai_client.py`, nuevo `python/modules/ai_scheduler.py`,
  consumidores LLM (`proactive_auditor.py`, `ai_proactive_captioner.py`,
  `classification/llm_classifier.py`, `ai_proactive_reviewer.py`,
  `ai_document_editor.py`), `python/main.py`/`python/routers/*`, y el frontend
  (`src/store/slices/documentSlice.ts`, `src/store/slices/auditSlice.ts`,
  lienzo en `src/components/layout/PaperCanvas.tsx`).

## 1. Problema

Al abrir un documento, `documentSlice.ts:581-591` dispara **cuatro bucles LLM en
paralelo** (citas+estilo, leyendas, proofread, clasificación) sin límite global.
Consecuencias observadas en el código actual:

1. **Atropello de proveedores.** Los cuatro bucles compiten por los mismos
   `TokenBucket` (`ai_client.py:43-75`). Cuando todos los proveedores aparecen
   "predictivamente ocupados" (`ai_client.py:374-376`), el router cae al
   *fallback forzado* (`ai_client.py:408-435`), que **ignora el bucket y el
   cooldown** y reintenta dos veces → tormenta de 429.
2. **Sin deadline por trabajo.** Solo existe timeout por request
   (`PROVIDER_CAPACITY.timeout`). Un documento largo puede tardar
   indefinidamente y no hay forma de acotarlo.
3. **Sin cancelación ni pausa.** Cerrar/cambiar/reparsear el documento no detiene
   los bucles en vuelo.
4. **El copiloto compite de igual a igual** con el background: la acción
   interactiva del usuario hace fila detrás de trabajos por lotes.
5. **Trabajo desperdiciado.** Se audita el documento completo aunque el usuario
   nunca llegue a esa zona, y reabrir el mismo archivo vuelve a pedir lo ya
   resuelto.
6. **Estado mentiroso.** `motoresAuditando` es un contador local del frontend;
   no refleja la cola real. El progreso solo existe para clasificación
   (`_classify_progress`).
7. **Throttles duplicados.** `asyncio.sleep(1.0/1.5)` en clasificador y
   validadores frena globalmente en vez de por elemento.

## 2. Objetivo

Un único subsistema de **cola + tiempos** en el backend que:

- ejecute trabajo LLM **solo para lo que el usuario ve** (viewport real), y solo
  cuando llegue o lo pida;
- **no repita** trabajo ya hecho cuando el archivo se reabre y solo cambió una
  parte;
- tenga **deadline por trabajo**, backoff y circuit breaker, y **nunca cuelgue**;
- dé **prioridad estricta al copiloto**;
- exponga estado real (pendiente/corriendo/hecho/fallado) para los globos de UI;
- permita **cancelar** al cerrar/cambiar documento y **reanudar pendientes**.

### No-objetivos

- No se cambia la lógica de detección de ningún motor (reglas, prompts,
  taxonomía por fase). Solo **cuándo y con qué prioridad** se ejecutan.
- No se introduce un broker externo (Redis/Celery). Es un scheduler en proceso.
- No se añaden emojis ni colores hex; se respetan los tokens y reglas de
  `AGENTS.md` (incluido el arranque lazy, nunca en el lifespan de FastAPI).
- No se toca el contrato público de `execute_with_specialty` (los tests
  `test_provider_id.py` y `test_refine_cache.py` deben seguir pasando).

## 3. Decisiones tomadas (con el usuario)

1. El trabajo LLM se **retiene hasta que el usuario llega a esa zona o lo pide**.
2. **Solo se procesa lo que el usuario va viendo**; al hacer scroll se encola
   más.
3. **Dedup por contenido**: reabrir el mismo archivo con un párrafo cambiado no
   re-pide el resto.
4. La visibilidad se detecta con **viewport real** (`IntersectionObserver`).
5. Ante fallo o tardanza: **deadline + reintento por demanda** (nunca
   reintento infinito ni cuelgue).

## 4. Arquitectura

```
[Viewport frontend]  --POST /api/ai/demand-->  [ai_scheduler.py]
   IntersectionObserver                          PriorityQueue + Semaphore
                                                       |
                                                  worker(s) N
                                                       |
                                        execute_with_specialty(deadline_s, cancel_token)
                                                       |
                                        proveedor + caché por content_hash
                                                       |
   <--GET /api/ai/jobs/{session} / WS--           estado por sesión
```

- El **backend es la única verdad** de concurrencia y tiempos.
- El **frontend solo reporta demanda** (qué elementos se ven) y lee estado.
- Los motores dejan de barrer el documento entero en `uploadFile`.

## 5. Componentes

### 5.1 `python/modules/ai_scheduler.py` (nuevo)

```python
@dataclass(frozen=True)
class Job:
    id: str
    session_id: str
    motor: str            # copilot | proofread | captions | classify | citations
    element_id: str
    content_hash: str
    priority: int
    enqueued_at: float
    deadline_s: float
    attempts: int = 0
    state: str = "queued"  # queued | running | done | pending | failed
```

API pública:

- `async def enqueue(session_id, motor, element_id, *, params, priority, deadline_s) -> str`
  - Calcula `content_hash`; si ya hay resultado cacheado → estado `done`
    inmediato sin request; si el hash está `queued/running` → **coalesce**;
    si no, encola.
  - Arranca workers **lazy** en el primer encolado.
- `async def enqueue_many(session_id, motor, element_ids, *, priority, deadline_s)`
- `def status(session_id) -> dict` — conteos por motor y estados, proveedor
  activo, pendientes, y lista de `element_id` por estado.
- `async def cancel_session(session_id, reason)` — marca cancel token y drena la
  cola de esa sesión; `pending`/`failed` no se reintentan.
- `async def run_all(session_id, motors)` — encola todo el documento con
  prioridad 5 (el "o lo pida").
- `async def resume_pending(session_id, motors)` — re-encola solo `pending`
  (reintento por demanda / botón).
- `def health() -> dict` — estado del breaker y ocupación.

Detalles:

- `asyncio.PriorityQueue` con tupla `(priority, seq, job)`; `seq` monótono
  garantiza FIFO dentro de la misma prioridad (no inanición).
- `asyncio.Semaphore(AI_MAX_CONCURRENCY)` (def. 2). N workers (def. 2) toman del
  semáforo. El copiloto tiene prioridad 0 **y** un carril interactivo: si los
  lotes ocupan todos los slots, el copiloto toma uno de los
  `AI_COPILOT_RESERVED_SLOTS` (def. 1) para no quedar detrás de un lote (ver §9).
- Workers creados con `asyncio.create_task` en el primer `enqueue`, guardados en
  el módulo. Nunca en el lifespan.
- `content_hash` canónico (§6). El scheduler es el dueño del espacio de hash.

### 5.2 Cambios en `python/modules/ai_client.py`

- `execute_with_specialty(..., deadline_s: float | None = None, cancel_token=None)`:
  - envuelve el bucle de routing en un chequeo de `cancel_token` entre
    proveedores → si se cancela, retorna/levanta de forma cooperativa.
  - el *fallback forzado* deja de ignorar el bucket y el breaker: si no hay
    candidato sano, levanta `RuntimeError` (el scheduler lo convierte en
    `pending`).
- **Circuit breaker** por proveedor con estados `closed/open/half_open`,
  reemplazando `_provider_cooldowns` como fuente de decisión. Se abre tras N
  fallos consecutivos (`AI_BREAKER_THRESHOLD`, def. 3) o ante 401/403/404/410;
  pasa a `half_open` tras el cooldown y se cierra con un éxito. Estado expuesto
  en `health()`.
- `get_ai_system_health()` se conserva (lo consume `/api/ai/health` y el
  add-in) y suma el estado del breaker.

### 5.3 Endpoints (`python/main.py` o `python/routers/ai.py`)

- `POST /api/ai/demand` → `{session_id, element_ids, motors}` → encola visible.
- `POST /api/ai/run-all` → `{session_id, motors}` → prioridad 5.
- `POST /api/ai/resume` → `{session_id, motors}` → re-encola `pending`.
- `GET /api/ai/jobs/{session_id}` → estado real (§5.1 `status`).
- `POST /api/ai/cancel` → `{session_id}`.
- WS opcional reutilizando el patrón `/ws/parse-progress/{session_id}`
  (`python/routers/ws.py:15-27`) para empujar cambios de estado.
- `/api/ai/health` se mantiene y se extiende con el breaker.

### 5.4 Frontend

- Hook `useVisibleElements` (`src/hooks/`): `IntersectionObserver` sobre los
  nodos de elemento del lienzo (`PaperCanvas.tsx`). Debounce ~200 ms; agrupa
  `element_id` por motor y llama `POST /api/ai/demand`. Al hacer scroll encola
  lo nuevo. Prefetch de 1–2 pantallas abajo con prioridad 30.
- **Eliminar** los disparos eager de `documentSlice.ts:581-591`
  (`runProactiveAudits`, `runProactiveAutoCaptioning`, `runProofreadBatch`,
  `runLLMClassify`).
- `motoresAuditando` (`auditSlice.ts:150-159`) se alimenta del estado real del
  scheduler (polling o WS), no de contadores locales. Los globos de
  `ReviewWorkbench.tsx:289` no cambian de contrato.
- Botones manuales: **"Revisar todo ahora"** (`run-all`) y **"Reanudar
  pendientes"** (`resume`).
- El copiloto (`LiveChatDrawer` → `ai_document_editor.py`) sigue llamando al
  router, pero su llamada entra con prioridad 0.

## 6. Dedup por contenido y caché

`content_hash = sha256(f"{motor}|{phase or ''}|{texto_normalizado}|{params_version}")`
donde `texto_normalizado` aplica `strip()` y normalización de espacios, y
`params_version` versiona prompt/modelo/config para invalidar al cambiarlos.

- Antes de encolar: si el hash existe en el almacén de resultados → `done`
  instantáneo, **cero request**.
- Si está `queued/running` → coalesce (no duplica).
- Persistencia: `storage/ai_cache.json` (ya durable, escritura atómica,
  `lote_cache()` en `ai_client.py:217-263`). Reabrir archivo conserva el caché.
- Los cachés existentes por elemento (`llm_classifier._classification_cache_key`,
  `audit_registry.registrar/reusar`) se **integran** al mismo espacio de hash; se
  mantiene su comportamiento actual (los tests de refine/caché no cambian).
- Criterio de aceptación central: **reabrir un documento cambiando un solo
  párrafo genera exactamente un hash nuevo por motor afectado.**

## 7. Timeouts, breaker y errores

- `deadline_s` por job (def. 25 s, `AI_JOB_DEADLINE_S`) con `asyncio.wait_for`
  alrededor de la llamada del motor.
- Timeout / colapso → estado `pending`, `attempts++`, backoff exponencial. **No
  se reintenta solo**: se reintenta cuando el hash vuelve a demandarse (scroll
  de vuelta) o vía `resume`/`run-all`.
- El `RuntimeError` que levanta el router cuando no hay candidato sano (§5.2) lo
  captura el worker del scheduler y lo convierte en `pending`; no llega a la UI
  como excepción.
- `attempts` máximo configurable (`AI_JOB_MAX_ATTEMPTS`, def. 3) antes de pasar a
  `failed` (visible en UI, reintentable manualmente).
- Circuit breaker evita martillar un proveedor muerto; el scheduler consulta el
  breaker antes de asignar.
- Cancelación cooperativa entre intentos de proveedor; nunca se deja una tarea
  huérfana tras `cancel_session`.

## 8. Flujo de datos

1. `uploadFile` termina de parsear. **No** dispara motores LLM.
2. El lienzo monta; `IntersectionObserver` reporta los `element_id` visibles.
3. `POST /api/ai/demand` → el scheduler calcula hashes: los cacheados quedan
   `done` sin request; los nuevos se encolan por prioridad.
4. Workers respetan el semáforo y el breaker, llaman a los motores con deadline.
5. Al hacer scroll, más elementos entran a la cola.
6. El frontend lee `GET /api/ai/jobs/{session}` (o WS) y actualiza globos y
   contadores por motor.
7. Al cerrar/cambiar/reparsear, `POST /api/ai/cancel`.

## 9. Migración de motores

| Motor | Hoy | Después |
|---|---|---|
| `proofread` | barre todos los elementos (`auditSlice.ts:161`) | encola por elemento dudoso; `refine_with_llm` consume por hash |
| `captions` | barre todas las figuras/tablas (`ai_proactive_captioner.py:38`) | encola por figura/tabla visible |
| `classify` | lotes sobre todos los inciertos (`llm_classifier.py:478`) | encola por elemento incierto visible |
| `citations` | al cargar (`documentSlice.ts:263-283`) | parte determinista (Crossref) sigue; parte LLM a prioridad 20 |
| `copilot` | llamada directa (`ai_document_editor.py:145`) | prioridad 0 (carril interactivo reservado) |

## 10. Testing / criterios de aceptación

Backend (`pytest`):

- dedup: mismo hash no se encola dos veces; hash cacheado no genera request.
- prioridad: el copiloto (0) se ejecuta antes que cualquier lote.
- deadline: un motor que excede el deadline deja el job en `pending`, no
  colgado.
- cancelación: `cancel_session` impide nuevas ejecuciones y drena la cola.
- breaker: tras N fallos el proveedor pasa a `open` y no se usa hasta
  `half_open`.
- **reabrir con un párrafo cambiado encola solo el hash del párrafo.**
- Regresión: `test_provider_id.py`, `test_refine_cache.py`,
  `test_refine_por_proveedor.py` siguen verdes.

Frontend (`vitest`):

- subir archivo **no** dispara motores LLM.
- viewport → `demand` con los ids visibles (debounce verificado).
- `motoresAuditando` refleja el estado del scheduler.
- `globosProactivos.test.tsx` y `useReviewWorkbench.test.ts` se actualizan al
  nuevo origen de estado, sin cambiar el contrato visual.

## 11. Fases de entrega

1. **Scheduler core**: `ai_scheduler.py` + `content_hash` + endpoints + tests.
2. **Migrar motores**: proofread, captions, classify a demanda; integración de
   cachés.
3. **Viewport frontend**: `useVisibleElements`, quitar eager, estado/globos.
4. **Robustez**: breaker, cancelación, copiloto prioritario, botones manuales.

Cada fase, un commit atómico con tests en verde (metodología `AGENTS.md` §5).

## 12. Riesgos

- **Granularidad**: los motores hoy son por lote; migrarlos a ítem puede exponer
  dependencias de contexto entre elementos. Mitigación: el hash incluye el
  contexto que el motor usa hoy (p. ej. ventana de 2 párrafos en captions).
- **UI optimista**: `autoCaptionAll` actual escribe captions directo; pasa a
  encolar y el resultado llega por estado. Se debe preservar la sensación de
  "ya quedó".
- **Compatibilidad con tests existentes** de caché/proveedor.
- **Multi-worker**: si el servidor corre con más de un worker, el scheduler en
  proceso no comparte cola. Hoy el backend es un solo proceso; se documenta el
  límite.
