# Rediseño del shell y del workbench de Revisión & IA — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trasplantar al producto la gramática visual de `inspiracion/redesign_mockup.html`: topbar de 48px, rail de iconos de 56px que solo se expande al hover, y un workbench de Revisión centrado en una tarjeta de lectura de párrafo auto-ajustado.

**Architecture:** Shell nuevo (`AppShell` + `IconRail` + `RailFlyout`) que envuelve a las 6 fases. La vista de Revisión se descompone de un monolito de 1737 líneas en un hook de datos sin JSX (`useReviewWorkbench`), un hook de paginación real (`usePageIndex`), un hook de auto-ajuste tipográfico (`useAutoFitText`) y cinco componentes de presentación. La implementación de los resaltados inline pasa a ser única (`ReadingText`) y la del contexto de comentarios también (`buildCommentContext`).

**Tech Stack:** React 18, TypeScript, Vite 5, Zustand, lucide-react, Vitest + @testing-library/react. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-25-redesign-shell-ia-workbench-design.md`

## Global Constraints

- Cero emojis en toda la app. Todo icono es SVG de `lucide-react`.
- Prohibido hardcodear colores hex. Solo variables CSS. El hex solo puede aparecer en
  `src/styles/design-system.css`, y solo para *definir* un token.
- La paleta del mockup YA EXISTE en el design system. `--color-accent: #4f7cff` es el `#4f7cff` del
  mockup. No se crea paleta nueva.
- `--paper-white` es `#ffffff` y `--paper-ink` es `#111827` en AMBOS temas, sin excepción.
- Todos los iconos nuevos usan `strokeWidth` igual a `--icon-stroke`, que es `1.75`.
- Radio de borde: solo `--radius-sm` (4px), `--radius-md` (8px), `--radius-lg` (12px),
  `--radius-xl` (18px) o `--radius-full`. Ningún valor literal.
- **El tamaño de fuente del párrafo de lectura tiene un piso duro de 13px.** Ningún camino del
  código puede producir texto por debajo de ese tamaño. El techo es 19px.
- Los componentes de `src/components/review/` no leen del store directamente. Solo lo hacen
  `useReviewWorkbench` y `usePageIndex`.
- Comandos de verificación: `npm test` (Vitest) y `npm run build` (TypeScript).

## Review Focus

Cinco entradas que el spec implica y que son las que más probablementemente van a morder a un
usuario real. Cada una tiene su test en la tarea que posee el código.

1. **Tema oscuro en la tarjeta de lectura.** La tarjeta es superficie, no papel: en oscuro su fondo
   pasa a `--color-bg-surface`. Si `--mark-ai-bg` no se redefine en oscuro, el subrayado de patrones
   IA queda invisible sobre superficie oscura. (Task 1)
2. **Documento sin hallazgos, o motor que nunca se ejecutó.** La tarjeta de lectura no debe montar un
   párrafo vacío, y los grupos de un motor sin datos no deben mostrar un número de página inventado.
   (Tasks 10 y 14)
3. **El puntero cruza el hueco entre el rail y el flyout.** Sin la gracia de 120ms el flyout se
   cierra antes de que el ratón llegue y la navegación por hover es inusable; con una gracia
   demasiado larga, el flyout se queda pegado. (Task 5)
4. **Ventana angosta.** El rack fijo de 400px junto a un rail de 56px puede dejar el centro en un
   ancho inservible. El centro debe poder colapsar por debajo de un umbral y el rail debe seguir
   siendo utilizable. (Task 16)
5. **Texto con emoji y con acentos en el párrafo de lectura.** Los acentos no pueden romper la
   concordancia del resaltado con el texto (`findAccentAgnostic`), y por la regla de producto ningún
   emoji debe aparecer en las cadenas nuevas. (Tasks 9 y 15)

---

### Task 1: Token `--mark-ai-bg` en claro y oscuro

**Files:**
- Modify: `src/styles/design-system.css:34` (después de `--severity-info-soft`, bloque `:root` de la línea 7)
- Modify: `src/styles/design-system.css` (bloque `:root[data-theme="dark"]`, que abre en la línea 159)
- Create: `src/__tests__/designTokens.test.ts`

**Interfaces:**
- Consumes: nada. Es la primera tarea.
- Produces: la variable CSS `--mark-ai-bg`, disponible en ambos temas. La consumen `ReadingText`
  (Task 9) y el lint de tokens de la Task 20.

- [ ] **Step 1: Escribe el test que falla**

Crea `src/__tests__/designTokens.test.ts`:

```ts
/**
 * WordAPA7 — T1: el token de fondo del resaltado de patrones IA existe en
 * ambos temas. Sin el redefine en oscuro, el subrayado del detector queda
 * invisible sobre superficie oscura (Review Focus #1).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(__dirname, '../styles/design-system.css'), 'utf8');

const lightBlock = css.slice(css.indexOf(':root,'), css.indexOf(':root[data-theme="dark"]'));
const darkBlock = css.slice(css.indexOf(':root[data-theme="dark"]'));

describe('T1 — token --mark-ai-bg', () => {
  it('está definido en el tema claro', () => {
    expect(lightBlock).toMatch(/--mark-ai-bg:\s*[^;]+;/);
  });

  it('está definido en el tema oscuro', () => {
    expect(darkBlock).toMatch(/--mark-ai-bg:\s*[^;]+;/);
  });

  it('los dos valores son distintos, para que el detector se lea en ambos temas', () => {
    const light = lightBlock.match(/--mark-ai-bg:\s*([^;]+);/)?.[1].trim();
    const dark = darkBlock.match(/--mark-ai-bg:\s*([^;]+);/)?.[1].trim();
    expect(light).toBeTruthy();
    expect(dark).toBeTruthy();
    expect(dark).not.toBe(light);
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `npx vitest run src/__tests__/designTokens.test.ts`
Expected: FAIL — las tres aserciones fallan, `lightBlock` no contiene `--mark-ai-bg`.

- [ ] **Step 3: Añade el token en claro**

En `src/styles/design-system.css`, inmediatamente después de la línea 34
(`--severity-info-soft: rgba(59, 130, 246, 0.12);`), añade:

```css
  /* Fondo del resaltado del detector probabilístico de IA. Definido UNA sola
     vez por tema: en claro sobre superficie blanca, en oscuro con más alfa
     porque la superficie oscura se come el gris suave. */
  --mark-ai-bg: rgba(107, 114, 128, 0.12);
```

- [ ] **Step 4: Añade el token en oscuro**

En el bloque `:root[data-theme="dark"]`, después de la línea 174 (`--color-accent-soft: rgba(79, 124, 255, 0.15);`), añade:

```css
  --mark-ai-bg: rgba(156, 163, 175, 0.22);
```

- [ ] **Step 5: Corre el test y verifica que pasa**

Run: `npx vitest run src/__tests__/designTokens.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/styles/design-system.css src/__tests__/designTokens.test.ts
git commit -m "feat(tokens): --mark-ai-bg en claro y oscuro para el resaltado de patrones IA"
```

---

### Task 2: `railPinned` en el store, fuera `leftSidebarWidth`

**Files:**
- Modify: `src/store/slices/uiSlice.ts:15-16` (sustituye `leftSidebarWidth` y su setter)
- Modify: `src/store/types.ts` (busca `leftSidebarWidth` y `setLeftSidebarWidth`, quita ambas declaraciones)
- Test: `src/__tests__/useDocStore.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `railPinned: boolean` y `setRailPinned(pinned: boolean) => void` en `DocState`. Los
  consumen `IconRail` (Task 4) y `RailFlyout` (Task 5).

- [ ] **Step 1: Escribe el test que falla**

Añade al final del `describe` más externo de `src/__tests__/useDocStore.test.ts`:

```ts
describe('T2 — estado del rail de iconos', () => {
  beforeEach(() => {
    useDocStore.setState({ railPinned: false });
  });

  it('empieza desanclado', () => {
    expect(useDocStore.getState().railPinned).toBe(false);
  });

  it('setRailPinned ancla y desancla el flyout', () => {
    useDocStore.getState().setRailPinned(true);
    expect(useDocStore.getState().railPinned).toBe(true);
    useDocStore.getState().setRailPinned(false);
    expect(useDocStore.getState().railPinned).toBe(false);
  });

  it('ya no expone leftSidebarWidth: el ancho del rail es fijo de 56px', () => {
    expect('leftSidebarWidth' in useDocStore.getState()).toBe(false);
    expect('setLeftSidebarWidth' in useDocStore.getState()).toBe(false);
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `npx vitest run src/__tests__/useDocStore.test.ts`
Expected: FAIL — `railPinned` no existe en el estado, y `leftSidebarWidth` sigue presente.

- [ ] **Step 3: Sustituye el estado en `uiSlice.ts`**

En `src/store/slices/uiSlice.ts`, reemplaza las líneas 15-16:

```ts
  leftSidebarWidth: 280,
  setLeftSidebarWidth: (w) => set({ leftSidebarWidth: Math.min(500, Math.max(220, w)) }),
```

por:

```ts
  // El rail de iconos es de 56px fijos. Su detalle se abre en un flyout al
  // hover, no estirando la columna, así que ya no hay ancho que ajustar.
  railPinned: false,
  setRailPinned: (pinned) => set({ railPinned: pinned }),
```

- [ ] **Step 4: Limpia los tipos**

En `src/store/types.ts`, borra las declaraciones `leftSidebarWidth: number;` y
`setLeftSidebarWidth: (w: number) => void;`, y añade junto a los demás campos de UI:

```ts
  railPinned: boolean;
  setRailPinned: (pinned: boolean) => void;
```

- [ ] **Step 5: Corre el test y verifica que pasa**

Run: `npx vitest run src/__tests__/useDocStore.test.ts`
Expected: PASS.

- [ ] **Step 6: Comprueba que nada más consuje el estado retirado**

Run: `npm run build`
Expected: PASS. Si falla, el compilador señala al consumidor. El único debe ser
`src/components/wizard/StepRail.tsx`, que se elimina en la Task 6. Si aparece, anota el archivo y
sustituye ahí la lectura por el rail nuevo.

- [ ] **Step 7: Commit**

```bash
git add src/store/slices/uiSlice.ts src/store/types.ts src/__tests__/useDocStore.test.ts
git commit -m "feat(store): railPinned en el store, fuera el ancho ajustable del rail"
```

---

### Task 3: Destinos del rail como datos

**Files:**
- Create: `src/components/shell/railItems.ts`
- Create: `src/hooks/useRailDestinations.ts`
- Create: `src/__tests__/railItems.test.ts`

**Interfaces:**
- Consumes: `useDocStore` (`wizardStep`, `doc`, `coverSetupDone`, `proofreadFindings`, `citationAuditResult`).
- Produces:
  - `export type RailStatus = 'done' | 'pending' | 'idle'`
  - `export interface RailDestination { id: string; step: number | null; label: string; Icon: LucideIcon; status: RailStatus; pending: number; showOutline: boolean }`
  - `export const EDITOR_RAIL_ITEMS: ReadonlyArray<{ step: number; label: string; Icon: LucideIcon; showOutline: boolean }>` — las 6 fases
  - `export function useRailDestinations(): RailDestination[]`

Los consumen `IconRail` (Task 4) y `Step0QuickStart` (Task 19).

- [ ] **Step 1: Escribe el test que falla**

Crea `src/__tests__/railItems.test.ts`:

```ts
/**
 * WordAPA7 — T3: los destinos del rail son datos, no JSX. El estado de cada
 * fase se calcula aquí para que el rail y su flyout muestren lo mismo.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useDocStore } from '../store/useDocStore';
import { EDITOR_RAIL_ITEMS } from '../components/shell/railItems';

const elem = (over: Record<string, unknown> = {}) =>
  ({ id: 'e1', type: 'paragraph', text: 'x', ...over }) as never;

describe('T3 — destinos del rail', () => {
  beforeEach(() => {
    useDocStore.setState({
      doc: null,
      wizardStep: 1,
      coverSetupDone: false,
      proofreadFindings: [],
      citationAuditResult: null,
    });
  });

  it('son las seis fases, en orden, con etiqueta sin emojis', () => {
    expect(EDITOR_RAIL_ITEMS.map((i) => i.label)).toEqual([
      'Portada', 'Estructura', 'Figuras', 'Referencias', 'Revisión & IA', 'Exportar',
    ]);
    for (const item of EDITOR_RAIL_ITEMS) {
      expect(item.label).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('el mapa del documento solo se ofrece en las fases de sección', () => {
    const conMapa = EDITOR_RAIL_ITEMS.filter((i) => i.showOutline).map((i) => i.step);
    expect(conMapa).toEqual([2, 3, 4]);
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `npx vitest run src/__tests__/railItems.test.ts`
Expected: FAIL — no se puede resolver `../components/shell/railItems`.

- [ ] **Step 3: Crea `railItems.ts`**

```ts
/* WordAPA7 — shell: catálogo de destinos del rail.
   Los destinos son datos para que el editor (6 fases) y la pantalla de Inicio
   compartan la misma gramática de navegación sin duplicar JSX. */

import { FileText, ListTree, Image as ImageIcon, BookOpen, ShieldCheck, Download } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type RailStatus = 'done' | 'pending' | 'idle';

export interface RailDestination {
  /** Clave estable para React y para los tests. */
  id: string;
  /** Fase del asistente, o null si el destino no es una fase. */
  step: number | null;
  label: string;
  Icon: LucideIcon;
  status: RailStatus;
  /** Cantidad de pendientes, para el punto del icono. */
  pending: number;
  /** Si el flyout de este destino debe incluir el mapa del documento. */
  showOutline: boolean;
}

export const EDITOR_RAIL_ITEMS: ReadonlyArray<{
  step: number;
  label: string;
  Icon: LucideIcon;
  showOutline: boolean;
}> = [
  { step: 1, label: 'Portada', Icon: FileText, showOutline: false },
  { step: 2, label: 'Estructura', Icon: ListTree, showOutline: true },
  { step: 3, label: 'Figuras', Icon: ImageIcon, showOutline: true },
  { step: 4, label: 'Referencias', Icon: BookOpen, showOutline: true },
  { step: 5, label: 'Revisión & IA', Icon: ShieldCheck, showOutline: false },
  { step: 6, label: 'Exportar', Icon: Download, showOutline: false },
];
```

- [ ] **Step 4: Crea `useRailDestinations.ts`**

```ts
/* WordAPA7 — shell: estado de cada destino del rail.
   Concentra aquí el cálculo de "listo" y "pendientes" que hoy vivía dentro de
   StepRail, para que el rail de 56px y su flyout no puedan discrepar. */

import { useMemo } from 'react';
import { useDocStore } from '../store/useDocStore';
import { EDITOR_RAIL_ITEMS, type RailDestination, type RailStatus } from '../components/shell/railItems';

export function useRailDestinations(): RailDestination[] {
  const doc = useDocStore((s) => s.doc);
  const coverSetupDone = useDocStore((s) => s.coverSetupDone);
  const proofreadFindings = useDocStore((s) => s.proofreadFindings);
  const citationAuditResult = useDocStore((s) => s.citationAuditResult);

  return useMemo<RailDestination[]>(() => {
    const elements = doc?.elements || [];
    const pendingHeadings = elements.filter((e) => e.type === 'heading' && e.needs_review).length;
    const pendingFigures = elements.filter(
      (e) => (e.type === 'image' || e.type === 'table') && e.needs_review,
    ).length;
    const hasReferences = (doc?.referencias?.length || 0) > 0;
    const ghosts = citationAuditResult?.ghost_citations?.length || 0;
    const pendingAudit = proofreadFindings.length + ghosts;

    const pendingByStep: Record<number, number> = {
      2: pendingHeadings,
      3: pendingFigures,
      5: pendingAudit,
    };
    const doneByStep: Record<number, boolean> = {
      1: coverSetupDone,
      2: !!doc && pendingHeadings === 0,
      3: !!doc && pendingFigures === 0,
      4: hasReferences,
      5: !!doc && pendingAudit === 0,
    };

    return EDITOR_RAIL_ITEMS.map(({ step, label, Icon, showOutline }) => {
      const pending = pendingByStep[step] || 0;
      const status: RailStatus = !doc ? 'idle' : doneByStep[step] ? 'done' : pending > 0 ? 'pending' : 'idle';
      return { id: `step-${step}`, step, label, Icon, status, pending, showOutline };
    });
  }, [doc, coverSetupDone, proofreadFindings, citationAuditResult]);
}
```

- [ ] **Step 5: Corre el test y verifica que pasa**

Run: `npx vitest run src/__tests__/railItems.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 6: Añade el test del estado por destino**

Añade al mismo archivo, antes del cierre del `describe` exterior:

```ts
describe('T3b — estado por destino', () => {
  it('sin documento, todas las fases quedan idle', async () => {
    const { useRailDestinations } = await import('../hooks/useRailDestinations');
    // El hook usa useMemo sobre el store; se ejercita con un render mínimo.
    const { render } = await import('@testing-library/react');
    let items: ReturnType<typeof useRailDestinations> = [];
    function Probe() {
      items = useRailDestinations();
      return null;
    }
    useDocStore.setState({ doc: null, coverSetupDone: false, proofreadFindings: [], citationAuditResult: null });
    render(<Probe />);
    expect(items).toHaveLength(6);
    expect(items.every((i) => i.status === 'idle')).toBe(true);
  });
});
```

- [ ] **Step 7: Corre el test y verifica que pasa**

Run: `npx vitest run src/__tests__/railItems.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 8: Commit**

```bash
git add src/components/shell/railItems.ts src/hooks/useRailDestinations.ts src/__tests__/railItems.test.ts
git commit -m "feat(shell): destinos del rail como datos, con estado por fase"
```

---

### Task 4: `IconRail` de 56px

**Files:**
- Create: `src/components/shell/IconRail.tsx`
- Create: `src/__tests__/iconRail.test.tsx`

**Interfaces:**
- Consumes: `useRailDestinations()` (Task 3), `railItems.ts` (Task 3), `useDocStore` (`wizardStep`, `setWizardStep`).
- Produces:
  - `export interface IconRailProps { items: RailDestination[]; onHoverItem: (item: RailDestination | null) => void; onTogglePin: () => void; pinned: boolean }`
  - `export function IconRail(props: IconRailProps): JSX.Element`
  - `onHoverItem(null)` cuando el puntero sale de un botón.

Lo consume `AppShell` (Task 6).

- [ ] **Step 1: Escribe el test que falla**

Crea `src/__tests__/iconRail.test.tsx`:

```tsx
/**
 * WordAPA7 — T4: el rail es de 56px fijos con solo iconos. El detalle no se
 * gana estirando la columna, se gana en el flyout.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IconRail } from '../components/shell/IconRail';
import { EDITOR_RAIL_ITEMS } from '../components/shell/railItems';
import type { RailDestination } from '../components/shell/railItems';

const mkItems = (over: Partial<RailDestination> = {}): RailDestination[] =>
  EDITOR_RAIL_ITEMS.map(({ step, label, Icon, showOutline }) => ({
    id: `step-${step}`, step, label, Icon, status: 'idle', pending: 0, showOutline, ...over,
  }));

const setup = (items = mkItems()) => {
  const onHoverItem = vi.fn();
  const onTogglePin = vi.fn();
  const utils = render(
    <IconRail items={items} onHoverItem={onHoverItem} onTogglePin={onTogglePin} pinned={false} />,
  );
  return { ...utils, onHoverItem, onTogglePin };
};

describe('T4 — IconRail', () => {
  it('muestra un botón por fase, con nombre accesible y sin texto visible', () => {
    setup();
    for (const label of ['Portada', 'Estructura', 'Figuras', 'Referencias', 'Revisión & IA', 'Exportar']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('avisa al hover y avisa al salir con null', () => {
    const { onHoverItem } = setup();
    const btn = screen.getByRole('button', { name: 'Revisión & IA' });
    fireEvent.mouseEnter(btn);
    expect(onHoverItem).toHaveBeenCalledWith(expect.objectContaining({ step: 5 }));
    fireEvent.mouseLeave(btn);
    expect(onHoverItem).toHaveBeenLastCalledWith(null);
  });

  it('el clic no navega, solo ancla: la navegación vive en el workbench', () => {
    const { onTogglePin } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Portada' }));
    expect(onTogglePin).toHaveBeenCalledTimes(1);
  });

  it('marca como activo solo la fase actual', () => {
    setup(mkItems());
    const activos = screen.getAllByRole('button').filter((b) => b.getAttribute('data-active') === 'true');
    expect(activos).toHaveLength(0);
  });

  it('el punto de pendientes aparece solo si hay pendientes', () => {
    const onHoverItem = vi.fn();
    const onTogglePin = vi.fn();
    const { unmount } = render(
      <IconRail items={mkItems()} onHoverItem={onHoverItem} onTogglePin={onTogglePin} pinned={false} />,
    );
    expect(screen.queryByLabelText(/pendientes/)).toBeNull();
    unmount();

    render(
      <IconRail
        items={mkItems().map((i) => (i.step === 5 ? { ...i, pending: 7, status: 'pending' as const } : i))}
        onHoverItem={onHoverItem}
        onTogglePin={onTogglePin}
        pinned={false}
      />,
    );
    expect(screen.getByLabelText('7 pendientes')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `npx vitest run src/__tests__/iconRail.test.tsx`
Expected: FAIL — no se puede resolver `../components/shell/IconRail`.

- [ ] **Step 3: Crea `IconRail.tsx`**

```tsx
/* WordAPA7 — shell: rail de iconos de 56px.
   Ocho botones de 40x40 y nada más. El detalle de cada fase vive en el
   flyout, para que la columna nunca le robe ancho al documento. */

import React from 'react';
import { Pin } from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';
import type { RailDestination } from './railItems';

export interface IconRailProps {
  items: RailDestination[];
  onHoverItem: (item: RailDestination | null) => void;
  onTogglePin: () => void;
  pinned: boolean;
  /** Inicio pasa "Navegación principal": sus destinos no son fases. */
  ariaLabel?: string;
}

const RAIL_WIDTH = 56;
const PinIcon = Pin;

