/**
 * WordAPA7 — Utilidades de comparación de citas ↔ referencias.
 *
 * Centraliza la normalización de autores (minúsculas, sin tildes) y el
 * emparejamiento de apellidos entre una cita del texto y una referencia de la
 * bibliografía. Evita duplicar esta lógica en ValidatorView, AIStudioPanel y
 * PaperCanvas.
 */

/** Normaliza un texto: minúsculas, sin tildes, sin espacios sobrantes. */
export const toKey = (s: string): string =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

/** Extrae el primer apellido de un autor ("García, A." → "garcia"). */
export const firstSurname = (author: string): string => {
  const parts = (author || '').split(',')[0].trim().split(/\s+/);
  return toKey(parts[0] || '');
};

/** Texto visible de una referencia (formateada > cruda > título). */
export const referenceText = (ref: any): string =>
  (ref?.formatted_apa || ref?.raw_text || ref?.title || '');

/** Apellido principal de una cita (autores[0] o derivado del raw_text). */
export const citationSurname = (cit: any): string => {
  if (cit?.authors && cit.authors.length > 0) return firstSurname(cit.authors[0]);
  return firstSurname(cit?.raw_text || '');
};

/** ¿El apellido `surname` aparece entre los autores o el texto de `ref`? */
export const refSurnameMatches = (ref: any, surname: string): boolean => {
  if (!surname) return false;
  const text = toKey(referenceText(ref));
  const authors = (ref?.authors || []).map(firstSurname);
  return authors.includes(surname) || text.includes(surname);
};
