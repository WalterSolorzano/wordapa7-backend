# HANDOFF — Fidelidad «Revisión & IA» (Modo lectura + Mapa IA) + fallas reportadas

Fecha: 2026-10-05. Rama: `feat/motor-render-fase1`.
Este documento es la fuente de continuidad. Leerlo completo antes de tocar código.

---

## 0. Cómo continuar (lee esto primero)

- **No commitear** de forma general: el usuario pidió (mensaje @98@) que **otra IA hará un commit general** del working tree. Sí se pueden hacer micro-cambios y correr tests, sin `git commit` salvo que el usuario lo pida.
- Git SIEMPRE con la ruta directa: `& 'C:\Program Files\Git\cmd\git.exe'` (el alias `snip` intercepta `git`). **No** `git add -A`.
- Verificar ausencia de CJK (`[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]`) tras escribir archivos. Cero emojis; solo iconos `lucide-react`; solo tokens `var(--...)`.
- Baseline de verificación: `npm test` (hoy 190 archivos / 1852 tests verde), `& '.\node_modules\.bin\tsc.cmd' --noEmit` (0), `npm run build` (OK), `pytest -q python/tests/` (1162 passed / 14 skipped / 0 failed). Nota: `npx tsc` lo intercepta el shim `snip`; usar la ruta `node_modules\.bin\tsc.cmd`.
- Error preexistente de empaquetado ya arreglado en `pyproject.toml` (19 `py-modules` muertos eliminados) — pendiente de commit de la otra IA.

### Contexto de producto (de dónde venimos)
- El usuario aprobó, en varias sesiones de brainstorm, **mockups** de la fase 5 («Revisión & IA») y de otras áreas. El rediseño de Revisión/Mapa IA se implementó (12 tareas) pero **con fidelidad parcial**. Esta sección continúa corrigiendo esa fidelidad y las fallas que el usuario reportó.

---

## 1. Fallas reportadas por el usuario (cita literal, mensaje @155@)

> «okey haz todo fallas que yo vi  el menu de inicio de revision e ia es super vacio no esta centado ocupa casi nada ,  no esta el boton de mapa ia ,  los graficos que pusiste no son dinamicos la evlauacion de taxonomia de bloom no tiene sugerencias  o una represnetacio ngrafica de en que nivel esta cada uno el general vs especificos y si tiene sentido quiero un analisis ahi y un set de propuestas por si se quiere cambiar , etc y al entarar a anexos porejemplo botones sin hacer nada, tablas sin previsualizarse  datos y cosas supuestuestas , etc demasiadas fallas»

Traducido a tareas:
1. **Puerta de Revisión & IA** (menú de inicio): se ve vacía, no centrada, ocupa poco.
2. **Falta el botón de Mapa IA** (hoy se oculta si no hay hallazgos IA).
3. **Gráficos no dinámicos** (heatmap y rectángulos con ancho uniforme, sin score/leyenda).
4. **Bloom**: sin sugerencias ni representación gráfica del nivel de cada objetivo (general vs específicos), ni análisis de si tiene sentido, ni set de propuestas para cambiar.
5. **Anexos**: botones que no hacen nada, tablas sin previsualizar, datos supuestos.

Además, mensajes previos relevantes del usuario:
- @148@: «si me tiraste varios mockups de diferentes areas yo te los aprobe corregimos fuimos avanzando todo eso no o llevaste a la realidad sino que solo llevaste una pequeña parte y mal llevada?»
- @152@: «te dije que ia tenia un menu y recuerdo decirte si ese de ia va guardalo que ya lo tenemos y luego fuimos con revision y ahi tuvimos muchas peleas hasta que aprobamos varios modulos»
- @98@: «sigue con lo que te falte , otra ia hara commit general».
- @116@: «pero no veo todos esos cambios y rediseños en mi ultimo setup peudes revisar y si ya los pusiste entonces estan mal puestos». (Se verificó: la app de escritorio instalada SÍ carga el build nuevo — `app://-/assets/index-C9xY5DhP.js`, contiene «Informe general»/«Leyes de metodología»; el flujo viejo ya no está. No era un problema de build.)

