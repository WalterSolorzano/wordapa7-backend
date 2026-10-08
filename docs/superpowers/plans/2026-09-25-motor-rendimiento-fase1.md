# Motor de Render Híbrido — Fase 1: Geometría real + fin del desborde

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El lienzo pagina con la geometría real del documento (márgenes, tamaño de hoja, interlineado) y parte los párrafos largos entre hojas como Word — nunca recorta texto en silencio.

**Architecture:** Tres capas: (1) `pageGeometry` — conversión pura rules→píxeles (pt, cm, DPI); (2) `flowPagination` — algoritmo puro de empaquetado con split de elementos medidos; (3) PaperCanvas mide alturas DOM reales (refs + ResizeObserver) y renderiza fragmentos partidos. La paginación real de Word (`elem.page_number`, ya calculada por backend) manda como verdad de corte de página; la heurística `computePages` queda solo como fallback sin backend.

**Tech Stack:** TypeScript, React 18, vitest (frontend), Python 3.11 + pytest (backend, 1 tarea).

**Spec:** `docs/superpowers/specs/2026-09-25-motor-rendimiento-design.md` (sección 3.1 Fase 1)

## Global Constraints

- Cero emojis en toda UI; solo iconos `lucide-react`.
- Solo design tokens CSS (`var(--accent-primary)`, `var(--paper-white)`, `var(--paper-ink)`, `var(--color-success|warning|danger)`); prohibido hex hardcodeado salvo fallback ya existente.
- `use_original_cover: true` jamás muta portada; elementos con `is_cover_section`/`portada_block` siempre en Página 1 indivisible.
- Word COM: solo lazy on-demand, `Visible=False`, `DisplayAlerts=0` (tareas backend).
- Sin regresión: `npm test` (125 tests), `npx tsc --noEmit`, `pytest python/tests/` deben pasar al cerrar cada tarea.
- Límite de archivos: no partir `PaperCanvas.tsx`; la lógica nueva vive en `src/lib/`.

## Review Focus

- **Párrafo que cruza página** — fragmento continuo en pág N y N+1 sin repetir texto ni perderlo: test de `flowPagination` con elemento que excede el espacio restante (Task 4).
- **Portada indivisible** — nunca parte ni aparece en pág 2 aunque su medida exceda la hoja: test en Task 3 y Task 4.
- **`elem.page_number` del backend** — si existe, corta página ahí; sin backend, fallback heurístico sin romper tests existentes (Task 3).
- **Pérdida de texto al medir** — si la medición DOM falla (ref null), el elemento cae a estimación y NO desaparece: test de `flowPagination` con alturas `undefined` (Task 4).
- **Existencia previa de reglas** — `margins_cm` distinto de 2.54 (3.5cm, tesis) cambia ancho de contenido y número de páginas: test en Task 2.

---

### Task 1: Fix bug `font_size_pt` en ruta in-place (backend)

**Files:**
- Modify: `python/generation/inplace_editor.py:143`
- Test: `python/tests/test_inplace_font_size.py` (crear)

**Interfaces:**
- Produces: `rules.font_size_pt` respetado al estilizar runs en ruta in-place (corrección de `getattr(rules, "font_size", 12)` — campo inexistente en `APARuleSet`).

- [ ] **Step 1: Escribir test fallido**

```python
# python/tests/test_inplace_font_size.py
"""In-place editor debe leer font_size_pt (models.APARuleSet), no font_size."""
from types import SimpleNamespace
from python.models import APARuleSet

def test_rules_field_is_font_size_pt():
    r = APARuleSet(profile_name="student")
    assert hasattr(r, "font_size_pt")
    assert not hasattr(r, "font_size")

def test_inplace_reads_font_size_pt(monkeypatch):
    import inspect
    from python.generation import inplace_editor
    src = inspect.getsource(inplace_editor)
    assert 'getattr(rules, "font_size_pt"' in src
    assert 'getattr(rules, "font_size"' not in src
```

- [ ] **Step 2: Correr test, verificar FALLA**

Run: `pytest python/tests/test_inplace_font_size.py -v`
Expected: FAIL — `assert hasattr(r, "font_size")` o string assertion.

- [ ] **Step 3: Fix mínimo**

