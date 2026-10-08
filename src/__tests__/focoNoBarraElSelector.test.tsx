/**
 * EL MODO FOCO NO PUEDE DEJAR UNA PANTALLA SIN HERRAMIENTAS.
 *
 * El defecto: en el paso 2, la barra de pestañas de la fase se montaba con
 * `!focusMode`, y el contenido elegía con `structureTab` sin mirar `focusMode`.
 * Con el foco prendido el `Esquema` quedaba sin selector visible: no había
 * forma de volver a `Títulos` ni a `Cuerpo`.
 *
 * Ahora la fase de Estructura es `EscritorioEstructura` y su contenido ya no
 * depende de la barra de pestañas: el esquema, el diagrama y el panel son
 * columnas permanentes del shell. Lo que se afirma es que con el foco prendido
 * esas columnas siguen ahí, y que el foco sigue apagando lo que SÍ es suyo.
 *
 * Y no se reimplementa `App`: se monta el de verdad, con el store real y las
 * piezas pesadas sustituidas por su lugar.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('../components/layout/PDFPreview', () => ({ PDFPreview: () => null }));
vi.mock('../components/layout/ReactPDFPreview', () => ({ ReactPDFPreview: () => null }));

vi.mock('../components/activity/RightSidePanel', () => ({
  RightSidePanel: () => <div data-testid="panel-actividad" />,
}));
vi.mock('../components/layout/PaperCanvas', () => ({
  PaperCanvas: () => <div data-testid="lienzo" />,
  computePages: () => [],
  // `usePageIndex` (consumido por EscritorioEstructura) lee esta función del
  // mismo módulo: sin ella el mock deja la fase de Estructura sin paginación.
  computeRenderedPages: () => ({ geom: {}, pages: [] }),
}));
vi.mock('../components/wizard/Step2HeadingsWizard', () => ({
  Step2HeadingsWizard: () => <div data-testid="fase-titulos" />,
}));
vi.mock('../components/wizard/Step5BodyWizard', () => ({
  Step5BodyWizard: () => <div data-testid="fase-cuerpo" />,
}));

import { useDocStore } from '../store/useDocStore';
import App from '../App';

const DOC = {
  session_id: 's-foco',
  file_name: 'tesis.docx',
  elements: [
    {
      id: 'e1', type: 'heading', heading_level: 1, text: '1. Introducción', page_number: 1,
      style_name: 'Normal', alignment: 'left', font_name: 'Times New Roman', font_size: 12,
      is_bold: true, is_italic: false, is_bullet: false, left_indent_cm: 0, confidence: 1,
      is_user_modified: false, needs_review: false, auto_applied: false, cita_ids: [],
    },
  ],
  referencias: [],
  meta: { page_count: 1 },
  portada: { fields: {}, use_original_cover: false },
} as never;

const Poner = (estado: Record<string, unknown>) => act(() => {
  useDocStore.setState({
    doc: DOC,
    atHome: false,
    isBackendReady: true,
    viewMode: 'edit',
    wizardStep: 2,
    structureTab: 'indice',
    focusMode: false,
    showFileMenu: false,
    settingsHubOpen: false,
    commandPaletteOpen: false,
    error: null,
    ...estado,
  } as never);
});

beforeEach(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  /* jsdom no es una pantalla: su `innerWidth` por defecto (1024) cae bajo el
   * umbral responsive y colapsaría el panel derecho de Estructura. */
  window.innerWidth = 1440;
  Poner({});
});

describe('el modo foco deja la fase de Estructura con sus herramientas', () => {
  it('con el foco prendido, el esquema y el diagrama siguen montados', () => {
    Poner({ focusMode: true });
    render(<App />);

    expect(screen.getByTestId('indice-estructura')).toBeTruthy();
    expect(screen.getByTestId('diagrama-estructura')).toBeTruthy();
  });

  it('con el foco prendido se puede leer la prosa y abrir las herramientas', () => {
    Poner({ focusMode: true });
    render(<App />);

    expect(screen.getByTestId('prosa-seccion')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /herramientas/i }));
    expect(screen.getByTestId('panel-herramientas')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /prosa/i }));
    expect(screen.getByTestId('prosa-seccion')).toBeTruthy();
  });

  it('el foco sigue apagando lo que SÍ es suyo, y esa diferencia es real', () => {
    const { unmount } = render(<App />);
    expect(screen.getByTestId('panel-actividad'), 'sin foco el panel tiene que estar').toBeTruthy();
    unmount();

    Poner({ focusMode: true });
    render(<App />);
    expect(screen.queryByTestId('panel-actividad')).toBeNull();
  });

  it('sin foco, el paso 2 se comporta igual: el shell nunca se fue', () => {
    Poner({ focusMode: false });
    render(<App />);
    expect(screen.getByTestId('indice-estructura')).toBeTruthy();
    expect(screen.getByTestId('prosa-seccion')).toBeTruthy();
  });
});
