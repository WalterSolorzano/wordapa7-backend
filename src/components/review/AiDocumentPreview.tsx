/* WordAPA7 — vista previa del documento «tal cual sale» con manchas de IA.
   Reutiliza el mismo lienzo (`PaperCanvas`) con una capa de manchas encima; solo
   lectura, porque la IA solo se marca para revisar. */
import React, { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { AIReviewParagraph } from '../../api/backend';
import { BANDAS_IA } from '../../lib/aiPerfil';
import { PaperCanvas } from '../layout/PaperCanvas';

/** Los cuatro tokens de mancha declarados en `design-system.css`. Un array
 *  explícito (no un template `--ia-mancha-${i}`) para que el lint de tokens lea
 *  nombres declarados y no un nombre dinámico. */
const MANCHA_TOKENS = [
  'var(--ia-mancha-1)',
  'var(--ia-mancha-2)',
  'var(--ia-mancha-3)',
  'var(--ia-mancha-4)',
] as const;

export interface AiDocumentPreviewProps {
  paragraphs: readonly AIReviewParagraph[];
  onClose: () => void;
  onOpenParagraph: (elementId: string) => void;
}

export const AiDocumentPreview: React.FC<AiDocumentPreviewProps> = ({ paragraphs, onClose, onOpenParagraph }) => {
  const [mostrar, setMostrar] = useState(true);
  const aiMarks = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const p of paragraphs) if (p.element_id) mapa.set(p.element_id, p.ai_score);
    return mapa;
  }, [paragraphs]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--color-bg-canvas)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button type="button" onClick={onClose} style={fantasma}><ArrowLeft size={14} aria-hidden /> Cerrar vista previa</button>
          <div>
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>Vista previa del documento</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>Formato de salida real · con manchas de IA</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            {BANDAS_IA.map((b, i) => (
              <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                <i style={{ width: 12, height: 12, borderRadius: 'var(--radius-2xs)', background: MANCHA_TOKENS[i], border: '1px solid var(--color-border-subtle)' }} />{b.label}
              </span>
            ))}
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            <input type="checkbox" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} /> Mostrar manchas
          </label>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {/* El clic viaja por `onElementClick` y no por burbujeo: el wrapper del
            párrafo en `PaperCanvas` corta la propagación. Solo los párrafos
            manchados abren su detalle; el resto no es navegable. */}
        <PaperCanvas
          readOnly
          aiMarks={mostrar ? aiMarks : undefined}
          onElementClick={(id) => { if (aiMarks.has(id)) onOpenParagraph(id); }}
        />
      </div>
    </div>
  );
};

const fantasma: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' };

export default AiDocumentPreview;
