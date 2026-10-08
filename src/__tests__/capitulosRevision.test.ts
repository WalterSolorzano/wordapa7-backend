import { describe, it, expect } from 'vitest';
import { construirCapitulos, capituloDeElemento, contarPorCapitulo } from '../lib/capitulosRevision';
import type { ElementModel } from '../types';
import type { AuditItem } from '../lib/auditItems';

const el = (id: string, type: string, heading_level: number | null, text: string): ElementModel =>
  ({ id, type, heading_level, text } as ElementModel);

const docs = [
  el('p0', 'paragraph', null, 'Portada'),
  el('h1', 'heading', 1, '1. Introduccion'),
  el('p1', 'paragraph', null, 'Texto intro'),
  el('h2', 'heading', 2, '1.1 Sub'),
  el('p2', 'paragraph', null, 'Mas texto'),
  el('h3', 'heading', 1, '2. Metodologia'),
  el('p3', 'paragraph', null, 'Metodo'),
];

const item = (id: string, element_id: string): AuditItem =>
  ({ id, element_id, category: 'style', subtype: 'x', severity: 'medium', summary: '', detail: '', originalText: '', pageNumber: null, phase: null, readOnly: false }) as AuditItem;

describe('construirCapitulos', () => {
  it('abre un capitulo por cada H1 y lo cierra en el siguiente H1', () => {
    const caps = construirCapitulos(docs);
    expect(caps.map((c) => c.titulo)).toEqual(['1. Introduccion', '2. Metodologia']);
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

  it('mapea un elemento a su capitulo', () => {
    const caps = construirCapitulos(docs);
    expect(capituloDeElemento(caps, 'p2')?.titulo).toBe('1. Introduccion');
    expect(capituloDeElemento(caps, 'p3')?.titulo).toBe('2. Metodologia');
    expect(capituloDeElemento(caps, 'p0')).toBeNull();
  });

  it('cuenta hallazgos por capitulo', () => {
    const caps = construirCapitulos(docs);
    const counts = contarPorCapitulo([item('a', 'p1'), item('b', 'p2'), item('c', 'p3'), item('d', 'nope')], caps);
    expect(counts).toEqual({ h1: 2, h3: 1 });
  });
});
