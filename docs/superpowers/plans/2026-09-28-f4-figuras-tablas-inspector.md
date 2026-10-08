# F4 — Figuras, tablas e inspector: Implementation Plan (CORREGIDO)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.
>
> **ESTA ES LA SEGUNDA VERSIÓN DE ESTE PLAN.** La primera la escribió un subagente al
> que no se le pidió, sin conocer F0–F3. Estaba desalineada con el spec y con el repo.
> La sección **[Revisión](#revisión-qué-estaba-mal-en-el-plan-anterior-y-qué-cambió)**
> dice, tarea por tarea, qué estaba mal y qué cambió. Leela antes de ejecutar: cinco de
> los cambios no son de estilo, son de a dónde se(edita).

**Goal:** Que en la fase de Figuras y tablas **la figura sea el eje** y el documento sea
la referencia, con un bloque de contexto por elemento (tamaño real, leyenda o su
ausencia dicha, párrafo anterior, H1/H2), un buscador que también busca por sección, y un
inspector de diseño con **aplicar a esta / aplicar a todas** que no te saque de la
pantalla.

**Dependencia:** F0, F1, F2 y F3 están mergeados. Esta fase **consume** lo que dejaron:

| De | Qué se reusa | Dónde |
|---|---|---|
| F0 | `SUBTYPE_LABELS`, `rotuloDeSubtipo`, `rotuloDeKind`, `MARCAS_MAP_VERSION`, `PROOFREAD_SPECS` | `src/lib/rotulos.ts:34,101,257,267,138` (reexportado por `src/lib/auditItems.ts:29`) |
| F0 | `CLAVE_MARCAS`, `leerMarcas`, `escribirMarcas`, `escribirMarca`, `borrarMarca` | `src/lib/marcasMap.ts:21,26,48,67,81` |
| F1 | `EstadoVacio` con sus cuatro motivos | `src/components/shared/EstadoVacio.tsx:19,66` |
| F2 | `anchoUtilMm`, `mmAPx`, `escalaDePreview`, `Hoja` | `src/lib/portada/geometria.ts:58,82,77,29` |
| F3 | `construirJerarquia`, `NodoJerarquia`, `faseDeTitulo`, `preambuloDe` | `src/lib/jerarquia.ts:417,46,195,494` |
| F3 | el patrón de vista por defecto + toggle "ver el documento" | `src/components/structure/IndiceEstructura.tsx:71,74,135,196` |
| — | `Seccion`, el molde de bloque con título | `src/components/settings/tabs/word/Seccion.tsx:13` |

> **Sobre `ReviewMinimap`:** `AGENTS.md` §1 y el spec §14 lo prohíben en un layout de tres
> columnas, y hoy **vive en `src/components/review/ReviewMinimap.tsx`** (lo movió F1). Esta
> fase **no lo toca, no lo importa y no lo menciona**. Un plan de F4 que diga que
> `ReviewMinimap` está en `components/wizard/` está describiendo un repo que ya no existe.

**Spec:** `docs/superpowers/specs/2026-09-27-rediseno-superficies-master-design.md` §8
(completa), §3 (la barra de calidad) y §14 (lo que NO se hace).

---

## Arquitectura: qué cambió y por qué

El plan anterior proponía **tres zonas dentro de `Step3FiguresTablesWizard.tsx`**: un
navegador de secciones a la izquierda, un escenario central y un `FiguraInspector` nuevo a
la derecha. **Eso es una cuarta columna**, que es exactamente lo que el spec §8.1 viene a
matar. Medido:

- `src/App.tsx:713` — `{wizardStep !== 4 && wizardStep !== 5 && wizardStep !== 6 && !focusMode && <RightSidePanel />}`
  El `RightSidePanel` **ya se monta en la fase 3** (Figuras y tablas). No es una columna
  opcional: es la tercera.
- `src/components/activity/RightSidePanel.tsx:159-163` — `selectedImage` se calcula con
  `imagePanelOpen && selectedElementId`, y `:233-264` **reemplaza** el `ElementInspector`
  por el `ImageEditPanel` en el mismo lugar.
- `src/store/slices/uiSlice.ts:188-189` — `imagePanelOpen` es estado global del store.
- Y lo que lo dispara sin que nadie lo pida: `Step3FiguresTablesWizard.tsx:379`
  (`setImagePanelOpen(true)` al hacer clic en una fila de la lista) y `:133`
  (`handleElementClick`), más el efecto de `RightSidePanel.tsx:84`, que abre el panel
  ante **cualquier** selección.

O sea: hoy hay rail de 280 px + lienzo + panel derecho que se abre solo. Sumar un tercer
panel dentro del paso da cuatro. El plan anterior no lo vio porque copio la forma de
"F3 tiene tres zonas" sin leer de qué columna habla el spec.

**La arquitectura de este plan es la misma idea, con la tercera columna donde ya está:**

```
┌─ 56px ─┬────────────── 280 px ──────────────┬──────────── flexible ────────────┬──── panel derecho (existe) ────┐
│ rail   │  EJE: lista contextual de figuras  │  ESCENARIO: una figura a la vez,  │  INSPECTOR: ImageEditPanel     │
│ (App)  │  y tablas, con su contexto          │  a escala real de la hoja         │  reescrito como inspector de    │
│        │  (tamaño, leyenda, párrafo, H1/H2)  │  + toggle "Ver el documento"     │  diseño de §8.2                 │
└────────┴────────────────────────────────────┴──────────────────────────────────┴─────────────────────────────────┘
```

Tres columnas. Ninguna nueva. El inspector **no** es un componente nuevo: es
`ImageEditPanel.tsx`, que el spec §8.3 recomienda reescribir (opción **a**) y que ya tiene
los presets de diseño, las subfiguras, el reemplazo de archivo y el "Sugerir con IA" que
§8.3 dice que funcionan.

**Decisión sobre el documento.** `PaperCanvas` no se borra: pasa a ser el contenido de un
toggle **"Ver el documento"**, apagado por omisión, igual que hizo F3 con su índice
(`IndiceEstructura.tsx:71,135,196`). Es la primera mitad de §8.1 ("el rail desaparece o se
vuelve un índice compacto") y la razón por la que la lista contextual puede ser densa:
con el documento apagado, 20 figuras de golpe (el caso que la F7 le va a meter, §8.2) son
20 filas de una lista, no 20 páginas de papel.

**Decisión sobre el Inspector en Revisión.** El spec §8.3 pregunta si el Inspector también
debería aparecer en Revisión, "porque un hallazgo de Revisión puede ser una figura".
**Decisión de F4: no, y no en esta fase.** Razón: `App.tsx:713` excluye el panel derecho
en los pasos 4, 5 y 6, y la Revisión es un paso; y `AGENTS.md` §1 fija que la Revisión es
**un párrafo a la vez**, con el alcance de cada acción dicho al lado. Meter un editor de
figuras de 725 líneas dentro de la lectura secuencial rompe las dos. Queda anotado como
seguimiento en §15 del spec, no como trabajo escondido dentro de esta fase. Lo que SÍ se
hace en esta fase es que el hallazgo de figura sea accionable: un hallazgo de figura sin
leyenda trae `sinTexto: { clase: 'figura' }` y `element_id` (`src/lib/auditItems.ts:381-396`,
`:397-410`), y el `FindingDetail` lo muestra sin texto inventado.

---

## Global Constraints

1. **Cero emojis.** Solo `lucide-react`, con `strokeWidth="var(--icon-stroke)"`.
2. **Cero colores literales, y R3 no tiene dónde esconderlos.** R3 corre sobre
   `DIRECTORIOS_R3` (`src/__tests__/noHardcodedColors.test.ts:166-174`) más `DIRECTORIOS`
   (`:147`) más `ARCHIVOS` (`:193-208`): doce directorios, **sin deuda**. `DEUDA_MEDIDA`
   **ya no existe** como mecanismo y hay una guarda que **falla si el nombre vuelve a
   declararse** (`:809-849`). Consecuencia para esta fase: `components/wizard` (`:171`) y
   `components/inspector` (`:172`) **ya están dentro**, y la carpeta nueva
   `src/components/figures/` **tiene que entrar** (Task 2, Step 1) o el lint deja de
   mirar justo el código que esta fase escribe.
3. **Solo tokens declarados.** `src/__tests__/tokensDeclarados.test.ts` recorre **todo**
   `src/**` y falla con cualquier `var(--x)` seco que no exista en
   `src/styles/design-system.css`. Los tokens que el plan anterior usaba
   **`--surface-bg` y `--surface-alt` NO EXISTEN**: son los tokens fantasma que F1 borró,
   y el plan los daba por "declarados en F1". `--severity-warning` **tampoco existe**.
   Para esta fase: `--color-warning`, `--color-warning-a05`, `--color-warning-a12`,
   `--color-warning-a40`, `--color-success`, `--color-success-a14`, `--color-danger`,
   `--accent-primary`, `--color-accent-soft`, `--sidebar-bg`, `--canvas-bg`,
   `--surface-subtle`, `--surface-elevated`, `--border-subtle`, `--text-main`,
   `--text-secondary`, `--text-muted`, `--paper-white`, `--paper-ink`, `--radius-xs/sm/md/lg/full`,
   `--space-1/2/3/4/6/8`, `--text-xs/sm/base/lg`, `--icon-stroke`, `--color-text-primary`,
   `--color-text-secondary`, `--color-text-tertiary`, `--color-border-subtle`, `--shadow-sm`.
4. `npx vitest` **no** type-chequea: `npx tsc --noEmit` aparte, **OBLIGATORIO** en cada
   tarea. Y ojo: `tsconfig.json` tiene `noUnusedLocals: false`, así que el código muerto no
   lo caza `tsc`. Lo caza la Task 4.
5. **Leer un fuente en un test. La regla CORRECTA:**
   - **`.ts` / `.tsx`: `?raw`.** `import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw',
     import: 'default', eager: true })` funciona. Es lo que usan
     `estructuraEstaMontada.test.tsx:48-52` y `tokensDeclarados.test.ts:28-33`.
   - **`.css`: `?raw` NO sirve.** El runner tiene `css: false` (`vite.config.ts:60`), así
     que un glob con `*.css` devuelve **cadena vacía**. Una cadena vacía matchea cero
     reglas y `Math.max(...[])` da `NaN`: la guarda pasa verde sin haber leído una línea.
     Para una hoja: el rodeo del **specifier en variable**,
     `const NODE_FS = 'node:fs'; await import(/* @vite-ignore */ NODE_FS)`, que ya
     hacen `designTokens.test.ts:13-16,25-28`, `noHardcodedColors.test.ts` y
     `exportViewLayout.test.tsx:48-56`.
   - **Por qué funciona el rodeo y no es superstición**: con el specifier **literal** Vite
     lo analiza y lo manda por los shims de browser de `nodePolyfills()`, que no traen
     `readFileSync`; en una **variable** no lo analiza y llega el módulo real.
   - La versión anterior de este plan decía *"nunca `node:fs`"*. **Está mal y ya se
     corrigió en los otros planes.** Decir "nunca `node:fs`" sin decir "para CSS tampoco
     sirve `?raw`" manda a repetir el rodeo del specifier literal, que es el que ya costó
     tres suites enteras que nunca se colectaban. Una regla a medias es peor que ninguna.
6. **NO crees `vitest.config.ts`.** Ya pasó: por precedencia pisa la config del repo.
7. PowerShell no sirve para cirugía por índice de array en archivos largos, y
   **`Set-Content` de PowerShell DESTRUYE el archivo**. Editá por contenido, con la
   herramienta de edición, y `git checkout` para recuperar. **NO uses `git worktree` para
   verificar nada.** Y `Select-String` **no** tiene `-Recurse`: para buscar en un árbol,
   `Select-String -Path (Get-ChildItem -Recurse -Filter '*.tsx').FullName -Pattern 'X'`.
8. `git add` explícito archivo por archivo. **NUNCA `git add -A`.**
9. Después de cada escritura:
   `Select-String -Path <archivos> -Pattern '[\u4e00-\u9fff\uac00-\ud7af\ufffd]'`.
   Comentarios y commits **en español, sin CJK, sin emojis**.
10. **Nada de escribir en el store en cada tecla.** `updateElementImage`,
    `updateElementTable` y `updateElementType` (`src/store/slices/documentSlice.ts:808,825,787`)
    son **llamadas HTTP** (`api.updateElement...`), no mutaciones locales, y cada una
    empuja un `pushHistory` y reemplaza `doc`. Escribir en un `<textarea>` en cada
    `onChange` es un PATCH por pulsación. Todo campo de texto de esta fase: estado local +
    commit en `onBlur` (o debounce de 280 ms, que es lo que ya hace `ImageEditPanel` para
    ancho y alto, `:146-164`).
11. **Los dos temas.** Si esta fase declara un token nuevo, va en `:root` **y** en
    `:root[data-theme="dark"]`. La regla de esta fase es mejor: **no declara ninguno**.
12. **No borres nada que funcione.** `autoCaptionAll`, `SuggestCaptionButton`
    (`ElementInspector.tsx:15-63`), `ProactiveSuggestionCard`, `MiniToolbar`, `PaperCanvas`,
    `ImageEditPanel`, `setTableStyle`, el botón "Siguiente: Referencias"
    (`Step3FiguresTablesWizard.tsx:452-475`): se conservan. Lo que cambia es su montaje.
13. **El rail vive siempre** (`AGENTS.md` §1). Ninguna tarea lo monta condicionalmente.
14. **Test que muerde.** Cada prueba de este plan se **muta**: se rompe el código a
    propósito y se verifica que la prueba se cae. Una prueba que no puede fallar es peor
    que ninguna.

### Baseline medido al 2026-09-28 (no puede bajar)

| verificación | valor |
|---|---|
| `npx vitest run` | **1251 passed, 0 failed** (111 archivos) |
| `npx tsc --noEmit` | limpio (exit 0) |
| `pytest python/tests/ -q` | **809 passed, 14 skipped** |
| `npm run build` | sin error |

> El número que circulaba antes (804) quedó viejo: el medido hoy es **809**. Si una task
> lo baja, es porque una prueba consignaba el defecto, y eso se explica en el mensaje del
> commit. Ninguna phase puede bajar de estos números (spec §3.2).

### Las reglas de §8.4, que son la mitad de por qué el layout se rompe

1. **Todo contenedor con scroll lleva `minHeight: 0` y `minWidth: 0`.** Sin `minHeight: 0`
   un hijo con `flex: 1` dentro de un padre `flex` column no baja de su altura de
   contenido, y el scroller queda en 0 px.
2. **Ningún header lleva `flexShrink: 0` sin `maxHeight`.** El header de
   `Step3FiguresTablesWizard.tsx:180-321` es exactamente eso, y por eso traga la lista.
3. **El diagnóstico exacto de la caja de 0 px está medido y son dos, no una:**
   - `:323` — `<div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>`: **no tiene
     `minHeight: 0`**. Esta es la lista scrolleable, y es la que se queda en 0 px con una
     ventana de 700 px de alto, porque el header de `:180` no cede.
   - `:445` — el contenedor del lienzo tiene `minHeight: 0` pero **no** `minWidth: 0`.
     El spec §8.4 señalaba el `minWidth`; el que falta y mata la altura es el `minHeight`
     de `:323`. **Están los dos, y el del spec no es el que duele.**

---

## Checklist de §8 contra este plan — ESTADO AL 2026-09-28

> **ESTA TABLA ESTÁ EJECUTADA.** Las cinco tasks están hechas y commiteadas. La
> columna de estado es el resultado medido, no una promesa. Donde la ejecución se
> desvió del plan, dice por qué: esas tres filas son las que valen leer.

| §8 | Exigencia | Dónde | Estado |
|---|---|---|---|
| 8.1 | La figura es el eje, el documento es la referencia | Toggle "Ver el documento" apagado por omisión | **Hecho.** `EscenarioFigura.tsx:92-97` (`VISTA_POR_DEFECTO`), y el guardián afirma que `PaperCanvas` NO está montado |
| 8.1 | Miniatura con el tamaño real | `medidaDeFigura` + `ListaContextual` + `EscenarioFigura` | **Hecho.** Cero inventados: el `grep` de `\|\| 12` / `\|\| 8` da **cero** en los dos archivos |
| 8.1 | Leyenda actual **o la ausencia de leyenda dicha** | `ContextoFigura.tieneLeyenda` | **Hecho**, y en tres superficies: lista, escenario e inspector |
| 8.1 | El párrafo anterior | `parrafoAnterior` | **Hecho**, y `null` se dice en palabras en los tres lugares |
| 8.1 | El H1/H2 al que pertenece | `seccionesDeElementos` | **Hecho.** Vive en `jerarquia.ts`, no en `figuras.ts` |
| 8.1 | El buscador busca **también por sección** | `buscarFiguras` | **Hecho**, y también por el H1 completo (ver nota 1) |
| 8.1 | `sectionMap` indexado por **posición** | `ContextoFigura.indice` | **Hecho.** El `Map` por `element_id` no existe |
| 8.1 | La miniatura cae a **placeholder** en `onError` | `MiniaturaFigura` | **Hecho** |
| 8.1 | Las tablas **muestran sus datos** | `DatosDeTabla` + `TablaDelEscenario` | **Hecho** |
| 8.2 | Inspector: tamaño real en cm, alineación, posición | `ImageEditPanel` reescrito | **Hecho** |
| 8.2 | **Aplicar a todas / aplicar a esta** | `aplicarImagenAMuchas` | **Hecho.** No existía de ninguna manera |
| 8.2 | La previsualización usa la geometría de F2 | `mmAPx` + `anchoUtilMm` | **Hecho** |
| 8.2 | Aguanta 20 figuras de golpe | scroller único con `minHeight: 0` | **Hecho para el layout.** El volumen real lo prueba la F7 |
| 8.3 | Se elige la opción **(a)**: reescribir | `ImageEditPanel` | **Hecho.** Los cinco presets, subfiguras, reemplazo de archivo y "Sugerir con IA" siguen |
| 8.3 | `Abrir panel de edición` **navega** y hay un **"volver al inspector"** | `ElementInspector` + `RightSidePanel` | **Hecho.** La fila de la lista y el clic del lienzo ya no abren el panel de imagen |
| 8.3 | Se borra el código muerto | `ElementInspector` | **Hecho**: `APARuleSet`, `portada`/`setPortada`, `TabId` |
| 8.3 | Se deja de escribir en el store en cada tecla | Task 4 Step 2 | **Hecho**: nueve campos, en los dos paneles |
| 8.3 | Se decide si el Inspector aparece en Revisión | Decisión de arquitectura | **Decidido: no en esta fase**, con motivo |
| 8.4 | Scroller con `minHeight: 0` y `minWidth: 0`; ningún header `flexShrink: 0` sin `maxHeight` | `listaContextualLayout.test.ts` | **Hecho** (ver nota 2) |
| 8.4 | Test de caja | `listaContextualLayout.test.ts` | **Hecho como test de código**, no de DOM (ver nota 2) |
| 3.2 | Ningún estado vacío mudo | `EstadoVacio` de F1 | **Hecho**, con el filtro nombrado |
| 3.4 | Ningún identificador interno visible | `data-testid`, nunca el texto | **Hecho**, y hay una prueba que lo afirma |
| 14 | No se reintroduce `ReviewMinimap` | No se importa | **Hecho**, afirmado en dos suites |

### Tres notas de la ejecución, que corrigen al plan

1. **El buscador busca por la miga COMPLETA, no solo por `seccion`.** `seccion` es
   el H2 cuando hay H2, así que una figura de "2.1 Instrumentos" no tiene
   "Metodología" en su `seccion`, y quien escribe "metodología" en el buscador
   quiere las figuras **del capítulo**. Por eso `buscarFiguras` mira `rotulo`,
   `leyenda`, `seccion`, `h1` y `h2`.

2. **La guarda de layout dejó de ser una ventana de caracteres.** La versión del
   plan (`match(/data-testid="..."[\s\S]{0,400}/)`) leía `minWidth: 0` de un `<div>`
   cuatro líneas más abajo y daba **verde con el scroller sin él**. Ahora extrae el
   bloque `style={{...}}` que le sigue al `data-testid` (`estiloDe`), y la regla del
   header se posa sobre **bloques de estilo**, no sobre cualquier `flexShrink: 0`:
   un chip de 56 px con `flexShrink: 0` no se come nada, y una regla que salta con
   los iconos se desactiva sola.

3. **`ANCHO_DE_LA_HOJA_PX` NO se declara dos veces.** El plan pedía `720` en
   `figuras.ts`; `portada/geometria.ts` ya lo declara en `680` con el mismo
   significado. `figuras.ts` lo **reexporta**. Dos constantes con el mismo nombre y
   valores distintos es la forma más común de que dos pantallas digan cosas
   diferentes sobre la misma hoja.

### Lo que la fase NO resolvió, y queda declarado

- El **endpoint en lote** de §8.2: "aplicar a todas" son N llamadas al endpoint que
  ya existe, y el motivo está escrito en el código.
- El **Inspector en Revisión** (§8.3): decidido que no, con motivo.
- El `onError` que dice "No se pudo cargar" cuando la causa real puede ser que el
  backend todavía no escribió el archivo. Esa distinción se decide mirando un caso
  real.
- El **ancho de 280 px** del rail: con bloques de cinco líneas, 320 px sería más
  cómodo, pero cambiar el ancho de una columna que el usuario ya conoce sin verla
  es una decisión de producto, no de plan.

---

| §8 | Exigencia | Dónde |
|---|---|---|
| 8.1 | La figura es el eje, el documento es la referencia | Toggle "Ver el documento" apagado por omisión — arquitectura, Task 3/5 |
| 8.1 | Miniatura con el tamaño real (`width_cm × height_cm`, no `\|\| 12` / `\|\| 8`) | `medidaDeFigura` (Task 1) + `ListaContextual` (Task 2) + `EscenarioFigura` (Task 3) |
| 8.1 | Leyenda actual **o la ausencia de leyenda dicha** | `ContextoFigura.tieneLeyenda` + el bloque lo dice (Task 1, 2, 3) |
| 8.1 | El párrafo anterior | `parrafoAnterior` (Task 1), pintado en la lista (Task 2) y en el escenario (Task 3) |
| 8.1 | El H1/H2 al que pertenece | `seccionesDeElementos` (Task 1), pintado (Task 2, 3) |
| 8.1 | El buscador busca **también por sección** | `buscarFiguras` (Task 1), conectado al buscador de `:253-259` (Task 2) |
| 8.1 | `sectionMap` indexado por **posición**, no por `element_id` | `ContextoFigura.indice` es la identidad (Task 1) — **el plan anterior conservaba el bug intacto** |
| 8.1 | La miniatura cae a **placeholder** en `onError`, no a `visibility: hidden` | `MiniaturaFigura` (Task 2) |
| 8.1 | Las tablas **muestran sus datos**, no un `<Table size={18}/>` | `EscenarioFigura` con `table_info.headers/rows` (Task 3) |
| 8.2 | Inspector: tamaño real en cm, alineación, posición respecto al texto | `ImageEditPanel` reescrito (Task 4) |
| 8.2 | **Aplicar a todas / aplicar a esta** | `aplicarImagenAMuchas` (Task 4) — no existía de ninguna manera |
| 8.2 | La previsualización usa la geometría de F2 | `mmAPx` + `anchoUtilMm` (Task 1, 3) |
| 8.2 | Aguanta 20 figuras de golpe (F7) | `conteosPorTipo` + scroller único con `minHeight: 0` (Task 2), `Review Focus` #4 |
| 8.3 | Se elige la opción **(a)**: reescribir, no borrar | `ImageEditPanel` (Task 4) — el motivo está en la arquitectura |
| 8.3 | `Abrir panel de edición` **navega** y hay un **"volver al inspector"** | Task 4, Step 5 (`RightSidePanel.tsx:246-259`) |
| 8.3 | Se borra el código muerto: `APARuleSet`, `portada`/`setPortada`, `TabId` | Task 4, Step 6 (`ElementInspector.tsx:7,88,85`) |
| 8.3 | Se deja de escribir en el store en cada tecla | Task 4, Step 2 (los `<textarea>` de `ImageEditPanel` y `ElementInspector`) |
| 8.3 | Se decide si el Inspector aparece en Revisión | Decidido arriba: **no en esta fase**, con motivo |
| 8.4 | Todo scroller con `minHeight: 0` y `minWidth: 0`; ningún header `flexShrink: 0` sin `maxHeight` | Reglas de layout + `listaContextualLayout.test.ts` (Task 2) |
| 8.4 | Test de caja: con 700 px de alto la lista scrollea y no mide 0 px | `listaContextualLayout.test.ts` (Task 2) |
| 3.2 | Ningún estado vacío mudo | `EstadoVacio` de F1, no otro (Task 2, 3) |
| 3.4 | Ningún identificador interno visible | `rotuloDeSubtipo` / rótulos de figura, nunca `elem_N` (Task 1, 2) |
| 14 | No se reintroduce `ReviewMinimap` en tres columnas | No se importa. Lo dice la arquitectura |

---

## Review Focus

Cinco entradas que es fácil no cubrir. Cada una tiene una prueba que falla primero.

1. **Una figura sin `width_cm` ni `height_cm`.** El defecto vivo es el default inventado
   `|| 12` / `|| 8`, que aparece **nueve veces** en `ImageEditPanel.tsx`
   (`:137,138,243,346,348,357,359,369,376`) y dos veces en `PaperCanvas.tsx` (`:586-587`).
   Una figura sin tamaño declarado no es una figura de 12 × 8 cm: es una figura **sin
   tamaño declarado**, y la pantalla lo dice. → Task 1 (unidad) y Task 3 (pintado)
2. **Alguien inserta un párrafo arriba del todo en Word.** Los ids son `elem_N`, un índice
   posicional (`src/store/slices/auditSlice.ts:150-154` lo dice con todas las letras). Si
   el contexto de la figura se indexa por `element.id`, la figura "Metodología" pasa a
   decir "Introducción" y el párrafo anterior es el de otro. → Task 1
3. **La miniatura cuya URL responde 404.** Hoy `onError` hace
   `style.visibility = 'hidden'` (`Step3FiguresTablesWizard.tsx:399`) y deja **un hueco de
   48 × 48 sin marco y sin texto**: un agujero que parece un elemento que se está
   cargando y no lo está. → Task 2
4. **Veinte figuras de golpe** (el caso que la F7 le va a meter, §8.2). Y el caso
   espejo: **una sola figura**, donde "aplicar a todas" y "aplicar a esta" son la misma
   acción y el radio no aparece. → Task 4
5. **Una ventana de 700 px de alto.** La lista scrolleable queda en 0 px (diagnóstico
   exacto arriba). Y una tabla: hoy sale un `<Table size={18}/>` (`:412-419`), que no es
   un estado vacío ni un dato: es un adorno. → Task 2 y Task 3

---

### Task 1: La verdad de la figura

Todo lo demás depende de esto, y por eso va primero y **no toca un solo componente**: es
la capa de dato que hoy está embebida en el `useMemo` de
`Step3FiguresTablesWizard.tsx:76-126` y que por eso no se puede probar.

El `sectionMap` de `:89-112` es un `Map<string, {title, level}>` indexado por
`element.id`, y `groupedItems` (`:114-126`) lo consulta por id (`:118`). Eso es el bug que
§8.1 nombra. La solución no es "arreglar el `Map`": es **no tener un `Map` por id**.

**Files:**
- Modify (agregar al final, sin tocar nada de lo que está): `src/lib/jerarquia.ts`
- Create: `src/lib/figuras.ts`
- Test: `src/__tests__/figuras.test.ts` (nuevo), `src/__tests__/jerarquia.test.ts` (extender)

**Interfaces — produce:**

```ts
// src/lib/jerarquia.ts, AL FINAL DEL ARCHIVO. Una sola cosa: qué sección estaba
// abierta en cada punto del documento.

/** La sección que estaba abierta en un punto del documento. */
export interface SeccionVigente {
  /** El H1 vigente, o `null` antes del primer H1. */
  h1: string | null;
  /** El H2 vigente, o `null`. Un H2 hereda su H1 y no abre sección propia. */
  h2: string | null;
  /** `true` para todo lo que está antes del primer H1. */
  enPreambulo: boolean;
}

/**
 * La sección vigente en CADA posición del documento.
 *
 * POR QUÉ UN ARRAY Y NO UN MAP POR `element.id`. Los ids son `elem_N`, un índice
 * posicional que genera el backend (`src/store/slices/auditSlice.ts:150-154`):
 * insertar un párrafo arriba en Word corre TODOS los ids de abajo. Un mapa por id
 * sigue siendo correcto dentro de una pasada —se construye del mismo
 * `doc.elements` que se consulta—, pero la IDENTIDAD que la UI guarda entre
 * pasadas (`selectedElementId`, `setScrollTargetId`) no lo es: después de un
 * refresco, `elem_7` es otro elemento y todo lo que se le colgó a `elem_7` quedó
 * pegado al párrafo equivocado. Es el mismo bug del diff por `element_id` que ya
 * se corrigió recalculando.
 *
 * Un array paralelo al de `elementos` hace la cosa a prueba deRefresh por
 * construcción: si los ids corren, la posición que ocupa la figura también se
 * recalcula, y no hay nada que reconciliar. `elementos[i]` y `salida[i]` son el
 * mismo elemento SIEMPRE, porque se llenaron en la misma vuelta.
 *
 * POR QUÉ VIVE ACÁ Y NO EN `figuras.ts`. El recorrido de encabezados ya existe en
 * este archivo, con la regla de que antes del primer H1 hay preámbulo y de que un
 * H3 no abre sección propia. Una segunda vuelta por los encabezados en otro lado
 * es la segunda regla, y las dos reglas se contradicen el primer día que una cambia.
 */
export function seccionesDeElementos(elementos: readonly ElementModel[]): SeccionVigente[] {
  const salida: SeccionVigente[] = [];
  let h1: string | null = null;
  let h2: string | null = null;
  for (const el of elementos) {
    if (el.type === 'heading') {
      const nivel = Math.max(1, el.heading_level ?? 1);
      if (nivel === 1) {
        h1 = (el.text || '').trim();
        h2 = null;                    // un H1 nuevo cierra el H2 anterior
      } else if (nivel === 2 && h1 !== null) {
        h2 = (el.text || '').trim();  // un H2 antes del primer H1 no abre nada
      }
    }
    salida.push({ h1, h2, enPreambulo: h1 === null });
  }
  return salida;
}
```

```ts
// src/lib/figuras.ts — NUEVO. Sin estado, sin imports de React, sin `any` en la
// firma. Todo derivado de `doc.elements`, en una sola vuelta.

import type { ElementModel } from '../types';
import { seccionesDeElementos } from './jerarquia';
import { anchoUtilMm, mmAPx, type Hoja } from './portada/geometria';

export type TipoFigura = 'image' | 'table';

/**
 * TODO lo que la pantalla necesita saber de una figura, en un solo objeto.
 *
 * `indice` es LA IDENTIDAD. `id` es solo el direccionamiento que pide el backend
 * al mutar, y no se usa para buscar, para agrupar ni para comparar.
 */
export interface ContextoFigura {
  indice: number;              // posición en doc.elements
  id: string;                  // solo para updateElementImage / updateElementTable
  tipo: TipoFigura;
  numero: number;
  rotulo: string;              // "Figura 3" / "Tabla 1"
  leyenda: string;
  tieneLeyenda: boolean;
  seccion: string;             // "Metodología" / "Portada" si es preámbulo
  h1: string | null;
  h2: string | null;
  parrafoAnterior: string | null;   // hasta 200 caracteres, o null
  posicionEnSeccion: number;  // 1-based
  totalEnSeccion: number;
}

/** El ancho de pantalla que se supone al escenario. Es una medida de la PANTALLA,
 *  no de la hoja: lo que define la escala es `medidaDeFigura`, y ahí la hoja entra. */
export const ANCHO_DE_LA_HOJA_PX = 720;

export interface MedidaFigura {
  anchoPx: number;
  altoPx: number;
  /** `false` cuando el elemento NO declara tamaño, y entonces `altoPx` es 0: la
   *  altura la pone la proporción natural del archivo, no un número inventado. */
  declarada: boolean;
}

/**
 * El tamaño de una figura en píxeles de pantalla, a la escala de la hoja de F2.
 *
 * ESTA ES LA FUNCIÓN QUE SUSTITUYE AL `|| 12` / `|| 8`. Y no es lo mismo:
 *
 *   - Si hay `width_cm` y `height_cm`, la caja mide lo que la figura va a medir en
 *     la hoja, en la misma escala con la que la portada calcula su logo
 *     (`escalaDePreview` vía `mmAPx`). Lo que se ve es lo que sale.
 *   - Si NO hay, `declarada` es `false`, `altoPx` es 0 y la vista usa la
 *     proporción natural del archivo. Un 12 × 8 inventado es una figura que MIENTE
 *     sobre su tamaño, y el que la va a exportar mide lo que dice el `.docx`, no
 *     lo que dice la pantalla.
 *
 * `Math.min(..., utilPx)`: una figura más ancha que el ancho útil no sale más
 * ancha en el papel, y una miniatura que se sale de la caja no es una miniatura.
 */
export function medidaDeFigura(
  info: { width_cm?: number; height_cm?: number } | null | undefined,
  anchoPx: number = ANCHO_DE_LA_HOJA_PX,
  hoja: Hoja = 'carta',
): MedidaFigura {
  const utilPx = mmAPx(anchoUtilMm(hoja), anchoPx, hoja);
  const w = info?.width_cm;
  const h = info?.height_cm;
  const declarada = typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0;
  if (!declarada) return { anchoPx: utilPx, altoPx: 0, declarada: false };
  return {
    anchoPx: Math.min(mmAPx(w * 10, anchoPx, hoja), utilPx),
    altoPx: mmAPx(h * 10, anchoPx, hoja),
    declarada: true,
  };
}
```

Las otras cinco exported, sin comentarios largos (el archivo lleva la nota de cabecera
explicando las dos reglas: **la posición es la identidad**, y **un tamaño no declarado se
dice, no se rellena**):

```ts
export const MAX_CARACTERES_PARRAFO_ANTERIOR = 200;

export function contextosDeFiguras(elementos: readonly ElementModel[]): ContextoFigura[];
/** Solo un tipo. El toggle Figuras | Tablas de la UI pasa por acá, no por un filtro
 *  con `includes`. */
export function figurasDeTipo(ctx: readonly ContextoFigura[], tipo: TipoFigura): ContextoFigura[];
/** Busca por rótulo, por leyenda Y POR SECCIÓN (§8.1). Los tres, en una sola pasada. */
export function buscarFiguras(ctx: readonly ContextoFigura[], q: string): ContextoFigura[];
/** La figura activa, o `null`. Por POSICIÓN, no por id. */
export function figuraActiva(ctx: readonly ContextoFigura[], indice: number | null): ContextoFigura | null;
/** Vecina en el orden del documento, dentro del mismo tipo, saltando el filtro. */
export function vecina(ctx: readonly ContextoFigura[], indice: number, paso: 1 | -1): ContextoFigura | null;
```

`contextosDeFiguras` hace **una sola vuelta** sobre `elementos`, con
`seccionesDeElementos(elementos)` ya calculado, y una segunda vuelta Chiquita para
`posicionEnSeccion` / `totalEnSeccion` (que no se saben hasta el final). `parrafoAnterior`
sale de mirar hacia atrás desde `i` el primer elemento de
`paragraph | bullet | numbered_list | block_quote` con texto y `!is_cover_section`, y se
corta a `MAX_CARACTERES_PARRAFO_ANTERIOR`. Si no hay ninguno, `null` — que es distinto de
`''`, porque `''` es "hay un párrafo vacío" y `null` es "no hay párrafo anterior".

> **El `seccion` de una figura de la portada.** `is_cover_section` se filtra en el
> recorrido (`seccionesDeElementos` no lo necesita; `contextosDeFiguras` sí, y por eso los
> logotipos de la portada no aparecen en esta fase). Lo que queda antes del primer H1
> sigue siendo un contexto real y se nombra "Portada", no "Sin sección".

- [x] **Step 1: El test que falla primero**

`src/__tests__/figuras.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  contextosDeFiguras, figurasDeTipo, buscarFiguras, figuraActiva, vecina,
  medidaDeFigura, ANCHO_DE_LA_HOJA_PX,
} from '../lib/figuras';
import { seccionesDeElementos } from '../lib/jerarquia';
import { anchoUtilMm, HOJA_CARTA_MM } from '../lib/portada/geometria';
import type { ElementModel } from '../types';

let secuencia = 0;
const el = (o: Partial<ElementModel> & { type: ElementModel['type']; text: string }): ElementModel =>
  ({ id: `elem_${++secuencia}`, style_name: '', alignment: 'left', font_name: 'Times New Roman',
     font_size: 12, is_bold: false, is_italic: false, is_bullet: false, left_indent_cm: 0,
     confidence: 1, is_user_modified: false, cita_ids: [], needs_review: false,
     auto_applied: false, ...o }) as ElementModel;

const h1 = (t: string) => el({ type: 'heading', heading_level: 1, text: t });
const h2 = (t: string) => el({ type: 'heading', heading_level: 2, text: t });
const p = (t: string) => el({ type: 'paragraph', text: t });
const fig = (n: number, extra: Record<string, unknown> = {}) =>
  el({ type: 'image', text: `Figura ${n}`, image_info: { figure_number: n, caption: '', relative_url: '', ...extra } as never });
const tabla = (n: number) =>
  el({ type: 'table', text: `Tabla ${n}`, table_info: { table_number: n, caption: '', headers: [], rows: [] } as never });

const DOC: ElementModel[] = [
  h1('1. Introducción'),
  p('Primer parrafo de la introduccion con sus palabras'),
  h2('1.1 Antecedentes'),
  fig(1, { caption: 'Diagrama del proceso', width_cm: 14, height_cm: 9 }),
  h1('2. Metodología'),
  h2('2.1 Instrumentos'),
  p('Se aplico un cuestionario a doscientos estudiantes'),
  fig(2),
  tabla(1),
];

describe('seccionesDeElementos', () => {
  it('devuelve UNA ENTRADA POR ELEMENTO, en el mismo orden', () => {
    expect(seccionesDeElementos(DOC)).toHaveLength(DOC.length);
  });

  it('la figura de Antecedentes cuelga de su H2, no del H1 que la precede', () => {
    const sec = seccionesDeElementos(DOC)[3];
    expect(sec).toEqual({ h1: '1. Introducción', h2: '1.1 Antecedentes', enPreambulo: false });
  });

  it('un H3 no abre seccion propia: hereda el H2 que ya estaba', () => {
    const conH3 = [h1('1. Metodologia'), h2('1.1 Instrumentos'), el({ type: 'heading', heading_level: 3, text: '1.1.1 Detalle' }), p('x')];
    expect(seccionesDeElementos(conH3)[3].h2).toBe('1.1 Instrumentos');
  });

  it('antes del primer H1 el ambito es el preambulo, y un H2 suelto no lo abre', () => {
    const pre = [h2('Portada interna'), fig(1), h1('1. Introducción')];
    expect(seccionesDeElementos(pre)[0]).toEqual({ h1: null, h2: null, enPreambulo: true });
    expect(seccionesDeElementos(pre)[1].enPreambulo).toBe(true);
  });
});

describe('contextosDeFiguras — la POSICION es la identidad', () => {
  it('el contexto lleva indice, seccion, parrafo anterior y posicion en seccion', () => {
    const ctx = contextosDeFiguras(DOC);
    const segunda = ctx.find((c) => c.numero === 2)!;
    expect(segunda.h1).toBe('2. Metodología');
    expect(segunda.h2).toBe('2.1 Instrumentos');
    expect(segunda.seccion).toBe('2.1 Instrumentos');
    expect(segunda.parrafoAnterior).toBe('Se aplico un cuestionario a doscientos estudiantes');
    expect(segunda.posicionEnSeccion).toBe(1);
    expect(segunda.totalEnSeccion).toBe(1);
  });

  it('INSERTAR UN PARRAFO ARRIBA EN WORD NO CORTA LA SECCION DE LA FIGURA', () => {
    /* El Review Focus #2, y el bug de §8.1. Los ids son posicionales
       (`auditSlice.ts:150-154`), asi que al insertar arriba TODOS los ids de abajo
       corren. Un mapa por `element.id` sigue al id y se equivoca. Uno por posicion,
       no: la figura sigue siendo la misma figura y con la misma seccion. */
    const antes = contextosDeFiguras(DOC).find((c) => c.numero === 2)!;
    const corridos = DOC.map((e, i) => (i === 0 ? { ...e, id: 'elem_999' } : { ...e, id: `elem_${i + 40}` }));
    const despues = contextosDeFiguras([p('Parrafo nuevo en el tope'), ...corridos]).find((c) => c.numero === 2)!;
    expect(despues.seccion).toBe(antes.seccion);
    expect(despues.h1).toBe(antes.h1);
    expect(despues.parrafoAnterior).toBe(antes.parrafoAnterior);
  });

  it('el logos de la portada no es una figura de esta fase', () => {
    const conPortada = [h1('1. Introduccion'), el({ type: 'image', is_cover_section: true, text: 'Logo', image_info: { figure_number: 1, caption: '', relative_url: '' } as never })];
    expect(contextosDeFiguras(conPortada)).toHaveLength(0);
  });

  it('sin leyenda dice que NO HAY leyenda, y no inventa un texto', () => {
    const ctx = contextosDeFiguras(DOC).find((c) => c.numero === 2)!;
    expect(ctx.tieneLeyenda).toBe(false);
    expect(ctx.leyenda).toBe('');
  });

  it('el parrafo anterior se corta y el que no hay es null, no cadena vacia', () => {
    const largo = p('palabra '.repeat(80));
    const conCorte = [h1('1. Metodologia'), largo, fig(1)];
    const c = contextosDeFiguras(conCorte)[0];
    expect(c.parrafoAnterior).toHaveLength(200);
    expect(contextosDeFiguras([h1('1. Metodologia'), fig(1)])[0].parrafoAnterior).toBeNull();
  });
});

describe('el buscador (§8.1: busca tambien por seccion)', () => {
  const ctx = contextosDeFiguras(DOC);

  it('encuentra por numero, por leyenda y por seccion', () => {
    expect(buscarFiguras(ctx, 'Figura 1').map((c) => c.numero)).toEqual([1]);
    expect(buscarFiguras(ctx, 'diagrama').map((c) => c.numero)).toEqual([1]);
    /* La que el buscador de hoy no puede encontrar: el buscador de
       `Step3FiguresTablesWizard.tsx:76-87` solo mira `Figura N` y `caption`. */
    expect(buscarFiguras(ctx, 'instrumentos').map((c) => c.numero)).toEqual([2]);
    expect(buscarFiguras(ctx, 'metodolog').map((c) => c.numero)).toEqual([2]);
  });

  it('una cadena vacia devuelve todo, y una sin coincidencias devuelve la lista vacia', () => {
    expect(buscarFiguras(ctx, '   ')).toHaveLength(ctx.length);
    expect(buscarFiguras(ctx, 'zzz')).toEqual([]);
  });
});

describe('medidaDeFigura — sin tamano inventado', () => {
  it('con tamano declarado, la caja sale de la geometria de F2, no de un literal', () => {
    const utilMm = anchoUtilMm('carta');
    const escala = ANCHO_DE_LA_HOJA_PX / HOJA_CARTA_MM.ancho;
    const m = medidaDeFigura({ width_cm: 14, height_cm: 9 });
    expect(m.declarada).toBe(true);
    expect(m.anchoPx).toBeCloseTo(140 * escala, 4);
    expect(m.altoPx).toBeCloseTo(90 * escala, 4);
    /* Y entra en la hoja: el ancho util de una carta son 16.51 cm. */
    expect(140).toBeLessThan(utilMm);
  });

  it('SIN tamano declarado NO inventa 12 x 8: lo dice y devuelve la caja sin alto', () => {
    const m = medidaDeFigura({});
    expect(m.declarada).toBe(false);
    expect(m.altoPx).toBe(0);
    /* El defecto exacto que se mata: `|| 12` y `|| 8`. */
    expect(m.anchoPx).not.toBe(120 * (ANCHO_DE_LA_HOJA_PX / HOJA_CARTA_MM.ancho));
  });

  it('una figura mas ancha que la hoja no se sale de la caja', () => {
    const m = medidaDeFigura({ width_cm: 40, height_cm: 30 });
    expect(m.anchoPx).toBeCloseTo(ANCHO_DE_LA_HOJA_PX, 6);
  });
});

describe('navegar y elegir', () => {
  const ctx = contextosDeFiguras(DOC);
  it('la figura activa se busca por indice, y un indice muerto da null', () => {
    expect(figuraActiva(ctx, ctx[1].indice)?.numero).toBe(1);
    expect(figuraActiva(ctx, 9999)).toBeNull();
    expect(figuraActiva(ctx, null)).toBeNull();
  });
  it('la vecina salta de tipo antes que de documento', () => {
    /* Figura 1, Figura 2, Tabla 1. De la Figura 2 la siguiente es la Tabla 1, no
       un id de la lista completa: el toggle Figuras | Tablas tiene que poder
       recorrerse entero sin pasar por el otro tipo. */
    const figs = figurasDeTipo(ctx, 'image');
    expect(vecina(figs, figs[0].indice, 1)?.numero).toBe(2);
    expect(vecina(figs, figs[1].indice, 1)).toBeNull();
    expect(figs).toHaveLength(2);
  });
});
```

- [x] **Step 2: Implementar**

`seccionesDeElementos` al final de `src/lib/jerarquia.ts` (el archivo tiene 504 líneas y
termina en `preambuloDe`). `src/lib/figuras.ts` nuevo, con el bloque de interfaces y
`medidaDeFigura` de arriba y las otras cinco funciones.

`posicionEnSeccion` y `totalEnSeccion` se resuelven en una segunda vuelta sobre el arreglo
ya construido, agrupando por la clave `h1 + '\u0000' + h2`. **La clave de agrupación
incluye el H1**, porque dos "2.1 Instrumentos" de capítulos distintos son dos secciones
distintas, y agruparlas por el H2 solo junta dos capítulos en un bloque.

- [x] **Step 3: Verificar que las pruebas MUERDEN**

```bash
npx vitest run src/__tests__/figuras.test.ts src/__tests__/jerarquia.test.ts
```

Y **mutar antes de dar la task por buena**: cambiá `seccionesDeElementos` para que use
`element.id` como clave de un `Map` y corré el caso "INSERTAR UN PARRAFO ARRIBA". Si pasa,
la prueba no está probando lo que dice probar. Después dejalo como estaba.

```bash
npx tsc --noEmit
Select-String -Path 'src/lib/figuras.ts','src/lib/jerarquia.ts' -Pattern '[\u4e00-\u9fff\uac00-\ud7af\ufffd]'
```

- [x] **Step 4: Commit**

```bash
git add src/lib/jerarquia.ts src/lib/figuras.ts src/__tests__/figuras.test.ts src/__tests__/jerarquia.test.ts
git commit -m "figuras: el contexto de una figura es su posicion, no su id

Los ids son elem_N, un indice posicional: insertar un parrafo arriba en Word
corre todos los ids de abajo y un sectionMap indexado por element_id queda
pegado al parrafo equivocado. Es el mismo bug del diff por element_id que ya
se corrigio recalculando, y se corrige igual.

seccionesDeElementos devuelve una entrada por elemento, en el mismo orden, y
vive junto al recorrido de encabezados que ya existe para que no haya una
segunda regla de que es un capitulo.

medidaDeFigura saca el tamano de la geometria de F2 y, cuando el elemento no
declara tamano, lo dice en vez de inventar 12 x 8. Un tamano inventado es una
figura que miente sobre lo que va a salir en el .docx."
```

---

### Task 2: El eje — la lista contextual

Acá el documento deja de ser el centro. El rail de 280 px deja de ser una lista plana de
`Figura N` y pasa a ser la respuesta a "¿esta figura tiene contexto o está perdida?".

**Files:**
- Create: `src/components/figures/ListaContextual.tsx`
- Modify: `src/components/wizard/Step3FiguresTablesWizard.tsx` (el rail: `:159-439`)
- Modify: `src/__tests__/noHardcodedColors.test.ts` (`DIRECTORIOS_R3`, `:166-174`)
- Test: `src/__tests__/listaContextual.test.tsx` (nuevo),
  `src/__tests__/listaContextualLayout.test.ts` (nuevo, el test de caja)

**Lo que hay que hacer antes de escribir una línea nueva, y es lo que el plan anterior no
dijo:** `src/components/figures/` es una carpeta **fuera del alcance de R3**
(`noHardcodedColors.test.ts:166-174`). Crearla sin sumarla deja el lint mirando todo
menos el código nuevo. Se suma primero, con una prueba que afirme que la carpeta está en
el alcance —porque un alcance que se encoge no se nota:

```ts
// En noHardcodedColors.test.ts, junto a las otras pruebas de R3:
it('la carpeta de figuras esta en el alcance de R3', () => {
  /* Una carpeta nueva fuera de la lista es una carpeta donde un color literal no
     rompe nada. El lint tiene que crecer con el alcance, no al reves. */
  expect(DIRECTORIOS_R3).toContain('components/figures');
});
```

**El bloque por elemento.** Por cada figura o tabla, y en este orden:

1. **Miniatura con el tamaño real.** `<img>` con
   `width: medida.anchoPx` y `height: medida.altoPx` de `medidaDeFigura`, con
   `maxWidth` para que no reviente la caja de 280 px. Si `declarada` es `false`, la
   miniatura **no tiene alto fijo** y lleva debajo la línea "sin tamaño declarado".
2. **La leyenda, o su ausencia dicha.** Con leyenda: el texto en cursiva, una línea.
   Sin leyenda: `Sin leyenda - APA 7 la exige`, en `var(--color-warning)`. El texto
   "Sin leyenda" **no es un adorno**: es el estado, dicho (spec §3.6, §8.1).
3. **El H1/H2.** Una línea con el breadcrumb de la sección.
4. **El párrafo anterior.** Hasta 200 caracteres, en `var(--text-muted)`, y `null` se
   pinta como "Es la primera figura de la sección, sin párrafo que la presente" — no como
   una línea vacía.
5. El rótulo y el estado de revisión, como hoy.

**El `onError` de la miniatura.** Hoy `Step3FiguresTablesWizard.tsx:399` hace
`style.visibility = 'hidden'` y deja un hueco de 48 × 48 sin marco ni texto: un agujero
que parece una carga. Se reemplaza por estado: un `<div>` con
`backgroundColor: 'var(--surface-subtle)'`, `border: '1px solid var(--border-subtle)'`,
ícono `ImageOff` de `lucide-react` y la línea **"No se pudo cargar la miniatura"**. La caja
mide lo mismo con y sin imagen, así que la lista no salta.

**Las tablas en la lista.** Una tabla no tiene miniatura: sale un bloque con
`Tabla N`, su leyenda o su ausencia, y **las dos primeras filas y tres columnas de
`table_info.rows`**, con el rótulo "`3 de 12 filas`" si hay más. Un `<Table size={18}/>`
no es un dato ni un estado vacío: es un adorno, y el spec §8.1 lo pide fuera de pantalla.

**El buscador.** `Step3FiguresTablesWizard.tsx:253-259` (el `<input>`) se conserva y su
`value`/`onChange` se cablean a `query`; lo que cambia es el filtro: pasa `buscarFiguras`
de Task 1, que además mira la sección. El placeholder (`:257`) pasa a
`Buscar por número, título o sección…` porque ahora el buscador busca eso.

**Los controles de tabla** de `:281-313` **se conservan donde están**: el selector de
estilo académico (`setTableStyle`, `documentSlice.ts:248`) y el contexto. La tabla ya
tiene su control de diseño y F4 no lo toca. Lo que se agrega es la fila por tabla.

**El botón "Leyendas IA para todo"** (`:187-213`) se conserva tal cual, incluido su
`Loader2` y su `disabled`. Es `autoCaptionAll` (`auditSlice.ts:213`) y funciona.

**El estado vacío.** `:324-348` es un estado vacío escrito a mano, con su propio ícono y
sus dos textos. Se **borra** y se usa `EstadoVacio` de F1
(`src/components/shared/estadoVacio.tsx:66`, `data-testid="estado-vacio"`), con:

| Situación | `motivo` | `accion` |
|---|---|---|
| No hay documento | `sin-documento` | — |
| Hay documento y el filtro dejó la lista vacía | `sin-resultados` con `filtroActivo` = `"<texto del buscador>"` o `"Pendientes"` | botón "Quitar el filtro" que limpia `query` y `onlyReview` |
| No hay figuras (o no hay tablas) en el documento | `sin-resultados` con `filtroActivo` = `"Figuras"` / `"Tablas"` | — |

> Los cuatro motivos de `EstadoVacio` son `sin-documento`, `sin-motor`,
> `sin-resultados` y `sin-seleccion` (`estadoVacio.tsx:19`). El de esta pantalla es
> `sin-resultados` con el filtro nombrado, que es el único que arma su texto con un dato
> (`:72-75`). **`sin-motor` no aplica acá**: esta pantalla no es un resultado de motor. Y
> el texto de `:324-348` —"Ningún elemento coincide con la búsqueda o el filtro de
> pendientes"— se pierde, pero lo que decía sigue dicho, con el filtro nombrado.

**El layout, y las cajas de §8.4.** El header del rail pasa de `:180-321` a un header con
`flexShrink: 0` **y `maxHeight`** (`:180` mide hoy el alto de todo: título, botón de IA,
toggle, buscador, controles de tabla y contador de pendientes). Y la lista de `:323` recibe
las dos que le faltan:

```tsx
{/* El scroller. Las dos cajas que le faltan hoy: sin minHeight un flex:1 dentro de
    un padre column no baja de su alto de contenido, y con el header sin maxHeight
    la lista queda en 0 px con una ventana de 700 px de alto. */}
<div
  data-testid="lista-figuras-scroller"
  style={{ flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto', padding: 'var(--space-2)' }}
>
```

**El colapsado.** `:159-173` (el rail de 40 px con un botón) y el `listCollapsed` de `:45`
se conservan. El `PanelRight` de `:214-222` también.

- [x] **Step 1: El test que falla primero**

`src/__tests__/listaContextual.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ListaContextual } from '../components/figures/ListaContextual';
import { contextosDeFiguras } from '../lib/figuras';
import type { ElementModel } from '../types';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn((p?: string | null) => (p ? `https://x/${p}` : null)),
  syncAllProviderKeys: vi.fn().mockResolvedValue({ ok: true, applied: [] }),
}));

