import { describe, it, expect } from 'vitest';
import { normalizarSpans, matrizDeTabla, estiloDePreset, PRESETS_TABLA, BORDE_EXPORT_DE_PRESET, rebanadaDeTabla } from '../lib/tablaRender';
import type { TableModel } from '../types';

const tabla = (extra: Partial<TableModel> = {}): TableModel => ({
  element_id: 't1',
  headers: ['A', 'B'],
  rows: [
    ['1', '2'],
    ['3', '4'],
  ],
  caption: '',
  table_number: 1,
  ...extra,
});

describe('normalizarSpans', () => {
  it('sin spans paralelos devuelve 1x1 para cada celda', () => {
    const { header, rows } = normalizarSpans(tabla());
    expect(header).toEqual([
      { col: 1, row: 1 },
      { col: 1, row: 1 },
    ]);
    expect(rows).toEqual([
      [
        { col: 1, row: 1 },
        { col: 1, row: 1 },
      ],
      [
        { col: 1, row: 1 },
        { col: 1, row: 1 },
      ],
    ]);
  });

  it('aplica header_spans y row_spans y coacciona valores inválidos a 1', () => {
    const { header, rows } = normalizarSpans(
      tabla({
        header_spans: [
          { col: 2, row: 1 },
          { col: 0, row: 3 },
        ],
        row_spans: [
          [
            { col: 1, row: 2 },
            { col: 1, row: 1 },
          ],
          [
            { col: 1, row: 1 },
            { col: 1, row: 1 },
          ],
        ],
      }),
    );
    expect(header).toEqual([
      { col: 2, row: 1 },
      { col: 1, row: 3 },
    ]);
    expect(rows[0][0]).toEqual({ col: 1, row: 2 });
  });
});

describe('matrizDeTabla', () => {
  it('arma una fila de encabezado y una por fila de cuerpo con sus spans', () => {
    const filas = matrizDeTabla(tabla());
    expect(filas).toHaveLength(3);
    expect(filas[0].esHeader).toBe(true);
    expect(filas[0].celdas[0]).toMatchObject({ texto: 'A', colSpan: 1, rowSpan: 1, esHeader: true });
    expect(filas[1].esHeader).toBe(false);
    expect(filas[2].celdas[1]).toMatchObject({ texto: '4', filaIndice: 2, celdaIndice: 1 });
  });

  it('no inventa fila de encabezado si no hay headers', () => {
    const filas = matrizDeTabla(tabla({ headers: [] }));
    expect(filas).toHaveLength(2);
    expect(filas.every((f) => !f.esHeader)).toBe(true);
  });
});

describe('estiloDePreset', () => {
  it('marca APA-safe vs no-APA y activa zebra solo en zebra', () => {
    expect(estiloDePreset('apa')).toMatchObject({ esAPA: true, zebra: false, sombreadoEncabezado: false });
    expect(estiloDePreset('grid')).toMatchObject({ esAPA: false });
    expect(estiloDePreset('zebra')).toMatchObject({ esAPA: false, zebra: true, sombreadoEncabezado: true });
  });
  it('expone la bandera de rejilla solo en los presets con bordes en todas las celdas', () => {
    expect(estiloDePreset('apa')).toMatchObject({ rejilla: false });
    expect(estiloDePreset('compact')).toMatchObject({ rejilla: false });
    expect(estiloDePreset('expanded')).toMatchObject({ rejilla: false });
    expect(estiloDePreset('grid')).toMatchObject({ rejilla: true });
    expect(estiloDePreset('zebra')).toMatchObject({ rejilla: true });
  });
});

describe('PRESETS_TABLA', () => {
  it('expone los cinco presets en orden', () => {
    expect(PRESETS_TABLA.map((p) => p.id)).toEqual(['apa', 'compact', 'expanded', 'grid', 'zebra']);
  });
  it('marca grid y zebra como no-APA', () => {
    expect(PRESETS_TABLA.filter((p) => !p.esAPA).map((p) => p.id)).toEqual(['grid', 'zebra']);
  });
  it('mapea presets a borde de export', () => {
    expect(BORDE_EXPORT_DE_PRESET.apa).toBe('apa');
    expect(BORDE_EXPORT_DE_PRESET.compact).toBe('apa');
    expect(BORDE_EXPORT_DE_PRESET.expanded).toBe('apa');
    expect(BORDE_EXPORT_DE_PRESET.grid).toBe('grid');
    expect(BORDE_EXPORT_DE_PRESET.zebra).toBe('grid');
  });
});

const baseRebanada: TableModel = {
  element_id: 't1', headers: ['A', 'B'], rows: [['1', '2'], ['3', '4'], ['5', '6']],
  caption: 'Datos', table_number: 1, style: 'apa',
  header_spans: [{ col: 2, row: 1 }],
  row_spans: [[{ col: 1, row: 1 }, { col: 1, row: 1 }], [{ col: 1, row: 1 }, { col: 1, row: 2 }], [{ col: 1, row: 1 }, { col: 1, row: 1 }]],
};

describe('rebanadaDeTabla', () => {
  it('conserva encabezado y spans de encabezado', () => {
    const r = rebanadaDeTabla(baseRebanada, 1, 3);
    expect(r.headers).toEqual(['A', 'B']);
    expect(r.header_spans).toEqual([{ col: 2, row: 1 }]);
    expect(r.rows).toEqual([['3', '4'], ['5', '6']]);
    expect(r.row_spans).toEqual([baseRebanada.row_spans![1], baseRebanada.row_spans![2]]);
    expect(r.caption).toBe('Datos');
    expect(r.style).toBe('apa');
  });
  it('clampa índices fuera de rango', () => {
    const r = rebanadaDeTabla(baseRebanada, -5, 99);
    expect(r.rows).toHaveLength(3);
  });
  it('preserva row_spans con row>1 en la primera fila rebanada', () => {
    const r = rebanadaDeTabla(baseRebanada, 1, 3);
    expect(r.row_spans![0][1]).toEqual({ col: 1, row: 2 });
  });
});
