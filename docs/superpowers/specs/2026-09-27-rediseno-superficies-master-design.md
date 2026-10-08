# Rediseño de superficies de WordAPA7 — documento maestro

> **SUPERADO el 2026-09-29.** Este documento queda como historial. El plan vigente es
> `docs/superpowers/specs/2026-09-29-plan-correccion-por-fases-design.md`, que agrega una
> fase de base verde y una de sistema de diseño y shell, y reordena el resto. Las decisiones
> del usuario registradas acá (protección de la portada original, tamaño de página como
> propiedad de la sección, revisión de un párrafo a la vez) siguen vigentes.

- **Fecha**: 2026-09-27
- **Rama**: `feat/motor-render-fase1`
- **Estado**: esperando revisión
- **Alcance**: 13 problemas verificados sobre la app en ejecución, en un documento maestro.
  Este documento es diseño, no tareas. Al aprobarlo, `writing-plans` lo rompe en planes
  de fase ejecutables, uno por subagente.

---

## 1. Por qué existe este documento

El usuario reportó trece síntomas distintos. Cada uno de ellos se reporta por separado
porque se los encontró por separado, pero al verificar el código no son trece problemas:
son **seis problemas de fondo** que se manifiestan en pantallas diferentes. El documento
está organizado por la causa, no por la pantalla donde se vio.

Los seis problemas de fondo:

1. **La UI afirma cosas que el código no hace.** Un placeholder inventado en
   `auditItems.ts` aparece como si fuera texto del documento. Un `KIND_LABELS` con 10
   claves de 30 escribe `snake_case` crudo en pantalla. Un toggle ofrece 9 modelos que
   nunca llegan al backend, y la propia UI lo admite por escrito.
2. **Los valores viven en dos lugares que se divergen.** La geometría de la portada está
   duplicada a mano entre la preview y el `.docx`. Los tokens de color existen en tres
   familias y cuatro se usan sin declarar.
3. **La generación vieja no se migró.** `Step5ReferencesWizard.tsx` es de antes del
   rediseño de Ajustes, usa `btn btn-primary` y diez tamaños de fuente literales, y está
   **fuera del alcance del lint**, por eso nadie lo caza.
4. **El inspector y los menús son de otra app.** Botones que no hacen nada, paneles que
   te sacan de donde estás, kebabs de dos niveles, rutas que no existen.
5. **La jerarquía documental ya se calcula y se tira.** `phase_scope.py` sabe qué H1 abre
   qué fase y `match_phase_exact` distingue un H2 mal nivelado de uno deliberado. Nadie
   lo muestra.
6. **La promesa del producto es más grande que el producto.** La UI promete 13
   proveedores, 9 modelos y un exploratory de proyecto. Hay 13 proveedores en el catálogo,
   0 modelos configurables, y el "proyecto" es un prefijo del nombre del archivo.

### 1.1 La regla que gobierna todo

> **Ninguna UI puede afirmar algo que el código no hace.**

Esa regla ya existe en `AGENTS.md` y este documento es su aplicación. En la práctica
significa tres cosas concretas:

- Si a un elemento no se le puede aplicar una corrección, la vista **lo dice** en vez de
  inventar un texto sobre el que tachar.
- Si un control no llega a su destino, se **borra o se cablea**. Un control decorativo es
  peor que un control ausente: ocupa el lugar de uno que sí funciona.
- Todo texto de interfaz tiene un test que falla si se rompe su contrato.

---

## 2. Lo que se verificó, con rutas

Todo lo de esta sección se leyó en el código. No hay suposiciones sin marcar.

### 2.1 `[Figura sin rotular]` en pantalla

**No viene de Python.** En `src/python/` no hay una sola aparición de `sin rotular`.

- `src/lib/auditItems.ts:462-476`: rama `e.type === 'image' && !e.image_info?.caption`.
  Escribe `originalText: '[Figura sin rotular]'` (línea 471) y un
  `suggestedText` genérico escrito a mano (472). Gemelo para tabla en `:477-491`.
- `src/components/review/FindingDetail.tsx:203` lo pinta en un `<pre>` monoespaciado con
  fondo `--severity-critical-tint`. Se lee como cita del documento.
- `src/components/review/EngineGroupCard.tsx:236` lo pinta con `line-through`. El efecto
  visible es **`[Figura sin rotular]` tachado**, que dice "el documento tenía esto y se
  borró". No es lo que pasó: no había nada.
- `src/hooks/useReviewWorkbench.ts:226-227`: `SUBTYPE_LABELS.figura = 'Figura sin rotular'`.
  **Esto sí es rótulo de interfaz y está bien.** El problema es que convive en la misma
  pantalla con el placeholder del `originalText`.
- `src/__tests__/findingRack.test.tsx:433` consagra el placeholder como dato esperado.
  Cualquier arreglo toca ese test, y está bien que lo toque: el test estaba fijando el
  defecto.

**Causa de fondo**: `AuditItem.originalText` no admite "no hay texto". El modelo obliga a
llenar el campo. Eso obliga a inventar.

### 2.2 El fondo púrpura

No es el dropzone. `src/components/upload/UploadDropzone.tsx:85,91,111` usa cuatro
tokens que sí existen.

> **Corrección del 2026-09-28, después de escribir el plan de F1.** El `position: fixed`
> y el `zIndex: 9999` **no están commiteados**: son un cambio en el árbol de trabajo de
> una sesión que se interrumpió. La versión commiteada de `LoadingTips.tsx:678` y
> `:718` dice `position: 'relative'`, o sea que el overlay en flujo ya tapaba menos.
> Ese cambio sin commitear **empeora** dos cosas (convierte el overlay en capa a
> pantalla completa y saca el `setTimeout(..., 250)` que hacía esperar antes de mostrar)
> y **mejora** una. El usuario revisó la app con él puesto, así que el síntoma es real.
> La paleta morada, en cambio, sí está en el archivo commiteado y sí es la causa del
> color. La Task 2 del plan de F1 arranca pidiendo una decisión sobre ese cambio sin
> commitear antes de escribir una línea.

Es `src/components/layout/LoadingTips.tsx`:

- `:678` y `:718`: `position: 'fixed', inset: 0, zIndex: 9999`. Se pinta encima de todo,
  incluido el workbench de Revisión. El `zIndex` inline pisa el `z-index: 200` de la
  clase `.loading-tips-fullscreen` (`design-system.css:1335-1343`).
- `:380`: `{ bg: ['#1a0828', '#220b32'], blobs: ['#4a1060', '#3a0a50'], particle: '#c87deb' }`.
  Es una paleta a mano que depende de la hora, y **a partir de las 18:00 es morada**.
- `:477`: `opacity: 0.32` sobre `position: absolute; inset: 0; pointerEvents: none`.
- `:353` justifica los hex con un comentario que dice "no son tokens de UI — pure draw
  layer". **Ese comentario es el bug.** Es el fondo que el usuario ve durante la carga.
  Es UI.
- `:506`: `MIN_DISPLAY_MS = 3500`. El overlay no se va antes de 3.5 s aunque el trabajo
  termine en 200 ms. Un clic de más y aparece el morado un rato.

`scanAll` (`useReviewWorkbench.ts:796-854`) usa `isScanning` local y **no** pone
`isLoading`, así que el disparador real es cualquier llamada que sí pase por
`documentSlice`. Eso hay que confirmarlo en vivo, no se deduce del código.

### 2.3 Tokens que se usan y no existen

| token | usos | declaración |
|---|---|---|
| `--accent-soft` | `styles/fluent.css:994`, `components/auditor/DesignAuditor.tsx:178` | **no existe** |
| `--surface-bg` | `components/project/MergeDocumentsModal.tsx:55`, `ProjectImagesDrawer.tsx:31,108` | **no existe** (un uso con fallback la tapa) |
| `--surface-alt` | `components/layout/ProjectTabs.tsx:121`, `ProjectImagesDrawer.tsx:73` | **no existe** |
| `--accent-primary-soft` | — | no existe ni se usa |
| `--scrim-overlay` | `CoverCarouselStudio.tsx` | **existe** (`design-system.css:126` / `:243`) |

Por qué el lint no lo caza: la regla R3 de `src/__tests__/noHardcodedColors.test.ts:500`
solo recorre `DIRECTORIOS` (`:133`) y `ARCHIVOS` (`:134-149`). `components/auditor`,
`components/project`, `components/layout`, `components/upload` y `components/wizard`
quedan fuera.

### 2.4 Revisión: vacío, superpuesto, cuadrados sin sentido

- **No hay empty state global.** `ReviewWorkbench.tsx:220-238` cubre solo `!doc`. El de
  "sin hallazgos" está dentro del `<aside>` (`:309-320`) y **solo si `rackVisible`**
  (`:241`). Con la ventana bajo 1180 px el rack no se renderiza y **el mensaje tampoco**.
- `FocusReadingCard.tsx:118`: el texto dice "elige uno en el panel de la derecha". El rack
  **está** a la derecha, pero en ventana angosta no existe. Copia que describe algo que
  puede no estar.
- `FocusReadingCard.tsx:52-53`: `pagina = 'Sin selección'`, `seccion = ''` cuando
  `item` es null.
- **Los cuadrados de la izquierda son `ReviewMinimap`**, `components/wizard/ReviewMinimap.tsx`:
  columna de **19 px** (`:71`), `zIndex: 5` (`:82`), un `<button>` por página de
  **`minHeight: 4px`** (`:120`), `borderRadius: var(--radius-sm)`.
  - El color sale de `ENGINE_META` (`useReviewWorkbench.ts:168-174`) y son tokens. **No
    están hardcodeados.** Fallan por ilegibilidad: 4 px de alto, sin texto, sin leyenda, y
    con `--border-subtle` sobre `--sidebar-bg` en tema claro son casi invisibles.
  - **No hay hex ni rgba en `components/review/`.** El único match es un comentario en
    `EngineGroupCard.tsx:155`.
  - `AGENTS.md` §1 y `useReviewWorkbench.ts:19-23` citan el minimapa como parte del
    diseño. `src/__tests__/railPending.test.ts` y `useReviewWorkbench.test.ts` dependen de
    `marks`.
- **Superposición real**: `RailFlyout.tsx:76-90` es el único overlay verdadero
  (`position: absolute; top: 12; left: 64; width: 240; zIndex: var(--z-dropdown)`), y
  depende del `position: relative` de `AppShell.tsx:66`. `PaperCanvas.tsx:1842-1844` tiene
  un overlay de carga con `backgroundColor: 'rgba(255,255,255,0.7)'` y `zIndex: 50`:
  **blanco puro en tema oscuro**.
- Rail y workbench están montados **siempre y juntos** (`AppShell.tsx:64-84`, hermanos
  dentro de `.app-main`, sin condicional por paso).

### 2.5 El "mapa" de la IA

- **No existe mindmap.** Cero resultados para `reactflow`, `dagre`, `elk`, `cytoscape`,
  `mermaid` en `src/` y en `package.json`.
