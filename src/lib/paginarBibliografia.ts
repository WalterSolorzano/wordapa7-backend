/**
 * WordAPA7 — El reparto de la bibliografía en hojas.
 *
 * La hoja de "Bibliografía completa" tiene que verse como la página que va al
 * documento: tamaño carta, doble espacio, sangría francesa, y un salto visible
 * cuando el contenido pasa de una hoja. El reparto es aritmética pura —por eso
 * vive aquí y se prueba sin DOM— y el componente solo aporta las alturas
 * medidas de cada entrada.
 *
 * La regla que no se negocia: una entrada NUNCA se parte entre dos hojas. Un
 * apellido al final de una página y el año al principio de la siguiente es
 * exactamente el defecto que esta función evita.
 */

/**
 * Reparte las entradas en hojas sin partir ninguna.
 *
 * @param items      Las entradas, en orden.
 * @param alturas    Alto medido de cada entrada, en px, alineado con `items`.
 * @param altoUtil   Alto útil de una hoja (contentH de `getPageGeometry`).
 * @returns Una lista de hojas; una entrada más alta que la hoja ocupa la suya.
 */
export function paginarReferencias<T>(
  items: T[],
  alturas: number[],
  altoUtil: number,
): T[][] {
  if (items.length === 0) return [[]];

  const limite = altoUtil > 0 ? altoUtil : Number.POSITIVE_INFINITY;
  const paginas: T[][] = [];
  let actual: T[] = [];
  let usado = 0;

  items.forEach((item, i) => {
    const alto = Math.max(0, alturas[i] ?? 0);
    if (actual.length > 0 && usado + alto > limite) {
      paginas.push(actual);
      actual = [];
      usado = 0;
    }
    actual.push(item);
    usado += alto;
  });

  if (actual.length > 0) paginas.push(actual);
  return paginas.length > 0 ? paginas : [[]];
}

/**
 * Estima el alto de una entrada cuando el navegador todavía no la midió (o no
 * hay DOM, como en las pruebas). Es un cálculo de líneas por longitud de texto:
 * no es exacto al píxel, pero sí determinista, y se reemplaza por la medida
 * real en cuanto existe.
 */
export function estimarAltoReferencia(
  texto: string,
  contentW: number,
  lineHeightPx: number,
  fontSizePx: number,
): number {
  const anchoMedioCaracter = Math.max(1, fontSizePx * 0.5);
  const charsPorLinea = Math.max(1, Math.floor(contentW / anchoMedioCaracter));
  const lineas = Math.max(1, Math.ceil((texto?.length || 0) / charsPorLinea));
  return lineas * Math.max(1, lineHeightPx);
}
