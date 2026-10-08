/* WordAPA7 — auto-ajuste tipografico de la tarjeta de lectura.
   El parrafo se encoge si es enorme y crece si es corto, siempre entre 13 y
   19px. El piso de 13px no es negociable: por debajo, la revision se vuelve
   inutilizable, y preferimos que la tarjeta scrollee.

   Busqueda binaria, no formula cerrada (spec 5.3): se aplica un cuerpo
   candidato, se MIDE lo que ese cuerpo produce, y se itera. Una formula
   cerrada seria mas corta, pero divide alturas medidas a un cuerpo que no es el
   que va a aplicar, y por eso se equivoca justo donde mas duele. Medir en el
   punto es lo que hace que "cabe" y "no hay scroll interno" sean la MISMA
   oracion, y no dos cuentas que pueden discrepar. */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export const MIN_FONT_PX = 13;
export const MAX_FONT_PX = 19;
/** Cuantas lineas caben sin scroll interno antes de empezar a encoger. */
export const MAX_LINES = 26;
/** Resolucion de la busqueda: 6px de rango entre 0.05px ≈ 7 iteraciones. */
const FIT_EPSILON_PX = 0.05;

/** Lo que la tarjeta de lectura (T14) necesita: a quien mide, el cuerpo elegido y
 *  el interlineado DERIVADO de ese cuerpo, para que nunca se apliquen sueltos. */
export interface AutoFitText {
  containerRef: RefObject<HTMLDivElement>;
  fontSize: number;
  lineHeight: number;
}

export function lineHeightFor(fontPx: number): number {
  const t = (fontPx - MIN_FONT_PX) / (MAX_FONT_PX - MIN_FONT_PX);
  return 1.85 - 0.10 * Math.min(1, Math.max(0, t));
}

/**
 * Aplica el cuerpo candidato y responde si, A ESE CUERPO, el texto cabe en la
 * caja sin scroll interno y en MAX_LINES lineas o menos. Son las dos mitades de
 * la misma exigencia del spec, y se comprueban sobre la misma medicion.
 */
function cabe(el: HTMLElement, fontPx: number): boolean {
  el.style.fontSize = `${fontPx}px`;
  const altoTexto = el.scrollHeight;
  if (altoTexto > el.clientHeight) return false;
  return altoTexto / (fontPx * lineHeightFor(fontPx)) <= MAX_LINES;
}

/**
 * Mayor cuerpo en [13, 19] al que el texto, medido a ese cuerpo, cabe. Si ni
 * con 13px cabe, se detiene en el piso y la tarjeta scrollea (spec 5.3).
 *
 * Exportado para poder barrer ratios sin montar React. El elemento queda con
 * el cuerpo devuelto aplicado: lo que se midio es lo que quedo.
 */
export function fitSize(el: HTMLElement): number {
  if (cabe(el, MAX_FONT_PX)) return MAX_FONT_PX;
  if (!cabe(el, MIN_FONT_PX)) return MIN_FONT_PX;

  // Invariante del bucle: `lo` cabe, `hi` no. El punto medio siempre cae
  // dentro de [13, 19], asi que la busqueda no puede salirse del dominio.
  let lo = MIN_FONT_PX;
  let hi = MAX_FONT_PX;
  while (hi - lo > FIT_EPSILON_PX) {
    const mid = (lo + hi) / 2;
    if (cabe(el, mid)) lo = mid;
    else hi = mid;
  }

  // El piso y el techo son ley (spec 5.3). La busqueda ya vive dentro del
  // dominio, asi que el clamp no es lo que hace seguro al resultado: es lo que
  // hace AUDITABLE que la ley exista, en una linea grepeable y no repartida
  // por los tres caminos de return de esta funcion.
  el.style.fontSize = `${lo}px`;
  return Math.min(MAX_FONT_PX, Math.max(MIN_FONT_PX, lo));
}

/**
 * @param contentKey identidad del parrafo que se esta leyendo. El alto de la
 * caja no cambia al pasar de un parrafo al siguiente, asi que el
 * ResizeObserver no dispara por eso: sin esta clave, el parrafo nuevo heredaria
 * el cuerpo del anterior.
 */
export function useAutoFitText(contentKey?: string | number): AutoFitText {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const [fontSize, setFontSize] = useState(MAX_FONT_PX);

  const medir = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setFontSize(fitSize(el));
  }, []);

  useLayoutEffect(medir, [medir, contentKey]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      rafRef.current = requestAnimationFrame(medir);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      // Un frame pendiente despues del desmontaje mediria un arbol muerto.
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [medir]);

  return { containerRef, fontSize, lineHeight: lineHeightFor(fontSize) };
}

