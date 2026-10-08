import { describe, it, expect } from 'vitest';
import {
  repeticionCuerpo,
  leyesPorFase,
  contarParrafos,
  cumplimiento,
  nivelCelda,
  fasePorElemento,
  matrizFaseMotor,
} from '../lib/informeRevision';
import type { ElementModel } from '../types';
import type { AuditItem } from '../lib/auditItems';

const p = (id: string, text: string): ElementModel => ({ id, type: 'paragraph', heading_level: null, text } as ElementModel);

const item = (id: string, phase: string | null): AuditItem =>
  ({ id, element_id: 'e', category: 'style', subtype: 'x', severity: 'medium', summary: '', detail: '', originalText: '', pageNumber: null, phase, readOnly: false }) as AuditItem;

const itemCat = (id: string, category: AuditItem['category'], phase: string | null, element_id = 'e'): AuditItem =>
  ({ id, element_id, category, subtype: 'x', severity: 'medium', summary: '', detail: '', originalText: '', pageNumber: null, phase, readOnly: false }) as AuditItem;

const el = (id: string, type: ElementModel['type'], text: string, heading_level: number | null = null): ElementModel =>
  ({ id, type, heading_level, text } as ElementModel);

describe('repeticionCuerpo', () => {
  it('cuenta palabras de contenido repetidas y las ordena por frecuencia', () => {
    const r = repeticionCuerpo([
      p('a', 'investigacion proceso investigacion gestion'),
      p('b', 'investigacion proceso proceso proceso'),
    ]);
    expect(r[0]).toEqual({ termino: 'proceso', conteo: 4 });
    expect(r[1]).toEqual({ termino: 'investigacion', conteo: 3 });
  });

  it('ignora palabras vacias y palabras cortas', () => {
    const r = repeticionCuerpo([p('a', 'de la y el para con que los las')]);
    expect(r).toEqual([]);
  });

  it('no incluye palabras que aparecen menos de 3 veces', () => {
    const r = repeticionCuerpo([p('a', 'metodologia metodologia encuesta')]);
    expect(r.find((x) => x.termino === 'metodologia')).toBeUndefined();
  });

  it('respeta topN', () => {
    const r = repeticionCuerpo(
      [p('a', 'alfa alfa alfa beta beta beta gamma gamma gamma delta delta delta')],
      2,
    );
    expect(r).toHaveLength(2);
  });
});

describe('leyesPorFase', () => {
  it('agrupa por fase y deja fuera global/null', () => {
    const grupos = leyesPorFase([
      item('1', 'metodo'),
      item('2', 'objetivos'),
      item('3', 'global'),
      item('4', null),
    ]);
    expect(grupos.map((g) => g.phase)).toEqual(['objetivos', 'metodo']);
    expect(grupos[0].items.map((x) => x.id)).toEqual(['2']);
    expect(grupos[1].label.length).toBeGreaterThan(0);
  });
});

describe('contarParrafos', () => {
  it('cuenta prosa corrida y no títulos, figuras ni tablas', () => {
    const elements = [
      { id: 'h1', type: 'heading', heading_level: 1, text: 'Método' },
      { id: 'p1', type: 'paragraph', heading_level: null, text: 'uno' },
      { id: 'b1', type: 'bullet', heading_level: null, text: 'dos' },
      { id: 'n1', type: 'numbered_list', heading_level: null, text: 'tres' },
      { id: 'img', type: 'image', heading_level: null, text: '' },
    ] as ElementModel[];
    expect(contarParrafos(elements)).toBe(3);
  });
});

describe('cumplimiento', () => {
  it('normaliza por tamaño: 12 hallazgos en 214 párrafos dan 89', () => {
    expect(cumplimiento(12, 214)).toBe(89);
  });

  it('sin hallazgos es 100 y sin párrafos también es 100', () => {
    expect(cumplimiento(0, 214)).toBe(100);
    expect(cumplimiento(5, 0)).toBe(100);
  });

  it('nunca baja de 0 ni pasa de 100', () => {
    expect(cumplimiento(1, 2)).toBe(0);
    expect(cumplimiento(200, 100)).toBe(0);
  });
});

describe('nivelCelda', () => {
  it('reparte el ratio en tres escalones y cero cuando no hay hallazgos', () => {
    expect(nivelCelda(0, 9)).toBe(0);
    expect(nivelCelda(1, 3)).toBe(1);
    expect(nivelCelda(2, 3)).toBe(2);
    expect(nivelCelda(3, 3)).toBe(3);
  });
});

describe('fasePorElemento', () => {
  it('resuelve por el H1 ancestro, portada antes del primero y aprende la fase del backend', () => {
    const elements = [
      el('p0', 'paragraph', 'texto'),
      el('h1', 'heading', 'Resultados', 1),
      el('p1', 'paragraph', 'texto'),
      el('h2', 'heading', 'Detalle propio', 1),
      el('p2', 'paragraph', 'texto'),
    ];
    // El backend ya dijo que lo que cuelga de 'h1' es `metodo`: eso manda sobre
    // el vocabulario local, que adivinaría `resultados` por la cabeza del título.
    const fase = fasePorElemento(elements, [itemCat('x', 'style', 'metodo', 'p1')]);
    expect(fase('p0')).toBe('portada');
    expect(fase('p1')).toBe('metodo');
    expect(fase('p2')).toBe('sin_fase');
    expect(fase('desconocido')).toBeNull();
  });
});

describe('matrizFaseMotor', () => {
  it('cruza fase y motor, ignora citas y ordena por el orden del documento', () => {
    const items = [
      itemCat('1', 'spelling', 'metodo'),
      itemCat('2', 'structure', 'metodo'),
      itemCat('3', 'style', 'objetivos'),
      itemCat('4', 'ai', null, 'e4'),
      itemCat('5', 'citations', 'metodo'),
    ];
    const faseDe = (id: string) => (id === 'e4' ? 'resultados' : null);
    const filas = matrizFaseMotor(items, faseDe);
    expect(filas.map((f) => f.phase)).toEqual(['objetivos', 'metodo', 'resultados']);
    const metodo = filas.find((f) => f.phase === 'metodo')!;
    expect(metodo.counts).toEqual({ spelling: 1, structure: 1, style: 0, ai: 0 });
    expect(metodo.total).toBe(2);
    expect(filas.find((f) => f.phase === 'resultados')!.counts.ai).toBe(1);
  });

  it('marca la portada como protegida y deja sin_fase lo que no resuelve', () => {
    const filas = matrizFaseMotor(
      [itemCat('1', 'spelling', 'portada'), itemCat('2', 'ai', null, 'x')],
      () => null,
    );
    expect(filas.map((f) => f.phase)).toEqual(['portada', 'sin_fase']);
    expect(filas[0].protegida).toBe(true);
    expect(filas[0].label).toBe('Portada');
  });
});
