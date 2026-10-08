# Correcciones de Figuras y Tablas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir el recorte de figuras/tablas en la previsualización, hacer reales los estilos de tabla planeados, exponerlos como una sección colapsada de solo-ícono en el menú de edición, y ofrecer la leyenda IA bajo cada tabla con mascota o botón, sin gasto automático de tokens.

**Architecture:** Una sola fuente de verdad (`TableModel.style`) alimenta un único render compartido (`src/lib/tablaRender.ts` + `src/components/figures/TablaRender.tsx`) usado por el lienzo, el Taller y la prosa. El recorte se elimina volviendo partibles las tablas por filas (con encabezado repetido) y escalando las imágenes al alto útil. La leyenda IA vive en un componente compartido con mascota, opt-in por clic.

**Tech Stack:** React 18 + TypeScript + Vite 5 + Zustand; FastAPI + python-docx (`python/`). Vitest (`npm test`) y pytest (`pytest python/tests/`).

**Spec:** `docs/superpowers/specs/2026-10-04-correcciones-figuras-tablas-design.md`

## Global Constraints

- **Cero emojis** en UI, botones, toasts, strings. Solo íconos vectoriales `lucide-react`.
- **Solo design tokens** CSS (`var(--...)`); prohibido hex hardcodeado.
- **Fidelidad de papel APA:** `--paper-white` (#fff) y `--paper-ink` (#111827) en ambos temas.
- **Portada intocable:** `use_original_cover: true` nunca muta la portada; `computePages` agrupa TODO `is_cover_section`/`portada_block` en la Página 1, indivisible.
- **Word COM** 100% lazy, `Visible=False`, `DisplayAlerts=0` — este plan no lo toca.
- **Review de una sola pantalla:** no reintroducir `ReviewMinimap` ni la vista de 3 columnas.
- **Modelo por defecto para todo subagente:** `deepseek-v4.1-flash`. No usar modelos más caros sin autorización explícita.
- **Micro-diffs** (≤40 líneas por edición) y commits atómicos; tests focalizados primero, suite completa antes de cada commit de tarea.

## Review Focus

Estas cinco clases de entrada probablemente muerdan al usuario y ninguna tarea las cubre por accidente; cada una recibe su test en la tarea dueña del código:

1. Tabla más alta que el área útil **que arranca a mitad de página** — debe partirse por filas repitiendo encabezado, nunca recortarse (Task 3, Task 10).
2. Imagen con `height_cm` declarado **mayor** al área útil — debe escalar, nunca recortarse (Task 6, Task 9).
3. Tabla con `vMerge` (`row_spans`) **que arranca en la fila de encabezado** y se rebanada entre páginas — los spans deben sobrevivir la rebanada (Task 2).
4. Sesión guardada que trae `tableStyles` en el estado persistido — el retiro del campo no debe romper la hidratación (Task 11).
5. Preset **no-APA** (`grid`/`zebra`) elegido por el usuario — el `.docx` exportado debe seguir siendo válido (borde de cuadrícula) y la UI debe mostrar el aviso "no APA" (Task 7, Task 16).

---

### Task 1: Metadatos de presets y mapeo de export

**Files:**
- Modify: `src/lib/tablaRender.ts`
- Test: `src/__tests__/tablaRender.test.ts`

**Interfaces:**
- Consumes: `TableStylePreset` de `src/types/index.ts`.
- Produces: `PresetTablaInfo`, `PRESETS_TABLA: PresetTablaInfo[]`, `BORDE_EXPORT_DE_PRESET: Record<TableStylePreset, 'apa'|'grid'>`.

- [ ] **Step 1: Write the failing test** — append a `describe('PRESETS_TABLA')` with two cases: `PRESETS_TABLA.map(p=>p.id)` equals `['apa','compact','expanded','grid','zebra']`; `PRESETS_TABLA.filter(p=>!p.esAPA).map(p=>p.id)` equals `['grid','zebra']`; and `BORDE_EXPORT_DE_PRESET` maps `apa/compact/expanded→'apa'` and `grid/zebra→'grid'`.

```ts
import { PRESETS_TABLA, BORDE_EXPORT_DE_PRESET } from '../lib/tablaRender';

describe('PRESETS_TABLA', () => {
  it('expone los cinco presets en orden', () => {
    expect(PRESETS_TABLA.map((p) => p.id)).toEqual(['apa', 'compact', 'expanded', 'grid', 'zebra']);
  });
  it('marca grid y zebra como no-APA', () => {
    expect(PRESETS_TABLA.filter((p) => !p.esAPA).map((p) => p.id)).toEqual(['grid', 'zebra']);
  });
  it('mapea presets a borde de export', () => {
    expect(BORDE_EXPORT_DE_PRESET.apa).toBe('apa');
    expect(BORDE_EXPORT_DE_PRESET.compact).toBe('apa');
    expect(BORDE_EXPORT_DE_PRESET.expanded).toBe('apa');
    expect(BORDE_EXPORT_DE_PRESET.grid).toBe('grid');
    expect(BORDE_EXPORT_DE_PRESET.zebra).toBe('grid');
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npm test -- --run src/__tests__/tablaRender.test.ts` → FAIL (`PRESETS_TABLA` no exportado).

- [ ] **Step 3: Write minimal implementation** — al final de `src/lib/tablaRender.ts`:

```ts
export interface PresetTablaInfo {
  id: TableStylePreset;
  etiqueta: string;
  descripcion: string;
  /** APA-safe: sin rejilla, sin sombreado, sin zebra. */
  esAPA: boolean;
}

export const PRESETS_TABLA: PresetTablaInfo[] = [
  { id: 'apa', etiqueta: 'APA', descripcion: 'Bordes horizontales, sin rejilla', esAPA: true },
  { id: 'compact', etiqueta: 'Compacto', descripcion: 'Menos aire, misma estructura', esAPA: true },
  { id: 'expanded', etiqueta: 'Expandido', descripcion: 'Más aire entre celdas', esAPA: true },
  { id: 'grid', etiqueta: 'Cuadrícula', descripcion: 'Bordes en todas las celdas', esAPA: false },
  { id: 'zebra', etiqueta: 'Cebra', descripcion: 'Filas alternadas sombreadas', esAPA: false },
];

/** El export solo entiende "apa"/"grid"; los presets de acento colapsan al borde. */
export const BORDE_EXPORT_DE_PRESET: Record<TableStylePreset, 'apa' | 'grid'> = {
  apa: 'apa',
  compact: 'apa',
  expanded: 'apa',
  grid: 'grid',
  zebra: 'grid',
};
```

- [ ] **Step 4: Run test to verify it passes** — `npm test -- --run src/__tests__/tablaRender.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add src/lib/tablaRender.ts src/__tests__/tablaRender.test.ts` ; `git commit -m "feat(tabla): metadatos de presets y mapeo de borde de export"`.

---

### Task 2: `rebanadaDeTabla` — rebanada de filas con spans

**Files:**
- Modify: `src/lib/tablaRender.ts`
- Test: `src/__tests__/tablaRender.test.ts`

**Interfaces:**
- Consumes: `TableModel` de `src/types/index.ts`.
- Produces: `rebanadaDeTabla(tabla: TableModel, inicio: number, fin: number): TableModel`.

- [ ] **Step 1: Write the failing test** — caso normal (conserva `headers`/`header_spans`, corta `rows` y `row_spans`, conserva `caption`/`note`/`style`/`table_number`); caso límite (inicio/fin fuera de rango se clampan); caso `row_spans` con un `vMerge` en la primera fila de la rebanada.

```ts
import { rebanadaDeTabla } from '../lib/tablaRender';
import type { TableModel } from '../types';

const base: TableModel = {
  element_id: 't1', headers: ['A', 'B'], rows: [['1', '2'], ['3', '4'], ['5', '6']],
  caption: 'Datos', table_number: 1, style: 'apa',
  header_spans: [{ col: 2, row: 1 }],
  row_spans: [[{ col: 1, row: 1 }, { col: 1, row: 1 }], [{ col: 1, row: 1 }, { col: 1, row: 2 }], [{ col: 1, row: 1 }, { col: 1, row: 1 }]],
};

describe('rebanadaDeTabla', () => {
  it('conserva encabezado y spans de encabezado', () => {
    const r = rebanadaDeTabla(base, 1, 3);
    expect(r.headers).toEqual(['A', 'B']);
    expect(r.header_spans).toEqual([{ col: 2, row: 1 }]);
    expect(r.rows).toEqual([['3', '4'], ['5', '6']]);
    expect(r.row_spans).toEqual([base.row_spans![1], base.row_spans![2]]);
    expect(r.caption).toBe('Datos');
    expect(r.style).toBe('apa');
  });
  it('clampa índices fuera de rango', () => {
    const r = rebanadaDeTabla(base, -5, 99);
    expect(r.rows).toHaveLength(3);
  });
  it('preserva row_spans con row>1 en la primera fila rebanada', () => {
    const r = rebanadaDeTabla(base, 1, 3);
    expect(r.row_spans![0][1]).toEqual({ col: 1, row: 2 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npm test -- --run src/__tests__/tablaRender.test.ts` → FAIL.

- [ ] **Step 3: Write minimal implementation** — en `src/lib/tablaRender.ts`:

```ts
/** Una rebanada de filas mantiene el encabezado completo y los spans alineados. */
export function rebanadaDeTabla(tabla: TableModel, inicio: number, fin: number): TableModel {
  const n = tabla.rows.length;
  const desde = Math.min(Math.max(0, Math.floor(inicio)), n);
  const hasta = Math.min(Math.max(desde, Math.floor(fin)), n);
  return {
    ...tabla,
    rows: tabla.rows.slice(desde, hasta),
    row_spans: tabla.row_spans ? tabla.row_spans.slice(desde, hasta) : tabla.row_spans,
  };
}
```

- [ ] **Step 4: Run test to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(tabla): rebanadaDeTabla conserva encabezado y spans"`.

---

### Task 3: `flowPagination` — tablas partibles por filas

**Files:**
- Modify: `src/lib/flowPagination.ts`
- Test: `src/__tests__/flowPagination.test.ts` (create si no existe)

**Interfaces:**
- Consumes: `PageGeometry` (`geom.contentH`, `geom.lineHeightPx`).
- Produces: `MeasuredElement.tableRows?: { headerHeightPx: number; rowHeightsPx: number[] }`; `FlowChunk.startRow?: number`, `FlowChunk.endRow?: number | null`.

- [ ] **Step 1: Write the failing test**

```ts
import { flowPagination } from '../lib/flowPagination';
import type { ElementModel } from '../types';

const geom = { contentH: 200, lineHeightPx: 20 } as any; // totalLines = 10
const tabla = { id: 't1', type: 'table', text: '' } as ElementModel;

describe('flowPagination tablas', () => {
  it('tabla que cabe: un solo chunk con todas las filas', () => {
    const pages = flowPagination(
      [{ elem: tabla, heightPx: 120, splittable: false, tableRows: { headerHeightPx: 20, rowHeightsPx: [20, 20, 20] } }],
      geom,
    );
    expect(pages).toHaveLength(1);
    expect(pages[0].chunks[0].startRow).toBe(0);
    expect(pages[0].chunks[0].endRow).toBe(3);
  });
  it('tabla alta: parte por filas repitiendo encabezado en cada página', () => {
    const pages = flowPagination(
      [{ elem: tabla, heightPx: 400, splittable: false, tableRows: { headerHeightPx: 40, rowHeightsPx: [40, 40, 40, 40, 40, 40, 40, 40] } }],
      geom,
    );
    expect(pages.length).toBeGreaterThan(1);
    const filas = pages.flatMap((p) => p.chunks.filter((c) => c.elem.id === 't1')).map((c) => [c.startRow, c.endRow]);
    expect(filas[0][0]).toBe(0);                       // arranca en 0
    expect(filas[filas.length - 1][1]).toBe(8);        // termina en la última fila
    for (let i = 1; i < filas.length; i++) expect(filas[i][0]).toBe(filas[i - 1][1]); // contiguas
  });
  it('una fila gigante va sola y no se pierde', () => {
    const pages = flowPagination(
      [{ elem: tabla, heightPx: 400, splittable: false, tableRows: { headerHeightPx: 20, rowHeightsPx: [400] } }],
      geom,
    );
    const total = pages.flatMap((p) => p.chunks).reduce((n, c) => n + ((c.endRow ?? 0) - (c.startRow ?? 0)), 0);
    expect(total).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npm test -- --run src/__tests__/flowPagination.test.ts` → FAIL.

- [ ] **Step 3: Write minimal implementation** — en `flowPagination.ts`: agregar campos a las interfaces y, dentro de `for (const item of items)`, ANTES del bloque `if (!item.splittable)`, insertar:

```ts
    // Tabla: partible por filas, con encabezado repetido en cada fragmento.
    if (item.elem.type === 'table' && item.tableRows && item.tableRows.rowHeightsPx.length > 0) {
      const headerLines = item.tableRows.headerHeightPx > 0
        ? Math.max(1, Math.ceil(item.tableRows.headerHeightPx / LH)) : 0;
      const rowLines = item.tableRows.rowHeightsPx.map((h) => Math.max(1, Math.ceil(h / LH)));
      const totalRows = rowLines.length;
      let r = 0;
      while (r < totalRows) {
        const hayContenido = pages[pages.length - 1].chunks.length > 0;
        const avail = totalLines - used;
        if (hayContenido && headerLines + rowLines[r] > avail) { newPage(); continue; }
        const limite = totalLines - used;
        let fin = r;
        let gasto = headerLines;
        while (fin < totalRows && gasto + rowLines[fin] <= limite) { gasto += rowLines[fin]; fin++; }
        if (fin === r) { fin = r + 1; gasto = headerLines + rowLines[r]; } // fila sola: no se pierde
        pages[pages.length - 1].chunks.push({ elem: item.elem, startLine: 0, endLine: null, startRow: r, endRow: fin });
        used += gasto;
        r = fin;
        if (r < totalRows) newPage();
      }
      continue;
    }
```

- [ ] **Step 4: Run test to verify it passes** — PASS. (Verificar que los tests existentes de `flowPagination` sin `tableRows` siguen verdes.)

- [ ] **Step 5: Commit** — `git commit -m "feat(paginacion): tablas partibles por filas con encabezado repetido"`.

---

### Task 4: `ElementModel.table_slice` + wiring en `pageSplitter`

**Files:**
- Modify: `src/types/index.ts` (agregar `table_slice?` a `ElementModel`)
- Modify: `src/lib/pageSplitter.ts`
- Test: `src/__tests__/pageSplitter.test.ts` (create si no existe)

**Interfaces:**
- Consumes: `flowPagination` con `tableRows` (Task 3).
- Produces: `ElementModel.table_slice?: { start: number; end: number }`.

- [ ] **Step 1: Write the failing test** — una tabla medida (altura `contentH*3`) se parte; cada elemento resultante trae `table_slice` con rangos contiguos que cubren todas las filas; la suma de filas de las rebanadas = filas originales.

```ts
import { applyPageFlow } from '../lib/pageSplitter';
import type { ElementModel } from '../types';

const geom = { contentH: 200, lineHeightPx: 20, contentW: 500 } as any;
const tabla = {
  id: 't1', type: 'table',
  table_info: { element_id: 't1', headers: ['A'], rows: Array.from({ length: 12 }, (_, i) => [String(i)]), table_number: 1 },
} as unknown as ElementModel;

describe('pageSplitter tablas', () => {
  it('parte una tabla alta en rebanadas de filas', () => {
    const heights = new Map([['t1', 600]]);
    const out = applyPageFlow([[tabla]], heights, geom).flat().filter((e) => e.id === 't1');
    expect(out.length).toBeGreaterThan(1);
    expect(out[0].table_slice!.start).toBe(0);
    expect(out[out.length - 1].table_slice!.end).toBe(12);
    for (let i = 1; i < out.length; i++) expect(out[i].table_slice!.start).toBe(out[i - 1].table_slice!.end);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npm test -- --run src/__tests__/pageSplitter.test.ts` → FAIL.

- [ ] **Step 3a: Add field** — en `src/types/index.ts`, en `ElementModel`, junto a `split_chunk`:

```ts
  /** Rebanada de filas de una tabla partida entre páginas (solo render). */
  table_slice?: { start: number; end: number };
```

- [ ] **Step 3b: Compute `tableRows`** — en `pageSplitter.ts`, dentro del `page.map((elem) => {...})` (línea ~99), construir `tableRows` para tablas medidas que exceden `contentH`:

```ts
      const filas = elem.type === 'table' ? (elem.table_info?.rows?.length ?? 0) : 0;
      const altoTabla = heights.get(elem.id) ?? null;
      const tableRows = (elem.type === 'table' && filas > 0 && altoTabla !== null && altoTabla > geom.contentH)
        ? (() => {
            const headerHeightPx = Math.min(altoTabla, geom.lineHeightPx * 1.5);
            const altoFilas = (altoTabla - headerHeightPx) / filas;
            return { headerHeightPx, rowHeightsPx: Array.from({ length: filas }, () => altoFilas) };
          })()
        : undefined;
      return {
        elem,
        heightPx: altoTabla,
        splittable: !isCover && SPLITTABLE_TYPES.has(elem.type) && elem.split_chunk === undefined,
        tableRows,
      };
```

- [ ] **Step 3c: Emit `table_slice`** — en el `fp.chunks.map((c) => {...})` (línea ~140), antes de `if (c.elem.split_chunk !== undefined)`:

```ts
          if (c.elem.type === 'table' && c.startRow !== undefined) {
            return {
              ...c.elem,
              table_slice: { start: c.startRow, end: c.endRow ?? (c.elem.table_info?.rows?.length ?? 0) },
              split_chunk: idx,
            };
          }
```

- [ ] **Step 4: Run test to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(paginacion): rebanadas de tabla viajan al render"`.

---

### Task 5: `TablaRender` — leyenda controlada y marca de continuación

**Files:**
- Modify: `src/components/figures/TablaRender.tsx`
- Test: `src/__tests__/tablaRenderView.test.tsx`

**Interfaces:**
- Produces: props nuevas `mostrarLeyenda?: boolean` (default `true`) y `esContinuacion?: boolean` (default `false`).

- [ ] **Step 1: Write the failing test** — `mostrarLeyenda={false}` oculta la línea "Tabla N." con el título; `esContinuacion` muestra el texto "Continúa"; por defecto la leyenda se ve.

```tsx
import { render, screen } from '@testing-library/react';
import { TablaRender } from '../components/figures/TablaRender';
import type { TableModel } from '../types';

const tabla: TableModel = { element_id: 't', headers: ['A'], rows: [['1']], caption: 'Datos', table_number: 2 };

it('oculta la leyenda cuando mostrarLeyenda=false', () => {
  render(<TablaRender tabla={tabla} mostrarLeyenda={false} />);
  expect(screen.queryByText(/Datos/)).toBeNull();
});
it('marca continuación', () => {
  render(<TablaRender tabla={tabla} esContinuacion />);
  expect(screen.getByText(/Continúa/)).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails** — `npm test -- --run src/__tests__/tablaRenderView.test.tsx` → FAIL.

- [ ] **Step 3: Write minimal implementation** — agregar las props al interface y al destructuring con defaults; envolver el encabezado `<div>` de leyenda en `{mostrarLeyenda ? ( ... ) : null}`; y tras `</div>` del scroll agregar:

```tsx
      {esContinuacion ? (
        <div style={{ marginTop: 'var(--space-1)', fontSize: 'var(--text-xs)', fontStyle: 'italic', color: 'var(--color-text-tertiary)' }}>
          Continúa
        </div>
      ) : null}
```

- [ ] **Step 4: Run test to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(tabla): render controla leyenda y marca de continuacion"`.

---

### Task 6: Helper puro de ajuste de imagen al alto útil

**Files:**
- Create: `src/lib/figuraAjuste.ts`
- Test: `src/__tests__/figuraAjuste.test.ts`

**Interfaces:**
- Produces: `altoImagenAjustado(altoDeclarado: number | null, altoDisponible: number): number | null`.

- [ ] **Step 1: Write the failing test**

```ts
import { altoImagenAjustado } from '../lib/figuraAjuste';
it('escala si el declarado excede el disponible', () => {
  expect(altoImagenAjustado(900, 700)).toBe(700);
});
it('respeta el declarado si cabe', () => {
  expect(altoImagenAjustado(300, 700)).toBe(300);
});
it('sin declarado devuelve null (usa el default del render)', () => {
  expect(altoImagenAjustado(null, 700)).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails** → FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
/* WordAPA7 — ajuste de imagen al alto útil de la hoja (spec D-7).
 * Una figura nunca puede exceder el área útil: si el alto declarado la pasa,
 * se escala; sin alto declarado, el render decide su default. */
export function altoImagenAjustado(altoDeclarado: number | null, altoDisponible: number): number | null {
  if (altoDeclarado === null || !Number.isFinite(altoDeclarado)) return null;
  return Math.min(altoDeclarado, altoDisponible);
}
```

- [ ] **Step 4: Run test to verify it passes** → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(figuras): helper de ajuste de alto al area util"`.

---

### Task 7: `TablaEstiloSelector` — sección colapsada de solo-ícono

**Files:**
- Create: `src/components/figures/TablaEstiloSelector.tsx`
- Test: `src/__tests__/tablaEstiloSelector.test.tsx`

**Interfaces:**
- Consumes: `PRESETS_TABLA`, `TableStylePreset`.
- Produces: `TablaEstiloSelector` con props `{ valor?: TableStylePreset; onChange: (p: TableStylePreset) => void }`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { TablaEstiloSelector } from '../components/figures/TablaEstiloSelector';

it('arranca colapsado y muestra solo el icono', () => {
  render(<TablaEstiloSelector onChange={() => {}} />);
  expect(screen.getByRole('button', { name: /estilo de tabla/i })).toBeTruthy();
  expect(screen.queryByText('Cuadrícula')).toBeNull();
});
it('al abrir lista los presets y avisa los no-APA', () => {
  render(<TablaEstiloSelector onChange={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /estilo de tabla/i }));
  expect(screen.getByText('Cuadrícula')).toBeTruthy();
  expect(screen.getByText('Cebra')).toBeTruthy();
  expect(screen.getAllByText(/no APA/i).length).toBeGreaterThan(0);
});
it('elegir un preset llama onChange con su id', () => {
  const onChange = vi.fn();
  render(<TablaEstiloSelector onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: /estilo de tabla/i }));
  fireEvent.click(screen.getByText('Compacto'));
  expect(onChange).toHaveBeenCalledWith('compact');
});
```

- [ ] **Step 2: Run test to verify it fails** → FAIL.

- [ ] **Step 3: Write minimal implementation** — crear el componente. Cabecera: un `button` con `aria-label="Estilo de tabla"`, `aria-expanded={abierto}`, que pinta SOLO `Palette` (lucide) + `ChevronDown` (nada de texto "Estilo"); cuerpo desplegable con `PRESETS_TABLA`. Todo con tokens.

```tsx
import React, { useState } from 'react';
import { Palette, ChevronDown, Check } from 'lucide-react';
import { PRESETS_TABLA } from '../../lib/tablaRender';
import type { TableStylePreset } from '../../types';

