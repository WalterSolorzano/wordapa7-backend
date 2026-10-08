# MEMORY — WordAPA7, sesión del 2026-09-28/29

Rama `feat/motor-render-fase1`. Leo esto para retomar sin contexto.

## Qué se está haciendo

Un **megaplan de rediseño de superficies** en 9 fases, todas bajo un spec maestro.
Cada fase es un commit, ejecutada por un subagente, con mutation testing obligatorio.

## Documentos (leelos primero, son la fuente de verdad)

| archivo | qué es |
|---|---|
| `docs/superpowers/specs/2026-09-27-rediseno-superficies-master-design.md` | **spec maestro**, 9 fases, §3 es la barra de calidad y §14 lo que NO se hace |
| `docs/superpowers/plans/2026-09-28-f0-la-verdad-del-dato.md` | plan, hecha |
| `docs/superpowers/plans/2026-09-28-f1-verdad-de-pantalla.md` | plan, hecha |
| `docs/superpowers/plans/2026-09-28-f2-portada.md` | plan, hecha |
| `docs/superpowers/plans/2026-09-28-f3-estructura.md` | plan, hecha |
| `docs/superpowers/plans/2026-09-28-f4-figuras-tablas-inspector.md` | plan, hecha |
| `docs/superpowers/plans/2026-09-28-f5-referencias-tres-zonas.md` | plan, hecha |
| `docs/superpowers/plans/2026-09-28-f6-exportar.md` | **faltan F6, F7, F8** |

## Estado de las fases

**Hechas: F0, F1, F2, F3, F4, F5.**

| fase | commit principal | qué resolvió |
|---|---|---|
| F0 | `86fb940`…`20c733d` | `KIND_LABELS` (10 filas) duplicado y su `\|\| f.kind` escribía `paragraph_words` crudo en `localStorage`; `[Figura sin rotular]` lo inventaba el frontend y lo pintaba tachado |
| F1 | `e0db562`…`e25ee85` | el `zIndex: 9999` inline que se llevaba la pantalla; paleta horaria con hex (morada de noche); empty state que vivía dentro del rack y desaparecía bajo 1180 px; minimapa de 19 px con cuadrados de 4 px sin nombre |
| F2 | `f794628`…`877817a` | autor/profesor/comité vivían DENTRO del bloque de portada (se perdían con "Conservar original"); geometría triplicada a mano; dos instituciones encendidas por `String.includes`; `_resolve_logo_path()` sin argumento daba el logo de UNI al elegir UNAN |
| F3 | `fba9489`…`56e43db` | match de fase EXACTO contra 10 valores: `"1. Introducción"` caía en `sin_fase` y todos los capítulos numerados se fundían; el nombre de la fase solo en el hover |
| F4 | `26a567c`…`6560970` | 13 tamaños inventados `\|\| 12`/`\|\| 8`; `sectionMap` indexado por `element_id` (posicional); `setProp` disparando `updateElement` por letra; el inspector que te sacaba de donde estabas |
| F5 | `57ea03c`…`a1c35f6` | `isZombie`/`isOrphan` por heurística de texto; 41 tamaños de fuente literales; 60 alias legacy; el archivo fuera del alcance del lint |
| — | `99c101e` | `ReferencesPanel` (395 líneas) borrado: era un duplicado con un botón roto, la capacidad útil (`autoResolveAllGhostCitations`) **no existía** en ningún slice |

## Baseline verificado al terminar F5

```
npx vitest run   → 1401 passed, 0 failed (119 archivos)
npx tsc --noEmit → limpio
pytest -q        → 809 passed, 14 skipped
npm run build    → sin error
```
Arrancaba en **1024 / 766**. Los 14 skipped de Python son por Word COM bloqueado
(`CryptoAPI Root store`) y FastAPI apagado; sin ellos son 815/8. **Es condicional, no bajen de 809.**

## Reglas del proyecto que hay que respetar siempre

- **Cero emojis.** Solo `lucide-react`, con `strokeWidth="var(--icon-stroke)"`.
- **Cero colores literales.** Solo tokens `--color-*` y `--space-*`. R3 corre sobre
  **doce directorios sin deuda**. Los alias legacy (`--surface-elevated`, `--sidebar-bg`,
  `--text-main`, `--accent-primary`, `--surface-bg`, `--surface-alt`, `--surface-hover`)
  **no existen**: usarlos rompe el build.
- **Ninguna UI puede afirmar algo que el código no hace.** Es la regla del proyecto.
- `npx vitest` **no** type-chequea: `npx tsc --noEmit` aparte, siempre.
- `DEUDA_MEDIDA` **no existe** y hay un guardián que falla si el nombre vuelve.
- `git add` explícito archivo por archivo. **NUNCA `git add -A`.**
- `Set-Content` de PowerShell **destruye el archivo**. Usá la herramienta de edición.
- **NO uses `git worktree`**: ya borró `node_modules` una vez.
- Después de escribir: `Select-String -Pattern '[\u4e00-\u9fff\uac00-\ud7af\ufffd]'`.
  Comentarios y commits **en español, sin CJK**. Contá los bytes de los archivos nuevos
  (un byte NUL ya arruinó un archivo).
