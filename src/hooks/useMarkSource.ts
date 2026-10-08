/* WordAPA7 — review: origen de marcas, una sola vez.
   Los DOS canales que muestran un hallazgo (el lienzo, `PaperCanvas`, y la
   tarjeta de lectura, `FocusReadingCard`) leen de acá. Antes cada uno armaba su
   propio `MarkSource`: seis campos del store que había que mantener
   sincronizados a mano, y una bandera de citas que uno fijaba en `true` y el
   otro tomaba de su estado local. Apagar las citas en el lienzo dejaba a la
   tarjeta subrayándolas: un defecto, dos canales, dos verdades, que es lo que
   AGENTS.md §2 prohíbe.

   Dos piezas, y la separación es a propósito:
   - `useMarkSourceBase()` lee el store UNA vez y memoiza lo que no depende del
     elemento. Un componente lo llama una vez; el lienzo, una vez por hoja.
   - `buildMarkSource(base, elem)` es puro: el lienzo lo llama por elemento.

   Nadie más construye un `MarkSource`: si un tercer canal aparece, usa estas
   dos funciones o no dice nada. */

import { useMemo } from 'react';
import { useDocStore } from '../store/useDocStore';
import { buildCommentContext } from '../lib/commentContext';
import type { MarkSource } from '../components/review/ReadingText';
import type { WhatsAppContext } from '../components/layout/WhatsAppComment';
import type { ElementModel, ProofreadFinding } from '../types';
import type { AIReviewResult } from '../api/backend';

/** Lo que un párrafo necesita del documento, sin el párrafo. */
export interface MarkSourceBase {
  reviewResult: AIReviewResult | null;
  proofreadFindings: ProofreadFinding[];
  commentCtx: WhatsAppContext;
  showCitations: boolean;
  dismissedCommentIds: string[];
}

export function useMarkSourceBase(): MarkSourceBase {
  const reviewResult = useDocStore((s) => s.reviewResult);
  const proofreadFindings = useDocStore((s) => s.proofreadFindings);
  const citationAuditResult = useDocStore((s) => s.citationAuditResult);
  const validationIssues = useDocStore((s) => s.validationIssues);
  const sugerenciasProactivas = useDocStore((s) => s.sugerenciasProactivas);
  const dismissedCommentIds = useDocStore((s) => s.dismissedCommentIds);
  const showCitations = useDocStore((s) => s.showCitationMarks);

  return useMemo(
    () => ({
      reviewResult,
      proofreadFindings,
      // Mismo constructor que las burbujas del gutter: si hay burbuja, hay
      // subrayado, y esa Normalización vive en `buildCommentContext`, no en
      // quien lo llama.
      commentCtx: buildCommentContext({
        citationAuditResult,
        validationIssues,
        sugerenciasProactivas,
        reviewResult,
        proofreadFindings,
      }),
      showCitations,
      dismissedCommentIds,
    }),
    [reviewResult, proofreadFindings, citationAuditResult, validationIssues, sugerenciasProactivas, dismissedCommentIds, showCitations],
  );
}

/**
 * El `MarkSource` de UN elemento. `elem` puede faltar (una referencia huérfana
 * no tiene párrafo que pintar): los motores que se anclan en el elemento no se
 * evalúan sin él, en vez de casar contra un id inventado.
 */
export function buildMarkSource(base: MarkSourceBase, elem?: ElementModel): MarkSource {
  return { ...base, elem };
}
