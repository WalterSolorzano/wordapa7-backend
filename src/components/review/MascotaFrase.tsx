import React from 'react';
import { EditorialMascot, type MascotExpression, type MascotKind } from '../layout/EditorialMascot';

export interface MascotaFraseProps {
  frase: string;
  kind?: MascotKind;
  expression?: MascotExpression;
  size?: number;
  highlight?: boolean;
}

/** Deduce una expresión expresiva para la mascota según el tono de la frase. */
function deducirExpresion(frase: string, fallback: MascotExpression = 'neutral'): MascotExpression {
  const f = frase.toLowerCase();
  if (f.includes('expulsen') || f.includes('policía') || f.includes('infarto') || f.includes('pánico') || f.includes('llorar') || f.includes('asfixio') || f.includes('fuego') || f.includes('baja temporal')) {
    return 'worried';
  }
  if (f.includes('openai') || f.includes('chatgpt') || f.includes('quemado') || f.includes('fantasma') || f.includes('prófugo') || f.includes('silicio') || f.includes('turnitin') || f.includes('peaje') || f.includes('regalías') || f.includes('módem')) {
    return 'curious';
  }
  if (f.includes('impecable') || f.includes('perfecto') || f.includes('aprobado') || f.includes('título') || f.includes('sólido') || f.includes('honores')) {
    return 'happy';
  }
  return fallback;
}

/** Mascota + globo con la frase de la banda. La frase la decide `mascotaFrases`;
 *  este componente solo la pinta. Sin frase no ocupa lugar. */
export const MascotaFrase: React.FC<MascotaFraseProps> = ({
  frase,
  kind = 'reference',
  expression,
  size = 60,
  highlight = true,
}) => {
  if (!frase) return null;
  const exprFinal = expression ?? deducirExpresion(frase, 'curious');

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        minWidth: 0,
        maxWidth: '100%',
      }}
    >
      <EditorialMascot kind={kind} expression={exprFinal} size={size} />
      <p
        role="note"
        style={{
          margin: 0,
          maxWidth: '42ch',
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-3) var(--space-4)',
          fontSize: highlight ? 'var(--text-base)' : 'var(--text-sm)',
          fontWeight: 600,
          lineHeight: 1.35,
          color: 'var(--color-text-primary)',
          boxShadow: 'var(--shadow-xs, 0 1px 3px rgba(0,0,0,0.06))',
          wordBreak: 'break-word',
        }}
      >
        {frase}
      </p>
    </div>
  );
};

export default MascotaFrase;