export function IconRail({ items, onHoverItem, onTogglePin, pinned, ariaLabel }: IconRailProps) {
  // La fase activa la lee el propio rail, no el shell: una sola fuente, para
  // que el icono y la barra de trabajo no puedan desincronizarse.
  const wizardStep = useDocStore((s) => s.wizardStep);
  const isActive = (step: number | null) => step !== null && wizardStep === step;

  return (
    <nav
      aria-label={ariaLabel ?? 'Fases de la transformación'}
      data-testid="icon-rail"
      onMouseLeave={() => onHoverItem(null)}
      style={{
        width: RAIL_WIDTH,
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-1, 8px)',
        padding: '12px 0',
        backgroundColor: 'var(--color-bg-surface)',
        borderRight: '1px solid var(--color-border-subtle)',
      }}
    >
      {items.map(({ id, label, Icon, status, pending, step }) => (
        <button
          key={id}
          type="button"
          title={label}
          aria-label={label}
          data-active={isActive(step) ? 'true' : 'false'}
          onMouseEnter={() => onHoverItem(items.find((i) => i.id === id) || null)}
          onClick={onTogglePin}
          style={{
            position: 'relative',
            width: 40,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            background: isActive(step) ? 'var(--color-accent-soft)' : 'transparent',
            color: isActive(step) ? 'var(--color-accent)' : 'var(--color-text-secondary)',
            cursor: 'pointer',
            transition: 'background var(--transition-fast), color var(--transition-fast)',
          }}
        >
          <Icon size={17} strokeWidth={1.75} aria-hidden />
          {pending > 0 && (
            <span
              aria-label={`${pending} pendientes`}
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                width: 6,
                height: 6,
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-accent)',
              }}
            />
          )}
          {status === 'done' && (
            <span
              aria-label="Listo"
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                width: 6,
                height: 6,
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-success)',
              }}
            />
          )}
        </button>
      ))}

      {/* Hairline que separa las fases de los destinos de la aplicación. */}
      <div
        aria-hidden
        style={{
          width: 24,
          height: '1px',
          flexShrink: 0,
          backgroundColor: 'var(--color-border-subtle)',
        }}
      />

      <button
        type="button"
        title={pinned ? 'Anclado' : 'Anclar panel'}
        aria-label={pinned ? 'Anclado' : 'Anclar panel'}
        aria-pressed={pinned}
        onClick={onTogglePin}
        style={{
          width: 40,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          background: pinned ? 'var(--color-accent-soft)' : 'transparent',
          color: pinned ? 'var(--color-accent)' : 'var(--color-text-secondary)',
          cursor: 'pointer',
        }}
      >
        <PinIcon size={17} strokeWidth={1.75} aria-hidden />
      </button>
    </nav>
  );
}
```

El bloque de arriba ya es el archivo completo: importa `Pin`, declara `PinIcon`, acepta `ariaLabel` y
lee la fase activa del propio store en vez de recibirla por props. Si la leyera el shell, el icono y
la barra de trabajo podrían desincronizarse.

- [ ] **Step 4: Corre el test y verifica que pasa**

Run: `npx vitest run src/__tests__/iconRail.test.tsx`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/IconRail.tsx src/__tests__/iconRail.test.tsx
git commit -m "feat(shell): rail de iconos de 56px con puntos de estado"
```

---

### Task 5: `RailFlyout` con hover, pin y gracia de 120ms

**Files:**
- Create: `src/components/shell/RailFlyout.tsx`
- Create: `src/__tests__/railFlyout.test.tsx`

**Interfaces:**
- Consumes: `RailDestination` (Task 3), `OutlineTree` de `src/components/wizard/OutlineTree.tsx` (sin props), `useDocStore` (`railPinned`, `setRailPinned`).
- Produces:
  - `export const FLYOUT_CLOSE_GRACE_MS = 120`
  - `export function RailFlyout({ item, onClose }: { item: RailDestination | null; onClose: () => void }): JSX.Element | null`
  - `export function useRailFlyout(): { hovered: RailDestination | null; setHovered: (i: RailDestination | null) => void; close: () => void }`

La firma acepta `null` a propósito: es lo que permite que `AppShell` lo monte y desmonte sin
condicionales. `useRailFlyout` no lo usa `AppShell` — el shell mantiene su propio `useState` para
el flyout abierto — pero se exporta para el mapa de Inicio. Si al final nadie lo consume, bórralo en
la Task 20 en lugar de dejarlo muerto.

Lo consumen `AppShell` (Task 6) y los tests.

- [ ] **Step 1: Escribe el test que falla**

Crea `src/__tests__/railFlyout.test.tsx`:

```tsx
/**
 * WordAPA7 — T5: el flyout se abre al hover y se cierra con 120ms de gracia
 * para que el puntero pueda cruzar el hueco sin perderlo (Review Focus #3).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { RailFlyout, FLYOUT_CLOSE_GRACE_MS } from '../components/shell/RailFlyout';
import { EDITOR_RAIL_ITEMS } from '../components/shell/railItems';
import type { RailDestination } from '../components/shell/railItems';

vi.useFakeTimers();

const item: RailDestination = {
  id: 'step-2',
  step: 2,
  label: 'Estructura',
  Icon: EDITOR_RAIL_ITEMS[1].Icon,
  status: 'pending',
  pending: 4,
  showOutline: true,
};

describe('T5 — RailFlyout', () => {
  beforeEach(() => {
    useDocStore.setState({ railPinned: false });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('no monta nada sin destino', () => {
    const { container } = render(<RailFlyout item={null} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('muestra la etiqueta y el estado del destino', () => {
    render(<RailFlyout item={item} onClose={vi.fn()} />);
    expect(screen.getByText('Estructura')).toBeTruthy();
    expect(screen.getByText('4 pendientes')).toBeTruthy();
  });

  it('la gracia de cierre son 120ms exactos', () => {
    expect(FLYOUT_CLOSE_GRACE_MS).toBe(120);
  });

  it('un clic ancla el flyout y Esc lo suelta', () => {
    render(<RailFlyout item={item} onClose={vi.fn()} />);
    const pin = screen.getByRole('button', { name: 'Anclar panel' });
    fireEvent.click(pin);
    expect(useDocStore.getState().railPinned).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useDocStore.getState().railPinned).toBe(false);
  });

  it('mientras está anclado, salir con el puntero no lo cierra', () => {
    const onClose = vi.fn();
    render(<RailFlyout item={item} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Anclar panel' }));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sin anclar, el cierre se aplaza 120ms para que el puntero cruce el hueco', () => {
    const onClose = vi.fn();
    render(<RailFlyout item={item} onClose={onClose} />);
    fireEvent.mouseLeave(screen.getByTestId('rail-flyout'));
    act(() => { vi.advanceTimersByTime(FLYOUT_CLOSE_GRACE_MS - 1); });
    expect(onClose).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reentrar antes de la gracia cancela el cierre', () => {
    const onClose = vi.fn();
    render(<RailFlyout item={item} onClose={onClose} />);
    const fly = screen.getByTestId('rail-flyout');
    fireEvent.mouseLeave(fly);
    act(() => { vi.advanceTimersByTime(80); });
    fireEvent.mouseEnter(fly);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `npx vitest run src/__tests__/railFlyout.test.tsx`
Expected: FAIL — no se puede resolver `../components/shell/RailFlyout`.

- [ ] **Step 3: Crea `RailFlyout.tsx`**

```tsx
/* WordAPA7 — shell: flyout de detalle del rail.
   Flota SOBRE el workbench y no lo empuja: el centro de Revisión no puede
   estrecharse porque el usuario quiera leer una etiqueta. El cierre lleva
   120ms de gracia para que el puntero cruce el hueco entre rail y panel. */

import React, { useEffect, useRef } from 'react';
import { Pin, Check, AlertCircle } from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';
import { OutlineTree } from '../wizard/OutlineTree';
import type { RailDestination } from './railItems';

export const FLYOUT_CLOSE_GRACE_MS = 120;

const STATUS_TEXT: Record<RailDestination['status'], string> = {
  done: 'Listo',
  pending: 'pendientes',
  idle: 'Sin pendientes',
};

const STATUS_COLOR: Record<RailDestination['status'], string> = {
  done: 'var(--color-success)',
  pending: 'var(--color-warning)',
  idle: 'var(--color-text-tertiary)',
};

export function RailFlyout({ item, onClose }: { item: RailDestination; onClose: () => void }) {
  const railPinned = useDocStore((s) => s.railPinned);
  const setRailPinned = useDocStore((s) => s.setRailPinned);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    if (railPinned) return;
    cancelClose();
    closeTimer.current = setTimeout(onClose, FLYOUT_CLOSE_GRACE_MS);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRailPinned(false);
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setRailPinned, onClose]);

  useEffect(() => cancelClose, []);

  if (!item) return null;

  const StatusIcon = item.status === 'done' ? Check : item.status === 'pending' ? AlertCircle : null;

  return (
    <aside
      data-testid="rail-flyout"
      aria-label={`Detalle de ${item.label}`}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
      style={{
        position: 'absolute',
        top: 12,
        left: 64,
        width: 240,
        maxHeight: 'calc(100% - 24px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1, 8px)',
        padding: '14px',
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
        zIndex: 'var(--z-dropdown)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <item.Icon size={15} strokeWidth={1.75} aria-hidden style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {item.label}
          </span>
        </div>
        <button
          type="button"
          aria-label="Anclar panel"
          aria-pressed={railPinned}
          onClick={() => setRailPinned(!railPinned)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 24, height: 24, border: 'none', borderRadius: 'var(--radius-sm)',
            background: railPinned ? 'var(--color-accent-soft)' : 'transparent',
            color: railPinned ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          <Pin size={13} strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)' }}>
        {StatusIcon && <StatusIcon size={12} strokeWidth={1.75} aria-hidden style={{ color: STATUS_COLOR[item.status] }} />}
        <span style={{ color: STATUS_COLOR[item.status], fontWeight: 600 }}>
          {item.pending > 0 ? `${item.pending} ${STATUS_TEXT[item.status]}` : STATUS_TEXT[item.status]}
        </span>
      </div>

      {item.showOutline && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', borderTop: '1px solid var(--color-border-subtle)', paddingTop: 8 }}>
          <OutlineTree />
        </div>
      )}
    </aside>
  );
}
```

- [ ] **Step 4: Corre el test y verifica que pasa**

Run: `npx vitest run src/__tests__/railFlyout.test.tsx`
Expected: PASS — 7 tests. La firma de `item` acepta `null`, así que el primer test monta y desmonta
sin necesidad de `as never`.

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/RailFlyout.tsx src/__tests__/railFlyout.test.tsx
git commit -m "feat(shell): flyout del rail con hover, pin y gracia de 120ms"
```

---

### Task 6: `AppShell` y montaje en `App.tsx`

**Files:**
- Create: `src/components/shell/AppShell.tsx`
- Modify: `src/App.tsx:608-682` (el `return` del shell), `src/App.tsx:212-246` (el estado muerto), `src/App.tsx` (import de `StepRail`)
- Modify: `src/components/layout/ProjectTabs.tsx:34` (la guarda de render)
- Delete: `src/components/wizard/StepRail.tsx`
- Create: `src/__tests__/appShell.test.tsx`

**Interfaces:**
- Consumes: `IconRail` (Task 4), `RailFlyout` (Task 5), `useRailDestinations` (Task 3), `UnifiedToolbar`, `ProjectTabs`, `StatusBar`.
- Produces: `export function AppShell({ children }: { children: React.ReactNode }): JSX.Element`

- [ ] **Step 1: Escribe el test que falla**

Crea `src/__tests__/appShell.test.tsx`:

```tsx
/**
 * WordAPA7 — T6: el shell decide la gramática: topbar, rail de 56px y
 * workbench. StepRail ya no existe y el ancho del rail no se ajusta.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppShell } from '../components/shell/AppShell';

vi.mock('../components/toolbar/UnifiedToolbar', () => ({ UnifiedToolbar: () => <div data-testid="toolbar" /> }));
vi.mock('../components/layout/ProjectTabs', () => ({ ProjectTabs: () => <div data-testid="tabs" /> }));
vi.mock('../components/layout/StatusBar', () => ({ StatusBar: () => <div data-testid="statusbar" /> }));

describe('T6 — AppShell', () => {
  it('monta topbar, rail y workbench en ese orden', () => {
    render(<AppShell><div data-testid="work">x</div></AppShell>);
    expect(screen.getByTestId('toolbar')).toBeTruthy();
    expect(screen.getByTestId('icon-rail')).toBeTruthy();
    expect(screen.getByTestId('work')).toBeTruthy();
    expect(screen.getByTestId('statusbar')).toBeTruthy();
  });

  it('el rail existe siempre, incluso en la vista de exportación', () => {
    render(<AppShell><div>x</div></AppShell>);
    expect(screen.getByLabelText('Fases de la transformación')).toBeTruthy();
  });
});
```

Añade arriba, después de los imports de React y vitest:

```tsx
import { vi } from 'vitest';
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `npx vitest run src/__tests__/appShell.test.tsx`
Expected: FAIL — no se puede resolver `../components/shell/AppShell`.

- [ ] **Step 3: Crea `AppShell.tsx`**

```tsx
/* WordAPA7 — shell: el marco de la aplicación.
   TopBar 48px → rail de 56px + workbench → StatusBar. El rail vive siempre,
   también en la vista de exportación: la navegación no desaparece al cambiar
   de fase, que es justo lo que hacía StepRail con sus casos condicionales. */

import React, { useCallback, useState } from 'react';
import { UnifiedToolbar } from '../toolbar/UnifiedToolbar';
import { ProjectTabs } from '../layout/ProjectTabs';
import { StatusBar } from '../layout/StatusBar';
import { IconRail } from './IconRail';
import { RailFlyout } from './RailFlyout';
import { useRailDestinations } from '../../hooks/useRailDestinations';
import { useDocStore } from '../../store/useDocStore';
import type { RailDestination } from './railItems';

export function AppShell({ children }: { children: React.ReactNode }) {
  const items = useRailDestinations();
  const [hovered, setHovered] = useState<RailDestination | null>(null);
  const railPinned = useDocStore((s) => s.railPinned);
  const setRailPinned = useDocStore((s) => s.setRailPinned);
  const setWizardStep = useDocStore((s) => s.setWizardStep);

  const close = useCallback(() => setHovered(null), []);

  const handleHoverItem = useCallback(
    (item: RailDestination | null) => {
      // El clic ancla; el hover solo hace aparecer. Por eso un clic en el rail
      // navega y suelta el flyout a la vez.
      if (item) {
        setHovered(item);
        if (item.step !== null) setWizardStep(item.step);
        return;
      }
      if (railPinned) setRailPinned(false);
      setHovered(null);
    },
    [railPinned, setRailPinned, setWizardStep],
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: 'var(--color-bg-canvas)',
        position: 'relative',
      }}
    >
      <UnifiedToolbar />
      <ProjectTabs />

      <div
        className="app-main"
        style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}
      >
        <IconRail
          items={items}
          onHoverItem={handleHoverItem}
          onTogglePin={() => setRailPinned(!railPinned)}
          pinned={railPinned}
        />
        {hovered && <RailFlyout item={hovered} onClose={close} />}
        <main style={{ flex: 1, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
          {children}
        </main>
      </div>

      <StatusBar />
    </div>
  );
}
```

- [ ] **Step 4: Sustituye el shell en `App.tsx`**

En `src/App.tsx`:

1. Borra el import de `StepRail` y añade el de `AppShell`:
   `import { AppShell } from './components/shell/AppShell';`
2. Borra el bloque de estado muerto de las líneas 212-246: el comentario
   `// ── Resizable Left Sidebar (Portada / Wizards) ──`, el `useState` de `leftSidebarWidth`, el
   `useState` de `isLeftResizing`, el `useEffect` que lo persiste en `localStorage` y el `useEffect`
   de arrastre. No hay ningún consumidor de esos dos valores en el archivo, así que no queda nada que
   adjusting.
3. Envuelve el contenido del `return` de la línea 608. La estructura queda así:

```tsx
  return (
    <AppShell>
      {viewMode === 'result' ? (
        <div key="view-result" className="wizard-step-enter" style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--canvas-bg)' }}>
          <PDFPreview />
        </div>
      ) : viewMode === 'export' ? (
        <div key="view-export" className="wizard-step-enter" style={{ flex: 1, height: '100%', overflow: 'hidden', display: 'flex', minWidth: 0 }}>
          <ExportView />
        </div>
      ) : viewMode === 'native-pdf' ? (
        <div key="view-native-pdf" className="wizard-step-enter" style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--canvas-bg)' }}>
          <ReactPDFPreview />
        </div>
      ) : viewMode === 'split' ? (
        <div style={{ flex: 1, display: 'flex', height: '100%', overflow: 'hidden', minWidth: 0 }}>
          <div style={{ flex: 1, display: 'flex', height: '100%', overflow: 'hidden', minWidth: 0, flexDirection: 'column' }}>
            {wizardStep === 2 && <StructureTabBar tab={structureTab} setTab={setStructureTab} />}
            <div style={{ flex: 1, display: 'flex', height: '100%', overflow: 'hidden', minWidth: 0 }} className="wizard-step-enter" key={`split-${wizardStep}-${structureTab}`}>
              {wizardStep === 1 && <Step1PortadaWizard />}
              {wizardStep === 2 && (structureTab === 'headings' ? <Step2HeadingsWizard /> : <Step5BodyWizard />)}
              {wizardStep === 3 && <Step3FiguresTablesWizard />}
              {wizardStep === 4 && <Step5ReferencesWizard />}
            </div>
          </div>
          <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--canvas-bg)', borderLeft: '2px solid var(--border-subtle)' }}>
            <PDFPreview />
          </div>
        </div>
      ) : wizardStep === 1 ? (
        <div style={{ flex: 1, height: '100%', overflow: 'hidden', minWidth: 0 }} className="wizard-step-enter" key="step-1-canvas">
          <Step1PortadaWizard />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'row', flex: 1, height: '100%', overflow: 'hidden', minWidth: 0, position: 'relative' }}>
          <div style={{ flex: 1, height: '100%', overflow: 'hidden', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {wizardStep === 2 && !focusMode && <StructureTabBar tab={structureTab} setTab={setStructureTab} />}
            <div style={{ flex: 1, height: '100%', overflow: 'hidden', minWidth: 0 }} className="wizard-step-enter" key={`step-${wizardStep}-${structureTab}`}>
              {wizardStep === 2 && (structureTab === 'headings' ? <Step2HeadingsWizard /> : <Step5BodyWizard />)}
              {wizardStep === 3 && <Step3FiguresTablesWizard />}
              {wizardStep === 4 && <Step5ReferencesWizard />}
              {wizardStep === 5 && <Step5AuditIAWizard />}
              {wizardStep === 6 && <ExportView />}
            </div>
          </div>
          {wizardStep !== 4 && wizardStep !== 5 && wizardStep !== 6 && !focusMode && <RightSidePanel />}
        </div>
      )}
      {doc && <LiveChatFloatingCard />}

      <TemplateDialog />
      <OnboardingTour />
      <LLMConsentDialog />
      {doc && commandPaletteOpen && <CommandPalette />}
      <LoadingTips />
      <DownloadSuccessOverlay />
      <AIBatteryIndicator />
      {doc && <MascotBubble />}
      {doc && <ValidatorDrawer />}
    </AppShell>
  );
```

Lo que cambia respecto al original, y solo esto: el `div` raíz pasa a ser `AppShell`, `UnifiedToolbar`
y `ProjectTabs` salen de dentro (los monta el shell), `StatusBar` también, y la fila de
`RightSidePanel` pierde su fragmento `<>...</>`wrapper porque `AppShell` ya aporta el contenedor.

- [ ] **Step 5: `ProjectTabs` solo con 2+ pestañas**

En `src/components/layout/ProjectTabs.tsx:34` hay un `return null` cuando `tabs.length === 0`. Con una
sola pestaña, el nombre del proyecto ya vive en la topbar y el strip es ruido. Cambia la guarda por:

```tsx
  if (tabs.length < 2) return null;
```

- [ ] **Step 6: Borra `StepRail.tsx`**

```bash
git rm src/components/wizard/StepRail.tsx
```

- [ ] **Step 7: Corre los tests**

Run: `npm test`
Expected: PASS. Si algún test importaba `StepRail`, actualízalo para usar `AppShell`. Ninguno lo
hace hoy: `editorRailToggle.test.tsx` prueba `RightSidePanel`.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/components/shell/AppShell.tsx src/components/layout/ProjectTabs.tsx src/__tests__/appShell.test.tsx
git commit -m "feat(shell): AppShell monta topbar, rail fijo y workbench; fuera StepRail"
```

---

### Task 7: TopBar mínima y menú de desbordamiento

**Files:**
- Create: `src/components/toolbar/ToolbarOverflowMenu.tsx`
- Modify: `src/components/toolbar/UnifiedToolbar.tsx:96-397` (el `return` del componente)
- Test: `src/__tests__/toolbarOverflow.test.tsx`

**Interfaces:**
- Consumes: `useDocStore` completo, `APAScoreCard`, `APAModuleToggles`.
- Produces: `export function ToolbarOverflowMenu({ onClose }: { onClose: () => void }): JSX.Element`

- [ ] **Step 1: Escribe el test que falla**

Crea `src/__tests__/toolbarOverflow.test.tsx`:

```tsx
/**
 * WordAPA7 — T7: la barra queda como el mockup —titulo, guardado, avatar— y
 * todo lo demas cae en un menu de desborde. Ningun emoji, ninguna etiqueta
 * en mayusculas inventada.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { ToolbarOverflowMenu } from '../components/toolbar/ToolbarOverflowMenu';

vi.mock('../components/toolbar/APAScoreCard', () => ({ APAScoreCard: () => <div data-testid="score" /> }));
vi.mock('../components/toolbar/APAModuleToggles', () => ({ APAModuleToggles: () => <div data-testid="toggles" /> }));

const ENTRADAS = [
  'Deshacer', 'Rehacer',
  'Puntuación APA', 'Módulos APA', 'Copiar PDF para WhatsApp',
  'Complemento de Word', 'Tema', 'Ajustes',
];

describe('T7 — menú de desbordamiento', () => {
  beforeEach(() => {
    useDocStore.setState({ doc: null, theme: 'light', updateState: null } as never);
  });

  it('expone todas las acciones secundarias, sin emojis', () => {
    render(<ToolbarOverflowMenu onClose={vi.fn()} />);
    for (const nombre of ENTRADAS) {
      const el = screen.getByRole('menuitem', { name: new RegExp(nombre) });
      expect(el.textContent || '').not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('cada entrada cierra el menú', () => {
    const onClose = vi.fn();
    render(<ToolbarOverflowMenu onClose={onClose} />);
    fireEvent.click(screen.getByRole('menuitem', { name: /Ajustes/ }));
    expect(onClose).toHaveBeenCalled();
  });

  it('“Instalar actualización” solo aparece con una descarga pendiente', () => {
    const { rerender } = render(<ToolbarOverflowMenu onClose={vi.fn()} />);
    expect(screen.queryByRole('menuitem', { name: /Instalar actualización/ })).toBeNull();
    useDocStore.setState({ updateState: 'downloaded' } as never);
    rerender(<ToolbarOverflowMenu onClose={vi.fn()} />);
    expect(screen.getByRole('menuitem', { name: /Instalar actualización/ })).toBeTruthy();
  });

  it('los módulos APA se montan dentro del menú, no en la barra', () => {
    render(<ToolbarOverflowMenu onClose={vi.fn()} />);
    expect(screen.getByTestId('score')).toBeTruthy();
    expect(screen.getByTestId('toggles')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `npx vitest run src/__tests__/toolbarOverflow.test.tsx`
Expected: FAIL — no se puede resolver `../components/toolbar/ToolbarOverflowMenu`.

- [ ] **Step 3: Crea `ToolbarOverflowMenu.tsx`**

```tsx
/* WordAPA7 — toolbar: menu de desborde.
   La barra se quedo con titulo, guardado y avatar; aqui vive todo lo que
   antes saturaba la derecha. Las entradas con panel (Puntuacion, Modulos)
   montan su componente dentro del menu para que nadie tenga que sacarlos
   de la barra a mano. */