---

## 2. Lo que YA está implementado y commiteado (plan `2026-10-04-modo-lectura-mapa-ia.md`, 12 tareas)

- `src/lib/capitulosRevision.ts` (+test): `construirCapitulos`, `capituloDeElemento`, `contarPorCapitulo`.
- `src/lib/informeRevision.ts` (+test): `repeticionCuerpo`, `leyesPorFase`.
- `src/lib/contentReview.ts`: `BLOOM_LEVELS`/`bloomLevel` exportados + `objetivosBloom` (nivel actual→propuesto, un verbo).
- `src/lib/aiHeatmap.ts` (+test): `RANGOS_IA=[45,60,75,90]`, `construirHeatmap`.
- `src/components/review/ReviewGate.tsx`: cuenta solo motores objetivos (excluye IA).
- `src/components/review/ReviewInforme.tsx`: R1 «Informe general» (Leyes de metodología primero, Bloom, repetición, capítulos, CTA «Leer y corregir»).
- `src/components/review/ReviewReader.tsx`: R2 «Modo lectura» (cinta, hoja, dock, overlay Informe).
- `src/components/wizard/Step5AuditIAWizard.tsx`: 4 pantallas `gate|informe|reader|ai`.
- `src/components/review/AiHeatmap.tsx`, `AiChapterGrid.tsx`, `AiChapterFocus.tsx`, `EvaluacionComparador.tsx`; rework de `AiHierarchy.tsx`; `categoryMeta.ts`.
- Backend `python/modules/phase_scope.py`: leyes `objetivo_sin_infinitivo` y `objetivo_multi_verbo` (scope `objetivos`).

Flujo montado: `src/App.tsx:672` → `wizardStep===5 && <Step5AuditIAWizard/>`. Pantallas: `gate`→(«Empezar revisión»)→`informe`(R1)→(«Leer y corregir»)→`reader`(R2); `gate`→(«Ver mapa de IA»)→`ai`→`AiRoom`→`AiHierarchy`.

---

## 3. INVESTIGACIÓN A — PUERTA (menú de inicio) + matriz fase×motor

### 3.1 Objetivo aprobado (mockup `revision-entrada-v2.html`, aprobado en `decisions.md`)
Orden vertical de la puerta:
1. **Eyebrow**: `Paso 5 · Revisión & IA` — 10px, uppercase, letter-spacing 1.4px, muted.
2. **Título**: `Estado de tu documento` — 26px/600.
3. **Lead**: `Todavía no revisaste este borrador. Esto es lo que encontramos.` — 12px muted.
4. **Hero**: `82%` (decisión: **44px**, no 52) + `LISTO PARA PUBLICAR` (13px/600).
5. **Sub-cifras en 3 columnas**: `312`/`por revisar` · `18%`/`voz sintética` · `5`/`fases` — `<b>` 24px + `<span>` 10px uppercase, separadas con `border-left`.
6. **Matriz de calor fase × motor** + leyenda.
7. **CTAs anclados abajo** (`margin-top:auto` + `border-top`): `Empezar revisión →` (sólido) + `Ver mapa de IA` (fantasma).
8. **Mascota** arriba-derecha (`EditorialMascot kind="reference"` en la app real).

### 3.2 Matriz fase × motor (mockup `graficos.html`, opción A aprobada; aviso en el nombre: barras horizontales están RECHAZADAS, la matriz sí está aprobada)
- **Filas (fases)**: según `PHASE_ORDER` (`src/lib/auditItems.ts:89-101`): portada, resumen, introduccion, marco_teorico, objetivos, metodo, resultados, discusion, conclusiones, referencias, anexos. Etiqueta + conteo por fila (`phaseLabel`, `:122-125`).
- **Columnas (motores)**: `ortografía`, `estructura`, `redacción`, `IA`. **Citas NO** (ver bloqueo abajo).
- **Celda** = intensidad (bloque coloreado), no número; 3 escalones por ratio; IA con tramado diagonal.
- **Leyenda**: azul = ortografía/estructura · naranja = redacción · violeta = IA (sala aparte).
- **Cálculo**: celda `(fase, motor) = items.filter(it => it.phase===fase && it.category===motor).length`, normalizado a 3 escalones.

