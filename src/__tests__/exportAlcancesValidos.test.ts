/**
 * WordAPA7 — la descarga del DOCX no duplica el prefijo `/api`.
 *
 * `getApiBase()` ya termina en `/api` (Electron y dev) y el backend devuelve
 * `download_url` root-relative (`/api/download-artifact/...`). Concatenar los
 * dos producía `/api/api/download-artifact/...`, el backend respondía 404 y el
 * navegador bajaba ese JSON en vez del `.docx`. El PDF ya hacía el recorte; el
 * DOCX lo había perdido.
 *
 * Esta prueba fija el borde exacto: con una base que SÍ termina en `/api`, la
 * URL que se pide para el artefacto es la correcta, sin `/api/api/`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742/api'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742/api'),
  resolveAssetUrl: vi.fn(),
  fetchWithTrace: vi.fn(),
}));

import { useDocStore } from '../store/useDocStore';

const ARTEFACTO = '/api/download-artifact/s1/abc';

beforeEach(() => {
  vi.clearAllMocks();
  /* `triggerDownload` hace un fetch del artefacto; la generación hace otro al
     endpoint `/generate`. Se enrutan por URL. */
  (globalThis as any).fetch = vi.fn((url: string) => {
    if (url.includes('/generate')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ download_url: ARTEFACTO, filename: 'APA7_trabajo.docx' }),
      });
    }
    return Promise.resolve({ ok: true, status: 200, blob: async () => new Blob() });
  });
  useDocStore.setState({
    doc: { session_id: 's1', file_name: 'trabajo.docx', elements: [] } as never,
    isLoading: false,
  } as never);
});

describe('exportDocx arma la URL de descarga sin duplicar /api', () => {
  it('el artefacto se pide a /api/download-artifact, nunca a /api/api/...', async () => {
    await useDocStore.getState().exportDocx(false);

    const urls = (globalThis.fetch as any).mock.calls.map((c: unknown[]) => String(c[0]));
    expect(urls.some((u) => u.includes('/generate'))).toBe(true);
    expect(urls).toContain(`http://localhost:8742${ARTEFACTO}`);
    expect(urls.some((u) => u.includes('/api/api/'))).toBe(false);
  });
});
