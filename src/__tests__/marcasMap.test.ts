import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MARCAS_MAP_VERSION, rotuloDeKind } from '../lib/rotulos';
import { leerMarcas, escribirMarcas, escribirMarca, borrarMarca, CLAVE_MARCAS } from '../lib/marcasMap';

const CLAVE = CLAVE_MARCAS;

describe('marcas map', () => {
  beforeEach(() => localStorage.clear());

  it('el mapa que se escribe lleva version, para poder descartar el viejo', () => {
    // Un mapa de la version anterior es una tabla de rotulos viejos que ya no
    // existe, y no hay forma de saber cuales eran. Se descarta.
    localStorage.setItem(CLAVE, JSON.stringify({ elem_1: 'Primera persona' }));
    expect(() => leerMarcas()).not.toThrow();
    expect(leerMarcas()).toEqual({});
  });

  it('el mapa de la version actual se lee', () => {
    const marcas = { elem_1: 'Primera persona gramatical' };
    localStorage.setItem(CLAVE, JSON.stringify({ version: MARCAS_MAP_VERSION, marcas }));
    expect(leerMarcas()).toEqual(marcas);
  });

  /* El defecto que se estaba viendo en el lienzo: `map[element_id] =
     KIND_LABELS[kind] || kind` escribía el `snake_case` crudo y `PaperCanvas` lo
     pintaba encima del párrafo. Estas pruebas no miran el código: miran lo que
     queda escrito. */
  it('lo que escribe el corrector sale con nombre, nunca con el kind', () => {
    escribirMarcas([
      { element_id: 'elem_1', kind: 'paragraph_words' },
      { element_id: 'elem_2', kind: 'ortografia' },
      // Un `kind` que la tabla no conoce: rótulo genérico y aviso, nunca la clave.
      { element_id: 'elem_3', kind: 'regla_del_ano_3000' },
    ]);
    expect(leerMarcas()).toEqual({
      elem_1: 'Extensión del párrafo',
      elem_2: 'Falta ortográfica o tilde',
      elem_3: 'Otro hallazgo del corrector',
    });
    for (const etiqueta of Object.values(leerMarcas())) {
      expect(etiqueta).not.toMatch(/^[a-z0-9]+(_[a-z0-9]+)+$/);
    }
  });

  it('lo que escribe el corrector lleva la version, para que se pueda descartar', () => {
    escribirMarcas([{ element_id: 'elem_1', kind: 'ortografia' }]);
    const crudo = JSON.parse(localStorage.getItem(CLAVE) as string);
    expect(crudo.version).toBe(MARCAS_MAP_VERSION);
    expect(crudo.marcas.elem_1).toBe('Falta ortográfica o tilde');
  });

  it('un hallazgo sin element_id no inventa una marca para un elemento que no existe', () => {
    escribirMarcas([{ kind: 'ortografia' }, { element_id: '', kind: 'pegado' }]);
    expect(leerMarcas()).toEqual({});
  });

  it('borrar una marca reescribe el mapa con version, no lo deja plano', () => {
    escribirMarcas([{ element_id: 'elem_1', kind: 'ortografia' }]);
    escribirMarcas([{ element_id: 'elem_2', kind: 'pegado' }]);
    borrarMarca('elem_1');
    expect(leerMarcas()).toEqual({ elem_2: 'Texto pegado sin espaciado' });
    const crudo = JSON.parse(localStorage.getItem(CLAVE) as string);
    expect(crudo.version).toBe(MARCAS_MAP_VERSION);
  });

  it('una marca escrita por el wizard guarda su propia etiqueta, sin pasar por la tabla', () => {
    /* La etiqueta del wizard ya está en palabras ("interlineado aplicado") y no
       es un `kind`: hacerla pasar por `rotuloDeKind` la reduciría al rótulo
       genérico y además avisaría una falta que no existe. */
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    escribirMarca('elem_9', 'interlineado aplicado');
    expect(leerMarcas()).toEqual({ elem_9: 'interlineado aplicado' });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('escribir con el navegador sin localStorage no rompe la revision', () => {
    afterEach(() => vi.restoreAllMocks());
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('sin almacenamiento');
    });
    expect(() => escribirMarcas([{ element_id: 'elem_1', kind: 'ortografia' }])).not.toThrow();
    expect(rotuloDeKind('ortografia')).toBe('Falta ortográfica o tilde');
    setItem.mockRestore();
  });
});
