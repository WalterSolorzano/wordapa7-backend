/**
 * WordAPA7 Add-in — Cliente HTTP del backend de Python
 * =====================================================
 *
 * Se conecta al servidor FastAPI local (127.0.0.1:PUERTO) que corre dentro
 * de la app Electron (empaquetada por el instalador).
 *
 * Detección automática de la URL del backend:
 *
 *   1. MODO PRODUCCIÓN (URL HTTPS pública):
 *      El Add-in se carga desde una URL HTTPS pública (ej.
 *      https://wordapa7.pages.dev) y se comunica con el backend local en
 *      http://127.0.0.1:8742 (HTTP plano). No necesita certificados.
 *      → Se detecta cuando window.location.origin NO es localhost ni
 *        el dev server :3000.
 *
 *   2. MODO SERVIDO POR BACKEND (HTTPS local o HTTP local):
 *      El Add-in lo sirve el propio backend (https://localhost:8742/addin/
 *      o http://localhost:8742/addin/), así que window.location.origin YA
 *      es la URL correcta del backend.
 *      → Se detecta cuando el origin ES localhost o 127.0.0.1.
 *
 *   3. MODO DESARROLLO (Vite dev server en :3000):
 *      El backend corre en otro puerto; se descubre vía IPC de Electron
 *      o fallback a 8742.
 *
 * El asistente en vivo funciona también SIN backend: la detección de citas y
 * el formato APA se hacen localmente (citationDetector + wordHelper). El
 * backend enriquece: guarda en la base de referencias persistente, construye
 * la bibliografía y resuelve citas fantasma vía Crossref.
 *
 * IMPORTANTE: los endpoints de Python devuelven respuestas PLANA (no anidadas),
 * y los tipos de acá reflejan exactamente esa forma. No hay que desenvolver
 * nada: lo que llega del backend ya coincide con el tipo declarado.
 */

const DEFAULT_PORT = 8742

export const OFFLINE_TOAST_MESSAGE =
  'WordAPA7 no está corriendo. Abrí la app WordAPA7 desde el escritorio y esperá unos segundos.'

/**
 * Descubre la URL base del backend de manera dinámica.
 *
 * - Si el Add-in se carga desde una URL HTTPS pública (producción), el
 *   backend corre localmente en la máquina del usuario (localhost/127.0.0.1).
 *   Para soportar puertos dinámicos si el puerto 8742 está ocupado, realiza un
 *   barrido paralelo rápido (puertos 8742 a 8746) consultando /api/addin/health.
 * - Si el Add-in lo sirve el propio backend (localhost), usa window.location.origin.
 * - En desarrollo (Vite en :3000), descubre el puerto vía IPC o usa 8742.
 */
let BASE_URL = 'https://localhost:8742'
let discoveryPromise: Promise<string> | null = null

function ensureBaseUrl(): Promise<string> {
  if (discoveryPromise) {
    return discoveryPromise
  }

  const origin = window.location.origin

  // Si el Add-in lo sirve el propio backend (origin es localhost/127.0.0.1
  // en el puerto 8742-8746), usar el origin directamente como URL del backend.
  // Esto funciona tanto en HTTPS (default) como en HTTP.
  const backendPortMatch = origin.match(/:(874[2-6])$/)
  if (backendPortMatch && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
    console.log(`[Add-in] Add-in servido por el backend local: ${origin}`)
    BASE_URL = origin
    discoveryPromise = Promise.resolve(origin)
    return discoveryPromise
  }

  // Dev mode (Vite en :3000): usa el puerto del backend de Electron.
  if (origin.includes(':3000')) {
    const electronPort = (window as any)?.electronAPI?.getBackendPort?.()
    const devUrl =
      electronPort && typeof electronPort === 'number'
        ? `http://127.0.0.1:${electronPort}`
        : `http://127.0.0.1:${DEFAULT_PORT}`
    BASE_URL = devUrl
    discoveryPromise = Promise.resolve(devUrl)
    return discoveryPromise
  }

  // Producción: add-in servido por backend local (loopback) O desde URL pública HTTPS.
  // Respaldo: backend LOCAL primero (estable/offline); si no responde, cae al
  // backend en la NUBE leyendo ./config.json (apiUrl). "Si uno falla, el otro".
  discoveryPromise = (async () => {
    const localUrl = await probeLocalBackend()
    if (localUrl) {
      console.log(`[Add-in] Backend local: ${localUrl}`)
      BASE_URL = localUrl
      return localUrl
    }

    try {
      const cfgRes = await fetch('./config.json', { cache: 'no-store' })
      if (cfgRes.ok) {
        const cfg = await cfgRes.json()
        const cloud = cfg?.apiUrl?.toString().trim().replace(/\/$/, '')
        if (cloud) {
          try {
            const hc = new AbortController()
            const tid = setTimeout(() => hc.abort(), 2000)
            const h = await fetch(`${cloud}/api/addin/health`, { signal: hc.signal })
            clearTimeout(tid)
            if (h.ok) {
              console.log(`[Add-in] Backend en la nube (fallback): ${cloud}`)
              BASE_URL = cloud
              return cloud
            }
          } catch { /* cloud caído */ }
        }
      }
    } catch { /* sin config.json */ }

    console.warn(`[Add-in] Ni local ni nube responden; usando local por defecto.`)
    BASE_URL = `https://localhost:8742`
    return BASE_URL
  })()

  return discoveryPromise
}

