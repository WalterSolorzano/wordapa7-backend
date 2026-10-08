import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RailEstructura } from '../RailEstructura';

describe('RailEstructura', () => {
  it('muestra los dos destinos y marca el activo', () => {
    const spy = vi.fn();
    render(<RailEstructura destino="esquema" onDestino={spy} />);
    expect(screen.getByTestId('rail-estructura')).toBeTruthy();
    expect(screen.getByRole('button', { name: /esquema/i }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /índice/i }).getAttribute('aria-pressed')).toBe('false');
  });

  it('avisa el cambio de destino', () => {
    const spy = vi.fn();
    render(<RailEstructura destino="esquema" onDestino={spy} />);
    fireEvent.click(screen.getByRole('button', { name: /índice/i }));
    expect(spy).toHaveBeenCalledWith('indice');
  });
});
