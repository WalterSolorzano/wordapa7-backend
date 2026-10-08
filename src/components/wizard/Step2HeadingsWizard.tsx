/* WordAPA7 — Paso 2: Estructura — Edición in-place de títulos con selección múltiple */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useDocStore } from '../../store/useDocStore';
import { PaperCanvas } from '../layout/PaperCanvas';
import { MiniToolbar, MiniToolbarAction } from '../MiniToolbar';
import { needsReview } from '../../lib/portadaAuthors';
import { Heading1, Heading2, Heading3, Pilcrow, Undo2, ChevronLeft, ChevronRight, SkipForward, CheckCircle2, ListOrdered, PanelRightOpen, PanelRightClose, Sparkles } from 'lucide-react';
import { Badge } from '../ui/wordapa7';
import * as api from '../../api/backend';

const kbdStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 5px',
  borderRadius: 'var(--radius-xs)',
  border: '1px solid var(--border-subtle)',
  borderBottomWidth: 2,
  backgroundColor: 'var(--surface-subtle)',
  fontSize: '9px',
  fontWeight: 700,
  color: 'var(--color-text-secondary)',
  fontFamily: 'inherit',
};

export const Step2HeadingsWizard: React.FC = () => {
  const { doc, updateElementType, setSelectedElementId, selectedElementId, showToast } = useDocStore();
  const [filterMode, setFilterMode] = useState<'revisar' | 'all'>('all');
  const [reviewerCollapsed, setReviewerCollapsed] = useState(false);
  const [toolbarAnchor, setToolbarAnchor] = useState<DOMRect | null>(null);
  const [toolbarElementId, setToolbarElementId] = useState<string | null>(null);
  const [reviewIdx, setReviewIdx] = useState(0);

  // Auto-scroll al elemento dudoso cuando se cambia de índice
  useEffect(() => {
    if (filterMode !== 'revisar') return;
    const idx = Math.min(reviewIdx, reviewHeadings.length - 1);
    const cur = reviewHeadings[idx];
    if (!cur) return;
    setSelectedElementId(cur.id);
    const el = document.getElementById(`paper-elem-${cur.id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [reviewIdx, filterMode]);

  // Multi-selection state
  const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(new Set());
  const [shiftAnchorId, setShiftAnchorId] = useState<string | null>(null);
  const shiftRef = useRef(false);
  const ctrlRef = useRef(false);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftRef.current = true;
      if (e.key === 'Control' || e.key === 'Meta') ctrlRef.current = true;
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftRef.current = false;
      if (e.key === 'Control' || e.key === 'Meta') ctrlRef.current = false;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  // Atajos del Revisor: 1/2/3 aplican nivel y avanzan, P = párrafo, Espacio = omitir.
  const applyAndNextRef = useRef<((level: number | 'paragraph') => void) | null>(null);
  const advanceRef = useRef<(() => void) | null>(null);
  const reviewCountRef = useRef(0);
  const filterModeRef = useRef(filterMode);
  filterModeRef.current = filterMode;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return;
      if (filterModeRef.current !== 'revisar' || reviewCountRef.current === 0) return;
      const fn = applyAndNextRef.current;
      if (e.key === '1') { e.preventDefault(); fn?.(1); }
      else if (e.key === '2') { e.preventDefault(); fn?.(2); }
      else if (e.key === '3') { e.preventDefault(); fn?.(3); }
      else if (e.key.toLowerCase() === 'p') { e.preventDefault(); fn?.('paragraph'); }
      else if (e.key === ' ') { e.preventDefault(); advanceRef.current?.(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!doc) return null;

  const headings = doc.elements.filter((e) => e.type === 'heading');
  const reviewHeadings = headings.filter((h) => needsReview(h as any));
  const reviewCount = reviewHeadings.length;
  reviewCountRef.current = reviewCount;

  // El árbol jerárquico de títulos ya NO se renderiza acá (D2): se unificó en
  // el "Mapa del documento" del flyout del rail (visible en pasos 2-4).
  // Step2 queda con solo el lienzo + el Revisor secuencial.

  const reviewHighlightIds = useMemo(() => {
    if (filterMode !== 'revisar') return undefined;
    return new Set(reviewHeadings.map((h) => h.id));
  }, [filterMode, reviewCount]);

  const handleElementClick = useCallback((elementId: string, rect: DOMRect, element: any) => {
    if (element.type !== 'heading') {
      setToolbarAnchor(null);
      setToolbarElementId(null);
      setMultiSelectedIds(new Set());
      return;
    }

    if (shiftRef.current && shiftAnchorId) {
      // Shift+click: range selection
      const allIds = headings.map((h) => h.id);
      const startIdx = allIds.indexOf(shiftAnchorId);
      const endIdx = allIds.indexOf(elementId);
      if (startIdx >= 0 && endIdx >= 0) {
        const range = allIds.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1);
        setMultiSelectedIds(new Set(range));
        setToolbarAnchor(rect);
        setToolbarElementId(elementId);
      }
    } else if (ctrlRef.current) {
      // Ctrl/Cmd+click: toggle individual
      setShiftAnchorId(elementId);
      setMultiSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(elementId)) {
          next.delete(elementId);
        } else {
          next.add(elementId);
        }
        return next;
      });
      setToolbarAnchor(rect);
      setToolbarElementId(elementId);
    } else {
      // Simple click: single selection
      setShiftAnchorId(elementId);
      setMultiSelectedIds(new Set());
      setToolbarAnchor(rect);
      setToolbarElementId(elementId);
      setSelectedElementId(elementId);
    }
  }, [headings, shiftAnchorId, setSelectedElementId]);

  const multiCount = multiSelectedIds.size;
  const heading = toolbarElementId ? headings.find((h) => h.id === toolbarElementId) : null;
  const currentLevel = heading?.heading_level || 1;

  const handleApproveAll = async () => {
    const s = useDocStore.getState();
    await s.approveAllHeadings();
    setFilterMode('all');
  };

  const handleAutoNormalizeHierarchy = async () => {
    const s = useDocStore.getState();
    await s.autoNormalizeHeadings();
    setFilterMode('all');
  };


  const applyToAll = useCallback((level: number) => {
    const ids = multiCount > 1 ? [...multiSelectedIds] : [toolbarElementId];
    ids.filter(Boolean).forEach((id) => {
      updateElementType(id!, 'heading', level);
    });
    setMultiSelectedIds(new Set());
    setToolbarAnchor(null);
    setToolbarElementId(null);
  }, [multiCount, multiSelectedIds, toolbarElementId, updateElementType]);

  const handleLevelChange = useCallback(async (elementId: string, level: number) => {
    updateElementType(elementId, 'heading', level);
    try {
      if (!doc?.session_id) return;
      const res = await api.detectSimilarHeadings(doc.session_id, elementId, 'heading');
      if (res.similar_ids && res.similar_ids.length > 0) {
        showToast(
          `Detectamos ${res.similar_ids.length} título${res.similar_ids.length > 1 ? 's' : ''} más con formato similar.`,
          'warning',
          {
            label: 'Aplicar mismo cambio',
            onClick: () => {
              res.similar_ids.forEach((id: string) => updateElementType(id, 'heading', level));
              showToast('Cambio aplicado a todos los títulos similares.', 'success');
            },
          }
        );
      }
    } catch (_) { /* backend not available, skip */ }
  }, [updateElementType, doc?.session_id, showToast]);

  const toolbarActions: MiniToolbarAction[] = useMemo(() => {
    if (!toolbarElementId) return [];
    const labelSuffix = multiCount > 1 ? ` (${multiCount})` : '';
    return [
      { id: 'h1', label: `Nivel 1${labelSuffix}`, icon: Heading1, active: currentLevel === 1, onClick: () => multiCount > 1 ? applyToAll(1) : handleLevelChange(toolbarElementId!, 1) },
      { id: 'h2', label: `Nivel 2${labelSuffix}`, icon: Heading2, active: currentLevel === 2, onClick: () => multiCount > 1 ? applyToAll(2) : handleLevelChange(toolbarElementId!, 2) },
      { id: 'h3', label: `Nivel 3${labelSuffix}`, icon: Heading3, active: currentLevel === 3, onClick: () => multiCount > 1 ? applyToAll(3) : handleLevelChange(toolbarElementId!, 3) },
      { id: 'separator', label: '', icon: () => null, onClick: () => {} },
      { id: 'paragraph', label: `No es título${labelSuffix}`, icon: Pilcrow, active: false, onClick: () => {
        const ids = multiCount > 1 ? [...multiSelectedIds] : [toolbarElementId];
        ids.filter(Boolean).forEach((id) => updateElementType(id!, 'paragraph', 1));
        setMultiSelectedIds(new Set());
        setToolbarAnchor(null);
        setToolbarElementId(null);
      }},
      { id: 'undo', label: 'Deshacer', icon: Undo2, active: false, onClick: () => useDocStore.getState().undo() },
    ];
  }, [toolbarElementId, currentLevel, multiCount, multiSelectedIds, updateElementType, applyToAll]);

  return (
    <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden', minHeight: 0 }}>
      {/* Main document area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', minWidth: 0 }}>
        {/* Top filter bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', flexShrink: 0,
          backgroundColor: 'var(--sidebar-bg)', borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-text-primary)' }}>
              Estructura ({headings.length} títulos)
            </span>
            <Badge tone="accent">Jerarquía 1, 2 y 3</Badge>
            {multiCount > 1 && (
              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-bg-surface-alt)', padding: '1px 6px', borderRadius: 'var(--radius-sm)' }}>
                {multiCount} seleccionados — Shift+click para rango, Ctrl+click para individual
              </span>
            )}
          </div>

          <div style={{ display: 'flex', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
            <button type="button" onClick={() => setFilterMode('revisar')} style={{ padding: '4px 12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', border: 'none', backgroundColor: filterMode === 'revisar' ? 'var(--color-accent-soft)' : 'transparent', color: filterMode === 'revisar' ? 'var(--accent-primary)' : 'var(--color-text-secondary)' }}>Revisar ({reviewCount})</button>
            <button type="button" onClick={() => setFilterMode('all')} style={{ padding: '4px 12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', border: 'none', borderLeft: '1px solid var(--border-subtle)', backgroundColor: filterMode === 'all' ? 'var(--color-accent-soft)' : 'transparent', color: filterMode === 'all' ? 'var(--accent-primary)' : 'var(--color-text-secondary)' }}>Ver todos ({headings.length})</button>
          </div>
          <button
            type="button"
            onClick={handleAutoNormalizeHierarchy}
            title="Ajusta y estructura automáticamente todos los niveles de títulos (50+) con IA según la norma APA 7"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
              fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
              background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--color-engine-ia) 100%)',
              color: 'var(--color-text-on-accent)', border: 'none', borderRadius: 'var(--radius-sm)',
              boxShadow: '0 2px 8px var(--color-accent-a40)',
            }}
          >
            <Sparkles size={14} /> Auto-organizar todos los títulos con IA
          </button>
          <button
            type="button"
            onClick={() => {
              const hasTocElem = doc?.elements.some(e => e.type === 'toc');
              if (hasTocElem) {
                useDocStore.getState().removeTocElement();
              } else {
                useDocStore.getState().insertTocElement();
              }
            }}
            title={doc?.elements.some(e => e.type === 'toc' || (e.type === 'heading' && /^(índice|tabla de contenidos?|contenido|table of contents)/i.test((e.text || '').trim()))) ? "El documento ya contiene un Índice / Tabla de Contenidos" : "Insertar una Tabla de Contenidos / Índice tras la portada"}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              background: doc?.elements.some(e => e.type === 'toc' || (e.type === 'heading' && /^(índice|tabla de contenidos?|contenido|table of contents)/i.test((e.text || '').trim()))) ? 'var(--color-success-a14)' : 'var(--surface-subtle)',
              color: doc?.elements.some(e => e.type === 'toc' || (e.type === 'heading' && /^(índice|tabla de contenidos?|contenido|table of contents)/i.test((e.text || '').trim()))) ? 'var(--color-success)' : 'var(--text-main)',
              border: doc?.elements.some(e => e.type === 'toc' || (e.type === 'heading' && /^(índice|tabla de contenidos?|contenido|table of contents)/i.test((e.text || '').trim()))) ? '1px solid var(--color-success)' : '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <ListOrdered size={13} /> {doc?.elements.some(e => e.type === 'toc' || (e.type === 'heading' && /^(índice|tabla de contenidos?|contenido|table of contents)/i.test((e.text || '').trim()))) ? 'Índice detectado' : 'Insertar índice'}
          </button>
          <button
            type="button"
            onClick={handleApproveAll}
            title="Marcar como revisados y aprobados todos los títulos del documento"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              background: 'var(--color-accent-soft)', color: 'var(--accent-primary)',
              border: '1px solid var(--accent-primary)', borderRadius: 'var(--radius-sm)',
            }}
          >
            <CheckCircle2 size={13} /> Aprobar todos
          </button>
        </div>

        {/* Banner de Acción Rápida para resolver títulos pendientes en 1 clic */}
        {reviewCount > 0 && (
          <div style={{
            margin: '8px 16px 0 16px',
            padding: '10px 16px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--surface-elevated)',
            border: '1px solid var(--color-warning)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            boxShadow: '0 2px 6px var(--color-warning-a08)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-warning)' }} />
              <div>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)' }}>
                  {reviewCount} título{reviewCount > 1 ? 's' : ''} pendiente{reviewCount > 1 ? 's' : ''} de validación en la estructura
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                  Puedes normalizar o aprobar todos en un solo clic sin tener que ir uno a uno.
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleAutoNormalizeHierarchy}
                title="Ajusta automáticamente los niveles 1, 2 y 3 según el estándar APA 7"
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '5px 12px', fontSize: '12px', fontWeight: 600,
                  backgroundColor: 'var(--color-accent-soft)', color: 'var(--accent-primary)',
                  border: '1px solid var(--color-accent-a30)', borderRadius: 'var(--radius-xs)', cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <Sparkles size={13} /> Auto-organizar jerarquía APA 7
              </button>
              <button
                type="button"
                onClick={handleApproveAll}
                title="Valida y aprueba todos los títulos del documento para retirar los avisos"
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '5px 12px', fontSize: '12px', fontWeight: 700,
                  backgroundColor: 'var(--accent-primary)', color: 'var(--color-text-on-accent)',
                  border: 'none', borderRadius: 'var(--radius-xs)', cursor: 'pointer',
                  fontFamily: 'inherit', boxShadow: '0 2px 6px var(--color-accent-a30)',
                }}
              >
                <CheckCircle2 size={13} /> Validar y aprobar todos ({reviewCount})
              </button>
            </div>
          </div>
        )}

        {/* Document canvas.
             NO usar overflowY:'auto' ni padding aquí — PaperCanvas ya tiene su
            propio contenedor de scroll (overflowY:'auto' + padding). Si anidamos
            otro scrollable, scrollIntoView() solo mueve el contenedor interno y
            el autoscroll se "bloquea" porque el contenedor externo nunca se
            desplaza. */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: 'var(--canvas-bg)', position: 'relative' }}>
          <PaperCanvas
            onElementClick={handleElementClick}
            reviewHighlightIds={reviewHighlightIds}
          />
          {/* Botón de acción rápida: Siguiente etapa */}
          <div style={{
            position: 'absolute', bottom: 20, right: 24, zIndex: 30,
            display: 'flex', gap: '8px',
          }}>
            <button
              type="button"
              onClick={() => useDocStore.getState().setWizardStep(3)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 18px',
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--color-text-on-accent)',
                borderRadius: 'var(--radius-full)',
                border: 'none',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 4px 14px var(--color-accent-a40)',
                fontFamily: 'inherit',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <span>Siguiente: Figuras y tablas</span>
              <ChevronRight size={16} strokeWidth="var(--icon-stroke)" />
            </button>
          </div>
        </div>
      </div>

      {/* Sequential Word-style reviewer */}
      {filterMode === 'revisar' && reviewHeadings.length > 0 && (() => {
        const idx = Math.min(reviewIdx, reviewHeadings.length - 1);
        const cur = reviewHeadings[idx];
        if (!cur) return null;
        const curLevel = cur.heading_level || 1;
        const advance = () => setReviewIdx((i) => Math.min(i + 1, reviewHeadings.length));
        const back = () => setReviewIdx((i) => Math.max(i - 1, 0));
        applyAndNextRef.current = (level) => {
          if (level === 'paragraph') {
            updateElementType(cur.id, 'paragraph', 1);
          } else {
            handleLevelChange(cur.id, level);
          }
          // avanza al siguiente dudoso (lista se recalcifica tras el cambio)
          setTimeout(() => { document.getElementById(`paper-elem-${cur.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setReviewIdx((i) => i + 1); }, 60);
        };
        advanceRef.current = advance;
        const applyAndNext = applyAndNextRef.current;
        // Muestra un preview del ESTILO del nivel (APA real) — sin repetir el texto candidato
        const levelBtn = (lvl: number, icon: any, label: string) => {
          const active = curLevel === lvl;
          return (
            <button
              type="button"
              onClick={() => applyAndNext(lvl)}
              title={`Aplicar ${label} y pasar al siguiente`}
              aria-label={`Aplicar ${label} y pasar al siguiente`}
              style={{
                flex: 1, cursor: 'pointer',
                background: active ? 'var(--color-accent-soft)' : 'var(--color-bg-surface-alt)',
                border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--radius-sm)',
                padding: '10px 8px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {React.createElement(icon, { size: 14, color: active ? 'var(--accent-primary)' : 'var(--color-text-secondary)' })}
                <span style={{ fontSize: 10, fontWeight: 700, color: active ? 'var(--accent-primary)' : 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
              </div>
              {/* Preview del ESTILO APA (no del texto) */}
              <div
                style={{
                  fontFamily: "'Times New Roman', serif",
                  fontWeight: 'bold',
                  fontStyle: lvl === 3 ? 'italic' : 'normal',
                  textAlign: lvl === 1 ? 'center' : 'left',
                  fontSize: lvl === 1 ? '15px' : lvl === 2 ? '14px' : '13px',
                  color: active ? 'var(--accent-primary)' : 'var(--color-text-primary)',
                  lineHeight: 1.2,
                  width: '100%',
                }}
              >
                {lvl === 1 ? 'Centrado' : lvl === 2 ? 'Izquierda' : 'Itálica'}
              </div>
            </button>
          );
        };
        return (
          <div style={{ width: reviewerCollapsed ? 40 : 300, flexShrink: 0, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--sidebar-bg)', borderLeft: '1px solid var(--border-subtle)', overflow: 'hidden', transition: 'width 0.2s ease' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {!reviewerCollapsed && <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>Revisor de títulos</span>}
              <button type="button" onClick={() => setReviewerCollapsed((v) => !v)} title={reviewerCollapsed ? 'Expandir revisor' : 'Colapsar revisor'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: '2px', display: 'flex', alignItems: 'center' }}>
                {reviewerCollapsed ? <PanelRightOpen size={14} /> : <PanelRightClose size={14} />}
              </button>
              {!reviewerCollapsed && <span style={{ fontSize: '11px', color: 'var(--accent-primary)', background: 'var(--color-accent-soft)', padding: '2px 8px', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>{idx + 1} / {reviewHeadings.length}</span>}
            </div>
            {!reviewerCollapsed && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* PREGUNTA PRINCIPAL */}
              <div style={{
                fontSize: '11px', fontWeight: 700, color: 'var(--color-text-tertiary)',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                textAlign: 'center', padding: '0 4px',
              }}>
                ¿Este texto es un título?
              </div>

              {/* TEXTO CANDIDATO — protagonista, grande, resaltado */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => { setSelectedElementId(cur.id); document.getElementById(`paper-elem-${cur.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setSelectedElementId(cur.id); document.getElementById(`paper-elem-${cur.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }}
                style={{
                  cursor: 'pointer',
                  padding: '14px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-accent-soft)',
                  border: '2px solid var(--accent-primary)',
                  textAlign: 'center',
                  boxShadow: '0 2px 8px var(--color-ink-a08)',
                }}
              >
                <div style={{
                  fontSize: '19px',
                  fontWeight: 700,
                  color: 'var(--color-text-primary)',
                  lineHeight: 1.35,
                  fontFamily: "'Times New Roman', serif",
                  wordBreak: 'break-word',
                }}>
                  {cur.text}
                </div>
                <div style={{
                  fontSize: '10px',
                  color: 'var(--color-text-tertiary)',
                  marginTop: 6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontWeight: 600,
                }}>
                  Nivel actual detectado: {curLevel}
                </div>
              </div>

              {/* INSTRUCCIÓN */}
              <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
                Si es título, indicá qué nivel le corresponde:
              </div>

              {/* BOTONES DE NIVEL — muestran el estilo, no el texto */}
              <div style={{ display: 'flex', gap: 6 }}>{levelBtn(1, Heading1, 'Título 1')}{levelBtn(2, Heading2, 'Título 2')}{levelBtn(3, Heading3, 'Título 3')}</div>

              {/* ATAJOS */}
              <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
                Atajos: <kbd style={kbdStyle}>1</kbd> <kbd style={kbdStyle}>2</kbd> <kbd style={kbdStyle}>3</kbd> nivel · <kbd style={kbdStyle}>P</kbd> párrafo · <kbd style={kbdStyle}>Espacio</kbd> omitir
              </div>

              {/* SECUNDARIO: No es título */}
              <button
                type="button"
                onClick={() => applyAndNext('paragraph')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '8px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  border: '1px dashed var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'transparent',
                  color: 'var(--color-text-secondary)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-subtle)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-text-tertiary)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'; }}
              >
                <Pilcrow size={13} /> No es un título (es párrafo)
              </button>

              {/* NAVEGACIÓN */}
              <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
                <button type="button" onClick={back} disabled={idx === 0} style={{ flex: 1, padding: '6px', fontSize: '11px', cursor: idx === 0 ? 'default' : 'pointer', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'transparent', color: idx === 0 ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)', opacity: idx === 0 ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <ChevronLeft size={13} /> Anterior
                </button>
                <button type="button" onClick={advance} disabled={idx >= reviewHeadings.length - 1} style={{ flex: 1, padding: '6px', fontSize: '11px', cursor: idx >= reviewHeadings.length - 1 ? 'default' : 'pointer', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'transparent', color: idx >= reviewHeadings.length - 1 ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)', opacity: idx >= reviewHeadings.length - 1 ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  Omitir <SkipForward size={13} />
                </button>
              </div>
            </div>
            )}
          </div>
        );
      })()}

      <MiniToolbar
        items={toolbarActions}
        anchorRect={toolbarAnchor}
        visible={toolbarAnchor !== null}
        onClose={() => { setToolbarAnchor(null); setToolbarElementId(null); setMultiSelectedIds(new Set()); }}
      />
    </div>
  );
};