### 3.3 Helpers existentes y bloqueos
- `heatMatrix` en `ReviewGate.tsx:9-13` solo da total por motor (sin eje de fase). No existe helper fase×motor → **hay que crear una función pura** (p. ej. en `informeRevision.ts`).
- `leyesPorFase` (`informeRevision.ts:63-74`) sirve de base pero no cruza con motor.
- **Bloqueo IA**: `collectAuditItems` fija `phase:null` para IA (`auditItems.ts:282`) y citas (`:335,361`). Para la columna IA hay que **resolver la fase por el H1 ancestro del `element_id`** en frontend (recorrer `elements`), o pedir `phase` al backend.
- **Bloqueo Citas**: `Step5AuditIAWizard.tsx:56` elimina `category==='citations'` antes de pasar a la puerta; además el test T16 exige que un documento con solo citas NO muestre puerta con datos. **Recomendación: 4 columnas sin Citas** (coincide con `categoryMeta.ts:14-19`, que omite citas a propósito).

### 3.4 Delta código actual (`src/components/review/ReviewGate.tsx`)
- Faltan: eyebrow, lead, hero 82% + «LISTO PARA PUBLICAR», sub-cifras en columnas, matriz fase×motor + leyenda, CTAs anclados al fondo, mascota real.
- Hoy hay: título, fila baseline con total 32px, párrafo inline «Voz sintética {n}% · {m} fragmentos con IA», lista vertical por motor (`maxWidth:520`) que excluye `ai`, botones «Empezar revisión» + «Ver mapa de IA».
- **Por qué se ve vacío/descentrado**: `ReviewGate.tsx:47` es `{flex:1, overflowY:'auto', padding:'clamp(20px,4vw,48px)'}` sin `justifyContent`/`alignItems` → todo arriba-izquierda; la lista `maxWidth:520` deja un hueco enorme a la derecha; los CTAs no se anclan al fondo. Contenedor: `Step5AuditIAWizard.tsx:16` `PHASE_WRAP = {display:'flex',flexDirection:'column',flex:1,minHeight:0}`. El `.revision-phase` (`src/styles/revision.css:1-28`) no aporta layout.

### 3.5 Botón «Mapa IA»
- Existe en `ReviewGate.tsx:76-80` pero **oculto si `aiCount===0`** (`{aiCount>0 && (...)}`). El mockup lo muestra siempre, sin conteo. → Mostrarlo siempre; deshabilitarlo o mostrar «sin hallazgos IA» cuando no haya.
- El literal aprobado es `Ver mapa de IA` (no `Mapa IA · N`).

### 3.6 Tokens disponibles
`--accent-primary` (`--color-accent` `#4f7cff`) y rampa `--color-accent-a20/a40/a65`; violeta IA `--ia-nivel-1..4` + `--color-engine-ia` (`-a08/-a12/-a20/-a30/-a40/-a65`); naranja `--color-warning-a05/a08/a12/a30/a40` (falta `a65`, reusar `a40`). **No hay `--text-4xl`** → para el 44px del hero crear token o usar `--text-3xl` (revisar escala). Iconos: `ArrowRight`, `Sparkles`, `ShieldCheck`.

### 3.7 Aserciones de tests que NO se deben romper
`src/__tests__/reviewGate.test.tsx`:
- `:21` `getByTestId('review-gate-total').textContent === '2'` (total excluye IA).
- `:22` `queryByText('Voz sintética')` **null** (no renderizar el literal exacto «Voz sintética»; usar «IA»).
- `:30` `getByText('Ver mapa de IA')`.
`src/__tests__/reviewWorkbench.test.tsx`:
- `:886` `/Estado de tu documento/i`; `:894` `review-gate-total !== '0'`; `:900` `/Aún no hay una revisión/i`; `:901` botón `/Escanear documento/i`; `:907/:924` botón `/Empezar revisión/i`; `:953/:967` `queryByTestId('review-gate-total')` **null** con solo citas / solo leyendas (conservar early-return `items.length===0`); `:978` total `'1'`; `:990` botón `/Ver mapa de IA/i`; ninguna cadena con emoji.

