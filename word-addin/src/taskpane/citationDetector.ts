/**
 * WordAPA7 Add-in — Detector local de citas APA 7 (TypeScript)
 * ============================================================
 *
 * Réplica del motor de Python (python/modules/citation_engine.py) para
 * detectar citas APA 7 directamente en el navegador del Add-in, sin
 * depender del backend. Así el asistente en vivo puede "chupar" citas y
 * notificar instantáneamente, y el backend se usa para enriquecer/guardar.
 *
 * Soporta:
 *   - Parentéticas:    (García, 2023), (García & López, 2023, p. 45)
 *   - Narrativas:       García (2023), García et al. (2023)
 *   - Secundarias:      (García, 2020, como se citó en Pérez, 2023)
 *   - Múltiples:        (García, 2023; López, 2021; Martínez, 2019)
 *   - et al.:           (García et al., 2023)
 *   - Con página:       (García, 2023, p. 45) / (García, 2023, pág. 45)
 *
 * Evita falsos positivos como "(véase Figura 1)", "(100 kg)", "(p < .05)".
 */

export type CitationType =
  | 'parentetica'
  | 'narrativa'
  | 'multiple'
  | 'secundaria'
  | 'pagina'
  | 'et_al'

export interface DetectedCitation {
  raw_text: string
  authors: string[]
  year: string | null
  page: string | null
  citation_type: CitationType
  start_offset: number
  end_offset: number
}

// Términos que indican que un paréntesis NO es una cita (falsos positivos)
const EXCLUDED_PAREN_TERMS = [
  'véase', 'vease', 'ver', 'figura', 'tabla', 'cuadro', 'anexo',
  'apéndice', 'apendice', 'kg', 'cm', 'mm', 'gr', 'km',
  'usd', 'eur', 'ejemplo', 'e.g.', 'i.e.', 'cf.', 'vid.',
  'fig.', 'tab.', 'n.', 'ed.', 'eds.', 'vol.', 'cap.',
  'sección', 'seccion', 'inciso', 'artículo', 'articulo',
]

// ── PATRONES ─────────────────────────────────────────────────────────────────

// Cita secundaria: (García, 2020, como se citó en Pérez, 2023)
const RE_SECUNDARIA = /\(\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+(?:y|&)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?(?:\s+et al\.?)?)\s*,\s*(\d{4}[a-z]?)\s*,\s*(?:como\s+se\s+cit[oó]\s+en|as\s+cited\s+in)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+(?:y|&)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?(?:\s+et al\.?)?)\s*,\s*(\d{4}[a-z]?)\s*\)/gi

