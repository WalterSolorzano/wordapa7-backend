/* WordAPA7 — shell: "lo que le falta" por fase, en UNA sola derivación.
   Existían tres: el rail, el atajo de teclado (`pendingCountForPhase`) y la
   pantalla de Revisión. Los tres contaban cosas distintas, así que el rail
   llegaba a Revisión & IA con un punto verde y la palabra "Listo" encima de
   tres figuras sin rotular, y la portada con "Sin pendientes" encima de una
   portada sin título ni autor.

   Aquí vive la lista. `useRailDestinations` la pinta, `App.pendingCountForPhase`
   la consulta para saltar de fase, y `collectAuditItems` —la función que abre
   el workbench— es la misma que cuenta la fase 5. Si mañana un motor nuevo
   entra a la pantalla, entra a esta función y el rail no puede quedarse atrás. */

import { reviewItems } from './auditItems';
import { needsReview } from './portadaAuthors';
import type { ActaDocumento, ElementModel, PortadaData, ProofreadFinding } from '../types';

export interface PhaseState {
  /** Cuántas cosas accionables le quedan al usuario en la fase. */
  pending: number;
  /** La fase está resuelta: no le queda nada por hacer. */
  done: boolean;
}

export interface RailPendingInput {
  /** Sin documento no hay fases que contar: `null` es la respuesta de todas. */
  hasDoc: boolean;
  portada: PortadaData | null;
  /** El acta. El autor es un campo que el paso 1 pide y no vive en la portada
   *  (ver `python/models.py`): sin esto el rail diria "listo" sobre un documento
   *  sin autor, que es exactamente la contradiccion que este archivo existe
   *  para que no vuelva. */
  acta?: ActaDocumento | null;
  /** El usuario confirmó la configuración de portada en el paso 1. */
  coverSetupDone: boolean;
  elements: readonly ElementModel[];
  hasReferences: boolean;
  reviewResult: { paragraphs?: { element_id?: string; text?: string; ai_score?: number; ai_category?: string }[] } | null;
  proofreadFindings: readonly ProofreadFinding[];
  citationAuditResult: { ghost_citations?: unknown[]; orphan_references?: unknown[] } | null;
  /** Los hallazgos que la persona ya descartó en la pantalla. El rail no puede
   *  seguir contándolos: si lo hiciera, la fase 5 quedaría "pendiente" después
   *  de que el usuario la dejó limpia, que es la misma contradicción de siempre
   *  con el signo cambiado. */
  dismissedFindingIds?: readonly string[];
}

/* Figuras y tablas que la fase 3 puede resolver: numeradas y sin error de
   render. Una figura que no se pudo insertar no es "pendiente de rotular": es
   un problema de Another Word, y mandarla a esta fase sería prometer un trabajo
   que la pantalla no puede hacer. */
const figuraAccionable = (e: ElementModel): boolean => {
  if (e.type === 'image') {
    const info = e.image_info as (ElementModel['image_info'] & { render_error?: unknown }) | undefined;
    return !!info && (info.figure_number || 0) > 0 && !info.render_error;
  }
  if (e.type === 'table') {
    return (e.table_info?.table_number || 0) > 0;
  }
  return false;
};

/** Campos de portada sin contenido: es lo que el paso 1 pide antes de seguir. */
export const countPortadaPending = (
  portada: PortadaData | null,
  acta: ActaDocumento | null = null,
): number => {
  if (!portada) return 0;
  let pending = 0;
  if (!portada.title?.trim()) pending++;
  /* El autor es del acta y no de la portada (ver `python/models.py`). El rail
     cuenta lo mismo que la pantalla a la que lleva, asi que si el campo se
     mudó de lugar y acá no, el rail dice "listo" sobre un documento sin autor.
     Por eso el acta es un parámetro y no un segundo `portada` inventado. */
  const autor = acta?.autor?.trim() || '';
  if (!autor) pending++;
  return pending;
};

/**
 * El estado de CADA fase del asistente, en una sola pasada.
 * La 6 (Exportar) no aparece: no tiene nada pendiente que contar, y el rail la
 * muestra sin estado en vez de fingir un cero.
 */
export function readPhaseStates(input: RailPendingInput): Record<number, PhaseState> {
  if (!input.hasDoc) return {};

  const headings = input.elements.filter((e) => e.type === 'heading' && needsReview(e)).length;
  const figures = input.elements.filter((e) => figuraAccionable(e) && needsReview(e)).length;
  const review = reviewItems(
    {
      elements: input.elements,
      reviewResult: input.reviewResult,
      proofreadFindings: input.proofreadFindings,
      citationAuditResult: input.citationAuditResult,
    },
    undefined,
    input.dismissedFindingIds,
  ).length;

  // La portada tiene dos verdades —los campos vacíos y la confirmación del
  // usuario— y si no seajan con una, un "Listo" puede convivir con dos campos
  // en blanco. Confirmada manda: el usuario ya dijo que así la quiere.
  const portada = input.coverSetupDone ? 0 : countPortadaPending(input.portada, input.acta);

  return {
    1: { pending: portada, done: input.coverSetupDone },
    2: { pending: headings, done: headings === 0 },
    3: { pending: figures, done: figures === 0 },
    4: { pending: 0, done: input.hasReferences },
    5: { pending: review, done: review === 0 },
  };
}

/** La misma cuenta, para quien solo necesita el número de una fase. */
export function pendingCountForPhase(input: RailPendingInput, phase: number): number {
  return readPhaseStates(input)[phase]?.pending ?? 0;
}
