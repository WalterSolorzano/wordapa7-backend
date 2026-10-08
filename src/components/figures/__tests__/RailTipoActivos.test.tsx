import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RailTipoActivos } from '../RailTipoActivos';

describe('RailTipoActivos', () => {
  it('renderiza botones verticales para figuras, tablas y ecuaciones con conteos', () => {
    const onTipoChange = vi.fn();
    render(
      <RailTipoActivos
        tipoActivo="image"
        conteos={{ image: 4, table: 2, equation: 1 }}
        onTipoChange={onTipoChange}
      />
    );

    const btnTablas = screen.getByRole('button', { name: /tablas/i });
    expect(btnTablas).toBeDefined();
    expect(screen.getByText('4')).toBeDefined();
    fireEvent.click(btnTablas);
    expect(onTipoChange).toHaveBeenCalledWith('table');
  });
});
