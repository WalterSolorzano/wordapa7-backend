/**
 * Geometría del Taller de Activos Gráficos (Etapa Figuras).
 *
 * El taller tiene cuatro zonas (rail, galería, lienzo, inspector) que en
 * pantallas anchas conviven en fila. Al angostar el espacio, los paneles se
 * acoplan y el lienzo conserva la mitad útil de la pantalla. Estas funciones
 * son puras para que el punto de corte sea verificable sin montar React.
 */

export type ModoTaller = 'ancho' | 'medio' | 'angosto';

/** Por debajo de este ancho la galería y el inspector se apilan a la izquierda. */
export const UMBRAL_MEDIO = 1180;

/** Por debajo de este ancho solo hay una columna de contenido junto al rail. */
export const UMBRAL_ANGOSTO = 760;

export function modoDeAncho(ancho: number): ModoTaller {
  if (ancho >= UMBRAL_MEDIO) return 'ancho';
  if (ancho >= UMBRAL_ANGOSTO) return 'medio';
  return 'angosto';
}

export function clampAncho(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

/* Anchos persistidos por columna (mismo patrón que el inspector general). */
export const ANCHO_GALERIA_KEY = 'wordapa7-figuras-galeria-width';
export const ANCHO_INSPECTOR_KEY = 'wordapa7-figuras-inspector-width';

export const GALERIA_DEFAULT = 320;
export const GALERIA_MIN = 220;
export const GALERIA_MAX = 520;

export const INSPECTOR_DEFAULT = 320;
export const INSPECTOR_MIN = 260;
export const INSPECTOR_MAX = 560;

/** Lee un ancho persistido y lo acota a los límites de su columna. */
export function leerAnchoGuardado(
  key: string,
  fallback: number,
  min: number,
  max: number
): number {
  try {
    const guardado = localStorage.getItem(key);
    if (!guardado) return fallback;
    const valor = parseInt(guardado, 10);
    if (Number.isNaN(valor)) return fallback;
    return clampAncho(valor, min, max);
  } catch {
    return fallback;
  }
}
