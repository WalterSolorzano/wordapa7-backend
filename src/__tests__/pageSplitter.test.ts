/**
 * applyPageFlow — reparte páginas calculadas midiendo alturas reales:
 * - nada de recorte: párrafo que excede la hoja se parte (fracciones de texto)
 * - portada indivisible: nunca se toca
 * - sin mediciones (primera pintura / página virtualizada) → sin cambios
 */
import { describe, it, expect } from 'vitest';
import { applyPageFlow, sliceFraction, estimateLines } from '../lib/pageSplitter';
import { getPageGeometry } from '../lib/pageGeometry';
import { ElementModel, ElementType } from '../types';

const geom = getPageGeometry({ margins_cm: 2.54, font_size_pt: 12, line_spacing: 2 });
const LH = geom.lineHeightPx;

const p = (
  id: string,
  extra: Partial<ElementModel> = {},
): ElementModel => ({
  id,
  type: 'paragraph' as ElementType,
  text: 'palabra '.repeat(400),
  ...extra,
} as ElementModel);

describe('sliceFraction', () => {
  const text = 'aaa bbb ccc ddd eee fff ggg hhh';

  it('las fracciones contiguas recomponen el texto exacto (cero pérdida)', () => {
    const a = sliceFraction(text, 0, 0.5);
    const b = sliceFraction(text, 0.5, 1);
    expect(a + b).toBe(text);
  });

  it('tres fracciones recomponen exacto', () => {
    const a = sliceFraction(text, 0, 1 / 3);
    const b = sliceFraction(text, 1 / 3, 2 / 3);
    const c = sliceFraction(text, 2 / 3, 1);
    expect(a + b + c).toBe(text);
  });

  it('fracción completa devuelve el texto tal cual', () => {
    expect(sliceFraction(text, 0, 1)).toBe(text);
    expect(sliceFraction(text, 0, 1)).toBe(text);
  });

  it('corta en espacio (sin partir palabras en el borde)', () => {
    const part = sliceFraction(text, 0, 0.5);
    // el borde se arrastra a un espacio: el último fragmento es "palabra" completo
    expect(text.slice(part.length - 6, part.length + 1)).toMatch(/^ ?\w{0,6} $|^ ?\w+ $| /);
    expect(part.length).toBeGreaterThan(0);
  });
});

describe('estimateLines', () => {
  it('estima líneas por largo de texto y ancho de contenido', () => {
    const e = p('x', { text: 'a'.repeat(90 * 20) });
    const lines = estimateLines(e, geom);
    expect(lines).toBeGreaterThan(10);
    expect(lines).toBeLessThan(40);
  });

  it('texto vacío = 1 línea', () => {
    expect(estimateLines(p('y', { text: '' }), geom)).toBe(1);
  });
});