let n = 0;
const el = (o: Partial<ElementModel> & { type: ElementModel['type']; text: string }): ElementModel =>
  ({ id: `elem_${++n}`, style_name: '', alignment: 'left', font_name: 'Times New Roman',
     font_size: 12, is_bold: false, is_italic: false, is_bullet: false, left_indent_cm: 0,
     confidence: 1, is_user_modified: false, cita_ids: [], needs_review: false,
     auto_applied: false, ...o }) as ElementModel;

const DOC: ElementModel[] = [
  el({ type: 'heading', heading_level: 1, text: '2. Metodología' }),
  el({ type: 'heading', heading_level: 2, text: '2.1 Instrumentos' }),
  el({ type: 'paragraph', text: 'Se aplico un cuestionario a doscientos estudiantes' }),
  el({ type: 'image', text: 'Figura 1', image_info: { figure_number: 1, caption: 'Diagrama del balance', relative_url: 'a.png', width_cm: 14, height_cm: 9 } as never }),
  el({ type: 'image', text: 'Figura 2', image_info: { figure_number: 2, caption: '', relative_url: 'b.png' } as never }),
];

const props = (extra: Partial<React.ComponentProps<typeof ListaContextual>> = {}) => ({
  contextos: contextosDeFiguras(DOC),
  tipo: 'image' as const,
  onTipoChange: vi.fn(),
  query: '',
  onQueryChange: vi.fn(),
  soloPendientes: false,
  onSoloPendientesChange: vi.fn(),
  indiceActivo: 3,
  onSelectIndice: vi.fn(),
  onAutoCaption: vi.fn(),
  autoCaptionCargando: false,
  hayDocumento: true,
  ...extra,
});