---

## 4. INVESTIGACIÓN B — BLOOM (análisis + gráfico + propuestas)

### 4.1 Objetivo aprobado (mockups `wordapa7-ui/content/objetivos-bloom.html` y `objetivos-v2.html`)
- **Gráfico**: eje de 6 columnas `Recordar · Comprender · Aplicar · Analizar · Evaluar · Crear`; un **marcador** por objetivo en su nivel (sólido = OK; hueco con borde naranja = hallazgo); barra-tapiz de guía detrás.
- **Filas**: una por objetivo, con prefijo `General ·` / `Específico N ·`, verbo en negrita + resto del texto, y el marcador.
- **No medible**: verbo tachado + sub-nota (`— sin variable`) + marcador hueco en col. 1.
- **Dos verbos**: verbo extra tachado + warning «Dos verbos: el segundo (describir) es de otro nivel. Dejá uno.»
- **Chips de verbos** (varias alternativas), una preseleccionada, + botón **«Aplicar la alternativa elegida»**.
- **Análisis textual**: párrafo que explica si el **general** está alto (Analizar/Evaluar) y los específicos abajo, si hay específico flojo o con dos verbos (tachar + alternativa).
- `objetivos-v2.html` (variante sin gráfico): texto legible + hallazgo inline + lista corta de sugerencias («El específico 2 no es medible» + chips + «Aplicar»; «El específico 3 tiene dos verbos» + «Quitar 'y describir'»), y un bullet verde cuando todo OK.

### 4.2 Datos necesarios
- Por objetivo: `esGeneral`, texto, `verboActual`, `nivelActual`, alternativas (varias), warnings (`sinVariable`, `tieneDosVerbos`), y si general≥específicos.
- Regla de nivel propuesto hoy: `NIVEL_OBJETIVO=4`; si `null` o `<4` → 4; si no, conserva. **No sube a 6.**
- Chips del mockup (`Determinar`, `Establecer`) **no existen** en `BLOOM_LEVELS` → ampliar léxico si se quieren esos chips.
- «Tiene sentido»: hoy existe la regla `objetivo_nivel_mayor_que_general` en `reviewObjectives` (`contentReview.ts:206-226`) pero **no se muestra** en el informe.

### 4.3 Delta
- Existe: `BLOOM_LEVELS`, `BLOOM_FORBIDDEN`, `bloomLevel`, `separarGeneralDeEspecificos`, `reviewObjectives`, `objetivosBloom` (1 alternativa), bloque en `ReviewInforme.tsx:74-88` (chip actual→propuesto).
- Falta: gráfico de 6 niveles con marcador; etiqueta General/Específico por fila; análisis textual; detección de dos verbos intra-frase; «sin variable»; **propuestas múltiples**; **botón Aplicar** (hoy es solo informativo); color por nivel.

### 4.4 Aplicar al documento (mecanismo)
- `updateElementText(elementId, text): Promise<void>` (`src/store/types.ts:446`; impl `src/store/slices/documentSlice.ts:859-865`) → `api.updateElement` (POST). **Reemplaza el texto COMPLETO del elemento.**
- `api.rewriteText(sessionId, elementId, text, instruction, apiKey?)` (`src/api/backend.ts:652-678`).
- `handleAccept(item)` (`Step5AuditIAWizard.tsx:77-94`) usa `item.suggestedText` o `api.rewriteText`, con guard `item.readOnly`.
- Para «Aplicar alternativa»: construir la frase nueva en frontend (reemplazar el primer verbo) y llamar `updateElementText(elementId, nuevo)` — **sin LLM**. Respetar readOnly.

