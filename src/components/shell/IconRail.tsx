/* WordAPA7 — shell: rail de iconos de 56px.
   Cada botón hace spring-zoom en hover (48×56) y muestra el nombre en un chip
   compacto bajo el icono. El flyout de detalle se abre con CLIC, y el hover no
   lo abre: el hover debe costar atención visual mínima, no un panel de 240px
   sobre el documento. El clic ya abría, navegaba y anclaba, así que es un
   superconjunto del hover y quitarle el hover no le deja sin disparador. */

import React, { useState } from 'react';
import { useDocStore } from '../../store/useDocStore';
import type { RailDestination } from './railItems';

export interface IconRailProps {
  items: RailDestination[];
  /** La SALIDA del puntero. Antes de este cambio el rail también avisaba la
   *  ENTRADA, y con ella abría el detalle; ya no: el hover no abre nada.
   *
   *  Por qué el clic alcanza y el hover no. El clic ya lo abría, y además
   *  navegaba a la fase y anclaba el panel: es un superconjunto del hover.
   *  Quitar el hover no deja al flyout sin disparador, le saca el disparador
   *  que aparecía sin que nadie lo pidiera —el reporte literal del usuario:
   *  "al pasar el mouse por una fase que no salga la ventana flotante"—. Un
   *  panel de 240px que se abre porMoved el puntero se atraviesa en el camino
   *  al contenido, y encima se ofrece sobre fases cuyo detalle no es el árbol.
   *
   *  La ENTRADA del puntero al RAIL se sigue reportando por `onEnterRail`, y
   *  hace falta: es lo que cancela el cierre de la gracia cuando el puntero
   *  vuelve desde el flyout. El que se deja de reportar es el hover de un
   *  BOTÓN, que no debe abrir nada. */
  onEnterRail: () => void;
  onLeaveRail: () => void;
  /** Clic en un destino: navega a su fase y abre su detalle. El hover solo
   *  muestra el zoom y el chip. */
  onSelect: (item: RailDestination) => void;
  onTogglePin?: () => void;
  pinned?: boolean;
  /** Inicio pasa "Navegación principal": sus destinos no son fases. */
  ariaLabel?: string;
}

const RAIL_WIDTH = 56;

// ── Curva spring para el zoom: rebote suave, sin sobrepasar demasiado. ──────
// cubic-bezier(0.34, 1.56, 0.64, 1) — mismo perfil que wk-step-enter.
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const SPRING_DUR = '180ms';
const FAST = 'var(--transition-fast)';   // 120ms ease-out

// ── Tokens de color ──────────────────────────────────────────────────────────
// hover y active comparten la misma superficie: la señal principal del hover
// es el zoom, no un color diferente al activo. Así la fase activa se lee como
// "hover permanente", sin ambigüedad.
const surfaceOf = (active: boolean, hovered: boolean) =>
  active || hovered ? 'var(--color-accent-soft)' : 'transparent';
const inkOf = (active: boolean, hovered: boolean) =>
  active || hovered ? 'var(--color-accent)' : 'var(--color-text-secondary)';

// ── Estilos del botón de fase ────────────────────────────────────────────────
// El zoom cambia width + height. overflow:hidden en el botón recorta el chip
// cuando está colapsado, y flexDirection:column apila icono + chip.
const btnStyle = (active: boolean, hovered: boolean): React.CSSProperties => ({
  position: 'relative',
  width: active || hovered ? 48 : 44,
  height: active || hovered ? 60 : 44,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: active || hovered ? 4 : 0,
  padding: active || hovered ? '6px 2px 4px' : 0,
  border: 'none',
  borderRadius: active || hovered ? 'var(--radius-lg)' : 'var(--radius-md)',
  backgroundColor: surfaceOf(active, hovered),
  color: inkOf(active, hovered),
  cursor: 'pointer',
  overflow: 'hidden',
  // La sombra aparece en hover/active para dar elevación percibida.
  boxShadow: active || hovered
    ? 'var(--shadow-accent)'
    : 'none',
  // width + height van por spring; el resto por la curva rápida del sistema.
  transition: [
    `width ${SPRING_DUR} ${SPRING}`,
    `height ${SPRING_DUR} ${SPRING}`,
    `border-radius ${FAST}`,
    `background ${FAST}`,
    `box-shadow ${SPRING_DUR} ${SPRING}`,
  ].join(', '),
});

// El icono escala con el mismo spring para amplificar el salto visual.
const iconWrapStyle = (active: boolean, hovered: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transform: active || hovered ? 'scale(1.08)' : 'scale(1)',
  transition: `transform ${SPRING_DUR} ${SPRING}`,
  flexShrink: 0,
  // Reserva altura fija para que el chip no empuje el icono al hacer max-height.
  lineHeight: 0,
});

// El chip de nombre: aria-hidden, mayúsculas, 9px con respiro adecuado del icono.
// max-height colapsa a 0 → el contenedor no reserva espacio en reposo.
const chipStyle = (active: boolean, hovered: boolean): React.CSSProperties => ({
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
  color: 'var(--color-accent)',
  whiteSpace: 'nowrap',
  lineHeight: 1.1,
  maxHeight: active || hovered ? 14 : 0,
  opacity: active || hovered ? 1 : 0,
  overflow: 'hidden',
  // Entra un poco después del zoom para que el icono llegue primero.
  transition: [
    `max-height 140ms ease-out ${active || hovered ? '40ms' : '0ms'}`,
    `opacity 130ms ease-out ${active || hovered ? '40ms' : '0ms'}`,
  ].join(', '),
  marginTop: 0,
});

