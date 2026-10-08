import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'

// ── Mocks de dependencias pesadas (Office.js) ──────────────────────
vi.mock('../office/proactiveEngine', () => ({
  autoFormatAllTablesAPA: vi.fn(),
  autoCaptionAllFiguresAPA: vi.fn(),
  highlightAndJumpToParagraph: vi.fn(),
}))
vi.mock('../office/masterNormalizer', () => ({
  normalizeEntireDocumentAPA7: vi.fn(),
}))
vi.mock('../office/highlighter', () => ({
  applyHighlights: vi.fn(),
  clearAllHighlights: vi.fn(),
}))
vi.mock('../office/wordHelper', () => ({
  insertBibliographyAPA: vi.fn(),
  getDocumentText: vi.fn().mockResolvedValue(''),
  getSelectedText: vi.fn().mockResolvedValue(''),
  formatDocumentAPA7: vi.fn(),
}))
vi.mock('../api/backend', () => ({
  backend: {
    auditDocument: vi.fn().mockResolvedValue({ findings: [] }),
    buildBibliography: vi.fn().mockResolvedValue({ bibliography_text: '', total: 0 }),
  },
  OFFLINE_TOAST_MESSAGE: 'offline',
}))
vi.mock('./SelectionCriticCard', () => ({
  SelectionCriticCard: () => React.createElement('div', { 'data-testid': 'critic' }),
}))

describe('LiveAssistantPanel — botón de formato local', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  /* Las cuatro preferencias persistidas que el panel no dibujaba. El motor las
     lee y las guarda entre sesiones, así que la pregunta no es "si funcionan"
     —funcionan— sino "si hay una forma de cambiarlas". Ahora la hay, y estas
     pruebas son la que lo sostienen: sin ellas, el próximo que limpia el panel
     puede volver a dejar cuatro checkboxes de adorno. */
  it('dibuja las cuatro opciones de AssistantOptions, y cada una avisa el cambio', async () => {
    const onOptionChange = vi.fn()
    const { LiveAssistantPanel } = await import('./LiveAssistantPanel')
    const { getByLabelText } = render(
      <LiveAssistantPanel
        running={true}
        options={{ autoFormat: true, autoCaption: false, autoExtractCitations: true, autoDetectAI: false }}
        stats={null}
        citationsCount={0}
        onToggle={vi.fn()}
        onOptionChange={onOptionChange}
        onScanNow={vi.fn()}
        onFormatAll={vi.fn()}
        auditStatus="idle"
        auditResult={null}
        auditNotice={null}
        showToast={vi.fn()}
      />,
    )

    // El estado sale de `options`, no de un estado local del panel: si el panel
    // guardara el suyo, la casilla mentiría después de que la otra ventana
    // cambie la preferencia.
    expect((getByLabelText(/Formatear el párrafo/) as HTMLInputElement).checked).toBe(true)
    expect((getByLabelText(/Rotular figuras/) as HTMLInputElement).checked).toBe(false)

    fireEvent.click(getByLabelText(/Rotular figuras/))
    expect(onOptionChange).toHaveBeenCalledWith('autoCaption', true)
    fireEvent.click(getByLabelText(/Avisar de texto generado/))
    expect(onOptionChange).toHaveBeenCalledWith('autoDetectAI', true)
  })

  it('ninguna preferencia queda sin control: la lista dibujada es la del motor', async () => {
    const { LiveAssistantPanel, OPCIONES_VISIBLES } = await import('./LiveAssistantPanel')
    const { container } = render(
      <LiveAssistantPanel
        running={true}
        options={{ autoFormat: true, autoCaption: true, autoExtractCitations: true, autoDetectAI: false }}
        stats={null}
        citationsCount={0}
        onToggle={vi.fn()}
        onOptionChange={vi.fn()}
        onScanNow={vi.fn()}
        onFormatAll={vi.fn()}
        auditStatus="idle"
        auditResult={null}
        auditNotice={null}
        showToast={vi.fn()}
      />,
    )
    // Si el motor gana una quinta preferencia, esto se cae: hay que dibujarla.
    expect(OPCIONES_VISIBLES.map((o) => o.clave)).toEqual([
      'autoFormat',
      'autoCaption',
      'autoExtractCitations',
      'autoDetectAI',
    ])
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(OPCIONES_VISIBLES.length)
  })

  it('muestra el botón "Formatear (modo local)" y dispara onFormatAll al pulsarlo', async () => {
    const onFormatAll = vi.fn()
    const { LiveAssistantPanel } = await import('./LiveAssistantPanel')
    const { getByText } = render(
      <LiveAssistantPanel
        running={true}
        options={{} as any}
        stats={null}
        citationsCount={0}
        onToggle={vi.fn()}
        onOptionChange={vi.fn()}
        onScanNow={vi.fn()}
        onFormatAll={onFormatAll}
        auditStatus="idle"
        auditResult={null}
        auditNotice={null}
        showToast={vi.fn()}
      />,
    )
    /* El texto se busca exacto a propósito: la sección de preferencias dice
       "Formatear el párrafo", así que un /Formatear/i genérico encuentra dos
       nodos y falla. */
    const btn = getByText(/Formatear \(modo local\)/)
    fireEvent.click(btn)
    expect(onFormatAll).toHaveBeenCalledTimes(1)
  })
})
