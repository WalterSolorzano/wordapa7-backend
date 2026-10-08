/* WordAPA7 — Paso 5: Body Formatting Wizard (Sangría, Interlineado y Listas) */

import React, { useState } from 'react';
import { useDocStore } from '../../store/useDocStore';
import { AlignLeft, CheckCircle2, SpellCheck, PanelLeftClose, PanelLeftOpen, Wand2 } from 'lucide-react';
import { PaperCanvas } from '../layout/PaperCanvas';
import { Badge } from '../ui/wordapa7';
import type { ProofreadFinding } from '../../types';
import { escribirMarca } from '../../lib/marcasMap';

const SPACING_OPTIONS = [
  { value: 2.0, label: 'Doble (APA)' },
  { value: 1.5, label: '1.5 líneas' },
  { value: 1.0, label: 'Sencillo' },
];

const KIND_LABELS: Record<string, string> = {
  first_person: '1ª persona',
  ortografia: 'Ortografía',
  ai_phrase: 'Frase IA',
  pegado: 'Texto pegado',
  muletilla: 'Muletilla',
  repeticion: 'Repetición',
  incompleta: 'Idea incompleta',
  persona: 'Mezcla de persona',
  ambigua: 'Pronombre ambiguo',
};

const KIND_TONES: Record<string, string> = {
  first_person: 'var(--color-warning)',
  ortografia: 'var(--color-danger)',
  ai_phrase: 'var(--color-warning)',
  pegado: 'var(--color-danger)',
  muletilla: 'var(--text-secondary)',
  repeticion: 'var(--color-warning)',
  incompleta: 'var(--color-danger)',
  persona: 'var(--color-warning)',
  ambigua: 'var(--color-warning)',
};

/** Registra marca de transparencia para el elemento modificado (H21). */
function recordMarca(elementId: string | null, label: string): void {
  escribirMarca(elementId, label);
}

const SAFE_KINDS = new Set(['ortografia', 'pegado']);

/** Calcula el nuevo texto del elemento aplicando hallazgos seguros (desc por start). */
function fixTextFor(original: string, findings: ProofreadFinding[]): string {
  let text = original;
  const sorted = [...findings].sort((a, b) => b.start - a.start);
  for (const f of sorted) {
    if (f.kind === 'ortografia' && f.suggestion != null) {
      text = text.slice(0, f.start) + f.suggestion + text.slice(f.end);
    } else if (f.kind === 'pegado') {
      if (f.message.startsWith('Falta un espacio')) {
        text = text.slice(0, f.start) + ' ' + text.slice(f.start);
      } else if (f.message.includes('duplicada')) {
        const seg = text.slice(f.start, f.end);
        const m = seg.match(/^(\w+) \1$/i);
        if (m) text = text.slice(0, f.start) + m[1] + text.slice(f.end);
      } else if (f.message === 'Puntuación duplicada') {
        text = text.slice(0, f.start) + '.' + text.slice(text.indexOf('.', f.start) + 1 > f.end ? f.end : f.end);
      }
    }
  }
  return text;
}

/** Fila compacta de una regla aplicada (resumen visual, sin párrafos largos). */
const RuleRow: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px' }}>
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '16px', flexShrink: 0, color: 'var(--text-secondary)' }}>{icon}</span>
    <span style={{ flex: 1, minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-main)' }}>{label}</span>
      <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)', marginTop: '1px' }}>{value}</span>
    </span>
  </div>
);

