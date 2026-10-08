import React from 'react';

/* `gear` es el quinto kind y lo pidió la pestaña App. Vive en el union type y en
 * el Switch de abajo, o no vive: un kind declarado y no dibujado deja la mascota
 * en blanco, que es un fallo que no se ve. */
export type MascotKind = 'highlighter' | 'ruler' | 'reference' | 'strike' | 'gear';
export type MascotExpression = 'neutral' | 'happy' | 'excited' | 'curious' | 'worried';

/** Los ocho dientes del engranaje, en grados. Cada diente es el mismo rectángulo
 *  girado: el dentado sale de acá y no de ocho coordenadas escritas a mano. */
const DIENTES = [0, 45, 90, 135, 180, 225, 270, 315];

interface EditorialMascotProps {
  size?: number;
  kind?: MascotKind;
  expression?: MascotExpression;
}

interface FaceProps {
  expression: MascotExpression;
  x: number;
  y: number;
  scale?: number;
}

const Face: React.FC<FaceProps> = ({ expression, x, y, scale = 1 }) => (
  <g key={expression} transform={`translate(${x} ${y}) scale(${scale})`} className={`editorial-mascot-face editorial-mascot-face-${expression}`}>
    {/* El movimiento por expresión vive en un grupo interno: el `transform` de
        arriba posiciona la cara, y una animación de `transform` en el mismo
        elemento lo pisaría (CSS gana al atributo) y la cara saltaría al origen.
        El grupo interno anima su propia caja, no la posición. */}
    <g className={`editorial-mascot-motion editorial-mascot-motion-${expression}`}>
      <path className="editorial-mascot-brow" d="M-8 -5 C-5 -7 -3 -7 -1 -5" />
      <path className="editorial-mascot-brow" d="M5 -5 C7 -7 9 -7 12 -5" />
      <circle className="editorial-mascot-eye" cx="-5" cy="1" r="2.5" />
      <circle className="editorial-mascot-eye" cx="8" cy="1" r="2.5" />
      <circle className="editorial-mascot-glint" cx="-4.2" cy="0.2" r="0.7" />
      <circle className="editorial-mascot-glint" cx="8.8" cy="0.2" r="0.7" />
      {expression === 'excited' && <ellipse className="editorial-mascot-mouth-open" cx="1.5" cy="12" rx="5" ry="4" />}
      {expression === 'happy' && <path className="editorial-mascot-mouth" d="M-5 10 C-2 15 4 15 8 10" />}
      {expression === 'curious' && <path className="editorial-mascot-mouth" d="M-2 11 C1 9 4 12 7 10" />}
      {expression === 'worried' && <path className="editorial-mascot-mouth" d="M-5 15 C-1 11 4 11 8 15" />}
      {expression === 'neutral' && <path className="editorial-mascot-mouth" d="M-4 11 H7" />}
    </g>
  </g>
);

const Arms: React.FC<{ left?: boolean; right?: boolean }> = ({ left = true, right = true }) => (
  <g className="editorial-mascot-arms">
    {left && <path className="editorial-mascot-arm editorial-mascot-arm-left" d="M12 39 C6 40 6 47 11 49" />}
    {right && <path className="editorial-mascot-arm editorial-mascot-arm-right" d="M52 39 C58 40 58 47 53 49" />}
  </g>
);

export const EditorialMascot: React.FC<EditorialMascotProps> = ({
  size = 44,
  kind = 'highlighter',
  expression = 'neutral',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={`editorial-mascot editorial-mascot-kind-${kind} editorial-mascot-expression-${expression}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      {kind === 'highlighter' && (
        <>
          <Arms />
          <rect className="editorial-mascot-body editorial-mascot-highlighter-body" x="17" y="8" width="30" height="48" rx="9" />
          <rect className="editorial-mascot-highlighter-cap" x="16" y="5" width="32" height="12" rx="6" />
          <rect className="editorial-mascot-highlighter-mark" x="23" y="47" width="18" height="3" rx="1.5" />
          <Face expression={expression} x={32} y={31} />
        </>
      )}

      {kind === 'ruler' && (
        <>
          <Arms />
          <rect className="editorial-mascot-body editorial-mascot-ruler-body" x="5" y="23" width="54" height="18" rx="8" />
          <path className="editorial-mascot-ruler-ticks" d="M13 37 V31 M20 37 V33 M27 37 V31 M34 37 V33 M41 37 V31 M48 37 V33" />
          <Face expression={expression} x={32} y={28} scale={0.62} />
        </>
      )}

      {kind === 'reference' && (
        <>
          <Arms />
          <path className="editorial-mascot-reference-tail" d="M45 45 L53 55 L40 49" />
          <rect className="editorial-mascot-body editorial-mascot-reference-body" x="9" y="15" width="46" height="34" rx="10" />
          <path className="editorial-mascot-quote" d="M17 25 C14 21 16 18 20 19 M22 25 C19 21 21 18 25 19" />
          <path className="editorial-mascot-reference-lines" d="M18 41 H45 M25 37 H45" />
          <Face expression={expression} x={33} y={26} scale={0.62} />
        </>
      )}

      {kind === 'strike' && (
        <>
          <Arms />
          <path className="editorial-mascot-strike-tip" d="M5 25 L16 20 V44 L5 39 Z" />
          <rect className="editorial-mascot-body editorial-mascot-strike-body" x="12" y="21" width="47" height="22" rx="9" />
          <path className="editorial-mascot-strike-line" d="M17 48 H53" />
          <Face expression={expression} x={38} y={28} scale={0.68} />
        </>
      )}

      {/* El engranaje de la pestaña App. Los dientes son el mismo rectángulo ocho
          veces, girado alrededor del centro: es la forma más barata de dibujar un
          engranaje que se lee bien a 44px, y no necesita una tabla de 32
          coordenadas como sí la necesitaría un dentado de verdad. */}
      {kind === 'gear' && (
        <>
          <Arms />
          <g className="editorial-mascot-gear-dientes">
            {DIENTES.map((giro) => (
              <rect
                key={giro}
                className="editorial-mascot-gear-diente"
                x="29" y="6" width="6" height="7" rx="2"
                transform={`rotate(${giro} 32 32)`}
              />
            ))}
          </g>
          <circle className="editorial-mascot-body editorial-mascot-gear-body" cx="32" cy="32" r="20" />
          <Face expression={expression} x={32} y={32} scale={0.55} />
        </>
      )}
    </svg>
  );
};

export default EditorialMascot;
