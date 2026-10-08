/**
 * El índice de estructura: un documento de trabajo, no un árbol de navegación.
 *
 * Las afirmaciones del índice son las que un árbol sin diagnóstico no puede
 * hacer: cuántas palabras tiene cada rama, cómo se mide contra sus hermanas y
 * por qué un nodo está en el estado en que está. Los diagnósticos salen de
 * `lib/jerarquia`; la fila solo los dibuja.
 *
 * Y la que reportó el usuario: el documento entero NO es el centro, y el mapa
 * ya no vive dentro de esta columna. El esquema es solo el esquema.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { IndiceEstructura } from '../components/structure/IndiceEstructura';
import {
  balanceDe,
  construirJerarquia,
  diagnosticoDe,
  filasDelIndice,
  motivoDe,
  saludDe,
} from '../lib/jerarquia';
import type { ElementModel } from '../types';

let secuencia = 0;
const el = (o: Partial<ElementModel> & { type: ElementModel['type']; text: string }): ElementModel =>
  ({
    id: `e${++secuencia}`,
    style_name: '',
    alignment: 'left',
    font_name: 'Times New Roman',
    font_size: 12,
    is_bold: false,
    is_italic: false,
    is_bullet: false,
    left_indent_cm: 0,
    confidence: 1,
    is_user_modified: false,
    cita_ids: [],
    needs_review: false,
    auto_applied: false,
    ...o,
  }) as ElementModel;

const h1 = (titulo: string): ElementModel =>
  el({ type: 'heading', heading_level: 1, text: titulo });
const h2 = (titulo: string): ElementModel =>
  el({ type: 'heading', heading_level: 2, text: titulo });
const parrafo = (palabras: number): ElementModel =>
  el({ type: 'paragraph', text: Array.from({ length: palabras }, (_, i) => `w${i}`).join(' ') });
const figura = (): ElementModel => el({ type: 'image', text: 'Figura 1' });
const cita = (): ElementModel => el({ type: 'paragraph', text: 'texto', cita_ids: ['c1'] });

const DESBALANCEADO = construirJerarquia([
  h1('1. Introducción'),
  parrafo(12000),
  h1('2. Metodología'),
  parrafo(80),
]);

const SIN_HERMANAS = construirJerarquia([h1('1. Introducción'), parrafo(500)]);
const VACIO = construirJerarquia([h1('1. Introducción'), h1('2. Metodología')]);
const CON_H2_SOSPECHOSO = construirJerarquia([
  h1('1. Metodología'),
  h2('1.1 Resultados'),
  parrafo(300),
]);
const CON_H2_ESPECIFICO = construirJerarquia([
  h1('1. Metodología'),
  h2('1.1 Resultados de la encuesta'),
  parrafo(300),
]);
const CON_FIGURAS = construirJerarquia([
  h1('1. Metodología'),
  parrafo(300),
  figura(),
  cita(),
]);

describe('cada nodo dice cuántas palabras tiene', () => {
  it('las palabras de la rama suben desde los nietos', () => {
    const arbol = construirJerarquia([
      h1('1. Metodología'),
      h2('1.1 Instrumentos'),
      parrafo(10),
      h2('1.2 Muestra'),
      parrafo(20),
    ]);
    expect(arbol[0].palabras).toBe(30);
  });

  it('un número grande se separa, porque 12000 se lee como una cifra sin fin', () => {
    expect(DESBALANCEADO[0].palabras).toBe(12000);
    expect(DESBALANCEADO[1].palabras).toBe(80);
  });

  it('el título se conserva entero, con su numeración y sus acentos', () => {
    const arbol = construirJerarquia([h1('1. Marco de la encuesta en el norte'), parrafo(50)]);
    expect(arbol[0].titulo).toBe('1. Marco de la encuesta en el norte');
  });
});

describe('el balance se mide contra las hermanas, no en absoluto', () => {
  it('con imbalance real, la barra pone a las dos en la misma escala', () => {
    const b = balanceDe(DESBALANCEADO);
    expect(b).not.toBeNull();
    expect(b!.mayor).toBe(12000);
    expect(motivoDe(DESBALANCEADO[1], b)).toContain('12.000');
  });

  it('con una sola hermana NO hay balance, y la fila lo dice', () => {
    const b = balanceDe(SIN_HERMANAS);
    expect(b).toBeNull();
    expect(motivoDe(SIN_HERMANAS[0], b)).toMatch(/no hay con qu/i);
  });

  it('el índice NO renderiza la barra de balance sin al menos dos hermanas', () => {
    const conHermanas = filasDelIndice(DESBALANCEADO);
    expect(conHermanas.every((f) => f.diagnostico.balance !== null)).toBe(true);
    const sola = filasDelIndice(SIN_HERMANAS);
    expect(sola.every((f) => f.diagnostico.balance === null)).toBe(true);
  });

  it('las hermanas se comparan ENTRE SÍ, no contra el capítulo padre', () => {
    const arbol = construirJerarquia([
      h1('1. Metodología'),
      parrafo(1000),
      h2('1.1 Instrumentos'),
      parrafo(400),
      h2('1.2 Muestra'),
      parrafo(500),
    ]);
    const filas = filasDelIndice(arbol);
    const cap = filas.find((f) => f.nodo.nivel === 1)!;
    const hijos = filas.filter((f) => f.nodo.nivel === 2);
    expect(cap.diagnostico.balance).toBeNull();
    for (const h of hijos) expect(h.diagnostico.salud).toBe('completa');
  });
});

describe('el estado de salud sale de reglas, no de heurísticas', () => {
  it('un capítulo sin contenido se DICE, no se muestra como vacío', () => {
    expect(saludDe(VACIO[1])).toBe('sin-contenido');
  });

  it('un H2 que dice "Resultados" a secas está en duda, y el motivo lo nombra', () => {
    expect(saludDe(CON_H2_SOSPECHOSO[0])).toBe('en-duda');
    expect(diagnosticoDe(CON_H2_SOSPECHOSO[0]).motivo).toContain('Resultados');
    expect(diagnosticoDe(CON_H2_SOSPECHOSO[0]).tituloEnDuda).toBe('1.1 Resultados');
  });

  it('un H2 con calificador NO está en duda', () => {
    expect(saludDe(CON_H2_ESPECIFICO[0])).not.toBe('en-duda');
    expect(diagnosticoDe(CON_H2_ESPECIFICO[0]).tituloEnDuda).toBeNull();
  });

  it('una hermana muy corta marca desbalanceada, con el número en el motivo', () => {
    const b = balanceDe(DESBALANCEADO);
    expect(saludDe(DESBALANCEADO[1], b)).toBe('desbalanceada');
    expect(diagnosticoDe(DESBALANCEADO[1], b).motivo).toMatch(/\d/);
  });

  it('el ámbito NO se decide mirando el cuerpo de un párrafo', () => {
    const arbol = construirJerarquia([
      h1('1. Introducción'),
      el({ type: 'paragraph', text: 'La metodología se aplicó a 40 personas del universo' }),
    ]);
    expect(arbol[0].fase).toBe('introduccion');
    expect(saludDe(arbol[0])).toBe('completa');
  });

  it('el nodo sano se dice completo, y no es una ausencia de estado', () => {
    expect(saludDe(CON_FIGURAS[0])).toBe('completa');
    expect(diagnosticoDe(CON_FIGURAS[0]).motivo).toBe('Completa');
  });

  it('las figuras y las citas cuelgan de su rama, en la fila', () => {
    const d = diagnosticoDe(CON_FIGURAS[0]);
    expect(CON_FIGURAS[0].figuras).toBe(1);
    expect(CON_FIGURAS[0].citas).toBe(1);
    expect(d.balance).toBeNull();
  });
});

describe('el esquema dibujado', () => {
  it('una fila por H1, plegada; al desplegar aparece el H2 con su nivel y su nombre', () => {
    render(
      <IndiceEstructura
        elementos={[
          h1('1. Introducción'),
          parrafo(12000),
          h1('2. Metodología'),
          h2('2.1 Instrumentos'),
          parrafo(80),
        ]}
      />,
    );
    expect(screen.getAllByRole('listitem').length).toBe(2);
    expect(screen.getAllByText('H1').length).toBe(2);
    // El H2 arranca oculto: la H1 manda.
    expect(screen.queryByText('H2')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Expandir 2\. Metodolog/i }));
    expect(screen.getByText('H2')).toBeTruthy();
    expect(screen.getByText('2.1 Instrumentos')).toBeTruthy();
  });

  it('el conteo exacto vive en la barra (nombre accesible), no como texto suelto en la fila', () => {
    render(
      <IndiceEstructura
        elementos={[h1('1. Introducción'), parrafo(12000), h1('2. Metodología'), parrafo(80)]}
      />,
    );
    expect(screen.getAllByRole('img', { name: /12\.000/ }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^12\.000$/)).toBeNull();
  });

  it('el estado problemático se marca con un punto accesible, no con texto largo', () => {
    render(<IndiceEstructura elementos={[h1('1. Metodología'), h2('1.1 Resultados'), parrafo(300)]} />);
    fireEvent.click(screen.getByRole('button', { name: /Expandir 1\. Metodolog/i }));
    expect(screen.getAllByRole('img', { name: /En duda/i }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/En duda/i)).toBeNull();
  });

  it('con una sola rama no se inventa una comparación', () => {
    render(<IndiceEstructura elementos={[h1('1. Introducción'), parrafo(500)]} />);
    expect(screen.queryByText('sin comparar')).toBeNull();
    expect(screen.queryByText(/no hay con qué/i)).toBeNull();
  });

  it('sin documento, el hueco se dice', () => {
    render(<IndiceEstructura elementos={null} />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('un documento sin encabezados lo dice, y no muestra una lista vacía', () => {
    render(<IndiceEstructura elementos={[parrafo(300), parrafo(200)]} />);
    expect(screen.getByText(/no tiene encabezados/i)).toBeTruthy();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('la fila no usa la banda navy ni un borde de acento por nivel', () => {
    const { container } = render(
      <IndiceEstructura elementos={[h1('1. Introducción'), h2('1.1 Antecedentes'), parrafo(200)]} />,
    );
    const filas = Array.from(container.querySelectorAll('.nodo-indice-row')) as HTMLElement[];
    expect(filas.length).toBeGreaterThan(0);
    for (const fila of filas) {
      expect(fila.style.backgroundColor).not.toBe('var(--color-navy-header)');
      expect(fila.style.borderLeft).not.toContain('var(--color-accent)');
    }
  });
});
