/**
 * WordAPA7 Add-in — Panel de Figuras
 *
 * Permite al usuario:
 *   1. Subir una imagen (drag & drop o botón)
 *   2. Definir título, nota y texto alternativo
 *   3. Insertarla en el documento con formato APA 7 completo
 *   4. La numeración ("Figura N") es automática
 */

import React, { useState, useRef } from 'react'
import {
  insertFigureAPA,
  getNextFigureNumber,
  fileToBase64,
  type FigureData,
} from '../office/wordHelper'

const UploadIcon: React.FC<{ size?: number }> = ({ size = 30 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <path d="M17 8l-5-5-5 5M12 3v12" />
  </svg>
)

const ImageIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </svg>
)

const BulbIcon: React.FC<{ size?: number }> = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18h6M10 22h4" />
    <path d="M12 2a7 7 0 00-4 12.7c.5.4.8 1 .8 1.7V18h6.4v-1.6c0-.7.3-1.3.8-1.7A7 7 0 0012 2z" />
  </svg>
)

interface Props {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export function FigurePanel({ showToast }: Props) {
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [note, setNote] = useState('')
  const [altText, setAltText] = useState('')
  const [widthInches, setWidthInches] = useState(5.5)
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Solo se admiten imágenes', 'error')
      return
    }
    try {
      const b64 = await fileToBase64(file)
      setImageBase64(b64)
      setPreviewUrl(URL.createObjectURL(file))
    } catch {
      showToast('Error al procesar la imagen', 'error')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleInsert = async () => {
    if (!imageBase64) {
      showToast('Primero subí una imagen', 'error')
      return
    }
    setLoading(true)
    try {
      const figNum = await getNextFigureNumber()

      const data: FigureData = {
        imageBase64,
        caption: caption || `Título de la Figura ${figNum}`,
        note,
        widthInches: widthInches,
        altText,
      }

      await insertFigureAPA(data, figNum)
      showToast(`Figura ${figNum} insertada con formato APA 7`, 'success')
    } catch (err: any) {
      showToast(err.message || 'Error al insertar figura', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Dropzone */}
      <div
        className={`dropzone ${dragging ? 'dropzone--active' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        {previewUrl ? (
          <img src={previewUrl} className="dropzone__preview" alt="Preview" />
        ) : (
          <>
            <UploadIcon />
            <span className="dropzone__text">Arrastrá una imagen o hacé clic</span>
            <span className="dropzone__text" style={{ opacity: 0.6 }}>PNG, JPG, GIF, etc.</span>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
      </div>

      {/* Campos */}
      <div className="card">
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <div className="field-label">Título de la figura (en cursiva, APA 7)</div>
            <input
              className="field-input"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Ej: Diagrama de flujo del proceso"
            />
          </div>
          <div>
            <div className="field-label">Nota (opcional)</div>
            <input
              className="field-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej: Adaptado de Fernández et al. (2024)"
            />
          </div>
          <div>
            <div className="field-label">Texto alternativo (accesibilidad)</div>
            <input
              className="field-input"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              placeholder="Descripción breve de la figura"
            />
          </div>
          <div>
            <div className="field-label">Ancho (pulgadas): {widthInches.toFixed(1)}"</div>
            <input
              type="range"
              min={1}
              max={6.5}
              step={0.1}
              value={widthInches}
              onChange={(e) => setWidthInches(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-primary)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-tertiary)' }}>
              <span>1"</span>
              <span>6.5"</span>
            </div>
          </div>
        </div>
      </div>

      <button
        className="btn btn--primary btn--full"
        onClick={handleInsert}
        disabled={loading || !imageBase64}
      >
        {loading ? (
          <>
            <span className="spinner" /> Insertando...
          </>
        ) : (
          <><ImageIcon /> Insertar Figura APA 7</>
        )}
      </button>

      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center', padding: '0 8px' }}>
        La numeración "Figura 1, 2, 3..." es automática.
        La imagen se centra según el estándar APA 7.
      </div>
      <div className="tip-box">
        <span className="tip-box__icon"><BulbIcon /></span>
        <span className="tip-box__text">La numero como Figura 1 y le pongo titulo y nota. Vos solo subila.</span>
      </div>
    </div>
  )
}
