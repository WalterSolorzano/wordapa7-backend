/**
 * WordAPA7 — T5: el flyout se abre al hover y se cierra con 120ms de gracia
 * para que el puntero pueda cruzar el hueco sin perderlo (Review Focus #3).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { RailFlyout, FLYOUT_CLOSE_GRACE_MS } from '../components/shell/RailFlyout';
import { EDITOR_RAIL_ITEMS } from '../components/shell/railItems';
import type { RailDestination } from '../components/shell/railItems';

const item: RailDestination = {
  id: 'step-2',
  step: 2,
  label: 'Estructura',
  Icon: EDITOR_RAIL_ITEMS[1].Icon,
  status: 'pending',
  pending: 4,
  showOutline: true,
};

describe('T5 — RailFlyout', () => {
  // Los temporizadores falsos se arman en cada test, no una vez a nivel de módulo:
  // el afterEach los devuelve a reales y una llamada de módulo solo alcanzaría
  // para el primer test del archivo.
  beforeEach(() => {
    vi.useFakeTimers();
    useDocStore.setState({ railPinned: false });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('no monta nada sin destino', () => {
    const { container } = render(<RailFlyout item={null} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('muestra la etiqueta y el estado del destino', () => {
    render(<RailFlyout item={item} onClose={vi.fn()} />);
    expect(screen.getByText('Estructura')).toBeTruthy();
    expect(screen.getByText('4 pendientes')).toBeTruthy();
  });

  it('el conteo solo acompaña al estado pending, no a "Listo" ni a "Sin pendientes"', () => {
    const { unmount } = render(
      <RailFlyout item={{ ...item, status: 'done', pending: 3 }} onClose={vi.fn()} />,
    );
    expect(screen.getByText('Listo')).toBeTruthy();
    expect(screen.queryByText('3 Listo')).toBeNull();
    unmount();

    render(<RailFlyout item={{ ...item, status: 'idle', pending: 3 }} onClose={vi.fn()} />);
    expect(screen.getByText('Sin pendientes')).toBeTruthy();
    expect(screen.queryByText('3 Sin pendientes')).toBeNull();
  });

  it('sin destino, el componente es inerte: Esc no cierra ni suelta el ancla', () => {
    // AppShell lo monta siempre; con `item: null` no hay panel que Esc pueda
    // cerrar, y el ancla de la próxima apertura debe sobrevivir intacta.
    const onClose = vi.fn();
    act(() => useDocStore.setState({ railPinned: true }));
    render(<RailFlyout item={null} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(useDocStore.getState().railPinned).toBe(true);
  });

  it('la gracia de cierre son 120ms exactos', () => {
    expect(FLYOUT_CLOSE_GRACE_MS).toBe(120);
  });

  it('un clic ancla el flyout y Esc lo suelta', () => {
    render(<RailFlyout item={item} onClose={vi.fn()} />);
    const pin = screen.getByRole('button', { name: 'Anclar panel' });
    expect(pin.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(pin);
    expect(useDocStore.getState().railPinned).toBe(true);
    expect(pin.getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useDocStore.getState().railPinned).toBe(false);
  });

  it('el mapa del documento solo aparece en las fases de sección', () => {
    const { unmount } = render(<RailFlyout item={item} onClose={vi.fn()} />);
    expect(screen.getByText('Sin títulos detectados')).toBeTruthy();
    unmount();

    // Portada no es fase de sección: el rail no promete un mapa que no hay.
    render(<RailFlyout item={{ ...item, showOutline: false }} onClose={vi.fn()} />);
    expect(screen.queryByText('Sin títulos detectados')).toBeNull();
  });

  it('EN EL CATÁLOGO, el árbol es de UNA sola fase: la de Estructura', () => {
    /* La mitad que no se puede probar desde el componente. `RailFlyout` monta el
       árbol cuando el destino dice `showOutline`, así que el componente es
       obediente y no puede decir nada del catálogo: el error estaba en el
       catálogo, con el árbol declarado en Figuras y Referencias. Por eso la
       afirmación es sobre el catálogo, y sobre la fase y no sobre el
       identificador: la fase es la que el rail promete como activa, así que es
       la que no puede contradecir. */
    const conArbol = EDITOR_RAIL_ITEMS.filter((i) => i.showOutline);
    expect(conArbol.map((i) => i.step)).toEqual([2]);
    /* Y el nombre de esa fase se dice, para que un fallo diga cuál: un
       `toEqual([2])` que falla con un número y un comentario dice poco. */
    expect(EDITOR_RAIL_ITEMS.find((i) => i.showOutline)?.label).toBe('Estructura');
  });

  it('ninguna fase del editor ofrece ya el árbol flotante, ni siquiera Estructura', () => {
    /* El rediseño quitó el panel flotante del rail en Estructura y Figuras, así
       que ya no hay ninguna fase que monte el árbol al abrir su detalle. El
       catálogo conserva `showOutline` en Estructura (el mapa sigue disponible
       en el panel derecho), pero el flyout ya no se abre en esa fase. */
    for (const i of EDITOR_RAIL_ITEMS) {
      const { unmount } = render(<RailFlyout item={{ ...item, ...i, status: 'pending', pending: 1 }} onClose={vi.fn()} />);
      const hayArbol = screen.queryByText('Sin títulos detectados') !== null;
      expect(hayArbol, `la fase ${i.label} (${i.step}) ofrece el árbol de estructura`).toBe(false);
      unmount();
    }
  });

  it('flota sobre el workbench: absoluto, a 64px del rail y de 240px', () => {
    // El centro de Revisión no puede estrecharse porque el usuario lea una
    // etiqueta: por eso esto es `absolute` y no un hermano flex.
    render(<RailFlyout item={item} onClose={vi.fn()} />);
    const fly = screen.getByTestId('rail-flyout');
    expect(fly.style.position).toBe('absolute');
    expect(fly.style.left).toBe('64px');
    expect(fly.style.width).toBe('240px');
  });

  it('`top: 12` son los 12px del padding del RAIL, no los 12px de la ventana', () => {
    // `12` solo no dice nada: el mismo número es correcto en Inicio y estaba
    // 48px alto en el editor, porque `.app-main` era `static` y el offset se
    // resolvía contra la raíz del shell (borde de la ventana). Lo que decide es
    // el ancestro posicionado, y esa parte se afirma en appShell.test.tsx sobre
    // el DOM real. Acá queda el número, que es el que depende de él.
    render(<RailFlyout item={item} onClose={vi.fn()} />);
    expect(screen.getByTestId('rail-flyout').style.top).toBe('12px');
    // `left` comparte la misma causa: 56 del rail + 8 de hueco.
    expect(screen.getByTestId('rail-flyout').style.left).toBe('64px');
  });

  it('un destino SIN estado no dibuja fila de estado: "Sin pendientes" sobre Ajustes miente', () => {
    // Ajustes, Tema y el Complemento de Word no se completan ni se posponen:
    // no tienen un cero honesto que anunciar. `status` es opcional justamente
    // para eso, y la fila se omite en vez de inventarse.
    const { unmount } = render(
      <RailFlyout item={{ ...item, id: 'home-ajustes', step: null, status: undefined, pending: undefined }} onClose={vi.fn()} />,
    );
    expect(screen.queryByText('Sin pendientes')).toBeNull();
    expect(screen.queryByText('Listo')).toBeNull();
    unmount();

    // Un destino de fase SÍ la dibuja, aunque sea para decir que no hay nada.
    render(<RailFlyout item={{ ...item, status: 'idle' }} onClose={vi.fn()} />);
    expect(screen.getByText('Sin pendientes')).toBeTruthy();
  });

  it('el panel anclado se cierra con un botón, no solo con Esc', () => {
    // Con teclado no hay hover que abra el panel: el clic en una fase lo ancla.
    // Antes el único cierre era Esc, así que un usuario de ratón se quedaba
    // con 240px de overlay sobre el documento y sin salida visible.
    const onClose = vi.fn();
    render(<RailFlyout item={item} onClose={onClose} />);
    const cerrar = screen.getByRole('button', { name: 'Cerrar detalle' });
    expect(cerrar.tagName).toBe('BUTTON');
    fireEvent.click(cerrar);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('mientras está anclado, salir con el puntero no lo cierra', () => {
    // La puerta del ancla vive en el shell (`scheduleClose` no programa si está
    // anclado). Aquí lo que se afirma es la mitad que sí es de este componente:
    // salir no cierra nada por su cuenta.
    const onClose = vi.fn();
    const onLeave = vi.fn();
    render(<RailFlyout item={item} onClose={onClose} onLeave={onLeave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Anclar panel' }));
    fireEvent.mouseLeave(screen.getByTestId('rail-flyout'));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onClose).not.toHaveBeenCalled();
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('salir y reentrar se reportan hacia arriba, y el panel no se cierra solo', () => {
    // El timer de la gracia es de la unión rail + flyout y lo posee el shell:
    // si el flyout se armara uno propio, su salida no se podría cancelar desde el
    // rail. Estos callbacks son el único contrato que necesita.
    const onClose = vi.fn();
    const onEnter = vi.fn();
    const onLeave = vi.fn();
    render(<RailFlyout item={item} onClose={onClose} onEnter={onEnter} onLeave={onLeave} />);
    const fly = screen.getByTestId('rail-flyout');
    fireEvent.mouseLeave(fly);
    act(() => { vi.advanceTimersByTime(80); });
    fireEvent.mouseEnter(fly);
    fireEvent.mouseLeave(fly);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(2);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sin shell que programe el cierre, el panel se queda: no hay temporizador propio', () => {
    const onClose = vi.fn();
    render(<RailFlyout item={item} onClose={onClose} />);
    fireEvent.mouseLeave(screen.getByTestId('rail-flyout'));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Esc además de soltar el ancla, cierra el panel', () => {
    const onClose = vi.fn();
    render(<RailFlyout item={item} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
