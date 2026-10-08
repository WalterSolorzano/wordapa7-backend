/**
 * WordAPA7 Add-in — Detector local de citas APA 7 (TypeScript)
 * ============================================================
 *
 * Réplica del motor de Python (modules/citation_engine.py) para detectar
 * citas APA 7 directamente en el navegador, SIN depender del backend.
 *
 * Permite que el asistente en vivo "chupe" citas y notifique al instante
 * ("¡Cita procesada con éxito!") incluso si el backend está offline. Cuando
 * el backend sí está disponible, las citas también se persisten ahí.
 *
 * Tipos soportados:
 *  - Parentéticas: (García, 2023), (García & López, 2023, p. 45)
 *  - Narrativas: García (2023), García et al. (2023)
 *  - Secundarias: (García, 2020, como se citó en Pérez, 2023)
 *  - Múltiples: (García, 2023; López, 2021; Martínez, 2019)
 *  - et al. y con página
 */

export type CitationType =
  | 'parentetica'
  | 'narrativa'
  | 'multiple'
  | 'secundaria'
  | 'et_al'

export interface DetectedCitation {
  rawText: string
  authors: string[]
  year: string | null
  page: string | null
  type: CitationType
  start: number
  end: number
}

// ── PATRONES ──────────────────────────────────────────────────────────────────

// Cita secundaria: (García, 2020, como se citó en Pérez, 2023)
const RE_SECUNDARIA = new RegExp(
  '\\(\\s*' +
    '([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\\s+(?:y|&)\\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?(?:\\s+et\\s+al\\.?)?)' +
    '\\s*,\\s*(\\d{4}[a-z]?)' +
    '\\s*,\\s*(?:como\\s+se\\s+cit[oó]\\s+en|as\\s+cited\\s+in)\\s+' +
    '([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\\s+(?:y|&)\\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?(?:\\s+et\\s+al\\.?)?)' +
    '\\s*,\\s*(\\d{4}[a-z]?)' +
    '\\s*\\)',
  'i'
)

// Cita parentética: (García, 2023), (García & López, 2023, p. 45), (OIT, 2007)
const RE_PARENTETICA = new RegExp(
  '\\(\\s*' +
    '((?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+|[A-ZÁÉÍÓÚÑ]{2,6})' +
    '(?:\\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*' +
    '(?:\\s*(?:y|&)\\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*' +
    '(?:\\s+et\\s+al\\.?)?)' +
    '\\s*,\\s*(\\d{4}[a-z]?)' +
    '(?:\\s*,\\s*(?:p[p]?\\.|p[aá]g\\.)\\s*(\\d+(?:[–\\-]\\d+)?))?' +
    '\\s*\\)'
)

// Cita narrativa: García (2023), García y López (2023, p. 12), OIT (2007)
const RE_NARRATIVA = new RegExp(
  '\\b' +
    '(' +
    '[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*' +
    '|' +
    '[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\\s+(?:de|del|la|el|los|las|y|e|&)\\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*' +
    '|' +
    '[A-ZÁÉÍÓÚÑ]{2,6}' +
    ')' +
    '(?:\\s+et\\s+al\\.?)?' +
    '\\s*' +
    '\\((\\d{4}[a-z]?)' +
    '(?:,\\s*(?:p[p]?\\.|p[aá]g\\.)\\s*(\\d+(?:[–\\-]\\d+)?))?' +
    '\\)'
)

// Cita múltiple: (García, 2023; López, 2021; Martínez, 2019)
const RE_MULTIPLE = new RegExp(
  '\\(\\s*' +
    '([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\\s+(?:y|&)\\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?' +
    '(?:\\s+et\\s+al\\.?)?\\s*,\\s*\\d{4}[a-z]?)' +
    '(\\s*;\\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\\s+(?:y|&)\\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?' +
    '(?:\\s+et\\s+al\\.?)?\\s*,\\s*\\d{4}[a-z]?)+' +
    '\\s*\\)'
)

// Términos excluidos para evitar falsos positivos
const EXCLUDED_TERMS = [
  'véase', 'vease', 'ver', 'figura', 'tabla', 'cuadro', 'anexo',
  'apéndice', 'apendice', 'kg', 'cm', 'mm', 'gr', 'usd', 'eur',
  'ejemplo', 'e.g.', 'i.e.', 'cf.', 'vid.', 'fig.', 'tab.',
]

// ── HELPERS ───────────────────────────────────────────────────────────────────

