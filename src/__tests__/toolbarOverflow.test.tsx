/**
 * WordAPA7 — T7: la barra queda como el mockup —titulo, guardado, avatar— y
 * todo lo demas cae en un menu de desborde. Ningun emoji, ninguna etiqueta
 * en mayusculas inventada.
 *
 * Los stores que se manipulan son los reales: `useDocStore` y `useUpdateStore`
 * (este ultimo es donde vive el estado del autoUpdater, no en el store del
 * documento). Ningun setState propio replaces una accion por un no-op: cada
 * entrada se verifica por su efecto en el store o en electronAPI.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { useUpdateStore } from '../store/useUpdateStore';
import { ToolbarOverflowMenu } from '../components/toolbar/ToolbarOverflowMenu';
import { UnifiedToolbar } from '../components/toolbar/UnifiedToolbar';

vi.mock('../components/toolbar/APAScoreCard', () => ({ APAScoreCard: () => <div data-testid="score" /> }));
vi.mock('../components/toolbar/APAModuleToggles', () => ({ APAModuleToggles: () => <div data-testid="toggles" /> }));

const ENTRADAS = [
  'Inicio', 'Deshacer', 'Rehacer',
  'Copiar PDF para WhatsApp',
  'Complemento de Word', 'Tema', 'Ajustes',
];

// Entradas que son comandos: siempre habilitadas y siempre accionables.
const COMANDOS = [
  'Inicio', 'Copiar PDF para WhatsApp', 'Complemento de Word', 'Tema', 'Ajustes',
];

const DOC_A = { session_id: 's1', file_name: 'A.docx', elements: [] } as never;
const DOC_B = { session_id: 's1', file_name: 'B.docx', elements: [] } as never;

describe('T7 — menú de desbordamiento', () => {
  beforeEach(() => {
    useDocStore.setState({
      doc: null,
      history: [],
      historyIndex: 0,
      theme: 'light',
      settingsHubOpen: false,
      settingsHubTab: 'documento',
      liveChatOpen: false,
      showFileMenu: false,
      atHome: false,
    } as never);
    useUpdateStore.setState({ state: 'idle' } as never);
  });

  afterEach(() => {
    delete (window as any).electronAPI;
  });

  it('expone todas las acciones secundarias, sin emojis', () => {
    render(<ToolbarOverflowMenu onClose={vi.fn()} />);
    for (const nombre of ENTRADAS) {
      const el = screen.getByRole('menuitem', { name: nombre });
      expect(el.textContent || '').not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('las filas con panel NO son menuitems: un menú solo puede contener entradas', () => {
    // `role="menuitem"` en un <div> no enfocable rompe el patrón de widget: el
    // teclado recorre el menú y se topa con algo que ni se enfoca ni se activa.
    // La etiqueta no se pierde: pasa a un grupo con nombre.
    render(<ToolbarOverflowMenu onClose={vi.fn()} />);
    expect(screen.queryByRole('menuitem', { name: 'Puntuación APA' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Módulos APA' })).toBeNull();
    const grupo = screen.getByRole('group', { name: 'Puntuación APA' });
    expect(grupo.contains(screen.getByTestId('score'))).toBe(true);
    expect(screen.getByRole('group', { name: 'Módulos APA' }).contains(screen.getByTestId('toggles'))).toBe(true);
  });

  it('cada comando ejecuta su acción y cierra el menú', () => {
    for (const nombre of COMANDOS) {
      const onClose = vi.fn();
      // "Inicio" navega y cambia el store, asi que cada vuelta arranca igual.
      useDocStore.setState({ atHome: false } as never);
      const { unmount } = render(<ToolbarOverflowMenu onClose={onClose} />);
      fireEvent.click(screen.getByRole('menuitem', { name: nombre }));
      expect(onClose).toHaveBeenCalled();
      unmount();
    }
  });

  it('“Inicio” es la primera entrada y devuelve a la pantalla de inicio', () => {
    useDocStore.setState({ doc: DOC_B, atHome: false } as never);
    render(<ToolbarOverflowMenu onClose={vi.fn()} />);

    const entradas = screen.getAllByRole('menuitem');
    expect(entradas[0]).toHaveAccessibleName('Inicio');

    fireEvent.click(entradas[0]);
    expect(useDocStore.getState().atHome).toBe(true);
  });

  it('Deshacer y Rehacer caminan el historial del documento', () => {
    useDocStore.setState({ doc: DOC_B, history: [DOC_A, DOC_B], historyIndex: 1 } as never);
    render(<ToolbarOverflowMenu onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Deshacer' }));
    expect(useDocStore.getState().historyIndex).toBe(0);
    expect(useDocStore.getState().doc?.file_name).toBe('A.docx');

    fireEvent.click(screen.getByRole('menuitem', { name: 'Rehacer' }));
    expect(useDocStore.getState().historyIndex).toBe(1);
    expect(useDocStore.getState().doc?.file_name).toBe('B.docx');
  });

  it('Deshacer y Rehacer se deshabilitan sin historial', () => {
    render(<ToolbarOverflowMenu onClose={vi.fn()} />);
    expect(screen.getByRole('menuitem', { name: 'Deshacer' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: 'Rehacer' })).toBeDisabled();
  });

  it('“Complemento de Word” y “Ajustes” abren el hub, y el complemento en Conexión', () => {
    render(<ToolbarOverflowMenu onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Complemento de Word' }));
    expect(useDocStore.getState().settingsHubOpen).toBe(true);
    // El registro de Office, el certificado y la instalación están en Conexión.
    expect(useDocStore.getState().settingsHubTab).toBe('conexion');
  });

  it('“Ajustes” abre el hub sin forzar pestaña, y “Tema” alterna el tema del store', () => {
    render(<ToolbarOverflowMenu onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ajustes' }));
    expect(useDocStore.getState().settingsHubOpen).toBe(true);
    expect(useDocStore.getState().settingsHubTab).toBe('documento');

    const antes = useDocStore.getState().theme;
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tema' }));
    expect(useDocStore.getState().theme).toBe(antes === 'light' ? 'dark' : 'light');
  });

  it('“Copiar PDF para WhatsApp” llama a la exportación del store', () => {
    const spy = vi.spyOn(useDocStore.getState(), 'copyPdfToClipboard').mockResolvedValue(false);
    render(<ToolbarOverflowMenu onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copiar PDF para WhatsApp' }));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('“Instalar actualización” solo aparece con una descarga pendiente', () => {
    const installUpdate = vi.fn();
    (window as any).electronAPI = { installUpdate };
    const { rerender } = render(<ToolbarOverflowMenu onClose={vi.fn()} />);
    expect(screen.queryByRole('menuitem', { name: 'Instalar actualización' })).toBeNull();

    act(() => { useUpdateStore.setState({ state: 'downloaded' } as never); });
    rerender(<ToolbarOverflowMenu onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Instalar actualización' }));
    expect(installUpdate).toHaveBeenCalled();
  });

  it('las entradas se agrupan por nombre, no por líneas anónimas', () => {
    /* Ocho entradas y dos paneles separados por tres <hr> sin nombre: nada
       decía qué era "documento" y qué era "app". Ahora cada mitad va en un
       grupo con nombre, y el teclado lo anuncia. */
    render(<ToolbarOverflowMenu onClose={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Documento' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Sistema' })).toBeTruthy();
  });

  it('los módulos APA se montan dentro del menú, no en la barra', () => {
    render(<ToolbarOverflowMenu onClose={vi.fn()} />);
    expect(screen.getByTestId('score')).toBeTruthy();
    expect(screen.getByTestId('toggles')).toBeTruthy();
  });
});

