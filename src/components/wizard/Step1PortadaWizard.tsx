/* WordAPA7 — Paso 1: Portada (Estudio Carrusel de Diseños).
   Mapea el modulo independiente de portadas en la vista central, mostrando
   el carrusel de diseños (APA 7, UNI, Original/Personalizada) con dos-way binding
   en tiempo real sobre los datos del panel lateral. */

import React from 'react';
import { CoverCarouselStudio } from './CoverCarouselStudio';

export const Step1PortadaWizard: React.FC = () => {
  return (
    <div style={{ position: 'relative', flex: 1, height: '100%', overflow: 'hidden', backgroundColor: 'var(--canvas-bg)' }}>
      <CoverCarouselStudio />
    </div>
  );
};

export default Step1PortadaWizard;
