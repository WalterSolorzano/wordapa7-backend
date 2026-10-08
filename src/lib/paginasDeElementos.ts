/* WordAPA7 — páginas por elemento, desde las páginas YA calculadas.
 *
 * El índice del lienzo mostraba `hIdx + 3`, un número inventado. El lienzo ya
 * tiene la repartición real en `pages`; acá se indexa por id para que el índice
 * muestre la página donde de verdad empieza cada título. Un elemento partido
 * conserva la página de su primer fragmento, igual que `buildPageIndex`.
 *
 * Si un id no está en ninguna página se devuelve `undefined`; el llamador
 * muestra un marcador (`—`) en vez de inventar un número.
 */

import type { ElementModel } from '../types';

export function paginasPorElemento(
  paginas: readonly (readonly ElementModel[])[],
): Map<string, number> {
  const mapa = new Map<string, number>();
  paginas.forEach((pagina, indice) => {
    for (const elemento of pagina) {
      const id = (elemento as { id?: string } | null | undefined)?.id;
      if (id && !mapa.has(id)) mapa.set(id, indice + 1);
    }
  });
  return mapa;
}
