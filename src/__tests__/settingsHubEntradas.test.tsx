/**
 * WordAPA7 — las siete entradas de Ajustes abren la MISMA pantalla.
 *
 * Este archivo es la Fase 7 del plan de las cinco pestañas, y existe por una
 * sola razón: antes de él había DOS superficies de configuración, siete caminos
 * a ellas, y cada camino abría una distinta. El botón "W" y el menú nativo
 * abría el estudio; el rail de Inicio abría un panel que era INALCANZABLE con un
 * documento abierto; el menú de desborde abría otro; el indicador de batería y
 * el diagnóstico apuntaban a una pestaña de un menú que ya no tenía sentido.
 *
 * Dos formas de comprobarlo, y hacen falta las dos:
 *
 *  - COMPORTAMIENTO, para lo que se monta: el menú de desborde, el rail de Inicio
 *    y el disparador del menú nativo se aprietan de verdad y se mira el store.
 *  - FUENTE, para lo que no se monta sin el backend entero: la barra, el
 *    indicador de batería y el diagnóstico de proveedores. Un `grep` escrito acá
 *    que se rompe cuando uno de los cuatro vuelve a `setSettingsStudioOpen`, que
 *    es exactamente el camino por el que vuelve el problema.
 */
import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ToolbarOverflowMenu } from '../components/toolbar/ToolbarOverflowMenu';
import { UnifiedToolbar } from '../components/toolbar/UnifiedToolbar';
import { Step0QuickStart } from '../components/wizard/Step0QuickStart';
import { HOME_RAIL_ITEMS } from '../components/shell/railItems';
import { useDocStore } from '../store/useDocStore';

/* Los fuentes se leen con `?raw` y no con `node:fs`: el shim de
   `nodePolyfills()` de vite resuelve `readFileSync` a su propio stub de browser
   y llamarlo desde un test es un `TypeError` en tiempo de import. */
import appSrc from '../App.tsx?raw';
import menuSrc from '../../electron/menu.ts?raw';
import toolbarSrc from '../components/toolbar/UnifiedToolbar.tsx?raw';
import overflowSrc from '../components/toolbar/ToolbarOverflowMenu.tsx?raw';
import batterySrc from '../components/AIBatteryIndicator.tsx?raw';
import nimSrc from '../components/shared/NIMDiagnosticsModal.tsx?raw';
import hubSrc from '../components/settings/SettingsHub.tsx?raw';

vi.mock('../api/backend', () => ({
  listSessions: vi.fn().mockResolvedValue([]),
  listProfiles: vi.fn().mockResolvedValue([]),
  downloadTemplate: vi.fn(),
  downloadTemplateAsync: vi.fn(),
  applyTemplate: vi.fn().mockResolvedValue({ status: 'ok' }),
  getSideloadStatus: vi.fn().mockResolvedValue({ installed: true, up_to_date: true, path: '', installed_at: null }),
  repairSideload: vi.fn().mockResolvedValue({ status: 'ok' }),
  getApiBase: () => 'http://localhost:8742',
}));

/* Las siete entradas, con la pestaña que prometen. `null` = el hub decide, que es
   la pestaña por omisión. Esta tabla ES la especificación: si una entrada cambia
   de pestaña, el lugar de la decisión es acá y no en el componente. */
const ENTRADAS: ReadonlyArray<{ id: string; archivo: string; pestana: string | null }> = [
  { id: 'toolbar-W', archivo: toolbarSrc, pestana: null },
  { id: 'overflow-addin', archivo: overflowSrc, pestana: 'conexion' },
  { id: 'overflow-ajustes', archivo: overflowSrc, pestana: null },
  { id: 'bateria', archivo: batterySrc, pestana: 'conexion' },
  { id: 'diagnostico', archivo: nimSrc, pestana: 'conexion' },
  { id: 'menu-nativo', archivo: appSrc, pestana: null },
];

const abrir = async () => {
  let utils!: ReturnType<typeof render>;
  await act(async () => {
    utils = render(<Step0QuickStart />);
  });
  return utils;
};

const enRail = () => within(screen.getByTestId('icon-rail'));
const destino = (label: string) => enRail().getByRole('button', { name: label });

