/* WordAPA7 — Sala de IA, detalle de una sección (IA-L1).
   Lista de párrafos agrupada por H2 + detalle. El "por qué" es dato REAL del
   detector (`findings[].detail`), no una frase genérica. Solo marcar. */
import React, { useMemo, useState } from 'react';
import { ArrowLeft, Copy, RefreshCw, AlertTriangle, FileText } from 'lucide-react';
import type { AIReviewParagraph } from '../../api/backend';
import { BANDAS_IA, bandaDe, type FilaPerfilIA, type IndiceBanda, type ParrafoPerfilIA } from '../../lib/aiPerfil';
import { fraseDeIA } from '../../lib/mascotaFrases';
import { MascotaFrase } from './MascotaFrase';

export interface AiSectionDetailProps {
  fila: FilaPerfilIA;
  paragraphs: readonly AIReviewParagraph[];
  onBack: () => void;
  onMark: (elementId: string) => void;
  /** Propone una reescritura editable. Lo cablea la Task 13; sin él, el botón
   *  no hace nada (no hay motor que inventar). */
  onReformular?: (texto: string) => Promise<string>;
}

const FILTROS: { id: 'todos' | IndiceBanda; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 2, label: 'Alto' },
  { id: 1, label: 'Medio' },
  { id: 0, label: 'Bajo' },
];

