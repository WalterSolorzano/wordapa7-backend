/* WordAPA7 — Sala de IA, vista general (IA-L0). 100 % IA: el % de revisión no
   aparece acá. Una sola superficie con divisiones finas, sin cards anidadas. */
import React, { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { BANDAS_IA, bandaDe, type FilaPerfilIA, type PerfilIA } from '../../lib/aiPerfil';
import { fraseDeIA } from '../../lib/mascotaFrases';
import { MascotaFrase } from './MascotaFrase';

export interface AiDashboardProps {
  perfil: PerfilIA;
  onOpenSection: (h1Id: string) => void;
  onOpenPreview: () => void;
  onBack: () => void;
}

export const AiDashboard: React.FC<AiDashboardProps> = ({ perfil, onOpenSection, onOpenPreview, onBack }) => {
  const filas = useMemo(
    () => [...perfil.filas].filter((f) => f.parrafos.length > 0).sort((a, b) => b.rigidezMedia - a.rigidezMedia),
    [perfil.filas],
  );
  const peor = filas[0]?.h1Id;

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg-canvas)' }}>
      <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', maxWidth: '960px', margin: 'var(--space-5) auto', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', color: 'var(--color-text-primary)' }}>Sala de IA</h2>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>Detector probabilístico · solo marcar para revisar, nunca edita</div>
          </div>
          <button type="button" onClick={onBack} style={fantasma}><ArrowLeft size={14} aria-hidden /> Volver</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, .72fr)' }}>
          <div style={{ padding: 'var(--space-5)' }}>
            <div style={eyebrow}>Voz humana del documento</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', margin: 'var(--space-2) 0 var(--space-4)' }}>
              <span data-testid="ia-voz-humana" style={{ fontSize: 'clamp(30px, 5vw, 44px)', fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{perfil.vozHumana}%</span>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>riesgo medio de IA <b style={{ color: 'var(--color-engine-ia)' }}>{perfil.rigidezMedia}%</b></span>
            </div>
            <div style={eyebrow}>Reparto de párrafos por nivel</div>
            <div style={{ display: 'flex', height: 14, borderRadius: 'var(--radius-full)', overflow: 'hidden', border: '1px solid var(--color-border-subtle)', marginTop: 'var(--space-1)' }}>
              {perfil.porBanda.map((n, i) => (
                <span key={i} style={{ width: `${(n / (perfil.total || 1)) * 100}%`, background: BANDAS_IA[i].color }} title={`${BANDAS_IA[i].label}: ${n}`} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              {BANDAS_IA.map((b, i) => (
                <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <i style={{ width: 9, height: 9, borderRadius: 'var(--radius-2xs)', background: b.color, display: 'inline-block' }} />{b.label} · {perfil.porBanda[i]}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-5)', marginTop: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
              <Cifra n={perfil.total} k="párrafos" />
              <Cifra n={perfil.enAlerta} k="en alerta" tono="var(--color-engine-ia)" />
              <button type="button" onClick={onOpenPreview} style={{ ...primario, marginLeft: 'auto' }}>Ver en documento</button>
            </div>
          </div>
          <div style={{ padding: 'var(--space-5)', background: 'var(--color-accent-a05)', display: 'grid', placeItems: 'center' }}>
            <MascotaFrase
              frase={perfil.filaMasRigida
                ? `${fraseDeIA(perfil.filaMasRigida.rigidezMedia, perfil.filaMasRigida.h1Id)} El foco está en ${perfil.filaMasRigida.titulo}: ${perfil.filaMasRigida.rigidezMedia}% en ${perfil.filaMasRigida.parrafos.length} párrafos.`
                : fraseDeIA(perfil.rigidezMedia, 'ia')}
              kind="reference" expression="curious"
            />
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--color-border-subtle)', padding: 'var(--space-4) var(--space-5) var(--space-1)' }}>
          <div style={eyebrow}>Riesgo por sección (H1) · toca una fila para entrar a su detalle</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,1.25fr) 130px minmax(120px,1.9fr) 56px', gap: 'var(--space-4)', padding: 'var(--space-2) var(--space-5)', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
          <div>Sección</div><div>Reparto</div><div>Promedio</div><div style={{ textAlign: 'right' }}>IA</div>
        </div>
        {filas.map((fila: FilaPerfilIA) => (
          <button
            key={fila.h1Id}
            type="button"
            onClick={() => onOpenSection(fila.h1Id)}
            style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,1.25fr) 130px minmax(120px,1.9fr) 56px', gap: 'var(--space-4)', alignItems: 'center', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderTop: '1px solid var(--color-border-subtle)', padding: 'var(--space-2) var(--space-5)', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' }}
          >
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fila.titulo}
              {fila.h1Id === peor && <span style={foco}>FOCO</span>}
              <small style={{ display: 'block', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>{fila.parrafos.length} párrafos · {fila.porBanda[2] + fila.porBanda[3]} en alerta</small>
            </span>
            <span style={{ display: 'flex', height: 12, borderRadius: 'var(--radius-full)', overflow: 'hidden', border: '1px solid var(--color-border-subtle)' }}>
              {fila.porBanda.map((n, i) => (
                <span key={i} style={{ width: `${(n / (fila.parrafos.length || 1)) * 100}%`, background: BANDAS_IA[i].color }} />
              ))}
            </span>
            <span style={{ height: 10, borderRadius: 'var(--radius-full)', background: 'var(--color-bg-surface-alt)', overflow: 'hidden' }}>
              <i style={{ display: 'block', height: '100%', width: `${fila.rigidezMedia}%`, background: 'var(--color-engine-ia)' }} />
            </span>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, textAlign: 'right', color: 'var(--color-engine-ia)', fontVariantNumeric: 'tabular-nums' }}>{fila.rigidezMedia}%</span>
          </button>
        ))}
      </div>
    </div>
  );
};

const Cifra: React.FC<{ n: number; k: string; tono?: string }> = ({ n, k, tono }) => (
  <span><span style={{ display: 'block', fontSize: 'var(--text-lg)', fontWeight: 700, color: tono ?? 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{n}</span><span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{k}</span></span>
);

const eyebrow: React.CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 };
const foco: React.CSSProperties = { fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-warning)', border: '1px solid var(--color-warning)', borderRadius: 'var(--radius-full)', padding: '0 6px', marginLeft: 6, verticalAlign: 'middle' };
const primario: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-engine-ia)', color: 'var(--color-text-on-accent)', fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer' };
const fantasma: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' };

export default AiDashboard;
