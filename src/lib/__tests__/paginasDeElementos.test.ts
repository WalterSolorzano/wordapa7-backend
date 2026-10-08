/* El número de página del índice sale de las páginas YA calculadas por el
 * lienzo, no de una fórmula inventada. Este helper las indexa por elemento. */

import { describe, it, expect } from 'vitest';
import { paginasPorElemento } from '../paginasDeElementos';
import type { ElementModel } from '../../types';

const el = (id?: string) => ({ id }) as unknown as ElementModel;

describe('paginasPorElemento', () => {
  it('asigna páginas 1-based y gana el primer fragmento', () => {
    const mapa = paginasPorElemento([[el('a')], [el('a'), el('b')], [el('c')]]);
    expect(mapa.get('a')).toBe(1);
    expect(mapa.get('b')).toBe(2);
    expect(mapa.get('c')).toBe(3);
  });

  it('ignora elementos sin id: nunca inventa una página', () => {
    const mapa = paginasPorElemento([[el(undefined)], [el('x')]]);
    expect(mapa.size).toBe(1);
    expect(mapa.get('x')).toBe(2);
  });
});
