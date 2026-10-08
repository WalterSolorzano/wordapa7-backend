import React, { useEffect } from 'react';
import { History } from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';

/**
 * Historial de puntos guardados. Al abrirse pide la lista y ofrece restaurar.
 * Sin emojis ni colores literales: íconos y tokens.
 */
export const SnapshotHistory: React.FC = () => {
  const snapshots = useDocStore((s) => s.snapshots);
  const loadSnapshots = useDocStore((s) => s.loadSnapshots);
  const restoreSnapshot = useDocStore((s) => s.restoreSnapshot);

  useEffect(() => { void loadSnapshots(); }, [loadSnapshots]);

  return (
    <div
      data-testid="panel-historial"
      style={{
        display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
        padding: 'var(--space-3)', minWidth: 260,
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
        <History size={13} strokeWidth={1.75} aria-hidden />
        Puntos guardados
      </span>
      {snapshots.length === 0 && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
          Todavía no hay puntos guardados.
        </span>
      )}
      {snapshots.map((s) => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)' }}>
            {s.created_at}
            {s.element_count ? ` · ${s.element_count} elementos` : ''}
          </span>
          <button
            type="button"
            onClick={() => void restoreSnapshot(s.id)}
            style={{
              padding: '4px 8px', fontSize: 'var(--text-xs)',
              background: 'transparent', color: 'var(--color-accent)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            }}
          >
            Restaurar
          </button>
        </div>
      ))}
    </div>
  );
};