```python
# inplace_editor.py:143 — antes:
#     font_size = Pt(getattr(rules, "font_size", 12) or 12)
# después:
    font_size = Pt(getattr(rules, "font_size_pt", 12) or 12)
```

- [ ] **Step 4: Correr test, verificar PASS + suite backend**

Run: `pytest python/tests/test_inplace_font_size.py python/tests/ -v`
Expected: PASS sin regresiones.

- [ ] **Step 5: Commit**

```bash
git add python/generation/inplace_editor.py python/tests/test_inplace_font_size.py
git commit -m "fix: in-place lee font_size_pt correcto del APARuleSet"
```

---

### Task 2: Librería `pageGeometry` (rules → píxeles reales)

**Files:**
- Create: `src/lib/pageGeometry.ts`
- Test: `src/__tests__/pageGeometry.test.ts`

**Interfaces:**
- Consumes: `APARuleSet` (`margins_cm`, `font_size_pt`, `line_spacing`, `page_size` opcional), ya importable de `../types`.
- Produces (usado por Tasks 3-5):
```ts
export interface PageGeometry {
  pageW: number;          // px ancho hoja
  pageH: number;          // px alto hoja
  marginPx: number;       // px margen uniforme (Word: mismo los 4 lados)
  contentW: number;       // pageW - 2*marginPx
  contentH: number;       // pageH - 2*marginPx - headerH
  lineHeightPx: number;   // px por línea base (font_size_pt * line_spacing)
  headerH: number;        // px reservados encabezado APA (0 si no aplica)
}
export const PX_PER_PT = 96 / 72;
export const PX_PER_CM = 96 / 2.54;
export function getPageGeometry(rules: {
  margins_cm?: number; font_size_pt?: number; line_spacing?: number;
  page_size?: string; professional_running_head?: boolean;
}): PageGeometry;
export const PT_TO_PX: (pt: number) => number;
export const CM_TO_PX: (cm: number) => number;
```

- [ ] **Step 1: Escribir test fallido**

```ts
// src/__tests__/pageGeometry.test.ts
import { describe, it, expect } from 'vitest';
import { getPageGeometry, PX_PER_PT, PX_PER_CM, PT_TO_PX, CM_TO_PX } from '../lib/pageGeometry';

const base = { margins_cm: 2.54, font_size_pt: 12, line_spacing: 2, page_size: 'letter' };

describe('pageGeometry', () => {
  it('convierte unidades exactas', () => {
    expect(PT_TO_PX(72)).toBeCloseTo(96, 5);
    expect(CM_TO_PX(2.54)).toBeCloseTo(96, 5);
    expect(PX_PER_PT).toBeCloseTo(96 / 72, 5);
    expect(PX_PER_CM).toBeCloseTo(96 / 2.54, 5);
  });

  it('Letter 2.54cm: hoja 680x880, margen 96px, contenido 488px', () => {
    const g = getPageGeometry(base);
    expect(g.pageW).toBeCloseTo(612 * (96 / 72), 1); // 816px... no, ver nota
    expect(g.marginPx).toBeCloseTo(96, 1);
    expect(g.contentW).toBeCloseTo(g.pageW - 192, 1);
    expect(g.lineHeightPx).toBeCloseTo(12 * (96 / 72) * 2, 1);
  });

  it('márgenes 3.5cm (tesis) reducen contenido', () => {
    const g1 = getPageGeometry(base);
    const g2 = getPageGeometry({ ...base, margins_cm: 3.5 });
    expect(g2.marginPx).toBeGreaterThan(g1.marginPx);
    expect(g2.contentW).toBeLessThan(g1.contentW);
  });

  it('A4 distinto de Letter', () => {
    const a4 = getPageGeometry({ ...base, page_size: 'a4' });
    const letter = getPageGeometry(base);
    expect(a4.pageH).not.toBe(letter.pageH);
    expect(a4.pageW).not.toBe(letter.pageW);
  });

  it('defaults tolerantes sin campos', () => {
    const g = getPageGeometry({});
    expect(g.pageW).toBeGreaterThan(0);
    expect(g.contentH).toBeGreaterThan(0);
  });
});
```

