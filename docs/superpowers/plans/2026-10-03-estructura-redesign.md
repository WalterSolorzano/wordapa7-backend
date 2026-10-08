# Estructura Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la fase de Estructura partida por una sola fase montada (`EscritorioEstructura`) con jerarquía visual, tipografía cargada (Inter/Outfit/Newsreader/JetBrains), prosa como panel derecho abierta al tocar un título, y paleta sin amarillo (teal + navy).

**Architecture:** `App.tsx` monta `EscritorioEstructura` en `wizardStep === 2`. El shell es un grid de 3 columnas: `IndiceEstructura` (esquema puro) | `MapaEstructura` (diagrama responsive animado) | panel con pestañas Prosa (`LecturaProsaSeccion`) y Herramientas (`InspectorRama` + `FaltasApa7`). Los 4 componentes absorbidos se eliminan y el guardián se reescribe con el contrato nuevo.

**Tech Stack:** React 18, TypeScript, Vite 5, Zustand, lucide-react, Vitest + Testing Library. CSS con design tokens (`src/styles/design-system.css`). Sin librerías de grafos.

**Spec:** `docs/superpowers/specs/2026-10-03-estructura-redesign-design.md`
**Mockup (fuente visual):** `docs/superpowers/mockups/2026-10-03-estructura-redesign.html`

## Global Constraints

- Cero emojis; solo iconos `lucide-react`.
- Cero hex/rgba hardcodeado en componentes: solo `var(--token)`. Lo verifica `noHardcodedColors.test.ts`.
- Sin librerías de grafos: lo verifica `estructuraNoMiente.test.ts`.
- No tocar backend/endpoints.
- No inventar la lista de secciones obligatorias APA 7.
- Acciones solo si tienen endpoint real; nada de botones mudos.
- `prefers-reduced-motion` respetado.

## Review Focus

1. **Documento sin encabezados:** el diagrama y el esquema deben decir "no hay estructura que medir", no romper.
2. **Sin nodo seleccionado:** el panel derecho debe pedir elegir algo, nunca quedar en blanco.
3. **Sección sin prosa:** `LecturaProsaSeccion` debe decir "aún no contiene párrafos", no quedar vacía.
4. **Encabezado con hijos pero sin párrafos:** (el "no tiene nada dentro" reportado) la prosa muestra sus subsecciones, no un falso vacío.
5. **Recolor del warning:** cualquier superficie que lo use debe seguir legible en claro y oscuro.

---

### Task 1: Tokens y fuentes

**Files:**
- Modify: `src/styles/design-system.css`
- Modify: `src/styles/design-tokens.md`
- Modify: `src/main.tsx`
- Modify: `package.json` (dependencias de fuente)

**Interfaces:**
- Produces (tokens): `--font-display`, `--font-editorial`, `--color-secondary`, `--color-secondary-soft`, `--color-ink`, `--color-level-3`; `--color-warning`/`--severity-warning-soft` recolorados.

- [ ] **Step 1: Agregar dependencias de fuente**

```bash
npm install @fontsource/outfit @fontsource/jetbrains-mono
```

- [ ] **Step 2: Cargar fuentes en `src/main.tsx`** (junto a los imports existentes de Inter/Newsreader)

```ts
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
```

- [ ] **Step 3: Declarar tokens nuevos y recolorear warning en `design-system.css`**

En `:root` (sección tipografía):

```css
--font-display: 'Outfit', 'Inter', system-ui, sans-serif;
--font-editorial: 'Newsreader', 'Georgia', serif;
```

En `:root` (sección color):

```css
--color-secondary: #0d9488;
--color-secondary-soft: rgba(13, 148, 136, 0.12);
--color-ink: #1e3a5f;
--color-level-3: #6366f1;
```

Recolor warning (claro): `--color-warning: #c0562e;` y `--severity-warning-soft: rgba(192, 86, 46, 0.12);`; alfas `--color-warning-a05/a08/a12/a30/a40` a base `192, 86, 46`.
Recolor warning (oscuro `:root[data-theme="dark"]`): `--color-warning: #e08a63;` y sus alfas a base `224, 138, 99`.

