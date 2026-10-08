# Revisión «Modo lectura» + Mapa IA dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sacar la IA de la pantalla de Revisión, rehacer Revisión como «Modo lectura» (Informe general → documento) y convertir el Mapa IA en un dashboard general→específico (hero + heatmap + capítulos como rectángulos + vista aislada por capítulo).

**Architecture:** La fase 5 sigue montada por `Step5AuditIAWizard`, que pasa de 3 a 4 pantallas: `gate | informe | reader | ai`. `gate` (`ReviewGate`) es la puerta con dos entradas. `informe` (`ReviewInforme`) es el aterrizaje de Revisión y muestra la calidad global (Bloom, repetición, salud por capítulo). `reader` (`ReviewReader`) es el modo lectura: hoja tipo libro, cinta de progreso de capítulos y dock de hallazgo; no hay rieles de categorías ni listas de hallazgos. `ai` (`AiRoom` → `AiHierarchy`) se reorganiza sobre hero + heatmap + rectángulos + capítulo aislado. Los datos derivados viven en módulos puros con test.

**Tech Stack:** React 18, TypeScript, Vite, Zustand (`useDocStore`), Vitest + Testing Library. Sin librerías de gráficas: SVG/CSS con design tokens.

**Spec:** `docs/superpowers/specs/2026-10-04-separar-revision-mapa-ia-design.md`
**Mockup de referencia:** `.superpowers/brainstorm/2018-1791167860/content/07-modo-lectura.html` (no versionado; `.superpowers/` está en `.gitignore`).

## Global Constraints

- Cero emojis en toda la UI; iconos solo de `lucide-react`.
- Solo design tokens CSS (`var(--...)`); prohibido hex hardcodeado. Lo vigilan `src/__tests__/noHardcodedColors.test.ts` y `designTokens.test.ts`.
- IA es probabilística: **solo «Marcar para revisar»**, nunca «Aceptar». La IA **no** aparece en Revisión: vive solo en `ai`.
- Motores objetivos (estilo, ortografía, estructura) sí ofrecen «Aceptar».
- Revisión sigue siendo **«un párrafo a la vez»**; no se reintroducen tres columnas ni `ReviewMinimap`.
- `ReadingText` es el **único** dueño del subrayado inline; su `source` sale de `useMarkSource`/`buildMarkSource`, no se normaliza en el punto de uso.
- Portada `readOnly`, sin `suggestion` ni acción de aceptar; `use_original_cover` no la muta.
- El rail de la app (56 px) y su flyout viven siempre; la fase 5 sigue siendo el paso `step-5`. No se parte.
- Los conteos de pendientes se derivan una sola vez de `src/lib/auditItems.ts` vía `src/lib/railPending.ts`. El heatmap **no** crea un conteo paralelo: solo agrupa los mismos `AuditItem` de categoría `ai`.
- No crear `vitest.config.ts`. Aceptación de la rama: `npm test` ≥ 1401 vitest, `npx tsc --noEmit` limpio, `pytest` ≥ 809, `npm run build` OK.
- Commits: usar `& 'C:\Program Files\Git\cmd\git.exe'` (el alias `snip` intercepta `git`). No `git add -A`. No `git worktree`.
- Verificar ausencia de CJK en cada archivo tocado antes de commitear.
- No tocar `LICENSE` ni `README.md`.

## Review Focus

- **Documento sin ningún H1**: `construirCapitulos` no debe romper; Revisión muestra el informe con franja vacía y «Leer y corregir» deshabilitado o con un capítulo «Documento completo».
- **Documento sin objetivos**: el bloque Bloom debe mostrar un estado vacío («No se detectaron objetivos»), no una tabla vacía ni `NaN`.
- **Hallazgos IA sin medición** (`aiScore === undefined`, clasificados por `ai_category`): entran en `sinMedir`, nunca en un bucket numérico.
- **Hallazgo cuyo `element_id` ya no existe** (texto borrado): `ReviewReader` no debe crashear; muestra «El texto de este hallazgo ya no está en el documento» y permite saltar.
- **Portada / elementos antes del primer H1**: no son capítulo navegable; no aparecen en la franja ni en el dock (zona protegida).
- **Muchísimos hallazgos** (28 IA hoy): el Mapa IA al entrar solo pinta hero + heatmap + rectángulos; el detalle vive tras el clic en un capítulo.

---

## File Structure

- `src/lib/capitulosRevision.ts` — **nuevo, puro**. Capítulos H1 del documento y mapeo elemento→capítulo.
- `src/lib/informeRevision.ts` — **nuevo, puro**. Repetición de palabras del cuerpo completo.
- `src/lib/contentReview.ts` — **modificar** (aditivo). Exportar `BLOOM_LEVELS`, `bloomLevel` y nuevo `objetivosBloom`.
- `src/lib/aiHeatmap.ts` — **nuevo, puro**. Bucketing H1 × rango de índice IA.
- `src/components/review/ReviewGate.tsx` — **modificar**. Total sin IA; filas sin IA.
- `src/components/review/ReviewInforme.tsx` — **nuevo**. R1 Informe general.
- `src/components/review/ReviewReader.tsx` — **nuevo**. R2 Modo lectura.
- `src/components/review/AiHeatmap.tsx` — **nuevo**. Gráfico de calor.
- `src/components/review/AiChapterGrid.tsx` — **nuevo**. Rectángulos por capítulo.
- `src/components/review/AiChapterFocus.tsx` — **nuevo**. Vista aislada de un capítulo.
- `src/components/review/AiHierarchy.tsx` — **modificar**. Hero + heatmap + grid + focus; bug `aiScore`.
- `src/components/wizard/Step5AuditIAWizard.tsx` — **modificar**. Rutas `informe | reader`.
- Tests: `src/__tests__/capitulosRevision.test.ts`, `informeRevision.test.ts`, `aiHeatmap.test.ts`, `reviewInforme.test.tsx`, `reviewReader.test.tsx`, y extensiones en `contentReview.test.ts` y `aiHierarchy.test.tsx`. Ajustar `reviewWorkbench.test.tsx` (flujo de la fase 5).

---

### Task 1: Capítulos de Revisión (módulo puro)

**Files:**
- Create: `src/lib/capitulosRevision.ts`
- Test: `src/__tests__/capitulosRevision.test.ts`

**Interfaces:**
- Produces:
  - `interface CapituloRevision { id: string; titulo: string; elementoId: string; index: number; elementIds: string[] }`
  - `function construirCapitulos(elements: readonly ElementModel[]): CapituloRevision[]`
  - `function capituloDeElemento(caps: readonly CapituloRevision[], elementId: string): CapituloRevision | null`
  - `function contarPorCapitulo(items: readonly AuditItem[], caps: readonly CapituloRevision[]): Record<string, number>`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/capitulosRevision.test.ts
import { describe, it, expect } from 'vitest';
import { construirCapitulos, capituloDeElemento, contarPorCapitulo } from '../lib/capitulosRevision';
import type { ElementModel } from '../types';
import type { AuditItem } from '../lib/auditItems';

const el = (id: string, type: string, heading_level: number | null, text: string): ElementModel =>
  ({ id, type, heading_level, text } as ElementModel);

const docs = [
  el('p0', 'paragraph', null, 'Portada'),
  el('h1', 'heading', 1, '1. Introducción'),
  el('p1', 'paragraph', null, 'Texto intro'),
  el('h2', 'heading', 2, '1.1 Sub'),
  el('p2', 'paragraph', null, 'Más texto'),
  el('h3', 'heading', 1, '2. Metodología'),
  el('p3', 'paragraph', null, 'Método'),
];

const item = (id: string, element_id: string): AuditItem =>
  ({ id, element_id, category: 'style', subtype: 'x', severity: 'medium', summary: '', detail: '', originalText: '', pageNumber: null, phase: null, readOnly: false }) as AuditItem;