- Lo que hay es `src/components/review/AiMosaic.tsx`, montado como **tercer `viewMode`**
  (`ReviewWorkbench.tsx:188-207`), no como columna.
- Estructura: `div` flex-column → `filasDeBloques(...)` → `div` por fila → `<button>` por
  bloque (`:149-207`). Retícula de 12 columnas (`COLS_POR_FILA = 12`, `:48`), ancho
  `cols * 44 + gaps` (`:169`), `minHeight: 34` (`:54`).
- **El nombre de la fase es solo hover.** `:156` arma
  `` `${b.label}: ${pct(b)} de ${b.parrafos} párrafos marcados` `` y lo pasa a `title`
  (`:162`) y `aria-label` (`:163`). Dentro del botón solo se imprime el **porcentaje**
  (`:196`) y `"N párr."` (`:200`). Por eso "no se entiende".
- **Los H1 salen sin nombre porque el match es exacto.** `aiMosaic.ts:379-381` indexa un
  `Map` entre el `texto` del H1 normalizado (NFD, sin diacríticos, minúsculas, `trim`;
  `:366-368`) y los **valores** de `PHASE_LABELS` (`auditItems.ts:73-86`). Cualquier H1
  que no sea literalmente uno de esos 10 valores cae en `sin_fase` → `'Seccion sin nombre'`
  (`:85`). Casos que caen: `"1. Introducción"`, `"CAPÍTULO 2: MARCO TEÓRICO"`,
  `"Metodología de la investigación"`, `"Resultados y discusión"`.
- **Peor que un nombre feo**: es pérdida de cobertura. El filtro de fase usa la **misma**
  clave (`ReviewWorkbench.tsx:203`), así que todos esos H1 caen en un único bloque
  `sin_fase`.
- **Fusión silenciosa**: `aiMosaic.ts:302-316` solo hace `orden.push` si el bucket no
  existe. Dos H1 que mapean a la misma fase se funden sin avisar.
- **Re-deriva la fase**: `AiMosaic` no usa `AuditItem.phase`, que el backend ya calcula
  (`auditItems.ts:98-101`). Es la quinta copia de "qué título abre qué fase" que el propio
  archivo dice evitar (comentario `:351-362`).
- **La rampa**: `tokenDeNivel` → `var(--ia-nivel-1..4)`, declarados en
  `design-system.css:53-56` y `:219-222`. **Los cuatro son rojos**
  (`rgba(212,56,46,α)`). Una rampa monocroma roja de "cuánto más IA" se lee como error, no
  como intensidad.

### 2.6 El Inspector que no hace nada

`src/components/inspector/ElementInspector.tsx:87-213`.

- **No recibe props**: lee todo del store (`:88-89`).
- `Sugerir leyenda con IA` (`:15-63`): **sí tiene handler**. `run` llama a
  `suggestCaption(session_id, elem.id, ctx, apiKey)` (`:31`) y escribe en
  `image_info.caption` (`:34-38`). No es un no-op.
- `Abrir panel de edición` (`:286-298`): `onClick={() => setImagePanelOpen(true)}`
  (`:288`). **No navega.** `RightSidePanel.tsx:233-263` renderiza `ImageEditPanel` dentro
  del mismo panel, y `ElementInspector` **desaparece** porque la condición es
  `selectedImage ? <ImageEditPanel/> : hasSelection ? <ElementInspector/>`
  (`RightSidePanel.tsx:233/265`). El botón te saca del Inspector para mostrar otra cosa
  **en el mismo lugar**, y el título del panel dice `'Imagen'`. No hay "volver al
  inspector" más que cerrar el panel de imagen (`:246-259`).
- **Montaje**: `RightSidePanel.tsx:13,266`; se monta en `App.tsx:699` con la condición
  `wizardStep !== 4 && !== 5 && !== 6 && !focusMode`. **El Inspector no existe en
  Referencias, Revisión ni Exportar.** Y existe solo si `hasSelection`
  (`RightSidePanel.tsx:155,265`), así que el mensaje de "Seleccioná un elemento"
  (`:204-210`) nunca se ve: `RightSidePanel` elige otra rama antes (`:267-269`).
- **Código muerto**:
  - `APARuleSet` importado (`:7`) y **nunca usado**.
  - `portada, setPortada` desestructurados (`:88`) y **nunca usados**.
  - `TabId = 'info' | 'style' | 'advanced'` (`:85`): `'style'` y `'advanced'` **no se
    usan**. La lista de tabs (`:134-137`) solo genera `info` y, condicionalmente,
    `equation`.
- **Un fetch por tecla**: `ProactiveSuggestionCard.tsx:37-62` dispara
  `fetchProactiveElementDiagnosis` en cada cambio de `selectedElementId`, sin debounce y
  sin abortar red. Combinado con `onChange` en cada tecla del `<textarea>`
  (`ElementInspector.tsx:271-274`), la red se dispara por pulsación.

### 2.7 Figuras y tablas tapado

`src/components/wizard/Step3FiguresTablesWizard.tsx`, 489 líneas, leído completo.

- Layout flex-row (`:158`), no grid. Rail `width: 280, flexShrink: 0` (`:176`);
  colapsado `width: 40` (`:161`). Contenido `flex: 1, minHeight: 0, position: relative`
  (`:445`) con `PaperCanvas`.
- **Causa raíz del tapado**: el header del rail (`:180-321`) es `flexShrink: 0` y **no
  tiene `maxHeight` ni scroll**. Contiene fila de título con 3 botones (`:181-241`),
  subtabs (`:243-246`), buscador (`:250-279`), bloque "Controles de tabla" que solo
  aparece en subTab tablas (`:281-313`) y contador (`:315-319`). Fácilmente 260-380 px.
  Debajo, la lista es `flex: 1, overflowY: 'auto'` (`:323`). **En una ventana de 700-800
  px de alto el header se come el espacio y la lista scrolleable queda con 0 px.** No es
  `z-index` ni `position: absolute`: es falta de `min-height: 0` y un `flexShrink: 0` que
  no puede ceder.
- Falta también `minWidth: 0` en `:445`. Hay `minHeight: 0` pero no `minWidth: 0`
  (comparar `ReviewWorkbench.tsx:137` y `AppShell.tsx:66`, que sí lo ponen). El flex
  child puede desbordar los 280 px en vez de ceder.
- `minWidth: 0` ausente en el rail y `paperOverflow` no acotado: mismo síntoma en dos
  sitios.
- **Cada clic en la lista abre una cuarta columna**: `:375-384` llama
  `setForceRightPanelOpen(true)` (`:382`) **y** `setImagePanelOpen(true)` (`:379`), y
  `App.tsx:699` monta `RightSidePanel` en el paso 3.
- `rgba(250,173,20,0.06)` hardcodeado (`:389` y `:272-273`), `'#ffffff'` (`:459`),
  `rgba(79,124,255,0.35)` en un `boxShadow` (`:465`).
- **La lista SÍ agrupa y SÍ muestra el H1/H2**: `sectionMap` (`:89-112`) sigue el H1/H2
  vigente y lo asigna por `element.id`; se ve como badge `H1`/`H2` en `:358-360`. **Ojo:
  los ids son posicionales (`elem_N`, `auditSlice.ts:164-170`), así que dos elementos con
  el mismo id se pisan.**
- **El buscador NO busca por sección** (`:76-87`), aunque la sección ya está calculada.
- **Miniatura de tamaño fijo, no real**: `:398` usa `width/height: 48px`,
  `objectFit: 'contain'`. El tamaño real (`image_info.width_cm`) nunca se muestra, y en
  `ImageEditPanel.tsx:137-138` el default es `|| 12` / `|| 8`: **valores inventados
  presentados como si fueran el real**.
- `onError` de la miniatura (`:399`) pone `visibility: 'hidden'` y deja el hueco vacío
  **sin marco ni texto de reserva**, en vez de caer al placeholder (`:402-409`).
- **Las tablas nunca muestran datos**: placeholder con `<Table size={18}/>` (`:412-419`).
- **Los logos de portada no están en la lista**: `figures` filtra `!e.is_cover_section`
  (`:64`) y las tablas también (`:105`). Decisión consciente, comentario `:62-63`.
- El comentario de `:478-479` dice que el panel de edición "vive a nivel raíz en
  `App.tsx` (ImageEditSidePanel)". **`ImageEditSidePanel` no existe.** El panel real es
  `RightSidePanel.tsx:262`. Comentario desactualizado.

### 2.8 Referencias: de la generación vieja

`src/components/wizard/Step5ReferencesWizard.tsx`, 926 líneas. El nombre del archivo dice
"Paso 4" y el componente es el paso 4 (`App.tsx:693`).

| criterio | Referencias | criterio nuevo (`Seccion.tsx:13-39`) |
|---|---|---|
| `Seccion` | **no existe, no se usa** | molde único |
| tokens | mezcla de tres familias: `--surface-elevated`, `--surface-subtle`, `--canvas-bg`, `--sidebar-bg`, `--border-subtle`, `--accent-primary`, `--text-main`, `--text-secondary`, `--text-muted` | solo `--color-*` + `--space-*` |
| tipografía | **10 tamaños literales**: 9, 10, 10.5, 11, 11.5, 12, 12.5, 13, 14, 15 px | `var(--text-xs\|sm\|base)` |
| color literal | 4 (`rgba(0,0,0,0.06)` `:540`, `rgba(0,0,0,0.03)` `:677`, `rgba(0,0,0,0.5)` `:730`, `rgba(0,0,0,0.2)` `:735`) | 0 |
| fallback en `var()` | `var(--paper-ink, #000)` `:562` | ninguno |
| radio | `--radius-md\|lg` + `'4px'` literal `:375` | solo `--radius-*` |
| mascot | no | sí |

**Está fuera del alcance de R3**, por eso sus 4 hex pasan impunes.

Lógica sospechosa, arreglable sin rediseño:
- `isZombie` (`:84-89`) clasifica por heurística de texto (`'sin título'`,
  `titleText.length < 5`, `'s.f.'`), no por verificación real.
- `isOrphan` (`:321-324`) hace `s.includes(authors?.[0] || '---')`; con `'---'` matchea
  cualquier cosa.

### 2.9 Exportar

`src/components/export/ExportView.tsx`, 1019 líneas. El rediseño de columna única está
hecho y cumple `AGENTS.md` §1 (`:161-235`: `CheckCircle2` → `<h1>` → una línea `50ch` →
dos botones pegados, sin listas ni estadísticas).

- **El toggle existe y se llama "Opciones"** (`:262-273`), pero es un link terciario sin
  icono con `color: var(--color-text-tertiary)` y `fontSize: var(--text-xs)`, en un `div`
  sin jerarquía con "Volver a editar" (`:274-284`).
- **Lo que revela es un checkbox**: "Incluir marcas de control de cambios", y **solo
  visible si `format === 'docx'`** (`:357-384`). No hay tamaño de página, márgenes,
  fuente, interlineado, sangría, idioma, nombre de archivo, metadatos, ni índice/portada.
