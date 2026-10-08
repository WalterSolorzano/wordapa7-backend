/**
 * computePages con paginación real de Word (elem.page_number).
 * La verdad de Word manda; heurística queda como fallback sin backend.
 */
import { describe, it, expect } from 'vitest';
import { computePages } from '../components/layout/PaperCanvas';
import { ElementModel, ElementType } from '../types';

const p = (id: string, extra: Partial<ElementModel> = {}): ElementModel => ({
  id,
  type: 'paragraph' as ElementType,
  text: 'x',
  confidence: 1,
  is_user_modified: false,
  needs_review: false,
  auto_applied: false,
  cita_ids: [],
  ...extra,
} as ElementModel);

describe('computePages con paginación real de Word', () => {
  it('page_number del backend corta páginas', () => {
    const els = [
      p('a', { page_number: 1 }),
      p('b', { page_number: 1 }),
      p('c', { page_number: 2 }),
      p('d', { page_number: 3 }),
    ];
    const pages = computePages(els, 1000); // maxUnits alto: heurística no puede cortar
    expect(pages.length).toBe(3);
    expect(pages[1].map((e) => e.id)).toEqual(['c']);
    expect(pages[2].map((e) => e.id)).toEqual(['d']);
  });

  it('elemento sin page_number sigue al anterior en su página', () => {
    const els = [
      p('a', { page_number: 1 }),
      p('b'),
      p('c', { page_number: 2 }),
    ];
    const pages = computePages(els, 1000);
    expect(pages.length).toBe(2);
    expect(pages[0].map((e) => e.id)).toEqual(['a', 'b']);
    expect(pages[1].map((e) => e.id)).toEqual(['c']);
  });

  it('portada indivisible siempre en pág 1, cuerpo pagina tras ella', () => {
    // Con page_break, Word numera cover=1 y cuerpo desde 2.
    const els = [
      p('cover', { is_cover_section: true, page_number: 1 }),
      p('a', { page_number: 2 }),
      p('b', { page_number: 3 }),
    ];
    const pages = computePages(els, 1000);
    expect(pages[0].some((e) => e.id === 'cover')).toBe(true);
    expect(pages[0].some((e) => e.id === 'a')).toBe(false);
    expect(pages.length).toBe(3);
  });

  it('sin page_number: fallback heurístico intacto, sin pérdidas', () => {
    const els = Array.from({ length: 60 }, (_, i) =>
      p(`e${i}`, { text: 'una linea'.repeat(20) }));
    const pages = computePages(els, 14);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat().length).toBe(els.length);
  });

  it('nunca pierde ni duplica elementos', () => {
    const els = [p('a', { page_number: 1 }), p('b', { page_number: 9 })];
    const flat = computePages(els, 1000).flat();
    expect(flat.length).toBe(2);
    expect(new Set(flat.map((e) => e.id)).size).toBe(2);
  });

  it('page_numbers no contiguos (1,5) no crean páginas vacías intermedias', () => {
    const els = [p('a', { page_number: 1 }), p('b', { page_number: 5 })];
    const pages = computePages(els, 1000);
    expect(pages.length).toBe(2);
    expect(pages[1][0].id).toBe('b');
  });
});

describe('computePages con firstPageOnly (miniatura onlyCover)', () => {
  it('con portada, firstPageOnly devuelve SOLO la portada', () => {
    const els = [
      p('cover', { is_cover_section: true, page_number: 1 }),
      ...Array.from({ length: 40 }, (_, i) => p(`b${i}`, { page_number: 2 + i })),
    ];
    const full = computePages(els, 14);
    expect(full.length).toBeGreaterThan(1);

    const only = computePages(els, 14, true);
    expect(only).toHaveLength(1);
    expect(only[0].map((e) => e.id)).toEqual(['cover']);
  });

  it('sin portada y con paginación Word, devuelve la primera página del cuerpo', () => {
    const els = [
      p('a', { page_number: 1 }),
      p('b', { page_number: 2 }),
      p('c', { page_number: 3 }),
    ];
    const only = computePages(els, 14, true);
    expect(only).toHaveLength(1);
    expect(only[0].map((e) => e.id)).toEqual(['a']);
  });

  it('sin portada y sin page_number, devuelve una sola página no vacía', () => {
    const els = Array.from({ length: 60 }, (_, i) =>
      p(`e${i}`, { text: 'una linea'.repeat(20) }));
    const only = computePages(els, 14, true);
    expect(only).toHaveLength(1);
    expect(only[0].length).toBeGreaterThan(0);
  });

  it('sin firstPageOnly el resultado no cambia', () => {
    const els = Array.from({ length: 60 }, (_, i) =>
      p(`e${i}`, { text: 'una linea'.repeat(20) }));
    expect(computePages(els, 14, false).length).toBe(computePages(els, 14).length);
  });
});
