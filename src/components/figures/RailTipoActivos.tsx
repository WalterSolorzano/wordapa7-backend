import React from 'react';
import type { TipoFigura } from '../../lib/figuras';
import type { LucideIcon } from 'lucide-react';
import { IconoFigura, IconoTabla, IconoEcuacion } from './IconosFiguras';

interface Props {
  tipoActivo: TipoFigura;
  conteos: { image: number; table: number; equation: number };
  onTipoChange: (tipo: TipoFigura) => void;
}

const ICONO_DE_TIPO: Record<TipoFigura, LucideIcon> = {
  image: IconoFigura,
  table: IconoTabla,
  equation: IconoEcuacion,
};

export const RailTipoActivos: React.FC<Props> = ({ tipoActivo, conteos, onTipoChange }) => {
  const items: Array<{ id: TipoFigura; label: string; count: number }> = [
    { id: 'image', label: 'Figuras', count: conteos.image },
    { id: 'table', label: 'Tablas', count: conteos.table },
    { id: 'equation', label: 'Ecuaciones', count: conteos.equation },
  ];

  return (
    <aside
      aria-label="Selector de tipos de activos"
      style={{
        width: '56px',
        backgroundColor: 'var(--color-bg-surface)',
        borderRight: '1px solid var(--color-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 'var(--space-3) 0',
        gap: 'var(--space-2)',
        flexShrink: 0,
      }}
    >
      {items.map((item) => {
        const activo = tipoActivo === item.id;
        const Icon = ICONO_DE_TIPO[item.id];

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onTipoChange(item.id)}
            title={`${item.label} (${item.count})`}
            aria-label={`${item.label} (${item.count})`}
            aria-pressed={activo}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid transparent',
              backgroundColor: activo ? 'var(--color-accent-soft)' : 'transparent',
              color: activo ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              transition:
                'background-color var(--transition-fast), color var(--transition-fast)',
            }}
          >
            {/* Barra de selección: lenguaje del rail de la app, no un bloque navy */}
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: '-9px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '3px',
                height: activo ? '22px' : '0px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-accent)',
                transition: 'height var(--transition-base)',
              }}
            />
            <Icon size={20} />
            <span
              style={{
                position: 'absolute',
                top: '2px',
                right: '3px',
                fontSize: '9px',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                color: activo ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                lineHeight: 1,
              }}
            >
              {item.count}
            </span>
          </button>
        );
      })}
    </aside>
  );
};
