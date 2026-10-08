/**
 * WordAPA7 — El reparto de la bibliografía en hojas carta.
 *
 * La hoja de "Bibliografía completa" tiene que verse como la página que va al
 * documento: tamaño carta, doble espacio, sangría francesa, y un salto visible
 * cuando el contenido pasa de una hoja. El reparto es pura aritmética y por eso
 * vive en `lib/paginarBibliografia.ts`: se prueba sin DOM, con alturas
 * explícitas, y el componente solo aporta las alturas medidas.
 *
 * La regla que no se negocia: una entrada NUNCA se parte entre dos hojas. Un
 * apellido a mitad de página y el año en la siguiente es justo el defecto que
 * esta función evita.
 */

import { describe, it, expect } from 'vitest';
import { estimarAltoReferencia, paginarReferencias } from '../lib/paginarBibliografia';

describe('paginarReferencias', () => {
  it('una lista vacía devuelve una hoja vacía, no cero hojas', () => {
    expect(paginarReferencias([], [], 500)).toEqual([[]]);
  });

  it('corta cuando la entrada no cabe, sin partirla', () => {
    const items = ['a', 'b', 'c'];
    const alturas = [200, 200, 200];
    // Alto útil 450: caben dos (400), la tercera abre hoja.
    expect(paginarReferencias(items, alturas, 450)).toEqual([['a', 'b'], ['c']]);
  });

  it('una entrada más alta que la hoja ocupa su propia hoja', () => {
    const items = ['a', 'b', 'c'];
    const alturas = [100, 900, 100];
    const paginas = paginarReferencias(items, alturas, 500);
    expect(paginas).toEqual([['a'], ['b'], ['c']]);
  });

  it('sin alturas medidas no corta: todo en una hoja', () => {
    const items = ['a', 'b', 'c'];
    expect(paginarReferencias(items, [0, 0, 0], 500)).toEqual([['a', 'b', 'c']]);
  });

  it('alto útil no positivo no corta nunca', () => {
    const items = ['a', 'b', 'c'];
    expect(paginarReferencias(items, [400, 400, 400], 0)).toEqual([['a', 'b', 'c']]);
  });

  it('las alturas que faltan cuentan como cero', () => {
    const items = ['a', 'b'];
    expect(paginarReferencias(items, [300], 350)).toEqual([['a', 'b']]);
  });
});

describe('estimarAltoReferencia', () => {
  it('a más texto, más alto', () => {
    const corto = estimarAltoReferencia('Hirano, H. (1995). 5 Pillars.', 500, 32, 16);
    const largo = estimarAltoReferencia('x'.repeat(600), 500, 32, 16);
    expect(largo).toBeGreaterThan(corto);
  });

  it('nunca mide menos que una línea', () => {
    expect(estimarAltoReferencia('', 500, 32, 16)).toBe(32);
  });

  it('respeta el doble espacio: el alto es múltiplo del alto de línea', () => {
    const alto = estimarAltoReferencia('x'.repeat(120), 500, 32, 16);
    expect(alto % 32).toBe(0);
  });
});