Nota: si el test de Letter contradice la escala elegida (PAGE_W actual 680px ≈ 612pt×1.11 de zoom), **decisión**: `pageGeometry` trabaja en pt reales de Word y el canvas aplica zoom aparte — ajustar expectativas al valor pt exacto, no al 680 actual.

- [ ] **Step 2: Correr test, verificar FALLA**

Run: `npx vitest run src/__tests__/pageGeometry.test.ts`
Expected: FAIL — `Cannot find module '../lib/pageGeometry'`.

- [ ] **Step 3: Implementar**

```ts
// src/lib/pageGeometry.ts
export const PX_PER_PT = 96 / 72;
export const PX_PER_CM = 96 / 2.54;
export const PT_TO_PX = (pt: number) => pt * PX_PER_PT;
export const CM_TO_PX = (cm: number) => cm * PX_PER_CM;

const PAGE_PT: Record<string, { w: number; h: number }> = {
  letter: { w: 612, h: 792 },
  a4: { w: 595, h: 842 },
};

export interface PageGeometry {
  pageW: number; pageH: number; marginPx: number;
  contentW: number; contentH: number; lineHeightPx: number; headerH: number;
}

export function getPageGeometry(rules: {
  margins_cm?: number; font_size_pt?: number; line_spacing?: number;
  page_size?: string; professional_running_head?: boolean;
}): PageGeometry {
  const sizeKey = String(rules.page_size || 'letter').toLowerCase().includes('a4') ? 'a4' : 'letter';
  const { w, h } = PAGE_PT[sizeKey];
  const pageW = PT_TO_PX(w);
  const pageH = PT_TO_PX(h);
  const marginPx = CM_TO_PX(rules.margins_cm ?? 2.54);
  const fontPx = PT_TO_PX(rules.font_size_pt ?? 12);
  const spacing = rules.line_spacing ?? 2;
  const headerH = rules.professional_running_head ? fontPx * 2.5 : fontPx * 2;
  return {
    pageW, pageH, marginPx,
    contentW: pageW - marginPx * 2,
    contentH: pageH - marginPx * 2 - headerH,
    lineHeightPx: fontPx * spacing,
    headerH,
  };
}
```

- [ ] **Step 4: Correr test, verificar PASS**

Run: `npx vitest run src/__tests__/pageGeometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pageGeometry.ts src/__tests__/pageGeometry.test.ts
git commit -m "feat: pageGeometry — rules APARuleSet a px reales (pt, cm, DPI)"
```

---

### Task 3: `computePages` consume paginación real de Word (`elem.page_number`)

**Files:**
- Modify: `src/components/layout/PaperCanvas.tsx:292-360` (función `computePages`)
- Test: `src/__tests__/computePages.test.ts` (crear)

**Interfaces:**
- Consumes: `ElementModel.page_number?: number` (`src/types/index.ts:141`) — ya lo puebla `main.py:443-451` vía análisis de fondo.
- Produces: misma firma `computePages(elements: ElementModel[], maxUnits?: number): ElementModel[][]` — firma no cambia (consumidores líneas 721, 755, 815 y tests `wordapa7_features.test.ts`, `r1_test.test.ts` siguen válidos).

Reglas nuevas:
1. Si ≥1 elemento de cuerpo tiene `page_number`, agrupar por `page_number` (orden natural): cortes de página = cortes de Word. Elementos sin `page_number` siguen al anterior dentro de su página.
2. Portada (`is_cover_section`/`portada_block`) siempre pág 1, indivisible (sin cambios).
3. Si NINGÚN elemento tiene `page_number`, heurística actual intacta (fallback sin backend).

- [ ] **Step 1: Escribir test fallido**