describe('el bloque de contexto de una figura', () => {
  it('dice la seccion, la leyenda, el tamano y el parrafo anterior', () => {
    render(<ListaContextual {...props()} />);
    const bloque = screen.getByTestId('contexto-elem_4');
    expect(bloque.textContent).toMatch(/2\.1 Instrumentos/);
    expect(bloque.textContent).toMatch(/Diagrama del balance/);
    expect(bloque.textContent).toMatch(/14\s*[x×]\s*9\s*cm/);
    expect(bloque.textContent).toMatch(/Se aplico un cuestionario/);
  });

  it('UNA FIGURA SIN LEYENDA DICE QUE NO TIENE LEYENDA, y no deja la linea vacia', () => {
    render(<ListaContextual {...props()} />);
    const bloque = screen.getByTestId('contexto-elem_5');
    expect(bloque.textContent).toMatch(/sin leyenda/i);
    /* Y no hay un hueco mudo donde deberia estar la leyenda. */
    expect(bloque.textContent).toMatch(/apa 7/i);
  });

  it('una figura SIN tamano declarado lo dice, y no muestra 12 x 8', () => {
    render(<ListaContextual {...props()} />);
    const bloque = screen.getByTestId('contexto-elem_5');
    expect(bloque.textContent).toMatch(/sin tamaño declarado/i);
    expect(bloque.textContent).not.toMatch(/12\s*[x×]\s*8/);
  });
});

