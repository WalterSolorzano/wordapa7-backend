import React, { useState, useEffect, useCallback } from 'react'
import type { AssistantOptions } from '../liveAssistant'
import type { DocumentStats } from '../office/wordHelper'
import type { AuditDocumentResult, AuditFinding } from '../api/backend'
import { backend } from '../api/backend'
import {
  autoFormatAllTablesAPA,
  autoCaptionAllFiguresAPA,
  highlightAndJumpToParagraph,
} from '../office/proactiveEngine'
import {
  normalizeEntireDocumentAPA7,
  type NormalizationReport,
} from '../office/masterNormalizer'
import {
  applyHighlights,
  clearAllHighlights,
} from '../office/highlighter'
import { insertBibliographyAPA, insertReferenceAtCursor, getDocumentText, getSelectedText } from '../office/wordHelper'
import { SelectionCriticCard } from './SelectionCriticCard'
import {
  ZapIcon,
  SearchIcon,
  EyeIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  TableIcon,
  ImageIcon,
  BookOpenIcon,
  DocumentTextIcon,
  SparklesIcon,
} from './Icons'

interface LiveAssistantPanelProps {
  running: boolean
  options: AssistantOptions
  stats: DocumentStats | null
  citationsCount: number
  onToggle: () => void
  onOptionChange: (key: keyof AssistantOptions, value: boolean | number) => void
  onScanNow: () => void
  onFormatAll: () => void
  auditStatus: 'idle' | 'running' | 'done'
  auditResult: AuditDocumentResult | null
  auditNotice: string | null
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

/** Las cuatro preferencias, en el orden de `DEFAULT_OPTIONS`, con el texto que
 *  dice lo que hacen. La lista vive acá y no en el JSX para que la prueba pueda
 *  mirarla: una constante de render es indistinguishable de un `<div>` cuando
 *  alguien agrega una quinta opción y se olvida de dibujarla. */
export const OPCIONES_VISIBLES: ReadonlyArray<{
  clave: keyof AssistantOptions
  titulo: string
  detalle: string
}> = [
  {
    clave: 'autoFormat',
    titulo: 'Formatear el párrafo',
    detalle: 'Times New Roman 12, interlineado doble y sangría mientras escribís.',
  },
  {
    clave: 'autoCaption',
    titulo: 'Rotular figuras y tablas',
    detalle: 'Inserta "Figura N" o "Tabla N" con su nota APA 7 al pegar una.',
  },
  {
    clave: 'autoExtractCitations',
    titulo: 'Guardar las citas',
    detalle: 'Detecta (Autor, Año) y las manda a la bibliografía.',
  },
  {
    clave: 'autoDetectAI',
    titulo: 'Avisar de texto generado',
    detalle: 'Analiza en busca de patrones de IA. Apagado por omisión porque es lo más pesado.',
  },
]

export const LiveAssistantPanel: React.FC<LiveAssistantPanelProps> = ({
  running,
  options,
  stats,
  citationsCount,
  onToggle,
  onOptionChange,
  onScanNow,
  onFormatAll,
  auditStatus,
  auditResult,
  auditNotice,
  showToast,
}) => {
  const [working, setWorking] = useState<string | null>(null)
  const [progressMsg, setProgressMsg] = useState<string>('')
  const [progressPct, setProgressPct] = useState<number>(0)
  const [lastReport, setLastReport] = useState<NormalizationReport | null>(null)
  const [highlightedInWord, setHighlightedInWord] = useState(false)
  const [bibWorking, setBibWorking] = useState(false)
  const [doiQuery, setDoiQuery] = useState('')
  const [doiLoading, setDoiLoading] = useState(false)
  const [resolvedRef, setResolvedRef] = useState<string | null>(null)

  // 1-CLIC MASTER: Normaliza todo el documento en vivo en Word
  const handleMasterNormalize = async () => {
    setWorking('master')
    setProgressPct(10)
    setProgressMsg('Limpiando espacios y mapeando documento...')
    try {
      const report = await normalizeEntireDocumentAPA7((step, pct) => {
        setProgressMsg(step)
        setProgressPct(pct)
      })
      setLastReport(report)
      if ((report as any).fallbackUsed) {
        showToast('Motor central no disponible: se aplicó formato APA 7 local limitado.', 'info')
      } else {
        showToast('Documento normalizado a APA 7 con éxito', 'success')
      }
    } catch (err: any) {
      showToast(err.message || 'Error al normalizar documento en Word', 'error')
    } finally {
      setWorking(null)
      setTimeout(() => {
        setProgressPct(0)
        setProgressMsg('')
      }, 4000)
    }
  }

  // TABLAS APA 7 PROACTIVAS
  const handleFormatTables = async () => {
    setWorking('tables')
    try {
      const res = await autoFormatAllTablesAPA()
      showToast(`${res.count} tabla(s) formateadas a APA 7`, 'success')
    } catch (err: any) {
      showToast(err.message || 'Error al formatear tablas', 'error')
    } finally {
      setWorking(null)
    }
  }

  // FIGURAS APA 7 PROACTIVAS
  const handleCaptionFigures = async () => {
    setWorking('figures')
    try {
      const res = await autoCaptionAllFiguresAPA()
      showToast(`${res.count} figura(s) rotuladas a APA 7`, 'success')
    } catch (err: any) {
      showToast(err.message || 'Error al rotular figuras', 'error')
    } finally {
      setWorking(null)
    }
  }

  // SEÑALAR FALLOS EN WORD EN VIVO
  const handleHighlightInWord = async () => {
    setWorking('highlight')
    try {
      let findingsToHighlight: AuditFinding[] = auditResult?.findings || []
      if (findingsToHighlight.length === 0) {
        const text = await getDocumentText()
        if (text.trim()) {
          const res = await backend.auditDocument(text)
          findingsToHighlight = res.findings || []
        }
      }
      if (findingsToHighlight.length === 0) {
        showToast('Documento 100% conforme a APA 7: sin errores detectados', 'success')
        return
      }
      const count = await applyHighlights(findingsToHighlight)
      setHighlightedInWord(true)
      showToast(`${count} fragmento(s) señalados con resaltado en Word`, 'success')
    } catch (err: any) {
      showToast(err.message || 'Error al resaltar en Word', 'error')
    } finally {
      setWorking(null)
    }
  }

  // LIMPIAR TODAS LAS MARCAS DE RESALTADO
  const handleClearHighlights = async () => {
    setWorking('clear_highlight')
    try {
      await clearAllHighlights()
      setHighlightedInWord(false)
      showToast('Todas las marcas de resaltado retiradas de Word', 'success')
    } catch (err: any) {
      showToast(err.message || 'Error al limpiar resaltados', 'error')
    } finally {
      setWorking(null)
    }
  }

  // INSERTAR BIBLIOGRAFÍA EN 1-CLIC
  const handleInsertBibliography = async () => {
    setBibWorking(true)
    try {
      const text = await getDocumentText()
      const bibRes = await backend.buildBibliography(text)
      if (!bibRes.bibliography_text || !bibRes.bibliography_text.trim()) {
        showToast('No se detectaron citas en el texto para generar bibliografía', 'info')
        return
      }
      await insertBibliographyAPA(bibRes.bibliography_text)
      showToast(`Bibliografía APA 7 insertada al final (${bibRes.total} referencias)`, 'success')
    } catch (err: any) {
      showToast(err.message || 'Error al generar bibliografía', 'error')
    } finally {
      setBibWorking(false)
    }
  }

  // GHOSTWRITER DOI / CROSSREF
  const handleLookupDoi = async () => {
    const q = doiQuery.trim()
    if (!q) return
    setDoiLoading(true)
    setResolvedRef(null)
    try {
      if (q.startsWith('10.') || q.includes('doi.org/')) {
        const cleanDoi = q.replace(/^https?:\/\/doi\.org\//i, '').trim()
        const res = await backend.resolveDoi(cleanDoi)
        if (res.formatted) {
          setResolvedRef(res.formatted)
          showToast('Referencia resuelta desde Crossref', 'success')
        } else {
          showToast(res.error || 'No se pudo resolver el DOI', 'error')
        }
      } else {
        const parts = q.split(/[\s,]+/)
        const yearMatch = q.match(/\b(19|20)\d{2}\b/)
        const year = yearMatch ? yearMatch[0] : ''
        const author = parts[0] || q
        const res = await backend.searchGhostCitation([author], year)
        if (res.candidates && res.candidates.length > 0 && res.candidates[0].formatted_apa) {
          setResolvedRef(res.candidates[0].formatted_apa)
          showToast('Referencia encontrada en Crossref', 'success')
        } else {
          showToast('No se encontraron candidatos para la búsqueda', 'info')
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Error al consultar Crossref', 'error')
    } finally {
      setDoiLoading(false)
    }
  }

  const handleInsertResolvedRef = async () => {
    if (!resolvedRef) return
    try {
      await insertReferenceAtCursor(resolvedRef)
      showToast('Referencia insertada con sangría francesa', 'success')
      setResolvedRef(null)
      setDoiQuery('')
    } catch (err: any) {
      showToast(err.message || 'Error al insertar referencia', 'error')
    }
  }

  const handleJumpToFinding = async (finding: AuditFinding) => {
    try {
      const snippet = (finding.where?.excerpt || finding.message || '').slice(0, 40)
      const found = await highlightAndJumpToParagraph(finding.where?.paragraph_index, snippet)
      if (found) {
        showToast('Párrafo ubicado en Word', 'info')
      }
    } catch {
      /* ignore */
    }
  }

  const findings = auditResult?.findings || []
  const errorCount = findings.filter((f) => f.severity === 'error').length
  const warnCount = findings.filter((f) => f.severity === 'warn').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ── SECCIÓN 1: CENTRO DE ACCIÓN PROACTIVA 1-CLIC ── */}
      <div className="card card--hero">
        <div className="card__header">
          <div className="card__title">
            <ZapIcon size={16} color="var(--accent-primary)" />
            <span>Asistente APA 7 en Vivo</span>
          </div>
          <button
            type="button"
            className={`btn-sm ${running ? 'btn-success' : 'btn-secondary'}`}
            onClick={onToggle}
            title={running ? 'Pausar asistente' : 'Activar asistente'}
          >
            {running ? 'Activo' : 'Pausado'}
          </button>
        </div>

        <p className="card__subtitle">
          Formato APA 7 en vivo. Tu portada queda intacta, siempre.
        </p>

        {/* BARRA DE PROGRESO DE NORMALIZACIÓN */}
        {working === 'master' && (
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'var(--accent-primary)' }}>
              <span>{progressMsg}</span>
              <span>{progressPct}%</span>
            </div>
            <div style={{ height: 6, width: '100%', background: 'var(--border-subtle, #e2e8f0)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progressPct}%`, background: 'var(--accent-primary)', transition: 'width 0.3s ease' }} />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleMasterNormalize}
            disabled={working !== null}
            style={{ fontSize: 13, padding: '11px 16px' }}
          >
            <ZapIcon size={15} color="#ffffff" />
            <span>{working === 'master' ? 'Normalizando en Word...' : 'Normalizar Todo a APA 7 en Vivo'}</span>
          </button>

          {/* ACCIONES PROACTIVAS ESPECÍFICAS (TABLAS Y FIGURAS) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleFormatTables}
              disabled={working !== null}
              title="Aplica bordes horizontales APA 7 y encabezados a todas las tablas"
            >
              <TableIcon size={13} />
              <span>Tablas APA 7</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleCaptionFigures}
              disabled={working !== null}
              title="Auto-numera y etiqueta figuras con rótulos APA 7"
            >
              <ImageIcon size={13} />
              <span>Figuras APA 7</span>
            </button>
          </div>

          {/* FORMATEAR (MODO LOCAL): aplica APA 7 local sin el motor central */}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onFormatAll}
            disabled={working !== null}
            title="Aplica formato APA 7 básico localmente (Times New Roman, interlineado, sangría) sin el motor central"
          >
            <DocumentTextIcon size={13} />
            <span>Formatear (modo local)</span>
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleHighlightInWord}
              disabled={working !== null}
            >
              <EyeIcon size={13} />
              <span>Señalar en Word</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleClearHighlights}
              disabled={working !== null}
            >
              <CheckCircleIcon size={13} />
              <span>Limpiar Marcas</span>
            </button>
          </div>
        </div>

        {/* REPORTE COMPACTO DEL ÚLTIMO PROCESO (chips, no párrafos) */}
        {lastReport && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--accent-success, #16a34a)' }}>
              <CheckCircleIcon size={13} color="var(--accent-success, #16a34a)" />
              <span>Normalización completada</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {[
                lastReport.coverDetected
                  ? `Portada intacta (${lastReport.coverParagraphsProtected})`
                  : 'Sin portada',
                lastReport.tocProtected ? 'Índice protegido' : 'Sin índice',
                `${lastReport.headingsCount} títulos`,
                `${lastReport.listsCount} listas`,
                `${lastReport.tablesCount} tablas`,
                `${lastReport.referencesCount} refs`,
              ].map((chip) => (
                <div
                  key={chip}
                  style={{
                    fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)',
                    background: 'var(--surface-subtle, #f8fafc)', border: '1px solid var(--border-subtle, #e2e8f0)',
                    borderRadius: 5, padding: '3px 7px', textAlign: 'center',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                >
                  {chip}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── SECCIÓN 1b: QUÉ HACE EL ASISTENTE MIENTRAS ESCRIBÍS ────────────── */}
      {/* Las cuatro opciones viven en `AssistantOptions`, se guardan en
          `roamingSettings` de Office y el motor las lee de verdad. Antes el
          panel NO las dibujaba: `onOptionChange` aparecía en la declaración de
          props y en la destructuración, y nada más. Cuatro preferencias
          persistidas entre sesiones que nadie puede cambiar son deuda con
          guarda, no una función —y una preferencia que no se puede cambiar
          tampoco se puede apagar, que es lo que la gente necesita cuando algo
          le molesta.

          El orden es el de `DEFAULT_OPTIONS`, y el texto dice lo que la opción
          hace, no su nombre de campo: "autoFormat" no le dice a nadie nada. */}
      <div className="card">
        <div className="card__header">
          <div className="card__title">
            <SparklesIcon size={16} color="var(--accent-primary)" />
            <span>Qué hace el asistente mientras escribís</span>
          </div>
        </div>

        <p className="card__subtitle">
          Se guardan con tu cuenta de Office, así que el complemento se acuerda
          de ellas la próxima vez que lo abras.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {OPCIONES_VISIBLES.map(({ clave, titulo, detalle }) => (
            <label
              key={clave}
              htmlFor={`opcion-${clave}`}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                cursor: 'pointer',
                fontSize: 12,
                color: 'var(--text-secondary)',
              }}
            >
              <input
                id={`opcion-${clave}`}
                type="checkbox"
                checked={Boolean(options[clave])}
                onChange={(e) => onOptionChange(clave, e.target.checked)}
                style={{ marginTop: 2, cursor: 'pointer' }}
              />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{titulo}</span>
                <span>{detalle}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* ── SECCIÓN 2: CRÍTICO Y APOYO EN VIVO (AL CURSOR EN WORD) ── */}
      <SelectionCriticCard showToast={showToast} />

      {/* ── SECCIÓN 3: BIBLIOGRAFÍA Y GHOSTWRITER DOI ── */}
      <div className="card">
        <div className="card__header">
          <div className="card__title">
            <BookOpenIcon size={16} color="var(--accent-primary)" />
            <span>Bibliografía y Ghostwriter DOI</span>
          </div>
        </div>

        <p className="card__subtitle">
          Citas (Autor, Año) → referencias alfabéticas con sangría francesa.
        </p>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleInsertBibliography}
          disabled={bibWorking}
        >
          <BookOpenIcon size={14} />
          <span>{bibWorking ? 'Generando bibliografía...' : 'Insertar Referencias APA 7 al Final'}</span>
        </button>

        {/* Búsqueda rápida DOI / Crossref */}
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Resolver DOI o Cita Fantasma (Crossref):
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              placeholder="10.1037/... o Autor, Año"
              value={doiQuery}
              onChange={(e) => setDoiQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLookupDoi()}
              style={{
                flex: 1,
                fontSize: 12,
                padding: '6px 8px',
                border: '1px solid var(--border-subtle, #cbd5e1)',
                borderRadius: 4,
                outline: 'none',
              }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleLookupDoi}
              disabled={doiLoading || !doiQuery.trim()}
              style={{ padding: '6px 10px', fontSize: 12 }}
            >
              {doiLoading ? 'Buscando...' : 'Resolver'}
            </button>
          </div>

          {resolvedRef && (
            <div
              style={{
                marginTop: 4,
                padding: 8,
                background: 'var(--surface-subtle, #f8fafc)',
                border: '1px solid var(--border-subtle, #cbd5e1)',
                borderRadius: 5,
                fontSize: 11.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ color: 'var(--text-main, #1e293b)', fontStyle: 'italic', lineHeight: 1.4 }}>
                {resolvedRef}
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleInsertResolvedRef}
                style={{ alignSelf: 'flex-start', fontSize: 11 }}
              >
                Insertar en Cursor (Sangría Francesa)
              </button>
            </div>
          )}
        </div>
      </div>


      {/* ── SECCIÓN 4: HALLAZGOS Y SEÑALIZACIÓN EN EL DOCUMENTO ── */}
      {findings.length > 0 && (
        <div className="card">
          <div className="card__header">
            <div className="card__title">
              <span>Hallazgos Señalados ({findings.length})</span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {errorCount} errores · {warnCount} avisos
            </span>
          </div>

          <div className="finding-list">
            {findings.slice(0, 6).map((f, idx) => (
              <div
                key={f.id || idx}
                className={`finding-item finding-item--${f.severity === 'error' ? 'error' : f.severity === 'warn' ? 'warn' : 'info'}`}
              >
                <div className="finding-item__header">
                  <span className="finding-item__msg">{f.message}</span>
                  <span className={`finding-item__badge finding-item__badge--${f.severity}`}>
                    {f.severity}
                  </span>
                </div>

                {f.fix && (
                  <div className="finding-item__fix" style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                    <span style={{ fontWeight: 600 }}>Sugerencia:</span>
                    <span>{f.fix}</span>
                  </div>
                )}

                <div className="finding-item__actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleJumpToFinding(f)}
                  >
                    <EyeIcon size={12} />
                    <span>Ver en Word</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