// Escanea 127.0.0.1:8742..8746 en busca del backend local (loopback).
// Prueba HTTPS primero (el backend usa SSL por defecto) y HTTP como respaldo.
function probeLocalBackend(): Promise<string | null> {
  const candidatePorts = [8742, 8743, 8744, 8745, 8746]
  const protocols = ['https', 'http']
  const hosts = ['localhost', '127.0.0.1']

  const probes: Promise<string>[] = []
  for (const proto of protocols) {
    for (const host of hosts) {
      for (const port of candidatePorts) {
        probes.push((async () => {
          try {
            const controller = new AbortController()
            const id = setTimeout(() => controller.abort(), 1000)
            const res = await fetch(`${proto}://${host}:${port}/api/addin/health`, {
              signal: controller.signal,
            })
            clearTimeout(id)
            if (res.ok) {
              const data = await res.json()
              if (data.status === 'ok') return `${proto}://${host}:${port}`
            }
          } catch { /* puerto apagado o cert no confiable */ }
          throw new Error('Not responding')
        })())
      }
    }
  }
  return Promise.any(probes).catch(() => null)
}

// El descubrimiento es perezoso: se dispara en la primera llamada real
// (post/get/del/heartbeat). No pre-calentamos aquí para no generar
// fan-out de fetch al cargar el módulo.

// == TIPOS COMPARTIDOS ========================================================

export interface APAIssue {
  category: string
  severity: 'info' | 'warning' | 'error'
  message: string
  suggestion: string
}

export interface AnalysisResult {
  issues: APAIssue[]
  score: number
  suggestion: string | null
}

export interface CaptionSuggestion {
  label: string
  caption: string
  note: string
}

export interface ValidationResult {
  status: 'ok' | 'warning' | 'error'
  issues: APAIssue[]
  summary: string
}

// == Auditoría de documento completo (POST /api/addin/audit-document) ========

export type AuditSeverity = 'error' | 'warn' | 'info'
export type AuditCategory = 'citacion' | 'referencias' | 'formato' | 'estructura'

export interface AuditFinding {
  id: string
  severity: AuditSeverity
  category: AuditCategory
  message: string
  fix: string
  where?: {
    paragraph_index?: number
    excerpt?: string
  }
}

export interface AuditStats {
  paragraphs: number
  words: number
  citations: number
  references: number
}

/** POST /api/addin/audit-document → { findings, stats } */
export interface AuditDocumentResult {
  findings: AuditFinding[]
  stats: AuditStats
}

export interface NextNumberResult {
  next_number: number
  existing_labels: string[]
}

// == Tipos del Asistente en Vivo ==============================================
//
// Estos tipos reflejan EXACTAMENTE la forma plana que devuelve el router
// `python/routers/addin.py`. Si cambiás el backend, actualizá acá también.

export interface ExtractedCitation {
  id: string
  raw_text: string
  authors: string[]
  year: string | null
  page?: string | null
  citation_type: string
  is_new: boolean
  occurrences?: number
}

