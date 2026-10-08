/* WordAPA7 — LecturaProsaSeccion
 *
 * La prosa de UNA sección, con maquetación editorial. Vive en el panel derecho
 * del Estudio de Estructura y se abre al tocar un título.
 *
 * TOKENS, NO HEX. La versión anterior usaba clases Tailwind con fallback de
 * color literal (`bg-[var(--paper-white,#ffffff)]`), que es exactamente lo que
 * el lint de tokens prohíbe: un literal en la misma línea que un token no
 * absuelve al literal. Acá el color sale de la hoja y la tipografía editorial
 * de `--font-editorial`.
 *
 * LA SECCIÓN ES UN TRAMO DEL DOCUMENTO, no un nodo del árbol: se toma el
 * encabezado que abre la sección y se avanza hasta el próximo encabezado de
 * nivel igual o superior. Un capítulo con subsecciones pero todavía sin prosa
 * muestra sus subsecciones, no un falso vacío.
 */

import React, { useMemo } from 'react';
import { BookOpen, FileText, Image as ImageIcon } from 'lucide-react';
import { resolveAssetUrl } from '../../api/backend';
import { TablaRender } from '../figures/TablaRender';
import type { NodoJerarquia } from '../../lib/jerarquia';
import type { ElementModel } from '../../types';

export interface LecturaProsaSeccionProps {
  seccionActiva: NodoJerarquia | null;
  elementos: readonly ElementModel[];
}

const hoja: React.CSSProperties = {
  background: 'var(--paper-white)',
  color: 'var(--paper-ink)',
  fontFamily: 'var(--font-editorial)',
};

/** Recuadro de una figura: sólido si hay imagen, punteado si falta. */
const marcoImagen = (conImagen: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--color-bg-surface-alt)',
  border: conImagen
    ? '1px solid var(--color-border-subtle)'
    : '1px dashed var(--color-border-strong)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-4)',
});

const imagenEditorial: React.CSSProperties = {
  maxWidth: '100%',
  maxHeight: '420px',
  objectFit: 'contain',
};