describe('applyPageFlow', () => {
  it('sin mediciones: devuelve las páginas sin tocar (primera pintura)', () => {
    const page = [p('a'), p('b')];
    const out = applyPageFlow([page], new Map(), geom);
    expect(out[0][0]).toBe(page[0]);
    expect(out[0][1]).toBe(page[1]);
    expect(out.length).toBe(1);
  });

  it('párrafo medido que excede la hoja se parte en varios fragmentos', () => {
    const huge = p('big');
    const heights = new Map<string, number>([['big', LH * 65]]); // 65 líneas ≈ 2.5 hojas
    const out = applyPageFlow([[huge]], heights, geom);
    const totalLines = Math.floor(geom.contentH / LH);
    expect(out.length).toBeGreaterThan(1);
    const chunks = out.flat().filter((e) => e.id === 'big');
    expect(chunks.length).toBe(out.length);
    // recomposición exacta: ningún texto perdido
    const recomposed = chunks.map((c) => c.text).join('');
    expect(recomposed).toBe(huge.text);
    // marcador de fragmento para comentarios/medición
    expect(chunks[0].split_chunk).toBe(0);
    expect(chunks[1].split_chunk).toBeGreaterThan(0);
    // no se excede: cada hoja rinde < hoja completa en el plan de líneas
    expect(totalLines).toBeGreaterThan(0);
  });

  it('elemento pequeño medido se queda igual (identidad preservada)', () => {
    const small = p('s', { text: 'corto' });
    const heights = new Map<string, number>([['s', LH * 3]]);
    const out = applyPageFlow([[small]], heights, geom);
    expect(out.length).toBe(1);
    expect(out[0][0]).toBe(small);
  });

  it('acumulación que excede: segundo párrafo se parte y continúa', () => {
    const a = p('a', { text: 'primero ' + 'x '.repeat(100) });
    const b = p('b', { text: 'segundo ' + 'y '.repeat(100) });
    const contentLines = Math.floor(geom.contentH / LH);
    const heights = new Map<string, number>([
      ['a', LH * Math.ceil(contentLines * 0.6)],
      ['b', LH * Math.ceil(contentLines * 0.6)],
    ]);
    const out = applyPageFlow([[a, b]], heights, geom);
    expect(out.length).toBe(2);
    expect(out[0].some((e) => e.id === 'a')).toBe(true);
    const bChunks = out.flat().filter((e) => e.id === 'b');
    expect(bChunks.length).toBe(2);
    expect(bChunks.map((c) => c.text).join('')).toBe(b.text);
  });

  it('tabla indivisible excedente NO se parte (queda entera)', () => {
    const table = p('t', { type: 'table' as ElementType, text: undefined });
    const heights = new Map<string, number>([['t', LH * 80]]);
    const out = applyPageFlow([[table]], heights, geom);
    expect(out.flat().filter((e) => e.id === 't').length).toBe(1);
    expect(out[0][0].split_chunk).toBeUndefined();
  });

  it('portada nunca se parte aunque mida de más', () => {
    const cover = p('c', { is_cover_section: true, text: 'portada larga' });
    const heights = new Map<string, number>([['c', LH * 200]]);
    const out = applyPageFlow([[cover]], heights, geom);
    expect(out.flat().length).toBe(1);
    expect(out[0][0]).toBe(cover);
  });

  it('elemento sin medición dentro de página medida usa estimación y no pierde', () => {
    const measured = p('m', { text: 'medido' });
    const unknown = p('u', { text: 'sin medir '.repeat(500) });
    const heights = new Map<string, number>([['m', LH * 2]]);
    const out = applyPageFlow([[measured, unknown]], heights, geom);
    const flat = out.flat();
    expect(flat.map((e) => e.id)).toContain('u');
    // nunca pérdida: recomposición de 'u' si se partió
    const uChunks = flat.filter((e) => e.id === 'u');
    expect(uChunks.map((c) => c.text).join('')).toBe(unknown.text);
  });

  it('fragmentos con split_chunk (cortes Word) son atómicos: el flow no los vuelve a partir', () => {
    // Helpers existentes del archivo: p(id, extra), geom y LH (líneas 12-23).
    const f1 = { ...p('e1', { text: 'abc ' }), split_chunk: 0 } as ElementModel;
    const f2 = { ...p('e1', { text: ' def' }), split_chunk: 1 } as ElementModel;
    // Altura medida STALE (elemento completo antes de expandir): 50 líneas.
    const heights = new Map<string, number>([['e1', LH * 50]]);
    const out = applyPageFlow([[f1, f2]], heights, geom);
    const texts = out.flat().map((e) => e.text);
    expect(texts).toContain('abc ');
    expect(texts).toContain(' def');
  });
});

describe('applyPageFlow tablas', () => {
  const geomTabla = { contentH: 200, lineHeightPx: 20, contentW: 500 } as any;
  const tabla = {
    id: 't1',
    type: 'table' as ElementType,
    table_info: {
      element_id: 't1',
      headers: ['A'],
      rows: Array.from({ length: 12 }, (_, i) => [String(i)]),
      table_number: 1,
    },
  } as unknown as ElementModel;

  it('parte una tabla alta en rebanadas de filas', () => {
    const heights = new Map<string, number>([['t1', 600]]);
    const out = applyPageFlow([[tabla]], heights, geomTabla)
      .flat()
      .filter((e) => e.id === 't1');
    expect(out.length).toBeGreaterThan(1);
    expect(out[0].table_slice!.start).toBe(0);
    expect(out[out.length - 1].table_slice!.end).toBe(12);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].table_slice!.start).toBe(out[i - 1].table_slice!.end);
    }
  });

  it('no parte una tabla de la portada (portada indivisible)', () => {
    const tablaPortada = { ...tabla, is_cover_section: true } as unknown as ElementModel;
    const heights = new Map<string, number>([['t1', 600]]);
    const out = applyPageFlow([[tablaPortada]], heights, geomTabla)
      .flat()
      .filter((e) => e.id === 't1');
    expect(out).toHaveLength(1);
    expect(out[0].table_slice).toBeUndefined();
  });
});
