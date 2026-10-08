/* WordAPA7 — Elección de estrategia de portada INTEGRADA (sin modal).
   Reemplaza CoverSetupDialog: una tarjeta inline en el editor de Portada que
   deja el documento (PaperCanvas) siempre visible. Se descarta con
   "Decidir después" (conserva la portada original). */

import React, { useState, useEffect } from 'react';
import { useDocStore } from '../../store/useDocStore';
import { ShieldCheck, FileText, Loader2, Check, AlertTriangle, ChevronDown, ChevronUp, University, X } from 'lucide-react';
import * as api from '../../api/backend';
import type { CoverTemplateInfo } from '../../api/backend';
import type { PortadaData } from '../../types';
import { Badge } from '../ui/wordapa7';

const thumbStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left',
  padding: '8px 10px', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontFamily: 'inherit',
  background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)',
  color: 'var(--text-main)', fontSize: '12px', transition: 'border-color 0.15s ease',
};

export const CoverStrategyCard: React.FC = () => {
  const { doc, portada, acta, setPortada, setCoverSetupDone } = useDocStore();

  const [templates, setTemplates] = useState<CoverTemplateInfo[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templatesError, setTemplatesError] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);

  const portadaDetected = Boolean(
    doc?.portada?.detected ||
    doc?.meta?.portada_detected ||
    (doc?.meta?.page_count_exact === true && doc?.elements?.some((e) => e.is_cover_section)),
  );

  useEffect(() => {
    if (!showTemplates) return;
    let cancelled = false;
    setLoadingTemplates(true);
    setTemplatesError(false);
    api.fetchCoverTemplates()
      .then((list) => { if (!cancelled) setTemplates(list); })
      .catch(() => { if (!cancelled) setTemplatesError(true); })
      .finally(() => { if (!cancelled) setLoadingTemplates(false); });
    return () => { cancelled = true; };
  }, [showTemplates]);

  const choose = (patch: Partial<PortadaData>) => {
    setPortada({ use_original_cover: false, force_skip_cover: false, ...patch });
    setCoverSetupDone(true);
  };

  const keepOriginal = () => {
    setPortada({ use_original_cover: true, force_skip_cover: false });
    setCoverSetupDone(true);
  };

  const handleSelectTemplate = async (t: CoverTemplateInfo) => {
    if (!doc) return;
    setApplying(t.name);
    try {
      const result = await api.applyCover({
        session_id: doc.session_id,
        cover_template_name: t.name,
        title: portada.title || '',
        /* El endpoint `apply-cover` todavia pide autor e instructor con estos
           nombres: son los campos del cover designer, que es otra cosa que el
           acta. Se los pasa del acta. */
        author: acta.autor || '',
        institution: portada.institution || '',
        course: portada.course || '',
        instructor: acta.profesor_asesor[0] || '',
        date: portada.date || '',
      });
      if (result.document) {
        useDocStore.getState().pushHistory(result.document);
        useDocStore.setState((s) => ({
          doc: result.document,
          portada: { ...s.portada, use_original_cover: false, force_skip_cover: true, cover_template_id: t.name },
        }));
      } else {
        setPortada({ use_original_cover: false, force_skip_cover: true, cover_template_id: t.name });
      }
      setCoverSetupDone(true);
    } catch (err: any) {
      useDocStore.getState().showToast(err.message || `Error al aplicar la portada "${t.name}"`, 'error');
    } finally {
      setApplying(null);
    }
  };

  const strategy = (label: string, hint: string, icon: React.ReactNode, onClick: () => void, badge?: string) => (
    <button type="button" onClick={onClick} style={thumbStyle} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-accent-a65)'; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'; }}>
      <span style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-md)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-accent-a20)', color: 'var(--accent-primary)' }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 700, fontSize: '12px' }}>{label}</span>
        <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' }}>{hint}</span>
      </span>
      {badge && <Badge tone="accent">{badge}</Badge>}
    </button>
  );

  return (
    <div style={{
      border: '1px solid var(--color-accent-a40)', borderRadius: 'var(--radius-lg)',
      backgroundColor: 'var(--color-accent-a05)', padding: '14px',
      display: 'flex', flexDirection: 'column', gap: '10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <Badge tone={portadaDetected ? 'accent' : 'warning'}>
          {portadaDetected ? 'Primera hoja detectada' : 'Sin portada detectada'}
        </Badge>
        <button
          type="button"
          onClick={keepOriginal}
          title="Cerrar y conservar la portada actual"
          aria-label="Cerrar"
          style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
        >
          <X size={13} />
        </button>
      </div>
      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>
        ¿Cómo tratamos la portada?
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        Elegí cómo usar la primera hoja. El documento queda visible a la derecha mientras decidís.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {strategy('Conservar portada actual', 'Mantengo la primera hoja intacta.', <ShieldCheck size={14} />, keepOriginal, portadaDetected ? 'Intacta' : undefined)}
        {strategy('Portada APA 7 del programa', 'Título, autores, institución, curso, docente y fecha.', <FileText size={14} />, () => choose({}), 'APA 7')}
        {strategy('Portada de mi universidad', 'Estructura institucional con integrantes y carnet.', <University size={14} />, () => choose({ cover_mode: 'generate_uni_cover' }), 'UNI')}

        <button
          type="button"
          onClick={() => setShowTemplates((s) => !s)}
          style={{ ...thumbStyle, borderColor: 'var(--border-subtle)' }}
        >
          <span style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-md)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-on-media-a05)', color: 'var(--text-secondary)' }}>
            {showTemplates ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
          <span style={{ flex: 1, fontWeight: 700, fontSize: '12px' }}>Usar una plantilla</span>
          <Badge tone="muted">Plantillas</Badge>
        </button>

        {showTemplates && loadingTemplates && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11px', color: 'var(--text-secondary)', padding: '6px 0' }}>
            <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Cargando plantillas…
          </div>
        )}
        {showTemplates && templatesError && (
          <div style={{ fontSize: '11px', color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 0' }}>
            <AlertTriangle size={12} /> No se pudieron cargar las plantillas.
            <button type="button" onClick={() => setShowTemplates(false)} style={{ border: 'none', background: 'transparent', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '11px' }}>Reintentar</button>
          </div>
        )}
        {showTemplates && !loadingTemplates && !templatesError && templates.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
            {templates.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => handleSelectTemplate(t)}
                disabled={applying !== null}
                style={{ ...thumbStyle, opacity: applying !== null && applying !== t.name ? 0.5 : 1, cursor: applying !== null ? 'default' : 'pointer' }}
              >
                <span style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-xs)', flexShrink: 0, overflow: 'hidden', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--color-text-on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {t.preview_path ? (
                    <img src={api.getCoverPreviewUrl(t.name) + '?t=' + Date.now()} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <span style={{ fontSize: '8px', color: 'var(--color-ink-soft)', textTransform: 'uppercase' }}>
                      {t.source_type === 'image' ? 'IMG' : t.source_type === 'docx' ? 'DOC' : 'APA'}
                    </span>
                  )}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: '11px', fontWeight: 600, lineHeight: 1.3 }}>{t.name}</span>
                {applying === t.name ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} color="var(--text-muted)" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={keepOriginal}
        style={{ alignSelf: 'flex-end', border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 6px' }}
      >
        Decidir después (conservar original)
      </button>
    </div>
  );
};

export default CoverStrategyCard;