describe('la miniatura que no carga', () => {
  it('el onError cae a un placeholder CON marco y CON texto, no a un hueco invisible', () => {
    /* El defecto de `Step3FiguresTablesWizard.tsx:399`: `visibility: hidden` deja
       un cuadro de 48 x 48 sin marco y sin texto, que parece una carga. */
    render(<ListaContextual {...props()} />);
    const img = screen.getByRole('img', { name: /Figura 1/ });
    fireEvent.error(img);
    const reserva = screen.getByTestId('miniatura-de-reserva');
    expect(reserva.textContent).toMatch(/no se pudo cargar/i);
    /* Y el hueco sigue siendo un hueco con marco, no una absence. */
    expect(screen.queryByRole('img', { name: /Figura 1/ })).toBeNull();
  });
});

describe('la tabla muestra sus datos, no un icono', () => {
  it('enseña las primeras filas y dice cuantas faltan', () => {
    const conTabla = [...DOC,
      el({ type: 'table', text: 'Tabla 1', table_info: {
        table_number: 1, caption: 'Resultados', note: '',
        headers: ['Grupo', 'n', 'Media'],
        rows: [['A', '30', '4.2'], ['B', '30', '3.9'], ['C', '30', '4.0'], ['D', '30', '2.1']],
      } as never })];
    render(<ListaContextual {...props({ contextos: contextosDeFiguras(conTabla), tipo: 'table' })} />);
    expect(screen.getByText(/Grupo/)).toBeTruthy();
    expect(screen.getByText('4.2')).toBeTruthy();
    expect(screen.getByText(/3 de 4 filas/)).toBeTruthy();
  });
});

describe('el buscador y los estados vacios', () => {
  it('sin documento, el motivo es sin-documento', () => {
    render(<ListaContextual {...props({ hayDocumento: false, contextos: [] })} />);
    expect(screen.getByTestId('estado-vacio').textContent).toMatch(/documento/i);
  });

  it('con filtro que no deja nada, el motivo NOMBRA el filtro', () => {
    render(<ListaContextual {...props({ contextos: [], query: 'zzz' })} />);
    const texto = screen.getByTestId('estado-vacio').textContent ?? '';
    expect(texto).toMatch(/filtro/i);
    expect(texto).toMatch(/zzz/);
  });
});
```

`src/__tests__/listaContextualLayout.test.ts` — el test de caja de §8.4. **Es un test de
código, no de DOM**: jsdom no mide cajas, y un test que finge medirlas mintiendo también.
Se lee el fuente con `?raw` (que sí funciona en `.tsx`, Global Constraint 5) y se afirman
las tres reglas:

```ts
/**
 * El layout de la lista, afirmado sobre el FUENTE y no sobre el DOM.
 *
 * jsdom no calcula cajas: `getBoundingClientRect` devuelve ceros siempre. Un test
 * que "mide" en jsdom no mide, pasa por la forma del assert y no vigila nada. Lo
 * que sí se puede afirmar sin mentir son las TRES reglas que, si no se cumplen,
 * producen el defecto de §8.4 — y se afirman sobre el código que las tiene que
 * cumplir, no sobre una suposición.
 *
 * LECTOR: `?raw` sobre `.tsx`, que es lo que funciona. NO sirve para `.css` —el
 * runner tiene `css: false`—; para una hoja va el rodeo del specifier en variable
 * que ya usan `designTokens.test.ts:13-16`.
 */
import { describe, it, expect } from 'vitest';
import { NO_HARDCODEADO } from './helpers/fuentesDelDisco';

const FUENTES = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
  as Record<string, string>;

const lista = FUENTES['/src/components/figures/ListaContextual.tsx'];
const paso = FUENTES['/src/components/wizard/Step3FiguresTablesWizard.tsx'];

describe('§8.4: nada se tapa y ninguna lista queda en 0 px', () => {
  it('el glob esta leyendo de verdad', () => {
    expect(Object.keys(FUENTES).length).toBeGreaterThan(100);
    expect(lista).toBeTruthy();
  });

  it('el scroller de la lista lleva minHeight: 0 y minWidth: 0', () => {
    const scroller = lista.match(/data-testid="lista-figuras-scroller"[\s\S]{0,400}/)?.[0] ?? '';
    expect(scroller).toMatch(/minHeight:\s*0/);
    expect(scroller).toMatch(/minWidth:\s*0/);
    expect(scroller).toMatch(/overflowY:\s*'auto'/);
  });

  it('NINGUN header lleva flexShrink: 0 sin maxHeight al lado', () => {
    /* El header del rail de hoy (`Step3FiguresTablesWizard.tsx:180-321`) es
       exactamente eso, y con una ventana de 700 px de alto se come la lista. */
    for (const [ruta, fuente] of [['/src/components/figures/ListaContextual.tsx', lista], ['/src/components/wizard/Step3FiguresTablesWizard.tsx', paso]] as const) {
      const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, '$1');
      const occurrences = sinComentarios.match(/flexShrink:\s*0/g) ?? [];
      for (const _ of occurrences) {
        const ventana = sinComentarios.slice(sinComentarios.indexOf('flexShrink: 0'), sinComentarios.indexOf('flexShrink: 0') + 260);
        expect(ventana, `${ruta}: flexShrink: 0 sin maxHeight`).toMatch(/maxHeight/);
      }
    }
  });

  it('el contenedor del escenario lleva minWidth: 0, que es lo que faltaba en :445', () => {
    const scroller = lista.match(/data-testid="escenario-scroller"[\s\S]{0,400}/)?.[0] ?? '';
    expect(scroller).toMatch(/minWidth:\s*0/);
  });

  it('NO se importa ReviewMinimap en la fase de figuras', () => {
    /* Spec §14 y AGENTS.md §1. Vive en `src/components/review/` desde F1 y no
       vuelve a un layout de tres columnas. */
    expect(lista).not.toMatch(/ReviewMinimap/);
    expect(paso).not.toMatch(/ReviewMinimap/);
  });
});
```

> Si el helper `NO_HARDCODEADO` no existe, **no lo crees**: el bloque de arriba ya trae su
> propio `import.meta.glob`, que es exactamente lo que usa
> `estructuraEstaMontada.test.tsx:48-52`. Dos helpers para leer el disco es la segunda
> copia.

- [x] **Step 2: Implementar `ListaContextual.tsx`**

```ts
export interface ListaContextualProps {
  contextos: readonly ContextoFigura[];
  tipo: TipoFigura;
  onTipoChange: (t: TipoFigura) => void;
  query: string;
  onQueryChange: (q: string) => void;
  soloPendientes: boolean;
  onSoloPendientesChange: (v: boolean) => void;
  /** La figura activa, por POSICIÓN. `null` es "no hay ninguna elegida". */
  indiceActivo: number | null;
  onSelectIndice: (indice: number) => void;
  onAutoCaption: () => void;
  autoCaptionCargando: boolean;
  hayDocumento: boolean;
  /** El filtro que dejó la lista vacía, para que `EstadoVacio` lo nombre. */
  filtroActivo: string | null;
}
```

Componente puro, sin store. La lista y la selección las decide quien compone, y por eso el
componente se puede probar sin montar `App`.

Orden interno:
1. `<header>` con `flexShrink: 0` **y** `maxHeight`, título con el conteo, botón
   "Leyendas IA para todo" (que se lo pasa el padre), botón de colapsar.
2. Toggle `Figuras (n) | Tablas (n)`.
3. `<input>` del buscador + botón "Pendientes".
4. Controles de tabla, **solo** si `tipo === 'tables'`: se los pasa el padre como
   `children`, para que el componente no conozca `setTableStyle`.
5. `<div data-testid="lista-figuras-scroller">` con la lista o el `EstadoVacio`.

Cada fila es un `<button>` con `data-testid={'contexto-' + c.id}` (el id va en el
`data-testid` y **no** en el texto: §3.4, ningún identificador interno visible), y su
contenido es el bloque de cinco puntos de más arriba.

- [x] **Step 3: Reensamblar el rail de `Step3FiguresTablesWizard.tsx`**

Sustituir `:159-439` por el `<ListaContextual>`. **Lo que se borra y lo que se queda,
punto por punto** (esta tabla es la que evita el `git checkout` a mitad de camino):

| Hoy | Qué pasa |
|---|---|
| `:9-14` `type SectionGroup` | **se borra**. Lo reemplaza `ContextoFigura` |
| `:42-45` estado local | **se queda**, y `activeElementId` **se cambia por `indiceActivo: number \| null`** (§8.1) |
| `:46-57` hooks del store | **se quedan** |
| `:64-70` `figures` / `tables` / `needsReview` | **se quedan** |
| `:72-73` `currentItems` / `currentReview` | **se queda** |
| `:76-87` `filteredItems` | **se borra**: lo reemplaza `buscarFiguras` de Task 1, que además busca por sección |
| `:89-112` `sectionMap` | **se borra**: lo reemplaza `seccionesDeElementos` |
| `:114-126` `groupedItems` | **se reescribe** sobre `contextos`; la agrupación por sección la hace `ListaContextual` |
| `:129-138` `handleElementClick` | **se queda**, pero **sin** `setImagePanelOpen(true)` (`:133`): tocar una figura ya no te expulsa del inspector (Task 4) |
| `:140-154` `imageActions` | **se queda**: es el `MiniToolbar` del documento |
| `:159-173` rail colapsado | **se queda** |
| `:180-321` header del rail | **se va a `ListaContextual`**, con `maxHeight` |
| `:187-213` "Leyendas IA para todo" | **se queda**, pasa como `onAutoCaption` |
| `:223-240` botón "Editar" | **se queda** (es el que navega al inspector, Task 4) |
| `:243-246` toggle Figuras \| Tablas | **se va a `ListaContextual`** |
| `:250-279` buscador + Pendientes | **se va a `ListaContextual`**, con el placeholder nuevo |
| `:281-313` controles de tabla | **se quedan**, como `children` |
| `:315-319` contador de pendientes | **se va a `ListaContextual`**, junto al bloque |
| `:323` el scroller | **se va a `ListaContextual`**, con `minHeight: 0` y `minWidth: 0` |
| `:324-348` estado vacío propio | **se borra**: va `EstadoVacio` |
| `:349-436` la lista | **se va a `ListaContextual`** |
| `:374-384` el `onClick` de la fila | **se va a `ListaContextual`**, y **sin** `setImagePanelOpen(true)` ni `setForceRightPanelOpen(true)`: la selección ya no abre nada por sorpresa |
| `:445-476` contenedor del lienzo | **se queda** (lo reorganiza la Task 3) |
| `:452-475` "Siguiente: Referencias" | **se queda** |
| `:481-486` `MiniToolbar` | **se queda** |

Sobre `:374-384`: quitar `setImagePanelOpen(true)` (`:379`) y `setForceRightPanelOpen(true)`
(`:381-383`) **es el cambio que mata la cuarta columna**, y es de esta fase y no de la
siguiente: mientras sigan ahí, hacer clic en una figura te saca del inspector, que es el
defecto de §8.3. El `RightSidePanel.tsx:84` sigue abriendo el panel ante una selección, y
eso se decide en la Task 4.

- [x] **Step 4: Verificar**

```bash
npx vitest run src/__tests__/listaContextual.test.tsx src/__tests__/listaContextualLayout.test.ts src/__tests__/noHardcodedColors.test.ts
npx tsc --noEmit
```

**Y mutar las dos guardas de layout**: sacale el `minHeight: 0` al scroller y corré
`listaContextualLayout.test.ts`. Si sigue verde, no está vigilando.

- [x] **Step 5: Commit**

```bash
git add src/components/figures/ListaContextual.tsx \
        src/components/wizard/Step3FiguresTablesWizard.tsx \
        src/__tests__/noHardcodedColors.test.ts \
        src/__tests__/listaContextual.test.tsx \
        src/__tests__/listaContextualLayout.test.ts
