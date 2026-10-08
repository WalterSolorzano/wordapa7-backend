/**
 * WordAPA7 Add-in — Panel de Tablas
 *
 * Permite al usuario:
 *   1. Definir número de columnas y filas
 *   2. Editar encabezados y celdas
 *   3. Escribir título (caption) y nota
 *   4. Insertar la tabla con formato APA 7 (bordes horizontales, numeración, título cursiva)
 *   5. Numeración automática ("Tabla 1", "Tabla 2", ...)
 */

import React, { useState, useEffect, useCallback } from 'react'
import { backend } from '../api/backend'
import { insertTableAPA, getNextTableNumber, getDocumentText, type TableData } from '../office/wordHelper'

const TableIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
  </svg>
)

const SparklesIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
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

export function TablePanel({ showToast }: Props) {
  const [numCols, setNumCols] = useState(3)
  const [numRows, setNumRows] = useState(3)
  const [headers, setHeaders] = useState<string[]>(['Columna 1', 'Columna 2', 'Columna 3'])
  const [rows, setRows] = useState<string[][]>([['', '', ''], ['', '', ''], ['', '', '']])
  const [caption, setCaption] = useState('')
  const [note, setNote] = useState('')
  const [nextNumber, setNextNumber] = useState(1)
  const [loading, setLoading] = useState(false)

  // Calcular próximo número de tabla al montar
  useEffect(() => {
    getNextTableNumber().then(setNextNumber).catch(() => {})
  }, [])

  // Ajustar arrays cuando cambian columnas/filas
  const adjustColumns = useCallback((newCols: number) => {
    setNumCols(newCols)
    setHeaders((prev) => {
      const arr = [...prev]
      while (arr.length < newCols) arr.push(`Columna ${arr.length + 1}`)
      arr.length = newCols
      return arr
    })
    setRows((prev) => prev.map((r) => {
      const arr = [...r]
      while (arr.length < newCols) arr.push('')
      arr.length = newCols
      return arr
    }))
  }, [])

  const adjustRows = useCallback((newRows: number) => {
    setNumRows(newRows)
    setRows((prev) => {
      const arr = [...prev]
      while (arr.length < newRows) arr.push(new Array(numCols).fill(''))
      arr.length = newRows
      return arr
    })
  }, [numCols])

  const updateHeader = (idx: number, value: string) => {
    setHeaders((prev) => prev.map((h, i) => (i === idx ? value : h)))
  }

  const updateCell = (rowIdx: number, colIdx: number, value: string) => {
    setRows((prev) => prev.map((r, ri) => ri === rowIdx ? r.map((c, ci) => (ci === colIdx ? value : c)) : r))
  }

  const handleInsert = async () => {
    setLoading(true)
    try {
      const tableNumber = await getNextTableNumber()
      const data: TableData = {
        headers: headers.filter((h) => h.trim()),
        rows: rows.map((r) => r.map((c) => c)),
        caption,
        note,
      }
      await insertTableAPA(data, tableNumber)
      showToast(`Tabla ${tableNumber} insertada con formato APA 7`, 'success')
      setNextNumber(tableNumber + 1)
      // Limpiar campos
      setCaption('')
      setNote('')
    } catch (err: any) {
      showToast(err.message || 'Error al insertar tabla', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Sugerir caption con IA (backend)
  const suggestCaption = async () => {
    try {
      const docText = await getDocumentTextForContext()
      const result = await backend.suggestCaption('table', docText)
      if (result.caption) setCaption(result.caption)
      if (result.note) setNote(result.note)
      showToast('Título sugerido por IA', 'success')
    } catch {
      showToast('No hay IA disponible para sugerir', 'error')
    }
  }

  const [expanded, setExpanded] = useState(true)

  return (
    <div className="card">
      <button className="card__header" onClick={() => setExpanded(!expanded)}>
        <span className="card__icon"><TableIcon /></span>
        <span className="card__title">Insertar Tabla APA 7</span>
        <span className={`chevron ${expanded ? 'chevron--open' : ''}`}>▾</span>
      </button>

      {expanded && (
        <div className="card__body">
          {/* Dimensiones */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div className="field-label">Columnas</div>
              <input
                type="number" min={1} max={10}
                className="field-input"
                value={numCols}
                onChange={(e) => adjustColumns(parseInt(e.target.value) || 1)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div className="field-label">Filas (datos)</div>
              <input
                type="number" min={1} max={50}
                className="field-input"
                value={numRows}
                onChange={(e) => adjustRows(parseInt(e.target.value) || 1)}
              />
            </div>
          </div>

          {/* Numeración automática */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 8px', borderRadius: 'var(--radius-sm)',
            background: 'var(--accent-soft)', fontSize: 11,
          }}>
            <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>
              Tabla {nextNumber}
            </span>
            <span style={{ color: 'var(--text-tertiary)' }}>
              (numeración automática)
            </span>
          </div>

          {/* Encabezados */}
          {headers.length > 0 && (
            <>
              <div className="field-label">Encabezados (negrita, primera fila)</div>
              {headers.map((h, i) => (
                <input
                  key={i}
                  type="text"
                  className="field-input"
                  value={h}
                  placeholder={`Encabezado ${i + 1}`}
                  onChange={(e) => updateHeader(i, e.target.value)}
                />
              ))}
            </>
          )}

          {/* Datos */}
          <div className="field-label">Datos de la tabla</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {rows.map((row, ri) => (
              <div key={ri} style={{ display: 'flex', gap: 4 }}>
                {row.map((cell, ci) => (
                  <input
                    key={ci}
                    type="text"
                    className="field-input"
                    value={cell}
                    placeholder={`R${ri + 1}C${ci + 1}`}
                    onChange={(e) => updateCell(ri, ci, e.target.value)}
                    style={{ flex: 1, fontSize: 11 }}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Título (caption) */}
          <div>
            <div className="field-label">Título de la tabla (en cursiva)</div>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="text"
                className="field-input"
                value={caption}
                placeholder="Ej: Resultados del experimento"
                onChange={(e) => setCaption(e.target.value)}
              />
              <button
                className="btn btn--secondary"
                onClick={suggestCaption}
                style={{ flexShrink: 0, padding: '6px 8px' }}
                title="Sugerir con IA"
              >
                <SparklesIcon />
              </button>
            </div>
          </div>

          {/* Nota */}
          <div>
            <div className="field-label">Nota (opcional)</div>
            <input
              type="text"
              className="field-input"
              value={note}
              placeholder="Ej: Adaptado de García (2023)"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {/* Insertar */}
          <button
            className="btn btn--primary btn--full"
            onClick={handleInsert}
            disabled={loading}
          >
            {loading ? <span className="spinner" /> : null}
            {loading ? 'Insertando...' : `Insertar Tabla ${nextNumber}`}
          </button>

          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center' }}>
            Formato APA 7: bordes horizontales únicamente, título en cursiva, nota al pie
          </div>

          <div className="tip-box">
            <span className="tip-box__icon"><BulbIcon /></span>
            <span className="tip-box__text">APA 7 usa solo bordes horizontales. Los verticales los odio yo también.</span>
          </div>
        </div>
      )}
    </div>
  )
}

/** Obtiene las primeras 2000 palabras del documento como contexto para la IA. */
async function getDocumentTextForContext(): Promise<string> {
  try {
    const text = await getDocumentText()
    return text.split(/\s+/).slice(0, 2000).join(' ')
  } catch {
    return ''
  }
}
