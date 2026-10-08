/**
 * WordAPA7 Add-in — Guardián de Portada (modelo del programa base)
 * ================================================================
 *
 * La zona de portada la define el NÚCLEO Python (pre_classifier), no este
 * add-in. Aquí solo se consulta, se cachea y se aplica como PISO DURO:
 * ningún motor (normalizador maestro, formato al vuelo) toca un párrafo
 * con índice < body_start_idx ni texto perteneciente a la portada.
 *
 * Filosofía: la portada es SAGRADA. El usuario la dijo 4 veces. Si el
 * motor central no está disponible, NO se reestructura nada (CORE_DOWN).
 */

import { backend } from '../api/backend'
import { getParagraphsForAnalysis } from './wordHelper'

export interface CoverZones {
  coverDetected: boolean
  /** Primer índice fuera de la portada. Piso duro: nada por debajo se toca. */
  bodyStartIdx: number
  isCover: boolean[]
  /** Textos (trim) de los párrafos de portada, para guards por texto. */
  coverTexts: string[]
}

let cache: { zones: CoverZones; sig: string; at: number } | null = null
const CACHE_TTL_MS = 45_000

function hashSig(texts: string[]): string {
  // Firma barata: longitud total + primeros/últimos párrafos con contenido.
  const first = texts.find((t) => t.trim()) || ''
  const last = [...texts].reverse().find((t) => t.trim()) || ''
  return `${texts.length}:${first.length}:${first.slice(0, 60)}:${last.slice(0, 40)}`
}

/**
 * Zonas de portada según el core. Null si el motor central no responde:
 * el llamador debe ABORTAR la reestructuración (nunca adivinar).
 */
export async function getCoverZones(force = false): Promise<CoverZones | null> {
  try {
    const paras = await getParagraphsForAnalysis()
    const sig = hashSig(paras)
    if (!force && cache && cache.sig === sig && Date.now() - cache.at < CACHE_TTL_MS) {
      return cache.zones
    }
    const res = await backend.documentZones(paras)
    const zones: CoverZones = {
      coverDetected: !!res.cover_detected,
      bodyStartIdx: Math.max(0, res.body_start_idx ?? 0),
      isCover: res.is_cover || [],
      coverTexts: res.cover_texts || [],
    }
    cache = { zones, sig, at: Date.now() }
    return zones
  } catch {
    return null
  }
}

export function invalidateCoverZones(): void {
  cache = null
}

/**
 * Guard por TEXTO: ¿este párrafo pertenece a la zona de portada?
 * Usado por el formato al vuelo (párrafo bajo el cursor), donde no hay
 * índice global confiable pero sí el texto del párrafo.
 * Vacío → false (párrafos vacíos no necesitan protección).
 */
export function isCoverText(text: string, zones: CoverZones | null): boolean {
  const t = (text || '').trim()
  if (!t || !zones) return false
  return zones.coverTexts.some((c) => c === t)
}
