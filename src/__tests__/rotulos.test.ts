import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  rotuloDeKind,
  rotuloDeSubtipo,
  ROTULO_GENERICO,
} from '../lib/rotulos';

describe('rotulos', () => {
  afterEach(() => vi.restoreAllMocks());

  it('una regla de fase que el backend emite y el frontend no conoce no sale cruda', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const etiqueta = rotuloDeKind('regla_de_fase_del_ano_3000');
    expect(etiqueta).toBe(ROTULO_GENERICO);
    // El aviso de dev lleva el kind COMPLETO, para que se pueda agregar la fila.
    expect(warn.mock.calls.flat().join(' ')).toContain('regla_de_fase_del_ano_3000');
  });

  it('un identificador interno jamas sale en pantalla, en ningun caso', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    /* Solo identificadores que de verdad no son reglas: `elem_12` es el
       prefijo de un id de elemento y `snake_case` no es nada. El plan metía
       además `paragraph_words` y `g11_variacion_oracion`, pero esas SÍ son
       reglas conocidas con nombre propio, y el test de abajo lo dice. Lo que
       no puede pasar en ningún caso es que la etiqueta sea la clave. */
    for (const kind of ['elem_12', 'snake_case', 'regla_nueva_del_backend']) {
      const etiqueta = rotuloDeKind(kind);
      expect(etiqueta).not.toContain('_');
      expect(etiqueta).not.toBe(kind);
      expect(etiqueta).toBe(ROTULO_GENERICO);
    }
  });

  it('una regla conocida sale con su nombre aunque su clave sea un snake_case', () => {
    /* La mitad que el caso anterior no mide: el `kind` es interno, pero la
       regla existe y tiene rótulo. Que las dos cosas convivan es lo que
       hace que el nombre se consulte y no se muestre. */
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const kind of ['paragraph_words', 'g11_variacion_oracion']) {
      const etiqueta = rotuloDeKind(kind);
      expect(etiqueta).not.toContain('_');
      expect(etiqueta).not.toBe(ROTULO_GENERICO);
      expect(etiqueta).not.toBe(kind);
    }
  });

  it('una regla que si conoce sale con su nombre, no con el generico', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // `paragraph_words` es el que se ve hoy crudo sobre el parrafo en el lienzo.
    expect(rotuloDeKind('paragraph_words')).toBe('Extensión del párrafo');
  });

  it('rotuloDeSubtipo y rotuloDeKind coinciden para toda regla de PROOFREAD_SPECS', async () => {
    const { PROOFREAD_SPECS } = await import('../lib/auditItems');
    const sinFila: string[] = [];
    for (const kind of Object.keys(PROOFREAD_SPECS)) {
      const spec = PROOFREAD_SPECS[kind];
      // Un kind sin fila en SUBTYPE_LABELS cae al generico: es la fuga de cobertura
      // que hizo que 15 reglas de fase no tuvieran nombre.
      if (rotuloDeSubtipo(spec.subtype) === ROTULO_GENERICO) sinFila.push(kind);
    }
    expect(sinFila).toEqual([]);
  });
});
