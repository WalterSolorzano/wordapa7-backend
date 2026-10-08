import React, { useState } from 'react';
import { Wand2, Loader2, Check, X } from 'lucide-react';
import { suggestCaption } from '../../api/backend';
import { useDocStore } from '../../store/useDocStore';

interface CaptionSuggestionBadgeProps {
  elementId: string;
  onApply: (caption: string) => void;
}

export const CaptionSuggestionBadge: React.FC<CaptionSuggestionBadgeProps> = ({ elementId, onApply }) => {
  const doc = useDocStore((s) => s.doc);
  const apiKey = useDocStore((s) => s.apiKey);
  const showToast = useDocStore((s) => s.showToast);

  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const handleSuggest = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!doc) return;
    setLoading(true);
    setOpen(true);

    try {
      // Build context from nearby paragraphs
      const idx = doc.elements.findIndex((el) => el.id === elementId);
      const ctxParts: string[] = [];
      if (idx !== -1) {
        for (let i = Math.max(0, idx - 2); i < Math.min(doc.elements.length, idx + 3); i++) {
          if (i === idx) continue;
          const t = (doc.elements[i].text || '').trim();
          if (t) ctxParts.push(t);
        }
      }
      const contextText = ctxParts.join('\n') || '';
      const result = await suggestCaption(doc.session_id, elementId, contextText, apiKey);
      setSuggestion(result);
    } catch (err: any) {
      showToast(err.message || 'Error al generar la leyenda', 'error');
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (suggestion) {
      onApply(suggestion);
      setSuggestion(null);
      setOpen(false);
      showToast('Leyenda APA 7 aplicada', 'success');
    }
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSuggestion(null);
    setOpen(false);
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '8px',
        right: '8px',
        zIndex: 20,
      }}
    >
      {!open && (
        <button
          type="button"
          onClick={handleSuggest}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text-on-accent, #ffffff)',
            backgroundColor: 'var(--accent-primary, #4f7cff)',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1))',
            transition: 'transform 0.15s ease, background-color 0.15s ease',
          }}
          title="Sugerir leyenda APA 7 con IA"
        >
          <Wand2 size={13} />
          <span>Sugerir leyenda</span>
        </button>
      )}

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'var(--surface-elevated, #ffffff)',
            border: '1px solid var(--border-subtle, #e2e8f0)',
            borderRadius: '8px',
            padding: '10px 12px',
            maxWidth: '320px',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)',
            fontSize: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary, #64748b)' }}>
              <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
              <span>Analizando imagen y contexto...</span>
            </div>
          )}

          {!loading && suggestion && (
            <>
              <div style={{ fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
                Sugerencia APA 7:
              </div>
              <div style={{ fontStyle: 'italic', color: 'var(--text-secondary, #334155)', lineHeight: 1.4, maxHeight: '80px', overflowY: 'auto' }}>
                {suggestion}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={handleDismiss}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '3px 8px',
                    fontSize: '11px',
                    color: 'var(--text-secondary, #64748b)',
                    background: 'transparent',
                    border: '1px solid var(--border-subtle, #cbd5e1)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  <X size={12} />
                  <span style={{ marginLeft: '4px' }}>Cancelar</span>
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '3px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-on-accent, #ffffff)',
                    backgroundColor: 'var(--accent-primary, #4f7cff)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  <Check size={12} />
                  <span style={{ marginLeft: '4px' }}>Aplicar</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
