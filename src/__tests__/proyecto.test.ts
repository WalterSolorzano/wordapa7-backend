/**
 * F7 Task 2 — el modelo de `Proyecto`.
 *
 * Lo que se mide acá:
 *  1. `crearProyecto` arma un proyecto con TODOS sus campos, y no acepta un
 *     nombre vacío.
 *  2. `projectKeyDe` genera una clave estable: si el archivo se renombra pero
 *     la carpeta es la misma, la clave es la misma.
 */
import { describe, it, expect } from 'vitest';
import { crearProyecto, projectKeyDe } from '../lib/proyecto';

describe('crearProyecto', () => {
  it('arma un proyecto con todos sus campos', () => {
    const p = crearProyecto({
      nombre: 'Mi tesis',
      raiz: 'C:\\tesis',
      documentos: ['s1', 's2'],
      figuras: [],
      creado: '2026-01-01T00:00:00.000Z',
    });
    expect(p.id).toBeTruthy();
    expect(p.nombre).toBe('Mi tesis');
    expect(p.raiz).toBe('C:\\tesis');
    expect(p.documentos).toEqual(['s1', 's2']);
    expect(p.creado).toBe('2026-01-01T00:00:00.000Z');
  });

  it('no acepta un nombre vacío', () => {
    expect(() => crearProyecto({ nombre: '' })).toThrow();
    expect(() => crearProyecto({ nombre: '   ' })).toThrow();
  });

  it('genera un id si no se da uno', () => {
    const p = crearProyecto({ nombre: 'Tesis' });
    expect(p.id).toBeTruthy();
  });

  it('dos proyectos con el mismo nombre tienen ids distintos', () => {
    const a = crearProyecto({ nombre: 'Tesis' });
    const b = crearProyecto({ nombre: 'Tesis' });
    expect(a.id).not.toBe(b.id);
  });
});

describe('projectKeyDe', () => {
  it('con la misma raíz, la clave es la misma aunque el archivo se renombre', () => {
    const antes = projectKeyDe('Tesis.docx', 'C:\\tesis');
    const despues = projectKeyDe('Tesis_v2.docx', 'C:\\tesis');
    expect(antes).toBe(despues);
  });

  it('sin raíz, la clave deriva del nombre del archivo', () => {
    const a = projectKeyDe('Tesis.docx', null);
    const b = projectKeyDe('Tesis_v2.docx', null);
    expect(a).not.toBe(b);
  });

  it('dos archivos en la misma carpeta tienen la misma clave', () => {
    const a = projectKeyDe('Cap1.docx', 'C:\\tesis');
    const b = projectKeyDe('Cap2.docx', 'C:\\tesis');
    expect(a).toBe(b);
  });

  it('dos archivos con el mismo nombre en carpetas distintas tienen claves distintas', () => {
    const a = projectKeyDe('Tesis.docx', 'C:\\tesis');
    const b = projectKeyDe('Tesis.docx', 'D:\\otra');
    expect(a).not.toBe(b);
  });
});
