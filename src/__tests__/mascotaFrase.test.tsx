import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MascotaFrase } from '../components/review/MascotaFrase';

describe('MascotaFrase', () => {
  it('muestra la frase junto a la mascota', () => {
    const { container } = render(<MascotaFrase frase="Vas bien." kind="ruler" />);
    expect(screen.getByText('Vas bien.')).toBeTruthy();
    expect(container.querySelector('.editorial-mascot')).not.toBeNull();
  });

  it('sin frase no pinta nada', () => {
    const { container } = render(<MascotaFrase frase="" />);
    expect(container.firstChild).toBeNull();
  });

  it('la frase no lleva emojis', () => {
    render(<MascotaFrase frase="Esto pide una pasada en serio." />);
    expect(screen.getByText('Esto pide una pasada en serio.').textContent)
      .not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});