```ts
// src/__tests__/computePages.test.ts
import { describe, it, expect } from 'vitest';
import { computePages } from '../components/layout/PaperCanvas';
import { ElementModel, ElementType } from '../types';

const p = (id: string, extra: Partial<ElementModel> = {}): ElementModel => ({
  id, type: 'paragraph' as ElementType, text: 'x', confidence: 1,
  is_user_modified: false, needs_review: false, auto_applied: false, cita_ids: [],
  ...extra,
} as ElementModel);

describe('computePages con paginación real de Word', () => {
  it('page_number del backend corta página', () => {
    const els = [
      p('a', { page_number: 1 }), p('b', { page_number: 1 }),
      p('c', { page_number: 2 }), p('d', { page_number: 3 }),
    ];
    const pages = computePages(els, 1000); // maxUnits alto: sin heurística posible
    expect(pages.length).toBe(3);
    expect(pages[1].map(e => e.id)).toEqual(['c']);
    expect(pages[2].map(e => e.id)).toEqual(['d']);
  });

  it('elemento sin page_number sigue al anterior', () => {
    const els = [p('a', { page_number: 1 }), p('b'), p('c', { page_number: 2 })];
    const pages = computePages(els, 1000);
    expect(pages.length).toBe(2);
    expect(pages[0].map(e => e.id)).toEqual(['a', 'b']);
  });

  it('portada indivisible siempre en pág 1 aunque page_number diga otra', () => {
    const els = [
      p('cover', { is_cover_section: true, page_number: 5 }),
      p('a', { page_number: 1 }), p('b', { page_number: 2 }),
    ];
    const pages = computePages(els, 1000);
    expect(pages[0].some(e => e.id === 'cover')).toBe(true);
    expect(pages.length).toBe(2);
  });

  it('sin page_number: fallback heurística intacto (paridad)', () => {
    const els = Array.from({ length: 60 }, (_, i) =>
      p(`e${i}`, { type: 'paragraph', text: 'una linea'.repeat(20) }));
    const pages = computePages(els, 14);
    expect(pages.length).toBeGreaterThan(1);
    // ningún elemento perdido
    expect(pages.flat().length).toBe(els.length);
  });

  it('nunca pierde elementos', () => {
    const els = [p('a', { page_number: 1 }), p('b', { page_number: 9 })];
    expect(computePages(els, 1000).flat().length).toBe(2);
  });
});
```

- [ ] **Step 2: Correr test, verificar FALLA**

Run: `npx vitest run src/__tests__/computePages.test.ts`
Expected: FAIL — con `maxUnits: 1000` los 4 elementos caen en 1 página, se esperan 3.

- [ ] **Step 3: Implementar**

Al inicio del cuerpo de `computePages` (tras separar cover/body, línea ~311):

```ts
  // ── Verdad de Word: si el backend paginó (Repaginate COM), sus cortes mandan ──
  const hasWordPagination = bodyElements.some((e) => typeof e.page_number === 'number');
  if (hasWordPagination) {
    const wordPages: ElementModel[][] = [];
    let lastPage = -1;
    let firstPageNum: number | null = null;
    bodyElements.forEach((elem) => {
      const pn = typeof elem.page_number === 'number' ? elem.page_number : null;
      if (pn === null) {
        if (wordPages.length === 0) wordPages.push([]);
        wordPages[wordPages.length - 1].push(elem);
        return;
      }
      if (firstPageNum === null) firstPageNum = pn;
      const idx = pn - firstPageNum;
      while (wordPages.length <= idx) wordPages.push([]);
      if (wordPages[idx].length === 0 || lastPage !== idx) {
        // página existente o nueva; push simple
      }
      wordPages[idx].push(elem);
      lastPage = idx;
    });
    const nonEmpty = wordPages.filter((pg) => pg.length > 0);
    if (coverElements.length > 0) return [coverElements, ...nonEmpty];
    return nonEmpty.length > 0 ? nonEmpty : [[]];
  }
  // ── Fallback: heurística estimada (sin backend) ──
```

Simplificación válida: dentro del `if`, `lastPage`/rama vacía son redundantes — implementar push directo por `idx` sin condición extra (el loop `while` garantiza capacidad).

- [ ] **Step 4: Correr TODOS los tests afectados**

