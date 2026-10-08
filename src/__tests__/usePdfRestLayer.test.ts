/**
 * FASE 4 — usePdfRestLayer: gate de reposo + estado capa PDF.
 *
 * El hook escucha mutaciones del doc. Tras 1.5s sin cambios (mismo gate
 * que Fase 2), llama POST /api/layout/pdf-export. Al detectar una mutación
 * nueva (tecleo), pasa a 'hidden' (capa PDF se oculta, HTML manda).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePdfRestLayer } from '../lib/usePdfRestLayer';

// Mock del endpoint
vi.mock('../api/layout', () => ({
  exportLayoutPdf: vi.fn(),
}));

import { exportLayoutPdf } from '../api/layout';

describe('usePdfRestLayer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(exportLayoutPdf).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('estado inicial es idle', () => {
    const { result } = renderHook(() => usePdfRestLayer(null));
    expect(result.current.restLayerState.status).toBe('idle');
  });

  it('tras 1.5s sin cambios, estado pasa a loading y luego ready', async () => {
    vi.mocked(exportLayoutPdf).mockResolvedValue({
      session_id: 'test',
      available: true,
      provider: 'word_com',
      pdf_url: '/api/preview-pdf/test/rest.pdf',
      page_count: 3,
      elapsed_ms: 500,
    });

    const { result } = renderHook(() => usePdfRestLayer('test-session'));

    // Avanzar 1.5s
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // Debería estar loading o ready (depende de la promesa)
    expect(['loading', 'ready']).toContain(result.current.restLayerState.status);

    // Resolver la promesa
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.restLayerState.status).toBe('ready');
    expect(result.current.restLayerState.pdfUrl).toBe('/api/preview-pdf/test/rest.pdf');
    expect(result.current.restLayerState.pageCount).toBe(3);
  });

  it('al detectar mutación nueva (tecleo), estado pasa a hidden', async () => {
    vi.mocked(exportLayoutPdf).mockResolvedValue({
      session_id: 'test',
      available: true,
      provider: 'word_com',
      pdf_url: '/api/preview-pdf/test/rest.pdf',
      page_count: 3,
      elapsed_ms: 500,
    });

    const { result } = renderHook(() => usePdfRestLayer('test-session'));

    // Avanzar 1.5s para trigger
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.restLayerState.status).toBe('ready');

    // Simular mutación (tecleo) — llamar notifyMutation
    act(() => {
      result.current.notifyMutation();
    });

    expect(result.current.restLayerState.status).toBe('hidden');
  });

  it('sin Word disponible, estado pasa a hidden con razón', async () => {
    vi.mocked(exportLayoutPdf).mockResolvedValue({
      session_id: 'test',
      available: false,
      provider: 'none',
      reason: 'Se requiere Microsoft Word',
      pdf_url: null,
      page_count: null,
      elapsed_ms: 100,
    });

    const { result } = renderHook(() => usePdfRestLayer('test-session'));

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.restLayerState.status).toBe('hidden');
    expect(result.current.restLayerState.reason).toBe('Se requiere Microsoft Word');
  });
});