export const AiSectionDetail: React.FC<AiSectionDetailProps> = ({ fila, paragraphs, onBack, onMark, onReformular }) => {
  const [filtro, setFiltro] = useState<'todos' | IndiceBanda>('todos');
  const [abiertos, setAbiertos] = useState<string[]>([]);
  const [sel, setSel] = useState<string | null>(fila.parrafos[0]?.elementId ?? null);
  const [propuesta, setPropuesta] = useState('');

  const visibles = useMemo(
    () => fila.parrafos.filter((p) => filtro === 'todos' || bandaDe(p.score) === filtro),
    [fila.parrafos, filtro],
  );
  const grupos = useMemo(() => {
    const mapa = new Map<string, { titulo: string; parrafos: ParrafoPerfilIA[] }>();
    for (const p of visibles) {
      const key = p.h2Id ?? '__h1__';
      const g = mapa.get(key) ?? { titulo: p.h2Titulo ?? 'Sin subtítulo', parrafos: [] };
      g.parrafos.push(p);
      mapa.set(key, g);
    }
    return [...mapa.values()].sort((a, b) => Math.max(...b.parrafos.map((p) => p.score)) - Math.max(...a.parrafos.map((p) => p.score)));
  }, [visibles]);

  /* El panel derecho se resuelve SIEMPRE desde la banda activa: si la selección
     quedó fuera del filtro, cae al primer párrafo visible (índice 0). */
  const parrafo = (sel ? visibles.find((p) => p.elementId === sel) : undefined) ?? visibles[0] ?? null;
  /* El detalle se resuelve por IDENTIDAD, no por posición. `paragraphs` es la
     lista COMPACTA del backend (`python/main.py` salta títulos cortos, imágenes,
     tablas y párrafos de menos de 15 caracteres), mientras `parrafo.index` es el
     índice del elemento en `doc.elements`. `paragraphs[parrafo.index]` leía otro
     párrafo —o ninguno— casi siempre. El `index` queda solo como respaldo para un
     revisor que no haya traído `element_id`. */
  const detalle = parrafo
    ? paragraphs.find((p) => p.element_id === parrafo.elementId) ??
      paragraphs.find((p) => p.index === parrafo.index) ??
      null
    : null;
  const contar = (b: IndiceBanda) => fila.parrafos.filter((p) => bandaDe(p.score) === b).length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--color-bg-canvas)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button type="button" onClick={onBack} style={fantasma}><ArrowLeft size={14} aria-hidden /> Sala de IA</button>
          <div>
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{fila.titulo}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{fila.parrafos.length} párrafos · {fila.porBanda[2] + fila.porBanda[3]} marcados · riesgo medio {fila.rigidezMedia}%</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '340px minmax(0, 1fr)', minHeight: 0 }}>
        <div style={{ borderRight: '1px solid var(--color-border-subtle)', overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap', padding: 'var(--space-3) var(--space-4)' }}>
            {FILTROS.map((f) => (
              <button key={String(f.id)} type="button" onClick={() => setFiltro(f.id)} style={chipFiltro(filtro === f.id)}>
                {f.label}{f.id !== 'todos' ? ` · ${contar(f.id)}` : ` · ${fila.parrafos.length}`}
              </button>
            ))}
          </div>
          {grupos.map((g) => {
            const abierto = abiertos.length === 0 || abiertos.includes(g.titulo);
            return (
              <div key={g.titulo}>
                <button type="button" onClick={() => setAbiertos((prev) => (abierto ? prev.filter((t) => t !== g.titulo) : [...prev, g.titulo]))} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-4)', background: 'var(--color-bg-surface-alt)', border: 'none', borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--color-text-primary)' }}>
                  <span style={{ flex: 1, fontSize: 'var(--text-sm)', fontWeight: 650, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.titulo}</span>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-engine-ia)' }}>{g.parrafos.length}</span>
                </button>
                {abierto && g.parrafos.map((p) => (
                  <button key={p.elementId} type="button" onClick={() => { setSel(p.elementId); setPropuesta(''); }} style={{ display: 'flex', gap: 'var(--space-2)', width: '100%', textAlign: 'left', padding: 'var(--space-2) var(--space-4)', background: p.elementId === sel ? 'var(--color-accent-a05)' : 'transparent', border: 'none', borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' }}>
                    <span style={{ width: 4, borderRadius: 'var(--radius-full)', background: BANDAS_IA[bandaDe(p.score)].color, flexShrink: 0 }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Párrafo {p.index + 1}</span>
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-engine-ia)' }}>{p.score}%</span>
                      </span>
                      <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.excerpt}</span>
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        <div style={{ overflowY: 'auto', padding: 'var(--space-5)' }}>
          {parrafo && detalle ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-4)' }}>
                <div>
                  <div style={eyebrow}>Párrafo {parrafo.index + 1} · {parrafo.h2Titulo ?? fila.titulo}</div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>categoría <b style={{ color: 'var(--color-engine-ia)' }}>{parrafo.categoria}</b></div>
                </div>
                <MascotaFrase frase={fraseDeIA(parrafo.score, parrafo.elementId)} kind="reference" expression="curious" size={48} />
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 800, color: 'var(--color-engine-ia)', fontVariantNumeric: 'tabular-nums' }}>{parrafo.score}%</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>índice de IA</div>
                </div>
              </div>

              {/* Hallazgos / Por qué lo marcamos */}
              <section
                style={{
                  marginTop: 'var(--space-4)',
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--color-bg-surface-alt)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <AlertTriangle size={14} style={{ color: 'var(--color-engine-ia)' }} aria-hidden />
                    <span style={{ ...eyebrow, marginBottom: 0 }}>Por qué lo marcamos</span>
                  </div>
                  <span
                    style={{
                      fontSize: 'var(--text-xs)',
                      fontWeight: 700,
                      color: 'var(--color-engine-ia)',
                      background: 'var(--ia-nivel-1)',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                    }}
                  >
                    {detalle.findings.length} {detalle.findings.length === 1 ? 'indicador' : 'indicadores'}
                  </span>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {detalle.findings.map((f, i) => (
                    <li
                      key={`${f.phrase}-${i}`}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 'var(--space-2)',
                        fontSize: 'var(--text-sm)',
                        lineHeight: 1.45,
                        color: 'var(--color-text-primary)',
                        padding: 'var(--space-1) var(--space-2)',
                        background: 'var(--color-bg-surface)',
                        borderRadius: 'var(--radius-xs)',
                        border: '1px solid var(--color-border-subtle)',
                      }}
                    >
                      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 'var(--radius-full)', background: 'var(--color-engine-ia)', marginTop: 6, flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{f.detail}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Texto original en caja de lectura destacada */}
              <section
                style={{
                  marginTop: 'var(--space-4)',
                  padding: 'var(--space-4)',
                  background: 'var(--paper-white)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border-subtle)',
                  borderLeft: '4px solid var(--color-engine-ia)',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <FileText size={14} style={{ color: 'var(--color-text-secondary)' }} aria-hidden />
                    <span style={{ ...eyebrow, marginBottom: 0 }}>Texto original analizado</span>
                  </div>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                    Párrafo {parrafo.index + 1}
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 'var(--text-base)',
                    lineHeight: 1.75,
                    color: 'var(--paper-ink)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {marcarFrases(detalle.text, detalle.findings.map((f) => f.phrase))}
                </p>
              </section>

              <section style={{ marginTop: 'var(--space-5)' }}>
                <div style={eyebrow}>Cómo corregirlo · tu voz de autor</div>
                <textarea
                  value={propuesta}
                  onChange={(e) => setPropuesta(e.target.value)}
                  placeholder="Escribe tu reescritura, o pulsa «Reformular con IA» para una propuesta editable. Nada se aplica solo."
                  style={{ width: '100%', minHeight: 92, marginTop: 'var(--space-2)', fontFamily: 'inherit', fontSize: 'var(--text-sm)', lineHeight: 1.55, color: 'var(--color-text-primary)', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', resize: 'vertical', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    disabled={!onReformular}
                    onClick={async () => { if (onReformular) setPropuesta(await onReformular(detalle.text)); }}
                    style={{ ...fantasma, color: 'var(--color-accent)', borderColor: 'var(--color-accent)', opacity: onReformular ? 1 : 0.5 }}
                  ><RefreshCw size={13} aria-hidden /> Reformular con IA</button>
                  <button type="button" onClick={() => onMark(parrafo.elementId)} style={primario}>Marcar para revisar</button>
                  <button type="button" onClick={() => navigator.clipboard.writeText(propuesta || detalle.text)} style={fantasma}><Copy size={13} aria-hidden /> Copiar</button>
                </div>
              </section>
            </>
          ) : (
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>No hay párrafos con este filtro.</p>
          )}
        </div>
      </div>
    </div>
  );
};

/** Resalta las frases señaladas por el detector. */
function marcarFrases(texto: string, frases: string[]): React.ReactNode[] {
  const utiles = frases.filter((f) => f && texto.toLowerCase().includes(f.toLowerCase()));
  if (utiles.length === 0) return [texto];
  const patron = new RegExp(`(${utiles.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return texto.split(patron).map((parte, i) =>
    utiles.some((f) => f.toLowerCase() === parte.toLowerCase())
      ? <mark key={i} style={{ background: 'var(--ia-nivel-2)', borderBottom: '2px solid var(--color-engine-ia)', borderRadius: 'var(--radius-2xs)', padding: '0 1px' }}>{parte}</mark>
      : <React.Fragment key={i}>{parte}</React.Fragment>,
  );
}

const eyebrow: React.CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, marginBottom: 6 };
const primario: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-engine-ia)', color: 'var(--color-text-on-accent)', fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer' };
const fantasma: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' };
const chipFiltro = (on: boolean): React.CSSProperties => ({ fontSize: 'var(--text-xs)', fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--radius-full)', border: `1px solid ${on ? 'var(--color-engine-ia)' : 'var(--color-border-subtle)'}`, background: on ? 'var(--ia-nivel-1)' : 'transparent', color: on ? 'var(--color-engine-ia)' : 'var(--color-text-secondary)', cursor: 'pointer' });

export default AiSectionDetail;