git commit -m "figuras: la lista es el eje, y cada figura muestra su contexto

La lista plana pasa a decir, por elemento, el tamano real, la leyenda o la
ausencia de leyenda dicha, el parrafo anterior y el H1/H2 al que pertenece.
El buscador ahora busca tambien por seccion.

El sectionMap indexado por element_id se va: los ids son posicionales y se
corren cuando Word inserta arriba. El contexto de la figura se indexa por
posicion, y la figura activa se elige por posicion.

La miniatura que no carga cae a un placeholder con marco y con texto, no a un
hueco invisible que parece una carga. Las tablas enseñan sus filas.

El estado vacio propio se borra y va el de F1, que nombra el filtro. El
scroller recibe minHeight: 0 y minWidth: 0, y ningun header lleva flexShrink: 0
sin maxHeight: con una ventana de 700 px la lista quedaba en 0 px.

components/figures entra al alcance de R3, que no tiene deuda: una carpeta
fuera de la lista es una carpeta donde un color literal no rompe nada."
```

---

### Task 3: El escenario — una figura a la vez, a escala

El centro deja de ser el documento. Pasa a ser la figura activa, **a la escala real de la
hoja** (§8.2: "el tamaño que se ve es el tamaño que sale, en la misma escala de la
portada"), y el documento entra por el toggle "Ver el documento".

**Files:**
- Create: `src/components/figures/EscenarioFigura.tsx`
- Modify: `src/components/wizard/Step3FiguresTablesWizard.tsx` (`:445-476`)
- Test: `src/__tests__/escenarioFigura.test.tsx` (nuevo)

**Lo que hay, y por qué el plan anterior lo hacía mal.** El plan anterior pintaba la
imagen con "aspect ratio y `max-width: 100%`". Eso no es la escala de F2: es "que entre".
La diferencia se ve en una figura de 4 cm, que a `max-width: 100%` se ve gigante y sale
4 cm. `medidaDeFigura` de Task 1 ya devuelve los píxeles que le tocan.

**Las cinco cosas del escenario:**

1. **Barra de arriba**: breadcrumb `{H1} > {H2}` a la izquierda, y a la derecha
   `Figura 2 de 3` con las flechas `<` `>` que usan `vecina` de Task 1. Botón **"Ver el
   documento"** / **"Ver la figura"**, apagado por omisión.
2. **La figura, a escala.** `<img>` con `width: medida.anchoPx, height: medida.altoPx`
   cuando `declarada`; sin alto fijo y con la proporción natural cuando no, y **la línea
   "Sin tamaño declarado en el documento"** al lado. La caja lleva un marco de
   `var(--color-paper-border-dashed)` para que se vea dónde termina la hoja.
3. **La leyenda, editable, y se guarda al salir del campo.** `<textarea>` con estado
   local, `onBlur` → `onCaptionChange(texto)`. Nunca `onChange` → store (§3.10 y §8.3).
   Sin leyenda: el borde es `var(--color-warning-a40)` y el placeholder es
   `Figura N. Describa la figura según APA 7…`.
4. **El párrafo anterior**, con su rótulo, y `null` dicho: "Es la primera figura de la
   sección: no hay párrafo que la presente".
5. **Abajo**, los botones "Anterior figura" / "Siguiente figura" y la posición
   `2 de 3 en esta sección`.

**Las tablas muestran sus datos.** `table_info` es
`TableModel` (`src/types/index.ts:88-95`) y tiene `headers: string[]` y
`rows: string[][]`. El escenario pinta un `<table>` de verdad con esas celdas: hasta
**6 filas y 6 columnas**, cada celda con `overflow: hidden` y
`text-overflow: ellipsis`, y el rótulo `Mostrando 6 de 23 filas y 6 de 9 columnas` cuando
haya más. Debajo, los tres campos que ya edita el Inspector (`table_info.table_number`,
`caption`, `note`) **no se duplican acá**: la tabla tiene su bloque de leyenda, que es el
mismo `onLegendChange` con `updateElementTable` en vez de `updateElementImage`.

Si `table_info` no trae filas, el escenario dice `"Esta tabla no trae datos en el
documento"`. **No** es un estado vacío de pantalla completa: hay una tabla seleccionada y
se está mirando, así que va un mensaje dentro del área de la tabla, no un `EstadoVacio` que
reemplace la pantalla.

**El documento como toggle.** Se copia el patrón de F3
(`IndiceEstructura.tsx:71,74,135,196`), con su prueba:

```ts
export type VistaFiguras = 'figura' | 'documento';
export const VISTA_POR_DEFECTO: VistaFiguras = 'figura';
export function porDefectoSeVeElDocumento(): boolean {
  return VISTA_POR_DEFECTO === 'documento';
}
```

El `PaperCanvas` **no se importa en `EscenarioFigura`**: entra por prop
`documento?: ReactNode`, igual que en `EscritorioEstructura`
(`EscritorioEstructura.tsx:46-48`). Quien compone es quien sabe qué es "el documento" acá.
Así la prueba del escenario no monta el lienzo.

**El `MiniToolbar` sigue con el documento.** `imageActions`
(`Step3FiguresTablesWizard.tsx:140-154`) alinean, resetean el tamaño y **eliminan** una
figura, y sus tres acciones son sobre el elemento del lienzo. Se monta **dentro** del
toggle del documento, no junto a la figura: si no, "Eliminar" aparece al lado de una
figura que no es la que está en el lienzo, y un borrado con alcance ambiguo es la misma
clase de defecto que las "acciones con alcance" de F3. La alineación y el reset **también**
están en el inspector (Task 4), que sí es el lugar de la figura activa.

- [x] **Step 1: El test que falla primero**

```tsx
// src/__tests__/escenarioFigura.test.tsx
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EscenarioFigura, VISTA_POR_DEFECTO, porDefectoSeVeElDocumento } from '../components/figures/EscenarioFigura';
import { contextosDeFiguras, ANCHO_DE_LA_HOJA_PX } from '../lib/figuras';
import { HOJA_CARTA_MM } from '../lib/portada/geometria';
import type { ElementModel } from '../types';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn((p?: string | null) => (p ? `https://x/${p}` : null)),
  syncAllProviderKeys: vi.fn().mockResolvedValue({ ok: true, applied: [] }),
}));

let n = 0;
const el = (o: Partial<ElementModel> & { type: ElementModel['type']; text: string }): ElementModel =>
  ({ id: `elem_${++n}`, style_name: '', alignment: 'left', font_name: 'Times New Roman',
     font_size: 12, is_bold: false, is_italic: false, is_bullet: false, left_indent_cm: 0,
     confidence: 1, is_user_modified: false, cita_ids: [], needs_review: false,
     auto_applied: false, ...o }) as ElementModel;

const DOC: ElementModel[] = [
  el({ type: 'heading', heading_level: 1, text: '2. Metodología' }),
  el({ type: 'paragraph', text: 'Se aplico un cuestionario a doscientos estudiantes' }),
  el({ type: 'image', text: 'Figura 1', image_info: { figure_number: 1, caption: 'Diagrama del balance', relative_url: 'a.png', width_cm: 14, height_cm: 9 } as never }),
  el({ type: 'image', text: 'Figura 2', image_info: { figure_number: 2, caption: '', relative_url: 'b.png' } as never }),
];

const props = (extra: Partial<React.ComponentProps<typeof EscenarioFigura>> = {}) => ({
  contexto: contextosDeFiguras(DOC)[1],
  totalEnDocumento: contextosDeFiguras(DOC).length,
  onNavigate: vi.fn(),
  onLegendChange: vi.fn(),
  documento: <div data-testid="documento-real" />,
  ...extra,
});

describe('la figura a escala, no a "que entre"', () => {
  it('con tamano declarado, la caja mide lo que mide en la hoja', () => {
    render(<EscenarioFigura {...props()} />);
    const escala = ANCHO_DE_LA_HOJA_PX / HOJA_CARTA_MM.ancho;
    const img = screen.getByRole('img', { name: /Figura 1/ }) as HTMLImageElement;
    expect(img.style.width).toBe(`${140 * escala}px`);
    expect(img.style.height).toBe(`${90 * escala}px`);
  });

  it('sin tamano declarado, NO inventa 12 x 8 y lo dice', () => {
    render(<EscenarioFigura {...props({ contexto: contextosDeFiguras(DOC)[2] })} />);
    const img = screen.getByRole('img', { name: /Figura 2/ }) as HTMLImageElement;
    expect(img.style.height).toBe('');
    expect(screen.getByTestId('escenario-figura').textContent).toMatch(/sin tamaño declarado/i);
  });
});

describe('la leyenda se guarda al salir del campo, no en cada tecla', () => {
  it('escribe en el campo y todavia no despacha; al salir, si', () => {
    const spy = vi.fn();
    render(<EscenarioFigura {...props({ onLegendChange: spy })} />);
    const campo = screen.getByRole('textbox', { name: /leyenda/i });
    fireEvent.change(campo, { target: { value: 'Nueva leyenda' } });
    expect(spy).not.toHaveBeenCalled();
    fireEvent.blur(campo);
    expect(spy).toHaveBeenCalledWith('Nueva leyenda');
  });

  it('sin leyenda, el campo lo avisa con el borde de aviso', () => {
    render(<EscenarioFigura {...props({ contexto: contextosDeFiguras(DOC)[2] })} />);
    expect(screen.getByRole('textbox', { name: /leyenda/i })).toBeTruthy();
    expect(screen.getByTestId('escenario-figura').textContent).toMatch(/sin leyenda/i);
  });
});

describe('el contexto, dicho', () => {
  it('dice la seccion, la posicion y el parrafo anterior', () => {
    render(<EscenarioFigura {...props()} />);
    const t = screen.getByTestId('escenario-figura').textContent ?? '';
    expect(t).toMatch(/Metodología/);
    expect(t).toMatch(/1 de 2/);
    expect(t).toMatch(/Se aplico un cuestionario/);
  });
});

describe('las tablas muestran sus datos', () => {
  it('pinta las celdas de table_info, no un icono', () => {
    const conTabla = [el({ type: 'heading', heading_level: 1, text: '3. Resultados' }),
      el({ type: 'table', text: 'Tabla 1', table_info: { table_number: 1, caption: 'Resultados', note: '',
        headers: ['Grupo', 'n', 'Media'], rows: [['A', '30', '4.2'], ['B', '30', '3.9']] } as never })];
    const ctx = contextosDeFiguras(conTabla)[0];
    render(<EscenarioFigura {...props({ contexto: ctx, totalEnDocumento: 1 })} />);
    expect(screen.getByText('Grupo')).toBeTruthy();
    expect(screen.getByText('4.2')).toBeTruthy();
  });

  it('una tabla sin filas lo dice, y no muestra una pantalla vacia', () => {
    const vacia = [el({ type: 'heading', heading_level: 1, text: '3. Resultados' }),
      el({ type: 'table', text: 'Tabla 1', table_info: { table_number: 1, caption: 'Resultados', note: '', headers: [], rows: [] } as never })];
    render(<EscenarioFigura {...props({ contexto: contextosDeFiguras(vacia)[0], totalEnDocumento: 1 })} />);
    expect(screen.getByTestId('escenario-figura').textContent).toMatch(/no trae datos/i);
  });
});

describe('el documento es un toggle, y por omision apagado', () => {
  it('por omision se ve la figura', () => {
    expect(VISTA_POR_DEFECTO).toBe('figura');
    expect(porDefectoSeVeElDocumento()).toBe(false);
  });

  it('el documento NO esta montado hasta que se pide', () => {
    render(<EscenarioFigura {...props()} />);
    expect(screen.queryByTestId('documento-real')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /ver el documento/i }));
    expect(screen.getByTestId('documento-real')).toBeTruthy();
    /* Y son excluyentes: ver el documento apaga la figura. */
    expect(screen.queryByTestId('escenario-figura-imagen')).toBeNull();
  });
});
```

- [x] **Step 2: Implementar `EscenarioFigura.tsx`**

```ts
export interface EscenarioFiguraProps {
  contexto: ContextoFigura | null;
  totalEnDocumento: number;
  onNavigate: (paso: 1 | -1) => void;
  /** Se llama al perder el foco, nunca en cada tecla. */
  onLegendChange: (texto: string) => void;
  /** El documento entero, como contenido del toggle. */
  documento?: ReactNode;
}
```

Los tres `<div>` con `data-testid` que las pruebas piden:
`escenario-figura` (el contenedor), `escenario-scroller` (la zona con scroll, con
`minHeight: 0` y `minWidth: 0`) y `escenario-figura-imagen` (la caja de la figura). El
`<textarea>` de la leyenda lleva `<label>` con texto **"Leyenda de la figura"**, para que
`getByRole('textbox', { name: /leyenda/i })` lo encuentre sin `aria-label` pegado.

**Si `contexto` es `null`**, el escenario no desaparece: dice que hay que elegir una
figura. No es `EstadoVacio` de pantalla completa, porque la lista y el inspector siguen
vivos; es el bloque central. El texto nombra la acción real: *"Elegí una figura en la lista
para verla aquí con su contexto"*.

- [x] **Step 3: Reensamblar `:445-476`**

```tsx
<EscenarioFigura
  contexto={contextoActivo}
  totalEnDocumento={contextos.length}
  onNavigate={handleNavigate}
  onLegendChange={(texto) => { if (contextoActivo) persistirLeyenda(contextoActivo, texto); }}
  documento={<><PaperCanvas onElementClick={handleElementClick} /><MiniToolbar items={imageActions} anchorRect={toolbarAnchor} visible={toolbarAnchor !== null} onClose={() => { setToolbarAnchor(null); setToolbarElementId(null); }} /></>}
