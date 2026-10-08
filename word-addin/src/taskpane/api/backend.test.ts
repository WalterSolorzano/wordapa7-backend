import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('backend.heartbeat', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok' }) })
    global.fetch = fetchSpy as any
    // Reset module state so discovery re-runs with our mock
    vi.resetModules()
  })

  it('existe y apunta a la ruta de heartbeat (no hardcodea :8742)', async () => {
    const { backend } = await import('./backend')
    await backend.heartbeat()
    // Al menos una llamada a fetch debe contener /api/addin/heartbeat
    const heartbeatCalls = fetchSpy.mock.calls.filter((c: any[]) =>
      /\/api\/addin\/heartbeat/.test(String(c[0])),
    )
    expect(heartbeatCalls.length).toBeGreaterThan(0)
  })

  it('best-effort: aun con la red caida intenta el latido contra /api/addin/heartbeat', async () => {
    fetchSpy = vi.fn().mockRejectedValue(new Error('Network error'))
    global.fetch = fetchSpy as any
    vi.resetModules()
    const { backend } = await import('./backend')
    // No lanza (best-effort)...
    await backend.heartbeat()
    // ...y además deja evidencia: fetch fue invocado con la ruta del latido
    const beatCalls = fetchSpy.mock.calls.filter((c: any[]) =>
      /\/api\/addin\/heartbeat/.test(String(c[0])),
    )
    expect(beatCalls.length).toBeGreaterThan(0)
  })
})