- [ ] **Step 4: Actualizar `design-tokens.md`** (fila de `--color-warning` a `#c0562e / #e08a63`).

- [ ] **Step 5: Verificar**

Run: `npm test -- --reporter=dot src/__tests__/designTokens.test.ts src/__tests__/noHardcodedColors.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/styles/design-system.css src/styles/design-tokens.md src/main.tsx package.json package-lock.json
git commit -m "feat(design): tokens teal/navy y fuentes Outfit + JetBrains; warning sin amarillo"
```

---

### Task 2: Guardián nuevo (TDD)

**Files:**
- Modify: `src/__tests__/estructuraEstaMontada.test.tsx`

**Interfaces:**
- Consumes: `EscritorioEstructura`, `fasesConocidasDe` de `src/components/structure/EscritorioEstructura.tsx`; `construirJerarquia` de `src/lib/jerarquia`.
- Produces (contrato observable): testids `indice-estructura`, `diagrama-estructura`, `prosa-seccion`; pestañas `Prosa`/`Herramientas`.

- [ ] **Step 1: Reescribir el guardián con el contrato nuevo**

Contenido íntegro del archivo (reemplaza el actual; conserva el lector de fuentes `?raw` y la lógica de importadores, cambia los `describe`):

- Test A: monta `EscritorioEstructura` con el documento de prueba; espera `indice-estructura` y `diagrama-estructura`; NO espera `documento-completo`.
- Test B: clic en `2. Metodología` (fila del esquema) ⇒ aparece `prosa-seccion` y su texto incluye `2. Metodología`.
- Test C: pestaña `Herramientas` visible/accesible por `role="tab"`; al activarla aparece el inspector (usa `getByRole('tab', { name: /herramientas/i })`).
- Test D: sin encabezados, el esquema dice que no hay estructura (role=status).
- Test E (`describe` de montaje): `App.tsx` contiene `from './components/structure/EscritorioEstructura'` y monta `<EscritorioEstructura` bajo `wizardStep === 2`.
- Test F (huérfanos): cada `.tsx` de `src/components/structure/` (excluyendo `__tests__`) tiene al menos un importador; la lista se lee del disco y `NOMBRES_DE_LA_CARPETA.length >= 7` contiene `EscritorioEstructura` e `IndiceEstructura`. **Excluir explícitamente los nombres de archivos de test de la lista de candidatos** (los `*.test.tsx` no cuentan como componentes huérfanos).
- Test G: ningún fuente de la carpeta contiene `<select` (case-insensitive).
- Tests H/I (fase): los que ya existen para `fasesConocidasDe` y `construirJerarquia`, sin cambios.

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run src/__tests__/estructuraEstaMontada.test.tsx`
Expected: FAIL (testids y montaje nuevos inexistentes).

- [ ] **Step 3: Commit del test** (con el resto de la fase aún sin implementar; el rojo es el contrato)

```bash
git add src/__tests__/estructuraEstaMontada.test.tsx
git commit -m "test(estructura): guardián con contrato nuevo (3 columnas + prosa al tocar)"
```

---

### Task 3: Shell `EscritorioEstructura` + `IndiceEstructura` puro

**Files:**
- Modify: `src/components/structure/EscritorioEstructura.tsx`
- Modify: `src/components/structure/IndiceEstructura.tsx`
- Modify: `src/components/structure/NodoIndice.tsx`

**Interfaces:**
- Consumes: `IndiceEstructura` (props `elementos`, `faseConocida`, `onSelect`, `nodoSeleccionadoId`), `MapaEstructura` (`raices`, `onSelect`), `LecturaProsaSeccion` (`seccionActiva`, `elementos`), `InspectorRama` (`nodo`, `elementos`), `FaltasApa7` (`raices`, `onSelect`).
- Produces: `EscritorioEstructura` renderiza `indice-estructura` + `diagrama-estructura` + panel con tabs Prosa/Herramientas y `data-testid="prosa-seccion"`.

- [ ] **Step 1: `IndiceEstructura` deja de tener toggle.** Quitar el estado `vista`, los botones «ver el mapa/documento» y los bloques `documento-completo`/`mapa-estructura`. Deja solo la lista (`data-testid="indice-estructura"`), con chips de foco por fase, colapsar/expandir y autonumeración. Firma:

```ts
export interface IndiceEstructuraProps {
  elementos: readonly ElementModel[] | null;
  faseConocida?: FasesConocidas;
  vocabulario?: VocabularioFases;
  onSelect?: (nodo: NodoJerarquia) => void;
  nodoSeleccionadoId?: string | null;
}
```
`documento` se retira de las props (deja de existir el toggle del documento en el centro).

- [ ] **Step 2: `NodoIndice` con jerarquía real** (H1 Outfit 700 13.5px, H2 500, H3 400; conector de nivel; conteo mono; barra de balance). Solo tokens.

- [ ] **Step 3: Reescribir `EscritorioEstructura`** como shell de 3 columnas. Estado: `elegido: NodoJerarquia | null`, `tab: 'prosa' | 'herr'`, `ampliado: boolean`. Al montar autoselecciona `raices[0]`. `onSelect` de esquema y diagrama ⇒ `setElegido(nodo); setTab('prosa')`. Panel derecho:

```tsx
<aside className="panel-derecho" aria-label="Panel de la sección">
  <div role="tablist" aria-label="Panel">
    <button role="tab" aria-selected={tab==='prosa'} onClick={()=>setTab('prosa')}>Prosa</button>
    <button role="tab" aria-selected={tab==='herr'} onClick={()=>setTab('herr')}>Herramientas</button>
    <button onClick={()=>setAmpliado(v=>!v)} aria-pressed={ampliado}>Ampliar</button>
  </div>
  {tab==='prosa'
    ? <LecturaProsaSeccion seccionActiva={elegido} elementos={elementos ?? []} />
    : <div data-testid="panel-herramientas">/* InspectorRama + FaltasApa7 */</div>}
