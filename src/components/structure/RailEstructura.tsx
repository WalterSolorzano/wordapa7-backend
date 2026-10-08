/* Rail de la fase Estructura: 56px, solo íconos, 2 destinos. Patrón de
 * `RailTipoActivos` (Figuras). TOKENS, NO HEX. */
import React from 'react';
import { Network, ListTree } from 'lucide-react';

export type DestinoEstructura = 'esquema' | 'indice';

export interface RailEstructuraProps {
  destino: DestinoEstructura;
  onDestino: (destino: DestinoEstructura) => void;
}

const ITEMS: Array<{ id: DestinoEstructura; label: string; Icon: typeof Network }> = [
  { id: 'esquema', label: 'Esquema y jerarquía', Icon: Network },
  { id: 'indice', label: 'Índice', Icon: ListTree },
];

export const RailEstructura: React.FC<RailEstructuraProps> = ({ destino, onDestino }) => (
  <aside
    data-testid="rail-estructura"
    aria-label="Destinos de estructura"
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 'var(--space-2)',
      width: '56px',
      padding: 'var(--space-2) 0',
      background: 'var(--color-bg-surface)',
      borderRight: '1px solid var(--color-border-subtle)',
    }}
  >
    {ITEMS.map(({ id, label, Icon }) => {
      const activo = destino === id;
      return (
        <button
          key={id}
          type="button"
          aria-label={label}
          aria-pressed={activo}
          title={label}
          onClick={() => onDestino(id)}
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '40px',
            height: '40px',
            border: 0,
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            color: activo ? 'var(--color-accent)' : 'var(--color-text-secondary)',
            background: activo ? 'var(--color-accent-soft)' : 'transparent',
          }}
        >
          {activo ? (
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: 0,
                top: 8,
                bottom: 8,
                width: 3,
                background: 'var(--color-accent)',
                borderRadius: 'var(--radius-full)',
              }}
            />
          ) : null}
          <Icon size={18} strokeWidth="var(--icon-stroke)" aria-hidden />
        </button>
      );
    })}
  </aside>
);

export default RailEstructura;