### 4.5 Tests a no romper
`src/__tests__/reviewInforme.test.tsx`: `:16` `Informe general`; `:17` `/Conocer/`; `:18` `Repetición · cuerpo completo`; `:24` `/Leer y corregir/i`; `:31-34` heading `Objetivos · validación Bloom` debe existir y `Leyes de metodología` antes.
`src/__tests__/contentReview.test.ts` (`describe objetivosBloom`, `:145-179`): `:153` ids `['g','e1','e2']`; `:155-157` general `nivelActual 6`, `nivelPropuesto 6`, `verboPropuesto 'desarrollar'`; `:159-161` e1 `nivelActual 1`, `nivelPropuesto 4`, `verboPropuesto.length>0`; `:171-173` `conocer`→`null`/`4`; `:177` sin objetivos → `[]`. Mantener campos actuales de `ObjetivoBloom` y **añadir** los nuevos (no renombrar).
`reviewActionsReadOnly.test.ts:75` `updateElementText('c1','Determinar')`.

### 4.6 Propuestas (resumen de implementación sugerida)
1. Extender `ObjetivoBloom`: `esGeneral`, `analisis?`, `alternativas:string[]`, `tieneDosVerbos`, `sinVariable` (conservar campos actuales).
2. Detectores intra-frase de dos verbos y «sin variable» (helper en `contentReview.ts` o nuevo).
3. Ampliar léxico con `determinar`, `establecer` si se quieren los chips del mockup.
4. Render: eje 6 columnas + marcador por `nivelActual` + etiqueta General/Específico (conservar heading exacto).
5. Selección de alternativa + botón que arme texto completo y llame `updateElementText`.
6. Análisis textual + nota verde cuando todo OK.

---

## 5. INVESTIGACIÓN C — ANEXOS (botones muertos, tablas sin preview, datos supuestos)

**Hallazgo central: NO existe pantalla/componente «Anexos».** `glob **/*[Aa]nexo*` → 0 archivos. «Anexos» solo es etiqueta de fase (`auditItems.ts:100`, `:114`) y cabecera H1 derivada del título. La queja mapea a 3 pantallas candidatas:

1. **Estructura (paso 2) — «Prosa de la sección»**: `src/components/structure/EscritorioEstructura.tsx` → `LecturaProsaSeccion` (`:378-380`); monta en `App.tsx:669` (`wizardStep===2`), rail `step-2` (`railItems.ts:76`). Se elige el H1 «Anexos» en `IndiceEstructura`/`MapaEstructura` (`EscritorioEstructura.tsx:226-236`).
2. **Figuras/Tablas (paso 3) — Taller**: `src/components/figures/TallerFigurasView.tsx` (galería `GaleriaActivosColumna.tsx:23-31,75-100`); `App.tsx:670`, rail `step-3`.
3. **Revisión & IA (paso 5)**: chip `Anexos` en `ReviewStrip.tsx:192-227` + `FindingDetail.tsx`.

### 5.1 Botones
- `LecturaProsaSeccion` **no tiene ningún botón** → el usuario percibe «no hace nada».
- Los demás botones de Estructura/Taller **sí** tienen handler (grep no encontró `onClick={()=>{}}`/`TODO`). El problema son **controles ausentes**: las pestañas `formato`/`estilo` de tabla **no se renderizan** (`InspectorActivoTabs.tsx:300-305`).
- Nota: `InspectorRama` «Mover esta rama» (`:245`) siempre baja, no elige dirección.

