import React from 'react';
import { Pencil, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ReferenciaModel } from '../../types';

export interface ReferenceCatalogItemProps {
  reference: ReferenciaModel;
  /* Verdad de la auditoría para esta referencia: `true` huérfana, `false`
     citada, `null`/`undefined` = no se pasó / no hay auditoría. Cuando el
     llamador no lo pasa, cae a `never_cited`/`cited_count` del modelo. */
  huerfana?: boolean | null;
  /* Menciones contadas por la MISMA fuente que la auditoría. Si no se pasa, cae
     a `cited_count`, que en el store llega con el default 0. */
  mentionedCount?: number;
  isSelected?: boolean;
  isActive?: boolean;
  onSelect?: () => void;
  onEdit?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export const ReferenceCatalogItem: React.FC<ReferenceCatalogItemProps> = ({
  reference,
  huerfana: huerfanaProp,
  mentionedCount,
  isSelected,
  isActive,
  onSelect,
  onEdit,
  className = '',
  style,
}) => {
  const active = Boolean(isSelected ?? isActive);

  // Formatear autor principal y año
  const rawAuthor = reference.authors?.[0];
  const mainAuthor = rawAuthor ? rawAuthor.split(',')[0].trim() || 'Autor' : 'Autor';
  const yearText = reference.year && reference.year.trim() ? reference.year.trim() : 's.f.';

  const isVerified = Boolean(reference.verificada);
  /* La auditoría manda: `undefined` = no se pasó (fallback al modelo), `null` =
     nadie auditó todavía (no se afirma nada), `true`/`false` = el dato. */
  const esHuerfana =
    huerfanaProp === undefined
      ? Boolean(reference.never_cited || reference.cited_count === 0)
      : huerfanaProp === true;
  const mentionsCount = mentionedCount ?? reference.cited_count ?? 0;
  const hasDoi = Boolean(reference.doi_or_url);

  return (
    <>
      <div
        tabIndex={0}
        aria-selected={active}
        onClick={() => onSelect?.()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect?.();
          }
        }}
        className={`card-source ${active ? 'active' : ''} ${className}`.trim()}
        style={{
          padding: '10px 12px',
          borderRadius: 'var(--radius-md)',
          /* Sin caja en reposo: la lista respira y solo el elemento activo lleva
             caja de acento. El hover insinúa una fila —borde izquierdo tenue—
             sin convertir cada renglón en una tarjeta; el contenedor de tarjetas
             dentro de tarjetas fue justo lo que se retiró. */
          border: 'none',
          borderLeft: active
            ? '2px solid var(--color-accent)'
            : '2px solid transparent',
          /* El separador entre filas: sin él las referencias se leían como un
             bloque corrido. */
          borderBottom: '1px solid var(--color-border-subtle)',
          backgroundColor: active
            ? 'var(--color-accent-soft)'
            : 'transparent',
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden',
          transition: 'border-color var(--transition-fast), background-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast)',
          ...style,
        }}
      >
        {/* Botón flotante animado de edición en hover */}
        <button
          type="button"
          className="hover-edit-trigger"
          aria-label="Editar"
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.();
          }}
          style={{
            position: 'absolute',
            right: '8px',
            top: '8px',
            backgroundColor: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-strong)',
            boxShadow: 'var(--shadow-sm)',
            color: 'var(--color-accent)',
            fontSize: '11px',
            fontWeight: 700,
            padding: '4px 9px',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            cursor: 'pointer',
            zIndex: 5,
          }}
        >
          <Pencil size={12} strokeWidth="var(--icon-stroke)" aria-hidden="true" />
          <span>Editar</span>
        </button>

        {/* Fila con Autor principal, Año y Badge de verificación */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '4px',
            paddingRight: '20px',
            gap: '8px',
          }}
        >
          <span
            style={{
              fontSize: '12.5px',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              minWidth: 0,
              flex: 1,
              wordBreak: 'break-word',
            }}
          >
            {mainAuthor} ({yearText})
          </span>

          {isVerified ? (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-success-a12)',
                color: 'var(--color-success)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              <CheckCircle2 size={11} strokeWidth="var(--icon-stroke)" aria-hidden="true" />
              <span>Verificada</span>
            </span>
          ) : esHuerfana ? (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-warning-a12)',
                color: 'var(--color-warning)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              <AlertTriangle size={11} strokeWidth="var(--icon-stroke)" aria-hidden="true" />
              <span>Sin citar</span>
            </span>
          ) : null}
        </div>

        {/* Título de la referencia */}
        {reference.title && !/^[\s.,;\]\[()]+$/.test(reference.title) ? (
          <div
            style={{
              fontSize: '12px',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.35,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {reference.title.replace(/^[\s.,;\]\[()]+|[\s.,;\]\[()]+$/g, '')}
          </div>
        ) : null}

        {/* Línea inferior: conteo de menciones y DOI */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '6px',
            fontSize: '11px',
          }}
        >
          <span style={{ color: 'var(--color-text-tertiary)' }}>
            {mentionsCount} {mentionsCount === 1 ? 'mención' : 'menciones'}
          </span>

          {hasDoi && (
            <span
              style={{
                color: 'var(--color-accent)',
                fontWeight: 700,
                marginLeft: 'auto',
                fontSize: '10px',
                letterSpacing: '0.04em',
              }}
            >
              DOI
            </span>
          )}
        </div>
      </div>

      <style>{`
        .card-source:not(.active):hover,
        .card-source:not(.active):focus-visible {
          border-left-color: var(--color-border-strong);
          background-color: var(--color-bg-surface-hover);
        }
        .card-source .hover-edit-trigger {
          opacity: 0;
          transform: translateX(12px) scale(0.9);
          transition: opacity 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
          pointer-events: none;
        }
        .card-source:hover .hover-edit-trigger,
        .card-source:focus-within .hover-edit-trigger {
          opacity: 1;
          transform: translateX(0) scale(1);
          pointer-events: auto;
        }
        .hover-edit-trigger:hover {
          background-color: var(--color-accent) !important;
          color: var(--color-text-on-accent) !important;
          border-color: var(--color-accent) !important;
          transform: scale(1.06);
        }
      `}</style>
    </>
  );
};

export default ReferenceCatalogItem;
