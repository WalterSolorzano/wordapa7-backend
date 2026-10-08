/**
 * WordAPA7 Add-in — Panel de Referencias / Bibliografía
 * ====================================================
 *
 * Muestra las citas detectadas y la bibliografía sugerida (APA 7) construida
 * a partir de ellas. Permite:
 *   - Insertar la bibliografía al final del documento (con dedup).
 *   - Re-extraer citas del documento.
 *   - Alta/edición manual de referencias (no solo las autodetectadas).
 *   - Insertar una cita en texto "(Autor, Año)" en el cursor.
 *
 * Cuando el botón "Bibliografía" del Ribbon dispara la acción
 * 'build_bibliography', este panel re-extrae las citas del documento y
 * construye + inserta la bibliografía automáticamente.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { backend, type ReferenceDTO } from '../api/backend'
import { getDocumentText, insertBibliographyAPA, insertCitationAtCursor } from '../office/wordHelper'
import { clearHighlightsBeforeGenerate } from '../office/highlighter'

const BookIcon: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
  </svg>
)

/** Construye el texto de cita APA 7 a partir de una referencia. */
function buildCitation(ref: ReferenceDTO): string {
  const year = ref.year ?? 's.f.'
  const authors = ref.authors || []
  let authorPart: string
  if (authors.length === 0) {
    authorPart = (ref.title || 'Anónimo').split(' ').slice(0, 3).join(' ')
  } else if (authors.length === 1) {
    authorPart = authors[0]
  } else if (authors.length === 2) {
    authorPart = `${authors[0]} y ${authors[1]}`
  } else {
    authorPart = `${authors[0]} et al.`
  }
  return `(${authorPart}, ${year})`
}

interface Props {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  /** Acción pendiente del ribbon ('build_bibliography' o '') */
  pendingAction?: string
  /** Callback para marcar la acción como consumida */
  onActionConsumed?: () => void
}

