/**
 * El editor de una ecuación.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO. La configuración de presentación de una ecuación
 * (número, formato, alineación y tipografía de apoyo) vivía dentro del
 * `ElementInspector` general, que se borró. El usuario confirmó que usa
 * ecuaciones y que son prioridad, así que la capacidad se rescató como editor
 * propio. Estas pruebas fijan que:
 *
 *  1. la numeración APAGADA no pide formato ni número —no se piden datos que no
 *     se van a usar—;
 *  2. prender el número persiste la presentación COMPLETA, sin perder el resto
 *     del estado (alineación y tipografía sobreviven al cambio);
 *  3. la alineación se declara con `aria-pressed`, no solo con color;
 *  4. el editor NO reusa `updateElementType`: manda la ecuación por su propia
 *     action, porque `updateElementType` miente sobre lo que cambia.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { EquationEditor } from '../components/inspector/EquationEditor';
import type { ElementModel } from '../types';

const ecuacion = (equation?: Record<string, unknown>): ElementModel =>
  ({
    id: 'eq1',
    type: 'equation',
    text: 'E = mc^2',
    cita_ids: [],
    equation,
  }) as never;

beforeEach(() => {
  useDocStore.setState({ updateElementEquation: vi.fn() } as never);
});

describe('el editor de ecuación', () => {
  it('con la numeración apagada no pide formato ni número', () => {
    /* Un formulario que pide el formato de un número que no va a existir es un
     * dato que nadie va a usar. Se pide solo cuando se prende. */
    render(<EquationEditor elemento={ecuacion({ show_number: false })} />);
    expect(screen.queryByText(/Formato del número/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/Auto/i)).toBeNull();

    fireEvent.click(screen.getByLabelText(/Mostrar número/i));
    expect(screen.getByText(/Formato del número/i)).toBeTruthy();
  });

  it('prender el número persiste la presentación completa, sin perder el resto', () => {
    const update = vi.fn();
    useDocStore.setState({ updateElementEquation: update } as never);
    render(
      <EquationEditor
        elemento={ecuacion({
          show_number: false,
          number_format: '(1)',
          alignment: 'right',
          font_name: 'Cambria Math',
          font_size_pt: 11,
        })}
      />,
    );

    fireEvent.click(screen.getByLabelText(/Mostrar número/i));

    expect(update).toHaveBeenCalledWith(
      'eq1',
      expect.objectContaining({
        show_number: true,
        alignment: 'right',
        font_name: 'Cambria Math',
        font_size_pt: 11,
      }),
    );
  });

  it('la alineación se declara con `aria-pressed`, no solo con color', () => {
    /* Un estado que solo se ve por color es un estado que no existe para quien
     * no ve el color. */
    render(<EquationEditor elemento={ecuacion({ show_number: true, alignment: 'center' })} />);
    expect(screen.getByRole('button', { name: 'Centrada' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Izquierda' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('no reusa `updateElementType`: la ecuación va por su propia action', async () => {
    const fuente = await import('../components/inspector/EquationEditor.tsx?raw');
    const codigo = (fuente as any).default || '';
    expect(codigo).toMatch(/updateElementEquation/);
    expect(codigo).not.toMatch(/updateElementType/);
  });
});
