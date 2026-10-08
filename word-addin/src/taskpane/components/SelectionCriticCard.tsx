import React, { useState, useEffect, useCallback } from 'react'
import {
  subscribeSelectionChanges,
  getSelectedText,
  applyAPA7ToSelection,
  applyHeadingStyle,
  applyBlockQuoteStyle,
  getNextFigureNumber,
  getNextTableNumber,
  insertCaptionAndNoteAtCursor,
} from '../office/wordHelper'
import { backend, type CaptionSuggestion } from '../api/backend'
import {
  ZapIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  DocumentTextIcon,
  TableIcon,
  ImageIcon,
  QuoteIcon,
  SparklesIcon,
} from './Icons'

interface SelectionAnalysis {
  text: string
  wordCount: number
  category: 'heading_numbered' | 'heading_h1' | 'heading_h2' | 'heading_h3' | 'toc_line' | 'citation' | 'block_quote' | 'caption_table' | 'caption_figure' | 'body_paragraph' | 'empty'
  label: string
  critique: string
  suggestedAction: string
  actionType: 'h1' | 'h2' | 'h3' | 'body' | 'block_quote' | 'citation' | 'caption_table' | 'caption_figure' | 'none'
}

interface Props {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export const SelectionCriticCard: React.FC<Props> = ({ showToast }) => {
  const [analysis, setAnalysis] = useState<SelectionAnalysis | null>(null)
  const [inspecting, setInspecting] = useState(false)
  const [applying, setApplying] = useState(false)
  const [captionLoading, setCaptionLoading] = useState(false)
  const [captionResult, setCaptionResult] = useState<{
    type: 'figure' | 'table'
    number: number
    caption: string
    note: string
  } | null>(null)

