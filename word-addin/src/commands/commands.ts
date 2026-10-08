/**
 * WordAPA7 Add-in — Comandos del Ribbon (FunctionFile)
 * =====================================================
 *
 * Cada comando del Ribbon tiene su propia acción dedicada y abre el
 * Task Pane en la vista correspondiente.
 */

import {
  insertTableAPA,
  applyHeadingStyle,
} from '../taskpane/office/wordHelper'
import { normalizeEntireDocumentAPA7 } from '../taskpane/office/masterNormalizer'

Office.onReady((info) => {
  if (info.host !== Office.HostType.Word) return

  // Grupo 1: Asistente
  Office.actions.associate('validateSelection', validateSelection)
  Office.actions.associate('refreshDocument', refreshDocument)
  Office.actions.associate('passAPAQuick', passAPAQuick)

  // Grupo 2: Insertar APA 7

  // Grupo 3: Referencias
  Office.actions.associate('openReferences', openReferencesPanel)
  Office.actions.associate('openBibliography', handleBibliography)
  Office.actions.associate('openCoverPage', openCoverPagePanel)

  // Grupo 4: Herramientas
  Office.actions.associate('openAI', openAIPanel)
})

// ── UTILIDAD: ABRIR TASKPANE ────────────────────────────────────────────────

async function openTaskpane(tab: string, action?: string) {
  try {
    localStorage.setItem('wordapa7_addin_active_tab', tab)
    if (action) {
      localStorage.setItem('wordapa7_addin_action', action)
    } else {
      localStorage.removeItem('wordapa7_addin_action')
    }

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'wordapa7_addin_active_tab',
      newValue: tab,
    }))
    if (action) {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'wordapa7_addin_action',
        newValue: action,
      }))
    }
  } catch {
    /* ignore */
  }

  try {
    if (Office.addin && typeof (Office.addin as any).showAsTaskpane === 'function') {
      await (Office.addin as any).showAsTaskpane()
    }
  } catch (error) {
    console.warn('[WordAPA7] showAsTaskpane no disponible', error)
  }
}

// ── GRUPO 1: ASISTENTE ──────────────────────────────────────────────────────

async function passAPAQuick(event: Office.AddinCommands.Event) {
  try {
    await normalizeEntireDocumentAPA7()
    await openTaskpane('auditoria')
  } catch (e) {
    console.error('[WordAPA7 Ribbon] Error en passAPAQuick', e)
  } finally {
    event.completed()
  }
}

async function validateSelection(event: Office.AddinCommands.Event) {
  try {
    await openTaskpane('auditoria', 'scan')
  } finally {
    event.completed()
  }
}

async function refreshDocument(event: Office.AddinCommands.Event) {
  try {
    await openTaskpane('auditoria', 'refresh')
  } finally {
    event.completed()
  }
}

// ── GRUPO 2: INSERTAR APA 7 DIRECTO EN WORD ─────────────────────────────────

// ── GRUPO 3: REFERENCIAS ────────────────────────────────────────────────────

async function openReferencesPanel(event: Office.AddinCommands.Event) {
  try {
    await openTaskpane('referencias')
  } finally {
    event.completed()
  }
}

async function handleBibliography(event: Office.AddinCommands.Event) {
  try {
    await openTaskpane('referencias', 'build_bibliography')
  } finally {
    event.completed()
  }
}

async function openCoverPagePanel(event: Office.AddinCommands.Event) {
  try {
    await openTaskpane('portada')
  } finally {
    event.completed()
  }
}

// ── GRUPO 4: HERRAMIENTAS ───────────────────────────────────────────────────

async function openAIPanel(event: Office.AddinCommands.Event) {
  try {
    await openTaskpane('ia')
  } finally {
    event.completed()
  }
}
