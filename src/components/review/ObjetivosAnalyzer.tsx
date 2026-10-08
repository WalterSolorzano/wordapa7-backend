/* WordAPA7 — Analizador de objetivos (REV-L2). Único analizador propio: el nivel
   Bloom y la jerarquía general/específicos no se ven párrafo a párrafo.
   Fidelidad visual: `docs/superpowers/mockups/2026-10-05-revision-ia-dos-salas/
   ui-6-analizador-objetivos.html`. Son reglas OBJETIVAS (Bloom, medibilidad y
   jerarquía): ofrecen «Aplicar» y «Marcar para revisar». Nada se escribe solo:
   la persona elige el verbo, o el lote toma la primera alternativa. */
import React, { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { ElementModel } from '../../types';
import { objetivosBloom, reemplazarVerbo, type ObjetivoBloom } from '../../lib/contentReview';
import { resumenObjetivos } from '../../lib/revisionResumen';
import { fraseDeObjetivos } from '../../lib/mascotaFrases';
import { MascotaFrase } from './MascotaFrase';

export interface ObjetivosAnalyzerProps {
  elements: readonly ElementModel[];
  onApply: (elementId: string, texto: string) => void;
  /** Marca el objetivo para revisión humana. Opcional: sin él no se dibuja el
   *  botón fantasma «Marcar para revisar». */
  onMark?: (elementId: string) => void;
  onBack: () => void;
}

const NIVELES = ['Recordar', 'Comprender', 'Aplicar', 'Analizar', 'Evaluar', 'Crear'];
const NIVEL_EXIGIDO = 4;
/** Un objetivo exige un verbo medible y su variable. */
const cumpleNivel = (o: ObjetivoBloom): boolean =>
  o.nivelActual !== null && o.nivelActual >= NIVEL_EXIGIDO && !o.tieneDosVerbos && !o.sinVariable;
/** La fila ofrece reemplazo de verbo SOLO si el problema es del verbo. Un
 *  «no declara variable» no se arregla cambiando el verbo (ver Task 12 · R3). */
const aplicable = (o: ObjetivoBloom): boolean =>
  (o.nivelActual === null || o.nivelActual < NIVEL_EXIGIDO || o.tieneDosVerbos) && o.alternativas.length > 0;

const nombreNivel = (n: number | null): string => (n === null ? 'Sin nivel' : NIVELES[n - 1] ?? 'Sin nivel');
const verboInicial = (t: string): string => t.trim().match(/^[a-zA-ZáéíóúñÁÉÍÓÚÑ]+/)?.[0] ?? '';

/** Línea explicativa bajo el veredicto, derivada de los hallazgos REALES. */
function subObjetivos(objetivos: ObjetivoBloom[]): string {
  const fallas: string[] = [];
  for (const o of objetivos) {
    if (o.nivelActual === null) fallas.push(`«${o.verboActual}» no es un verbo medible`);
    else if (o.nivelActual < NIVEL_EXIGIDO) fallas.push(`«${o.verboActual}» arranca en nivel ${o.nivelActual}`);
    else if (o.tieneDosVerbos) fallas.push(`«${o.verboActual}» lleva dos verbos`);
    else if (o.sinVariable) fallas.push(`«${o.verboActual}» no declara variable`);
  }
  if (fallas.length === 0) return 'Todos los objetivos declaran un verbo medible y su variable.';
  const frase = fallas.slice(0, 2).join('; ');
  return `${frase.charAt(0).toUpperCase()}${frase.slice(1)}.`;
}

export const ObjetivosAnalyzer: React.FC<ObjetivosAnalyzerProps> = ({ elements, onApply, onMark, onBack }) => {
  const resumen = useMemo(() => resumenObjetivos(elements), [elements]);
  const objetivos = useMemo(() => objetivosBloom(elements), [elements]);
  /** Verbo elegido por fila. Se hoistea para que el lote respete la elección. */
  const [elegidos, setElegidos] = useState<Record<string, string>>({});
  const general = resumen.general;
  const especificos = resumen.especificos;
  const aplicables = useMemo(() => objetivos.filter(aplicable), [objetivos]);

  /** Estado real del panel: un panel limpio no pinta alarma ni pone cara triste. */
  const sinObjetivos = objetivos.length === 0;
  const todoOk = resumen.estado === 'todo_cumple';
  const mediblesOk = !sinObjetivos && resumen.medibles === objetivos.length;
  const variableOk = !sinObjetivos && resumen.conVariable === objetivos.length;
  const pastilla = todoOk
    ? { texto: 'Sin pendientes', estilo: pastillaOk }
    : sinObjetivos
      ? { texto: 'Sin objetivos', estilo: pastillaNeutra }
      : { texto: 'Requiere atención', estilo: pastillaAlerta };
  const expresion = todoOk ? 'happy' : sinObjetivos ? 'neutral' : 'worried';

  const elegir = (id: string, verbo: string) => setElegidos((s) => ({ ...s, [id]: verbo }));
  const verboDe = (o: ObjetivoBloom): string => elegidos[o.elementId] ?? o.alternativas[0];
  const aplicarTodas = () => {
    for (const o of aplicables) onApply(o.elementId, reemplazarVerbo(o.texto, verboDe(o)));
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg-canvas)' }}>
      <div style={{ maxWidth: '900px', margin: 'var(--space-5) auto', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <button type="button" onClick={onBack} style={fantasma}><ArrowLeft size={14} aria-hidden /> Sala de Revisión</button>
            <div>
              <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>Analizador de objetivos</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{general ? 1 : 0} general · {especificos.length} específicos · nivel Bloom, medibilidad y jerarquía</div>
            </div>
          </div>
          <button type="button" disabled={aplicables.length === 0} onClick={aplicarTodas} style={{ ...primario, opacity: aplicables.length === 0 ? 0.5 : 1 }}>Aceptar todas las propuestas</button>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 290px', gap: 'var(--space-5)', padding: 'var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center' }}>
          <div>
            <span style={pastilla.estilo}>{pastilla.texto}</span>
            <h3 style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-xl)', fontWeight: 750, color: 'var(--color-text-primary)' }}>{resumen.veredicto}</h3>
            <p style={sub}>{subObjetivos(objetivos)}</p>
            <div style={statsCard}>
              <Stat n={`${general?.nivelActual ?? '—'}/6`} k="nivel del general" primero />
              <Stat n={`${resumen.medibles}/${objetivos.length}`} k="medibles" tono={mediblesOk ? 'var(--color-success)' : 'var(--color-warning)'} />
              <Stat n={`${resumen.conVariable}`} k="con variable" tono={variableOk ? 'var(--color-success)' : 'var(--color-warning)'} />
            </div>
          </div>
          <MascotaFrase frase={fraseDeObjetivos(resumen.estado, general?.elementId ?? 'objetivos')} kind="ruler" expression={expresion} size={76} />
        </section>

        <section style={{ padding: 'var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <EscalaBloom objetivos={objetivos} />
          <p style={nota}>La línea azul punteada marca el nivel exigido (Analizar, nivel {NIVEL_EXIGIDO}).</p>
        </section>

        <section style={{ padding: 'var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div style={ancla}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
              <span style={{ ...eyebrow, color: 'var(--color-accent)' }}>Objetivo general</span>
              <span style={etiquetaAncla}>Ancla del análisis</span>
            </div>
            {general ? (
              <FilaObjetivo o={general} elegido={elegidos[general.elementId]} onElegir={(v) => elegir(general.elementId, v)} onApply={onApply} onMark={onMark} esAncla sinBorde />
            ) : (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>No se detectó un objetivo general.</p>
            )}
          </div>
        </section>

        <section style={{ padding: 'var(--space-5)' }}>
          <div style={{ paddingLeft: 'var(--space-4)', borderLeft: '2px dashed var(--color-accent-a30)' }}>
            <div style={{ ...eyebrow, color: 'var(--color-text-primary)' }}>Objetivos específicos · {especificos.length} <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--color-text-secondary)' }}>derivan del general · su nivel no debe superarlo</span></div>
            {especificos.map((o, i) => (
              <FilaObjetivo key={o.elementId} o={o} etiqueta={`E${i + 1}`} elegido={elegidos[o.elementId]} onElegir={(v) => elegir(o.elementId, v)} onApply={onApply} onMark={onMark} />
            ))}
          </div>
          <NotaJerarquia general={general} especificos={especificos} />
        </section>
      </div>
    </div>
  );
};

interface FilaProps {
  o: ObjetivoBloom;
  etiqueta?: string;
  elegido?: string;
  onElegir: (verbo: string) => void;
  onApply: (id: string, t: string) => void;
  onMark?: (id: string) => void;
  esAncla?: boolean;
  sinBorde?: boolean;
}

const FilaObjetivo: React.FC<FilaProps> = ({ o, etiqueta, elegido, onElegir, onApply, onMark, esAncla, sinBorde }) => {
  const problemaVerbal = o.nivelActual === null || o.nivelActual < NIVEL_EXIGIDO || o.tieneDosVerbos;
  const conPropuesta = aplicable(o);
  const verbo = verboInicial(o.texto);
  const resto = o.texto.slice(verbo.length);
  const medible = cumpleNivel(o);

  const tags: { ok: boolean; texto: string }[] = [
    { ok: o.nivelActual !== null, texto: o.nivelActual !== null ? `Nivel ${nombreNivel(o.nivelActual)} ${o.nivelActual}/6` : 'Sin nivel Bloom' },
    { ok: !o.sinVariable, texto: o.sinVariable ? 'No declara variable' : 'Declara variable' },
  ];
  if (o.nivelActual === null) tags.push({ ok: false, texto: 'Verbo vago' });
  else if (o.tieneDosVerbos) tags.push({ ok: false, texto: 'Dos verbos' });
  else if (medible) tags.push({ ok: true, texto: 'Medible' });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 250px', gap: 'var(--space-4)', padding: 'var(--space-3) 0', borderTop: sinBorde ? 'none' : '1px solid var(--color-border-subtle)' }}>
      <div style={{ fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--color-text-primary)' }}>
        {o.esGeneral ? null : <span style={enumBadge}>{etiqueta}</span>}
        {verbo ? (
          <span style={{ borderBottom: `2px solid ${esAncla ? 'var(--color-accent)' : o.nivelActual === null ? 'var(--color-danger)' : 'var(--color-warning)'}`, paddingBottom: 1 }}>{verbo}</span>
        ) : null}
        {resto}
        <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
          {tags.map((t) => <Tag key={t.texto} ok={t.ok} texto={t.texto} />)}
        </div>
      </div>
      <div style={{ borderLeft: '1px solid var(--color-border-subtle)', paddingLeft: 'var(--space-4)' }}>
        {conPropuesta ? (
          <>
            <span style={eyebrow}>{esAncla ? 'Propuesta' : `Propuesta (nivel ${nombreNivel(o.nivelPropuesto)} ${o.nivelPropuesto}/6)`}</span>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-success)', marginTop: 'var(--space-2)' }}>«{o.verboActual}» → «{o.verboPropuesto}»</div>
            <div style={alts}>
              {o.alternativas.map((alt) => (
                <button key={alt} type="button" onClick={() => onElegir(alt)} style={{ ...chip, color: elegido === alt ? 'var(--color-text-on-accent)' : 'var(--color-accent)', background: elegido === alt ? 'var(--color-accent)' : 'transparent' }}>{alt}</button>
              ))}
            </div>
            {o.sinVariable ? <p style={notaPropuesta}>No declara variable: reemplazar el verbo no lo resuelve.</p> : null}
            <div style={fixRow}>
              <button type="button" disabled={!elegido} onClick={() => elegido && onApply(o.elementId, reemplazarVerbo(o.texto, elegido))} style={{ ...primarioSm, opacity: elegido ? 1 : 0.5 }}>Aplicar</button>
              {onMark ? <button type="button" onClick={() => onMark(o.elementId)} style={fantasmaSm}>Marcar para revisar</button> : null}
            </div>
          </>
        ) : o.sinVariable ? (
          <>
            <span style={eyebrow}>Propuesta</span>
            <p style={notaPropuesta}>No declara variable: cambiá el verbo no alcanza, hace falta el objeto de estudio.</p>
            {onMark ? <div style={fixRow}><button type="button" onClick={() => onMark(o.elementId)} style={fantasmaSm}>Marcar para revisar</button></div> : null}
          </>
        ) : problemaVerbal || o.tieneDosVerbos ? (
          <>
            <span style={eyebrow}>{esAncla ? 'Estado' : 'Propuesta'}</span>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-success)', marginTop: 'var(--space-2)' }}>Verbo: «{o.verboActual}»</div>
            <div style={notaFix}>Revisá el verbo: no alcanza el nivel exigido.</div>
            {onMark ? <div style={fixRow}><button type="button" onClick={() => onMark(o.elementId)} style={fantasmaSm}>Marcar para revisar</button></div> : null}
          </>
        ) : (
          <>
            <span style={eyebrow}>{esAncla ? 'Estado' : 'Propuesta'}</span>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-success)', marginTop: 'var(--space-2)' }}>Verbo: «{o.verboActual}»</div>
            <div style={notaFix}>Cumple. Sin acciones.</div>
          </>
        )}
      </div>
    </div>
  );
};

const EscalaBloom: React.FC<{ objetivos: ObjetivoBloom[] }> = ({ objetivos }) => {
  let especificos = 0;
  return (
    <div>
      <div style={eyebrow}>Nivel cognitivo (Bloom) por objetivo</div>
      <div style={{ position: 'relative', height: 84, margin: 'var(--space-4) var(--space-4) 0' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 44, height: 2, background: 'var(--color-border-strong)' }} />
        <div style={{ position: 'absolute', top: 30, bottom: 52, left: `${((NIVEL_EXIGIDO - 1) / 5) * 100}%`, borderLeft: '2px dashed var(--color-accent)', opacity: 0.55 }} />
        {NIVELES.map((n, i) => (
          <React.Fragment key={n}>
            <span style={{ position: 'absolute', top: 44, left: `${(i / 5) * 100}%`, width: 1, height: 9, background: 'var(--color-border-strong)' }} />
            <span style={{ position: 'absolute', top: 56, left: `${(i / 5) * 100}%`, transform: 'translateX(-50%)', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{n}</span>
          </React.Fragment>
        ))}
        {objetivos.map((o) => {
          if (o.nivelActual === null) return null;
          if (!o.esGeneral) especificos += 1;
          const etiqueta = o.esGeneral ? 'General' : `E${especificos}`;
          const tinta = o.esGeneral ? 'var(--color-accent)' : 'var(--color-warning)';
          return (
            <span key={o.elementId} style={{ position: 'absolute', top: 44, left: `${((o.nivelActual - 1) / 5) * 100}%`, transform: 'translate(-50%,-50%)' }}>
              <span style={{ position: 'absolute', bottom: 15, left: '50%', transform: 'translateX(-50%)', fontSize: 'var(--text-xs)', fontWeight: 700, whiteSpace: 'nowrap', padding: '1px 6px', borderRadius: 'var(--radius-full)', background: 'var(--color-bg-surface-alt)', border: '1px solid var(--color-border-subtle)', color: tinta }}>{etiqueta}</span>
              <span style={{ display: 'block', width: o.esGeneral ? 14 : 10, height: o.esGeneral ? 14 : 10, borderRadius: 'var(--radius-full)', background: tinta, border: '2px solid var(--color-bg-surface)', boxShadow: '0 0 0 1.5px var(--color-border-strong)' }} />
            </span>
          );
        })}
      </div>
    </div>
  );
};

/** Solo se dibuja cuando hay general y al menos un específico: sin ancla no hay
 *  jerarquía que juzgar. Detalle por específico, tinte de acento (mockup). */
const NotaJerarquia: React.FC<{ general: ObjetivoBloom | null; especificos: ObjetivoBloom[] }> = ({ general, especificos }) => {
  if (!general || especificos.length === 0) return null;
  const nGen = general.nivelActual;
  const coherente = especificos.every((o) => nGen === null || o.nivelActual === null || o.nivelActual <= nGen);
  const detalle = especificos
    .map((o, i) => {
      const n = o.nivelActual;
      const cmp = n === null || nGen === null ? '?' : n <= nGen ? '≤' : '>';
      return `E${i + 1} ${nombreNivel(n)} ${cmp} ${nombreNivel(nGen)}`;
    })
    .join(', ');
  return (
    <div style={{ marginTop: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', background: 'var(--color-accent-a05)', border: '1px solid var(--color-accent-a30)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2) var(--space-3)' }}>
      <b>{coherente ? 'Jerarquía coherente:' : 'Revisá la jerarquía:'}</b>{' '}
      {coherente ? 'ningún específico apunta más alto que el ancla' : 'un específico apunta más alto que el ancla'} ({detalle}).
    </div>
  );
};

const Tag: React.FC<{ ok: boolean; texto: string }> = ({ ok, texto }) => (
  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, padding: '1px 6px', borderRadius: 'var(--radius-sm)', border: `1px solid ${ok ? 'var(--color-success-a14)' : 'var(--color-danger-a30)'}`, color: ok ? 'var(--color-success)' : 'var(--color-danger)' }}>{texto}</span>
);

const Stat: React.FC<{ n: string; k: string; tono?: string; primero?: boolean }> = ({ n, k, tono, primero }) => (
  <span style={{ display: 'block', padding: 'var(--space-3) var(--space-4)', textAlign: 'left', borderLeft: primero ? 'none' : '1px solid var(--color-border-subtle)' }}>
    <span style={{ display: 'block', fontSize: 'var(--text-xl)', fontWeight: 750, lineHeight: 1, color: tono ?? 'var(--color-accent)' }}>{n}</span>
    <span style={{ display: 'block', marginTop: 'var(--space-1)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{k}</span>
  </span>
);

const eyebrow: React.CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 };
const nota: React.CSSProperties = { margin: 'var(--space-3) 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' };
const sub: React.CSSProperties = { margin: 'var(--space-2) 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.45 };
const statsCard: React.CSSProperties = { display: 'flex', alignItems: 'stretch', marginTop: 'var(--space-4)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--color-bg-surface)', width: 'fit-content' };
const pastillaAlerta: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', padding: '2px 8px', borderRadius: 'var(--radius-full)', color: 'var(--color-warning)', background: 'var(--color-warning-a12)', border: '1px solid var(--color-warning-a30)' };
const pastillaOk: React.CSSProperties = { ...pastillaAlerta, color: 'var(--color-success)', background: 'var(--color-success-a14)', border: '1px solid var(--color-success)' };
const pastillaNeutra: React.CSSProperties = { ...pastillaAlerta, color: 'var(--color-text-secondary)', background: 'var(--color-bg-surface-alt)', border: '1px solid var(--color-border-subtle)' };
const ancla: React.CSSProperties = { border: '1px solid var(--color-accent-a30)', background: 'var(--color-accent-a05)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-3) var(--space-4)' };
const etiquetaAncla: React.CSSProperties = { fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-accent)', border: '1px solid var(--color-accent-a40)', borderRadius: 'var(--radius-full)', padding: '1px 8px' };
const enumBadge: React.CSSProperties = { display: 'inline-grid', placeItems: 'center', width: 20, height: 20, borderRadius: 'var(--radius-xs)', background: 'var(--color-bg-surface-alt)', border: '1px solid var(--color-border-strong)', fontSize: 'var(--text-xs)', fontWeight: 700, marginRight: 'var(--space-1)', verticalAlign: 'middle' };
const alts: React.CSSProperties = { display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap', margin: 'var(--space-2) 0' };
const chip: React.CSSProperties = { fontSize: 'var(--text-xs)', padding: '2px 9px', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-accent)', cursor: 'pointer' };
const fixRow: React.CSSProperties = { display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-2)' };
const notaFix: React.CSSProperties = { marginTop: 'var(--space-1)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' };
const notaPropuesta: React.CSSProperties = { margin: 'var(--space-1) 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-warning)' };
const primario: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: 'var(--color-text-on-accent)', fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer' };
const primarioSm: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: 'var(--color-text-on-accent)', fontSize: 'var(--text-xs)', fontWeight: 700, cursor: 'pointer' };
const fantasmaSm: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-primary)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' };
const fantasma: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' };

export default ObjetivosAnalyzer;
