# Motor de IA a prueba de baneo: cuota real, backoff y presupuesto

> **Estado: diseño aprobado, listo para plan.** Hace que el router de IA respete
> las políticas reales de cada proveedor en lugar de reintentar a ciegas contra
> un 429, y le da al usuario un techo de cuota que no puede cruzar sin saberlo.

## El defecto que este ciclo viene a cerrar

`python/modules/ai_client.py` ya tiene un `TokenBucket` por proveedor y un
registro de cooldowns. El problema no es que falte el mecanismo: es que el
mecanismo **no mira lo que el proveedor le dice**.

- **G1 — El `Retry-After` no se lee.** La palabra `retry_after` tiene **cero
  ocurrencias en todo el repo**. Un 429 con `Retry-After: 120` provoca espera de
  `1.5 ** attempt` segundos (L289-291) y volver a golpear. Groq, OpenRouter y
  Cerebras mandan ese header precisamente para que no se golpee.
- **G2 — El backoff no tiene jitter.** `1.5 ** attempt` es exponencial puro.
  Con `retries=1` por defecto (L269) es, en la práctica, un solo intento: no hay
  backoff real salvo en el fallback forzado (`retries=2`, L424).
- **G3 — Solo existe RPM.** `PROVIDER_CAPACITY` (`llm_classifier.py` L52-71)
  declara `requests_per_minute` y nada más. No hay RPD, TPM, TPD ni
  concurrencia. El comentario de Aion dice "20K TPD" (L63) pero no se codifica.
- **G4 — El cooldown es por proveedor, no por clave.** Todos los procesos con
  la misma clave comparten supuestos distintos; un proceso no ve el cooldown de
  otro, y dos usuarios de la misma clave embebida se pisan.
- **G5 — `visual_auditor.py` evade el router.** L107-123 hace un `requests.post`
  **síncrono** a `integrate.api.nvidia.com`, con modelo `llama-3.2-11b-vision-
  instruct` hardcodeado, sin `TokenBucket`, sin cooldown y sin backoff. Un 429
  aquí no se registra. Se llama desde `main.py` L1414.
- **G6 — No hay tope de llamadas por documento.** El diseño D10-bis
  (`docs/superpowers/specs/2026-09-27-catalogo-revision-58-reglas-design.md`
  L210-242) reconoce que con RPM 10-30 la llamada por párrafo es inviable y
  propone un tope derivado de `requests_per_minute`. Sigue sin implementar.
- **G7 — No hay presupuesto de cuota diaria.** Un usuario con clave propia puede
  agotar su RPD sin que la app lo sepa ni lo avise, porque el RPD ni se conoce.

## D1 — Tabla de límites reales por proveedor

`PROVIDER_CAPACITY` pasa de `{timeout, max_tokens, rpm}` a una tabla con la
política declarada por cada proveedor, con **fuente y fecha** por fila:

```
rpm, rpd, tpm, tpd, concurrencia, timeout, max_tokens_per_request
```

Valores base capturados de la documentación oficial (el plan los fija y deja la
fuente en el código):

| Proveedor | rpm | rpd | tpm | tpd | fuentes |
|---|---|---|---|---|---|
| groq | 30 | 1 000 | 8 000 | 200 000 | console.groq.com/docs/rate-limits |
| openrouter | 20 | 50 | — | — | openrouter.ai/docs/api-reference/limits |
| cerebras | 5 | 1 000 000 | 30 000 | 1 000 000 | inference-docs.cerebras.ai/support/rate-limits |
| gemini | 10 | por proyecto | — | — | ai.google.dev/gemini-api/docs/rate-limits |
| cloudflare | 20 | — | — | — | developers.cloudflare.com/workers-ai/platform/limits |
| nvidia_nim | 30 | — | — | — | build.nvidia.com (doc no pública, conservador) |
| huggingface | — | créditos | — | — | huggingface.co/docs/api-inference/rate-limits |
| mistral, opencodezen, zenmux, aion, kilocode, ollama_cloud, nuevos | conservador | — | — | — | sin doc pública |

Regla explícita para los "límite desconocido": se usa el valor **conservador**
(documentado en el código como tal), se respetan los headers que el proveedor
mande, y **nunca** se asume que no hay límite. Un proveedor sin política pública
no es un proveedor sin límite.

## D2 — Leer los headers del proveedor antes de decidir

`_try_provider` (`ai_client.py` L265-312) aprende a leer, cuando el proveedor los
manda:

- `Retry-After` → espera exactamente lo que pide, no menos.
- `x-ratelimit-remaining-requests` / `x-ratelimit-limit-requests` → cuánto queda
  hoy (Groq los usa como RPD).
- `x-ratelimit-remaining-tokens` / `x-ratelimit-limit-tokens` → tokens del
  minuto.
- `x-ratelimit-reset-requests` / `x-ratelimit-reset-tokens` → cuándo vuelve.

