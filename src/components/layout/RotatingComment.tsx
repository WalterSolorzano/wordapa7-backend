/* WordAPA7 — Comentario rotativo persistente.
 * Muestra las frases de la biblioteca (chistes, modos temáticos, curiosidades
 * APA) en lugares donde la pantalla de carga no llega: el usuario las ve
 * mientras trabaja, no solo esperando. Van en estilo "comentario" (burbuja
 * sutil +  + cursiva), sin comillas.
 */

import React, { useState, useEffect, useRef } from 'react';
import { JOKES, APA_FACTS, AI_JOKES, WORD_HELL_JOKES, STUDENT_JOKES } from './LoadingTips';

const POOL: string[] = [
  ...AI_JOKES,
  ...WORD_HELL_JOKES,
  ...STUDENT_JOKES,
  ...JOKES,
  ...APA_FACTS,
];

interface RotatingCommentProps {
  intervalMs?: number;
}

export const RotatingComment: React.FC<RotatingCommentProps> = ({ intervalMs = 14000 }) => {
  const [text, setText] = useState<string>(() => POOL[Math.floor(Math.random() * POOL.length)]);
  const idxRef = useRef(0);
  const [fadeKey, setFadeKey] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => {
      idxRef.current = (idxRef.current + 1) % POOL.length;
      setText(POOL[idxRef.current]);
      setFadeKey((k) => k + 1);
    }, intervalMs);
    return () => clearInterval(iv);
  }, [intervalMs]);

  return (
    <span
      key={fadeKey}
      className="rotating-comment"
      title={text}
    >
      <span className="rotating-comment-marker" aria-hidden="true"></span>
      <span className="rotating-comment-text">{text}</span>
    </span>
  );
};

export default RotatingComment;
