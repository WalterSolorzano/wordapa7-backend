/**
 * Los controles de diseño del Índice: profundidad, numeración e insertar/quitar.
 *
 * El índice es el único destino de la fase que escribe en el documento, así
 * que sus controles tienen que decir la verdad de lo que ya hay: si el
 * índice existe, el botón quita; si no, inserta. Y la profundidad visible es
 * una decisión de lectura, no un adorno.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ControlesIndice } from '../ControlesIndice';

const base = {
  profundidad: 3 as const,
  onProfundidad: () => {},
  onRegla: () => {},
  hayIndice: false,
  onInsertar: () => {},
  onQuitar: () => {},
  numeracionH1: 'none',
  numeracionH2: 'none',
};

describe('ControlesIndice', () => {
  it('cambia la profundidad visible', () => {
    const onProf = vi.fn();
    render(<ControlesIndice {...base} profundidad={2} onProfundidad={onProf} />);
    fireEvent.click(screen.getByRole('button', { name: /hasta h1/i }));
    expect(onProf).toHaveBeenCalledWith(1);
  });

  it('ofrece las cuatro profundidades y marca la activa', () => {
    render(<ControlesIndice {...base} profundidad={2} />);
    expect(screen.getByRole('button', { name: /hasta h1/i }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: /hasta h2/i }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^todo$/i })).toBeTruthy();
  });

  it('inserta el índice cuando no existe', () => {
    const onInsert = vi.fn();
    render(<ControlesIndice {...base} onInsertar={onInsert} />);
    fireEvent.click(screen.getByRole('button', { name: /insertar índice/i }));
    expect(onInsert).toHaveBeenCalled();
  });

  it('quita el índice cuando ya existe', () => {
    const onQuitar = vi.fn();
    const onInsert = vi.fn();
    render(<ControlesIndice {...base} hayIndice onQuitar={onQuitar} onInsertar={onInsert} />);
    fireEvent.click(screen.getByRole('button', { name: /quitar índice/i }));
    expect(onQuitar).toHaveBeenCalled();
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('no usa <select>: los controles son botones', () => {
    const { container } = render(<ControlesIndice {...base} />);
    expect(document.querySelector('select')).toBeNull();
    expect(container.querySelector('[data-testid="controles-indice"]')).toBeTruthy();
  });

  it('permite elegir la notación de numeración de H1', () => {
    const onRegla = vi.fn();
    render(<ControlesIndice {...base} numeracionH1="none" onRegla={onRegla} />);
    const grupo = screen.getByRole('group', { name: /numeración de H1/i });
    const boton = [...grupo.querySelectorAll('button')].find((b) =>
      /^I\. II\. III\.$/.test(b.textContent?.trim() ?? ''),
    );
    expect(boton).toBeTruthy();
    fireEvent.click(boton!);
    expect(onRegla).toHaveBeenCalledWith('heading_numbering_style_lvl1', 'upperRoman');
  });

  it('permite elegir la notación de numeración de H2 y marca la activa', () => {
    const onRegla = vi.fn();
    render(<ControlesIndice {...base} numeracionH2="lowerLetter" onRegla={onRegla} />);
    const grupo = screen.getByRole('group', { name: /numeración de H2/i });
    const activo = grupo.querySelector('[aria-pressed="true"]');
    expect(activo?.textContent).toMatch(/a\. b\. c\./i);
    const boton = [...grupo.querySelectorAll('button')].find((b) =>
      /^A\. B\. C\.$/.test(b.textContent?.trim() ?? ''),
    );
    expect(boton).toBeTruthy();
    fireEvent.click(boton!);
    expect(onRegla).toHaveBeenCalledWith('heading_numbering_style_lvl2', 'upperLetter');
  });

  it('la mini-preview refleja la notación elegida', () => {
    render(
      <ControlesIndice {...base} profundidad={2} numeracionH1="upperRoman" numeracionH2="lowerLetter" />,
    );
    expect(screen.getByText('I. Introducción')).toBeTruthy();
    expect(screen.getByText('1.a. Marco teórico')).toBeTruthy();
  });

  it('la mini-preview respeta la profundidad visible', () => {
    render(<ControlesIndice {...base} profundidad={1} />);
    expect(screen.queryByText('Marco teórico')).toBeNull();
  });
});