import React from 'react';
import { Undo2, Redo2, Copy, Puzzle, Download, Settings, Sun, Moon } from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';
import { APAScoreCard } from './APAScoreCard';
import { APAModuleToggles } from './APAModuleToggles';

const Separador = () => (
  <div aria-hidden style={{ height: 1, backgroundColor: 'var(--color-border-subtle)', margin: '4px 0' }} />
);

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-1, 8px)',
  width: '100%',
  padding: '6px 10px',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  background: 'transparent',
  color: 'var(--color-text-primary)',
  font: 'inherit',
  fontSize: 'var(--text-sm)',
  textAlign: 'left',
  cursor: 'pointer',
};

const Item = ({
  label, onClick, children, disabled,
}: { label: string; onClick: () => void; children?: React.ReactNode; disabled?: boolean }) => (
  <button
    type="button"
    role="menuitem"
    disabled={disabled}
    onClick={onClick}
    style={{ ...itemStyle, color: disabled ? 'var(--color-text-tertiary)' : undefined }}
  >
    {children}
    <span>{label}</span>
  </button>
);

export function ToolbarOverflowMenu({ onClose }: { onClose: () => void }) {
  const st = useDocStore();
  const run = (fn: () => void) => () => { fn(); onClose(); };

  return (
    <div
      role="menu"
      aria-label="Más acciones"
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        right: 0,
        minWidth: 260,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: 6,
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
        zIndex: 'var(--z-dropdown)',
      }}
    >
      <Item label="Deshacer" onClick={run(() => st.undo?.())}><Undo2 size={14} strokeWidth={1.75} aria-hidden /></Item>
      <Item label="Rehacer" onClick={run(() => st.redo?.())}><Redo2 size={14} strokeWidth={1.75} aria-hidden /></Item>

      <Separador />
      <div style={{ padding: '4px 6px' }}><APAScoreCard /></div>
      <div style={{ padding: '4px 6px' }}><APAModuleToggles /></div>
      <Item label="Copiar PDF para WhatsApp" onClick={run(() => st.copyPdfToClipboard?.())}>
        <Copy size={14} strokeWidth={1.75} aria-hidden />
      </Item>

      <Separador />
      <Item label="Complemento de Word" onClick={run(() => st.setSettingsStudioOpen(true, 'addin'))}>
        <Puzzle size={14} strokeWidth={1.75} aria-hidden />
      </Item>
      {st.updateState === 'downloaded' && (
        <Item label="Instalar actualización" onClick={run(() => st.installUpdate?.())}>
          <Download size={14} strokeWidth={1.75} aria-hidden />
        </Item>
      )}

      <Separador />
      <Item label="Tema" onClick={run(() => st.setTheme(st.theme === 'light' ? 'dark' : 'light'))}>
        {st.theme === 'light'
          ? <Moon size={14} strokeWidth={1.75} aria-hidden />
          : <Sun size={14} strokeWidth={1.75} aria-hidden />}
      </Item>
      <Item label="Ajustes" onClick={run(() => st.setSettingsStudioOpen(true))}>
        <Settings size={14} strokeWidth={1.75} aria-hidden />
      </Item>
    </div>
  );
}
```

- [ ] **Step 4: Corrige los nombres de acciones del store**

El store puede no exponer `undo`, `redo`, `setTheme`, `installUpdate` o `copyPdfToClipboard` con
esos nombres exactos. Búscalos:

```bash
Select-String -Path src/store/types.ts,src/store/slices/*.ts -Pattern 'undo|redo|setTheme|installUpdate|copyPdfToClipboard|updateState'
```

Sustituye cada referencia de `ToolbarOverflowMenu` por el nombre real que aparezca. Si `setTheme` no
existe, añádelo a `uiSlice` junto a los demás setters:

```ts
  setTheme: (theme: 'light' | 'dark') => set({ theme }),
```

- [ ] **Step 5: Adelgaza `UnifiedToolbar`**

En `src/components/toolbar/UnifiedToolbar.tsx`, reemplaza el `return` de la línea 96 y todo lo que
Sigue hasta el cierre del componente (línea 397) por:

```tsx
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 48,
        flexShrink: 0,
        padding: isElectron ? '0 150px 0 16px' : '0 16px',
        backgroundColor: 'var(--color-bg-surface)',
        borderBottom: '1px solid var(--color-border-subtle)',
        position: 'relative',
        zIndex: 'var(--z-sticky)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <button
          type="button"
          onClick={() => setShowFileMenu(!showFileMenu)}
          aria-label="Menú Archivo"
          title="Archivo"
          style={{
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
            background: 'none', border: 'none', padding: '4px 6px',
            cursor: 'pointer', borderRadius: 'var(--radius-sm)',
            ...noDragRegion,
          }}
        >
          <BookOpen size={16} strokeWidth={1.75} aria-hidden style={{ color: 'var(--color-accent)' }} />
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            WordAPA7
          </span>
        </button>

        {doc && (
          <>
            <input
              value={docTitleDraft}
              onChange={(e) => setDocTitleDraft(e.target.value)}
              onBlur={commitDocTitle}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              aria-label="Nombre del documento"
              placeholder="Documento sin título"
              style={{
                width: 420,
                maxWidth: '40vw',
                background: 'transparent',
                border: '1px solid transparent',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text-primary)',
                font: 'inherit',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                padding: '4px 8px',
                outline: 'none',
                textOverflow: 'ellipsis',
                ...noDragRegion,
              }}
            />
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              <Check size={11} strokeWidth={2.5} aria-hidden style={{ color: 'var(--color-success)' }} />
              Guardado
            </span>
          </>
        )}
      </div>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={() => setLiveChatOpen(!liveChatOpen)}
          aria-label="Copiloto Editorial IA"
          title="Copiloto Editorial IA"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 10px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border-subtle)',
            background: 'var(--color-accent-soft)', color: 'var(--color-accent)',
            fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer',
            ...noDragRegion,
          }}
        >
          <Sparkles size={14} strokeWidth={1.75} aria-hidden />
          Copiloto
        </button>

        <button
          type="button"
          onClick={() => setOverflowOpen((v) => !v)}
          aria-label="Más acciones"
          aria-expanded={overflowOpen}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-sm)', background: 'transparent',
            color: 'var(--color-text-secondary)', cursor: 'pointer',
            ...noDragRegion,
          }}
        >
          <MoreHorizontal size={15} strokeWidth={1.75} aria-hidden />
        </button>
        {overflowOpen && <ToolbarOverflowMenu onClose={() => setOverflowOpen(false)} />}

        <button
          type="button"
          onClick={() => setSettingsStudioOpen(true)}
          aria-label="Cuenta"
          title="Cuenta"
          style={{
            width: 28, height: 28, borderRadius: 'var(--radius-full)',
            border: 'none', backgroundColor: 'var(--color-accent)',
            color: 'var(--color-text-on-accent)', fontSize: 'var(--text-xs)',
            fontWeight: 700, cursor: 'pointer', ...noDragRegion,
          }}
        >
          W
        </button>
      </div>
    </header>
  );
```

- [ ] **Step 6: Añade el estado que el nuevo return necesita**

Al principio del cuerpo de `UnifiedToolbar`, junto a los hooks que ya tiene, añade:

```tsx
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [docTitleDraft, setDocTitleDraft] = useState(doc?.file_name || '');
  const setShowFileMenu = useDocStore((s) => s.setShowFileMenu);
  const showFileMenu = useDocStore((s) => s.showFileMenu);
  const liveChatOpen = useDocStore((s) => s.liveChatOpen);
  const setLiveChatOpen = useDocStore((s) => s.setLiveChatOpen);
  const setSettingsStudioOpen = useDocStore((s) => s.setSettingsStudioOpen);

  useEffect(() => {
    setDocTitleDraft(doc?.file_name || '');
  }, [doc?.file_name]);

  const commitDocTitle = () => {
    const next = docTitleDraft.trim();
    if (next && next !== doc?.file_name) useDocStore.getState().setDocTitle?.(next);
  };
```

Si `setDocTitle` no existe en el store, el título se deja como campo de solo lectura visual y
`commitDocTitle` se reduce a un `setDocTitleDraft(doc?.file_name || '')`. Compruébalo con:

```bash
Select-String -Path src/store/slices/*.ts,src/store/types.ts -Pattern 'setDocTitle|file_name'
```

- [ ] **Step 7: Ajusta los imports de `UnifiedToolbar`**

Deja solo los que el nuevo return usa: `React`, `useState`, `useEffect`, `useDocStore`, y de
`lucide-react` `BookOpen`, `Check`, `MoreHorizontal`, `Sparkles`. Añade
`import { ToolbarOverflowMenu } from './ToolbarOverflowMenu';`. Borra los que quedan sin uso
(`Home`, `APAScoreCard`, `APAModuleToggles` y cualquier otro que no aparezca en el return),
porque `npm run build` no avisa de imports muertos pero el lint sí.

- [ ] **Step 8: Corre los tests**

Run: `npx vitest run src/__tests__/toolbarOverflow.test.tsx && npm test`
Expected: PASS en ambos.

- [ ] **Step 9: Commit**

```bash
git add src/components/toolbar/UnifiedToolbar.tsx src/components/toolbar/ToolbarOverflowMenu.tsx src/__tests__/toolbarOverflow.test.tsx
git commit -m "feat(toolbar): barra minima al estilo mockup y menu de desborde"
```

---

### Task 8: `buildCommentContext` único

**Files:**
- Create: `src/lib/commentContext.ts`
- Modify: `src/components/layout/PaperCanvas.tsx:894-905` y `src/components/layout/PaperCanvas.tsx:591-604`
- Test: `src/__tests__/commentContext.test.ts`

**Interfaces:**
- Consumes: `WhatsAppContext` de `src/components/layout/WhatsAppComment.tsx` (líneas 116-126) y su `EMPTY_CTX` (128).
- Produces: `export function buildCommentContext(s: CommentContextSource): WhatsAppContext`

 donde `CommentContextSource` es:

```ts
export interface CommentContextSource {
  citationAuditResult: { ghost_citations?: unknown[]; orphan_references?: unknown[] } | null;
  validationIssues: unknown[] | null | undefined;
  sugerenciasProactivas: boolean;
  reviewResult: unknown;
  proofreadFindings: unknown[];
}
```

- [ ] **Step 1: Escribe el test que falla**

Crea `src/__tests__/commentContext.test.ts`:

```ts
/**
 * WordAPA7 — T8: el contexto de comentarios tiene UNA construccion.
   Antes vivia duplicado en PaperCanvas con reglas distintas de styleAuditRun,
   lo que dejaba subrayados huerfanos cuando solo habia corrido el corrector.
 */
import { describe, it, expect } from 'vitest';
import { buildCommentContext } from '../lib/commentContext';

const base = {
  citationAuditResult: null,
  validationIssues: [] as unknown[],
  sugerenciasProactivas: true,
  reviewResult: null,
  proofreadFindings: [] as unknown[],
};