/>
```

Y el botón "Siguiente: Referencias" (`:448-475`), que hoy está en `position: absolute`
dentro del contenedor del lienzo: se mueve **adentro** del toggle del documento, al pie.
Un botón absoluto anclado a un contenedor que ya no está siempre montado es un botón
flotando sobre la figura sin explicación de a qué pertenece.

`persistirLeyenda` es un `useCallback` que distingue los dos casos:

```ts
const persistirLeyenda = useCallback((c: ContextoFigura, texto: string) => {
  if (c.tipo === 'image') updateElementImage(c.id, { caption: texto });
  else updateElementTable(c.id, { ...(tablaDe(c.id)?.table_info ?? {}), caption: texto });
}, [updateElementImage, updateElementTable]);
```

- [x] **Step 4: Verificar**

```bash
npx vitest run src/__tests__/escenarioFigura.test.tsx
npx tsc --noEmit
Select-String -Path 'src/components/figures/EscenarioFigura.tsx' -Pattern '[\u4e00-\u9fff\uac00-\ud7af\ufffd]'
```

- [x] **Step 5: Commit**

```bash
git add src/components/figures/EscenarioFigura.tsx \
        src/components/wizard/Step3FiguresTablesWizard.tsx \
        src/__tests__/escenarioFigura.test.tsx
git commit -m "figuras: el escenario es una figura a la vez, a la escala de la hoja

La imagen se mide con la geometria de F2, no con un max-width que la hace entrar
como entre. Un tamano no declarado se dice y usa la proporcion natural del
archivo, en vez de los 12 x 8 inventados.

La leyenda se guarda al salir del campo, no en cada tecla: updateElementImage es
una llamada HTTP con pushHistory, y escribirla por pulsacion es un PATCH por
pulsacion.

Las tablas pintan sus celdas de table_info, con las primeras filas y columnas y
el aviso de cuantas faltan. El documento entra por el toggle apagado por
omision, y MiniToolbar se queda adentro de ese toggle, que es donde estan las
acciones de borrar y resetear."
```

---

### Task 4: El Inspector — el que no te saca de la pantalla

Acá se decide la opción (a) de §8.3: **se reescribe `ImageEditPanel`, no se borra**.

**La decisión, y el motivo.** El spec recomienda (a) porque `SuggestCaptionButton` y
`ProactiveSuggestionCard` funcionan. Mirado de cerca hay un tercero: el archivo tiene
`DESIGN_STYLES` con los cinco presets y sus miniaturas SVG
(`ImageEditPanel.tsx:24-95`), el editor de subfiguras multipanel (`:576-646`), el
reemplazo de archivo que conserva tamaño y anotaciones (`:688-718`) y la
`runSuggestCaption` (`:189-213`). La opción (b) —borrarlo y mudarlo— tira todo eso para
reescribirlo, y el resultado sería peor en el tiempo que se tiene. **Se elige (a).** La
decisión de §8.3 sobre Revisión ya está tomada arriba, con su motivo.

**Lo que el plan anterior decía y está mal:** *"se conserva, puede que otras rutas lo
usen, verificar con `grep`"*. Verificado: el **único** importador de `ImageEditPanel` es
`RightSidePanel.tsx:262`. No hay otros, y no los hay que buscar: se reescribe.

**Files:**
- Modify: `src/components/inspector/ImageEditPanel.tsx` (los nueve `|| 12` / `|| 8`, los
  `<textarea>` por tecla, los presets sin aplicar-a-todas, el header)
- Modify: `src/components/inspector/ElementInspector.tsx` (`:7`, `:85`, `:88`, `:267-277`,
  `:317-351`, `:286-298`)
- Modify: `src/components/activity/RightSidePanel.tsx` (`:84`, `:236-260`, `:265-266`)
- Modify: `src/store/slices/documentSlice.ts` (una action nueva, junto a `:808-823`)
- Test: `src/__tests__/inspectorFigura.test.tsx` (nuevo),
  `src/__tests__/aplicarImagenAMuchas.test.ts` (nuevo)

**Step 1 — la action de aplicar a todas.** "Aplicar a todas" **no existe de ninguna
manera** en el repo hoy: no hay endpoint en lote y `updateElementImage` es de a uno. Se
agrega una action al slice, que **sí llega al backend**: un `await` por elemento contra el
mismo `POST /api/update-element` (`python/routers/sessions.py:684`), con progreso y parada
al primer error.

```ts
// src/store/slices/documentSlice.ts, junto a updateElementImage (:808-823)

/**
 * El mismo `patch` sobre varias figuras, de a una.
 *
 * POR QUÉ UN `for` Y NO UN ENDPOINT EN LOTE. El endpoint es `/api/update-element`
 * (`python/routers/sessions.py:684`) y acepta un `element_id` por llamada; el
 * veinte figuras de la F7 son veinte llamadas, y eso es un costo conocido y
 * tolerable. Un endpoint en lote es el arreglo correcto y es otra fase: cablear un
 * botón a un endpoint que no existe es peor que no cablearlo (spec §3.5).
 *
 * El alcance se DECLARA en el parámetro: esta action no sabe qué es "todas" y no
 * lo deduce. Quien llama pasa los ids, y el que pasó los ids es el que sabe por
 * qué. Un `for` sobre `figures.length` adentro de la vista sería una decisión de
 * alcance escondida en un botón, y es exactamente lo que F3 resolvió mostrando
 * "(esta rama)" al lado de cada acción.
 *
 * `onProgreso` es lo que permite que la UI diga "7 de 20" en vez de freezing.
 */
aplicarImagenAMuchas: async (
  elementIds: readonly string[],
  patch: Partial<ImageModel>,
  onProgreso?: (hechos: number, total: number) => void,
) => {
  const { doc, showToast } = get();
  if (!doc) return;
  const total = elementIds.length;
  if (total === 0) return;

  let ultimo: DocumentModel | null = null;
  for (let i = 0; i < total; i++) {
    const id = elementIds[i];
    if (ultimo?.elements.some((e) => e.id === id)) continue;   // ya aplicada
    try {
      ultimo = await api.updateElementImage(doc.session_id, id, patch);
    } catch (err: any) {
      /* Se dice cuántas salieron y cuántas no, y se deja el store en el último
         estado bueno. Decir "listo" con la mitad aplicada es la peor versión. */
      showToast(
        `Se aplicó a ${i} de ${total} figuras. La ${i + 1} falló: ${err?.message ?? 'error desconocido'}`,
        'error',
      );
      if (ultimo) get().pushHistory(ultimo);
      return;
    }
  }
  if (ultimo) { get().pushHistory(ultimo); set({ doc: ultimo }); }
  showToast(`Se aplicó a ${total} ${total === 1 ? 'figura' : 'figuras'}`, 'success');
  onProgreso?.(total, total);
},
```

- [x] **Step 2 — `ImageEditPanel.tsx`: los `<textarea>` dejan de escribir por tecla**

`setProp` (`:143`) es `updateElementImage(elem.id, { [p]: v })`, y eso se llama en el
`onChange` de **cinco** campos: la leyenda (`:460`), la nota (`:483`), el texto alternativo
(`:496`), el título de cada subfigura (`:612-614`) y el valor del `select` de
`caption_position` (`:469`, que ese sí es un `change` de verdad y se queda). Los cuatro
primeros son texto y van a estado local + `onBlur`.

El patrón, con `useState` + `useEffect` que se resincroniza cuando cambia el elemento (si
no, el campo queda con el texto de la figura anterior):

```ts
/* Un campo de texto que NO escribe en el store en cada tecla.
   `updateElementImage` es una llamada HTTP con `pushHistory` (documentSlice.ts:808),
   y además con `caption` corre `cleanRedundantTitleParagraphs` (`:815-817`), que
   reescribe párrafos del documento: escribir la leyenda letra por letra reescribe
   el documento letra por letra. */
const [borrador, setBorrador] = useState<string>(img.caption ?? '');
const [nota, setNota] = useState<string>(img.note ?? '');
const [alt, setAlt] = useState<string>(img.alt_text ?? '');
const [touched, setTouched] = useState(false);

useEffect(() => {
  if (touched) return;                 // no pisa lo que la persona está escribiendo
  setBorrador(img.caption ?? '');
  setNota(img.note ?? '');
  setAlt(img.alt_text ?? '');
}, [elem.id, img.caption, img.note, img.alt_text]);

const commit = (campo: 'caption' | 'note' | 'alt_text', valor: string) => {
  setTouched(false);
  updateElementImage(elem.id, { [campo]: valor });
};
```

Cada `<textarea>` lleva `onChange={(e) => setBorrador(e.target.value)}`,
`onBlur={() => { setTouched(false); commit('caption', borrador); }}`.

**Lo mismo en `ElementInspector.tsx`:** el `<textarea>` de "Contenido" (`:267-277`) llama
`triggerUpdate()` → `updateElementType` → `api.updateElement` en cada tecla, y los **tres**
inputs de la tabla (`:317-322` número, `:332-337` título, `:346-351` nota) llaman
`updateElementTable` en cada tecla. Los cuatro pasan al mismo patrón.

- [x] **Step 3 — los nueve `|| 12` / `|| 8`**

`ImageEditPanel.tsx:137,138,243,346,348,357,359,369,376`. Todos salen y se sustituyen por
una función de Task 1 y una respuesta honesta:

```ts
const medida = useMemo(() => medidaDeFigura(img), [img.width_cm, img.height_cm]);
```

- El **header** (`:243`): `{medida.declarada ? `${img.width_cm} × ${img.height_cm} cm` : 'Sin tamaño declarado'}`.
- Los **inputs** (`:346`, `:357`, `:369`): `value={img.width_cm ?? ''}` con
  `placeholder="sin declarar"`. Un input con `12` adentro cuando el documento no dice 12 es
  un número inventado con apariencia de dato.
- El **`onChange`** (`:348`, `:359`): `parseFloat(...)` y si viene `NaN`, **no** se
  escribe `12`: se escribe el valor anterior y se avisa con `showToast`.
- `originalWidth`/`originalHeight` (`:137-138`): dejan de ser `|| 12` / `|| 8`. Si no hay
  tamaño declarado, "Restablecer" (`:391-401`) **se deshabilita** con un `title` que lo
  dice: no se puede restablecer algo que nunca se midió. Hoy el botón "resetea" a 12 × 8 y
  lo llama "Tamaño original restaurado" (`:172`), que es una mentira en el toast.

Lo mismo en `PaperCanvas.tsx:586-587` (`const w = elem.image_info.width_cm || 12`), **solo
las dos constantes**, sin tocar el resto del lienzo: ahí el default es la última defensa
para que la figura no mida 0, y la caja del lienzo es un papel, no un inspector. Se
reemplaza por un valor derivado del ancho útil de `geometria.ts`.

- [x] **Step 4 — "aplicar a esta / aplicar a todas"**

Se **restauran los controles de diseño** que `d2f7c37` borró de esta pantalla, y se
restauran **bien**: con alcance.

- `DESIGN_STYLES` (`ImageEditPanel.tsx:24-95`) pasa a ser la fuente de los presets, y el
  `Step3FiguresTablesWizard` **no vuelve** a tener su propia copia de cuatro
  `DESIGN_PRESETS`: la de `ImageEditPanel` tiene las miniaturas SVG y las descripciones, y
  dos catálogos de presets divergen en la primera corrección. La copia de cuatro
  valores, con `desc` de tres palabras y sin miniatura, se queda atrás.
- Encima de los presets, un selector de alcance, que es lo que el usuario pidió y no
  existe:

```tsx
<label>
  <input type="radio" name="alcance-figura" checked={alcance === 'esta'}
    onChange={() => setAlcance('esta')} />
  Esta figura
</label>
{/* Con una sola figura, "todas" y "esta" son la misma operacion: dos nombres para
    un mismo botón es un control que miente sobre lo que hace. */}
{totalFiguras > 1 && (
  <label>
    <input type="radio" name="alcance-figura" checked={alcance === 'todas'}
      onChange={() => setAlcance('todas')} />
    Las {totalFiguras} figuras del documento
  </label>
)}
```

- El botón dice el alcance, como las acciones de F3: `"Aplicar a esta figura"` o
  `"Aplicar a las 20 figuras"`, y durante la corrida `"Aplicando… 7 de 20"`.
- El botón de alcance vive **al pie de la sección de estilo**, no arriba del panel, para
  que el alcance esté pegado a lo que aplica.
- El alcance por defecto es `"esta"`. Aplicar a 20 figuras es una acción de tres
  segundos de deliberación; que sea un clic por defecto es un accidente esperando.

- [x] **Step 5 — `Abrir panel de edición` navega, y hay un "volver al inspector"**

`ElementInspector.tsx:286-298` (`onClick={() => setImagePanelOpen(true)}`, `:288`) queda
igual **en lo que hace**, y cambia en lo que dice y en lo que lo dispara:

- El botón pasa a decir **"Abrir el inspector de la figura"** y su `title` aclara que el
  panel de la derecha cambia de contenido, no que se abre algo sin contexto.
- **`Step3FiguresTablesWizard.tsx:133` y `:379` dejan de llamar
  `setImagePanelOpen(true)`.** Es el núcleo de §8.3: hoy hacer clic en una figura te saca
  del inspector sin pedirlo, y eso es "reemplazar" en vez de "navegar". Con el clic ya
  neutro, ir al inspector es una decisión.
- **`RightSidePanel.tsx:246-259`**: el botón `X` del sub-header de imagen deja de ser un
  `X` mudo y pasa a ser **"Volver al inspector"**, con `aria-label` explícito. La función
  ya era correcta (`setImagePanelOpen(false)`, `:248`): lo que faltaba era el nombre, y un
  control sin nombre es un control que hay que adivinar.
- **`RightSidePanel.tsx:84`**: el efecto `if ((selectedElementId || selectedReferenceId) && doc) setForceRightPanelOpen(true)`
  se **acota**: sigue abriendo el panel para una selección, porque el Inspector general
  (tipo, nivel, contenido) es de todas formas útil en cualquier paso, pero **el panel de
  imagen solo se monta si `imagePanelOpen`** (`:159-163`), y con el clic ya neutro eso ya
  no se dispara solo. Se **documenta la decisión** con un comentario al lado, porque la
  próxima persona va a querer "optimizar" ese efecto.

- [x] **Step 6 — el código muerto, y por qué sigue ahí**

```ts
// ElementInspector.tsx
import { ElementType, APARuleSet } from '../../types';   // :7  ->  import { ElementType } from '../../types';
type TabId = 'info' | 'style' | 'advanced';             // :85 -> se borra
const { doc, selectedElementId, updateElementType, portada, setPortada } = useDocStore();  // :88 -> sin portada ni setPortada
```

`APARuleSet` no se usa en el archivo. `TabId` no se usa: los `TabsTrigger` se arman con un
array **inferido** (`:134-136`), nunca anotado con ese tipo, así que el tipo declara dos
pestañas (`'style'`, `'advanced'`) que la vista nunca renderiza. `portada` y `setPortada`
se desestructuran y no se usan: el editor de portada vive en su propio paso y acá solo se
redirige (`:183-202`).

> **Por qué nadie lo vio:** `tsconfig.json` tiene `noUnusedLocals: false` y
> `noUnusedParameters: false`. Un import sin usar y una variable desestructurada sin usar
> son dos líneas que ningún compilador complains de en este repo. Por eso van en el plan
> como pasos y no como "de paso, limpiemos".

Y el bloque `sinTexto` **se respeta, no se re-inventa.** `FindingDetail.tsx:226-231` ya
distingue el hallazgo sin texto (`AVISO_SIN_TEXTO[item.sinTexto.clase]` en vez de pintar
`originalText`), y `auditItems.ts:390` y `:406` mandan `originalText: ''` para figuras y
tablas. **Ningún componente de esta fase vuelve a poner un texto de reserva** donde no lo
hay: una figura sin leyenda se dice con el rótulo de §8.1, que es un dato del elemento, y
no con un `[Figura sin rotular]` que es un placeholder de la generación anterior.

- [x] **Step 7: El test que falla primero**

`src/__tests__/aplicarImagenAMuchas.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDocStore } from '../store/useDocStore';

const updateElementImage = vi.fn();
vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(),
  syncAllProviderKeys: vi.fn().mockResolvedValue({ ok: true, applied: [] }),
  updateElementImage: (...a: unknown[]) => updateElementImage(...a),
}));

const doc = (n: number) => ({
  session_id: 's-f4',
  file_name: 'Tesis.docx',
  elements: Array.from({ length: n }, (_, i) => ({
    id: `elem_${i}`, type: 'image', text: `Figura ${i + 1}`,
    image_info: { figure_number: i + 1, caption: '', relative_url: '' },
  })),
  referencias: [],
  meta: { page_count: 3 },
});

