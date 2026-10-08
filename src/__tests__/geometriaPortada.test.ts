/**
 * La geometria de la hoja, en un solo lugar.
 *
 * El defecto que esto arregla es de los que no se ven en una captura: la
 * geometria estaba TRIPLICADA A MANO. `python/modules/portada_uni.py` ponia el
 * titulo en 20pt, `UNICoverPreview.tsx` lo pintaba en 16pt, y la hoja de la
 * preview media 680 por 780 px sin relacion de aspecto cuando una carta a 680 px
 * de ancho mide 880 de alto. Tres constantes duplicadas y ningun token que las
 * amarre, asi que la preview se ve mas chica de lo que va a salir y el usuario
 * lo descubre en el `.docx`.
 *
 * La direccion del arreglo es una sola: el `.docx` manda, la preview copia.
 * Estos numeros salen de `DESIGN.md` (marcenes de 1 pulgada) y de
 * `python/create_template.py:24-27` (margenes de 1 pulgada, los cuatro), asi que
 * el ancho util de una carta es 215.9 - 50.8.
 */
import { describe, it, expect } from 'vitest';
import {
  HOJA_CARTA_MM,
  HOJA_A4_MM,
  MARGENES_MM,
  anchoUtilMm,
  altoUtilMm,
  escalaDePreview,
  mmAPx,
  ptAPx,
  fraccionDeAnchoUtil,
  FRACCION_DE_ANCHO_DEL_LOGO,
} from '../lib/portada/geometria';

describe('geometria de la portada', () => {
  it('el ancho util sale de la hoja menos los margenes', () => {
    // DESIGN.md:75 y python/create_template.py:24-27 -- una pulgada (25.4 mm)
    // en los cuatro lados. Con 40 mm a los lados el `.docx` no coincide con la
    // preview, y la preview tiene que describir la hoja real.
    expect(MARGENES_MM.superior).toBe(25.4);
    expect(MARGENES_MM.inferior).toBe(25.4);
    expect(MARGENES_MM.izquierdo).toBe(25.4);
    expect(MARGENES_MM.derecho).toBe(25.4);
    expect(anchoUtilMm('carta')).toBeCloseTo(215.9 - 50.8, 3);
    expect(anchoUtilMm('a4')).toBeCloseTo(210.0 - 50.8, 3);
    expect(altoUtilMm('carta')).toBeCloseTo(279.4 - 50.8, 3);
  });

  it('la escala se deriva del ancho de la hoja, no se elige a ojo', () => {
    // 680 px para una carta: 680 / 215.9 mm.
    expect(escalaDePreview(680, 'carta')).toBeCloseTo(680 / 215.9, 4);
  });

  it('el mismo ancho de pantalla escala distinto segun la hoja, y por eso no miente', () => {
    /* El defecto: la preview fijaba 680 x 780 px sin relacion de aspecto. Una
       carta a 680 px de ancho mide 880 px de alto --el alto sale de la hoja, no
       de un numero--, y A4 mide 962. El `780` escrito a mano se comia cien
       pixeles de hoja, y con eso el contenido de la pagina 1 ya no daba. */
    expect(mmAPx(215.9, 680, 'carta')).toBeCloseTo(680, 0);
    expect(mmAPx(279.4, 680, 'carta')).toBeCloseTo(880, 0);
    expect(mmAPx(297.0, 680, 'a4')).toBeGreaterThan(880);
  });

  it('la hoja declarada tiene la medida que dice, en las dos', () => {
    // Si estas dos lineas se mueven, el `.docx` y la preview se contradicen otra
    // vez y el error va a ser de nuevo invisible.
    expect(HOJA_CARTA_MM).toEqual({ ancho: 215.9, alto: 279.4 });
    expect(HOJA_A4_MM).toEqual({ ancho: 210.0, alto: 297.0 });
  });

  it('un punto son 1/72 de pulgada, y no un numero aproximado', () => {
    // 20 pt a la escala de una carta a 680 px. Aproximar el punto por 1.333 px
    // es lo que hace que la preview se vea chiquita: con 1.33 salen 26.6 px y
    // con el valor exacto salen 26.48, y el error se acumula en cada bloque.
    const escala = escalaDePreview(680, 'carta');
    expect(ptAPx(20, escala)).toBeCloseTo(20 * (25.4 / 72) * escala, 6);
    expect(ptAPx(72, escala)).toBeCloseTo(25.4 * escala, 6);
  });
});

