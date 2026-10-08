/**
 * Los dos envoltorios HTTP de Epic A, contra `fetch` stubbeado.
 *
 * El wizard los mockea (para no depender de red), así que acá se fija el
 * contrato real: el verbo/URL que pegan y la forma de la respuesta que
 * devuelven. `sortReferences` tolera la ausencia de `referencias` con una lista
 * vacía, para no romper la pantalla si el backend responde corto.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sortReferences, detectCitationStyle } from '../api/backend';

function fakeResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
    headers: { get: () => null },
  } as unknown as Response;
}

describe('API de bibliografía', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('sortReferences hace POST al endpoint de orden y devuelve las referencias', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ referencias: [{ id: 'b' }] }));
    const out = await sortReferences('s1');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/references/sort/s1'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(out).toEqual([{ id: 'b' }]);
  });

  it('detectCitationStyle hace GET y devuelve el reporte', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ mixed: true, ieee: 1, vancouver: 0, apa: 1 }));
    const out = await detectCitationStyle('s1');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/citation-style/s1'),
      undefined,
    );
    expect(out.mixed).toBe(true);
  });
});
