/* W2 — El índice preview es como el de Word: numeración elegida y página.
 *
 * La preview recibe el texto ya numerado (`construirTextosDeTitulo`) y una
 * función de página (`usePageIndex().pageOf`). Sin fuente de páginas no dibuja
 * la columna; con fuente, lo que no conoce lo marca con `—`, nunca lo inventa.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { IndicePrevisualizacion } from '../IndicePrevisualizacion';
import { construirJerarquia } from '../../../lib/jerarquia';
import type { ElementModel } from '../../../types';

const elementos = [
  { id: 'h1', type: 'heading', text: 'Introducción', heading_level: 1 },
  { id: 'h2', type: 'heading', text: 'Contexto', heading_level: 2 },
  { id: 'h1b', type: 'heading', text: 'Método', heading_level: 1 },
] as unknown as ElementModel[];

const raices = construirJerarquia(elementos);

const textosTitulo = new Map([
  ['h1', 'I. Introducción'],
  ['h2', '1.a. Contexto'],
  ['h1b', 'II. Método'],
]);

const paginas: Record<string, number | null> = { h1: 1, h2: 1, h1b: 4 };

describe('IndicePrevisualizacion — numeración y páginas', () => {
  it('muestra el texto numerado cuando se lo dan', () => {
    render(<IndicePrevisualizacion raices={raices} textosTitulo={textosTitulo} />);
    expect(screen.getByText('I. Introducción')).toBeTruthy();
    expect(screen.queryByText('Introducción')).toBeNull();
  });

  it('sin fuente de páginas no dibuja la columna', () => {
    render(<IndicePrevisualizacion raices={raices} textosTitulo={textosTitulo} />);
    expect(screen.queryByText('—')).toBeNull();
    expect(screen.queryByText('4')).toBeNull();
  });

  it('muestra la página real del título', () => {
    render(
      <IndicePrevisualizacion
        raices={raices}
        textosTitulo={textosTitulo}
        paginaDe={(id) => paginas[id] ?? null}
      />,
    );
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });

  it('marca con — la página que no conoce, sin inventarla', () => {
    render(
      <IndicePrevisualizacion
        raices={raices}
        textosTitulo={textosTitulo}
        paginaDe={() => null}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Introducción/i }));
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
