import { describe, it, expect } from 'vitest';
import { construirPerfilIA, bandaDe, BANDAS_IA, CLAVE_DOC, UMBRAL_IA } from '../lib/aiPerfil';
import type { AIReviewParagraph } from '../api/backend';
import type { ElementModel } from '../types';

/* Fixtures mínimos: solo los campos que el selector lee. */
const par = (index: number, score: number, text = `párrafo ${index}`): AIReviewParagraph =>
  ({
    element_id: `e${index}`,
    index,
    text,
    ai_score: score,
    ai_category: score >= 50 ? 'HIGH' : score >= 20 ? 'MEDIUM' : 'LOW',
  }) as unknown as AIReviewParagraph;

const h1 = (id: string, text: string): ElementModel =>
  ({ id, type: 'heading', heading_level: 1, text }) as unknown as ElementModel;

const p = (id: string, text: string): ElementModel =>
  ({ id, type: 'paragraph', text }) as unknown as ElementModel;

describe('bandaDe — bordes alineados al motor', () => {
  it('mapea 19/20/49/50/74/75 a las cuatro bandas', () => {
    expect(bandaDe(19)).toBe(0);
    expect(bandaDe(20)).toBe(1);
    expect(bandaDe(49)).toBe(1);
    expect(bandaDe(50)).toBe(2);
    expect(bandaDe(74)).toBe(2);
    expect(bandaDe(75)).toBe(3);
  });

  it('los extremos 0 y 100 caen en la primera y la última banda', () => {
    expect(bandaDe(0)).toBe(0);
    expect(bandaDe(100)).toBe(3);
  });

  it('expone las cuatro bandas con sus rangos', () => {
    expect(BANDAS_IA.map((b) => b.id)).toEqual(['baja', 'media', 'alta', 'critica']);
    expect(BANDAS_IA[0].min).toBe(0);
    expect(BANDAS_IA[3].max).toBe(Infinity);
  });
});

describe('construirPerfilIA — fuente única del perfil', () => {
  const elements = [
    h1('h1-1', 'Introducción'),
    p('p-1', 'uno'),
    p('p-2', 'dos'),
    h1('h1-2', 'Método'),
    p('p-3', 'tres'),
  ];
  const paragraphs = [par(1, 10, 'uno'), par(2, 30, 'dos'), par(4, 70, 'tres')];

  it('agrupa por H1 en orden documental y mapea cada párrafo a su elemento', () => {
    const perfil = construirPerfilIA(paragraphs, elements);
    expect(perfil.filas.map((f) => f.titulo)).toEqual(['Introducción', 'Método']);
    expect(perfil.filas[0].h1Id).toBe('h1-1');
    expect(perfil.filas[0].fase).toBe('introduccion');
    expect(perfil.filas[0].parrafos.map((x) => x.elementId)).toEqual(['p-1', 'p-2']);
    expect(perfil.filas[1].parrafos[0].elementId).toBe('p-3');
  });

  it('cuenta bandas por fila y paridad global', () => {
    const perfil = construirPerfilIA(paragraphs, elements);
    expect(perfil.filas[0].porBanda).toEqual([1, 1, 0, 0]);
    expect(perfil.filas[1].porBanda).toEqual([0, 0, 1, 0]);
    expect(perfil.porBanda.reduce((a, b) => a + b, 0)).toBe(perfil.total);
  });

  it('total no pierde párrafos y deriva alerta y voz humana', () => {
    const perfil = construirPerfilIA(paragraphs, elements);
    expect(perfil.total).toBe(paragraphs.length);
    expect(perfil.enAlerta).toBe(perfil.porBanda[2] + perfil.porBanda[3]);
    expect(perfil.vozHumana).toBe(100 - perfil.rigidezMedia);
    expect(perfil.rigidezMedia).toBe(37);
    expect(perfil.filaMasRigida?.h1Id).toBe('h1-2');
  });

  it('sin H1 devuelve una sola fila «Documento completo»', () => {
    const sinH1 = [p('p-1', 'uno'), p('p-2', 'dos')];
    const perfil = construirPerfilIA([par(0, 10), par(1, 60)], sinH1);
    expect(perfil.filas).toHaveLength(1);
    expect(perfil.filas[0].h1Id).toBe(CLAVE_DOC);
    expect(perfil.filas[0].titulo).toBe('Documento completo');
  });

  it('sin párrafos devuelve el perfil vacío', () => {
    const perfil = construirPerfilIA([], elements);
    expect(perfil).toMatchObject({ filas: [], total: 0, porBanda: [0, 0, 0, 0], enAlerta: 0 });
  });

  it('recorta el excerpt a 90 caracteres y colapsa espacios', () => {
    const perfil = construirPerfilIA([par(1, 10, 'a'.repeat(200))], elements);
    const ex = perfil.filas[0].parrafos[0].excerpt;
    expect(ex.length).toBe(90);
    expect(ex.endsWith('…')).toBe(true);
    const conEspacios = construirPerfilIA([par(1, 10, 'uno   dos   tres')], elements);
    expect(conEspacios.filas[0].parrafos[0].excerpt).toBe('uno dos tres');
  });

  it('usa la escala 0..100 directa: 55 cae en Alta, no multiplicado', () => {
    const perfil = construirPerfilIA([par(1, 55)], elements);
    expect(perfil.filas[0].porBanda).toEqual([0, 0, 1, 0]);
    expect(perfil.filas[0].rigidezMedia).toBe(55);
  });
});

