/**
 * El paso 5 del wizard ya no ofrece "Texto justificado" ni "Sangría primera
 * línea", y `wordapa7_body_advanced` dejó de ser un destino de escritura.
 *
 * Por qué importa, y por qué la prueba mira el archivo y no solo la pantalla:
 * los dos controles se guardaban en `wordapa7_body_advanced` y NADIE MÁS los
 * leía. El texto de abajo decía "se aplican al generar el documento final", y
 * eso era falso: no llegaban a `rules` ni a ningún endpoint. Peor: se peleaban
 * con `alignment` y `paragraph_indent_cm` de la pestaña Formato de Ajustes, que
 * sí se aplican. Dos controles que mienten y que contradicen a los que
 * funcionan.
 *
 * La prueba mira el archivo entero con detectores, porque un control puede
 * desaparecer de la pantalla sin dejar de estar escrito: los estados `advJustify`
 * y `advIndent` leían la clave al montar, y quedándose solo en el código ya
 * seguían leyéndola sin que nadie los viera.
 */
import React, { act } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Step5BodyWizard } from '../components/wizard/Step5BodyWizard';
import { useDocStore } from '../store/useDocStore';

/* El lienzo pesa y no tiene nada que ver con lo que se prueba acá: lo que
 * importa es el panel de la izquierda. Se lo reemplaza por un hueco. */
vi.mock('../components/layout/PaperCanvas', () => ({
  PaperCanvas: () => <div data-testid="lienzo-de-mentira" />,
}));

/**
 * El archivo entero, para mirar lo que la pantalla no muestra.
 *
 * Se lee con `?raw` y NO con `node:fs`, a proposito: `vite.config.ts` aplica
 * `nodePolyfills()`, que shimmea `fs`, y entonces `readFileSync` deja de ser una
 * funcion. O sea que un test que lee el fuente con `fs` funciona con una config
 * de vitest y se rompe con la del repo — que es exactamente la clase de test que
 * pasa verde solo en la maquina de quien lo escribio. `?raw` lo resuelve Vite y
 * no depende de los polyfills.
 */
const leer = async (): Promise<string> => {
  const mod = await import(
    /* @vite-ignore */ '../components/wizard/Step5BodyWizard.tsx?raw'
  );
  return String(mod.default ?? '');
};

const makeDoc = () => ({
  session_id: 's1',
  file_name: 't.docx',
  elements: [
    { id: 'e0', type: 'paragraph', text: 'uno', page_number: 1 },
    { id: 'e1', type: 'paragraph', text: 'dos', page_number: 1 },
    { id: 'e2', type: 'bullet', text: 'tres', page_number: 1 },
  ],
  meta: { page_count: 1 },
  referencias: [],
}) as never;

beforeEach(() => {
  localStorage.clear();
  act(() => {
    useDocStore.setState({ doc: makeDoc() } as never);
  });
});

describe('Paso 5 del cuerpo — los dos controles que mentían', () => {
  it('no ofrece ni "Texto justificado" ni "Sangría primera línea"', () => {
    render(<Step5BodyWizard />);
    expect(screen.queryByText(/Texto justificado/)).toBeNull();
    expect(screen.queryByText(/Sangría primera línea \(cm\)/)).toBeNull();
    /* Y el desplegable que los escondía no quedó sin nada que abrir: lo que
     * quedó es un puntero que dice dónde se cambia de verdad. */
    expect(screen.queryByText('Opciones avanzadas')).toBeNull();
    expect(screen.getByText(/pestaña Formato/)).toBeTruthy();
  });

  it('NO escribe en wordapa7_body_advanced, ni al montar ni al tocar nada', () => {
    localStorage.setItem('wordapa7_body_advanced', '{"justify":true,"indentCm":3}');
    render(<Step5BodyWizard />);
    /* Se tocó un control de los que quedan —el interlineado— y la clave tiene
     * que seguir exactamente como estaba: es decir, intacta. */
    act(() => { fireEvent.click(screen.getByText('1.5 líneas')); });
    expect(localStorage.getItem('wordapa7_body_advanced')).toBe('{"justify":true,"indentCm":3}');
  });

  it('el archivo ya no lee ni escribe la clave, y el texto falso se fue', async () => {
    const codigo = await leer();
    /* Ni una lectura ni una escritura. */
    expect(codigo).not.toMatch(/localStorage\.(get|set)Item\(\s*'wordapa7_body_advanced'/);
    expect(codigo).not.toMatch(/advJustify/);
    expect(codigo).not.toMatch(/advIndent/);
    /* Y el texto que afirmaba que se aplicaban al documento final. */
    expect(codigo).not.toMatch(/Se aplican al generar el documento final/);
  });

  it('el resumen de reglas se LEE de rules, no de números escritos a mano', () => {
    render(<Step5BodyWizard />);
    /* Con los valores de fábrica. Si el resumen los tuviera escritos a mano,
     * cambiar el formato en la pestaña Formato lo dejaría diciendo números que
     * ya no son ciertos. */
    expect(screen.getByText('1.27 cm · 2 párrafos')).toBeTruthy();
    act(() => {
      useDocStore.setState({
        rules: { ...useDocStore.getState().rules, paragraph_indent_cm: 3, margins_cm: 4 },
      } as never);
    });
    expect(screen.getByText('3 cm · 2 párrafos')).toBeTruthy();
    expect(screen.getByText(/^4 cm · /)).toBeTruthy();
  });

  it('el interlineado del paso 5 sigue funcionando: es el único formato que queda acá', () => {
    render(<Step5BodyWizard />);
    act(() => { fireEvent.click(screen.getByText('1.5 líneas')); });
    expect(useDocStore.getState().rules.line_spacing).toBe(1.5);
  });
});