- **⛔ `LICENSE` y `README.md` no se tocan.** Un subagente cambió la licencia de MIT a
  CC BY-NC-SA 4.0 sin autorización; revertido. Es decisión legal del dueño.

### Leer fuentes en los tests — la regla correcta

- **`.ts` / `.tsx`**: `import mod from '../ruta/AlArchivo.tsx?raw'`. Funciona.
- **`.css`**: `?raw` **devuelve 0 caracteres** (`css: false` en `vite.config.ts`).
  Usá el rodeo de variable de specifier que ya hace `src/__tests__/designTokens.test.ts:12-27`:
  `await import(/* @vite-ignore */ 'node:fs')`. **Sí lee**, si el specifier va en una variable
  para que Vite no lo analice.
- **Yo escribí esta regla al revés durante cuatro fases.** Ya está corregida en todos los planes.

## La clase de bug que más aparece: la guarda que no vigila

Cuatro veces en este megaplan, un test **se reportaba vigilando y no lo hacía**:

1. Contaba un `import` comentado como importador (se desactivaba con un `//`).
2. Leía un token de un elemento vecino en vez del bloque del elemento.
3. Con el glob vacío, dos guardas pasaban **sin leer un archivo**.
4. Excluía `App.tsx` de la lista de importadores, que era justo el archivo que tenía que estar.

**Regla: mutá cada guardián que escribas**, incluso el que te parezca correcto.
Y si un test **no** se cae al mutar, averiguá por qué antes de parchearlo: a veces
no tiene que caer (un `=== true` es null-safe por construcción) y a veces es un bug real.

## Reutilizar, no duplicar

- `src/lib/rotulos.ts` (F0) — `SUBTYPE_LABELS`, `rotuloDeSubtipo`, `rotuloDeKind`, `MARCAS_MAP_VERSION`. `PROOFREAD_SPECS` **mudó ahí**; `auditItems.ts` lo reexporta.
- `src/lib/marcasMap.ts` (F0) — `leerMarcas`, `escribirMarca`, `borrarMarca`.
- `src/components/shared/EstadoVacio.tsx` (F1) — motivos `sin-documento`, `sin-motor`, `sin-resultados`, `sin-seleccion`.
- `src/lib/portada/geometria.ts` (F2) — `escalaDePreview`, `mmAPx`, `ptAPx`, `fraccionDeAnchoUtil`, `FRACCION_DE_ANCHO_DEL_LOGO = 0.315`. Los márgenes son **1 pulgada** (`APARuleSet.margins_cm = 2.54`), ancho útil de carta **16.51 cm**.
- `src/lib/jerarquia.ts` (F3) — `construirJerarquia`, `faseDeTitulo(titulo, estricto)`, `seccionesDeElementos`.
- `src/lib/figuras.ts` (F4) — contexto posicional de una figura, `medidaDeFigura`.
- `src/lib/referencias.ts` (F5) — `diagnosticoDeReferencia`, `particionarReferencias`, `expresionDeReferencias`.
- `src/components/settings/tabs/word/Seccion.tsx` — el molde único de sección.
- `src/components/layout/EditorialMascot.tsx` + `src/components/settings/mascotDePestana.tsx` — mascota por pestaña con la cara real.

## Criterio de aceptación de cada fase

**Una superficie terminada y probada que nadie ve NO está terminada.** Pasó en F3
(siete componentes, 1239 tests, cero importadores) y casi pasa en F5.

Al final de cada fase:
- `grep` de importadores **desde la app, no desde los tests**.
- Un guardián que falle si algún componente de la carpeta queda huérfano.
- **Un criterio de montaje real**: ¿la pantalla existe en `App.tsx` y qué renderiza?

## Fases que faltan

### F6 — Exportar (§10 del spec)
- El panel de **ajustes avanzados no existe**: hay un link terciario sin icono que revela **un checkbox** de Track Changes.
- `format` es `useState` local (`ExportView.tsx:73`) y se pierde al salir del paso; `FileMenu.tsx:93-102` tiene sus propios botones.
- La fricción de citas fantasma no se resetea en "Descargar igual" (`:121-128`).
- `sublabel` y `ext` de `FORMATS` (`:29-61`) solo se usan en la línea de identidad (`:196`).
- **Tarea 6.0 OBLIGATORIA antes de todo lo demás**: `/api/send-to-word` (`a71c1bf` + botón `f7caf15`, aprobado por el usuario) **pisa el `.docx` original sin copia de seguridad**, hace `Close(SaveChanges=0)` sobre un documento abierto (descarta lo que el usuario tenga sin guardar), y **no tiene un solo test**. Un `.bak` antes del `shutil.copy2` es la salida mínima.
- La UI de la pestaña App ya tiene un `UpdateCard compact`; `FileMenu` ya no.

