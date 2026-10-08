import React, { useState, useCallback, useEffect } from 'react'
import {
  backend,
  type AIProvidersResult,
  type AIAnalysisResult,
  type AIDocumentResult,
  type AIRewriteResult,
} from '../api/backend'
import { getSelectedText, getDocumentText } from '../office/wordHelper'
import { highlightAndJumpToParagraph } from '../office/proactiveEngine'
import { SparklesIcon, SearchIcon, EyeIcon, CheckCircleIcon, AlertCircleIcon } from './Icons'

interface Props {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export const AIPanel: React.FC<Props> = ({ showToast }) => {
  const [analyzingDoc, setAnalyzingDoc] = useState(false)
  const [analyzingSel, setAnalyzingSel] = useState(false)
  const [rewriting, setRewriting] = useState(false)
  const [docResult, setDocResult] = useState<AIDocumentResult | null>(null)
  const [selResult, setSelResult] = useState<AIAnalysisResult | null>(null)
  const [rewriteResult, setRewriteResult] = useState<AIRewriteResult | null>(null)
  const [providers, setProviders] = useState<AIProvidersResult | null>(null)

  useEffect(() => {
    backend.aiProviders().then(setProviders).catch(() => {})
  }, [])

  const scanDocument = useCallback(async () => {
    setAnalyzingDoc(true)
    setDocResult(null)
    try {
      const text = await getDocumentText()
      if (!text.trim()) {
        showToast('El documento de Word está vacío', 'error')
        return
      }
      const paragraphs = text.split(/\r?\n+/).map((p) => p.trim()).filter((p) => p.length > 20)
      const res = await backend.analyzeAIDocument(paragraphs)
      setDocResult(res)
      showToast('Escaneo de patrones de IA completado', 'success')
    } catch {
      showToast('No se pudo conectar con el servicio de IA local', 'error')
    } finally {
      setAnalyzingDoc(false)
    }
  }, [showToast])

  const analyzeSelection = useCallback(async () => {
    setAnalyzingSel(true)
    setSelResult(null)
    try {
      const text = await getSelectedText()
      if (!text.trim()) {
        showToast('Selecciona un párrafo en Word para analizarlo', 'info')
        return
      }
      const res = await backend.analyzeAI(text)
      setSelResult(res)
      showToast('Párrafo analizado con éxito', 'success')
    } catch {
      showToast('No se pudo analizar la selección', 'error')
    } finally {
      setAnalyzingSel(false)
    }
  }, [showToast])

  const rewriteSelectionInWord = useCallback(async () => {
    setRewriting(true)
    try {
      const text = await getSelectedText()
      if (!text.trim()) {
        showToast('Selecciona el párrafo en Word que deseas humanizar', 'info')
        return
      }
      const res = await backend.aiRewrite(text)
      setRewriteResult(res)
      if (res.rewritten) {
        await Word.run(async (context) => {
          const range = context.document.getSelection()
          range.insertText(res.rewritten, Word.InsertLocation.replace)
          await context.sync()
        })
        showToast('Texto humanizado y reemplazado en Word', 'success')
      }
    } catch (err: any) {
      showToast(err.message || 'Error al reescribir en Word', 'error')
    } finally {
      setRewriting(false)
    }
  }, [showToast])

  const handleJumpToFinding = async (textSnippet: string, index?: number) => {
    try {
      const found = await highlightAndJumpToParagraph(index, textSnippet)
      if (found) {
        showToast('Párrafo ubicado en Word', 'info')
      }
    } catch {
      /* ignore */
    }
  }

