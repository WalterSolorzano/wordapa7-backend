/**
 * El hub de Ajustes: es un diálogo modal, no un div.
 *
 * Tres cosas que no se ven en una captura y que son el motivo de este archivo:
 * que el foco ENTRE al abrir y VUELVA al cerrarse (si no, el teclado se pierde en
 * el body), que Escape cierre, y que la barra de pestañas sea horizontal —
 * `DESIGN.md:167` prohíbe los side-tabs gruesos y el inventario los encontró ya
 * en dos lugares, así que el tercero tenía que venir con guarda.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SettingsHub } from '../components/settings/SettingsHub';
import { PESTANAS, pestanaPorId } from '../components/settings/tabs';
import { useDocStore } from '../store/useDocStore';

const ETIQUETAS = ['Documento', 'Formato', 'Conexión', 'Revisión', 'App'];

describe('Ajustes — el hub de las cinco pestañas', () => {
  beforeEach(() => {
    useDocStore.setState({ settingsHubOpen: false, settingsHubTab: 'documento' });
  });

  afterEach(() => {
    act(() => useDocStore.setState({ settingsHubOpen: false, settingsHubTab: 'documento' }));
  });

  it('se abre como diálogo modal con las cinco pestañas', () => {
    render(<SettingsHub />);
    const dlg = screen.getByRole('dialog');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    for (const etiqueta of ETIQUETAS) {
      expect(screen.getByRole('tab', { name: etiqueta })).toBeTruthy();
    }
    expect(screen.getAllByRole('tab')).toHaveLength(PESTANAS.length);
  });

  it('la barra de pestañas es HORIZONTAL: los side-tabs están prohibidos', () => {
    render(<SettingsHub />);
    const barra = screen.getByTestId('settings-hub-tabs');
    /* `DESIGN.md:167`. Side-tabs sería `column`, o un borde de 3-4px de acento
     * en un solo lado. Las dos cosas se miran, porque "no es column" alcanza y
     * "no es un borde grueso de un lado" es la mitad de la prohibición.
     *
     * Los bordes se leen del atributo `style` y no de `style.borderLeftWidth`:
     * jsdom no resuelve el atajo `border: none` y devuelve el `medium` por
     * defecto del navegador, así que la propiedad computada no distinguiría
     * "sin borde" de "borde por omisión". */
    expect(barra.style.flexDirection).toBe('row');
    const activa = screen.getByRole('tab', { name: 'Documento' }).getAttribute('style') || '';
    /* Los bordes se leen del atributo `style` y no de `getComputedStyle`: jsdom
     * no resuelve el atajo `border: none` y devuelve el `medium` del navegador
     * como si fuera un ancho. El filtro busca un ancho en píxeles, que es
     * exactamente lo que un side-tab de 3-4px escribiría. */
    expect(activa).not.toMatch(/border-(left|right|top):\s*[\d.]+px/);
    /* El acento va abajo, como en `SettingsPreviewStudio.tsx:136`, y con 2px. */
    expect(activa).toMatch(/border-bottom:\s*2px solid var\(--color-accent\)/);
    expect(activa).toMatch(/background:\s*var\(--color-accent-soft\)/);
  });

  it('debajo de la barra dice el ámbito de la pestaña activa', () => {
    const { rerender } = render(<SettingsHub />);
    expect(screen.getByTestId('settings-hub-subtitulo').textContent).toBe(
      pestanaPorId('documento').subtitulo,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Conexión' }));
    expect(screen.getByTestId('settings-hub-subtitulo').textContent).toBe(
      pestanaPorId('conexion').subtitulo,
    );
    rerender(<SettingsHub />);
  });

  it('cambiar de pestaña escribe en el store, no en un estado local', () => {
    render(<SettingsHub />);
    fireEvent.click(screen.getByRole('tab', { name: 'Revisión' }));
    expect(useDocStore.getState().settingsHubTab).toBe('revision');
    /* La pestaña activa se marca con `aria-selected`, y solo una: es lo que hace
     * que la barra sea legible para un lector de pantalla. */
    const marcadas = screen.getAllByRole('tab').filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(marcadas).toHaveLength(1);
    expect(marcadas[0].textContent).toBe('Revisión');
  });

  it('el store manda: si el id cambia por fuera, la barra lo sigue', () => {
    render(<SettingsHub />);
    act(() => useDocStore.setState({ settingsHubTab: 'formato' }));
    const marcadas = screen.getAllByRole('tab').filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(marcadas).toHaveLength(1);
    expect(marcadas[0].textContent).toBe('Formato');
  });

  it('Escape cierra: avisa al que lo abrió y baja el flag del store', () => {
    const onClose = vi.fn();
    render(<SettingsHub onClose={onClose} />);
    act(() => useDocStore.setState({ settingsHubOpen: true }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useDocStore.getState().settingsHubOpen).toBe(false);
  });

  it('el botón de cerrar hace lo mismo que Escape', () => {
    const onClose = vi.fn();
    render(<SettingsHub onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar Ajustes' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('al abrir el foco ENTRA, y al cerrar vuelve a donde estaba', () => {
    const afuera = document.createElement('button');
    document.body.appendChild(afuera);
    afuera.focus();
    expect(document.activeElement).toBe(afuera);

    const { unmount } = render(<SettingsHub />);
    expect(document.activeElement).not.toBe(afuera);
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);

    unmount();
    expect(document.activeElement).toBe(afuera);
    document.body.removeChild(afuera);
  });

  it('Tab queda atrapado adentro: del último control vuelve al primero', () => {
    render(<SettingsHub />);
    /* El orden de tabulación del diálogo: primero el botón de cerrar (está en el
     * encabezado, antes de la barra) y después las cinco pestañas. El ciclo
     * tiene que cerrar sobre ESE orden, no sobre el de las pestañas. */
    const dlg = screen.getByRole('dialog');
    const focuses = Array.from(dlg.querySelectorAll('button')) as HTMLButtonElement[];
    expect(focuses.map((b) => b.textContent)).toEqual([
      '', 'Documento', 'Formato', 'Conexión', 'Revisión', 'App',
    ]);
    const primero = focuses[0];
    const ultimo = focuses[focuses.length - 1];
    ultimo.focus();
    /* `fireEvent` devuelve `false` cuando el handler llamó `preventDefault`, y
     * ese preventDefault es lo que evita que el navegador se vaya al `body`. */
    expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(false);
    expect(document.activeElement).toBe(primero);
    /* En el medio no hay nada que interceptar: el tabulador sigue su curso. */
    primero.focus();
    expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(true);
  });

  it('Shift+Tab del primero vuelve al último', () => {
    render(<SettingsHub />);
    const dlg = screen.getByRole('dialog');
    const focuses = Array.from(dlg.querySelectorAll('button')) as HTMLButtonElement[];
    focuses[0].focus();
    expect(fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(focuses[focuses.length - 1]);
  });
});