- Formatos: 3 en `FORMATS` (`:29-61`): `docx`, `pdf`, `latex`. El `sublabel` y el `ext` de
  `FORMATS` **se usan solo en la línea de identidad** (`:196`), nunca en el botón.
- **`format` es `useState` local** (`:73`): se pierde al salir del paso. `ExportView` es
  su único lector. `FileMenu.tsx:93-102` tiene sus propios dos botones con
  `exportDocx(true)`.
- Fricción re-descubrible: `handleDownloadClick` (`:121-128`) no resetea `friction` a
  `'idle'` en el camino de "Descargar igual" (`:408`), así que el aviso reaparece.
- **No hay panel de ajustes avanzados. No falta solo el botón: falta la UI entera.**

### 2.10 `paragraph_words` y la familia

- Se emite en `python/modules/phase_scope.py:308-315` con el `kind` `"paragraph_words"`.
- En Revisión se ve bien: `auditItems.ts:233` lo mapea a `subtype: 'largo_parrafo'` y
  `useReviewWorkbench.ts:195` a `'Extensión del párrafo'`. Ese camino está cerrado.
- **Dónde se escapa**: `src/store/slices/auditSlice.ts:139-150`, `KIND_LABELS`, una
  **segunda tabla de rótulos** con **10 claves** (first_person, ortografia, ai_phrase,
  pegado, muletilla, ngram_repetition, bloom_vague, bloom_low, repeticion, ambiguedad).
  El backend pasó de ~10 a ~30. Faltan 15 reglas de fase y `ambiguedad` está mal escrita
  (el backend emite `ambigua`, `auditItems.ts:224`), así que también cae al crudo.
- `:152`: `map[f.element_id] = KIND_LABELS[f.kind] || f.kind;`. **Ese `||` escribe el
  `snake_case` crudo en `localStorage['wordapa7_marcas_map']`.**
- Se escribe en cada `runProofreadBatch` (`:154`) y se despacha un `StorageEvent`
  sintético (`:155`).
- Se lee y **se pinta**: `PaperCanvas.tsx:795` (lee el mapa) → `:1850-1864`
  `<ChangeMark label={marcasMap[elem.id]} />`. El chip sobre el párrafo muestra
  `paragraph_words` literal.
- Otros consumidores del mismo mapa: `Step5BodyWizard.tsx:44-48` (escribe),
  `RevisionTab.tsx:103,229` (el interruptor `marcasVisibles`).

### 2.11 Portada

**Selección múltiple indebida.** `CoverEditorPanel.tsx:564-565`:
`isSelected = institution.includes(u.codigo) || institution.includes(u.nombre)`. El estado
"seleccionado" es **derivado por `String.includes` sobre texto libre**, no un estado
controlado. Escribís "Universidad Nacional de Ingeniería (UNI) y UNAN" y **los dos chips
quedan encendidos a la vez**. El clic sobrescribe un solo string (`:570-574`). No hay array
ni multiselección ni logos múltiples; `PortadaModel` no tiene `instituciones: string[]`.
La carrera tiene el mismo patrón (`CARRERAS_PRESETS`, `selected` por `includes` `:631-632`,
`onClick` que **sobrescribe `departamento`** `:640`): elegir un preset de carrera **borra**
la universidad escrita a mano si el nombre no matchea.

**El autor no llega a la portada.** Dos pruebas:
- `python/modules/cover_designer.py:587-602` escribe `institution` como un párrafo
  centrado y luego un párrafo con el **placeholder literal `[LOGOS INSTITUCIONALES]` en
  14pt gris cursiva** (`:599-602`). Ese texto de interfaz viaja al documento final.
- El logo **no está en el modelo**. `portada.institution` es texto; el logo es un
  `<img src>` a un asset del backend. No hay `logo_path`, `logo_width_mm` ni `portada.logos[]`.

**Un solo logo, y el equivocado.** `python/modules/portada_uni.py:292-294`:
`if LOGO_PATH.exists(): run_logo.add_picture(str(LOGO_PATH), width=Cm(5.2))`. Y
`_resolve_logo_path()` (`:31-43`) resuelve **solo `logo_uni.png`**, con candidatos
`meipass/assets/` y `../assets/`. `UNICoverPreview.tsx:80` también apunta solo a
`logo_uni.png`. **Elegís UNAN en la UI y el `.docx` sale con el logo de UNI, en silencio.**
Con `onError` que **esconde el `<img>` entero** (`UNICoverPreview.tsx:83-85`): si falla,
la preview UNI no muestra nada y no lo dice.

Además la URL del preset UNAN es `'/api/assets/logo_anan.png'` (`CoverEditorPanel.tsx:135`)
— con doble `anan` — y `main.py:1009-1026` sirve `logo_unan.png`. **404.**

**La geometría está duplicada a mano.** El `.docx` **no fija tamaño de página**:
`portada_uni.py` y `cover_designer.py` nunca tocan `section.page_width`, `page_height` ni
márgenes. La hoja hereda la del original (o la de `create_template.py:24-27`, tamaño por
defecto de python-docx = Letter). El logo se dibuja con un ancho absoluto `Cm(5.2)`
calculado para un ancho que el generador puede cambiar después.

Y la preview no está a escala: `CoverCarouselStudio.tsx:596,602` usa `width: 680px` con
altura automática; `UNICoverPreview.tsx:73` pone `minHeight: 780px` cuando una carta
real a 680 px de ancho serían 880 px. Fuentes: el `.docx` usa **20pt** (`:299,305,312`) y
**11pt** (`:318`); la preview usa **15/16/14pt** y **12pt** (`UNICoverPreview.tsx:90,95,101,107`).
A 31.5 px/cm, 20 pt son 22.2 px pero la preview pinta 17.8 px: **~20 % más chica**. El
logo: 5.2 cm son 164 px, la preview pone 150 px (`:82`): **9 % más chico**. **Tres
constantes duplicadas, sin un token que las amarre.**

`UNICoverPreview.tsx:11` tiene `const BLACK = '#000000'`, más `rgba(79,124,255,0.14)` (`:30`)
y `'1px solid #000'` (`:115`). La preview de portada **no usa tokens**. `PaperCanvas.tsx:108`
también tiene `toneColor = '#7c3aed'` hardcodeado.

**El carrusel miente.** `CoverCarouselStudio.tsx:67-99`: los 5 `COVER_CARDS` son
**miniaturas esqueleto dibujadas con `div`s** (`:511-573`), no renders del diseño real.
Cuatro de las cinco no tienen componente que las dibuje: `uni` → `UNICoverPreview`,
`apa7`/`pro` → `APACoverEditor`, y **`original` y `custom` → `PaperCanvas onlyCover`**
(`:607`). "Conservar original", que es el recomendado (`:71`), no tiene miniatura propia.
Las miniaturas no se parecen a nada que la app genere y no se actualizan con los datos.

**"Conservar original" pierde el profesor y el grupo.** `use_original_cover: true` deja la
portada original intacta, y con ella la ausencia de autor si el original no lo traía. Hay
que decidir qué pasa: hoy la app no dice nada y el usuario descubre en el `.docx` que
faltan el profesor y el comité.

### 2.12 Proyectos

- **No existe entidad proyecto.** `src/lib/projectUtils.ts:18-61`:
  `parseDocumentVersion` es 100 % heurística de string sobre el nombre de archivo
  (`"Tesis_v2.docx"` → `{projectName: 'Tesis', versionLabel: 'v2'}`). El "proyecto" es el
  prefijo del nombre. `groupTabsByProject` (`:66-76`) existe y **ningún componente lo usa**
  (solo el test).
- `src/store/slices/uiSlice.ts:206`: `projectImages: []` en el slice de UI, sin lectura de
  `localStorage` ni escritura al backend. `:207-211`: `addProjectImage` hace
  `URL.createObjectURL(file)` y guarda el `File` en el store; **el blob URL muere con la
  pestaña y nunca se sube a `/api/assets`**. `:212-214`: `removeProjectImage` filtra sin
  `URL.revokeObjectURL` (fuga de blob).
- `activeFilePath` (`store/types.ts:423`) es `null` por defecto y **no se establece en
  ningún camino de carga**. Por eso el botón "Abrir carpeta"
  (`ProjectFolderModal.tsx:148-173`) **no aparece jamás**.
- Acceso: `ProjectTabs.tsx:190-208`, un popover desde el kebab "⋯". Con 1 documento
  `showStrip` es `false` (`:43`) y la barra entera es el kebab. **Dos clics dentro de un
  kebab sin etiqueta.** Y `ProjectTabs.tsx:47` hace `if (tabs.length === 0) return null`:
  con cero documentos **no hay barra y el Explorador es inalcanzable**.
- Cero llamadas a `api/backend` en `ProjectFolderModal.tsx`. **No hay flush al disco.**
  Ningún endpoint de proyecto en `python/` (grep `proyecto|project` en Python: 0).
- `ProjectFolderModal.tsx:36-38`: el nombre del proyecto sale de
  `parseDocumentVersion(...) || 'Proyecto APA 7'`. **Si no hay pestaña activa, el título
  dice literalmente "Proyecto APA 7"**: un nombre inventado en pantalla.
- `:40-66`: `<input webkitdirectory multiple>` sube **un `.docx` por archivo, en serie**
  (`:55-59`). Abrir una carpeta de 20 capítulos **dispara 20 subidas completas con 20
  auditorías proactivas**, cada una con su `isLoading`: **20 pantallas de carga púrpura
  seguidas**. Y solo avisa del primer archivo como principal sin decirlo.
- `:348`: la rejilla hace `slice(0, 8)`. Las imágenes 9+ existen en el store, no se ven, y
  no hay "ver más". `objectFit: 'cover'` (`:364`) **recorta el logo**.
- `:106` usa `var(--surface-bg, #ffffff)` — **`--surface-bg` no existe**, el fallback tapa
  el defecto. `:268` `'#fff'`. `:93` backdrop `rgba(0, 0, 0, 0.55)` inline donde existe
  `var(--scrim-overlay)`.
- **No hay entrada de Proyecto en el rail.** `railItems.ts:48-53` son las 6 fases del
  editor; `:71-76` las 4 entradas de Inicio. Cero entradas de proyecto. Y `AGENTS.md` §5
  lista `ProjectFolderModal` como módulo principal.

### 2.13 Los tres cables sueltos de LLM

Auditoría completa de los 13 proveedores. El detalle está en la sección de la Fase 8; acá
está el resumen porque define la fase.

1. **`proactive_auditor.refine_with_llm` (`proactive_auditor.py:693-704`) no pasa por el
   router.** Llama directo a `https://integrate.api.nvidia.com/v1/chat/completions` con
   `requests.post` **síncrono dentro de un `async def`** (bloquea el event loop), con el
   modelo **quemado** `"nvidia/nemotron-3-super-120b-a12b"` que ignora
   `NVIDIA_NIM_MODEL`, y su consumidor (`routers/proofread.py:131`) lee
   `os.getenv("NVIDIA_API_KEY")` en vez del request. Consecuencia: un usuario con ZenMux,
   Aion, Kilo, Ollama o HF obtiene **cero refinamiento LLM** en la auditoría que dispara
   al abrir el documento. Es el único motor de ortografía del producto.