</aside>
```

`LecturaProsaSeccion` debe exponer `data-testid="prosa-seccion"`. Grid con `gridTemplateColumns` conmutando 452px/760px según `ampliado`. Todo con tokens.

- [ ] **Step 4: Correr el guardián**

Run: `npx vitest run src/__tests__/estructuraEstaMontada.test.tsx`
Expected: los tests de montaje/estructura pasan; los de prosa al tocar y huérfanos todavía pueden fallar hasta Task 6.

- [ ] **Step 5: Commit**

```bash
git add src/components/structure/EscritorioEstructura.tsx src/components/structure/IndiceEstructura.tsx src/components/structure/NodoIndice.tsx
git commit -m "feat(estructura): shell 3 columnas y esquema puro"
```

---

### Task 4: Diagrama responsive animado (`MapaEstructura`)

**Files:**
- Modify: `src/components/structure/MapaEstructura.tsx`
- Modify: `src/components/structure/__tests__/DiagramaAnatomicoSVG.test.tsx` → **borrar**; escribir `src/components/structure/__tests__/MapaEstructura.test.tsx`

**Interfaces:**
- Consumes: `NodoJerarquia`, `miles`.
- Produces: `<svg data-testid="diagrama-estructura" className="mapa-estructura">` responsive; `posicionesDe` se mantiene exportada.

- [ ] **Step 1: Test del diagrama** — verifica nodos por nivel, colores por nivel (clases `lv1/lv2/lv3`), etiqueta dentro, y que el SVG es responsive (`width="100%"` o `viewBox` con ancho relativo).

- [ ] **Step 2: Reescribir `MapaEstructura`** usando clases CSS `lv1/lv2/lv3` (colores desde tokens: `--color-accent`, `--color-secondary`, `--color-level-3`), aristas con `className="edge e{nivel}"` animadas por CSS, `viewBox` + `width:100%`, `data-testid="diagrama-estructura"`. Mantener `posicionesDe` y `etiquetaCortada`. Agregar selección (`sel`), doble clic colapsa, y `data-nivel` por nodo.

- [ ] **Step 3: CSS del diagrama** en `design-system.css` (clases `.mapa-estructura .box/.lv1/.lv2/.lv3/.edge/.flow/.node/.sel`), con `@media (prefers-reduced-motion: reduce)`.

- [ ] **Step 4: Correr**

Run: `npx vitest run src/components/structure/__tests__/MapaEstructura.test.tsx src/__tests__/estructuraNoMiente.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/structure/MapaEstructura.tsx src/components/structure/__tests__/ src/styles/design-system.css
git commit -m "feat(estructura): diagrama responsive animado por nivel"
```

---

### Task 5: Prosa en tokens + panel Herramientas

**Files:**
- Modify: `src/components/structure/LecturaProsaSeccion.tsx`
- Modify: `src/components/structure/__tests__/LecturaProsaSeccion.test.tsx`

**Interfaces:**
- Consumes: `NodoJerarquia`, `ElementModel`.
- Produces: `data-testid="prosa-seccion"`; usa `--font-editorial`, `--font-display`, `--paper-white`, `--paper-ink`.

- [ ] **Step 1: Reescribir `LecturaProsaSeccion`** sin clases Tailwind con hex: usar estilos inline o clases CSS con `var(--token)`; `data-testid="prosa-seccion"`; título editorial en `--font-editorial`/`--color-ink`; cuerpo `--font-editorial` 16px; `heading_level` usa `--font-display`; figuras con tokens. **Encabezado con hijos pero sin párrafos** debe mostrar las subsecciones (arregla el "no tiene nada dentro").

- [ ] **Step 2: Verificar que el test de prosa siga en verde** (ajustar selectores si el texto cambió).

Run: `npx vitest run src/components/structure/__tests__/LecturaProsaSeccion.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/structure/LecturaProsaSeccion.tsx src/components/structure/__tests__/LecturaProsaSeccion.test.tsx
git commit -m "feat(estructura): prosa editorial en tokens y panel de herramientas"
```

---

### Task 6: Montaje en App + eliminar absorbidos

**Files:**
- Modify: `src/App.tsx`
- Delete: `EstudioEstructuraView.tsx`, `EsqueletoNavegacion.tsx`, `DiagramaAnatomicoSVG.tsx`, `InspectorActivosSeccion.tsx`
- Delete: sus tests (`EstudioEstructuraView.test.tsx`, `EsqueletoNavegacion.test.tsx`, `DiagramaAnatomicoSVG.test.tsx`, `InspectorActivosSeccion.test.tsx`)
- Decide: `DistribucionVolumen`, `MatrizEvidencias`, `ReorganizadorCapitulos` (si no se pliegan, eliminar con su test)

**Interfaces:**
- Consumes: `EscritorioEstructura`.
- Produces: `App.tsx` monta `EscritorioEstructura` en `wizardStep === 2`.

- [ ] **Step 1: `App.tsx`** — cambiar el import y ambos montajes de `EstudioEstructuraView` por `EscritorioEstructura` (líneas 651 y 669).

- [ ] **Step 2: Borrar los 4 absorbidos y sus tests.** Borrar los 3 módulos plegados si ya no se usan (verificar importadores con grep antes).

- [ ] **Step 3: Correr el guardián completo y la suite de estructura**

Run: `npx vitest run src/__tests__/estructuraEstaMontada.test.tsx src/__tests__/estructuraNoMiente.test.ts src/components/structure/__tests__/`
Expected: PASS, sin huérfanos.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(estructura): montar EscritorioEstructura y eliminar implementación muerta"
```

---

### Task 7: Verificación completa

- [ ] **Step 1:** `npm test -- --reporter=dot` → toda la suite en verde (125 tests esperados, ajustar los que cambien por el recolor).
- [ ] **Step 2:** `npm run build` → build sin errores de TypeScript.
- [ ] **Step 3:** Verificar en el mockup local (`http://localhost:8765/2026-10-03-estructura-redesign.html`) que lo implementado coincide.
- [ ] **Step 4:** Commit final si hubo ajustes.

```bash
git add -A
git commit -m "chore(estructura): verificación completa del rediseño"
```
