import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { useLayoutRepaginate } from '../lib/useLayoutRepaginate';

const paginateLayout = vi.fn();

vi.mock('../api/layout', () => ({
  paginateLayout: (...args: unknown[]) => paginateLayout(...args),
}));
vi.mock('../api/backend', () => ({
  uploadDocxFile: vi.fn(), updateElement: vi.fn(), getApiBase: vi.fn(),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://x'), fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(), explainElement: vi.fn(), suggestCaption: vi.fn(),
}));

const respOk = {
  session_id: 's1', available: true, provider: 'com', total_pages: 5,
  elements: [{ element_id: 'e0', page_start: 2 }],
  line_cuts: [], page_setup: null, elapsed_ms: 3,
};

describe('useLayoutRepaginate (debounce + eco)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    paginateLayout.mockReset().mockResolvedValue(respOk);
    useDocStore.setState({
      doc: { session_id: 's1', file_name: 't.docx',
             elements: [{ id: 'e0', type: 'paragraph', text: 'hola' } as any],
             meta: { page_count: 1 }, referencias: [] } as any,
      layoutCuts: null, layoutEcho: 0, wordLayoutUnavailable: false,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('muta el doc → 1 request tras la ventana; respuesta aplicada NO re-agenda', async () => {
    const { result, unmount } = renderHook(() => {
      const doc = useDocStore((s) => s.doc);
      useLayoutRepaginate(doc);
      return useDocStore((s) => s.layoutEcho);
    });

    // 1ª ventana: request
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(paginateLayout).toHaveBeenCalledTimes(1);
    expect(paginateLayout).toHaveBeenCalledWith('s1');

    // respuesta aplicada (layoutEcho 0→1) → el efecto corre pero NO re-agenda
    expect(result.current).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(paginateLayout).toHaveBeenCalledTimes(1);   // guard de eco

    // edición de usuario (doc nuevo, eco sin cambio) → re-agenda
    await act(async () => {
      useDocStore.setState({
        doc: { ...useDocStore.getState().doc!, elements: [{ id: 'e0', type: 'paragraph', text: 'hola nuevo' } as any] },
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await Promise.resolve();   // flush de microtasks del send async
    });
    expect(paginateLayout).toHaveBeenCalledTimes(2);
    unmount();
  });
});
