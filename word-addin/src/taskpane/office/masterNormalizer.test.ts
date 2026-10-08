import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./coverGuard', () => ({
  getCoverZones: vi.fn().mockResolvedValue(null), // backend caído
}))
vi.mock('./wordHelper', () => ({
  formatDocumentAPA7: vi.fn().mockResolvedValue(undefined),
  getDocumentText: vi.fn().mockResolvedValue('texto de prueba'),
}))

describe('normalizeEntireDocumentAPA7 offline', () => {
  beforeEach(() => vi.clearAllMocks())
  it('no lanza "Motor central" cuando el backend está caído (aplica fallback local)', async () => {
    const { normalizeEntireDocumentAPA7 } = await import('./masterNormalizer')
    const report = await normalizeEntireDocumentAPA7()
    expect(report).toBeDefined()
    expect((report as any).fallbackUsed).toBe(true)
  })
})
