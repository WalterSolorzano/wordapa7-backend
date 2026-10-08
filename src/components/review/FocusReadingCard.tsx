/* WordAPA7 — review: la tarjeta de lectura.
   El centro de la vista. Un párrafo, el encabezado de sección y página, y
   los resaltados inline. El cuerpo se auto-ajusta entre 13 y 19px; si
   ningún tamaño cabe, la tarjeta scrollea (piso duro en useAutoFitText).

   El origen de marcas NO se arma acá: es `useMarkSource`, el mismo que usa el
   lienzo. Esta tarjeta no decide qué se subraya ni si las citas están prendidas
   —eso es de los dos canales juntos— porque decidirlo dos veces es como un
   defecto llega a la pantalla por un solo lado. */

import React, { useMemo } from 'react';
import { Check, CheckCheck, Flag, Layers, Quote, Tags, X, type LucideIcon } from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';
import { useAutoFitText } from '../../hooks/useAutoFitText';
import { useMarkSourceBase, buildMarkSource } from '../../hooks/useMarkSource';
import { ReadingText } from './ReadingText';
import { ENGINE_META, type AuditItem, type SubtypeAction } from '../../hooks/useReviewWorkbench';
import { EditorialMascot, type MascotExpression, type MascotKind } from '../layout/EditorialMascot';

export interface FocusReadingCardProps {
  item: AuditItem | null;
  totalFindings: number;
  /** La fase activa del documento, como línea de contexto. El `label` lo aporta
   *  el hook (`allPhases`); la tarjeta no lo inventa. Sin fase, no se pinta. */
  phaseLabel?: string | null;
  /** Acción declarada para el hallazgo seleccionado (`accionDeItem`). Sin ella
   *  la tarjeta solo lee: no ofrece ningún botón. */
  action?: SubtypeAction;
  /** La persona ya marcó este hallazgo para revisión manual. */
  marked?: boolean;
  busy?: boolean;
  /** Cuántos hallazgos objetivos abarcaría "Aceptar todas". Con 1 o menos, el
   *  botón no aparece: no hay lote que ofrecer. */
  bulkCount?: number;
  onAccept?: (item: AuditItem) => void;
  onAcceptAll?: () => void;
  onMark?: (item: AuditItem) => void;
  onDismiss?: (item: AuditItem) => void;
  /** Mecanismo del motor que trabaja sobre TODO el documento (rotular figuras,
   *  resolver citas). Lo cablea la vista a `runGroupAction`. */
  onEngineAction?: () => void;
}

/** Botón de la barra de acciones. La que CAMBIA el documento va sólida; la que
 *  solo lo anota, fantasma (mismo criterio que el detalle del rack). */
function Accion({ label, Icon, onClick, disabled, primary, title }: {
  label: string;
  Icon: LucideIcon;
  onClick: () => void;
  disabled: boolean;
  primary: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px',
        border: primary ? 'none' : '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-sm)',
        background: primary ? 'var(--color-accent)' : 'transparent',
        color: primary ? 'var(--color-text-on-accent)' : 'var(--color-text-primary)',
        font: 'inherit', fontSize: 'var(--text-xs)', fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
        transition: 'background-color 0.15s ease, border-color 0.15s ease',
      }}
    >
      <Icon size={13} strokeWidth="var(--icon-stroke)" aria-hidden />
      {label}
    </button>
  );
}

/** Los mecanismos que el motor ejecuta sobre el DOCUMENTO, no sobre este texto. */
const ACCION_MOTOR: Partial<Record<SubtypeAction, { label: string; Icon: LucideIcon; title: string }>> = {
  autoCaption: {
    label: 'Rotular todo',
    Icon: Tags,
    title: 'Redacta la leyenda de todas las figuras y tablas del documento, no solo de esta.',
  },
  resolveGhosts: {
    label: 'Resolver citas',
    Icon: Quote,
    title: 'Resuelve las citas ausentes en la bibliografía de todo el documento.',
  },
};

