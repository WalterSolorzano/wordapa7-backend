import React from 'react';
import type { ReferenciaModel } from '../../types';
import { APA_ENTRADA } from '../../lib/apaLayout';

/** Dibuja la línea APA desde los segmentos del backend; sin recomponer nada.
 *
 * El prop se llama `referencia` y NO `ref`: en React 18 `ref` es un prop
 * reservado, React lo intercepta y el componente lo recibe `undefined`.
 */
export interface ReferenciaLineaProps extends React.HTMLAttributes<HTMLElement> {
  referencia: ReferenciaModel;
  as?: 'p' | 'div';
}

export const ReferenciaLinea: React.FC<ReferenciaLineaProps> = ({
  referencia,
  as = 'p',
  style,
  ...rest
}) => {
  const Tag = as;
  const segments = referencia.apa_segments && referencia.apa_segments.length
    ? referencia.apa_segments.map((s) => ({
        ...s,
        text: s.text.replace(/[\r\n]+/g, ' '),
      }))
    : null;
  const plano = (referencia.formatted_apa || referencia.raw_text || '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
  return (
    <Tag style={{ ...APA_ENTRADA, ...style }} {...rest}>
      {segments
        ? segments.map((s, i) => (
            <span key={i} style={s.italic ? { fontStyle: 'italic' } : undefined}>
              {s.text}
            </span>
          ))
        : <span>{plano}</span>}
    </Tag>
  );
};

export default ReferenciaLinea;
