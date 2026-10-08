/* WordAPA7 — APA Cover Editor (Corrección 3)
   The preview IS the editor: simple text fields (title, institution, course,
   instructor, date) are edited in-place by clicking directly on the text.
   The author list is rendered as separate lines and is highlighted/scrolled
   when the user clicks an author row in the right-side panel.
   This removes the mirror form + preview double-source-of-truth pattern.
*/

import React, { useState, useEffect, useCallback } from 'react';
import { useDocStore } from '../../store/useDocStore';
import {
  parseAuthorEntries,
  COVER_AUTHOR_HIGHLIGHT_EVENT,
  COVER_FIELD_HIGHLIGHT_EVENT,
} from '../../lib/portadaAuthors';

interface InlineFieldProps {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  ariaLabel?: string;
  /** El campo se DIBUJA pero no se edita. Lo usa la miniatura del carrusel:
   *  la portada se elige en el carrusel y se edita en el panel, así que la
   *  miniatura no puede traer campos dentro del control que la elige. */
  soloLectura?: boolean;
}

const InlineField: React.FC<InlineFieldProps> = ({
  value,
  onCommit,
  placeholder,
  style,
  inputStyle,
  ariaLabel,
  soloLectura = false,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const start = () => {
    setDraft(value);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (soloLectura) {
    return (
      <span
        aria-hidden="true"
        style={{
          display: 'block',
          cursor: 'default',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          fontStyle: 'inherit',
          textAlign: 'inherit',
          lineHeight: 'inherit',
          padding: 0,
          margin: 0,
          color: value ? 'var(--color-ink-strong)' : 'var(--color-ink-soft)',
          minHeight: '1em',
          width: '100%',
          borderBottom: value ? '1px dashed var(--color-accent-a40)' : '1px dashed var(--paper-line-strong)',
          ...style,
        }}
      >
        {value || placeholder}
      </span>
    );
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') cancel();
        }}
        aria-label={ariaLabel}
        style={{
          width: '100%',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          fontStyle: 'inherit',
          textAlign: 'inherit',
          background: 'transparent',
          border: '2px solid var(--accent-primary)',
          borderRadius: 'var(--radius-2xs)',
          outline: 'none',
          padding: '2px 4px',
          color: 'var(--color-ink-strong)',
          boxSizing: 'border-box',
          ...inputStyle,
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      title={placeholder ? `${placeholder} — clic para editar` : 'Clic para editar'}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'text',
        fontFamily: 'inherit',
        fontSize: 'inherit',
        fontWeight: 'inherit',
        fontStyle: 'inherit',
        textAlign: 'inherit',
        lineHeight: 'inherit',
        padding: 0,
        margin: 0,
        color: value ? 'var(--color-ink-strong)' : 'var(--color-ink-soft)',
        minHeight: '1em',
        width: '100%',
        borderBottom: value ? '1px dashed var(--color-accent-a40)' : '1px dashed var(--paper-line-strong)',
        ...style,
      }}
    >
      {value || placeholder}
    </button>
  );
};

