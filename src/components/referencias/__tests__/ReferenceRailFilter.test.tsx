import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReferenceRailFilter, ReferenceFilterType } from '../ReferenceRailFilter';

describe('ReferenceRailFilter', () => {
  const defaultCounts = { total: 12, verified: 8, issues: 4 };

  it('renderiza los 3 botones de filtro con sus títulos accesibles y conteos', () => {
    const onSelectFilter = vi.fn();
    render(
      <ReferenceRailFilter
        filter="all"
        counts={defaultCounts}
        onSelectFilter={onSelectFilter}
      />
    );

    const btnAll = screen.getByRole('button', { name: /todas/i });
    const btnVerified = screen.getByRole('button', { name: /verificadas/i });
    const btnIssues = screen.getByRole('button', { name: /revisar|observaciones|issues/i });

    expect(btnAll).toBeDefined();
    expect(btnVerified).toBeDefined();
    expect(btnIssues).toBeDefined();

    expect(screen.getByText('12')).toBeDefined();
  });

  /* El conteo de este filtro suma referencias sin verificar Y citas del texto
     sin ficha, así que el rótulo no puede hablar de "huérfanas o incompletas":
     eso nombra dos categorías que el número no mide. */
  it('el rótulo del filtro de problemas describe lo que el conteo es', () => {
    render(
      <ReferenceRailFilter
        filter="all"
        counts={defaultCounts}
        onSelectFilter={vi.fn()}
      />,
    );

    const etiqueta = screen.getByRole('button', { name: /revisar/i }).getAttribute('aria-label') || '';
    expect(etiqueta).toMatch(/sin verificar/i);
    expect(etiqueta).toMatch(/sin ficha/i);
    expect(etiqueta).not.toMatch(/huérfanas/i);
  });

  it('marca el botón activo según la prop filter', () => {
    const { rerender } = render(
      <ReferenceRailFilter
        filter="all"
        counts={defaultCounts}
        onSelectFilter={vi.fn()}
      />
    );

    let btnAll = screen.getByRole('button', { name: /todas/i });
    let btnVerified = screen.getByRole('button', { name: /verificadas/i });

    expect(btnAll.className).toContain('active');
    expect(btnVerified.className).not.toContain('active');

    rerender(
      <ReferenceRailFilter
        filter="verified"
        counts={defaultCounts}
        onSelectFilter={vi.fn()}
      />
    );

    btnAll = screen.getByRole('button', { name: /todas/i });
    btnVerified = screen.getByRole('button', { name: /verificadas/i });

    expect(btnAll.className).not.toContain('active');
    expect(btnVerified.className).toContain('active');
  });

  it('dispara onSelectFilter con el filtro correcto al hacer click', () => {
    const onSelectFilter = vi.fn();
    render(
      <ReferenceRailFilter
        filter="all"
        counts={defaultCounts}
        onSelectFilter={onSelectFilter}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /verificadas/i }));
    expect(onSelectFilter).toHaveBeenCalledWith('verified');

    fireEvent.click(screen.getByRole('button', { name: /revisar|observaciones|issues/i }));
    expect(onSelectFilter).toHaveBeenCalledWith('issues');

    fireEvent.click(screen.getByRole('button', { name: /todas/i }));
    expect(onSelectFilter).toHaveBeenCalledWith('all');
  });

  it('no contiene ningún emoji en el texto renderizado', () => {
    const { container } = render(
      <ReferenceRailFilter
        filter="all"
        counts={defaultCounts}
        onSelectFilter={vi.fn()}
      />
    );

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(container.innerHTML)).toBe(false);
  });
});
