/* WordAPA7 — Barra de navegación inferior móvil táctil (≤768px). */
import React from 'react';
import type { RailDestination } from './railItems';

interface MobileBottomNavProps {
  items: ReadonlyArray<RailDestination>;
  activeStep: number;
  onSelect: (item: RailDestination) => void;
}

export function MobileBottomNav({ items, activeStep, onSelect }: MobileBottomNavProps) {
  // Filtrar solo las fases principales (máximo 6 destinos)
  const navItems = items.filter((it) => it.step !== null).slice(0, 6);

  return (
    <nav
      aria-label="Navegación móvil"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        height: 56,
        backgroundColor: 'var(--color-bg-surface)',
        borderTop: '1px solid var(--color-border-subtle)',
        position: 'relative',
        zIndex: 40,
        flexShrink: 0,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {navItems.map((item) => {
        const isActive = item.step === activeStep;
        const Icon = item.Icon;
        const label = item.shortLabel || item.label;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            aria-label={item.label}
            aria-current={isActive ? 'step' : undefined}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              height: '100%',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              position: 'relative',
              padding: '4px 0',
            }}
          >
            <div style={{ position: 'relative' }}>
              <Icon size={18} strokeWidth={isActive ? 2.25 : 1.75} aria-hidden />
              {typeof item.pending === 'number' && item.pending > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -6,
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-accent)',
                  }}
                  aria-hidden
                />
              )}
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: isActive ? 600 : 500,
                lineHeight: 1,
                maxWidth: 58,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