2. **Las 9 variables de modelo son un control mudo.** La UI las ofrece, las valida, las
   guarda, y **admite por escrito que no llegan** (`ConexionTab.tsx:275-279`,
   `ConexionProviderField.tsx:18-21`), y un test lo consagra
   (`conexionTab.test.tsx:251`). `main.py:970-984` es un `dict` de **variables de clave**,
   no una allow-list de modelos: no valida ni persiste modelos. Los 4 proveedores con
   modelo quemado (`llm_classifier.py:154,166,178,190`) ni siquiera tienen campo.
3. **`api_key` se inyecta en `nvidia_nim` sin importar de qué proveedor venga**
   (`llm_classifier.py:113`), y **17 de 18 endpoints ignoran `provider_id`** (solo
   `routers/sessions.py:650` lo pasa; `doc_auditor.py:528-529` lo recibe y no lo
   reenvía). Efecto: elegís Groq, mandás la key de Groq como `api_key`, se inyecta en
   NIM, NIM responde 401, cooldown de 600 s (`ai_client.py:295`). **Elegir proveedor en la
   UI no selecciona proveedor: selecciona qué key se le manda al primero de la lista.**

Más: `HUGGINGFACE_API_KEY` **no existe camino** de la UI a `os.environ` (falta en
`backend.ts:341-355`, en `main.py:970-984` y en `ai_keys.py:18-32`). `.env.example`
faltan `GROQ_MODEL`, `ZENMUX_MODEL`, `GEMINI_MODEL`. Y `.env.example:49` recomienda
`meta/llama-3.1-70b-instruct` como "mayor precisión", modelo que el propio repo marca
como retirado (`ai_client.py:23`: "el Llama 3.1 70b murió el 2026-08-26").

---

## 3. La barra de calidad

Invariantes que no se negocian en ninguna de las nueve fases:

1. **Cero emojis.** Solo `lucide-react`, `strokeWidth="var(--icon-stroke)"`.
2. **Cero colores literales** en TS/TSX/CSS. Solo tokens. `noHardcodedColors.test.ts` se
   **extiende** para cubrir los directorios que hoy se escapan, no se relaja.
3. **Ningún texto de interfaz hardcodeado donde el dato es del documento**, y al revés.
4. **Ningún identificador interno visible.** Ni `snake_case` de motor, ni `elem_`, ni
   `[placeholder]`. Un solo archivo de rótulos, derivado, con test que falla si un `kind`
   cae al crudo.
5. **Ningún control sin destino.** Si no llega al backend, se cablea o se borra.
6. **Ningún estado vacío mudo.** Toda vista con estados vacíos tiene su mensaje, y el
   mensaje sobrevive a todas las combinaciones de layout.
7. **Tests que muerden.** Todo subagente hace mutation testing: rompe el código a
   propósito y verifica que el test se cae. Un test que no puede fallar es peor que
   ninguno.
8. **Palabras en español, sin CJK.** Después de cada escritura,
   `Select-String -Pattern '[\u4e00-\u9fff\uac00-\ud7af\ufffd]'`. Incluye comentarios y
   mensajes de commit.

### 3.1 Reglas de prueba que ya cobraron su costo

- `npx vitest` **no** type-chequea: `npx tsc --noEmit` aparte, obligatorio.
- **Leer un fuente en un test — y esta regla se escribió al revés una vez, así que vale
  la pena decir por qué:**
  - **`.ts` / `.tsx`: `?raw`.** `import.meta.glob('/src/**\/*.{ts,tsx}', { query: '?raw',
    import: 'default', eager: true })` funciona y es lo correcto.
  - **`.css`: `?raw` NO sirve.** El runner tiene `css: false`, así que un glob con `*.css`
    devuelve **cadena vacía**. Una cadena vacía matchea cero reglas y `Math.max(...[])`
    da `NaN`, así que la guarda pasaba sin haber leído una línea. Para una hoja: el rodeo
    del **specifier en variable**, `await import(/* @vite-ignore */ 'node:fs')`, que ya
    hacen `designTokens.test.ts` y `noHardcodedColors.test.ts`.
  - **El rodeo funciona por una razón, no por superstición**: con el specifier **literal**
    Vite lo analiza y lo manda por los shims de browser de `nodePolyfills()`, que no
    traen `readFileSync`; en una **variable** no lo analiza y llega el módulo real.
  - **Por qué importa corregirla**: decir "nunca `node:fs`" sin decir "para CSS tampoco
    sirve `?raw`" manda a repetir el rodeo del specifier literal, que es el que ya costó
    tres suites enteras que nunca se colectaban. Una regla a medias es peor que ninguna,
    porque propaga el error con la misma seguridad con la que recomienda el acierto.
- No crear `vitest.config.ts`. Por precedencia pisa la config del repo. Ya pasó.
- PowerShell no sirve para cirugía por índice de array en archivos largos. Editar por
  contenido. Ya destruyó `HomeHero.tsx` una vez y borró `node_modules` otra.
- `git add` explícito archivo por archivo. **Nunca `git add -A`.**

### 3.2 Estado base verificado

| verificación | valor al 2026-09-27 |
|---|---|
| `npx vitest run` | **1024 passed, 0 failed** (87 archivos) |
| `npx tsc --noEmit` | limpio |
| `pytest python/tests/ -q` | **766 passed, 14 skipped** |
| `npm run build` | sin error |
| backend | `https://127.0.0.1:8742`, certificado autofirmado |
| dev server | `http://localhost:5173`, proxy a `https` con `secure: false` |

**Ninguna fase puede bajar de estos números.** Si una debe bajar un test, es porque el
test consignaba el defecto, y eso se explica en el mensaje del commit.

---

## 4. Fase 0 — La verdad del dato (bloqueante de todo)

**Por qué primera**: mientras la UI muestre `paragraph_words` y `[Figura sin rotular]`,
rehacer el layout solo produce una pantalla más bonita con la misma mentira adentro.

### 4.1 Una sola fuente de rótulos

Hoy hay **dos** tablas de rótulos: `SUBTYPE_LABELS` en `useReviewWorkbench.ts:195` (que
funciona) y `KIND_LABELS` en `auditSlice.ts:139-150` (que no). Y el modelo obliga a
inventar texto para elementos que no tienen.

- `originalText` pasa a **opcional**. Cuando no hay texto, el modelo dice que no hay, en
  vez de llevar un placeholder con forma de documento.
- `AuditItem` gana `sinTexto?: { clase: 'figura' | 'tabla' }`. Un hallazgo sobre un
  elemento sin texto se renderiza como un **aviso de estado**, no como un `<pre>` con
  tachado: "Este elemento no tiene texto al que aplicar una corrección."
- `KIND_LABELS` **se borra**. Los rótulos salen de `PROOFREAD_SPECS` +
  `SUBTYPE_LABELS`, con `rotuloDeSubtipo` como única puerta, que ya tiene un `warn` en dev
  (`useReviewWorkbench.ts:461-469`). **Se prohíbe el `|| f.kind`.**
- Cuando un `kind` no tiene rótulo, se muestra **"Regla de estilo"** y en dev se avisa con
  el `kind` completo. Nunca el `snake_case` en pantalla.
- El mapa de marcas de `localStorage` se versiona. Un `wordapa7_marcas_map` de una
  versión vieja no se lee: contiene rótulos viejos y no hay forma de saber cuáles.

**Tests**:
- `KIND_LABELS` no existe (test que falle si alguien lo re-declara).
- Los 30 `kind` de `phase_scope.py` tienen rótulo legible: test que itere `RULE_SCOPES` y
  afirma que ninguno cae al crudo.
- `marcasMap` nunca puede contener un valor con `_` en minúsculas.
- `FindingDetail` con un hallazgo sin texto: no hay `<pre>`, hay el aviso. Y el texto de
  `EngineGroupCard` no lleva `line-through` sobre nada.
- `findingRack.test.tsx:433` se actualiza y el mensaje de commit explica que el test
  consignaba el defecto.

**Fuera de alcance**: cambiar los textos de los rótulos que ya están bien.

---

## 5. Fase 1 — Verdad de pantalla

**Por qué segunda**: los tokens, el overlay y los empty states son la base sobre la que se
sentarán las fases 2, 3, 4 y 5. Arreglarlos después significa retocarlos dos veces.

### 5.1 El overlay de carga

- `LoadingTips` deja de ser un `position: fixed` a pantalla completa con `zIndex: 9999`
  inline. Pasa a ser una capa con nombre de clase, `z-index` de la escala del proyecto, y
  **respeta el rail y el workbench**: la app no desaparece detrás de un lienzo.
- La paleta horaria **deja de existir**. El fondo del overlay es un token. Si se quiere la
  variación por hora, es un token por hora en `design-system.css`, en los dos temas, no
  hex en un `.tsx`.
- El comentario de `:353` que justifica los hex **se borra**: era el error, no la
  explicación.
- `MIN_DISPLAY_MS = 3500` se reduce o se condiciona: 3.5 s de pantalla fija por una tarea
  de 200 ms es la razón por la que se ve tanto.
