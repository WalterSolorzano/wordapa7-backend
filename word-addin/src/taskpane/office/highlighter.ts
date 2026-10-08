/**
 * WordAPA7 Add-in — Motor de resaltado temporal (solo documento VIVO)
 * ===================================================================
 *
 * Resalta en Word los párrafos con hallazgos de la auditoría APA 7 usando
 * font.highlightColor = "Yellow". Nunca modifica el contenido ni genera
 * OOXML con resaltado: solo toca el formato del documento abierto.
 *
 * Persistencia: localStorage `wordapa7_temp_highlights` guarda
 * { searchText | paraIndex, appliedAt } para poder limpiar después.
 * Entradas con más de 7 días se purgan al cargar el módulo.
 */

import type { AuditFinding } from '../api/backend'

const LS_KEY = 'wordapa7_temp_highlights'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface HighlightRecord {
  /** Texto único buscado en el documento (si el hallazgo tenía excerpt). */
  searchText?: string
  /** Índice de párrafo como fallback (hallazgos sin excerpt). */
  paraIndex?: number
  appliedAt: number
}

// ── Storage ──────────────────────────────────────────────────────────────────

function loadRecords(): HighlightRecord[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveRecords(records: HighlightRecord[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(records))
  } catch {
    /* localStorage no disponible */
  }
}

/** Elimina registros con más de 7 días. Corre al cargar el módulo. */
export function purgeExpiredHighlights(): void {
  const now = Date.now()
  const fresh = loadRecords().filter((r) => typeof r.appliedAt === 'number' && now - r.appliedAt < MAX_AGE_MS)
  saveRecords(fresh)
}
purgeExpiredHighlights()

// ── Aplicar ──────────────────────────────────────────────────────────────────

function findingToRecord(finding: AuditFinding): HighlightRecord | null {
  const excerpt = (finding.where?.excerpt || '').trim()
  if (excerpt.length >= 8) {
    // Recortar a un snippet buscable (Word.search falla con texto muy largo).
    const flat = excerpt.replace(/\s+/g, ' ').slice(0, 80).trim()
    if (flat) return { searchText: flat, appliedAt: Date.now() }
  }
  if (typeof finding.where?.paragraph_index === 'number') {
    return { paraIndex: finding.where.paragraph_index, appliedAt: Date.now() }
  }
  return null
}

/**
 * Resalta en el documento vivo un hallazgo por búsqueda de texto o índice.
 * Devuelve true si pudo aplicar el resaltado.
 */
async function highlightOne(
  context: Word.RequestContext,
  record: HighlightRecord,
): Promise<boolean> {
  const body = context.document.body
  try {
    let target: Word.Range | null = null

    if (record.searchText) {
      const found = body.search(record.searchText, { matchCase: false })
      context.load(found, 'items')
      await context.sync()
      if (found.items && found.items.length > 0) target = found.items[0]
    }

    if (!target && typeof record.paraIndex === 'number') {
      const paragraphs = body.paragraphs
      context.load(paragraphs)
      await context.sync()
      if (record.paraIndex >= 0 && record.paraIndex < paragraphs.items.length) {
        target = paragraphs.items[record.paraIndex].getRange(Word.RangeLocation.whole)
      }
    }

    if (!target) return false
    target.font.highlightColor = 'Yellow'
    await context.sync()
    return true
  } catch {
    return false
  }
}

/**
 * Resalta todos los hallazgos localizables de la auditoría.
 * @returns cantidad de resaltados efectivamente aplicados.
 */
export async function applyHighlights(findings: AuditFinding[]): Promise<number> {
  const candidates = findings
    .map(findingToRecord)
    .filter((r): r is HighlightRecord => r !== null)
  if (candidates.length === 0) return 0

  const applied: HighlightRecord[] = []

  await Word.run(async (context) => {
    for (const record of candidates) {
      const ok = await highlightOne(context, record)
      if (ok) applied.push(record)
    }
  })

  saveRecords([...loadRecords(), ...applied])
  return applied.length
}

// ── Limpiar ──────────────────────────────────────────────────────────────────

/**
 * Re-aplica los rangos guardados con highlightColor null y vacía el storage.
 * Los rangos que ya no existen (texto editado/borrado) se omiten sin error.
 * @returns cantidad de rangos efectivamente limpiados.
 */
export async function clearAllHighlights(): Promise<number> {
  const records = loadRecords()
  saveRecords([])
  if (records.length === 0) return 0

  let cleared = 0

  await Word.run(async (context) => {
    const body = context.document.body
    for (const record of records) {
      try {
        let target: Word.Range | null = null

        if (record.searchText) {
          const found = body.search(record.searchText, { matchCase: false })
          context.load(found, 'items')
          await context.sync()
          if (found.items && found.items.length > 0) target = found.items[0]
        }

        if (!target && typeof record.paraIndex === 'number') {
          const paragraphs = body.paragraphs
          context.load(paragraphs)
          await context.sync()
          if (record.paraIndex >= 0 && record.paraIndex < paragraphs.items.length) {
            target = paragraphs.items[record.paraIndex].getRange(Word.RangeLocation.whole)
          }
        }

        if (!target) continue // rango perdido → skip silencioso
        ;(target.font as any).highlightColor = null
        cleared++
      } catch {
        /* skip missing gracefully */
      }
    }
    await context.sync()
  })

  return cleared
}

/**
 * Versión nunca-throw para llamar ANTES de cualquier POST de generación
 * (bibliografía / portada / generate). Garantiza que nada resaltado viaje
 * aguas arriba: el resaltado vive solo en el documento abierto.
 */
export async function clearHighlightsBeforeGenerate(): Promise<void> {
  try {
    await clearAllHighlights()
  } catch {
    /* nunca bloquear el flujo por esto */
  }
}
