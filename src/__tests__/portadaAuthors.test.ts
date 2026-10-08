// Prueba: parseAuthorEntries no debe pisar nombres consecutivos.
// Bug reportado (portada UNI): 6 autores en líneas separadas (sin "|" ni
// "Carnet:") colapsaban a 1 sola entrada (el último), y la portada mostraba
// una única persona. Cada línea de nombre es una persona distinta.
import { describe, it, expect } from 'vitest';
import { parseAuthorEntries, serializeAuthorEntries } from '../lib/portadaAuthors';

const BARE_NAMES = [
  'Br. Ivis Ariana Vargas Amador',
  'Br. Silvania Gabriela Gomez Obando',
  'Br. Oscar Joel Rugama Chow',
  'Br. Yireh Alejandro Beteta Torrez',
  'Br. Lance Andrew Sobalvarro Padilla',
  'Br. Maria del Pilar Bermudez Bermudez',
].join('\n');

describe('parseAuthorEntries', () => {
  it('mantiene los 6 autores separados por salto de línea', () => {
    const entries = parseAuthorEntries(BARE_NAMES);
    expect(entries).toHaveLength(6);
    expect(entries[0].nombre).toBe('Br. Ivis Ariana Vargas Amador');
    expect(entries[5].nombre).toBe('Br. Maria del Pilar Bermudez Bermudez');
  });

  it('sigue uniendo nombre + línea "Carnet: X"', () => {
    const raw = 'Br. Juan Perez\nCarnet: 2021-0001\nBr. Ana Lopez\nCarnet: 2021-0002';
    expect(parseAuthorEntries(raw)).toEqual([
      { nombre: 'Br. Juan Perez', carnet: '2021-0001' },
      { nombre: 'Br. Ana Lopez', carnet: '2021-0002' },
    ]);
  });

  it('sigue parseando el formato canónico con pipe', () => {
    const raw = serializeAuthorEntries([
      { nombre: 'Br. Juan Perez', carnet: '2021-0001' },
      { nombre: 'Br. Ana Lopez', carnet: '' },
    ]);
    expect(parseAuthorEntries(raw)).toEqual([
      { nombre: 'Br. Juan Perez', carnet: '2021-0001' },
      { nombre: 'Br. Ana Lopez', carnet: '' },
    ]);
  });

  it('deduplica mismo carnet o mismo nombre', () => {
    const raw = 'Br. Juan Perez | Carnet: 2021-0001\nBr. Juan Perez | Carnet: 2021-0001';
    expect(parseAuthorEntries(raw)).toHaveLength(1);
  });
});
