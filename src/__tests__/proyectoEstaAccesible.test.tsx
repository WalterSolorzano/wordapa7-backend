/**
 * El rail tiene UN destino de proyecto, y es la pantalla de proyectos.
 *
 * EL DEFECTO QUE ESTE ARCHIVO CIERRA. Había DOS destinos de proyecto: un
 * "Explorador de proyecto" que abría una ventana modal encima de lo que hubiera,
 * y "Mis proyectos" con su propia pantalla. Dos caminos al mismo dato, y el
 * modal tapando la pantalla que ya hacía ese trabajo. La decisión de producto:
 * un solo destino —la pantalla—, con el explorador viviendo adentro.
 *
 * LO QUE SE GARANTIZA ACA:
 * 1. El rail ofrece UN destino de proyecto, y NO ofrece el que ya no existe.
 * 2. Ese destino no lleva conteo de pendientes: no es una fase y no hay trabajo
 *    que completar, así que un cero sería la mentira que `RailDestination.status`
 *    opcional vino a matar.
 * 3. Al hacer clic NO abre el flyout lateral: es una pantalla, no un detalle de
 *    fase que se muestra al costado.
 * 4. "Estás acá" lo marca `viewMode`, igual que Exportar con su túnel, y nunca
 *    hay DOS destinos marcados a la vez.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { useRailDestinations } from '../hooks/useRailDestinations';
import { EDITOR_RAIL_ITEMS } from '../components/shell/railItems';
import { AppShell } from '../components/shell/AppShell';
import { readPhaseStates } from '../lib/railPending';

/* `AppShell` monta el lienzo, y el lienzo importa `pdfjs-dist`, que pide
   `DOMMatrix` en el import y no existe en jsdom. No tiene nada que ver con el
   destino del proyecto: se lo cambia por su lugar, como hacen
   `pdfRestLayer.test.tsx` y `focoNoBarraElSelector.test.tsx`. */
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 3,
      getPage: vi.fn(() => Promise.resolve({
        getViewport: () => ({ width: 612, height: 792 }),
        render: () => ({ promise: Promise.resolve() }),
      })),
    }),
  })),
}));

beforeEach(() => {
  /* `viewMode` se limpia: el store es un singleton y sobrevive entre tests. Sin
     resetearlo, un test que navega a 'proyectos' deja la bandera puesta y el
     siguiente arranca en la pantalla equivocada. Un guardián que depende del
     orden no es un guardián. */
  useDocStore.setState({
    proyecto: null,
    projectImages: [],
    tabs: [],
    activeTabIndex: 0,
    doc: null,
    viewMode: 'edit',
  });
});

describe('el rail tiene un solo destino de proyecto', () => {
  it('ofrece la pantalla de proyectos', () => {
    // El defecto: con `tabs.length === 0` el único montaje del Explorador no
    // existía. El acceso va en el rail, que vive siempre (`AGENTS.md` §1).
    render(<AppShell><div>centro</div></AppShell>);
    const rail = screen.getByTestId('icon-rail');
    expect(rail.textContent?.toLowerCase() || '').not.toBe('');
    expect(rail.querySelector('[aria-label*="royecto" i]')).not.toBeNull();
  });

  it('NO ofrece un segundo destino de proyecto', () => {
    /* El defecto exacto que este archivo cierra: dos destinos de proyecto. El
       que abría la ventana modal (`proyecto`) ya no existe. */
    expect(EDITOR_RAIL_ITEMS.find((i) => i.id === 'proyecto')).toBeUndefined();
    expect(EDITOR_RAIL_ITEMS.filter((i) => i.step === null).map((i) => i.id)).toEqual(['mis-proyectos']);
  });

  it('un clic en el destino navega a la pantalla de proyectos', () => {
    // Reachability de verdad: el botón existe Y lleva a algo. Un destino que no
    // navega es un botón que promete.
    render(<AppShell><div>centro</div></AppShell>);
    const boton = screen.getByTestId('icon-rail').querySelector('[aria-label*="royecto" i]') as HTMLElement;
    expect(useDocStore.getState().viewMode).toBe('edit');
    fireEvent.click(boton);
    expect(useDocStore.getState().viewMode).toBe('proyectos');
  });
});

