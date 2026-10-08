/**
 * Conectar con el Word abierto: el chip no puede afirmar mas de lo que probo.
 *
 * CONTEXTO. El panel del complemento (Office.js) es lo unico que edita el
 * documento EN VIVO. Abrirlo desde afuera es imposible: se abre con un gesto
 * dentro de Word o con `setStartupBehavior(load)`. Lo que la app SI puede es
 * traer al frente el `.docx` del usuario y decir la verdad sobre si el panel
 * esta latiendo.
 *
 * LO QUE SE AFIRMA ACA, y por que cada cosa:
 *
 *   1. "Conectado" se deriva del LATIDO (`active_in_word`), no de haber
 *      abierto un archivo. Un chip que se pinta verde tras un `startfile`
 *      estaria festejando un archivo abierto, no una conexion.
 *
 *   2. El chip NUNCA publica latido. `POST /api/addin/heartbeat` es del
 *      add-in; si este componente lo llamara, se declararia conectado solo,
 *      que es la version elegante de mentir.
 *
 *   3. Cada estado ofrece la accion que le corresponde: reparar el complemento
 *      cuando no esta instalado, abrir el Word del usuario cuando el panel esta
 *      cerrado, y nada cuando ya esta en vivo.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { UnifiedToolbar } from '../components/toolbar/UnifiedToolbar';
import { ExportView } from '../components/export/ExportView';
import chipCrudo from '../components/toolbar/WordLiveChip.tsx?raw';

const getWordConnection = vi.fn();
const connectWord = vi.fn();
const repairSideload = vi.fn();

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(),
  syncAllProviderKeys: vi.fn().mockResolvedValue({ ok: true, applied: [] }),
  getWordConnection: (...a: unknown[]) => getWordConnection(...a),
  connectWord: (...a: unknown[]) => connectWord(...a),
  repairSideload: (...a: unknown[]) => repairSideload(...a),
}));

vi.mock('../components/layout/PaperCanvas', () => ({ PaperCanvas: () => <div data-testid="canvas" /> }));
vi.mock('../components/layout/ReactPDFPreview', () => ({ ReactPDFPreview: () => <div data-testid="pdf" /> }));
vi.mock('../components/export/QuickReferenceSearch', () => ({
  QuickReferenceSearch: () => <div data-testid="crossref" />,
}));

/** Las tres respuestas reales del backend, tal como las devuelve hoy. */
const EN_VIVO = { installed: true, heartbeat_age_s: 12, active_in_word: true };
const PANEL_CERRADO = { installed: true, heartbeat_age_s: null, active_in_word: false };
const SIN_COMPLEMENTO = { installed: false, heartbeat_age_s: null, active_in_word: false };

const chip = () => screen.getByTestId('word-live-chip');

const cargarStore = (extra: Record<string, unknown> = {}) => {
  useDocStore.setState({
    doc: {
      session_id: 's-word',
      file_name: 'Tesis.docx',
      elements: [],
      referencias: [],
    } as never,
    isLoading: false,
    atHome: false,
    activeFilePath: 'C:/tesis/Tesis.docx',
    citationAuditResult: null,
    lastSavedAt: null,
    isSaving: false,
    liveChatOpen: false,
    exportDocx: vi.fn(),
    exportPdf: vi.fn(),
    exportLatex: vi.fn(),
    clearQuickExport: vi.fn(),
    copyPdfToClipboard: vi.fn(),
    sayMascot: vi.fn(),
    showToast: vi.fn(),
    ...extra,
  } as never);
};

beforeEach(() => {
  vi.clearAllMocks();
  getWordConnection.mockResolvedValue(PANEL_CERRADO);
  connectWord.mockResolvedValue({ ok: true });
  repairSideload.mockResolvedValue({ status: 'ok' });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })) as never);
  cargarStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

import { WordLiveChip } from '../components/toolbar/WordLiveChip';

/** Monta el chip y espera al primer estado, que siempre llega por fetch. */
const montarBarra = async () => {
  let utils!: ReturnType<typeof render>;
  await act(async () => { utils = render(<WordLiveChip />); });
  await act(async () => { await Promise.resolve(); });
  return utils;
};

