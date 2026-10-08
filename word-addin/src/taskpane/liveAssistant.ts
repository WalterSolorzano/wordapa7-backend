/**
 * WordAPA7 Add-in — Motor del Asistente en Vivo (Live APA Assistant)
 * ==================================================================
 *
 * Núcleo del asistente que "vive" auditando el documento en segundo plano:
 *
 *   1. "Chupar Citas": detecta citas APA 7 mientras escribís/pegás, las guarda
 *      en la base local de referencias y notifica "¡Cita procesada con éxito!".
 *   2. "Formato al vuelo": aplica Times New Roman 12pt, interlineado doble y
 *      sangría 0.5" al párrafo actual mientras editás.
 *   3. Auto-numeración de figuras/tablas: al pegar una imagen o tabla les
 *      inserta el caption APA 7 ("Figura N" / "Tabla N" + nota) automáticamente.
 *   4. Detección de IA: analiza el texto en busca de patrones de contenido
 *      generado por IA y notifica el nivel de riesgo (opcional, off por defecto).
 *
 * Usa detección local (citationDetector) para respuesta instantánea y, si el
 * backend de Python está disponible (la app Electron del instalador), persiste
 * las citas y enriquece la bibliografía.
 *
 * API callback-based: el componente App se suscribe con { onEvent, onStats } y
 * recibe eventos tipados (AssistantEvent) que puede mostrar en el feed de
 * comentarios estilo WhatsApp y en la mascota.
 */

import {
  subscribeDocumentChanges,
  subscribeSelectionChanges,
  getDocumentText,
  getDocumentStats,
  getCurrentParagraphText,
  applyAPA7ToCurrentParagraph,
  captionUncaptionedFigures,
  captionUncaptionedTables,
  type DocumentStats,
} from './office/wordHelper'
import { getCoverZones, isCoverText } from './office/coverGuard'
import { oncePerSession } from './office/sessionRegistry'
import { contextFromScan } from './office/contextAnalyzer'
import { extractCitations, citationKey, summarizeCitations } from './citationDetector'
import { backend } from './api/backend'

// ── TIPOS PÚBLICOS ───────────────────────────────────────────────────────────

export interface AssistantOptions {
  /** Aplica Times New Roman 12 + interlineado doble + sangría al párrafo actual */
  autoFormat: boolean
  /** Inserta "Figura N" / "Tabla N" + nota automáticamente al pegar imágenes/tablas */
  autoCaption: boolean
  /** Detecta (Autor, Año) en tiempo real y las guarda en la bibliografía */
  autoExtractCitations: boolean
  /** Analiza el texto en busca de patrones de IA (muletillas, estructura, etc.) */
  autoDetectAI: boolean
}

export type AssistantEventType =
  | 'citation'
  | 'figure'
  | 'table'
  | 'format'
  | 'mascot'
  | 'info'
  | 'summary'
  | 'error'

export interface AssistantEvent {
  type: AssistantEventType
  message: string
  detail?: string
  time: number
  tone: 'success' | 'error' | 'info' | 'warning'
}

export interface AssistantCallbacks {
  onEvent: (event: AssistantEvent) => void
  onStats: (stats: DocumentStats) => void
}

// ── CONSTANTES ────────────────────────────────────────────────────────────────

const DEFAULT_OPTIONS: AssistantOptions = {
  autoFormat: true,
  autoCaption: true,
  autoExtractCitations: true,
  autoDetectAI: false, // off por defecto: es más pesado que la detección local
}

/** Clave de persistencia de opciones en Office roamingSettings. */
const RS_OPTIONS_KEY = 'wordapa7_assistant_options'

/** Carga opciones persistidas (roamingSettings). Null si no hay/error. */
function loadPersistedOptions(): Partial<AssistantOptions> | null {
  try {
    if (typeof Office === 'undefined' || !Office.context?.roamingSettings) return null
    const raw = Office.context.roamingSettings.get(RS_OPTIONS_KEY)
    if (!raw) return null
    return (typeof raw === 'string' ? JSON.parse(raw) : raw) as Partial<AssistantOptions>
  } catch {
    return null
  }
}

/** Guarda opciones en roamingSettings (best-effort, persiste entre sesiones). */
function persistOptions(opts: AssistantOptions): void {
  try {
    if (typeof Office === 'undefined' || !Office.context?.roamingSettings) return
    const rs = Office.context.roamingSettings
    rs.set(RS_OPTIONS_KEY, JSON.stringify(opts))
    rs.saveAsync(() => {})
  } catch {
    /* best-effort */
  }
}

