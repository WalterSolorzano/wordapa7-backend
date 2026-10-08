/* WordAPA7 — Revisión Status Badge (sin confidence scores, sin métricas internas)
   Per plan §0.4/§1.9: los confidence scores NO se muestran al usuario final.
   Este badge solo comunica el estado de revisión necesario. */

import React from 'react';

interface ReviewStatusBadgeProps {
  confidence: number;
  isUserModified?: boolean;
  needsReview?: boolean;
}

export const ReviewStatusBadge: React.FC<ReviewStatusBadgeProps> = ({ confidence, isUserModified, needsReview }) => {
  const requiresReview = needsReview ?? confidence < 0.85;

  if (isUserModified) {
    return (
      <span style={{
        fontSize: '10px', fontWeight: 600,
        backgroundColor: 'rgba(250,173,20,0.14)', color: 'var(--color-warning)',
        padding: '2px 8px', borderRadius: '4px',
        border: '1px solid rgba(250,173,20,0.4)',
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        whiteSpace: 'nowrap',
      }} title="Has editado este elemento manualmente. El sistema respeta tus cambios.">
        <span style={{ fontSize: '12px', lineHeight: 1 }}>️</span>
        <span>Editado</span>
      </span>
    );
  }

  if (requiresReview) {
    return (
      <span style={{
        fontSize: '10px', fontWeight: 600,
        backgroundColor: 'rgba(255,77,79,0.12)', color: 'var(--color-danger)',
        padding: '2px 8px', borderRadius: '4px',
        border: '1px solid rgba(255,77,79,0.4)',
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        whiteSpace: 'nowrap',
      }} title="Por favor revisa este elemento y confirma su tipo.">
        <span style={{ fontSize: '12px', lineHeight: 1 }}></span>
        <span>Revisar</span>
      </span>
    );
  }

  return null;
};

export const ConfidenceBadge = ReviewStatusBadge;
export default ReviewStatusBadge;
