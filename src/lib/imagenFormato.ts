/**
 * Cálculos puros de formato de imagen del Taller Gráfico.
 *
 * Viven fuera del componente para poder probarse sin DOM: resolución efectiva,
 * proporción y alto proporcional. No conocen React ni el store.
 */

/** Mínimo de puntos por pulgada para no verse pixelada al imprimir. */
export const DPI_MIN = 150;

/**
 * Resolución efectiva de una imagen colocada en un ancho físico dado.
 * `pixelesAncho` es el ancho nativo en píxeles; `anchoCm` el ancho en la hoja.
 */
export function dpiEfectivo(pixelesAncho: number, anchoCm: number): number | null {
  if (!Number.isFinite(pixelesAncho) || pixelesAncho <= 0) return null;
  if (!Number.isFinite(anchoCm) || anchoCm <= 0) return null;
  return Math.round(pixelesAncho / (anchoCm / 2.54));
}

/** Relación alto/ancho actual, o null si no es calculable. */
export function ratioDeDimensiones(anchoCm: number, altoCm: number): number | null {
  if (!Number.isFinite(anchoCm) || !Number.isFinite(altoCm) || anchoCm <= 0) return null;
  return altoCm / anchoCm;
}

/** Alto correspondiente a un ancho manteniendo la proporción, a 2 decimales. */
export function altoProporcional(anchoCm: number, ratio: number): number {
  return Math.round(anchoCm * ratio * 100) / 100;
}

/** ¿La resolución está por debajo del mínimo imprimible? Sin dato => no. */
export function esBajaResolucion(dpi: number | null): boolean {
  return dpi !== null && dpi < DPI_MIN;
}
