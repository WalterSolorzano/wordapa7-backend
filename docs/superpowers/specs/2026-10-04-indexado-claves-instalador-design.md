# Indexado de claves de IA en el instalador

> **Estado: diseño aprobado, listo para plan.** Cierra el agujero por el que una
> build puede publicar un instalador sin ninguna clave embebida, y por el que
> cuatro proveedores que el usuario ya tiene en su `.env` nunca llegan a la app.

## El defecto que este ciclo viene a cerrar

La app tiene hoy tres fuentes de claves, en este orden de precedencia:

1. `.env` de la raíz del repo (`load_dotenv`, `python/main.py` L26-28).
2. `%APPDATA%\WordAPA7\storage\ai_keys.json`, escrito por la UI
   (`load_provider_keys_into_env()`, L30-37).
3. `_embedded_payload.json`, ofuscado con XOR, que es el que viaja en el
   instalador (`load_embedded_into_env()`, L42-48).

Cada fuente respeta "si la variable no está ya en `os.environ`". En el layout
instalado no hay `.env`, así que el orden real es **usuario > embedded**.

Ese diseño funciona, pero tiene cuatro fugas confirmadas:

- **F1 — Cuatro claves del `.env` no viajan nunca.** `MODELSCOPE_API_KEY`,
  `SAMBANOVA_API_KEY`, `DASHSCOPE_API_KEY` y `AGNES_AI_API_KEY` existen en el
  `.env` del usuario, pero no están en `VARIABLES_DE_CLAVE`
  (`python/persistence/ai_keys.py` L31-46), así que `embed_payload.py` nunca las
  ofusca ni las mete al payload. Los proveedores correspondientes aparecen en
  `tools/llm_connect.py` L157-182, pero no en `llm_classifier` ni en el catálogo:
  son claves muertas dentro de la app.
- **F2 — Una build puede salir sin claves y nadie se entera.**
  `embed_payload.py` L62 **siempre** escribe `_embedded_payload.json`, aunque no
  haya encontrado ninguna clave (solo emite un `warn`). `build-installer.ps1`
  L128-144 verifica `python.exe`, `*.dll`, `main.py` y `site-packages`, pero
  **no** verifica el payload. Un instalador mudo pasa el build en verde.
- **F3 — `core_server.py` no carga ninguna clave.** Es el proceso que el NSIS
  registra en el autostart (`build/installer.nsh` L173) y no llama a
  `load_dotenv`, `load_provider_keys_into_env` ni `load_embedded_into_env` (cero
  coincidencias). Si solo corriera el core, la IA arrancaría con cero claves.
- **F4 — `ai_keys.json` solo se crea si el usuario escribe en la UI.** El
  instalador nunca lo pre-crea. En una instalación limpia con payload vacío,
  el usuario tiene cero claves sin ningún aviso.

## D1 — Un catálogo único de proveedores, con los cuatro nuevos integrados

`VARIABLES_DE_CLAVE` (`python/persistence/ai_keys.py`) es la fuente de verdad del
backend y `PROVEEDORES_IA` (`src/lib/proveedoresIA.ts` L47-113) del frontend. Hoy
coinciden en 13 proveedores y 14 variables (Cloudflare aporta
`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`).

Este ciclo agrega los cuatro proveedores huérfanos como **proveedores reales**,
no como variables sueltas:

| id | variable clave | variable modelo | Default |
|---|---|---|---|
| modelscope | `MODELSCOPE_API_KEY` | `MODELSCOPE_MODEL` | por definir en plan |
| sambanova | `SAMBANOVA_API_KEY` | `SAMBANOVA_MODEL` | por definir en plan |
| dashscope | `DASHSCOPE_API_KEY` | `DASHSCOPE_MODEL` | por definir en plan |
| agnes_ai | `AGNES_AI_API_KEY` | `AGNES_AI_MODEL` | por definir en plan |

Esto toca los cuatro puntos que ya enumeran la misma lista y hoy deben moverse
juntos, siempre:

- `VARIABLES_DE_CLAVE`, `VARIABLES_DE_MODELO`, `PROVIDER_ENV_VARS`,
  `VARIABLES_DE_CLAVE_POR_ID` en `python/persistence/ai_keys.py`.
