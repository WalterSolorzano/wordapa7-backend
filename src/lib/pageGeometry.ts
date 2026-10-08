/**
 * WordAPA7 — pageGeometry: traduce las reglas APA del documento (pt, cm)
 * a píxeles de hoja reales a 96 DPI. Única fuente de verdad de dimensiones
 * para el lienzo (fase 1 del motor de render híbrido: el canvas deja de
 * pintar una hoja genérica).
 *
 * Nota: valores en PÍXELES sin zoom — el zoom del lienzo se aplica encima.
 */
import { normalizarPageSize } from './pageSizeEnHtml';
import type { PageSize } from '../types';

export const PX_PER_PT = 96 / 72;
export const PX_PER_CM = 96 / 2.54;
export const PT_TO_PX = (pt: number): number => pt * PX_PER_PT;
export const CM_TO_PX = (cm: number): number => cm * PX_PER_CM;

/** Tamaños de hoja en PUNTOS, que es como los tiene Word.
 *
 *  En milímetros, A4 no es un número redondo en puntos (210 mm son 595,276 pt),
 *  y Word lo redondea a 595. Estos son los valores del propio Word, que es lo
 *  que hay que igualar: el ancho y el alto tienen que coincidir con los que
 *  Word escribe en `w:pgSz`, o el archivo y la pantalla se separan. La tabla en
 *  milímetros vive en `pageSizeEnHtml.ts` y en `style_engine.py`; esta es la
 *  misma información en la unidad que necesita la paginación. */
const PAGE_PT: Record<PageSize, { w: number; h: number }> = {
  carta: { w: 612, h: 792 },
  a4: { w: 595, h: 842 },
};

export interface PageGeometry {
  /** Ancho de hoja en px (sin zoom). */
  pageW: number;
  /** Alto de hoja en px (sin zoom). */
  pageH: number;
  /** Margen uniforme en px (Word: mismo valor en los 4 lados). */
  marginPx: number;
  /** Ancho útil = pageW - 2 * marginPx. */
  contentW: number;
  /** Alto útil = pageH - 2 * marginPx - headerH. */
  contentH: number;
  /** Alto de línea base = font_size_pt * line_spacing (px). */
  lineHeightPx: number;
  /** Alto reservado al encabezado APA de página (px). */
  headerH: number;
}

export function getPageGeometry(rules: {
  margins_cm?: number;
  font_size_pt?: number;
  line_spacing?: number;
  page_size?: string;
  professional_running_head?: boolean;
}): PageGeometry {
  /* El normalizador es el de `pageSizeEnHtml.ts`, el mismo que escribe el
     atributo del CSS y el que usa la pestaña Documento. Antes esta función
     decidía sola con un `.includes('a4')`, y un valor como "a4-landscape" o
     "A4 " resolvía a A4 mientras el selector mostraba Carta: dos reglas para la
     misma hoja, y la que se contradecía dependía de quién preguntara. */
  const { w, h } = PAGE_PT[normalizarPageSize(rules.page_size)];
  const pageW = PT_TO_PX(w);
  const pageH = PT_TO_PX(h);
  const marginPx = CM_TO_PX(rules.margins_cm ?? 2.54);
  const fontPx = PT_TO_PX(rules.font_size_pt ?? 12);
  const spacing = rules.line_spacing ?? 2;
  // Encabezado APA: 2 líneas base (running head + espacio), 2.5 si es profesional.
  const headerH = rules.professional_running_head ? fontPx * 2.5 : fontPx * 2;
  return {
    pageW,
    pageH,
    marginPx,
    contentW: pageW - marginPx * 2,
    contentH: pageH - marginPx * 2 - headerH,
    lineHeightPx: fontPx * spacing,
    headerH,
  };
}
