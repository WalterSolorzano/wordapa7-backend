/**
 * WordAPA7 Add-in — Sección "Figura X con confirmación" (Auditoría)
 * =================================================================
 *
 * Escanea figuras sin leyenda y permite aceptar u omitir cada propuesta.
 */

import React, { useState, useCallback } from 'react'
import {
  scanFigureProposals,
  acceptFigureCaption,
  rememberOmittedFigure,
  type FigureProposal,
} from '../office/figureCaptions'

interface Props {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export function FigureCaptionCard({ showToast }: Props) {
  const [proposals, setProposals] = useState<FigureProposal[]>([])
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [scanning, setScanning] = useState(false)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [scanned, setScanned] = useState(false)

  const scan = useCallback(async () => {
    setScanning(true)
    try {
      const found = await scanFigureProposals()
      setProposals(found)
      setScanned(true)
      if (found.length === 0) {
        showToast('Sin figuras sin leyenda', 'success')
      } else {
        showToast(`${found.length} figura(s) sin leyenda`, 'info')
      }
    } catch (err) {
      showToast((err as Error).message || 'No se pudo escanear el documento', 'error')
    } finally {
      setScanning(false)
    }
  }, [showToast])

  const accept = useCallback(async (p: FigureProposal) => {
    setAcceptingId(p.id)
    try {
      const label = await acceptFigureCaption(p, titles[p.id] || '')
      showToast(`Insertado: ${label}`, 'success')
      setProposals((prev) => prev.filter((x) => x.id !== p.id))
    } catch (err) {
      showToast((err as Error).message || 'No se pudo insertar la leyenda', 'error')
    } finally {
      setAcceptingId(null)
    }
  }, [titles, showToast])

  const omit = useCallback((p: FigureProposal) => {
    rememberOmittedFigure(p.id)
    setProposals((prev) => prev.filter((x) => x.id !== p.id))
  }, [])

  return (
    <div className="card">
      <button
        type="button"
        className="card__header"
        onClick={() => scan()}
        disabled={scanning}
        title="Buscar imágenes sin leyenda Figura N"
      >
        <span className="card__title">Figuras sin leyenda</span>
        {proposals.length > 0 && <span className="badge badge--count">{proposals.length}</span>}
        {scanning ? <span className="spinner" /> : <span className="chevron">▸</span>}
      </button>

      {scanned && proposals.length === 0 && !scanning && (
        <div className="card__body">
          <div className="hint">Sin propuestas. Todas las figuras tienen su "Figura N".</div>
        </div>
      )}

      {proposals.length > 0 && (
        <div className="card__body">
          {proposals.map((p) => (
            <div key={p.id} className="figure-proposal">
              <div className="figure-proposal__head">
                <span className="badge">Figura {p.number}</span>
                <span className="figure-proposal__excerpt">{p.excerpt}</span>
              </div>
              <input
                className="field-input"
                value={titles[p.id] || ''}
                placeholder={`Título de la Figura ${p.number} (opcional)`}
                onChange={(e) => setTitles({ ...titles, [p.id]: e.target.value })}
              />
              <div className="row-2">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => accept(p)}
                  disabled={acceptingId === p.id || !p.anchorText}
                >
                  {acceptingId === p.id ? <span className="spinner" /> : null} Aceptar
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => omit(p)}>
                  Omitir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default FigureCaptionCard