  const inspectSelection = useCallback(async () => {
    try {
      setInspecting(true)
      const text = await getSelectedText()
      const trimmed = text.trim()

      if (!trimmed) {
        setAnalysis({
          text: '',
          wordCount: 0,
          category: 'empty',
          label: 'Sin selección activa',
          critique: 'Haz clic o selecciona un párrafo, tabla o figura en tu documento de Word para recibir diagnóstico y formato APA 7 en tiempo real.',
          suggestedAction: '',
          actionType: 'none',
        })
        return
      }

      const words = trimmed.split(/\s+/).length

      // 1. Línea de Índice / TOC
      if (/(?:\.{2,}|_{2,}|\t|\s{4,})\s*\d+\s*$/.test(trimmed)) {
        setAnalysis({
          text: trimmed,
          wordCount: words,
          category: 'toc_line',
          label: 'Línea de Índice / Contenido',
          critique: 'Línea con puntos guía y número de página. Se debe mantener sin sangría de primera línea para no desalinear los números.',
          suggestedAction: 'Mantener formato alineado a la izquierda sin sangría.',
          actionType: 'none',
        })
        return
      }

      // 2. Rótulo de Tabla (Tabla N o mención de tabla)
      if (/^(?:tabla\s+\d+|table\s+\d+)/i.test(trimmed)) {
        setAnalysis({
          text: trimmed,
          wordCount: words,
          category: 'caption_table',
          label: 'Rótulo de Tabla APA 7',
          critique: 'En APA 7 §7.9-§7.14 el rótulo "Tabla N" va en negrita (izq.), su título abajo en cursiva y al pie la nota "Nota. ..." describiendo abreviaturas o fuente.',
          suggestedAction: 'Generar Leyenda y Nota APA 7 para Tabla',
          actionType: 'caption_table',
        })
        return
      }

      // 3. Rótulo de Figura (Figura N o mención de gráfico/imagen)
      if (/^(?:figura\s+\d+|figure\s+\d+|imagen\s+\d+|gr[aá]fico\s+\d+)/i.test(trimmed)) {
        setAnalysis({
          text: trimmed,
          wordCount: words,
          category: 'caption_figure',
          label: 'Rótulo de Figura APA 7',
          critique: 'En APA 7 §7.22-§7.28 "Figura N" va en negrita arriba de la imagen, el título descriptivo en cursiva y abajo la nota "Nota. Elaboración propia / Adaptado de...".',
          suggestedAction: 'Generar Leyenda y Nota APA 7 para Figura',
          actionType: 'caption_figure',
        })
        return
      }

      // 4. Título con numeración manual (1.1., 1.2., 2.1., etc.)
      if (/^\d+\.\d+\.?[\s\t]+[a-zÁÉÍÓÚÑ]/i.test(trimmed) && trimmed.length < 100) {
        setAnalysis({
          text: trimmed,
          wordCount: words,
          category: 'heading_numbered',
          label: 'Título con Numeración Decimal (Nivel 2)',
          critique: 'En APA 7 los títulos de Nivel 2 van alineados a la izquierda en negrita, sin sangría de párrafo.',
          suggestedAction: 'Formatear como Título Nivel 2 APA 7 (Izquierda, Negrita)',
          actionType: 'h2',
        })
        return
      }

      // 5. Título Romano o Principal (I., II., Introducción, etc.)
      if (/^(?:cap[ií]tulo\s+[ivxlcdm\d]+|[ivxlcdm]+\.[\s\t]+[a-zÁÉÍÓÚÑ]|introducci[oó]n|m[eé]todo|metodolog[ií]a|resultados|discusi[oó]n|conclusiones|referencias)/i.test(trimmed) && trimmed.length < 80) {
        setAnalysis({
          text: trimmed,
          wordCount: words,
          category: 'heading_h1',
          label: 'Título Principal (Nivel 1)',
          critique: 'En APA 7 los títulos principales de sección van centrados en negrita y sin sangría.',
          suggestedAction: 'Formatear como Título Nivel 1 APA 7 (Centrado, Negrita)',
          actionType: 'h1',
        })
        return
      }

      // 6. Subtítulo corto (Situación problemática, Objetivos, etc.)
      if (trimmed.length < 60 && !trimmed.endsWith('.') && !trimmed.includes(',') && words <= 7) {
        setAnalysis({
          text: trimmed,
          wordCount: words,
          category: 'heading_h3',
          label: 'Subtítulo / Encabezado (Nivel 3)',
          critique: 'Subtítulo detectado. En APA 7 los encabezados de Nivel 3 van alineados a la izquierda en negrita y cursiva.',
          suggestedAction: 'Formatear como Título Nivel 3 APA 7 (Negrita + Cursiva)',
          actionType: 'h3',
        })
        return
      }

      // 7. Cita textual extensa (>40 palabras)
      if (words >= 40 && (/["“«]/.test(trimmed) || trimmed.length > 220)) {
        setAnalysis({
          text: trimmed,
          wordCount: words,
          category: 'block_quote',
          label: 'Cita en Bloque (>40 palabras)',
          critique: 'Cita extensa detectada. Según APA 7 §8.25 debe presentarse en bloque independiente sin comillas y con sangría izquierda de 1.27 cm (0.5").',
          suggestedAction: 'Aplicar formato de Cita en Bloque APA 7 (Sangría 1.27 cm)',
          actionType: 'block_quote',
        })
        return
      }

      // 8. Cita parentética en el texto
      if (/\([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+et al\.)?,\s*\d{4}\)/.test(trimmed)) {
        setAnalysis({
          text: trimmed,
          wordCount: words,
          category: 'citation',
          label: 'Cita Académica en Texto',
          critique: 'Cita en formato parentético (Autor, Año) detectada correctamente según norma APA 7.',
          suggestedAction: 'Asegurar que la fuente esté incluida en la sección de Referencias final.',
          actionType: 'citation',
        })
        return
      }

      // 9. Párrafo normal de cuerpo
      setAnalysis({
        text: trimmed,
        wordCount: words,
        category: 'body_paragraph',
        label: 'Párrafo de Cuerpo',
        critique: 'Párrafo estándar de cuerpo. Requiere Times New Roman 12pt, interlineado doble (2.0) y sangría de primera línea de 1.27 cm (0.5 pulgadas).',
        suggestedAction: 'Aplicar Formato APA 7 Estricto (Sangría 0.5" + Interlineado Doble)',
        actionType: 'body',
      })
    } catch {
      /* ignore */
    } finally {
      setInspecting(false)
    }
  }, [])


  useEffect(() => {
    inspectSelection()
    const unsubscribe = subscribeSelectionChanges(() => {
      inspectSelection()
    })
    return () => {
      unsubscribe()
    }
  }, [inspectSelection])

  const handleSuggestCaption = async (type: 'figure' | 'table') => {
    setCaptionLoading(true)
    setCaptionResult(null)
    try {
      const num = type === 'figure' ? await getNextFigureNumber() : await getNextTableNumber()
      const text = analysis?.text || ''
      const res = await backend.suggestCaption(type, text)
      setCaptionResult({
        type,
        number: num,
        caption: res.caption || `Descripción de la ${type === 'figure' ? 'figura' : 'tabla'}`,
        note: res.note || `Nota. Elaboración propia.`,
      })
      showToast(`Leyenda y nota APA 7 sugeridas para ${type === 'figure' ? 'Figura' : 'Tabla'} ${num}`, 'success')
    } catch (err: any) {
      showToast(err.message || 'Error al sugerir leyenda con IA', 'error')
    } finally {
      setCaptionLoading(false)
    }
  }

  const handleInsertCaptionResult = async () => {
    if (!captionResult) return
    try {
      await insertCaptionAndNoteAtCursor(
        captionResult.type,
        captionResult.number,
        captionResult.caption,
        captionResult.note,
      )
      showToast(`Rótulo, título y nota APA 7 insertados en Word`, 'success')
      setCaptionResult(null)
      setTimeout(inspectSelection, 300)
    } catch (err: any) {
      showToast(err.message || 'Error al insertar en Word', 'error')
    }
  }

  const handleApplyFix = async () => {
    if (!analysis || analysis.actionType === 'none') return
    if (analysis.actionType === 'caption_figure') {
      await handleSuggestCaption('figure')
      return
    }
    if (analysis.actionType === 'caption_table') {
      await handleSuggestCaption('table')
      return
    }

    setApplying(true)
    try {
      if (analysis.actionType === 'h1') {
        await applyHeadingStyle(1)
        showToast('Título Nivel 1 (Centrado, Negrita) aplicado', 'success')
      } else if (analysis.actionType === 'h2') {
        await applyHeadingStyle(2)
        showToast('Título Nivel 2 (Izquierda, Negrita) aplicado', 'success')
      } else if (analysis.actionType === 'h3') {
        await applyHeadingStyle(3)
        showToast('Título Nivel 3 (Izquierda, Negrita + Cursiva) aplicado', 'success')
      } else if (analysis.actionType === 'block_quote') {
        await applyBlockQuoteStyle()
        showToast('Cita en Bloque (sangría 1.27 cm) aplicada', 'success')
      } else if (analysis.actionType === 'body') {
        await applyAPA7ToSelection(true)
        showToast('Formato de cuerpo APA 7 (sangría 0.5") aplicado', 'success')
      }
      setTimeout(inspectSelection, 200)
    } catch (err: any) {
      showToast(err.message || 'Error al aplicar formato en Word', 'error')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="card" style={{ borderLeft: '3px solid var(--accent-primary)' }}>
      <div className="card__header">
        <div className="card__title" style={{ fontSize: 12.5 }}>
          <ZapIcon size={14} color="var(--accent-primary)" />
          <span>Crítico y Apoyo en Vivo</span>
        </div>
        <button
          type="button"
          className="btn-sm btn-secondary"
          onClick={inspectSelection}
          disabled={inspecting}
          title="Actualizar análisis de la selección"
        >
          {inspecting ? 'Analizando...' : 'Inspeccionar'}
        </button>
      </div>

      {analysis && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11.5 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>
              {analysis.label}
            </span>
            {analysis.wordCount > 0 && (
              <span style={{ color: 'var(--text-muted)', fontSize: 10.5 }}>
                {analysis.wordCount} palabras
              </span>
            )}
          </div>

          <div style={{ color: 'var(--text-secondary)', lineHeight: 1.35, background: 'var(--surface-subtle, #f8fafc)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-subtle, #e2e8f0)' }}>
            {analysis.critique}
          </div>

          {/* ACCIÓN PRINCIPAL SUGERIDA */}
          {analysis.suggestedAction && analysis.actionType !== 'none' && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleApplyFix}
              disabled={applying || captionLoading}
              style={{ marginTop: 2, padding: '7px 10px', fontSize: 11.5 }}
            >
              <ZapIcon size={12} color="#ffffff" />
              <span>{applying || captionLoading ? 'Procesando...' : analysis.suggestedAction}</span>
            </button>
          )}

          {/* BOTONES RÁPIDOS DE SUGERENCIA DE LEYENDAS Y NOTAS APA 7 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleSuggestCaption('table')}
              disabled={captionLoading}
              title="Sugerir título descriptivo en cursiva y nota para tabla"
              style={{ fontSize: 11, padding: '5px 8px' }}
            >
              <TableIcon size={12} />
              <span>+ Leyenda Tabla</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleSuggestCaption('figure')}
              disabled={captionLoading}
              title="Sugerir título descriptivo en cursiva y nota para figura"
              style={{ fontSize: 11, padding: '5px 8px' }}
            >
              <ImageIcon size={12} />
              <span>+ Leyenda Figura</span>
            </button>
          </div>

          {/* PREVIEW DE LA LEYENDA Y NOTA GENERADA CON IA */}
          {captionResult && (
            <div
              style={{
                marginTop: 6,
                padding: '8px 10px',
                background: 'var(--surface-subtle, #f8fafc)',
                border: '1px solid var(--accent-primary, #2563eb)',
                borderRadius: 6,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-primary)' }}>
                Propuesta de Leyenda APA 7:
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-main)' }}>
                {captionResult.type === 'figure' ? 'Figura' : 'Tabla'} {captionResult.number}
              </div>
              <input
                type="text"
                value={captionResult.caption}
                onChange={(e) => setCaptionResult({ ...captionResult, caption: e.target.value })}
                placeholder="Título descriptivo en cursiva"
                style={{
                  fontSize: 11.5,
                  fontStyle: 'italic',
                  padding: '4px 6px',
                  border: '1px solid var(--border-subtle, #cbd5e1)',
                  borderRadius: 4,
                  outline: 'none',
                }}
              />
              <textarea
                value={captionResult.note}
                onChange={(e) => setCaptionResult({ ...captionResult, note: e.target.value })}
                placeholder="Nota. Explicación de la fuente o datos"
                rows={2}
                style={{
                  fontSize: 10.5,
                  padding: '4px 6px',
                  border: '1px solid var(--border-subtle, #cbd5e1)',
                  borderRadius: 4,
                  outline: 'none',
                  resize: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleInsertCaptionResult}
                  style={{ flex: 1, fontSize: 11, padding: '6px 8px' }}
                >
                  <CheckCircleIcon size={12} color="#ffffff" />
                  <span>Insertar en Word</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setCaptionResult(null)}
                  style={{ fontSize: 11, padding: '6px 8px' }}
                >
                  Omitir
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