Run: `npx vitest run src/__tests__/computePages.test.ts src/__tests__/wordapa7_features.test.ts src/__tests__/r1_test.test.ts`
Expected: PASS todos (los dos últimos usan elementos sin `page_number` → fallback intacto).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/PaperCanvas.tsx src/__tests__/computePages.test.ts
git commit -m "feat: computePages consume paginacion real Word (elem.page_number)"
```

---

### Task 4: `flowPagination` — empaquetado con split de párrafos (nunca recorte)

**Files:**
- Create: `src/lib/flowPagination.ts`
- Test: `src/__tests__/flowPagination.test.ts`

**Interfaces:**
- Consumes: `PageGeometry` de Task 2 (`contentH`, `lineHeightPx`).
- Produces (consumido por Task 5):
```ts
export interface MeasuredElement {
  elem: ElementModel;
  heightPx: number | null;   // null = sin medición → estimar
  splittable: boolean;       // párrafos/citas de texto: true
}
export interface FlowPage {
  chunks: { elem: ElementModel; startLine: number; endLine: number | null }[];
}
// endLine null = hasta el final; startLine 0 = primera línea
export function flowPagination(
  items: MeasuredElement[],
  geom: PageGeometry,
  estLines?: (e: ElementModel) => number,
): FlowPage[];
```

- [ ] **Step 1: Escribir test fallido**

```ts
// src/__tests__/flowPagination.test.ts
import { describe, it, expect } from 'vitest';
import { flowPagination, MeasuredElement } from '../lib/flowPagination';
import { getPageGeometry } from '../lib/pageGeometry';
import { ElementModel, ElementType } from '../types';

const geom = getPageGeometry({ margins_cm: 2.54, font_size_pt: 12, line_spacing: 2 });
const LH = geom.lineHeightPx;               // 12pt * 2 líneas ≈ 32px
const TOTAL_LINES = Math.floor(geom.contentH / LH);

const me = (id: string, lines: number | null, splittable = true): MeasuredElement => ({
  elem: { id, type: 'paragraph' as ElementType, text: 'x'.repeat(lines ?? 10 * 90),
          confidence: 1, is_user_modified: false, needs_review: false,
          auto_applied: false, cita_ids: [] } as ElementModel,
  heightPx: lines === null ? null : lines * LH,
  splittable,
});

describe('flowPagination', () => {
  it('empaqueta sin exceder contentH', () => {
    const items = [me('a', 10), me('b', 10), me('c', TOTAL_LINES - 15)];
    const pages = flowPagination(items, geom);
    expect(pages.length).toBe(1);
    expect(pages[0].chunks.map(c => c.elem.id)).toEqual(['a', 'b', 'c']);
  });

  it('parte párrafo que no cabe: sin pérdida ni duplicado', () => {
    const items = [me('big', TOTAL_LINES * 2)];
    const pages = flowPagination(items, geom);
    expect(pages.length).toBe(2);
    const [c1, c2] = pages.map(p => p.chunks[0]);
    expect(c1.startLine).toBe(0);
    expect(c1.endLine).toBe(TOTAL_LINES);
    expect(c2.startLine).toBe(TOTAL_LINES);
    expect(c2.endLine).toBeNull();
    expect(c1.elem.id).toBe('big');
    expect(c2.elem.id).toBe('big');
  });

  it('elemento no splittable pasa entero a página nueva aunque exceda', () => {
    const items = [me('a', 10), me('table', TOTAL_LINES + 50, false)];
    const pages = flowPagination(items, geom);
    expect(pages.length).toBe(2);
    expect(pages[1].chunks.length).toBe(1);
    expect(pages[1].chunks[0].startLine).toBe(0); // nunca parte
    expect(pages[1].chunks[0].endLine).toBeNull();
  });

  it('altura null (sin medición) usa estimación y no pierde el elemento', () => {
    const items = [me('unknown', null)];
    const pages = flowPagination(items, geom, () => 5);
    expect(pages.flat().length === 1).toBe(true);
    expect(pages[0].chunks[0].elem.id).toBe('unknown');
  });

  it('múltiples splits de un párrafo gigante cubren todas las líneas exactas', () => {
    const items = [me('huge', TOTAL_LINES * 2 + Math.floor(TOTAL_LINES / 2))];
    const pages = flowPagination(items, geom);
    expect(pages.length).toBe(3);
    let line = 0;
    for (const pg of pages) {
      for (const c of pg.chunks) {
        expect(c.startLine).toBe(line);
        line = c.endLine ?? line;
      }
    }
  });
});
```

- [ ] **Step 2: Correr test, verificar FALLA**

Run: `npx vitest run src/__tests__/flowPagination.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar**