export const APACoverEditor: React.FC<{ soloLectura?: boolean }> = ({ soloLectura = false }) => {
  const portada = useDocStore((s) => s.portada);
  const acta = useDocStore((s) => s.acta);
  const setPortada = useDocStore((s) => s.setPortada);
  const updateActaField = useDocStore((s) => s.updateActaField);
  const [highlightIdx, setHighlightIdx] = useState<number | null>(null);
  const [highlightField, setHighlightField] = useState<string | null>(null);

  const authors = parseAuthorEntries(acta.autor);
  const isProfessional = portada.apa_format === 'professional';

  const commitField = useCallback(
    (key: keyof typeof portada) => (value: string) => setPortada({ [key]: value } as any),
    [portada, setPortada]
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { index?: number };
      const idx = typeof detail?.index === 'number' ? detail.index : null;
      setHighlightIdx(idx);
      if (idx === null) return;
      const el = document.getElementById(`cover-author-${idx}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      window.setTimeout(() => setHighlightIdx(null), 2200);
    };
    window.addEventListener(COVER_AUTHOR_HIGHLIGHT_EVENT, handler);
    return () => window.removeEventListener(COVER_AUTHOR_HIGHLIGHT_EVENT, handler);
  }, []);

  // Highlight de campo (Título, Curso, Fecha, etc.): destello azul de 1s
  useEffect(() => {
    const handler = (e: Event) => {
      const field = (e as CustomEvent).detail?.field as string | undefined;
      if (!field) return;
      setHighlightField(field);
      const el = document.getElementById(`cover-field-${field}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => setHighlightField(null), 1200);
    };
    window.addEventListener(COVER_FIELD_HIGHLIGHT_EVENT, handler);
    return () => window.removeEventListener(COVER_FIELD_HIGHLIGHT_EVENT, handler);
  }, []);

  const fieldWrap = (field: string): React.CSSProperties => ({
    background: highlightField === field ? 'var(--color-accent-a20)' : 'transparent',
    boxShadow: highlightField === field ? '0 0 0 2px var(--accent-primary)' : 'none',
    borderRadius: 'var(--radius-xs)',
    transition: 'background 0.25s ease, box-shadow 0.25s ease',
  });

  const authorLineStyle: React.CSSProperties = {
    margin: '6px 0',
    fontSize: '12pt',
    lineHeight: 1.6,
    color: 'var(--color-ink-strong)',
    textAlign: 'center',
  };

  return (
    <div
      data-testid="portada-apa-sheet"
      data-solo-lectura={soloLectura ? 'true' : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '24px 48px',
        minHeight: '780px',
      }}
    >
      {isProfessional && (
        <div style={{ alignSelf: 'flex-start', fontSize: '10pt', fontWeight: 600, color: 'var(--color-ink-strong)', marginBottom: '8px' }}>
          {portada.running_head || 'RUNNING HEAD'}
        </div>
      )}

      <div style={{ maxWidth: '90%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
        {/* Título */}
        <div id={soloLectura ? undefined : 'cover-field-title'} style={{ ...fieldWrap('title'), width: '100%' }}>
          <InlineField
            value={portada.title}
            onCommit={commitField('title')}
            placeholder="Título del trabajo — clic para escribir"
            ariaLabel="Título del trabajo"
            soloLectura={soloLectura}
            style={{ fontSize: '16pt', fontWeight: 700, margin: '12px 0 24px' }}
            inputStyle={{ fontSize: '16pt', fontWeight: 700, textAlign: 'center' }}
          />
        </div>

        {/* Autores */}
        <div style={{ width: '100%', margin: '4px 0 20px' }}>
          {authors.length === 0 ? (
            <p style={{ ...authorLineStyle, color: 'var(--color-ink-soft)' }}>
              Agrega autores en el panel de Integrantes
            </p>
          ) : (
            authors.map((a, idx) => (
              <div
                key={idx}
                id={soloLectura ? undefined : `cover-author-${idx}`}
                style={{
                  ...authorLineStyle,
                  background:
                    highlightIdx === idx ? 'var(--color-accent-a20)' : 'transparent',
                  boxShadow: highlightIdx === idx ? '0 0 0 2px var(--accent-primary)' : 'none',
                  transition: 'background 0.2s ease, box-shadow 0.2s ease',
                }}
              >
                {a.nombre}
                {a.carnet ? <div style={{ fontSize: '11pt' }}>Carnet: {a.carnet}</div> : null}
              </div>
            ))
          )}
        </div>

        {/* Institución */}
        <div id={soloLectura ? undefined : 'cover-field-institution'} style={{ ...fieldWrap('institution'), width: '100%' }}>
          <InlineField
            value={portada.institution}
            onCommit={commitField('institution')}
            placeholder="Institución / Universidad"
            ariaLabel="Institución"
            soloLectura={soloLectura}
            style={{ fontSize: '12pt', margin: '4px 0' }}
            inputStyle={{ fontSize: '12pt', textAlign: 'center' }}
          />
        </div>

        {/* Curso */}
        <div id={soloLectura ? undefined : 'cover-field-course'} style={{ ...fieldWrap('course'), width: '100%' }}>
          <InlineField
            value={portada.course || ''}
            onCommit={commitField('course')}
            placeholder="Curso / Asignatura / Grupo"
            ariaLabel="Curso"
            soloLectura={soloLectura}
            style={{ fontSize: '12pt', margin: '4px 0' }}
            inputStyle={{ fontSize: '12pt', textAlign: 'center' }}
          />
        </div>

        {/* Docente / Tutor */}
        <div id={soloLectura ? undefined : 'cover-field-instructor'} style={{ ...fieldWrap('instructor'), width: '100%' }}>
          <InlineField
            value={acta.profesor_asesor[0] || ''}
            onCommit={(v) => updateActaField('profesor_asesor', v ? [v] : [])}
            placeholder="Docente / Tutor"
            ariaLabel="Docente"
            soloLectura={soloLectura}
            style={{ fontSize: '12pt', margin: '4px 0' }}
            inputStyle={{ fontSize: '12pt', textAlign: 'center' }}
          />
        </div>

        {/* Fecha y Lugar */}
        <div id={soloLectura ? undefined : 'cover-field-date'} style={{ ...fieldWrap('date'), width: '100%' }}>
          <InlineField
            value={portada.date || ''}
            onCommit={commitField('date')}
            placeholder="Fecha y lugar"
            ariaLabel="Fecha"
            soloLectura={soloLectura}
            style={{ fontSize: '12pt', margin: '4px 0 0' }}
            inputStyle={{ fontSize: '12pt', textAlign: 'center' }}
          />
        </div>
      </div>
    </div>
  );
};

export default APACoverEditor;
