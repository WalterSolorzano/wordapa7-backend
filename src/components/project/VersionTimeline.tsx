import React from 'react';
import type { VersionDocumento } from '../../lib/proyectoStore';

interface VersionTimelineProps {
  versiones: VersionDocumento[];
  onMarcarActiva?: (versionId: string) => void;
  onRestaurar?: (versionId: string) => void;
}

const MAX_VISIBLES = 3;

/**
 * Línea de tiempo de versiones de un proyecto.
 * Componente puro: recibe versiones y callbacks. No tiene estado de red.
 */
export const VersionTimeline: React.FC<VersionTimelineProps> = ({ versiones, onMarcarActiva, onRestaurar }) => {
  if (versiones.length === 0) {
    return (
      <div style={{ padding: 'var(--space-4)', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
        Sin versiones todavía.
      </div>
    );
  }

  // Ordenar: activa primero, luego por fecha descendente
  const ordenadas = [...versiones].sort((a, b) => {
    if (a.esActiva && !b.esActiva) return -1;
    if (!a.esActiva && b.esActiva) return 1;
    return b.fechaModificacion - a.fechaModificacion;
  });

  const activa = ordenadas.find(v => v.esActiva);
  const visibles = ordenadas.slice(0, MAX_VISIBLES);
  const colapsadas = ordenadas.length - visibles.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {visibles.map(v => {
        const diff = activa ? v.palabras - activa.palabras : 0;
        const diffStr = diff === 0 ? '' : diff > 0 ? `+${diff} palabras` : `${diff} palabras`;
        return (
          <article
            key={v.id}
            style={{
              padding: 'var(--space-3)',
              border: v.esActiva ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--paper-white)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-main)' }}>
                {v.filename}
              </strong>
              {v.esActiva && (
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--accent-primary)',
                    color: 'var(--paper-white)',
                  }}
                >
                  ACTIVA
                </span>
              )}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>
              {v.palabras} palabras {diffStr && `• ${diffStr} vs activa`}
              {v.autor && `• ${v.autor}`}
            </div>
            {!v.esActiva && onMarcarActiva && (
              <button
                onClick={() => onMarcarActiva(v.id)}
                style={{
                  marginTop: 'var(--space-2)',
                  padding: 'var(--space-1) var(--space-2)',
                  fontSize: 'var(--text-xs)',
                  background: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                }}
              >
                Marcar como activa
              </button>
            )}
            {!v.esActiva && onRestaurar && (
              <button
                type="button"
                onClick={() => onRestaurar(v.id)}
                style={{
                  marginTop: 'var(--space-2)',
                  padding: 'var(--space-1) var(--space-2)',
                  fontSize: 'var(--text-xs)',
                  background: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                }}
              >
                Restaurar
              </button>
            )}
          </article>
        );
      })}
      {colapsadas > 0 && (
        <div
          style={{
            padding: 'var(--space-2)',
            textAlign: 'center',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
          }}
        >
          +{colapsadas} versiones anteriores
        </div>
      )}
    </div>
  );
};
