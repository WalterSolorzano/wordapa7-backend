/**
 * La numeración de títulos vivía embebida en `PaperCanvas`: la preview del
 * índice no la veía y podía contradecir al título de la hoja. Esta es la
 * fuente única; el lienzo y la vista previa la consumen.
 */

import { describe, it, expect } from 'vitest';
import { construirTextosDeTitulo, muestraIndice } from '../numeracionTitulos';
import type { ElementModel } from '../../types';

const el = (
  o: Partial<ElementModel> & { id: string; type: ElementModel['type']; text: string },
): ElementModel => ({ is_cover_section: false, ...o }) as ElementModel;

const h = (id: string, text: string, heading_level: number, extra: Partial<ElementModel> = {}) =>
  el({ id, type: 'heading', text, heading_level, ...extra });

describe('construirTextosDeTitulo', () => {
  it('numera H1 en decimal cuando la regla lo pide', () => {
    const t = construirTextosDeTitulo([h('a', 'Introducción', 1)], {
      heading_numbering_style_lvl1: 'decimal',
    });
    expect(t.get('a')).toBe('1. Introducción');
  });

  it('aplica romanos al nivel elegido y deja decimal al componente del padre', () => {
    const t = construirTextosDeTitulo(
      [h('h1', 'Marco', 1), h('h2', 'Contexto', 2)],
      { heading_numbering_style_lvl1: 'upperRoman', heading_numbering_style_lvl2: 'lowerLetter' },
    );
    expect(t.get('h1')).toBe('I. Marco');
    // El componente del padre sigue decimal: la notación elegida manda solo en
    // el propio nivel. Esa es la regla que ya aplicaba el lienzo.
    expect(t.get('h2')).toBe('1.a. Contexto');
  });

  it('sin numerar devuelve el título limpio, sin prefijo previo', () => {
    const t = construirTextosDeTitulo([h('a', '3. Método', 1)], {
      heading_numbering_style_lvl1: 'none',
    });
    expect(t.get('a')).toBe('Método');
  });

  it('excluye la portada y la sección de referencias', () => {
    const t = construirTextosDeTitulo(
      [
        h('c', 'Portada', 1, { is_cover_section: true }),
        h('r', 'Referencias', 1),
        h('b', 'Bibliografía', 1),
      ],
      {},
    );
    expect(t.has('c')).toBe(false);
    expect(t.has('r')).toBe(false);
    expect(t.has('b')).toBe(false);
  });

  it('reconoce una numeración jerárquica explícita "2.5"', () => {
    const t = construirTextosDeTitulo(
      [h('h1', 'Marco', 1), h('h2', '2.5 Sub', 2), h('h3', 'Detalle', 3)],
      {
        heading_numbering_style_lvl1: 'decimal',
        heading_numbering_style_lvl2: 'decimal',
        heading_numbering_style_lvl3: 'decimal',
      },
    );
    expect(t.get('h2')).toBe('2.5. Sub');
    expect(t.get('h3')).toBe('2.5.1. Detalle');
  });
});

describe('muestraIndice', () => {
  it('respeta la profundidad pedida', () => {
    expect(muestraIndice(1, 'decimal', 'decimal')).toHaveLength(1);
    expect(muestraIndice(2, 'decimal', 'decimal')).toHaveLength(2);
    expect(muestraIndice(4, 'decimal', 'decimal')).toHaveLength(3);
  });

  it('refleja la notación elegida en cada nivel', () => {
    const filas = muestraIndice(2, 'upperRoman', 'lowerLetter');
    expect(filas[0].texto).toBe('I. Introducción');
    expect(filas[1].texto).toBe('1.a. Marco teórico');
  });

  it('sin numerar deja los títulos limpios', () => {
    const filas = muestraIndice(1, 'none', 'none');
    expect(filas[0].texto).toBe('Introducción');
  });
});