export const Step5BodyWizard: React.FC = () => {
  const { rules, setRules, doc, runAIReview, setForceRightPanelOpen, setRightPanelTab } = useDocStore();
  const [showPanel, setShowPanel] = useState(true);

  const proofreadFindings = useDocStore((s) => s.proofreadFindings);
  const runProofreadBatch = useDocStore((s) => s.runProofreadBatch);
  const aiIndices = useDocStore((s) => s.aiIndices);
  const findingsByKind = proofreadFindings.reduce<Record<string, number>>((acc, f) => {
    acc[f.kind] = (acc[f.kind] || 0) + 1;
    return acc;
  }, {});

  if (!doc) return null;

  const totalParagraphs = doc.elements.filter(e => e.type === 'paragraph').length;
  const totalLists = doc.elements.filter(e => e.type === 'numbered_list' || e.type === 'bullet').length;

  return (
    <div style={{ flex: 1, display: 'flex', height: '100%', overflow: 'hidden' }}>

      {showPanel ? (
      /* Panel Izquierdo: Reglas APA aplicadas */
      <div style={{
        width: '300px',
        flexShrink: 0,
        backgroundColor: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header compacto */}
        <div style={{
          padding: '14px 16px 12px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <AlignLeft size={16} color="var(--accent-primary)" />
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>Cuerpo del documento</h3>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Párrafos, listas y sangrías</span>
          </div>
          <button type="button" onClick={() => setShowPanel(false)} title="Colapsar panel"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: 'var(--radius-xs)', display: 'flex' }}>
            <PanelLeftClose size={16} />
          </button>
        </div>

        <div style={{ padding: '12px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>

          {/* Resumen compacto de reglas aplicadas */}
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--surface-elevated)', overflow: 'hidden' }}>
            <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <CheckCircle2 size={13} color="var(--color-success)" />
              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)' }}>Reglas aplicadas</span>
              <div style={{ flex: 1 }} />
              <Badge tone="success">Auto</Badge>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {/* Estas dos filas se LEEN de `rules`. Tenían el 1,27 y el 2,54
                  escritos a mano, y como la pestaña Formato deja cambiar los
                  dos, un resumen que dice "2,54 cm" mientras el documento está
                  en 3 es un resumen que miente en la cara de la persona. */}
              <RuleRow icon={<AlignLeft size={12} />} label="Sangría primera línea" value={`${rules.paragraph_indent_cm} cm · ${totalParagraphs} párrafos`} />
              <RuleRow icon={<AlignLeft size={12} />} label="Enumeración de listas" value={`${totalLists} listas secuenciales`} />
              <RuleRow icon={<AlignLeft size={12} />} label="Márgenes y tipografía" value={`${rules.margins_cm} cm · ${rules.font_family} ${rules.font_size_pt}pt`} />
            </div>
          </div>

          {/* Interlineado (configurable) */}
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--surface-elevated)', overflow: 'hidden' }}>
            <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)' }}>Interlineado</span>
              <Badge tone="accent">Configurable</Badge>
            </div>
            <div style={{ padding: '10px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
              {SPACING_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  style={{
                    padding: '7px 6px', fontSize: '11px', borderRadius: 'var(--radius-md)',
                    border: rules.line_spacing === opt.value ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                    background: rules.line_spacing === opt.value ? 'var(--color-accent-a12)' : 'var(--surface-subtle)',
                    color: rules.line_spacing === opt.value ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    fontWeight: rules.line_spacing === opt.value ? 700 : 500,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                  onClick={() => {
                    setRules({ line_spacing: opt.value });
                    recordMarca(null, 'interlineado aplicado');
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div style={{ padding: '0 12px 10px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              El doble (2.0) es el estándar APA 7, pero podés ajustarlo si tu institución lo pide.
            </div>
          </div>

          {/* Revisión ortográfica + IA */}
          <div style={{
            padding: '12px', border: '1px solid var(--color-accent-a40)', borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--color-accent-a05)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
              <strong style={{ fontSize: '13px', color: 'var(--text-main)' }}>Revisión ortográfica e IA</strong>
              <Badge tone="success">Disponible</Badge>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.5 }}>
              Ortografía, gramática y detección de texto generado por IA. El resultado aparece en el panel Actividad.
            </p>
            <button
              type="button"
              onClick={async () => {
                await runAIReview();
                setForceRightPanelOpen(true);
                setRightPanelTab('activity');
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', width: '100%',
                justifyContent: 'center', padding: '7px 12px', borderRadius: 'var(--radius-xs)', cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: 600,
                background: 'var(--word-blue)', color: 'var(--color-text-on-accent)',
                border: 'none',
              }}
            >
              <SpellCheck size={14} /> Abrir Revisor
            </button>
          </div>

          {/* Revisor de escritura por lotes (híbrido local+LLM) */}
          <div style={{
            padding: '12px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--surface-elevated)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <strong style={{ fontSize: '13px', color: 'var(--text-main)' }}>Revisor de escritura</strong>
              {proofreadFindings.length > 0 && (
                <Badge tone="warning">{proofreadFindings.length}</Badge>
              )}
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.5 }}>
              Ortografía, frases de IA, texto mal pegado y primera persona. Local siempre; con clave activa el LLM verifica.
            </p>
            <button
              type="button"
              onClick={() => { void runProofreadBatch(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', width: '100%',
                justifyContent: 'center', padding: '7px 12px', borderRadius: 'var(--radius-xs)', cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: 600,
                background: 'transparent', color: 'var(--accent-primary)',
                border: '1px solid var(--accent-primary)',
              }}
            >
              <SpellCheck size={14} /> Revisar ahora
            </button>

            {/* Corrección automática de lo seguro (ortografía + pegado) */}
            {(() => {
              const safe = proofreadFindings.filter((f) => SAFE_KINDS.has(f.kind));
              if (safe.length === 0) return null;
              return (
                <button
                  type="button"
                  onClick={async () => {
                    const d = useDocStore.getState().doc;
                    if (!d) return;
                    const byElem = new Map<string, ProofreadFinding[]>();
                    for (const f of safe) {
                      const arr = byElem.get(f.element_id) || [];
                      arr.push(f);
                      byElem.set(f.element_id, arr);
                    }
                    let fixed = 0;
                    for (const [elemId, fs] of byElem) {
                      const el = d.elements.find((e) => e.id === elemId);
                      if (!el || typeof el.text !== 'string') continue;
                      const newText = fixTextFor(el.text, fs);
                      if (newText !== el.text) {
                        await useDocStore.getState().updateElementType(elemId, el.type, (el as any).heading_level, newText);
                        recordMarca(elemId, 'corregido aquí');
                        fixed += fs.length;
                      }
                    }
                    useDocStore.getState().showToast(
                      fixed > 0 ? `Se corrigieron ${fixed} problemas en ${byElem.size} párrafo(s)` : 'Nada que corregir',
                      fixed > 0 ? 'success' : 'info'
                    );
                    void runProofreadBatch();
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', width: '100%',
                    justifyContent: 'center', padding: '7px 12px', borderRadius: 'var(--radius-xs)', cursor: 'pointer',
                    fontFamily: 'inherit', fontWeight: 700, marginTop: '6px',
                    background: 'var(--accent-primary)', color: 'var(--color-text-on-accent)', border: 'none',
                  }}
                >
                  <Wand2 size={14} /> Corregir todo lo seguro ({safe.length})
                </button>
              );
            })()}
            {proofreadFindings.length > 0 && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {Object.entries(findingsByKind).map(([kind, count]) => (
                  <div key={kind} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                    <span style={{
                      width: '8px', height: '8px', borderRadius: 'var(--radius-full)',
                      backgroundColor: KIND_TONES[kind] || 'var(--text-secondary)', flexShrink: 0,
                    }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{KIND_LABELS[kind] || kind}</span>
                    <div style={{ flex: 1 }} />
                    <strong style={{ color: 'var(--text-main)' }}>{count}</strong>
                  </div>
                ))}
              </div>
            )}
            {/* Desglose de índices de comportamiento IA (transparencia) */}
            {aiIndices && aiIndices.zone !== 'insuficiente' && (
              <details style={{ marginTop: '8px', fontSize: '11px' }}>
                <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  Detección IA: <strong style={{ color: aiIndices.zone.includes('ia') ? 'var(--color-warning)' : 'var(--color-success)' }}>
                    {aiIndices.zone.replace('_', ' ')}
                  </strong> · score {Math.round(aiIndices.score * 100)}
                </summary>
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {Object.entries(aiIndices.indices).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 30, color: 'var(--text-secondary)' }}>{k}</span>
                      <div style={{ flex: 1, height: 5, borderRadius: 'var(--radius-2xs)', background: 'var(--border-subtle)', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(v * 100)}%`, height: '100%', background: v >= 0.6 ? 'var(--color-warning)' : 'var(--accent-primary)' }} />
                      </div>
                      <span style={{ width: 28, textAlign: 'right', color: 'var(--text-secondary)' }}>{Math.round((v as number) * 100)}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* Dónde se cambia el resto del formato. Este bloque deja dicho que el
              interlineado se cambia acá y que el resto no.
              Lo que antes estaba bajo el desplegable de "Opciones avanzadas" —
              "Texto justificado" y "Sangría primera línea" — se guardaba en
              `wordapa7_body_advanced` y no lo leía nadie: ni `rules`, ni el
              backend, ni este archivo después. Su texto decía "se aplican al
              generar el documento final", que era falso, y encima se peleaban
              con `alignment` y `paragraph_indent_cm` de la pestaña Formato de
              Ajustes, que sí se aplican. El formato se cambia en un solo lugar:
              la pestaña Formato. */}
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--surface-elevated)', padding: '10px 12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlignLeft size={13} />
              Los demás ajustes de formato
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5, display: 'block', marginTop: '4px' }}>
              La fuente, el tamaño, la alineación y la sangría de primera línea se
              cambian en Ajustes, pestaña Formato. Ahí sí se aplican al documento
              final.
            </span>
          </div>
        </div>
      </div>
      ) : (
        <div style={{
          width: 40, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
          backgroundColor: 'var(--sidebar-bg)', borderRight: '1px solid var(--border-subtle)', paddingTop: 8,
        }}>
          <button type="button" onClick={() => setShowPanel(true)}
            title="Mostrar panel de reglas del cuerpo"
            style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', cursor: 'pointer', background: 'var(--color-accent-soft)', border: '1px solid var(--color-accent-a30)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <PanelLeftOpen size={14} />
          </button>
        </div>
      )}

      {/* Panel Derecho: Lienzo Sincronizado.
           NO usar overflowY:'auto' ni padding aquí — PaperCanvas ya tiene su
          propio contenedor de scroll (overflowY:'auto' + padding). Si anidamos
          otro scrollable, scrollIntoView() solo mueve el contenedor interno y
          el autoscroll se "bloquea" porque el contenedor externo nunca se
          desplaza. */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: 'var(--canvas-bg)' }}>
        <PaperCanvas />
      </div>
    </div>
  );
};

export default Step5BodyWizard;
