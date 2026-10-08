/* Helpers puros del mapa: el destino bajo el cursor, la interpolación del
 * reflujo y el aviso de reubicación. No tocan el DOM ni React: son cálculo, y
 * por eso se prueban aislados del SVG. */

import { describe, expect, it } from 'vitest';
import {
  ALTO_NODO,
  ANCHO_NODO,
  destinoBajoCursor,
  esDestinoReubicable,
  interpolarPosiciones,
  limitarEscala,
  lineaInsercion,
  type PosicionNodo,
} from '../MapaEstructura';
import type { NodoJerarquia } from '../../../lib/jerarquia';

const nodo = (id: string, titulo = id, hijos: NodoJerarquia[] = []): NodoJerarquia => ({
  id,
  titulo,
  nivel: 1,
  elementoId: id,
  palabras: 0,
  figuras: 0,
  tablas: 0,
  citas: 0,
  hijos,
  fase: null,
});

const pos = (id: string, x: number, y: number, hijos: NodoJerarquia[] = []): PosicionNodo => ({
  nodo: nodo(id, id, hijos),
  nivel: 1,
  x,
  y,
  etiqueta: id,
  truncada: false,
  hijos: hijos.length,
});

describe('destinoBajoCursor', () => {
  const posiciones = [pos('a', 12, 12), pos('b', 300, 12)];

  it('devuelve el id cuando el punto cae dentro de la caja', () => {
    expect(destinoBajoCursor(posiciones, 100, 40)).toBe('a');
    expect(destinoBajoCursor(posiciones, 350, 40)).toBe('b');
  });

  it('devuelve null cuando el punto cae fuera de toda caja', () => {
    expect(destinoBajoCursor(posiciones, 250, 40)).toBeNull();
    expect(destinoBajoCursor(posiciones, 0, 0)).toBeNull();
  });

  it('el borde superior-izquierdo cuenta y el inferior-derecho no', () => {
    expect(destinoBajoCursor(posiciones, 12, 12)).toBe('a');
    expect(destinoBajoCursor(posiciones, 12 + ANCHO_NODO, 40)).toBeNull();
    expect(destinoBajoCursor(posiciones, 12, 12 + ALTO_NODO)).toBeNull();
  });

  it('con dos cajas solapadas gana la última dibujada', () => {
    const encimadas = [pos('abajo', 0, 0), pos('arriba', 0, 0)];
    expect(destinoBajoCursor(encimadas, 10, 10)).toBe('arriba');
  });
});

describe('interpolarPosiciones', () => {
  const desde = [pos('a', 0, 0), pos('viejo', 100, 100)];
  const hasta = [pos('a', 200, 40), pos('nuevo', 400, 80)];

  it('t=0 arranca en el origen y t=1 termina en el destino', () => {
    const en0 = interpolarPosiciones(desde, hasta, 0);
    expect(en0.find((p) => p.nodo.id === 'a')).toMatchObject({ x: 0, y: 0 });

    const en1 = interpolarPosiciones(desde, hasta, 1);
    expect(en1.find((p) => p.nodo.id === 'a')).toMatchObject({ x: 200, y: 40 });
  });

  it('en la mitad interpola linealmente las coordenadas', () => {
    const medio = interpolarPosiciones(desde, hasta, 0.5);
    expect(medio.find((p) => p.nodo.id === 'a')).toMatchObject({ x: 100, y: 20 });
  });

  it('un id que solo existe en el destino arranca en su propia posición', () => {
    const medio = interpolarPosiciones(desde, hasta, 0.5);
    expect(medio.find((p) => p.nodo.id === 'nuevo')).toMatchObject({ x: 400, y: 80 });
  });

  it('un id que desapareció del destino no se dibuja', () => {
    const medio = interpolarPosiciones(desde, hasta, 0.5);
    expect(medio.some((p) => p.nodo.id === 'viejo')).toBe(false);
  });

  it('recorta t fuera de [0,1]', () => {
    expect(interpolarPosiciones(desde, hasta, -3).find((p) => p.nodo.id === 'a')).toMatchObject({ x: 0, y: 0 });
    expect(interpolarPosiciones(desde, hasta, 9).find((p) => p.nodo.id === 'a')).toMatchObject({ x: 200, y: 40 });
  });
});

describe('esDestinoReubicable', () => {
  const nieta = nodo('nieta');
  const hija = nodo('hija', 'hija', [nieta]);
  const raiz = nodo('raiz', 'raiz', [hija]);
  const suelta = nodo('suelta');
  const bosque = [raiz, suelta];

  it('rechaza soltar sobre sí mismo', () => {
    expect(esDestinoReubicable(bosque, 'raiz', 'raiz')).toBe(false);
  });

  it('rechaza soltar una rama dentro de sí misma', () => {
    expect(esDestinoReubicable(bosque, 'raiz', 'hija')).toBe(false);
    expect(esDestinoReubicable(bosque, 'raiz', 'nieta')).toBe(false);
  });

  it('acepta un destino fuera de la rama', () => {
    expect(esDestinoReubicable(bosque, 'hija', 'suelta')).toBe(true);
    expect(esDestinoReubicable(bosque, 'suelta', 'raiz')).toBe(true);
  });
});

describe('limitarEscala', () => {
  it('recorta por debajo y por encima del rango usable', () => {
    expect(limitarEscala(0.1)).toBe(0.5);
    expect(limitarEscala(9)).toBe(3);
  });

  it('deja pasar la escala que ya está dentro del rango', () => {
    expect(limitarEscala(1.5)).toBe(1.5);
    expect(limitarEscala(3)).toBe(3);
    expect(limitarEscala(0.5)).toBe(0.5);
  });
});

describe('lineaInsercion', () => {
  it('traza la línea sobre el borde superior del destino', () => {
    expect(lineaInsercion(pos('a', 30, 90))).toEqual({ x: 30, y: 90 - 5, ancho: ANCHO_NODO });
  });

  it('no traza nada sin destino', () => {
    expect(lineaInsercion(null)).toBeNull();
    expect(lineaInsercion(undefined)).toBeNull();
  });
});
