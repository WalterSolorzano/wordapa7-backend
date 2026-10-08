import React, { useState } from 'react';
import { Palette, ChevronDown, Check } from 'lucide-react';
import { PRESETS_TABLA } from '../../lib/tablaRender';
import type { TableStylePreset } from '../../types';

export interface TablaEstiloSelectorProps {
  valor?: TableStylePreset;
  onChange: (p: TableStylePreset) => void;
}

interface TableMiniProps {
  id: TableStylePreset;
}

const TableMini: React.FC<TableMiniProps> = ({ id }) => {
  switch (id) {
    case 'compact':
      return (
        <svg width="60" height="38" viewBox="0 0 60 38" fill="none" aria-hidden="true">
          <rect x="2" y="2" width="56" height="34" rx="3" fill="var(--paper-white)" stroke="var(--border-subtle)" strokeWidth="1" />
          {/* APA bordes horizontales compactos */}
          <line x1="6" y1="7" x2="54" y2="7" stroke="var(--paper-ink)" strokeWidth="1.5" />
          <line x1="6" y1="13" x2="54" y2="13" stroke="var(--paper-ink)" strokeWidth="1" />
          <line x1="6" y1="32" x2="54" y2="32" stroke="var(--paper-ink)" strokeWidth="1.5" />
          {/* Celdas densas */}
          <rect x="8" y="9" width="10" height="2.5" rx="0.5" fill="var(--paper-ink)" />
          <rect x="24" y="9" width="12" height="2.5" rx="0.5" fill="var(--paper-ink)" />
          <rect x="42" y="9" width="8" height="2.5" rx="0.5" fill="var(--paper-ink)" />
          <rect x="8" y="16" width="9" height="2" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="24" y="16" width="10" height="2" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="42" y="16" width="6" height="2" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="8" y="21" width="11" height="2" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="24" y="21" width="8" height="2" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="42" y="21" width="8" height="2" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="8" y="26" width="7" height="2" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="24" y="26" width="11" height="2" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="42" y="26" width="7" height="2" rx="0.5" fill="var(--text-tertiary)" />
        </svg>
      );
    case 'expanded':
      return (
        <svg width="60" height="38" viewBox="0 0 60 38" fill="none" aria-hidden="true">
          <rect x="2" y="2" width="56" height="34" rx="3" fill="var(--paper-white)" stroke="var(--border-subtle)" strokeWidth="1" />
          {/* APA bordes horizontales espaciados */}
          <line x1="6" y1="6" x2="54" y2="6" stroke="var(--paper-ink)" strokeWidth="1.5" />
          <line x1="6" y1="14" x2="54" y2="14" stroke="var(--paper-ink)" strokeWidth="1" />
          <line x1="6" y1="33" x2="54" y2="33" stroke="var(--paper-ink)" strokeWidth="1.5" />
          {/* Celdas amplias */}
          <rect x="8" y="9" width="11" height="3" rx="0.5" fill="var(--paper-ink)" />
          <rect x="25" y="9" width="13" height="3" rx="0.5" fill="var(--paper-ink)" />
          <rect x="43" y="9" width="7" height="3" rx="0.5" fill="var(--paper-ink)" />
          <rect x="8" y="19" width="10" height="2.5" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="25" y="19" width="11" height="2.5" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="43" y="19" width="7" height="2.5" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="8" y="26" width="8" height="2.5" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="25" y="26" width="12" height="2.5" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="43" y="26" width="6" height="2.5" rx="0.5" fill="var(--text-tertiary)" />
        </svg>
      );
    case 'grid':
      return (
        <svg width="60" height="38" viewBox="0 0 60 38" fill="none" aria-hidden="true">
          <rect x="2" y="2" width="56" height="34" rx="3" fill="var(--paper-white)" stroke="var(--border-subtle)" strokeWidth="1" />
          {/* Rejilla completa */}
          <rect x="6" y="6" width="48" height="26" fill="transparent" stroke="var(--border-strong)" strokeWidth="1" />
          <line x1="6" y1="14" x2="54" y2="14" stroke="var(--border-strong)" strokeWidth="1" />
          <line x1="6" y1="23" x2="54" y2="23" stroke="var(--border-subtle)" strokeWidth="1" />
          <line x1="22" y1="6" x2="22" y2="32" stroke="var(--border-subtle)" strokeWidth="1" />
          <line x1="38" y1="6" x2="38" y2="32" stroke="var(--border-subtle)" strokeWidth="1" />
          <rect x="8" y="9" width="10" height="2.5" rx="0.5" fill="var(--paper-ink)" />
          <rect x="24" y="9" width="10" height="2.5" rx="0.5" fill="var(--paper-ink)" />
          <rect x="40" y="9" width="10" height="2.5" rx="0.5" fill="var(--paper-ink)" />
          <rect x="8" y="17" width="8" height="2" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="24" y="17" width="8" height="2" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="40" y="17" width="8" height="2" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="8" y="26" width="8" height="2" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="24" y="26" width="8" height="2" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="40" y="26" width="8" height="2" rx="0.5" fill="var(--text-tertiary)" />
        </svg>
      );
    case 'zebra':
      return (
        <svg width="60" height="38" viewBox="0 0 60 38" fill="none" aria-hidden="true">
          <rect x="2" y="2" width="56" height="34" rx="3" fill="var(--paper-white)" stroke="var(--border-subtle)" strokeWidth="1" />
          {/* Filas sombreadas estilo cebra */}
          <rect x="6" y="6" width="48" height="8" fill="var(--color-accent-soft)" />
          <rect x="6" y="14" width="48" height="9" fill="transparent" />
          <rect x="6" y="23" width="48" height="9" fill="var(--color-accent-soft)" />
          <line x1="6" y1="6" x2="54" y2="6" stroke="var(--accent-primary)" strokeWidth="1" />
          <line x1="6" y1="14" x2="54" y2="14" stroke="var(--accent-primary)" strokeWidth="1" />
          <line x1="6" y1="32" x2="54" y2="32" stroke="var(--border-subtle)" strokeWidth="1" />
          <rect x="8" y="9" width="10" height="2.5" rx="0.5" fill="var(--accent-primary)" />
          <rect x="24" y="9" width="10" height="2.5" rx="0.5" fill="var(--accent-primary)" />
          <rect x="40" y="9" width="10" height="2.5" rx="0.5" fill="var(--accent-primary)" />
          <rect x="8" y="17" width="8" height="2" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="24" y="17" width="8" height="2" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="40" y="17" width="8" height="2" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="8" y="26" width="8" height="2" rx="0.5" fill="var(--accent-primary)" opacity="0.8" />
          <rect x="24" y="26" width="8" height="2" rx="0.5" fill="var(--accent-primary)" opacity="0.8" />
          <rect x="40" y="26" width="8" height="2" rx="0.5" fill="var(--accent-primary)" opacity="0.8" />
        </svg>
      );
    case 'apa':
    default:
      return (
        <svg width="60" height="38" viewBox="0 0 60 38" fill="none" aria-hidden="true">
          <rect x="2" y="2" width="56" height="34" rx="3" fill="var(--paper-white)" stroke="var(--border-subtle)" strokeWidth="1" />
          {/* Tres líneas horizontales APA 7 */}
          <line x1="6" y1="6" x2="54" y2="6" stroke="var(--paper-ink)" strokeWidth="1.5" />
          <line x1="6" y1="14" x2="54" y2="14" stroke="var(--paper-ink)" strokeWidth="1" />
          <line x1="6" y1="32" x2="54" y2="32" stroke="var(--paper-ink)" strokeWidth="1.5" />
          {/* Celdas estándar */}
          <rect x="8" y="9" width="10" height="2.5" rx="0.5" fill="var(--paper-ink)" />
          <rect x="24" y="9" width="12" height="2.5" rx="0.5" fill="var(--paper-ink)" />
          <rect x="42" y="9" width="8" height="2.5" rx="0.5" fill="var(--paper-ink)" />
          <rect x="8" y="18" width="9" height="2" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="24" y="18" width="10" height="2" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="42" y="18" width="6" height="2" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="8" y="24" width="11" height="2" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="24" y="24" width="8" height="2" rx="0.5" fill="var(--text-tertiary)" />
          <rect x="42" y="24" width="7" height="2" rx="0.5" fill="var(--text-tertiary)" />
        </svg>
      );
  }
};

