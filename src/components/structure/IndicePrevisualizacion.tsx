/* WordAPA7 — IndicePrevisualizacion
 *
 * La vista previa del índice en el destino «Índice»: la raíz sintética
 * «Documento» y debajo las H1 (plegadas por defecto), H2 y H3. Es una
 * previsualización, no un editor: muestra lo que el índice del documento va a
 * enumerar, con el mismo lenguaje visual que el árbol del esquema.
 *
 * COMO EL ÍNDICE DE WORD: cada fila lleva el título, un punteado de relleno y
 * la página alineada a la derecha. El texto llega ya numerado desde
 * `construirTextosDeTitulo` y la página desde la paginación real; lo que no se
 * conoce se marca con `—`, nunca se inventa.
 *
 * Sin métricas ni diagnósticos: eso vive en el árbol y en el panel derecho.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import type { NodoJerarquia } from '../../lib/jerarquia';

export interface IndicePrevisualizacionProps {
  raices: readonly NodoJerarquia[];
  onSelect?: (nodo: NodoJerarquia) => void;
  nodoSeleccionadoId?: string | null;
  profundidadMaxima?: number;
  /** Texto ya numerado por id de elemento («I. Introducción», «1.a. Contexto»). */
  textosTitulo?: ReadonlyMap<string, string>;
  /** Página 1-based del elemento, o `null` si no se conoce. */
  paginaDe?: (elementoId: string) => number | null;
}

const estiloTitulo = (nivel: number): React.CSSProperties =>
  nivel === 1
    ? { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '13.5px' }
    : nivel === 2
      ? { fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: '13px' }
      : { fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '12.5px' };

export const IndicePrevisualizacion: React.FC<IndicePrevisualizacionProps> = ({
  raices,
  onSelect,
  nodoSeleccionadoId,
  profundidadMaxima = 3,
  textosTitulo,
  paginaDe,
}) => {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  /* Al subir la profundidad se despliegan los H1: un control que no muestra
   * nada hasta que uno expande a mano parece roto. El primer render no toca
   * nada —por defecto el capítulo manda y sus secciones arrancan plegadas—;
   * después, solo cuando el usuario mueve la profundidad. */
  const raicesRef = useRef(raices);
  raicesRef.current = raices;
  const primeraProfundidad = useRef(true);
  useEffect(() => {
    if (primeraProfundidad.current) {
      primeraProfundidad.current = false;
      return;
    }
    if (profundidadMaxima > 1) {
      setAbiertos(new Set(raicesRef.current.map((n) => n.id)));
    }
  }, [profundidadMaxima]);

  const toggle = (id: string) =>
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Preorden visible: solo se baja a los hijos de una H1 abierta (las H2/H3 no
  // se pliegan). `profundidadMaxima` acota qué niveles existen en la vista.
  const visibles = useMemo(() => {
    const out: { nodo: NodoJerarquia; nivel: number }[] = [];
    const recorrer = (nodos: readonly NodoJerarquia[], nivel: number) => {
      if (nivel > profundidadMaxima) return;
      for (const n of nodos) {
        out.push({ nodo: n, nivel });
        const puedeBajar = nivel < profundidadMaxima && (nivel !== 1 || abiertos.has(n.id));
        if (puedeBajar) recorrer(n.hijos, nivel + 1);
      }
    };
    recorrer(raices, 1);
    return out;
  }, [raices, abiertos, profundidadMaxima]);

  return (
    <div
      data-testid="indice-previsualizacion"
      role="list"
      style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', minHeight: 0 }}
    >
      <div
        role="listitem"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-3)',
          borderBottom: '1px solid var(--color-border-subtle)',
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          color: 'var(--color-text-primary)',
        }}
      >
        <span aria-hidden style={{ flex: '0 0 auto', width: 22 }} />
        <FileText
          size={15}
          strokeWidth="var(--icon-stroke)"
          aria-hidden
          style={{ color: 'var(--color-accent)', flex: '0 0 auto' }}
        />
        Documento
      </div>

      {visibles.map(({ nodo, nivel }) => {
        const clave = nodo.elementoId;
        const etiqueta = (clave ? textosTitulo?.get(clave) : null) ?? nodo.titulo;
        const pagina = clave && paginaDe ? paginaDe(clave) : null;
        return (
          <div key={nodo.id} role="listitem" style={{ display: 'flex', alignItems: 'flex-start' }}>
            {nivel === 1 && nodo.hijos.length > 0 ? (
              <button
                type="button"
                onClick={() => toggle(nodo.id)}
                aria-expanded={abiertos.has(nodo.id)}
                aria-label={`${abiertos.has(nodo.id) ? 'Contraer' : 'Expandir'} ${nodo.titulo}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: '0 0 auto',
                  width: 22,
                  height: 34,
                  border: 0,
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                {abiertos.has(nodo.id) ? (
                  <ChevronDown size={14} strokeWidth="var(--icon-stroke)" aria-hidden />
                ) : (
                  <ChevronRight size={14} strokeWidth="var(--icon-stroke)" aria-hidden />
                )}
              </button>
            ) : (
              <span aria-hidden style={{ flex: '0 0 auto', width: 22 }} />
            )}
            <div
              onClick={() => onSelect?.(nodo)}
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'baseline',
                gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-3)',
                paddingLeft: `calc(var(--space-3) + ${(nivel - 1) * 18}px)`,
                cursor: onSelect ? 'pointer' : 'default',
                background:
                  nodo.id === nodoSeleccionadoId ? 'var(--color-accent-soft)' : 'transparent',
                color: 'var(--color-text-primary)',
              }}
              title={etiqueta}
            >
              <span
                style={{
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  ...estiloTitulo(nivel),
                }}
              >
                {etiqueta}
              </span>
              {paginaDe ? (
                <>
                  {/* Punteado de relleno, como el índice de Word. */}
                  <span
                    aria-hidden
                    style={{
                      flex: 1,
                      minWidth: 12,
                      borderBottom: '1px dotted var(--color-border-subtle)',
                      transform: 'translateY(-3px)',
                    }}
                  />
                  <span
                    style={{
                      flex: '0 0 auto',
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: '12px',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    {pagina ?? '—'}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default IndicePrevisualizacion;
