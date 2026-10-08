/* WordAPA7 — Sala de Revisión, corrección (REV-L1). Texto delante, corrección al
   lado. La acción se deriva de `accionDeItem` y cada acción tiene su control:
   aceptar / aceptar todas (corrección objetiva por hallazgo), marcar para
   revisar (el motor detecta y la persona decide), resolver citas y rotular (los
   dos mecanismos de documento del motor objetivo) y «sin acción» para la
   portada, que se mide y no se escribe. La fase del foco se resuelve con
   `fasePorElemento`, la MISMA regla que cuenta la columna de REV-L0, para que el
   conteo de la columna y la lista del detalle no se contradigan. El subrayado
   inline lo pinta `ReadingText`, dueño único de los dos canales (AGENTS.md §2);
   aquí no se normaliza nada.
   Fidelidad visual: `docs/superpowers/mockups/2026-10-05-revision-ia-dos-salas/
   ui-5-sala-rev-l1.html`. */
import React, { useMemo, useState } from 'react';
import { ArrowLeft, Check, CheckCheck, Copy, Flag } from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';
import { useReviewWorkbench, accionDeItem, ENGINE_META, MASS_LABELS } from '../../hooks/useReviewWorkbench';
import { rotuloDeSubtipo } from '../../lib/rotulos';
import { phaseLabel, type AuditItem, type EngineId, type Severity } from '../../lib/auditItems';
import { fasePorElemento } from '../../lib/informeRevision';
import { ReadingText } from './ReadingText';
import { useMarkSourceBase, buildMarkSource } from '../../hooks/useMarkSource';
import { MascotaFrase } from './MascotaFrase';
import { fraseDeDetalleRevision } from '../../lib/mascotaFrases';

/** La píldora de severidad del mockup («severidad media»): tono por nivel. */
const SEVERIDAD_PILL: Record<Severity, { label: string; color: string; bg: string }> = {
  critical: { label: 'severidad crítica', color: 'var(--color-danger)', bg: 'var(--severity-critical-soft)' },
  high: { label: 'severidad alta', color: 'var(--color-danger)', bg: 'var(--severity-critical-soft)' },
  medium: { label: 'severidad media', color: 'var(--color-warning)', bg: 'var(--severity-warning-soft)' },
  low: { label: 'severidad baja', color: 'var(--color-text-tertiary)', bg: 'var(--color-bg-surface-alt)' },
};

export interface RevisionDetailProps {
  foco: { motor?: EngineId; phase?: string };
  onBack: () => void;
}

