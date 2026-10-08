/**
 * WordAPA7 — Detección ligera de citas APA 7 en el preview.
 *
 * Espejo TypeScript del motor de citas del backend (citation_engine.py) para
 * poder RESALTAR en el lienzo qué citas detecta el sistema y si cumplen APA 7.
 * Solo afecta al preview; nunca se exporta.
 */

export interface CitationMatch {
  start: number;
  end: number;
  raw: string;
  authors: string[];
  year: string;
  type: 'parenthetical' | 'narrative' | 'et_al';
  error?: string;
}

// Patrón parentética: (García, 2023), (García & López, 2023, p. 45), (OIT, 2007),
// apellido compuesto (Gutiérrez Pulido, 2012), (García et al., 2023)
// organizaciones con sigla entre corchetes (Organización Internacional del Trabajo [OIT], 2007, p. 115)
const REGEX_PAREN =
  /\(\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+(?:[a-záéíóúñA-ZÁÉÍÓÚÑ]+|\[[A-ZÁÉÍÓÚÑ]{2,}\]))*(?:\s*(?:y|&)\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*(?:,\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*(?:\s*(?:y|&)\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)*(?:\s+et\s+al\.?)?)\s*,\s*(\d{4}[a-z]?)(?:\s*,\s*(?:p[p]?\.|p[aá]g\.)\s*(\d+(?:[–\-]\d+)?))?\s*\)/gi;

