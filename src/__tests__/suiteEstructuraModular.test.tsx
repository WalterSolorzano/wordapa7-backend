/**
 * Pruebas unitarias para la Suite Modular de Estructura:
 * - Módulo 1: Distribución de Volumen (Pacing)
 * - Módulo 2: Matriz de Evidencias y Rigor Académico
 * - Módulo 3: Reorganizador Quirúrgico en Caliente
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DistribucionVolumen } from '../components/structure/DistribucionVolumen';
import { MatrizEvidencias } from '../components/structure/MatrizEvidencias';
import { ReorganizadorCapitulos } from '../components/structure/ReorganizadorCapitulos';
import { useDocStore } from '../store/useDocStore';
import type { NodoJerarquia } from '../lib/jerarquia';
import type { ElementModel } from '../types';

let idSeq = 0;
const nodoH1 = (titulo: string, palabras: number, citas = 0, figuras = 0, tablas = 0, fase: string | null = null): NodoJerarquia => ({
  id: `n-${++idSeq}`,
  titulo,
  nivel: 1,
  elementoId: `e-${idSeq}`,
  palabras,
  citas,
  figuras,
  tablas,
  hijos: [],
  fase,
});

const elH1 = (id: string, text: string): ElementModel => ({
  id,
  type: 'heading',
  heading_level: 1,
  text,
  style_name: '',
  alignment: 'left',
  font_name: 'Times New Roman',
  font_size: 12,
  is_bold: true,
  is_italic: false,
  is_bullet: false,
  left_indent_cm: 0,
  confidence: 1,
  is_user_modified: false,
  cita_ids: [],
  needs_review: false,
  auto_applied: false,
});

beforeEach(() => {
  idSeq = 0;
});

describe('Módulo 1: Distribución de Volumen (Pacing)', () => {
  it('calcula y muestra el porcentaje de peso de cada H1 con respecto al documento', () => {
    const raices = [
      nodoH1('1. Introducción', 200),
      nodoH1('2. Marco Teórico', 800),
    ];

    render(<DistribucionVolumen raices={raices} />);

    // Total = 1000 palabras
    expect(screen.getByText(/1[.,]?000 pal\. tot\./i)).toBeTruthy();
    expect(screen.getByText(/200 \(20%\)/i)).toBeTruthy();
    expect(screen.getByText(/800 \(80%\)/i)).toBeTruthy();

    const barrasBg = screen.getAllByTestId('bar-bg');
    const barrasFill = screen.getAllByTestId('bar-fill');
    expect(barrasBg).toHaveLength(2);
    expect(barrasFill).toHaveLength(2);
    expect(barrasFill[0].style.width).toBe('20%');
    expect(barrasFill[1].style.width).toBe('80%');
  });

  it('muestra alerta visual cuando un capítulo concentra >50% del total', () => {
    const raices = [
      nodoH1('1. Introducción', 100),
      nodoH1('2. Marco Teórico', 900),
    ];

    render(<DistribucionVolumen raices={raices} />);

    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toMatch(/concentra más de la mitad del trabajo total \(90%\)/i);
    expect(alerta.textContent).toMatch(/Marco Teórico/i);
  });
});

describe('Módulo 2: Matriz de Evidencias y Rigor Académico', () => {
  it('renderiza la tabla comparativa con citas, figuras y tablas por capítulo', () => {
    const raices = [
      nodoH1('1. Introducción', 300, 5, 1, 0, 'introduccion'),
      nodoH1('2. Metodología', 500, 10, 2, 3, 'metodo'),
    ];

    render(<MatrizEvidencias raices={raices} />);

    expect(screen.getByText('Citas')).toBeTruthy();
    expect(screen.getByText('Figuras')).toBeTruthy();
    expect(screen.getByText('Tablas')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
  });

  it('diagnostica vacíos empíricos críticos en Metodología o Marco Teórico con 0 citas', () => {
    const raices = [
      nodoH1('1. Introducción', 300, 2, 0, 0, 'introduccion'),
      nodoH1('2. Metodología', 500, 0, 1, 1, 'metodo'),
    ];

    render(<MatrizEvidencias raices={raices} />);

    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toMatch(/hallazgo crítico/i);
    expect(alerta.textContent).toMatch(/no cuenta con citas de respaldo metodológico/i);
  });
});

describe('Módulo 3: Reorganizador Quirúrgico en Caliente', () => {
  it('permite mover capítulos arriba y abajo llamando a reorderElements', async () => {
    const elementos: ElementModel[] = [
      elH1('e-1', '1. Introducción'),
      elH1('e-2', '2. Metodología'),
      elH1('e-3', '3. Resultados'),
    ];

    const raices = [
      nodoH1('1. Introducción', 200),
      nodoH1('2. Metodología', 300),
      nodoH1('3. Resultados', 400),
    ];

    const reorderSpy = vi.fn().mockResolvedValue(undefined);
    useDocStore.setState({
      reorderElements: reorderSpy,
    });

    render(<ReorganizadorCapitulos raices={raices} elementos={elementos} />);

    // El primer capítulo no puede subir (botón deshabilitado)
    const botonSubirPrimero = screen.getByRole('button', { name: /subir 1\. Introducción/i });
    expect(botonSubirPrimero.hasAttribute('disabled')).toBe(true);

    // El segundo capítulo sí puede subir
    const botonSubirSegundo = screen.getByRole('button', { name: /subir 2\. Metodología/i });
    expect(botonSubirSegundo.hasAttribute('disabled')).toBe(false);

    await React.act(async () => {
      fireEvent.click(botonSubirSegundo);
    });

    expect(reorderSpy).toHaveBeenCalledTimes(1);
    expect(reorderSpy).toHaveBeenCalledWith(['e-2', 'e-1', 'e-3']);
  });
});
