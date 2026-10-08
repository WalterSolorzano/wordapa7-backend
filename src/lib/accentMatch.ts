/* WordAPA7 — Búsqueda de frases insensible a acentos y mayúsculas.
 * Usado para resaltar ("tachar") el fragmento exacto que disparó un
 * comentario WhatsApp, incluso cuando el trigger no tiene tildes y el
 * texto original sí ("en conclusion" → "En conclusión").
 */

const ACCENT_CLASS: Record<string, string> = {
  a: '[aáàäâ]',
  e: '[eéèëê]',
  i: '[iíìïî]',
  o: '[oóòöô]',
  u: '[uúùüû]',
  n: '[nñ]',
};

/** Regex que matchea `phrase` ignorando acentos y mayúsculas. */
export function accentAgnosticRegex(phrase: string): RegExp {
  const norm = (phrase || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const source = norm
    .split('')
    .map((c) => ACCENT_CLASS[c] || c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('');
  return new RegExp(source, 'i');
}

/** Índices del primer match de `phrase` en `text` (o null si no existe). */
export function findAccentAgnostic(text: string, phrase: string): { start: number; end: number } | null {
  if (!phrase) return null;
  const m = (text || '').match(accentAgnosticRegex(phrase));
  if (!m || m.index === undefined) return null;
  return { start: m.index, end: m.index + m[0].length };
}

/** Fragmento real (con tildes originales) que matchea `phrase` en `text`. */
export function accentMatchSlice(text: string, phrase: string): string | undefined {
  const m = findAccentAgnostic(text, phrase);
  return m ? text.slice(m.start, m.end) : undefined;
}

export function hasAccentAgnostic(text: string, phrase: string): boolean {
  return findAccentAgnostic(text, phrase) !== null;
}