beforeEach(() => {
  updateElementImage.mockReset();
  useDocStore.setState({ doc: doc(20) as never, toasts: [] } as never);
});

describe('aplicar a todas: el alcance lo declara quien llama', () => {
  it('20 figuras son 20 llamadas con el MISMO patch, y una por id', async () => {
    updateElementImage.mockImplementation(async (_s: string, id: string) => doc(20));
    const ids = Array.from({ length: 20 }, (_, i) => `elem_${i}`);
    await useDocStore.getState().aplicarImagenAMuchas(ids, { design_style: 'full_width' });
    expect(updateElementImage).toHaveBeenCalledTimes(20);
    for (const [sesion, id, patch] of updateElementImage.mock.calls) {
      expect(sesion).toBe('s-f4');
      expect(ids).toContain(id);
      expect(patch).toEqual({ design_style: 'full_width' });
    }
  });

  it('un ids vacio no hace NADA: sin destino, sin toast de mentira', async () => {
    await useDocStore.getState().aplicarImagenAMuchas([], { design_style: 'sidebar' });
    expect(updateElementImage).not.toHaveBeenCalled();
  });

  it('si una falla, dice cuantas salieron y cuantas no, y no dice "listo"', async () => {
    /* El fallo mas caro de esta fase no es que no se aplique: es que se diga que
       se aplico. Con 20 figuras, un error a la 7 es el caso normal, no el raro. */
    updateElementImage
      .mockImplementation(async (_s: string, id: string) => {
        if (id === 'elem_7') throw new Error('El backend no respondio');
        return doc(20);
      });
    const ids = Array.from({ length: 20 }, (_, i) => `elem_${i}`);
    await useDocStore.getState().aplicarImagenAMuchas(ids, { design_style: 'sidebar' });
    const toasts = useDocStore.getState().toasts as { message: string; kind: string }[];
    const error = toasts.find((t) => t.kind === 'error');
    expect(error?.message).toMatch(/7 de 20/);
    expect(error?.message).toMatch(/no respondio/);
  });
});
```

`src/__tests__/inspectorFigura.test.tsx` renderiza `ImageEditPanel` con un `elem` de
prueba y afirma las seis cosas:

1. con `width_cm: 14, height_cm: 9` el header dice `14 × 9 cm`, y **sin** ellos dice
   `Sin tamaño declarado` y los inputs dicen `sin declarar` (no `12` y `8`);
2. `Restablecer` viene **deshabilitado** cuando no hay tamaño que restablecer;
3. escribir en el textarea de leyenda **no** llama a `updateElementImage`, y `blur` sí;
4. con **una** figura no existe el radio "todas"; con **tres** existe y el botón dice
   `"Aplicar a las 3 figuras"`;
5. el botón de alcance dice **"esta"** por omisión;
6. `RightSidePanel` con `imagePanelOpen` muestra un botón cuyo nombre accesible es
   **"Volver al inspector"**.

- [x] **Step 8: Verificar**

```bash
npx vitest run src/__tests__/aplicarImagenAMuchas.test.ts src/__tests__/inspectorFigura.test.tsx src/__tests__/inspector.test.tsx
npx tsc --noEmit
Select-String -Path 'src/components/inspector/ImageEditPanel.tsx','src/components/inspector/ElementInspector.tsx','src/components/activity/RightSidePanel.tsx','src/store/slices/documentSlice.ts' -Pattern '[\u4e00-\u9fff\uac00-\ud7af\ufffd]'
```

**Y mutar**: volvé a poner `setProp('caption', ...)` en el `onChange` del textarea y corré
el caso 3. Si pasa, el caso 3 no está probando lo que dice.

- [x] **Step 9: Commit**

```bash
git add src/components/inspector/ImageEditPanel.tsx \
        src/components/inspector/ElementInspector.tsx \
        src/components/activity/RightSidePanel.tsx \
        src/store/slices/documentSlice.ts \
        src/__tests__/aplicarImagenAMuchas.test.ts \
        src/__tests__/inspectorFigura.test.tsx
git commit -m "figuras: el inspector de figura, con aplicar a esta y a todas

Se elige la opción (a) del spec: se reescribe el panel, no se borra. Sus cinco
presets con miniatura, las subfiguras multipanel, el reemplazo de archivo y el
Sugerir con IA funcionan, y la opción (b) los tira para reconstruirlos.

Los controles de diseño que d2f7c37 habia sacado de esta pantalla vuelven, con
alcance: el patch se aplica a la figura o a todas, el boton dice cual, y durante
la corrida dice 7 de 20. Con una sola figura el radio de todas no aparece, porque
son la misma operacion con dos nombres. El alcance por omision es esta.

updateElementImage es una llamada HTTP con pushHistory, y con caption corre
cleanRedundantTitleParagraphs: los cinco textareas escribian letra por letra.
Ahora estado local y commit al salir del campo.

Los nueve || 12 y || 8 salen. Una figura sin tamaño declarado lo dice, y
Restablecer viene deshabilitado cuando no hay nada que restablecer: antes
restablecia a 12 x 8 y decia 'tamaño original restaurado'.

Abrir panel de edicion navega y hay un volver al inspector con nombre. Hacer clic
en una figura ya no te saca del inspector por sorpresa: eso es reemplazar en vez
de navegar, y es el defecto de la seccion 8.3.

Y se borra el codigo muerto: APARuleSet, portada y setPortada, y el TabId que
declaraba dos pestañas que la vista nunca renderiza. tsc no lo caza porque
noUnusedLocals esta en false."
```

---

### Task 5: Montar la fase, y el guardián que la exige

> **ESTA TASK NO ESTABA EN EL PLAN ANTERIOR, Y SU AUSENCIA ES UN DEFECTO.** Las cuatro
> tasks de arriba crean tres componentes, los prueban y los dan por terminados. Ninguna
> nombra `App.tsx`. Resultado posible: 1280 tests verdes sobre una carpeta que
> `grep` da por inhabitable. Es el mismo error que cometió F3 y que se tapó con
> `estructuraEstaMontada.test.tsx` — el precedente está a una carpeta de distancia, y la
> lección también.

**Files:**
- Test: `src/__tests__/figurasEstaMontada.test.tsx` (nuevo)
- Modify: `docs/superpowers/plans/2026-09-28-f4-figuras-tablas-inspector.md` (esta tabla)

**El ensamblado no cambia de archivo.** `Step3FiguresTablesWizard` ya se monta en
`App.tsx:687` y `:706` para `wizardStep === 3`, y `RightSidePanel` en `:713`. F4 no
agrega un `viewMode` ni un wizard step: **reutiliza el que ya está**, que es lo que
hizo F3 con su pestaña en la fase 2. Lo que hay que garantizar es que la fase 3 monte
las tres cosas y no un recorte.

- [x] **Step 1: El guardián**

`src/__tests__/figurasEstaMontada.test.tsx`, modelado sobre
`estructuraEstaMontada.test.tsx` con sus cinco pruebas negativas:

```tsx
/**
 * EL GUARDIÁN DEL MONTAJE DE LA F4, por el mismo motivo que el de F3: siete
 * componentes con sus pruebas en verde y cero importadores son un trabajo
 * TERMINADO que no está terminado, está guardado.
 *
 * Todas las pruebas son negativas, y todas se apoyan en el mismo par: el glbo
 * lee los fuentes del disco y la lista de componentes NO está escrita a mano. Una
 * lista escrita a mano es la tautología que hay que evitar: se agrega un
 * componente, no se monta, y la guarda sigue verde porque no lo conocía.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { Step3FiguresTablesWizard } from '../components/wizard/Step3FiguresTablesWizard';
import { contextosDeFiguras } from '../lib/figuras';
import type { ElementModel } from '../types';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn((p?: string | null) => (p ? `https://x/${p}` : null)),
  syncAllProviderKeys: vi.fn().mockResolvedValue({ ok: true, applied: [] }),
  autoCaptionAll: vi.fn().mockResolvedValue(undefined),
  suggestCaption: vi.fn().mockResolvedValue('sugerida'),
}));
vi.mock('../components/layout/PaperCanvas', () => ({ PaperCanvas: () => <div data-testid="canvas-real" /> }));

const FUENTES = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
  as Record<string, string>;

const CARPETA = '/src/components/figures/';
const NOMBRES = Object.keys(FUENTES)
  .filter((r) => r.startsWith(CARPETA) && r.endsWith('.tsx'))
  .map((r) => r.slice(CARPETA.length).replace(/\.tsx$/, ''));

let n = 0;
const el = (o: Partial<ElementModel> & { type: ElementModel['type']; text: string }): ElementModel =>
  ({ id: `elem_${++n}`, style_name: '', alignment: 'left', font_name: 'Times New Roman',
     font_size: 12, is_bold: false, is_italic: false, is_bullet: false, left_indent_cm: 0,
     confidence: 1, is_user_modified: false, cita_ids: [], needs_review: false,
     auto_applied: false, ...o }) as ElementModel;

const ELEMENTOS: ElementModel[] = [
  el({ type: 'heading', heading_level: 1, text: '2. Metodología' }),
  el({ type: 'paragraph', text: 'Se aplico un cuestionario a doscientos estudiantes' }),
  el({ type: 'image', text: 'Figura 1', image_info: { figure_number: 1, caption: 'Diagrama', relative_url: 'a.png', width_cm: 14, height_cm: 9 } as never }),
  el({ type: 'image', text: 'Figura 2', image_info: { figure_number: 2, caption: '', relative_url: 'b.png' } as never }),
];

function montar() {
  act(() => {
    useDocStore.setState({
      doc: { session_id: 's-f4', file_name: 'Tesis.docx', elements: ELEMENTOS, referencias: [], meta: { page_count: 4 } } as never,
      reviewResult: null, proofreadFindings: [], citationAuditResult: null,
      imagePanelOpen: false, selectedElementId: null,
    } as never);
  });
  return render(<Step3FiguresTablesWizard />);
}

beforeEach(() => { n = 0; });

describe('la fase de Figuras y tablas está montada', () => {
  it('el glob esta leyendo de verdad y la carpeta tiene los componentes', () => {
    expect(Object.keys(FUENTES).length).toBeGreaterThan(100);
    expect(NOMBRES).toContain('ListaContextual');
    expect(NOMBRES).toContain('EscenarioFigura');
  });

  it('cada componente de la carpeta tiene un importador fuera de las pruebas', () => {
    const cuenta: Record<string, number> = {};
    for (const nombre of NOMBRES) cuenta[nombre] = 0;
    for (const [ruta, fuente] of Object.entries(FUENTES)) {
      if (ruta.includes('/__tests__/')) continue;
      for (const nombre of NOMBRES) {
        if (new RegExp(`from\\s+['"][^'"]*/${nombre}['"]`).test(fuente)) cuenta[nombre] += 1;
      }
    }
    const huerfanos = NOMBRES.filter((x) => (cuenta[x] ?? 0) === 0);
    expect(huerfanos, `componentes de figures/ que nadie usa: ${huerfanos.join(', ')}`).toEqual([]);
  });

  it('monta la lista contextual y el escenario, con la figura elegida', () => {
    montar();
    expect(screen.getByTestId('lista-figuras-scroller')).toBeTruthy();
    expect(screen.getByTestId('escenario-figura')).toBeTruthy();
    /* Y el lienzo NO esta: es un toggle apagado por omision. El documento entero
       como centro es exactamente el defecto que §8.1 viene a matar. */
    expect(screen.queryByTestId('canvas-real')).toBeNull();
  });

  it('elegir una figura la pone en el escenario, y el texto de la lista es el de su seccion', () => {
    const { container } = montar();
    act(() => {
      useDocStore.getState().setQuery?.('Diagrama');
    });
    /* Con el filtro vacio, la segunda figura es la activa por omision y su
       ausencia de leyenda se ve en el escenario. */
    expect(container.textContent).toMatch(/Metodología/);
    expect(container.textContent).toMatch(/sin leyenda/i);
  });

  it('la fase es alcanzable desde el rail: App.tsx la monta en el paso 3', () => {
    /* Montar el componente a mano no prueba que exista en la app. Un componente
       importado por un modulo que nadie monta tiene la misma existencia que uno sin
       importador. */
    const app = FUENTES['/src/App.tsx'];
    expect(app, 'App.tsx no esta entre los fuentes leidos').toBeTruthy();
    expect(app).toMatch(/wizardStep === 3 && <Step3FiguresTablesWizard \/>/);
  });

  it('NO se importa ReviewMinimap en la fase, y el panel derecho sigue montandose', () => {
    const paso = FUENTES['/src/components/wizard/Step3FiguresTablesWizard.tsx'];
    expect(paso).not.toMatch(/ReviewMinimap/);
    /* Y la tercera columna es la que ya existia, no una nueva. */
    expect(FUENTES['/src/App.tsx']).toMatch(/wizardStep !== 4 && wizardStep !== 5 && wizardStep !== 6 && !focusMode && <RightSidePanel \/>/);
  });
});

