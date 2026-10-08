/**
 * La copia de trabajo en Word.
 *
 * `POST /api/send-to-word/{session_id}` ya no pisa el `.docx` original. El
 * frontend manda `nombre` (solo para nombrar la copia) y nunca una ruta de
 * escritura. Con cambios sin guardar en la copia, el backend devuelve 409 y la
 * UI ofrece las DOS salidas.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { ExportView } from '../components/export/ExportView';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(),
  syncAllProviderKeys: vi.fn().mockResolvedValue({ ok: true, applied: [] }),
}));
vi.mock('../components/layout/PaperCanvas', () => ({ PaperCanvas: () => <div data-testid="canvas" /> }));
vi.mock('../components/layout/ReactPDFPreview', () => ({ ReactPDFPreview: () => <div data-testid="pdf" /> }));
vi.mock('../components/export/QuickReferenceSearch', () => ({
  QuickReferenceSearch: () => <div data-testid="crossref" />,
}));

const SIN_GUARDAR = {
  ok: false,
  requiere_confirmacion: true,
  message: 'Tenés cambios sin guardar en la copia abierta en Word. Guardalos antes de abrirla, o confirmá para descartarlos.',
};

let enviados: Array<Record<string, unknown>> = [];
let responder: (url: string) => { status: number; body: unknown };

const mockFetch = vi.fn(async (url: string, init: RequestInit) => {
  const r = responder(url);
  if (init?.body) enviados.push(JSON.parse(String(init.body)));
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    json: async () => r.body,
  } as unknown as Response;
});

const MOSTRAR_TOAST = vi.fn();

const cargar = () => {
  useDocStore.setState({
    doc: { session_id: 's-envio', file_name: 'Tesis.docx', elements: [], referencias: [] } as never,
    isLoading: false,
    atHome: false,
    activeFilePath: 'C:/tesis/Tesis.docx',
    citationAuditResult: null,
    exportDocx: vi.fn(),
    exportPdf: vi.fn(),
    exportLatex: vi.fn(),
    clearQuickExport: vi.fn(),
    copyPdfToClipboard: vi.fn(),
    sayMascot: vi.fn(),
    showToast: MOSTRAR_TOAST,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  enviados = [];
  responder = () => ({ status: 200, body: { ok: true, method: 'com', working_path: 'C:/storage/sessions/s-envio/word/Tesis_APA7.docx', message: 'Listo' } });
  vi.stubGlobal('fetch', mockFetch);
  cargar();
});

afterEach(() => { vi.unstubAllGlobals(); });

const botonEnviar = () => screen.getByRole('button', { name: /Abrir copia en Word/i });

describe('la copia de trabajo en Word', () => {
  it('manda nombre, nunca una ruta de escritura', async () => {
    render(<ExportView />);
    await act(async () => { fireEvent.click(botonEnviar()); });
    await waitFor(() => expect(enviados.length).toBe(1));
    expect(enviados[0]).toMatchObject({ nombre: 'C:/tesis/Tesis.docx' });
    expect(enviados[0].dest_path).toBeUndefined();
  });

  it('un aviso de cambios sin guardar NO alcanza: tiene que haber dos botones', async () => {
    responder = () => ({ status: 409, body: SIN_GUARDAR });
    render(<ExportView />);
    await act(async () => { fireEvent.click(botonEnviar()); });
    await waitFor(() => expect(screen.getByTestId('confirmacion-sin-guardar')).toBeTruthy());
    expect(screen.getByRole('button', { name: /Guardar y enviar/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Descartar y enviar/i })).toBeTruthy();
    expect(MOSTRAR_TOAST).not.toHaveBeenCalled();
  });

  it('"Guardar y enviar" manda guardar:true, y no forzar', async () => {
    responder = (url) => (url.includes('send-to-word') && enviados.length === 0
      ? { status: 409, body: SIN_GUARDAR }
      : { status: 200, body: { ok: true, method: 'com', working_path: 'C:/x.docx', message: 'Listo' } });
    render(<ExportView />);
    await act(async () => { fireEvent.click(botonEnviar()); });
    await waitFor(() => screen.getByTestId('confirmacion-sin-guardar'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Guardar y enviar/i })); });
    await waitFor(() => expect(enviados.length).toBe(2));
    expect(enviados[1]).toMatchObject({ nombre: 'C:/tesis/Tesis.docx', guardar: true });
    expect(enviados[1].forzar).toBeUndefined();
  });

  it('"Descartar y enviar" manda forzar:true, y no guardar', async () => {
    responder = (url) => (url.includes('send-to-word') && enviados.length === 0
      ? { status: 409, body: SIN_GUARDAR }
      : { status: 200, body: { ok: true, method: 'com', working_path: 'C:/x.docx', message: 'Listo' } });
    render(<ExportView />);
    await act(async () => { fireEvent.click(botonEnviar()); });
    await waitFor(() => screen.getByTestId('confirmacion-sin-guardar'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Descartar y enviar/i })); });
    await waitFor(() => expect(enviados.length).toBe(2));
    expect(enviados[1]).toMatchObject({ nombre: 'C:/tesis/Tesis.docx', forzar: true });
    expect(enviados[1].guardar).toBeUndefined();
  });

  it('la confirmacion se puede cerrar sin mandar nada', async () => {
    responder = () => ({ status: 409, body: SIN_GUARDAR });
    render(<ExportView />);
    await act(async () => { fireEvent.click(botonEnviar()); });
    await waitFor(() => screen.getByTestId('confirmacion-sin-guardar'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Mejor no/i })); });
    expect(screen.queryByTestId('confirmacion-sin-guardar')).toBeNull();
    expect(enviados).toHaveLength(1);
  });

  it('dice dónde quedó la copia, no solo "listo"', async () => {
    render(<ExportView />);
    await act(async () => { fireEvent.click(botonEnviar()); });
    await waitFor(() => {
      expect(document.body.textContent).toContain('Tesis_APA7.docx');
    });
  });
});