describe('T8 — buildCommentContext', () => {
  it('sin datos, devuelve un contexto vacío y estable', () => {
    const ctx = buildCommentContext(base);
    expect(ctx.ghostCitations).toEqual([]);
    expect(ctx.orphanReferences).toEqual([]);
    expect(ctx.validationIssues).toEqual([]);
    expect(ctx.styleAuditRun).toBe(false);
  });

  it('marca el análisis de estilo si corrió el corrector, no solo el revisor de IA', () => {
    // ESTE es el caso que fallaba: solo el corrector, sin runAIReview.
    expect(buildCommentContext({ ...base, proofreadFindings: [{ id: 'p1' }] }).styleAuditRun).toBe(true);
    expect(buildCommentContext({ ...base, reviewResult: { paragraphs: [] } }).styleAuditRun).toBe(true);
  });

  it('propaga citas fantasma y huérfanas', () => {
    const ctx = buildCommentContext({
      ...base,
      citationAuditResult: { ghost_citations: [{ key: '(García, 2021)' }], orphan_references: [{ ref: 'x' }] },
    });
    expect(ctx.ghostCitations).toHaveLength(1);
    expect(ctx.orphanReferences).toHaveLength(1);
  });

  it('sin sugerencias proactivas, no inventa listas de validación', () => {
    const ctx = buildCommentContext({ ...base, sugerenciasProactivas: false, validationIssues: [{ id: 1 }] });
    expect(ctx.validationIssues).toEqual([]);
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `npx vitest run src/__tests__/commentContext.test.ts`
Expected: FAIL — no se puede resolver `../lib/commentContext`.

- [ ] **Step 3: Crea `commentContext.ts`**

```ts
/* WordAPA7 — contexto de comentarios del lienzo.
   UNA sola construcción para el subrayado inline (ReadingText) y para las
   burbujas del gutter (WhatsAppComment). La regla de styleAuditRun incluye el
   corrector: si solo corrio proofread, hay burbuja y tiene que haber
   subrayado, o el hallazgo queda resaltado a medias. */

import type { WhatsAppContext } from '../components/layout/WhatsAppComment';

export interface CommentContextSource {
  citationAuditResult: { ghost_citations?: unknown[]; orphan_references?: unknown[] } | null;
  validationIssues: unknown[] | null | undefined;
  sugerenciasProactivas: boolean;
  reviewResult: unknown;
  proofreadFindings: unknown[];
}

export function buildCommentContext(s: CommentContextSource): WhatsAppContext {
  return {
    ghostCitations: s.citationAuditResult?.ghost_citations || [],
    orphanReferences: s.citationAuditResult?.orphan_references || [],
    validationIssues: s.sugerenciasProactivas ? s.validationIssues || [] : [],
    styleAuditRun: !!s.reviewResult || s.proofreadFindings.length > 0,
  };
}
```

Si `WhatsAppContext` no está exportada desde `WhatsAppComment.tsx`, expórtala: cambia
`interface WhatsAppContext` por `export interface WhatsAppContext`.

- [ ] **Step 4: Reescribe los dos call sites en `PaperCanvas.tsx`**

En `src/components/layout/PaperCanvas.tsx`:

1. Añade el import: `import { buildCommentContext } from '../../lib/commentContext';`
2. Sustituye el bloque de las líneas 894-905 por:

```tsx
  const commentCtx = useMemo(
    () => buildCommentContext({ citationAuditResult, validationIssues, sugerenciasProactivas, reviewResult, proofreadFindings }),
    [citationAuditResult, validationIssues, sugerenciasProactivas, reviewResult, proofreadFindings],
  );
```

3. Sustituye el bloque de las líneas 591-604 (el `cmtCtx` que se construía con `getState()`) por:

```tsx
  const cmtCtx = buildCommentContext({
    citationAuditResult: getState().citationAuditResult,
    validationIssues: getState().validationIssues,
    sugerenciasProactivas: getState().sugerenciasProactivas,
    reviewResult: getState().reviewResult,
    proofreadFindings: getState().proofreadFindings,
  });
```

- [ ] **Step 5: Corre el test y verifica que pasa**

Run: `npx vitest run src/__tests__/commentContext.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6: Corrige los tests de resaltado existentes**

Run: `npm test`
Expected: PASS. `reviewHighlight.test.tsx` y `WhatsAppComment.test.tsx` tienen casos que dependían de
la divergencia; si alguno falla, el código nuevo es el correcto y el test debe actualizarse para
esperar el subrayado que ahora sí aparece.

- [ ] **Step 7: Commit**

```bash
git add src/lib/commentContext.ts src/components/layout/PaperCanvas.tsx src/__tests__/commentContext.test.ts
git commit -m "fix(review): una sola construccion de commentCtx, con el corrector en styleAuditRun"
```

---

### Task 9: `ReadingText`, implementación única de los resaltados

**Files:**
- Create: `src/components/review/ReadingText.tsx`
- Modify: `src/components/layout/PaperCanvas.tsx:554-703` (`renderReviewedText` y la tabla de colores)
- Test: `src/__tests__/readingText.test.tsx`

**Interfaces:**
- Consumes: `findAccentAgnostic` (búscalo con `Select-String -Path src/lib/*.ts -Pattern findAccentAgnostic`; si vive dentro de `PaperCanvas`, muévelo a `src/lib/accentMatch.ts`, que ya existe), `buildCommentContext` (Task 8), `getWhatsAppComment` de `WhatsAppComment.tsx`, `findCitationsInText` de `src/lib/citationMatcher.ts`.
- Produces:
  - `export type MarkKind = 'ai' | 'spelling' | 'comment' | 'citation'`
  - `export interface ReadingMark { start: number; end: number; kind: MarkKind; severity?: string; title: string }`
  - `export function collectMarks(text: string, source: MarkSource): ReadingMark[]`
  - `export const MARK_STYLE: Record<MarkKind, React.CSSProperties>`
  - `export function ReadingText({ text, source }: { text: string; source: MarkSource }): JSX.Element`
  - `export interface MarkSource { reviewResult: unknown; proofreadFindings: ProofreadFinding[]; commentCtx: WhatsAppContext; showCitations: boolean }`

Lo consumen `PaperCanvas` (esta misma tarea) y `FocusReadingCard` (Task 14).

- [ ] **Step 1: Escribe el test que falla**

Crea `src/__tests__/readingText.test.tsx`:

```tsx
/**
 * WordAPA7 — T9: ReadingText es la unica implementacion de los resaltados
   inline. Ningun color hardcodeado: todo sale de MARK_STYLE, que son tokens.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReadingText, collectMarks, MARK_STYLE } from '../components/review/ReadingText';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '../components/review/ReadingText.tsx'),
  'utf8',
);

const ctxVacio = { ghostCitations: [], orphanReferences: [], validationIssues: [], styleAuditRun: false };

describe('T9 — ReadingText', () => {
  it('no contiene hex literales', () => {
    expect(SRC).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('cada tipo de marca se pinta con variables CSS, nunca con un color fijo', () => {
    for (const style of Object.values(MARK_STYLE)) {
      const colores = Object.values(style).join(' ');
      expect(colores).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(colores).not.toMatch(/rgba?\(/);
    }
    expect(String(MARK_STYLE.spelling.borderBottom)).toContain('var(--color-danger)');
    expect(String(MARK_STYLE.style.borderBottom)).toContain('var(--color-accent)');
  });

  it('el detector de IA usa el token dedicado, para que se lea en oscuro', () => {
    expect(String(MARK_STYLE.ai.backgroundColor)).toContain('var(--mark-ai-bg)');
  });

  it('resalta la ortografía sin partir la palabra', () => {
    const texto = 'El alcance de la campaña alcanze el objetivo.';
    const marcas = collectMarks(texto, {
      reviewResult: { paragraphs: [{ text: texto, spelling: [{ word: 'alcanze', suggestions: ['alcance'] }] }] },
      proofreadFindings: [],
      commentCtx: ctxVacio,
      showCitations: false,
    });
    const m = marcas.find((x) => x.kind === 'spelling');
    expect(m).toBeTruthy();
    expect(texto.slice(m!.start, m!.end)).toBe('alcanze');
  });

  it('encuentra la palabra aunque venga con acentos distintos', () => {
    const texto = 'Se aplicó el ANALISIS a los datos.';
    const marcas = collectMarks(texto, {
      reviewResult: { paragraphs: [{ text: texto, spelling: [{ word: 'análisis', suggestions: [] }] }] },
      proofreadFindings: [],
      commentCtx: ctxVacio,
      showCitations: false,
    });
    expect(marcas.some((x) => x.kind === 'spelling')).toBe(true);
  });

  it('un texto sin marcas se renderiza limpio, sin <mark>', () => {
    const { container } = render(
      <ReadingText text="Texto sin observaciones." source={{ reviewResult: null, proofreadFindings: [], commentCtx: ctxVacio, showCitations: false }} />,
    );
    expect(container.querySelectorAll('mark')).toHaveLength(0);
    expect(container.textContent).toBe('Texto sin observaciones.');
  });

  it('el texto acentuado se conserva íntegro tras el resaltado', () => {
    const texto = 'La metodología fue rigurosa según el análisis, según la muestra.';
    const { container } = render(
      <ReadingText text={texto} source={{ reviewResult: null, proofreadFindings: [], commentCtx: ctxVacio, showCitations: false }} />,
    );
    expect(container.textContent).toBe(texto);
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `npx vitest run src/__tests__/readingText.test.tsx`
Expected: FAIL — no se puede resolver `../components/review/ReadingText`.

- [ ] **Step 3: Crea `ReadingText.tsx`**

```tsx
/* WordAPA7 — review: resaltados inline del párrafo.
   Implementación ÚNICA. Antes vivía dentro de PaperCanvas y se duplicaba con
   reglas distintas; ahora la tarjeta de lectura y el lienzo pintan igual. */

import React from 'react';
import type { WhatsAppContext } from '../layout/WhatsAppComment';
import { getWhatsAppComment } from '../layout/WhatsAppComment';
import { findAccentAgnostic } from '../../lib/accentMatch';
import { findCitationsInText } from '../../lib/citationMatcher';

export type MarkKind = 'ai' | 'spelling' | 'style' | 'comment' | 'citation';

export interface ReadingMark {
  start: number;
  end: number;
  kind: MarkKind;
  severity?: string;
  title: string;
}

export interface MarkSource {
  reviewResult: { paragraphs?: Array<{ text?: string; findings?: Array<{ phrase?: string; phrases?: string[]; detail?: string; severity?: string }>; spelling?: Array<{ word: string; suggestions?: string[] }> }> } | null;
  proofreadFindings: Array<{ element_id?: string; excerpt?: string; kind?: string; message?: string; severity?: string }>;
  commentCtx: WhatsAppContext;
  showCitations: boolean;
}

/** Colores por motor. Todos por token: ningún hex, ningún rgba (Review Focus #1). */
export const MARK_STYLE: Record<MarkKind, React.CSSProperties> = {
  spelling: {
    backgroundColor: 'var(--severity-critical-soft)',
    borderBottom: '2px solid var(--color-danger)',
    color: 'var(--color-danger)',
    fontWeight: 500,
  },
  style: {
    backgroundColor: 'var(--color-accent-soft)',
    borderBottom: '2px solid var(--color-accent)',
    color: 'var(--color-accent)',
    fontWeight: 500,
  },
  ai: {
    backgroundColor: 'var(--mark-ai-bg)',
    borderBottom: '2px dashed var(--color-text-secondary)',
    color: 'var(--color-text-secondary)',
  },
  comment: {
    backgroundColor: 'var(--severity-warning-soft)',
    borderBottom: '2px solid var(--color-warning)',
    color: 'var(--color-text-primary)',
  },
  citation: {
    backgroundColor: 'var(--severity-info-soft)',
    borderBottom: '2px solid var(--color-info)',
    color: 'var(--color-text-primary)',
  },
};

const KIND_PRIORITY: Record<MarkKind, number> = {
  comment: 5, citation: 4, spelling: 3, style: 2, ai: 1,
};

export function collectMarks(text: string, source: MarkSource): ReadingMark[] {
  const marcas: ReadingMark[] = [];
  const push = (start: number, end: number, kind: MarkKind, title: string, severity?: string) => {
    if (start < 0 || end <= start) return;
    marcas.push({ start, end, kind, title, severity });
  };

  const parrafo = source.reviewResult?.paragraphs?.find((p) => p.text === text)
    || source.reviewResult?.paragraphs?.[0];

  for (const f of parrafo?.findings || []) {
    const frases = f.phrases?.length ? f.phrases : f.phrase ? [f.phrase] : [];
    for (const frase of frases) {
      const idx = findAccentAgnostic(text, frase);
      if (idx >= 0) push(idx, idx + frase.length, 'ai', f.detail || 'Patrón de IA', f.severity);
    }
  }

  for (const s of parrafo?.spelling || []) {
    const idx = findAccentAgnostic(text, s.word);
    if (idx >= 0) {
      const sugerencia = s.suggestions?.[0];
      push(idx, idx + s.word.length, 'spelling', sugerencia ? `Ortografía: ${s.word} → ${sugerencia}` : `Ortografía: ${s.word}`);
    }
  }

  const cita = getWhatsAppComment({ id: 'mark', text } as never, source.commentCtx, 0);
  if (cita?.match) {
    const idx = findAccentAgnostic(text, cita.match);
    if (idx >= 0) push(idx, idx + cita.match.length, 'comment', cita.text);
  }

  if (source.showCitations) {
    for (const c of findCitationsInText(text)) {
      push(c.start, c.end, 'citation', c.ok ? 'Cita correcta' : 'Cita con problemas');
    }
  }

  // Consolida solapes: gana la marca de mayor prioridad y absorbe el rango.
  marcas.sort((a, b) => (KIND_PRIORITY[b.kind] - KIND_PRIORITY[a.kind]) || (a.start - b.start));
  const out: ReadingMark[] = [];
  for (const m of marcas) {
    const previa = out[out.length - 1];
    if (previa && m.start < previa.end) {
      previa.end = Math.max(previa.end, m.end);
      continue;
    }
    out.push({ ...m });
  }
  return out.sort((a, b) => a.start - b.start);
}

export function ReadingText({ text, source }: { text: string; source: MarkSource }) {
  const marcas = collectMarks(text, source);
  if (!marcas.length) return <>{text}</>;

  const partes: React.ReactNode[] = [];
  let cursor = 0;
  marcas.forEach((m, i) => {
    if (m.start > cursor) partes.push(<span key={`t-${i}`}>{text.slice(cursor, m.start)}</span>);
    partes.push(
      <mark key={`m-${i}`} title={m.title} style={{ ...MARK_STYLE[m.kind], padding: '0 1px', borderRadius: 'var(--radius-sm)' }}>
        {text.slice(m.start, m.end)}
      </mark>,
    );
    cursor = m.end;
  });
  if (cursor < text.length) partes.push(<span key="tail">{text.slice(cursor)}</span>);
  return <>{partes}</>;
}
```

El test de la Step 1 referencia `MARK_STYLE.style_`. Renómbralo a `MARK_STYLE.style` en el test
(Python-style no vale en este objeto):

```tsx
    expect(String(MARK_STYLE.style.borderBottom)).toContain('var(--color-accent)');
```

- [ ] **Step 4: Corrige las firmas de los helpers**

`findAccentAgnostic` y `findCitationsInText` pueden tener firmas distintas. Compruébalas y ajusta:

```bash
Select-String -Path src/lib/accentMatch.ts,src/lib/citationMatcher.ts -Pattern 'export (function|const)'
```

`findAccentAgnostic` debe devolver el índice o `-1`. Si devuelve un objeto, adapta los tres
`push(... findAccentAgnostic(text, x) ...)` al formato real. `findCitationsInText` debe devolver
`Array<{ start: number; end: number; ok?: boolean }>`; si no trae `ok`, quita ese campo del título.

- [ ] **Step 5: Haz que `PaperCanvas` consuma `ReadingText`**

En `src/components/layout/PaperCanvas.tsx`:

1. Añade el import.
2. Sustituye las cuatro llamadas `renderReviewedText(...)` (líneas 2069, 2082, 2088, 2094) por
   `<ReadingText text={...} source={{ reviewResult, proofreadFindings, commentCtx, showCitations: showCitationMarks }} />`.
3. Borra el cuerpo de `renderReviewedText` (líneas 554-703) y su tabla de estilos.

- [ ] **Step 6: Corre los tests**

Run: `npm test`
Expected: PASS. `reviewHighlight.test.tsx` es el que más se resiente: sus expectativas sobre el
subrayado de IA espurioso pasaban con la lógica vieja. Actualiza lo que falle al comportamiento
nuevo, que es el correcto.

- [ ] **Step 7: Commit**

```bash
git add src/components/review/ReadingText.tsx src/components/layout/PaperCanvas.tsx src/__tests__/readingText.test.tsx
git commit -m "refactor(review): ReadingText como implementacion unica de resaltados inline"
```

---

### Task 10: `usePageIndex` con la paginación real

**Files:**
- Create: `src/hooks/usePageIndex.ts`
- Test: `src/__tests__/usePageIndex.test.ts`

**Interfaces:**
- Consumes: `computePages(elements: ElementModel[], maxUnits = 14): ElementModel[][]` de `src/components/layout/PaperCanvas.tsx:294`.
- Produces:
  - `export interface PageIndex { totalPages: number; pageOfElement: Map<string, number>; pages: ElementModel[][]; pageOf: (elementId: string) => number | null }`
  - `export function usePageIndex(): PageIndex`

Lo consumen `useReviewWorkbench` (Task 12) y `RailFlyout` a través de este.

- [ ] **Step 1: Escribe el test que falla**

Crea `src/__tests__/usePageIndex.test.ts`:

```ts
/**
 * WordAPA7 — T10: el indice de paginas sale del computePages real.
   El mapa de 1800 caracteres por pagina moria con este hook: un hallazgo
   caia en una pagina que el minimapa no marcaba.
 */
import { describe, it, expect } from 'vitest';
import { computePages } from '../components/layout/PaperCanvas';
import { buildPageIndex } from '../hooks/usePageIndex';

const parrafo = (id: string, largo = 100) =>
  ({ id, type: 'paragraph', text: 'a'.repeat(largo) }) as never;

describe('T10 — usePageIndex', () => {
  it('sin documento, cero páginas y ninguna página asignada', () => {
    const idx = buildPageIndex([]);
    expect(idx.totalPages).toBe(0);
    expect(idx.pageOf('lo-que-sea')).toBeNull();
  });

  it('cada elemento cae en la página que el computePages le dio', () => {
    const elementos = [parrafo('a'), parrafo('b'), parrafo('c'), parrafo('d')];
    const paginas = computePages(elementos);
    const idx = buildPageIndex(elementos);
    expect(idx.totalPages).toBe(paginas.length);
    for (const [i, pagina] of paginas.entries()) {
      for (const el of pagina) {
        expect(idx.pageOf(el.id)).toBe(i + 1);
      }
    }
  });

  it('un elemento inexistente devuelve null, nunca una página inventada', () => {
    const idx = buildPageIndex([parrafo('a')]);
    expect(idx.pageOf('fantasma')).toBeNull();
  });

  it('la portada es indivisible: sus elementos no se reparten en la página 2', () => {
    const portada = [
      { id: 't', type: 'heading', text: 'Universidad', is_cover_section: true } as never,
      { id: 'a', type: 'paragraph', text: 'Autor', is_cover_section: true } as never,
    ];
    const idx = buildPageIndex(portada);
    expect(idx.pageOf('t')).toBe(1);
    expect(idx.pageOf('a')).toBe(1);
  });

  it('ningún elemento queda sin página asignada', () => {
    const elementos = Array.from({ length: 120 }, (_, i) => parrafo(`e${i}`, 400));
    const idx = buildPageIndex(elementos);
    expect(idx.totalPages).toBeGreaterThan(1);
    for (let i = 0; i < elementos.length; i++) {
      expect(idx.pageOf(`e${i}`)).not.toBeNull();
    }
  });
});
```

- [ ] **Step 3: Corre el test y verifica que falla**

Run: `npx vitest run src/__tests__/usePageIndex.test.ts`
Expected: FAIL — no se puede resolver `../hooks/usePageIndex`.

- [ ] **Step 4: Crea `usePageIndex.ts`**

```ts
/* WordAPA7 — paginación real como única fuente de páginas.
   El workbench usaba 1800 caracteres por página mientras el lienzo usaba
   computePages: un hallazgo podía caer en una página que el minimapa no
   marcaba. Aquí hay un solo índice, y quien no esté en él devuelve null. */

import { useMemo } from 'react';
import { useDocStore } from '../store/useDocStore';
import { computePages } from '../components/layout/PaperCanvas';
import type { ElementModel } from '../types';

export interface PageIndex {
  totalPages: number;
  pages: ElementModel[][];
  pageOf: (elementId: string) => number | null;
}

export function buildPageIndex(elements: ElementModel[]): PageIndex {
  const pages = elements.length ? computePages(elements) : [];
  const pageOfElement = new Map<string, number>();
  pages.forEach((page, i) => {
    for (const el of page) {
      if (el?.id && !pageOfElement.has(el.id)) pageOfElement.set(el.id, i + 1);
    }
  });
  return {
    totalPages: pages.length,
    pages,
    pageOf: (elementId: string) => pageOfElement.get(elementId) ?? null,
  };
}

export function usePageIndex(): PageIndex {
  const doc = useDocStore((s) => s.doc);
  return useMemo(() => buildPageIndex(doc?.elements || []), [doc]);
}
```

- [ ] **Step 5: Corre el test y verifica que pasa**

Run: `npx vitest run src/__tests__/usePageIndex.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 6: Borra el mapa heurístico de la vista de Revisión**

Todavía no lo borres: `Step5AuditIAWizard` lo usa y la Task 12 lo reemplaza. Anótalo para la Task 12.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/usePageIndex.ts src/__tests__/usePageIndex.test.ts
git commit -m "feat(layout): usePageIndex, el computePages real como unica fuente de paginas"
```

---

### Task 10b: Calibrar las unidades de página y dar al índice las alturas reales

> **Añadida durante la ejecución**, no en la redacción inicial. La Task 10 entregó el índice honesto
> pero descubrió que el defecto que venía a matar sobrevivía por debajo: la escala de unidades de
> `computePages` está calibrada al revés, así que el índice y el lienzo cuentan páginas distintas por
> un factor de ~2x en prosa corriente. Va antes de la Task 12 porque la 12 es la que pone el `N` de
> "Página X de N" y dibuja el minimapa: hasta que esto aterrice, ningún número visible depende del
> índice, y después dependería de un número que miente.

**Files:**
- Modify: `src/components/layout/PaperCanvas.tsx:356` (la escala de unidades) y `:1292` (la ventana de
  virtualización)
- Modify: `src/hooks/usePageIndex.ts`
- Modify: `src/lib/pageSplitter.ts` y `src/lib/flowPagination.ts` (solo si la calibración lo exige)
- Modify: `src/store/slices/layoutSlice.ts` o el slice que corresponda, para publicar las alturas
- Test: `src/__tests__/pageCalibration.test.ts`, más el centinela de `usePageIndex.test.ts:83`

**Interfaces:**
- Consumes: `computeRenderedPages` (exportada por `PaperCanvas` en la Task 10),
  `applyPageFlow` de `src/lib/pageSplitter.ts`, `flowPagination` de `src/lib/flowPagination.ts`,
  `getPageGeometry` de `src/lib/pageGeometry.ts`, `estimateLines` de `pageSplitter.ts:24`.
- Produces: un almacén de alturas de elemento publicable y legible, y un índice cuya página coincide
  con la del lienzo para el mismo documento.

- [ ] **Step 1: Escribe el test que falla**

El defecto, medido por el revisor contra la función ya entregada, en prosa corriente de 100 a 300
caracteres:

| Documento | Índice hoy | Lienzo medido |
|---|---|---|
| 28 × 100 car. | 1 | 3 – 5 |
| 56 × 100 car. | 2 | 6 – 10 |
| 120 × 100 car. | 5 | 13 – 22 |
| 120 × 300 car. | 9 | 17 – 26 |

Crea `src/__tests__/pageCalibration.test.ts` con un test que construya un documento de prosa
corriente, calcule las páginas **como las calcula el lienzo con alturas reales**, y afirme que coinciden
con las del índice una vez que el índice recibe esas alturas. Hoy falla por un factor de ~2.

- [ ] **Step 2: Corrige el test y verifica que falla**

Run: `npx vitest run src/__tests__/pageCalibration.test.ts`
Expected: FAIL — el índice y el lienzo no coinciden.

- [ ] **Step 3: Diagnostica antes de tocar**

La causa raíz está medida, pero verifícala tú mismo antes de cambiar números:

`src/components/layout/PaperCanvas.tsx:356` calcula `units = Math.ceil(totalLines / 2.0)` — una unidad
por **dos** líneas renderizadas — mientras el presupuesto de `:430` gasta 34px por unidad, cerca de una
línea de 32px. Las dos escalas difieren ~2x, así que una página base lleva 1792px contra un `contentH`
de 832. El presupuesto está en px y la unidad cuenta líneas: no son la misma magnitud.

Antes de corregir, escribe en el informe tu propia medición de la escala, no la del informe del revisor.

- [ ] **Step 4: Pon las dos escalas en la misma unidad**

Haz que la unidad de cómputo y el presupuesto signifiquen lo mismo. La opción que el revisor señaló
como mínima, y que conviene preferir: hacer la medición completa y singular — medir **todos** los
elementos en una pasada sin virtualizar (contenedor oculto o render con `visibility:hidden`),
publicar `heights` en el store, y hacer que `PaperCanvas` consuma `usePageIndex().pages` como la lista
de páginas en vez de recalcular la suya. Eso invierte la dependencia y mata la clase de bug de una vez,
no el síntoma.

El punto crítico: publicar solo `measuredRef` **no basta**. La lista del lienzo es dependiente del
scroll —solo se renderizan páginas dentro de `activePageIndex ± 4` (`PaperCanvas.tsx:1292`), y fuera de
esa ventana no hay medición—, así que el lienzo hoy mezcla páginas reflowadas y páginas base en un
mismo array. La medición tiene que ser completa antes de publicarse, o el índice seguirá divergiendo.

- [ ] **Step 5: Convierte el centinela en una prueba real**

`src/__tests__/usePageIndex.test.ts:83` es hoy un centinela que falla a propósito cuando las dos ramas
se unifican sin que nadie reescriba la expectativa. Deja de ser un centinela: ahora que las ramas deben
unificarse, su expectativa pasa a ser la de igualdad real, y el comentario que explica el centinela se
sustituye por el que explica la garantía. Agrega el marcador de una línea sobre la aserción de `:88`,
que es la que salta primero bajo el escenario que el centinela advertía.

- [ ] **Step 6: Corrige los tests y verifica que pasan**

Run: `npx vitest run src/__tests__/usePageIndex.test.ts src/__tests__/pageCalibration.test.ts`
Expected: PASS.

- [ ] **Step 7: Corre la suite completa**

Run: `npm test` y `npm run build`
Expected: verdes. La paginación del lienzo cambia —ese es el punto— así que es esperable que
`computePages.test.ts`, `pageSplitter.test.ts`, `pageGeometry.test.ts` o `pageGeometry.integration.test.ts`
necesiten actualizar. Actualízalos a la calibración nueva y explica cada cambio: si alguno falla por una
razón que no sea la escala de unidades, **para y repórtalo**, porque significaría que la calibración
tenía un efecto lateral que no se考慮ó.

- [ ] **Step 8: Si la calibración altera el número de páginas visible, para y pide ruling**

Calibrar las unidades correctamente **cambia cuántas páginas dibuja el lienzo**: hoy una página base
lleva 1792px contra un `contentH` de 832, así que la calibración nueva produce menos páginas para el
mismo documento. Eso no es un refactor, es comportamiento de producto, y el número de páginas del
documento que el usuario exporta puede moverse. Si tu medición confirma que el conteo visible cambia
de forma apreciable, **para aquí y pide ruling** con las cifras antes de seguir. Si el cambio es
marginal, sigue y dilo en el informe.

- [ ] **Step 9: Commit**

```bash
git add src/components/layout/PaperCanvas.tsx src/hooks/usePageIndex.ts src/lib/pageSplitter.ts \
        src/lib/flowPagination.ts src/store/slices src/__tests__/usePageIndex.test.ts \
        src/__tests__/pageCalibration.test.ts
git commit -m "fix(layout): una sola escala de paginas, y el indice ve las alturas reales"
```

---

### Task 11: `useAutoFitText` con piso duro de 13px

**Files:**
- Create: `src/hooks/useAutoFitText.ts`
- Test: `src/__tests__/useAutoFitText.test.ts`

**Interfaces:**
- Consumes: nada más que React.
- Produces:
  - `export const MIN_FONT_PX = 13`
  - `export const MAX_FONT_PX = 19`
  - `export const MAX_LINES = 26`
  - `export function lineHeightFor(fontPx: number): number`
  - `export function useAutoFitText(): { containerRef: React.RefObject<HTMLDivElement>; fontSize: number; lineHeight: number }`

Lo consume `FocusReadingCard` (Task 14).

- [ ] **Step 1: Escribe el test que falla**

Crea `src/__tests__/useAutoFitText.test.ts`:

```ts
/**
 * WordAPA7 — T11: el parrafo de lectura se auto-ajusta, con piso duro.
   El usuario pidio que se adapte si es inmenso, pero no a costa de la
   legibilidad: 13px es el piso y ningun camino lo cruza.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoFitText, MIN_FONT_PX, MAX_FONT_PX, lineHeightFor } from '../hooks/useAutoFitText';

describe('T11 — useAutoFitText', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    (globalThis as Record<string, unknown>).requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    };
  });
  afterEach(() => vi.useRealTimers());

  it('los limites son 13 y 19, en ese orden', () => {
    expect(MIN_FONT_PX).toBe(13);
    expect(MAX_FONT_PX).toBe(19);
  });

  it('el interlineado crece con el cuerpo, entre 1.75 y 1.85', () => {
    expect(lineHeightFor(13)).toBeGreaterThanOrEqual(1.75);
    expect(lineHeightFor(19)).toBeLessThanOrEqual(1.85);
    expect(lineHeightFor(13)).toBeGreaterThan(lineHeightFor(19));
  });

  it('arranca en el techo cuando el texto cabe holgado', () => {
    const { result } = renderHook(() => useAutoFitText());
    act(() => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      Object.defineProperty(el, 'clientHeight', { value: 2000, configurable: true });
      Object.defineProperty(el, 'scrollHeight', { value: 200, configurable: true });
      (result.current.containerRef as { current: HTMLDivElement | null }).current = el;
    });
    expect(result.current.fontSize).toBe(MAX_FONT_PX);
  });

  it('baja de tamaño pero NUNCA del piso, con un texto enorme', () => {
    const { result } = renderHook(() => useAutoFitText());
    act(() => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      // Ratio que exigiría 3px si no estuviera el piso.
      Object.defineProperty(el, 'clientHeight', { value: 120, configurable: true });
      Object.defineProperty(el, 'scrollHeight', { value: 100000, configurable: true });
      (result.current.containerRef as { current: HTMLDivElement | null }).current = el;
    });
    expect(result.current.fontSize).toBe(MIN_FONT_PX);
    expect(result.current.fontSize).toBeGreaterThanOrEqual(MIN_FONT_PX);
  });

  it('el valor devuelto nunca sale del rango en ninguna circunstancia', () => {
    for (const [c, s] of [[10, 10], [10, 100000], [100000, 10], [0, 0]] as const) {
      const el = document.createElement('div');
      Object.defineProperty(el, 'clientHeight', { value: c, configurable: true });
      Object.defineProperty(el, 'scrollHeight', { value: s, configurable: true });
      expect(() => { computeFit(el); }).not.toThrow();
      const px = computeFit(el);
      expect(px).toBeGreaterThanOrEqual(MIN_FONT_PX);
      expect(px).toBeLessThanOrEqual(MAX_FONT_PX);
    }
  });
});
```

- [ ] **Step 2: Añade el import que el test usa en su último caso**

El test invoca `computeFit` directamente. Añádelo al import de la primera línea:

```ts
import { useAutoFitText, computeFit, MIN_FONT_PX, MAX_FONT_PX, lineHeightFor } from '../hooks/useAutoFitText';
```

- [ ] **Step 3: Corre el test y verifica que falla**

Run: `npx vitest run src/__tests__/useAutoFitText.test.ts`
Expected: FAIL — no se puede resolver `../hooks/usePageIndex`… no, `../hooks/useAutoFitText`.

- [ ] **Step 4: Crea `useAutoFitText.ts`**

```ts
/* WordAPA7 — auto-ajuste tipografico de la tarjeta de lectura.
   El parrafo se encoge si es enorme y crece si es corto, siempre entre 13 y
   19px. El piso de 13px no es negociable: por debajo, la revision se vuelve
   inutilizable, y preferimos que la tarjeta scrollee. */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export const MIN_FONT_PX = 13;
export const MAX_FONT_PX = 19;
/** Cuantas lineas caben sin scroll interno antes de empezar a encoger. */
export const MAX_LINES = 26;

export function lineHeightFor(fontPx: number): number {
  const t = (fontPx - MIN_FONT_PX) / (MAX_FONT_PX - MIN_FONT_PX);
  return 1.85 - 0.10 * Math.min(1, Math.max(0, t));
}

/** Ajuste directo sobre un elemento medible. Exportado para poder testearlo
    sin montar React ni depender de un layout real del navegador. */
export function computeFit(el: HTMLElement): number {
  const alto = el.clientHeight;
  const altoTexto = el.scrollHeight;
  if (alto <= 0) return MAX_FONT_PX;

  // Tamano al que el texto, medido al cuerpo maximo, entraria en MAX_LINES.
  const lineas = altoTexto / MAX_FONT_PX / lineHeightFor(MAX_FONT_PX);
  if (lineas <= MAX_LINES) return MAX_FONT_PX;

  const objetivo = (MAX_LINES * lineHeightFor(MAX_FONT_PX) * alto) / altoTexto;
  const px = Math.min(MAX_FONT_PX, Math.max(MIN_FONT_PX, objetivo));
  return px;
}

export function useAutoFitText() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(MAX_FONT_PX);

  const medir = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setFontSize(computeFit(el));
  }, []);

  useLayoutEffect(medir, [medir]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(medir);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [medir]);

  return { containerRef, fontSize, lineHeight: lineHeightFor(fontSize) };
}
```

- [ ] **Step 5: Corre el test y verifica que pasa**

Run: `npx vitest run src/__tests__/useAutoFitText.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useAutoFitText.ts src/__tests__/useAutoFitText.test.ts
git commit -m "feat(review): auto-ajuste del parrafo de lectura, con piso duro de 13px"
```

---

### Task 12: `useReviewWorkbench`, la capa de datos de Revisión

**Files:**
- Create: `src/hooks/useReviewWorkbench.ts`
- Test: `src/__tests__/useReviewWorkbench.test.ts`

**Interfaces:**
- Consumes: `useDocStore` (`doc`, `reviewResult`, `proofreadFindings`, `citationAuditResult`, `aiIndices`, `setSelectedElementId`, `setScrollTargetId`, `runQuickFix`, `runAIReview`, `runProofreadBatch`, `runCitationAudit`, `autoResolveGhosts`, `autoCaptionAll`, `updateElementText`, `showToast`, `openExportTunnel`), `usePageIndex` (Task 10), `ToolWindowId`/`AuditItem` de `Step5AuditIAWizard.tsx:33-56`.
- Produces:
  - `export type EngineId = 'ai' | 'style' | 'spelling' | 'citations' | 'structure'`
  - `export type EngineFilter = EngineId | 'all'`
  - `export interface AuditItem { id: string; element_id: string; category: EngineId; subtype: string; severity: 'critical' | 'high' | 'medium' | 'low'; summary: string; detail: string; originalText: string; suggestedText?: string; pageNumber: number | null; aiScore?: number }`
  - `export interface SubtypeGroup { key: string; label: string; items: AuditItem[]; action: 'accept' | 'mark' | 'resolveGhosts' | 'autoCaption' | 'none'; massLabel: string }`
  - `export interface EngineGroup { engine: EngineId; title: string; chip: string; count: number; criticalHigh: number; groups: SubtypeGroup[]; massLabel: string; massAction: 'accept' | 'mark' | 'resolveGhosts' | 'autoCaption' | 'none' }`
  - `export function useReviewWorkbench(): ReviewWorkbenchApi`
  - `export interface ReviewWorkbenchApi { items: AuditItem[]; groups: EngineGroup[]; marks: Map<number, MinimapMark>; filter: EngineFilter; setFilter: (f: EngineFilter) => void; totalPages: number; currentPage: number; goToPage: (p: number) => void; selected: AuditItem | null; select: (id: string | null) => void; nextFinding: () => void; openEngine: (e: EngineId) => void; openSubtype: (key: string) => void; openEngines: EngineId[]; openSubtypes: string[]; acceptOne: (item: AuditItem) => Promise<void>; acceptMany: (items: AuditItem[]) => Promise<void>; markForReview: (item: AuditItem) => void; dismiss: (item: AuditItem) => void; markedIds: string[]; scanAll: () => Promise<void>; isScanning: boolean; metrics: { total: number; critical: number; compliance: number | null }; viewMode: 'focus' | 'canvas'; setViewMode: (m: 'focus' | 'canvas') => void }`

`MinimapMark` viene de `src/components/wizard/ReviewMinimap.tsx:13-20`.

- [ ] **Step 1: Escribe el test que falla**

Crea `src/__tests__/useReviewWorkbench.test.ts`:

```ts
/**
 * WordAPA7 — T12: la vista de Revision saca su cerebro del componente.
   Aqui se prueban el filtrado, el agrupado, la pagina real y la honestidad
   de las metricas, todo sin montar un solo nodo del DOM.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { useReviewWorkbench } from '../hooks/useReviewWorkbench';

const hallazgo = (over: Record<string, unknown> = {}) => ({
  id: 'h1', element_id: 'e1', category: 'spelling', subtype: 'ortografia',
  severity: 'medium', summary: 'Ortografía', detail: 'Falta tilde', originalText: 'tambien',
  suggestedText: 'también', pageNumber: null, ...over,
});

describe('T12 — useReviewWorkbench', () => {
  beforeEach(() => {
    useDocStore.setState({
      doc: { elements: [
        { id: 'e1', type: 'paragraph', text: 'tambien' },
        { id: 'e2', type: 'paragraph', text: 'otro parrafo' },
      ] } as never,
      reviewResult: null, proofreadFindings: [], citationAuditResult: null, aiIndices: null,
      dismissedItemIds: [],
    });
  });

  it('sin motores ejecutados, la vista está vacía y la métrica es honesta', () => {
    const { result } = renderHook(() => useReviewWorkbench());
    expect(result.current.items).toHaveLength(0);
    expect(result.current.metrics.compliance).toBeNull();
  });

  it('un elemento sin página real no recibe número inventado', () => {
    useDocStore.setState({
      proofreadFindings: [{
        element_id: 'e1', start: 0, end: 6, excerpt: 'tambien', kind: 'ortografia',
        severity: 'error', message: 'Falta tilde', suggestion: 'también', source: 'local',
      }] as never,
    });
    const { result } = renderHook(() => useReviewWorkbench());
    // e1 sí está en la página 1 del computePages, así que aquí SÍ hay página.
    expect(result.current.items[0].pageNumber).toBe(1);
  });

  it('el filtro por motor oculta los grupos de los otros', () => {
    useDocStore.setState({
      proofreadFindings: [
        { element_id: 'e1', start: 0, end: 6, excerpt: 'tambien', kind: 'ortografia', severity: 'error', message: 'x', suggestion: 'también', source: 'local' },
        { element_id: 'e2', start: 0, end: 6, excerpt: 'objetivo', kind: 'bloom_verb', severity: 'error', message: 'y', suggestion: 'analizar', source: 'local' },
      ] as never,
    });
    const { result } = renderHook(() => useReviewWorkbench());
    expect(result.current.groups.map((g) => g.engine).sort()).toEqual(['spelling', 'style']);
    act(() => result.current.setFilter('spelling'));
    expect(result.current.groups.map((g) => g.engine)).toEqual(['spelling']);
  });

  it('el filtro también recorta las marcas del minimapa', () => {
    useDocStore.setState({
      proofreadFindings: [
        { element_id: 'e1', start: 0, end: 6, excerpt: 'tambien', kind: 'ortografia', severity: 'error', message: 'x', suggestion: 'también', source: 'local' },
        { element_id: 'e2', start: 0, end: 6, excerpt: 'redundancia', kind: 'muletilla', severity: 'error', message: 'y', suggestion: '', source: 'local' },
      ] as never,
    });
    const { result } = renderHook(() => useReviewWorkbench());
    act(() => result.current.setFilter('spelling'));
    const motores = new Set([...result.current.marks.values()].map((m) => m.label));
    expect(motores.size).toBeLessThanOrEqual(1);
  });

  it('el grupo que abre por defecto es el de mayor severidad, no el primero', () => {
    useDocStore.setState({
      proofreadFindings: [
        { element_id: 'e1', start: 0, end: 6, excerpt: 'a', kind: 'ortografia', severity: 'error', message: 'x', suggestion: 'b', source: 'local' },
        { element_id: 'e2', start: 0, end: 6, excerpt: 'c', kind: 'muletilla', severity: 'critical', message: 'y', suggestion: '', source: 'local' },
      ] as never,
    });
    const { result } = renderHook(() => useReviewWorkbench());
    expect(result.current.openEngines).toEqual(['ai']);
  });

  it('el detector de IA nunca ofrece Aceptar', () => {
    useDocStore.setState({
      proofreadFindings: [
        { element_id: 'e1', start: 0, end: 6, excerpt: 'a', kind: 'muletilla', severity: 'critical', message: 'x', suggestion: 'y', source: 'local' },
      ] as never,
    });
    const { result } = renderHook(() => useReviewWorkbench());
    const ia = result.current.groups.find((g) => g.engine === 'ai');
    expect(ia?.massAction).toBe('mark');
    expect(ia?.massLabel).toBe('Marcar todos');
  });

  it('el cumplimiento solo se publica con los tres motores ejecutados', () => {
    useDocStore.setState({ proofreadFindings: [{ element_id: 'e1', start: 0, end: 6, excerpt: 'a', kind: 'ortografia', severity: 'error', message: 'x', suggestion: 'b', source: 'local' }] as never });
    const { result } = renderHook(() => useReviewWorkbench());
    expect(result.current.metrics.compliance).toBeNull();
  });

  it('“Siguiente hallazgo” avanza y selecciona', () => {
    useDocStore.setState({
      proofreadFindings: [
        { element_id: 'e1', start: 0, end: 6, excerpt: 'a', kind: 'ortografia', severity: 'error', message: 'x', suggestion: 'b', source: 'local' },
        { element_id: 'e2', start: 0, end: 6, excerpt: 'c', kind: 'ortografia', severity: 'error', message: 'y', suggestion: 'd', source: 'local' },
      ] as never,
    });
    const { result } = renderHook(() => useReviewWorkbench());
    act(() => result.current.nextFinding());
    expect(result.current.selected).not.toBeNull();
  });

  it('la vista arranca en Foco, no en la hoja completa', () => {
    const { result } = renderHook(() => useReviewWorkbench());
    expect(result.current.viewMode).toBe('focus');
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `npx vitest run src/__tests__/useReviewWorkbench.test.ts`
Expected: FAIL — no se puede resolver `../hooks/useReviewWorkbench`.

- [ ] **Step 3: Crea `useReviewWorkbench.ts`**

```ts
/* WordAPA7 — review: capa de datos del workbench.
   Todo lo que antes eran 20 useState y 300 lineas de memos dentro del
   componente. Sin JSX, para poder probar el filtrado, el agrupado, la
   paginacion real y la honestidad de las metricas sin DOM. */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useDocStore } from '../store/useDocStore';
