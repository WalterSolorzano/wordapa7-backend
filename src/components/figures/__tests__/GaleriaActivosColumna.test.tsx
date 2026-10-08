import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GaleriaActivosColumna } from '../GaleriaActivosColumna';
import type { ContextoFigura } from '../../../lib/figuras';

describe('GaleriaActivosColumna', () => {
  const contextosMock: ContextoFigura[] = [
    {
      indice: 3,
      id: 'elem_3',
      tipo: 'image',
      numero: 1,
      rotulo: 'Figura 1',
      leyenda: 'Flujograma de muestreo metodológico',
      tieneLeyenda: true,
      seccion: '2. Metodología',
      h1: 'Metodología',
      h2: null,
      parrafoAnterior: 'En el siguiente esquema se ilustra el proceso.',
      parrafoSiguiente: null,
      posicionEnSeccion: 1,
      totalEnSeccion: 1,
      posicionEnTipo: 1,
      totalEnTipo: 2,
      url: 'figura1.png',
      anchoCm: 14.5,
      altoCm: 9.0,
      tabla: null,
    },
    {
      indice: 8,
      id: 'elem_8',
      tipo: 'image',
      numero: 2,
      rotulo: 'Figura 2',
      leyenda: '',
      tieneLeyenda: false,
      seccion: '3. Resultados',
      h1: 'Resultados',
      h2: null,
      parrafoAnterior: null,
      parrafoSiguiente: null,
      posicionEnSeccion: 1,
      totalEnSeccion: 1,
      posicionEnTipo: 2,
      totalEnTipo: 2,
      url: null,
      anchoCm: null,
      altoCm: null,
      tabla: null,
    },
  ];

  it('renderiza la lista de activos según el tipo activo', () => {
    render(
      <GaleriaActivosColumna
        contextos={contextosMock}
        indiceActivo={3}
        onSelectIndice={vi.fn()}
      />
    );

    expect(screen.getByText('Figura 1')).toBeDefined();
    expect(screen.getByText('Figura 2')).toBeDefined();
  });

  it('incluye contenedor de miniatura preview (52x42px) para cada activo', () => {
    const { container } = render(
      <GaleriaActivosColumna
        contextos={contextosMock}
        indiceActivo={3}
        onSelectIndice={vi.fn()}
      />
    );

    const thumbnails = container.querySelectorAll('[data-testid="asset-thumbnail"]');
    expect(thumbnails.length).toBe(2);
    expect((thumbnails[0] as HTMLElement).style.width).toBe('52px');
    expect((thumbnails[0] as HTMLElement).style.height).toBe('42px');
  });

  it('renderiza rótulo, leyenda e indicador de conformidad APA 7', () => {
    render(
      <GaleriaActivosColumna
        contextos={contextosMock}
        indiceActivo={3}
        onSelectIndice={vi.fn()}
      />
    );

    expect(screen.getByText('Flujograma de muestreo metodológico')).toBeDefined();
    expect(screen.getByText('Conforme')).toBeDefined();
    expect(screen.getByText('Sin leyenda')).toBeDefined();
  });

  it('emite onSelectIndice al hacer clic en un elemento', () => {
    const onSelect = vi.fn();
    render(
      <GaleriaActivosColumna
        contextos={contextosMock}
        indiceActivo={3}
        onSelectIndice={onSelect}
      />
    );

    const itemFigura2 = screen.getByText('Figura 2');
    fireEvent.click(itemFigura2);
    expect(onSelect).toHaveBeenCalledWith(8);
  });

  it('agrupa los activos por fase (H1) y subsección (H2)', () => {
    const conSub: ContextoFigura[] = [
      { ...contextosMock[0], h1: 'Capítulo 1', h2: 'Método' },
      { ...contextosMock[1], h1: 'Capítulo 1', h2: 'Resultados' },
    ];

    render(
      <GaleriaActivosColumna
        contextos={conSub}
        indiceActivo={null}
        onSelectIndice={vi.fn()}
      />
    );

    // Cabecera de fase (H1) aparece una sola vez aunque agrupe dos activos
    expect(screen.getAllByText('Capítulo 1').length).toBe(1);
    // Subsecciones (H2)
    expect(screen.getByText('Método')).toBeDefined();
    expect(screen.getByText('Resultados')).toBeDefined();
  });

  it('previsualiza la tabla con una rejilla, no con un icono', () => {
    const ctxTabla: ContextoFigura[] = [
      {
        ...contextosMock[0],
        tipo: 'table',
        rotulo: 'Tabla 1',
        url: null,
        tabla: { headers: ['Grupo', 'n'], rows: [['Control', '30'], ['Ensayo', '30']] },
      },
    ];
    const { container } = render(
      <GaleriaActivosColumna
        contextos={ctxTabla}
        indiceActivo={null}
        onSelectIndice={vi.fn()}
      />
    );
    expect(container.querySelector('[data-testid="asset-thumbnail-tabla"]')).toBeTruthy();
  });
});
