# F0 — Base verde: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar `vitest`, `tsc`, `pytest` y `build` en verde antes de tocar cualquier superficie.

**Architecture:** Las siete guardas rojas del commit `f9f360f` son cuatro archivos de test que consignan el rediseño a medias. No se relaja ninguna guarda: se arregla el código que la viola. Cada arreglo es mecánico y local (literales de color a tokens, `strokeWidth` al token, iconos propios a lucide, y dos contratos de comportamiento de portada).

**Tech Stack:** React 18 + TypeScript, Vite 5, Vitest, Tailwind-free CSS con tokens (`src/styles/design-system.css`).

**Spec:** `docs/superpowers/specs/2026-09-29-plan-correccion-por-fases-design.md` (§5 F0).

## Global Constraints

- Cero colores literales (hex, `rgb`, `rgba`) en TS/TSX. Solo tokens.
- Ningún `var(--token, fallback)`: el fallback esconde un token inexistente.
- `strokeWidth` es siempre `var(--icon-stroke)` (1.75).
- Los íconos vienen de `lucide-react`; no se dibujan a mano (AGENTS.md §1).
- Cero emojis. Cero CJK.
- `git add` explícito archivo por archivo. Nunca `git add -A`.

## Review Focus

- Un `var(--token)` sin declarar en `design-system.css` no la rompe en claro pero deja la caja sin borde en oscuro: cada token reemplazado tiene que existir en los dos temas.
- Un `strokeWidth="var(--icon-stroke)"` dentro de un `<svg>` ilustrativo (diagramas de 36x24) sigue siendo válido: R5 no perdona un grosor distinto.
- Reemplazar iconografía propia por lucide cambia el dibujo: hay que verificar que ningún `export` usado fuera del archivo desaparezca.
- La portada con un logo que falla tiene que DECIRLO, no desaparecer en silencio.

---

### Task 1: R1/R2 — literales de color y fallbacks fuera del código de estructura/figuras

**Files:**
- Modify: `src/components/structure/NodoIndice.tsx`
- Modify: `src/components/structure/IndiceEstructura.tsx`
- Modify: `src/components/structure/InspectorRama.tsx`
- Modify: `src/components/structure/FaltasApa7.tsx`
- Modify: `src/components/structure/PulsoDocumento.tsx`
- Modify: `src/components/figures/EscenarioFigura.tsx`

**Interfaces:**
- Produces: ninguna API nueva. Solo valores de `style` con tokens declarados.

- [x] **Step 1: Correr la guarda para ver el rojo**

Run: `npx vitest run src/__tests__/noHardcodedColors.test.ts`
Expected: FAIL — 17 literales (R1) y 12 fallbacks (R2).

- [x] **Step 2: Reemplazar literales por tokens declarados**

`NodoIndice.tsx`: `rgba(0,0,0,0.1)` → `var(--color-border-subtle)`; `rgba(255,255,255,0.3)` → `var(--color-on-media-a30)`; `0.15` y `0.12` → `var(--color-on-media-a08)`; `0.6` y `0.7` → `var(--color-on-media-a70)`; `0.8` y `0.85` → `var(--color-on-media-a90)`; `var(--shadow-sm, ...)` → `var(--shadow-sm)`; `var(--transition-fast, 150ms ease)` → `var(--transition-fast)`; `var(--severity-warning-soft, ...)` → `var(--severity-warning-soft)`.
`IndiceEstructura.tsx`, `InspectorRama.tsx`, `FaltasApa7.tsx`, `PulsoDocumento.tsx`: mismos tokens para `shadow-*`, `transition-fast`, `severity-warning-soft`.
`EscenarioFigura.tsx:325`: `var(--shadow-md, 0 4px 12px rgba(0,0,0,0.15))` → `var(--shadow-md)`.

- [x] **Step 3: Correr la guarda**

Run: `npx vitest run src/__tests__/noHardcodedColors.test.ts`
Expected: R1 y R2 sin ofensas.

- [x] **Step 4: Commit**

```bash
git add src/components/structure/NodoIndice.tsx src/components/structure/IndiceEstructura.tsx src/components/structure/InspectorRama.tsx src/components/structure/FaltasApa7.tsx src/components/structure/PulsoDocumento.tsx src/components/figures/EscenarioFigura.tsx
```

---

### Task 2: R5 — `strokeWidth` siempre de `--icon-stroke`

**Files:**
- Modify: `src/components/inspector/ImageEditPanel.tsx:462,473,489,500`
- Modify: `src/components/wizard/CoverEditorPanel.tsx:601`

- [x] **Step 1: Correr la guarda para ver el rojo**

