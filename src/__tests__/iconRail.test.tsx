/**
 * WordAPA7 — T4: el rail es de 56px fijos con solo iconos. El detalle no se
 * gana estirando la columna, se gana en el flyout.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { IconRail } from '../components/shell/IconRail';
import { EDITOR_RAIL_ITEMS } from '../components/shell/railItems';
import type { RailDestination } from '../components/shell/railItems';
import { useDocStore } from '../store/useDocStore';

// El rail pinta la fase activa leyendo el store, no por props: el test pone la
// fase a mano para poder afirmar cuál (y solo cuál) queda marcada.
const stepInicial = useDocStore.getState().wizardStep;
beforeEach(() => act(() => useDocStore.setState({ wizardStep: 1 })));
afterEach(() => act(() => useDocStore.setState({ wizardStep: stepInicial })));

const mkItems = (over: Partial<RailDestination> = {}): RailDestination[] =>
  EDITOR_RAIL_ITEMS.map(({ step, label, Icon, showOutline }) => ({
    id: `step-${step}`, step, label, Icon, status: 'idle', pending: 0, showOutline, ...over,
  }));

const setup = (items = mkItems()) => {
  const onEnterRail = vi.fn();
  const onLeaveRail = vi.fn();
  const onSelect = vi.fn();
  const utils = render(
    <IconRail
      items={items}
      onEnterRail={onEnterRail}
      onLeaveRail={onLeaveRail}
      onSelect={onSelect}
    />,
  );
  return { ...utils, onEnterRail, onLeaveRail, onSelect };
};

describe('T4 — IconRail', () => {
  it('muestra un botón por fase con nombre accesible; el chip label está en el DOM (aria-hidden)', () => {
    setup();
    for (const label of ['Portada', 'Estructura', 'Figuras', 'Referencias', 'Revisión & IA', 'Exportar']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    // El chip de nombre es aria-hidden y vive dentro del botón para la animación
    // CSS; el nombre accesible sigue viniendo del aria-label del botón, no del chip.
    // No afirmamos textContent==='' porque el chip sí aporta texto al DOM.
    const rail = screen.getByTestId('icon-rail');
    const chips = rail.querySelectorAll('[data-rail-chip]');
    chips.forEach((chip) => expect(chip.getAttribute('aria-hidden')).toBe('true'));
  });

  it('el hover de un destino NO lo elige: solo el clic elige', () => {
    /* El cambio de comportamiento, afirmado en la capa que lo produce. Antes el
       `onMouseEnter` de cada botón REPORTABA el destino, y ese reporte era lo
       que abría el flyout: el reporte literal del usuario, "al pasar el mouse
       por una fase que no salga la ventana flotante". Un panel de 240px que
       aparece sin que nadie lo pida, encima del documento.

       Lo que se quitó es la ELECCIÓN por puntero, no el aviso de puntero:
       entrar a un botón ES entrar al rail, y eso tiene que seguir avisando
       porque es lo que cancela el cierre de la gracia.

       LO QUE ESTA PRUEBA NO PUEDE VER, y conviene decirlo: `onSelect` es la
       única salida con un destino adentro, así que afirmar que el hover no la
       toca es afirmar que el hover no elige. Un gancho de apertura con otro
       nombre —uno que solo abriera el panel sin navegar— no la tocaría y
       esta prueba seguiría verde. Las otras dos capas sí lo cazan, porque ahí se
       afirma el EFFECTO y no la llamada: el panel no aparece en pantalla
       (`appShell.test.tsx` barre las seis fases) y no aparece en el segundo
       rail (`homeRail.test.tsx`). Esta capa afirma el contrato, no el efecto. */
    const { onSelect } = setup();
    const btn = screen.getByRole('button', { name: 'Revisión & IA' });
    fireEvent.mouseEnter(btn);
    expect(onSelect).not.toHaveBeenCalled();
    // Y el clic, que es el que abre, navega y ancla, sí lo elige.
    fireEvent.click(btn);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ step: 5 }));
  });

  it('entrar y salir del RAIL sí se reporta: es lo que cancela el cierre de la gracia', () => {
    /* Lo que se quitó es el hover de un BOTÓN abriendo el detalle, no la unión.
       El puntero que vuelve del panel al rail tiene que cancelar el cierre en
       vuelo, o el panel se iría con el puntero encima. Esa mitad de la máquina
       sigue entera, y por eso este contrato existe.

       Y entrar a un BOTÓN también cuenta como entrar al rail, porque el puntero
       está dentro del rail: por eso el manejador vive en el `<nav>` y no en cada
       botón. Un manejador por botón habría dejado un hueco entre dos botones
       seguidos, que es justo el hueco que se cruza al bajar por el rail. */
    const { onEnterRail, onLeaveRail } = setup();
    fireEvent.mouseEnter(screen.getByTestId('icon-rail'));
    expect(onEnterRail).toHaveBeenCalled();
    expect(onLeaveRail).not.toHaveBeenCalled();

    fireEvent.mouseLeave(screen.getByTestId('icon-rail'));
    expect(onLeaveRail).toHaveBeenCalled();
  });

  it('el clic de una fase navega', () => {
    const { onSelect } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Portada' }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ step: 1 }));
  });

  it('las fases son botones de verdad, alcanzables con teclado', () => {
    // El clic de teclado no se puede simular en jsdom, pero un <button> nativo
    // sí lo dispara: lo que hay que garantizar aquí es que no sea un div con
    // role, porque entonces el Enter no llegaría nunca.
    setup();
    const btn = screen.getByRole('button', { name: 'Figuras' });
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('type')).toBe('button');
    expect(btn.getAttribute('tabindex')).toBeNull();
  });

  it('marca como activo solo la fase actual, y la sigue cuando cambia', () => {
    const { unmount } = setup(mkItems());
    const activos = () =>
      screen.getAllByRole('button').filter((b) => b.getAttribute('data-active') === 'true');
    expect(activos()).toHaveLength(1);
    expect(activos()[0]).toBe(screen.getByRole('button', { name: 'Portada' }));
    unmount();

    setup(mkItems());
    act(() => useDocStore.setState({ wizardStep: 3 }));
    expect(activos()).toHaveLength(1);
    expect(activos()[0]).toBe(screen.getByRole('button', { name: 'Figuras' }));
  });

  it('nunca marca un destino que no es una fase, aunque la fase coincida', () => {
    act(() => useDocStore.setState({ wizardStep: 5 }));
    setup(mkItems().map((i) => (i.step === 5 ? { ...i, step: null, id: 'home' } : i)));
    const activos = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('data-active') === 'true');
    expect(activos).toHaveLength(0);
  });

  // `current` es la señal de los destinos que NO son fases (Inicio ⇄ Recientes):
  // el rail acepta las dos, pero cada una en su carril.
  const homeDestino = (over: Partial<RailDestination> = {}): RailDestination => ({
    ...mkItems()[0],
    id: 'home-inicio',
    step: null,
    label: 'Inicio',
    current: true,
    ...over,
  });

  it('`current` enciende un destino que no es fase, y lo anuncia como la página actual', () => {
    setup([homeDestino(), homeDestino({ id: 'home-recientes', label: 'Recientes', current: false })]);
    const inicio = screen.getByRole('button', { name: 'Inicio' });
    const recientes = screen.getByRole('button', { name: 'Recientes' });
    // A lo visto: la superficie de acento, como el sidebar que este rail reemplaza.
    expect(inicio.getAttribute('data-active')).toBe('true');
    expect(inicio.style.backgroundColor).toBe('var(--color-accent-soft)');
    expect(inicio.style.color).toBe('var(--color-accent)');
    // Y a lo leído por un lector de pantalla, que si no solo vería el color.
    expect(inicio.getAttribute('aria-current')).toBe('page');
    expect(recientes.getAttribute('data-active')).toBe('false');
    expect(recientes.getAttribute('aria-current')).toBeNull();
  });

  it('la fase del editor la sigue mandando el store, aunque haya un `current` al lado', () => {
    // El editor no fija `current`: si el rail lo tomara como prioridad, dejaría de
    // seguir a `wizardStep` y el icono se desincronizaría de la barra.
    const { unmount } = setup([homeDestino(), ...mkItems()]);
    const activos = () =>
      screen.getAllByRole('button').filter((b) => b.getAttribute('data-active') === 'true');
    expect(activos()).toHaveLength(2);
    expect(activos()[1]).toBe(screen.getByRole('button', { name: 'Portada' }));
    // Una fase del asistente es un "step" del recorrido, no una página.
    expect(activos()[1].getAttribute('aria-current')).toBe('step');
    unmount();

    setup([homeDestino(), ...mkItems()]);
    act(() => useDocStore.setState({ wizardStep: 3 }));
    const tras = screen.getAllByRole('button').filter((b) => b.getAttribute('data-active') === 'true');
    expect(tras).toHaveLength(2);
    expect(tras[1]).toBe(screen.getByRole('button', { name: 'Figuras' }));
  });

  it('sin `current` y sin fase, ningún destino se anuncia como actual', () => {
    setup([homeDestino({ current: undefined })]);
    expect(screen.getByRole('button', { name: 'Inicio' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('button', { name: 'Inicio' }).getAttribute('data-active')).toBe('false');
  });

  it('el hueco entre destinos es de 12px (--space-3) para mejor respiración vertical', async () => {
    // Specifiers en variables + imports dinámicos: Vite no debe pasar estos
    // módulos por nodePolyfills (mismo motivo que designTokens.test.ts).
    const NODE_FS = 'node:fs';
    const NODE_PATH = 'node:path';
    const NODE_URL = 'node:url';
    const { readFileSync } = await import(/* @vite-ignore */ NODE_FS);
    const { resolve } = await import(/* @vite-ignore */ NODE_PATH);
    const { fileURLToPath } = await import(/* @vite-ignore */ NODE_URL);
    const testDir = fileURLToPath(import.meta.url).replace(/[^/\\]+$/, '');
    const css = readFileSync(resolve(testDir, '../styles/design-system.css'), 'utf8');
    const raiz = css.slice(css.indexOf(':root,'), css.indexOf(':root[data-theme="dark"]'));

    setup();
    const token = screen.getByTestId('icon-rail').style.gap.match(/var\((--[\w-]+)/)?.[1];
    expect(token).toBe('--space-3');
    // El token se resuelve contra la hoja real:
    expect(raiz.match(new RegExp(`${token}:\\s*([^;]+);`))?.[1].trim()).toBe('12px');
  });

  it('el hover de una fase aplica la superficie y tinta de acento (zoom spring)', () => {
    // La señal visual principal del hover es el zoom spring (scale + width/height).
    // El color en hover usa accent-soft + accent, igual que la fase activa,
    // para reforzar la selección sin depender solo del tamaño.
    setup();
    const btn = screen.getByRole('button', { name: 'Figuras' });
    expect(btn.style.backgroundColor).toBe('transparent');
    fireEvent.mouseEnter(btn);
    expect(btn.style.backgroundColor).toBe('var(--color-accent-soft)');
    expect(btn.style.color).toBe('var(--color-accent)');
    fireEvent.mouseLeave(btn);
    expect(btn.style.backgroundColor).toBe('transparent');
    expect(btn.style.color).toBe('var(--color-text-secondary)');
  });

  it('el hover no borra la marca de la fase activa', () => {
    setup();
    const activa = screen.getByRole('button', { name: 'Portada' });
    fireEvent.mouseEnter(activa);
    expect(activa.style.backgroundColor).toBe('var(--color-accent-soft)');
    expect(activa.style.color).toBe('var(--color-accent)');
  });

  it('salir del rail por su borde suelta el hover, aunque no se cruce ningún botón', () => {
    setup();
    const btn = screen.getByRole('button', { name: 'Figuras' });
    fireEvent.mouseEnter(btn);
    expect(btn.style.backgroundColor).toBe('var(--color-accent-soft)');
    fireEvent.mouseLeave(screen.getByTestId('icon-rail'));
    expect(btn.style.backgroundColor).toBe('transparent');
  });

  it('el conteo de pendientes llega al NOMBRE del botón, no a un span por dentro', () => {
    // Un `aria-label` en un <span> dentro de un botón no suma nada al nombre
    // accesible: el nombre lo da el botón. El punto es decorativo; el número
    // tiene que estar en el `aria-label` del botón.
    const { unmount } = render(
      <IconRail items={mkItems()} onEnterRail={vi.fn()} onLeaveRail={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /pendientes/ })).toBeNull();
    unmount();

    render(
      <IconRail
        items={mkItems().map((i) => (i.step === 5 ? { ...i, pending: 7, status: 'pending' as const } : i))}
        onEnterRail={vi.fn()}
        onLeaveRail={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Revisión & IA, 7 pendientes' });
    expect(btn.getAttribute('aria-label')).toBe('Revisión & IA, 7 pendientes');
  });

  it('"Listo" también es parte del nombre, y solo en la fase completada', () => {
    const { unmount } = setup(mkItems());
    expect(screen.queryByRole('button', { name: /listo/ })).toBeNull();
    unmount();

    setup(mkItems().map((i) => (i.step === 2 ? { ...i, status: 'done' as const } : i)));
    const listos = screen.getAllByRole('button', { name: /, listo$/ });
    expect(listos).toHaveLength(1);
    expect(listos[0]).toHaveAccessibleName('Estructura, listo');
  });

  it('sin estado, el nombre es el de la fase pelado: un destino que no se completa no dice nada', () => {
    setup(mkItems().map(({ pending, status, ...rest }) => rest));
    for (const label of ['Portada', 'Figuras', 'Revisión & IA']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });
});
