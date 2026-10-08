/**
 * Invariante APA 7: los títulos de Nivel 1 (heading_level === 1) SIEMPRE
 * inician página. applyPageFlow (reparto por alturas medidas) no puede dejar
 * un heading 1 en posición > 0 de una página: si el reparto lo hace, la
 * página se corta justo antes del título.
 */
import { describe, it, expect } from 'vitest';
import { applyPageFlow } from '../lib/pageSplitter';
import { getPageGeometry } from '../lib/pageGeometry';
import { ElementModel, ElementType } from '../types';

const geom = getPageGeometry({ margins_cm: 2.54, font_size_pt: 12, line_spacing: 2 });
const LH = geom.lineHeightPx;

const para = (id: string, text: string): ElementModel => ({
  id,
  type: 'paragraph' as ElementType,
  text,
} as unknown as ElementModel);

const h1 = (id: string, text: string): ElementModel => ({
  id,
  type: 'heading' as ElementType,
  heading_level: 1,
  text,
} as unknown as ElementModel);

const h2 = (id: string, text: string): ElementModel => ({
  id,
  type: 'heading' as ElementType,
  heading_level: 2,
  text,
} as unknown as ElementModel);

const firstLevel1Idx = (page: ElementModel[]): number =>
  page.findIndex((e) => e.type === 'heading' && e.heading_level === 1);

describe('applyPageFlow — títulos Nivel 1 inician página', () => {
  it('heading1 tras párrafo medido que excede NO queda a mitad de hoja', () => {
    // Página de entrada con párrafo enorme + heading1 después (entrada mal
    // cortada, p. ej. page_number de Word incompleto).
    const big = para('big', 'palabra '.repeat(900));
    const title = h1('t1', 'Metodología');
    const heights = new Map<string, number>([['big', LH * 70]]);
    const out = applyPageFlow([[big, title]], heights, geom);

    for (const page of out) {
      const idx = firstLevel1Idx(page);
      if (idx !== -1) expect(idx).toBe(0);
    }
    // el título existe en alguna página
    expect(out.flat().some((e) => e.id === 't1')).toBe(true);
  });

  it('heading1 inicial se conserva como primer elemento (identidad)', () => {
    const title = h1('t1', 'Resultados');
    const body = para('p1', 'contenido '.repeat(200));
    const heights = new Map<string, number>([['p1', LH * 10]]);
    const out = applyPageFlow([[title, body]], heights, geom);
    expect(firstLevel1Idx(out[0])).toBe(0);
    expect(out[0][0]).toBe(title);
  });

  it('heading2 NO fuerza corte (puede ir a mitad de página)', () => {
    const body = para('p1', 'contenido '.repeat(100));
    const title = h2('t2', 'Subtema');
    const heights = new Map<string, number>([['p1', LH * 5]]);
    const out = applyPageFlow([[body, title]], heights, geom);
    expect(out.length).toBe(1);
    expect(out[0][1]).toBe(title);
  });

  it('fragmentos de párrafo no empujan heading1 fuera del inicio de su página', () => {
    // Página A: heading1 + párrafo que excede -> el excedente va a páginas
    // nuevas DESPUÉS; el heading1 permanece primero en su página.
    const title = h1('t1', 'Discusión');
    const big = para('big', 'palabra '.repeat(800));
    const heights = new Map<string, number>([['big', LH * 60]]);
    const out = applyPageFlow([[title, big]], heights, geom);
    expect(firstLevel1Idx(out[0])).toBe(0);
    expect(out[0][0]).toBe(title);
  });
});
