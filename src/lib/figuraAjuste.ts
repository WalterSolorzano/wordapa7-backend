/* WordAPA7 — ajuste de imagen al alto útil de la hoja (spec D-7).
 *
 * Una figura nunca puede exceder el área útil: si el alto declarado la pasa,
 * se escala; sin alto declarado el render decide su default (null). */

export function altoImagenAjustado(altoDeclarado: number | null, altoDisponible: number): number | null {
  if (altoDeclarado === null || !Number.isFinite(altoDeclarado)) return null;
  return Math.min(altoDeclarado, altoDisponible);
}
