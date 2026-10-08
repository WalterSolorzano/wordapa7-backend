/* WordAPA7 — qué le falta a APA 7, y qué se puede corregir ahí.
 *
 * ESTO YA SE CALCULABA EN PYTHON Y SE TIRABA. `python/modules/phase_scope.py`
 * sabe qué títulos abren qué fase, y `match_phase_exact` distingue un H2 mal
 * nivelado de uno que el autor puso a propósito. Para un redactor, esa es
 * exactamente la distinción que hace falta antes de escribir, y hoy no la
 * muestra nadie.
 *
 * DOS REGLAS, Y LAS DOS SALEN DE COMPARAR TÍTULOS.
 *
 * 1. H2 mal nivelado: un encabezado de nivel 2 o más cuyo título ES el nombre
 *    de una fase. "Resultados" a secas es una fase mal puesta y se propone
 *    promover; "Resultados de la encuesta" lleva un calificador que avisa de
 *    que el autor quiso decir algo concreto, y se deja quieto. Un motor que
 *    promoviera los dos sería peor que uno que no promoviera ninguno.
 *
 * 2. Fase requerida: una fase de la lista que el documento no abre. Y la lista
 *    ENTRA POR PROPÓSITO, no es una constante de este archivo. El plan daba por
 *    hecho que `RULE_SCOPES` la tenía: no la tiene —`RULE_SCOPES` declara el
 *    ámbito de cada REGLA, y no qué secciones exige APA 7— y no hay endpoint
 *    que la exponga. Escribirla acá sería la sexta copia de una tabla que es de
 *    otro, así que la lista la trae quien la tenga, y sin lista esta pantalla
 *    no inventa dieciocho capítulos para escribir.
 *
 * NINGUNA DE LAS DOS DECIDE EL ÁMBITO MIRANDO EL CUERPO de un párrafo.
 * `AGENTS.md` §1 lo prohíbe, y por una razón concreta: "meta" estaba dentro de
 * "metodología", así que un párrafo que hablaba de metodología disparaba la
 * regla de objetivos. Acá la comparación es contra el título y nada más.
 *
 * Y LA ACCIÓN DE PROMOVER ES REAL. Va por `updateElementType` del store, que
 * termina en `POST /api/update-element` con el `heading_level` nuevo, y el
 * store se reponer con la respuesta del servidor. Un botón que actualiza el
 * estado local y no el documento sería peor que no tener botón, porque ocupa el
 * lugar del que sí funciona.
 *
 * LO QUE NO HAY: un botón para "agregar" la fase que falta. No hay endpoint que
 * inserte un capítulo en un documento que no lo tiene, y no se va a simular
 * ninguno. La fila lo dice y ahí queda: escribir un capítulo es del autor.
 */

import React from 'react';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { faseDeTitulo, type NodoJerarquia, type VocabularioFases } from '../../lib/jerarquia';
/* El nombre de una fase lo dice UNA función, `phaseLabel` de `auditItems`, que
   es la que pintan la tira de filtros y el rack. Escribir el nombre aquí sería
   una copia más, y una que divergiría el día que el backend cambie el rótulo. */
import { phaseLabel } from '../../lib/auditItems';
import { useDocStore } from '../../store/useDocStore';

export type FaltaApa7 = {
  clase: 'fase-requerida' | 'h2-mal-nivelado';
  /** El motivo en palabras, con el nombre real del título cuando hay uno. */
  detalle: string;
  /** El nodo al que apunta, o `null` cuando no hay ninguno: una fase que
   *  falta no tiene un lugar en el documento, tiene un hueco. */
  nodoId: string | null;
  /** La acción que se puede hacer AHORA, o `null` si no hay ninguna. */
  accion: 'promover' | 'agregar' | null;
};

/**
 * Las faltas del documento.
 *
 * `fasesRequeridas` es la lista de quienes la App exige la estructura, y llega
 * como argumento. Sin ella, `fase-requerida` no se puede calcular y no se
 * calcula: la ausencia de la lista es ausencia de dato, no evidencia de que
 * falten veinte capítulos.
 */
export function faltasApa7(
  raices: readonly NodoJerarquia[],
  fasesRequeridas: readonly string[] = [],
  vocabulario?: VocabularioFases,
): FaltaApa7[] {
  const faltas: FaltaApa7[] = [];

  /* 1. Los H2 (y H3) mal nivelados. El nivel 1 no se mira: un H1 se supone
     que abre fases, y si no abre ninguna es una sección cualquiera, no un
     defecto. */
  const recorrer = (nodos: readonly NodoJerarquia[]): void => {
    for (const n of nodos) {
      if (n.nivel >= 2) {
        const fase = faseDeTitulo(n.titulo, true, vocabulario);
        if (fase) {
          faltas.push({
            clase: 'h2-mal-nivelado',
            detalle:
              `"${n.titulo}" es el nombre de la fase ${phaseLabel(fase)} y está como ` +
              `H${n.nivel}. Parece una fase mal puesta`,
            nodoId: n.id,
            accion: 'promover',
          });
        }
      }
      recorrer(n.hijos);
    }
  };
  recorrer(raices);

  /* 2. Las fases requeridas que el documento NO abre.
   *
   * La comparación es contra la fase que abre cada H1, que es el atributo del
   * árbol. Nunca contra el texto de un párrafo, y nunca contra un H2: un H2
   * hereda la de su ancestro, así que contarlo dos veces no cambiaría el
   * resultado y sí haría creer que la fase la abre algo que no la abre. */
  if (fasesRequeridas.length > 0) {
    const abiertas = new Set<string>();
    for (const raiz of raices) if (raiz.fase) abiertas.add(raiz.fase);
    for (const fase of fasesRequeridas) {
      if (abiertas.has(fase)) continue;
      faltas.push({
        clase: 'fase-requerida',
        detalle: `Falta la fase ${phaseLabel(fase)}: ningún H1 del documento la abre`,
        nodoId: null,
        /* `null` y no 'agregar': no existe endpoint que inserte un capítulo, y
         * un botón que no inserta nada es la clase de defecto que este
         * proyecto vino a matar. */
        accion: null,
      });
    }
  }

  return faltas;
}

