/**
 * WordAPA7 — el panel derecho ya no es un inspector de elemento.
 *
 * El Inspector general (tipo de elemento, nivel de jerarquía, contenido, campos
 * de tabla y de ecuación) se montaba en el panel derecho, y encima el panel se
 * abría SOLO cada vez que seleccionabas un elemento. La evaluación del usuario
 * fue textual: «no suma nada, es una UI sobre otras UIs de cada fase, es un
 * estorbo». Se borró el componente entero, su rama y el efecto que lo abría.
 *
 * Lo que este archivo protege:
 *
 *  1. El panel no vuelve a montar un inspector de elemento, y seleccionar un
 *     párrafo —para leerlo— no abre el cajón. Ese era el defecto original.
 *  2. La selección CON destino sí lo abre: una referencia, una figura con
 *     `imagePanelOpen`, o una ecuación. Sin esas, el editor de figura o el de
 *     ecuación quedarían inalcanzables.
 *  3. Las acciones del store que usaba el inspector siguen existiendo: el editor
 *     de tabla vive ahora en el lienzo (`PaperCanvas`), el chat y la fase de
 *     figuras (`Step3FiguresTablesWizard`), que es donde siempre se usó.
 *
 * Nota registrada: la NUMERACIÓN DE ECUACIÓN existía solo en el inspector
 * borrado. Queda anotada como capacidad a reubicar (ver NOTAS del usuario).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { RightSidePanel } from '../components/activity/RightSidePanel';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(),
  explainElement: vi.fn().mockResolvedValue({ explanation: 'test' }),
  suggestCaption: vi.fn().mockResolvedValue('test caption'),
  syncAllProviderKeys: vi.fn().mockResolvedValue({ ok: true, applied: [] }),
}));

/* Los hijos pesados, simulados: lo que se prueba es QUÉ RAMA elige el panel, no
   el contenido de cada taller (cada uno tiene su propio archivo de prueba). */
vi.mock('../components/wizard/OutlineTree', () => ({ OutlineTree: () => <div /> }));
vi.mock('../components/activity/ActionBar', () => ({ ActionBar: () => <div /> }));
vi.mock('../components/referencias/ReferenceForm', () => ({
  ReferenceForm: () => <div data-testid="form-referencia" />,
}));
vi.mock('../components/inspector/ImageEditPanel', () => ({
  ImageEditPanel: () => <div data-testid="editor-figura" />,
}));
vi.mock('../components/inspector/EquationEditor', () => ({
  EquationEditor: () => <div data-testid="editor-ecuacion" />,
}));

const docDePrueba = () => ({
  session_id: 's1',
  file_name: 'x.docx',
  apa_format: 'student',
  elements: [
    { id: 'p1', type: 'paragraph', text: 'Un parrafo', cita_ids: [] },
    { id: 'img1', type: 'image', text: '', image_info: { element_id: 'img1' }, cita_ids: [] },
    { id: 'eq1', type: 'equation', text: 'E = mc^2', cita_ids: [] },
  ],
  meta: {},
  apa_rules: {},
  portada: { detected: false, element_ids: [], fields: {} },
  referencias: [],
  citas_intext: [],
}) as never;

beforeEach(() => {
  useDocStore.setState({
    doc: docDePrueba(),
    selectedElementId: null,
    selectedReferenceId: null,
    imagePanelOpen: false,
    forceRightPanelOpen: true,
    activityEvents: [],
  } as never);
});

describe('el panel derecho no es un inspector de elemento', () => {
  it('ya no importa ni menciona ElementInspector, ni la marca hasSelection', async () => {
    const fuente = await import('../components/activity/RightSidePanel.tsx?raw');
    const codigo = (fuente as any).default || '';
    expect(codigo).not.toMatch(/ElementInspector/);
    expect(codigo).not.toMatch(/hasSelection/);
  });

  it('seleccionar un párrafo NO abre un inspector', () => {
    // El defecto: tocar un párrafo —para leerlo— abría un cajón con tipo, nivel
    // y contenido. Seleccionar para leer no es pedir un formulario.
    useDocStore.setState({ selectedElementId: 'p1' } as never);
    render(<RightSidePanel />);
    expect(screen.queryByText(/Tipo de Elemento/i)).toBeNull();
    expect(screen.queryByText(/Nivel de Jerarqu/i)).toBeNull();
  });

  it('una figura con `imagePanelOpen` abre el editor de figura', () => {
    useDocStore.setState({ selectedElementId: 'img1', imagePanelOpen: true } as never);
    render(<RightSidePanel />);
    expect(screen.getByTestId('editor-figura')).toBeTruthy();
  });

  it('una referencia abre su formulario', () => {
    useDocStore.setState({ selectedReferenceId: 'r1' } as never);
    render(<RightSidePanel />);
    expect(screen.getByTestId('form-referencia')).toBeTruthy();
  });

  it('una ecuación seleccionada abre su editor de presentación', () => {
    /* Las ecuaciones son prioridad para el usuario. Su editor tiene que seguir
       alcanzable ahora que el inspector general se fue: es una selección con
       destino, igual que la figura. */
    useDocStore.setState({ selectedElementId: 'eq1' } as never);
    render(<RightSidePanel />);
    expect(screen.getByTestId('editor-ecuacion')).toBeTruthy();
  });
});

describe('las acciones del store que usaba el inspector siguen existiendo', () => {
  it('updateElementTable', () => {
    expect(typeof useDocStore.getState().updateElementTable).toBe('function');
  });

  it('autoCaptionAll', () => {
    expect(typeof useDocStore.getState().autoCaptionAll).toBe('function');
  });
});
