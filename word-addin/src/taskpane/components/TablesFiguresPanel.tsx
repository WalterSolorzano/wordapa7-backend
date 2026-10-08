import React, { useState } from 'react'
import {
  autoFormatAllTablesAPA,
  autoCaptionAllFiguresAPA,
} from '../office/proactiveEngine'
import { TableIcon, ImageIcon, ZapIcon, CheckCircleIcon } from './Icons'

interface Props {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export const TablesFiguresPanel: React.FC<Props> = ({ showToast }) => {
  const [working, setWorking] = useState<string | null>(null)

  const handleFormatAllTables = async () => {
    setWorking('tables')
    try {
      const res = await autoFormatAllTablesAPA()
      if (res.count === 0) {
        showToast('No se detectaron tablas en el documento', 'info')
      } else {
        showToast(`${res.count} tabla(s) formateadas con bordes APA 7 reglamentarios`, 'success')
      }
    } catch (err: any) {
      showToast(err.message || 'Error al formatear tablas', 'error')
    } finally {
      setWorking(null)
    }
  }

  const handleFormatAllFigures = async () => {
    setWorking('figures')
    try {
      const res = await autoCaptionAllFiguresAPA()
      if (res.count === 0) {
        showToast('No se detectaron imágenes en el documento', 'info')
      } else {
        showToast(`${res.count} figura(s) centradas y numeradas a APA 7`, 'success')
      }
    } catch (err: any) {
      showToast(err.message || 'Error al numerar figuras', 'error')
    } finally {
      setWorking(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* SECCIÓN 1: TABLAS APA 7 */}
      <div className="card card--hero">
        <div className="card__header">
          <div className="card__title">
            <TableIcon size={16} color="var(--accent-primary)" />
            <span>Tablas APA 7</span>
          </div>
        </div>

        <p className="card__subtitle">
          Reglas APA 7: Cero bordes verticales, bordes horizontales de 0.5pt (superior, cabecera e inferior), encabezados en negrita, rótulo "Tabla N" con título en cursiva y nota descriptiva al pie.
        </p>

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleFormatAllTables}
          disabled={working !== null}
        >
          <ZapIcon size={14} color="#ffffff" />
          <span>{working === 'tables' ? 'Formateando tablas...' : 'Formatear y Rotular Todas las Tablas'}</span>
        </button>
      </div>

      {/* SECCIÓN 2: FIGURAS APA 7 */}
      <div className="card card--hero">
        <div className="card__header">
          <div className="card__title">
            <ImageIcon size={16} color="var(--accent-primary)" />
            <span>Figuras e Imágenes APA 7</span>
          </div>
        </div>

        <p className="card__subtitle">
          Reglas APA 7: Centrado de gráficos, rótulo superior "Figura N" en negrita con título descriptivo en cursiva, y nota inferior con la fuente del estudio.
        </p>

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleFormatAllFigures}
          disabled={working !== null}
        >
          <ZapIcon size={14} color="#ffffff" />
          <span>{working === 'figures' ? 'Numerando figuras...' : 'Centrar y Rotular Todas las Figuras'}</span>
        </button>
      </div>
    </div>
  )
}