/**
 * Promover un encabezado a H1, DE VERDAD.
 *
 * Va por el store, no por un `setState` local: `updateElementType` llama a
 * `POST /api/update-element` con el `heading_level` nuevo y reemplaza el
 * documento con la respuesta del servidor. El `.docx` sale con el H1 porque el
 * nivel cambió en el servidor, y no porque esta pantalla lo haya escrito.
 */
export function promoverPorDefecto(nodo: NodoJerarquia): Promise<void> | void {
  if (!nodo.elementoId) return;
  return useDocStore.getState().updateElementType(nodo.elementoId, 'heading', 1, nodo.titulo);
}

/** El nodo de una lista de faltas, buscado en TODO el árbol.
 *
 * Buscar solo en las raíces sería el error fácil: el nodo que se promueve es un
 * H2, y un H2 no es una raíz. Con la búsqueda a medias, el botón no aparece
 * nunca —que es el modo de fallo silencioso más barato que hay—. */
function buscarPorId(raices: readonly NodoJerarquia[], id: string): NodoJerarquia | null {
  for (const r of raices) {
    if (r.id === id) return r;
    const hijo = buscarPorId(r.hijos, id);
    if (hijo) return hijo;
  }
  return null;
}

export interface FaltasApa7Props {
  raices: readonly NodoJerarquia[];
  /** La lista de fases que la App exige, si alguien la tiene. */
  fasesRequeridas?: readonly string[];
  vocabulario?: VocabularioFases;
  /** Quién promueve. Por omisión, el store, que pega al backend. */
  onPromover?: (nodo: NodoJerarquia) => void | Promise<void>;
  onSelect?: (nodoId: string) => void;
}

export const FaltasApa7: React.FC<FaltasApa7Props> = ({
  raices,
  fasesRequeridas,
  vocabulario,
  onPromover,
  onSelect,
}) => {
  const faltas = faltasApa7(raices, fasesRequeridas ?? [], vocabulario);
  const promover = onPromover ?? promoverPorDefecto;

  return (
    <section
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
      aria-label="Faltas de APA 7"
    >
      {faltas.length === 0 ? (
        <p role="status" style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          <CircleCheck
            size={14}
            strokeWidth="var(--icon-stroke)"
            aria-hidden
            style={{ marginRight: '6px', verticalAlign: '-2px', color: 'var(--color-success)' }}
          />
          No falta nada de lo que se puede revisar.
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {faltas.map((f) => {
            const nodo = f.nodoId ? buscarPorId(raices, f.nodoId) : null;
            /* El botón existe SOLO si la acción existe. Un botón que no hace
             * nada ocupa el lugar del que sí. */
            const puedePromover = f.accion === 'promover' && nodo !== null;
            return (
                <li
                  key={`${f.clase}-${f.nodoId ?? f.detalle}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    padding: 'var(--space-2) var(--space-3)',
                    backgroundColor: 'var(--severity-warning-soft)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-warning)',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <TriangleAlert
                    size={14}
                    strokeWidth="var(--icon-stroke)"
                    aria-hidden
                    style={{ flex: '0 0 auto', color: 'var(--color-warning)' }}
                  />
                  <span style={{ flex: '1 1 auto', minWidth: 0, color: 'var(--color-text-primary)' }}>{f.detalle}</span>
                  {puedePromover && (
                    <button
                      type="button"
                      onClick={() => {
                        void promover(nodo);
                      }}
                      style={{
                        flex: '0 0 auto',
                        font: 'inherit',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        color: 'var(--color-text-on-accent)',
                        background: 'var(--color-accent)',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        padding: '4px 10px',
                        cursor: 'pointer',
                        transition: 'background var(--transition-fast)',
                      }}
                    >
                      Promover a H1
                    </button>
                  )}
                  {!puedePromover && f.clase === 'fase-requerida' && (
                    <span
                      style={{
                        flex: '0 0 auto',
                        fontSize: '11px',
                        color: 'var(--color-text-tertiary)',
                        maxWidth: '26ch',
                      }}
                    >
                      Agregar la sección es del autor: la app no inserta capítulos.
                    </span>
                  )}
                  {nodo && onSelect && (
                    <button
                      type="button"
                      onClick={() => onSelect(nodo.id)}
                      style={{
                        flex: '0 0 auto',
                        font: 'inherit',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-text-secondary)',
                        background: 'var(--color-bg-surface)',
                        border: '1px solid var(--color-border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '4px 8px',
                        cursor: 'pointer',
                      }}
                    >
                      Ver la rama
                    </button>
                  )}
                </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default FaltasApa7;