- Una entrada por proveedor en `_get_active_providers()`
  (`python/classification/llm_classifier.py` L105-328), leyendo su
  `os.getenv("<VAR>", "")` y su modelo.
- `PROVIDER_CAPACITY` (`llm_classifier.py` L52-71) con RPM conservador mientras no
  haya política pública conocida (ver Spec 2).
- `PROVEEDORES_IA` en `src/lib/proveedoresIA.ts` con `id/etiqueta/variablesClave/
  variableModelo/modeloPorDefecto`.

**Invariante de paridad:** los ids y las variables de clave del backend y del
frontend tienen que ser idénticos. Hoy lo fija `conexionNoMiente.test.ts` L129
(14 variables) y debe extenderse a las 18 tras este ciclo. El plan define el
test de paridad `.env` ↔ `VARIABLES_DE_CLAVE`: si el `.env` del build tiene una
variable con forma de clave que no está en el catálogo, el test falla y nombra
la variable.

## D2 — `embed_payload.py` falla cerrado

`embed_payload.py` deja de escribir un payload vacío en silencio:

- Si no encuentra **ninguna** clave en `.env`, **aborta con código de salida
  distinto de cero** y un mensaje que explica qué falta. Una build sin claves es
  un error de build, no un warning.
- Si encuentra algunas pero no todas las declaradas en `VARIABLES_DE_CLAVE`,
  escribe el payload y **lista las ausentes** como advertencia visible.
- El modo "build sin claves a propósito" (tests, desarrollo local) se expresa
  con un flag explícito, nunca como efecto colateral de un `.env` vacío.

El objetivo es que un instalador mudo sea imposible de producir por accidente.

## D3 — El build verifica el payload

`build-installer.ps1` suma el payload a su verificación fail-closed (L128-144):

- `_embedded_payload.json` existe en `dist-python/python-runtime/python/`.
- No está vacío y contiene al menos una entrada.
- El conteo de entradas coincide con el esperado (o se reporta cuál falta).

Si la verificación falla, el script termina con error, igual que hoy con
`python.exe` o `main.py`.

## D4 — `core_server.py` carga la misma cascada

`core_server.py` importa y ejecuta las tres cargas en el mismo orden que
`main.py` (usuario > embedded, sin `.env` en el layout instalado). Extraer la
cascada a una función única, por ejemplo
`persistence.ai_keys.load_all_key_sources()`, evita que los dos procesos
divergir. El plan decide si esa función vive en `persistence/ai_keys.py` o en un
módulo `bootstrap` dedicado.

**No** se duplica la lógica: si mañana entra una cuarta fuente, entra en la
función única y la ven los dos procesos.

## D5 — Verificación e higiene de claves en texto plano

Dos hallazgos de la auditoría que no son defectos de código pero se documentan:

- El `.env` local está en texto plano y **no** está versionado (`.gitignore`
  L21). La auditoría de todo el historial (todas las ramas) confirma que
  **ninguna clave real llegó a git**: los matches de `.env.example` son
  placeholders (`nvapi-TU_API_KEY_AQUI`, `nvapi-XXXX...`). No se requiere
  reescribir historia.
- `build/installer.nsh` L269-272 no borra `ai_keys.json` en la desinstalación
  (intencional). Se conserva el comportamiento; solo se documenta en el plan.

## Fuera de alcance

- Rotación de múltiples claves por proveedor (decisión del usuario: una sola
  clave, pacing correcto). Ver Spec 2 para el pacing.
- Cifrado real del payload. La ofuscación XOR es un secreto de código, no
  criptografía; el propio `embedded_secrets.py` L12-13 advierte que todos los
  usuarios comparten la misma clave. Endurecer esto es otro ciclo.

## Criterios de aceptación

1. Los cuatro proveedores nuevos existen en el catálogo backend y frontend con
   paridad verificada por test.
2. `npm run build:backend` con un `.env` sin claves **falla** con mensaje claro;
   con claves, el payload contiene las 18 variables de clave presentes.
3. `build-installer.ps1` falla si el payload falta, está vacío o su conteo no
   coincide.
4. `core_server.py` arranca con las claves del payload cargadas en `os.environ`.
5. Existe un test que falla si el `.env` del build declara una clave que no está
   en `VARIABLES_DE_CLAVE`.
6. `pytest python/tests/` y `npm test` en verde.
