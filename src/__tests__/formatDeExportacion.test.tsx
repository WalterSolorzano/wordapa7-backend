/**
 * El formato de salida es UNO, y vive en el store.
 *
 * CONTEXTO. `format` era `useState` local de `ExportView`: se perdía al salir del
 * paso. Y `FileMenu.tsx` tenía sus propios dos botones con `exportDocx(true)`
 * fijo, sin consultar nada. Dos verdades para lo mismo: la persona elige PDF en
 * la vista de exportación, va al menú, y el menú dice .docx. Y en el otro
 * sentido: activa el control de cambios en la vista y el menú no lo sabe, o al
 * revés.
 *
 * LO QUE SE AFIRMA. Que los dos lados leen el MISMO valor del store —no que
 * "se parezcan"— y que el valor sobrevive a cambiar de fase y volver. Por eso
 * la segunda prueba no compara dos textos: monta las dos superficies a la vez y
 * mira que el menú y la vista compartan el mismo estado.
 *
 * Las dos mitades no se pueden separar en ninguna dirección: el menú no puede
 * tener su propio `format`, y la vista no puede tener su propio `useState`.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { ExportView } from '../components/export/ExportView';
import { FileMenu } from '../components/layout/FileMenu';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(),
  syncAllProviderKeys: vi.fn().mockResolvedValue({ ok: true, applied: [] }),
  listSessions: vi.fn().mockResolvedValue([]),
  recoverSession: vi.fn(),
}));
vi.mock('../components/layout/PaperCanvas', () => ({ PaperCanvas: () => <div data-testid="canvas" /> }));
vi.mock('../components/layout/ReactPDFPreview', () => ({ ReactPDFPreview: () => <div data-testid="pdf" /> }));
vi.mock('../components/export/QuickReferenceSearch', () => ({
  QuickReferenceSearch: () => <div data-testid="crossref" />,
}));

const exportDocx = vi.fn();
const exportPdf = vi.fn();
const exportLatex = vi.fn();

const DOC = {
  session_id: 's-fmt',
  file_name: 'Tesis.docx',
  elements: [],
  referencias: [],
  apa_format: 'student',
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  useDocStore.setState({
    doc: DOC,
    isLoading: false,
    atHome: false,
    viewMode: 'export',
    citationAuditResult: null,
    exportDocx,
    exportPdf,
    exportLatex,
    clearQuickExport: vi.fn(),
    copyPdfToClipboard: vi.fn(),
    sayMascot: vi.fn(),
    showToast: vi.fn(),
    showFileMenu: true,
  } as never);
});

/** Eligé un formato desde el selector de la vista de exportación. */
const elegirDesdeLaVista = (etiqueta: string) => {
  const opciones = screen.getByLabelText('Selector de formato');
  fireEvent.click(
    Array.from(opciones.querySelectorAll('button')).find((b) => b.textContent!.includes(etiqueta))!,
  );
};

const abrirOpciones = () => fireEvent.click(screen.getByRole('button', { name: /opciones/i }));

describe('el formato de salida es uno solo', () => {
  it('el formato elegido sobrevive a cambiar de fase y volver', () => {
    render(<ExportView />);
    abrirOpciones();
    elegirDesdeLaVista('PDF Listo');
    expect(useDocStore.getState().format).toBe('pdf');

    /* Salir a otra fase y volver. Con `format` en `useState` local de la vista,
       el componente se desmontaba y el valor se iba con él: la persona
       regresaba a docx sin haberlo pedido. */
    act(() => { useDocStore.getState().setWizardStep(1); });
    act(() => { useDocStore.getState().setWizardStep(6); });

    expect(useDocStore.getState().format).toBe('pdf');
  });

  it('el menu y la vista dicen el mismo formato, porque leen el mismo estado', () => {
    /* Las dos superficies montadas a la vez, y el menu en su pagina de
       Exportar. Si cada una tuviera su propio valor, esta comparacion seria
       la que se cae; hoy no puede caerse porque no hay dos que comparar. */
    render(<><ExportView /><FileMenu /></>);
    fireEvent.click(screen.getByRole('button', { name: /^Exportar$/ }));

    /* Elegir PDF desde la vista. */
    abrirOpciones();
    elegirDesdeLaVista('PDF Listo');

    /* El menu, que no sabe nada de la vista, dice PDF. */
    expect(document.body.textContent).toContain('PDF');
    expect(document.body.textContent).not.toContain('APA 7 .DOCX');
  });

  it('el boton del menu exporta el formato del store, no uno fijo', () => {
    render(<FileMenu />);
    fireEvent.click(screen.getByRole('button', { name: /^Exportar$/ }));

    /* Con PDF elegido en el store, el menu exporta PDF. Antes llamaba
       `exportDocx(true)` sin preguntar nada. Se apunta a la tarjeta por su
       texto, que ahora NOMBRA el formato, y no a "cualquier botón": con
       `/exportar/i` también entraba la entrada del sidebar, que solo cambia
       de página. */
    act(() => { useDocStore.getState().setFormat('pdf'); });
    const tarjeta = screen.getByRole('button', { name: /PDF Listo \.pdf/i });
    fireEvent.click(tarjeta);

    expect(exportPdf).toHaveBeenCalled();
    expect(exportDocx).not.toHaveBeenCalled();
  });

  it('el control de cambios es el mismo de los dos lados', () => {
    /* El menu lo forzaba a `true` sin preguntar. Con el estado en el store, la
       persona activa el control en la vista y el menu lo respeta, o al reves. */
    act(() => { useDocStore.getState().setTracked(true); });
    render(<FileMenu />);
    fireEvent.click(screen.getByRole('button', { name: /^Exportar$/ }));

    const conCambios = screen.getByRole('button', { name: /Control de Cambios/i });
    expect(conCambios.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(conCambios);

    expect(useDocStore.getState().tracked).toBe(false);
    expect(exportDocx).not.toHaveBeenCalled();
  });

  it('descargar desde la vista usa el formato del store', () => {
    render(<ExportView />);
    abrirOpciones();
    elegirDesdeLaVista('LaTeX');
    act(() => { useDocStore.setState({ citationAuditResult: null }); });

    /* El boton principal ya nombra el archivo con su extension. */
    expect(screen.getByRole('button', { name: /Descargar/ }).textContent).toContain('.tex');

    fireEvent.click(screen.getByRole('button', { name: /Descargar/ }));
    expect(exportLatex).toHaveBeenCalled();
    expect(exportDocx).not.toHaveBeenCalled();
  });
});
