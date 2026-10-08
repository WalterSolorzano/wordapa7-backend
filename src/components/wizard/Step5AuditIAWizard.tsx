/* WordAPA7 — Paso 5: orquestador de Revisión & IA.
   La puerta (`gate`) es la entrada. La revisión es una sala con tres niveles:
   el panorama (`rev-l0`), el detalle filtrado por motor/fase (`rev-l1`) y el
   analizador de objetivos (`rev-l2`). La sala de IA es `ai`. */
import React, { useMemo, useState } from 'react';
import { useDocStore } from '../../store/useDocStore';
import { reviewItems, type AuditItem, type EngineId } from '../../lib/auditItems';
import { usePageIndex } from '../../hooks/usePageIndex';
import { ReviewGate } from '../review/ReviewGate';
import { RevisionRoom } from '../review/RevisionRoom';
import { RevisionDetail } from '../review/RevisionDetail';
import { ObjetivosAnalyzer } from '../review/ObjetivosAnalyzer';
import { TituloAnalyzer } from '../review/TituloAnalyzer';
import { AiRoom } from '../review/AiRoom';
import { AiSectionDetail } from '../review/AiSectionDetail';
import { AiDocumentPreview } from '../review/AiDocumentPreview';
import { construirPerfilIA } from '../../lib/aiPerfil';
import { reformulateText } from '../../api/backend';
import '../../styles/revision.css';

type Pantalla = 'gate' | 'rev-l0' | 'rev-l1' | 'rev-l2' | 'rev-titulo' | 'ai';

/** El foco con el que una sala abre su detalle: un motor y/o una fase. */
type FocoRevision = { phase?: string; engine?: EngineId; motor?: EngineId };

const PHASE_WRAP: React.CSSProperties = { display: 'flex', flexDirection: 'column', flex: 1, height: '100%', minHeight: 0, overflow: 'hidden' };