// ── Badge de pendientes: punto → pill numerada en hover ──────────────────────
const dotStyle: React.CSSProperties = {
  position: 'absolute',
  top: 6,
  right: 6,
  width: 6,
  height: 6,
  borderRadius: 'var(--radius-full)',
};

// En hover el punto se convierte en pill con el número.
const pillStyle = (hovered: boolean, count: number): React.CSSProperties => ({
  position: 'absolute',
  top: 5,
  right: 5,
  minWidth: hovered && count > 0 ? 14 : 6,
  height: hovered && count > 0 ? 14 : 6,
  borderRadius: 'var(--radius-full)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 9,
  fontWeight: 700,
  color: hovered && count > 0 ? 'var(--color-text-on-accent)' : 'transparent',
  padding: hovered && count > 0 ? '0 3px' : 0,
  transition: [
    `min-width ${FAST}`,
    `height ${FAST}`,
    `color ${FAST}`,
    `padding ${FAST}`,
  ].join(', '),
});

export function IconRail({ items, onEnterRail, onLeaveRail, onSelect, ariaLabel }: IconRailProps) {
  const wizardStep = useDocStore((s) => s.wizardStep);
  const isActive = (item: RailDestination) =>
    item.current === true || (item.step !== null && wizardStep === item.step);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const release = (id: string) => () => setHoveredId((cur) => (cur === id ? null : cur));

  return (
    <nav
      aria-label={ariaLabel ?? 'Fases de la transformación'}
      data-testid="icon-rail"
      /* La ENTRADA y la SALIDA del puntero se reportan al shell, que es quien
         posee el timer de gracia de la unión rail + flyout. La entrada importa:
         sin ella, el puntero que vuelve del panel al rail no cancelaría el
         cierre y el panel se iría con el puntero encima. Lo que NO se reporta
         es el hover de un botón: el detalle se abre con el clic. */
      onMouseEnter={onEnterRail}
      onMouseLeave={() => {
        setHoveredId(null);
        onLeaveRail();
      }}
      style={{
        width: RAIL_WIDTH,
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: '16px 0',
        backgroundColor: 'var(--color-bg-surface)',
        borderRight: '1px solid var(--color-border-subtle)',
        /* El rail vive SIEMPRE (AGENTS.md §1), así que tiene que quedar por
           encima de la capa de carga, que está en `--z-carga`. Sin esto el rail
           es un ítem de flex sin posicionamiento, y cualquier capa fija con un
           z-index positivo se lo come por el orden de pintado, no por el número:
           por eso la capa de carga llegaba a tapar la navegación. El mismo
           `--z-dropdown` que usa el flyout, para que los dos estén en la misma
           fila de la escala y no haya un número suelto. */
        position: 'relative',
        zIndex: 'var(--z-dropdown)',
      }}
    >
      {items.map((item) => {
        const { id, label, Icon, status, pending = 0, step } = item;
        const active = isActive(item);
        const hovered = hoveredId === id;

        // El nombre accesible del botón incluye estado y conteo: el chip
        // es aria-hidden y no aporta nada al árbol de accesibilidad.
        const nombre = status === 'pending' && pending > 0
          ? `${label}, ${pending} pendientes`
          : status === 'done'
            ? `${label}, listo`
            : label;

        // Etiqueta abreviada para el chip (prioriza shortLabel declarada; fallback elegante).
        const chipLabel = item.shortLabel ?? (label.length > 8 ? label.slice(0, 7) + '.' : label);

        return (
          <button
            key={id}
            type="button"
            aria-label={nombre}
            aria-current={active ? (step === null ? 'page' : 'step') : undefined}
            data-active={active ? 'true' : 'false'}
            onMouseEnter={() => {
              /* El hover solo hace el ZOOM y muestra el chip. No reporta nada hacia
                 arriba y no abre el detalle: el zoom es atención visual
                 mínima, y el detalle es un panel de 240px sobre el documento.
                 El clic es el que abre, navega y ancla. */
              setHoveredId(id);
            }}
            onMouseLeave={release(id)}
            onClick={() => onSelect(item)}
            style={btnStyle(active, hovered)}
          >
            {/* Icono con spring-scale */}
            <span style={iconWrapStyle(active, hovered)}>
              <Icon size={20} strokeWidth={1.75} aria-hidden />
            </span>

            {/* Chip de nombre — aria-hidden: el aria-label del botón ya lo cubre */}
            <span
              aria-hidden
              data-rail-chip
              style={chipStyle(active, hovered)}
            >
              {chipLabel}
            </span>

            {/* Badge de estado: pending → pill numerada en hover; done → punto verde */}
            {pending > 0 && (
              <span
                aria-hidden
                style={{
                  ...pillStyle(hovered, pending),
                  backgroundColor: 'var(--color-warning)',
                }}
              >
                {hovered ? pending : ''}
              </span>
            )}
            {status === 'done' && pending === 0 && (
              <span
                aria-hidden
                style={{
                  ...dotStyle,
                  backgroundColor: 'var(--color-success)',
                }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