/** Umbral de score para considerar texto de ALTO riesgo de IA. */
const AI_HIGH_THRESHOLD = 0.5
/** Umbral de score para considerar texto de riesgo MEDIO de IA. */
const AI_MEDIUM_THRESHOLD = 0.2
/** Cantidad de caracteres máximos que se envían al análisis de IA. */
const AI_MAX_CHARS = 3000
/** Diferencia mínima de score para volver a notificar (evita spam). */
const AI_NOTIFY_DELTA = 0.05

// Mensajes rotativos de la mascota (idle)
const IDLE_TIPS: string[] = [
  'Te estoy vigilando el formato...',
  'Acordate: APA 7 usa Times New Roman 12, doble espacio.',
  'Si pegás una imagen, le pongo la figura yo.',
  'Las tablas no llevan bordes verticales en APA 7.',
  '3 o mas autores usan "et al." desde la primera cita.',
  'El DOI va con https://doi.org/ adelante.',
  'Detectando citas en tiempo real...',
  'Las citas de +40 palabras van en bloque, sin comillas.',
]

const MASCOT_SUCCESS = [
  'Cita procesada con éxito.',
  'La chupe y la guarde.',
  'Otra cita al saco.',
]
const MASCOT_FIGURE = [
  'Le puse la figura, de nada.',
  'Imagen detectada, figura numerada.',
]
const MASCOT_TABLE = [
  'Tabla numerada al estilo APA.',
  'Le agregué el caption a la tabla.',
]

// ── ESTADO INTERNO ───────────────────────────────────────────────────────────

let _options: AssistantOptions = { ...DEFAULT_OPTIONS }
let _callbacks: AssistantCallbacks | null = null
let _running = false
let _backendOnline = false
let _citationsCount = 0
let _stats: DocumentStats | null = null

let _unsubDoc: (() => void) | null = null
let _unsubSel: (() => void) | null = null
let _idleTimer: ReturnType<typeof setInterval> | null = null
let _debounceTimer: ReturnType<typeof setTimeout> | null = null

// Estado interno del scan
const _knownCitationKeys = new Set<string>()
let _lastInlinePicCount = 0
let _lastParagraphCount = 0
let _applying = false // guard anti-reentrada (cambios hechos por el asistente)

// Estado interno de detección de IA — evita notificar spam
let _lastAIScore: number | null = null

let _bibliographyHintShown = false

// ── UTILIDADES ───────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function emit(type: AssistantEventType, message: string, detail?: string): void {
  if (!_callbacks) return
  const tone: AssistantEvent['tone'] =
    type === 'error' ? 'error' :
    type === 'citation' || type === 'figure' || type === 'table' ? 'success' :
    'info'
  _callbacks.onEvent({ type, message, detail, time: Date.now(), tone })
}

function emitMascot(message: string): void {
  emit('mascot', message)
}

function emitStats(s: DocumentStats): void {
  _stats = s
  _callbacks?.onStats(s)
}

function stopIdleRotation(): void {
  if (_idleTimer) {
    clearInterval(_idleTimer)
    _idleTimer = null
  }
}

function startIdleRotation(): void {
  stopIdleRotation()
  if (!_running) return
  _idleTimer = setInterval(() => {
    emitMascot(pick(IDLE_TIPS))
  }, 16000)
}

// ── BACKEND ──────────────────────────────────────────────────────────────────

async function checkBackend(): Promise<void> {
  try {
    await backend.health()
    if (!_backendOnline) {
      _backendOnline = true
      // Cargar referencias existentes para no volver a notificarlas
      try {
        const refs = await backend.references()
        for (const r of refs.references) {
          _knownCitationKeys.add(r.key || citationKey(r.authors || [], r.year || null))
        }
      } catch {
        /* no crítico */
      }
    }
  } catch {
    _backendOnline = false
  }
}

// ── DETECCIÓN DE IA ───────────────────────────────────────────────────────────

/**
 * Analiza el texto en busca de patrones de IA y notifica según el score.
 * Solo notifica una vez por cambio significativo del score (evita spam).
 */
async function detectAI(docText: string): Promise<void> {
  if (!_backendOnline) return

  // Recortar el texto si es muy largo (el backend tiene límite de tamaño)
  const chunk = docText.slice(0, AI_MAX_CHARS)

  let result
  try {
    result = await backend.analyzeAI(chunk)
  } catch {
    /* fallo silencioso: la detección de IA no es crítica */
    return
  }

  const score = result.score
  const pct = Math.round(score * 100)

  // ── Anti-spam: no notificar si el score no cambió significativamente ──
  if (_lastAIScore !== null && Math.abs(score - _lastAIScore) < AI_NOTIFY_DELTA) {
    _lastAIScore = score
    return
  }
  _lastAIScore = score

  // ── Notificar según el nivel de riesgo ──
  if (score >= AI_HIGH_THRESHOLD) {
    emit(
      'error',
      'Texto con alta probabilidad de IA',
      `Score: ${pct}% — ${result.findings.length} patrón(es) detectado(s)`,
    )
  } else if (score >= AI_MEDIUM_THRESHOLD && result.findings.length > 0) {
    emit(
      'info',
      'Posible texto generado por IA',
      `Score: ${pct}% — revisá la pestaña IA`,
    )
  }
}

