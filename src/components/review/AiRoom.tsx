/* WordAPA7 — Sala de IA, contenedor presentacional (IA-L0). El nivel
   (detalle L1 y vista previa) vive en el orquestador; acá solo se arma el
   perfil y se pinta el tablero. */
import React from 'react';
import type { AIReviewResult } from '../../api/backend';
import type { ElementModel } from '../../types';
import { construirPerfilIA } from '../../lib/aiPerfil';
import { AiDashboard } from './AiDashboard';

export interface AiRoomProps {
  reviewResult: AIReviewResult | null;
  elements: readonly ElementModel[];
  onOpenSection: (h1Id: string) => void;
  onOpenPreview: () => void;
  onExit: () => void;
}

export const AiRoom: React.FC<AiRoomProps> = ({ reviewResult, elements, onOpenSection, onOpenPreview, onExit }) => {
  const perfil = construirPerfilIA(reviewResult?.paragraphs ?? [], elements);
  return (
    <AiDashboard
      perfil={perfil}
      onOpenSection={onOpenSection}
      onOpenPreview={onOpenPreview}
      onBack={onExit}
    />
  );
};

export default AiRoom;