  const riskyParagraphs = docResult
    ? docResult.results
        .map((r, i) => ({ ...r, index: i }))
        .filter((r) => r.category.toUpperCase() === 'HIGH' || r.category.toUpperCase() === 'MEDIUM')
        .sort((a, b) => b.score - a.score)
    : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* HEADER CARD */}
      <div className="card">
        <div className="card__header">
          <div className="card__title">
            <SparklesIcon size={16} color="var(--accent-primary)" />
            <span>Auditor de IA y Humanizador</span>
          </div>
        </div>
        <p className="card__subtitle">
          Detecta muletillas de ChatGPT/Claude (conectores repetitivos, clichés) y reescribe párrafos con tono académico formal directamente en Word.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={scanDocument}
            disabled={analyzingDoc}
          >
            <SearchIcon size={14} color="#ffffff" />
            <span>{analyzingDoc ? 'Escaneando patrones de IA...' : 'Escanear Todo el Documento'}</span>
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={analyzeSelection}
              disabled={analyzingSel}
            >
              <SearchIcon size={13} />
              <span>{analyzingSel ? 'Analizando...' : 'Analizar Selección'}</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={rewriteSelectionInWord}
              disabled={rewriting}
            >
              <SparklesIcon size={13} color="var(--accent-primary)" />
              <span>{rewriting ? 'Humanizando...' : 'Humanizar Selección'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* RESULTADOS DE LA SELECCIÓN */}
      {selResult && (
        <div className="card" style={{ borderLeft: '3px solid var(--accent-primary)' }}>
          <div className="card__header">
            <div className="card__title" style={{ fontSize: 12.5 }}>Diagnóstico de Selección</div>
            <span style={{ fontSize: 11, fontWeight: 700, color: selResult.score >= 0.5 ? 'var(--accent-danger)' : 'var(--accent-success)' }}>
              {Math.round(selResult.score * 100)}% probabilidad IA
            </span>
          </div>

          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
            {selResult.findings.length === 0 ? (
              <div style={{ color: 'var(--accent-success)', fontWeight: 600 }}>
                 No se detectaron patrones típicos de IA en el texto seleccionado.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {selResult.findings.map((f, i) => (
                  <div key={i} style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                    • {f.detail || f.pattern} {f.phrase ? `("${f.phrase}")` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* RESULTADOS DEL ESCANEO DEL DOCUMENTO */}
      {docResult && (
        <div className="card">
          <div className="card__header">
            <div className="card__title">Resumen de Detección</div>
            <span style={{ fontSize: 11, fontWeight: 700 }}>
              {Math.round(docResult.overall_score * 100)}% global
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            <div className="stat-chip">
              <div className="stat-chip__value" style={{ color: 'var(--accent-danger)' }}>{docResult.high_risk_count}</div>
              <div className="stat-chip__label">Alto Riesgo</div>
            </div>
            <div className="stat-chip">
              <div className="stat-chip__value" style={{ color: 'var(--accent-warning)' }}>{docResult.medium_risk_count}</div>
              <div className="stat-chip__label">Medio</div>
            </div>
            <div className="stat-chip">
              <div className="stat-chip__value" style={{ color: 'var(--accent-success)' }}>{docResult.low_risk_count}</div>
              <div className="stat-chip__label">Bajo</div>
            </div>
          </div>

          {riskyParagraphs.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>Párrafos a Revisar:</div>
              {riskyParagraphs.slice(0, 6).map((p, idx) => (
                <div
                  key={idx}
                  className={`finding-item finding-item--${p.category.toUpperCase() === 'HIGH' ? 'error' : 'warn'}`}
                >
                  <div className="finding-item__header">
                    <span className="finding-item__msg">
                      {p.category.toUpperCase() === 'HIGH' ? 'Alto Patrón de IA' : 'Patrón Moderado'}
                    </span>
                    <span className={`finding-item__badge finding-item__badge--${p.category.toUpperCase() === 'HIGH' ? 'error' : 'warn'}`}>
                      {Math.round(p.score * 100)}%
                    </span>
                  </div>

                  {p.findings.length > 0 && (
                    <div className="finding-item__fix">
                      {p.findings.map((f) => f.detail || f.pattern).join(' · ')}
                    </div>
                  )}

                  <div className="finding-item__actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleJumpToFinding(p.matches[0] || '', p.index)}
                    >
                      <EyeIcon size={12} />
                      <span>Ver en Word</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
