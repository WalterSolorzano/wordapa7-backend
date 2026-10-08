/* WordAPA7 — UI 0: la puerta de Fase 5.
   Un solo % combinado 70/30 (el ÚNICO lugar donde revisión e IA se juntan) y dos
   entradas sin cards. El % de IA sale de `construirPerfilIA`; el de revisión, de
   `cumplimiento(hallazgos, contarParrafos)`. Sin emojis; todo color por token. */
import React, { useMemo } from 'react';
import { CheckCircle2, Sparkles } from 'lucide-react';
import type { AuditItem } from '../../lib/auditItems';
import type { ElementModel } from '../../types';
import type { AIReviewParagraph } from '../../api/backend';
import { contarParrafos, cumplimiento } from '../../lib/informeRevision';
import { construirPerfilIA } from '../../lib/aiPerfil';
import { fraseDeRevision, colorDeRevision } from '../../lib/mascotaFrases';
import { HumanMascot } from '../layout/HumanMascot';

export interface ReviewGateProps {
  items: AuditItem[];
  elements: readonly ElementModel[];
  paragraphs: readonly AIReviewParagraph[];
  isScanning: boolean;
  onScan: () => void;
  onStartRevision: () => void;
  onOpenAiRoom: () => void;
}

export const ReviewGate: React.FC<ReviewGateProps> = ({
  items, elements, paragraphs, isScanning, onScan, onStartRevision, onOpenAiRoom,
}) => {
  const perfil = useMemo(() => construirPerfilIA(paragraphs, elements), [paragraphs, elements]);
  const parrafos = useMemo(() => contarParrafos(elements), [elements]);
  const revisionItems = useMemo(() => items.filter((it) => it.category !== 'ai'), [items]);
  const calificacion = cumplimiento(revisionItems.length, parrafos);
  const ia = perfil.vozHumana;
  const combinado = Math.round(0.7 * calificacion + 0.3 * ia);
  const motores = new Set(revisionItems.map((it) => it.category)).size;

  if (items.length === 0 && paragraphs.length === 0) {
    return (
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 'var(--space-8)' }}>
        <div style={{ textAlign: 'center', maxWidth: '42ch' }}>
          <CheckCircle2 size={32} color="var(--color-accent)" aria-hidden />
          <h2 style={{ margin: 'var(--space-3) 0 0', fontSize: 'var(--text-lg)', color: 'var(--color-text-primary)' }}>Aún no hay una revisión</h2>
          <p style={{ margin: 'var(--space-2) 0 var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            Ejecutá el escaneo para medir ortografía, estructura, citas y voz sintética.
          </p>
          <button type="button" onClick={onScan} disabled={isScanning} style={primario}>Analizar documento</button>
        </div>
      </div>
    );
  }

  const color = colorDeRevision(combinado);
  const voz = fraseDeRevision(combinado, 'gate');

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg-canvas)' }}>
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: 'clamp(20px, 4vw, 48px)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <header style={{ textAlign: 'center' }}>
          <div style={eyebrow}>Paso 5 · Revisión &amp; IA</div>
          <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            Revisión e IA se combinan solo aquí. Cada una tiene su propia sala.
          </p>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 'var(--space-6)', alignItems: 'center', paddingBottom: 'var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div>
            <div style={eyebrow}>Salud del documento</div>
            <div data-testid="gate-combinado" style={{ fontSize: 'clamp(38px, 6vw, 56px)', fontWeight: 800, lineHeight: 1, color, fontVariantNumeric: 'tabular-nums' }}>
              {combinado}<span style={{ fontSize: 'var(--text-xl)', color: 'var(--color-text-tertiary)' }}>%</span>
            </div>
            <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxWidth: '360px' }}>
              <Barra etiqueta="Revisión · 70%" valor={calificacion} color="var(--color-accent)" />
              <Barra etiqueta="IA · 30%" valor={ia} color="var(--color-engine-ia)" />
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>0,7 · {calificacion} + 0,3 · {ia} = {combinado}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
            <HumanMascot size={72} />
            <p
              role="note"
              style={{
                margin: 0,
                maxWidth: '28ch',
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-3) var(--space-4)',
                fontSize: 'var(--text-base)',
                fontWeight: 600,
                lineHeight: 1.35,
                color: 'var(--color-text-primary)',
                boxShadow: 'var(--shadow-sm, 0 2px 6px rgba(0,0,0,0.06))',
                wordBreak: 'break-word',
              }}
            >
              {voz}
            </p>
          </div>
        </section>

        <section aria-label="Entradas de revisión e IA" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <Entrada
            icono={<CheckCircle2 size={26} aria-hidden />} tono="var(--color-accent)" titulo="Empezar revisión"
            chips={[`${revisionItems.length} por revisar`, `${calificacion}% calificación`, `${motores} motores`]}
            onClick={onStartRevision}
          />
          <Entrada
            icono={<Sparkles size={26} aria-hidden />} tono="var(--color-engine-ia)" titulo="Ver mapa de IA"
            chips={[`${perfil.enAlerta} marcados`, `${perfil.vozHumana}% voz humana`, `${perfil.total} párrafos`]}
            onClick={onOpenAiRoom} disabled={perfil.enAlerta === 0}
            borde
          />
        </section>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button type="button" onClick={onScan} disabled={isScanning} style={fantasma}>Reanalizar documento</button>
        </div>
      </div>
    </div>
  );
};

const Barra: React.FC<{ etiqueta: string; valor: number; color: string }> = ({ etiqueta, valor, color }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 40px', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-xs)' }}>
    <span style={{ color: 'var(--color-text-secondary)' }}>{etiqueta}</span>
    <span style={{ height: 8, borderRadius: 'var(--radius-full)', background: 'var(--color-bg-surface-alt)', overflow: 'hidden' }}>
      <span style={{ display: 'block', height: '100%', width: `${valor}%`, background: color }} />
    </span>
    <span style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{valor}</span>
  </div>
);

const Entrada: React.FC<{
  icono: React.ReactNode; tono: string; titulo: string; chips: string[];
  onClick: () => void; disabled?: boolean; borde?: boolean;
}> = ({ icono, tono, titulo, chips, onClick, disabled, borde }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    style={{
      display: 'grid', gridTemplateColumns: '52px minmax(0, 1fr) auto', alignItems: 'center', gap: 'var(--space-4)',
      textAlign: 'left', background: 'transparent', border: 'none', color: 'inherit',
      padding: 'var(--space-4) var(--space-2)', cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1, fontFamily: 'inherit',
      borderLeft: borde ? '1px solid var(--color-border-subtle)' : 'none',
      paddingLeft: borde ? 'var(--space-5)' : 'var(--space-2)',
    }}
  >
    <span aria-hidden style={{ width: 52, height: 52, borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center', background: 'var(--color-bg-surface-alt)', color: tono }}>{icono}</span>
    <span>
      <span style={{ display: 'block', fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{titulo}</span>
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', marginTop: 'var(--space-2)' }}>
        {chips.map((c) => <span key={c} style={chip}>{c}</span>)}
      </span>
    </span>
    <span aria-hidden style={{ color: tono, fontSize: 'var(--text-xl)' }}>›</span>
  </button>
);

const eyebrow: React.CSSProperties = { fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--color-text-tertiary)' };
const chip: React.CSSProperties = { fontSize: 'var(--text-xs)', fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface-alt)', color: 'var(--color-text-secondary)' };
const primario: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: 'var(--color-text-on-accent)', fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer' };
const fantasma: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer' };

export default ReviewGate;
