/* WordAPA7 — Mascota con globo de diálogo (no bloqueante).
   Aparece SOLO en hitos importantes (apertura de túnel, validación de un
   paso, acciones IA). Máx. 1 línea de texto y se auto-oculta (rate-limited
   en el store). Nunca tapa el documento: pointer-events none. */

import React from 'react';
import { useDocStore } from '../../store/useDocStore';
import { DocumentMascot } from '../layout/DocumentMascot';

export const MascotBubble: React.FC = () => {
  const mascotMessage = useDocStore((s) => s.mascotMessage);

  if (!mascotMessage) return null;

  const toneColor =
    mascotMessage.tone === 'success' ? 'var(--color-success)'
    : mascotMessage.tone === 'warning' ? 'var(--color-warning)'
    : 'var(--accent-primary)';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', bottom: '44px', right: '16px',
        zIndex: 9000, pointerEvents: 'none',
        display: 'flex', alignItems: 'flex-end', gap: '10px',
        maxWidth: '320px',
      }}
    >
      <DocumentMascot
        size={48}
        kind={mascotMessage.tone === 'warning' ? 'reference' : mascotMessage.tone === 'success' ? 'highlighter' : 'ruler'}
        expression={mascotMessage.tone === 'warning' ? 'worried' : mascotMessage.tone === 'success' ? 'excited' : 'curious'}
      />
      <div style={{ position: 'relative' }}>
        <div style={{
          backgroundColor: 'var(--surface-elevated)',
          border: `1px solid ${toneColor}`,
          borderRadius: 'var(--radius-lg)',
          padding: '10px 14px',
          fontSize: '12px', lineHeight: 1.45,
          color: 'var(--text-main)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
          maxWidth: '280px',
        }}>
          {mascotMessage.text}
        </div>
        <div style={{
          position: 'absolute', bottom: '10px', left: '-6px',
          width: '10px', height: '10px',
          backgroundColor: 'var(--surface-elevated)',
          borderLeft: `1px solid ${toneColor}`,
          borderBottom: `1px solid ${toneColor}`,
          transform: 'rotate(45deg)',
        }} />
      </div>
    </div>
  );
};

export default MascotBubble;