import { usePageIndex } from './usePageIndex';
import type { MinimapMark } from '../components/wizard/ReviewMinimap';

export type EngineId = 'ai' | 'style' | 'spelling' | 'citations' | 'structure';
export type EngineFilter = EngineId | 'all';
export type SubtypeAction = 'accept' | 'mark' | 'resolveGhosts' | 'autoCaption' | 'none';

export interface AuditItem {
  id: string;
  element_id: string;
  category: EngineId;
  subtype: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  summary: string;
  detail: string;
  originalText: string;
  suggestedText?: string;
  pageNumber: number | null;
  aiScore?: number;
}

export interface SubtypeGroup {
  key: string;
  label: string;
  items: AuditItem[];
  action: SubtypeAction;
  massLabel: string;
}

export interface EngineGroup {
  engine: EngineId;
  title: string;
  chip: string;
  count: number;
  criticalHigh: number;
  groups: SubtypeGroup[];
  massAction: SubtypeAction;
  massLabel: string;
}

export const ENGINE_ORDER: EngineId[] = ['spelling', 'style', 'structure', 'citations', 'ai'];

export const ENGINE_META: Record<EngineId, { title: string; chip: string; color: string }> = {
  spelling: { title: 'Ortografía', chip: 'Ortografía', color: 'var(--color-danger)' },
  style: { title: 'Redacción & Bloom', chip: 'Redacción & Bloom', color: 'var(--color-accent)' },
  structure: { title: 'Estructura', chip: 'Estructura', color: 'var(--color-info)' },
  citations: { title: 'Citas', chip: 'Citas', color: 'var(--color-warning)' },
  ai: { title: 'Patrones IA', chip: 'Patrones IA', color: 'var(--color-text-secondary)' },
};

export const SUBTYPE_LABELS: Record<string, string> = {
  ortografia: 'Ortografía', pegado: 'Texto pegado sin formato',
  bloom_verb: 'Verbo en infinitivo', bloom_level: 'Nivel de Bloom', first_person: 'Primera persona', persona: 'Voz impropia',
  encabezado: 'Encabezado', figura: 'Figura sin leyenda', tabla: 'Tabla sin leyenda',
  cita_fantasma: 'Cita fantasma', referencia_huerfana: 'Referencia huérfana',
  parrafo_ia: 'Párrafo con patrón de IA', muletilla: 'Muletilla', ngram_repetition: 'Repetición de n-gramas',
  ai_phrase: 'Frase sintética',
};

const SUBTYPE_ACTION: Record<string, SubtypeAction> = {
  ortografia: 'accept', pegado: 'accept',
  bloom_verb: 'accept', bloom_level: 'accept', first_person: 'accept', persona: 'accept',
  encabezado: 'accept', figura: 'autoCaption', tabla: 'autoCaption',
  cita_fantasma: 'resolveGhosts', referencia_huerfana: 'resolveGhosts',
  parrafo_ia: 'mark', muletilla: 'mark', ngram_repetition: 'mark', ai_phrase: 'mark',
};

const SEVERITY_RANK: Record<AuditItem['severity'], number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** El detector de IA es probabilistico: nunca se "acepta", solo se marca. */
const engineAction = (engine: EngineId): SubtypeAction =>
  engine === 'ai' ? 'mark' : engine === 'citations' ? 'resolveGhosts' : 'accept';

const engineMassLabel = (engine: EngineId): string => {
  switch (engine) {
    case 'ai': return 'Marcar todos';
    case 'citations': return 'Resolver citas';
    case 'structure': return 'Corregir estructura';
    default: return 'Aceptar todas';
  }
};

function kindToCategory(kind: string): EngineId {
  if (kind === 'ortografia' || kind === 'pegado') return 'spelling';
  if (kind === 'ai_phrase' || kind === 'muletilla' || kind === 'ngram_repetition') return 'ai';
  if (kind === 'first_person' || kind === 'persona' || kind.startsWith('bloom')) return 'style';
  return 'structure';
}

export function useReviewWorkbench() {
  const doc = useDocStore((s) => s.doc);
  const reviewResult = useDocStore((s) => s.reviewResult);
  const proofreadFindings = useDocStore((s) => s.proofreadFindings);
  const citationAuditResult = useDocStore((s) => s.citationAuditResult);
  const updateElementText = useDocStore((s) => s.updateElementText);
  const showToast = useDocStore((s) => s.showToast);
  const setSelectedElementId = useDocStore((s) => s.setSelectedElementId);
  const setScrollTargetId = useDocStore((s) => s.setScrollTargetId);
  const runAIReview = useDocStore((s) => s.runAIReview);
  const runProofreadBatch = useDocStore((s) => s.runProofreadBatch);
  const runCitationAudit = useDocStore((s) => s.runCitationAudit);

  const { totalPages, pageOf } = usePageIndex();
  const [filter, setFilter] = useState<EngineFilter>('all');
  const [viewMode, setViewMode] = useState<'focus' | 'canvas'>('focus');
  const [openEngines, setOpenEngines] = useState<EngineId[]>([]);
  const [openSubtypes, setOpenSubtypes] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [markedIds, setMarkedIds] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isScanning, setIsScanning] = useState(false);
  const seeded = useRef(false);

  const items = useMemo<AuditItem[]>(() => {
    const out: AuditItem[] = [];

    for (const p of reviewResult?.paragraphs || []) {
      const elementId = (p as { element_id?: string }).element_id || '';
      for (const f of p.findings || []) {
        out.push({
          id: `ai-${elementId}-${f.phrase}`,
          element_id: elementId,
          category: 'ai',
          subtype: 'parrafo_ia',
          severity: f.severity === 'high' ? 'high' : 'medium',
          summary: f.detail || 'Patrón de IA',
          detail: f.detail || 'Frase con patrón sintético.',
          originalText: p.text || '',
          pageNumber: elementId ? pageOf(elementId) : null,
          aiScore: p.ai_score,
        });
      }
    }

    for (const f of proofreadFindings) {
      out.push({
        id: `pf-${f.element_id}-${f.kind}-${f.start}`,
        element_id: f.element_id,
        category: kindToCategory(f.kind),
        subtype: f.kind,
        severity: f.severity === 'error' ? 'high' : f.severity === 'warn' ? 'medium' : 'low',
        summary: SUBTYPE_LABELS[f.kind] || f.kind,
        detail: f.message || '',
        originalText: f.excerpt || '',
        suggestedText: f.suggestion || undefined,
        pageNumber: pageOf(f.element_id),
      });
    }

    const ghosts = citationAuditResult?.ghost_citations || [];
    for (const [i, g] of ghosts.entries()) {
      const marca = typeof g === 'string' ? g : (g?.key || g?.citation || '');
      out.push({
        id: `ghost-${i}`,
        element_id: '',
        category: 'citations', subtype: 'cita_fantasma', severity: 'critical',
        summary: 'Cita fantasma', detail: String(g?.detail || g || marca),
        originalText: String(marca), pageNumber: null,
      });
    }
    for (const [i, r] of (citationAuditResult?.orphan_references || []).entries()) {
      out.push({
        id: `orphan-${i}`,
        element_id: '', category: 'citations', subtype: 'referencia_huerfana', severity: 'medium',
        summary: 'Referencia huérfana', detail: String(r),
        originalText: String(r), pageNumber: null,
      });
    }

    for (const el of doc?.elements || []) {
      if ((el.type === 'image' || el.type === 'table') && el.needs_review) {
        out.push({
          id: `cap-${el.id}`,
          element_id: el.id,
          category: 'structure',
          subtype: el.type === 'image' ? 'figura' : 'tabla',
          severity: 'high',
          summary: el.type === 'image' ? 'Figura sin leyenda' : 'Tabla sin leyenda',
          detail: 'Falta la leyenda numerada según APA 7.',
          originalText: el.text || '',
          pageNumber: pageOf(el.id),
        });
      }
      if (el.type === 'heading' && el.needs_review) {
        out.push({
          id: `head-${el.id}`,
          element_id: el.id,
          category: 'structure',
          subtype: 'encabezado',
          severity: 'medium',
          summary: 'Encabezado por revisar',
          detail: 'Nivel o formato del encabezado.',
          originalText: el.text || '',
          pageNumber: pageOf(el.id),
        });
      }
    }

    return out.filter((it) => !dismissed.includes(it.id));
  }, [reviewResult, proofreadFindings, citationAuditResult, doc, dismissed, pageOf]);

  const groups = useMemo<EngineGroup[]>(() => {
    const visibles = filter === 'all' ? items : items.filter((i) => i.category === filter);
    const porMotor = new Map<EngineId, AuditItem[]>();
    for (const it of visibles) {
      if (!porMotor.has(it.category)) porMotor.set(it.category, []);
      porMotor.get(it.category)!.push(it);
    }
    return ENGINE_ORDER.filter((e) => porMotor.has(e)).map((engine) => {
      const propios = porMotor.get(engine)!;
      const porSubtipo = new Map<string, AuditItem[]>();
      for (const it of propios) {
        if (!porSubtipo.has(it.subtype)) porSubtipo.set(it.subtype, []);
        porSubtipo.get(it.subtype)!.push(it);
      }
      const subgrupos: SubtypeGroup[] = [...porSubtipo.entries()].map(([key, susItems]) => {
        const action = SUBTYPE_ACTION[key] || engineAction(engine);
        return {
          key: `${engine}:${key}`,
          label: SUBTYPE_LABELS[key] || key,
          items: susItems,
          action,
          massLabel: action === 'mark' ? 'Marcar todos' : action === 'accept' ? 'Aceptar todos' : 'Resolver',
        };
      });
      subgrupos.sort((a, b) => {
        const ra = Math.min(...a.items.map((i) => SEVERITY_RANK[i.severity]));
        const rb = Math.min(...b.items.map((i) => SEVERITY_RANK[i.severity]));
        return ra - rb || b.items.length - a.items.length;
      });
      return {
        engine,
        title: ENGINE_META[engine].title,
        chip: ENGINE_META[engine].chip,
        count: propios.length,
        criticalHigh: propios.filter((i) => i.severity === 'critical' || i.severity === 'high').length,
        groups: subgrupos,
        massAction: engineAction(engine),
        massLabel: engineMassLabel(engine),
      };
    });
  }, [items, filter]);

  // Solo el grupo mas critico abre por defecto, una vez por sesion de datos.
  useMemo(() => {
    if (seeded.current || !groups.length) return;
    seeded.current = true;
    const masCritico = [...groups].sort((a, b) => b.criticalHigh - a.criticalHigh || b.count - a.count)[0];
    if (masCritico) setOpenEngines([masCritico.engine]);
  }, [groups]);

  const marks = useMemo(() => {
    const porPagina = new Map<number, { motores: EngineId[]; count: number; peor: Map<EngineId, number> }>();
    for (const it of items) {
      if (it.pageNumber == null) continue;
      if (filter !== 'all' && it.category !== filter) continue;
      const v = porPagina.get(it.pageNumber) || { motores: [], count: 0, peor: new Map<EngineId, number>() };
      if (!v.motores.includes(it.category)) v.motores.push(it.category);
      v.count += 1;
      v.peor.set(it.category, Math.min(v.peor.get(it.category) ?? 99, SEVERITY_RANK[it.severity]));
      porPagina.set(it.pageNumber, v);
    }
    const salida = new Map<number, MinimapMark>();
    for (const [pagina, v] of porPagina) {
      // La marca de la pagina la tiñe el motor mas grave de ESA pagina, no el
      // primero que aparezca.
      const dominante = [...v.motores].sort((a, b) => (v.peor.get(a) ?? 99) - (v.peor.get(b) ?? 99))[0];
      salida.set(pagina, {
        color: ENGINE_META[dominante].color,
        count: v.count,
        label: ENGINE_META[dominante].title,
      });
    }
    return salida;
  }, [items, filter]);

  const selected = useMemo(() => items.find((i) => i.id === selectedId) || null, [items, selectedId]);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    const item = items.find((i) => i.id === id);
    if (item?.element_id) {
      setSelectedElementId(item.element_id);
      setScrollTargetId(item.element_id);
    }
  }, [items, setSelectedElementId, setScrollTargetId]);

  const goToPage = useCallback((page: number) => {
    setCurrentPage(page);
    const target = (doc?.elements || []).find((e) => e.type !== 'page_break');
    if (target) { setSelectedElementId(target.id); setScrollTargetId(target.id); }
  }, [doc, setSelectedElementId, setScrollTargetId]);

  const nextFinding = useCallback(() => {
    if (!items.length) return;
    const ordenada = [...items].sort((a, b) => (a.pageNumber ?? 999) - (b.pageNumber ?? 999));
    const i = ordenada.findIndex((x) => x.id === selectedId);
    const siguiente = ordenada[(i + 1) % ordenada.length];
    setOpenEngines((prev) => (prev.includes(siguiente.category) ? prev : [...prev, siguiente.category]));
    setOpenSubtypes((prev) => (prev.includes(`${siguiente.category}:${siguiente.subtype}`) ? prev : [...prev, `${siguiente.category}:${siguiente.subtype}`]));
    select(siguiente.id);
    if (siguiente.pageNumber) setCurrentPage(siguiente.pageNumber);
  }, [items, selectedId, select]);

  const acceptOne = useCallback(async (item: AuditItem) => {
    if (item.suggestedText && item.element_id) await updateElementText(item.element_id, item.suggestedText);
    setDismissed((p) => [...p, item.id]);
    showToast('Corrección aplicada');
  }, [updateElementText, showToast]);

  const acceptMany = useCallback(async (lista: AuditItem[]) => {
    for (const item of lista) {
      if (item.suggestedText && item.element_id) await updateElementText(item.element_id, item.suggestedText);
    }
    setDismissed((p) => [...p, ...lista.map((i) => i.id)]);
    showToast(`${lista.length} correcciones aplicadas`);
  }, [updateElementText, showToast]);

  const markForReview = useCallback((item: AuditItem) => {
    setMarkedIds((p) => (p.includes(item.id) ? p : [...p, item.id]));
    setDismissed((p) => [...p, item.id]);
  }, []);

  const scanAll = useCallback(async () => {
    setIsScanning(true);
    await Promise.allSettled([runAIReview(), runProofreadBatch(), runCitationAudit()]);
    setIsScanning(false);
  }, [runAIReview, runProofreadBatch, runCitationAudit]);

  const threeEnginesRan = !!(reviewResult && proofreadFindings.length > 0 && citationAuditResult);
  const total = items.length;
  const critical = items.filter((i) => i.severity === 'critical').length;

  return {
    items, groups, marks, filter, setFilter,
    totalPages, currentPage, goToPage,
    selected, select, nextFinding,
    openEngines, setOpenEngines,
    openSubtypes, setOpenSubtypes,
    acceptOne, acceptMany, markForReview,
    dismiss: (item: AuditItem) => setDismissed((p) => [...p, item.id]),
    markedIds, scanAll, isScanning,
    metrics: { total, critical, compliance: threeEnginesRan ? Math.max(0, 100 - total * 3) : null },
    viewMode, setViewMode,
  };
}
```

- [ ] **Step 4: Corrige la siembra y la interfaz devuelta**

Dos ajustes sobre el bloque de la Step 3.

**La siembra va en `useEffect`, no en `useMemo`.** Un `useMemo` no puede disparar estado. Sustituye
el `useMemo` de siembra por:

```ts
  useEffect(() => {
    if (seeded.current || !groups.length) return;
    seeded.current = true;
    const masCritico = [...groups].sort((a, b) => b.criticalHigh - a.criticalHigh || b.count - a.count)[0];
    if (masCritico) setOpenEngines([masCritico.engine]);
  }, [groups]);
