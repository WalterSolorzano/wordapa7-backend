/**
 * FASE delta-proactivo T1 — Análisis contextual SIN roundtrips nuevos.
 *
 * Inferencia PURA a partir de los datos que liveAssistant ya lee en cada scan
 * (texto del párrafo actual, zonas de portada, presencia de drawing/tabla).
 * Cero llamadas extra a context.sync(): si falta dato, devuelve 'unknown'
 * (honestidad: unknown = no actuar).
 */

export type ContextKind =
  | 'table'
  | 'image'
  | 'heading'
  | 'references'
  | 'paragraph'
  | 'protected-cover'
  | 'unknown'

export interface ContextInput {
  text?: string
  /** Estilo Word del párrafo (p.ej. 'Heading 1', 'Título 2'). Minúsculas-ok. */
  style?: string
  hasDrawing?: boolean
  inTable?: boolean
  /** El coverGuard ya marcó este texto como portada. */
  isCover?: boolean
}

export interface ContextResult {
  kind: ContextKind
  reason: string
}

const REFS_RE = /^\s*(referencias?|bibliograf[íi]a|references|works cited)\b/i

export function inferContext(input: ContextInput): ContextResult {
  const text = (input.text ?? '').trim()

  // Portada protegida SIEMPRE gana: no se analiza ni se actúa.
  if (input.isCover) return { kind: 'protected-cover', reason: 'coverGuard' }

  if (input.inTable) return { kind: 'table', reason: 'seleccion dentro de tabla' }
  if (input.hasDrawing) return { kind: 'image', reason: 'parrafo con imagen' }

  const style = (input.style ?? '').toLowerCase()
  if (style.startsWith('heading') || style === 'title' || style === 'título' || style === 'titulo') {
    return { kind: 'heading', reason: `estilo=${input.style}` }
  }

  if (!text) return { kind: 'unknown', reason: 'sin texto' }

  if (REFS_RE.test(text)) return { kind: 'references', reason: 'encabezado de zona refs' }

  // Heurística APA de heading sin estilo: corto, sin punto final, tipo título
  const words = text.split(/\s+/)
  const looksHeading =
    words.length <= 12 && !/[.;]$/.test(text) && /^[\wÁÉÍÓÚÑáéíóúñ0-9\s\-:,()]+$/.test(text)
  if (looksHeading && words.length >= 1 && _titleCaseLike(text)) {
    return { kind: 'heading', reason: 'heuristica titulo-corto' }
  }

  return { kind: 'paragraph', reason: 'texto corrido' }
}

function _titleCaseLike(s: string): boolean {
  // Acepta "Metodo", "Metodo y Tiempos", "3. Resultados": no frases con verbo conjugado obvio
  return s.length > 0 && s === s.charAt(0).toUpperCase() + s.slice(1)
}

/** Adapter tipado para el snapshot que ya produce liveAssistant. */
export function contextFromScan(snap: {
  currentParagraphText?: string
  style?: string
  hasDrawing?: boolean
  inTable?: boolean
  isCover?: boolean
}): ContextResult {
  return inferContext({
    text: snap.currentParagraphText,
    style: snap.style,
    hasDrawing: snap.hasDrawing,
    inTable: snap.inTable,
    isCover: snap.isCover,
  })
}
