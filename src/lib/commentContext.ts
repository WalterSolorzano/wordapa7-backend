/* WordAPA7 — contexto de comentarios del lienzo.
   UNA sola construcción para los DOS canales que muestran un hallazgo: el
   subrayado inline (`ReadingText`, en `components/review/`) y las burbujas del
   gutter (`WhatsAppComment`). Los dos leen el `commentCtx` que sale de acá, así
   que si un hallazgo se anuncia tiene que subrayarse, y viceversa.
   La regla de styleAuditRun incluye el corrector: si solo corrió proofread, hay
   burbuja y tiene que haber subrayado, o el hallazgo queda resaltado a medias. */

import type { WhatsAppContext } from '../components/layout/WhatsAppComment';
import type { AIReviewResult } from '../api/backend';
import type { ProofreadFinding, ValidationIssue } from '../types';

/** Subconjunto del store que necesita la construcción del contexto. */
export interface CommentContextSource {
  citationAuditResult: { ghost_citations: any[]; orphan_references: any[] } | null;
  validationIssues: ValidationIssue[] | null | undefined;
  /** Opcional a propósito: quien llama pasa el valor crudo del store y la
   *  normalización vive acá. `undefined` (store sin la tecla) se trata como
   *  habilitado, igual que el `!== false` que ya usaban dos de los tres
   *  llamadores: sin sugerencias solo significa "el usuario las apagó". */
  sugerenciasProactivas?: boolean;
  reviewResult: AIReviewResult | null;
  proofreadFindings: ProofreadFinding[];
}

/**
 * EL ALCANCE DEL INTERRUPTOR "Sugerencias proactivas", escrito porque la
 * unificación de los dos canales tuvo que elegir y no puede ser una elección
 * invisible:
 *
 * El interruptor cubre las INCIDENCIAS DE VALIDACIÓN —las que el corredor
 * produce: leyendas, tablas, jerarquía— y nada más. Eso es lo que hizo siempre
 * (el lienzo forzaba `styleAuditRun: false` en esa rama) y es lo que su
 * nombre dice: sugerencias proactivas sobre el documento.
 *
 * `styleAuditRun` es OTRA cosa: los detectores de redacción (primera persona,
 * muletillas, cierre) y el corrector. Apagarlo con el interruptor dejaría al
 * corrector con su subrayado inline —`ReadingText` los dibuja desde
 * `proofreadFindings`, no desde `styleAuditRun`— y SIN la burbuja que lo
 * anuncia. Eso es exactamente la contradicción que AGENTS.md §2 prohíbe por
 * nombre ("nada de decidir 'este tipo de elemento no lleva subrayado' solo en
 * un canal"), y sería un hallazgo subrayado en un canal y ausente en el otro.
 * Por eso el corrector NO se apaga con el interruptor: los dos van juntos o
 * dejarían de ir juntos.
 *
 * Para cambiar el alcance hay que cambiar las dos líneas de abajo Y la aserción
 * de `commentContext.test.ts` que nombra este párrafo.
 */
export function buildCommentContext(s: CommentContextSource): WhatsAppContext {
  return {
    ghostCitations: s.citationAuditResult?.ghost_citations || [],
    orphanReferences: s.citationAuditResult?.orphan_references || [],
    // Normalizar DENTRO: los dos canales (subrayado y burbuja) tienen que
    // coincidir, y eso no puede depender de que cada llamador se acuerde.
    validationIssues: s.sugerenciasProactivas === false ? [] : s.validationIssues || [],
    // Corrector O revisor de IA habilitan los comentarios de estilo: sin esto,
    // un hallazgo del corrector se anunciaba en una burbuja sin subrayado.
    // Deliberadamente NO depende de `sugerenciasProactivas` (ver arriba).
    // El `|| []` tolera un store que llegue sin el array (setState parcial).
  /* Corrector O revisor de IA habilitan los comentarios de estilo: sin esto, un
     hallazgo del corrector se anunciaba en una burbuja sin subrayado.
     Deliberadamente NO depende de `sugerenciasProactivas` (ver arriba).
     El `|| []` tolera un store que llegue sin el array (setState parcial). */
  styleAuditRun: !!s.reviewResult || (s.proofreadFindings || []).length > 0,
  };
}