describe('una fraccion del ancho util, y no milimetros absolutos', () => {
  it('la misma fraccion da el mismo size relativo en carta y en a4', () => {
    // El Review Focus #4: si el ancho esta en mm fijos, el logo se ve distinto en
    // cada hoja. La fraccion tiene que ser la misma.
    const carta = fraccionDeAnchoUtil(0.315, 'carta');
    const a4 = fraccionDeAnchoUtil(0.315, 'a4');
    expect(carta / anchoUtilMm('carta')).toBeCloseTo(0.315, 6);
    expect(a4 / anchoUtilMm('a4')).toBeCloseTo(0.315, 6);
    expect(carta).not.toBeCloseTo(a4, 1); // los mm absolutos SI son distintos
  });

  it('el ancho util de verdad es 16.51 cm, no el 13.59 del plan', () => {
    /* MEDIDO, no estimado. `APARuleSet.margins_cm` es 2.54 y
       `style_engine.py:192` lo convierte a pulgadas, asi que el `.docx` pone
       una pulgada de margen: 215.9 - 50.8 = 165.1 mm. El 13.59 cm del plan de
       la fase salia de restar 40 mm por lado, y esa hoja no la produce nadie:
       `create_template.py:24-27` y `DESIGN.md:75` ponen una pulgada.

       Este test esta para que el dia que alguien cambie los margenes de la hoja
       se entere de que la preview y el `.docx` se han separado otra vez. */
    expect(anchoUtilMm('carta')).toBeCloseTo(165.1, 1);
    expect(anchoUtilMm('a4')).toBeCloseTo(159.2, 1);
  });

  it('la fraccion por defecto del logo es el 31.5%, y son los 5.2 cm de antes', () => {
    /* La cuenta, entera: el logo se ponia con `Cm(5.2)` y para decirlo como
       fraccion del ancho util se divide 5.2 cm por 16.51 cm, que es lo que
       queda de una carta (215.9 mm) con una pulgada de margen por lado. Da
       0.315. El 0.16 del plan salia de un ancho util de 13.59 cm que el
       proyecto nunca tuvo, y con el ancho util real dejaba el logo en 2.64 cm:
       la mitad de lo que estaba.

       La fraccion es la misma en las dos hojas, que es lo que el Review Focus
       #4 mide; los milimetros absolutos cambian con los margenes reales y hay
       que decirlo. */
    expect(FRACCION_DE_ANCHO_DEL_LOGO).toBeCloseTo(5.2 / 16.51, 3);
    expect(fraccionDeAnchoUtil(FRACCION_DE_ANCHO_DEL_LOGO, 'carta')).toBeCloseTo(52.0, 1);
    expect(fraccionDeAnchoUtil(FRACCION_DE_ANCHO_DEL_LOGO, 'a4')).toBeCloseTo(50.1, 1);
    // Y el que achicaba el logo a la mitad, para que quede dicho por que no vuelve.
    expect(fraccionDeAnchoUtil(0.16, 'carta')).toBeCloseTo(26.4, 1);
  });

  it('una hoja con margenes mas anchos tiene menos ancho util', () => {
    // El helper es el que hace que el logo se vea igual en las dos hojas: si
    // los margenes cambiaran, la fraccion sigue siendo la misma sobre el ancho
    // util de cada una.
    expect(anchoUtilMm('a4')).toBeLessThan(anchoUtilMm('carta'));
  });
});
