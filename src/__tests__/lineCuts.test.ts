import { describe, it, expect } from 'vitest';
import { expandByLineCuts, LayoutCutsMap } from '../lib/lineCuts';
import { ElementModel, ElementType } from '../types';

const para = (id: string, text: string): ElementModel =>
  ({ id, type: 'paragraph' as ElementType, text } as unknown as ElementModel);

const H1 = (id: string): ElementModel =>
  ({ id, type: 'heading' as ElementType, heading_level: 1, text: 'Título' } as unknown as ElementModel);

describe('expandByLineCuts (cortes Word)', () => {
  it('recomposición exacta: concat de fragmentos === texto original', () => {
    const text = 'primera parte del parrafo. ' + 'x '.repeat(50) + 'ultima parte.';
    const cuts: LayoutCutsMap = { e1: [{ offset: 30, page: 2 }] };
    const out = expandByLineCuts([para('e1', text)], cuts);
    expect(out.length).toBe(2);
    expect(out.map((e) => e.text).join('')).toBe(text);
  });

  it('page_number por fragmento: primero conserva el original, el resto la página del corte', () => {
    const text = 'a'.repeat(200);
    const el = { ...para('e1', text), page_number: 3 } as ElementModel;
    const cuts: LayoutCutsMap = { e1: [{ offset: 100, page: 5 }] };
    const out = expandByLineCuts([el], cuts);
    expect(out[0].page_number).toBe(3);
    expect(out[1].page_number).toBe(5);
    expect(out[0].split_chunk).toBe(0);
    expect(out[1].split_chunk).toBe(1);
  });

  it('offset fuera de rango y no monótonos se descartan (sin cortes → original)', () => {
    const el = para('e1', 'corto');
    expect(expandByLineCuts([el], { e1: [{ offset: 999, page: 2 }] })).toEqual([el]);
    const text = 'y'.repeat(100);
    const out = expandByLineCuts(
      [para('e2', text)],
      { e2: [{ offset: 40, page: 2 }, { offset: 20, page: 3 }, { offset: 0, page: 4 }] },
    );
    expect(out.length).toBe(2);
    expect(out.map((e) => e.text).join('')).toBe(text);
  });

  it('NUNCA parte portada ni títulos Nivel 1', () => {
    const cover = { ...para('c1', 'portada '.repeat(30)), is_cover_section: true } as ElementModel;
    const h1 = H1('h1');
    const out = expandByLineCuts([cover, h1], {
      c1: [{ offset: 20, page: 2 }],
      h1: [{ offset: 5, page: 2 }],
    });
    expect(out).toEqual([cover, h1]);
  });

  it('tipos no partibles (tabla) no se expanden', () => {
    const table = { ...para('t1', 'celda'), type: 'table' as ElementType } as ElementModel;
    expect(expandByLineCuts([table], { t1: [{ offset: 3, page: 2 }] })).toEqual([table]);
  });

  it('sin cortes → mismo array por referencia (cero costo en render)', () => {
    const els = [para('e1', 'abc')];
    expect(expandByLineCuts(els, {})).toBe(els);
    expect(expandByLineCuts(els, null)).toBe(els);
    const other = expandByLineCuts(els, { zzz: [{ offset: 1, page: 2 }] });
    expect(other).toBe(els);   // corte de un id inexistente → nada que hacer
  });
});
