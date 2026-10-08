/**
 * F1 · Task 2 — el overlay de carga tiene que decir la verdad sobre lo que tapa.
 *
 * El defecto que se reporto no era "un overlay de carga": era un `zIndex: 9999`
 * inline sobre un `position: fixed` a pantalla completa, que gana al `z-index`
 * de su propia clase y se lleva por delante el rail, su flyout y el workbench.
 * El usuario vio una pantalla morada y creyó que le habían cambiado de vista.
 *
 * Estas tres pruebas miran las tres cosas que lo vuelven imposible:
 *   1. la capa no trae `z-index` inline, y la clase lo toma de la escala;
 *   2. la capa DICE QUÉ está pasando, no solo que algo pasa;
 *   3. una tarea corta no deja la pantalla puesta tres segundos y medio.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { LoadingTips } from '../components/layout/LoadingTips';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('LoadingTips — la capa de carga', () => {
  it('no se monta con un z-index inline que pisa la escala del proyecto', () => {
    /* El defecto: `style={{ zIndex: 9999 }}` inline, que gana al `z-index` de
       `.loading-tips-fullscreen` y tapa el rail, el flyout y el workbench. Un
       numero de tres digitos escrito a mano no se discute con la escala: la pisa. */
    const { container } = render(<LoadingTips activo />);
    const capa = container.querySelector('[data-testid="carga-capa"]');
    expect(capa).toBeTruthy();
    expect((capa as HTMLElement).style.zIndex).toBe('');
    /* Y tampoco la geometria: `position: fixed`, `inset` y el tamano van en la
       clase, no en el elemento. Un inline que repite la clase es un inline que
       puede discrepar de ella. */
    expect((capa as HTMLElement).style.position).toBe('');
  });

  it('dice QUE esta pasando, no solo que algo pasa', () => {
    /* Un spinner mudo obliga a adivinar. La Fase 7 va a necesitar esto para
       "Subiendo capitulo-3.docx (3 de 20)"; hoy la prop existe y se renderiza,
       y la prueba es la que obliga a que siga existiendo. */
    render(<LoadingTips activo que="Escaneando el documento" />);
    expect(screen.getByText('Escaneando el documento')).toBeTruthy();
  });

  it('una tarea corta no deja el overlay puesto tres segundos y medio', async () => {
    /* El defecto: `MIN_DISPLAY_MS = 3500`, así que una tarea de 180 ms se queda
       3.3 s extra en pantalla. Con la barra de proyectos subiendo veinte archivos
       en serie, eso son setenta segundos de pantalla fija. */
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { rerender } = render(<LoadingTips activo que="Subiendo" />);
    expect(screen.getByTestId('carga-capa')).toBeTruthy();

    rerender(<LoadingTips activo={false} que="Subiendo" />);
    await waitFor(() => expect(screen.queryByTestId('carga-capa')).toBeNull(), { timeout: 1200 });
  });

  it('la mascota reacciona con expresion y herramienta adecuada segun la frase', async () => {
    const { getTipReaction } = await import('../components/layout/LoadingTips');

    // Detección IA -> worried, reference
    const r1 = getTipReaction({ category: 'ai', text: 'contando cuántos en conclusión te dejó ChatGPT...' });
    expect(r1.kind).toBe('reference');
    expect(r1.expression).toBe('worried');

    // APA regla de margen -> curious, ruler
    const r2 = getTipReaction({ category: 'apa', text: 'recalibrando márgenes de 2.54 cm en cada esquina…' });
    expect(r2.kind).toBe('ruler');
    expect(r2.expression).toBe('curious');

    // Estudiante / café / graduación -> excited, highlighter
    const r3 = getTipReaction({ category: 'student', text: 'calculando cuánto café queda en tu sistema circulatorio…' });
    expect(r3.kind).toBe('highlighter');
    expect(r3.expression).toBe('excited');

    // Word hell -> worried, strike
    const r4 = getTipReaction({ category: 'wordhell', text: 'evitando que mover una imagen mande tres párrafos al abismo...' });
    expect(r4.kind).toBe('strike');
    expect(r4.expression).toBe('worried');
  });
});