describe('Ajustes — las siete entradas', () => {
  beforeEach(() => {
    useDocStore.setState({
      doc: null,
      atHome: true,
      isBackendReady: true,
      error: null,
      theme: 'light',
      settingsHubOpen: false,
      settingsHubTab: 'documento',
      liveChatOpen: false,
      showFileMenu: false,
    } as never);
  });

  afterEach(() => {
    act(() => useDocStore.setState({ settingsHubOpen: false, settingsHubTab: 'documento' } as never));
    delete (window as any).electronAPI;
  });

  it('el botón "W" de la barra abre el hub', () => {
    render(<UnifiedToolbar />);
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
    expect(useDocStore.getState().settingsHubOpen).toBe(true);
  });

  it('las dos entradas del menú de desborde abren el hub, y el complemento en Conexión', () => {
    render(<ToolbarOverflowMenu onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Complemento de Word' }));
    expect(useDocStore.getState().settingsHubOpen).toBe(true);
    expect(useDocStore.getState().settingsHubTab).toBe('conexion');

    useDocStore.setState({ settingsHubOpen: false, settingsHubTab: 'documento' } as never);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ajustes' }));
    expect(useDocStore.getState().settingsHubOpen).toBe(true);
    expect(useDocStore.getState().settingsHubTab).toBe('documento');
  });

  it('el rail de Inicio tiene UN destino de configuración, y abre el hub', async () => {
    // Los otros dos —'home-addin' y 'home-tema'— eran el mismo hub en tres
    // iconos. Ver `homeRail.test.tsx`, que mira el comportamiento del clic.
    expect(HOME_RAIL_ITEMS.filter((i) => i.id.startsWith('home-')).map((i) => i.id)).not.toContain('home-addin');
    expect(HOME_RAIL_ITEMS.filter((i) => i.id.startsWith('home-')).map((i) => i.id)).not.toContain('home-tema');

    await abrir();
    fireEvent.click(destino('Ajustes'));
    expect(useDocStore.getState().settingsHubOpen).toBe(true);
    expect(useDocStore.getState().settingsHubTab).toBe('conexion');
  });

  it('el disparador del menú nativo abre el hub, sin viajar por un CustomEvent', () => {
    // Dos caminos al mismo flag son dos verdades. `trigger-preferences` va
    // directo al store desde `onMenuAction`: el resto de las acciones del menú
    // sí necesitan el evento porque las escucha el componente que las monta,
    // pero el hub ya está montado siempre.
    expect(menuSrc).toContain("'trigger-preferences'");
    expect(appSrc).toMatch(/action === 'trigger-preferences'[\s\S]{0,400}setSettingsHubOpen\(true\)/);
    expect(appSrc).not.toContain("['trigger-preferences'");
  });

  it('ninguna entrada vuelve al estudio viejo: el flag ya no existe', () => {
    for (const e of ENTRADAS) {
      expect(e.archivo, e.id).not.toMatch(/setSettingsStudioOpen|settingsStudioOpen|settingsStudioTab/);
    }
    // Y el hub está montado en App, no en un lugar que solo existe en Inicio.
    // Review Focus #3: Ajustes tiene que abrir CON un documento abierto.
    expect(appSrc).toContain('settingsHubOpen');
    expect(appSrc).toContain('<SettingsHub />');
    // La rama del hub va antes de la del backstage y antes del `!doc`, o
    // "Ajustes" solo abriría sin documento — el caso en el que no se lo necesita.
    const iHub = appSrc.indexOf('if (settingsHubOpen)');
    const iMenu = appSrc.indexOf('if (showFileMenu)');
    const iHome = appSrc.indexOf('if (!doc || atHome)');
    expect(iHub).toBeGreaterThan(-1);
    expect(iHub).toBeLessThan(iMenu);
    expect(iHub).toBeLessThan(iHome);
  });

  it('las siete entradas apuntan al MISMO flag, y a la pestaña que dicen', () => {
    for (const e of ENTRADAS) {
      const conPestana = e.pestana === null
        ? /setSettingsHubOpen\(true\)/
        : new RegExp(`setSettingsHubOpen\\(true, '${e.pestana}'\\)`);
      expect(e.archivo, e.id).toMatch(conPestana);
    }
  });

  it('el hub se monta UNA vez', () => {
    // Dos montajes son dos hubs: un flag, una pantalla. Que se monte exactamente
    // una vez es lo que deja que el rail, la barra y el menú nativo compartan el
    // mismo estado sin un segundo lugar donde se abra.
    const montajes = appSrc.match(/<SettingsHub\s*\/>/g) || [];
    expect(montajes.length).toBe(1);
    expect(hubSrc).toContain('PESTANAS');
  });
});