El cooldown deja de ser un número fijo (30 s para 429, 600 s para auth, 15 s para
el resto) y pasa a ser: **si el header dice cuánto, ese es el cooldown; si no, el
valor conservador actual**. Un 429 sin `Retry-After` mantiene el suelo de 30 s.

Los headers `x-ratelimit-*` también alimentan un registro en memoria de "cuánto
queda" que la UI puede consultar (Spec 4).

## D3 — Backoff exponencial con jitter

La espera entre reintentos pasa de `1.5 ** attempt` a:

```
min(tope, base * (2 ** attempt)) * (1 + jitter)
```

con `jitter` aleatorio acotado para que N usuarios de la misma clave embebida no
reintenten en fase. El tope evita esperas absurdas en un fallo de red largo. El
número de reintentos por defecto sube de 1 a un valor que el plan fija, pero
**siempre** con un techo total: reintentar no puede volverse un bucle.

## D4 — Presupuesto de cuota por proveedor y por día

Una capa nueva, por encima del `TokenBucket` (que controla el minuto), controla
el **día**:

- Lleva el conteo de requests y de tokens consumidos por proveedor por día.
- Su techo no es el RPD del proveedor, sino **un cupo racionado**: con la
  decisión del usuario de "a lo mucho 2 usuarios al mismo tiempo" por clave, el
  cupo por usuario es **≈45 % del free tier**, dejando ~10 % de margen para
  reintentos y picos. Configurable.
- Cuando el cupo se alcanza, el proveedor entra en cooldown hasta el próximo
  reset diario; el router pasa al siguiente proveedor con la especialidad
  disponible en vez de fallar.
- El reset es a medianoche del proveedor (Pacífico para Gemini, que lo declara
  por proyecto, no por clave).

Para OpenRouter, que expone `GET https://openrouter.ai/api/v1/key` con
`limit_remaining`, `usage_daily` y `free_model_daily_requests`, la app **consulta
la cuota real** en vez de estimarla, tal como pidió el usuario. El resto de
proveedores usa conteo local.

## D5 — Tope de llamadas por documento (D10-bis)

Se implementa el tope que el diseño de catálogo ya describía: cada documento
tiene un máximo de llamadas IA derivado de la capacidad de los proveedores
disponibles, y una vez alcanzado, la app deja de llamar y **reporta cuántos
elementos quedaron sin verificar**. Nunca "sigue llamando hasta terminar".

## D6 — `visual_auditor.py` pasa por el router

`visual_auditor.py` L107-123 deja de hacer `requests.post` directo. La llamada
de visión se hace con `execute_with_specialty`, de modo que herede `TokenBucket`,
cooldown, backoff y presupuesto. Si el proveedor de visión no está disponible, se
degrada igual que el resto del motor, sin romper la auditoría.

## D7 — Concurrencia acotada

Una llamada IA por vez (o un límite bajo y explícito) por proveedor, para que un
abanico de tareas concurrentes no dispare N requests simultáneos contra una
clave cuyo límite es 5-30 rpm. El límite se declara en la tabla de D1.

## Cumplimiento (lo que el usuario pidió explícitamente)

El usuario pidió "formas de que cumplamos todas las leyes y limitaciones" y que
las claves son **personales, no comerciales, sin superar los límites por hora**.
Este spec ataca eso por el lado técnico (respetar los límites declarados y los
headers reales). El lado de aviso al usuario vive en el Spec 4:

- Se mantiene una sola clave por proveedor; no hay rotación (decisión del
  usuario), así que el motor trata cada clave como recurso escaso y racionado.

## Fuera de alcance

- Rotación de múltiples claves por proveedor. Decisión explícita del usuario:
  una clave, pacing correcto.
- Reescribir la historia de git (ver Spec 1, D5).

## Criterios de aceptación

1. Un 429 con `Retry-After: 120` produce una espera de al menos 120 s, verificada
   por test con el transporte falso que ya usa `test_proveedores.py`.
2. El backoff tiene jitter observable (dos reintentos de prueba no esperan lo
   mismo) y un tope máximo.
3. `PROVIDER_CAPACITY` declara rpm, rpd, tpm, tpd y concurrencia por proveedor,
   con fuente en el código.
4. El presupuesto diario corta a un proveedor al llegar a su cupo y el router
   continúa con otro; el cupo por defecto es ≈45 % del free tier y es
   configurable.
5. OpenRouter consulta `/api/v1/key` y usa la cuota real cuando responde.
6. `visual_auditor.py` no contiene ningún `requests.post` directo a un proveedor
   de IA; su llamada pasa por el router (verificable por grep y por test).
7. Existe un tope de llamadas por documento y la app informa cuántas se omitieron.
8. Tests nuevos para `TokenBucket` directo, `Retry-After`, jitter, presupuesto y
   tope por documento, además de los existentes en verde.
9. `pytest python/tests/` en verde.
