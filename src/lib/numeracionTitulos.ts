/* WordAPA7 — numeración jerárquica de títulos, en un solo lugar.
 *
 * Esta lógica vivía embebida dentro de `PaperCanvas`: el lienzo numeraba los
 * títulos («I. Introducción», «1.a. Contexto») pero la vista previa del índice
 * no lo veía, así que elegir una notación en los controles no se reflejaba en
 * la preview y las dos pantallas podían contradecirse. Acá vive una sola vez y
 * la consumen las dos.
 *
 * Reglas (idénticas a las que ya aplicaba el lienzo):
 *  - Solo H1–H3, y nunca la portada ni la sección de Referencias.
 *  - La notación elegida manda en el componente del PROPIO nivel; en un H2 el
 *    componente del padre sigue decimal para no perder la lectura «2.5».
 *  - H3 no usa notación propia (siempre arábigo jerárquico).
 *  - `none` devuelve el título limpio, sin prefijos viejos.
 */

import type { APARuleSet, ElementModel } from '../types';
import { aNumero, cleanHeadingPrefix } from './textUtils';

/** Lo mínimo que la numeración necesita de las reglas: el estilo por nivel. */
type ReglasNumeracion = Partial<
  Pick<
    APARuleSet,
    'heading_numbering_style_lvl1' | 'heading_numbering_style_lvl2' | 'heading_numbering_style_lvl3'
  >
>;

/** ¿Es un título de la sección de Referencias/Bibliografía (no se numera)? */
export const esTituloDeReferencias = (txt: string): boolean => {
  const n = (txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return /^(referencias?|bibliografia|obras consultadas|works cited)\b/.test(n.trim());
};

/**
 * Construye el texto visible de cada título (id → texto numerado). Las claves
 * que no aparecen en el mapa son portada, referencias o niveles > 3: no se
 * numeran y el llamador debe usar el texto original.
 */
export function construirTextosDeTitulo(
  elementos: readonly ElementModel[],
  rules: ReglasNumeracion,
): Map<string, string> {
  const hCounters: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  const textos = new Map<string, string>();

  for (const e of elementos) {
    if (e.type !== 'heading') continue;
    if (e.is_cover_section) continue;
    if (esTituloDeReferencias(e.text || '')) continue;
    const lvl = e.heading_level || 1;
    if (lvl > 3) continue;

    const explicitMultiMatch = (e.text || '').trim().match(/^(\d+)\.(\d+)/);
    if (explicitMultiMatch && lvl >= 2) {
      const maj = parseInt(explicitMultiMatch[1], 10);
      const min = parseInt(explicitMultiMatch[2], 10);
      if (maj > 0) hCounters[1] = maj;
      if (min > 0 && lvl === 2) hCounters[2] = min;
      if (lvl === 3) hCounters[3] = (hCounters[3] || 0) + 1;
    } else {
      hCounters[lvl] = (hCounters[lvl] || 0) + 1;
      if (lvl === 1) {
        hCounters[2] = 0;
        hCounters[3] = 0;
      }
      if (lvl === 2) {
        hCounters[3] = 0;
      }
    }

    const claveEstilo = `heading_numbering_style_lvl${lvl}` as keyof ReglasNumeracion;
    const style = rules[claveEstilo] || 'decimal';
    const base = cleanHeadingPrefix(e.text || '');
    if (style === 'none') {
      textos.set(e.id, base);
    } else {
      // La notación elegida manda en el componente del propio nivel; el del
      // padre sigue decimal para conservar la lectura jerárquica «2.5».
      const comp = (n: number, l: number): string => aNumero(n, l === lvl ? style : 'decimal');
      if (lvl === 1) {
        textos.set(e.id, `${comp(hCounters[1], 1)}. ${base}`);
      } else if (lvl === 2) {
        textos.set(e.id, `${comp(hCounters[1], 1)}.${comp(hCounters[2], 2)}. ${base}`);
      } else {
        textos.set(e.id, `${hCounters[1]}.${hCounters[2]}.${hCounters[3]}. ${base}`);
      }
    }
  }

  return textos;
}

/** Una fila de la mini-preview de los controles: nivel y texto ya numerado. */
export interface FilaMuestraIndice {
  nivel: 1 | 2 | 3;
  texto: string;
}

/**
 * Muestra corta y determinista para la mini-preview de los controles. Refleja
 * las dos decisiones que el usuario está tomando —profundidad y notación— sin
 * arrastrar el documento entero. La numeración usa `aNumero`, igual que el
 * índice real, para que lo que se ve acá sea lo que se aplicará.
 */
export function muestraIndice(
  profundidad: number,
  numeracionH1: string,
  numeracionH2: string,
): FilaMuestraIndice[] {
  const filas: FilaMuestraIndice[] = [
    {
      nivel: 1,
      texto: numeracionH1 === 'none' ? 'Introducción' : `${aNumero(1, numeracionH1)}. Introducción`,
    },
  ];
  if (profundidad >= 2) {
    filas.push({
      nivel: 2,
      texto:
        numeracionH2 === 'none' ? 'Marco teórico' : `1.${aNumero(1, numeracionH2)}. Marco teórico`,
    });
  }
  if (profundidad >= 3) {
    filas.push({ nivel: 3, texto: '1.1.1. Antecedentes' });
  }
  return filas;
}
