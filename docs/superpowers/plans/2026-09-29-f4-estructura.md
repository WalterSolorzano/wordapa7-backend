# F4 — Estructura: el escritorio de redacción — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La pantalla de Estructura deja de verse como un tablero ajeno: muere la banda navy con el borde azul en cada fila H1, y la barra de modos deja de gritar.

**Architecture:** El eje es el índice (ya lo es). Cambia la PRESENTACIÓN de la fila (`NodoIndice`) y del chrome de la fase (`StructureTabBar` en `App.tsx`). Ninguna regla de jerarquía se re-deriva: `lib/jerarquia.ts` sigue siendo la única fuente.

**Tech Stack:** React 18, TypeScript, tokens de `src/styles/design-system.css`, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-29-plan-correccion-por-fases-design.md` (§5 F4).

## Global Constraints

- Cero colores literales. Solo tokens.
- Cero emojis. Solo `lucide-react`, `strokeWidth="var(--icon-stroke)"`.
- La fase abre en el índice y el documento es un toggle.
- No se rompe ninguna guarda existente. `git add` explícito.

## Review Focus

- Un H1 y un H2 se distinguen SIN color: por peso, por el badge y por sangría.
- La selección se ve, pero sin un borde lateral que se lea como "marcado por IA".
- Los tres destinos de la fase 2 siguen siendo alcanzables con el modo foco prendido.

---

### Task 1: La fila del índice — fuera la banda navy y el borde azul  ✔ HECHO

**Files:** `src/components/structure/NodoIndice.tsx`, `src/__tests__/indiceEstructura.test.tsx`

- [x] Test nuevo: `la fila no usa la banda navy ni un borde de acento por nivel`.
- [x] `NodoIndice`: se borran `bgFila`/`colorTexto` navy y el `borderLeft`. H1 se distingue por `--color-bg-surface-alt`, `fontWeight: 700` y el badge en acento; H2/H3 por peso decreciente y sangría. Seleccionado por `--color-accent-soft`, sin borde.
- [x] Los tokens `--color-on-media-*` que la banda navy necesitaba se van con ella.

### Task 2: La barra de modos deja de ser una banda navy  ✔ HECHO

**Files:** `src/App.tsx` (`StructureTabBar`)

- [x] Fuera `--color-navy-header`, los cinco literales `rgba(...)`, el `boxShadow` y `--radius-full, 9999px`.
- [x] Pasa a un segmentado quieto sobre el papel: fondo `--color-bg-surface`, borde `--color-border-subtle`, activo en `--color-accent-soft`.

**Por qué NO se borró la barra (decisión, no olvido):** fusionar los tres modos en una sola superficie era la propuesta del spec, pero `src/__tests__/focoNoBarraElSelector.test.tsx` es una guarda que exige que `Títulos` y `Cuerpo` sigan ALCANZABLES con el modo foco prendido — nació de un defecto real: el índice quedaba como callejón sin salida. Borrar la barra obliga a borrar esa guarda. Se conserva el destino y se mata el ruido visual. Cuando el usuario decida fusionar de verdad, se reescribe la guarda con él, no antes.

### Task 3: Fuera de alcance por guarda

- **Vista previa de contenido / `157 palabras` duplicado:** `pulsoDocumento.test.tsx` afirma esa línea (`/2 palabras/i`). Quitar el duplicado rompe la guarda. Queda anotado para el usuario.
- **Pulso de cinco celdas (`Balance`, etc.):** `pulsoDocumento.test.tsx` fija las cinco celdas como contrato deliberado. Queda anotado.
- **"Auto-organizar" y el revisor de títulos viejo (`Step2HeadingsWizard`):** es una UI completa; su rediseño es su propio trabajo, no un retoque.

### Task 4: Verificación  ✔ HECHO

- [x] `npx vitest run` sobre las suites de estructura, foco, AppShell y el lint: verde.
- [x] `npx tsc --noEmit`: limpio.
- [x] Commit F4.

---

### Decisión de diseño para Panel Derecho de Estructura (Propuesta 2 Aprobada)
- **Concepto**: **Editor de Prosa Enfocado (Focus Pad)**. Lectura continua y redacción limpia solo de los párrafos bajo la rama (H1/H2) activa, permitiendo pulir texto sin ruido del documento entero.
- **Descarte de Bloom**: La taxonomía y corrección de verbos de Bloom pertenece al motor de auditoría proactiva de Revisión & IA, no a la superficie de redacción de Estructura.

