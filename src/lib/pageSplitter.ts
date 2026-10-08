/**
 * WordAPA7 — pageSplitter: reparte las páginas calculadas (computePages)
 * usando alturas DOM medidas, partiendo párrafos que exceden la hoja.
 *
 * Contrato con la medición (PaperCanvas):
 * - heights: id → altura medida en px (solo elementos renderizados COMPLETOS;
 *   los fragmentos no re-miden para no corromper el total).
 * - Sin ninguna medición en la página → la página se devuelve intacta
 *   (primera pintura y páginas fuera de la ventana de virtualización).
 *
 * Invariante: los fragmentos de un elemento recomponen su texto EXACTO
 * (mismos límites de corte compartidos entre fragmentos vecinos).
 */
import { ElementModel } from '../types';
import { PageGeometry } from './pageGeometry';
import { flowPagination, MeasuredElement } from './flowPagination';

/** Tipos de texto continuo que Word puede partir entre páginas. */
const SPLITTABLE_TYPES = new Set(['paragraph', 'block_quote', 'bullet', 'numbered_list']);

/** Ancho medio de carácter estimado: lineHeightPx / 4 (12pt ≈ 8px). */
const avgCharWidth = (geom: PageGeometry): number => Math.max(4, geom.lineHeightPx / 4);

export function estimateLines(elem: ElementModel, geom: PageGeometry): number {
  const text = elem.text || '';
  if (!text) return 1;
  const charsPerLine = Math.max(20, Math.floor(geom.contentW / avgCharWidth(geom)));
  const hardBreaks = (text.match(/\n/g) || []).length;
  return Math.max(1, Math.ceil(text.length / charsPerLine) + hardBreaks);
}

/**
 * Corte por fracción de texto con límites arrastrados a espacios.
 * Determinista por límite crudo: fragmentos vecinos comparten el mismo límite
 * calculado → recomposición exacta (cero pérdida, cero duplicación).
 */
const SNAP_WINDOW = 12;

function snapBoundary(text: string, raw: number): number {
  const len = text.length;
  if (raw <= 0 || raw >= len) return Math.min(Math.max(raw, 0), len);
  // Espacio más cercano dentro de la ventana; empate → hacia atrás.
  let best = -1;
  let bestDist = SNAP_WINDOW + 1;
  const from = Math.max(0, raw - SNAP_WINDOW);
  const to = Math.min(len - 1, raw + SNAP_WINDOW);
  for (let i = from; i <= to; i++) {
    if (text[i] === ' ') {
      const d = Math.abs(i - raw);
      if (d < bestDist || (d === bestDist && best !== -1 && i < best)) {
        best = i;
        bestDist = d;
      }
    }
  }
  return best === -1 ? raw : best;
}

export function sliceFraction(text: string, f0: number, f1: number): string {
  const len = text.length;
  if (len === 0) return text;
  if (f0 <= 0 && f1 >= 1) return text;
  const r0 = Math.min(Math.max(Math.round(f0 * len), 0), len);
  const r1 = Math.min(Math.max(Math.round(f1 * len), 0), len);
  const p0 = snapBoundary(text, r0);
  const p1 = snapBoundary(text, r1);
  if (p0 > p1) {
    // Patológico (límites a <12 chars): crudo, determinista en ambos lados.
    return text.slice(r0, r1);
  }
  return text.slice(p0, p1);
}

const totalLinesOf = (
  elem: ElementModel,
  heights: Map<string, number>,
  geom: PageGeometry,
): number => {
  const h = heights.get(elem.id);
  if (h !== undefined && h > 0) return Math.max(1, Math.ceil(h / geom.lineHeightPx));
  return estimateLines(elem, geom);
};

export function applyPageFlow(
  pages: ElementModel[][],
  heights: Map<string, number>,
  geom: PageGeometry,
): ElementModel[][] {
  const out: ElementModel[][] = [];

  for (const page of pages) {
    // Sin ninguna medición en la página: intocada (primera pintura / virtualización).
    const anyMeasured = page.some((e) => heights.has(e.id));
    if (!anyMeasured) {
      out.push(page);
      continue;
    }

    const items: MeasuredElement[] = page.map((elem) => {
      const isCover = !!elem.is_cover_section || elem.type === 'portada_block';
      const filas = elem.type === 'table' ? (elem.table_info?.rows?.length ?? 0) : 0;
      const altoTabla = heights.get(elem.id) ?? null;
      const tableRows =
        elem.type === 'table' && !isCover && filas > 0 && altoTabla !== null && altoTabla > geom.contentH
          ? (() => {
              const headerHeightPx = Math.min(altoTabla, geom.lineHeightPx * 1.5);
              const altoFilas = (altoTabla - headerHeightPx) / filas;
              return {
                headerHeightPx,
                rowHeightsPx: Array.from({ length: filas }, () => altoFilas),
              };
            })()
          : undefined;
      return {
        elem,
        heightPx: altoTabla,
        // Fragmento ya cortado por Word (split_chunk): atómico — su corte
        // es exacto; volver a partirlo usaría la altura STALE del completo.
        splittable: !isCover && SPLITTABLE_TYPES.has(elem.type)
          && elem.split_chunk === undefined,
        tableRows,
      };
    });

    const flowPages = flowPagination(items, geom, (e) => estimateLines(e, geom));

    // ── APA 7: el título de Nivel 1 SIEMPRE inicia página. Si el reparto lo
    //    dejó a mitad de hoja (entrada mal cortada o excedente), se corta la
    //    página justo antes del título.
    const flowPagesFixed: typeof flowPages = [];
    for (const fp of flowPages) {
      const l1 = fp.chunks.findIndex(
        (c) => c.elem.type === 'heading' && c.elem.heading_level === 1,
      );
      if (l1 > 0) {
        flowPagesFixed.push({ chunks: fp.chunks.slice(0, l1) });
        flowPagesFixed.push({ chunks: fp.chunks.slice(l1) });
      } else {
        flowPagesFixed.push(fp);
      }
    }

    // Conteo previo: solo elementos con >1 fragmento se clonan y marcan.
    const chunkCount = new Map<string, number>();
    for (const fp of flowPagesFixed) {
      for (const c of fp.chunks) {
        chunkCount.set(c.elem.id, (chunkCount.get(c.elem.id) || 0) + 1);
      }
    }
    const seen = new Map<string, number>();

    for (const fp of flowPagesFixed) {
      out.push(
        fp.chunks.map((c) => {
          const total = chunkCount.get(c.elem.id) || 1;
          const idx = seen.get(c.elem.id) || 0;
          seen.set(c.elem.id, idx + 1);
          if (c.elem.split_chunk !== undefined) return c.elem; // corte Word: texto ya exacto
          if (c.elem.type === 'table' && c.startRow !== undefined) {
            return {
              ...c.elem,
              table_slice: {
                start: c.startRow,
                end: c.endRow ?? (c.elem.table_info?.rows?.length ?? 0),
              },
              split_chunk: idx,
            };
          }
          if (total === 1) return c.elem;
          const lines = totalLinesOf(c.elem, heights, geom);
          const f0 = c.startLine / lines;
          const f1 = c.endLine === null ? 1 : c.endLine / lines;
          return {
            ...c.elem,
            text: sliceFraction(c.elem.text || '', f0, f1),
            split_chunk: idx,
          };
        }),
      );
    }
  }

  return out;
}
