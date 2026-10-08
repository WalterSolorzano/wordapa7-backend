/* WordAPA7 — Búsqueda rápida de referencia (Crossref, sin API key).
   Minimalista: aparece en el Túnel de Exportación cuando hay citas sin
   referencia, sin cambiar de pantalla. Cada acierto agrega la referencia y
   re-valida. Si no hay match, permite corregir o pegar manualmente. */

import React, { useEffect, useState } from 'react';
import { useDocStore } from '../../store/useDocStore';
import { Search, CheckCircle2, Loader2, Plus, AlertTriangle } from 'lucide-react';

/** El backend puede devolver la cita como string o como objeto (model_dump). */
function ghostText(g: unknown): string {
  if (g == null) return '';
  if (typeof g === 'string') return g;
  const o = g as any;
  return (
    o.raw_text ||
    o.formatted_apa ||
    [o.authors?.join?.(', '), o.year ? `(${o.year})` : '', o.title].filter(Boolean).join(' ').trim() ||
    o.citation ||
    ''
  );
}

function parseGhost(raw: string): { authors: string[]; year: string } {
  const text = String(raw || '');
  const yearM = text.match(/\b(19|20)\d{2}\b/);
  const year = yearM ? yearM[0] : '';
  const nameM = text.match(/[({]?\s*([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ'-]+)/);
  const authors = nameM ? [nameM[1]] : [];
  return { authors, year };
}

const inputStyle: React.CSSProperties = {
  flex: 1, minWidth: 0, border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)',
  padding: '5px 8px', fontSize: '12px', backgroundColor: 'var(--canvas-bg)',
  color: 'var(--text-main)', fontFamily: 'inherit', outline: 'none',
};

interface Message { tone: 'success' | 'warning' | 'error'; text: string; }

export const QuickReferenceSearch: React.FC<{ onDone?: () => void }> = ({ onDone }) => {
  const ghosts = useDocStore((s) => s.citationAuditResult?.ghost_citations || []);
  const resolveGhostCitation = useDocStore((s) => s.resolveGhostCitation);
  const addReference = useDocStore((s) => s.addReference);
  const runCitationAudit = useDocStore((s) => s.runCitationAudit);

  const [index, setIndex] = useState(0);
  const [author, setAuthor] = useState('');
  const [year, setYear] = useState('');
  const [loading, setLoading] = useState(false);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [message, setMessage] = useState<Message | null>(null);
  const [manual, setManual] = useState('');

  // Prellenar autor/año desde la cita fantasma activa
  useEffect(() => {
    const g = ghosts[index];
    if (g) {
      const parsed = parseGhost(ghostText(g));
      setAuthor(parsed.authors[0] || '');
      setYear(parsed.year);
      setMessage(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, ghosts.length]);

  // Cuando el audit se queda sin fantasmas, avisar al padre
  useEffect(() => {
    if (ghosts.length === 0 && resolvedCount > 0 && onDone) {
      onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghosts.length]);

  const handleSearch = async () => {
    const authors = author.split(/[;,]+/).map((s) => s.trim()).filter(Boolean);
    if (authors.length === 0 || !year) {
      setMessage({ tone: 'warning', text: 'Completá al menos el apellido del autor y el año.' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const r = await resolveGhostCitation(authors, year);
      if (r) {
        setResolvedCount((c) => c + 1);
        setMessage({ tone: 'success', text: 'Referencia encontrada y agregada a la bibliografía.' });
        const remaining = useDocStore.getState().citationAuditResult?.ghost_citations?.length || 0;
        if (remaining === 0) {
          setLoading(false);
          onDone?.();
          return;
        }
        setIndex((i) => Math.max(0, Math.min(i, remaining - 1)));
      } else {
        setMessage({ tone: 'warning', text: 'No se encontró en Crossref. Corregí autor/año o agregala manualmente.' });
      }
    } catch {
      setMessage({ tone: 'error', text: 'Error al buscar. Revisá tu conexión e intentá de nuevo.' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddManual = () => {
    if (!manual.trim()) return;
    addReference({
      id: `manual-${Date.now()}`,
      authors: ['Autor'],
      year: '2026',
      title: 'Título',
      source: 'Fuente',
      raw_text: manual.trim(),
      formatted_apa: manual.trim(),
    });
    setManual('');
    useDocStore.getState().showToast('Referencia agregada. Verificando citas…', 'info');
    runCitationAudit().catch(() => {});
  };

  const current = ghosts[index] != null ? ghostText(ghosts[index]) : '';

  return (
    <div style={{
      border: '1px solid var(--color-warning-a30)',
      backgroundColor: 'var(--color-warning-a05)',
      borderRadius: 'var(--radius-lg)',
      padding: '12px',
      display: 'flex', flexDirection: 'column', gap: '10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <AlertTriangle size={14} color="var(--color-warning)" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)' }}>
          {ghosts.length} cita{ghosts.length === 1 ? '' : 's'} sin referencia
        </span>
      </div>

      {ghosts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4, fontStyle: 'italic' }}>
            «{current.slice(0, 120)}{current.length > 120 ? '…' : ''}»
          </div>

          <select
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
            aria-label="Cita a resolver"
            style={{ ...inputStyle, flex: 'none', width: '100%', cursor: 'pointer' }}
          >
            {ghosts.map((g, i) => (
              <option key={i} value={i}>{ghostText(g).slice(0, 70)}</option>
            ))}
          </select>

          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Apellido del autor"
              style={inputStyle}
            />
            <input
              type="text"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="Año"
              style={{ ...inputStyle, width: '64px', flex: 'none' }}
            />
          </div>

          <button
            type="button"
            onClick={handleSearch}
            disabled={loading}
            className="btn btn-primary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', justifyContent: 'center' }}
          >
            {loading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={13} />}
            {loading ? 'Buscando…' : 'Buscar en Crossref'}
          </button>

          {resolvedCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--color-success)' }}>
              <CheckCircle2 size={13} /> {resolvedCount} resuelta{resolvedCount === 1 ? '' : 's'}
            </div>
          )}

          {message && (
            <div style={{ fontSize: '11px', lineHeight: 1.4, color: message.tone === 'success' ? 'var(--color-success)' : message.tone === 'error' ? 'var(--color-danger)' : 'var(--color-warning)' }}>
              {message.text}
            </div>
          )}

          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}>
            <input
              type="text"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="O pegá la referencia completa manualmente…"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={handleAddManual}
              disabled={!manual.trim()}
              title="Agregar como referencia"
              style={{
                flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px',
                border: '1px solid var(--border-subtle)', background: 'var(--surface-subtle)',
                color: 'var(--text-main)', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                borderRadius: 'var(--radius-xs)', padding: '5px 8px', fontFamily: 'inherit',
              }}
            >
              <Plus size={12} /> Agregar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickReferenceSearch;
