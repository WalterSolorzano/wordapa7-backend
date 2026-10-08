/* WordAPA7 — Diálogo de consentimiento informado para LLM en la nube.
   Se muestra cuando el usuario ejecuta una acción IA (p.ej. "Refinar con IA")
   con una API key configurada pero sin consentimiento previo. Sustituye al
   antiguo window.confirm nativo por un modal consistente con la UI. */

import React from 'react';
import { ShieldAlert, X, CloudUpload, Cpu } from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';

export const LLMConsentDialog: React.FC = () => {
  const llmConsentPending = useDocStore((s) => s.llmConsentPending);
  const setLlmConsentPending = useDocStore((s) => s.setLlmConsentPending);
  const setLlmCloudConsent = useDocStore((s) => s.setLlmCloudConsent);

  if (!llmConsentPending) return null;

  const allow = () => {
    setLlmCloudConsent(true);
    setLlmConsentPending(false);
    // Reintenta la acción pendiente ahora que hay consentimiento
    setTimeout(() => useDocStore.getState().runLLMClassify(), 50);
  };

  const deny = () => {
    setLlmConsentPending(false);
    useDocStore.getState().showToast('Clasificación con IA desactivada — se usa la local heurística', 'info');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Consentimiento de envío a IA en la nube"
      onClick={deny}
      style={{
        position: 'fixed', inset: 0, zIndex: 9500,
        backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
    >
      <div
        role="document"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(440px, 100%)', maxHeight: '90vh', overflowY: 'auto',
          backgroundColor: 'var(--app-bg)', color: 'var(--text-main)',
          borderRadius: '12px', boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
          padding: '0', fontFamily: 'var(--font-sans)',
        }}
      >
        {/* Cabecera */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 18px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(250,173,20,0.15)',
          }}>
            <ShieldAlert size={17} color="var(--color-warning)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 800 }}>Enviar contenido a IA en la nube</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Consentimiento requerido · se pide una sola vez</div>
          </div>
          <button
            type="button"
            onClick={deny}
            aria-label="Cerrar"
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Cuerpo */}
        <div style={{ padding: '18px' }}>
          <div style={{
            display: 'flex', gap: '10px', alignItems: 'flex-start',
            padding: '12px 14px', borderRadius: 'var(--radius-lg)', marginBottom: '14px',
            background: 'rgba(250,173,20,0.08)', border: '1px solid rgba(250,173,20,0.25)',
          }}>
            <CloudUpload size={15} color="var(--color-warning)" style={{ flexShrink: 0, marginTop: '1px' }} />
            <div style={{ fontSize: '12px', lineHeight: 1.6, color: 'var(--text-main)' }}>
              Tu documento incluye <strong>nombres, carnets y contenido académico</strong>. Al usar
              "Refinar con IA", fragmentos de tu documento se envían a un servicio externo en la nube
              (NVIDIA NIM, Groq, OpenRouter u otro proveedor configurado).
            </div>
          </div>

          <div style={{
            display: 'flex', gap: '10px', alignItems: 'flex-start',
            padding: '12px 14px', borderRadius: 'var(--radius-lg)', marginBottom: '18px',
            background: 'rgba(79,124,255,0.07)', border: '1px solid rgba(79,124,255,0.2)',
          }}>
            <Cpu size={15} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: '1px' }} />
            <div style={{ fontSize: '12px', lineHeight: 1.6, color: 'var(--text-main)' }}>
              Si preferís no enviar el contenido, podés seguir trabajando con la
              <strong> clasificación heurística local</strong> (sin IA): funciona sin conexión y no
              comparte nada.
            </div>
          </div>

          {/* Acciones */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={deny}
              style={{
                flex: 1, padding: '10px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                background: 'transparent', color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)', borderRadius: '8px',
              }}
            >
              Solo local (sin IA)
            </button>
            <button
              type="button"
              onClick={allow}
              style={{
                flex: 1, padding: '10px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: '8px',
              }}
            >
              Sí, permitir envío
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LLMConsentDialog;
