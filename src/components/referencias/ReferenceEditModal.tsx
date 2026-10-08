import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, BookOpen, Save } from 'lucide-react';
import type { ReferenciaModel } from '../../types';

export interface ReferenceEditModalProps {
  reference: ReferenciaModel | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: Partial<ReferenciaModel>) => void;
}

export function parseAuthors(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  if (trimmed.includes(';')) {
    return trimmed.split(';').map((s) => s.trim()).filter(Boolean);
  }
  const parts = trimmed.split(/,\s*(?=[A-Za-zÀ-ÿ]+,\s*[A-Za-zÀ-ÿ]\.?)/);
  if (parts.length > 1) {
    return parts.map((s) => s.trim()).filter(Boolean);
  }
  if (trimmed.includes(',') && !/[A-Za-zÀ-ÿ]\.\s*$/.test(trimmed) && !/,\s*[A-Za-zÀ-ÿ]\./.test(trimmed)) {
    return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [trimmed];
}

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  color: 'var(--color-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  fontSize: '13px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border-subtle)',
  backgroundColor: 'var(--color-bg-surface-alt)',
  color: 'var(--color-text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
};

export const ReferenceEditModal: React.FC<ReferenceEditModalProps> = ({
  reference,
  isOpen,
  onClose,
  onSave,
}) => {
  const initial = useMemo(() => ({
    authors: reference?.authors ? reference.authors.join(', ') : '',
    year: reference?.year || '',
    title: reference?.title || '',
    source: reference?.source || '',
    doi: reference?.doi_or_url || '',
    tipo: reference?.tipo || 'otro',
  }), [reference]);

  const [authors, setAuthors] = useState(initial.authors);
  const [year, setYear] = useState(initial.year);
  const [title, setTitle] = useState(initial.title);
  const [source, setSource] = useState(initial.source);
  const [doi, setDoi] = useState(initial.doi);
  const [tipo, setTipo] = useState<ReferenciaModel['tipo']>(initial.tipo);

  useEffect(() => {
    setAuthors(initial.authors);
    setYear(initial.year);
    setTitle(initial.title);
    setSource(initial.source);
    setDoi(initial.doi);
    setTipo(initial.tipo);
  }, [initial]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen || !reference) {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      authors: parseAuthors(authors),
      year: year.trim(),
      title: title.trim(),
      source: source.trim(),
      doi_or_url: doi.trim(),
      tipo,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-edit-ref-title"
      data-testid="reference-edit-modal"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--scrim-overlay)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          backgroundColor: 'var(--color-bg-surface)',
          color: 'var(--color-text-primary)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--color-border-subtle)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookOpen size={16} strokeWidth="var(--icon-stroke)" color="var(--color-accent)" aria-hidden="true" />
            <h2
              id="modal-edit-ref-title"
              style={{
                margin: 0,
                fontSize: '15px',
                fontWeight: 700,
                color: 'var(--color-text-primary)',
              }}
            >
              Editar Ficha Bibliográfica
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--color-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <X size={16} strokeWidth="var(--icon-stroke)" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor="modalEditAuthors" style={labelStyle}>
                Autores (Apellido, Iniciales)
              </label>
              <input
                id="modalEditAuthors"
                type="text"
                value={authors}
                onChange={(e) => setAuthors(e.target.value)}
                placeholder="Ej. Gómez, R., Morales, E."
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor="modalEditYear" style={labelStyle}>
                Año
              </label>
              <input
                id="modalEditYear"
                type="text"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="Ej. 2023"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label htmlFor="modalEditTitle" style={labelStyle}>
              Título del Trabajo / Artículo
            </label>
            <input
              id="modalEditTitle"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título completo de la obra"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor="modalEditSource" style={labelStyle}>
                Fuente / Revista / Editorial
              </label>
              <input
                id="modalEditSource"
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Nombre de la revista o editorial"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor="modalEditDoi" style={labelStyle}>
                DOI / Enlace Permanente
              </label>
              <input
                id="modalEditDoi"
                type="text"
                value={doi}
                onChange={(e) => setDoi(e.target.value)}
                placeholder="https://doi.org/..."
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label htmlFor="modalEditTipo" style={labelStyle}>
              Tipo de referencia
            </label>
            <select
              id="modalEditTipo"
              data-testid="modal-edit-tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as ReferenciaModel['tipo'])}
              style={inputStyle}
            >
              <option value="articulo">Artículo</option>
              <option value="libro">Libro</option>
              <option value="capitulo">Capítulo de libro</option>
              <option value="tesis">Tesis</option>
              <option value="web">Página web</option>
              <option value="informe">Informe</option>
              <option value="otro">Otro</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                backgroundColor: 'transparent',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border-subtle)',
                padding: '7px 14px',
                fontSize: '12.5px',
                fontWeight: 600,
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-text-on-accent)',
                border: 'none',
                padding: '7px 14px',
                fontSize: '12.5px',
                fontWeight: 600,
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Save size={14} strokeWidth="var(--icon-stroke)" aria-hidden="true" />
              <span>Guardar Cambios</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReferenceEditModal;