/** POST /api/addin/extract-citations → { citations, new_count, total_in_store, drafts } */
export interface ExtractCitationsResult {
  citations: ExtractedCitation[]
  new_count: number
  total_in_store: number
  drafts: number
}

export interface ReferenceItem {
  id: string
  key?: string
  authors: string[]
  year: string | null
  title: string
  source: string
  doi_or_url: string | null
  raw_text: string
  formatted_apa: string | null
  is_draft?: boolean
  created_at?: string
}

/** Alias para compatibilidad con componentes que usan ReferenceDTO. */
export type ReferenceDTO = ReferenceItem

/**
 * GET /api/addin/references       → { total, drafts, complete, references }
 * POST /api/addin/build-bibliography → { bibliography_text, total, drafts, complete, references }
 * (bibliography_text solo viene en build-bibliography; en references es opcional).
 */
export interface BibliographyResult {
  bibliography_text?: string
  total: number
  drafts: number
  complete: number
  references: ReferenceItem[]
}

/** POST /api/addin/suggest-cover → { title, author, institution, course, date } */
export interface CoverSuggestion {
  title: string
  author: string
  institution: string
  course: string
  date: string
}

export interface HeadingSuggestion {
  index: number
  text: string
  suggested_level: number
  confidence?: number
  reason: string
}

/** POST /api/addin/detect-headings → { suggestions, total } */
export interface DetectHeadingsResult {
  suggestions: HeadingSuggestion[]
  total: number
}

export interface SaveReferenceInput {
  id?: string
  authors: string[]
  year: string | null
  title: string
  source: string
  doi_or_url: string | null
  raw_text: string
}

// == Tipos de Detección de IA ================================================
//
// Estos tipos reflejan los nuevos endpoints de detección de texto generado por
// IA del router `python/routers/addin.py`. El backend analiza patrones
// (muletillas, estructura, redundancia, etc.) y devuelve un score de riesgo.

/** Hallazgo individual de un patrón de IA detectado. */
export interface AIFinding {
  pattern: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH'
  detail: string
  count: number
  phrase?: string
}

/** Resultado del análisis de IA de un fragmento de texto. */
export interface AIAnalysisResult {
  /** Score de riesgo 0.0 a 1.0 (0 = humano, 1 = IA total) */
  score: number
  category: 'LOW' | 'MEDIUM' | 'HIGH'
  findings: AIFinding[]
}

/** Resultado del análisis de IA de un documento completo (por párrafos). */
export interface AIDocumentResult {
  results: Array<{
    score: number
    category: string
    findings: AIFinding[]
    matches: string[]
  }>
  total_paragraphs: number
  high_risk_count: number
  medium_risk_count: number
  low_risk_count: number
  overall_score: number
  overall_category: string
}

/** Resultado de la reescritura de un texto con IA para humanizarlo. */
export interface AIRewriteResult {
  original: string
  rewritten: string
  provider: string
}

/** Estado de los proveedores de IA disponibles en el backend. */
export interface AIHealthResult {
  providers_active: number
  providers: string[]
  specialties: Record<string, { provider: string; percentage: number; status: string }>
}

/** Chip de un proveedor de IA (GET /api/addin/ai-providers). */
export interface AIProviderChip {
  name: string
  active: boolean
}

/** GET /api/addin/ai-providers → { providers: [{ name, active }], count } */
export interface AIProvidersResult {
  providers: AIProviderChip[]
  count: number
}

// == HTTP HELPERS =============================================================

/**
 * Telemetría de errores best-effort: cada request fallido queda registrado
 * en %APPDATA%\WordAPA7\logs vía /api/client-log. Antes había 77 catches
 * silenciosos y los bugs llegaban semanas después por reporte del usuario.
 * Anti-recursión: si el propio /api/client-log falla, no se reintenta.
 */