describe('construirPerfilIA — identidad de fase, fases vacías y carriles', () => {
  it('dos H1 con el mismo título producen dos filas (identidad, no texto)', () => {
    const els = [h1('h1-a', 'Resultados'), p('p-a', 'uno'), h1('h1-b', 'Resultados'), p('p-b', 'dos')];
    const perfil = construirPerfilIA([par(1, 10, 'uno'), par(3, 80, 'dos')], els);
    expect(perfil.filas.map((f) => f.h1Id)).toEqual(['h1-a', 'h1-b']);
    expect(perfil.filas[0].parrafos[0].elementId).toBe('p-a');
    expect(perfil.filas[1].parrafos[0].elementId).toBe('p-b');
  });

  it('incluye una fila vacía para una fase H1 sin párrafos medidos', () => {
    const els = [h1('h1-1', 'Introducción'), p('p-1', 'uno'), h1('h1-2', 'Bibliografía')];
    const perfil = construirPerfilIA([par(1, 10)], els);
    expect(perfil.filas.map((f) => f.titulo)).toEqual(['Introducción', 'Bibliografía']);
    expect(perfil.filas[1].parrafos).toHaveLength(0);
    expect(perfil.filas[1].porBanda).toEqual([0, 0, 0, 0]);
    expect(perfil.filas[1].rigidezMedia).toBe(0);
  });

  it('normaliza con trim el título del H1', () => {
    const perfil = construirPerfilIA([par(1, 10)], [h1('h1-1', '  Introducción  '), p('p-1', 'uno')]);
    expect(perfil.filas[0].titulo).toBe('Introducción');
  });

  it('registra el H2 ancestro de cada párrafo', () => {
    const els = [
      h1('h1-1', 'Desarrollo'),
      h1('h2-1', 'Desarrollo del marco'),
      p('p-1', 'uno'),
      h1('h2-2', 'Discusión'),
      p('p-2', 'dos'),
    ].map((e, i) => (i === 1 || i === 3 ? { ...e, type: 'heading', heading_level: 2 } : e));
    const perfil = construirPerfilIA([par(2, 80, 'uno'), par(4, 40, 'dos')], els as never);
    expect(perfil.filas[0].parrafos[0].h2Titulo).toBe('Desarrollo del marco');
    expect(perfil.filas[0].parrafos[1].h2Titulo).toBe('Discusión');
  });

  it('separa en carriles los párrafos con scores cercanos', () => {
    const els = [h1('h1-1', 'Introducción'), p('p-1', ''), p('p-2', ''), p('p-3', '')];
    const perfil = construirPerfilIA([par(1, 50), par(2, 51), par(3, 52)], els);
    const carriles = perfil.filas[0].parrafos.map((x) => x.carril);
    expect(new Set(carriles).size).toBeGreaterThan(1);
  });
});

describe('umbral único de IA', () => {
  it('es 50 y coincide con la banda alta', () => {
    expect(UMBRAL_IA).toBe(50);
    expect(bandaDe(UMBRAL_IA)).toBe(2);
  });
});
