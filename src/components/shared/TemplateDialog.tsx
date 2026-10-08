/* WordAPA7 — Template Selection Dialog */

import React, { useEffect, useState } from 'react';
import { X, FileText, BookOpen, Beaker, FileSignature, CheckCircle2, AlertCircle } from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';
import { fetchTemplates, applyTemplate, TemplateInfo } from '../../api/backend';

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  'Tesina / Monografía Académica': <BookOpen size={20} color="var(--accent-primary)" />,
  'Informe Técnico / Laboratorio': <Beaker size={20} color="var(--color-success)" />,
  'Artículo IMRyD (Investigación)': <FileSignature size={20} color="var(--color-info)" />,
  'Ensayo Académico': <FileText size={20} color="var(--color-warning)" />,
};

export const TemplateDialog: React.FC = () => {
  const {
    showTemplateDialog,
    setShowTemplateDialog,
    applyTemplate: storeApplyTemplate,
    availableTemplates,
    fetchTemplates: storeFetchTemplates,
    isLoading,
  } = useDocStore();

  const [applying, setApplying] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (showTemplateDialog && availableTemplates.length === 0) {
      storeFetchTemplates();
    }
  }, [showTemplateDialog, availableTemplates.length, storeFetchTemplates]);

  if (!showTemplateDialog) return null;

  const selected = availableTemplates.find((t) => t.name === selectedTemplate) || null;

  const handleApply = async (templateName: string) => {
    setApplying(templateName);
    setResult(null);
    try {
      await storeApplyTemplate(templateName);
      setResult({ success: true, message: `Plantilla "${templateName}" aplicada correctamente.` });
      setTimeout(() => {
        setShowTemplateDialog(false);
        setResult(null);
      }, 2000);
    } catch (err: any) {
      setResult({ success: false, message: err.message || 'Error al aplicar plantilla' });
    } finally {
      setApplying(null);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
    }}>
      <div style={{
        backgroundColor: 'var(--surface-elevated)',
        borderRadius: '16px',
        width: '520px',
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: '80vh',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-main)' }}>
              Aplicar Plantilla de Estructura
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Selecciona una plantilla para organizar la estructura del documento
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowTemplateDialog(false)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              color: 'var(--text-muted)',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Results notification */}
        {result && (
          <div style={{
            padding: '10px 24px',
            backgroundColor: result.success ? 'rgba(82,196,26,0.12)' : 'rgba(255,77,79,0.12)',
            borderBottom: `1px solid ${result.success ? 'rgba(82,196,26,0.35)' : 'rgba(255,77,79,0.35)'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            color: result.success ? 'var(--color-success)' : 'var(--color-danger)',
          }}>
            {result.success ? <CheckCircle2 size={16} color="var(--color-success)" /> : <AlertCircle size={16} color="var(--color-danger)" />}
            {result.message}
          </div>
        )}

        {/* Template list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {availableTemplates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '13px' }}>
              Cargando plantillas...
            </div>
          ) : (
            availableTemplates.map((template) => (
              <div
                key={template.name}
                onClick={() => setSelectedTemplate(template.name)}
                style={{
                  border: `1px solid ${selectedTemplate === template.name ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                  borderRadius: '10px',
                  padding: '16px',
                  marginBottom: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  backgroundColor: selectedTemplate === template.name ? 'var(--color-accent-soft)' : 'var(--surface-subtle)',
                  display: 'flex',
                  gap: '14px',
                  alignItems: 'flex-start',
                }}
                onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-primary)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 2px rgba(79,124,255,0.15)'; }}
                onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.borderColor = selectedTemplate === template.name ? 'var(--accent-primary)' : 'var(--border-subtle)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
              >
                <div style={{ flexShrink: 0, marginTop: '2px' }}>
                  {TEMPLATE_ICONS[template.name] || <FileText size={20} color="var(--text-muted)" />}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-main)', marginBottom: '4px' }}>
                    {template.name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    {template.description}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '12px', color: 'var(--text-secondary)' }}>
                      {template.section_count} secciones
                    </span>
                    {template.has_toc && (
                      <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: 'rgba(79,124,255,0.15)', borderRadius: '12px', color: 'var(--accent-primary)' }}>
                        Con índice
                      </span>
                    )}
                    {template.has_references && (
                      <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: 'rgba(6,214,160,0.12)', borderRadius: '12px', color: 'var(--accent-secondary)' }}>
                        Con referencias
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleApply(template.name); }}
                  disabled={applying === template.name}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: applying === template.name ? 'var(--text-muted)' : 'var(--accent-primary)',
                    color: applying === template.name ? 'var(--text-secondary)' : '#ffffff',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: applying === template.name ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {applying === template.name ? 'Aplicando...' : 'Aplicar'}
                </button>
              </div>
            ))
          )}

          {/* Detalle de la plantilla seleccionada: qué contiene y cómo usarla */}
          {selected && (
            <div style={{
              marginTop: '16px',
              padding: '14px 16px',
              border: '1px solid var(--border-subtle)',
              borderRadius: '10px',
              backgroundColor: 'var(--surface-subtle)',
            }}>
              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-main)', marginBottom: '6px' }}>
                Cómo usar "{selected.name}"
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '8px' }}>
                {selected.description}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--accent-primary)', lineHeight: 1.5 }}>
                Al aplicar, la estructura se inserta en tu documento; luego revisa los títulos en el paso Estructura.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 24px',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: '12px',
          color: 'var(--text-muted)',
          textAlign: 'center',
        }}>
          Las plantillas insertan secciones faltantes sin eliminar las existentes
        </div>
      </div>
    </div>
  );
};

export default TemplateDialog;