describe('la verdad de la figura no se re-deriva en la vista', () => {
  it('la lista y el escenario leen el MISMO contexto', () => {
    /* Un `sectionMap` local y un `contextosDeFiguras` en la lib son dos verdades
       sobre a que seccion pertenece una figura, y divergen el primer dia que una
       cambia. La lista y el escenario tienen que leer el mismo arreglo. */
    const paso = FUENTES['/src/components/wizard/Step3FiguresTablesWizard.tsx'];
    expect(paso).toMatch(/contextosDeFiguras/);
    expect(paso).not.toMatch(/new Map<string, \{ title: string; level/);
  });

  it('la figura activa se guarda por indice, no por element_id', () => {
    const paso = FUENTES['/src/components/wizard/Step3FiguresTablesWizard.tsx'];
    expect(paso).not.toMatch(/useState<string \| null>\(null\)\s*;\s*\/\/.*activa/i);
    /* Y no queda ningun `activeElementId` como identidad de la seleccion. */
    expect(paso).not.toMatch(/setSelectedElementId\(item\.id\)/);
  });

  it('el estado vacio de esta pantalla es el de F1, no uno escrito a mano', () => {
    const paso = FUENTES['/src/components/wizard/Step3FiguresTablesWizard.tsx'];
    expect(paso).toMatch(/EstadoVacio/);
    expect(paso).not.toMatch(/No se detectaron \$\{/);
  });
});
```

- [x] **Step 2: Mutar el guardián y verlo caer**

Comentá el import de `ListaContextual` en el ensamblado y corré la prueba de importadores.
Tiene que fallar nombrando el huérfano. Sin eso, la guarda es una afirmación.

- [x] **Step 3: Verificación completa de la fase**

```bash
npx vitest run
npx tsc --noEmit
pytest python/tests/ -q
npm run build
```

Esperado: frontend **≥ 1251**, Python **≥ 809**, `tsc` exit 0, build sin error.

Y el criterio de aceptación que **no es un número**:

```bash
# En PowerShell, sin -Recurse (Select-String no lo tiene):
Select-String -Path (Get-ChildItem -Recurse -Include '*.ts','*.tsx' -Path src).FullName -Pattern "from '.*figures/"
```

Si eso no da resultados fuera de `src/__tests__`, la fase está construida y no montada.

- [x] **Step 4: Actualizar esta tabla del plan y commitear**

```bash
git add docs/superpowers/plans/2026-09-28-f4-figuras-tablas-inspector.md src/__tests__/figurasEstaMontada.test.tsx
git commit -m "figuras: el guardian del montaje de la fase

Cinco pruebas negativas, como las de F3: la lista y el escenario se montan, el
lienzo no, cada componente de figures/ tiene un importador leido del disco, y
App.tsx monta la fase en el paso 3.

Las tres últimas vigilan que la verdad de la figura no se re-derive en la vista:
un solo contextosDeFiguras, la figura activa por indice y no por element_id, y
el estado vacio de F1 en vez de uno escrito a mano.

La tarea no estaba en el plan y sin ella cuatro tasks pueden quedar verdes sobre
una carpeta que nadie monta."
```

---

## Self-Review

**0. Lo que este plan corrigió del anterior, en una línea cada cosa.** La tabla completa
está abajo, en [Revisión](#revisión-qué-estaba-mal-en-el-plan-anterior-y-qué-cambió).

**1. Lo que se conserva.** `autoCaptionAll`, `SuggestCaptionButton`
(`ElementInspector.tsx:15-63`), `ProactiveSuggestionCard`, `MiniToolbar`, `PaperCanvas`,
`ImageEditPanel` con sus cinco presets y sus subfiguras, `setTableStyle`, el botón
"Leyendas IA para todo", el colapsado del rail, el botón "Siguiente: Referencias", los
controles de tabla, el buscador, el filtro de pendientes y los atajos de teclado. La
lógica de datos se **reescribe** (§8.1 lo exige) y el JSX cambia; nada de lo que funcionaba
desaparece.

**2. Lo que NO hace esta fase.**
- No mueve `Step3FiguresTablesWizard.tsx` a una carpeta nueva. La carpeta `figures/` es
  para los componentes **nuevos**; el compositor se queda donde el rail lo encuentra.
- No toca `PaperCanvas` más que las dos constantes de tamaño (`§` Task 4, Step 3).
- No hace el layout responsive de §5 de la barra. El plan anterior tenía una Task 5 de
  "inspector colapsable bajo 900 px" con `window.innerWidth`: **se cae**, porque el
  `RightSidePanel` ya tiene su regla de ancho, su handle de resize (`RightSidePanel.tsx:187-193`)
  y su botón de cerrar, y un segundo mecanismo de colapso para el mismo panel son dos
  reglas que se contradicen.
- No lleva el Inspector a Revisión (§8.3, decidido arriba con motivo).
- No hace un endpoint en lote. "Aplicar a todas" son N llamadas contra el endpoint que ya
  existe, y se **dice** en el código por qué.
- No declara tokens nuevos.
- No toca la portada, ni el rail de `AGENTS.md` §1, ni `ReviewMinimap`.

**3. Orden de ejecución.** Task 1 → 2 → 3 → 4 → 5. La 1 no toca componentes y todas las
demás la necesitan. La 2 y la 3 se pueden hacer en cualquier orden entre sí. La 4 toca
`RightSidePanel`, que la 2 ya dejó de usar para abrir el panel de imagen por sorpresa. La
5 es el cierre y no se puede saltear.

**4. Lo que este plan deja declarado y no resuelto, a propósito.** (a) El endpoint en
lote de §8.2. (b) El Inspector en Revisión. (c) Que el `onError` de la miniatura diga
"No se pudo cargar" cuando la causa real puede ser que el backend todavía no escribió el
archivo, en cuyo caso el mensaje técnico es "la imagen aún no está en el servidor" y no
"no se pudo cargar": **esa distinción se decide mirando un caso real**, y se anota acá
para que no la piense de nuevo la próxima vez. (d) El ancho de 280 px del rail: con
bloques de contexto de cinco líneas, 280 px deja de alcanzar en una ventana angosta, y
320 px es más cómodo — pero cambiar el ancho de una columna que el usuario ya conoce sin
verlo en pantalla es una decisión de producto, no de plan.

---

<a id="revisión-qué-estaba-mal-en-el-plan-anterior-y-qué-cambió"></a>
## Revisión: qué estaba mal en el plan anterior y qué cambió

### Los cinco defectos de fondo

1. **La tercera zona era una cuarta columna.** El plan anterior ponía un
   `FiguraInspector` nuevo **dentro** de `Step3FiguresTablesWizard`, al lado del
   escenario. Pero `RightSidePanel` **ya se monta en la fase 3** (`App.tsx:713`) y ya es
   la tercera columna. El plan no lo menciona ni una vez. Su propio JSX de Task 4 deja
   además un botón "Siguiente" del `PaperCanvas` y el `MiniToolbar` colgando, y el
   `Inspector` recibiría `onSuggestCaption={(id) => setSelectedElementId(id)}`, que **no
   sugiere una leyenda**: selecciona un elemento. El botón de "Sugerir con IA" del plan
   anterior no estaba cableado a nada, y el spec §3.5 dice que un control sin destino se
   cablea o se borra.

2. **Conservaba intacto el bug que el spec §8.1 nombra.** Decía, textual, *"La lógica de
   `sectionMap` de la línea `:89-112` del archivo actual se conserva sin cambios — solo el
   render cambia"*, y repetía *"se conserva íntegra"*. `sectionMap` es un `Map` indexado
   por `element.id` (`:107`), y los ids son `elem_N`, un índice posicional
   (`auditSlice.ts:150-154`). Era el mismo bug del diff por `element_id` que ya se
   corrigió en el motor de refresco. Un plan que lo deja como está no cumple §8.1.

3. **No arreglaba el tamaño inventado, que era el punto del §8.1.** El §8.1 pide
   `width_cm × height_cm` *"no el default inventado de `ImageEditPanel.tsx:137-138`"*. El
   plan copiaba esas **dos** líneas a su propio escenario (`:274` y `:278` de su bloque de
   test: `width_cm: 14` y `width_cm: 10` hardcodeados) y **nunca mencionaba el default**:
   su `FiguraEscenario` decía "Si `width_cm` y `height_cm` están disponibles... con
   `max-width: 100%`", que es un tamaño inventado distinto y peor, porque no usa la
   geometría de F2 que §8.2 exige. Los `|| 12` / `|| 8` están en **nueve** lugares de
   `ImageEditPanel` y en dos de `PaperCanvas`, no en dos.

4. **Usaba tokens que no existen y daba porexisting otros que F1 borró.** El encabezado
   del plan decía *"los tokens declarados en F1 (`--surface-bg`, `--surface-alt`, etc.)"*.
   **`--surface-bg` y `--surface-alt` no existen**: son exactamente los tokens fantasma
   que F1 sacó de la pantalla, y su aparecimiento es la prueba de que el plan se escribió
   sin leer el repo. Y sus tests afirmaban
   `expect(pill).toHaveStyle({ color: 'var(--severity-warning)' })` y
   `borderColor: 'var(--severity-warning)'`: **`--severity-warning` tampoco existe**. Con
   `tokensDeclarados.test.ts` recorreindo todo `src/**`, ambos rompen la suite en el
   momento en que se escriben.

5. **La baseline y el alcance del lint estaban dos fases atrás.** Decía *"Hereda el
   baseline de F0 + F1"*, y el spec §3.2 que citaba es el de la Fase 1, dos fases
   atrás. El real es **1251/809**. Y la arquitectura del plan ("tres zonas", un archivo nuevo en
   `src/components/figures/`) **no sumaba esa carpeta al alcance de R3**
   (`noHardcodedColors.test.ts:166-174`), así que el lint de colores literales habría
   dejado de mirar justo el código nuevo: el mismo mecanismo de "deuda" que la F1 scojó
   de la mesa, reintroducido por la puerta de atrás.

### Qué cambió en cada tarea

| | Plan anterior | Ahora | Por qué |
|---|---|---|---|
| **Global Constraints** | *"nunca `node:fs`"*, baseline "hereda F0+F1" | `?raw` para `.ts`/`.tsx`, rodeo de specifier en variable para `.css`, con el porqué; baseline 1251/809/tsc/build medidos hoy; `DEUDA_MEDIDA` nombrada como mecanismo **prohibido**; lista de tokens que **sí** existen | La regla de lectura estaba invertida y ya se corrigió en F1–F3 (§3.1 del spec). Repetirla manda a rehacer el rodeo del specifier literal, que ya costó tres suites mudas |
| **Arquitectura** | tres zonas nuevas dentro del paso, `FiguraInspector` incluido | tres columnas: lista contextual + escenario **dentro** del paso, inspector en el `RightSidePanel` que ya existe; documento por toggle | Era una cuarta columna (`App.tsx:713`) |
| **Tasks** | 5 (navegador, escenario, inspector, ensamble, responsive) | 5 (verdad-de-la-figura, lista, escenario, inspector, montaje+guardián) | El "responsive" se cae: el panel ya tiene ancho, resize y cierre. Y aparece el guardián de montaje, que el plan no tenía |
| **Task 1 (nueva)** | no existía | `seccionesDeElementos` en `jerarquia.ts` + `src/lib/figuras.ts`: contexto posicional, `buscarFiguras` por sección, `medidaDeFigura` con la geometría de F2 | La lógica estaba embebida en un `useMemo` del componente y por eso no se podía probar. Y el `sectionMap` por id tenía que morir |
| **Task 2 (era "navegador de secciones")** | `SectionNavigator` con pills `Fig N` por sección; su `onError` **reutilizaba el de `:399`**, o sea el `visibility: hidden` que §8.1 manda cambiar; sus tests afirmaban un token inexistente; la lista agrupada se quedaba | `ListaContextual` con el bloque de cinco datos de §8.1; placeholder de verdad en `onError`; `EstadoVacio` de F1 en vez del vacío propio de `:324-348`; `minHeight: 0` **y** `minWidth: 0`; `maxHeight` en el header; `components/figures` entra al alcance de R3 | §8.1 y §8.4. Y el vacío propio de `:324-348` era el quinto estado vacío escrito a mano, que es el defecto de F1 volviendo |
| **Task 3 (era "escenario central")** | `FiguraEscenario` con `max-width: 100%` y `width_cm` hardcodeado en el test; la tabla "primeras 3 filas y 4 columnas de `element.table_info?.rows`", **que no existe**: `TableModel` tiene `headers` y `rows`; la navegación usaba `filteredItems` (la lista filtrada) mientras la posición se derivaba de la sección, dos fuentes que no coinciden | `EscenarioFigura` a la escala de F2, con `medidaDeFigura`; tabla con `headers` + `rows` reales y el aviso de cuántas faltan; navegación por `vecina`; documento por toggle con `VISTA_POR_DEFECTO`; `MiniToolbar` adentro del toggle | §8.2 ("la previsualización usa la geometría de la Fase 2") y el tipo real de `TableModel` (`src/types/index.ts:88-95`) |
| **Task 4 (era "inspector lateral")** | `FiguraInspector` **nuevo** en `src/components/figures/`, mientras el `ImageEditPanel` se "conserva" a la espera de un `grep` que ya se podía hacer; `totalFigures` como prop, que obliga al padre a saber contar; el botón "Sugerir con IA" sin cablear; sin "aplicar a todas" de verdad, sin debounce, sin tocar el código muerto; un `Select-String ... -Recurse` que **no es un parámetro de `Select-String`** y falla | Se **reescribe** `ImageEditPanel` (opción **a** de §8.3) con los cinco presets de `:24-95` restaurados y con alcance; `aplicarImagenAMuchas` en el slice, con progreso y sin mentira de "listo"; los cinco `<textarea>` y los cuatro inputs de `ElementInspector` a estado local + `blur`; los nueve `|| 12`/`|| 8` fuera; `Abrir panel de edición` navega, con "Volver al inspector" con nombre; `APARuleSet`, `portada`/`setPortada` y `TabId` borrados | §8.2, §8.3, §3.5, §3.10 |
| **Task 5 (nueva)** | "responsive" con `window.innerWidth >= 900` y un `StoreProvider` **que no existe** en el repo (el store es `create<DocState>()` de zustand, sin provider), y con el `Object.defineProperty` de `innerWidth` **después** del `render`, o sea después de que el componente ya lo leyó | `figurasEstaMontada.test.tsx`: cinco pruebas negativas, con `useDocStore.setState` para el documento y `vi.mock` para el lienzo | El componente ya tiene su propio colapso y su handle de resize (`RightSidePanel.tsx:187-193`); un segundo mecanismo es una segunda regla. Y un test sobre un provider inexistente no es un test, es una aspiración |
| **Test de layout** | `import src from '../components/figures/FiguraEscenario.tsx?raw'` **dentro** de un `it()`: es un `import()` dinámico cuyo resultado es un objeto de módulo, así que `expect(src).toMatch(...)` falla siempre; y el segundo caso era un `...` literal | `listaContextualLayout.test.ts` con `import.meta.glob` de nivel de módulo, las tres reglas de §8.4 afirmadas sobre el código, y una guarda que afirma que el glob leyó | La regla a medias de `?raw` (§3.1) y una prueba que no puede pasar |
| **Self-Review** | "Lo que se conserva: ... `ImageEditPanel`, `sectionMap`, `groupedItems`. La lógica no cambia" | Lo que se conserva, y lo que **se reescribe** y por qué | La lógica de datos **tenía** que cambiar: es §8.1 |

### Lo que el plan anterior daba por hecho y era falso

Cada punto está medido, y todos están citados arriba con archivo y línea:

- **Que el rail se podía dejar como estaba** (`"se conserva íntegra"`). No: es el bug de
  §8.1, y el `sectionMap` indexa por id en `:107`.
- **Que `--surface-bg` y `--surface-alt` estaban declarados.** No existen. Son los
  tokens fantasma que F1 sacó de la pantalla.
- **Que `--severity-warning` existía.** No existe. Los tokens de aviso son
  `--color-warning`, `--color-warning-a05/a12/a30/a40`, `--severity-warning-soft`.
- **Que `ImageEditPanel` podía tener otros consumidores.** No: el único importador es
  `RightSidePanel.tsx:262`.
- **Que `ReviewMinimap` estaba en `components/wizard/`.** Está en
  `src/components/review/ReviewMinimap.tsx` desde F1, y §14 lo prohíbe en tres columnas.
- **Que los tests de componente se montan con un `StoreProvider`.** No existe: el store es
  `useDocStore = create<DocState>()(...)` (`src/store/useDocStore.ts:31`), sin provider.
  Los tests siembran el documento con `useDocStore.setState` (así lo hace
  `estructuraEstaMontada.test.tsx:137-153`).
- **Que `Select-String` acepta `-Recurse`.** No lo acepta: `Select-String : No se
  encuentra ningún parámetro que coincida con el nombre del parámetro 'Recurse'`. Para un
  árbol hay que pasar `(Get-ChildItem -Recurse ...).FullName`.
- **Que `element.table_info.rows` existe.** `TableModel` tiene `headers: string[]` y
  `rows: string[][]` (`src/types/index.ts:88-95`); el plan leía `rows` de un objeto que
  no lo tiene, iba a pintar `undefined`.
- **Que el `ProactiveSuggestionCard` dispara un fetch por pulsación.** **No.** Su
  `useEffect` (`src/components/inspector/ProactiveSuggestionCard.tsx:37-62`) depende de
  `[doc?.session_id, selectedElementId]`, y ninguna de las dos cosas cambia al escribir un
  párrafo: `updateElementType` (`documentSlice.ts:787-800`) devuelve el documento
  completo pero no mueve la selección. El fetch por pulsación **existe**, y es peor de
  otro modo: `setProp` de `ImageEditPanel.tsx:143` llama a `updateElementImage` en cada
  `onChange`, y eso es `api.updateElement` por letra, con `pushHistory` por letra y, en el
  caso de la leyenda, `cleanRedundantTitleParagraphs` (`documentSlice.ts:815-817`)
  reescribiendo párrafos del documento letra por letra. Lo mismo en los cuatro campos de
  `ElementInspector`. **El defecto es real; la atribución del spec §8.3 y del encargo
  estaba equivocada, y el arreglo cae en los mismos archivos por otra razón.** El
  `ProactiveSuggestionCard` se deja como está y por qué se deja está escrito al lado.
- **Que el diagnóstico del tapado era solo el `minWidth: 0` de `:445`.** El `:445` es
  cierto (`minHeight: 0` sí, `minWidth: 0` no), pero **el que deja la lista en 0 px es el
  `minHeight: 0` que falta en `:323`**, combinado con el header de `:180` sin `maxHeight`.
  Los dos se arreglan.

### Suposiciones del encargo que resultaron falsas

- **`pytest python/tests/ -q` → 804 passed.** Medido ahora: **809 passed, 14 skipped**. El
  804 quedó viejo; la tabla de baseline usa el número de hoy.
- **`Step3FiguresTablesWizard.tsx` tiene 490 líneas.** Tiene **489**. Irrelevante, pero
  las citas de línea de este plan están verificadas una por una contra el archivo actual,
  no redondeadas.
- **"El header del rail es `:180-321` y `minWidth: 0` falta en `:445`."** Las dos líneas
  son correctas, pero `:445` no es la causa del tapado (ver arriba). La causa es `:323`.
- **"`:399` es el `onError`."** Correcto, y es el único `onError` de miniatura del
  archivo. Pero el plan anterior lo citaba como algo a **reutilizar** en su escenario, que
  es el `visibility: hidden` que §8.1 manda sacar.
- **"`FindingDetail`, `EngineGroupCard` y `AuditItem` tienen `sinTexto`."** `sinTexto` está
  en el tipo de `AuditItem` (`src/lib/auditItems.ts:71`) y lo consume `FindingDetail`
  (`:226-231`). `EngineGroupCard` **no** lee `sinTexto`: usa `originalText` (`:226-239`),
  que para figuras y tablas es `''`, así que el bloque no se pinta. No es un defecto —
  es el comportamiento correcto de un `&&` sobre cadena vacía — pero significa que el
  "texto de reserva" de un hallazgo de figura **no se ha inventado todavía en ninguna
  parte**, y F4 no debe inventarlo.
