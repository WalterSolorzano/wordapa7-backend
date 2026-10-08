import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  FileText,
  ListTree,
  Image as ImageIcon,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowUpRight
} from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';

export const APAScoreCard: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const doc = useDocStore((s) => s.doc);
  const portada = useDocStore((s) => s.portada);
  /* El autor es del acta: sin este selector, la portada "completa" de abajo se
     evaluaria contra un campo que ya no existe. */
  const acta = useDocStore((s) => s.acta);
  const setSelectedElementId = useDocStore((s) => s.setSelectedElementId);
  const setScrollTargetId = useDocStore((s) => s.setScrollTargetId);
  const setWizardStep = useDocStore((s) => s.setWizardStep);

  const citationAudit = useDocStore((s) => s.citationAuditResult);
  const proofreadFindings = useDocStore((s) => s.proofreadFindings || []);
  const reviewResult = useDocStore((s) => s.reviewResult);
  const aiIndices = useDocStore((s) => s.aiIndices);

  const aiPercentage = useMemo(() => {
    if (aiIndices?.score !== undefined && aiIndices.score !== null) {
      return Math.round(aiIndices.score * 100);
    }
    if (reviewResult?.ai_avg_score !== undefined && reviewResult.ai_avg_score !== null) {
      return Math.round(reviewResult.ai_avg_score);
    }
    return null;
  }, [aiIndices, reviewResult]);

  const stats = useMemo(() => {
    if (!doc || !doc.elements) {
      return { score: 100, items: [], warnings: [] };
    }

    const elements = doc.elements;
    const headings = elements.filter((e) => e.type === 'heading');
    const figures = elements.filter((e) => e.type === 'image' && !e.is_cover_section);
    const tables = elements.filter((e) => e.type === 'table');
    const refs = doc.referencias || [];

    const uncaptionedFigures = figures.filter((f) => !f.image_info?.caption);
    const uncaptionedTables = tables.filter((t) => !t.table_info?.caption);
    const ghostCitations = citationAudit?.ghost_citations || [];

    const warnings: Array<{ id: string; label: string; penalty: number; elementId?: string; step: number }> = [];

    // 1. Portada
    const hasCover = portada.use_original_cover || (portada.title && acta.autor);
    if (!hasCover) {
      warnings.push({
        id: 'warn_cover',
        label: 'Portada incompleta (faltan título o autor)',
        penalty: 10,
        step: 1,
      });
    }

    // 2. Citas y Referencias
    if (refs.length === 0 && elements.length > 5) {
      warnings.push({
        id: 'warn_norefs',
        label: 'Sin lista de referencias bibliográficas',
        penalty: 15,
        step: 4,
      });
    }

    ghostCitations.slice(0, 4).forEach((g: any, idx: number) => {
      warnings.push({
        id: `warn_ghost_${idx}`,
        label: `Cita sin referencia: "${g.citation_text || g.author || 'cita'}"`,
        penalty: 5,
        step: 4,
      });
    });

    // 3. Tablas y figuras
    uncaptionedTables.forEach((t) => {
      warnings.push({
        id: `warn_tbl_${t.id}`,
        label: 'Tabla sin título en cursiva o nota APA 7',
        penalty: 5,
        elementId: t.id,
        step: 3,
      });
    });

    uncaptionedFigures.forEach((f) => {
      warnings.push({
        id: `warn_fig_${f.id}`,
        label: 'Figura sin rótulo ni pie de figura',
        penalty: 5,
        elementId: f.id,
        step: 3,
      });
    });

    // 4. Redacción / Estilo / IA
    const aiFlaggedCount = reviewResult?.flagged_count || 0;
    const spellingCount = reviewResult?.spelling_count || 0;
    if (proofreadFindings.length > 0 || aiFlaggedCount > 0 || spellingCount > 0) {
      const totalIssues = Math.max(proofreadFindings.length, aiFlaggedCount + spellingCount);
      warnings.push({
        id: 'warn_proofread',
        label: `${totalIssues} observación(es) de contenido IA, muletillas u ortografía`,
        penalty: Math.min(15, totalIssues * 2),
        step: 2,
      });
    }

    // Cálculo ponderado estricto
    const totalPenalty = warnings.reduce((acc, w) => acc + w.penalty, 0);
    const score = Math.max(25, 100 - totalPenalty);

    const items = [
      {
        title: 'Portada',
        status: hasCover ? 'ok' : 'warn',
        detail: portada.use_original_cover ? 'Original protegida' : hasCover ? 'Completada APA 7' : 'Faltan metadatos',
        icon: FileText,
        step: 1,
      },
      {
        title: 'Estructura & Títulos',
        status: headings.length > 0 ? 'ok' : 'warn',
        detail: `${headings.length} títulos detectados`,
        icon: ListTree,
        step: 2,
      },
      {
        title: 'Tablas & Figuras',
        status: uncaptionedFigures.length === 0 && uncaptionedTables.length === 0 ? 'ok' : 'warn',
        detail: `${tables.length} tablas (${uncaptionedTables.length} sin rotular) · ${figures.length} figuras (${uncaptionedFigures.length} sin rotular)`,
        icon: ImageIcon,
        step: 3,
      },
      {
        title: 'Citas & Referencias',
        status: ghostCitations.length === 0 && refs.length > 0 ? 'ok' : 'warn',
        detail: `${refs.length} referencias · ${ghostCitations.length} citas huérfanas`,
        icon: BookOpen,
        step: 4,
      },
      {
        title: 'Contenido IA & Redacción',
        status: (aiPercentage === null || aiPercentage < 25) && proofreadFindings.length === 0 ? 'ok' : 'warn',
        detail: aiPercentage !== null
          ? `${aiPercentage}% patrón IA global · ${reviewResult?.flagged_count || 0} párrafos señalados`
          : proofreadFindings.length > 0
            ? `${proofreadFindings.length} hallazgos de redacción/estilo`
            : 'Sin señales críticas de IA u ortografía',
        icon: Sparkles,
        step: 2,
      },
    ];

    return { score, items, warnings };
  }, [doc, portada, citationAudit, proofreadFindings, reviewResult, aiPercentage]);

  if (!doc) return null;

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'var(--color-success)';
    if (score >= 75) return 'var(--accent-primary, #4f7cff)';
    return 'var(--color-warning)';
  };

  const handleJumpToWarning = (elementId?: string, step: number = 2) => {
    setWizardStep(step);
    if (elementId) {
      setSelectedElementId(elementId);
      setScrollTargetId(elementId);
    }
    setIsOpen(false);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Botón Chip de Conformidad APA 7 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Diagnóstico de Conformidad APA 7"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: '999px',
          border: `1px solid ${getScoreColor(stats.score)}`,
          backgroundColor: 'var(--surface-elevated, #ffffff)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: '11px',
          fontWeight: 700,
          color: 'var(--text-main, #1a1a2e)',
          boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05))',
          transition: 'all 0.15s ease',
        }}
      >
        <ShieldCheck size={14} color={getScoreColor(stats.score)} />
        <span>APA 7: <strong style={{ color: getScoreColor(stats.score) }}>{stats.score}%</strong></span>
        {stats.warnings.length > 0 ? (
          <span
            style={{
              backgroundColor: 'var(--color-warning)',
              color: '#ffffff',
              borderRadius: '999px',
              padding: '1px 5px',
              fontSize: '9px',
              fontWeight: 800,
            }}
          >
            {stats.warnings.length}
          </span>
        ) : (
          <CheckCircle size={12} color="var(--color-success)" />
        )}
        {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {/* Popover / Tarjeta de Diagnóstico */}
      {isOpen && (
        <>
          <div
            onClick={() => setIsOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 90 }}
          />
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              width: '320px',
              backgroundColor: 'var(--surface-elevated, #ffffff)',
              border: '1px solid var(--border-subtle, #e5e7eb)',
              borderRadius: '12px',
              boxShadow: 'var(--shadow-card, 0 10px 25px rgba(0,0,0,0.15))',
              padding: '16px',
              zIndex: 100,
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {/* Encabezado del Diagnóstico */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle, #e5e7eb)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={16} color="var(--accent-primary, #4f7cff)" />
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main, #1a1a2e)' }}>Diagnóstico APA 7</span>
              </div>
              <span style={{ fontSize: '14px', fontWeight: 900, color: getScoreColor(stats.score) }}>
                {stats.score}%
              </span>
            </div>

            {/* Desglose de Secciones */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {stats.items.map((item, i) => {
                const Icon = item.icon;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleJumpToWarning(undefined, item.step)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '6px 8px',
                      borderRadius: '8px',
                      border: '1px solid transparent',
                      backgroundColor: 'var(--surface-subtle, #f9fafb)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      transition: 'background 0.12s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-accent-soft, #eef2ff)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-subtle, #f9fafb)')}
                  >
                    <Icon size={14} color="var(--accent-primary, #4f7cff)" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main, #1a1a2e)' }}>{item.title}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary, #6b7280)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.detail}
                      </div>
                    </div>
                    {item.status === 'ok' ? (
                      <CheckCircle size={13} color="var(--color-success)" style={{ flexShrink: 0 }} />
                    ) : (
                      <AlertTriangle size={13} color="var(--color-warning)" style={{ flexShrink: 0 }} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Lista de Advertencias con salto directo */}
            {stats.warnings.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border-subtle, #e5e7eb)', paddingTop: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-warning)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Avisos para revisión ({stats.warnings.length})
                </div>
                <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {stats.warnings.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => handleJumpToWarning(w.elementId, w.step)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '5px 8px',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--text-main, #1a1a2e)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-subtle, #f3f4f6)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, paddingRight: '6px' }}>
                        {w.label}
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-danger)', backgroundColor: 'var(--surface-subtle, #f3f4f6)', padding: '1px 5px', borderRadius: '4px', marginRight: '6px', flexShrink: 0 }}>
                        -{w.penalty}%
                      </span>
                      <ArrowUpRight size={12} color="var(--accent-primary, #4f7cff)" style={{ flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
