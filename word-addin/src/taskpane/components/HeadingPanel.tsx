import React, { useState, useEffect, useCallback } from 'react'
import {
  getDocumentHeadings,
  applyHeadingStyle,
  navigateToParagraph,
  type HeadingItem,
} from '../office/wordHelper'
import { DocumentTextIcon, ZapIcon, EyeIcon, CheckCircleIcon } from './Icons'

interface Props {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export const HeadingPanel: React.FC<Props> = ({ showToast }) => {
  const [headings, setHeadings] = useState<HeadingItem[]>([])
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)

  const loadHeadings = useCallback(async () => {
    setLoading(true)
    try {
      const list = await getDocumentHeadings()
      setHeadings(list)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHeadings()
  }, [loadHeadings])

  const handleApplyToSelection = async (level: 1 | 2 | 3 | 4 | 5) => {
    try {
      await applyHeadingStyle(level)
      showToast(`Título formateado como Nivel ${level} APA 7`, 'success')
      loadHeadings()
    } catch (err: any) {
      showToast(err.message || 'Error al aplicar nivel de título', 'error')
    }
  }

  const handleApplyEntireHierarchy = async () => {
    setApplying(true)
    try {
      await Word.run(async (context) => {
        const paragraphs = context.document.body.paragraphs
        context.load(paragraphs, 'text')
        await context.sync()

        for (const p of paragraphs.items) {
          const text = p.text.trim()
          if (!text) continue

          // Nivel 1: Capítulos, números romanos o canónicos
          if (/^(?:cap[ií]tulo\s+[ivxlcdm\d]+|[ivxlcdm]+\.[\s	]+[a-zÁÉÍÓÚÑ]|introducci[oó]n|m[eé]todo|metodolog[ií]a|resultados|discusi[oó]n|conclusiones|referencias)/i.test(text) && text.length < 80) {
            p.font.name = 'Times New Roman'
            p.font.size = 12
            p.font.bold = true
            p.font.italic = false
            p.alignment = Word.Alignment.centered
            p.lineSpacing = 24
            p.leftIndent = 0
            p.firstLineIndent = 0
            p.spaceBefore = 12
            p.spaceAfter = 6
            continue
          }

          // Nivel 2: Decimales (1.1., 1.2., 2.1., etc.)
          if (/^\d+\.\d+\.?[\s	]+[a-zÁÉÍÓÚÑ]/i.test(text) && text.length < 100) {
            p.font.name = 'Times New Roman'
            p.font.size = 12
            p.font.bold = true
            p.font.italic = false
            p.alignment = Word.Alignment.left
            p.lineSpacing = 24
            p.leftIndent = 0
            p.firstLineIndent = 0
            p.spaceBefore = 12
            p.spaceAfter = 4
            continue
          }

          // Nivel 3: Subtítulos comunes
          if (/^(?:situaci[oó]n\s+problem[aá]tica|preguntas?\s+propuestas?|objetivos?\s+espec[ií]ficos?|dise[nñ]o\s+metodol[oó]gico|ventajas|limitaciones)/i.test(text)) {
            p.font.name = 'Times New Roman'
            p.font.size = 12
            p.font.bold = true
            p.font.italic = true
            p.alignment = Word.Alignment.left
            p.lineSpacing = 24
            p.leftIndent = 0
            p.firstLineIndent = 0
            p.spaceBefore = 10
            p.spaceAfter = 4
          }
        }
        await context.sync()
      })
      showToast('Jerarquía de títulos APA 7 aplicada en Word', 'success')
      loadHeadings()
    } catch (err: any) {
      showToast(err.message || 'Error al normalizar jerarquía', 'error')
    } finally {
      setApplying(false)
    }
  }

  const handleJumpToHeading = async (idx: number) => {
    try {
      await navigateToParagraph(idx)
      showToast('Ubicado en Word', 'info')
    } catch {
      /* ignore */
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* TARJETA DE JERARQUÍA AUTOMÁTICA */}
      <div className="card card--hero">
        <div className="card__header">
          <div className="card__title">
            <DocumentTextIcon size={16} color="var(--accent-primary)" />
            <span>Jerarquía de Títulos APA 7</span>
          </div>
          <button
            type="button"
            className="btn-sm btn-secondary"
            onClick={loadHeadings}
            disabled={loading}
          >
            {loading ? 'Leyendo...' : 'Actualizar'}
          </button>
        </div>

        <p className="card__subtitle">
          Detección automática de estructura jerárquica en tu documento: normaliza romanos (I.) como Nivel 1, decimales (1.1.) como Nivel 2 y subtítulos como Nivel 3.
        </p>

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleApplyEntireHierarchy}
          disabled={applying}
          style={{ padding: '10px 14px' }}
        >
          <ZapIcon size={14} color="#ffffff" />
          <span>{applying ? 'Aplicando jerarquía...' : 'Aplicar Jerarquía APA 7 a Todo el Documento'}</span>
        </button>
      </div>

      {/* ACCIÓN RÁPIDA SOBRE LA SELECCIÓN */}
      <div className="card">
        <div className="card__title" style={{ fontSize: 12.5 }}>Convertir Párrafo Actual en Word:</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleApplyToSelection(1)}
            title="Centrado, Negrita"
          >
            Nivel 1 (H1)
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleApplyToSelection(2)}
            title="Izquierda, Negrita"
          >
            Nivel 2 (H2)
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleApplyToSelection(3)}
            title="Izquierda, Negrita + Cursiva"
          >
            Nivel 3 (H3)
          </button>
        </div>
      </div>

      {/* ESTRUCTURA DETECTADA EN EL DOCUMENTO */}
      <div className="card">
        <div className="card__header">
          <div className="card__title">Estructura Detectada</div>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            {headings.length} títulos
          </span>
        </div>

        {headings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '12px 6px', color: 'var(--text-muted)', fontSize: 12 }}>
            Haz clic en "Actualizar" o usa el botón superior para jerarquizar los títulos de tu documento.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
            {headings.map((h, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 8px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  paddingLeft: (h.level - 1) * 12 + 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                  <span className="finding-item__badge finding-item__badge--info">
                    N{h.level}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: h.level === 1 ? 700 : 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                    {h.text}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleJumpToHeading(h.index)}
                  style={{ padding: '3px 6px' }}
                >
                  <EyeIcon size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
