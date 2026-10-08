import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { EscritorioEstructura } from '../components/structure/EscritorioEstructura';

const grid = () => document.querySelector('.escritorio-estructura') as HTMLElement;

describe('EscritorioEstructura responsive', () => {
  beforeEach(() => {
    window.innerWidth = 1024;
    window.dispatchEvent(new Event('resize'));
  });

  it('bajo 900px no reserva el panel derecho', () => {
    window.innerWidth = 800;
    window.dispatchEvent(new Event('resize'));
    render(<EscritorioEstructura />);
    expect(grid().style.gridTemplateColumns).not.toMatch(/452px|760px/);
  });

  it('en la banda 900-1279 tampoco reserva el panel derecho', () => {
    window.innerWidth = 1100;
    window.dispatchEvent(new Event('resize'));
    render(<EscritorioEstructura />);
    expect(grid().style.gridTemplateColumns).not.toMatch(/452px|760px/);
  });

  it('en pantalla ancha sí reserva el panel derecho', () => {
    window.innerWidth = 1440;
    window.dispatchEvent(new Event('resize'));
    render(<EscritorioEstructura />);
    expect(grid().style.gridTemplateColumns).toMatch(/452px/);
  });
});
