/**
 * WordAPA7 Add-in — Entry point del Task Pane
 *
 * Inicializa Office.js y monta la app React de forma robusta.
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/taskpane.css'
import './styles/onboarding.css'

let isMounted = false

function mountApp(isWordHost: boolean) {
  if (isMounted) return
  const container = document.getElementById('root')
  if (container) {
    isMounted = true
    const root = createRoot(container)
    root.render(
      <React.StrictMode>
        {!isWordHost && (
          <div style={{
            backgroundColor: '#eff6ff',
            color: '#1e40af',
            padding: '8px 12px',
            fontSize: '12px',
            borderBottom: '1px solid #bfdbfe',
            textAlign: 'center',
            fontWeight: 500,
          }}>
            Vista previa del Add-in (Modo Standalone / Navegador).
          </div>
        )}
        <App />
      </React.StrictMode>
    )
  }
}

// Inicialización de Office con fallback automático para depuración en navegador
if (typeof Office !== 'undefined' && Office.onReady) {
  Office.onReady((info) => {
    const isWord = Boolean(info && info.host === Office.HostType.Word)
    mountApp(isWord)
  }).catch((err) => {
    console.warn('[WordAPA7] Error en Office.onReady, cargando en modo fallback:', err)
    mountApp(false)
  })
  
  // Timeout de seguridad: si Office.onReady no resuelve en 2 segundos (p.ej. abierto en Chrome), montar igual
  setTimeout(() => {
    if (!isMounted) {
      mountApp(false)
    }
  }, 2000)
} else {
  // Modo navegador directo (sin office.js)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mountApp(false))
  } else {
    mountApp(false)
  }
}

