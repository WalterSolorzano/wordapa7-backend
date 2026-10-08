/* WordAPA7 — ActionBar: herramientas IA proactivas del panel derecho.
   Reglas de diseño:
   - Sutil: fondo muy claro, bordes finos. El color fuerte solo aparece en
     hover o en los badges de alerta. No compite con el documento.
   - Estado de victoria: con 0 pendientes el botón NO desaparece; muestra un
     check verde sólido ("área conquistada").
   - La mascota habla de inmediato al iniciar "Revisar citas" (retroalimentación
     durante la espera del servidor). */

import React from 'react';
import { useDocStore } from '../../store/useDocStore';
import { ScanText, CheckCircle2, Loader2, Sparkles, Wand2 } from 'lucide-react';

const actionBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: '10px',
  width: '100%', textAlign: 'left',
  padding: '10px 12px',
  background: 'var(--surface-subtle)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-lg)',
  color: 'var(--text-main)',
  fontFamily: 'inherit', cursor: 'pointer',
  transition: 'border-color 0.15s ease, background 0.15s ease',
};

const pill: React.CSSProperties = {
  minWidth: '20px', height: '20px', borderRadius: '999px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: '11px', fontWeight: 700, padding: '0 6px', boxSizing: 'border-box',
  flexShrink: 0,
};

interface ActionItemProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  pending: number;
  loading: boolean;
  onClick: () => void;
}

const ActionItem: React.FC<ActionItemProps> = ({ icon, title, description, pending, loading, onClick }) => {
  const done = pending === 0 && !loading;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      style={{
        ...actionBtn,
        opacity: loading ? 0.7 : 1,
        cursor: loading ? 'wait' : 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(79,124,255,0.45)';
        e.currentTarget.style.background = 'rgba(79,124,255,0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-subtle)';
        e.currentTarget.style.background = 'var(--surface-subtle)';
      }}
    >
      <span style={{ flexShrink: 0, color: 'var(--text-secondary)', display: 'flex', marginTop: '1px' }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-main)' }}>{title}</span>
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: '2px' }}>
          {description}
        </span>
      </span>
      <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', marginLeft: '4px' }}>
        {loading ? (
          <Loader2 size={14} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />
        ) : done ? (
          <CheckCircle2 size={15} color="var(--color-success)" />
        ) : (
          <span style={{ ...pill, backgroundColor: 'rgba(250,173,20,0.16)', color: 'var(--color-warning)' }}>
            {pending}
          </span>
        )}
      </span>
    </button>
  );
};