### 5.2 Tablas: por qué no se previsualizan
- `TableModel` = `{element_id, headers, rows, caption, note, table_number}` — **sin** estilo/orientación/spans/anchos (`src/types/index.ts:115-122`). `ImageModel` sí tiene width/height/alignment/design_style/border/rotation (`:80-113`).
- El contexto del taller solo pasa `{headers, rows}` (`src/lib/figuras.ts:241-243`).
- `LecturaProsaSeccion` **no cuenta `table`** en `tieneContenido` (`:110-116,166-179`) y **no tiene rama `table`** en el loop: la tabla cae en `<p>{el.text}</p>` (vacío) (`:271-285`).
- Galería: miniatura de tabla = ícono, nunca render (`GaleriaActivosColumna.tsx:153-154`).
- `LienzoEditorialActivo` sí pinta tabla si `headers/rows` no vacíos; si no, cae a imagen → «Sin vista previa» (`:96-100,197-247,298-313`).
- `PaperCanvas` pinta tabla leyendo estilo del mapa efímero `tableStyles` del store (`:482,1711,2418-2493`).
- Revisión: hallazgo de tabla trae `sinTexto:{clase:'tabla'}`, muestra aviso, no tabla (`auditItems.ts:403-418`; `FindingDetail.tsx:243-246`).
- **Falta** (según spec): `src/lib/tablaRender.ts` + `src/components/figures/TablaRender.tsx` (render compartido con spans/estilo). No existen.

### 5.3 Datos supuestos / hardcodes
- `suggestedText:'Figura 1. Representación esquemática del procedimiento.'` (`auditItems.ts:398`).
- `suggestedText:'Tabla 1. Datos recopilados durante la fase experimental.'` (`auditItems.ts:414`).
- `widthCm=14.5`, `heightCm=9.0` por defecto (`InspectorActivoTabs.tsx:202-203`).
- `table_number || 1` inventa «Tabla 1» (`InspectorActivoTabs.tsx:208`; `PaperCanvas.tsx:2429`).
- `caption || 'Figura sin título especificado'` y variantes (`InspectorActivoTabs.tsx:266-268`).
- Preview «Tabla {numeroActivo}» + «Sin título todavía» (`InspectorActivoTabs.tsx:683-689`).
- `figure_number ?? 0`, `table_number ?? 0` → «Figura 0/Tabla 0» (`figuras.ts:188-194`).
- `figureTitle` fallback `'Sin título'` (`TallerFigurasView.tsx:424`).
- `Figura {numero}.` + `caption || 'Sin leyenda asignada'` (`LecturaProsaSeccion.tsx:263-266`).
- `'Sin leyenda definida'` (`GaleriaActivosColumna.tsx:228`).
- Sugerencia IA guarda `suggestedNote:''` (`TallerFigurasView.tsx:197,304`).

### 5.4 Spec relacionado
`docs/superpowers/specs/2026-10-04-correcciones-figuras-tablas-design.md` (único; **no hay plan**). Pide: `TableModel` fuente de verdad + `style/orientation/column_widths/header_spans/row_spans`; presets `apa/compact/expanded` + `grid/zebra`; orientación `auto/portrait/landscape`; merges como arrays paralelos; edición de celdas solo en Taller; render compartido `tablaRender.ts` + `TablaRender.tsx`; WS1 rótulo no duplicado, WS2 mascota siempre visible, WS3 edición de tabla, WS4 overflow, WS5 celdas combinadas. **No implementado** en esta rama. Otra spec: `2026-10-03-redisenio-figuras-tablas-design.md` + plan `2026-10-03-redisenio-figuras-tablas.md`.

---

## 6. Divergencias código vs spec aprobado (7 puntos)

1. R2 chips sin Citas (solo `all/spelling/style/structure`).
2. Micro-franja sin punto de pendientes.
3. R1 capítulos en grid de cards, no micro-franja/mosaico tocable.
4. Rectángulos de capítulo ancho uniforme y sin score.
5. Heatmap sin leyenda de rampa.
6. Gate label `Ver mapa de IA` sin `· N` (el mockup no usa `· N`; decidir).
7. Botón volver dice `Mapa IA`, no `‹ Mapa IA`.

---

## 7. Criterios de diseño obligatorios

- Cero emojis; solo iconos `lucide-react`.
- Solo tokens `var(--...)`, nada de hex hardcodeado (`noHardcodedColors.test.ts`, `designTokens.test.ts`).
- **Nada de cards** (el usuario lo marcó explícitamente); preferir líneas, tipografía, espacio, flujo continuo.
- No «vomitar datos»; divulgación progresiva.
- **Barras horizontales RECHAZADAS** (Ojo: el bloque «Repetición» de R1 hoy usa barras horizontales → **revisar**).
- No cola única tipo bandeja; no «zonas por tipo».
- Portada readOnly sin sugerencia. IA solo «Marcar para revisar», nunca «Aceptar».
- Revisión: un párrafo a la vez; no 3 columnas ni `ReviewMinimap`; rail 56px siempre.
- Conteos derivados una sola vez de `src/lib/auditItems.ts` (vía `railPending.ts`); no crear conteos paralelos.