describe('construirCapitulos', () => {
  it('abre un capítulo por cada H1 y lo cierra en el siguiente H1', () => {
    const caps = construirCapitulos(docs);
    expect(caps.map((c) => c.titulo)).toEqual(['1. Introducción', '2. Metodología']);
    expect(caps[0].elementIds).toEqual(['h1', 'p1', 'h2', 'p2']);
    expect(caps[1].elementIds).toEqual(['h3', 'p3']);
  });

  it('ignora lo anterior al primer H1 (portada)', () => {
    const caps = construirCapitulos(docs);
    expect(caps.some((c) => c.elementIds.includes('p0'))).toBe(false);
  });

  it('no rompe con un documento sin H1', () => {
    expect(construirCapitulos([el('p', 'paragraph', null, 'solo texto')])).toEqual([]);
  });

  it('mapea un elemento a su capítulo', () => {
    const caps = construirCapitulos(docs);
    expect(capituloDeElemento(caps, 'p2')?.titulo).toBe('1. Introducción');
    expect(capituloDeElemento(caps, 'p3')?.titulo).toBe('2. Metodología');
    expect(capituloDeElemento(caps, 'p0')).toBeNull();
  });

  it('cuenta hallazgos por capítulo', () => {
    const caps = construirCapitulos(docs);
    const counts = contarPorCapitulo([item('a', 'p1'), item('b', 'p2'), item('c', 'p3'), item('d', 'nope')], caps);
    expect(counts).toEqual({ h1: 2, h3: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/capitulosRevision.test.ts`
Expected: FAIL — no existe `../lib/capitulosRevision`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/capitulosRevision.ts
import type { ElementModel } from '../types';
import type { AuditItem } from './auditItems';

export interface CapituloRevision {
  /** id del elemento H1 que abre el capítulo. */
  id: string;
  titulo: string;
  elementoId: string;
  index: number;
  elementIds: string[];
}

export function construirCapitulos(elements: readonly ElementModel[]): CapituloRevision[] {
  const caps: CapituloRevision[] = [];
  for (const e of elements) {
    const esH1 = e.type === 'heading' && e.heading_level === 1;
    if (esH1) {
      caps.push({
        id: e.id,
        titulo: (e.text || '').trim() || 'Capítulo sin título',
        elementoId: e.id,
        index: caps.length,
        elementIds: [e.id],
      });
    } else if (caps.length > 0) {
      caps[caps.length - 1].elementIds.push(e.id);
    }
  }
  return caps;
}

export function capituloDeElemento(
  caps: readonly CapituloRevision[],
  elementId: string,
): CapituloRevision | null {
  return caps.find((c) => c.elementIds.includes(elementId)) ?? null;
}

export function contarPorCapitulo(
  items: readonly AuditItem[],
  caps: readonly CapituloRevision[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of caps) out[c.id] = 0;
  for (const it of items) {
    const cap = capituloDeElemento(caps, it.element_id);
    if (cap) out[cap.id] += 1;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/capitulosRevision.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
& 'C:\Program Files\Git\cmd\git.exe' add src/lib/capitulosRevision.ts src/__tests__/capitulosRevision.test.ts
& 'C:\Program Files\Git\cmd\git.exe' commit -m "feat(revision): modulo puro de capitulos H1 para el modo lectura"
```

---

### Task 2: Repetición del cuerpo completo (módulo puro)

**Files:**
- Create: `src/lib/informeRevision.ts`
- Test: `src/__tests__/informeRevision.test.ts`

**Interfaces:**
- Consumes: `ElementModel` de `../types`.
- Produces:
  - `interface TerminoRepetido { termino: string; conteo: number }`
  - `function repeticionCuerpo(elements: readonly ElementModel[], topN?: number): TerminoRepetido[]`

**Nota de diseño:** se calcula en el frontend porque el `ProofreadFinding` del backend embebe el conteo dentro de `message` (string) y no expone `{ termino, conteo }`. Esta función es determinista y testeable; no reemplaza a los hallazgos `repeticion` (esos siguen siendo la fuente de «Descartar»), solo alimenta el gráfico del informe.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/informeRevision.test.ts
import { describe, it, expect } from 'vitest';
import { repeticionCuerpo } from '../lib/informeRevision';
import type { ElementModel } from '../types';

const p = (id: string, text: string): ElementModel => ({ id, type: 'paragraph', heading_level: null, text } as ElementModel);

describe('repeticionCuerpo', () => {
  it('cuenta palabras de contenido repetidas y las ordena por frecuencia', () => {
    const els = [
      p('a', 'investigación proceso investigación gestión'),
      p('b', 'investigación proceso proceso proceso'),
    ];
    const r = repeticionCuerpo(els);
    expect(r[0]).toEqual({ termino: 'investigación', conteo: 3 });
    expect(r[1]).toEqual({ termino: 'proceso', conteo: 4 });
  });

  it('ignora palabras vacías y palabras cortas', () => {
    const r = repeticionCuerpo([p('a', 'de la y el para con que los las')]);
    expect(r).toEqual([]);
  });

  it('no incluye palabras que aparecen menos de 3 veces', () => {
    const r = repeticionCuerpo([p('a', 'metodología metodología encuesta')]);
    expect(r.find((x) => x.termino === 'metodología')).toBeUndefined();
  });

  it('respeta topN', () => {
    const r = repeticionCuerpo(
      [p('a', 'alfa alfa alfa beta beta beta gamma gamma gamma delta delta delta')],
      2,
    );
    expect(r).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/informeRevision.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/informeRevision.ts
import type { ElementModel } from '../types';

export interface TerminoRepetido {
  termino: string;
  conteo: number;
}

const VACIAS = new Set([
  'para', 'como', 'donde', 'cuando', 'desde', 'hacia', 'entre', 'sobre', 'bajo',
  'este', 'esta', 'estos', 'estas', 'esto', 'esos', 'esas', 'aquel', 'aquella',
  'porque', 'pues', 'sino', 'solo', 'tambien', 'también', 'cada', 'otro', 'otra',
  'otros', 'otras', 'mismo', 'misma', 'toda', 'todo', 'todos', 'todas',
  'ser', 'son', 'fue', 'era', 'han', 'has', 'hay', 'sus', 'del', 'las', 'los',
  'con', 'por', 'que', 'una', 'uno', 'unos', 'unas', 'de', 'la', 'el', 'en',
  'se', 'su', 'al', 'lo', 'es', 'no', 'si', 'ya', 'más', 'mas', 'muy',
]);

const MIN_LARGO = 5;
const MIN_CONTEOS = 3;

function normalizarPalabra(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zñü]/g, '');
}

export function repeticionCuerpo(elements: readonly ElementModel[], topN = 8): TerminoRepetido[] {
  const conteo = new Map<string, { termino: string; conteo: number }>();
  for (const e of elements) {
    const texto = (e as { text?: string }).text || '';
    for (const raw of texto.split(/\s+/)) {
      const clave = normalizarPalabra(raw);
      if (clave.length < MIN_LARGO || VACIAS.has(clave)) continue;
      const prev = conteo.get(clave);
      if (prev) prev.conteo += 1;
      else conteo.set(clave, { termino: clave, conteo: 1 });
    }
  }
  return [...conteo.values()]
    .filter((t) => t.conteo >= MIN_CONTEOS)
    .sort((a, b) => b.conteo - a.conteo || a.termino.localeCompare(b.termino))
    .slice(0, topN);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/informeRevision.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
& 'C:\Program Files\Git\cmd\git.exe' add src/lib/informeRevision.ts src/__tests__/informeRevision.test.ts
& 'C:\Program Files\Git\cmd\git.exe' commit -m "feat(revision): conteo puro de palabras repetidas para el informe"
```

---

### Task 3: Objetivos y niveles de Bloom (extender `contentReview.ts`)

**Files:**
- Modify: `src/lib/contentReview.ts` (exportar `BLOOM_LEVELS`, `bloomLevel`; añadir `objetivosBloom`)
- Test: `src/__tests__/contentReview.test.ts` (extender)

**Interfaces:**
- Consumes (interno de `contentReview.ts`): `collectSections`, `separarGeneralDeEspecificos`, `firstWord`, `bloomLevel`, `BLOOM_LEVELS`.
- Produces:
  - `export interface ObjetivoBloom { elementId: string; texto: string; verboActual: string; nivelActual: number | null; nivelPropuesto: number; verboPropuesto: string }`
  - `export function objetivosBloom(elements: ElementLike[]): ObjetivoBloom[]`
  - `export const BLOOM_LEVELS` y `export function bloomLevel(verb: string): number | null` (pasar de no-exportados a exportados; `bloomLevel` ya existe como función, solo se agrega `export`).

- [ ] **Step 1: Write the failing test (añadir al final de `contentReview.test.ts`)**

```ts
import { objetivosBloom } from '../lib/contentReview';

describe('objetivosBloom', () => {
  const el = (id: string, heading_level: number | null, text: string) =>
    ({ id, type: heading_level ? 'heading' : 'paragraph', heading_level, text });

  it('propone un verbo de nivel superior para un verbo no medible', () => {
    const out = objetivosBloom([
      el('h', 1, 'Objetivos'),
      el('o1', null, 'Conocer los procesos de gestión interna'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].verboActual).toBe('conocer');
    expect(out[0].nivelActual).toBeNull();
    expect(out[0].nivelPropuesto).toBeGreaterThanOrEqual(4);
    expect(out[0].verboPropuesto.length).toBeGreaterThan(0);
  });

  it('propone subir de nivel un verbo medible bajo', () => {
    const out = objetivosBloom([el('h', 1, 'Objetivos'), el('o1', null, 'Identificar las variables')]);
    expect(out[0].nivelActual).toBe(1);
    expect(out[0].nivelPropuesto).toBeGreaterThan(1);
  });

  it('devuelve vacío sin objetivos', () => {
    expect(objetivosBloom([el('h', 1, 'Introducción'), el('p', null, 'hola')])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/contentReview.test.ts`
Expected: FAIL — `objetivosBloom` no exportado.

- [ ] **Step 3: Modify `contentReview.ts`**

Cambiar la declaración de la rampa (línea 36) para exportarla:

```ts
export const BLOOM_LEVELS: { level: number; verbs: string[] }[] = [
```
Cambiar la función (línea 45) para exportarla:
```ts
export function bloomLevel(verb: string): number | null {
```
Añadir al final del archivo:

```ts
export interface ObjetivoBloom {
  elementId: string;
  texto: string;
  verboActual: string;
  nivelActual: number | null;
  nivelPropuesto: number;
  verboPropuesto: string;
}

/** Nivel objetivo de la taxonomía para un objetivo de tesis (Analizar o más). */
const NIVEL_OBJETIVO = 4;

/** Verbo representativo de un nivel, evitando repetir el actual. */
function verboDeNivel(nivel: number, evitar: string): string {
  const fila = BLOOM_LEVELS.find((l) => l.level === nivel) ?? BLOOM_LEVELS[BLOOM_LEVELS.length - 1];
  const distinto = fila.verbs.find((v) => v !== evitar.toLowerCase());
  return distinto ?? fila.verbs[0];
}

export function objetivosBloom(elements: ElementLike[]): ObjetivoBloom[] {
  if (!elements || elements.length === 0) return [];
  const secciones = collectSections(elements);
  const objetivos = secciones['objetivos'] || [];
  if (objetivos.length === 0) return [];
  const { general, especificos } = separarGeneralDeEspecificos(elements, objetivos);

  return [...general, ...especificos]
    .map((e) => {
      const texto = (e.text || '').trim();
      const verboActual = firstWord(texto);
      if (!verboActual) return null;
      const nivelActual = bloomLevel(verboActual);
      const nivelPropuesto = Math.min(6, Math.max(nivelActual ?? 1, NIVEL_OBJETIVO) + (nivelActual === null ? 0 : 1));
      return {
        elementId: e.id,
        texto,
        verboActual,
        nivelActual,
        nivelPropuesto,
        verboPropuesto: verboDeNivel(nivelPropuesto, verboActual),
      };
    })
    .filter((x): x is ObjetivoBloom => x !== null);
}
```

> Si `separarGeneralDeEspecificos` o `collectSections` no están en el mismo archivo con esos nombres exactos, leer las líneas 100-148 de `contentReview.ts` y usar los nombres reales; **no** renombrar nada existente.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/contentReview.test.ts`
Expected: PASS (los tests previos siguen verdes).

- [ ] **Step 5: Commit**

```bash
& 'C:\Program Files\Git\cmd\git.exe' add src/lib/contentReview.ts src/__tests__/contentReview.test.ts
& 'C:\Program Files\Git\cmd\git.exe' commit -m "feat(informe): objetivos con nivel Bloom actual y propuesto"
```

---

### Task 4: Datos del heatmap IA (módulo puro)

**Files:**
- Create: `src/lib/aiHeatmap.ts`
- Test: `src/__tests__/aiHeatmap.test.ts`

**Interfaces:**
- Consumes: `AuditItem` de `./auditItems`.
- Produces:
  - `const RANGOS_IA = [45, 60, 75, 90] as const`
  - `interface FilaHeatmap { h1Id: string; titulo: string; counts: [number, number, number, number]; total: number; sinMedir: number }`
  - `function construirHeatmap(chapters: { id: string; titulo: string; findings: readonly AuditItem[] }[]): { filas: FilaHeatmap[]; max: number }`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/aiHeatmap.test.ts
import { describe, it, expect } from 'vitest';
import { construirHeatmap, RANGOS_IA } from '../lib/aiHeatmap';
import type { AuditItem } from '../lib/auditItems';

const ia = (id: string, aiScore?: number): AuditItem =>
  ({ id, element_id: 'x', category: 'ai', subtype: 'parrafo_ia', severity: 'medium', summary: '', detail: '', originalText: '', pageNumber: null, phase: null, readOnly: false, aiScore }) as AuditItem;

describe('construirHeatmap', () => {
  it('expone los cortes 45/60/75/90', () => {
    expect([...RANGOS_IA]).toEqual([45, 60, 75, 90]);
  });

  it('ubica cada índice en su bucket', () => {
    const { filas, max } = construirHeatmap([
      { id: 'h1', titulo: 'Intro', findings: [ia('a', 0.5), ia('b', 0.62), ia('c', 0.8), ia('d', 0.95)] },
    ]);
    expect(filas[0].counts).toEqual([1, 1, 1, 1]);
    expect(filas[0].total).toBe(4);
    expect(max).toBe(1);
  });

  it('cuenta sinMedir aparte y no lo mete en buckets', () => {
    const { filas } = construirHeatmap([{ id: 'h1', titulo: 'Intro', findings: [ia('a', 0.9), ia('b')] }]);
    expect(filas[0].counts).toEqual([0, 0, 0, 1]);
    expect(filas[0].sinMedir).toBe(1);
    expect(filas[0].total).toBe(1);
  });

  it('max es el mayor conteo de cualquier celda', () => {
    const { max } = construirHeatmap([
      { id: 'h1', titulo: 'A', findings: [ia('a', 0.5), ia('b', 0.5)] },
      { id: 'h2', titulo: 'B', findings: [ia('c', 0.5)] },
    ]);
    expect(max).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/aiHeatmap.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/aiHeatmap.ts
import type { AuditItem } from './auditItems';

export const RANGOS_IA = [45, 60, 75, 90] as const;

export interface FilaHeatmap {
  h1Id: string;
  titulo: string;
  counts: [number, number, number, number];
  total: number;
  sinMedir: number;
}

function bucket(score: number): 0 | 1 | 2 | 3 {
  if (score < 60) return 0;
  if (score < 75) return 1;
  if (score < 90) return 2;
  return 3;
}

export function construirHeatmap(
  chapters: { id: string; titulo: string; findings: readonly AuditItem[] }[],
): { filas: FilaHeatmap[]; max: number } {
  const filas: FilaHeatmap[] = chapters.map((c) => {
    const counts: [number, number, number, number] = [0, 0, 0, 0];
    let sinMedir = 0;
    for (const f of c.findings) {
      if (typeof f.aiScore !== 'number') {
        sinMedir += 1;
        continue;
      }
      const score = Math.round(f.aiScore * 100);
      if (score < RANGOS_IA[0]) {
        sinMedir += 1;
        continue;
      }
      counts[bucket(score)] += 1;
    }
    return {
      h1Id: c.id,
      titulo: c.titulo,
      counts,
      total: counts[0] + counts[1] + counts[2] + counts[3],
      sinMedir,
    };
  });
  const max = filas.reduce((m, f) => Math.max(m, ...f.counts), 0);
  return { filas, max };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/aiHeatmap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
& 'C:\Program Files\Git\cmd\git.exe' add src/lib/aiHeatmap.ts src/__tests__/aiHeatmap.test.ts
& 'C:\Program Files\Git\cmd\git.exe' commit -m "feat(mapa-ia): datos puros del heatmap H1 x rango"
```

---

### Task 5: `ReviewGate` — total sin IA y sin fila de IA

**Files:**
- Modify: `src/components/review/ReviewGate.tsx:26-70`
- Test: `src/__tests__/reviewGate.test.tsx` (nuevo)

**Interfaces:**
- Consumes: `AuditItem`, `heatMatrix`, `CATEGORY_META`.
- Produces: mismo `Props` que hoy. Cambia el cálculo: `total` cuenta solo motores objetivos; las filas se construyen con `CATEGORY_META.filter((c) => c.id !== 'ai')`. `aiCount` sigue saliendo de `matrix.ai` para la sub-cifra y el botón.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/reviewGate.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviewGate } from '../components/review/ReviewGate';
import type { AuditItem } from '../lib/auditItems';

const item = (id: string, category: AuditItem['category']): AuditItem =>
  ({ id, element_id: 'e', category, subtype: 'x', severity: 'medium', summary: 's', detail: '', originalText: '', pageNumber: 1, phase: null, readOnly: false }) as AuditItem;

describe('ReviewGate', () => {
  it('no cuenta la IA en el total ni la muestra como fila', () => {
    render(
      <ReviewGate
        items={[item('1', 'style'), item('2', 'spelling'), item('3', 'ai')]}
        aiScore={0.8}
        isScanning={false}
        onScan={vi.fn()}
        onStart={vi.fn()}
        onOpenAiRoom={vi.fn()}
      />,
    );
    expect(screen.getByTestId('review-gate-total').textContent).toBe('2');
    expect(screen.queryByText('Voz sintética')).toBeNull();
  });

  it('el botón de Mapa IA aparece cuando hay IA y usa su etiqueta', () => {
    render(
      <ReviewGate items={[item('3', 'ai')]} aiScore={0.8} isScanning={false}
        onScan={vi.fn()} onStart={vi.fn()} onOpenAiRoom={vi.fn()} />,
    );
    expect(screen.getByText('Ver mapa de IA')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/reviewGate.test.tsx`
Expected: FAIL — el total hoy es 3 y «Voz sintética» sí aparece.

- [ ] **Step 3: Modify `ReviewGate.tsx`**

En el componente (tras línea 29):

```tsx
  const total = items.filter((it) => it.category !== 'ai').length;
```
Y donde se recorren las filas por `CATEGORY_META` (líneas ~60-66), usar:

```tsx
{CATEGORY_META.filter((c) => c.id !== 'ai').map((cat) => (
  /* fila existente, sin tocar su markup */
))}
```
No cambiar el botón de IA (`Ver mapa de IA`) ni la sub-cifra de voz sintética.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/reviewGate.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
& 'C:\Program Files\Git\cmd\git.exe' add src/components/review/ReviewGate.tsx src/__tests__/reviewGate.test.tsx
& 'C:\Program Files\Git\cmd\git.exe' commit -m "feat(revision): la puerta cuenta solo motores objetivos"
```

---

### Task 6: R1 · `ReviewInforme` (Informe general)

**Files:**
- Create: `src/components/review/ReviewInforme.tsx`
- Test: `src/__tests__/reviewInforme.test.tsx`

**Interfaces:**
- Consumes: `construirCapitulos`/`contarPorCapitulo` (Task 1), `repeticionCuerpo` (Task 2), `objetivosBloom` (Task 3), `AuditItem`, `ElementModel`.
- Produces:
  - `export interface ReviewInformeProps { items: readonly AuditItem[]; elements: readonly ElementModel[]; title: string; embedded?: boolean; onStart: (capituloId?: string) => void; onBack: () => void }`

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/reviewInforme.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReviewInforme } from '../components/review/ReviewInforme';
import type { ElementModel } from '../types';
import type { AuditItem } from '../lib/auditItems';

const el = (id: string, type: string, heading_level: number | null, text: string): ElementModel => ({ id, type, heading_level, text } as ElementModel);
const item = (id: string, element_id: string): AuditItem =>
  ({ id, element_id, category: 'style', subtype: 'x', severity: 'medium', summary: 'cabe destacar', detail: '', originalText: '', pageNumber: 1, phase: null, readOnly: false }) as AuditItem;

const elements = [el('h', 'heading', 1, 'Objetivos'), el('o', 'paragraph', null, 'Conocer los procesos'), el('h2', 'heading', 1, 'Metodología'), el('p', 'paragraph', null, 'Texto con proceso y proceso.')];

describe('ReviewInforme', () => {
  it('muestra título, bloque de objetivos y bloque de repetición', () => {
    render(<ReviewInforme items={[item('1', 'p')]} elements={elements} title="Tesis" onStart={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText('Informe general')).toBeTruthy();
    expect(screen.getByText(/Conocer/)).toBeTruthy();
    expect(screen.getByText('Repetición · cuerpo completo')).toBeTruthy();
  });

  it('«Leer y corregir» entra al modo lectura', () => {
    const onStart = vi.fn();
    render(<ReviewInforme items={[item('1', 'p')]} elements={elements} title="Tesis" onStart={onStart} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText(/Leer y corregir/i));
    expect(onStart).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/reviewInforme.test.tsx`
Expected: FAIL — componente inexistente.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/review/ReviewInforme.tsx
import React, { useMemo } from 'react';
import { ArrowLeft, ArrowRight, PenLine } from 'lucide-react';
import type { AuditItem } from '../../lib/auditItems';
import type { ElementModel } from '../../types';
import { construirCapitulos, contarPorCapitulo } from '../../lib/capitulosRevision';
import { repeticionCuerpo } from '../../lib/informeRevision';
import { objetivosBloom } from '../../lib/contentReview';

export interface ReviewInformeProps {
  items: readonly AuditItem[];
  elements: readonly ElementModel[];
  title: string;
  embedded?: boolean;
  onStart: (capituloId?: string) => void;
  onBack: () => void;
}

const panel: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-surface)',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-5) var(--space-6)',
};
const titulo: React.CSSProperties = {
  margin: '0 0 var(--space-3)',
  fontSize: 'var(--text-xs)',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--color-text-tertiary)',
};

export function ReviewInforme({ items, elements, title, embedded, onStart, onBack }: ReviewInformeProps) {
  const objetivos = useMemo(() => objetivosBloom(elements as never), [elements]);
  const repetidos = useMemo(() => repeticionCuerpo(elements), [elements]);
  const caps = useMemo(() => construirCapitulos(elements), [elements]);
  const porCap = useMemo(() => contarPorCapitulo(items, caps), [items, caps]);
  const maxRep = repetidos[0]?.conteo ?? 1;
  const maxCap = Math.max(1, ...caps.map((c) => porCap[c.id] ?? 0));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: 880, margin: '0 auto' }}>
      {!embedded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button type="button" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: '6px 10px', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
            <ArrowLeft size={14} aria-hidden /> Estado del documento
          </button>
          <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--color-text-primary)' }}>Informe general</h2>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
        <section style={panel} aria-label="Objetivos y validación Bloom">
          <h3 style={titulo}>Objetivos · validación Bloom</h3>
          {objetivos.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>No se detectaron objetivos.</p>
          ) : (
            objetivos.map((o) => (
              <div key={o.elementId} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '6px 0', borderTop: '1px solid var(--color-border-subtle)' }}>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.texto}>{o.texto}</span>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, padding: '2px 7px', borderRadius: 999, backgroundColor: 'var(--color-bg-surface-alt)', color: 'var(--color-warning)' }}>{o.verboActual}</span>
                <ArrowRight size={13} aria-hidden style={{ color: 'var(--color-text-tertiary)' }} />
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, padding: '2px 7px', borderRadius: 999, backgroundColor: 'var(--color-bg-surface-alt)', color: 'var(--color-success)' }}>{o.verboPropuesto}</span>
              </div>
            ))
          )}
        </section>

        <section style={panel} aria-label="Repetición del cuerpo completo">
          <h3 style={titulo}>Repetición · cuerpo completo</h3>
          {repetidos.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>Sin repeticiones relevantes.</p>
          ) : (
            repetidos.map((t) => (
              <div key={t.termino} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '4px 0', fontSize: 'var(--text-sm)' }}>
                <span style={{ width: 130, color: 'var(--color-text-secondary)', fontWeight: 600 }}>{t.termino}</span>
                <span style={{ flex: 1, height: 9, borderRadius: 5, backgroundColor: 'var(--color-bg-surface-alt)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${Math.round((t.conteo / maxRep) * 100)}%`, backgroundColor: 'var(--color-warning)' }} />
                </span>
                <span style={{ width: 32, textAlign: 'right', color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{t.conteo}</span>
              </div>
            ))
          )}
        </section>
      </div>

      {caps.length > 0 && (
        <section style={panel} aria-label="Salud por capítulo">
          <h3 style={titulo}>Capítulos · pendientes por fase</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)' }}>
            {caps.map((c) => {
              const n = porCap[c.id] ?? 0;
              return (
                <button key={c.id} type="button" onClick={() => onStart(c.id)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-subtle)', backgroundColor: n === 0 ? 'var(--color-bg-surface-alt)' : 'var(--color-bg-surface)', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{c.titulo}</span>
                  <span style={{ height: 5, width: '100%', borderRadius: 3, backgroundColor: 'var(--color-bg-surface-alt)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${Math.round((n / maxCap) * 100)}%`, backgroundColor: 'var(--color-danger)' }} />
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{n === 0 ? 'sin pendientes' : `${n} pendiente${n === 1 ? '' : 's'}`}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {!embedded && (
        <button type="button" onClick={() => onStart()} disabled={items.length === 0}
          style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-accent)', backgroundColor: items.length === 0 ? 'var(--color-bg-surface-alt)' : 'var(--color-accent)', color: items.length === 0 ? 'var(--color-text-tertiary)' : '#fff', fontWeight: 700, cursor: items.length === 0 ? 'not-allowed' : 'pointer' }}>
          <PenLine size={15} aria-hidden /> Leer y corregir
        </button>
      )}
    </div>
  );
}
```

> `title` queda disponible por si más adelante se usa en el resumen; si el linter marca el parámetro sin usar, prefijarlo con `_` en vez de borrarlo del `Props`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/reviewInforme.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
& 'C:\Program Files\Git\cmd\git.exe' add src/components/review/ReviewInforme.tsx src/__tests__/reviewInforme.test.tsx
& 'C:\Program Files\Git\cmd\git.exe' commit -m "feat(revision): pantalla R1 informe general"
```

---

### Task 7: R2 · `ReviewReader` (Modo lectura)

**Files:**
- Create: `src/components/review/ReviewReader.tsx`
- Test: `src/__tests__/reviewReader.test.tsx`

**Interfaces:**
- Consumes: `construirCapitulos` (Task 1), `ReviewInforme` (Task 6), `ReadingText` + `useMarkSourceBase`/`buildMarkSource`, `ENGINE_META` (`../../hooks/useReviewWorkbench`), `AuditItem`, `ElementModel`.
- Produces:
  - `export interface ReviewReaderProps { elements: readonly ElementModel[]; items: readonly AuditItem[]; initialCapId?: string | null; onAccept: (item: AuditItem) => void; onMark: (item: AuditItem) => void; onDismiss: (item: AuditItem) => void; onBack: () => void }`

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/reviewReader.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReviewReader } from '../components/review/ReviewReader';
import type { ElementModel } from '../types';
import type { AuditItem } from '../lib/auditItems';

vi.mock('../hooks/useMarkSource', () => ({
  useMarkSourceBase: () => ({}),
  buildMarkSource: (_b: unknown, elem: unknown) => ({ reviewResult: null, proofreadFindings: [], commentCtx: {}, showCitations: false, elem }),
}));

const el = (id: string, type: string, heading_level: number | null, text: string): ElementModel => ({ id, type, heading_level, text } as ElementModel);
const item = (id: string, element_id: string): AuditItem =>
  ({ id, element_id, category: 'style', subtype: 'x', severity: 'medium', summary: 'cabe destacar', detail: 'd', originalText: text, pageNumber: 3, phase: null, readOnly: false }) as AuditItem;

const elements = [el('h', 'heading', 1, '1. Introducción'), el('p', 'paragraph', null, 'En el presente apartado cabe destacar que todo sigue.'), el('h2', 'heading', 1, '2. Metodología'), el('q', 'paragraph', null, 'Otra frase.')];
const text = 'En el presente apartado cabe destacar que todo sigue.';

describe('ReviewReader', () => {
  it('muestra la cinta de progreso y el dock del hallazgo', () => {
    render(<ReviewReader elements={elements} items={[item('1', 'p')]} onAccept={vi.fn()} onMark={vi.fn()} onDismiss={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText(/1 de 1/)).toBeTruthy();
    expect(screen.getByText('Aceptar')).toBeTruthy();
  });

  it('«Aceptar» llama onAccept con el hallazgo actual', () => {
    const onAccept = vi.fn();
    render(<ReviewReader elements={elements} items={[item('1', 'p')]} onAccept={onAccept} onMark={vi.fn()} onDismiss={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('Aceptar'));
    expect(onAccept).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
  });

  it('el botón Informe abre la hoja del informe encima', () => {
    render(<ReviewReader elements={elements} items={[item('1', 'p')]} onAccept={vi.fn()} onMark={vi.fn()} onDismiss={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Informe'));
    expect(screen.getByText('Informe general')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/reviewReader.test.tsx`
Expected: FAIL — componente inexistente.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/review/ReviewReader.tsx
import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BarChart3, Check, CheckCheck, X } from 'lucide-react';
import type { AuditItem } from '../../lib/auditItems';
import type { ElementModel } from '../../types';
import { construirCapitulos, capituloDeElemento, type CapituloRevision } from '../../lib/capitulosRevision';
import { ReadingText } from './ReadingText';
import { useMarkSourceBase, buildMarkSource } from '../../hooks/useMarkSource';
import { ENGINE_META } from '../../hooks/useReviewWorkbench';
import { ReviewInforme } from './ReviewInforme';

export interface ReviewReaderProps {
  elements: readonly ElementModel[];
  items: readonly AuditItem[];
  initialCapId?: string | null;
  onAccept: (item: AuditItem) => void;
  onMark: (item: AuditItem) => void;
  onDismiss: (item: AuditItem) => void;
  onBack: () => void;
}

const barra: React.CSSProperties = {
  position: 'sticky', top: 0, zIndex: 5,
  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
  padding: '8px 12px', borderRadius: 999,
  backgroundColor: 'var(--color-bg-surface)',
  border: '1px solid var(--color-border-subtle)',
  boxShadow: 'var(--shadow-sm)',
};
const iconoBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid var(--color-border-subtle)', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)', cursor: 'pointer',
};

export function ReviewReader({ elements, items, initialCapId, onAccept, onMark, onDismiss, onBack }: ReviewReaderProps) {
  const markBase = useMarkSourceBase();
  const caps = useMemo(() => construirCapitulos(elements), [elements]);
  const [capId, setCapId] = useState<string | null>(initialCapId ?? caps[0]?.id ?? null);
  const [cat, setCat] = useState<AuditItem['category'] | 'all'>('all');
  const [cursor, setCursor] = useState(0);
  const [informe, setInforme] = useState(false);

  const cap: CapituloRevision | null = caps.find((c) => c.id === capId) ?? caps[0] ?? null;
  const elemsCap = useMemo(
    () => (cap ? (cap.elementIds.map((id) => elements.find((e) => e.id === id)).filter(Boolean) as ElementModel[]) : []),
    [cap, elements],
  );
  const itemsCap = useMemo(
    () => items.filter((it) => (cat === 'all' ? true : it.category === cat) && cap?.elementIds.includes(it.element_id)),
    [items, cat, cap],
  );
  const actual = itemsCap[Math.min(cursor, Math.max(0, itemsCap.length - 1))] ?? null;
  const elemDe = (id: string) => elements.find((e) => e.id === id);
  const motores: (AuditItem['category'] | 'all')[] = ['all', 'spelling', 'style', 'structure'];

  const irA = (capituloId: string) => { setCapId(capituloId); setCursor(0); };
  const siguiente = () => setCursor((c) => (itemsCap.length === 0 ? 0 : (c + 1) % itemsCap.length));
  const aceptarTodas = () => { itemsCap.forEach((it) => onAccept(it)); };

  return (
    <div style={{ position: 'relative', maxWidth: 820, margin: '0 auto', paddingBottom: 120 }}>
      <div style={barra}>
        <button type="button" onClick={onBack} style={{ ...iconoBtn, width: 'auto', borderRadius: 'var(--radius-md)', padding: '0 10px', gap: 6 }}>
          <ArrowLeft size={14} aria-hidden /> <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700 }}>Informe</span>
        </button>
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>
          Revisión <span style={{ color: 'var(--color-text-tertiary)' }}>· {cap?.titulo ?? 'Sin capítulo'}</span>
        </span>
        <span style={{ flex: 1, display: 'flex', gap: 4, minWidth: 80 }}>
          {caps.map((c) => (
            <button key={c.id} type="button" aria-label={c.titulo} title={c.titulo} onClick={() => irA(c.id)}
              style={{ flex: Math.max(1, c.elementIds.length), height: 6, border: 0, borderRadius: 4, cursor: 'pointer', backgroundColor: c.id === cap?.id ? 'var(--color-accent)' : 'var(--color-bg-surface-alt)' }} />
          ))}
        </span>
        {motores.map((m) => (
          <button key={m} type="button" onClick={() => { setCat(m); setCursor(0); }}
            style={{ fontSize: 'var(--text-xs)', fontWeight: 700, padding: '4px 9px', borderRadius: 999, cursor: 'pointer', border: '1px solid var(--color-border-subtle)', backgroundColor: cat === m ? 'var(--color-bg-surface-alt)' : 'transparent', color: cat === m ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
            {m === 'all' ? 'Todos' : ENGINE_META[m]?.title ?? m}
          </button>
        ))}
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
          {itemsCap.length === 0 ? '0 de 0' : `${Math.min(cursor + 1, itemsCap.length)} de ${itemsCap.length}`}
        </span>
        <button type="button" aria-label="Informe" onClick={() => setInforme((v) => !v)} style={iconoBtn}><BarChart3 size={15} aria-hidden /></button>
        <button type="button" aria-label="Siguiente hallazgo" onClick={siguiente} style={{ ...iconoBtn, backgroundColor: 'var(--color-accent)', borderColor: 'var(--color-accent)', color: '#fff' }}><ArrowRight size={15} aria-hidden /></button>
      </div>

      <div style={{ backgroundColor: 'var(--color-paper-white)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-10) var(--space-12)', marginTop: 'var(--space-4)' }}>
        {elemsCap.map((e) => (
          <div key={e.id} style={{ marginBottom: 'var(--space-4)' }}>
            <ReadingText text={e.text || ''} source={buildMarkSource(markBase, e)} />
          </div>
        ))}
        {elemsCap.length === 0 && <p style={{ color: 'var(--color-text-tertiary)' }}>Sin contenido para mostrar.</p>}
      </div>

      <div style={{ position: 'fixed', left: '50%', bottom: 18, transform: 'translateX(-50%)', width: 'min(720px, 92%)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '10px 12px', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--shadow-md)' }}>
        {actual ? (
          <>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999, backgroundColor: 'var(--color-bg-surface-alt)', color: `var(--color-engine-${actual.category})` }}>
              {ENGINE_META[actual.category]?.title ?? actual.category}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <b style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', display: 'block' }}>{actual.summary}</b>
              <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                {actual.pageNumber ? `Pág. ${actual.pageNumber}` : 'Sin página'}
              </p>
            </div>
            {!actual.readOnly && (
              <>
                <button type="button" onClick={() => onAccept(actual)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-accent)', backgroundColor: 'var(--color-accent)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}><Check size={14} aria-hidden /> Aceptar</button>
                <button type="button" onClick={aceptarTodas} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-subtle)', backgroundColor: 'transparent', color: 'var(--color-text-secondary)', fontWeight: 700, cursor: 'pointer' }}><CheckCheck size={14} aria-hidden /> Aceptar todas</button>
              </>
            )}
            <button type="button" aria-label="Descartar" onClick={() => onDismiss(actual)} style={iconoBtn}><X size={15} aria-hidden /></button>
          </>
        ) : (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
            {cap ? 'Sin hallazgos en este capítulo. Elegí otro en la cinta.' : 'No hay capítulos con hallazgos.'}
          </span>
        )}
      </div>

      {informe && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(20,25,50,.28)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '26px 16px', zIndex: 20 }}>
          <div style={{ width: 'min(760px, 96%)', backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5) var(--space-6)', maxHeight: '86vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 800 }}>Informe general</h3>
              <span style={{ flex: 1 }} />
              <button type="button" aria-label="Cerrar informe" onClick={() => setInforme(false)} style={iconoBtn}><X size={15} aria-hidden /></button>
            </div>
            <ReviewInforme items={items} elements={elements} title="" embedded onStart={(id) => { if (id) irA(id); setInforme(false); }} onBack={() => setInforme(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

export default ReviewReader;
```

> `onMark` se expone en las props por paridad con el resto de la superficie, pero el Modo lectura no lo usa: en Revisión son motores objetivos (aceptan). Si el linter lo marca, consumirlo con un botón «Marcar» menor o prefijarlo con `_` en el destructuring.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/reviewReader.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
& 'C:\Program Files\Git\cmd\git.exe' add src/components/review/ReviewReader.tsx src/__tests__/reviewReader.test.tsx
& 'C:\Program Files\Git\cmd\git.exe' commit -m "feat(revision): pantalla R2 modo lectura con cinta y dock"
```

---

### Task 8: Wiring de la fase 5 (4 pantallas) y retiro de `journey`

**Files:**
- Modify: `src/components/wizard/Step5AuditIAWizard.tsx`
- Modify: `src/__tests__/reviewWorkbench.test.tsx` (espera del flujo viejo)
- Test: extender `reviewWorkbench.test.tsx` con el nuevo recorrido.

**Interfaces:**
- Consumes: `ReviewGate` (Task 5), `ReviewInforme` (Task 6), `ReviewReader` (Task 7), `AiRoom` (sin cambios).
- Produces: `type Pantalla = 'gate' | 'informe' | 'reader' | 'ai'`. Estado añadido `const [capInicial, setCapInicial] = useState<string | null>(null)`.

- [ ] **Step 1: Modify `Step5AuditIAWizard.tsx`**

Reemplazar `type Pantalla` (línea 13):
```ts
type Pantalla = 'gate' | 'informe' | 'reader' | 'ai';
```
Añadir estado tras `isScanning`:
```ts
const [capInicial, setCapInicial] = useState<string | null>(null);
```
Reemplazar el bloque de `pantalla === 'journey'` (líneas 141-155) por:
```tsx
if (pantalla === 'informe') {
  return (
    <ReviewInforme
      items={items}
      elements={elements}
      title={doc?.title ?? ''}
      onStart={(capId) => { setCapInicial(capId ?? null); setPantalla('reader'); }}
      onBack={() => setPantalla('gate')}
    />
  );
}
if (pantalla === 'reader') {
  return (
    <ReviewReader
      elements={elements}
      items={items}
      initialCapId={capInicial}
      onAccept={handleAccept}
      onMark={handleMark}
      onDismiss={handleDismiss}
      onBack={() => setPantalla('informe')}
    />
  );
}
```
Cambiar el `onStart` de `ReviewGate` (línea ~162) a:
```tsx
onStart={() => setPantalla('informe')}
```
Añadir imports y quitar el de `ReviewPhaseJourney`:
```ts
import { ReviewInforme } from '../review/ReviewInforme';
import { ReviewReader } from '../review/ReviewReader';
```
`AiRoom` sigue con `onExit={() => setPantalla('gate')}`.

- [ ] **Step 2: Update the old-flow assertions in `reviewWorkbench.test.tsx`**

Donde el test pulsa «Empezar revisión» (línea ~907) y luego busca «Recorrido de revisión» (línea ~908), cambiar la expectativa a la nueva pantalla:
```tsx
expect(await screen.findByText('Informe general')).toBeTruthy();
```
Donde el test busca que NO exista un `review-gate-total` (líneas ~934, ~948) tras entrar, la nueva pantalla ya no tiene ese testid (se cumple igual). Donde pulsa «Ver mapa de IA» (línea ~971) y espera la «Sala de IA», mantener: el botón sigue abriendo `AiRoom`.

- [ ] **Step 3: Add the new-flow test**

```tsx
it('Revisión va de lo general a lo específico y no muestra IA', async () => {
  // ...cargar doc con hallazgos como en los tests vecinos...
  fireEvent.click(await screen.findByText(/Empezar revisión/i));
  expect(await screen.findByText('Informe general')).toBeTruthy();
  expect(screen.queryByText('Voz sintética')).toBeNull();
  fireEvent.click(screen.getByText(/Leer y corregir/i));
  expect(await screen.findByText(/de \d+$/)).toBeTruthy(); // contador X de N de la cinta
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/reviewWorkbench.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
& 'C:\Program Files\Git\cmd\git.exe' add src/components/wizard/Step5AuditIAWizard.tsx src/__tests__/reviewWorkbench.test.tsx
& 'C:\Program Files\Git\cmd\git.exe' commit -m "feat(fase5): Revisión en 4 pantallas gate/informe/reader/ai"
```

---

### Task 9: `AiHeatmap` + integración en el dashboard del Mapa IA

**Files:**
- Create: `src/components/review/AiHeatmap.tsx`
- Modify: `src/components/review/AiHierarchy.tsx` (hero: insertar heatmap debajo)
- Test: extender `src/__tests__/aiHierarchy.test.tsx`

**Interfaces:**
- Consumes: `construirHeatmap`, `RANGOS_IA` (Task 4).
- Produces: `export interface AiHeatmapProps { filas: FilaHeatmap[]; max: number }` con `export function AiHeatmap({ filas, max }: AiHeatmapProps)`.

- [ ] **Step 1: Write the failing test (añadir a `aiHierarchy.test.tsx`)**

```tsx
import { AiHeatmap } from '../components/review/AiHeatmap';

it('el heatmap pinta una fila por capítulo y cuatro columnas de rango', () => {
  render(<AiHeatmap filas={[
    { h1Id: 'a', titulo: 'Intro', counts: [1, 0, 2, 0], total: 3, sinMedir: 0 },
    { h1Id: 'b', titulo: 'Método', counts: [0, 0, 0, 1], total: 1, sinMedir: 1 },
  ]} max={2} />);
  expect(screen.getByText('Intro')).toBeTruthy();
  expect(screen.getByText('Método')).toBeTruthy();
  expect(screen.getAllByTestId('heatmap-col')).toHaveLength(4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/aiHierarchy.test.tsx`
Expected: FAIL — `AiHeatmap` inexistente.

- [ ] **Step 3: Write `AiHeatmap.tsx`**

```tsx
// src/components/review/AiHeatmap.tsx
import React from 'react';
import type { FilaHeatmap } from '../../lib/aiHeatmap';

export interface AiHeatmapProps {
  filas: FilaHeatmap[];
  max: number;
}

const RANGOS = ['45–59', '60–74', '75–89', '90–100'];
const NIVEL = ['var(--ia-nivel-1)', 'var(--ia-nivel-2)', 'var(--ia-nivel-3)', 'var(--ia-nivel-4)'];

/** Color por intensidad relativa al máximo (no degradado continuo: 4 escalones). */
function fondo(n: number, max: number): string {
  if (n <= 0) return 'var(--color-bg-surface-alt)';
  const ratio = max <= 0 ? 0 : n / max;
  const idx = ratio > 0.75 ? 3 : ratio > 0.5 ? 2 : ratio > 0.25 ? 1 : 0;
  return NIVEL[idx];
}

export function AiHeatmap({ filas, max }: AiHeatmapProps) {
  return (
    <div role="table" aria-label="Mapa de calor de índice IA por capítulo" style={{ width: '100%', overflowX: 'auto' }}>
      <div role="row" style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1.4fr) repeat(4, 1fr)', gap: 4, marginBottom: 4 }}>
        <span />
        {RANGOS.map((r) => (
          <span key={r} data-testid="heatmap-col" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textAlign: 'center' }}>{r}</span>
        ))}
      </div>
      {filas.map((f) => (
        <div key={f.h1Id} role="row" style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1.4fr) repeat(4, 1fr)', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.titulo}>{f.titulo}</span>
          {f.counts.map((n, i) => (
            <span key={i} style={{ height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', backgroundColor: fondo(n, max), color: 'var(--color-text-primary)', fontSize: 'var(--text-xs)', fontVariantNumeric: 'tabular-nums' }}>
              {n > 0 ? n : ''}
            </span>
          ))}
        </div>
      ))}
      {filas.some((f) => f.sinMedir > 0) && (
        <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
          {filas.reduce((s, f) => s + f.sinMedir, 0)} párrafos sin medición numérica (clasificados sin score).
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Integrate in `AiHierarchy.tsx`**

Dentro del hero (líneas 329-385), tras la cifra y las sub-cifras, insertar:

```tsx
{/* Mapa de calor H1 × rango */}
<AiHeatmap filas={heatFila} max={heatMax} />
```
Añadir en el cuerpo del componente, cerca del `useMemo` de `chapters` (línea ~241):
```tsx
const { filas: heatFila, max: heatMax } = useMemo(
  () => construirHeatmap(chapters.map((c) => ({ id: c.id, titulo: c.title, findings: c.subsections.flatMap((s) => s.findings) }))),
  [chapters],
);
```
Import:
```ts
import { AiHeatmap } from './AiHeatmap';
import { construirHeatmap } from '../../lib/aiHeatmap';
```
Y en el mismo paso, corregir el bug de escala (línea ~728): `Math.round(currentFinding.aiScore)` → `Math.round(currentFinding.aiScore * 100)`, y añadir `aiItems` a las deps del `useMemo` de `chapters` (línea ~241).

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/__tests__/aiHierarchy.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
& 'C:\Program Files\Git\cmd\git.exe' add src/components/review/AiHeatmap.tsx src/components/review/AiHierarchy.tsx src/__tests__/aiHierarchy.test.tsx
& 'C:\Program Files\Git\cmd\git.exe' commit -m "feat(mapa-ia): heatmap H1 x rango y arreglo de escala aiScore"
```

---

### Task 10: Rectángulos de capítulo + vista aislada (`AiChapterGrid` / `AiChapterFocus`)

**Files:**
- Create: `src/components/review/AiChapterGrid.tsx`
- Create: `src/components/review/AiChapterFocus.tsx`
- Modify: `src/components/review/AiHierarchy.tsx` (reemplazar el `<aside>` por el grid; el focus se abre al clic)
- Test: extender `src/__tests__/aiHierarchy.test.tsx`

**Interfaces:**
- Consumes: `AuditItem`.
- Produces:
  - `export interface AiChapterGridProps { chapters: { id: string; titulo: string; findings: AuditItem[] }[]; onOpen: (id: string) => void }`
  - `export interface AiChapterFocusProps { titulo: string; findings: AuditItem[]; onMark?: (item: AuditItem) => void; onDismiss?: (item: AuditItem) => void; onApplyParaphrase?: (item: AuditItem, newText: string) => Promise<void>; onBack: () => void }`

- [ ] **Step 1: Write the failing tests (añadir a `aiHierarchy.test.tsx`)**

```tsx
import { AiChapterGrid } from '../components/review/AiChapterGrid';

it('los capítulos son rectángulos que abren el capítulo', () => {
  const onOpen = vi.fn();
  render(<AiChapterGrid chapters={[
    { id: 'a', titulo: 'Intro', findings: [] },
    { id: 'b', titulo: 'Método', findings: [] },
  ]} onOpen={onOpen} />);
  fireEvent.click(screen.getByText('Método'));
  expect(onOpen).toHaveBeenCalledWith('b');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/aiHierarchy.test.tsx`
Expected: FAIL — `AiChapterGrid` inexistente.

- [ ] **Step 3: Write `AiChapterGrid.tsx`**

```tsx
// src/components/review/AiChapterGrid.tsx
import React from 'react';
import type { AuditItem } from '../../lib/auditItems';

export interface AiChapterGridProps {
  chapters: { id: string; titulo: string; findings: AuditItem[] }[];
  onOpen: (id: string) => void;
}

function nivel(findings: AuditItem[]): string {
  const alto = findings.filter((f) => (f.aiScore ?? 0) >= 0.75).length;
  if (findings.length === 0) return 'var(--ia-nivel-1)';
  if (alto >= 2 || findings.length >= 5) return 'var(--ia-nivel-4)';
  if (findings.length >= 3) return 'var(--ia-nivel-3)';
  return 'var(--ia-nivel-2)';
}

export function AiChapterGrid({ chapters, onOpen }: AiChapterGridProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-2)' }}>
      {chapters.map((c) => (
        <button key={c.id} type="button" onClick={() => onOpen(c.id)}
          style={{ textAlign: 'left', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-3)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, backgroundColor: nivel(c.findings) }}>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{c.titulo}</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
            {c.findings.length === 0 ? 'sin alertas' : `${c.findings.length} alerta${c.findings.length === 1 ? '' : 's'}`}
          </span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write `AiChapterFocus.tsx`**

Reutiliza el split comparador existente en `AiHierarchy` (líneas 686-982). Para no duplicar 300 líneas, este componente renderiza la lista de hallazgos del capítulo como pastillas y delega la acción a los callbacks; el split comparador se extrae de `AiHierarchy` como pieza compartida en el mismo paso.

```tsx
// src/components/review/AiChapterFocus.tsx
import React from 'react';
import { ArrowLeft } from 'lucide-react';
import type { AuditItem } from '../../lib/auditItems';
import { EvaluacionComparador } from './EvaluacionComparador';

export interface AiChapterFocusProps {
  titulo: string;
  findings: AuditItem[];
  onMark?: (item: AuditItem) => void;
  onDismiss?: (item: AuditItem) => void;
  onApplyParaphrase?: (item: AuditItem, newText: string) => Promise<void>;
  onBack: () => void;
}

export function AiChapterFocus({ titulo, findings, onMark, onDismiss, onApplyParaphrase, onBack }: AiChapterFocusProps) {
  const [sel, setSel] = React.useState(0);
  const actual = findings[Math.min(sel, Math.max(0, findings.length - 1))] ?? null;
  return (
    <section aria-label={`Capítulo ${titulo}`} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <button type="button" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: '6px 10px', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
          <ArrowLeft size={14} aria-hidden /> Mapa IA
        </button>
        <h3 style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 800 }}>{titulo}</h3>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {findings.map((f, i) => (
          <button key={f.id} type="button" onClick={() => setSel(i)}
            style={{ fontSize: 'var(--text-xs)', fontWeight: 700, padding: '3px 8px', borderRadius: 999, cursor: 'pointer', border: '1px solid var(--color-border-subtle)', backgroundColor: i === sel ? 'var(--ia-nivel-2)' : 'transparent', color: 'var(--color-text-secondary)' }}>
            Alerta {i + 1}{f.pageNumber ? ` (Pág. ${f.pageNumber})` : ''}
          </button>
        ))}
      </div>
      {actual ? (
        <EvaluacionComparador item={actual} onMark={onMark} onDismiss={onDismiss} onApplyParaphrase={onApplyParaphrase} />
      ) : (
        <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>Este capítulo no tiene párrafos marcados.</p>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Extract `EvaluacionComparador.tsx` and wire `AiHierarchy`**

Extraer el bloque del split comparador + barra de acciones de `AiHierarchy.tsx` (líneas 686-982) a un componente nuevo:

```tsx
// src/components/review/EvaluacionComparador.tsx
import React, { useState } from 'react';
import type { AuditItem } from '../../lib/auditItems';
import { Layers, Copy, Flag, X } from 'lucide-react';

export interface EvaluacionComparadorProps {
  item: AuditItem;
  onMark?: (item: AuditItem) => void;
  onDismiss?: (item: AuditItem) => void;
  onApplyParaphrase?: (item: AuditItem, newText: string) => Promise<void>;
  busy?: boolean;
}

export function EvaluacionComparador({ item, onMark, onDismiss, onApplyParaphrase, busy }: EvaluacionComparadorProps) {
  const [proposal, setProposal] = useState(item.suggestedText ?? '');
  const [copiado, setCopiado] = useState(false);
  const aplicar = async () => {
    if (busy || !onApplyParaphrase || !proposal.trim()) return;
    await onApplyParaphrase(item, proposal);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
        <div>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-tertiary)' }}>Texto Original (Fórmula LLM Detectada)</span>
          <p style={{ margin: '6px 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>{item.originalText}</p>
        </div>
        <div>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-tertiary)' }}>Propuesta con Voz de Autor Humana</span>
          <textarea value={proposal} onChange={(e) => setProposal(e.target.value)}
            style={{ marginTop: 6, width: '100%', minHeight: 90, fontFamily: 'var(--font-family)', fontSize: 'var(--text-sm)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => navigator.clipboard?.writeText(item.originalText).then(() => setCopiado(true))}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
          <Copy size={14} aria-hidden /> {copiado ? 'Copiado' : 'Copiar'}
        </button>
        <button type="button" onClick={() => onMark?.(item)} disabled={(item.readOnly)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
          <Flag size={14} aria-hidden /> Marcar para revisar
        </button>
        <button type="button" onClick={() => onDismiss?.(item)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
          <X size={14} aria-hidden /> Descartar
        </button>
        <button type="button" onClick={aplicar} disabled={busy}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-accent)', backgroundColor: 'var(--color-accent)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
          <Layers size={14} aria-hidden /> Reemplazar en Manuscrito
        </button>
      </div>
    </div>
  );
}
```

En `AiHierarchy.tsx`: importar `AiChapterGrid` y `AiChapterFocus`, añadir estado `const [capAbierto, setCapAbierto] = useState<string | null>(null)`, y **reemplazar** el `<aside aria-label="Jerarquía Capitular">` (390-578) por:

```tsx
{capAbierto ? (
  <AiChapterFocus
    titulo={chapters.find((c) => c.id === capAbierto)?.title ?? ''}
    findings={chapters.find((c) => c.id === capAbierto)?.subsections.flatMap((s) => s.findings) ?? []}
    onMark={onMark}
    onDismiss={onDismiss}
    onApplyParaphrase={onApplyParaphrase}
    onBack={() => setCapAbierto(null)}
  />
) : (
  <AiChapterGrid
    chapters={chapters.map((c) => ({ id: c.id, titulo: c.title, findings: c.subsections.flatMap((s) => s.findings) }))}
    onOpen={setCapAbierto}
  />
)}
```
Sustituir el bloque del split comparador dentro del inspector (686-982) por `<EvaluacionComparador item={currentFinding} onMark={onMark} onDismiss={onDismiss} onApplyParaphrase={onApplyParaphrase} busy={busy} />` (o eliminar el inspector de alertas si el focus por capítulo ya lo reemplaza — decidir al ver el render; el requisito es que al entrar solo se vean hero + heatmap + rectángulos).

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/__tests__/aiHierarchy.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
& 'C:\Program Files\Git\cmd\git.exe' add src/components/review/AiChapterGrid.tsx src/components/review/AiChapterFocus.tsx src/components/review/EvaluacionComparador.tsx src/components/review/AiHierarchy.tsx src/__tests__/aiHierarchy.test.tsx
& 'C:\Program Files\Git\cmd\git.exe' commit -m "feat(mapa-ia): capitulos como rectangulos y vista aislada por capitulo"
```

---

### Task 11: Limpieza y verificación de la rama

**Files:**
- Delete (si nadie más los usa): `src/components/review/ReviewPhaseJourney.tsx`, `src/components/review/CategoryRail.tsx`, `src/components/review/CategoryDashboard.tsx`
- Modify: `docs/superpowers/specs/2026-10-04-separar-revision-mapa-ia-design.md` (marcar estado final si aplica)

- [ ] **Step 1: Confirmar que nadie los usa**

Run: `Select-String -Path src\**\*.tsx,src\**\*.ts -Pattern 'ReviewPhaseJourney|CategoryRail|CategoryDashboard' -List`
Expected: si solo aparecen los propios archivos, se pueden borrar con `git rm`. Si un test los importa, actualizar el test en vez de borrar.

- [ ] **Step 2: Borrar y commitear**

```bash
& 'C:\Program Files\Git\cmd\git.exe' rm src/components/review/ReviewPhaseJourney.tsx src/components/review/CategoryRail.tsx src/components/review/CategoryDashboard.tsx
& 'C:\Program Files\Git\cmd\git.exe' commit -m "refactor(revision): retira la ruta journey reemplazada por informe+reader"
```

- [ ] **Step 3: Type-check y color-check**

Run: `npx tsc --noEmit`
Expected: sin errores.
Run: `npx vitest run src/__tests__/noHardcodedColors.test.ts src/__tests__/designTokens.test.ts`
Expected: PASS.

- [ ] **Step 4: Suite completa y build**

Run: `npm test`
Expected: ≥ 1401 verdes.
Run: `npm run build`
Expected: build OK.
Run (opcional si el backend tocó algo): `pytest -q python/tests/`
Expected: ≥ 809.

- [ ] **Step 5: Verificar ausencia de CJK en los archivos nuevos y commitear docs si cambió**

Run: `Select-String -Path src\lib\aiHeatmap.ts,src\lib\capitulosRevision.ts,src\lib\informeRevision.ts,src\components\review\ReviewInforme.tsx,src\components\review\ReviewReader.tsx,src\components\review\AiHeatmap.tsx,src\components\review\AiChapterGrid.tsx,src\components\review\AiChapterFocus.tsx,src\components\review\EvaluacionComparador.tsx -Pattern '[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]'`
Expected: sin coincidencias.

---

## Self-Review

**1. Cobertura del spec:**
- Dos entradas / IA fuera de Revisión → Task 5 (gate sin fila IA) + Task 8 (`informe`/`reader` sin categoría `ai`).
- R1 Informe general (Bloom + repetición + salud) → Tasks 2, 3, 6.
- R2 Modo lectura (hoja + cinta + dock + informe encima) → Task 7, secuencia en Task 8.
- Mapa IA dashboard (hero + heatmap + rectángulos + vista aislada) → Tasks 4, 9, 10.
- Bug `aiScore` ×100 y deps del `useMemo` → Task 9 Step 4.
- Módulo puro del heatmap con test → Task 4.

**2. Placeholders:** no hay TBD; los textos «nombre a definir» se resolvieron a nombres concretos en el spec y aquí.

**3. Consistencia de tipos:** `CapituloRevision` (Task 1) lo consumen Tasks 6, 7 y 9/10 (vía `chapters` de `AiHierarchy`, que expone `subsections[].findings`). `FilaHeatmap` (Task 4) lo consumen Task 9. `AuditItem` es el tipo único que viaja por todas las superficies.

**4. Review Focus:** sin H1 (Task 1 test), sin objetivos (Task 6 estado vacío), IA sin medición (Task 4 `sinMedir`), `element_id` inexistente (Task 7 delega en `ReadingText`; el dock igual muestra el hallazgo), portada antes del primer H1 (Task 1 test), muchos hallazgos (Task 9/10: al entrar solo hero + heatmap + rectángulos).

---

## Anexo A — Leyes de metodología por fase van PRIMERO (requisito del 2026-10-04)

Requisito del usuario: «hay correcciones para anexos, conclusiones, resultados, metodología, título; todos tienen reglas generales de metodología de la investigación y son leyes que no se deben romper… pon esos de primero si los hay».

**Cambio en R1 (`ReviewInforme`):** antes de Objetivos·Bloom y de Repetición, un bloque **«Leyes de metodología»** que agrupa por fase los hallazgos cuyo `AuditItem.phase` es una fase concreta (no `global`, no `null`). Orden de fases: objetivos → metodología (`metodo`) → marco teórico → resultados → discusión → conclusiones → resumen → título/portada → anexos. Si no hay ninguno, el bloque no se pinta.

- Helper puro nuevo en `src/lib/informeRevision.ts`:
  - `export interface LeyPorFase { phase: string; label: string; items: AuditItem[] }`
  - `export function leyesPorFase(items: readonly AuditItem[]): LeyPorFase[]` — filtra `item.phase && item.phase !== 'global'`, agrupa por `phase`, ordena por `PHASE_ORDER` de `../../lib/auditItems` y devuelve `label` con `phaseLabel(phase)`.
- Test en `src/__tests__/informeRevision.test.ts`: dos items con `phase: 'objetivos'` y `phase: 'metodo'` → dos grupos, objetivos primero; un item `phase: 'global'`/`null` queda fuera.

**Leyes de fase vivas hoy (para los tests de contenido, no inventar):**

| Fase (`phase`) | kinds vivos |
|---|---|
| `objetivos` | `bloom_vague`, `objetivo_sin_variable` (+ los nuevos de Task 12) |
| `metodo` | `metodo_sin_detalle`, `paragraph_words` |
| `marco_teorico` | `parafrasis_vs_cita` |
| `resultados` / `discusion` / `conclusiones` / `resumen` | `verbo_pasado`, `paragraph_words` |
| `portada` (título) | `portada_title_larga`, `portada_punto_final` |
| `anexos` | (sin kind propio; solo globales) |

Los rótulos por fase salen de `phaseLabel(phase)` (`src/lib/auditItems.ts`); no se hardcodea texto de fase en la vista.

### Task 12: Backend — leyes de objetivos en infinitivo y verbo único

**Files:**
- Modify: `python/modules/phase_scope.py` (nuevos checkers + `RULE_SCOPES` + `_CHECKS`)
- Test: `python/tests/test_phase_scope.py` (extender)

**Interfaces:**
- Produces: dos `kind` nuevos, ambos scope `objetivos`:
  - `objetivo_sin_infinitivo` — el verbo rector del objetivo no está en infinitivo (termina en algo que no es `-ar/-er/-ir`).
  - `objetivo_multi_verbo` — el objetivo contiene más de un verbo en infinitivo.

- [ ] **Step 1: Write the failing tests** (en `python/tests/test_phase_scope.py`)

```python
def test_objetivo_sin_infinitivo_emite_kind():
    from python.modules.phase_scope import phase_findings
    out = phase_findings([{"id": "o1", "type": "paragraph", "text": "Conoce los procesos de gestión"}])
    kinds = [f["kind"] for f in out]
    assert "objetivo_sin_infinitivo" in kinds

def test_objetivo_multi_verbo_emite_kind():
    from python.modules.phase_scope import phase_findings
    out = phase_findings([{"id": "o1", "type": "paragraph", "text": "Determinar y evaluar el efecto de X sobre Y"}])
    kinds = [f["kind"] for f in out]
    assert "objetivo_multi_verbo" in kinds
```

> Ajustar el arranque (`phase_findings` recibe la lista dentro de una fase `objetivos`; copiar el patrón de los tests existentes de `_check_bloom_verb` en ese mismo archivo, línea ~409-430 de `test_phase_scope.py`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest -q python/tests/test_phase_scope.py -k "infinitivo or multi_verbo"`
Expected: FAIL — kinds no emitidos.

- [ ] **Step 3: Implement in `phase_scope.py`**

Añadir a `RULE_SCOPES` (junto a `bloom_vague`/`objetivo_sin_variable`, línea ~247):

```python
    "objetivo_sin_infinitivo": "objetivos",
    "objetivo_multi_verbo": "objetivos",
```

Añadir los checkers junto a `_check_objetivo_sin_variable`:

```python
_INFINITIVO_RE = re.compile(r"\b[a-záéíóúñ]{4,}(?:ar|er|ir)\b", re.IGNORECASE)

def _check_objetivo_sin_infinitivo(eid, text, cfg, mk):
    words = _WORD_SPLIT.findall(text or "")
    if not words:
        return []
    first = words[0].lower()
    if first.endswith(("ar", "er", "ir")):
        return []
    return [mk(eid, text, 0, len(text or ""), "objetivo_sin_infinitivo", "warn",
               "El objetivo debe abrir con un verbo en infinitivo (determinar, evaluar, analizar).",
               suggestion="Determinar ...", phase=cfg.key, read_only=cfg.read_only)]

def _check_objetivo_multi_verbo(eid, text, cfg, mk):
    infinitivos = _INFINITIVO_RE.findall(text or "")
    if len(infinitivos) <= 1:
        return []
    return [mk(eid, text, 0, len(text or ""), "objetivo_multi_verbo", "warn",
               f"El objetivo usa {len(infinitivos)} verbos en infinitivo; debe tener uno solo.",
               suggestion="Elegí un único verbo rector.", phase=cfg.key, read_only=cfg.read_only)]
```

Registrar ambos en `_CHECKS` (línea ~470-484) y en el `criteria` de `PHASES['objetivos']` (línea ~60-65):

```python
                criteria=("bloom_verb", "objetivo_sin_variable",
                          "objetivo_sin_infinitivo", "objetivo_multi_verbo")),
```
Mapear los criterios a los checkers donde `criteria` se resuelve a `_CHECKS` (mismo patrón que `bloom_verb`→`_check_bloom_verb`).

- [ ] **Step 4: Run tests**

Run: `pytest -q python/tests/test_phase_scope.py python/tests/test_rule_scopes.py`
Expected: PASS. Si `test_rule_scopes.py` exige que cada kind emitido esté declarado, ya lo está; si exige lo inverso para los `criteria`, ajustar el mismo test para incluir los dos nuevos (el test declara a mano los kinds sin productor, no los criteria).

- [ ] **Step 5: Añadir rótulos en `src/lib/rotulos.ts`**

```ts
  objetivo_sin_infinitivo: { category: 'style', subtype: 'objetivo_verbo', severity: 'high', summary: DEL_MOTOR },
  objetivo_multi_verbo: { category: 'style', subtype: 'objetivo_verbo', severity: 'high', summary: DEL_MOTOR },
```

- [ ] **Step 6: Commit**

```bash
& 'C:\Program Files\Git\cmd\git.exe' add python/modules/phase_scope.py python/tests/test_phase_scope.py src/lib/rotulos.ts
& 'C:\Program Files\Git\cmd\git.exe' commit -m "feat(leyes): objetivos con verbo en infinitivo y verbo unico"
```