export const ActionBar: React.FC = () => {
  const {
    doc, isReviewLoading, reviewResult, runAIReview, runCitationAudit,
    citationAuditResult, runLLMClassify, llmProgress, sayMascot, setForceRightPanelOpen,
    runQuickFix, isLoading, runStructureAudit,
  } = useDocStore();

  if (!doc) return null;

  const flagged = reviewResult?.flagged_count ?? 0;
  const spell = reviewResult?.spelling_count ?? 0;
  const aiPending = (flagged || spell) > 0 ? flagged + spell : (reviewResult ? 0 : 0);
  const ghosts = citationAuditResult?.ghost_citations?.length ?? 0;
  const orphans = citationAuditResult?.orphan_references?.length ?? 0;
  const citPending = ghosts + orphans;
  const llmBusy = llmProgress.status === 'processing';

  const handleReviewParagraphs = async () => {
    sayMascot('Analizando párrafos para encontrar texto generado y errores de ortografía…', 'info');
    setForceRightPanelOpen(true);
    await runAIReview().catch(() => {});
    const res = useDocStore.getState().reviewResult;
    const n = res ? (res.flagged_count || 0) + (res.spelling_count || 0) : 0;
    sayMascot(
      n > 0
        ? `Encontré ${n} párrafo${n === 1 ? '' : 's'} para revisar. Están marcados sobre el documento.`
        : 'Tu texto pasó la revisión: sin marcas de texto generado ni ortografía.',
      n > 0 ? 'warning' : 'success',
    );
  };

  const handleReviewCitations = async () => {
    sayMascot('Buscando referencias perdidas en el texto…', 'info');
    setForceRightPanelOpen(true);
    await runCitationAudit().catch(() => {});
    const res = useDocStore.getState().citationAuditResult;
    const g = res?.ghost_citations?.length ?? 0;
    const o = res?.orphan_references?.length ?? 0;
    const total = g + o;
    sayMascot(
      total > 0
        ? `Encontré ${total} coincidencia${total === 1 ? '' : 's'} pendiente. Vamos a resolverlas en Referencias.`
        : 'Todas las citas ya tienen su referencia en la bibliografía.',
      total > 0 ? 'warning' : 'success',
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Ruta "Arreglámelo" de un clic: aplica el 90% del formato solo */}
      <button
        type="button"
        onClick={async () => {
          sayMascot('Dejámelo a mí: aplico el formato y reviso las citas. Después solo decidís lo importante.', 'info');
          setForceRightPanelOpen(true);
          await runQuickFix().catch(() => {});
        }}
        disabled={isLoading}
        style={{
          display: 'flex', alignItems: 'center', gap: '9px', width: '100%', textAlign: 'left',
          padding: '11px 13px', cursor: isLoading ? 'wait' : 'pointer', fontFamily: 'inherit',
          background: 'var(--accent-primary)', border: 'none', borderRadius: 'var(--radius-lg)',
          color: '#fff', opacity: isLoading ? 0.7 : 1,
        }}
      >
        {isLoading ? (
          <Loader2 size={15} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
        ) : (
          <span style={{
            width: '24px', height: '24px', borderRadius: '8px', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.2)',
          }}>
            <Wand2 size={14} />
          </span>
        )}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '12px', fontWeight: 800 }}>Arreglámelo</span>
          <span style={{ display: 'block', fontSize: '10px', opacity: 0.85, lineHeight: 1.35, marginTop: '1px' }}>
            Aplica el formato automáticamente. Vos solo decidís lo que de verdad necesita tu criterio.
          </span>
        </span>
      </button>

      <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--text-muted)', padding: '0 2px', marginTop: '2px' }}>
        Herramientas
      </div>
      <ActionItem
        icon={<ScanText size={15} />}
        title="Auditar párrafos"
        description="IA revisa ortografía y frases de posible texto generado."
        pending={aiPending}
        loading={isReviewLoading}
        onClick={handleReviewParagraphs}
      />
      <ActionItem
        icon={<Sparkles size={15} />}
        title="Revisar citas"
        description="Busca citas sin referencia y referencias sin cita."
        pending={citPending}
        loading={false}
        onClick={handleReviewCitations}
      />
      <ActionItem
        icon={<Sparkles size={15} />}
        title="Auditar estructura"
        description="Validación global de headings, secciones y coherencia APA."
        pending={0}
        loading={false}
        onClick={async () => {
          sayMascot('Voy a revisar la estructura completa del documento...', 'info');
          setForceRightPanelOpen(true);
          await runStructureAudit().catch(() => {});
          const res = useDocStore.getState().structureAuditResult;
          if (res) {
            const issues = (res.heading_issues?.length || 0) + (res.reference_issues?.length || 0);
            sayMascot(
              issues > 0
                ? `Encontré ${issues} cosas por mejorar en la estructura del documento.`
                : 'La estructura del documento es sólida.',
              issues > 0 ? 'warning' : 'success',
            );
          }
        }}
      />
      <button
        type="button"
        onClick={() => runLLMClassify()}
        disabled={llmBusy}
        style={{
          alignSelf: 'flex-start',
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          border: 'none', background: 'transparent', cursor: llmBusy ? 'wait' : 'pointer',
          color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600,
          padding: '4px 6px', borderRadius: '6px', fontFamily: 'inherit',
        }}
        title="Refina la clasificación automática de los elementos con IA"
      >
        {llmBusy ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={11} />}
        {llmBusy ? 'Clasificando…' : 'Refinar clasificación IA'}
      </button>
    </div>
  );
};

export default ActionBar;