// ── SCAN PRINCIPAL ───────────────────────────────────────────────────────────

async function scan(): Promise<void> {
  if (!_running || _applying) return

  // ── Verificar backend si está offline (piggyback en el ciclo de scan
  //    en lugar de tener un setInterval dedicado que duplica el health
  //    check de App.tsx). App.tsx es la única fuente de verdad del estado
  //    del backend en la UI; acá solo sincronizamos _backendOnline.
  if (!_backendOnline) {
    await checkBackend()
  }

  try {
    // Estadísticas actuales (palabras, imágenes, párrafos)
    let stats: DocumentStats
    try {
      stats = await getDocumentStats()
      emitStats(stats)
    } catch {
      return
    }

    // Texto del documento para detección de citas
    let docText = ''
    try {
      docText = await getDocumentText()
    } catch {
      /* sin texto, continuar */
    }

    // ── 1. CHUPAR CITAS ──
    if (_options.autoExtractCitations && docText.trim()) {
      try {
        const citations = extractCitations(docText)
        const newOnes = citations.filter(
          (c) => !_knownCitationKeys.has(citationKey(c.authors, c.year)),
        )

        for (const c of newOnes) {
          _knownCitationKeys.add(citationKey(c.authors, c.year))
        }

        if (newOnes.length > 0) {
          _citationsCount += newOnes.length
          const summary = summarizeCitations(newOnes)
          emit('citation', '¡Cita procesada con éxito!', summary.join(', '))
          emitMascot(pick(MASCOT_SUCCESS))

          // Persistir en el backend (si está disponible). CORE_DOWN: sin motor
          // NO se persiste nada; aviso honesto una vez por sesión.
          if (_backendOnline) {
            try {
              const res = await backend.extractCitations(docText)
              // Actualizar contador con el total real del store
              if (typeof res.total_in_store === 'number') {
                _citationsCount = res.total_in_store
              }
            } catch {
              /* fallo silencioso: ya notificamos localmente */
            }
          } else if (oncePerSession('offline-cite-hint')) {
            emit('info', 'Modo limitado (motor caído)',
              'Las citas se detectaron localmente pero NO se persisten hasta que la app WordAPA7 esté corriendo.')
          }
        }

        // ── Sugerencia de bibliografía después de 3+ citas ──
        if (_citationsCount >= 3 && !_bibliographyHintShown) {
          _bibliographyHintShown = true
          setTimeout(() => {
            emitMascot('Ya juntaste 3... ¿te armo la bibliografía o que?')
          }, 2000)
        }
      } catch {
        /* no crítico */
      }
    }

    // ── 2. FORMATO AL VUELO ──
    // Guard de portada (modelo del programa base): si el cursor está en un
    // párrafo de la portada, NO se formatea. Sin zonas del core → no actuar.
    if (_options.autoFormat) {
      try {
        _applying = true
        const zones = await getCoverZones()
        const curText = zones ? await getCurrentParagraphText() : ''
        const isCover = !zones || isCoverText(curText, zones)
        // T1: contexto inferido SIN roundtrips nuevos (datos del scan)
        const ctx = contextFromScan({ currentParagraphText: curText, isCover })
        if (isCover) {
          // T3/T4: avisar UNA vez por sesión por qué no se formatea
          if (oncePerSession('coverfmt-blocked')) {
            emit('info', 'Portada protegida', `Contexto=${ctx.kind}: el asistente no escribe en la portada.`)
          }
        } else if (oncePerSession(`fmt:${_hash(curText)}`)) {
          await applyAPA7ToCurrentParagraph()
        }
      } catch {
        /* no crítico */
      } finally {
        _applying = false
      }
    }

    // ── 3. AUTO-CAPTION DE FIGURAS/TABLAS AL PEGAR ──
    if (_options.autoCaption) {
      const picCount = stats.inlinePictures
      const paraCount = stats.paragraphs
      const newPics = picCount > _lastInlinePicCount
      const newContent = paraCount !== _lastParagraphCount

      if (newPics || (newContent && _lastInlinePicCount > 0)) {
        try {
          _applying = true
          const zonesC = await getCoverZones()
          const skipCover = zonesC ? (t: string) => isCoverText(t, zonesC) : undefined
          const figs = await captionUncaptionedFigures(async (ctx) => {
            // sugerencia de título vía backend; si no hay, cadena genérica
            if (_backendOnline && ctx.trim()) {
              try {
                const s = await backend.suggestCaption('figure', ctx)
                return s.caption
              } catch {
                return ''
              }
            }
            return ''
          }, { skip: skipCover })
          const tabs = await captionUncaptionedTables({ skip: skipCover })
          if (figs > 0) {
            emit('figure', `Figura(s) numerada(s) automáticamente`, `${figs} imagen(es) con caption APA 7`)
            emitMascot(pick(MASCOT_FIGURE))
          }
          if (tabs > 0) {
            emit('table', `Tabla(s) numerada(s) automáticamente`, `${tabs} tabla(s) con caption APA 7`)
            emitMascot(pick(MASCOT_TABLE))
          }
        } catch {
          /* no crítico */
        } finally {
          _applying = false
        }
      }

      _lastInlinePicCount = picCount
      _lastParagraphCount = paraCount
    }

    // ── 4. DETECCIÓN DE IA ──
    // Solo si está activada la opción y hay texto disponible.
    // Es más pesada que la detección local, por eso está off por defecto.
    if (_options.autoDetectAI && docText.trim()) {
      try {
        await detectAI(docText)
      } catch {
        /* fallo silencioso: la detección de IA no es crítica */
      }
    }
  } catch (err) {
    emit('error', 'Error en el escaneo en vivo', String(err))
  }
}

