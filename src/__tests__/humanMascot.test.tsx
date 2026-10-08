import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HumanMascot } from '../components/layout/HumanMascot';

describe('HumanMascot', () => {
  it('dibuja cuerpo completo: camisa, parche, pelo y zapatos', () => {
    const { container } = render(<HumanMascot size={64} />);
    const svg = container.querySelector('svg.human-mascot');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 64 84');
    expect(container.querySelectorAll('.human-mascot-shoe')).toHaveLength(2);
    expect(container.querySelector('.human-mascot-patch')).not.toBeNull();
    expect(container.querySelector('.human-mascot-hair')).not.toBeNull();
    expect(container.querySelector('.human-mascot-shirt')).not.toBeNull();
  });

  it('ningún color es un literal: todo es var(--token) o none', () => {
    const { container } = render(<HumanMascot />);
    for (const el of Array.from(container.querySelectorAll('svg *'))) {
      for (const attr of ['fill', 'stroke']) {
        const v = el.getAttribute(attr);
        if (v && v !== 'none') expect(v.startsWith('var(--')).toBe(true);
      }
    }
  });
});
