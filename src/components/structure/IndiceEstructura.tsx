/* WordAPA7 — IndiceEstructura
 *
 * Columna izquierda del Estudio de Estructura: el esquema, y solo el esquema.
 * La versión anterior montaba acá adentro los toggles «ver el mapa / ver el
 * documento», así que la fase terminaba con dos vistas compitiendo por el
 * centro. Ahora el mapa vive en su propia columna y el documento entero no es
 * una vista de esta fase.
 *
 * Chips de foco por fase: filtran la lista por la fase del H1. El conteo sale
 * de la lista completa, nunca de un re-derivado.
 */

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ListTree } from 'lucide-react';
import type { ElementModel } from '../../types';
import {
  construirJerarquia,
  filasDelIndice,
  type FasesConocidas,
  type NodoJerarquia,
  type VocabularioFases,
} from '../../lib/jerarquia';
import { phaseLabel } from '../../lib/auditItems';
import { NodoIndice } from './NodoIndice';

export interface IndiceEstructuraProps {
  elementos: readonly ElementModel[] | null;
  faseConocida?: FasesConocidas;
  vocabulario?: VocabularioFases;
  onSelect?: (nodo: NodoJerarquia) => void;
  nodoSeleccionadoId?: string | null;
  /** Título ya numerado por id de elemento, la misma fuente que el diagrama. */
  textosTitulo?: ReadonlyMap<string, string>;
}

export const IndiceEstructura: React.FC<IndiceEstructuraProps> = ({
  elementos,
  faseConocida,
  vocabulario,
  onSelect,
  nodoSeleccionadoId,
  textosTitulo,
}) => {
  const [filtro, setFiltro] = useState<string>('todas');
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const raices = useMemo(
    () => construirJerarquia(elementos ?? [], faseConocida ?? {}, vocabulario),
    [elementos, faseConocida, vocabulario],
  );
  const filas = useMemo(() => filasDelIndice(raices), [raices]);

  /* El rango de niveles se DERIVA de las filas: mostrar "Nivel 1 a 3" cuando el
   * árbol enseña un H4 sería exactamente la clase de mentira que esta fase
   * existe para no contar. Un árbol sin nodos no tiene rango que declarar. */
  const nivelMaximo = useMemo(
    () => filas.reduce((m, f) => Math.max(m, f.nodo.nivel), 0),
    [filas],
  );

  const fases = useMemo(() => {
    const vistas: { clave: string; etiqueta: string }[] = [];
    for (const raiz of raices) {
      if (raiz.fase && !vistas.some((f) => f.clave === raiz.fase)) {
        vistas.push({ clave: raiz.fase, etiqueta: phaseLabel(raiz.fase) });
      }
    }
    return vistas;
  }, [raices]);

  const visibles = useMemo(
    () => (filtro === 'todas' ? filas : filas.filter((f) => f.nodo.fase === filtro)),
    [filas, filtro],
  );

  // Preorden: una fila es visible si ningún H1 ancestro está plegado. Como
  // `filasDelIndice` entrega en preorden, basta con ocultar desde un H1
  // plegado hasta el próximo H1.
  const filasVisibles = useMemo(() => {
    const out: typeof filas = [];
    let oculto = false;
    for (const fila of visibles) {
      if (fila.profundidad === 0) {
        out.push(fila);
        oculto = !abiertos.has(fila.nodo.id);
      } else if (!oculto) {
        out.push(fila);
      }
    }
    return out;
  }, [visibles, abiertos]);

  if (!elementos || elementos.length === 0) {
    return (
      <section data-testid="indice-estructura" role="status" style={{ padding: 'var(--space-6)', color: 'var(--color-text-tertiary)' }}>
        Abrí un documento para ver su estructura.
      </section>
    );
  }

  return (
    <section
      data-testid="indice-estructura"
      style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden' }}
    >
      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-1)',
          padding: 'var(--space-3) var(--space-3) var(--space-2)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <ListTree size={16} strokeWidth="var(--icon-stroke)" aria-hidden style={{ color: 'var(--color-accent)' }} />
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Esquema y Jerarquía de Secciones
          </h2>
        </div>
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
          {filas.length} secciones detectadas{nivelMaximo > 0 ? ` · Nivel 1 a ${nivelMaximo}` : ''}
        </p>
      </header>

      {fases.length > 0 ? (
        <div role="group" aria-label="Foco por fase" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', padding: 'var(--space-2) var(--space-3)' }}>
          <button
            type="button"
            aria-pressed={filtro === 'todas'}
            onClick={() => setFiltro('todas')}
            style={estiloChip(filtro === 'todas')}
          >
            Todas
          </button>
          {fases.map((f) => (
            <button
              key={f.clave}
              type="button"
              aria-pressed={filtro === f.clave}
              onClick={() => setFiltro(f.clave)}
              style={estiloChip(filtro === f.clave)}
            >
              {f.etiqueta}
            </button>
          ))}
        </div>
      ) : null}

      {filas.length === 0 ? (
        <div role="status" style={{ padding: 'var(--space-4) var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
          Este documento no tiene encabezados: no hay estructura que medir.
        </div>
      ) : (
        <div role="list" style={{ overflowY: 'auto', minHeight: 0, flex: 1 }}>
          {filasVisibles.map((fila) => (
            <div key={fila.nodo.id} style={{ display: 'flex', alignItems: 'flex-start' }}>
              {fila.profundidad === 0 && fila.nodo.hijos.length > 0 ? (
                <button
                  type="button"
                  onClick={() => toggle(fila.nodo.id)}
                  aria-expanded={abiertos.has(fila.nodo.id)}
                  aria-label={`${abiertos.has(fila.nodo.id) ? 'Contraer' : 'Expandir'} ${fila.nodo.titulo}`}
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
                  {abiertos.has(fila.nodo.id) ? (
                    <ChevronDown size={14} strokeWidth="var(--icon-stroke)" aria-hidden />
                  ) : (
                    <ChevronRight size={14} strokeWidth="var(--icon-stroke)" aria-hidden />
                  )}
                </button>
              ) : (
                <span aria-hidden style={{ flex: '0 0 auto', width: 22 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <NodoIndice
                  nodo={fila.nodo}
                  diagnostico={fila.diagnostico}
                  profundidad={fila.profundidad}
                  onSelect={onSelect}
                  seleccionado={fila.nodo.id === nodoSeleccionadoId}
                  titulo={fila.nodo.elementoId ? textosTitulo?.get(fila.nodo.elementoId) : undefined}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

const estiloChip = (activo: boolean): React.CSSProperties => ({
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--text-xs)',
  fontWeight: activo ? 600 : 400,
  color: activo ? 'var(--color-accent)' : 'var(--color-text-secondary)',
  background: activo ? 'var(--color-accent-soft)' : 'transparent',
  border: '1px solid ' + (activo ? 'var(--color-accent)' : 'var(--color-border-subtle)'),
  borderRadius: 'var(--radius-full)',
  padding: '2px var(--space-2)',
  cursor: 'pointer',
});

export default IndiceEstructura;