- **El disparador se unifica**: `isLoading` global y `isScanning` local se reconcilian, y
  el overlay muestra **qué** está pasando ("Escaneando el documento", "Subiendo
  `capítulo-3.docx` (3 de 20)"). Con `ProjectFolderModal.tsx:55-59` subiendo 20 archivos en
  serie, esto por sí solo evita 20 pantallas de morado.

### 5.2 Tokens que existen

- `--accent-soft` → se **renombra** al que ya existe (`--color-accent-soft`, alias
  `--word-blue-light`) y se arreglan los 2 usos. No se declara un cuarto nombre.
- `--surface-bg` → `--color-bg-surface`; `--surface-alt` → `--color-bg-surface-subtle`.
  Los 5 usos, con fallback.
- `R3` de `noHardcodedColors.test.ts` **se extiende** a `components/auditor`,
  `components/project`, `components/layout`, `components/upload`, `components/wizard`,
  `components/inspector`, `components/export`. Más una **regla nueva**: todo
  `var(--x)` sin fallback que aparece en `src/**` tiene que estar declarado en
  `design-system.css`. Esa regla sola habría cazado los tres tokens fantasma y el
  `paragraph_words` si el mapa fuera un token.
- Los literales sueltos de `Step3FiguresTablesWizard.tsx:272-273,389,459,465` y de
  `ProjectFolderModal.tsx:93,268` pasan a token.
- `PaperCanvas.tsx:1842-1844`: el overlay de carga con `rgba(255,255,255,0.7)` y
  `:108` con `toneColor = '#7c3aed'` pasan a token.

### 5.3 Empty states que sobreviven al layout

- Un componente único, `EstadoVacio`, con variantes por contexto: sin documento, sin
  motor corrido, sin resultados para el filtro, sin selección. Un solo lugar donde vive
  esa forma.
- Se monta **fuera** de cualquier panel que se pueda ocultar. El de "sin hallazgos" no
  puede vivir dentro del rack, porque el rack desaparece bajo 1180 px.
- `FocusReadingCard.tsx:118`: el texto deja de decir "panel de la derecha" cuando puede no
  haber panel. Dice la acción disponible, no la posición.
- `FocusReadingCard.tsx:52-53`: sin selección, `pagina` y `seccion` no son strings
  inventados: el componente no renderiza la línea de contexto.

### 5.4 El minimapa de 19 px

Decisión: **se conserva la función, se reconstruye la presentación.** El rail de 56 px y
su flyout viven siempre (`AGENTS.md` §1), y el minimapa es información útil. Lo que se
mata es la columna de 19 px con cuadrados de 4 px sin leyenda.

- Pasa a ser una **columna de páginas con etiqueta**: 44 px, cada página con su número, y
  el color del motor dominante con su **nombre al hover y en el `aria-label`**.
- Altura mínima de 6 px, y en tema claro los niveles bajos usan un token con contraste
  suficiente, no `--border-subtle`.
- Los tokens pasan a los canónicos `--color-*` (hoy usa los alias legacy
  `--sidebar-bg`, `--text-secondary`, `--border-subtle`, `--accent-primary`).
- Si la ventana es demasiado angosta para 44 px, **desaparece**, y su función queda en el
  flyout del rail. No queda una columna ilegible.
- `ReviewMinimap.tsx` sale de `components/wizard/` a `components/review/`: está en el
  alcance del lint y ya no es unAccidente de ubicación.

**Tests**:
- Con cero hallazgos se ve el mensaje, **también** con la ventana angosta (simular
  anchura y comprobar que el texto existe en el árbol).
- Ningún `var(--x)` sin declarar en los seis directorios nuevos.
- El overlay de carga no tiene `position: fixed` inline ni `zIndex` inline.

---

## 6. Fase 2 — Portada

Es la fase más delicada y la que más le preocupa al usuario. Se hace **después** de 0 y 1
porque depende de que los tokens y la geometría de página ya estén limpios.

### 6.1 La contradicción que hay que decidir

`AGENTS.md` §1: la portada original **jamás** se altera. El usuario ahora pide que
"Conservar original" deje de perder al profesor y el grupo. Son cosas distintas y hay que
separarlas:

- **La portada original es un bloque indivisible**: no se le reescribe ni se le reformatea
  nada. Eso no se toca.
- **Los datos del acta** (autor, profesor asesor, comité, fecha) son **metadatos del
  documento**, no de la portada. Hoy viven en `portada` y se pierden si la portada es la
  original. La solución es sacarlos de `portada` y ponerlos en `DocumentMeta`, y que el
  `.docx` los escriba en el lugar que corresponda **según el modo**, sin pisar la portada
  original.

Eso es lo que arregla "perdía el profesor y grupo" **sin romper la protección de la
portada**. Si se rompe la protección, la promesa de `AGENTS.md` es falsa y eso no se toca.

### 6.2 Geometría única

El defecto real de "sale todo super achicado y sin sentido" no es un margen: es que **la
preview y el `.docx` no tienen una fuente de geometría común**. Hay tres constantes
duplicadas a mano y ninguna las amarra.

- Un módulo único, `portada/geometria.ts`, con la geometría de la hoja en milímetros y
  una función `escalaDePreview(anchoPx)` **derivada** de la medida real, no elegida a ojo.
- La preview calcula cada tamaño con esa función. Ningún `fontSize` en px o pt escrito a
  mano en `UNICoverPreview.tsx`.
- `portada_uni.py` deja de usar anchos absolutos a ojo: el logo se dimensiona **en
  fracción del ancho útil de la hoja**, que es lo que lo hace correcto en Carta y en A4.
- `portada_uni.py` y `cover_designer.py` **dejan de heredar la hoja del original**:
  aplican `section.page_width`/`page_height` desde `APARuleSet.page_size`, que ya existe
  desde la fase de Ajustes. Hoy nadie lo toca en portada, y por eso el diseño "no es
  tamaño definido".

> **Decisión del usuario, 2026-09-28. Resuelve el supuesto 4 y por eso el supuesto deja de
> existir.** El tamaño de página es **propiedad del documento**, no del contenido
> protegido. El bloque protegido es el texto, las imágenes y el formato tipográfico de la
> portada original. `section.page_width` y `section.page_height` son propiedades de la
> **sección** del documento: el contexto que rodea la portada, no la portada.
>
> Aplicarlas no altera ni un carácter del bloque protegido. Si el original viene en A4 y
> el usuario configuró Carta en Ajustes, el `.docx` sale Carta en todo el cuerpo y la
> portada conserva su texto, sus imágenes y su tipografía intactos.
>
> La Fase 2 **asume que aplica el tamaño de página sin partirse en dos.** El test de
> `§6.4` que compara el hash del bloque de portada antes y después es la prueba de que
> esto no rompió la protección.

- `UNICoverPreview.tsx:11` (`BLACK = '#000000'`), `:30`, `:115` salen a token.

### 6.3 Logos: varios, sin romper UNI

El usuario pidió explícitamente que no sea solo uno, y que la portada UNI no se rompa. Las
dos cosas, en este orden:

- **El modelo gana `portada.logos: LogoPortada[]`**, con `LogoPortada = { asset, ancho_mm,
  institucion }`. `asset` referencia un archivo de `python/assets/logos/`, no una URL
  hardcodeada en el `.tsx`. Cada preset trae su logo como dato.
- **La selección de institución pasa a estado controlado, no derivada por `includes`.**
  Un `<select>` o un radio group con un solo valor. Los chips de `CoverEditorPanel.tsx:564`
  salen: son la causa exacta del fallo grave de las dos universidades encendidas. El test
  del fallo: con dos clicks en dos presets, exactamente uno queda activo, y
  `institution` es exactamente el nombre del último.
- **Cada logo se dimensiona en fracción del ancho útil.** El `Cm(5.2)` absoluto de
  `portada_uni.py:294` se calcula desde la geometría de 6.2. Así "el logo está
  microscópico" se resuelve por construcción, no por un número más grande.
- **`_resolve_logo_path` resuelve por el asset que pide el documento, no por un nombre
  fijo.** Hoy es `_resolve_logo_path()` sin argumento (`:31-43`) y siempre termina en
  `logo_uni.png`. Con `portada.logos` el argumento es el asset. La portada UNI **sigue
  funcionando exactamente igual**: mismo asset, mismo resultado.
- **El 404 de UNAN se arregla**: `CoverEditorPanel.tsx:135` pide `logo_anan.png` y
  `main.py:1009-1026` sirve `logo_unan.png`. Y `UNICoverPreview.tsx:80` apunta solo a
  `logo_uni.png`.
- **`onError` deja de esconder el `<img>`**: cae al placeholder y, si el logo fue
  pedido y no llegó, la UI lo dice. Un logo que no carga es un dato faltante, no un
  detalle de render.
- La rejilla de `ProjectFolderModal.tsx:348,364`: `slice(0, 8)` sin "ver más", y
  `objectFit: 'cover'` **recorta el logo**. `cover` sobre un logo vertical lo deja en una
  banda. Pasa a `contain` con fondo, y las que no entran se ven o se dice cuántas hay.

### 6.4 El carrusel

Decisión tomada por el usuario: **carrusel arriba, hoja de datos al elegir**. Y la vista
previa es lo único que se ve de la portada.

- **El carrusel es el selector de estilo**, y cada tarjeta **renderiza el diseño real**.
  Hoy las 5 son esqueletos con `div` (`:511-573`) y dos de ellas no tienen ni componente
  (`original` y `custom` caen a `PaperCanvas onlyCover`, `:607`). La miniatura es el
  diseño renderizado a la escala de 6.2, con los datos de la portada reales. Si una
  miniatura no se parece a lo que sale, es porque el diseño está mal, y ahora se ve.
- **Controles de izquierda y derecha** explícitos, con teclado, con `aria`, y con
  posición: la miniatura activa es la que se está editando.
- **Animación con perspectiva.** Un desplazamiento lateral con `perspective` y
  `rotateY` en las tarjetas vecinas, dos o tres por lado según el ancho. Se respeta
  `prefers-reduced-motion: reduce`: sin transform, sin transición, el carrusel se
  convierte en un strip horizontal con scroll.
- **La hoja de datos entra al elegir un estilo** y trae **solo** los datos: autor,
  título, asignatura, institución, carrera, profesor asesor, comité, fecha, idioma. Sin
  estilos ahí, sin duplicar lo que ya está en el formulario superior, y sin el panel que
  hoy repite la misma información dos veces.
- Se cierra sola al cambiar de fase. Y **al volver de otra etapa, la portada se vuelve a
  mostrar**: hoy `wizardStep` no recuerda que estabas en la 1, y el usuario reportó
  exactamente eso.

**Tests**:
- El carrusel renderiza el diseño real, no un esqueleto: la miniatura de `original`
  contiene el mismo árbol de nodos que el lienzo cuando el original está activo.
- Elegir dos instituciones deja **exactamente una** activa. Este es el test del fallo
  grave.
- Con dos logos, los dos llegan al `.docx` y los dos miden su fracción del ancho útil.
- Con `original` activo, autor y profesor asesor siguen llegando al `.docx` y la portada
  original queda **byte a byte igual**: test que compara el hash del bloque de portada antes
  y después.
- Al salir a la etapa 3 y volver, `wizardStep` es 1.

---

## 7. Fase 3 — Estructura: el escritorio de redacción

Propuesta del usuario, ajustada por la discusión: **no quiero ver el documento en esta
etapa. Quiero saber si el armazón aguanta.**

Hoy el centro es el documento vomitado y la estructura es un aside que aparece al pasar el
mouse. Al revés.

### 7.1 El índice como documento de trabajo

El eje es la jerarquía real H1/H2/H3. Cada nodo trae:

- **Palabras** que cuelgan de él, y **balance comparativo**: una barra que pone en la misma
  escala todos los capítulos hermanos. 40 capítulos donde uno tiene 12.000 palabras y tres
  tienen 80 es un problema que se ve en el índice y en ningún otro lado. Hoy no se ve en
  ninguna parte.
- **Figuras, tablas y citas** que cuelgan de él.
- **Su estado de salud**, derivado de las reglas que el backend ya calcula:
  `completa` / `en duda` / `desbalanceada` / `sin contenido`. Cada estado es un motivo
  dicho en palabras, no un color suelto.

### 7.2 Qué le falta a APA 7

Esto **ya se calcula y se tira**. `python/modules/phase_scope.py` sabe qué fases son
obligatorias y `match_phase_exact` distingue un H2 mal nivelado ("Resultados" a secas, que
es una fase mal puesta) de uno que el autor puso a propósito ("Resultados de la
encuesta", que lleva calificador y hay que dejarlo quieto). Eso es exactamente la
distinción que un redactor necesita y que hoy nadie ve.

- **Fases obligatorias que faltan**: la lista de secciones que APA 7 exige y el documento
  no tiene.
- **H2 mal nivelado**: un H2 que dice "Resultados" a secas se promueve a H1; "Resultados de la
  encuesta" se deja quieto, y la UI **explica por qué** no lo tocó.
- **H1 en el ámbito equivocado**: un H1 que abre un ámbito que no le corresponde, con el
  motivo.

**Ninguna de estas reglas decide el ámbito buscando palabras en el cuerpo de un párrafo**
(`AGENTS.md` §1). Todas comparan contra el título de un H1, por `match_phase`. Un H2
hereda el ámbito de su H1 ancestro y no abre ámbito propio.

### 7.3 El pulso del documento

Cinco números arriba y nada más: palabras totales, balance, secciones APA que faltan,
figuras sin leyenda, referencias citadas que no aparecen en el texto. Es lo que un redactor
mira primero y hoy no existe en ninguna parte.

### 7.4 Al elegir un nodo, qué hay adentro y qué se puede hacer SOLO ahí

Los párrafos de esa rama, las figuras que tiene asignadas, las citas que salen de ahí, y
**acciones con alcance de rama**:

- promover H2 a H1, o H1 a H2
- reordenar la rama
- pedirle a la IA qué debería ir en esa sección
- renombrar la sección

Cada acción dice **a qué alcance aplica**: "esta rama" / "todo el documento". Sin eso, un
botón de "reordenar" en un índice jerárquico es una amenaza.

### 7.5 El mapa

**Cero mapa flotante**, como pidió el usuario. Si hace falta ver la forma, es un toggle
dentro de la vista de índice, no una capa encima. Y si se construye:

- **Dibujo a mano en SVG.** Cero librería nueva. `dagre`/`reactflow` serían 300 kB para un
  grafo de 40 nodos que además nadie va a leer en 3D.
- **Nodos con etiqueta, siempre.** El bug actual del mosaico es que el nombre solo está en
  el hover (`:156-163`). **Ningún nodo de este proyecto vuelve a tener su nombre fuera de
  pantalla.**
- **`AiMosaic` se arregla aunque cambie la pantalla**: `faseDeTitulo` deja de hacer match
  exacto y cae a `AuditItem.phase`, que el backend ya calculó. Los H1 numerados dejan de
  caer a "Seccion sin nombre". Y la rampa monocroma roja se rediseña: cuatro tonos de una
  misma tinta leen como intensidad, no como alarma.

El documento entero pasa a un **toggle "ver documento"**. Nunca es el centro.

---

## 8. Fase 4 — Figuras, tablas e inspector

El usuario quiere que **las figuras sean el eje central**, con controles de diseño y
previsualización, y que cada figura se vea **con su contexto**: un párrafo antes y en qué
H1/H2 está.

### 8.1 El eje

Hoy: rail de 280 px a la izquierda, documento a la derecha, y cada clic abre una cuarta
columna. El eje es el documento, que es lo que ya se puede ver en el paso 5.

Invertido: **las figuras son el eje**, el documento es la referencia, y el rail desaparece
o se vuelve un índice compacto.

- **Lista de figuras y tablas con contexto obligatorio** por elemento: miniatura real con
  el tamaño que va a tener (`width_cm × height_cm`, no el default inventado de
  `ImageEditPanel.tsx:137-138`), su leyenda actual o la ausencia de leyenda **dicha**,
  **el párrafo anterior**, y **el H1/H2** al que pertenece. Ese bloque es lo que responde
  "¿esta figura tiene contexto o está perdida en el mar?".
- **El buscador busca también por sección**, no solo por `Figura N` y `caption`
  (`:76-87`). La sección ya está calculada en `sectionMap`.
- **`sectionMap` se indexa por posición, no por `element.id`.** Los ids son `elem_N`, un
  índice posicional (`:164-170`): insertar un párrafo arriba en Word corre todos los ids de
  abajo y `sectionMap` pisa. Es el mismo bug del diff por `element_id` que ya se corrigió
  en el motor de refresco.
- **La miniatura cae al placeholder en `onError`** (`:399` en vez de `visibility: hidden`),
  y las tablas **muestran sus datos**, no un `<Table size={18}/>`.

### 8.2 Controles de diseño y previsualización

- Un **inspector de figura** con: tamaño real en cm, alineación, posición respecto al
  texto, y **aplicar a todas / aplicar a esta**. El "aplicar a todas" es lo que el usuario
  pidió y lo que hoy no existe: hoy cada figura se edita una por una.
- La previsualización **usa la geometría de la Fase 2**: el tamaño que se ve es el tamaño
  que sale, en la misma escala de la portada.
- Una de las fooled: `ProjectFolderModal` sube 20 `.docx` en serie (`:55-59`). Si el
  proyecto se arregla (Fase 7) y se suben juntos, esta pantalla recibe 20 figuras de golpe.
  El diseño tiene que aguantar eso o el arreglo de la Fase 7 lo rompe.

### 8.3 El Inspector

Hoy te saca de donde estás y no hay vuelta atrás. Dos opciones, y se elige una:

- **(a) Se reescribe como el inspector de figura de 8.2**, vive en la pantalla de figuras
  con el alcance claro, y `Abrir panel de edición` **navega** en vez de reemplazar.
- **(b) Se borra** y sus tres piezas vivas (`SuggestCaptionButton`,
  `ProactiveSuggestionCard`, la puerta a `portada_block`) se mudan a donde corresponde.

Recomendación: **(a)**, porque `SuggestCaptionButton` funciona y es valioso. Pero (b) es
honesta si no hay tiempo.

Lo que se hace sí o sí:

- `Abrir panel de edición` **navega**, y hay un **"volver al inspector"**.
- Se borra el código muerto: `APARuleSet` importado y sin usar (`:7`), `portada` y
  `setPortada` desestructurados y sin usar (`:88`), `TabId` con `'style'` y `'advanced'`
  que no existen (`:85`).
- Se **deja de escribir en el store en cada tecla**: el `onChange` del `<textarea>`
  (`:271-274`) dispara un fetch por pulsación a través de
  `ProactiveSuggestionCard.tsx:37-62`. Se hace al perder el foco o con debounce.
- El Inspector se monta **donde tiene sentido**: hoy no existe en Referencias, Revisión ni
  Exportar (`App.tsx:699`). Si se queda en el panel derecho, se decide si también aparece
  en Revisión, porque un hallazgo de Revisión puede ser una figura.

### 8.4 El tapado

`flexShrink: 0` sin `maxHeight` en el header del rail (`:180-321`), y `minWidth: 0`
faltante en `:445`. Con el eje invertido el rail viejo deja de existir, pero el layout nuevo
**no repite el error**: todo contenedor con scroll tiene `min-height: 0` y `min-width: 0`,
y ningún header tiene `flexShrink: 0` sin `maxHeight`.

**Test de layout**: con una ventana de 700 px de alto, la lista de figuras es
**scrolleable y no de 0 px**. Es un test de caja, no de DOM.

---

## 9. Fase 5 — Referencias

Migrar `Step5ReferencesWizard.tsx` (926 líneas) al criterio de diseño nuevo. No es un
rediseño: es **dejar de ser de la generación anterior**.

- Pasa por `Seccion` (`tabs/word/Seccion.tsx`), el molde que usan Conexión, Formato,
  Documento y Revisión.
- Los diez tamaños de fuente literales pasan a `var(--text-xs|sm|base)`.
- Los cuatro `rgba(0,0,0,…)` pasan a token. `var(--paper-ink, #000)` (`:562`) pierde el
  fallback, que hoy **tapa** el token roto.
- `'4px'` literal (`:375`) pasa a `--radius-*`. `.btn .btn-primary .btn-sm` pasa al
  patrón de botón del proyecto.
- El archivo sale de `components/wizard/` a `components/referencias/`, que **ya está en
  el alcance de R3**, y por lo tanto entra en el lint.
- Una **mascota** con la cara del estado real, como las otras cuatro pestañas de Ajustes.
- Los tres empty states sueltos (`:315-317`, `:408-410`, `:471-473`) pasan a `EstadoVacio`
  de la Fase 1.
- `isZombie` (`:84-89`) deja de clasificar por heurística de texto y verifica si la
  referencia resuelve de verdad. `isOrphan` (`:321-324`) deja de hacer
  `s.includes(authors?.[0] || '---')`, que con `'---'` matchea cualquier cosa.

**Tests**:
- R3 cubre el archivo nuevo. Los cuatro rgba que pasaban impunes ahora no pueden volver.
- `isZombie` no puede ser certain por longitud de título.
- Con una referencia sin autores, `isOrphan` es `false` y no hay excepción.

---

## 10. Fase 6 — Exportar: el panel que no existe

> ### Trabajo de otra sesion, ya commiteado, que la Fase 6 tiene que terminar
>
> While this spec was being written, another session added a **write-back** to Word:
> `POST /api/send-to-word/{session_id}` (`python/main.py`) plus a button in `ExportView`
> that calls it with `activeFilePath` and overwrites the user's original `.docx`.
> Commits `a71c1bf` and `f7caf15`. **Approved by the user.** It is in the tree, it works,
> and the user wants it.
>
> It is also **the most destructive thing in the app**, and now it is one click away.
> Three things are missing, and they are not improvements, they are the difference
> between a feature and an accident:
>
> 1. **There is no backup.** `shutil.copy2` overwrites the original and leaves no `.bak`.
>    The first principle of the product (`PRODUCT.md`) is *"no romper jamás el trabajo
>    del estudiante"*, and this button can destroy it with no way back except the user's
>    own recollection that they have a copy. **That is not a way back.**
> 2. **`Close(SaveChanges=0)` discards unsaved work.** The `0` exists in `word_com.py` to
>    close the app, which is a different thing. Here there is an open document with the
>    student's unsaved edits: they type a paragraph in Word, press the button, and the
>    paragraph is gone. **The endpoint has to ask, or save first.**
> 3. **Zero tests.** The five tests that arrived with the sibling change
>    (`hash_de_imagenes`) are for the image diff, not for this endpoint.
>
> **These three are a mandatory Task 6.0, before the panel of advanced settings.** Not
> as polish: a destructive operation with no undo and no tests is not finished, and the
> rest of this phase is about the export surface being honest with the user.

`ExportView` es la mejor pantalla de la app y el usuario lo dice. Solo le falta el panel.
Y el panel no existe: lo que hay es un link terciario que revela un checkbox.

- **El toggle deja de ser un link sin icono** (`:262-273`) y pasa a ser un botón con icono
  `lucide`, con la misma jerarquía que "Volver a editar".
- **El panel de ajustes avanzados se diseña y se construye.** No es un `checkbox` más:
  - **Qué se incluye**: portada, índice, figuras y tablas, referencias, apéndices. Con
    switches que dicen qué pasa si se apagan, no solo qué se activa.
  - **La hoja**: tamaño (que ya existe en Ajustes y se hereda), márgenes, orientación.
  - **La tipografía**: cuerpo, títulos, interlineado — **derivados de `FormatoTab`**, que
    ya tiene 31 controles en 7 secciones (Fase 4 de Ajustes). Si Formato tiene un control,
    aquí se lee, no se duplica.
  - **El idioma**, que se agregó en la fase de Ajustes y nunca llegó a la vista de
    exportación.
  - **Marcas de control de cambios** (lo único que existe hoy, `:357-384`).
  - **Nombre de archivo y metadatos**, que hoy no se pueden tocar antes de exportar.
- **`format` sube al store** (`:73`). Hoy es `useState` local y se pierde al salir del
  paso, y `FileMenu.tsx:93-102` tiene sus propios dos botones. Con `format` en el store,
  el Formato elegido se ve igual desde el menú y desde la vista, que es el mismo problema
  del rail que se resolvió en la fase de Ajustes.
- **La fricción de citas fantasma se resetea** (`:121-128`): "Descargar igual" deja el
  aviso puesto y reaparece al siguiente clic. Solo "Ocultar" lo resetea.
- El `sublabel` y el `ext` de `FORMATS` (`:29-61`), que hoy solo se usan en la línea de
  identidad (`:196`), se usan **en el botón**. Un formato que no dice su extensión es un
  formato del que hay que acordarse.

**Tests**:
- El panel existe y el botón lo abre. Antes: el test falla, porque el panel no existe.
- Con Ajustes > Formato cambiado, Exportar muestra el mismo valor. Un solo origen.
- Salir del paso y volver conserva el formato elegido.
- "Descargar igual" una vez no vuelve a mostrar el aviso en el siguiente clic.

---

## 11. Fase 7 — Proyectos: entidad real

Decisión del usuario: **entidad real + entrada en el rail**. La alternativa — degradarlo a
"versiones del documento" — era más chica pero dejaba el chrome mintiendo.

- **Modelo `Proyecto` de verdad**: `id`, `nombre`, `raiz` (carpeta en disco), `documentos`,
  `figuras`, `creado`. No un prefijo del nombre de archivo.
- **Persistencia**: una entrada en la base de sesión con su raíz, y una acción de
  **"sincronizar con la carpeta"** que relee el disco. Hoy `ProjectFolderModal.tsx` tiene
  **cero llamadas a `api/backend`**: no hay flush, no hay nada.
- **Las imágenes se suben a disco.** `addProjectImage` (`uiSlice.ts:207-211`) guarda un
  `File` en el store y hace un `URL.createObjectURL`: el blob **muere con la pestaña**.
  Pasa a subir a `/api/assets`, con `URL.revokeObjectURL` en `removeProjectImage` (que
  hoy no lo hace y **fuga memoria**).
- **Entrada en el rail.** Cero entradas de proyecto hoy (`railItems.ts:48-53,71-76`), y
  `AGENTS.md` §5 lo lista como módulo principal. Se suma como un destino más, con su
  conteo de pendientes derivado de la misma lista que usa el resto del rail
  (`lib/railPending.ts`), nunca de un conteo local.
- **`ProjectTabs.tsx:47` deja de esconder el Explorador** cuando no hay documentos. Hoy
  `if (tabs.length === 0) return null` lo vuelve inalcanzable, y con un solo documento
  la barra entera es un kebab "⋯" sin etiqueta.
- **La subida en serie se termina.** `:55-59` sube un `.docx` por archivo, en serie, con
  una auditoría completa por archivo. Con el proyecto existiendo, una carpeta de 20
  capítulos es **una** operación con progreso, no 20. Y la Fase 1 ya puso el overlay a
  decir "Subiendo (3 de 20)".
- **`activeFilePath` se establece en el camino de carga**, así que "Abrir carpeta"
  (`:148-173`) aparece. Hoy **no aparece nunca** y nadie lo notó.
- **El título deja de inventarse**: `:36-38` cae a `'Proyecto APA 7'`. Sin proyecto
  seleccionado, el chrome **no se monta**; no hay un nombre inventado en pantalla.
- `slice(0, 8)` sin "ver más" (`:348`) y `objectFit: 'cover'` que **recorta el logo**
  (`:364`): con el proyecto existiendo, todas las imágenes se ven.

**Tests**:
- Un proyecto sobrevive cerrar y reabrir la app.
- Cerrar y reabrir con imágenes en el proyecto: las imágenes **están**. Antes del cambio,
  el blob URL está muerto y el test falla.
- Con cero documentos, el Explorador es alcanzable desde el rail.
- `activeFilePath` no es `null` después de cargar un documento, y "Abrir carpeta" existe.
- Una carpeta de 20 `.docx` produce **una** operación de carga, no 20.

---

## 12. Fase 8 — Los tres cables de LLM

El usuario lo pidió explícitamente: **revisar que todas las LLM estén implementadas
correctamente y saldrán al testear o instalar**. El detalle de los 13 proveedores está en
`2.13`; acá el diseño.

### 12.1 El cable suelto que duele

`proactive_auditor.refine_with_llm` (`proactive_auditor.py:693-704`) llama directo a NIM
con `requests.post` **síncrono dentro de un `async def`**, con el modelo quemado,
ignorando `NVIDIA_NIM_MODEL`, y su consumidor lee `os.getenv("NVIDIA_API_KEY")` en vez del
request. Es el **único motor de ortografía del producto** y el único que no pasa por el
router.

- Pasa por `execute_with_specialty`, como los otros dieciocho.
- El `api_key` se toma del request, no del entorno.
- El `requests.post` síncrono se va: es una llamada de red bloqueando el event loop del
  backend entero.
- **Sin esto, un usuario con ZenMux, Aion, Kilo, Ollama o HF — los cinco que el repo
  declara vivos — tiene cero refinamiento de ortografía.** Y con key de NVIDIA pega a un
  modelo que el repo mismo marca como muerto (410).

`test_proactive_auditor.py:104` ya cubre el passthrough sin key. Se extiende a los cinco
proveedores.

### 12.2 Los nueve modelos mudos

La UI ofrece nueve variables de modelo, las valida, las guarda, y **admite por escrito
que no llegan**. Un test lo consagra como contrato (`conexionTab.test.tsx:251`). Eso es
un control decorativo con la etiqueta de uno funcional.

- `main.py:970-984` pasa de un `dict` de variables de **clave** a aceptar también las
  **nueve de modelo**, validando contra el catálogo.
- `PROVIDER_ENV_VARS` (`ai_keys.py:18-32`) suma las nueve.
- `llm_classifier.py` pasa a leer las cuatro que hoy están **quemadas**
  (`:154,166,178,190`) con default, y esas cuatro ganan campo en la UI.
- `ConexionTab.tsx:275-279` y `ConexionProviderField.tsx:18-21` **dejan de decir que no
  llegan**, y `conexionTab.test.tsx:251` se reescribe para afirmar lo contrario.
- `.env.example` suma `GROQ_MODEL`, `ZENMUX_MODEL`, `GEMINI_MODEL`, y **deja de recomendar
  `meta/llama-3.1-70b-instruct`** como "mayor precisión" (`ai_client.py:23` dice que murió
  el 2026-08-26).

> **Aclaración del usuario, 2026-09-28: la Fase 8 se cablea, no se borra.** Y hay que
> separar dos cosas que el borrador mezclaba.
>
> **La redacción anterior era ambigua y estaba mal.** "Si alguno de los nueve no llegara,
> se borra de la UI" sonaba a plan de borrado, y no lo es: es un **fusible**, no una
> alternativa al cableado. El plan **se compromete a cablear los nueve**. La cláusula
> existe para una sola cosa: que si al verificar la Fase 8 uno de los nueve no llega, eso
> es un **test rojo que impide dar la fase por terminada**, no una tarea de borrar campos.
>
> **Y no es un breaking change, porque la premisa no se cumple.** El usuario pidió
> confirmar esto, y la evidencia dice lo contrario: esas nueve variables **nunca
> persistieron desde la UI**. `main.py:970-984` es un `dict` de variables de **clave**: los
> modelos no entran por ahí, y el `localStorage` de la UI solo los guarda a nombre propio
> (`proveedoresIA.ts:117`). Un usuario con key de Groq **tiene la key, no el modelo**. Lo
> único que sobrevive hoy es lo que alguien puso a mano en un `.env` de desarrollo, y eso
> `llm_classifier` **sigue leyendo después de la Fase 8**: la variable no se deja de leer,
> se deja de poder cambiar de un sitio que miente.
>
> O sea: nadie pierde nada, y el campo pasa de decorativo a funcional. Lo que sí cambia es
> que la UI deja de decir "el motor todavía no los recibe" y pasa a poder decirlo.

### 12.3 `provider_id` en los diecisiete

> **Corrección, 2026-10-04 (motor anti-ban).** Se migró el motor de visión,
> `visual_auditor.audit_pdf_with_multimodal_llm`, que hacía HTTP directo a
> NVIDIA y por eso evadía el rate limiting. Ahora pasa por
> `execute_with_specialty` con la imagen como bloque multimodal. El inventario
> sube a **19 llamadas, 18 endpoints**: el motor de visión cuenta como los
> demás aunque hoy no tenga llamadores (igual que `check_spelling_with_ia`).
>
> **Corrección, 2026-09-29 (F8).** Este apartado decía **dieciocho** y está
> mal. El número real, verificado greppeando `execute_with_specialty` en `python/`:
> **18 llamadas, 17 endpoints**. La decimoctava es `execute_with_fallback`
> (`ai_client.py:441`), que es el MISMO router con otro nombre —reenvía
> `*args, **kwargs`— contando el router llamándose a sí mismo. Una llamada más,
> `check_spelling_with_ia` (`spelling_validator.py:78`), es un motor LLM sin
> ningún llamador: existe, llama al router, y no lo llama nadie. No se cuenta
> como endpoint porque no hay superficie que la alcance.
> El inventario se construye por código en `python/tests/test_provider_id.py`, y
> una prueba afirma que el número no se reescriba para que pase.

`api_key` se inyectaba en `nvidia_nim` sin importar de qué proveedor venga
(`llm_classifier.py:113`), y **16 de 17 endpoints ignoran `provider_id`**. Elegir Groq
manda la key de Groq a NIM, NIM responde 401, cooldown de 600 s. Y no solo eso: la
clave del request **no llegaba a ningún proveedor** salvo NVIDIA, así que elegir
Groq y tener la key de Groq puesta en la UI no bastaba: el backend necesita su
propia variable de entorno, y esa es la razón de que ahora `custom_key` no se
inyecte en ninguna entrada.

- `api_key` se resuelve **por proveedor** en `_get_active_providers`, no se inyecta en
  el primero. Un proveedor que pide una clave y no la tiene **no entra en la cola**,
  en vez de entrar a disparar un 401 y un cooldown.
- El `provider_id` viaja a los diecisiete endpoints. `doc_auditor.py:528-529` lo recibía
  y no lo reenviaba: se arregla.
- La UI **deja de fingir** que elegir proveedor selecciona proveedor, hasta que sea
  cierto. Hoy hace exactamente eso.

### 12.4 HuggingFace y la instalación limpia

- `HUGGINGFACE_API_KEY` se suma a `backend.ts:341-355`, a `main.py:970-984` y a
  `ai_keys.py:18-32`. **Hoy no tiene camino de la UI a `os.environ`**: la UI muestra el
  campo, acepta la clave y la key se cae en el renderer.
- `electron-builder.yml` no empaqueta `.env` ni `python/`. El instalador no escribe un
  `.env`. El orden real en producción es `process.env` de Windows >
  `ai_keys.json` de la UI > payload embebido (`main.py:29-47`), y el payload embebido usa
  XOR con **la semilla en el código** (`embedded_secrets.py:27`), que es ofuscación, no
  cifrado, y el propio módulo lo dice (`:8-13`). Eso se documenta o se saca: hoy es una
  promesa de seguridad que no es una.
- **Instalación limpia sin ninguna clave tiene que seguir degrading sin romper**:
  `llm_classifier.py:365-374` y `proactive_auditor.py:642-643` ya lo hacen, y la UI lo
  dice (`ConexionTab.tsx:141`). Eso se testea de verdad, con las tres fuentes vacías.

### 12.5 La prueba que falta

- **No existe un test por proveedor.** Cero tests de `zenmux`, `aion`, `kilocode`,
  `ollama_cloud`, `huggingface`, `mistral`, `opencodezen`. El plan agrega uno por
  proveedor: URL, modelo, header, y que degrade sin romper si la clave no está.
- **No existe un test de que la key de la UI llegue al backend.**
  `conexionTab.test.tsx:39-43` mockea `syncAllProviderKeys`: afirma que se llamó, no que
  llegó. El otro lado (`main.py:952`) no tiene test. Se agrega el del otro lado.
- **No existe un test de que una variable de modelo llegue a `os.environ`.** Porque no
  llega.
- **No existe un botón "Probar".** `get_ai_system_health()` (`main.py:375-384`) devuelve
  el estado del token bucket, no del proveedor. La UI no tiene forma de saber si su key
  funciona sin gastar una tarea completa. Se agrega: un ping por proveedor, con lo que
  cuesta y lo que tardó.
- `test_provider_routing.py:test_el_proveedor_vivo_usa_un_modelo_free` **requiere
  `ZENMUX_API_KEY` real** y falla en instalación limpia. O se marca como de red y se salta
  sin clave, o deja de exigir una clave real.

**Nota de seguridad**: hoy las claves viven en texto plano en `localStorage`, en IndexedDB
(vía `partialize` de zustand) y en `ai_keys.json` en `%APPDATA%` sin `chmod` ni ACL. No hay
puente IPC para secretos y `electron/preload.ts` no expone nada de claves. Cualquier XSS
lee las trece. La Fase 8 **no arregla esto** (es un redesign del canal de secretos, y no
lo pidió nadie), pero el hallazgo queda anotado en el documento final de la fase, porque
es una decisión que alguien tiene que tomar.

---

## 13. Orden y dependencias

```
F0  verdad del dato            sin dependencias          → desbloquea todo
F1  verdad de pantalla          sin dependencias          → desbloquea F2..F6
F8  cables de LLM              toca ConexionTab          → después de F1
F2  portada                     F0, F1
F3  estructura                  F0, F1
F4  figuras, tablas, inspector  F0, F1  (usa la geometría de F2)
F5  referencias                 F0, F1
F6  exportar                    F0, F1  (lee Formato de Ajustes)
F7  proyectos                   F0, F1  (el upload en serie depende de F1)
```

**F0 y F1 son paralelizables entre sí.** F2, F3, F5 y F6 también. F4 depende de la
geometría de F2, así que va detrás. F7 es el más caro y el más independiente: puede ir
último sin bloquear nada.

Cada fase es **un commit**. Los tests de la fase anterior tienen que seguir pasando en el
commit de la fase siguiente, y el número de tests **no baja**.

### 13.1 Colisiones conocidas

Estas dependencias son reales y hay que respetarlas:

- `src/components/layout/FileMenu.tsx` lo tocan F6 y F7.
- `src/components/wizard/Step3FiguresTablesWizard.tsx` y `src/components/inspector/ImageEditPanel.tsx`
  los tocan F4, y el segundo también F2 (los logos de portada).
- `src/styles/design-system.css` lo tocan F1, F2 y F6. **Una sola vez cada una, y en
  orden.**
- `src/lib/aiMosaic.ts` y `AiMosaic.tsx` los toca F3.
- `src/store/slices/auditSlice.ts` y `src/lib/auditItems.ts` los toca F0, y `auditItems.ts`
  también F5.
- `python/modules/portada_uni.py`, `cover_designer.py` y `models.py` los toca F2.
- `python/modules/proactive_auditor.py` lo toca F0 y F8.
- `src/store/slices/uiSlice.ts` lo toca F1 (`projectImages: []` es un slice de UI que hoy
  es estado muerto) y F7, y su `partialize` es el punto exacto de la migración del
  supuesto 3.
- **`ReviewMinimap.tsx` cambia de carpeta en F1** (`components/wizard/` a
  `components/review/`). **`src/__tests__/useReviewWorkbench.test.ts` lo importa desde la
  ruta vieja**, así que el commit de la reubicación **tiene que actualizar ese import en
  el mismo commit** o el build falla. Igual `src/__tests__/railPending.test.ts`, que
  depende de `marks`. Buscar todos los importadores antes de mover el archivo, no después.

**Nunca `git add -A`.** Explicit file by file. Dos fases que se pisan en un archivo
terminan mezcladas en un commit, y un commit mezclado no se puede revertir por partes.

---

## 14. Lo que NO se hace, y por qué

- **No se borra el rail ni su flyout.** Viven siempre (`AGENTS.md` §1). La decisión de
  diseño es que la lectura sea secuencial, no que el rail exista o no.
- **No se vuelve a meter `ReviewMinimap` en el layout de tres columnas.** El indicador de
  "página X de N" y "Siguiente hallazgo" viven en la barra superior. La reubicación del
  minimapa de la Fase 1 es a un plano más pequeño y no lo reintroduce.
- **No se toca la protección de la portada original.** `use_original_cover: true` jamás
  muta la portada. La Fase 2 saca los datos del acta **fuera** de la portada, que es
  justo lo que la descongestiona sin romper la promesa.
- **No se toca el fondo de la hoja.** `--paper-white` es blanco puro y `--paper-ink` es
  `#111827` en los dos temas (`AGENTS.md` §1). El morado del overlay de carga no es el
  fondo de la hoja, es una capa encima, y se arregla en la Fase 1.
- **No se agregan librerías de grafo.** El mapa es SVG a mano.
- **No se reescribe el canal de secretos.** Queda anotado en `12.5`.
- **No se toca `rules` por documento.** Es uno en el store, no uno por documento
  (`AGENTS.md` §1 lo admite). Separar `rules` por `session_id` es un cambio de modelo
  real que ninguna de las nueve fases pide. Se anota.

---

## 15. Suposiciones que hay que confirmar antes de ejecutar

Estas son las que **no** pude verificar leyendo el código. Ninguna bloquea el documento,
pero cada una puede cambiar el alcance de su fase.

1. **El disparador del morado.** `scanAll` usa `isScanning` local y no pone `isLoading`,
   así que el camino real es otro. Hay que reproducirlo en vivo. Si el morado aparece en un
   momento que no pasa por `documentSlice`, hay un cuarto disparador sin encontrar.
2. **"La UI desarmada" en Revisión.** El único overlay real es el flyout del rail
   (`RailFlyout.tsx:76-90`) y el overlay de carga del lienzo
   (`PaperCanvas.tsx:1842-1844`, blanco puro en oscuro, `zIndex: 50`). Con los dos, más un
   minimapa de 4 px, la pantalla **se ve** mal. Pero si lo que el usuario vio fue el overlay
   de carga en tema oscuro, es un problema distinto al que este documento describe. Hay que
   verlo.
3. **La IndexedDB.** `useDocStore` persiste con `partialize`. La Fase 7 depende de cómo se
   migra un blob URL guardado a una referencia a disco. Hay que leer `useDocStore.ts` antes
   de escribir esa fase.
## 15. Suposiciones: estado al 2026-09-28

De las cuatro, **una está resuelta** (decisión del usuario) y las otras tres quedaron
confirmadas o ampliadas por el usuario. Queda una sola que hay que reproducir en vivo.

1. **El disparador del morado.** `scanAll` usa `isScanning` local y no pone `isLoading`,
   así que el camino real es otro. **Confirmado por el usuario: se reproduce en vivo al
   arrancar F1, antes de tocar `LoadingTips`.** Si el morado aparece en un momento que no
   pasa por `documentSlice`, es un cuarto disparador sin encontrar, y se busca antes de
   escribir código. No se toca el overlay hasta saber qué lo dispara.
2. **"La UI desarmada" en Revisión.** Tema oscuro + overlay de carga blanco + minimapa de
   4 px **alcanza para explicar lo que se vio**. **Confirmado por el usuario: no se abre
   un problema separado.** Si después de arreglar F1 persiste algo de la sensación de
   desarme, ahí sí se abre issue aparte, con el síntoma ya medido.
3. **La IndexedDB — ampliado por el usuario.** La Fase 7 tiene que revisar **`partialize`
   en `uiSlice.ts`**, no solo en `useDocStore.ts`. Es el punto exacto del problema:
   `projectImages` vive en el slice de UI (`uiSlice.ts:206`) y es lo que `partialize`
   persiste. El `URL.createObjectURL` guardado ahí **sobrevive a la recarga como un string
   muerto**: el blob ya no existe y el URL no resuelve.
   **F7 migra ese campo a una referencia por `asset_id` de `/api/assets` ANTES de tocar el
   modelo de `Proyecto`.** El orden importa: si se cambia el modelo primero, la migración
   del campo viejo no tiene contra qué verificarse.
4. ~~**El tamaño de página de la portada.**~~ **RESUELTO. Decisión del usuario, registrada
   en `§6.2`.** El tamaño de página es propiedad del documento, no del bloque protegido:
   `section.page_width`/`page_height` son propiedades de la sección. La Fase 2 aplica el
   tamaño de página **sin partirse en dos**, y el test de hash del bloque de portada es lo
   que prueba que la protección sigue en pie.

---

## 16. Cómo se sabe que terminó

Un solo criterio, y es el del proyecto:

> Ninguna UI puede afirmar algo que el código no hace.

Verificable, fase por fase:

- `npx vitest run` → **no baja de 1024 passed, 0 failed**
- `npx tsc --noEmit` → limpio
- `pytest python/tests/ -q` → no baja de 766 passed, 14 skipped
- `npm run build` → sin error
- `cd word-addin; npm test` → verde
- R3 de `noHardcodedColors.test.ts` cubre los seis directorios nuevos
- La regla de tokens declarados pasa
- Cero `kind` sin rótulo
- Cero control sin destino
- La revisión es un párrafo a la vez, en ambos temas, en los tres anchos
- Los 13 proveedores: uno tiene key que llega, uno tiene modelo que llega, uno degrada
  sin romper y uno se puede probar

Y una prueba manual que no es un test: **abrir la app, mirar las seis pantallas, y no
encontrar ninguna afirmación que el código no sostenga.**
