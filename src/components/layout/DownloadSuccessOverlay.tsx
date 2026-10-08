/* WordAPA7 — Micro-animación de cierre: pantalla final de descarga.
 * Estructura mínima (la pantalla con menos elementos del flujo):
 *   ícono de éxito pequeño → título → UNA línea de descripción (≤50ch) →
 *   dos botones pegados (principal sólida + secundaria fantasma).
 * Sin listas, tarjetas, columnas ni estadísticas: el resumen de hallazgos ya
 * se mostró en la vista de revisión. Alineada a la IZQUIERDA (no centrada):
 * la continuidad del flujo, no una pantalla de celebración.
 * Auto-se oculta a los ~8s; el foco dentro del overlay pausa el timer. */

import React, { useState, useEffect, useRef } from 'react';
import { useDocStore } from '../../store/useDocStore';

/** Auto-ocultado del overlay (ms) */
const HIDE_DELAY_MS = 8000;

export const DownloadSuccessOverlay: React.FC = () => {
  const exportSuccessAt = useDocStore((s) => s.exportSuccessAt);
  const doc = useDocStore((s) => s.doc);
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const lastSeenRef = useRef<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const clearHideTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const startHideTimer = (delay: number = HIDE_DELAY_MS) => {
    clearHideTimer();
    hideTimer.current = setTimeout(() => setShow(false), delay);
  };

  useEffect(() => {
    if (!exportSuccessAt) return;
    if (lastSeenRef.current === exportSuccessAt) return; // mismo evento
    lastSeenRef.current = exportSuccessAt;
    setCopied(false);
    setShow(true);
    startHideTimer();
    return () => clearHideTimer();
  }, [exportSuccessAt]);

  /* El foco dentro del overlay pausa el auto-ocultado para no soltar el foco
     a mitad de lectura:
     - focusin → se cancela el timer.
     - focusout hacia fuera del overlay → se re-arranca con 8s completos
       (tiempo generoso y simple; si el foco vuelve, focusin lo cancela).
     - focusout interno (otro botón) → el timer sigue cancelado.
     Al desmontarse, el return limpia ambos listeners (y el timer lo limpia
     el return del efecto del evento). */
  useEffect(() => {
    if (!show) return;
    const el = overlayRef.current;
    if (!el) return;
    const handleFocusIn = () => {
      clearHideTimer();
    };
    const handleFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next && el.contains(next)) return; // cambio de foco interno
      startHideTimer();
    };
    el.addEventListener('focusin', handleFocusIn);
    el.addEventListener('focusout', handleFocusOut);
    return () => {
      el.removeEventListener('focusin', handleFocusIn);
      el.removeEventListener('focusout', handleFocusOut);
      clearHideTimer();
    };
  }, [show]);

  if (!show) return null;

  const pages = doc?.meta?.page_count || 0;
  const fileName = (doc as any)?.meta?.file_name || doc?.file_name || 'documento';

  /* Una sola línea: descripción y texto copiado comparten el mismo contenido */
  const line = `${fileName} · ${pages ? `${pages} pág. · ` : ''}APA 7`;

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(line);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard no disponible */ }
  };

  return (
    <div ref={overlayRef} className="download-success" role="status" aria-live="polite">
      <div className="download-success-icon">
        <svg width="30" height="30" viewBox="0 0 34 34" fill="none">
          <circle cx="17" cy="17" r="15" className="download-success-ring" />
          <path d="M10 17.5 L15 22.5 L24 12" className="download-success-check" strokeWidth="var(--icon-stroke)" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </div>

      <span className="download-success-text">¡Listo, a entregar!</span>

      {/* Una sola línea de descripción (máximo ~50 caracteres de ancho) */}
      <span
        style={{
          fontSize: '11px',
          color: 'var(--text-secondary)',
          maxWidth: '50ch',
          lineHeight: 1.4,
        }}
      >
        {line}
      </span>

      {/* Dos botones pegados: principal sólida + secundaria fantasma */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
        <button
          type="button"
          onClick={copySummary}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            fontWeight: 700,
            padding: '6px 12px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            backgroundColor: copied ? 'var(--color-success-a14)' : 'var(--accent-primary)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            color: copied ? 'var(--color-success)' : 'var(--color-text-on-accent)',
            transition: 'background-color 0.15s ease',
          }}
        >
          {copied ? 'Copiado' : 'Copiar resumen'}
        </button>
        <button
          type="button"
          onClick={() => setShow(false)}
          style={{
            fontSize: '11px',
            fontWeight: 700,
            padding: '6px 12px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            backgroundColor: 'transparent',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-secondary)',
          }}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
};

export default DownloadSuccessOverlay;