// Patrón narrativa: García (2023), García y López (2023), OIT (2007), La OIT (2007)
// y apellido compuesto con iniciales como Según Skaf Rehihil, T. (2025)
const REGEX_NARR =
  /\b(?:según|de acuerdo con|como señala|como indica|para|[Ll][oa]s?)?\s*((?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*(?:\s*,\s*[A-ZÁÉÍÓÚÑ]\.?)?(?:\s+(?:de|del|la|el|los|las|y|e|&)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*|[A-ZÁÉÍÓÚÑ]{2,6})(?:\s+et\s+al\.?)?)\s*\((\d{4}[a-z]?)(?:,\s*(?:p[p]?\.|p[aá]g\.)\s*(\d+(?:[–\-]\d+)?))?\)/gi;

const EXCLUDED_TERMS = [
  'vease', 'ver', 'figura', 'tabla', 'cuadro', 'anexo', 'apendice',
  'kg', 'cm', 'mm', 'gr', 'm', 'km', 'usd', 'eur', 'ejemplo', 'e.g.',
  'i.e.', 'cf.', 'vid.', 'fig.', 'tab.', 'n.', 'ed.',
  'eds.', 'vol.', 'cap.', 'seccion', 'inciso', 'articulo',
];

function isExcluded(match: string): boolean {
  const t = match.toLowerCase();
  const hasYear = /\(?\s*\d{4}[a-z]?\s*[,)]/.test(t);
  for (const term of EXCLUDED_TERMS) {
    if (t.includes(term)) return true;
  }
  // "p." / "pp." de página solo se excluye si NO hay año (cita válida con página)
  if (!hasYear && /(?:^|[\s(])(?:pp?|pá?g)\.?\s*\d/.test(t)) return true;
  if (/figura|tabla|cuadro|anexo\s+\d+/.test(t)) return true;
  if (/^\(\s*[\d.\s<>=*/+\-%,]+\s*(?:kg|cm|mm|gr|m|km|usd|eur)?\s*\)$/.test(match)) return true;
  return false;
}

// Errores APA 7 detectables en la cita
function detectErrors(raw: string): string | undefined {
  // Falta coma entre autor y año: (Garcia 2023)
  if (/\([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+\d{4}\)/.test(raw)) {
    return 'Falta coma entre autor y año: (García, 2023)';
  }
  // "et al" sin punto
  if (/et al[^.]/.test(raw)) {
    return 'et al debe llevar punto: et al.';
  }
  // "y" en vez de "&" dentro del paréntesis
  if (/\([^)]+\sy\s[^)]+,\s*\d{4}\)/.test(raw)) {
    return 'Dentro de paréntesis usar "&" no "y"';
  }
  // página con formato incorrecto: "p 45" sin punto
  if (/p\s+\d+/.test(raw)) {
    return "Usar formato 'p. 45' o 'pp. 45-48'";
  }
  return undefined;
}

/**
 * Devuelve las citas APA 7 encontradas en `text` con sus rangos.
 * Ordenadas por posición inicial.
 */
export function findCitationsInText(text: string): CitationMatch[] {
  const out: CitationMatch[] = [];
  if (!text) return out;

  // 1. Parentéticas
  let m: RegExpExecArray | null;
  const paren = new RegExp(REGEX_PAREN.source, 'gi');
  while ((m = paren.exec(text)) !== null) {
    const raw = m[0];
    if (isExcluded(raw)) continue;
    const authorText = m[1] || '';
    const year = m[2] || '';
    const etAl = /et al\.?/i.test(authorText);
    out.push({
      start: m.index,
      end: m.index + raw.length,
      raw,
      authors: authorText.split(/\s+(?:y|&)\s+|\s*,\s*/).filter((a) => /^[A-ZÁÉÍÓÚÑ]/.test(a) && !/^[A-ZÁÉÍÓÚÑ]\.?$/.test(a)),
      year,
      type: etAl ? 'et_al' : 'parenthetical',
      error: detectErrors(raw),
    });
  }

  // 1b. Citas múltiples: (García, 2023; López, 2021; Pérez, 2019)
  // Se detectan antes que las narrativas para no solapar rangos.
  const REGEX_MULTI = /\(\s*[A-ZÁÉÍÓÚÑ][^()]*\d{4}[a-z]?(?:\s*;\s*[A-ZÁÉÍÓÚÑ][^()]*\d{4}[a-z]?)+\s*\)/gi;
  const occupiedParen = out.map((c) => [c.start, c.end]);
  const multiRe = new RegExp(REGEX_MULTI.source, 'gi');
  while ((m = multiRe.exec(text)) !== null) {
    const nm = m;
    const raw = nm[0];
    const overlaps = occupiedParen.some(([s, e]) => nm.index < e && nm.index + raw.length > s);
    if (overlaps) continue;
    if (isExcluded(raw)) continue;
    // Cada segmento "Autor, año" se añade como cita independiente
    const inner = raw.slice(1, -1).trim();
    for (const chunk of inner.split(';')) {
      const seg = chunk.trim();
      const segMatch = /^([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*(?:\s+(?:y|&)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)\s*,\s*(\d{4}[a-z]?)$/.exec(seg);
      if (!segMatch) continue;
      out.push({
        start: nm.index,
        end: nm.index + raw.length,
        raw: seg,
        authors: segMatch[1].split(/\s+(?:y|&)\s+/).filter((a) => /^[A-ZÁÉÍÓÚÑ]/.test(a) && !/^[A-ZÁÉÍÓÚÑ]\.?$/.test(a)),
        year: segMatch[2],
        type: 'parenthetical',
        error: detectErrors(seg),
      });
    }
    occupiedParen.push([nm.index, nm.index + raw.length]);
  }

  // 2. Narrativas (no solapar con parentéticas)
  const narr = new RegExp(REGEX_NARR.source, 'gi');
  const occupied = out.map((c) => [c.start, c.end]);
  while ((m = narr.exec(text)) !== null) {
    const nm = m;
    const raw = nm[0];
    const overlaps = occupied.some(([s, e]) => nm.index < e && nm.index + raw.length > s);
    if (overlaps) continue;
    const authorText = nm[1] || '';
    const year = nm[2] || '';
    const etAl = /et al\.?/i.test(authorText);
    out.push({
      start: nm.index,
      end: nm.index + raw.length,
      raw,
      authors: authorText.split(/\s+(?:y|&)\s+|\s*,\s*/).filter((a) => /^[A-ZÁÉÍÓÚÑ]/.test(a) && !/^[A-ZÁÉÍÓÚÑ]\.?$/.test(a)),
      year,
      type: etAl ? 'et_al' : 'narrative',
      error: detectErrors(raw),
    });
    occupied.push([nm.index, nm.index + raw.length]);
  }

  out.sort((a, b) => a.start - b.start);
  return out;
}
