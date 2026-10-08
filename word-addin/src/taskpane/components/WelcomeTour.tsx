/**
 * WordAPA7 Add-in — Tour de Bienvenida (3 spotlight tips)
 * ========================================================
 *
 * Onboarding no bloqueante que aparece la primera vez que se abre el panel.
 * Tres pasos con spotlight sobre elementos clave del panel:
 *   1. Toggle ON/OFF del asistente en vivo
 *   2. Boton "Auditar documento ahora"
 *   3. Barra de pestañas
 *
 * Se guarda en localStorage ('wordapa7_welcomed') para no volver a aparecer.
 * Todo es saltable. Nada bloquea el documento.
 *
 * Sin emojis: usa iconos SVG inline.
 */

import React, { useState, useEffect, useCallback } from 'react'

const TOUR_KEY = 'wordapa7_welcomed'

interface TourStep {
  selector: string
  text: string
}

const STEPS: TourStep[] = [
  {
    selector: '.live__hero',
    text: 'Dejalo prendido y te vigilo el APA mientras escribis. Yo me ocupo, vos escribis.',
  },
  {
    selector: '[data-tour="audit-button"]',
    text: '¿Querés revisar todo de una? Dale aca y hago el trabajo sucio.',
  },
  {
    selector: '.tab-bar',
    text: 'Todo lo que te falta para APA vive aca. Tablas, figuras, portada, lo que sea.',
  },
]

// ── Iconos SVG inline ─────────────────────────────────────────────────────────

const ArrowRight: React.FC<{ size?: number }> = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)

const CheckIcon: React.FC<{ size?: number }> = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 13l4 4L19 7" />
  </svg>
)

const CloseIcon: React.FC<{ size?: number }> = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
)

// ── Componente ───────────────────────────────────────────────────────────────

export const WelcomeTour: React.FC = () => {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)
  const [targetFound, setTargetFound] = useState(true)

  // Verificar localStorage al montar
  useEffect(() => {
    try {
      if (!localStorage.getItem(TOUR_KEY)) {
        const timer = setTimeout(() => setVisible(true), 600)
        return () => clearTimeout(timer)
      }
    } catch {
      /* localStorage no disponible */
    }
  }, [])

  // Aplicar/remover spotlight cuando cambia el paso
  useEffect(() => {
    if (!visible) return

    const applySpotlight = () => {
      // Remover spotlight de todos los pasos anteriores
      STEPS.forEach((s) => {
        document.querySelectorAll(s.selector).forEach((el) => {
          el.classList.remove('tour-spotlight')
        })
      })

      const el = document.querySelector(STEPS[step].selector)
      if (el) {
        el.classList.add('tour-spotlight')
        setTargetFound(true)
      } else {
        setTargetFound(false)
      }
    }

    applySpotlight()

    const onResize = () => applySpotlight()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [visible, step])

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      STEPS.forEach((s) => {
        document.querySelectorAll(s.selector).forEach((el) => {
          el.classList.remove('tour-spotlight')
        })
      })
    }
  }, [])

  const finish = useCallback(() => {
    try {
      localStorage.setItem(TOUR_KEY, 'true')
    } catch {
      /* ignore */
    }
    STEPS.forEach((s) => {
      document.querySelectorAll(s.selector).forEach((el) => {
        el.classList.remove('tour-spotlight')
      })
    })
    setVisible(false)
  }, [])

  const next = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep(step + 1)
    } else {
      finish()
    }
  }, [step, finish])

  if (!visible) return null

  const isLast = step === STEPS.length - 1

  return (
    <>
      {/* Overlay oscuro */}
      <div className="tour-overlay" onClick={finish} />

      {/* Tooltip card */}
      <div className="tour-tooltip" key={step}>
        {/* Progreso: 3 puntos */}
        <div className="tour-tooltip__progress">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`tour-dot ${i === step ? 'tour-dot--active' : ''}`}
            />
          ))}
        </div>

        {/* Texto del paso */}
        <div className="tour-tooltip__text">
          {STEPS[step].text}
        </div>

        {/* Acciones */}
        <div className="tour-tooltip__actions">
          <button className="tour-btn tour-btn--skip" onClick={finish}>
            <CloseIcon /> Saltar
          </button>
          <button className="tour-btn tour-btn--next" onClick={next}>
            {isLast ? (
              <><CheckIcon /> Listo</>
            ) : (
              <>Siguiente <ArrowRight /></>
            )}
          </button>
        </div>
      </div>
    </>
  )
}

export default WelcomeTour
