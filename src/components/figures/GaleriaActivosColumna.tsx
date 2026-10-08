import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ContextoFigura } from '../../lib/figuras';
import { ROTULO_DE_PREAMBULO } from '../../lib/figuras';
import { resolveAssetUrl } from '../../api/backend';
import { IconoFigura, IconoTabla, IconoEcuacion, IconoConformidad } from './IconosFiguras';

interface Props {
  contextos: ContextoFigura[];
  indiceActivo: number | null;
  onSelectIndice: (idx: number) => void;
}

/** Miniatura de tabla: una rejilla que insinúa filas y columnas sin inventar
 *  cifras. Lee los mismos `headers`/`rows` que la vista grande del activo. */
const MiniaturaTabla: React.FC<{ headers: string[]; rows: string[][] }> = ({ headers, rows }) => {
  const cols = Math.max(
    1,
    Math.min(4, headers.length || Math.max(0, ...rows.map((r) => r.length)) || 1)
  );
  const cuerpo = rows.slice(0, 2);
  const celdas: Array<string | null> = [
    ...headers.slice(0, cols),
    ...cuerpo.flatMap((r) => r.slice(0, cols)),
  ];
  const total = cols * 3;
  while (celdas.length < total) celdas.push(null);
  return (
    <div
      aria-hidden="true"
      data-testid="asset-thumbnail-tabla"
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        padding: '2px',
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridAutoRows: '1fr',
        gap: '1px',
        background: 'var(--color-border-subtle)',
      }}
    >
      {celdas.slice(0, total).map((_, i) => (
        <span
          key={i}
          style={{
            background: i < cols ? 'var(--color-text-tertiary)' : 'var(--color-bg-surface)',
            opacity: i < cols ? 0.4 : 1,
            borderRadius: 'var(--radius-xs)',
          }}
        />
      ))}
    </div>
  );
};

export const GaleriaActivosColumna: React.FC<Props> = ({
  contextos,
  indiceActivo,
  onSelectIndice,
}) => {
  // Agrupar por fase (H1) y subsección (H2) para que los activos no queden
  // "dispersos": el autor lee a qué encabezado pertenece cada figura o tabla.
  let grupoPrev: string | null = null;
  let subPrev: string | null = null;
  const filasGaleria = contextos.map((ctx, idx) => {
    const grupo = ctx.h1 ?? ROTULO_DE_PREAMBULO;
    const sub = ctx.h2 || null;
    const mostrarGrupo = grupo !== grupoPrev;
    const mostrarSub = !!sub && sub !== subPrev;
    grupoPrev = grupo;
    subPrev = sub;
    return { ctx, idx, mostrarGrupo, mostrarSub };
  });
  return (
    <aside
      aria-label="Galería de activos"
      style={{
        width: '100%',
        backgroundColor: 'var(--color-bg-surface)',
        borderRight: '1px solid var(--color-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflowY: 'auto',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-text-tertiary)',
          }}
        >
          Activos en documento ({contextos.length})
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {filasGaleria.map(({ ctx, idx, mostrarGrupo, mostrarSub }) => {
          const isSelected = indiceActivo === ctx.indice;
          const isConforme = ctx.tieneLeyenda && !!ctx.leyenda.trim();

          return (
            <React.Fragment key={ctx.id || ctx.indice}>
              {mostrarGrupo && (
                <div
                  style={{
                    padding: '12px 14px 4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {ctx.h1 ?? ROTULO_DE_PREAMBULO}
                </div>
              )}
              {mostrarSub && (
                <div
                  style={{
                    padding: '2px 14px 6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  {ctx.h2}
                </div>
              )}
            <div
              className="fig-row"
              role="button"
              tabIndex={0}
              onClick={() => onSelectIndice(ctx.indice)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectIndice(ctx.indice);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 14px',
                cursor: 'pointer',
                animationDelay: `${Math.min(idx, 10) * 24}ms`,
                borderBottom: '1px solid var(--color-border-subtle)',
                borderLeft: isSelected ? '3px solid var(--color-accent)' : '3px solid transparent',
                backgroundColor: isSelected ? 'var(--color-accent-soft)' : 'transparent',
                transition: 'background-color var(--transition-fast), border-left-color var(--transition-fast)',
              }}
            >
              {/* Miniatura 52x42px */}
              <div
                data-testid="asset-thumbnail"
                style={{
                  width: '52px',
                  height: '42px',
                  flexShrink: 0,
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border-subtle)',
                  backgroundColor: 'var(--color-bg-surface-alt)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                {ctx.tipo === 'image' && ctx.url ? (
                  <img
                    src={resolveAssetUrl(ctx.url)}
                    alt={ctx.rotulo}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                ) : ctx.tipo === 'table' && ctx.tabla && (ctx.tabla.headers.length > 0 || ctx.tabla.rows.length > 0) ? (
                  <MiniaturaTabla headers={ctx.tabla.headers} rows={ctx.tabla.rows} />
                ) : ctx.tipo === 'table' ? (
                  <IconoTabla size={20} color="var(--color-text-tertiary)" />
                ) : ctx.tipo === 'equation' ? (
                  <IconoEcuacion size={20} color="var(--color-text-tertiary)" />
                ) : (
                  <IconoFigura size={20} color="var(--color-text-tertiary)" />
                )}
              </div>

              {/* Metadatos y Rótulo */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: isSelected ? 'var(--color-accent)' : 'var(--color-text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {ctx.rotulo}
                  </span>

                  {/* Badge de Conformidad APA 7 */}
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      fontSize: '10px',
                      fontWeight: 500,
                      padding: '1px 5px',
                      borderRadius: 'var(--radius-sm)',
                      fontVariantNumeric: 'tabular-nums',
                      backgroundColor: isConforme
                        ? 'var(--color-success-a12)'
                        : 'var(--color-ink-a08)',
                      color: isConforme
                        ? 'var(--color-success)'
                        : 'var(--color-text-secondary)',
                      border: `1px solid ${
                        isConforme
                          ? 'var(--color-success-a14)'
                          : 'var(--color-ink-a12)'
                      }`,
                      flexShrink: 0,
                    }}
                  >
                    {isConforme ? (
                      <>
                        <IconoConformidad size={11} />
                        <span>Conforme</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={11} />
                        <span>Sin leyenda</span>
                      </>
                    )}
                  </span>
                </div>

                {/* Leyenda o placeholder */}
                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--color-text-tertiary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    lineHeight: '1.3',
                  }}
                >
                  {ctx.leyenda && ctx.leyenda.trim() ? ctx.leyenda : 'Sin leyenda definida'}
                </span>

                {/* Sección o capítulo contenedor */}
                {ctx.seccion && (
                  <span
                    style={{
                      fontSize: '10px',
                      color: 'var(--color-text-tertiary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {ctx.seccion}
                  </span>
                )}
              </div>
            </div>
            </React.Fragment>
          );
        })}
      </div>
    </aside>
  );
};
