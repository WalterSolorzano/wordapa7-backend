/* WordAPA7 — shell: flyout de detalle del rail.
   Flota SOBRE el workbench y no lo empuja: el centro de Revisión no puede
   estrecharse porque el usuario quiera leer una etiqueta. El panel no programa
   su propio cierre: la entrada y la salida se reportan al shell, que es quien
   posee el timer de 120ms de la unión rail + flyout. Armarlo aquí lo haría
   incancelable desde el rail, y el panel se cerraría con el puntero encima. */

import React, { useEffect } from 'react';
import { Pin, X, Check, AlertCircle } from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';
import { OutlineTree } from '../wizard/OutlineTree';
import type { RailDestination } from './railItems';

export const FLYOUT_CLOSE_GRACE_MS = 120;

const STATUS_TEXT: Record<NonNullable<RailDestination['status']>, string> = {
  done: 'Listo',
  pending: 'pendientes',
  idle: 'Sin pendientes',
};

const STATUS_COLOR: Record<NonNullable<RailDestination['status']>, string> = {
  done: 'var(--color-success)',
  pending: 'var(--color-warning)',
  idle: 'var(--color-text-tertiary)',
};

export function RailFlyout({ item, onClose, onEnter, onLeave }: {
  item: RailDestination | null;
  onClose: () => void;
  /** Reporta la entrada del puntero hacia arriba: el shell cancela con esto el
   *  cierre que él mismo había iniciado. */
  onEnter?: () => void;
  /** Reporta la salida del puntero hacia arriba: el shell programa con esto su
   *  timer de gracia. Opcionales para que este componente siga siendo usable
   *  sin shell. */
  onLeave?: () => void;
}): JSX.Element | null {
  const railPinned = useDocStore((s) => s.railPinned);
  const setRailPinned = useDocStore((s) => s.setRailPinned);

  useEffect(() => {
    // Sin destino no hay panel que cerrar: el componente se monta siempre (por eso
    // `item` acepta null) y con la suscripción viva cada Esc de la app —un modal
    // del asistente, el copiloto— soltaría el ancla de la próxima apertura.
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRailPinned(false);
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, setRailPinned, onClose]);

  // El panel no tiene temporizador propio, así que no hay nada que limpiar al
  // desmontar: el cierre lo programa y el shell lo cancela.
  if (!item) return null;

  // Exportar no abre flyout: al hacer clic ya se entra al túnel de exportación,
  // y un panel que lo describa al lado competiría con la pantalla final.
  if (item.showFlyout === false) return null;

  // El flyout se dibuja si el destino tiene descripción, estado o esquema documental.
  const hasDetails = Boolean(item.description || item.status || item.showOutline);
  if (!hasDetails) return null;

  const StatusIcon = item.status === 'done' ? Check : item.status === 'pending' ? AlertCircle : null;
  const pinned = railPinned;
  const pending = item.pending ?? 0;

  return (
    <aside
      data-testid="rail-flyout"
      aria-label={`Detalle de ${item.label}`}
      onMouseEnter={() => onEnter?.()}
      onMouseLeave={() => onLeave?.()}
      style={{
        position: 'absolute',
        top: 12,
        left: 64,
        width: 240,
        height: item.showOutline ? 'calc(100% - 24px)' : 'auto',
        maxHeight: 'calc(100% - 24px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        padding: '12px 14px',
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
        zIndex: 'var(--z-dropdown)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <item.Icon size={15} strokeWidth={1.75} aria-hidden style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {item.label}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            type="button"
            aria-label="Anclar panel"
            aria-pressed={pinned}
            onClick={() => setRailPinned(!pinned)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 24, height: 24, border: 'none', borderRadius: 'var(--radius-sm)',
              background: pinned ? 'var(--color-accent-soft)' : 'transparent',
              color: pinned ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <Pin size={13} strokeWidth={1.75} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Cerrar detalle"
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 24, height: 24, border: 'none', borderRadius: 'var(--radius-sm)',
              background: 'transparent', color: 'var(--color-text-tertiary)',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <X size={13} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      </div>

      {/* Descripción contextual para dar sentido al flyout */}
      {item.description && (
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>
          {item.description}
        </p>
      )}


      {/* La fila de estado se omite entera cuando el destino NO tiene estado.
          Ajustes, Tema y el Complemento de Word son acciones: no se completan,
          no tienen nada pendiente, y un "Sin pendientes" sobre ellos es un
          vocabulario de estado aplicado a un botón. El rail no inventa el
          cero; no dibuja la fila. */}
      {item.status && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)' }}>
          {StatusIcon && <StatusIcon size={12} strokeWidth={1.75} aria-hidden style={{ color: STATUS_COLOR[item.status] }} />}
          <span style={{ color: STATUS_COLOR[item.status], fontWeight: 600 }}>
            {/* El conteo es parte de la frase "N pendientes": prefijarlo a "Listo"
                o a "Sin pendientes" produce "3 Listo". Solo la rama pending cuenta. */}
            {item.status === 'pending' && pending > 0
              ? `${pending} ${STATUS_TEXT.pending}`
              : STATUS_TEXT[item.status]}
          </span>
        </div>
      )}

      {item.showOutline && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', borderTop: '1px solid var(--color-border-subtle)', paddingTop: 8 }}>
          <OutlineTree />
        </div>
      )}
    </aside>
  );
}