// Cita parentética: (García, 2023), (García & López, 2023, p. 45), (García et al., 2023)
const RE_PARENTETICA = /\(\s*((?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+|[A-ZÁÉÍÓÚÑ]{2,6})(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*(?:\s*(?:y|&)\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*(?:\s+et al\.?)?)\s*,\s*(\d{4}[a-z]?)(?:\s*,\s*(?:p[p]?\.|p[aá]g\.?)\s*(\d+(?:[–-]\d+)?))?\s*\)/g

// Cita narrativa: García (2023), García y López (2023, p. 12), García et al. (2023)
const RE_NARRATIVA = /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*|[A-ZÁÉÍÓÚÑ]{2,6})(?:\s+et al\.?)?\s*\((\d{4}[a-z]?)(?:,\s*(?:p[p]?\.|p[aá]g\.?)\s*(\d+(?:[–-]\d+)?))?\)/g

// Cita múltiple: (García, 2023; López, 2021; Martínez, 2019)
const RE_MULTIPLE = /\(\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+(?:y|&)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?(?:\s+et al\.?)?\s*,\s*\d{4}[a-z]?(?:\s*;\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+(?:y|&)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?(?:\s+et al\.?)?\s*,\s*\d{4}[a-z]?)+\s*\)/g

// ── UTILIDADES ──────────────────────────────────────────────────────────────

function normalizeSurnameKey(author: string): string {
  if (!author) return ''
  const surname = author.split(',')[0].trim().toLowerCase()
  return surname.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

export function citationKey(authors: string[], year: string | null): string {
  const first = normalizeSurnameKey(authors[0] || '')
  return `${first}|${year || 's.f.'}`
}

function isExcludedParenthetical(matchText: string): boolean {
  const lower = matchText.toLowerCase()
  const hasYear = /\(?\s*\d{4}[a-z]?\s*[,)]/.test(lower)
  for (const term of EXCLUDED_PAREN_TERMS) {
    if (lower.includes(term)) return true
  }
  if (!hasYear && /(?:^|[\s(])(?:p[p]?|p[aá]g)\.?\s*\d/.test(lower)) return true
  if (/(?:figura|tabla|cuadro|anexo)\s+\d+/i.test(matchText)) return true
  if (/^\([\d.\s<>=/*+%-]+\s*(?:kg|cm|mm|gr|km|usd|eur)?\)$/i.test(matchText.trim())) return true
  return false
}

function parseAuthorsFromMatch(authorText: string): string[] {
  if (!authorText) return []
  let clean = authorText.replace(/^(?:según|como|tal|entre|durante|mediante)\s+/i, '').trim()
  clean = clean.replace(/\s+et\s+al\.?/i, '')
  const parts = clean.split(/\s+(?:y|&)\s+/)
  const authors: string[] = []
  for (let part of parts) {
    part = part.trim().replace(/,+$/, '')
    if (!part) continue
    if (part[0] === part[0].toUpperCase() && !/^[A-ZÁÉÍÓÚÑ]\.?$/.test(part)) {
      authors.push(part)
    }
  }
  return authors.length > 0 ? authors : [authorText.trim()]
}

// ── EXTRACCIÓN ───────────────────────────────────────────────────────────────

export function extractCitations(text: string): DetectedCitation[] {
  if (!text || !text.trim()) return []

  const citations: DetectedCitation[] = []
  const processed: Array<[number, number]> = []

  const overlaps = (s: number, e: number) =>
    processed.some(([ps, pe]) => s < pe && e > ps)

  // 1. Secundarias (más específicas primero)
  for (const m of text.matchAll(RE_SECUNDARIA)) {
    const s = m.index ?? 0
    const e = s + m[0].length
    if (overlaps(s, e)) continue
    processed.push([s, e])
    citations.push({
      raw_text: m[0],
      authors: [m[3].trim()],
      year: m[4],
      page: null,
      citation_type: 'secundaria',
      start_offset: s,
      end_offset: e,
    })
  }

  // 2. Parentéticas
  for (const m of text.matchAll(RE_PARENTETICA)) {
    const s = m.index ?? 0
    const e = s + m[0].length
    if (overlaps(s, e)) continue
    if (isExcludedParenthetical(m[0])) continue
    if (/como se cit[oó] en|as cited in/i.test(m[0])) continue
    processed.push([s, e])
    const authors = parseAuthorsFromMatch(m[1].trim())
    const isEtAl = /et\s+al/i.test(m[0])
    citations.push({
      raw_text: m[0],
      authors,
      year: m[2],
      page: m[3] || null,
      citation_type: isEtAl ? 'et_al' : (m[3] ? 'pagina' : 'parentetica'),
      start_offset: s,
      end_offset: e,
    })
  }

  // 3. Narrativas
  for (const m of text.matchAll(RE_NARRATIVA)) {
    const s = m.index ?? 0
    const e = s + m[0].length
    if (overlaps(s, e)) continue
    processed.push([s, e])
    const authors = parseAuthorsFromMatch(m[1].trim())
    // FIX: detectar "et al." sobre el match COMPLETO (m[0]), no solo sobre el
    // grupo del autor (m[1]). El grupo de captura del autor NO incluye "et al."
    // (este va en el grupo no-capturador (?:\s+et al\.?)? antes del paréntesis
    // del año). Antes se probaba m[1], así que "López et al. (2019)" se
    // clasificaba como 'narrativa' en vez de 'et_al'.
    const isEtAl = /et\s+al/i.test(m[0])
    citations.push({
      raw_text: m[0],
      authors,
      year: m[2],
      page: m[3] || null,
      citation_type: isEtAl ? 'et_al' : 'narrativa',
      start_offset: s,
      end_offset: e,
    })
  }

  // 4. Múltiples: dividir por ";" y agregar cada sub-cita
  for (const m of text.matchAll(RE_MULTIPLE)) {
    const s = m.index ?? 0
    const e = s + m[0].length
    if (overlaps(s, e)) continue
    processed.push([s, e])
    const inner = m[0].slice(1, -1).trim()
    const segRe = /^([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s*(?:y|&)\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?(?:\s+et al\.?)?)\s*,\s*(\d{4}[a-z]?)$/
    for (const chunk of inner.split(';')) {
      const cm = chunk.trim().match(segRe)
      if (cm) {
        const authors = parseAuthorsFromMatch(cm[1].trim())
        const isEtAl = /et\s+al/i.test(cm[1])
        citations.push({
          raw_text: chunk.trim(),
          authors,
          year: cm[2],
          page: null,
          citation_type: isEtAl ? 'et_al' : 'parentetica',
          start_offset: s,
          end_offset: e,
        })
      }
    }
  }

  return citations.sort((a, b) => a.start_offset - b.start_offset)
}

/** Versión simplificada: solo indica si hay al menos una cita en el texto. */
export function hasCitation(text: string): boolean {
  return extractCitations(text).length > 0
}

/** Resumen legible para mostrar en el panel. */
export function summarizeCitations(citations: DetectedCitation[]): string[] {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const c of citations) {
    const key = citationKey(c.authors, c.year)
    if (seen.has(key)) continue
    seen.add(key)
    const authorStr = c.authors.length > 0 ? c.authors.join(' & ') : '[Autor]'
    lines.push(`${authorStr} (${c.year || 's.f.'})`)
  }
  return lines
}
