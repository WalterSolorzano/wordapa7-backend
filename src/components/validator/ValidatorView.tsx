/* WordAPA7 — Validador de dos columnas (Corrección 8)
   Citas del texto (izquierda) vs. referencias (derecha).
   - Pares coincidentes se resaltan juntos al hover/seleccionar.
   - Citas sin referencia y referencias sin cita se marcan de inmediato.
   - Cada discrepancia tiene acción directa: "Ir al documento" / "Ir a la referencia". */

import React, { useEffect, useMemo, useState } from 'react';
import { useDocStore } from '../../store/useDocStore';
import { RefreshCw, CheckCircle2, AlertTriangle, Link2, Sparkles, Loader2, Copy } from 'lucide-react';
import { toKey, citationSurname, referenceText, refSurnameMatches } from '../../lib/citationMatcher';

export const ValidatorView: React.FC = () => {
  const { doc, validationIssues, runValidation, isLoading, references, setSelectedElementId, setWizardStep, setStructureTab, suggestCitationFix, apiKey } = useDocStore();
  const [hoveredCitation, setHoveredCitation] = useState<number | null>(null);
  const [hoveredReference, setHoveredReference] = useState<number | null>(null);
  // Estado por cita para corrección IA: { [citIndex]: { loading, result } }
  const [fixState, setFixState] = useState<Record<number, { loading: boolean; resolved?: boolean; result: { corrected: string; reason: string; action: string } | null }>>({});

  useEffect(() => {
    runValidation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const citations = useMemo(() => (doc?.citas_intext || []), [doc]);
  const refs = useMemo(() => references || [], [references]);

  const matches = useMemo(() => {
    // Para cada cita, la referencia que la cubre (primera coincidencia de apellido)
    const citToRef: Record<number, number> = {};
    const refUsed = new Set<number>();
    const ghost: number[] = [];
    citations.forEach((cit, ci) => {
      const surname = citationSurname(cit);
      const ri = refs.findIndex((r) => refSurnameMatches(r, surname));
      if (ri >= 0) {
        citToRef[ci] = ri;
        refUsed.add(ri);
      } else {
        ghost.push(ci);
      }
    });
    const orphan = refs.map((_, ri) => ri).filter((ri) => !refUsed.has(ri));
    return { citToRef, ghost, orphan };
  }, [citations, refs]);

  const goToCitation = (elementId?: string) => {
    if (!elementId) return;
    setSelectedElementId(elementId);
    // Paso 2 = Estructura; el cuerpo vive en la sub-pestaña 'body' del store.
    setWizardStep(2);
    setStructureTab('body');
  };

  const errorCount = validationIssues.filter((i) => i.severity === 'error').length;
  const warningCount = validationIssues.filter((i) => i.severity === 'warning').length;

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-5)' }}>
      {/* Header — solo acciones: el título ya lo pinta la barra del drawer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={async () => {
            try { await runValidation(); }
            catch (err: any) { useDocStore.getState().showToast(err.message || 'Error al validar documento', 'error'); }
          }}
          disabled={isLoading}
        >
          {isLoading ? <span className="loading-spinner loading-spinner-sm" /> : <RefreshCw size={14} />}
          Revalidar
        </button>
      </div>

      {/* Resumen */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '140px', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--color-bg-surface)' }}>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>{citations.length}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Citas en el texto</div>
        </div>
        <div style={{ flex: 1, minWidth: '140px', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--color-bg-surface)' }}>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>{refs.length}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Referencias</div>
        </div>
        <div style={{ flex: 1, minWidth: '140px', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,77,79,0.25)', backgroundColor: 'rgba(255,77,79,0.06)' }}>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-danger)' }}>{matches.ghost.length}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Citas sin referencia</div>
        </div>
        <div style={{ flex: 1, minWidth: '140px', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid color-mix(in srgb, var(--color-warning) 25%, transparent)', backgroundColor: 'color-mix(in srgb, var(--color-warning) 6%, transparent)' }}>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-warning)' }}>{matches.orphan.length}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Referencias sin cita</div>
        </div>
      </div>

      {/* Dos columnas con líneas conectoras SVG */}
      <div style={{ position: 'relative' }}>
        {/* SVG overlay para líneas conectoras entre pares coincidentes */}
        <svg style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          pointerEvents: 'none', zIndex: 1,
        }}>
          {citations.map((cit, ci) => {
            const ri = matches.citToRef[ci];
            if (ri === undefined || ri === null || ri < 0) return null;
            const isHovered = hoveredCitation === ci || hoveredReference === ri;
            return (
              <line
                key={`line-${ci}`}
                x1="100%" y1={`${(ci / Math.max(citations.length, 1)) * 100}%`}
                x2="0%" y2={`${(ri / Math.max(references.length, 1)) * 100}%`}
                stroke={isHovered ? 'var(--accent-primary)' : 'var(--color-text-tertiary)'}
                strokeWidth={isHovered ? 2 : 1}
                opacity={isHovered ? 1 : 0.25}
                style={{ transition: 'stroke 0.15s ease, opacity 0.15s ease' }}
              />
            );
          })}
        </svg>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', alignItems: 'start', position: 'relative', zIndex: 0 }}>
        {/* Columna izquierda: citas */}
        <div style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--color-bg-surface)', overflow: 'hidden' }}>
          <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-subtle)', fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
            Citas en el texto ({citations.length})
          </div>
          <div style={{ maxHeight: '460px', overflowY: 'auto' }}>
            {citations.length === 0 ? (
              <div style={{ padding: 'var(--space-5)', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
                No se detectaron citas en el texto.
              </div>
            ) : (
              citations.map((cit, ci) => {
                const ri = matches.citToRef[ci];
                const isGhost = ci === null || matches.ghost.includes(ci);
                const isHovered = hoveredCitation === ci || hoveredReference === ri;
                const fs = fixState[ci];
                const corrected = fs?.result?.corrected;
                return (
                  <div
                    key={ci}
                    onMouseEnter={() => setHoveredCitation(ci)}
                    onMouseLeave={() => setHoveredCitation(null)}
                    onClick={() => goToCitation(cit.element_id)}
                    title={cit.element_id ? 'Ir a esta cita en el documento' : undefined}
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      borderBottom: '1px solid var(--border-subtle)',
                      cursor: cit.element_id ? 'pointer' : 'default',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 'var(--space-2)',
                      backgroundColor: isHovered ? 'rgba(79,124,255,0.10)' : isGhost ? 'rgba(255,77,79,0.06)' : 'transparent',
                      transition: 'background-color var(--transition-fast)',
                    }}
                  >
                    {isGhost ? (
                      <AlertTriangle size={15} color="var(--color-danger)" style={{ flexShrink: 0, marginTop: '1px' }} />
                    ) : (
                      <CheckCircle2 size={15} color="var(--color-success)" style={{ flexShrink: 0, marginTop: '1px' }} />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', lineHeight: 1.5, fontStyle: 'italic' }}>
                        "{cit.raw_text || cit.authors?.join(', ')}"
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: isGhost ? 'var(--color-danger)' : 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>
                        {isGhost
                          ? 'Sin referencia en la lista'
                          : `Coincide con la referencia ${(ri ?? 0) + 1}`}
                      </div>

                      {/* Botón "Resolver" — buscar en Crossref (gratis, sin IA) */}
                      {isGhost && cit.authors?.length > 0 && cit.year && (
                        <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {!fs?.resolved ? (
                            <button
                              type="button"
                              onClick={async (ev) => {
                                ev.stopPropagation();
                                setFixState(s => ({ ...s, [ci]: { ...(s[ci] || {}), loading: true } }));
                                try {
                                  await useDocStore.getState().resolveGhostCitation(cit.authors, cit.year!);
                                  setFixState(s => ({ ...s, [ci]: { ...(s[ci] || {}), loading: false, resolved: true } }));
                                } catch {
                                  setFixState(s => ({ ...s, [ci]: { ...(s[ci] || {}), loading: false } }));
                                }
                              }}
                              disabled={fs?.loading}
                              style={{
                                fontSize: '11px', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer',
                                background: 'var(--color-success)', color: '#fff', border: 'none', fontWeight: 600,
                                opacity: fs?.loading ? 0.6 : 1,
                              }}
                            >
                              {fs?.loading ? '⏳ Buscando...' : 'Resolver'}
                            </button>
                          ) : (
                            <span style={{ fontSize: '10px', color: 'var(--color-success)', fontWeight: 600 }}>
                              Agregada a referencias
                            </span>
                          )}
                        </div>
                      )}

                      {/* Botón "Corregir con IA" (propuesta 6) */}
                      {(isGhost || (validationIssues || []).some(v => (v as any).citation_index === ci)) && (
                        <div style={{ marginTop: '6px' }}>
                          {!fs?.result && (
                            <button
                              type="button"
                              onClick={async (ev) => {
                                ev.stopPropagation();
                                setFixState(s => ({ ...s, [ci]: { loading: true, result: null } }));
                                const refId = ri !== undefined ? refs[ri]?.id : undefined;
                                const problem = isGhost ? 'No aparece en la lista de referencias' : 'Formato APA 7 incorrecto';
                                const res = await suggestCitationFix(cit.raw_text || cit.authors?.join(', ') || '', refId, problem);
                                setFixState(s => ({ ...s, [ci]: { loading: false, result: res } }));
                              }}
                              disabled={fs?.loading}
                              style={{
                                fontSize: '11px', padding: '3px 8px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit',
                                background: 'rgba(79,124,255,0.10)', border: '1px solid rgba(79,124,255,0.3)',
                                color: 'var(--accent-primary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px',
                              }}
                            >
                              {fs?.loading ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={11} />}
                              Corregir con IA
                              <style>{`@keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }`}</style>
                            </button>
                          )}
                          {fs?.result && (
                            <div style={{
                              marginTop: '4px', padding: '8px 10px', borderRadius: '6px',
                              background: 'color-mix(in srgb, var(--color-success) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-success) 25%, transparent)',
                            }}>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                                Sugerencia IA — {fs.result.reason}
                              </div>
                              <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', fontFamily: "'Times New Roman', serif", fontStyle: 'italic' }}>
                                {corrected || '(sin corrección propuesta)'}
                              </div>
                              <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                                <button
                                  type="button"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    if (corrected) {
                                      navigator.clipboard?.writeText(corrected);
                                      useDocStore.getState().showToast('Corrección copiada', 'success');
                                    }
                                  }}
                                  style={smallBtn}
                                >
                                  <Copy size={10} /> Copiar
                                </button>
                                <button
                                  type="button"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    setFixState(s => { const n = { ...s }; delete n[ci]; return n; });
                                  }}
                                  style={smallBtn}
                                >
                                  Descartar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Columna derecha: referencias */}
        <div style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--color-bg-surface)', overflow: 'hidden' }}>
          <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-subtle)', fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
            Referencias ({refs.length})
          </div>
          <div style={{ maxHeight: '460px', overflowY: 'auto' }}>
            {refs.length === 0 ? (
              <div style={{ padding: 'var(--space-5)', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
                Aún no hay referencias. Agrégales desde el paso Referencias.
              </div>
            ) : (
              refs.map((ref, ri) => {
                const isOrphan = matches.orphan.includes(ri);
                const isHovered = hoveredReference === ri || matches.ghost.some((ci) => matches.citToRef[ci] === ri);
                return (
                  <div
                    key={ref.id || ri}
                    onMouseEnter={() => setHoveredReference(ri)}
                    onMouseLeave={() => setHoveredReference(null)}
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      borderBottom: '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 'var(--space-2)',
                      backgroundColor: isHovered ? 'rgba(79,124,255,0.10)' : isOrphan ? 'color-mix(in srgb, var(--color-warning) 6%, transparent)' : 'transparent',
                      transition: 'background-color var(--transition-fast)',
                    }}
                  >
                    {isOrphan ? (
                      <AlertTriangle size={15} color="var(--color-warning)" style={{ flexShrink: 0, marginTop: '1px' }} />
                    ) : (
                      <CheckCircle2 size={15} color="var(--color-success)" style={{ flexShrink: 0, marginTop: '1px' }} />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', lineHeight: 1.5, fontFamily: "'Times New Roman', serif", paddingLeft: 'var(--space-6)', textIndent: 'calc(-1 * var(--space-6))' }}>
                        {referenceText(ref) || `[Referencia ${ri + 1}]`}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: isOrphan ? 'var(--color-warning)' : 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>
                        {isOrphan ? 'No citada en el texto' : `#${ri + 1}`}
                      </div>
                    </div>
                    <button
                      type="button"
                      title="Ir a la referencia (paso Referencias)"
                      onClick={() => setWizardStep(4)}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'var(--color-accent)', padding: 'var(--space-1)',
                        display: 'flex', alignItems: 'center', gap: '2px',
                        fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)',
                      }}
                    >
                      <Link2 size={13} /> Ir
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      </div>

      {/* Problemas de validación APA adicionales */}
      {validationIssues.length > 0 && (
        <div style={{ marginTop: 'var(--space-5)' }}>
          <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)', margin: '0 0 var(--space-3)' }}>
            Otras verificaciones APA ({errorCount} errores · {warningCount} advertencias)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {validationIssues.map((issue, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)',
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${
                    issue.severity === 'error' ? 'rgba(239, 68, 68, 0.4)'
                    : issue.severity === 'warning' ? 'rgba(245, 158, 11, 0.4)' : 'var(--border-subtle)'
                  }`,
                  backgroundColor: 'var(--color-bg-surface)',
                }}
              >
                {issue.severity === 'error' ? (
                  <AlertTriangle size={15} color="var(--color-danger)" style={{ flexShrink: 0, marginTop: '1px' }} />
                ) : issue.severity === 'warning' ? (
                  <AlertTriangle size={15} color="var(--color-warning)" style={{ flexShrink: 0, marginTop: '1px' }} />
                ) : (
                  <CheckCircle2 size={15} color="var(--color-success)" style={{ flexShrink: 0, marginTop: '1px' }} />
                )}
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', lineHeight: 1.4 }}>{issue.message}</div>
                  {issue.suggestion && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.4 }}>
                      {issue.suggestion}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const smallBtn: React.CSSProperties = {
  fontSize: '10px', padding: '3px 7px', borderRadius: '5px', cursor: 'pointer', fontFamily: 'inherit',
  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)',
  color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 600,
};

export default ValidatorView;
