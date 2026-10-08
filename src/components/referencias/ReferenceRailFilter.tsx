import React from 'react';
import { LayoutGrid, Check, AlertCircle, LucideIcon } from 'lucide-react';

export type ReferenceFilterType = 'all' | 'verified' | 'issues';

export interface ReferenceRailFilterProps {
  filter: ReferenceFilterType;
  counts: {
    total: number;
    verified: number;
    issues: number;
  };
  onSelectFilter: (f: ReferenceFilterType) => void;
}

/**
 * El mini-rail de filtros. Tres destinos, una sola familia de íconos y un solo
 * acento: el que está activo. Los íconos NO se pintan por estado (verde para
 * verificadas, ámbar para pendientes): eso era un arcoíris donde el color
 * competía con la selección. El estado real vive en las tarjetas del catálogo,
 * que sí lo dicen con todas las letras.
 *
 * El rótulo de "verificadas" dice sólo "Verificadas": antes decía "Verificadas
 * contra DOI/CrossRef" y ese "CrossRef" chocaba con el modo DOI del modal de
 * nueva referencia, que es el único botón que debe responder a ese nombre.
 */
export const ReferenceRailFilter: React.FC<ReferenceRailFilterProps> = ({
  filter,
  counts,
  onSelectFilter,
}) => {
  const items: Array<{
    id: ReferenceFilterType;
    label: string;
    icon: LucideIcon;
    count: number;
    showBadge?: boolean;
  }> = [
    {
      id: 'all',
      label: 'Todas las referencias',
      icon: LayoutGrid,
      count: counts.total,
      showBadge: true,
    },
    {
      id: 'verified',
      label: 'Verificadas',
      icon: Check,
      count: counts.verified,
      showBadge: false,
    },
    {
      id: 'issues',
      /* El rótulo describe lo que el conteo ES. El filtro agrupa las referencias
         sin verificar, las que no se citan en el cuerpo, y las citas del texto
         que no tienen ficha. Un número que sumaba 10 + 3 bajo el nombre
         "huérfanas o incompletas" contaba cosas que no eran ésas. */
      label: 'Por revisar (sin verificar, sin citar o sin ficha)',
      icon: AlertCircle,
      count: counts.issues,
      showBadge: counts.issues > 0,
    },
  ];

  return (
    <aside
      className="rail-icons"
      aria-label="Filtro de referencias"
      style={{
        width: '56px',
        flexShrink: 0,
        background: 'var(--color-bg-surface)',
        borderRight: '1px solid var(--color-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '14px 0',
        gap: '14px',
      }}
    >
      {items.map((item) => {
        const isActive = filter === item.id;
        const Icon = item.icon;

        return (
          <button
            key={item.id}
            type="button"
            id={`btn-rail-${item.id}`}
            className={`rail-btn ${isActive ? 'active' : ''}`}
            data-active={isActive ? 'true' : 'false'}
            aria-pressed={isActive}
            title={`${item.label} (${item.count})`}
            aria-label={`${item.label} (${item.count})`}
            onClick={() => onSelectFilter(item.id)}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
              border: isActive ? '1px solid var(--color-accent-a30)' : '1px solid transparent',
              background: isActive ? 'var(--color-accent-soft)' : 'transparent',
              color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              transition: 'background-color var(--transition-fast), color var(--transition-fast), transform var(--transition-fast)',
              transform: isActive ? 'scale(1.06)' : 'scale(1)',
              boxShadow: isActive ? 'var(--shadow-accent)' : 'none',
            }}
          >
            <Icon size={18} stroke="currentColor" strokeWidth="var(--icon-stroke)" />
            {item.showBadge && (
              <span
                className="rail-badge"
                id={item.id === 'all' ? 'badgeAll' : undefined}
                style={{
                  position: 'absolute',
                  top: '-3px',
                  right: '-3px',
                  fontSize: '9.5px',
                  fontWeight: 800,
                  padding: '1px 5px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--color-accent)',
                  color: 'var(--color-text-on-accent)',
                  lineHeight: '13px',
                  border: '1px solid var(--color-bg-surface)',
                }}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </aside>
  );
};

export default ReferenceRailFilter;
