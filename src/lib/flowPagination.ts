/**
 * WordAPA7 — flowPagination: empaqueta elementos medidos en hojas de altura
 * real y parte los párrafos largos entre páginas (corte de líneas tipo Word).
 *
 * Invariante: ningún texto se pierde ni se recorta — todo chunk cubre un
 * rango exacto de líneas [startLine, endLine); endLine null = resto final.
 * Elementos no partibles (tablas, figuras) saltan enteros a página nueva.
 */
import { ElementModel } from '../types';
import { PageGeometry } from './pageGeometry';

export interface MeasuredElement {
  elem: ElementModel;
  /** Altura medida en px; null = sin medición → usar estimación. */
  heightPx: number | null;
  /** true solo para texto continuo (párrafos, citas). */
  splittable: boolean;
  /** Medición por filas de una tabla (para partirla entre páginas). */
  tableRows?: { headerHeightPx: number; rowHeightsPx: number[] };
}

export interface FlowChunk {
  elem: ElementModel;
  /** Primera línea (0-based) del fragmento dentro del elemento. */
  startLine: number;
  /** Última línea EXCLUSIVA; null = va hasta el final del elemento. */
  endLine: number | null;
  /** Primera fila (0-based) del fragmento de una tabla. */
  startRow?: number;
  /** Última fila EXCLUSIVA del fragmento de una tabla; null = resto. */
  endRow?: number | null;
}

export interface FlowPage {
  chunks: FlowChunk[];
}

export function flowPagination(
  items: MeasuredElement[],
  geom: PageGeometry,
  estLines?: (e: ElementModel) => number,
): FlowPage[] {
  const LH = geom.lineHeightPx || 32;
  const totalLines = Math.max(1, Math.floor(geom.contentH / LH));
  const pages: FlowPage[] = [{ chunks: [] }];
  // Líneas consumidas en la página actual (incluye la cola abierta de un
  // split anterior): se incrementa con cada chunk emitido, no se recalcula.
  let used = 0;
  const newPage = (): void => {
    pages.push({ chunks: [] });
    used = 0;
  };

  for (const item of items) {
    const lines = item.heightPx !== null
      ? Math.max(1, Math.ceil(item.heightPx / LH))
      : Math.max(1, estLines?.(item.elem) ?? 1);

    // Tabla: partible por filas, con encabezado repetido en cada fragmento.
    if (item.elem.type === 'table' && item.tableRows && item.tableRows.rowHeightsPx.length > 0) {
      const headerLines = item.tableRows.headerHeightPx > 0
        ? Math.max(1, Math.ceil(item.tableRows.headerHeightPx / LH)) : 0;
      const rowLines = item.tableRows.rowHeightsPx.map((h) => Math.max(1, Math.ceil(h / LH)));
      const totalRows = rowLines.length;
      let r = 0;
      while (r < totalRows) {
        const hayContenido = pages[pages.length - 1].chunks.length > 0;
        const avail = totalLines - used;
        if (hayContenido && headerLines + rowLines[r] > avail) { newPage(); continue; }
        const limite = totalLines - used;
        let fin = r;
        let gasto = headerLines;
        while (fin < totalRows && gasto + rowLines[fin] <= limite) { gasto += rowLines[fin]; fin++; }
        if (fin === r) { fin = r + 1; gasto = headerLines + rowLines[r]; } // fila sola: no se pierde
        pages[pages.length - 1].chunks.push({ elem: item.elem, startLine: 0, endLine: null, startRow: r, endRow: fin });
        used += gasto;
        r = fin;
        if (r < totalRows) newPage();
      }
      continue;
    }

    if (!item.splittable) {
      // Indivisible: si no cabe en lo que queda, hoja nueva; si aun así
      // excede, va entero (la hoja lo muestra completo — nunca se corta).
      const empty = pages[pages.length - 1].chunks.length === 0;
      if (!empty && used + lines > totalLines) newPage();
      pages[pages.length - 1].chunks.push({ elem: item.elem, startLine: 0, endLine: null });
      used += lines;
      continue;
    }

    let start = 0;
    while (start < lines) {
      const avail = totalLines - used;
      if (avail <= 0 && pages[pages.length - 1].chunks.length > 0) {
        newPage();
        continue;
      }
      const take = Math.min(avail, lines - start);
      const end = start + take;
      pages[pages.length - 1].chunks.push({
        elem: item.elem,
        startLine: start,
        endLine: end >= lines ? null : end,
      });
      used += take;
      start = end;
      if (start < lines) newPage();
    }
  }

  return pages;
}