export const RevisionDetail: React.FC<RevisionDetailProps> = ({ foco, onBack }) => {
  const { items, acceptOne, acceptMany, markForReview, isApplying } = useReviewWorkbench();
  const base = useMarkSourceBase();
  const elements = useDocStore((s) => s.doc?.elements ?? []);
  const autoResolveGhosts = useDocStore((s) => s.autoResolveGhosts);
  const autoCaptionAll = useDocStore((s) => s.autoCaptionAll);
  const [sub, setSub] = useState<string | 'todas'>('todas');
  const [idx, setIdx] = useState(0);
  const [aceptados, setAceptados] = useState(0);

  /* La fase del foco se resuelve con la MISMA regla que `calificacionPorFase`
     (REV-L0): un hallazgo que trae su `phase` la conserva, y los de estructura y
     citas —que `collectAuditItems` emite con `phase: null`— se cuentan en la fase
     del H1 que los contiene. Filtrar por el `phase` crudo dejaba fuera de la
     columna abierta exactamente los hallazgos que la columna contaba. La IA no
     participa de las fases (spec D2): su detalle nunca aparece en un filtro de
     fase. */
  const faseDe = useMemo(() => fasePorElemento(elements, items), [elements, items]);
  const delFoco = useMemo(
    () =>
      items.filter((it) => {
        if (foco.motor && it.category !== foco.motor) return false;
        if (!foco.phase) return true;
        if (it.category === 'ai') return false;
        const fase = it.phase && it.phase !== 'global' ? it.phase : faseDe(it.element_id);
        return fase === foco.phase;
      }),
    [items, foco, faseDe],
  );
  const subtipos = useMemo(() => [...new Set(delFoco.map((it) => it.subtype))], [delFoco]);
  const visibles = sub === 'todas' ? delFoco : delFoco.filter((it) => it.subtype === sub);
  const pos = visibles.length ? Math.min(idx, visibles.length - 1) : 0;
  const actual = visibles[pos] ?? null;
  const accion = actual ? accionDeItem(actual) : 'none';
  const motor = foco.motor;
  /* El lote solo incluye lo que `accionDeItem` declara `accept`: un motor
     objetivo mezcla subtipos corregibles con subtipos que solo se marcan. */
  const aplicables = visibles.filter((it) => accionDeItem(it) === 'accept');
  const titulo = motor ? ENGINE_META[motor].title : foco.phase ? phaseLabel(foco.phase) : 'Revisión';
  /** Secciones = elementos distintos con hallazgo en el foco (mockup: «en M secciones»). */
  const secciones = useMemo(() => new Set(delFoco.map((it) => it.element_id).filter(Boolean)).size, [delFoco]);
  /* La lista de puntos se agrupa por subtipo y se lee como una lista con
     scroll: 125 botones numerados sueltos no eran legibles. Cada fila conserva
     su índice global (`i`) para que «punto X de Y» y los botones anterior /
     siguiente sigan apuntando a la MISMA posición. */
  const gruposPuntos = useMemo(
    () =>
      subtipos
        .filter((s) => visibles.some((it) => it.subtype === s))
        .map((s) => ({
          subtype: s,
          label: rotuloDeSubtipo(s),
          filas: visibles.map((it, i) => ({ it, i })).filter(({ it }) => it.subtype === s),
        })),
    [subtipos, visibles],
  );
  const elActual = actual ? elements.find((e) => e.id === actual.element_id) : undefined;
  const severidad = actual ? SEVERIDAD_PILL[actual.severity] : null;

  const frase = fraseDeDetalleRevision(pos, visibles.length, titulo, accion);

  const copiar = (texto: string) => {
    const clip = (navigator as Navigator & { clipboard?: Clipboard }).clipboard;
    void clip?.writeText(texto).catch(() => undefined);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--color-bg-canvas)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button type="button" onClick={onBack} style={fantasma}><ArrowLeft size={14} aria-hidden /> Menú general</button>
          <div>
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{titulo}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              {delFoco.length} {delFoco.length === 1 ? 'punto' : 'puntos'} en {secciones} {secciones === 1 ? 'sección' : 'secciones'}
              {motor ? ` · ${motor === 'ai' ? 'motor probabilístico' : 'motor objetivo'}` : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => { setSub('todas'); setIdx(0); }} style={chip(sub === 'todas')}>Todas · {delFoco.length}</button>
          {subtipos.map((s) => (
            <button key={s} type="button" onClick={() => { setSub(s); setIdx(0); }} style={chip(sub === s)}>{rotuloDeSubtipo(s)} · {delFoco.filter((it) => it.subtype === s).length}</button>
          ))}
        </div>
      </div>

      {actual ? (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', minHeight: 0 }}>
          <div style={{ overflowY: 'auto', padding: 'var(--space-5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-3)' }}>
              <span style={eyebrow}>{phaseLabel(actual.phase)} · {actual.pageNumber ? `página ${actual.pageNumber}` : 'sin página'}</span>
            </div>
            <p style={{ margin: 0, fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 'var(--text-lg)', lineHeight: 1.85, color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap' }}>
              <ReadingText text={actual.originalText || elActual?.text || ''} source={buildMarkSource(base, elActual)} />
            </p>
          </div>

          <div style={{ overflowY: 'auto', borderLeft: '1px solid var(--color-border-subtle)', padding: 'var(--space-4)', background: 'var(--color-bg-surface-alt)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {severidad && <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', padding: '2px 8px', borderRadius: 'var(--radius-full)', color: severidad.color, background: severidad.bg }}>{severidad.label}</span>}
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>punto {pos + 1} de {visibles.length}</span>
            </div>

            <div style={fixBlock}>
              <span style={eyebrow}>Qué pasa</span>
              <p style={{ margin: 0, fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>{actual.detail || actual.summary}</p>
            </div>

            {actual.suggestedText && (
              <div style={fixBlock}>
                <span style={eyebrow}>Propuesta</span>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', textDecoration: 'line-through' }}>{actual.originalText}</div>
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 650, color: 'var(--color-success)' }}>{actual.suggestedText}</div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {accion === 'accept' && (
                <>
                  <button type="button" disabled={isApplying} onClick={() => { setAceptados((n) => n + 1); void acceptOne(actual); }} style={exito}><Check size={13} aria-hidden /> Aceptar</button>
                  {aplicables.length > 0 && <button type="button" disabled={isApplying} onClick={() => { setAceptados((n) => n + aplicables.length); void acceptMany(aplicables); }} style={primario}><CheckCheck size={13} aria-hidden /> Aceptar todas ({aplicables.length})</button>}
                </>
              )}
              {accion === 'mark' && <button type="button" onClick={() => markForReview(actual)} style={primario}><Flag size={13} aria-hidden /> Marcar para revisar</button>}
              {accion === 'resolveGhosts' && (
                <button type="button" onClick={() => void autoResolveGhosts()} style={primario}><Flag size={13} aria-hidden /> {MASS_LABELS.resolveGhosts}</button>
              )}
              {accion === 'autoCaption' && (
                <button type="button" onClick={() => void autoCaptionAll()} style={primario}><Flag size={13} aria-hidden /> {MASS_LABELS.autoCaption}</button>
              )}
              {/* `none` sin `readOnly` no es la portada: es un hallazgo sin
                  corrección automática (referencia huérfana, jerarquía de
                  encabezado). Se ofrece marcarlo; el texto de «solo lectura»
                  queda reservado para la portada, que de verdad no se escribe. */}
              {accion === 'none' && (actual.readOnly
                ? <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>Solo lectura: la portada se mide, no se escribe.</span>
                : <button type="button" onClick={() => markForReview(actual)} style={primario}><Flag size={13} aria-hidden /> Marcar para revisar</button>)}
              {actual.suggestedText && <button type="button" onClick={() => copiar(actual.suggestedText!)} style={fantasma}><Copy size={13} aria-hidden /> Copiar</button>}
            </div>

            <div style={fixBlock}>
              <span style={eyebrow}>Puntos de este motor</span>
              <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {gruposPuntos.map((g) => (
                  <div key={g.subtype} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-secondary)' }}>{g.label} · {g.filas.length}</span>
                    {g.filas.map(({ it, i }) => (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => setIdx(i)}
                        aria-current={i === pos ? 'true' : undefined}
                        title={fragmento(it)}
                        style={filaPunto(i === pos, i < pos)}
                      >
                        <span aria-hidden style={{ width: 8, height: 8, borderRadius: 'var(--radius-full)', background: puntoSeveridad(it.severity), flex: '0 0 auto' }} />
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{fragmento(it)}</span>
                        <span style={{ flex: '0 0 auto', opacity: 0.7 }}>{i + 1}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 'auto' }}>
              <MascotaFrase frase={frase} kind="ruler" expression="neutral" size={44} />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--color-text-secondary)' }}>No hay hallazgos con este filtro.</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3) var(--space-5)', borderTop: '1px solid var(--color-border-subtle)' }}>
        <button type="button" disabled={idx === 0} onClick={() => setIdx((i) => Math.max(0, i - 1))} style={fantasma}>‹ Punto anterior</button>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{visibles.length ? pos + 1 : 0} de {visibles.length} · {aceptados} aceptado{aceptados === 1 ? '' : 's'}</span>
        <button type="button" disabled={pos >= visibles.length - 1} onClick={() => setIdx((i) => Math.min(visibles.length - 1, i + 1))} style={fantasma}>Punto siguiente ›</button>
      </div>
    </div>
  );
};

const eyebrow: React.CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 };
const fixBlock: React.CSSProperties = { border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', background: 'var(--color-bg-surface)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' };
const chip = (on: boolean): React.CSSProperties => ({ fontSize: 'var(--text-xs)', fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--radius-full)', border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`, background: on ? 'var(--color-accent-soft)' : 'transparent', color: on ? 'var(--color-accent)' : 'var(--color-text-secondary)', cursor: 'pointer' });
const primario: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: 'var(--color-text-on-accent)', fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer' };
const exito: React.CSSProperties = { ...primario, background: 'var(--color-success)' };
const fantasma: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' };
const filaPunto = (on: boolean, done: boolean): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: '100%', padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: `1px solid ${on ? 'var(--color-accent)' : done ? 'var(--color-success)' : 'var(--color-border-subtle)'}`, background: on ? 'var(--color-accent-soft)' : done ? 'var(--color-success-a12)' : 'transparent', color: on ? 'var(--color-accent)' : done ? 'var(--color-success)' : 'var(--color-text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' });
const puntoSeveridad = (sev: Severity): string => (sev === 'critical' || sev === 'high' ? 'var(--color-danger)' : sev === 'medium' ? 'var(--color-warning)' : 'var(--color-text-tertiary)');
/** Fragmento legible de una fila: el texto tocado, o el resumen si no hay. */
const fragmento = (it: AuditItem): string => {
  const t = (it.originalText || it.summary || '').replace(/\s+/g, ' ').trim();
  return t.length > 64 ? `${t.slice(0, 63)}…` : t || 'Sin texto';
};

export default RevisionDetail;
