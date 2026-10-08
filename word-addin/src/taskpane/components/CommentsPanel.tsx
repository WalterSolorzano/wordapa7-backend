/**
 * WordAPA7 Add-in — Panel de Comentarios (estilo WhatsApp)
 * ========================================================
 *
 * Muestra el feed de actividad del asistente en vivo como burbujas de chat:
 * citas procesadas, figuras captionadas, formato aplicado, errores, etc.
 *
 * Es el "WhatsApp-style comments panel" que se mantiene del diseño original.
 */

import React, { useEffect, useRef, useState } from 'react'
import type { AssistantEvent } from '../liveAssistant'
import { addWordComment } from '../office/wordHelper'

interface Props {
  events: AssistantEvent[]
  onClear: () => void
  showToast?: (msg: string, type: 'success'|'error'|'info') => void
}

const TYPE_META: Record<string, { label: string; tone: 'success' | 'info' | 'warning' | 'error' }> = {
  citation: { label: 'Cita', tone: 'success' },
  figure: { label: 'Fig', tone: 'success' },
  table: { label: 'Tab', tone: 'success' },
  format: { label: 'Fmt', tone: 'info' },
  mascot: { label: 'W7', tone: 'info' },
  info: { label: 'Info', tone: 'info' },
  summary: { label: 'Sum', tone: 'info' },
  error: { label: 'Error', tone: 'error' },
}

function timeLabel(t: number): string {
  const d = new Date(t)
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  return `${hh}:${mm}`
}

export function CommentsPanel({ events, onClear, showToast }: Props) {
  const endRef = useRef<HTMLDivElement>(null)
  const [commentText, setCommentText] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAddComment = async () => {
    if (!commentText.trim()) return
    setLoading(true)
    try {
      await addWordComment(commentText)
      setCommentText('')
      showToast?.('Comentario insertado', 'success')
    } catch (err: any) {
      showToast?.(err.message || 'Error al insertar comentario', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  const reversed = [...events].reverse().slice(0, 80)

  return (
    <div className="chat">
      <div className="chat__header">
        <div className="chat__avatar">W7</div>
        <div className="chat__header-text">
          <div className="chat__name">WordAPA7</div>
          <div className="chat__status">Asistente en vivo · auditoría APA 7</div>
        </div>
        {events.length > 0 && (
          <button className="chat__clear" onClick={onClear} title="Limpiar conversación">
            Limpiar
          </button>
        )}
      </div>

      <div className="chat__body">
        {events.length === 0 ? (
          <div className="chat__empty">
            <div className="chat__empty-icon chat__empty-icon--text">W7</div>
            <div className="chat__empty-title">Aún no hay mensajes</div>
            <div className="chat__empty-text">
              Activá el asistente en vivo y empezá a escribir. Cada cita que pongás,
              cada imagen que pegués y cada formato que apliqués aparecerá acá como
              un mensaje.
            </div>
          </div>
        ) : (
          reversed.map((ev, i) => {
            const meta = TYPE_META[ev.type] || TYPE_META.info
            const isMascot = ev.type === 'mascot'
            return (
              <div key={`${ev.time}-${i}`} className={`bubble bubble--${meta.tone} ${isMascot ? 'bubble--mascot' : ''}`}>
                <div className="bubble__content">
                  <span className={`bubble__tag bubble__tag--${meta.tone}`}>{meta.label}</span>
                  <div className="bubble__text">
                    {ev.message}
                    {ev.detail && <div className="bubble__detail">{ev.detail}</div>}
                  </div>
                </div>
                <div className="bubble__time">{timeLabel(ev.time)}</div>
              </div>
            )
          })
        )}
        <div ref={endRef} />
      </div>

      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="field-input"
            style={{ margin: 0, flex: 1 }}
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            placeholder="Añadir comentario a la selección..."
            onKeyDown={e => { if (e.key === 'Enter') handleAddComment() }}
          />
          <button className="btn btn--primary" onClick={handleAddComment} disabled={!commentText.trim() || loading} aria-label="Insertar comentario">
             {loading ? <span className="spinner" /> : (
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                 <path d="M22 2L11 13" />
                 <path d="M22 2l-7 20-4-9-9-4 20-7z" />
               </svg>
             )}
          </button>
        </div>
      </div>
    </div>
  )
}