/** Hash djb2 corto para claves de idempotencia por sesión (T3). */
function _hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function debouncedScan(): void {
  if (!_running) return
  if (_debounceTimer) clearTimeout(_debounceTimer)
  _debounceTimer = setTimeout(() => {
    scan().catch(() => {})
  }, 700)
}

// ── API PÚBLICA ──────────────────────────────────────────────────────────────

export const liveAssistant = {
  /**
   * Arranca la auditoría en vivo. Suscribe los eventos de cambio del documento
   * y selección, y comienza a detectar citas, aplicar formato y captionear
   * figuras/tablas automáticamente.
   *
   * NOTA: el health-check del backend (cada 8s) vive en App.tsx, que es la
   * única fuente de verdad del estado Online/Offline. Acá solo hacemos un
   * checkBackend() inicial al arrancar; el scan() piggybacka la detección
   * si _backendOnline es false (sin setInterval dedicado).
   *
   * @param callbacks { onEvent, onStats } — receptores de eventos y estadísticas
   * @param options   opciones parciales (autoFormat, autoCaption, autoExtractCitations, autoDetectAI)
   */
  start(callbacks: AssistantCallbacks, options?: Partial<AssistantOptions>): void {
    _callbacks = callbacks

    // Cargar opciones persistidas (roamingSettings) y mezclar con defaults/pasadas
    const persisted = loadPersistedOptions()
    _options = { ...DEFAULT_OPTIONS }
    if (persisted) _options = { ..._options, ...persisted }
    if (options) _options = { ..._options, ...options }
    persistOptions(_options)

    if (_running) return
    _running = true

    // Suscribir a cambios del documento y selección
    _unsubDoc = subscribeDocumentChanges(debouncedScan)
    _unsubSel = subscribeSelectionChanges(() => {
      if (_running && _options.autoFormat) debouncedScan()
    })

    // Chequear backend inicial (el scan() piggybacka reintentos si está offline)
    checkBackend()

    // Escaneo inicial + rotación de mascota
    debouncedScan()
    startIdleRotation()
    emitMascot('Asistente en vivo activado.')
  },

  /** Detiene la auditoría en vivo. */
  stop(): void {
    _running = false
    if (_unsubDoc) { _unsubDoc(); _unsubDoc = null }
    if (_unsubSel) { _unsubSel(); _unsubSel = null }
    if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null }
    stopIdleRotation()
    emitMascot('Asistente en vivo en pausa.')
  },

  /** Indica si el asistente está corriendo. */
  isRunning(): boolean {
    return _running
  },

  /** Devuelve las opciones actuales. */
  getOptions(): AssistantOptions {
    return { ..._options }
  },

  /** Actualiza opciones parciales en caliente. */
  setOptions(partial: Partial<AssistantOptions>): void {
    _options = { ..._options, ...partial }
    persistOptions(_options)
  },

  /** Dispara un escaneo manual inmediato. */
  async scanNow(): Promise<void> {
    return scan()
  },

  /** Devuelve el conteo de citas detectadas. */
  getCitationsCount(): number {
    return _citationsCount
  },

  /** Resetea las citas conocidas (para re-notificar). */
  resetKnownCitations(): void {
    _knownCitationKeys.clear()
    _citationsCount = 0
    _bibliographyHintShown = false
  },
}
