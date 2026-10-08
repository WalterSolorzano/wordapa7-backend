/**
 * CoverEditorPanel — arreglos del editor de portada.
 *
 * Lo que este archivo protege:
 *
 *  1. La fecha que infiere el backend llega al selector nativo. El backend
 *     devuelve "25 de junio del año 2025" (con "del año" en medio); el regex
 *     viejo exigía "mes de año" y el selector quedaba vacío. Un dato que está
 *     en el documento y no aparece en el editor es un dato perdido.
 *  2. Integrantes / Autores es su propia sección plegable, cerrada por defecto,
 *     y el encabezado dice cuántos hay. Antes era un bloque siempre abierto
 *     dentro de Identificación: un muro.
 *  3. Institución y carrera que el sistema NO conoce no se dibujan como campos
 *     vacíos con chips: viven detrás de "Agregar institución / carrera" hasta
 *     que el usuario las pide.
 *  4. Todas las secciones inician cerradas.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn((u: string) => u),
  triggerDownload: vi.fn(),
}));

import { useDocStore } from '../store/useDocStore';
import { defaultPortada, defaultActa } from '../store/slices/coverSlice';
import { CoverEditorPanel } from '../components/wizard/CoverEditorPanel';
import { useRosterStore } from '../store/useRosterStore';

/* La lista que el backend produce hoy para el documento real: nombre y carnet
   en la misma línea separados por " | Carnet: ". */
const AUTOR = [
  'Br. Iván Fernando Álvarez Ríos | Carnet: 2022-0215I',
  'Br. Maynard Damián Orozco Baquedano | Carnet: 2023-0397U',
  'Br. María del pilar Bermúdez Bermúdez | Carnet: 2023-0451U',
  'Br. Walter Noel Solorzano Gaitán | Carnet: 2023-0432',
  'Br. Stephani Valeria Castellón Borge | Carnet: 2021-0574I',
].join('\n');

const montar = (
  portada: Record<string, unknown> = {},
  acta: Record<string, unknown> = {},
) => {
  useDocStore.setState({
    portada: { ...defaultPortada, ...portada },
    acta: { ...defaultActa, ...acta },
    doc: null,
    wizardStep: 1,
  } as never);
  useRosterStore.setState({ integrantes: [], profesores: [], grupos: [] } as never);
  return render(<CoverEditorPanel />);
};

const seccion = (nombre: RegExp) => screen.getByRole('button', { name: nombre });

describe('editor de portada: datos inferidos y secciones', () => {
  beforeEach(() => {
    useDocStore.setState({ portada: { ...defaultPortada }, acta: { ...defaultActa } } as never);
  });

  it('la fecha del backend con "del año" llega al selector como YYYY-MM-DD', () => {
    // El regex viejo `mes de año` no matchea "junio del año 2025" y el selector
    // aparecía vacío aunque `portada.date` tuviera el texto.
    montar({ date: '25 de junio del año 2025' });
    fireEvent.click(seccion(/Docente y entrega/i));
    const input = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('2025-06-25');
  });

  it('Integrantes / Autores es una sección plegable, cerrada, con el conteo', () => {
    montar({}, { autor: AUTOR });
    const disparador = seccion(/Integrantes \/ Autores \(5\)/i);
    expect(disparador.getAttribute('aria-expanded')).toBe('false');
    // Cerrada: los carnets no están en el DOM todavía.
    expect(screen.queryByDisplayValue('2022-0215I')).toBeNull();

    fireEvent.click(disparador);
    expect(disparador.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByDisplayValue('Br. Iván Fernando Álvarez Ríos')).toBeTruthy();
    expect(screen.getByDisplayValue('2022-0215I')).toBeTruthy();
    expect(screen.getByDisplayValue('2023-0397U')).toBeTruthy();
    expect(screen.getByDisplayValue('2023-0451U')).toBeTruthy();
    expect(screen.getByDisplayValue('2023-0432')).toBeTruthy();
    expect(screen.getByDisplayValue('2021-0574I')).toBeTruthy();
  });

  it('institución y carrera desconocidas no se muestran como campos vacíos', () => {
    montar();
    fireEvent.click(seccion(/Institución y carrera/i));
    // Lo que el sistema no sabe no se "vomita" como campo vacío + chips.
    expect(screen.queryByPlaceholderText('Universidad o institución')).toBeNull();
    expect(screen.queryByPlaceholderText(/Ingeniería Electrónica/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Agregar institución/i }));
    expect(screen.getByPlaceholderText('Universidad o institución')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Agregar carrera/i }));
    expect(screen.getByPlaceholderText(/Ingeniería Electrónica/)).toBeTruthy();
  });

  it('una institución ya conocida se muestra directo, sin pedir permiso', () => {
    // Si el documento trae institución, ocultarla tras "Agregar" es esconder un
    // dato que sí existe.
    montar({ institution: 'Universidad Nacional de Ingeniería' });
    fireEvent.click(seccion(/Institución y carrera/i));
    expect(screen.getByPlaceholderText('Universidad o institución')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Agregar institución/i })).toBeNull();
  });

  it('todas las secciones arrancan cerradas', () => {
    montar({}, { autor: AUTOR });
    for (const nombre of [
      /Identificación/i,
      /Integrantes \/ Autores/i,
      /Institución y carrera/i,
      /Docente y entrega/i,
    ]) {
      expect(seccion(nombre).getAttribute('aria-expanded'), String(nombre)).toBe('false');
    }
  });
});