describe('T7 — la barra mínima', () => {
  beforeEach(() => {
    useDocStore.setState({
      doc: DOC_B,
      hasUnsavedChanges: false,
      liveChatOpen: false,
      settingsHubOpen: false,
      showFileMenu: false,
    } as never);
  });

  it('muestra título y Guardado, y saca de la vista lo que ahora vive en el menú', () => {
    render(<UnifiedToolbar />);
    expect(screen.getByText('B.docx')).toBeTruthy();
    expect(screen.getByText('Guardado')).toBeTruthy();
    expect(screen.queryByText(/Copiar PDF/)).toBeNull();
    expect(screen.queryByTestId('score')).toBeNull();
    expect(screen.queryByTestId('toggles')).toBeNull();
  });

  it('el chip de guardado refleja el estado real del documento', () => {
    /* `hasUnsavedChanges` dejó de mandar el chip, y esta prueba es la que lo
       fijaba. La razón: ese flag lo levanta `pushHistory`, que se llama DESPUÉS
       de que el servidor ya guardó, así que la barra anunciaba "Sin guardar"
       con el documento en el servidor. Ver `chipGuardado.test.tsx`.

       Ahora lo que manda es `isSaving`: hay una mutación en vuelo y el servidor
       todavía no confirmó. Y el estado guardado lleva la hora. */
    useDocStore.setState({ doc: DOC_B, hasUnsavedChanges: false, isSaving: false, lastSavedAt: null } as never);
    const { unmount } = render(<UnifiedToolbar />);
    expect(screen.getByText('Guardado')).toBeTruthy();
    /* Sin `lastSavedAt` no se inventa una hora. */
    expect(screen.queryByText(/hace/)).toBeNull();
    unmount();

    useDocStore.setState({ hasUnsavedChanges: true, isSaving: true, lastSavedAt: Date.now() } as never);
    render(<UnifiedToolbar />);
    expect(screen.getByText('Guardando…')).toBeTruthy();
    expect(screen.queryByText('Guardado')).toBeNull();
  });

  it('el botón de más acciones abre y cierra el menú de desborde', () => {
    render(<UnifiedToolbar />);
    const boton = screen.getByRole('button', { name: 'Más acciones' });
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(boton);
    expect(screen.getByRole('menu', { name: 'Más acciones' })).toBeTruthy();
    expect(boton.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(boton);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(boton.getAttribute('aria-expanded')).toBe('false');
  });

  it('al abrirse, el foco entra al menú: con teclado no se navega a ciegas', () => {
    // Sin esto, un usuario de teclado abre el menú con Enter y se va con Tab
    // dejando 260px flotando sobre el documento, inalcanzables desde el foco.
    render(<UnifiedToolbar />);
    fireEvent.click(screen.getByRole('button', { name: 'Más acciones' }));
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Inicio' }));
  });

  it('un clic afuera cierra el menú', () => {
    // El patrón de un menú de desborde: click afuera, Escape, o el toggle. El
    // mismo cierre que ya tenía `ProjectTabs`.
    render(<UnifiedToolbar />);
    fireEvent.click(screen.getByRole('button', { name: 'Más acciones' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Escape cierra el menú y devuelve el foco a su botón', () => {
    render(<UnifiedToolbar />);
    const boton = screen.getByRole('button', { name: 'Más acciones' });
    fireEvent.click(boton);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(boton);
  });

  it('los tres controles de la derecha anuncian si su panel está abierto', () => {
    // Antes solo "Más acciones" lo hacía: el Copiloto y Archivo abrían y
    // cerraban paneles sin decir en qué estado estaban.
    render(<UnifiedToolbar />);
    const archivo = screen.getByRole('button', { name: 'Menú Archivo' });
    const copiloto = screen.getByRole('button', { name: 'Copiloto Editorial IA' });
    expect(archivo.getAttribute('aria-expanded')).toBe('false');
    expect(copiloto.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(copiloto);
    expect(copiloto.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(archivo);
    expect(archivo.getAttribute('aria-expanded')).toBe('true');
  });

  it('el Copiloto alterna el chat y el avatar abre Ajustes por su NOMBRE real', () => {
    // "Cuenta" anunciaba una sesión iniciada que no existe: no hay cuenta en el
    // store. La "W" es la marca de la app, y lo que el botón abre son Ajustes.
    // El nombre perdió el "y vista previa": la previsualización en vivo era del
    // estudio viejo, y el botón ya no la abre.
    render(<UnifiedToolbar />);
    fireEvent.click(screen.getByRole('button', { name: 'Copiloto Editorial IA' }));
    expect(useDocStore.getState().liveChatOpen).toBe(true);

    expect(screen.queryByRole('button', { name: 'Cuenta' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
    expect(useDocStore.getState().settingsHubOpen).toBe(true);
  });

  it('al angostar, el bloque central del título no se monta sobre los controles', () => {
    /* Bug: el centro era `position:absolute; left:50%; maxWidth:50%`, así que
       centraba sobre la ventana ignorando los dos extremos. Con el cluster
       derecho (Word + Copiloto + desborde + avatar) por debajo de ~1200px —el
       propio `minWidth` de Electron— el título se montaba encima. Ahora es una
       pista de grid que encoge y trunca. */
    const { container } = render(<UnifiedToolbar />);
    const header = container.querySelector('header') as HTMLElement;
    expect(header.style.display).toBe('grid');
    expect(header.style.gridTemplateColumns).toContain('max-content');
    expect(header.style.gridTemplateColumns).toContain('minmax(0');

    const centro = screen.getByTestId('toolbar-centro-doc');
    expect(centro.style.position).not.toBe('absolute');
    expect(['0px', '0']).toContain(centro.style.minWidth);
    expect(centro.style.overflow).toBe('hidden');

    // El título trunca en vez de empujar/anchar la barra.
    const titulo = screen.getByText('B.docx');
    expect(['0px', '0']).toContain(titulo.style.minWidth);
  });
});
