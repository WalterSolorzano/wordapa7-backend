import { describe, it, expect } from 'vitest'
// Vite `?raw` trae el contenido del archivo como string en tiempo de transform,
// sin necesidad de `fs` (que Vite stubbea a null en el entorno jsdom de test).
import appSrc from '../App.tsx?raw'
import rightSidePanelSrc from '../components/activity/RightSidePanel.tsx?raw'
import step5Src from '../components/referencias/Step5ReferencesWizard.tsx?raw'
import { EDITOR_RAIL_ITEMS } from '../components/shell/railItems'

describe('Layout: unificación del mapa de títulos', () => {
  it('el mapa del documento se incluye en el paso 2', () => {
    // StepRail desapareció: el mapa cuelga del catálogo del rail y el flyout lo
    // pinta según `showOutline`. La fase 2 (Estructura) es la que lo muestra.
    const estructura = EDITOR_RAIL_ITEMS.find((item) => item.step === 2)
    expect(estructura?.showOutline).toBe(true)
  })
})

// ── D1: EditorRail eliminado, toggle Sparkles en RightSidePanel ──

describe('D1 — EditorRail eliminado', () => {
  it('App.tsx NO monta <EditorRail />', () => {
    // El componente EditorRail ya no se renderiza en ningún layout
    expect(appSrc).not.toMatch(/<EditorRail/)
  })

  it('App.tsx NO importa EditorRail', () => {
    expect(appSrc).not.toMatch(/import\s+\{[^}]*EditorRail[^}]*\}/)
  })

  it('RightSidePanel tiene el toggle Sparkles (colapsado)', () => {
    // Cuando el panel está cerrado, muestra un botón Sparkles para reabrir
    expect(rightSidePanelSrc).toContain('Sparkles')
    expect(rightSidePanelSrc).toMatch(/forceRightPanelOpen[^\n]*\r?\n[^\n]*return/)
  })
})

// ── F4: Drawer del validador a nivel raíz (App.tsx) ──

describe('F4 — Validator drawer global', () => {
  it('App.tsx renderiza ValidatorDrawer a nivel raíz', () => {
    expect(appSrc).toContain('ValidatorDrawer')
    expect(appSrc).toContain('ValidatorView')
  })

  it('Step5ReferencesWizard ya NO monta el drawer del validador', () => {
    // El drawer se movió a App.tsx; Step5 solo conserva el aviso de sin bib
    expect(step5Src).not.toMatch(/\{validatorOpen\s*&&/)
    expect(step5Src).not.toContain('ValidatorView')
  })
})
