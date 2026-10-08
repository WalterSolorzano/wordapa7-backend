/* WordAPA7 — Modal para combinar retazos de documentos colaborativos */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';

export const MergeDocumentsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { tabs, activeTabIndex, tabDocs, mergeDocuments, showToast } = useDocStore();
  const currentTab = tabs[activeTabIndex];

  const otherTabs = tabs.filter((_, idx) => idx !== activeTabIndex);
  const [selectedSourceSession, setSelectedSourceSession] = useState<string>(
    otherTabs[0]?.session_id || ''
  );
  const [includeCover, setIncludeCover] = useState(false);
  const [includeBody, setIncludeBody] = useState(true);
  const [includeReferences, setIncludeReferences] = useState(true);

  if (!isOpen || !currentTab || otherTabs.length === 0) return null;

  const handleMerge = () => {
    const parts: ('cover' | 'body' | 'references')[] = [];
    if (includeCover) parts.push('cover');
    if (includeBody) parts.push('body');
    if (includeReferences) parts.push('references');

    if (parts.length === 0) {
      showToast('Selecciona al menos una sección para importar', 'warning');
      return;
    }

    mergeDocuments(currentTab.session_id, selectedSourceSession, parts);
    showToast('Retazos combinados con éxito en el documento activo', 'success');
    onClose();
  };

  const sourceDoc = tabDocs[selectedSourceSession];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'var(--color-ink-a55)',
        backdropFilter: 'blur(3px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '460px',
          backgroundColor: 'var(--color-bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-card)',
          padding: '22px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
              Combinar Retazos de Compañeros
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Absorber secciones de otra versión hacia tu documento activo
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '4px',
            }}
          >
            <X size={14} strokeWidth="var(--icon-stroke)" />
          </button>
        </div>

        {/* Origen de los datos */}
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
            Documento de Origen (Versión de tu compañero)
          </label>
          <select
            className="form-select"
            value={selectedSourceSession}
            onChange={(e) => setSelectedSourceSession(e.target.value)}
            style={{ fontSize: '12px', padding: '8px 10px' }}
          >
            {otherTabs.map((t) => (
              <option key={t.session_id} value={t.session_id}>
                {t.file_name} {t.version_label ? `(${t.version_label})` : ''}
              </option>
            ))}
          </select>
          {sourceDoc && (
            <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '4px', display: 'block' }}>
              Contiene {sourceDoc.elements?.length || 0} elementos y {sourceDoc.referencias?.length || 0} referencias.
            </span>
          )}
        </div>

        {/* Qué secciones transferir */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Secciones a Fusionar
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeCover}
              onChange={(e) => setIncludeCover(e.target.checked)}
            />
            <span>Portada (Reemplazar la portada actual por la de este archivo)</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeBody}
              onChange={(e) => setIncludeBody(e.target.checked)}
            />
            <span>Cuerpo / Capítulos (Anexar párrafos, tablas y figuras al final)</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeReferences}
              onChange={(e) => setIncludeReferences(e.target.checked)}
            />
            <span>Bibliografía (Unir y deduplicar referencias bibliográficas)</span>
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '7px 14px',
              fontSize: '12px',
              fontWeight: 600,
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleMerge}
            style={{
              padding: '7px 16px',
              fontSize: '12px',
              fontWeight: 600,
              background: 'var(--accent-primary)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-text-on-accent)',
              cursor: 'pointer',
            }}
          >
            Combinar en Documento Activo
          </button>
        </div>
      </div>
    </div>
  );
};