export const Step5AuditIAWizard: React.FC = () => {
  const doc = useDocStore((s) => s.doc);
  const reviewResult = useDocStore((s) => s.reviewResult);
  const proofreadFindings = useDocStore((s) => s.proofreadFindings || []);
  const citationAuditResult = useDocStore((s) => s.citationAuditResult);
  const runAIReview = useDocStore((s) => s.runAIReview);
  const runProofreadBatch = useDocStore((s) => s.runProofreadBatch);
  const runCitationAudit = useDocStore((s) => s.runCitationAudit);
  const updateElementText = useDocStore((s) => s.updateElementText);
  const showToast = useDocStore((s) => s.showToast);
  const setSelectedElementId = useDocStore((s) => s.setSelectedElementId);
  const setScrollTargetId = useDocStore((s) => s.setScrollTargetId);
  const dismissedFindingIds = useDocStore((s) => s.dismissedFindingIds || []);
  const dismissFinding = useDocStore((s) => s.dismissFinding);

  const [pantalla, setPantalla] = useState<Pantalla>('gate');
  const [isScanning, setIsScanning] = useState(false);
  /* El foco elegido en la puerta (fase y/o motor). Vive acá porque la puerta se
     desmonta al abrir la revisión; la superficie secuencial lo recibe al
     montar. Volver a la puerta lo limpia: el próximo "Empezar revisión" arranca
     sin filtro. */
  const [foco, setFoco] = useState<FocoRevision | null>(null);

  /* Estado de la Sala de IA: L0 (tablero general), L1 (detalle de un H1) y la
     vista previa del documento. Vive acá porque el nivel reemplaza a la sala
     completa al navegar, y volver a la puerta lo limpia. */
  const [iaNivel, setIaNivel] = useState<'l0' | 'l1' | 'preview'>('l0');
  const [iaH1, setIaH1] = useState<string | null>(null);

  const volverAPuerta = () => {
    setFoco(null);
    setPantalla('gate');
  };

  const elements = useMemo(() => doc?.elements || [], [doc]);

  const { pageOf } = usePageIndex();

  /* `reviewItems` es la MISMA lista que cuenta el rail: todos los hallazgos
     menos los que la persona ya descartó. No se filtra por categoría —ni citas
     ni leyendas— porque el rail las cuenta y la pantalla tiene que mostrarlas:
     si escondiera un motor, el rail prometería trabajo que la pantalla no abre
     (AGENTS.md §1). */
  const items = useMemo(
    () =>
      reviewItems(
        { elements, reviewResult, proofreadFindings, citationAuditResult },
        pageOf,
        dismissedFindingIds,
      ),
    [elements, reviewResult, proofreadFindings, citationAuditResult, pageOf, dismissedFindingIds],
  );

  const aiScore = reviewResult?.ai_indices?.score ?? reviewResult?.ai_avg_score ?? 0;

  const handleScan = async () => {
    setIsScanning(true);
    showToast('Iniciando escaneo integral con IA y heurística local…', 'info');
    try {
      await Promise.allSettled([runAIReview(), runProofreadBatch(), runCitationAudit()]);
      showToast('Auditoría integral completada', 'success');
    } catch {
      showToast('Error al ejecutar el escaneo completo', 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const handleMark = (item: AuditItem) => {
    if (item.element_id) {
      setSelectedElementId(item.element_id);
      setScrollTargetId(item.element_id);
    }
    showToast('Marcado para revisar', 'info');
  };

  /* El detector de IA es probabilístico (AGENTS.md §1): "Reemplazar en
     Manuscrito" escribe lo que la persona editó en la propuesta, y marca el
     hallazgo para que quede trazable; nunca aplica una sugerencia a ciegas. */
  const handleReplace = async (id: string, text: string) => {
    const item = items.find((it) => it.id === id);
    if (!doc || !item?.element_id || item.readOnly) return;
    try {
      await updateElementText(item.element_id, text);
      setSelectedElementId(item.element_id);
      setScrollTargetId(item.element_id);
      dismissFinding(id);
      showToast('Propuesta insertada en el manuscrito', 'success');
    } catch {
      showToast('Error al reemplazar en el manuscrito', 'error');
    }
  };

  const aiItems = useMemo(() => items.filter((it) => it.category === 'ai'), [items]);

  const perfilIA = useMemo(() => construirPerfilIA(reviewResult?.paragraphs ?? [], elements), [reviewResult, elements]);

  if (pantalla === 'ai') {
    if (iaNivel === 'l1' && iaH1) {
      const fila = perfilIA.filas.find((f) => f.h1Id === iaH1);
      if (fila) {
        return (
          <div className="revision-phase rev-screen" style={PHASE_WRAP}>
            <AiSectionDetail
              fila={fila}
              paragraphs={reviewResult?.paragraphs ?? []}
              onBack={() => setIaNivel('l0')}
              onMark={(id) => handleMark({ element_id: id } as AuditItem)}
              onReformular={(texto) => reformulateText(texto)}
            />
          </div>
        );
      }
    }
    if (iaNivel === 'preview') {
      return (
        <div className="revision-phase rev-screen" style={PHASE_WRAP}>
          <AiDocumentPreview
            paragraphs={reviewResult?.paragraphs ?? []}
            onClose={() => setIaNivel('l0')}
            onOpenParagraph={(elementId) => {
              const fila = perfilIA.filas.find((f) => f.parrafos.some((p) => p.elementId === elementId));
              if (fila) { setIaH1(fila.h1Id); setIaNivel('l1'); }
            }}
          />
        </div>
      );
    }
    return (
      <div className="revision-phase rev-screen" style={PHASE_WRAP}>
        <AiRoom
          reviewResult={reviewResult}
          elements={elements}
          onOpenSection={(id) => { setIaH1(id); setIaNivel('l1'); }}
          onOpenPreview={() => setIaNivel('preview')}
          onExit={volverAPuerta}
        />
      </div>
    );
  }

  if (pantalla === 'rev-l0') {
    return (
      <div className="revision-phase rev-screen" style={PHASE_WRAP}>
        <RevisionRoom
          items={items}
          elements={elements}
          onOpenDetail={(foco) => { setFoco(foco); setPantalla('rev-l1'); }}
          onOpenObjetivos={() => setPantalla('rev-l2')}
          onOpenTitulo={() => setPantalla('rev-titulo')}
          onBack={volverAPuerta}
        />
      </div>
    );
  }

  if (pantalla === 'rev-l1' && foco) {
    return (
      <div className="revision-phase rev-screen" style={PHASE_WRAP}>
        <RevisionDetail foco={foco} onBack={() => setPantalla('rev-l0')} />
      </div>
    );
  }

  if (pantalla === 'rev-l2') {
    return (
      <div className="revision-phase rev-screen" style={PHASE_WRAP}>
        <ObjetivosAnalyzer
          elements={elements}
          onApply={async (elementId, texto) => {
            try {
              await updateElementText(elementId, texto);
              showToast('Propuesta de objetivo aplicada', 'success');
            } catch {
              showToast('Error al aplicar la propuesta', 'error');
            }
          }}
          onMark={(elementId) => handleMark({ element_id: elementId } as AuditItem)}
          onBack={() => setPantalla('rev-l0')}
        />
      </div>
    );
  }

  if (pantalla === 'rev-titulo') {
    return (
      <div className="revision-phase rev-screen" style={PHASE_WRAP}>
        <TituloAnalyzer
          elements={elements}
          onApply={async (elementId, texto) => {
            try {
              await updateElementText(elementId, texto);
              showToast('Título optimizado en el manuscrito', 'success');
            } catch {
              showToast('Error al actualizar el título', 'error');
            }
          }}
          onBack={() => setPantalla('rev-l0')}
        />
      </div>
    );
  }

  return (
    <div className="revision-phase rev-screen" style={PHASE_WRAP}>
      <ReviewGate
        items={items}
        elements={elements}
        paragraphs={reviewResult?.paragraphs ?? []}
        isScanning={isScanning}
        onScan={handleScan}
        onStartRevision={() => setPantalla('rev-l0')}
        onOpenAiRoom={() => setPantalla('ai')}
      />
    </div>
  );
};

export default Step5AuditIAWizard;
