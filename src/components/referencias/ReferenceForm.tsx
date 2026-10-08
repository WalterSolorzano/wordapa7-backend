/* WordAPA7 — Formulario contextual de referencia (panel derecho).
   Se abre al seleccionar una referencia en el lienzo A4 de la sección
   Referencias, o al resolver un DOI. Permite verificar/guardar los datos. */

import React, { useState } from 'react';
import { useDocStore } from '../../store/useDocStore';
import { Check, X, Trash2, Link2, BookOpen, Wand2 } from 'lucide-react';
import { formatearReferencia } from '../../lib/apaApi';

const inputStyle: React.CSSProperties = {
  width: '100%', fontSize: '12px', padding: '6px 8px', boxSizing: 'border-box',
  backgroundColor: 'var(--canvas-bg)', color: 'var(--color-text-primary)',
  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
  fontFamily: 'inherit', marginTop: '4px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.4px', color: 'var(--color-text-secondary)', display: 'block',
};

export const ReferenceForm: React.FC = () => {
  const { references, selectedReferenceId, updateReferences, removeReference, setSelectedReferenceId, showToast } = useDocStore();
  const ref = references.find((r) => r.id === selectedReferenceId);

  const [authors, setAuthors] = useState(() => (ref?.authors || []).join(', '));
  const [year, setYear] = useState(() => ref?.year || '');
  const [title, setTitle] = useState(() => ref?.title || '');
  const [source, setSource] = useState(() => ref?.source || '');
  const [doi, setDoi] = useState(() => ref?.doi_or_url || '');

  if (!ref) {
    return (
      <div style={{ padding: '16px 14px', fontSize: '12px', color: 'var(--color-text-tertiary)', textAlign: 'center', lineHeight: 1.6 }}>
        Seleccioná una referencia en el lienzo para ver y editar sus datos acá.
      </div>
    );
  }

  const save = async () => {
    const authorsArr = authors.split(/,|&|;/).map((a) => a.trim()).filter(Boolean);
    const titleTrim = title.trim();
    const sourceTrim = source.trim();
    const doiTrim = doi.trim();
    const formato = await formatearReferencia({
      authors: authorsArr, year: year.trim(), title: titleTrim, source: sourceTrim,
      doi_or_url: doiTrim || undefined, tipo: ref.tipo ?? 'otro',
    });
    const formatted = formato?.formatted_apa
      ?? [authors, `(${year}).`, title && `${title}.`, source].filter(Boolean).join(' ');
    updateReferences(references.map((r) => {
      if (r.id !== ref.id) return r;
      return {
        ...r,
        authors: authorsArr.length ? authorsArr : [authors || 'Autor'],
        year: year.trim(),
        title: titleTrim,
        source: sourceTrim,
        doi_or_url: doiTrim || undefined,
        formatted_apa: formatted,
        raw_text: formatted,
        apa_segments: formato?.apa_segments,
        tipo: formato?.tipo,
      };
    }));
    showToast('Referencia guardada', 'success');
  };

  const remove = () => {
    removeReference(ref.id);
    setSelectedReferenceId(null);
    showToast('Referencia eliminada', 'info');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '14px' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
          <BookOpen size={15} color="var(--color-accent)" />
          <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-text-primary)' }}>Detalles de referencia</span>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
          Verificá los datos extraídos y guardalos.
        </div>
      </div>

      <div>
        <label style={labelStyle}>Autor(es)</label>
        <input style={inputStyle} value={authors} onChange={(e) => setAuthors(e.target.value)} placeholder="García, A.; López, B." />
      </div>
      <div>
        <label style={labelStyle}>Año</label>
        <input style={inputStyle} value={year} onChange={(e) => setYear(e.target.value)} placeholder="2023" />
      </div>
      <div>
        <label style={labelStyle}>Título</label>
        <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título del trabajo" />
      </div>
      <div>
        <label style={labelStyle}>Fuente / editorial / revista</label>
        <input style={inputStyle} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Revista, vol(núm), pp." />
      </div>
      <div>
        <label style={labelStyle}>DOI / URL</label>
        <input style={inputStyle} value={doi} onChange={(e) => setDoi(e.target.value)} placeholder="https://doi.org/..." />
      </div>

      {/* Cita en texto (vista previa) */}
      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
        <label style={labelStyle}>Cita en el texto</label>
        <div style={{
          fontFamily: "'Times New Roman', serif", fontSize: '12px', lineHeight: 1.6,
          color: 'var(--color-text-primary)', marginTop: '4px', background: 'var(--canvas-bg)',
          border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '8px 10px',
        }}>
          {authorsArr(authors) && <>({authorsArr(authors)}, {year || 's.f.'})</>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
        <button type="button" onClick={save} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', fontSize: '12px' }}>
          <Check size={13} /> Guardar
        </button>
        <button type="button" onClick={remove} className="btn btn-ghost" style={{ color: 'var(--color-danger)' }} title="Eliminar referencia">
          <Trash2 size={13} />
        </button>
        <button type="button" onClick={() => setSelectedReferenceId(null)} className="btn btn-ghost" title="Cerrar">
          <X size={13} />
        </button>
      </div>

      {ref.doi_or_url && (
        <a href={ref.doi_or_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '11px', color: 'var(--color-accent)', textDecoration: 'none' }}>
          <Link2 size={11} /> {ref.doi_or_url}
        </a>
      )}
    </div>
  );
};

function authorsArr(s: string): string {
  const a = s.split(/,|&|;/).map((x) => x.trim()).filter(Boolean);
  return a.slice(0, 2).join(', ');
}

export default ReferenceForm;
