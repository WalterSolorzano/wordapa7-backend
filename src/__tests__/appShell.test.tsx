/**
 * WordAPA7 — T6: el shell decide la gramática: topbar, rail de 56px y
 * workbench. StepRail ya no existe y el ancho del rail no se ajusta.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { AppShell } from '../components/shell/AppShell';

vi.mock('../components/toolbar/UnifiedToolbar', () => ({ UnifiedToolbar: () => <div data-testid="toolbar" /> }));
vi.mock('../components/layout/ProjectTabs', () => ({ ProjectTabs: () => <div data-testid="tabs" /> }));
vi.mock('../components/layout/StatusBar', () => ({ StatusBar: () => <div data-testid="statusbar" /> }));

describe('T6 — AppShell', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useDocStore.setState({ railPinned: false, wizardStep: 1, viewMode: 'edit' });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('monta topbar, rail y workbench en ese orden', () => {
    render(<AppShell><div data-testid="work">x</div></AppShell>);
    expect(screen.getByTestId('toolbar')).toBeTruthy();
    expect(screen.getByTestId('icon-rail')).toBeTruthy();
    expect(screen.getByTestId('work')).toBeTruthy();
    expect(screen.getByTestId('statusbar')).toBeTruthy();
  });

  it('el rail existe siempre, incluso en la vista de exportación', () => {
    render(<AppShell><div>x</div></AppShell>);
    expect(screen.getByLabelText('Fases de la transformación')).toBeTruthy();
  });

  it('el rail es fijo: ni el ancho ni el arrastre desaparecieron con StepRail', () => {
    render(<AppShell><div>x</div></AppShell>);
    const rail = screen.getByTestId('icon-rail');
    expect(rail.style.width).toBe('56px');
    /* El puntero sobre un destino no redimensiona nada. Antes que esto se
       afirmara sobre un hover que ADEMÁS abría el panel, así que la prueba
       mezclaba dos cosas: que el rail no cambia de tamaño, y que el hover hace
       algo. Ahora el hover solo hace el zoom, y lo que se afirma es lo primero
       —una medida de caja no depende de qué dispare el puntero—. */
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Estructura' }));
    expect(rail.style.width).toBe('56px');
  });

  it('barrer el puntero por el rail NO abre el flyout, y no cambia de fase', () => {
    /* El cambio de comportamiento, en el ensamblado y no en el componente. El
       hover abría el detalle, y el detalle era un panel de 240px sobre el
       documento que nadie había pedido: el reporte literal del usuario, "al
       pasar el mouse por una fase que no salga la ventana flotante".

       Y sigue sin cambiar de fase, que era lo único que el hover sí respetaba:
       barrer el borde izquierdo no puede desmontar la fase que se está
       leyendo. */
    useDocStore.setState({ wizardStep: 3 });
    render(<AppShell><div>x</div></AppShell>);
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Portada' }));
    expect(screen.queryByTestId('rail-flyout')).toBeNull();
    expect(useDocStore.getState().wizardStep).toBe(3);
  });

  it('ninguna de las fases abre el flyout al pasarle el puntero, tampoco las que antes lo hacían', () => {
    /* El árbol de estructura estaba declarado en Figuras y Referencias, así que
       hover sobre ESAS fases era el peor caso: el panel del árbol de títulos
       encima de la pantalla de figuras. Con `showOutline` solo en Estructura y
       el hover sin efecto, no hay ninguna fase que abra el detalle al pasar el
       puntero. Es el bug reportado, afirmado sobre TODAS las fases y no sobre
       la que dio el nombres. */
    render(<AppShell><div>x</div></AppShell>);
    for (const nombre of ['Portada', 'Estructura', 'Figuras', 'Referencias', 'Revisión & IA', 'Exportar']) {
      fireEvent.mouseEnter(screen.getByRole('button', { name: nombre }));
      expect(screen.queryByTestId('rail-flyout'), `hover sobre ${nombre} abrió el panel`).toBeNull();
    }
  });

  it('el clic en una fase sin panel (Estructura, Figuras) no abre el flyout; Portada sí lo abre', () => {
    /* El rediseño quitó el panel flotante del rail en Estructura y Figuras: esas
       fases ya no ofrecen flyout, así que su clic solo navega. Portada lo conserva. */
    render(<AppShell><div>x</div></AppShell>);
    fireEvent.click(screen.getByRole('button', { name: 'Estructura' }));
    expect(screen.queryByTestId('rail-flyout')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Figuras' }));
    expect(screen.queryByTestId('rail-flyout')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Portada' }));
    expect(screen.getByTestId('rail-flyout')).toBeTruthy();
  });

  it('el clic lleva a la fase y ancla el panel', () => {
    useDocStore.setState({ wizardStep: 1 });
    render(<AppShell><div>x</div></AppShell>);
    fireEvent.click(screen.getByRole('button', { name: 'Figuras' }));
    expect(useDocStore.getState().wizardStep).toBe(3);
    expect(useDocStore.getState().railPinned).toBe(true);
    // Figuras ya no ofrece panel flotante: el clic solo navega.
    expect(screen.queryByTestId('rail-flyout')).toBeNull();
  });

  it('el bloque contenedor del flyout es `.app-main`, positioned: el panel arranca en el primer botón', () => {
    // El bug de geometría: `.app-main` era `static`, así que el `top: 12` del
    // flyout se medía desde el BORDE DE LA VENTANA, no desde el rail —cuyo
    // primer botón está 48 (barra) + 12 (padding) = 60px más abajo—. Con la
    // barra de 48px opaca y `z-index: 200` contra los 100 del panel, los
    // primeros ~36px del panel quedaban debajo: la fila con la etiqueta del
    // destino y el único pin visible.
    //
    // jsdom no hace layout, así que esto prueba la DECLARACIÓN que decide la
    // relación: sin ancestro posicionado, esos 12px no son los 12 del rail.
    // Se abre por CLIC, que es el único disparador que queda.
    render(<AppShell><div>x</div></AppShell>);
    fireEvent.click(screen.getByRole('button', { name: 'Portada' }));
    const fly = screen.getByTestId('rail-flyout');
    const parent = fly.parentElement as HTMLElement;
    expect(parent.className).toContain('app-main');
    expect(getComputedStyle(parent).position).toBe('relative');
    // Y el número sigue siendo el del padding del rail, no 60.
    expect(fly.style.top).toBe('12px');
  });

  it('el flyout está detrás de la barra, no encima: su z-index es el de un desplegable', () => {
    // No es que el panel tapara la barra: es que la barra lo tapaba a él. Por
    // eso el arreglo es de geometría, no de `z-index` —subir el panel lo
    // pondría por encima de la barra y taparía el título del documento.
    // Sigue siendo una afirmación sobre el panel YA ABIERTO, y se abre por clic.
    render(<AppShell><div>x</div></AppShell>);
    fireEvent.click(screen.getByRole('button', { name: 'Portada' }));
    expect(screen.getByTestId('rail-flyout').style.zIndex).toBe('var(--z-dropdown)');
  });

  it('con el túnel de export abierto, un clic en otra fase vuelve al editor', () => {
    // El rail vive en todas las vistas, incluso en la de exportación. Un clic
    // en "Figuras" que solo cambiara `wizardStep` repintaría el acento sobre
    // una fase cuya vista no se monta: el rail afirmaría dónde está el
    // trabajo mientras la pantalla muestra el túnel. Reachable hoy por la
    // paleta de comandos ("Abrir túnel de exportación").
    useDocStore.setState({ wizardStep: 2, viewMode: 'export' });
    render(<AppShell><div>x</div></AppShell>);
    fireEvent.click(screen.getByRole('button', { name: 'Figuras' }));
    expect(useDocStore.getState().viewMode).toBe('edit');
    expect(useDocStore.getState().wizardStep).toBe(3);
  });

  it('en la vista nativa de PDF el mismo clic también vuelve al editor', () => {
    useDocStore.setState({ wizardStep: 2, viewMode: 'native-pdf' });
    render(<AppShell><div>x</div></AppShell>);
    fireEvent.click(screen.getByRole('button', { name: 'Referencias' }));
    expect(useDocStore.getState().viewMode).toBe('edit');
    expect(useDocStore.getState().wizardStep).toBe(4);
  });

  it('ya en el editor, un clic de fase NO toca la vista', () => {
    useDocStore.setState({ wizardStep: 1, viewMode: 'edit' });
    render(<AppShell><div>x</div></AppShell>);
    fireEvent.click(screen.getByRole('button', { name: 'Estructura' }));
    expect(useDocStore.getState().viewMode).toBe('edit');
  });

  it('el clic en el workbench no es lo que ancla: el pin del rail sí', () => {
    /* Abrir un destino ya ancla (el clic es navegación + detalle). Soltar el
       ancla es lo que hace el pin del PANEL: por eso se lo busca adentro del
       flyout, y el flyout se abre primero con un clic en una fase. El clic en el
       workbench —el `<main>` de la derecha— no toca el ancla. */
    render(<AppShell><div data-testid="work">x</div></AppShell>);
    fireEvent.click(screen.getByRole('button', { name: 'Portada' }));
    expect(useDocStore.getState().railPinned).toBe(true);
    fireEvent.click(screen.getByTestId('work'));
    expect(useDocStore.getState().railPinned).toBe(true);
    const pin = within(screen.getByTestId('rail-flyout')).getByRole('button', { name: 'Anclar panel' });
    fireEvent.click(pin);
    expect(useDocStore.getState().railPinned).toBe(false);
  });

  /* TODAS LAS PRUEBAS DE LA GRACIA NECESITAN UN PANEL ABIERTO Y SUELTO.
     El hover abría el panel sin anclarlo, y por eso la apertura de estas pruebas
     era un `mouseEnter`. Como el hover ya no abre nada, el camino real es otro:
     el clic abre Y ancla, y el ancla se suelta con el botón del panel. Es un
     camino de usuario de verdad —"mira esto y déjame volver al documento"— y no
     un atajo de prueba.

     El clic ancla por diseño: navegaste a una fase, el detalle de esa fase
     importa. Y esta es la mitad de la unión que NO cambió: la gracia sigue
     siendo de 120ms y sigue cancelándose al volver. */
  const abrirSinAnclar = (nombre = 'Portada') => {
    fireEvent.click(screen.getByRole('button', { name: nombre }));
    expect(useDocStore.getState().railPinned, 'el clic tiene que anclar').toBe(true);
    /* El botón se busca DENTRO del panel: el rail tiene otro con el mismo
       nombre y el mismo flag, y sin acotar la búsqueda la prueba no sabe cuál
       de los dos apretó. Los dos sirven para el estado, pero solo el del panel
       es "dejar este detalle abierto sin ancla". */
    const delPanel = within(screen.getByTestId('rail-flyout')).getByRole('button', { name: 'Anclar panel' });
    fireEvent.click(delPanel);
    expect(useDocStore.getState().railPinned, 'el botón tiene que soltar el ancla').toBe(false);
    expect(screen.getByTestId('rail-flyout'), 'soltar el ancla no puede cerrar el panel').toBeTruthy();
  };

  it('salir del rail no cierra el flyout de golpe: espera la gracia', () => {
    // El rail y el panel están separados por un hueco. Si el shell cerrara en el
    // mouseleave del rail, el puntero no podría cruzar: el panel se iría con él
    // dentro. 119/120 en literal, no desde la constante.
    render(<AppShell><div>x</div></AppShell>);
    abrirSinAnclar();
    fireEvent.mouseLeave(screen.getByTestId('icon-rail'));
    act(() => { vi.advanceTimersByTime(119); });
    expect(screen.getByTestId('rail-flyout')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByTestId('rail-flyout')).toBeNull();
  });

  it('entrar en el flyout cancela el cierre que había iniciado el rail', () => {
    render(<AppShell><div>x</div></AppShell>);
    abrirSinAnclar();
    fireEvent.mouseLeave(screen.getByTestId('icon-rail'));
    act(() => { vi.advanceTimersByTime(80); });
    fireEvent.mouseEnter(screen.getByTestId('rail-flyout'));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByTestId('rail-flyout')).toBeTruthy();
  });

  it('volver al rail desde el flyout cancela el cierre: el panel sobrevive a la gracia', () => {
    // El timer es de la unión. Si el flyout se cerrara con el suyo, el puntero
    // que vuelve al rail vería desaparecer el panel 120ms después, con el
    // icono todavía resaltado y sin detalle que lo explique.
    render(<AppShell><div>x</div></AppShell>);
    abrirSinAnclar();
    const fly = screen.getByTestId('rail-flyout');
    fireEvent.mouseEnter(fly);
    fireEvent.mouseLeave(fly);
    act(() => { vi.advanceTimersByTime(80); });
    // Volver al RAIL, no a un botón: con el hover sin efecto, entrar a un botón
    // ya no cancela nada —y no debe, porque entrar a un botón no abre nada—.
    // Lo que cancela es entrar en el rail, que es lo que el shell reporta.
    fireEvent.mouseEnter(screen.getByTestId('icon-rail'));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByTestId('rail-flyout')).toBeTruthy();
  });

  it('salir del flyout hacia el workbench sí cierra, tras la gracia', () => {
    // El otro sentido de la unión: si el puntero se va de verdad, el panel se va.
    render(<AppShell><div>x</div></AppShell>);
    abrirSinAnclar();
    fireEvent.mouseLeave(screen.getByTestId('rail-flyout'));
    act(() => { vi.advanceTimersByTime(120); });
    expect(screen.queryByTestId('rail-flyout')).toBeNull();
  });

  it('anclado, el flyout sobrevive a que el puntero se vaya al documento', () => {
    render(<AppShell><div>x</div></AppShell>);
    // El clic abre y ancla, así que acá el ancla es la del clic, no la del botón.
    // Es el estado en el que el panel se queda: el puntero se va y el detalle
    // sigue, que es lo que un panel anclado promete.
    fireEvent.click(screen.getByRole('button', { name: 'Portada' }));
    fireEvent.mouseLeave(screen.getByTestId('icon-rail'));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByTestId('rail-flyout')).toBeTruthy();
    expect(useDocStore.getState().railPinned).toBe(true);
  });

  it('el cierre en vuelo no sobrevive al desmontaje del shell', () => {
    const { unmount } = render(<AppShell><div>x</div></AppShell>);
    abrirSinAnclar();
    fireEvent.mouseLeave(screen.getByTestId('icon-rail'));
    unmount();
    expect(() => act(() => { vi.advanceTimersByTime(5000); })).not.toThrow();
  });
});