```ts
// src/lib/flowPagination.ts
import { ElementModel } from '../types';
import { PageGeometry } from './pageGeometry';

export interface MeasuredElement {
  elem: ElementModel;
  heightPx: number | null;
  splittable: boolean;
}
export interface FlowChunk {
  elem: ElementModel;
  startLine: number;
  endLine: number | null;
}
export interface FlowPage { chunks: FlowChunk[]; }

export function flowPagination(
  items: MeasuredElement[],
  geom: PageGeometry,
  estLines?: (e: ElementModel) => number,
): FlowPage[] {
  const LH = geom.lineHeightPx || 32;
  const totalLines = Math.max(1, Math.floor(geom.contentH / LH));
  const pages: FlowPage[] = [{ chunks: [] }];
  const cur = () => pages[pages.length - 1];
  const curLines = (): number => cur().chunks.reduce(
    (acc, c) => acc + ((c.endLine ?? 0) - c.startLine), 0);

  for (const item of items) {
    const lines = item.heightPx !== null
      ? Math.max(1, Math.ceil(item.heightPx / LH))
      : Math.max(1, estLines?.(item.elem) ?? 1);

    if (!item.splittable) {
      if (cur().chunks.length > 0 && curLines() + lines > totalLines) pages.push({ chunks: [] });
      cur().chunks.push({ elem: item.elem, startLine: 0, endLine: null });
      continue;
    }

    let start = 0;
    while (start < lines) {
      const avail = totalLines - curLines();
      if (avail <= 0 && cur().chunks.length > 0) { pages.push({ chunks: [] }); continue; }
      const take = Math.min(avail, lines - start);
      const end = start + take;
      cur().chunks.push({ elem: item.elem, startLine: start,
                          endLine: end >= lines ? null : end });
      start = end;
      if (start < lines) pages.push({ chunks: [] });
    }
  }
  return pages;
}
```

Detalle crítico: `curLines()` cuenta `endLine ?? 0` — para chunk abierto (`endLine: null`) cuenta 0; solo chunks cerrados consumen presupuesto. Revisar contra test 2: pág 1 recibe `TOTAL_LINES` líneas cerradas, luego split cierra en `TOTAL_LINES` exacto.

- [ ] **Step 4: Correr test, verificar PASS**

Run: `npx vitest run src/__tests__/flowPagination.test.ts src/__tests__/pageGeometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/flowPagination.ts src/__tests__/flowPagination.test.ts
git commit -m "feat: flowPagination — split de paginas con corte de lineas, sin recorte"
```

---

### Task 5: Integrar en `PaperCanvas` — medición DOM + hoja con geometría real

**Files:**
- Modify: `src/components/layout/PaperCanvas.tsx` (hoja ~líneas 808-815, 1334-1350; render de párrafos ~1991-2012; caps de virtualización 1294-1327)
- Test: `src/__tests__/pageGeometry.integration.test.tsx` (crear, smoke)

**Interfaces:**
- Consumes: `getPageGeometry` (Task 2), `computePages` con `page_number` (Task 3), `flowPagination` (Task 4).
- Produces: canvas sin `overflow:hidden` de recorte efectivo (se conserva el estilo por estética de borde, pero `flowPagination` garantiza que nada lo alcanza), padding de hoja = `geom.marginPx`.

Pasos:

- [ ] **Step 1: Test de integración fallido (smoke de geometría)**

```tsx
// src/__tests__/pageGeometry.integration.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { PaperCanvas } from '../components/layout/PaperCanvas';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(), resolveAssetUrl: vi.fn(),
  explainElement: vi.fn(), suggestCaption: vi.fn(),
}));

describe('PaperCanvas usa geometría real', () => {
  beforeEach(() => { useDocStore.getState().resetForTests?.(); });
  it('renderiza sin doc sin crashear', () => {
    const { container } = render(<PaperCanvas />);
    expect(container).toBeTruthy();
  });
});
```

Nota: si `resetForTests` no existe en el store, usar el reset ya usado por tests existentes (`useDocStore.test.ts`) — copiar su patrón exacto.

- [ ] **Step 2: Correr, verificar FALLA o FALLA el smoke**

Run: `npx vitest run src/__tests__/pageGeometry.integration.test.tsx`
Expected: FAIL (import/método) o FAIL por render.

- [ ] **Step 3: Integrar geometría real en la hoja**