Run: `npx vitest run src/__tests__/noHardcodedColors.test.ts -t R5`
Expected: FAIL — 5 grosores distintos de 1.75.

- [x] **Step 2: Cambiar los grosores**

`ImageEditPanel.tsx`: `strokeWidth="1"` → `strokeWidth="var(--icon-stroke)"` en los cuatro diagramas de distribución.
`CoverEditorPanel.tsx:601`: `<Check size={12} strokeWidth={2.5} .../>` → `strokeWidth="var(--icon-stroke)"`.

- [x] **Step 3: Correr la guarda**

Run: `npx vitest run src/__tests__/noHardcodedColors.test.ts -t R5`
Expected: PASS.

---

### Task 3: R6 — la iconografía propia de `Step0QuickStart` pasa a lucide

**Files:**
- Modify: `src/components/wizard/Step0QuickStart.tsx`

**Interfaces:**
- Consumes: `AppBrandLogo` de `src/components/shared/AppBrandLogo.tsx`.
- Produces: se eliminan los `export` `APAFileIcon`, `APATypeIcon`, `APACoverStudentIcon`, `APACoverProIcon`, `APARecentsClockIcon`, `APACheckIcon` (no se importan desde ningún otro archivo).

- [x] **Step 1: Correr la guarda para ver el rojo**

Run: `npx vitest run src/__tests__/noHardcodedColors.test.ts -t "ilustraciones"`
Expected: FAIL — `expected 20 to be less than 20`.

- [x] **Step 2: Convertir la iconografía**

Borrar el bloque de siete `<svg>` propios (`BrandLogo` local + seis `APA*Icon`). Reemplazar usos: `APAFileIcon`→`FileText`, `APATypeIcon`→`Type`, `APACoverStudentIcon`→`GraduationCap`, `APACoverProIcon`→`BookOpen`, `APARecentsClockIcon`→`Clock`, `APACheckIcon`→`BadgeCheck`, `BrandLogo`→`AppBrandLogo` (importado de `../shared/AppBrandLogo`). Los siete lucide ya estaban importados.

- [x] **Step 3: Correr la guarda**

Run: `npx vitest run src/__tests__/noHardcodedColors.test.ts -t "ilustraciones"`
Expected: PASS — ilustraciones totales < 20 (quedan 13).

---

### Task 4: Portada — un logo que no carga se dice

**Files:**
- Modify: `src/components/wizard/CoverEditorPanel.tsx:596`
- Test: `src/__tests__/portadaInstitucion.test.tsx:179`

- [x] **Step 1: Correr la guarda para ver el rojo**

Run: `npx vitest run src/__tests__/portadaInstitucion.test.tsx`
Expected: FAIL — no encuentra `/no se pudo cargar/i`.

- [x] **Step 2: Cambiar el texto y limpiar los dos literales de la fila**

`{u.codigo}: sin logo` → `{u.codigo}: el logo no se pudo cargar`. En la misma fila, `#ffffff` → `var(--paper-white)` y `rgba(0,0,0,0.15)` → `var(--color-ink-a20)` (lo exige `portadaNoMiente.test.ts`).

- [x] **Step 3: Correr las dos guardas**

Run: `npx vitest run src/__tests__/portadaInstitucion.test.tsx src/__tests__/portadaNoMiente.test.ts`
Expected: PASS.

---

### Task 5: El toggle del índice — la guarda tenía una tilde de menos

**Files:**
- Modify: `src/__tests__/indiceEstructura.test.tsx:260`

- [x] **Step 1: Correr la guarda para ver el rojo**

Run: `npx vitest run src/__tests__/indiceEstructura.test.tsx`
Expected: FAIL — `Unable to find ... /ver el indice/i`.

- [x] **Step 2: Corregir el matcher**

El botón dice `Ver el índice` (con tilde); el matcher pedía `/ver el indice/i` (sin tilde). Se corrige el matcher a `/ver el índice/i`. No es relajar la guarda: la conducta (el toggle devuelve del mapa al índice) es la correcta y el defecto era del test.

- [x] **Step 3: Correr la guarda**

Run: `npx vitest run src/__tests__/indiceEstructura.test.tsx`
Expected: PASS.

---

### Task 6: Verificación de la base

- [x] **Step 1: Suite completa, tipos, backend y build**

Run: `npx vitest run` → sin fallas.
Run: `npx tsc --noEmit` → limpio.
Run: `.venv\Scripts\python.exe -m pytest python/tests/ -q` → sin bajar de la base.
Run: `npm run build` → sin error.

- [x] **Step 2: Commit**

```bash
git add src/__tests__/  src/components/
git commit -m "F0: la base vuelve a verde, con las siete guardas del rediseno cerradas"
```