export function ReferencesPanel({ showToast, pendingAction, onActionConsumed }: Props) {
  const [references, setReferences] = useState<ReferenceDTO[]>([])
  const [bibText, setBibText] = useState('')
  const [loading, setLoading] = useState(false)
  const [inserting, setInserting] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    authors: '',
    year: '',
    title: '',
    source: '',
    doi_or_url: '',
    raw_text: '',
  })
  const actionLockRef = useRef(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      // Antes de cualquier POST de bibliografía: limpiar resaltados temporales.
      await clearHighlightsBeforeGenerate()
      const res = await backend.buildBibliography()
      setReferences(res.references || [])
      setBibText(res.bibliography_text || '')
    } catch {
      // backend offline: intentar listReferences
      try {
        const res = await backend.listReferences()
        setReferences(res.references || [])
        setBibText(res.bibliography_text || '')
      } catch {
        showToast('Backend no disponible. Iniciá WordAPA7.', 'error')
      }
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    refresh()
  }, [refresh])

  const reextract = useCallback(async () => {
    setLoading(true)
    try {
      const text = await getDocumentText()
      let newCount = 0
      try {
        // Antes del POST de bibliografía: limpiar resaltados temporales.
        await clearHighlightsBeforeGenerate()
        const extracted = await backend.extractCitations(text)
        newCount = extracted.new_count ?? 0
      } catch {
        /* si falla la extracción, igual intentamos construir la bibliografía */
      }
      const res = await backend.buildBibliography()
      setReferences(res.references || [])
      setBibText(res.bibliography_text || '')
      const drafts = (res.references || []).filter((r) => r.is_draft).length
      showToast(`Bibliografía actualizada: ${res.total} referencia(s)`, 'success')
      if (newCount > 0) {
        showToast(`${newCount} cita(s) nueva(s) detectada(s)`, 'info')
      } else if (drafts > 0) {
        showToast(`${drafts} referencia(s) borrador: completá los datos`, 'info')
      }
      return res
    } catch {
      showToast('No se pudo re-extraer las citas', 'error')
      return null
    } finally {
      setLoading(false)
    }
  }, [showToast])

  const insertBibliography = useCallback(async (text?: string) => {
    const bibToInsert = text ?? bibText
    if (!bibToInsert.trim()) {
      showToast('No hay bibliografía para insertar. Extraé citas primero.', 'error')
      return false
    }
    setInserting(true)
    try {
      await insertBibliographyAPA(bibToInsert)
      showToast('Bibliografía APA 7 insertada al final del documento', 'success')
      return true
    } catch (err) {
      showToast(`Error: ${(err as Error).message}`, 'error')
      return false
    } finally {
      setInserting(false)
    }
  }, [bibText, showToast])

  // ── Ejecutar acción del ribbon: build_bibliography ───────────────────────
  useEffect(() => {
    if (pendingAction !== 'build_bibliography' || actionLockRef.current) return
    actionLockRef.current = true

    const run = async () => {
      showToast('Generando bibliografía APA 7...', 'info')
      const res = await reextract()
      if (res && res.bibliography_text) {
        await insertBibliography(res.bibliography_text)
      } else if (res) {
        showToast('No se detectaron citas para generar bibliografía', 'info')
      }
      onActionConsumed?.()
      actionLockRef.current = false
    }
    run()
  }, [pendingAction, reextract, insertBibliography, showToast, onActionConsumed])

  // ── Alta / edición manual de referencias ────────────────────────────────
  const openNew = useCallback(() => {
    setEditingId(null)
    setForm({ authors: '', year: '', title: '', source: '', doi_or_url: '', raw_text: '' })
    setShowForm(true)
  }, [])

  const openEdit = useCallback((ref: ReferenceDTO) => {
    setEditingId(ref.id)
    setForm({
      authors: (ref.authors || []).join(', '),
      year: ref.year ?? '',
      title: ref.title ?? '',
      source: ref.source ?? '',
      doi_or_url: ref.doi_or_url ?? '',
      raw_text: ref.raw_text ?? '',
    })
    setShowForm(true)
  }, [])

  const handleFormChange = useCallback((key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleSaveRef = useCallback(async () => {
    if (!form.title.trim() && !form.raw_text.trim()) {
      showToast('Poné un título o el texto de la referencia', 'error')
      return
    }
    setLoading(true)
    try {
      const payload = {
        id: editingId ?? undefined,
        authors: form.authors.split(',').map((a) => a.trim()).filter(Boolean),
        year: form.year.trim() || null,
        title: form.title.trim(),
        source: form.source.trim(),
        doi_or_url: form.doi_or_url.trim() || null,
        raw_text: form.raw_text.trim(),
      }
      await backend.saveReference(payload)
      showToast(editingId ? 'Referencia actualizada' : 'Referencia agregada', 'success')
      setShowForm(false)
      setEditingId(null)
      await refresh()
    } catch {
      showToast('No se pudo guardar la referencia', 'error')
    } finally {
      setLoading(false)
    }
  }, [form, editingId, showToast, refresh])

  // ── Insertar cita en el cursor ──────────────────────────────────────────
  const handleInsertCitation = useCallback(async (ref: ReferenceDTO) => {
    try {
      const citation = buildCitation(ref)
      await insertCitationAtCursor(citation)
      showToast(`Cita insertada: ${citation}`, 'success')
    } catch (err) {
      showToast(`Error: ${(err as Error).message}`, 'error')
    }
  }, [showToast])

  const removeRef = useCallback(async (id: string) => {
    try {
      await backend.deleteReference(id)
      const removed = references.find((r) => r.id === id)
      setReferences((prev) => prev.filter((r) => r.id !== id))
      // Quitar la línea correspondiente del preview de bibliografía.
      // Usar formatted_apa si existe, si no, raw_text, con fallback a string vacía.
      const matchText = (removed?.formatted_apa || removed?.raw_text || '').slice(0, 40)
      if (matchText) {
        setBibText((prev) =>
          prev
            .split('\n')
            .filter((line) => !line.includes(matchText))
            .join('\n'),
        )
      }
      showToast('Referencia eliminada', 'info')
    } catch {
      showToast('No se pudo eliminar', 'error')
    }
  }, [references, showToast])

  const clearAll = useCallback(async () => {
    try {
      await backend.clearReferences()
      setReferences([])
      setBibText('')
      showToast('Bibliografía vaciada', 'info')
    } catch {
      showToast('No se pudo vaciar', 'error')
    }
  }, [showToast])

  const [confirmingClear, setConfirmingClear] = useState(false)
  const [showDrafts, setShowDrafts] = useState(false)
  const clearConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleClearAll = useCallback(async () => {
    if (!confirmingClear) {
      setConfirmingClear(true)
      if (clearConfirmTimer.current) clearTimeout(clearConfirmTimer.current)
      clearConfirmTimer.current = setTimeout(() => setConfirmingClear(false), 4000)
      return
    }
    if (clearConfirmTimer.current) clearTimeout(clearConfirmTimer.current)
    setConfirmingClear(false)
    await clearAll()
  }, [confirmingClear, clearAll])

  const drafts = references.filter((r) => r.is_draft).length
  const complete = references.length - drafts

  return (
    <>
      {/* ── ACCIÓN PRINCIPAL: CONSTRUIR BIBLIOGRAFÍA ───────────────────────── */}
      <div className="action-card">
        <div className="action-card__title">Bibliografía APA 7</div>
        <button
          className="btn btn--primary btn--full action-card__btn"
          onClick={reextract}
          disabled={loading}
        >
          {loading ? <span className="spinner" /> : null} Construir bibliografía ahora
        </button>
      </div>

      <div className="card">
        <div className="card__simple-header">Bibliografía</div>
        {drafts > 0 && (
          <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:11.5, color:'#64748b', margin:'4px 12px 0' }}>
            <input type="checkbox" checked={showDrafts} onChange={(e) => setShowDrafts(e.target.checked)} />
            Mostrar incompletas ({drafts})
          </label>
        )}
        <div className="card__body">
          <div className="stats-grid stats-grid--compact">
            <div className="stat-box">
              <div className="stat-box__value">{references.length}</div>
              <div className="stat-box__label">Total</div>
            </div>
            <div className="stat-box">
              <div className="stat-box__value" style={{ color: 'var(--color-success)' }}>{complete}</div>
              <div className="stat-box__label">Completas</div>
            </div>
            <div className="stat-box">
              <div className="stat-box__value" style={{ color: 'var(--color-warning)' }}>{drafts}</div>
              <div className="stat-box__label">Borrador</div>
            </div>
          </div>

          <div className="row-2">
            <button className="btn btn--secondary" onClick={reextract} disabled={loading}>
              {loading ? <span className="spinner" /> : null} Re-extraer
            </button>
            <button className="btn btn--ghost" onClick={handleClearAll} disabled={references.length === 0}>
              {confirmingClear ? '¿Seguro? Sí, vaciar' : 'Vaciar'}
            </button>
          </div>

          <button className="btn btn--primary btn--full" onClick={() => insertBibliography()} disabled={inserting || !bibText}>
            {inserting ? <span className="spinner" /> : null} Insertar bibliografía
          </button>

          <button className="btn btn--secondary btn--full" onClick={openNew} style={{ marginTop: 8 }}>
            + Agregar referencia manual
          </button>
        </div>
      </div>

      {/* Formulario alta/edición de referencia */}
      {showForm && (
        <div className="card">
          <div className="card__simple-header">{editingId ? 'Editar referencia' : 'Agregar referencia'}</div>
          <div className="card__body">
            <div className="field-label">Autores (separados por coma)</div>
            <input
              className="field-input"
              value={form.authors}
              onChange={(e) => handleFormChange('authors', e.target.value)}
              placeholder="García, López"
            />
            <div className="field-label">Año</div>
            <input
              className="field-input"
              value={form.year}
              onChange={(e) => handleFormChange('year', e.target.value)}
              placeholder="2023"
            />
            <div className="field-label">Título</div>
            <input
              className="field-input"
              value={form.title}
              onChange={(e) => handleFormChange('title', e.target.value)}
              placeholder="Título del trabajo"
            />
            <div className="field-label">Fuente (revista, libro, editorial)</div>
            <input
              className="field-input"
              value={form.source}
              onChange={(e) => handleFormChange('source', e.target.value)}
              placeholder="Revista X"
            />
            <div className="field-label">DOI o URL</div>
            <input
              className="field-input"
              value={form.doi_or_url}
              onChange={(e) => handleFormChange('doi_or_url', e.target.value)}
              placeholder="https://..."
            />
            <div className="field-label">Texto crudo (opcional)</div>
            <input
              className="field-input"
              value={form.raw_text}
              onChange={(e) => handleFormChange('raw_text', e.target.value)}
              placeholder="(García, 2023) ..."
            />
            <div className="row-2">
              <button className="btn btn--primary" onClick={handleSaveRef} disabled={loading}>
                {loading ? <span className="spinner" /> : null} Guardar
              </button>
              <button className="btn btn--ghost" onClick={() => setShowForm(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

            {/* Lista de referencias */}
      {references.length > 0 && (
        <div className="card">
          <div className="card__simple-header">Referencias detectadas</div>
          <div className="card__body">
            {references.filter((r) => showDrafts || !r.is_draft).map((ref) => (
              <div key={ref.id} className="ref-item">
                <div className="ref-item__text">{(ref.formatted_apa || ref.raw_text || '').replace(/\[Completar[^\]]*\]\.?\s*\(?borrador\)?/gi,'').trim() || 'Referencia incompleta ? Editar para completar'}</div>
                <div className="ref-item__meta">
                  {ref.is_draft ? (
                    <span className="badge badge--warning">incompleta</span>
                  ) : (
                    <span className="badge badge--success">completa</span>
                  )}
                  <button
                    className="ref-item__action"
                    title="Insertar cita en el cursor"
                    onClick={() => handleInsertCitation(ref)}
                  >
                    Citar
                  </button>
                  <button
                    className="ref-item__action"
                    title="Editar referencia"
                    onClick={() => openEdit(ref)}
                  >
                    Editar
                  </button>
                  <button
                    className="ref-item__delete"
                    onClick={() => removeRef(ref.id)}
                    title="Eliminar referencia"
                  >
                    X
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {references.length === 0 && !loading && (
        <div className="empty-state">
          <div className="empty-state__icon" style={{ color: 'var(--accent-primary)' }}>
            <BookIcon />
          </div>
          <div className="empty-state__title">Sin referencias aún</div>
          <div className="step-chips step-chips--vertical" aria-label="Cómo armar la bibliografía">
            <span className="step-chips__chip"><b>1</b> Escribí (Autor, Año)</span>
            <span className="step-chips__chip"><b>2</b> El asistente la detecta</span>
            <span className="step-chips__chip"><b>3</b> Pulsá Construir bibliografía</span>
          </div>
        </div>
      )}
    </>
  )
}

export default ReferencesPanel
