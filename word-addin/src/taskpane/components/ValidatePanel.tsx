/**
 * WordAPA7 Add-in — Panel de Validación
 *
 * Permite al usuario:
 *   1. Analizar el texto seleccionado en busca de problemas APA 7
 *   2. Analizar todo el documento
 *   3. Aplicar formato APA 7 a la selección actual
 *   4. Formatear todo el documento a APA 7
 *
 * Usa el backend de Python para el análisis heurístico + IA.
 */

import React, { useState, useCallback } from 'react'
import { backend, type APAIssue } from '../api/backend'
import {
  getSelectedText,
  getDocumentText,
  applyAPA7ToSelection,
  formatDocumentAPA7,
} from '../office/wordHelper'

interface Props {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export function ValidatePanel({ showToast }: Props) {
  const [issues, setIssues] = useState<APAIssue[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [formatting, setFormatting] = useState(false)
  const [score, setScore] = useState<number | null>(null)

  const analyzeSelection = useCallback(async () => {
    setAnalyzing(true)
    try {
      const text = await getSelectedText()
      if (!text.trim()) {
        showToast('Seleccioná texto en el documento para analizar', 'error')
        return
      }
      const result = await backend.analyzeSelection(text)
      setIssues(result.issues || [])
      setScore(result.score)
      if (result.issues.length === 0) {
        showToast('No se encontraron problemas APA', 'success')
      } else {
        showToast(`${result.issues.length} problema(s) encontrado(s)`, 'info')
      }
    } catch (err: any) {
      showToast('No se pudo conectar con el backend. ¿Está WordAPA7 abierto?', 'error')
    } finally {
      setAnalyzing(false)
    }
  }, [showToast])

  const analyzeDocument = useCallback(async () => {
    setAnalyzing(true)
    try {
      const text = await getDocumentText()
      if (!text.trim()) {
        showToast('El documento está vacío', 'error')
        return
      }
      // Analizar en chunks (el backend tiene límite de tamaño)
      const chunkSize = 5000
      const chunks: string[] = []
      for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.slice(i, i + chunkSize))
      }

      const allIssues: APAIssue[] = []
      let totalScore = 0
      let scoreCount = 0

      for (const chunk of chunks) {
        try {
          const result = await backend.analyzeSelection(chunk)
          allIssues.push(...(result.issues || []))
          if (result.score !== undefined) {
            totalScore += result.score
            scoreCount++
          }
        } catch {
          // Continuar con el siguiente chunk si uno falla
        }
      }

      setIssues(allIssues)
      setScore(scoreCount > 0 ? Math.round(totalScore / scoreCount) : null)

      if (allIssues.length === 0) {
        showToast('Tu documento cumple con APA 7', 'success')
      } else {
        showToast(`${allIssues.length} problema(s) en el documento`, 'info')
      }
    } catch (err: any) {
      showToast('Error al analizar el documento', 'error')
    } finally {
      setAnalyzing(false)
    }
  }, [showToast])

  const formatSelection = useCallback(async () => {
    setFormatting(true)
    try {
      await applyAPA7ToSelection()
      showToast('Formato APA 7 aplicado a la selección', 'success')
    } catch (err: any) {
      showToast(err.message || 'Error al aplicar formato', 'error')
    } finally {
      setFormatting(false)
    }
  }, [showToast])

  const formatAll = useCallback(async () => {
    setFormatting(true)
    try {
      await formatDocumentAPA7()
      showToast('Todo el documento formateado a APA 7', 'success')
    } catch (err: any) {
      showToast(err.message || 'Error al formatear', 'error')
    } finally {
      setFormatting(false)
    }
  }, [showToast])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Score bar */}
      {score !== null && (
        <div className="card">
          <div style={{ padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span className="field-label" style={{ marginBottom: 0 }}>Cumplimiento APA 7</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: score >= 80 ? 'var(--color-success)' : score >= 50 ? 'var(--color-warning)' : 'var(--color-error)' }}>
                {score}%
              </span>
            </div>
            <div className="score-bar">
              <div
                className="score-bar__fill"
                style={{
                  width: `${score}%`,
                  background: score >= 80 ? 'var(--color-success)' : score >= 50 ? 'var(--color-warning)' : 'var(--color-error)',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Botones de acción */}
      <button
        className="btn btn--primary btn--full"
        onClick={analyzeSelection}
        disabled={analyzing}
      >
        {analyzing ? (
          <><span className="spinner" /> Analizando...</>
        ) : (
          <>Analizar selección</>
        )}
      </button>

      <button
        className="btn btn--secondary btn--full"
        onClick={analyzeDocument}
        disabled={analyzing}
      >
        {analyzing ? (
          <><span className="spinner" /> Analizando...</>
        ) : (
          <>Analizar todo el documento</>
        )}
      </button>

      <button
        className="btn btn--secondary btn--full"
        onClick={formatSelection}
        disabled={formatting}
      >
        {formatting ? (
          <><span className="spinner" /> Formateando...</>
        ) : (
          <>Aplicar APA 7 a la selección</>
        )}
      </button>

      <button
        className="btn btn--secondary btn--full"
        onClick={formatAll}
        disabled={formatting}
      >
        {formatting ? (
          <><span className="spinner" /> Formateando...</>
        ) : (
          <>Formatear todo a APA 7</>
        )}
      </button>

      {/* Lista de issues */}
      {issues.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="field-label">Problemas detectados</div>
          {issues.map((issue, i) => (
            <div key={i} className={`issue issue--${issue.severity}`}>
              <span
                className={`finding-card__dot ${
                  issue.severity === 'error'
                    ? 'finding-card__dot--error'
                    : issue.severity === 'warning'
                      ? 'finding-card__dot--warn'
                      : 'finding-card__dot--info'
                }`}
              />
              <div className="issue__text">
                {issue.message}
                {issue.suggestion && (
                  <div className="issue__suggestion">→ {issue.suggestion}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Estado vacío */}
      {issues.length === 0 && score === null && (
        <div className="step-chips step-chips--vertical" aria-label="Cómo validar APA 7">
          <span className="step-chips__chip"><b>1</b> Seleccioná texto en el documento</span>
          <span className="step-chips__chip"><b>2</b> Pulsá Analizar selección</span>
          <span className="step-chips__chip"><b>3</b> Aplicá formato APA 7</span>
        </div>
      )}
    </div>
  )
}