---

## 8. Rutas de mockups (fuente de verdad visual)

- Sesión 2018 (fase 5, spec ejecutado): `.superpowers/brainstorm/2018-1791167860/content/` → `01-revision-mapa-ia.html`, `02-fases-mosaico.html`, `03-revision-una-eleccion.html`, `04-revision-avance.html`, `05-flujo-general-a-detalle.html`, `06-revision-mosaico.html`, `07-modo-lectura.html` (referencia de R2).
- Sesión 1493 (aprobaciones en `decisions.md`): `.superpowers/brainstorm/1493-1791092910/content/` → puerta: `revision-entrada-v2.html` (aprobada), `puerta-entrada.html`, `revision-entrada-fullscreen.html`; gráfico: `graficos.html` (matriz fase×motor A); IA: `ia-lente-vs-sala.html`, `ia-sala-v2.html` (marcado inline + badge confianza), `ia-navegacion.html` (árbol + Siguiente); flujo: `experiencia-macro.html`, `flujo-completo.html`, `comparativa-fases5.html`; iteraciones: `modulo-*.html`, `revision-general.html`. Decisiones: `.superpowers/brainstorm/1493-1791092910/decisions.md`.
- Sesión UI (Bloom + Estructura): `.superpowers/brainstorm/wordapa7-ui/content/` → `objetivos-bloom.html`, `objetivos-v2.html`, `mapa-navegacion.html`, `estructura-*.html`, `figuras-*.html`, `editor-estilos-*.html`, `fases-y-subfases.html`, `direccion-visual.html`, etc.
- Nota: los HTML aprobados **no están versionados** (bajo `.superpowers/`, gitignore). Si se necesita otra pantalla, escribir archivo nuevo (nunca reusar nombre).

---

## 9. Plan de trabajo propuesto (orden sugerido por impacto)

1. **Puerta** (`ReviewGate.tsx`): layout centrado/full-height con hero + sub-cifras + **matriz fase×motor** + leyenda, CTAs anclados al fondo, **botón «Ver mapa de IA» siempre visible**, mascota. Crear helper puro `matrizFaseMotor(items)` (+ test). Resolver la fase de IA por H1 ancestro.
2. **Bloom** (`objetivosBloom` + bloque en `ReviewInforme.tsx`): extender campos, gráfico de 6 niveles con marcador por objetivo, etiqueta General/Específico, análisis textual, set de propuestas + botón Aplicar (`updateElementText`).
3. **Mapa IA**: leyenda de rampa, rectángulos proporcionales con score, marcado inline + badge de confianza, árbol/Siguiente con IA (reconciliar 1493 vs 2018).
4. **R1/R2 fidelidad**: sustituir cards de capítulos por micro-franja/mosaico tocable; punto de pendientes en la cinta; chip Citas.
5. **Anexos/Tablas**: decidir superficie (Estructura/Prosa vs Taller vs Revisión); añadir rama `table` en `LecturaProsaSeccion`, miniatura de tabla, render compartido `tablaRender.ts`/`TablaRender.tsx`, y eliminar hardcodes de datos supuestos.
6. Otras áreas aprobadas sin implementar: `estructura-rail-indice`, `capa-rediseno-superficies`, `motor-ia-antiban`, `scheduler-ia-por-demanda`, `clasificacion-titulos-robusta`, `indexado-claves-instalador`, `cumplimiento-privacidad-cuota`, `fidelidad-apa-referencias`.

**Antes de cada arreglo**: comparar contra el mockup aprobado (fuente de verdad) y correr los tests focalizados. No confundir «tests verdes» con «fidelidad al mockup» (error que causó estas fallas).
