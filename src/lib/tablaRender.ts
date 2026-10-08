/* WordAPA7 — Render compartido de tablas (lógica pura)
 *
 * La spec `2026-10-04-correcciones-figuras-tablas-design.md` (D-6) pide UN solo
 * render de tabla para ambos lienzos: dos renders divergentes produjeron el
 * defecto de overflow y las columnas repetidas. Acá vive la parte pura —spans y
 * matriz— que no depende de React, y el mapa preset → claves de estilo. La
 * pintura vive en `src/components/figures/TablaRender.tsx`.
 *
 * Sin hex: `estiloDePreset` devuelve claves que el componente mapea a tokens.
 */

import type { CellSpan, TableModel, TableStylePreset } from '../types';

export interface CeldaRender {
  texto: string;
  colSpan: number;
  rowSpan: number;
  esHeader: boolean;
  /** 0 = encabezado; 1..n = fila de cuerpo (índice en `tabla.rows` + 1). */
  filaIndice: number;
  /** Índice de la celda dentro de su fila lógica. */
  celdaIndice: number;
}

export interface FilaRender {
  esHeader: boolean;
  celdas: CeldaRender[];
}

const SPAN_UNO: CellSpan = { col: 1, row: 1 };

/** Un span fuera de rango o ausente se lee como 1x1, nunca rompe el layout. */
const spanValido = (span: CellSpan | undefined): CellSpan => ({
  col: Number.isFinite(span?.col) ? Math.max(1, Math.floor(span!.col)) : 1,
  row: Number.isFinite(span?.row) ? Math.max(1, Math.floor(span!.row)) : 1,
});

/**
 * Completa los spans que falten. Si `header_spans`/`row_spans` están vacíos o
 * son más cortos que `headers`/`rows`, las celdas sin metadata quedan 1x1.
 */
export function normalizarSpans(
  tabla: Pick<TableModel, 'headers' | 'rows' | 'header_spans' | 'row_spans'>,
): { header: CellSpan[]; rows: CellSpan[][] } {
  const header = tabla.headers.map((_, i) => spanValido(tabla.header_spans?.[i]));
  const rows = tabla.rows.map((fila, r) => fila.map((_, c) => spanValido(tabla.row_spans?.[r]?.[c])));
  return { header, rows };
}

/**
 * Matriz lista para pintar. Las celdas del modelo son lógicas (una continuación
 * de `vMerge` no genera celda nueva), así que cada celda produce un `<td>` con
 * su `colSpan`/`rowSpan`.
 */
export function matrizDeTabla(tabla: TableModel): FilaRender[] {
  const { header, rows } = normalizarSpans(tabla);
  const filas: FilaRender[] = [];

  if (tabla.headers.length > 0) {
    filas.push({
      esHeader: true,
      celdas: tabla.headers.map((texto, i) => ({
        texto,
        colSpan: header[i].col,
        rowSpan: header[i].row,
        esHeader: true,
        filaIndice: 0,
        celdaIndice: i,
      })),
    });
  }

  tabla.rows.forEach((fila, r) => {
    filas.push({
      esHeader: false,
      celdas: fila.map((texto, c) => {
        const span = rows[r]?.[c] ?? SPAN_UNO;
        return {
          texto,
          colSpan: span.col,
          rowSpan: span.row,
          esHeader: false,
          filaIndice: r + 1,
          celdaIndice: c,
        };
      }),
    });
  });

  return filas;
}

export interface EstiloTabla {
  preset: TableStylePreset;
  /** Altura vertical de celda, en token de espacio. */
  paddingY: string;
  /** Aire horizontal de celda, en token de espacio. */
  paddingX: string;
  fontSize: string;
  /** Grosor del borde inferior de fila. */
  pesoBorde: string;
  sombreadoEncabezado: boolean;
  zebra: boolean;
  /** Bordes en todas las celdas (rejilla completa), no solo horizontales. */
  rejilla: boolean;
  /** APA-safe: sin rejilla, sin sombreado, sin zebra. */
  esAPA: boolean;
}

/**
 * Devuelve claves de estilo por preset. `apa`/`compact`/`expanded` son
 * APA-safe; `grid`/`zebra` son no-APA (la UI los marca con aviso).
 */
export function estiloDePreset(preset: TableStylePreset = 'apa'): EstiloTabla {
  switch (preset) {
    case 'compact':
      return { preset, paddingY: 'var(--space-1)', paddingX: 'var(--space-2)', fontSize: 'var(--text-xs)', pesoBorde: '1px', sombreadoEncabezado: false, zebra: false, rejilla: false, esAPA: true };
    case 'expanded':
      return { preset, paddingY: 'var(--space-3)', paddingX: 'var(--space-4)', fontSize: 'var(--text-sm)', pesoBorde: '1px', sombreadoEncabezado: false, zebra: false, rejilla: false, esAPA: true };
    case 'grid':
      return { preset, paddingY: 'var(--space-2)', paddingX: 'var(--space-3)', fontSize: 'var(--text-xs)', pesoBorde: '1px', sombreadoEncabezado: false, zebra: false, rejilla: true, esAPA: false };
    case 'zebra':
      return { preset, paddingY: 'var(--space-2)', paddingX: 'var(--space-3)', fontSize: 'var(--text-xs)', pesoBorde: '1px', sombreadoEncabezado: true, zebra: true, rejilla: true, esAPA: false };
    case 'apa':
    default:
      return { preset: 'apa', paddingY: 'var(--space-2)', paddingX: 'var(--space-3)', fontSize: 'var(--text-xs)', pesoBorde: '1px', sombreadoEncabezado: false, zebra: false, rejilla: false, esAPA: true };
  }
}

export interface PresetTablaInfo {
  id: TableStylePreset;
  etiqueta: string;
  descripcion: string;
  /** APA-safe: sin rejilla, sin sombreado, sin zebra. */
  esAPA: boolean;
}

export const PRESETS_TABLA: PresetTablaInfo[] = [
  { id: 'apa', etiqueta: 'APA', descripcion: 'Bordes horizontales, sin rejilla', esAPA: true },
  { id: 'compact', etiqueta: 'Compacto', descripcion: 'Menos aire, misma estructura', esAPA: true },
  { id: 'expanded', etiqueta: 'Expandido', descripcion: 'Más aire entre celdas', esAPA: true },
  { id: 'grid', etiqueta: 'Cuadrícula', descripcion: 'Bordes en todas las celdas', esAPA: false },
  { id: 'zebra', etiqueta: 'Cebra', descripcion: 'Filas alternadas sombreadas', esAPA: false },
];

/** El export solo entiende "apa"/"grid"; los presets de acento colapsan al borde. */
export const BORDE_EXPORT_DE_PRESET: Record<TableStylePreset, 'apa' | 'grid'> = {
  apa: 'apa',
  compact: 'apa',
  expanded: 'apa',
  grid: 'grid',
  zebra: 'grid',
};

/** Una rebanada de filas mantiene el encabezado completo y los spans alineados. */
export function rebanadaDeTabla(tabla: TableModel, inicio: number, fin: number): TableModel {
  const n = tabla.rows.length;
  const desde = Math.min(Math.max(0, Math.floor(inicio)), n);
  const hasta = Math.min(Math.max(desde, Math.floor(fin)), n);
  return {
    ...tabla,
    rows: tabla.rows.slice(desde, hasta),
    row_spans: tabla.row_spans ? tabla.row_spans.slice(desde, hasta) : tabla.row_spans,
  };
}