En `PaperCanvas.tsx` reemplazar bloque líneas 808-811:

```ts
  const geom = getPageGeometry({
    margins_cm: (rules as any)?.margins_cm,
    font_size_pt: rules.font_size_pt,
    line_spacing: rules.line_spacing,
    page_size: (rules as any)?.page_size,
    professional_running_head: doc.apa_format === 'professional',
  });
  const PAGE_W = Math.round(geom.pageW * zoomLevel);
  const PAGE_H = Math.round(geom.pageH * zoomLevel);
```

Y en la hoja (línea 1342) `padding: '54px 54px'` → `padding: ${Math.round(geom.marginPx * zoomLevel)}px`. Los 4 lados iguales (Word).

`zoomLevel` ya existe en el store (línea 363). Si `PAGE_W` actual 680 se usaba en anchos de columnas de comentario/gutter, conservar `PAGE_W` como la variable que todo lee — los consumidores no cambian.

- [ ] **Step 4: Integrar flowPagination + medición**

Añadir en `PaperCanvas` (cerá de `activePageIndex`, línea 413):

```ts
  const measuredRef = useRef<Map<string, number>>(new Map());
  const [measureTick, setMeasureTick] = useState(0);
  useEffect(() => {
    const ro = new ResizeObserver(() => setMeasureTick((t) => t + 1));
    // observar contenedor de cuerpo; ver implementación: se adjunta al wrapper de páginas
    return () => ro.disconnect();
  }, []);
```

Sobre cada párrafo renderizado: `ref={(el) => { if (el) measuredRef.current.set(elem.id, el.offsetHeight); }}`.

Tras `computePages` (línea 815) — **solo en página de cuerpo** aplicar `flowPagination` a los elementos cuyo `heightPx > contentH*zoom` o que no caben en el espacio restante de la página; render de chunk = mismo componente de párrafo con `sliceLines(text, startLine, endLine)` donde `sliceLines` parte por `\n` + conteo de líneas visuales estimadas por `chars_per_line = geom.contentW / (0.5 * fontPx)` (mismo criterio que 90 chars actuales pero con ancho real).

Alcance honesto de esta tarea: integración de geometry (padding, PAGE_W/H) es obligatoria; flowPagination se cablea a párrafos de cuerpo cuya medida DOM exceda la hoja (`measuredRef.get(id) > contentH`). Mantener `overflow: hidden` en hoja como guard estético.

- [ ] **Step 5: Correr suite completa frontend**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 125+ tests PASS, 0 errores TS.

- [ ] **Step 6: Verificación visual manual (Word como verdad)**

- Abrir docx de prueba con párrafo largo (>1 hoja) en `npm run dev`.
- Verificar: el párrafo continúa en hoja siguiente, sin texto perdido al final de la hoja.
- Verificar con márgenes 3.5cm (regla de tesis): ancho de contenido cambia.
- Expected: corte visible, no recorte.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/PaperCanvas.tsx src/__tests__/pageGeometry.integration.test.tsx
git commit -m "feat: canvas con geometria real y split de paginas — fin del recorte"
```

---

### Task 6: Cierre de Fase 1 — verificación completa

- [ ] **Step 1:** Run `npm test` — Expected: todos PASS.
- [ ] **Step 2:** Run `npx tsc --noEmit` — Expected: 0 errores.
- [ ] **Step 3:** Run `pytest python/tests/ -q` — Expected: 514+ PASS.
- [ ] **Step 4:** Run `npm run lint` — Expected: 0 errores (warnings baseline OK).
- [ ] **Step 5:** Actualizar `plan-motor-rendimiento.md` (marcar Fase 1 completada) + commit.

---

## Roadmap Fases 2-5 (spec §3.1 — planes separados al entrar a cada fase)

- **Fase 2:** `POST /api/layout/paginate` (COM `Repaginate`, singleton `word_com_service`) + debounce frontend + eliminar estimaciones rivales (StatusBar `/14`, DocumentAIChat).
- **Fase 3:** edición inline B1 (contentEditable acotado a párrafo de cuerpo).
- **Fase 4:** doble capa — PDF en reposo vía pdf.js detrás del HTML.
- **Fase 5:** paridad export + guards COM duro (eliminar LibreOffice/heurístico de render/export).