describe('el destino del proyecto no inventa trabajo pendiente', () => {
  it('no lleva conteo de pendientes', () => {
    // NO es una fase del asistente: no hay nada que completar ni que posponer.
    // Un cero aquí sería un "Listo" sobre un botón, que es exactamente lo que
    // `RailFlyout` evita dibujar cuando `status` no viene.
    const item = EDITOR_RAIL_ITEMS.find((i) => i.id === 'mis-proyectos');
    expect(item, 'el destino del proyecto no esta en el catalogo del rail').toBeTruthy();
    expect(item!.step).toBeNull();
    expect('pending' in (item as Record<string, unknown>)).toBe(false);
    expect('status' in (item as Record<string, unknown>)).toBe(false);
  });

  it('el rail pintado tampoco le inventa pendientes', () => {
    // El catálogo es una cosa y lo que se pinta es otra. Un `pending` agregado
    // en `useRailDestinations` reproduciría el defecto que `railPending` vino a
    // matar: un conteo que no puede contradecir a la pantalla a la que lleva
    // porque no viene de ella.
    const { result } = renderHookDestinos();
    const proyectos = result.find((d) => d.id === 'mis-proyectos');
    expect(proyectos).toBeTruthy();
    expect(proyectos!.status).toBeUndefined();
    /* `undefined` y NO `0`. La diferencia importa: `IconRail` dibuja la pastilla
       con `pending > 0`, así que un 0 no se ve, pero `RailFlyout` usa
       `item.status` para decidir si imprime fila — y `undefined` es lo que hace
       que NO la imprima. */
    expect(proyectos!.pending).toBeUndefined();
  });

  it('las fases siguen contando, y el proyecto no las contamina', () => {
    // El control: si el proyecto no tiene conteo pero las fases sí, el derivado
    // está bien. Si las fases tampoco contaran, el guardián de arriba pasaría
    // por la razón equivocada — con el rail entero sin contar.
    const estados = readPhaseStates({
      hasDoc: true,
      portada: { title: '', apa_format: 'student' } as never,
      coverSetupDone: false,
      elements: [],
      hasReferences: false,
      reviewResult: null,
      proofreadFindings: [],
      citationAuditResult: null,
    });
    expect(Object.keys(estados).length).toBeGreaterThan(0);
    expect(estados[1].pending).toBeGreaterThan(0);
  });
});

describe('la pantalla de proyectos es un destino, no una capa con flyout', () => {
  it('el clic no abre el flyout lateral', () => {
    /* Antes, todo clic en un destino del rail abría el flyout de 240px. Pero
       'Mis proyectos' es una PANTALLA, no una fase con descripción: no hay
       detalle que mostrar al costado, y `RailFlyout` devuelve `null` sin
       `description`/`status`/`showOutline`. Abrirlo sería reservar 240px para un
       componente que no dibuja nada. */
    render(<AppShell><div>centro</div></AppShell>);
    const boton = screen.getByTestId('icon-rail').querySelector('[aria-label*="royecto" i]') as HTMLElement;
    fireEvent.click(boton);
    expect(screen.queryByTestId('rail-flyout')).toBeNull();
  });

  it('el rail no marca DOS destinos como "estás acá"', () => {
    /* `mis-proyectos` se marca con `viewMode`, igual que Exportar con su túnel
       (que tampoco es una fase). Nunca hay dos `current`: el rail no puede
       afirmar dos destinos a la vista a la vez (`AGENTS.md` §1). */
    useDocStore.setState({ viewMode: 'proyectos' });
    const { result } = renderHookDestinos();
    const marcados = result.filter((d) => d.current === true);
    expect(marcados.map((d) => d.id)).toEqual(['mis-proyectos']);
  });

  it('el destino de proyectos no se marca cuando no se está en su pantalla', () => {
    const { result } = renderHookDestinos();
    expect(result.filter((d) => d.current === true).map((d) => d.id)).toEqual([]);
  });
});

/** Los destinos tal como los pinta el rail, sin montar el componente. */
function renderHookDestinos() {
  let captured: ReturnType<typeof useRailDestinations> = [];
  function Probe() {
    captured = useRailDestinations();
    return null;
  }
  render(<Probe />);
  return { result: captured };
}
