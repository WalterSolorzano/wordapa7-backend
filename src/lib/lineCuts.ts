/**
 * WordAPA7 — Fase 2: expansión de elementos según los cortes de página de
 * Word (line_cuts del endpoint). Se ejecuta ANTES de computePages para que
 * cada fragmento herede su page_number real y Word quede como verdad.
 *
 * Invariante: concat(fragmentos) === texto original, byte a byte (slices
 * contiguos sin snap). Offsets inválidos se descartan (defensa contra el
 * desfase párrafo↔elemento en docs con tablas).
 */
import { ElementModel } from '../types';
import type { WordLineCut } from '../api/layout';

export type LayoutCutsMap = Record<string, WordLineCut[]>;

/** Mismo conjunto que SPLITTABLE_TYPES de pageSplitter. */
const EXPANDABLE = new Set(['paragraph', 'block_quote', 'bullet', 'numbered_list']);

export function expandByLineCuts(
  elements: ElementModel[],
  cuts: LayoutCutsMap | null | undefined,
): ElementModel[] {
  if (!cuts) return elements;

  let out: ElementModel[] | null = null;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const elCuts = cuts[el.id];

    // Elegibilidad: solo texto continuo; portada y Nivel 1 indivisibles.
    const eligible =
      elCuts && elCuts.length > 0 &&
      EXPANDABLE.has(el.type) &&
      !el.is_cover_section && el.type !== 'portada_block' &&
      !(el.type === 'heading' && el.heading_level === 1);

    if (!eligible) {
      if (out) out.push(el);
      continue;
    }

    const text = el.text || '';
    const bounds: WordLineCut[] = [];
    for (const c of elCuts) {
      const off = Math.floor(c.offset);
      if (!Number.isFinite(off) || off <= 0 || off >= text.length) continue;
      if (bounds.length > 0 && off <= bounds[bounds.length - 1].offset) continue;
      bounds.push({ offset: off, page: Math.max(1, Math.floor(c.page)) });
    }
    if (bounds.length === 0) {
      if (out) out.push(el);
      continue;
    }

    if (!out) out = elements.slice(0, i);
    let prev = 0;
    for (let bi = 0; bi < bounds.length; bi++) {
      out.push({
        ...el,
        text: text.slice(prev, bounds[bi].offset),
        page_number: bi === 0 ? el.page_number : bounds[bi - 1].page,
        split_chunk: bi,
      });
      prev = bounds[bi].offset;
    }
    out.push({
      ...el,
      text: text.slice(prev),
      page_number: bounds[bounds.length - 1].page,
      split_chunk: bounds.length,
    });
  }
  return out ?? elements;
}
