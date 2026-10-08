import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Quote,
  Minimize2,
  MessageSquare,
  Check,
  X,
  Loader2,
  CornerDownLeft,
} from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';
import { rewriteText } from '../../api/backend';

interface InlineAILensProps {
  containerRef: React.RefObject<HTMLDivElement>;
}

export const InlineAILens: React.FC<InlineAILensProps> = ({ containerRef }) => {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedText, setSelectedText] = useState<string>('');
  const [targetElementId, setTargetElementId] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [diffPreview, setDiffPreview] = useState<{ original: string; proposed: string } | null>(null);

  const doc = useDocStore((s) => s.doc);
  const updateElementText = useDocStore((s) => s.updateElementText);
  const updateElementType = useDocStore((s) => s.updateElementType);
  const setLiveChatOpen = useDocStore((s) => s.setLiveChatOpen);
  const showToast = useDocStore((s) => s.showToast);

  useEffect(() => {
    const handleMouseUp = () => {
      // Si estamos en medio de una vista previa de diff, no cerrar
      if (diffPreview) return;

      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setPosition(null);
        setSelectedText('');
        setTargetElementId(null);
        return;
      }

      const text = sel.toString().trim();
      if (text.length < 5) {
        setPosition(null);
        return;
      }

      const anchorNode = sel.anchorNode;
      const elementNode = anchorNode instanceof HTMLElement ? anchorNode : anchorNode?.parentElement;
      const paperElem = elementNode?.closest('[data-element-id]') as HTMLElement | null;

      if (!paperElem || !containerRef.current) {
        setPosition(null);
        return;
      }

      const elementId = paperElem.getAttribute('data-element-id');
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();

      setPosition({
        top: rect.top - containerRect.top - 46,
        left: Math.max(12, Math.min(containerRect.width - 340, rect.left - containerRect.left + rect.width / 2 - 150)),
      });
      setSelectedText(text);
      setTargetElementId(elementId);
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('mouseup', handleMouseUp);
      return () => container.removeEventListener('mouseup', handleMouseUp);
    }
  }, [containerRef, diffPreview]);

  if (!position || !targetElementId || !doc) return null;

  const targetElem = doc.elements.find((e) => e.id === targetElementId);
  if (!targetElem) return null;

  const handleFormalizeAPA = async () => {
    setLoadingAction('formalize');
    try {
      const res = await rewriteText(
        doc.session_id,
        targetElementId,
        selectedText,
        'Reescribe este texto en tono formal académico según Normas APA 7ma edición, eliminando primera persona, informalismos y muletillas.'
      );
      const proposed = typeof res === 'string' ? res : (res as any)?.rewritten;
      if (proposed) {
        setDiffPreview({ original: selectedText, proposed });
      }
    } catch (err: any) {
      showToast(err.message || 'Error al reescribir con IA', 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSynthesize = async () => {
    setLoadingAction('synthesize');
    try {
      const res = await rewriteText(
        doc.session_id,
        targetElementId,
        selectedText,
        'Sintetiza y resume este fragmento conservando el rigor conceptual y las citas académicas.'
      );
      const proposed = typeof res === 'string' ? res : (res as any)?.rewritten;
      if (proposed) {
        setDiffPreview({ original: selectedText, proposed });
      }
    } catch (err: any) {
      showToast(err.message || 'Error al sintetizar', 'error');
    } finally {
      setLoadingAction(null);
    }
  };


  const triggerActionToast = useDocStore((s) => s.triggerActionToast);

  const handleConvertToBlockQuote = () => {
    updateElementType(targetElementId, 'block_quote', 1);
    triggerActionToast('Convertido a Cita en Bloque (sangría 1.27 cm)');
    setPosition(null);
    setDiffPreview(null);
  };

  const handleAskCopilot = () => {
    setLiveChatOpen(true);
    setPosition(null);
    setDiffPreview(null);
  };

  const applyDiff = () => {
    if (!diffPreview || !targetElem) return;
    const currentFullText = targetElem.text || '';
    const newFullText = currentFullText.replace(diffPreview.original, diffPreview.proposed);
    updateElementText(targetElementId, newFullText);
    triggerActionToast('Texto académico aplicado');
    setDiffPreview(null);
    setPosition(null);
  };

  const cancelDiff = () => {
    setDiffPreview(null);
    setPosition(null);
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: position.top,
        left: position.left,
        zIndex: 60,
        backgroundColor: 'var(--surface-elevated, #ffffff)',
        border: '1px solid var(--border-subtle, #e5e7eb)',
        borderRadius: '10px',
        boxShadow: 'var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.1))',
        padding: '4px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        userSelect: 'none',
      }}
    >
      {diffPreview ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-main, #1a1a2e)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>Propuesta: </span>
            {diffPreview.proposed}
          </div>
          <button
            type="button"
            onClick={applyDiff}
            title="Aplicar cambio"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '6px',
              backgroundColor: 'var(--accent-primary, #4f7cff)',
              color: '#ffffff',
              border: 'none',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Check size={12} strokeWidth={3} />
            <span>Aplicar</span>
          </button>
          <button
            type="button"
            onClick={cancelDiff}
            title="Descartar"
            style={{
              padding: '4px',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary, #6b7280)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
            }}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={handleFormalizeAPA}
            disabled={loadingAction !== null}
            title="Elevar a estilo académico APA 7"
            style={lensBtnStyle}
          >
            {loadingAction === 'formalize' ? (
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <Sparkles size={13} color="var(--accent-primary, #4f7cff)" />
            )}
            <span>Elevar a APA 7</span>
          </button>

          <button
            type="button"
            onClick={handleConvertToBlockQuote}
            disabled={loadingAction !== null}
            title="Convertir a cita en bloque (>40 palabras)"
            style={lensBtnStyle}
          >
            <Quote size={13} />
            <span>Cita en bloque</span>
          </button>

          <button
            type="button"
            onClick={handleSynthesize}
            disabled={loadingAction !== null}
            title="Sintetizar sin perder ideas clave"
            style={lensBtnStyle}
          >
            {loadingAction === 'synthesize' ? (
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <Minimize2 size={13} />
            )}
            <span>Sintetizar</span>
          </button>

          <button
            type="button"
            onClick={handleAskCopilot}
            title="Consultar al Copiloto IA"
            style={lensBtnStyle}
          >
            <MessageSquare size={13} />
            <span>Copiloto</span>
          </button>
        </>
      )}
    </div>
  );
};

const lensBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  padding: '6px 9px',
  borderRadius: '6px',
  border: 'none',
  backgroundColor: 'transparent',
  color: 'var(--text-main, #1a1a2e)',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 0.15s ease',
};
