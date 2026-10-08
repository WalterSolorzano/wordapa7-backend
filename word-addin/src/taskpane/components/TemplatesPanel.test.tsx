import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import React from 'react'

// ── Regression test: TemplatesPanel debe ser 100% client-side ──
// El bug "405 Method Not Allowed" venía de un bundle STALE que llamaba
// rutas backend con método incorrecto. El código fuente actual ya es
// client-side (Word.run). Este test es la red de seguridad para que
// NUNCA se reintroduzca una llamada al backend desde TemplatesPanel.

describe('TemplatesPanel — no llama al backend', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    global.fetch = fetchSpy as any
    // Mock mínimo de Word.run para que el handler no lance
    ;(global as any).Word = {
      run: async (cb: any) => {
        const ctx = {
          document: {
            body: {
              insertParagraph: () => ({
                font: { name: '', size: 0, bold: false, italic: false },
                alignment: 0,
                lineSpacing: 0,
                leftIndent: 0,
                firstLineIndent: 0,
                spaceBefore: 0,
                spaceAfter: 0,
              }),
            },
          },
          sync: async () => {},
        }
        await cb(ctx)
      },
      InsertLocation: { end: 'end' },
      Alignment: { centered: 1, left: 0 },
    }
  })

  it('no hace fetch a /api/template* ni /api/apply-template al importar', async () => {
    await import('./TemplatesPanel')
    const templateCalls = fetchSpy.mock.calls.filter((c: any[]) =>
      /\/api\/(template|apply-template|create-from-template)/.test(String(c[0])),
    )
    expect(templateCalls).toHaveLength(0)
  })

  it('no hace fetch al backend al insertar una plantilla (usa Word.run local)', async () => {
    const showToast = vi.fn()
    const { TemplatesPanel } = await import('./TemplatesPanel')
    const { getByText } = render(<TemplatesPanel showToast={showToast} />)
    const btn = getByText(/Insertar Plantilla/i)
    fireEvent.click(btn)
    // Esperar a que el handler asíncrono termine
    await new Promise((r) => setTimeout(r, 50))
    const backendCalls = fetchSpy.mock.calls.filter((c: any[]) =>
      /\/api\//.test(String(c[0])),
    )
    expect(backendCalls).toHaveLength(0)
  })
})
