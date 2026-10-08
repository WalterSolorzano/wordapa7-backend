/**
 * WordAPA7 Add-in — Panel de Portada APA 7 (estudiante)
 * =====================================================
 *
 * Sugiere los 5 campos de la portada estudiantil APA 7 (Título, Nombre,
 * Institución, Curso, Fecha) a partir del contenido del documento y permite
 * editarlos e insertar la portada al inicio.
 */

import React, { useState, useCallback } from 'react'
import { backend } from '../api/backend'
import { insertCoverPageAPA, getDocumentText, type CoverFields } from '../office/wordHelper'
import { clearHighlightsBeforeGenerate } from '../office/highlighter'

const SparklesIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
  </svg>
)

const DocIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <path d="M14 2v6h6" />
  </svg>
)

interface Props {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

const FIELDS: Array<{ key: keyof CoverFields; label: string; ph: string }> = [
  { key: 'title', label: 'Título del trabajo', ph: 'Ej: Análisis del comportamiento organizacional' },
  { key: 'author', label: 'Nombre del autor/a', ph: 'Ej: María Fernández' },
  { key: 'institution', label: 'Institución', ph: 'Ej: Universidad Nacional' },
  { key: 'course', label: 'Curso / Materia', ph: 'Ej: Psicología Organizacional' },
  { key: 'date', label: 'Fecha', ph: 'Ej: 15 de noviembre de 2024' },
]

export function CoverPagePanel({ showToast }: Props) {
  const [fields, setFields] = useState<CoverFields>({
    title: '',
    author: '',
    institution: '',
    course: '',
    date: '',
  })
  const [suggesting, setSuggesting] = useState(false)
  const [inserting, setInserting] = useState(false)

  const suggest = useCallback(async () => {
    setSuggesting(true)
    try {
      // Antes del POST de portada: limpiar resaltados temporales.
      await clearHighlightsBeforeGenerate()
      const text = await getDocumentText()
      const res = await backend.suggestCover(text)
      setFields({
        title: res.title || fields.title,
        author: res.author || fields.author,
        institution: res.institution || fields.institution,
        course: res.course || fields.course,
        date: res.date || fields.date,
      })
      showToast('Portada sugerida a partir del documento', 'success')
    } catch {
      showToast('No pude sugerir la portada. Completá los campos a mano.', 'error')
    } finally {
      setSuggesting(false)
    }
  }, [fields, showToast])

  const handleInsert = async () => {
    if (!fields.title.trim()) {
      showToast('Completá al menos el título', 'error')
      return
    }
    setInserting(true)
    try {
      await insertCoverPageAPA(fields)
      showToast('Portada APA 7 insertada al inicio del documento', 'success')
    } catch (err) {
      showToast((err as Error).message, 'error')
    } finally {
      setInserting(false)
    }
  }

  return (
    <>
      {/* ── ACCIÓN PRINCIPAL: GENERAR PORTADA ──────────────────────────────── */}
      <div className="action-card">
        <div className="action-card__title">Portada APA 7 (estudiante)</div>
        <button
          className="btn btn--primary btn--full action-card__btn"
          onClick={suggest}
          disabled={suggesting}
        >
          {suggesting ? <span className="spinner" /> : <SparklesIcon size={16} />} Generar portada con mis datos
        </button>
      </div>

      <div className="card">
        <div className="card__body">
          <button className="btn btn--secondary btn--full" onClick={suggest} disabled={suggesting}>
            {suggesting ? <span className="spinner" /> : <SparklesIcon />} Sugerir desde el documento
          </button>
        </div>
      </div>

      {FIELDS.map((f) => (
        <div key={f.key} className="field">
          <label className="field-label">{f.label}</label>
          <input
            className="field-input"
            value={fields[f.key]}
            placeholder={f.ph}
            onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}
          />
        </div>
      ))}

      {/* Vista previa */}
      <div className="card">
        <div className="card__simple-header">Vista previa</div>
        <div className="card__body">
          <div className="cover-preview">
            <div className="cover-preview__spacer" />
            <div className="cover-preview__title">{fields.title || 'Título del Trabajo'}</div>
            <div className="cover-preview__line">{fields.author || 'Nombre del Autor'}</div>
            <div className="cover-preview__line">{fields.institution || 'Institución'}</div>
            <div className="cover-preview__line">{fields.course || 'Curso'}</div>
            <div className="cover-preview__line">{fields.date || 'Fecha'}</div>
          </div>
        </div>
      </div>

      <button className="btn btn--primary btn--full" onClick={handleInsert} disabled={inserting}>
        {inserting ? <span className="spinner" /> : null}
        {inserting ? 'Insertando...' : <><DocIcon /> Insertar portada al inicio</>}
      </button>
    </>
  )
}