export const TablaEstiloSelector: React.FC<TablaEstiloSelectorProps> = ({ valor, onChange }) => {
  const activo = valor ?? 'apa';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-2)' }}>
      {PRESETS_TABLA.map((p) => {
        const esSeleccionado = activo === p.id;
        return (
          <button
            key={p.id}
            type="button"
            aria-label={`Estilo de tabla: ${p.etiqueta}`}
            aria-pressed={esSeleccionado}
            onClick={() => onChange(p.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '6px 4px',
              gap: '6px',
              backgroundColor: esSeleccionado ? 'var(--color-accent-soft)' : 'var(--surface-subtle)',
              border: `1.5px solid ${esSeleccionado ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              transition: 'all 0.12s ease',
              textAlign: 'center',
              position: 'relative',
            }}
          >
            <div style={{ pointerEvents: 'none' }}>
              <TableMini id={p.id} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', width: '100%' }}>
              <span style={{ fontSize: '11px', fontWeight: esSeleccionado ? 700 : 500, color: 'var(--text-main)' }}>
                {p.etiqueta}
              </span>
              {esSeleccionado && (
                <Check size={11} strokeWidth="3" style={{ color: 'var(--accent-primary)' }} />
              )}
            </div>
            {!p.esAPA && (
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 600,
                  color: 'var(--color-warning)',
                  backgroundColor: 'var(--color-warning-a12)',
                  padding: '1px 5px',
                  borderRadius: 'var(--radius-full)',
                  lineHeight: 1.2,
                }}
              >
                no APA
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default TablaEstiloSelector;