```

y añade `useEffect` al import de React de la primera línea:
`import { useCallback, useEffect, useMemo, useRef, useState } from 'react';`

**La interfaz expone los setters, no funciones de apertura.** En el bloque `Interfaces` de esta tarea,
las dos líneas de apertura quedan así:

```
  - `openEngines: EngineId[]` y `setOpenEngines: React.Dispatch<React.SetStateAction<EngineId[]>>`
  - `openSubtypes: string[]` y `setOpenSubtypes: React.Dispatch<React.SetStateAction<string[]>>`
```

`ReviewWorkbench` (Task 16) alterna sobre esos arrays para abrir y cerrar. No añadas `openEngine` ni
`openSubtype`: quedarían sin usar.

- [ ] **Step 5: Confirma que el test del minimapa ya está bien**

El test del filtro del minimapa del Step 1 es correcto tal cual y no necesita cambio:

```ts
    const motores = new Set([...result.current.marks.values()].map((m) => m.label));
    expect(motores.size).toBeLessThanOrEqual(1);
```

- [ ] **Step 6: Corre el test y verifica que pasa**

Run: `npx vitest run src/__tests__/useReviewWorkbench.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useReviewWorkbench.ts src/__tests__/useReviewWorkbench.test.ts
git commit -m "refactor(review): useReviewWorkbench saca la capa de datos del componente"
```

---

### Task 13: `ReviewStrip`

**Files:**
- Create: `src/components/review/ReviewStrip.tsx`
- Create: `src/__tests__/reviewStrip.test.tsx`

**Interfaces:**
- Consumes: `EngineGroup`, `EngineFilter`, `EngineId` de `useReviewWorkbench.ts` (Task 12).
- Produces:
  - `export interface ReviewStripProps { groups: EngineGroup[]; filter: EngineFilter; onFilter: (f: EngineFilter) => void; totalPages: number; currentPage: number; onPage: (p: number) => void; onNextFinding: () => void; compliance: number | null; viewMode: 'focus' | 'canvas'; onViewMode: (m: 'focus' | 'canvas') => void; hasFindings: boolean; onScan: () => void; isScanning: boolean }`
  - `export function ReviewStrip(props: ReviewStripProps): JSX.Element`

Lo consume `ReviewWorkbench` (Task 16).

- [ ] **Step 1: Escribe el test que falla**

Crea `src/__tests__/reviewStrip.test.tsx`:

```tsx
/**
 * WordAPA7 — T13: la tira de Revision lleva los filtros por motor a la
   izquierda y el paginador a la derecha. Es la unica barra de la vista.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReviewStrip } from '../components/review/ReviewStrip';
import type { EngineGroup } from '../hooks/useReviewWorkbench';

const grupo = (engine: EngineGroup['engine'], count: number): EngineGroup => ({
  engine, title: engine, chip: engine, count, criticalHigh: 0, groups: [],
  massAction: 'accept', massLabel: 'Aceptar todas',
});

const setup = (over: Partial<React.ComponentProps<typeof ReviewStrip>> = {}) => {
  const onFilter = vi.fn();
  const onPage = vi.fn();
  const onNextFinding = vi.fn();
  const onViewMode = vi.fn();
  const utils = render(
    <ReviewStrip
      groups={[grupo('spelling', 48), grupo('ai', 14)]}
      filter="all"
      onFilter={onFilter}
      totalPages={132}
      currentPage={14}
      onPage={onPage}
      onNextFinding={onNextFinding}
      compliance={97}
      viewMode="focus"
      onViewMode={onViewMode}
      hasFindings
      onScan={vi.fn()}
      isScanning={false}
      {...over}
    />,
  );
  return { ...utils, onFilter, onPage, onNextFinding, onViewMode };
};

describe('T13 — ReviewStrip', () => {
  it('lista un chip por motor con su contador, más el chip Todo', () => {
    setup();
    expect(screen.getByRole('button', { name: /Todo/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /spelling/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ai/ })).toBeTruthy();
  });

  it('publica la página actual sobre el total', () => {
    setup();
    expect(screen.getByText(/14/).textContent).toContain('132');
  });

  it('no pagina más allá de los extremos', () => {
    const { onPage } = setup({ currentPage: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(onPage).not.toHaveBeenCalled();
  });

  it('“Siguiente hallazgo” dispara su acción', () => {
    const { onNextFinding } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Siguiente hallazgo/ }));
    expect(onNextFinding).toHaveBeenCalledTimes(1);
  });

  it('el toggle de vista ofrece Foco y Hoja, y refleja la activa', () => {
    const { onViewMode } = setup();
    const hoja = screen.getByRole('button', { name: 'Hoja' });
    expect(hoja.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(hoja);
    expect(onViewMode).toHaveBeenCalledWith('canvas');
  });

  it('sin cumplimiento medido, no inventa un porcentaje', () => {
    setup({ compliance: null });
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('sin resultados, ofrece Escanear', () => {
    const onScan = vi.fn();
    setup({ hasFindings: false, groups: [], onScan });
    fireEvent.click(screen.getByRole('button', { name: 'Escanear' }));
    expect(onScan).toHaveBeenCalled();
  });
});
```

Si los chips quedan etiquetados con el `title` legible y no con la clave del motor, ajusta las
expresiones regulares a esos títulos: `/Ortografía/`, `/Patrones IA/`. Los valores de `engine` en el
test son solo para construir el `EngineGroup`.

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `npx vitest run src/__tests__/reviewStrip.test.tsx`
Expected: FAIL — no se puede resolver `../components/review/ReviewStrip`.

- [ ] **Step 3: Crea `ReviewStrip.tsx`**

```tsx
/* WordAPA7 — review: tira superior.
   Izquierda, los filtros por motor con su contador. Derecha, el paginador,
   "Siguiente hallazgo" y el salto entre la tarjeta de lectura y la hoja
   completa. Es la unica barra de la vista. */

import React from 'react';
import { ChevronLeft, ChevronRight, ArrowRight, ScanLine, LayoutList, FileText } from 'lucide-react';
import type { EngineGroup, EngineFilter } from '../../hooks/useReviewWorkbench';

export interface ReviewStripProps {
  groups: EngineGroup[];
  filter: EngineFilter;
  onFilter: (f: EngineFilter) => void;
  totalPages: number;
  currentPage: number;
  onPage: (p: number) => void;
  onNextFinding: () => void;
  compliance: number | null;
  viewMode: 'focus' | 'canvas';
  onViewMode: (m: 'focus' | 'canvas') => void;
  hasFindings: boolean;
  onScan: () => void;
  isScanning: boolean;
}

const chipStyle = (active: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid transparent',
  background: active ? 'var(--color-accent-soft)' : 'transparent',
  color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
  fontFamily: 'inherit',
  fontSize: 'var(--text-xs)',
  fontWeight: active ? 600 : 500,
  cursor: 'pointer',
});

