import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { paginateLayout } from '../api/layout';

describe('paginateLayout (api client)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('POST /api/layout/paginate con session_id y devuelve el JSON', async () => {
    const payload = { session_id: 's1', available: true, total_pages: 3 };
    fetchMock.mockResolvedValue({ ok: true, json: async () => payload });
    const res = await paginateLayout('s1');
    expect(res).toEqual(payload);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/layout/paginate');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ session_id: 's1' });
  });

  it('HTTP != ok lanza error (el hook lo traga como best-effort)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(paginateLayout('s1')).rejects.toThrow('HTTP 500');
  });
});