let _reportingError = false
function reportClientError(path: string, err: unknown): void {
  if (_reportingError) return
  _reportingError = true
  void (async () => {
    try {
      const baseUrl = await ensureBaseUrl()
      await fetch(`${baseUrl}/api/client-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          component: 'addin-api',
          event: 'request_failed',
          level: 'error',
          data: { path, message: err instanceof Error ? err.message : String(err) },
        }),
      })
    } catch {
      /* log best-effort: nada que hacer si también falla */
    } finally {
      setTimeout(() => { _reportingError = false }, 1500)
    }
  })()
}

async function post<T>(path: string, body: unknown): Promise<T> {
  try {
    const baseUrl = await ensureBaseUrl()
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Backend ${res.status}: ${err}`)
    }
    return res.json()
  } catch (err) {
    reportClientError(path, err)
    throw err
  }
}

async function get<T>(path: string): Promise<T> {
  try {
    const baseUrl = await ensureBaseUrl()
    const res = await fetch(`${baseUrl}${path}`)
    if (!res.ok) throw new Error(`Backend ${res.status}`)
    return res.json()
  } catch (err) {
    reportClientError(path, err)
    throw err
  }
}

async function del<T>(path: string): Promise<T> {
  try {
    const baseUrl = await ensureBaseUrl()
    const res = await fetch(`${baseUrl}${path}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Backend ${res.status}`)
    return res.json()
  } catch (err) {
    reportClientError(path, err)
    throw err
  }
}


// == API =======================================================================

export const backend = {
  // -- Endpoints básicos -------------------------------------------------------

  health: () => get<{ status: string; version: string }>(`/api/addin/health`),

  /**
   * Anti-stale: identidad del motor que responde. `mode: 'core'` = núcleo
   * lite (capacidad limitada); `'app'` = app completa. Nunca lanza.
   */
  async fetchBuildInfo(): Promise<{ mode: 'app' | 'core'; version: string; build_hash?: string } | null> {
    try {
      return await get<{ mode: 'app' | 'core'; version: string; build_hash?: string }>(
        `/api/addin/build-info`,
      )
    } catch {
      return null
    }
  },

  /**
   * Heartbeat best-effort: avisa al backend que el add-in está activo.
   * Usa la URL descubierta por `ensureBaseUrl()` (no hardcodea :8742).
   * Nunca lanza: si el backend no responde, se ignora silenciosamente.
   */
  async heartbeat(): Promise<void> {
    try {
      await post('/api/addin/heartbeat', {})
    } catch {
      /* best-effort: el heartbeat no debe romper el add-in */
    }
  },

  /**
   * Zonas del documento (portada vs cuerpo) según el MODELO DEL PROGRAMA BASE
   * (pre_classifier del core). Fuente única de verdad: el add-in NO detecta
   * portada por su cuenta. Offline → lanza (el que llama decide abortar).
   */
  documentZones: (paragraphs: string[]) =>
    post<{ cover_detected: boolean; body_start_idx: number; is_cover: boolean[]; cover_texts: string[] }>(
      `/api/addin/document-zones`,
      { paragraphs },
    ),

  scopedApplyLive: (ooxml_base64: string, scopes: string[]) =>
    post<{ docx_base64: string; pdf_base64?: string; summary: Record<string, unknown> }>(
      `/api/addin/scoped-apply-live`,
      { ooxml_base64, scopes },
    ),

  analyzeSelection: (text: string, context?: string) =>
    post<AnalysisResult>(`/api/addin/analyze-selection`, { text, context }),

  suggestCaption: (type: 'figure' | 'table', context_text: string) =>
    post<CaptionSuggestion>(`/api/addin/suggest-caption`, { type, context_text }),

  validateFragment: (text: string, element_type?: string) =>
    post<ValidationResult>(`/api/addin/validate-fragment`, { text, element_type }),

  /**
   * Auditoría APA 7 del documento completo (texto plano con saltos de párrafo).
   * Devuelve hallazgos estructurados + estadísticas.
   */
  auditDocument: (text: string) =>
    post<AuditDocumentResult>(`/api/addin/audit-document`, { text }),

  nextFigureNumber: (document_text: string) =>
    post<NextNumberResult>(`/api/addin/next-figure-number`, { document_text }),

  nextTableNumber: (document_text: string) =>
    post<NextNumberResult>(`/api/addin/next-table-number`, { document_text }),

  // -- Asistente en Vivo ------------------------------------------------------

  /**
   * Detecta citas APA 7 en el documento y las guarda en el store local.
   * El backend espera el campo `text` (no `document_text`).
   */
  extractCitations: (document_text: string) =>
    post<ExtractCitationsResult>(`/api/addin/extract-citations`, { text: document_text }),

  /** Lista las referencias guardadas (store local). */
  references: () => get<BibliographyResult>(`/api/addin/references`),

  /** Alias de references() — usado por algunos componentes. */
  listReferences: () => get<BibliographyResult>(`/api/addin/references`),

  /** Crea o actualiza una referencia. */
  saveReference: (ref: SaveReferenceInput) =>
    post<{ status: string; reference: ReferenceItem }>(`/api/addin/save-reference`, ref),

  /** Elimina una referencia. */
  deleteReference: (id: string) =>
    del<{ status: string }>(`/api/addin/reference/${id}`),

  /** Vacía el store de referencias. */
  clearReferences: () => del<{ status: string }>(`/api/addin/clear-references`),

  /**
   * Construye la bibliografía APA 7 (texto + resumen).
   *
   * Si se pasa `document_text`, el backend re-extrae las citas del texto antes
   * de armar la bibliografía (mantiene el store al día). Si no se pasa,
   * arma la bibliografía con lo que ya hay en el store.
   *
   * Devuelve forma plana: { bibliography_text, total, drafts, complete, references }.
   */
  buildBibliography: (document_text?: string) =>
    post<BibliographyResult>(`/api/addin/build-bibliography`, { document_text: document_text || null }),

  /**
   * Sugiere los campos de portada APA 7 a partir del documento.
   * Devuelve forma plana: { title, author, institution, course, date }.
   */
  suggestCover: (document_text: string) =>
    post<CoverSuggestion>(`/api/addin/suggest-cover`, { document_text }),

  /**
   * Sugiere niveles de heading APA 7 por estructura del texto.
   * Devuelve forma plana: { suggestions, total }.
   */
  detectHeadings: (paragraphs: string[]) =>
    post<DetectHeadingsResult>(`/api/addin/detect-headings`, { paragraphs }),

  // -- Detección de IA --------------------------------------------------------
  //
  // Estos endpoints analizan el texto en busca de patrones típicos de
  // contenido generado por IA (muletillas, estructura repetitiva,
  // transiciones artificiales, etc.) y devuelven un score de riesgo.

  /** POST /api/addin/analyze-ai → analiza un fragmento de texto. */
  analyzeAI: (text: string) =>
    post<AIAnalysisResult>(`/api/addin/analyze-ai`, { text }),

  /** POST /api/addin/analyze-ai-document → analiza un documento por párrafos. */
  analyzeAIDocument: (paragraphs: string[]) =>
    post<AIDocumentResult>(`/api/addin/analyze-ai-document`, { paragraphs }),

  /** POST /api/addin/ai-rewrite → reescribe texto para humanizarlo. */
  aiRewrite: (text: string) =>
    post<AIRewriteResult>(`/api/addin/ai-rewrite`, { text }),

  /** GET /api/addin/ai-health → estado de los proveedores de IA. */
  aiHealth: () =>
    get<AIHealthResult>(`/api/addin/ai-health`),

  /** GET /api/addin/ai-providers → chips de proveedores según env del backend. */
  aiProviders: () =>
    get<AIProvidersResult>(`/api/addin/ai-providers`),

  /** POST /api/addin/ai-analyze-table → analiza los datos de una tabla. */
  analyzeAITable: (headers: string[], rows: string[][]) =>
    post<AIAnalysisResult>(`/api/addin/ai-analyze-table`, { headers, rows }),

  // -- Bibliografía y Crossref Ghostwriter ------------------------------------

  /** POST /api/resolve-doi → resuelve un DOI via Crossref. */
  resolveDoi: (doi: string) =>
    post<{ doi: string; formatted: string | null; error?: string }>(`/api/resolve-doi`, { doi }),

  /** POST /api/resolve-ghost-citation → busca candidatos en Crossref por autor y año. */
  searchGhostCitation: (authors: string[], year: string) =>
    post<{ found: boolean; candidates: Array<{ doi?: string; title?: string; authors?: string[]; year?: string; formatted_apa?: string; journal?: string }>; total_results: number }>(
      `/api/resolve-ghost-citation`,
      { authors, year },
    ),
}