export function ReviewStrip(p: ReviewStripProps) {
  const total = p.groups.reduce((n, g) => n + g.count, 0);

  return (
    <div
      style={{
        height: 44,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        backgroundColor: 'var(--color-bg-surface)',
        borderBottom: '1px solid var(--color-border-subtle)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
        {!p.hasFindings && (
          <button type="button" onClick={p.onScan} disabled={p.isScanning} style={{ ...chipStyle(false), opacity: p.isScanning ? 0.6 : 1 }}>
            <ScanLine size={13} strokeWidth={1.75} aria-hidden />
            {p.isScanning ? 'Escaneando' : 'Escanear'}
          </button>
        )}
        <button type="button" onClick={() => p.onFilter('all')} style={chipStyle(p.filter === 'all')}>
          <span>Todo</span>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, opacity: 0.85 }}>{total}</span>
        </button>
        {p.groups.map((g) => (
          <button key={g.engine} type="button" onClick={() => p.onFilter(g.engine)} style={chipStyle(p.filter === g.engine)}>
            <span>{g.title}</span>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, opacity: 0.85 }}>{g.count}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {p.compliance !== null && (
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 'var(--radius-full)',
              border: '1px solid var(--color-border-subtle)',
              fontSize: 'var(--text-xs)', fontWeight: 600,
              color: 'var(--color-text-secondary)',
            }}
          >
            Cumplimiento {p.compliance}%
          </span>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            aria-label="Página anterior"
            disabled={p.currentPage <= 1}
            onClick={() => p.onPage(p.currentPage - 1)}
            style={{ ...chipStyle(false), padding: '4px 6px', opacity: p.currentPage <= 1 ? 0.4 : 1 }}
          >
            <ChevronLeft size={13} strokeWidth={1.75} aria-hidden />
          </button>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
            Página {p.currentPage} de {p.totalPages}
          </span>
          <button
            type="button"
            aria-label="Página siguiente"
            disabled={p.currentPage >= p.totalPages}
            onClick={() => p.onPage(p.currentPage + 1)}
            style={{ ...chipStyle(false), padding: '4px 6px', opacity: p.currentPage >= p.totalPages ? 0.4 : 1 }}
          >
            <ChevronRight size={13} strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        <button type="button" onClick={p.onNextFinding} style={{ ...chipStyle(false), background: 'var(--color-accent)', color: 'var(--color-text-on-accent)', fontWeight: 600 }}>
          <span>Siguiente hallazgo</span>
          <ArrowRight size={12} strokeWidth={1.75} aria-hidden />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: 2, borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-surface-alt)' }}>
          {([['focus', 'Foco', LayoutList], ['canvas', 'Hoja', FileText]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              aria-pressed={p.viewMode === id}
              onClick={() => p.onViewMode(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', border: 'none',
                borderRadius: 'var(--radius-sm)',
                background: p.viewMode === id ? 'var(--color-bg-surface)' : 'transparent',
                color: p.viewMode === id ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                fontFamily: 'inherit', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer',
              }}
            >
              <Icon size={12} strokeWidth={1.75} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Corre el test y verifica que pasa**

Run: `npx vitest run src/__tests__/reviewStrip.test.tsx`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/review/ReviewStrip.tsx src/__tests__/reviewStrip.test.tsx
git commit -m "feat(review): tira de Revision con chips por motor y paginador"
```

---

### Task 14: `FocusReadingCard`

**Files:**
- Create: `src/components/review/FocusReadingCard.tsx`
- Create: `src/__tests__/focusReadingCard.test.tsx`

**Interfaces:**
- Consumes: `useAutoFitText` (Task 11), `ReadingText` y `MarkSource` (Task 9), `AuditItem` (Task 12), `useDocStore` (`reviewResult`, `proofreadFindings`, `commentCtx` vía `buildCommentContext`).
- Produces:
  - `export interface FocusReadingCardProps { item: AuditItem | null; totalFindings: number }`
  - `export function FocusReadingCard(props: FocusReadingCardProps): JSX.Element`

Lo consume `ReviewWorkbench` (Task 16).

- [ ] **Step 1: Escribe el test que falla**

Crea `src/__tests__/focusReadingCard.test.tsx`:

```tsx
/**
 * WordAPA7 — T14: la tarjeta de lectura es el centro de la vista de
   Revision. Un parrafo, su seccion, su pagina y los resaltados.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { FocusReadingCard } from '../components/review/FocusReadingCard';
import type { AuditItem } from '../hooks/useReviewWorkbench';

/* TEXTO va sin acentos a propósito: es el defecto que la tarjeta tiene que
   dejar ver, no un error del test. */
const TEXTO = 'El disenio no fue tan crivido como se esperaba.';
const item = (over: Partial<AuditItem> = {}): AuditItem => ({
  id: 'h1', element_id: 'e1', category: 'spelling', subtype: 'ortografia',
  severity: 'medium', summary: 'Ortografía', detail: 'Falta tilde',
  originalText: TEXTO,
  pageNumber: 14, ...over,
});

const setup = (props: Partial<React.ComponentProps<typeof FocusReadingCard>> = {}) => {
  useDocStore.setState({ reviewResult: null, proofreadFindings: [], validationIssues: [] } as never);
  return render(<FocusReadingCard item={item()} totalFindings={3} {...props} />);
};

describe('T14 — FocusReadingCard', () => {
  it('muestra la página del hallazgo en el encabezado', () => {
    setup();
    expect(screen.getByText(/14/)).toBeTruthy();
  });

  it('declara cuántos hallazgos hay en el bloque', () => {
    setup();
    expect(screen.getByText(/3 hallazgos en este bloque/)).toBeTruthy();
  });

  it('sin selección, no monta un párrafo vacío: dice que no hay selección', () => {
    setup({ item: null });
    expect(screen.queryByText(new RegExp(TEXTO.slice(0, 10)))).toBeNull();
    expect(screen.getByText(/Sin hallazgo seleccionado/)).toBeTruthy();
  });

  it('sin número de página real, no inventa ninguno', () => {
    setup({ item: item({ pageNumber: null }) });
    expect(screen.getByText(/Sin página asignada/)).toBeTruthy();
  });

  it('el párrafo conserva su texto íntegro tras el resaltado', () => {
    const { container } = setup();
    expect(container.textContent).toContain(TEXTO);
  });

  it('ninguna cadena de la tarjeta lleva emojis', () => {
    const { container } = setup();
    expect(container.textContent || '').not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `npx vitest run src/__tests__/focusReadingCard.test.tsx`
Expected: FAIL — no se puede resolver `../components/review/FocusReadingCard`.

- [ ] **Step 2: Pasa `contentKey` a `useAutoFitText`**

**Enmendado durante la ejecución.** La Task 11 cambió la firma del hook a
`useAutoFitText(contentKey?)`. Si la tarjeta no le pasa la clave de contenido, el hallazgo 3 de la
revisión de la Task 11 revive intacto: el `ResizeObserver` no dispara al cambiar el texto en una caja de
altura fija, así que el párrafo nuevo hereda el cuerpo del anterior, y ningún test ni el compilador lo
detectan porque el parámetro es opcional.

```tsx
const { containerRef, fontSize, lineHeight } = useAutoFitText(item?.id ?? null);
```

**Y la caja tiene que ser un contenedor de scroll acotado.** `useAutoFitText` decide "cabe sin scroll
interno" comparando `scrollHeight` contra `clientHeight`. Si la tarjeta usa `overflow: hidden` sin tope
de altura, la comparación es vacía de verdad —siempre se cumple—, la búsqueda colapsa a "cabe en 26
líneas" y **todo párrafo de más de 26 líneas se encoge sin necesidad visual**. La spec §5.2 pide
`overflow-y: auto`; eso es lo que hace que la condición signifique algo.

- [ ] **Step 3: Crea `FocusReadingCard.tsx`**

```tsx
/* WordAPA7 — review: la tarjeta de lectura.
   El centro de la vista. Un párrafo, el encabezado de sección y página, y
   los resaltados inline. El cuerpo se auto-ajusta entre 13 y 19px; si
   ningún tamaño cabe, la tarjeta scrollea (piso duro en useAutoFitText). */

import React, { useMemo } from 'react';
import { useDocStore } from '../../store/useDocStore';
import { buildCommentContext } from '../../lib/commentContext';
import { useAutoFitText } from '../../hooks/useAutoFitText';
import { ReadingText, type MarkSource } from './ReadingText';
import type { AuditItem } from '../../hooks/useReviewWorkbench';

export interface FocusReadingCardProps {
  item: AuditItem | null;
  totalFindings: number;
}

export function FocusReadingCard({ item, totalFindings }: FocusReadingCardProps) {
  const reviewResult = useDocStore((s) => s.reviewResult);
  const proofreadFindings = useDocStore((s) => s.proofreadFindings);
  const citationAuditResult = useDocStore((s) => s.citationAuditResult);
  const validationIssues = useDocStore((s) => s.validationIssues);
  const sugerenciasProactivas = useDocStore((s) => s.sugerenciasProactivas);
  const { containerRef, fontSize, lineHeight } = useAutoFitText(item?.id ?? null);

  const source = useMemo<MarkSource>(
    () => ({
      reviewResult,
      proofreadFindings,
      commentCtx: buildCommentContext({ citationAuditResult, validationIssues, sugerenciasProactivas, reviewResult, proofreadFindings }),
      showCitations: true,
    }),
    [reviewResult, proofreadFindings, citationAuditResult, validationIssues, sugerenciasProactivas],
  );

  return (
    <section
      aria-label="Párrafo en revisión"
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 40px',
          marginBottom: 24,
          borderBottom: '1px solid var(--color-border-subtle)',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-tertiary)',
        }}
      >
        <span>{item?.pageNumber ? `Página ${item.pageNumber} de la revisión` : 'Sin página asignada'}</span>
        <span>{totalFindings} {totalFindings === 1 ? 'hallazgo en este bloque' : 'hallazgos en este bloque'}</span>
      </header>

      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          // Contenedor de scroll ACOTADO, no `overflow: hidden` sin tope: el
          // auto-ajuste decide "cabe sin scroll interno" comparando
          // scrollHeight contra clientHeight, y sin altura acotada esa
          // comparación se cumple siempre y el ajuste no significa nada.
          overflowY: 'auto',
          padding: '0 40px 32px',
          fontFamily: 'var(--font-family)',
          fontSize: `${fontSize}px`,
          lineHeight,
          color: 'var(--color-text-primary)',
        }}
      >
        {item ? (
          <ReadingText text={item.originalText} source={source} />
        ) : (
          <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
            Sin hallazgo seleccionado. Elige uno en el panel de la derecha o pulsa “Siguiente hallazgo”.
          </p>
        )}
      </div>
    </section>
  );
}
```

El texto del comentario de cabecera, que salió corrupto al escribir el plan, debe leerse así:

```tsx
/* WordAPA7 — review: la tarjeta de lectura.
   El centro de la vista. Un párrafo, el encabezado de sección y página, y
   los resaltados inline. El cuerpo se auto-ajusta entre 13 y 19px; si
   ningún tamaño cabe, la tarjeta scrollea (piso duro en useAutoFitText). */
```

- [ ] **Step 4: Corrige la firma de `MarkSource`**

`MarkSource` en `ReadingText.tsx` usa `reviewResult` con una forma concreta de párrafo. Si el
`reviewResult` del store no encaja, ajusta el tipo en `ReadingText.tsx` para que acepte
`unknown` y haz el narrow dentro de `collectMarks`, en lugar de forzar el store.

- [ ] **Step 5: Corre el test y verifica que pasa**

Run: `npx vitest run src/__tests__/focusReadingCard.test.tsx`
Expected: PASS — 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/review/FocusReadingCard.tsx src/__tests__/focusReadingCard.test.tsx
git commit -m "feat(review): tarjeta de lectura con parrafo auto-ajustado"
```

---

### Task 15: El rack de hallazgos

**Files:**
- Create: `src/components/review/EngineGroupCard.tsx`
- Create: `src/components/review/SubtypeRow.tsx`
- Create: `src/components/review/FindingDetail.tsx`
- Create: `src/__tests__/findingRack.test.tsx`

**Interfaces:**
- Consumes: `EngineGroup`, `SubtypeGroup`, `AuditItem` (Task 12), `ConfidenceBadge` de `src/components/shared/ConfidenceBadge.tsx`.
- Produces:
  - `export interface EngineGroupCardProps { group: EngineGroup; open: boolean; onToggle: () => void; openSubtypes: string[]; onToggleSubtype: (key: string) => void; onMassAction: (group: EngineGroup) => void; children: React.ReactNode }`
  - `export interface SubtypeRowProps { group: SubtypeGroup; open: boolean; onToggle: () => void; onMassAction: (group: SubtypeGroup) => void; children: React.ReactNode }`
  - `export interface FindingDetailProps { item: AuditItem; index: number; total: number; onStep: (delta: number) => void; onAccept: (item: AuditItem) => void; onMark: (item: AuditItem) => void; onDismiss: (item: AuditItem) => void; busy: boolean }`

Los consume `ReviewWorkbench` (Task 16).

- [ ] **Step 1: Escribe el test que falla**

Crea `src/__tests__/findingRack.test.tsx`:

```tsx
/**
 * WordAPA7 — T15: el rack agrupa por motor y luego por subtipo, con la
   accion en masa pegada a la derecha. Una fila por subtipo, nunca una fila
   por aparicion.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EngineGroupCard, SubtypeRow } from '../components/review/EngineGroupCard';
import { FindingDetail } from '../components/review/FindingDetail';
import type { AuditItem, EngineGroup, SubtypeGroup } from '../hooks/useReviewWorkbench';

const item = (over: Partial<AuditItem> = {}): AuditItem => ({
  id: 'h1', element_id: 'e1', category: 'spelling', subtype: 'ortografia',
  severity: 'medium', summary: 'Ortografía', detail: 'Falta tilde',
  originalText: 'tambien', suggestedText: 'también', pageNumber: 3, ...over,
});

const subgrupo = (over: Partial<SubtypeGroup> = {}): SubtypeGroup => ({
  key: 'spelling:ortografia', label: 'Ortografía',
  items: [item(), item({ id: 'h2', element_id: 'e2', pageNumber: 14 })],
  action: 'accept', massLabel: 'Aceptar todos', ...over,
});

const motor = (over: Partial<EngineGroup> = {}): EngineGroup => ({
  engine: 'spelling', title: 'Ortografía', chip: 'Ortografía', count: 48,
  criticalHigh: 2, groups: [subgrupo()], massAction: 'accept', massLabel: 'Aceptar todas', ...over,
});

describe('T15 — rack de hallazgos', () => {
  it('la cabecera del motor muestra el conteo y la acción en masa', () => {
    const onMassAction = vi.fn();
    render(
      <EngineGroupCard group={motor()} open onToggle={vi.fn()} openSubtypes={[]} onToggleSubtype={vi.fn()} onMassAction={onMassAction}>
        <span>contenido</span>
      </EngineGroupCard>,
    );
    expect(screen.getByRole('button', { name: /Aceptar todas/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Aceptar todas/ }));
    expect(onMassAction).toHaveBeenCalled();
  });

  it('la cabecera es un botón con aria-expanded, no un div con onClick', () => {
    render(
      <EngineGroupCard group={motor()} open={false} onToggle={vi.fn()} openSubtypes={[]} onToggleSubtype={vi.fn()} onMassAction={vi.fn()}>
        <span>c</span>
      </EngineGroupCard>,
    );
    const cabecera = screen.getByRole('button', { name: /Ortografía/ });
    expect(cabecera.getAttribute('aria-expanded')).toBe('false');
  });

  it('la fila de subtipo resume: original, sugerido, veces y páginas', () => {
    render(
      <SubtypeRow group={subgrupo()} open={false} onToggle={vi.fn()} onMassAction={vi.fn()}>
        <span>c</span>
      </SubtypeRow>,
    );
    expect(screen.getByText('tambien')).toBeTruthy();
    expect(screen.getByText('también')).toBeTruthy();
    expect(screen.getByText(/×2/)).toBeTruthy();
    expect(screen.getByText(/pág\./)).toBeTruthy();
  });

  it('un hallazgo de IA se marca, nunca se acepta', () => {
    const onAccept = vi.fn();
    const onMark = vi.fn();
    render(
      <FindingDetail
        item={item({ category: 'ai', subtype: 'muletilla', suggestedText: 'sin lugar a dudas' })}
        index={0} total={3} onStep={vi.fn()}
        onAccept={onAccept} onMark={onMark} onDismiss={vi.fn()} busy={false}
      />,
    );
    expect(screen.queryByRole('button', { name: /Aplicar corrección/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Marcar para revisar/i })).toBeTruthy();
  });

  it('un hallazgo objetivo sí se acepta, y navegar cambia de ocurrencia', () => {
    const onStep = vi.fn();
    render(
      <FindingDetail
        item={item()} index={0} total={3} onStep={onStep}
        onAccept={vi.fn()} onMark={vi.fn()} onDismiss={vi.fn()} busy={false}
      />,
    );
    expect(screen.getByRole('button', { name: /Aplicar corrección/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente aparición' }));
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it('el detalle explica que el motor es probabilístico en el caso de IA', () => {
    render(
      <FindingDetail
        item={item({ category: 'ai', subtype: 'muletilla' })} index={0} total={1}
        onStep={vi.fn()} onAccept={vi.fn()} onMark={vi.fn()} onDismiss={vi.fn()} busy={false}
      />,
    );
    expect(screen.getByText(/probabilístico/)).toBeTruthy();
  });

  it('ninguna cadena del rack lleva emojis (Review Focus #5)', () => {
    const { container } = render(
      <SubtypeRow group={subgrupo()} open onToggle={vi.fn()} onMassAction={vi.fn()}>
        <span>c</span>
      </SubtypeRow>,
    );
    expect(container.textContent || '').not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `npx vitest run src/__tests__/findingRack.test.tsx`
Expected: FAIL — no se puede resolver `../components/review/EngineGroupCard`.

- [ ] **Step 3: Crea `EngineGroupCard.tsx`**

```tsx
/* WordAPA7 — review: tarjeta de motor.
   Cabecera con el nombre, el conteo y la acción en masa pegada a la
   derecha. Solo el grupo mas critico arranca abierto, y esa decision la
   toma useReviewWorkbench, no este componente. */

import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { EngineGroup, SubtypeGroup } from '../../hooks/useReviewWorkbench';

export interface EngineGroupCardProps {
  group: EngineGroup;
  open: boolean;
  onToggle: () => void;
  openSubtypes: string[];
  onToggleSubtype: (key: string) => void;
  onMassAction: (group: EngineGroup) => void;
  children: React.ReactNode;
}

export function EngineGroupCard({ group, open, onToggle, onMassAction, children }: EngineGroupCardProps) {
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <section
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '10px 14px',
          backgroundColor: 'var(--color-bg-surface-alt)',
          borderBottom: open ? '1px solid var(--color-border-subtle)' : 'none',
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`engine-${group.engine}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0,
            background: 'transparent', border: 'none', padding: 0,
            font: 'inherit', fontSize: 'var(--text-xs)', fontWeight: 600,
            color: 'var(--color-text-primary)', cursor: 'pointer', textAlign: 'left',
          }}
        >
          <Chevron size={13} strokeWidth={1.75} aria-hidden style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {group.title} ({group.count})
          </span>
        </button>
        <button
          type="button"
          onClick={() => onMassAction(group)}
          style={{
            flexShrink: 0, padding: '4px 10px',
            border: group.massAction === 'mark' ? '1px solid var(--color-border-subtle)' : 'none',
            borderRadius: 'var(--radius-sm)',
            background: group.massAction === 'mark' ? 'transparent' : 'var(--color-accent)',
            color: group.massAction === 'mark' ? 'var(--color-text-secondary)' : 'var(--color-text-on-accent)',
            font: 'inherit', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer',
          }}
        >
          {group.massLabel}
        </button>
      </div>
      {open && <div id={`engine-${group.engine}`}>{children}</div>}
    </section>
  );
}

export interface SubtypeRowProps {
  group: SubtypeGroup;
  open: boolean;
  onToggle: () => void;
  onMassAction: (group: SubtypeGroup) => void;
  children: React.ReactNode;
}

const SEVERITY_COLOR: Record<AuditItem['severity'], string> = {
  critical: 'var(--color-danger)',
  high: 'var(--color-warning)',
  medium: 'var(--color-info)',
  low: 'var(--color-text-tertiary)',
};

export function SubtypeRow({ group, open, onToggle, onMassAction, children }: SubtypeRowProps) {
  const primero = group.items[0];
  const Chevron = open ? ChevronDown : ChevronRight;
  const paginas = [...new Set(group.items.map((i) => i.pageNumber).filter((p): p is number => p != null))];
  return (
    <div style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, padding: '10px 14px',
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`subtype-${group.key}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0,
            background: 'transparent', border: 'none', padding: 0,
            font: 'inherit', cursor: 'pointer', textAlign: 'left', minWidth: 0,
          }}
        >
          <Chevron size={12} strokeWidth={1.75} aria-hidden style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
          <span
            style={{
              flexShrink: 0, minWidth: 20, height: 18, padding: '0 5px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--color-bg-surface-alt)',
              color: SEVERITY_COLOR[primero?.severity || 'low'],
              fontSize: 'var(--text-xs)', fontWeight: 700,
            }}
          >
            ×{group.items.length}
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', flexShrink: 0 }}>{group.label}</span>
          {primero?.originalText && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 'var(--text-xs)' }}>
              <span style={{ textDecoration: 'line-through', color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {primero.originalText}
              </span>
              {primero.suggestedText && <span style={{ color: 'var(--color-accent)', fontWeight: 600, flexShrink: 0 }}>→ {primero.suggestedText}</span>}
            </span>
          )}
          {paginas.length > 0 && (
            <span style={{ flexShrink: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              pág. {paginas.slice(0, 3).join(', ')}{paginas.length > 3 ? '…' : ''}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onMassAction(group)}
          style={{
            flexShrink: 0, padding: '3px 8px',
            border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)',
            background: 'transparent', color: 'var(--color-text-primary)',
            font: 'inherit', fontSize: 'var(--text-xs)', fontWeight: 500, cursor: 'pointer',
          }}
        >
          {group.massLabel}
        </button>
      </div>
      {open && <div id={`subtype-${group.key}`}>{children}</div>}
    </div>
  );
}
```

Añade el import de `AuditItem`, que se usa en `SEVERITY_COLOR`:

```tsx
import type { AuditItem, EngineGroup, SubtypeGroup } from '../../hooks/useReviewWorkbench';
```

- [ ] **Step 4: Crea `FindingDetail.tsx`**

```tsx
/* WordAPA7 — review: detalle de una aparicion.
   Aqui se ve el texto original, la propuesta y la accion. El detector de
   IA no tiene "Aplicar correccion": es probabilistico, y la unica accion
   honesta es marcarlo para que lo mire una persona. */

import React from 'react';
import { ChevronLeft, ChevronRight, Check, Flag, X } from 'lucide-react';
import type { AuditItem } from '../../hooks/useReviewWorkbench';

export interface FindingDetailProps {
  item: AuditItem;
  index: number;
  total: number;
  onStep: (delta: number) => void;
  onAccept: (item: AuditItem) => void;
  onMark: (item: AuditItem) => void;
  onDismiss: (item: AuditItem) => void;
  busy: boolean;
}

const accion = (
  label: string, Icon: typeof Check, onClick: () => void, disabled: boolean, primary: boolean,
) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 10px',
      border: primary ? 'none' : '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-sm)',
      background: primary ? 'var(--color-accent)' : 'transparent',
      color: primary ? 'var(--color-text-on-accent)' : 'var(--color-text-primary)',
      font: 'inherit', fontSize: 'var(--text-xs)', fontWeight: 600,
      cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
    }}
  >
    <Icon size={12} strokeWidth={1.75} aria-hidden />
    {label}
  </button>
);

export function FindingDetail({ item, index, total, onStep, onAccept, onMark, onDismiss, busy }: FindingDetailProps) {
  const esIA = item.category === 'ai';
  return (
    <div style={{ padding: '12px 14px', borderTop: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {item.pageNumber ? (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Pág. {item.pageNumber}</span>
        ) : (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Sin página asignada</span>
        )}
        {total > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button type="button" aria-label="Aparición anterior" onClick={() => onStep(-1)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-tertiary)' }}>
              <ChevronLeft size={13} strokeWidth={1.75} aria-hidden />
            </button>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{index + 1} de {total}</span>
            <button type="button" aria-label="Siguiente aparición" onClick={() => onStep(1)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-tertiary)' }}>
              <ChevronRight size={13} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        )}
      </div>

      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: 0 }}>{item.detail}</p>

      <pre style={{ margin: 0, padding: '8px 10px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--severity-critical-tint)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {item.originalText}
      </pre>

      {item.suggestedText && (
        <>
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-tertiary)' }}>
            {esIA ? 'Revisión manual (motor probabilístico)' : 'Sugerencia académica APA 7'}
          </p>
          <pre style={{ margin: 0, padding: '8px 10px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--severity-success-tint)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {item.suggestedText}
          </pre>
        </>
      )}

      {esIA && (
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
          Este motor es probabilístico: propone, no decide. Revísalo tú antes de aplicarlo.
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {esIA
          ? accion('Marcar para revisar', Flag, () => onMark(item), busy, true)
          : item.suggestedText
            ? accion('Aplicar corrección', Check, () => onAccept(item), busy, true)
            : null}
        {accion('Descartar', X, () => onDismiss(item), busy, false)}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Corre el test y verifica que pasa**

Run: `npx vitest run src/__tests__/findingRack.test.tsx`
Expected: PASS — 7 tests.

- [ ] **Step 7: Commit**

```bash
git add src/components/review/EngineGroupCard.tsx src/components/review/SubtypeRow.tsx src/components/review/FindingDetail.tsx src/__tests__/findingRack.test.tsx
git commit -m "feat(review): rack de hallazgos agrupado por motor y subtipo"
```

---

### Task 16: `ReviewWorkbench` y el envoltorio de `Step5AuditIAWizard`

**Files:**
- Create: `src/components/review/ReviewWorkbench.tsx`
- Modify: `src/components/wizard/Step5AuditIAWizard.tsx` (contenido completo → 5 líneas)
- Create: `src/__tests__/reviewWorkbench.test.tsx`

**Interfaces:**
- Consumes: `useReviewWorkbench` (Task 12), `ReviewStrip` (Task 13), `FocusReadingCard` (Task 14), `EngineGroupCard`/`SubtypeRow` (Task 15), `FindingDetail` (Task 15), `ReviewMinimap` de `src/components/wizard/ReviewMinimap.tsx`, `PaperCanvas` de `src/components/layout/PaperCanvas.tsx`.
- Produces: `export function ReviewWorkbench(): JSX.Element`

- [ ] **Step 1: Escribe el test que falla**

Crea `src/__tests__/reviewWorkbench.test.tsx`:

```tsx
/**
 * WordAPA7 — T16: el workbench de Revision monta sus tres columnas y
   degrada con elegancia cuando la ventana es estrecha.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { ReviewWorkbench } from '../components/review/ReviewWorkbench';

vi.mock('../components/layout/PaperCanvas', () => ({ PaperCanvas: () => <div data-testid="canvas" /> }));
vi.mock('../components/wizard/ReviewMinimap', () => ({ ReviewMinimap: () => <div data-testid="minimap" /> }));

const doc = { elements: [
  { id: 'e1', type: 'paragraph', text: 'tambien' },
  { id: 'e2', type: 'paragraph', text: 'otro' },
] } as never;

const hallazgo = {
  element_id: 'e1', start: 0, end: 6, excerpt: 'tambien', kind: 'ortografia',
  severity: 'error', message: 'Falta tilde', suggestion: 'también', source: 'local',
} as never;

describe('T16 — ReviewWorkbench', () => {
  beforeEach(() => {
    useDocStore.setState({ doc, reviewResult: null, proofreadFindings: [hallazgo], citationAuditResult: null, aiIndices: null });
  });

  it('monta minimapa, lectura y rack', () => {
    render(<ReviewWorkbench />);
    expect(screen.getByTestId('minimap')).toBeTruthy();
    expect(screen.getByLabelText('Párrafo en revisión')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ortografía/ })).toBeTruthy();
  });

  it('arranca en la tarjeta de lectura, no en la hoja', () => {
    render(<ReviewWorkbench />);
    expect(screen.getByLabelText('Párrafo en revisión')).toBeTruthy();
    expect(screen.queryByTestId('canvas')).toBeNull();
  });

  it('la tira de arriba es la única barra de la vista', () => {
    // La tarjeta de lectura también usa <header> para su encabezado de sección,
    // así que la aserción se acota a los hermanos directos del workbench.
    const { container } = render(<ReviewWorkbench />);
    const raiz = container.querySelector('div')!;
    const barras = [...raiz.children].filter((c) => c.tagName === 'HEADER');
    expect(barras).toHaveLength(0);
    expect(raiz.children[0].getAttribute('style')).toContain('height: 44px');
  });

  it('sin hallazgos, ofrece Escanear en vez de una lista vacía', () => {
    useDocStore.setState({ proofreadFindings: [] });
    render(<ReviewWorkbench />);
    expect(screen.getByRole('button', { name: 'Escanear' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `npx vitest run src/__tests__/reviewWorkbench.test.tsx`
Expected: FAIL — no se puede resolver `../components/review/ReviewWorkbench`.

- [ ] **Step 3: Crea `ReviewWorkbench.tsx`**

```tsx
/* WordAPA7 — review: el workbench.
   Tres columnas: minimapa, tarjeta de lectura, rack de hallazgos. La tira
   de arriba es la unica barra. El grid colapsa el rack en ventana estrecha
   para que el centro siga siendo legible. */

import React, { useEffect, useState } from 'react';
import { useReviewWorkbench } from '../../hooks/useReviewWorkbench';
import { ReviewMinimap } from '../wizard/ReviewMinimap';
import { PaperCanvas } from '../layout/PaperCanvas';
import { ReviewStrip } from './ReviewStrip';
import { FocusReadingCard } from './FocusReadingCard';
import { EngineGroupCard, SubtypeRow } from './EngineGroupCard';
import { FindingDetail } from './FindingDetail';
import { useDocStore } from '../../store/useDocStore';

/** Por debajo de este ancho, el rack de 400px deja el centro inservible. */
const RACK_BREAKPOINT = 1180;

export function ReviewWorkbench() {
  const wb = useReviewWorkbench();
  const doc = useDocStore((s) => s.doc);
  const [rackOpen, setRackOpen] = useState(true);
  const [ancho, setAncho] = useState(() => (typeof window === 'undefined' ? 1440 : window.innerWidth));

  useEffect(() => {
    const onResize = () => setAncho(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const rackVisible = rackOpen && ancho >= RACK_BREAKPOINT;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, backgroundColor: 'var(--color-bg-canvas)' }}>
      <ReviewStrip
        groups={wb.groups}
        filter={wb.filter}
        onFilter={wb.setFilter}
        totalPages={wb.totalPages}
        currentPage={wb.currentPage}
        onPage={wb.goToPage}
        onNextFinding={wb.nextFinding}
        compliance={wb.metrics.compliance}
        viewMode={wb.viewMode}
        onViewMode={wb.setViewMode}
        hasFindings={wb.items.length > 0}
        onScan={wb.scanAll}
        isScanning={wb.isScanning}
      />

      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: rackVisible ? '19px minmax(0, 1fr) 400px' : '19px minmax(0, 1fr)',
          gap: 20,
          padding: '20px 24px',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        <ReviewMinimap
          totalPages={wb.totalPages}
          marks={wb.marks}
          currentPage={wb.currentPage}
          onPageClick={wb.goToPage}
        />

        {wb.viewMode === 'canvas' ? (
          <div style={{ minWidth: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            <PaperCanvas />
          </div>
        ) : (
          <FocusReadingCard item={wb.selected} totalFindings={wb.selected ? wb.items.filter((i) => i.element_id === wb.selected!.element_id).length : 0} />
        )}

        {rackVisible && (
          <aside
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              minWidth: 0,
              overflowY: 'auto',
            }}
          >
            {wb.groups.map((group) => (
              <EngineGroupCard
                key={group.engine}
                group={group}
                open={wb.openEngines.includes(group.engine)}
                onToggle={() => wb.setOpenEngines((p) => (p.includes(group.engine) ? p.filter((e) => e !== group.engine) : [...p, group.engine]))}
                openSubtypes={wb.openSubtypes}
                onToggleSubtype={(key) => wb.setOpenSubtypes((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]))}
                onMassAction={(g) => {
                  if (g.massAction === 'mark') g.groups.forEach((s) => s.items.forEach((i) => wb.markForReview(i)));
                  else void wb.acceptMany(g.groups.flatMap((s) => s.items));
                }}
              >
                {group.groups.map((sub) => (
                  <SubtypeRow
                    key={sub.key}
                    group={sub}
                    open={wb.openSubtypes.includes(sub.key)}
                    onToggle={() => wb.setOpenSubtypes((p) => (p.includes(sub.key) ? p.filter((k) => k !== sub.key) : [...p, sub.key]))}
                    onMassAction={() => {
                      if (sub.action === 'mark') sub.items.forEach((i) => wb.markForReview(i));
                      else void wb.acceptMany(sub.items);
                    }}
                  >
                    {sub.items.map((it, i) => (
                      <FindingDetail
                        key={it.id}
                        item={it}
                        index={i}
                        total={sub.items.length}
                        onStep={() => wb.select(sub.items[(i + 1) % sub.items.length].id)}
                        onAccept={wb.acceptOne}
                        onMark={wb.markForReview}
                        onDismiss={wb.dismiss}
                        busy={false}
                      />
                    ))}
                  </SubtypeRow>
                ))}
              </EngineGroupCard>
            ))}
            {wb.groups.length === 0 && (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
                {doc ? 'Sin observaciones en este módulo. Cumplimiento verificado.' : 'Carga un documento para empezar.'}
              </p>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3b: Una sola construcción del origen de marcas, y la bandera de citas compartida**

**Añadido durante la ejecución.** La revisión de la Task 14 encontró dos copias divergentes de la misma
decisión de canal:

1. `FocusReadingCard.tsx:52` pasa `showCitations: true` como constante, mientras
   `PaperCanvas.tsx:825` pasa `showCitations: showCitationMarks` (estado local, por defecto `true`,
   `:538`). Apaga las marcas de cita en el lienzo y la tarjeta de lectura las sigue subrayando: un
   defecto, dos canales, dos verdades — lo que `AGENTS.md` §2 prohíbe.
2. `buildCommentContext(...)` se construye en dos sitios (`PaperCanvas.tsx:805-816` y
   `FocusReadingCard.tsx:51`), con seis campos que hay que mantener sincronizados a mano.

Extrae un único `buildMarkSource({ elem, showCitations })` — en el sitio que ya posee esa decisión — y
 úsalo en los dos canales. La bandera de citas sube al store o viaja como prop de `PaperCanvas`; lo que
 no vale es que la tarjeta la fije sola. Añade un test que falle si los dos canales divergen.

- [ ] **Step 4: Reduce `Step5AuditIAWizard` a un envoltorio**

Reemplaza el contenido completo de `src/components/wizard/Step5AuditIAWizard.tsx` por:

```tsx
/* WordAPA7 — review: punto de entrada del paso 5.
   La implementación vive en src/components/review/. Este archivo sobrevive
   para no cambiar el import desde App.tsx ni los tests que lo referencian. */

import React from 'react';
import { ReviewWorkbench } from '../review/ReviewWorkbench';

export function Step5AuditIAWizard() {
  return <ReviewWorkbench />;
}

export default Step5AuditIAWizard;
```

- [ ] **Step 5: Corre el test y verifica que pasa**

Run: `npx vitest run src/__tests__/reviewWorkbench.test.tsx`
Expected: PASS — 4 tests.

- [ ] **Step 6: Corre el test de viewport y añade el de ventana estrecha**

Añade a `src/__tests__/reviewWorkbench.test.tsx`:

```tsx
  it('en ventana estrecha el rack se retira y el centro conserva ancho', () => {
    const original = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true, writable: true });
    render(<ReviewWorkbench />);
    expect(screen.queryByRole('button', { name: /Ortografía/ })).toBeNull();
    expect(screen.getByLabelText('Párrafo en revisión')).toBeTruthy();
    Object.defineProperty(window, 'innerWidth', { value: original, configurable: true, writable: true });
  });
```

Y añade `beforeEach` al `describe`, que en el Step 1 se emitió sin él:

```tsx
import { beforeEach, describe, it, expect, vi } from 'vitest';
```

- [ ] **Step 7: Borra el mapa heurístico de páginas que quedó huérfano**

`elementPageMap` y la constante de 1800 caracteres vivían en el archivo viejo. Confirma que ya no
existen en el repo:

```bash
Select-String -Path src -Pattern 'elementPageMap|1800'
```

Expected: sin resultados, o solo la constante en un archivo que no se importa. Si aparece en otro
lado, déjalo anotado en la Task 20.

- [ ] **Step 8: Corre la suite entera**

Run: `npm test`
Expected: PASS. Los candidatos a romperse son `reviewHighlight.test.tsx` y
`reviewMinimapKeyboard.test.tsx`, que se apoyan en el comportamiento viejo del paso 5.

- [ ] **Step 9: Commit**

```bash
git add src/components/review/ReviewWorkbench.tsx src/components/wizard/Step5AuditIAWizard.tsx src/__tests__/reviewWorkbench.test.tsx
git commit -m "refactor(review): ReviewWorkbench componible; el paso 5 baja a un envoltorio"
```

---

### Task 17: `ExportView` con el shell nuevo y "Convertir otro"

**Files:**
- Modify: `src/components/export/ExportView.tsx:141-150` (el `useEffect` de `Ctrl+S`), `62-103` (código muerto), `184-293` (la columna izquierda), `233-293` (los botones)
- Test: `src/__tests__/exportViewLayout.test.tsx`

**Interfaces:**
- Consumes: `useDocStore` (`doc`, `exportDocx`, `exportPdf`, `exportLatex`, `goHome`, `clearQuickExport`, `zoomLevel`, `setZoomLevel`).
- Produces: sin API nueva. Solo el cambio visual y el botón fantasma.

- [ ] **Step 1: Escribe el test que falla**

Crea `src/__tests__/exportViewLayout.test.tsx`:

```tsx
/**
 * WordAPA7 — T17: la pantalla final de exportacion es una sola columna a la
   izquierda, en orden fijo: icono, titulo, una linea, dos botones. Nada de
   listas, tarjetas, columnas ni scroll.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useDocStore } from '../store/useDocStore';
import { ExportView } from '../components/export/ExportView';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(),
  syncAllProviderKeys: vi.fn().mockResolvedValue({ ok: true, applied: [] }),
}));

const SRC = readFileSync(resolve(__dirname, '../components/export/ExportView.tsx'), 'utf8');

describe('T17 — ExportView', () => {
  beforeEach(() => {
    useDocStore.setState({ doc: { file_name: 'Tesis.docx' } as never, isLoading: false });
  });

  it('mantiene el orden icono, titulo, linea y botones', () => {
    render(<ExportView />);
    expect(screen.getByText('Documento listo')).toBeTruthy();
    const botones = screen.getAllByRole('button').map((b) => (b.textContent || '').trim());
    expect(botones.some((t) => /Descargar/.test(t))).toBe(true);
    expect(botones.some((t) => /Convertir otro/.test(t))).toBe(true);
  });

  it('la línea descriptiva no pasa de 50 caracteres por línea', () => {
    render(<ExportView />);
    const linea = screen.getByText(/Tu trabajo cumple con el formato APA 7/);
    expect(linea.textContent!.length).toBeLessThanOrEqual(120);
  });

  it('“Convertir otro” devuelve al inicio limpio', () => {
    const goHome = vi.fn();
    useDocStore.setState({ goHome } as never);
    render(<ExportView />);
    screen.getByRole('button', { name: /Convertir otro/ }).click();
    expect(goHome).toHaveBeenCalled();
  });

  it('no repite hallazgos ni estadísticas en la vista final', () => {
    expect(SRC).not.toMatch(/hallazgos? en total|observaciones? totales|estadísticas/i);
  });

  it('no tiene iconos muertos ni resúmenes huérfanos', () => {
    expect(SRC).not.toMatch(/ICON_PALETTES|summaryItemStyle/);
  });

  it('no trae hex literales fuera del design system', () => {
    expect(SRC).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `npx vitest run src/__tests__/exportViewLayout.test.tsx`
Expected: FAIL en el test de "Convertir otro" (el botón no existe) y en el de código muerto.

- [ ] **Step 3: Ajusta el encabezado y los botones**

En `src/components/export/ExportView.tsx`, reemplaza el bloque de las líneas 204-293 por:

```tsx
      <CheckCircle2 size={22} strokeWidth={1.75} aria-hidden style={{ color: 'var(--color-success)' }} />

      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)' }}>
        Documento listo
      </h1>

      <p style={{ margin: 0, maxWidth: '50ch', fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
        Tu trabajo cumple con el formato APA 7. Puedes descargarlo o convertir otro archivo.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <button
          type="button"
          onClick={handleDownloadClick}
          disabled={isLoading}
          style={{
            padding: '10px 18px', border: 'none', borderRadius: 'var(--radius-md)',
            background: 'var(--color-accent)', color: 'var(--color-text-on-accent)',
            fontFamily: 'inherit', fontSize: 'var(--text-base)', fontWeight: 600, cursor: 'pointer',
          }}
        >
          {isLoading ? loadingPhase : 'Descargar documento'}
        </button>
        <button
          type="button"
          onClick={() => goHome()}
          style={{
            padding: '10px 16px', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)',
            background: 'transparent', color: 'var(--color-text-secondary)',
            fontFamily: 'inherit', fontSize: 'var(--text-base)', fontWeight: 500, cursor: 'pointer',
          }}
        >
          Convertir otro
        </button>
      </div>
```

- [ ] **Step 4: Toma `goHome` del store**

En el bloque de selectores del principio del componente (líneas 106-112), añade `goHome`:

```tsx
  const goHome = useDocStore((s) => s.goHome);
```

- [ ] **Step 5: Corrige el `useEffect` de `Ctrl+S`**

En `src/components/export/ExportView.tsx:141-150`, el efecto se re-registra en cada render. Cierra
el array de dependencias con lo que realmente usa:

```tsx
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleDownloadClick();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleDownloadClick]);
```

Para que eso no dispare el aviso de `react-hooks/exhaustive-deps`, envuelve `handleDownloadClick` con
`useCallback` y dale las dependencias que ya usa: `ghostCount`, `friction`, `doExport`.

- [ ] **Step 6: Borra el código muerto**

Borra de `src/components/export/ExportView.tsx` las declaraciones `ICON_PALETTES` (líneas 62-68) y
`summaryItemStyle`, con sus usos. Confirma:

```bash
Select-String -Path src -Pattern 'ICON_PALETTES|summaryItemStyle'
```

Expected: sin resultados fuera de los borrados.

- [ ] **Step 7: Alinea la columna con el shell**

El `<aside>` de las líneas 184-575 lleva `padding: '56px 44px'`. Cámbialo a `padding: '60px 48px'`
para que coincida con el resto del shell, y deja su `maxWidth` en 440.

- [ ] **Step 8: Corrige los tests**

Run: `npx vitest run src/__tests__/exportViewLayout.test.tsx src/__tests__/downloadSuccessOverlayFocus.test.tsx`
Expected: PASS. El segundo no debe cambiar: `DownloadSuccessOverlay` no se tocó.

- [ ] **Step 9: Commit**

```bash
git add src/components/export/ExportView.tsx src/__tests__/exportViewLayout.test.tsx
git commit -m "feat(export): columna unica a la izquierda, boton Convertir otro, sin codigo muerto"
```

---

### Task 18: `CoverCarouselStudio` con el chrome del workbench

**Files:**
- Modify: `src/components/wizard/CoverCarouselStudio.tsx` (el `return` raíz y el layout de tres zonas)
- Test: `src/__tests__/coverStudioChrome.test.tsx`

**Interfaces:**
- Consumes: `CoverStrategyCard`, `CoverEditorPanel`, `useDocStore`. Sin API nueva.

- [ ] **Step 1: Escribe el test que falla**

Crea `src/__tests__/coverStudioChrome.test.tsx`:

```tsx
/**
 * WordAPA7 — T18: la portada entra al mismo workbench: tira de estrategias
   arriba, carrusel al centro, editor a la derecha.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { CoverCarouselStudio } from '../components/wizard/CoverCarouselStudio';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(),
  syncAllProviderKeys: vi.fn().mockResolvedValue({ ok: true, applied: [] }),
}));

describe('T18 — CoverCarouselStudio', () => {
  it('el editor de portada vive a la derecha, en 320px', () => {
    useDocStore.setState({ doc: { elements: [], referencias: [] } as never });
    const { container } = render(<CoverCarouselStudio />);
    const panel = container.querySelector('[data-testid="cover-editor"]');
    expect(panel).toBeTruthy();
    expect((panel as HTMLElement).style.width).toBe('320px');
  });

  it('el carrusel queda en el centro y no se parte de la maqueta de Word', () => {
    useDocStore.setState({ doc: { elements: [], referencias: [] } as never });
    render(<CoverCarouselStudio />);
    expect(screen.getByTestId('cover-carousel')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `npx vitest run src/__tests__/coverStudioChrome.test.tsx`
Expected: FAIL — no existen `data-testid="cover-editor"` ni `data-testid="cover-carousel"`.

- [ ] **Step 3: Reestructura el layout**

En `src/components/wizard/CoverCarouselStudio.tsx`, envuelve el contenido existente en esta
estructura, sin tocar la lógica del carrusel ni de las estrategias:

```tsx
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, backgroundColor: 'var(--color-bg-canvas)' }}>
      <div
        style={{
          height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
          padding: '0 20px',
          backgroundColor: 'var(--color-bg-surface)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        {ESTRATEGIAS.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => setEstrategia(e.id)}
            aria-pressed={estrategia === e.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', border: '1px solid transparent',
              borderRadius: 'var(--radius-sm)',
              background: estrategia === e.id ? 'var(--color-accent-soft)' : 'transparent',
              color: estrategia === e.id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              fontFamily: 'inherit', fontSize: 'var(--text-xs)',
              fontWeight: estrategia === e.id ? 600 : 500, cursor: 'pointer',
            }}
          >
            {e.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', gap: 20, padding: '20px 24px', overflow: 'hidden', minHeight: 0 }}>
        <div data-testid="cover-carousel" style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
          {/* el carrusel actual, sin cambios */}
        </div>
        <aside
          data-testid="cover-editor"
          style={{ width: 320, flexShrink: 0, overflowY: 'auto' }}
        >
          <CoverEditorPanel />
        </aside>
      </div>
    </div>
  );
```

Si el nombre del array de estrategias en el archivo no es `ESTRATEGIAS`, ni el selector
`estrategia`, usa los reales. Búscalos con:

```bash
Select-String -Path src/components/wizard/CoverCarouselStudio.tsx -Pattern 'estrategia|ESTRATEG|estrat'
```

- [ ] **Step 4: Corre el test y verifica que pasa**

Run: `npx vitest run src/__tests__/coverStudioChrome.test.tsx`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/wizard/CoverCarouselStudio.tsx src/__tests__/coverStudioChrome.test.tsx
git commit -m "feat(portada): tira de estrategias, carrusel al centro y editor a 320px"
```

---

### Task 19: `Step0QuickStart` adopta el `IconRail`

**Files:**
- Modify: `src/components/wizard/Step0QuickStart.tsx:427-481` (su sidebar propio) y `:484` (`SettingsMenu`)
- Test: `src/__tests__/homeRail.test.tsx`

**Interfaces:**
- Consumes: `IconRail` (Task 4), `useRailDestinations` no (Inicio tiene su propio juego), `useDocStore` (`atHome`, `goHome`, `showFileMenu`, `settingsStudioOpen`).
- Produces: `export const HOME_RAIL_ITEMS: RailDestination[]` en `src/components/shell/railItems.ts`, para que la gramática sea una sola.

- [ ] **Step 1: Escribe el test que falla**

Crea `src/__tests__/homeRail.test.tsx`:

```tsx
/**
 * WordAPA7 — T19: Inicio usa el mismo rail que el editor. Dos gramaticas de
   navegación conviviendo era justo lo que se queria eliminar.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HOME_RAIL_ITEMS } from '../components/shell/railItems';
import { IconRail } from '../components/shell/IconRail';

describe('T19 — rail de Inicio', () => {
  it('tiene sus propios destinos, sin emojis', () => {
    expect(HOME_RAIL_ITEMS.length).toBeGreaterThan(0);
    for (const i of HOME_RAIL_ITEMS) {
      expect(i.label).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('monta en el mismo componente de 56px que el editor', () => {
    render(
      <IconRail
        items={HOME_RAIL_ITEMS}
        onHoverItem={() => {}}
        onTogglePin={() => {}}
        pinned={false}
      />,
    );
    expect(screen.getByLabelText('Fases de la transformación')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Pasa la etiqueta correcta**

La Task 4 ya dejó `ariaLabel?: string` en `IconRailProps` y el `nav` ya lo consume, así que aquí
solo hay que dar el valor. `HOME_RAIL_ITEMS` describe destinos que no son fases, así que
`"Fases de la transformación"` mentiría.

```tsx
<IconRail
  items={HOME_RAIL_ITEMS}
  ariaLabel="Navegación principal"
  onHoverItem={() => {}}
  onTogglePin={() => {}}
  pinned={false}
/>
```

El test de la Task 4 sigue en verde porque usa el valor por defecto.

- [ ] **Step 3: Añade `HOME_RAIL_ITEMS`**

En `src/components/shell/railItems.ts`, añade:

```ts
import { Home, History, PlusCircle, Puzzle, Settings, SunMoon } from 'lucide-react';

export const HOME_RAIL_ITEMS: RailDestination[] = [
  { id: 'home-inicio', step: null, label: 'Inicio', Icon: Home, status: 'idle', pending: 0, showOutline: false },
  { id: 'home-recientes', step: null, label: 'Recientes', Icon: History, status: 'idle', pending: 0, showOutline: false },
  { id: 'home-nueva', step: null, label: 'Nueva transformación', Icon: PlusCircle, status: 'idle', pending: 0, showOutline: false },
  { id: 'home-addin', step: null, label: 'Complemento de Word', Icon: Puzzle, status: 'idle', pending: 0, showOutline: false },
  { id: 'home-ajustes', step: null, label: 'Ajustes', Icon: Settings, status: 'idle', pending: 0, showOutline: false },
  { id: 'home-tema', step: null, label: 'Tema', Icon: SunMoon, status: 'idle', pending: 0, showOutline: false },
];
```

- [ ] **Step 4: Sustituye el sidebar de `Step0QuickStart`**

En `src/components/wizard/Step0QuickStart.tsx`, borra el sidebar propio de las líneas 427-481 y monta
el rail compartido en su lugar, dentro del `return` raíz:

```tsx
  return (
    <div style={{ flex: 1, display: 'flex', minWidth: 0, minHeight: 0 }}>
      <IconRail
        items={HOME_RAIL_ITEMS}
        ariaLabel="Navegación principal"
        onHoverItem={setHoveredHome}
        onTogglePin={() => setRailPinned(!railPinned)}
        pinned={railPinned}
      />
      {hoveredHome && <RailFlyout item={hoveredHome} onClose={() => setHoveredHome(null)} />}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        {/* el hero y el resto de Inicio, sin cambios */}
      </div>
    </div>
  );
```

Los clics de cada destino se resuelven en `setHoveredHome` con un `switch` sobre `item.id`, que
llama a la misma acción que hoy ejecuta cada botón del sidebar. Los imports de `SettingsMenu` y los
handlers de sus secciones se conservan: no se pierde funcionalidad, solo cambia dónde vive el botón.

- [ ] **Step 5: Alinea el padding del hero**

El `padding` del hero de Inicio pasa a `60px 48px`, el mismo del resto del shell.

- [ ] **Step 6: Corrige el test y verifica que pasa**

Run: `npx vitest run src/__tests__/homeRail.test.tsx src/__tests__/iconRail.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/shell/railItems.ts src/components/shell/IconRail.tsx src/components/wizard/Step0QuickStart.tsx src/__tests__/homeRail.test.tsx
git commit -m "feat(home): Inicio adopta el rail de iconos compartido"
```

---

### Task 20: Lint de tokens, suite completa y cierre

**Files:**
- Create: `src/__tests__/noHardcodedColors.test.ts`
- Modify: lo que signal el build

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la red de seguridad que impide que el rediseño vuelva a hardcodear colores.

- [ ] **Step 1: Escribe el test que falla**

Crea `src/__tests__/noHardcodedColors.test.ts`:

```ts
/**
 * WordAPA7 — T20: los archivos del rediseño no hardcodean colores. Los tokens
   viven solo en design-system.css; en cualquier otro sitio, un hex es un
   bug que ademas rompe el tema oscuro.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RAIZ = resolve(__dirname, '..');
const OBJETIVO = ['components/shell', 'components/review', 'components/toolbar', 'hooks'];
const EXENTOS = new Set(['/styles/']);

constHEX = /#[0-9a-fA-F]{3,8}\b/g;
const rgba = /rgba?\(\s*\d/g;

function recorrer(dir: string): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...recorrer(ruta));
    else if (/\.tsx?$/.test(nombre)) salida.push(ruta);
  }
  return salida;
}

describe('T20 — sin colores hardcodeados en el rediseño', () => {
  for (const carpeta of OBJETIVO) {
    it(`respeta los tokens en ${carpeta}`, () => {
      const rutas = recorrer(join(RAIZ, carpeta));
      const ofensas: string[] = [];
      for (const ruta of rutas) {
        if ([...EXENTOS].some((e) => ruta.includes(e))) continue;
        const texto = readFileSync(ruta, 'utf8');
        texto.split('\n').forEach((linea, i) => {
          if (linea.includes('var(--')) return;
          if (HEX.test(linea) || rgba.test(linea)) ofensas.push(`${ruta}:${i + 1} ${linea.trim()}`);
          HEX.lastIndex = 0;
          rgba.lastIndex = 0;
        });
      }
      expect(ofensas).toEqual([]);
    });
  }
});
```

- [ ] **Step 2: Corre el test y verifica el estado real**

Run: `npx vitest run src/__tests__/noHardcodedColors.test.ts`
Expected: FAIL en `components/review` y probablemente en `hooks`, con la lista exacta de
archivos y líneas. Esa lista es el trabajo, no un defecto del test.

- [ ] **Step 3: Limpia cada ofensa**

Para cada línea que reporte, sustituye el color por su token. La tabla de correspondencias:

| Si aparece | Usa |
|---|---|
| `#4f7cff` o `rgb(79, 124, 255)` | `var(--color-accent)` |
| `rgba(79, 124, 255, 0.1)` | `var(--color-accent-soft)` |
| `#111827` o `rgba(0,0,0,0.87)` | `var(--color-text-primary)` |
| `#6b7280` | `var(--color-text-tertiary)` |
| `rgba(107, 114, 128, 0.1)` | `var(--mark-ai-bg)` |
| `rgba(220, 38, 38, ...)` | `var(--severity-critical-soft)` |
| `rgba(217, 119, 6, ...)` | `var(--severity-warning-soft)` |
| `#d4382e` | `var(--color-danger)` |
| `#ffffff` en un color de texto | `var(--color-text-on-accent)` |

Si aparece un color sin equivalente, defínelo en `src/styles/design-system.css` como token, en los
dos temas, y usa el token. No inventes el color en el componente.

- [ ] **Step 4: Corre el test y verifica que pasa**

Run: `npx vitest run src/__tests__/noHardcodedColors.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Corre la suite completa**

Run: `npm test`
Expected: PASS en los 125 tests originales más los nuevos. Si algún test original falla, el código
nuevo es el punto de partida: el test reflejaba el comportamiento viejo.

- [ ] **Step 6: Compila**

Run: `npm run build`
Expected: PASS sin errores de TypeScript. Los avisos de imports sin usar no son parte del contrato
pero conviene limpiarlos.

- [ ] **Step 7: Revisa la deuda que quedó anotada**

Confirma estos tres puntos, que el spec dejó fuera de alcance y que deben quedar documentados y no
rotos:

```bash
Select-String -Path src -Pattern 'elementPageMap|1800'
Select-String -Path src -Pattern 'contentReview'
Select-String -Path src/store/slices/uiSlice.ts -Pattern 'railPinned'
```

Expected: la primera vacía, la segunda solo en `src/lib/contentReview.ts` y su test, la tercera
presente.

- [ ] **Step 8: Commit**

```bash
git add src/__tests__/noHardcodedColors.test.ts src/styles/design-system.css
git commit -m "test(tokens): prohibicion de colores hardcodeados en el rediseño"
```