/** Normaliza un apellido: minúsculas, sin tildes, sin espacios extra. */
export function normalizeSurnameKey(author: string): string {
  if (!author) return ''
  const surname = author.split(',')[0].trim().toLowerCase()
  return surname.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

/** Clave de deduplicación: apellido normalizado + año. */
export function citationKey(authors: string[], year: string | null): string {
  const first = normalizeSurnameKey(authors[0] || '')
  return `${first}|${year || 's.f.'}`
}

/** Divide un texto de autores en autores individuales. */
function parseAuthors(authorText: string): string[] {
  if (!authorText) return []
  // Quitar introductores comunes
  let text = authorText.replace(/^(?:según|como|tal|entre|durante|mediante)\s+/i, '').trim()
  // Limpiar et al.
  text = text.replace(/\s+et\s+al\.?/gi, '')
  // Dividir por & o y (con espacios)
  const parts = text.split(/\s+(?:y|&)\s+/)
  const authors: string[] = []
  for (const part of parts) {
    const clean = part.trim().replace(/,+$/, '')
    if (!clean) continue
    if (clean[0] === clean[0].toUpperCase() && !/^[A-ZÁÉÍÓÚÑ]\.?$/.test(clean)) {
      authors.push(clean)
    }
  }
  return authors.length > 0 ? authors : [authorText.trim()]
}

/** ¿El texto entre paréntesis es un falso positivo? */
function isExcludedParenthetical(matchText: string): boolean {
  const lower = matchText.toLowerCase()
  for (const term of EXCLUDED_TERMS) {
    if (lower.includes(term)) return true
  }
  if (/(?:figura|tabla|cuadro|anexo)\s+\d+/i.test(matchText)) return true
  // Solo números/medidas: (100 kg), (p < .05)
  if (/^\([\d.\s<>=*/+\-%,\s]*(?:kg|cm|mm|gr|m|km|usd|eur)?\)$/.test(matchText.trim())) return true
  return false
}

// ── EXTRACCIÓN PRINCIPAL ──────────────────────────────────────────────────────

/**
 * Escanea un texto y devuelve todas las citas APA 7 detectadas, con su
 * tipo, autores, año, página y posición.
 */
export function extractCitations(text: string): DetectedCitation[] {
  if (!text) return []
  const citations: DetectedCitation[] = []
  const processed: Array<[number, number]> = []

  const overlaps = (start: number, end: number): boolean =>
    processed.some(([ps, pe]) => start < pe && end > ps)

  const mark = (start: number, end: number) => processed.push([start, end])

  // 1. Secundarias (patrón más específico primero)
  let m: RegExpExecArray | null
  const reSec = new RegExp(RE_SECUNDARIA.source, 'gi')
  while ((m = reSec.exec(text)) !== null) {
    if (overlaps(m.index, m.index + m[0].length)) continue
    mark(m.index, m.index + m[0].length)
    citations.push({
      rawText: m[0],
      authors: [m[3].trim()],
      year: m[4],
      page: null,
      type: 'secundaria',
      start: m.index,
      end: m.index + m[0].length,
    })
  }

  // 2. Parentéticas
  const rePar = new RegExp(RE_PARENTETICA.source, 'gi')
  while ((m = rePar.exec(text)) !== null) {
    if (overlaps(m.index, m.index + m[0].length)) continue
    if (isExcludedParenthetical(m[0])) continue
    if (/como se cit[oó] en|as cited in/i.test(m[0])) continue
    mark(m.index, m.index + m[0].length)
    const authorText = m[1].trim()
    citations.push({
      rawText: m[0],
      authors: parseAuthors(authorText),
      year: m[2],
      page: m[3] || null,
      type: /et\s+al/i.test(m[0]) ? 'et_al' : 'parentetica',
      start: m.index,
      end: m.index + m[0].length,
    })
  }

  // 3. Narrativas
  const reNar = new RegExp(RE_NARRATIVA.source, 'gi')
  while ((m = reNar.exec(text)) !== null) {
    if (overlaps(m.index, m.index + m[0].length)) continue
    mark(m.index, m.index + m[0].length)
    const authorText = m[1].trim()
    citations.push({
      rawText: m[0],
      authors: parseAuthors(authorText),
      year: m[2],
      page: m[3] || null,
      // FIX: probar "et al" contra el match COMPLETO (m[0]), no contra el
      // grupo del autor (m[1]). El regex RE_NARRATIVA captura el apellido en
      // el grupo 1, pero "et al." queda en el grupo NO capturador
      // (?:\s+et al\.?)?, por lo que m[1] nunca contiene "et al". Sin este
      // fix, "López et al. (2019)" se clasificaba como 'narrativa' en vez
      // de 'et_al' (inconsistencia con la rama parentética, que ya usaba m[0]).
      type: /et\s+al/i.test(m[0]) ? 'et_al' : 'narrativa',
      start: m.index,
      end: m.index + m[0].length,
    })
  }

  // 4. Múltiples: dividir cada sub-cita
  const reMul = new RegExp(RE_MULTIPLE.source, 'gi')
  while ((m = reMul.exec(text)) !== null) {
    if (overlaps(m.index, m.index + m[0].length)) continue
    mark(m.index, m.index + m[0].length)
    const inner = m[0].slice(1, -1).trim()
    for (const chunk of inner.split(';')) {
      const seg = chunk.trim()
      const sm = seg.match(
        /^([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s*(?:y|&)\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?(?:\s+et\s+al\.?)?)\s*,\s*(\d{4}[a-z]?)$/
      )
      if (sm) {
        citations.push({
          rawText: seg,
          authors: parseAuthors(sm[1].trim()),
          year: sm[2],
          page: null,
          type: /et\s+al/i.test(sm[1]) ? 'et_al' : 'parentetica',
          start: m.index,
          end: m.index + m[0].length,
        })
      }
    }
  }

  return citations.sort((a, b) => a.start - b.start)
}

/**
 * Diferencia las citas nuevas respecto a un conjunto ya conocido (por clave
 * de deduplicación). Retorna solo las que NO estaban antes.
 */
export function findNewCitations(
  text: string,
  knownKeys: Set<string>
): DetectedCitation[] {
  const all = extractCitations(text)
  const fresh: DetectedCitation[] = []
  for (const c of all) {
    const key = citationKey(c.authors, c.year)
    if (!knownKeys.has(key)) {
      fresh.push(c)
    }
  }
  return fresh
}
