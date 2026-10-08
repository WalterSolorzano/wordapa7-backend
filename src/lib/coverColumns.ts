import type { ElementModel } from '../types';

/**
 * Reconstrucción de las columnas originales de una portada a partir de la
 * posición horizontal (`anchor_pos_h`, en EMU) que el parser guarda para cada
 * cuadro de texto flotante.
 *
 * Motivo: la portada original puede maquetarse en varias columnas (p. ej. los
 * estudiantes en 3 columnas y el docente/tutor en una cuarta, a la derecha).
 * El lienzo reconstruía todo en una sola columna y el tutor terminaba centrado
 * abajo, "perdido en la nada". Con las anclas podemos devolver cada miembro a su
 * columna.
 */

const EMU_PER_CM = 360000;

/** Tolerancia para considerar dos anclas como la misma columna (0.5 cm). */
export const COLUMN_TOLERANCE_EMU = EMU_PER_CM / 2;

/** Convierte un `anchor_pos_h` crudo a número (EMU); null si no es válido. */
export function parseAnchorEmu(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Agrupa los elementos de portada en columnas según su ancla horizontal,
 * de izquierda a derecha. Dentro de cada columna se conserva el orden del
 * documento. Los elementos sin ancla válida se agrupan en una columna final
 * (fallback), de modo que nunca se pierden.
 */
export function buildCoverColumns(
  members: readonly ElementModel[],
  tolerance: number = COLUMN_TOLERANCE_EMU,
): ElementModel[][] {
  const columns: { key: number; elems: ElementModel[] }[] = [];
  const orphans: ElementModel[] = [];

  for (const elem of members) {
    const emu = parseAnchorEmu(elem.anchor_pos_h);
    if (emu === null) {
      orphans.push(elem);
      continue;
    }
    let column = columns.find((c) => Math.abs(c.key - emu) <= tolerance);
    if (!column) {
      column = { key: emu, elems: [] };
      columns.push(column);
    }
    column.elems.push(elem);
  }

  columns.sort((a, b) => a.key - b.key);
  const result = columns.map((c) => c.elems);
  if (orphans.length > 0) result.push(orphans);
  return result;
}
