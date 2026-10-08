import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ReferenciaLinea } from '../ReferenciaLinea';
import type { ReferenciaModel } from '../../../types';

const base: ReferenciaModel = { id: 'r1', authors: ['Hirano, H.'], title: 'X', source: 'Y', raw_text: '' };

describe('ReferenciaLinea', () => {
  it('dibuja cursiva por segmento', () => {
    const ref: ReferenciaModel = {
      ...base,
      apa_segments: [
        { text: 'Hirano, H. (1995). ', italic: false },
        { text: '5 Pillars', italic: true },
        { text: '. Productivity Press.', italic: false },
      ],
    };
    const { container } = render(<ReferenciaLinea referencia={ref} />);
    const em = container.querySelector('span[style*="italic"]');
    expect(em?.textContent).toBe('5 Pillars');
  });

  it('cae a formatted_apa sin segmentos', () => {
    const ref: ReferenciaModel = { ...base, formatted_apa: 'TEXTO PLANO' };
    const { container } = render(<ReferenciaLinea referencia={ref} />);
    expect(container.textContent).toContain('TEXTO PLANO');
  });

  it('sin emojis', () => {
    const ref: ReferenciaModel = { ...base, formatted_apa: 'A (2020). B.' };
    const { container } = render(<ReferenciaLinea referencia={ref} />);
    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });
});