export const LecturaProsaSeccion: React.FC<LecturaProsaSeccionProps> = ({
  seccionActiva,
  elementos,
}) => {
  const deLaSeccion = useMemo(() => {
    if (!seccionActiva) return [];
    const idInicio = seccionActiva.elementoId || seccionActiva.id;
    let idxInicio = elementos.findIndex((e) => e.id === idInicio);
    if (idxInicio === -1) {
      const titulo = seccionActiva.titulo.trim();
      for (let i = elementos.length - 1; i >= 0; i--) {
        const e = elementos[i];
        if (e.type === 'heading' && e.text.trim() === titulo) { idxInicio = i; break; }
      }
    }
    if (idxInicio === -1) return [];
    const nivelActual = seccionActiva.nivel || 1;
    const resultado: ElementModel[] = [elementos[idxInicio]];
    for (let i = idxInicio + 1; i < elementos.length; i++) {
      const el = elementos[i];
      if (el.type === 'heading' && (el.heading_level || 1) <= nivelActual) break;
      resultado.push(el);
    }
    return resultado;
  }, [seccionActiva, elementos]);

  if (!seccionActiva) {
    return (
      <div
        data-testid="prosa-seccion"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-2)',
          height: '100%',
          padding: 'var(--space-8)',
          textAlign: 'center',
          color: 'var(--color-text-tertiary)',
        }}
      >
        <BookOpen size={22} strokeWidth="var(--icon-stroke)" aria-hidden />
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          Selecciona un capítulo o sección
        </p>
        <p style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
          Haz clic en cualquier nodo del diagrama o del esquema para leer su prosa.
        </p>
      </div>
    );
  }

  const cuerpo = deLaSeccion
    .slice(1)
    .filter((e) => !(e.type === 'paragraph' && !String(e.text ?? '').trim()));
  const ES_PROSA_CON_TEXTO = new Set(['paragraph', 'bullet', 'numbered_list', 'block_quote']);
  const tieneContenido = cuerpo.some(
    (e) =>
      (ES_PROSA_CON_TEXTO.has(e.type) && String(e.text ?? '').trim()) ||
      (e.type === 'table' && Boolean(e.table_info)) ||
      e.type === 'image' ||
      e.type === 'heading',
  );

  return (
    <article data-testid="prosa-seccion" style={{ ...hoja, padding: 'var(--space-6)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-4)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <span
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            color: 'var(--color-accent)',
            border: '1px solid var(--color-accent)',
            borderRadius: 'var(--radius-sm)',
            padding: '1px 6px',
          }}
        >
          Nivel H{seccionActiva.nivel}
        </span>
        {seccionActiva.fase ? (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
            Fase: {seccionActiva.fase}
          </span>
        ) : null}
      </header>

      <div
        data-testid="hoja-editorial"
        className="hoja-editorial font-serif leading-relaxed"
        style={{ maxWidth: '68ch', margin: '0 auto' }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-editorial)',
            fontWeight: 500,
            fontSize: '30px',
            lineHeight: 1.2,
            margin: '0 0 var(--space-5)',
            color: 'var(--paper-ink)',
          }}
        >
          {seccionActiva.titulo}
        </h2>

        {!tieneContenido ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              color: 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-sm)',
            }}
          >
            <FileText size={16} strokeWidth="var(--icon-stroke)" aria-hidden />
            <p style={{ margin: 0 }}>Esta sección aún no contiene párrafos de prosa</p>
          </div>
        ) : (
          cuerpo.map((el, i) => {
            if (el.type === 'heading') {
              const nivel = Math.min(4, (el.heading_level ?? 2) + 1);
              const Tag = `h${nivel}` as 'h2' | 'h3' | 'h4';
              return (
                <Tag
                  key={el.id ?? `h-${i}`}
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                    fontSize: nivel === 2 ? '20px' : '17px',
                    margin: 'var(--space-6) 0 var(--space-3)',
                    color: 'var(--paper-ink)',
                  }}
                >
                  {el.text}
                </Tag>
              );
            }
            if (el.type === 'image') {
              const info = el.image_info;
              const numero = info?.figure_number;
              const caption = info?.caption;
              const subfiguras = info?.subfigures ?? [];
              const puedeRender = Boolean(info?.relative_url) && !info?.render_error;
              return (
                <figure key={el.id ?? `f-${i}`} style={{ margin: 'var(--space-5) 0' }}>
                  {subfiguras.length > 0 ? (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${subfiguras.length}, minmax(0, 1fr))`,
                        gap: 'var(--space-3)',
                      }}
                    >
                      {subfiguras.map((sub, sIdx) => {
                        const urlSub = sub.relative_url || info?.relative_url;
                        return (
                          <div
                            key={sub.id || `sub-${sIdx}`}
                            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}
                          >
                            <div style={marcoImagen(Boolean(urlSub))}>
                              {urlSub ? (
                                <img
                                  src={resolveAssetUrl(urlSub)}
                                  alt={sub.title || `Panel ${sub.label}`}
                                  style={imagenEditorial}
                                />
                              ) : (
                                <ImageIcon size={28} strokeWidth="var(--icon-stroke)" aria-hidden style={{ color: 'var(--color-text-tertiary)' }} />
                              )}
                            </div>
                            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
                              {sub.label ? <span style={{ fontWeight: 600 }}>{sub.label} </span> : null}
                              {sub.title}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={marcoImagen(puedeRender)}>
                      {puedeRender ? (
                        <img
                          src={resolveAssetUrl(info!.relative_url)}
                          alt={caption || 'Figura'}
                          style={imagenEditorial}
                        />
                      ) : (
                        <ImageIcon size={28} strokeWidth="var(--icon-stroke)" aria-hidden style={{ color: 'var(--color-text-tertiary)' }} />
                      )}
                    </div>
                  )}
                  <figcaption
                    style={{
                      marginTop: 'var(--space-2)',
                      fontSize: '13px',
                      color: 'var(--color-text-secondary)',
                      textAlign: 'center',
                    }}
                  >
                    {numero ? (
                      <span style={{ fontWeight: 600 }}>Figura {numero}. </span>
                    ) : null}
                    {caption || 'Sin leyenda asignada'}
                  </figcaption>
                </figure>
              );
            }
            if (el.type === 'table' && el.table_info) {
              return (
                <div key={el.id ?? `t-${i}`} style={{ margin: 'var(--space-5) 0' }}>
                  <TablaRender tabla={el.table_info} />
                </div>
              );
            }
            return (
              <p
                key={el.id ?? `p-${i}`}
                style={{
                  margin: '0 0 var(--space-4)',
                  fontSize: '16px',
                  lineHeight: 1.7,
                  textAlign: 'justify',
                  textIndent: '1.5em',
                  hyphens: 'auto',
                }}
              >
                {el.text}
              </p>
            );
          })
        )}
      </div>
    </article>
  );
};

export default LecturaProsaSeccion;
