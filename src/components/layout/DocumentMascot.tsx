/* WordAPA7 — Adaptador compatible para la familia editorial de mascotas.
 * Mantiene la API histórica mientras EditorialMascot concentra las variantes.
 */

import React from 'react';
import { useDocStore } from '../../store/useDocStore';
import { EditorialMascot, MascotExpression, MascotKind } from './EditorialMascot';

export type { MascotExpression, MascotKind } from './EditorialMascot';

/** Mantiene la firma para compatibilidad pero retorna estado de salud. */
export function getMascotExpression(): MascotExpression {
  const s = useDocStore.getState();
  if (!s.doc || s.doc.elements.length === 0) return 'neutral';

  const ghost = s.citationAuditResult?.ghost_citations?.length || 0;
  const orphan = s.citationAuditResult?.orphan_references?.length || 0;
  const errors = (s.validationIssues || []).filter(
    (i: any) => i.severity === 'error' || i.status === 'error' || i.status === 'ERROR',
  ).length;
  const flagged = s.doc.elements.filter((e) => (e.ai_score || 0) >= 0.5).length;

  const problems = ghost + orphan + errors + flagged;
  if (problems === 0) return s.doc.elements.length >= 10 ? 'excited' : 'happy';
  if (problems <= 3) return 'curious';
  return 'worried';
}

interface MascotProps {
  size?: number;
  expression?: MascotExpression;
  kind?: MascotKind;
}

export const DocumentMascot: React.FC<MascotProps> = ({ size = 44, expression = 'neutral', kind = 'highlighter' }) => (
  <EditorialMascot size={size} expression={expression} kind={kind} />
);

export default DocumentMascot;
