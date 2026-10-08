/* WordAPA7 — Sala de Revisión, panorama (REV-L0). Solo navegación: aquí no se
   acepta nada. El % es SOLO revisión; el índice de IA no se mezcla.
   Fidelidad visual: `docs/superpowers/mockups/2026-10-05-revision-ia-dos-salas/
   ui-4-sala-rev-l0.html`. El puntaje de Objetivos se muestra honesto en Bloom
   1–6 (el «6,2 /10» del mockup es ilustrativo): no se inventa una escala /10. */
import React, { useMemo } from 'react';
import { ArrowLeft, Lock } from 'lucide-react';
import type { AuditItem, EngineId, Severity } from '../../lib/auditItems';
import { phaseLabel } from '../../lib/auditItems';
import type { ElementModel } from '../../types';
import type { ObjetivoBloom } from '../../lib/contentReview';
import { contarParrafos, cumplimiento } from '../../lib/informeRevision';
import { resumenMotores, calificacionPorFase, resumenObjetivos, FASES_GRAFICO } from '../../lib/revisionResumen';
import { fraseDeRevision, colorDeRevision, frasesRevision } from '../../lib/mascotaFrases';
import { MascotaFrase } from './MascotaFrase';
import { ENGINE_META } from '../../hooks/useReviewWorkbench';

/** Nivel Bloom que exige la rúbrica de tesis. Espejo del `NIVEL_OBJETIVO` de
 *  `contentReview`, que no se exporta. */
const NIVEL_EXIGIDO = 4;

/** El mockup muestra los niveles con coma decimal. */
const nivelDe = (calificacion: number): string => (calificacion / 10).toFixed(1).replace('.', ',');

import { extraerTituloPrincipal, analizarTitulo } from '../../lib/tituloAnalisis';

export interface RevisionRoomProps {
  items: AuditItem[];
  elements: readonly ElementModel[];
  onOpenDetail: (foco: { motor?: EngineId; phase?: string }) => void;
  onOpenObjetivos: () => void;
  onOpenTitulo: () => void;
  onBack: () => void;
}