### F7 — Proyectos (§11 del spec)
- **No hay entidad proyecto**: `parseDocumentVersion` saca el prefijo del nombre del archivo. `projectImages` (`uiSlice.ts:206`) es un array de `URL.createObjectURL` en memoria que **muere con la pestaña** y nunca se sube a disco. `removeProjectImage` no hace `revokeObjectURL` (**fuga de memoria**).
- Acceso por un kebab de dos niveles; `ProjectTabs.tsx:47` (`tabs.length === 0 → null`) lo vuelve inalcanzable sin documentos; **cero entradas en el rail** (`railItems.ts:48-53,71-76`).
- `ProjectFolderModal.tsx:55-59` sube un `.docx` **por archivo, en serie**: 20 capítulos = 20 cargas con 20 pantallas de carga.
- `activeFilePath` **nunca se establece**, así que "Abrir carpeta" (`:148-173`) no aparece jamás.
- `:36-38` inventa el nombre `'Proyecto APA 7'` si no hay pestaña. `:348` `slice(0,8)` sin "ver más". `:364` `objectFit: cover` **recorta el logo**.
- **Orden obligatorio** (decisión del usuario): migrar `partialize` de `uiSlice.ts` de blob URL a `asset_id` de `/api/assets` **ANTES** de tocar el modelo de `Proyecto`.

### F8 — LLM (§12 del spec)
Tres cables sueltos, en orden de daño:
1. **`proactive_auditor.refine_with_llm` (`:693-704`) no pasa por el router**: URL y modelo NIM hardcodeados, `requests.post` **síncrono en un `async def`**, y su consumidor lee `os.getenv("NVIDIA_API_KEY")` en vez del request. Es el **único motor de ortografía** y no funciona para ninguno de los 5 proveedores que el repo declara vivos.
2. **Las 9 variables de modelo son un control mudo**: la UI las ofrece y **admite por escrito que no llegan** (`ConexionTab.tsx:275-279`), y un test lo consagra (`conexionTab.test.tsx:251`). `main.py:970-984` es un dict de variables de **clave**, no una allow-list de modelos. **Se cablean, no se borran** (decisión del usuario) y el texto del spec lo aclara: la cláusula de borrado es un fusible, no una alternativa.
3. **`api_key` se inyecta en `nvidia_nim` sin importar de qué proveedor venga** (`llm_classifier.py:113`) y **17 de 18 endpoints ignoran `provider_id`**. Elegir Groq manda la key de Groq a NIM → 401 → cooldown de 600 s.
4. `HUGGINGFACE_API_KEY` **no tiene camino** de la UI a `os.environ` (falta en `backend.ts:341-355`, `main.py:970-984`, `ai_keys.py:18-32`).
5. `.env.example` faltan `GROQ_MODEL`, `ZENMUX_MODEL`, `GEMINI_MODEL`; y recomienda `meta/llama-3.1-70b-instruct` como "mayor precisión" (`ai_client.py:23` dice que murió el 2026-08-26).
6. **No hay un solo test por proveedor**, ni de que la key de la UI llegue al backend, ni de que un modelo llegue a `os.environ`. No hay botón "Probar". Las claves viven en texto plano en `localStorage`, IndexedDB y `ai_keys.json` sin `chmod`: **eso NO se arregla en F8, se anota.**

## Pendientes sueltos

- **9 `zIndex` fuera de la escala** (`DesignAuditor` 20000, `CommandPalette` 10000, `LLMConsentDialog` 9500, `AIBatteryIndicator`/`NIMDiagnosticsModal` 9999, `OnboardingTour` 9990, `TemplateDialog` 10000, `MiniToolbar` 5000, `MascotBubble` 9000). Hay un guardián que avisa si crecen, pero **bajarlos cambia el orden de pintado entre capas** y eso hay que decidirlo **con la app abierta**.
- **La lista de fases obligatorias de APA 7 no existe en el backend.** `RULE_SCOPES` mapea regla→ámbito, no tiene campo "requerida", no hay endpoint. `FaltasApa7` la recibe por prop y, sin ella, **lo dice en pantalla**. Inventarla sería la sexta copia de una regla que nadie tiene.
- **Divergencia Python/TS pendiente**: tres títulos dependen de un alias que no viaja (`1.1 Antecedentes`, `Parte 1. Metodología`, `Metodología de la investigación`). Se cierra con un endpoint que exponga `PHASES`. Hay un test que **cuenta** la divergencia.
- **El watcher de Word y otra IA?** En dos ocasiones apareció trabajo de otra sesión en el mismo árbol sin anunciarse. Hay que revisar `git status` **antes** de commitear, y nunca `git add -A`.
