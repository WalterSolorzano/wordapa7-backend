/* WordAPA7 — Onboarding como tooltips (Layer 4)
   Reemplaza el modal de bienvenida por tooltips no bloqueantes que explican
   dónde vive la actividad del documento (panel derecho Actividad) y el flujo
   guiado. No rebrandea paneles: solo orienta la primera vez. */

import React, { useState } from 'react';
import { useDocStore } from '../../store/useDocStore';
import { X } from 'lucide-react';

const TOOLTIP_STYLE: React.CSSProperties = {
  position: 'fixed',
  zIndex: 9990,
  maxWidth: '280px',
  backgroundColor: 'var(--surface-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: '12px 14px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
  fontSize: '12px',
  color: 'var(--text-main)',
  lineHeight: 1.5,
};

export const OnboardingTour: React.FC = () => {
  return null;
};

export default OnboardingTour;
