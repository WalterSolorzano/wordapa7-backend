import type React from 'react';

/** Bloque del listado de referencias: papel, doble espacio, alineado a la izquierda. */
export const APA_LISTA: React.CSSProperties = {
  fontFamily: "'Times New Roman', Times, serif",
  fontSize: '12pt',
  lineHeight: 2,
  textAlign: 'left',
  wordBreak: 'break-word',
  whiteSpace: 'normal',
};

/** Una entrada: sangría francesa 1.27 cm. Nunca se centra ni se justifica. */
export const APA_ENTRADA: React.CSSProperties = {
  margin: 0,
  paddingLeft: '0.5in',
  textIndent: '-0.5in',
  textAlign: 'left',
  lineHeight: 2,
  wordBreak: 'break-word',
};