export function FocusReadingCard({
  item,
  totalFindings,
  phaseLabel = null,
  action,
  marked = false,
  busy = false,
  bulkCount = 0,
  onAccept,
  onAcceptAll,
  onMark,
  onDismiss,
  onEngineAction,
}: FocusReadingCardProps) {
  const doc = useDocStore((s) => s.doc);
  const markBase = useMarkSourceBase();

  const { containerRef, fontSize, lineHeight } = useAutoFitText(item?.id);

  const elem = useMemo(
    () => (item?.element_id ? doc?.elements.find((e) => e.id === item.element_id) : undefined),
    [doc, item?.element_id],
  );

  const source = useMemo(() => buildMarkSource(markBase, elem), [markBase, elem]);

  const pagina = item
    ? item.pageNumber
      ? `Página ${item.pageNumber} de la revisión`
      : 'Sin página asignada'
    : null;
  const seccion = item ? `${ENGINE_META[item.category]?.title ?? item.category} · ` : '';

  const texto = item?.originalText?.trim() ? item.originalText : null;

  const mascotKind: MascotKind =
    item?.category === 'spelling'
      ? 'strike'
      : item?.category === 'structure'
        ? 'ruler'
        : item?.category === 'citations'
          ? 'reference'
          : 'highlighter';

  const mascotExpression: MascotExpression =
    totalFindings === 0
      ? 'happy'
      : totalFindings > 3
        ? 'worried'
        : item?.category === 'ai'
          ? 'curious'
          : 'neutral';

  const esIA = item?.category === 'ai';
  const conSugerencia = Boolean(item?.suggestedText);
  const motor =
    item && action && action !== 'none' && action !== 'accept' && action !== 'mark'
      ? ACCION_MOTOR[action]
      : undefined;
  const hayAcciones = Boolean(item && (onAccept || onMark || onDismiss || onEngineAction));

  return (
    <section
      aria-label="Párrafo en revisión"
      className="rev-item"
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          padding: 'var(--space-2) var(--space-6)',
          borderBottom: '1px solid var(--color-border-subtle)',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-tertiary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <EditorialMascot size={24} kind={mascotKind} expression={mascotExpression} />
          {/* Línea de contexto de fase (AGENTS.md §2): de qué parte del documento
              es este hallazgo. Icono, una palabra, sin más. */}
          {phaseLabel && (
            <span
              data-testid="review-phase-context"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
                color: 'var(--color-text-secondary)', fontWeight: 600,
                maxWidth: '28ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              <Layers size={12} strokeWidth="var(--icon-stroke)" aria-hidden />
              {phaseLabel}
            </span>
          )}
          {pagina !== null && <span style={{ fontWeight: 600 }}>{`${seccion}${pagina}`}</span>}
        </div>
        <span>{totalFindings} {totalFindings === 1 ? 'hallazgo en este bloque' : 'hallazgos en este bloque'}</span>
      </header>

      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          // Contenedor de scroll ACOTADO, no `overflow: hidden` sin tope: el
          // auto-ajuste decide "cabe sin scroll interno" comparando
          // scrollHeight contra clientHeight, y sin altura acotada esa
          // comparación se cumple siempre y el ajuste no significa nada.
          overflowY: 'auto',
          padding: '0 var(--space-10) var(--space-8)',
          fontFamily: 'var(--font-family)',
          fontSize: `${fontSize}px`,
          lineHeight,
          color: 'var(--color-text-primary)',
        }}
      >
        {texto !== null ? (
          <ReadingText text={texto} source={source} />
        ) : item?.subtype === 'figura' || item?.subtype === 'tabla' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-4) 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-accent)' }}>
              <Tags size={20} aria-hidden />
              <span style={{ fontSize: 'var(--text-base)', fontWeight: 700 }}>
                {item.summary || (item.subtype === 'figura' ? 'Figura sin rotular APA 7' : 'Tabla sin rotular APA 7')}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              {item.detail || 'Este elemento visual requiere rotulación reglamentaria según las normas APA 7 (número secuencial, título en cursiva y nota explicativa).'}
            </p>
            {item.suggestedText && (
              <div
                style={{
                  marginTop: 'var(--space-2)',
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-bg-surface-alt)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
                  Sugerencia de rotulación:
                </div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', fontStyle: 'italic' }}>
                  {item.suggestedText}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
            {item
              ? 'El texto de este hallazgo ya no está en el documento.'
              : 'Sin hallazgo seleccionado. Pulsa “Siguiente hallazgo” para recorrer los hallazgos de a uno.'}
          </p>
        )}
      </div>

      {hayAcciones && item && (
        <footer
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: 'var(--space-2) var(--space-6)',
            borderTop: '1px solid var(--color-border-subtle)',
            backgroundColor: 'var(--color-bg-surface-alt)',
          }}
        >
          {esIA && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              Motor probabilístico: solo marcar
            </span>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              marginLeft: 'auto',
              flexWrap: 'wrap',
            }}
          >
            {action === 'accept' && conSugerencia && !item.readOnly && onAccept && (
              <Accion label="Aceptar" Icon={Check} onClick={() => onAccept(item)} disabled={busy} primary />
            )}
            {action === 'accept' && onAcceptAll && bulkCount > 1 && (
              <Accion
                label="Aceptar todas"
                Icon={CheckCheck}
                onClick={onAcceptAll}
                disabled={busy}
                primary={false}
                title={`Aplica la corrección a los ${bulkCount} hallazgos de este tipo.`}
              />
            )}
            {action === 'mark' && onMark && (
              <Accion
                label={marked ? 'Marcado para revisar' : 'Marcar para revisar'}
                Icon={Flag}
                onClick={() => onMark(item)}
                disabled={busy || marked}
                primary={false}
              />
            )}
            {motor && onEngineAction && (
              <Accion
                label={motor.label}
                Icon={motor.Icon}
                onClick={onEngineAction}
                disabled={busy}
                primary={false}
                title={motor.title}
              />
            )}
            {onDismiss && (
              <Accion label="Descartar" Icon={X} onClick={() => onDismiss(item)} disabled={busy} primary={false} />
            )}
          </div>
        </footer>
      )}
    </section>
  );
}