export const RevisionRoom: React.FC<RevisionRoomProps> = ({ items, elements, onOpenDetail, onOpenObjetivos, onOpenTitulo, onBack }) => {
  const revision = useMemo(() => items.filter((it) => it.category !== 'ai'), [items]);
  const parrafos = useMemo(() => contarParrafos(elements), [elements]);
  const calificacion = cumplimiento(revision.length, parrafos);
  const motores = useMemo(() => resumenMotores(revision), [revision]);
  const fases = useMemo(() => calificacionPorFase(revision, elements), [revision, elements]);
  const objetivos = useMemo(() => resumenObjetivos(elements), [elements]);
  const tituloExtraido = useMemo(() => extraerTituloPrincipal(elements), [elements]);
  const analisisTitulo = useMemo(() => analizarTitulo(tituloExtraido.texto, tituloExtraido.elementoId), [tituloExtraido]);
  const porFase = useMemo(() => new Map(fases.map((f) => [f.phase, f])), [fases]);
  const objList = useMemo(
    () => (objetivos.general ? [objetivos.general, ...objetivos.especificos] : objetivos.especificos),
    [objetivos],
  );
  const peor = [...motores].sort((a, b) => b.count - a.count)[0];

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg-canvas)' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginTop: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', color: 'var(--color-text-primary)' }}>Sala de Revisión</h2>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>Motores objetivos · aceptar o aceptar todas, nunca borra tu texto</div>
          </div>
          <button type="button" onClick={onBack} style={fantasma}><ArrowLeft size={14} aria-hidden /> Volver</button>
        </div>

        <section style={{ padding: 'var(--space-3) var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            <Leyenda color={colorDeRevision(95)} texto={`90+ · «${frasesRevision.solida[0]}»`} />
            <Leyenda color={colorDeRevision(85)} texto={`80–89 · «${frasesRevision.buena[0]}»`} />
            <Leyenda color={colorDeRevision(70)} texto={`60–79 · «${frasesRevision.media[0]}»`} />
            <Leyenda color={colorDeRevision(50)} texto={`<60 · «${frasesRevision.baja[0]}»`} />
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 'var(--space-5)', padding: 'var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div>
            <div style={eyebrow}>Calificación de revisión</div>
            <div data-testid="rev-calificacion" style={{ fontSize: 'clamp(34px, 5vw, 48px)', fontWeight: 800, lineHeight: 1, color: colorDeRevision(calificacion), fontVariantNumeric: 'tabular-nums' }}>{calificacion}<span style={{ fontSize: 'var(--text-xl)', color: 'var(--color-text-tertiary)' }}>%</span></div>
            <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              {revision.length} de {parrafos} párrafos · 100 − 200·({revision.length}/{parrafos}) = {calificacion}. El índice de IA no se mezcla aquí.
            </div>
          </div>
          <MascotaFrase frase={peor ? `${fraseDeRevision(calificacion, 'rev')} Lo que más te baja: ${ENGINE_META[peor.motor].title}, ${peor.count} puntos.` : fraseDeRevision(calificacion, 'rev')} kind="highlighter" expression="worried" />
        </section>

        <section style={{ padding: 'var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div style={eyebrow}>Motores objetivos · {revision.length} por revisar</div>
          {motores.map((m) => (
            <button key={m.motor} type="button" onClick={() => onOpenDetail({ motor: m.motor })} style={{ display: 'grid', gridTemplateColumns: '200px minmax(0,1fr) 130px 24px', alignItems: 'center', gap: 'var(--space-4)', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderTop: '1px solid var(--color-border-subtle)', padding: 'var(--space-3) var(--space-1)', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                <span aria-hidden style={{ width: 26, height: 26, borderRadius: 'var(--radius-sm)', display: 'grid', placeItems: 'center', background: ENGINE_META[m.motor].color, color: 'var(--color-text-on-accent)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>{ENGINE_META[m.motor].title[0]}</span>
                {ENGINE_META[m.motor].title}
              </span>
              <Severidad porSeveridad={m.porSeveridad} total={m.count} />
              {/* Sin fase conocida no se imprime «0 secciones»: se omite el sufijo. */}
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}><b style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-primary)' }}>{m.count}</b>{m.secciones > 0 ? ` · ${m.secciones} secciones` : ''}</span>
              <span aria-hidden style={{ color: 'var(--color-text-tertiary)', textAlign: 'right' }}>›</span>
            </button>
          ))}
        </section>

        <section style={{ padding: 'var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div style={eyebrow}>Título de investigación · analizador APA 7</div>
          <div style={{ display: 'grid', gridTemplateColumns: '230px minmax(0,1fr)', gap: 'var(--space-5)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
            <div style={{ borderRight: '1px solid var(--color-border-subtle)', paddingRight: 'var(--space-4)' }}>
              <div style={{ fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 800, lineHeight: 1, color: analisisTitulo.puntaje >= 85 ? 'var(--color-success)' : analisisTitulo.puntaje >= 60 ? 'var(--color-warning)' : 'var(--color-danger)' }}>
                {analisisTitulo.puntaje}<small style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>%</small>
              </div>
              <span style={{ display: 'inline-block', marginTop: 'var(--space-2)', padding: '2px 8px', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface-alt)', color: 'var(--color-text-primary)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                {analisisTitulo.palabrasCount} palabras
              </span>
              <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                {analisisTitulo.criterios.filter((c) => c.cumple).length} de {analisisTitulo.criterios.length} criterios superados
              </div>
              <button type="button" onClick={onOpenTitulo} style={{ ...primario, marginTop: 'var(--space-4)' }}>
                Analizar título <span aria-hidden>›</span>
              </button>
            </div>
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', fontWeight: 700 }}>
                Texto detectado
              </div>
              <div style={{ marginTop: '4px', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'serif', background: 'var(--color-bg-surface-alt)', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-subtle)' }}>
                {analisisTitulo.titulo ? `“${analisisTitulo.titulo}”` : '(Sin título detectado)'}
              </div>
              <div style={{ marginTop: '6px', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                {analisisTitulo.veredicto}
              </div>
            </div>
          </div>
          <div style={lawNote}>El título se evalúa bajo APA 7: límite de palabras (≤15), mayúsculas iniciales, sin punto final y delimitación temática.</div>
        </section>

        <section style={{ padding: 'var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div style={eyebrow}>Objetivos · analizador propio (aparte)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '230px minmax(0,1fr)', gap: 'var(--space-5)', border: '1px solid var(--color-accent-a30)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
            <div style={{ borderRight: '1px solid var(--color-border-subtle)', paddingRight: 'var(--space-4)' }}>
              <div style={{ fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 800, lineHeight: 1, color: 'var(--color-warning)' }}>{objetivos.nivelGeneral ?? '—'}<small style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}> /6</small></div>
              <span style={{ display: 'inline-block', marginTop: 'var(--space-2)', padding: '2px 8px', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-accent-a30)', background: 'var(--color-accent-a12)', color: 'var(--color-accent)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>Bloom · nivel {NIVEL_EXIGIDO} exigido</span>
              <div style={{ marginTop: 'var(--space-3)' }}>
                <Severidad porSeveridad={OBJ_SEVERIDAD(objetivos.porEstado)} total={objetivos.total} />
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
                <Kpi n={`${objetivos.medibles}/${objetivos.total}`} k="medibles" />
                <Kpi n={`${objetivos.conVariable}/${objetivos.total}`} k="con variable" />
              </div>
              <button type="button" onClick={onOpenObjetivos} style={{ ...primario, marginTop: 'var(--space-4)' }}>Analizar objetivos <span aria-hidden>›</span></button>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={eyebrow}>Nivel cognitivo de cada objetivo (escala Bloom)</div>
              <BloomChart objetivos={objList} />
              <BloomLeyenda />
            </div>
          </div>
          <div style={lawNote}>Objetivos no se mezcla con las fases: tiene reglas de método propias (verbo Bloom, medibilidad, jerarquía general/específicos).</div>
        </section>

        <section style={{ padding: 'var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div style={eyebrow}>Fases del documento · calificación por fase (0–10)</div>
          <div style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4) var(--space-5) var(--space-3)', marginTop: 'var(--space-3)' }}>
            <div style={{ position: 'relative', height: 196, marginLeft: 28 }}>
              <div style={{ position: 'absolute', left: -28, top: 0, bottom: 24, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                {['10', '8', '6', '4', '2', '0'].map((n) => <span key={n}>{n}</span>)}
              </div>
              <div style={{ position: 'absolute', inset: '0 0 24px 0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                {[0, 1, 2, 3, 4, 5].map((i) => <i key={i} style={{ display: 'block', height: 1, background: 'var(--color-border-subtle)' }} />)}
              </div>
              <div style={{ position: 'absolute', inset: '0 0 24px 0', display: 'flex', alignItems: 'flex-end', gap: 'var(--space-3)' }}>
                {FASES_GRAFICO.map((phase) => {
                  const f = porFase.get(phase);
                  return (
                    <button key={phase} type="button" disabled={!f} onClick={() => { if (f) onOpenDetail({ phase }); }} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', background: 'transparent', border: 'none', padding: 0, cursor: f ? 'pointer' : 'default', color: 'inherit', fontFamily: 'inherit' }}>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, marginBottom: 4, fontVariantNumeric: 'tabular-nums', color: f ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>{f ? nivelDe(f.calificacion) : '—'}</span>
                      {f && <span style={{ width: '100%', maxWidth: 46, height: `${f.calificacion}%`, borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0', background: colorDeRevision(f.calificacion) }} />}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', margin: 'var(--space-1) 0 0 28px' }}>
              {FASES_GRAFICO.map((phase) => (
                <span key={phase} style={{ flex: 1, textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.2 }}>{phaseLabel(phase)}</span>
              ))}
            </div>
            <div style={leyendaFila}>
              <Leyenda color={colorDeRevision(95)} texto="9,0+ sólida" />
              <Leyenda color={colorDeRevision(85)} texto="8,0–8,9" />
              <Leyenda color={colorDeRevision(70)} texto="6,0–7,9" />
            </div>
            <div style={lawNote}>Calificación por fase = misma normalización por tamaño que la revisión, aplicada a los hallazgos de esa fase. Tocar una columna abre su revisión (menú general filtrado).</div>
          </div>
        </section>

        <section style={{ padding: 'var(--space-5)' }}>
          <div style={eyebrow}>Portada</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-4)', opacity: 0.72 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}><Lock size={13} aria-hidden /> Zona protegida · se mide, no se escribe · sin acciones</span>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>Bloqueada</span>
          </div>
        </section>
      </div>
    </div>
  );
};

/** La barra de severidad de Objetivos: verbo sin Bloom (danger), sin variable
 *  (warning) y medible (success) — reusa el mismo componente de los motores. */
const OBJ_SEVERIDAD = (porEstado: { noMedibles: number; sinVariable: number; cumplen: number }): Record<Severity, number> => ({
  critical: porEstado.noMedibles,
  high: porEstado.sinVariable,
  medium: porEstado.cumplen,
  low: 0,
});

const Severidad: React.FC<{ porSeveridad: Record<string, number>; total: number }> = ({ porSeveridad, total }) => {
  const orden: [string, string][] = [['critical', 'var(--color-danger)'], ['high', 'var(--color-warning)'], ['medium', 'var(--color-success)'], ['low', 'var(--color-text-tertiary)']];
  return (
    <span style={{ display: 'flex', height: 9, borderRadius: 'var(--radius-full)', overflow: 'hidden', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface-alt)' }}>
      {orden.map(([sev, color]) => (
        <i key={sev} style={{ width: `${((porSeveridad[sev] ?? 0) / (total || 1)) * 100}%`, background: color, display: 'block' }} />
      ))}
    </span>
  );
};

const POSICIONES_BLOOM = [
  { pct: 8.33, label: 'Recordar' },
  { pct: 25, label: 'Comprender' },
  { pct: 41.67, label: 'Aplicar' },
  { pct: 58.33, label: 'Analizar' },
  { pct: 75, label: 'Evaluar' },
  { pct: 91.67, label: 'Crear' },
];

const posNivel = (nivel: number): string => `${((nivel - 0.5) / 6) * 100}%`;

/** El color de un objetivo en el gráfico: el general es el ancla (accent), y un
 *  específico se tiñe por su defecto (verbo vago / sin variable / sano). */
const colorObjetivo = (o: ObjetivoBloom): string => {
  if (o.esGeneral) return 'var(--color-accent)';
  if (o.nivelActual === null) return 'var(--color-danger)';
  if (o.sinVariable) return 'var(--color-warning)';
  return 'var(--color-success)';
};

const BloomChart: React.FC<{ objetivos: ObjetivoBloom[] }> = ({ objetivos }) => {
  let especificos = 0;
  const marcas = objetivos.map((o) => {
    if (!o.esGeneral) especificos += 1;
    const etiqueta = o.esGeneral ? `General · ${o.verboActual.charAt(0).toUpperCase()}${o.verboActual.slice(1)}` : `E${especificos}`;
    return { o, etiqueta, color: colorObjetivo(o) };
  });
  return (
    <div style={{ position: 'relative', height: 128, margin: '1.6rem .5rem .2rem' }}>
      <span style={{ position: 'absolute', top: 6, bottom: 26, left: `${(NIVEL_EXIGIDO / 6) * 100}%`, right: 0, background: 'var(--color-accent-a08)', borderLeft: '1px dashed var(--color-accent-a65)', borderTopRightRadius: 'var(--radius-md)', borderBottomRightRadius: 'var(--radius-md)' }} />
      <span style={{ position: 'absolute', top: '-1.1rem', left: `${(NIVEL_EXIGIDO / 6) * 100}%`, paddingLeft: 8, fontSize: 'var(--text-xs)', color: 'var(--color-accent)', fontWeight: 600, whiteSpace: 'nowrap' }}>nivel exigido</span>
      <span style={{ position: 'absolute', left: 0, right: 0, bottom: 26, height: 2, background: 'var(--color-border-strong)' }} />
      {POSICIONES_BLOOM.map((t) => (
        <React.Fragment key={t.label}>
          <span style={{ position: 'absolute', bottom: 20, left: `${t.pct}%`, width: 1, height: 7, background: 'var(--color-border-strong)' }} />
          <span style={{ position: 'absolute', bottom: 2, left: `${t.pct}%`, transform: 'translateX(-50%)', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{t.label}</span>
        </React.Fragment>
      ))}
      {marcas.map(({ o, etiqueta, color }, i) => o.nivelActual === null ? null : (
        <React.Fragment key={i}>
          <span style={{ position: 'absolute', bottom: 26, left: posNivel(o.nivelActual), transform: 'translate(-50%, 50%)', width: o.esGeneral ? 22 : 15, height: o.esGeneral ? 22 : 15, borderRadius: 'var(--radius-full)', border: '2px solid var(--color-bg-surface)', boxShadow: '0 0 0 1px var(--color-border-strong)', background: color, display: 'block' }} />
          <span style={{ position: 'absolute', bottom: o.esGeneral ? 40 : 34, left: posNivel(o.nivelActual), transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: 'var(--text-xs)', fontWeight: 700, color }}>{etiqueta}</span>
        </React.Fragment>
      ))}
    </div>
  );
};

const BloomLeyenda: React.FC = () => (
  <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginTop: 'var(--space-1)' }}>
    <Leyenda color="var(--color-accent)" texto="General (ancla)" />
    <Leyenda color="var(--color-danger)" texto="E1 · verbo vago (no medible)" />
    <Leyenda color="var(--color-warning)" texto="E2 · no declara variable" />
  </div>
);

const Leyenda: React.FC<{ color: string; texto: string }> = ({ color, texto }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
    <span aria-hidden style={{ width: 10, height: 10, borderRadius: 'var(--radius-2xs)', background: color, flex: '0 0 auto' }} />
    <span>{texto}</span>
  </span>
);

const Kpi: React.FC<{ n: string; k: string }> = ({ n, k }) => (
  <span><span style={{ display: 'block', fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{n}</span><span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{k}</span></span>
);

const eyebrow: React.CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 };
const primario: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: 'var(--color-text-on-accent)', fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer' };
const fantasma: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' };
const leyendaFila: React.CSSProperties = { display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginTop: 'var(--space-3)' };
const lawNote: React.CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', border: '1px dashed var(--color-border-strong)', borderRadius: 'var(--radius-sm)' };

export default RevisionRoom;
