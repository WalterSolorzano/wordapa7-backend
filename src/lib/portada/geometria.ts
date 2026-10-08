/**
 * WordAPA7 — la geometria de la hoja, en UN solo lugar.
 *
 * Este archivo existe porque la geometria estaba triplicada a mano y las tres
 * copias no coincidian. `python/modules/portada_uni.py` escribia el titulo en
 * 20pt; `UNICoverPreview.tsx` lo pintaba en 16pt. El `.docx` ponia el logo a
 * `Cm(5.2)` y la preview a 150 px. Y la hoja de la preview media 680 x 780 px sin
 * relacion de aspecto, cuando una carta a 680 px de ancho mide 880 px de alto:
 * faltaban cien pixeles de alto y nadie lo veia hasta abrir el `.docx`.
 *
 * LA DIRECCION DEL ARREGLO ES UNA SOLA: el `.docx` manda y la preview copia.
 * Los numeros de Python son la fuente de verdad, y este archivo los reproduce
 * para que la preview pueda derivar de ellos en lugar de inventarse un tamano.
 *
 * DE DONDE SALEN LOS NUMEROS:
 *   - La hoja: `DESIGN.md:75` pide Carta 8.5" x 11", y `APARuleSet.page_size`
 *     tiene `"carta"` como default por esa razon.
 *   - Los margenes: una pulgada en los cuatro lados. Lo dice `DESIGN.md:75` y lo
 *     hace `python/create_template.py:24-27`. Este es el punto donde el plan de
 *     la fase se equivocaba (proponia 40 mm a los lados, o sea 1.575 pulgadas):
 *     con 40 mm el ancho util seria 13.59 cm y la preview describiria una hoja
 *     que el `.docx` nunca produce. Cuando el `.docx` y el plan discrepan, gana
 *     el `.docx`.
 *
 * Sin imports, sin estado, todo derivado. Si algo de esto necesita estado, es
 * que se esta haciendo mal el calculo.
 */

export type Hoja = 'carta' | 'a4';

/** Las dos hojas, en milimetros. */
export const HOJA_CARTA_MM = { ancho: 215.9, alto: 279.4 } as const;
export const HOJA_A4_MM = { ancho: 210.0, alto: 297.0 } as const;

/** Una pulgada en los cuatro lados, como `python/create_template.py`. */
export const MARGENES_MM = {
  superior: 25.4,
  inferior: 25.4,
  izquierdo: 25.4,
  derecho: 25.4,
} as const;

/** Milimetros por pulgada. 25.4 exactos, no 25 ni 25.4 aproximado. */
export const MM_POR_PULGADA = 25.4;

/** Puntos por pulgada. Un punto tipografico es 1/72 de pulgada, exacto. */
export const PT_POR_PULGADA = 72;

/** EMU por centimetro. Lo usa `python-docx` para `wp:extent`, asi que el
 *  ancho del logo se mide en la misma unidad en los dos lados. */
export const EMU_POR_CM = 360000;

export function hojaDe(hoja: Hoja): { ancho: number; alto: number } {
  return hoja === 'a4' ? HOJA_A4_MM : HOJA_CARTA_MM;
}

/** El ancho que le queda a la hoja despues de los margenes. */
export function anchoUtilMm(hoja: Hoja): number {
  const h = hojaDe(hoja);
  return h.ancho - MARGENES_MM.izquierdo - MARGENES_MM.derecho;
}

/** El alto que le queda a la hoja despues de los margenes. */
export function altoUtilMm(hoja: Hoja): number {
  const h = hojaDe(hoja);
  return h.alto - MARGENES_MM.superior - MARGENES_MM.inferior;
}

/**
 * Cuantos pixeles de pantalla mide un milimetro de papel.
 *
 * DERIVADA de la medida, no elegida a ojo: por eso una carta y un A4 escalan
 * distinto con el mismo ancho de pantalla, que es lo que hacia que la preview
 * no mintiera. La firma es `(anchoPx, hoja)` y no `(anchoPx)` porque la hoja
 * importa: el alto sale de acá, y si la hoja no entra el alto esta inventado.
 */
export function escalaDePreview(anchoPx: number, hoja: Hoja = 'carta'): number {
  return anchoPx / hojaDe(hoja).ancho;
}

/** Milimetros a pixeles, a la escala de esta hoja. */
export function mmAPx(mm: number, anchoPx: number, hoja: Hoja = 'carta'): number {
  return mm * escalaDePreview(anchoPx, hoja);
}

/** Puntos a pixeles, a la escala de esta hoja. Un punto es 1/72 de pulgada. */
export function ptAPx(pt: number, escala: number): number {
  return pt * (MM_POR_PULGADA / PT_POR_PULGADA) * escala;
}

