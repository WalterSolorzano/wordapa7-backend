import React from 'react';

export interface HumanMascotProps {
  size?: number;
}

/** El personaje humano de la puerta de Fase 5: morena, pelo desordenado y
 *  levantado, camisa celeste abierta con botones desabotonados, parche en un
 *  ojo, cuerpo completo con piernas y zapatos. Vive en `components/layout`
 *  como la familia editorial; sus colores son tokens declarados. */
export const HumanMascot: React.FC<HumanMascotProps> = ({ size = 64 }) => (
  <svg
    width={size}
    height={Math.round((size * 84) / 64)}
    viewBox="0 0 64 84"
    className="human-mascot"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    style={{ display: 'block' }}
  >
    <path className="human-mascot-shirt" d="M22 33 C16 36 15 48 18 54" />
    <circle className="human-mascot-skin" cx="18.5" cy="55.5" r="2.7" />
    <path className="human-mascot-shirt" d="M42 33 C48 36 49 48 46 54" />
    <circle className="human-mascot-skin" cx="45.5" cy="55.5" r="2.7" />
    <path className="human-mascot-pants" d="M23 57 L41 57 L41 73 L33.5 73 L32 65 L30.5 73 L23 73 Z" />
    <path className="human-mascot-shoe" d="M22 72.5 h9.5 v3.2 a2.2 2.2 0 0 1 -2.2 2.2 h-5.1 a2.2 2.2 0 0 1 -2.2 -2.2 Z" />
    <path className="human-mascot-shoe" d="M32.5 72.5 h9.5 v3.2 a2.2 2.2 0 0 1 -2.2 2.2 h-5.1 a2.2 2.2 0 0 1 -2.2 -2.2 Z" />
    <path className="human-mascot-shirt" d="M22 32 Q32 28 42 32 L44 56 Q44 58 42 58 L22 58 Q20 58 20 56 Z" />
    <path className="human-mascot-skin" d="M27.5 31 L32 46 L36.5 31 Z" />
    <path className="human-mascot-seam" d="M27.5 31 L31 45" />
    <path className="human-mascot-seam" d="M36.5 31 L33 45" />
    <circle className="human-mascot-btn" cx="30.4" cy="35" r="1.05" />
    <circle className="human-mascot-btn" cx="30.9" cy="40" r="1.05" />
    <circle className="human-mascot-btn" cx="31.3" cy="45" r="1.05" />
    <rect className="human-mascot-skin" x="29.5" y="24" width="5" height="6" rx="2.2" />
    <ellipse className="human-mascot-skin" cx="32" cy="16" rx="10.5" ry="10.5" />
    <path className="human-mascot-hair" d="M21.5 15 C19 4 26 1.5 32 1.5 C38 1.5 45 4 42.5 15 C42 10 39.5 8 37.5 9 C39.5 5 34 3.5 31.5 5 C29 3.5 24.5 5 26.5 9 C24.5 8 22 10 21.5 15 Z" />
    <path className="human-mascot-hair" d="M24 6 C21.5 2.5 24.5 1 27 2.2" />
    <path className="human-mascot-hair" d="M40 6 C42.5 2.5 39.5 1 37 2.2" />
    <path className="human-mascot-hair" d="M31 2 C31.3 0.3 33.7 0.4 33.5 2" />
    <path className="human-mascot-strap" d="M20.5 12.5 L43 11" />
    <ellipse className="human-mascot-patch" cx="27" cy="15" rx="4.6" ry="4.8" />
    <circle className="human-mascot-eye" cx="36.5" cy="15" r="1.6" />
    <path className="human-mascot-mouth" d="M28.5 20.5 H35.5" />
  </svg>
);

export default HumanMascot;