export interface TablaEstiloSelectorProps {
  valor?: TableStylePreset;
  onChange: (p: TableStylePreset) => void;
}

export const TablaEstiloSelector: React.FC<TablaEstiloSelectorProps> = ({ valor, onChange }) => {
  const [abierto, setAbierto] = useState(false);
  const activo = valor ?? 'apa';
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" aria-label="Estilo de tabla" aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', padding: '3px 8px',
          background: abierto ? 'var(--color-accent-soft)' : 'var(--surface-subtle)',
          color: abierto ? 'var(--accent-primary)' : 'var(--text-secondary)',
          border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)', cursor: 'pointer' }}>
        <Palette size={13} />
        <ChevronDown size={11} />
      </button>
      {abierto && (
        <div role="listbox" style={{ position: 'absolute', zIndex: 40, top: 'calc(100% + 4px)', left: 0, minWidth: '180px',
          background: 'var(--surface-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-md)', padding: 'var(--space-1)' }}>
          {PRESETS_TABLA.map((p) => (
            <button key={p.id} type="button" role="option" aria-selected={activo === p.id}
              onClick={() => { onChange(p.id); setAbierto(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: '100%', padding: '6px 8px',
                background: 'transparent', border: 'none', borderRadius: 'var(--radius-xs)', cursor: 'pointer',
                color: 'var(--text-main)', fontSize: '11px', textAlign: 'left' }}>
              {activo === p.id ? <Check size={12} style={{ color: 'var(--accent-primary)' }} /> : <span style={{ width: 12 }} />}
              <span style={{ flex: 1 }}>{p.etiqueta}</span>
              {!p.esAPA && <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>no APA</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
export default TablaEstiloSelector;
```

- [ ] **Step 4: Run test to verify it passes** → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(tabla): selector de estilo colapsado de solo-icono"`.

---

### Task 8: `MascotaLeyendaIA` — leyenda con mascota, opt-in

**Files:**
- Create: `src/components/figures/MascotaLeyendaIA.tsx`
- Test: `src/__tests__/mascotaLeyendaIa.test.tsx`

**Interfaces:**
- Consumes: `DocumentMascot` (mismo import que `LienzoEditorialActivo.tsx`).
- Produces: `MascotaLeyendaIA` con props `{ sugerida?: { titulo: string; nota?: string; confianza?: number }; cargando?: boolean; error?: string; onGenerar: () => void; onAplicar?: (s: { titulo: string; nota?: string }) => void; onRegenerar?: () => void }`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { MascotaLeyendaIA } from '../components/figures/MascotaLeyendaIA';

it('sin sugerencia muestra el boton de generar', () => {
  render(<MascotaLeyendaIA onGenerar={() => {}} />);
  expect(screen.getByRole('button', { name: /generar leyenda con ia/i })).toBeTruthy();
});
it('el boton llama onGenerar', () => {
  const onGenerar = vi.fn();
  render(<MascotaLeyendaIA onGenerar={onGenerar} />);
  fireEvent.click(screen.getByRole('button', { name: /generar leyenda con ia/i }));
  expect(onGenerar).toHaveBeenCalled();
});
it('con sugerencia muestra aplicar y regenerar', () => {
  render(<MascotaLeyendaIA sugerida={{ titulo: 'Serie mensual' }} onGenerar={() => {}} onAplicar={() => {}} onRegenerar={() => {}} />);
  expect(screen.getByText('Serie mensual')).toBeTruthy();
  expect(screen.getByRole('button', { name: /aplicar/i })).toBeTruthy();
  expect(screen.getByRole('button', { name: /regenerar/i })).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails** → FAIL.

- [ ] **Step 3: Write minimal implementation** — componente que reusa el patrón visual de `LienzoEditorialActivo.tsx:374-476` (mascota + tarjeta). Sin sugerencia: `DocumentMascot` en reposo + botón `aria-label="Generar leyenda con IA"` (ícono `Wand2`). Con sugerencia: tarjeta "¿Uso esta leyenda?" + título en cursiva + `Aplicar` (ícono `Check`) y `Regenerar` (ícono `RefreshCw`). `cargando` deshabilita el botón y pinta ícono `Loader2`. `error` pinta el mensaje. `data-testid="mascota-leyenda-ia"`. Todo con tokens.

- [ ] **Step 4: Run test to verify it passes** → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(ia): componente MascotaLeyendaIA opt-in"`.

---

### Task 9: `PaperCanvas` — imagen escala al alto útil

**Files:**
- Modify: `src/components/layout/PaperCanvas.tsx` (marco de imagen, ~2335; multipanel, ~2276)
- Test: `src/__tests__/figuraAjuste.test.ts` (ya cubre el helper; aquí solo integración visual)

**Interfaces:**
- Consumes: `altoImagenAjustado` (Task 6).

- [ ] **Step 1: Aplicar el ajuste** — importar `altoImagenAjustado`. En el marco de imagen simple, reemplazar

```ts
height: elem.image_info?.height_cm ? `${elem.image_info.height_cm * 37.8}px` : '200px',
```

por

```ts
height: (() => {
  const declarado = elem.image_info?.height_cm ? elem.image_info.height_cm * 37.8 : null;
  const alto = altoImagenAjustado(declarado, geom.contentH);
  return alto === null ? '200px' : `${alto}px`;
})(),
```

y en cada panel multipanel reemplazar `height: ... height_cm*30+'px' : '170px'` por la misma llamada con `altoImagenAjustado(declarado, geom.contentH)`.

- [ ] **Step 2: Verificación** — `npx tsc --noEmit` sin errores; `npm test -- --run src/__tests__/figuraAjuste.test.ts` PASS.

- [ ] **Step 3: Commit** — `git commit -m "fix(lienzo): imagen escala al area util, no se recorta"`.

---

### Task 10: `PaperCanvas` — migrar tabla legacy a `TablaRender` + estilo + mascota

**Files:**
- Modify: `src/components/layout/PaperCanvas.tsx` (bloque tabla ~2418-2507; estado y handler cerca de ~666)
- Test: `src/__tests__/paperCanvasTablaRender.test.tsx` (create; render de la tabla con slice)

**Interfaces:**
- Consumes: `TablaRender`, `rebanadaDeTabla`, `TablaEstiloSelector`, `MascotaLeyendaIA`, `suggestCaption`, `updateElementTable`.

- [ ] **Step 1: Estado y handler opt-in** — junto a los demás `useState` del componente (cerca de `aiLoadingId`):

```ts
  const [leyendaSugerida, setLeyendaSugerida] = useState<Record<string, string>>({});
  const [leyendaCargando, setLeyendaCargando] = useState<Record<string, boolean>>({});
  const [leyendaError, setLeyendaError] = useState<Record<string, string>>({});

  const generarLeyendaTabla = async (elem: ElementModel) => {
    if (!doc) return;
    setLeyendaCargando((p) => ({ ...p, [elem.id]: true }));
    setLeyendaError((p) => ({ ...p, [elem.id]: '' }));
    try {
      const idx = doc.elements.findIndex((e) => e.id === elem.id);
      const ctx: string[] = [];
      for (let i = Math.max(0, idx - 2); i < Math.min(doc.elements.length, idx + 3); i++) {
        const e = doc.elements[i];
        if (e.id === elem.id) continue;
        if (e.type === 'paragraph' || e.type === 'heading' || e.type === 'bullet' || e.type === 'numbered_list') {
          const t = (e.text || '').trim();
          if (t) ctx.push(t);
        }
      }
      const texto = await suggestCaption(doc.session_id, elem.id, ctx.join('\n'), useDocStore.getState().apiKey);
      setLeyendaSugerida((p) => ({ ...p, [elem.id]: texto }));
    } catch (err: any) {
      setLeyendaError((p) => ({ ...p, [elem.id]: err?.message || 'No se pudo generar la leyenda' }));
    } finally {
      setLeyendaCargando((p) => ({ ...p, [elem.id]: false }));
    }
  };
```

- [ ] **Step 2: Reemplazar el bloque tabla** — sustituir el `{elem.type === 'table' && elem.table_info && (() => { ... })()}` completo (líneas ~2418-2507) por:

```tsx
                        {elem.type === 'table' && elem.table_info && (() => {
                          const tabla = elem.table_slice
                            ? rebanadaDeTabla(elem.table_info, elem.table_slice.start, elem.table_slice.end)
                            : elem.table_info;
                          const esContinuacion = (elem.table_slice?.start ?? 0) > 0;
                          const mostrandoLeyenda = (elem.table_slice?.start ?? 0) === 0;
                          return (
                            <div style={{ margin: '16px 0', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                              <TablaRender
                                tabla={tabla}
                                mostrarLeyenda={mostrandoLeyenda}
                                esContinuacion={esContinuacion}
                              />
                              {mostrandoLeyenda && !elem.table_info.caption && (
                                <div style={{ marginTop: 'var(--space-2)' }}>
                                  <MascotaLeyendaIA
                                    sugerida={leyendaSugerida[elem.id] ? { titulo: leyendaSugerida[elem.id] } : undefined}
                                    cargando={!!leyendaCargando[elem.id]}
                                    error={leyendaError[elem.id] || undefined}
                                    onGenerar={() => generarLeyendaTabla(elem)}
                                    onAplicar={(s) => updateElementTable(elem.id, { ...elem.table_info, caption: s.titulo })}
                                    onRegenerar={() => generarLeyendaTabla(elem)}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })()}
```

- [ ] **Step 3: Imports** — agregar `TablaRender`, `MascotaLeyendaIA`, `TablaEstiloSelector`, `rebanadaDeTabla`; quitar `CaptionSuggestionBadge` si ya no se usa en imágenes (dejar el de imágenes si sigue). Confirmar que `suggestCaption` ya está importado.

- [ ] **Step 4: Test de integración** — render de una tabla con `table_slice { start: 1, end: 3 }` muestra solo las filas 1-2, sin leyenda, con marca "Continúa".

```tsx
// montar el elemento table con table_slice y assert que las celdas de las filas 0 no aparecen
```

- [ ] **Step 5: Verificación** — `npx tsc --noEmit`; `npm test -- --run src/__tests__/paperCanvasTablaRender.test.tsx src/__tests__/tablaRenderView.test.tsx` PASS.

- [ ] **Step 6: Commit** — `git commit -m "feat(lienzo): tabla usa TablaRender, estilo real y mascota opt-in"`.

---

### Task 11: Retiro de `tableStyles` / `setTableStyle`

**Files:**
- Modify: `src/store/types.ts` (quitar líneas 66-68)
- Modify: `src/store/slices/documentSlice.ts` (quitar `tableStyles: {}` línea 187 y `setTableStyle` línea 252)
- Modify: `src/components/layout/PaperCanvas.tsx` (quitar selector línea 482 y `tableStyle` línea 1711)
- Test: `src/__tests__/storeTableStylesRetired.test.ts` (create)

**Interfaces:**
- Consumes: `updateElementTable` (fuente única del estilo).
- Produces: ausencia de `tableStyles`/`setTableStyle` en el store.

- [ ] **Step 1: Write the failing test**

```ts
import { useDocStore } from '../store/useDocStore';
it('tableStyles y setTableStyle ya no existen en el store', () => {
  const st: any = useDocStore.getState();
  expect(st.tableStyles).toBeUndefined();
  expect(st.setTableStyle).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails** → FAIL (existen).

- [ ] **Step 3: Eliminar** — borrar las 6 ocurrencias (Task file list). En `PaperCanvas.tsx` eliminar la línea `tableStyles` del destructuring/selector y la constante `tableStyle` (ya no la usa la tabla migrada). Si `tableStyle` se usa en otra rama, eliminarla también.

- [ ] **Step 4: Verificación de hidratación** — el estado persistido puede traer `tableStyles`; Zustand `persist` con `merge` debe descartar la clave desconocida sin romper. Correr `npm test -- --run src/__tests__/storeTableStylesRetired.test.ts` PASS y `npm test -- --run src/__tests__/` (smoke) sin fallos de store.

- [ ] **Step 5: Commit** — `git commit -m "refactor(store): retira tableStyles/setTableStyle, estilo vive en TableModel"`.

---

### Task 12: `InspectorActivoTabs` — estilo de tabla real

**Files:**
- Modify: `src/components/figures/InspectorActivoTabs.tsx` (tabs ~300-305; tab estilo ~699-723)
- Test: `src/components/figures/__tests__/inspectorTablaEstilo.test.tsx` (create)

**Interfaces:**
- Consumes: `TablaEstiloSelector`, `PRESETS_TABLA`, `tablaInfo.style`.

- [ ] **Step 1: Write the failing test** — con `elem.type === 'table'`, la pestaña Estilo está disponible y muestra el selector; elegir `zebra` llama `onUpdate('id', { style: 'zebra' })`.

- [ ] **Step 2: Run test to verify it fails** → FAIL.

- [ ] **Step 3: Mostrar la tab Estilo para tablas** — cambiar el arreglo `tabs`:

```ts
  const tabs: { key: InspectorTabKey; label: string; icon: LucideIcon }[] = [
    ...(esTabla ? [] : [{ key: 'formato' as const, label: 'Formato', icon: Sliders }]),
    { key: 'texto', label: 'Texto', icon: Type },
    { key: 'estilo', label: 'Estilo', icon: Palette },
    { key: 'calidad', label: 'Calidad', icon: ShieldCheck },
  ];
```

(Ahora `estilo` ya no se oculta para tablas; `formato` sigue siendo solo imagen.)

- [ ] **Step 4: Contenido de la tab** — en `{tabEfectiva === 'estilo' && (...)}`, ramificar:

```tsx
        {tabEfectiva === 'estilo' && (
          esTabla ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <span style={sectionLabel}>Estilo de tabla ({PRESETS_TABLA.length})</span>
              <TablaEstiloSelector
                valor={tablaInfo.style}
                onChange={(p) => handleUpdate({ style: p } as any)}
              />
            </div>
          ) : (
            /* ...bloque existente de STYLE_PRESETS de imagen sin cambios... */
          )
        )}
```

- [ ] **Step 5: Verificación** — `npm test -- --run src/components/figures/__tests__/inspectorTablaEstilo.test.tsx` PASS; `npx tsc --noEmit`.

- [ ] **Step 6: Commit** — `git commit -m "feat(inspector): tab Estilo de tabla con presets reales"`.

---

### Task 13: `LienzoEditorialActivo` — tabla con `TablaRender` editable + mascota compartida

**Files:**
- Modify: `src/components/figures/LienzoEditorialActivo.tsx` (tabla legacy ~197-247; mascota ~374-476; props ~16-50)
- Test: `src/components/figures/__tests__/LienzoEditorialActivo.test.tsx` (ajustar)

**Interfaces:**
- Consumes: `TablaRender`, `MascotaLeyendaIA`.
- Produces: prop nueva `onGenerarSuggestion?: () => void`; `tabla?: TableModel | null` (además de headers/rows se aceptan spans/style).

- [ ] **Step 1: Tabla editable** — reemplazar el `<table>` legacy por:

```tsx
        {esTabla ? (
          <TablaRender
            tabla={tablaCompleta}
            editable
            onEditarCelda={(fila, col, texto) => {
              if (!tablaCompleta) return;
              if (fila === 0) {
                const headers = [...tablaCompleta.headers];
                headers[col] = texto;
                onEditarCeldaTabla?.({ headers });
              } else {
                const rows = tablaCompleta.rows.map((r) => [...r]);
                rows[fila - 1][col] = texto;
                onEditarCeldaTabla?.({ rows });
              }
            }}
          />
        ) : ( /* ...marco de imagen sin cambios... */ )}
```

con `tablaCompleta` derivado de `tabla` (headers/rows + spans/style si vienen) y prop nueva `onEditarCeldaTabla?: (patch: { headers?: string[]; rows?: string[][] }) => void`.

- [ ] **Step 2: Mascota compartida** — reemplazar el bloque `{aiSuggestion && (...)}` (374-476) por:

```tsx
      <MascotaLeyendaIA
        sugerida={aiSuggestion ? { titulo: aiSuggestion.suggestedTitle, nota: aiSuggestion.suggestedNote, confianza: aiSuggestion.confidence } : undefined}
        onGenerar={onGenerarSuggestion ?? (() => {})}
        onAplicar={onApplyCaption}
        onRegenerar={onRegenerateSuggestion}
      />
```

- [ ] **Step 3: Ajustar tests** — `LienzoEditorialActivo.test.tsx`: la mascota con `aiSuggestion` sigue mostrando "Aplicar"/"Regenerar"; sin sugerencia ahora aparece el botón "Generar leyenda con IA" (antes no había mascota). Actualizar el caso "no mascota sin suggestion" a "botón de generar sin suggestion".

- [ ] **Step 4: Verificación** — `npm test -- --run src/components/figures/__tests__/LienzoEditorialActivo.test.tsx` PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(taller): tabla TablaRender editable y mascota compartida"`.

---

### Task 14: `TallerFigurasView` — sugerencia opt-in (sin gasto automático)

**Files:**
- Modify: `src/components/figures/TallerFigurasView.tsx` (useEffect 184-206; handles ~260-309; render ~430-440)
- Test: `src/components/figures/__tests__/TallerFigurasView.test.tsx` (ajustar)

**Interfaces:**
- Consumes: `onGenerarSuggestion` de `LienzoEditorialActivo` (Task 13); `onEditarCeldaTabla`.

- [ ] **Step 1: Quitar el fetch automático** — eliminar el `useEffect` de 184-206 que llama `suggestCaption` al montar. Conservar `solicitadas`? No: ya no se usa; eliminarlo si queda sin uso.

- [ ] **Step 2: Handler explícito** — reusar `handleRegenerateSuggestion` como generación bajo demanda; pasarlo a `LienzoEditorialActivo` como `onGenerarSuggestion`. Conectar `onEditarCeldaTabla` a `updateElementTable`.

- [ ] **Step 3: Ajustar tests** — `TallerFigurasView.test.tsx:228`: el caso de regenerar pasa a: primero clic en "Generar leyenda con IA" (que dispara la llamada) y luego el flujo de regenerar. Añadir assert de que **no** se llamó `suggestCaption` al montar.

- [ ] **Step 4: Verificación** — `npm test -- --run src/components/figures/__tests__/TallerFigurasView.test.tsx` PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(taller): leyenda IA solo bajo demanda, cero tokens automaticos"`.

---

### Task 15: Backend `TableModel` — persistir extras

**Files:**
- Modify: `python/models.py` (CellSpan near line 61; TableModel line 436)
- Test: `python/tests/test_table_model_extras.py` (create)

**Interfaces:**
- Produces: `CellSpan`, `TableModel.header_spans/row_spans/style/orientation/column_widths`.

- [ ] **Step 1: Write the failing test**

```python
from python.models import TableModel, CellSpan

def test_table_model_extras_roundtrip():
    t = TableModel(
        element_id="t1", headers=["A"], rows=[["1"]],
        header_spans=[CellSpan(col=1, row=1)],
        row_spans=[[CellSpan(col=1, row=1)]],
        style="zebra", orientation="landscape", column_widths=[0.5, 0.5],
    )
    again = TableModel.model_validate(t.model_dump())
    assert again.style == "zebra"
    assert again.orientation == "landscape"
    assert again.column_widths == [0.5, 0.5]
    assert again.header_spans[0].col == 1

def test_table_model_defaults():
    t = TableModel(element_id="t")
    assert t.style == "apa"
    assert t.orientation == "auto"
    assert t.header_spans is None
```

- [ ] **Step 2: Run test to verify it fails** — `pytest -q python/tests/test_table_model_extras.py` → FAIL.

- [ ] **Step 3: Implement** — en `python/models.py`:

```python
class CellSpan(BaseModel):
    col: int = 1
    row: int = 1
```

y en `TableModel`:

```python
    header_spans: Optional[list[CellSpan]] = None
    row_spans: Optional[list[list[CellSpan]]] = None
    style: str = "apa"            # TableStylePreset de la UI
    orientation: str = "auto"     # auto | portrait | landscape
    column_widths: Optional[list[float]] = None
```

- [ ] **Step 4: Run test to verify it passes** — `pytest -q python/tests/test_table_model_extras.py` PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(modelos): TableModel persiste estilo, orientacion y spans"`.

---

### Task 16: Export — borde, orientación y anchos por tabla

**Files:**
- Modify: `python/generation/table_engine.py` (`borde_de_preset`; `fit_table_to_page` acepta `column_widths`)
- Modify: `python/generation/generator.py` (línea 1447-1450 orientación; 1470-1472 borde/anchos)
- Test: `python/tests/test_table_export_preset.py` (create)

**Interfaces:**
- Produces: `borde_de_preset(style: Optional[str]) -> str`; `fit_table_to_page(..., column_widths=None)`.

- [ ] **Step 1: Write the failing test**

```python
from python.generation.table_engine import borde_de_preset

def test_borde_de_preset():
    assert borde_de_preset("apa") == "apa"
    assert borde_de_preset("compact") == "apa"
    assert borde_de_preset("expanded") == "apa"
    assert borde_de_preset("grid") == "grid"
    assert borde_de_preset("zebra") == "grid"
    assert borde_de_preset(None) == "apa"
```

- [ ] **Step 2: Run test to verify it fails** → FAIL.

- [ ] **Step 3a: Implement `borde_de_preset`** en `table_engine.py`:

```python
def borde_de_preset(style: Optional[str]) -> str:
    """Los presets de acento (compact/expanded/zebra) colapsan al borde que el export entiende."""
    return "grid" if style in ("grid", "zebra") else "apa"
```

- [ ] **Step 3b: `column_widths` en `fit_table_to_page`** — agregar parámetro `column_widths: Optional[list[float]] = None` y, antes del `try/except` de anchos existentes (línea ~157):

```python
    if column_widths and len(column_widths) == column_count and sum(column_widths) > 0:
        _suma = sum(column_widths)
        widths = [max(0.75, available_width * (w / _suma)) for w in column_widths]
    else:
        try:
            existing_widths = [col.width.inches for col in table.columns if col.width]
            total_existing = sum(existing_widths)
            if total_existing > 0:
                scale = available_width / total_existing
                widths = [max(0.75, w * scale) for w in existing_widths]
        except Exception:
            widths = []
```

(El `if not widths:` de fallback a uniforme se conserva tal cual.)

- [ ] **Step 3c: Generador** — en `generator.py` 1447-1450:

```python
            table_needs_landscape = False
            if elem.table_info:
                _orient = getattr(elem.table_info, 'orientation', 'auto') or 'auto'
                if _orient == 'landscape':
                    table_needs_landscape = True
                elif _orient == 'auto':
                    too_many, too_wide = _is_table_too_wide(elem.table_info)
                    table_needs_landscape = too_many or too_wide
```

y en 1470-1472:

```python
                set_table_borders(curr_tbl, borde_de_preset(getattr(elem.table_info, 'style', None)))
                fit_table_to_page(
                    curr_tbl, rules, landscape=table_needs_landscape,
                    column_widths=getattr(elem.table_info, 'column_widths', None),
                )
```

Asegurar el import `from .table_engine import borde_de_preset` (o el import existente de `set_table_borders`).

- [ ] **Step 4: Run test to verify it passes** — `pytest -q python/tests/test_table_export_preset.py` PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(export): borde, orientacion y anchos por tabla"`.

---

### Task 17: Verificación de rama completa

**Files:** ninguno (solo verificación).

- [ ] **Step 1:** `npx tsc --noEmit` → sin errores.
- [ ] **Step 2:** `npm test -- --run` → suite Vitest completa en verde.
- [ ] **Step 3:** `pytest -q python/tests/` → suite backend en verde.
- [ ] **Step 4:** `npm run build` → build de producción OK.
- [ ] **Step 5:** `graphify update .` → grafo sincronizado (extracción local, 0 tokens).
- [ ] **Step 6:** Revisión final contra el spec: cada D-1…D-8 tiene su tarea; Review Focus con sus tests. Commit final si hubo ajustes.

---

## Self-Review

**Spec coverage:**
- O1 (sin recorte): Task 3, 4, 6, 9, 10.
- O2 (estilos reales): Task 1, 7, 10, 12, 15, 16.
- O3 (sección Estilo de solo-ícono): Task 7, 10, 12.
- O4 (leyenda IA con mascota/botón, sin gasto): Task 8, 10, 13, 14.
- D-1: Task 11, 12, 15. D-2: Task 1, 7. D-3: Task 16. D-4: Task 2, 15. D-5: Task 10, 13. D-6: Task 5, 10, 13. D-7: Task 3, 4, 6, 9, 10. D-8: Task 8, 10, 13, 14.
- WS5 (spans render/export): Task 2 (rebanada), Task 15 (persistencia). El render de spans ya vive en `matrizDeTabla`/`TablaRender`.

**Placeholders:** ninguno; cada paso trae código o edición exacta.

**Type consistency:** `table_slice.{start,end}` (Task 4) ↔ `rebanadaDeTabla(inicio,fin)` (Task 2) ↔ uso en Task 10. `FlowChunk.startRow/endRow` (Task 3) ↔ consumo en Task 4. `MascotaLeyendaIA` props (Task 8) ↔ usos en Task 10 y Task 13. `borde_de_preset` (Task 16) ↔ test.

**Review Focus:** las cinco clases tienen test en su tarea dueña (2, 3, 6/9, 11, 7/16).
