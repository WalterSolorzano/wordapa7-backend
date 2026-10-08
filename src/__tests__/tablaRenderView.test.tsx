import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TablaRender } from '../components/figures/TablaRender';
import type { TableModel } from '../types';

const tabla = (extra: Partial<TableModel> = {}): TableModel => ({
  element_id: 't1',
  headers: ['Variable', 'M'],
  rows: [['Asistencia', '4.6']],
  caption: 'Estadísticos descriptivos',
  table_number: 3,
  ...extra,
});

describe('TablaRender', () => {
  it('pinta el rótulo con el número, la leyenda y las celdas', () => {
    render(<TablaRender tabla={tabla()} />);
    expect(screen.getByText(/Tabla 3\./)).toBeTruthy();
    expect(screen.getByText('Estadísticos descriptivos')).toBeTruthy();
    expect(screen.getByText('Variable')).toBeTruthy();
    expect(screen.getByText('Asistencia')).toBeTruthy();
    expect(screen.getByText('4.6')).toBeTruthy();
  });

  it('no repite el rótulo si la leyenda ya lo trae', () => {
    render(<TablaRender tabla={tabla({ caption: 'Tabla 3. Estadísticos descriptivos' })} />);
    const rotulos = screen.getAllByText(/Tabla 3/);
    expect(rotulos).toHaveLength(1);
  });

  it('envuelve la tabla en un contenedor con scroll horizontal', () => {
    const { container } = render(<TablaRender tabla={tabla()} />);
    const scroller = container.querySelector('[data-testid="tabla-scroll"]') as HTMLElement;
    expect(scroller.style.overflowX).toBe('auto');
  });

  it('editable: abre la celda al hacer clic y confirma al salir', () => {
    const onEditarCelda = vi.fn();
    render(<TablaRender tabla={tabla()} editable onEditarCelda={onEditarCelda} />);
    fireEvent.click(screen.getByText('Asistencia'));
    const input = screen.getByDisplayValue('Asistencia') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Participación' } });
    fireEvent.blur(input);
    expect(onEditarCelda).toHaveBeenCalledWith(1, 0, 'Participación');
  });

  it('oculta la leyenda cuando mostrarLeyenda=false', () => {
    render(<TablaRender tabla={tabla()} mostrarLeyenda={false} />);
    expect(screen.queryByText('Estadísticos descriptivos')).toBeNull();
    expect(screen.queryByText(/Tabla 3\./)).toBeNull();
  });

  it('marca la continuación del fragmento', () => {
    render(<TablaRender tabla={tabla()} esContinuacion />);
    expect(screen.getByText(/Continúa/)).toBeTruthy();
  });

  it('pinta los bordes verticales de rejilla solo en grid/zebra', () => {
    const grid = render(<TablaRender tabla={tabla({ style: 'grid' })} />);
    const tdGrid = grid.container.querySelectorAll('td')[0] as HTMLTableCellElement;
    expect(tdGrid.style.borderLeft).not.toBe('');

    const apa = render(<TablaRender tabla={tabla({ style: 'apa' })} />);
    const tdApa = apa.container.querySelectorAll('td')[0] as HTMLTableCellElement;
    expect(tdApa.style.borderLeft).toBe('');
  });

  it('muestra la nota solo en el último fragmento', () => {
    const ultima = render(<TablaRender tabla={tabla({ note: 'Fuente propia' })} />);
    expect(ultima.container.textContent).toContain('Nota.');

    const continuacion = render(<TablaRender tabla={tabla({ note: 'Fuente propia' })} esUltima={false} />);
    expect(continuacion.container.textContent).not.toContain('Nota.');
  });
});