/**
 * El ancho, en milimetros, de una FRACCION del ancho util de la hoja.
 *
 * Esta es la funcion que hace que el mismo logo se vea igual en Carta y en A4, y
 * es lo que reemplaza al `Cm(5.2)` absoluto de `portada_uni.py`. Con milimetros
 * fijos, un ancho calibrado para una hoja se ve distinto en la otra; con una
 * fraccion, el size RELATIVO es el mismo y el absoluto se acomoda.
 */
export function fraccionDeAnchoUtil(fraccion: number, hoja: Hoja = 'carta'): number {
  return fraccion * anchoUtilMm(hoja);
}

/**
 * La fraccion del ancho util que ocupa el logo de la portada.
 *
 * NO ES UN NUMERO ELEGIDO A OJO: es el `Cm(5.2)` de antes, dividido por el ancho
 * util real de una carta. La cuenta entera:
 *
 *     ancho util = 215.9 mm - 2 x 25.4 mm = 165.1 mm = 16.51 cm
 *     5.2 cm / 16.51 cm = 0.315
 *
 * Los margenes son de UNA PULGADA, no de 40 mm. El plan de la fase calibro el
 * 0.16 como si el ancho util fuera 13.59 cm (0.16 x 135.9 mm = 21.7 mm, que es
 * lo que el plan decia). Con el ancho util real de 16.51 cm, ese mismo 0.16
 * son 2.64 cm: la mitad de lo que tenia el logo, y lo que el usuario reporto
 * como "el logo que puso es super pequeno no se ve".
 *
 * La fuente de verdad de este numero es `FRACCION_DE_ANCHO_DEL_LOGO` en
 * `python/modules/portada_uni.py` y el default de `LogoPortada.ancho_fraccion`
 * en `python/models.py`. Esta copia existe para que la preview y la miniatura
 * no traigan un literal propio: cuando el documento se agranda, la preview se
 * agranda con el.
 */
export const FRACCION_DE_ANCHO_DEL_LOGO = 0.315;

/** La misma fraccion, en centimetros, que es como lo mide `python-docx`. */
export function fraccionDeAnchoUtilCm(fraccion: number, hoja: Hoja = 'carta'): number {
  return fraccionDeAnchoUtil(fraccion, hoja) / 10;
}

/**
 * Los puntos que lleva el `.docx` en cada bloque de la portada UNI.
 *
 * La fuente de verdad es `python/modules/portada_uni.py`, y esta tabla la
 * COPIA. Si alguno de estos numeros cambia en Python y no aca, la preview vuelve
 * a mentir, y eso es exactamente lo que el test de la preview contra el `.docx`
 * (Review Focus #5) vigila: no alcanza con que los dos digan 20, hay que que el
 * `.docx` no cambie solo.
 */
export const PT_PORTADA_UNI = {
  departamento: 20,
  titulo: 20,
  asignatura: 20,
  elaboradoPor: 11,
  autor: 10,
  carnet: 10,
  fecha: 11,
  lugar: 11,
} as const;

/**
 * El ancho disponible de la hoja en la vista de portada, en pixeles.
 *
 * Son los 680 px que ya usaba `CoverCarouselStudio`, y se quedan porque son el
 * ancho que hay en la pantalla, no una medida de la hoja. Todo lo demas sale de
 * la escala.
 */
export const ANCHO_DE_LA_HOJA_PX = 680;

/** Todo lo que la preview necesita, derivado y en un solo objeto. */
export function medidaDeLaHoja(hoja: Hoja = 'carta', anchoPx: number = ANCHO_DE_LA_HOJA_PX) {
  const h = hojaDe(hoja);
  const escala = escalaDePreview(anchoPx, hoja);
  return {
    hoja,
    anchoPx,
    escala,
    altoPx: mmAPx(h.alto, anchoPx, hoja),
    anchoUtilPx: mmAPx(anchoUtilMm(hoja), anchoPx, hoja),
    altoUtilPx: mmAPx(altoUtilMm(hoja), anchoPx, hoja),
    margenSuperiorPx: mmAPx(MARGENES_MM.superior, anchoPx, hoja),
    margenInferiorPx: mmAPx(MARGENES_MM.inferior, anchoPx, hoja),
    margenIzquierdoPx: mmAPx(MARGENES_MM.izquierdo, anchoPx, hoja),
    margenDerechoPx: mmAPx(MARGENES_MM.derecho, anchoPx, hoja),
    /** Los puntos del `.docx`, ya en pixeles de esta escala. */
    pt: (pt: number) => ptAPx(pt, escala),
  };
}