describe('el chip de Word dice conectado solo con latido', () => {
  it('con `active_in_word` en true, dice que esta en vivo', async () => {
    getWordConnection.mockResolvedValue(EN_VIVO);
    await montarBarra();

    await waitFor(() => { expect(chip().textContent).toMatch(/en vivo/i); });
  });

  it('con el complemento instalado pero sin latido, NO dice conectado', async () => {
    /* El caso que importa: el complemento esta en el disco y el panel esta
       cerrado. Decir "conectado" aca seria afirmar una conexion que nadie
       probo, y la persona mandaria cambios a un panel que no esta mirando. */
    getWordConnection.mockResolvedValue(PANEL_CERRADO);
    await montarBarra();

    await waitFor(() => { expect(chip().textContent).toMatch(/panel cerrado/i); });
    expect(chip().textContent).not.toMatch(/en vivo/i);
  });

  it('sin complemento instalado, lo dice y ofrece repararlo', async () => {
    getWordConnection.mockResolvedValue(SIN_COMPLEMENTO);
    await montarBarra();

    await waitFor(() => { expect(chip().textContent).toMatch(/sin complemento/i); });
  });

  it('si el motor no responde, no inventa un estado', async () => {
    getWordConnection.mockRejectedValue(new Error('sin motor'));
    await montarBarra();

    await waitFor(() => { expect(chip().textContent).toMatch(/sin respuesta/i); });
    expect(chip().textContent).not.toMatch(/en vivo/i);
  });
});

describe('cada estado lleva a la accion que le corresponde', () => {
  it('con el panel cerrado, abre el Word del usuario con su documento', async () => {
    getWordConnection.mockResolvedValue(PANEL_CERRADO);
    await montarBarra();

    await act(async () => { fireEvent.click(chip()); });

    await waitFor(() => { expect(connectWord).toHaveBeenCalledWith('C:/tesis/Tesis.docx'); });
    expect(repairSideload).not.toHaveBeenCalled();
  });

  it('sin complemento, repara la instalacion en vez de abrir un archivo', async () => {
    getWordConnection.mockResolvedValue(SIN_COMPLEMENTO);
    await montarBarra();

    await act(async () => { fireEvent.click(chip()); });

    await waitFor(() => { expect(repairSideload).toHaveBeenCalled(); });
    expect(connectWord).not.toHaveBeenCalled();
  });

  it('en vivo no dispara nada: ya no hay nada que abrir', async () => {
    getWordConnection.mockResolvedValue(EN_VIVO);
    await montarBarra();

    await act(async () => { fireEvent.click(chip()); });

    expect(connectWord).not.toHaveBeenCalled();
    expect(repairSideload).not.toHaveBeenCalled();
  });
});

describe('el chip no se declara conectado por si mismo', () => {
  it('nunca publica latido del complemento', () => {
    /* `POST /api/addin/heartbeat` es del add-in corriendo DENTRO de Word. Si
       este componente lo llamara, `active_in_word` se pondria en true por el
       solo hecho de que la app esta abierta. */
    expect(chipCrudo).not.toMatch(/addin\/heartbeat/);
  });

  it('no deduce la conexion de haber abierto un archivo', () => {
    /* El unico antecedente valido de "conectado" es `active_in_word`. */
    expect(chipCrudo).toMatch(/active_in_word/);
  });
});

describe('la vista de exportacion ofrece el conectar en vivo', () => {
  it('con archivo .docx activo, el boton aparece y abre el Word del usuario', async () => {
    render(<ExportView />);

    const boton = await screen.findByRole('button', { name: /Abrir en Word/i });
    await act(async () => { fireEvent.click(boton); });

    await waitFor(() => { expect(connectWord).toHaveBeenCalledWith('C:/tesis/Tesis.docx'); });
  });

  it('sin archivo activo no hay boton: no hay que abrir nada', async () => {
    cargarStore({ activeFilePath: null, atHome: false });
    render(<ExportView />);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Abrir en Word/i })).toBeNull();
    });
  });
});
