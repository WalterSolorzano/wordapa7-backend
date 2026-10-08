import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Check,
  RotateCcw,
  Loader2,
  AlertCircle,
  FileCheck,
  Wand2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';
import { fetchProactiveElementDiagnosis, rewriteText } from '../../api/backend';

export const ProactiveSuggestionCard: React.FC = () => {
  const doc = useDocStore((s) => s.doc);
  const selectedElementId = useDocStore((s) => s.selectedElementId);
  const updateElementText = useDocStore((s) => s.updateElementText);
  const updateElementType = useDocStore((s) => s.updateElementType);
  const showToast = useDocStore((s) => s.showToast);
  const reviewResult = useDocStore((s) => s.reviewResult);
  const proofreadFindings = useDocStore((s) => s.proofreadFindings || []);

  const [loading, setLoading] = useState(false);
  const [humanizing, setHumanizing] = useState(false);
  const [proposal, setProposal] = useState<{
    element_id: string;
    type: string;
    diagnosis: string;
    original_text: string;
    proposed_text: string;
    action_type: string;
    new_type?: string;
  } | null>(null);

  useEffect(() => {
    if (!doc || !selectedElementId) {
      setProposal(null);
      return;
    }

    let active = true;
    setLoading(true);

    fetchProactiveElementDiagnosis(doc.session_id, selectedElementId)
      .then((res) => {
        if (active) {
          setProposal(res.proposal || null);
        }
      })
      .catch(() => {
        if (active) setProposal(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [doc?.session_id, selectedElementId]);

  if (!selectedElementId) return null;

  // Extraer datos de IA y auditoría para el elemento seleccionado
  const paraReview = reviewResult?.paragraphs?.find((p) => p.element_id === selectedElementId);
  const localFindings = proofreadFindings.filter((f) => f.element_id === selectedElementId);

  const aiScore = paraReview?.ai_score ?? null;
  const aiCategory = paraReview?.ai_category ?? (aiScore !== null ? (aiScore >= 50 ? 'HIGH' : aiScore >= 20 ? 'MEDIUM' : 'LOW') : null);

  const allReasons: Array<{ detail: string; phrase?: string; severity?: string }> = [];

  if (paraReview?.findings) {
    paraReview.findings.forEach((f) => {
      if (f.detail) {
        allReasons.push({ detail: f.detail, phrase: f.phrase, severity: f.severity });
      }
    });
  }

  localFindings.forEach((f) => {
    if (f.message && !allReasons.some((r) => r.detail === f.message)) {
      allReasons.push({
        detail: f.message,
        phrase: f.excerpt,
        severity: f.severity === 'error' ? 'HIGH' : f.severity === 'warn' ? 'MEDIUM' : 'LOW',
      });
    }
  });

  const selectedElem = doc?.elements.find((e) => e.id === selectedElementId);
  if (!selectedElem || (!proposal && !loading && aiScore === null && allReasons.length === 0)) {
    return null;
  }

  const handleApply = () => {
    if (!proposal || !selectedElementId) return;

    if (proposal.action_type === 'update_text' && proposal.proposed_text) {
      updateElementText(selectedElementId, proposal.proposed_text);
      showToast('Corrección APA 7 aplicada al documento', 'success');
    } else if (proposal.action_type === 'set_type' && proposal.new_type) {
      updateElementType(selectedElementId, proposal.new_type as any, 1);
      showToast(`Formato cambiado a ${proposal.new_type}`, 'success');
    }

    setProposal(null);
  };

  const handleHumanize = async () => {
    if (!doc || !selectedElementId || !selectedElem?.text) return;
    setHumanizing(true);
    try {
      const apiKey = useDocStore.getState().apiKey;
      const res = await rewriteText(
        doc.session_id,
        selectedElementId,
        selectedElem.text,
        'Reescribe este párrafo eliminando muletillas de IA, frases cliché e informalismos. Usa voz impersonal formal propia de la investigación universitaria APA 7 ma edición.',
        apiKey
      );
      const newText = typeof res === 'string' ? res : (res as any)?.rewritten || res;
      if (newText) {
        updateElementText(selectedElementId, newText);
        showToast('Párrafo humanizado y elevado a tono APA 7', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Error al humanizar párrafo', 'error');
    } finally {
      setHumanizing(false);
    }
  };

  const getBadgeColor = (category?: string | null) => {
    if (category === 'HIGH') return 'var(--color-danger)';
    if (category === 'MEDIUM') return 'var(--color-warning)';
    return 'var(--color-success)';
  };

  return (
    <div
      style={{
        margin: '12px',
        padding: '14px',
        backgroundColor: 'var(--surface-elevated)',
        border: `1px solid ${aiCategory ? getBadgeColor(aiCategory) : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--accent-primary)', letterSpacing: '0.04em' }}>
          <Sparkles size={13} />
          <span>Diagnóstico Proactivo & IA</span>
        </div>
        {loading && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-secondary)' }} />}
      </div>

      {/* Badge de Porcentaje de IA si está disponible */}
      {aiScore !== null && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 10px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--surface-subtle)',
            border: `1px solid ${getBadgeColor(aiCategory)}33`,
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-main)' }}>
            Detección de IA en este párrafo:
          </span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 900,
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: getBadgeColor(aiCategory),
              color: 'var(--color-text-on-accent)',
            }}
          >
            {aiScore}% IA {aiCategory === 'HIGH' ? '(Alto)' : aiCategory === 'MEDIUM' ? '(Medio)' : '(Bajo)'}
          </span>
        </div>
      )}

      {/* Desglose explicativo: POR QUÉ fue marcado */}
      {allReasons.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Motivos detectados ("Por qué"):
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '120px', overflowY: 'auto' }}>
            {allReasons.map((reason, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '6px',
                  fontSize: '11px',
                  color: 'var(--text-main)',
                  backgroundColor: 'var(--surface-subtle)',
                  padding: '5px 8px',
                  borderRadius: 'var(--radius-xs)',
                  borderLeft: `2px solid ${reason.severity === 'HIGH' ? 'var(--color-danger)' : reason.severity === 'MEDIUM' ? 'var(--color-warning)' : 'var(--color-accent)'}`,
                }}
              >
                <AlertCircle size={12} color={reason.severity === 'HIGH' ? 'var(--color-danger)' : 'var(--color-warning)'} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ flex: 1 }}>
                  <span>{reason.detail}</span>
                  {reason.phrase && (
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: '2px' }}>
                      Coincidencia: "{reason.phrase}"
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Propuesta proactiva de 1 clic */}
      {proposal && (
        <>
          <div style={{ fontSize: '12px', color: 'var(--text-main)', lineHeight: 1.45 }}>
            {proposal.diagnosis}
          </div>

          <div
            style={{
              padding: '8px 10px',
              backgroundColor: 'var(--surface-subtle)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              fontStyle: 'italic',
              maxHeight: '80px',
              overflowY: 'auto',
            }}
          >
            "{proposal.proposed_text}"
          </div>

          <button
            type="button"
            onClick={handleApply}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--accent-primary)',
              color: 'var(--color-text-on-accent)',
              border: 'none',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <Check size={14} strokeWidth="var(--icon-stroke)" />
            <span>Aplicar sugerencia</span>
          </button>
        </>
      )}

      {/* Botón Humanizar / Elevar tono APA 7 en 1 clic */}
      {selectedElem.type === 'paragraph' && (
        <button
          type="button"
          onClick={handleHumanize}
          disabled={humanizing}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '7px 10px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-accent-soft)',
            color: 'var(--accent-primary)',
            border: '1px solid var(--color-accent-a40)',
            fontSize: '11px',
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
          title="Reescribe el párrafo eliminando muletillas de IA y elevando la redacción a voz impersonal APA 7"
        >
          {humanizing ? (
            <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            <Wand2 size={13} />
          )}
          <span>Humanizar & Elevar a APA 7 (1 Clic)</span>
        </button>
      )}
    </div>
  );
};
