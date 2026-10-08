/* WordAPA7 — Interactive Canvas with Faithful Original Document Layout */

import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { useDocStore } from '../../store/useDocStore';
import { construirTextosDeTitulo, esTituloDeReferencias } from '../../lib/numeracionTitulos';
import { paginasPorElemento } from '../../lib/paginasDeElementos';
import { ElementModel } from '../../types';
import { ZoomIn, ZoomOut, Undo2, Redo2, Maximize2, Minimize2, Check, X, Flame, Wand2, Loader2, RotateCw, UploadCloud, Image as ImageIcon, PanelRight, Edit3, Sparkles, AlertTriangle } from 'lucide-react';
import { suggestCaption, rewriteText, resolveAssetUrl } from '../../api/backend';
import { APACoverEditor } from './APACoverEditor';
import { ReferenciaLinea } from '../referencias/ReferenciaLinea';
import { APA_LISTA } from '../../lib/apaLayout';
import { manchaDe } from '../../lib/aiPerfil';
import { UNICoverPreview } from './UNICoverPreview';
import { getWhatsAppComment, WhatsAppComment, WhatsAppCommentData } from './WhatsAppComment';
import { getPageGeometry, type PageGeometry } from '../../lib/pageGeometry';
import { anchoUtilMm } from '../../lib/portada/geometria';
import { leerMarcas, borrarMarca } from '../../lib/marcasMap';
import { aplicarPageSizeEnHtml } from '../../lib/pageSizeEnHtml';
import { applyPageFlow } from '../../lib/pageSplitter';
import { expandByLineCuts } from '../../lib/lineCuts';
import { useLayoutRepaginate } from '../../lib/useLayoutRepaginate';
import { altoImagenAjustado } from '../../lib/figuraAjuste';
import { usePdfRestLayer } from '../../lib/usePdfRestLayer';
import { PdfRestLayer } from './PdfRestLayer';
import { InlineTextEditor } from './InlineTextEditor';
import { useIsMobile } from '../../hooks/useMediaQuery';

/** Fase 3 — tipos editables inline (contentEditable). El resto conserva el
 *  textarea overlay / panel (spec §3.1: headings, citas, tablas, imagen,
 *  portada NO editables inline). bullet/numbered_list quedan fuera: su
 *  prefijo estructural (• / n.) se dibuja fuera del texto editable. */
const INLINE_EDITABLE_TYPES = new Set(['paragraph', 'block_quote']);
import { useMarkSourceBase, buildMarkSource } from '../../hooks/useMarkSource';
import { ReadingText, type MarkSource } from '../review/ReadingText';
import { InlineAILens } from '../canvas/InlineAILens';
import { CaptionSuggestionBadge } from '../canvas/CaptionSuggestionBadge';
import { TablaRender } from '../figures/TablaRender';
import { MascotaLeyendaIA } from '../figures/MascotaLeyendaIA';
import { TablaEstiloSelector } from '../figures/TablaEstiloSelector';
import { rebanadaDeTabla } from '../../lib/tablaRender';
import { buildCoverColumns, parseAnchorEmu } from '../../lib/coverColumns';

// Máximo de burbujas de comentario visibles por página (el resto se resume).
const MAX_GUTTER = 6;

// Dedup de bloques de portada (defensa en profundidad contra textboxes
// duplicados en el .docx original): colapsa elementos cuyo texto normalizado
// (minúsculas + espacios colapsados) coincide.
export function dedupCoverAuthors(elems: ElementModel[]): ElementModel[] {
  const seen = new Set<string>();
  return elems.filter((e) => {
    const key = (e.text || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export interface CoverAuthorCard {
  name: string;
  meta: string;
  originalElemId: string;
}

export function parseCoverAuthorCards(elem: ElementModel): CoverAuthorCard[] {
  if (!elem.text) return [];
  const lines = elem.text.split('\n').map((l) => l.trim()).filter(Boolean);
  const cards: CoverAuthorCard[] = [];
  let currentName = '';
  let currentMeta = '';
  lines.forEach((line) => {
    // Si la línea explícitamente es docente o tutor, no es autor estudiantil
    if (/^(Docente|Tutor|Prof\.|Profesor|Asesor)/i.test(line)) {
      return;
    }
    if (/^(Br\.|Est\.)/i.test(line)) {
      if (currentName) {
        cards.push({ name: currentName, meta: currentMeta, originalElemId: elem.id });
        currentMeta = '';
      }
      const m = line.match(/(Carnet:.*|Grupo:.*)/i);
      if (m) {
        currentName = line.slice(0, m.index).trim();
        currentMeta = m[1].trim();
      } else {
        currentName = line;
      }
    } else if (/^(Carnet|Grupo|ID):/i.test(line)) {
      currentMeta = currentMeta ? `${currentMeta} · ${line}` : line;
    } else {
      if (currentName && !currentMeta) {
        currentMeta = line;
      } else if (currentName) {
        currentMeta += ` ${line}`;
      } else {
        currentName = line;
      }
    }
  });
  if (currentName) {
    cards.push({ name: currentName, meta: currentMeta, originalElemId: elem.id });
  }
  return cards;
}

export function isCoverTutorElement(elem: ElementModel): boolean {
  if (!elem.text) return false;
  const t = elem.text.trim();
  return /^(Docente|Tutor|Profesor|Prof\.|Asesor|Ing\.|Dr\.|Lic\.|MSc\.|Master)/i.test(t) ||
    /\b(Docente|Tutor|Profesor|Asesor)\s*:/i.test(t);
}

export function isCoverAuthorElement(elem: ElementModel): boolean {
  if (!elem.text) return false;
  const t = elem.text.trim();
  // Los docentes (Ing., Dr., Lic., Docente, Tutor, Profesor) NO son integrantes estudiantiles
  if (isCoverTutorElement(elem)) return false;
  return /\b(Br\.|Est\.|Carnet:)\b/i.test(t) || /Carnet:\s*\d+/i.test(t);
}

// ── Marcas de transparencia y auditoría (ChangeMark) ─────────────────────────
// Micro-chip interactivo renderizado arriba del elemento con feedback pedagógico,
// categorización visual y acciones directas (reescritura IA / descartar).
const ChangeMark: React.FC<{
  label: string;
  elem?: ElementModel;
  finding?: any;
  onRewrite?: (elem: ElementModel) => void;
  onDismiss?: (elemId: string) => void;
}> = ({ label, elem, finding, onRewrite, onDismiss }) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const lower = (label || '').toLowerCase();

  const isAI = lower.includes('ia') || lower.includes('sintético') || lower.includes('sintetico');
  const isRepetition = lower.includes('repet') || lower.includes('ngram');
  const isSpelling = lower.includes('ortograf');
  const isAmbig = lower.includes('ambig');

  let toneColor = 'var(--text-main)';
  let bgColor = 'var(--surface-elevated)';
  let borderColor = 'var(--border-subtle)';
  let IconComponent = Wand2;

  if (isAI) {
    toneColor = 'var(--color-engine-ia)';
    bgColor = 'var(--color-engine-ia-a08)';
    borderColor = 'var(--color-engine-ia-a30)';
    IconComponent = Sparkles;
  } else if (isRepetition) {
    toneColor = 'var(--color-warning)';
    bgColor = 'var(--color-warning-a08)';
    borderColor = 'var(--color-warning-a30)';
    IconComponent = RotateCw;
  } else if (isSpelling || isAmbig) {
    toneColor = 'var(--color-danger)';
    bgColor = 'var(--color-danger-a08)';
    borderColor = 'var(--color-danger-a30)';
    IconComponent = AlertTriangle;
  }

  const detailedMessage = finding?.message || (
    isAI
      ? 'Frase o giro redactado con patrón sintético típico de modelos de IA. Se sugiere reformular con voz académica propia.'
      : isRepetition
      ? 'Se identificó una expresión o secuencia de palabras repetida frecuentemente en el texto. Varía el léxico para mayor riqueza editorial.'
      : isSpelling
      ? 'Posible discordancia u omisión ortográfica detectada según el diccionario académico.'
      : isAmbig
      ? 'Referencia pronominal potencialmente ambigua. Precisa a qué sujeto o variable alude el enunciado.'
      : `Revisión editorial APA 7: ${label}`
  );

  // Normalización editorial de etiquetas crudas ("parece ia", "ngram_repetition", etc.)
  const getFriendlyLabel = (raw: string) => {
    const l = (raw || '').toLowerCase();
    if (l.includes('ia') || l.includes('sintético') || l.includes('sintetico') || l.includes('parece ia') || l.includes('ai_phrase')) {
      return 'Sugerencia de estilo';
    }
    if (l.includes('ngram') || l.includes('repet')) {
      return 'Variedad léxica';
    }
    if (l.includes('ortograf') || l.includes('spelling')) {
      return 'Ortografía';
    }
    if (l.includes('ambig')) {
      return 'Claridad referencial';
    }
    if (l.includes('bloom')) {
      return 'Precisión taxonómica';
    }
    if (l.includes('persona')) {
      return 'Voz académica';
    }
    return raw;
  };
  const displayLabel = getFriendlyLabel(label);

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        width: '100%',
        marginBottom: '4px',
        position: 'relative',
        zIndex: popoverOpen ? 60 : 10,
      }}
    >
      <div
        className="change-mark-chip"
        onClick={(e) => {
          e.stopPropagation();
          setPopoverOpen(!popoverOpen);
        }}
        title="Clic para ver diagnóstico y opciones de redacción"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '2px 9px',
          borderRadius: 'var(--radius-full)',
          border: `1px solid ${borderColor}`,
          backgroundColor: bgColor,
          color: toneColor,
          fontSize: '11px',
          fontWeight: 700,
          lineHeight: 1.35,
          cursor: 'pointer',
          boxShadow: 'var(--shadow-sm)',
          userSelect: 'none',
          transition: 'all 0.15s ease',
        }}
      >
        <IconComponent size={12} style={{ flexShrink: 0 }} />
        <span>{displayLabel}</span>
      </div>

      {popoverOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            width: '310px',
            backgroundColor: 'var(--surface-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 8px 24px var(--color-ink-a20)',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            zIndex: 100,
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 800, color: toneColor }}>
              <IconComponent size={13} />
              <span>{label}</span>
            </div>
            <button
              type="button"
              onClick={() => setPopoverOpen(false)}
              style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', color: 'var(--text-secondary)' }}
            >
              <X size={13} />
            </button>
          </div>

          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            {detailedMessage}
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            {onRewrite && elem && (
              <button
                type="button"
                onClick={() => {
                  setPopoverOpen(false);
                  onRewrite(elem);
                }}
                className="btn btn-primary btn-sm"
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '5px 10px',
                  flex: 1,
                  justifyContent: 'center',
                }}
              >
                <Sparkles size={12} />
                <span>Reescribir</span>
              </button>
            )}
            {onDismiss && elem && (
              <button
                type="button"
                onClick={() => {
                  setPopoverOpen(false);
                  onDismiss(elem.id);
                }}
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 10px',
                  background: 'var(--surface-subtle)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                <Check size={12} />
                <span>Ignorar</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const computePages = (elements: ElementModel[], maxUnits = 14, firstPageOnly = false): ElementModel[][] => {
  const pages: ElementModel[][] = [];
  const coverElements: ElementModel[] = [];
  const bodyElements: ElementModel[] = [];

  elements.forEach((elem) => {
    if (elem.type === 'empty') return;
    if (elem.is_cover_section || elem.type === 'portada_block') {
      if (elem.type !== 'page_break') {
        coverElements.push(elem);
      }
    } else {
      bodyElements.push(elem);
    }
  });

  // ── Primer corte: la miniatura `onlyCover` solo necesita la página 1.
  //    Con portada, la 1 ES la portada y el cuerpo no se toca.
  if (firstPageOnly && coverElements.length > 0) return [coverElements];

  if (coverElements.length > 0) {
    pages.push(coverElements);
  }

  // ── Verdad de Word: si el backend paginó (Repaginate COM), sus cortes mandan.
  //    Sin page_number en ningún cuerpo → heurística de estimación (fallback).
  const hasWordPagination = bodyElements.some((e) => typeof e.page_number === 'number');
  if (hasWordPagination) {
    const wordPages: ElementModel[][] = [];
    let firstPageNum: number | null = null;
    bodyElements.forEach((elem) => {
      const pn = typeof elem.page_number === 'number' ? elem.page_number : null;
      if (pn === null) {
        // Sin número: sigue al anterior dentro de su página.
        if (wordPages.length === 0) wordPages.push([]);
        wordPages[wordPages.length - 1].push(elem);
        return;
      }
      if (firstPageNum === null) firstPageNum = pn;
      const idx = Math.max(0, pn - firstPageNum);
      while (wordPages.length <= idx) wordPages.push([]);
      wordPages[idx].push(elem);
    });
    const nonEmpty = wordPages.filter((pg) => pg.length > 0);
    if (coverElements.length > 0) {
      // Portada ya está en pages[0]; anexar cuerpo sin páginas vacías.
      return firstPageOnly ? [pages[0]] : [...pages, ...nonEmpty];
    }
    if (firstPageOnly) return [nonEmpty[0] ?? []];
    return nonEmpty.length > 0 ? nonEmpty : [[]];
  }

  let currentPage: ElementModel[] = [];
  let currentEstimatedHeight = 0;
  const MAX_PAGE_UNITS = Math.max(8, Math.round(maxUnits));

  bodyElements.forEach((elem) => {
    if (firstPageOnly && pages.length > 0) return;
    let units = 1;
    if (elem.type === 'heading') units = 2.5;
    if (elem.type === 'toc') units = 12;
    if (elem.type === 'image') units = 5;
    if (elem.type === 'table') units = Math.max(3, Math.ceil((elem.table_info?.rows?.length || 2) * 0.8));
    if (elem.type === 'paragraph' || elem.type === 'block_quote') {
      const text = elem.text || '';
      const lineBreaks = (text.match(/\n/g) || []).length;
      const charLines = Math.ceil(text.length / 90);
      const totalLines = Math.max(1, charLines + lineBreaks);
      units = Math.max(1, Math.ceil(totalLines / 2.0));
    }

    const isFirstBodyHeading = elem.type === 'heading' && elem.text && elem.text.toLowerCase().includes('introducc');
    const isLevel1Heading = elem.type === 'heading' && elem.heading_level === 1;
    const isToc = elem.type === 'toc';
    const pageHasToc = currentPage.some((e) => e.type === 'toc');

    if (
      elem.type === 'page_break' ||
      isToc ||
      pageHasToc ||
      isFirstBodyHeading ||
      (isLevel1Heading && currentPage.length > 0) ||
      (currentEstimatedHeight + units > MAX_PAGE_UNITS && currentPage.length > 0)
    ) {
      if (currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [];
        currentEstimatedHeight = 0;
      }
    }

    if (elem.type !== 'page_break') {
      currentPage.push(elem);
      currentEstimatedHeight += units;
    }
  });

  if (firstPageOnly && pages.length > 0) return [pages[0]];

  if (currentPage.length > 0) pages.push(currentPage);
  if (pages.length === 0) pages.push([]);

  return pages;
};

/** Reglas de hoja que necesita la geometría (subconjunto de APARuleSet). */
export type PageRules = Parameters<typeof getPageGeometry>[0];

export interface RenderedPagesInput {
  elements: ElementModel[];
  /** Reglas APA vigentes; si faltan, manda el default de getPageGeometry. */
  rules?: PageRules;
  /** Formato APA del documento: decide el alto del encabezado de página. */
  apaFormat?: string;
  /** Alturas medidas en el DOM (id → px). Sin mediciones no hay reflow. */
  heights?: Map<string, number> | null;
  /** `onlyCover`: devolver solo la página 1 (miniaturas de portada). */
  firstPageOnly?: boolean;
}

/**
 * LAS páginas que el lienzo realmente dibuja. Una sola paginación en la app:
 * el render del lienzo y el índice de findings llaman a ESTA función, así que
 * la densidad, la geometría y el reparto salen del mismo código.
 *
 * - La densidad sale de la altura real de la hoja (`maxUnits`), no de un 14 fijo.
 * - `heights` son las mediciones DOM del lienzo, y SÍ cambian el resultado:
 *   sin ellas `applyPageFlow` devuelve las páginas base intactas, que traen
 *   ~el doble de contenido que una hoja real (ver la calibración de `maxUnits`).
 *   Quien llame sin `heights` cuenta menos páginas que el lienzo: en prosa
 *   corriente de 100-300 caracteres por párrafo, del orden de 2x a 3x menos
 *   (1.7x a 2.6x con las alturas DOM reales que mide el lienzo).
 *   Además la lista del lienzo es una mezcla: fuera de la ventana de
 *   virtualización (`activePageIndex ± 4`) no hay medición, así que esas páginas
 *   se quedan en paginación base mientras las de adentro van refloweadas.
 */
export const computeRenderedPages = ({
  elements,
  rules,
  apaFormat,
  heights,
  firstPageOnly,
}: RenderedPagesInput): { geom: PageGeometry; pages: ElementModel[][] } => {
  // ── Geometría REAL del documento (Word como verdad): hoja en pt de Word a
  //    96 DPI + márgenes de rules. El zoom es CSS aparte, no aquí.
  const geom = getPageGeometry({
    margins_cm: (rules as any)?.margins_cm,
    font_size_pt: rules?.font_size_pt,
    line_spacing: rules?.line_spacing,
    page_size: (rules as any)?.page_size,
    professional_running_head: apaFormat === 'professional',
  });
  // Densidad tomada de la altura real de la hoja: pageH (Letter 1056px ·
  // A4 1123px) menos 96px de chrome, a 34px por unidad → 28 unidades en Letter,
  // 30 en A4.
  // OJO, calibración preexistente y AJENA a esta función: `computePages` carga
  // ~1 unidad por cada DOS líneas renderizadas (~64px) mientras este presupuesto
  // gasta 34px por unidad, así que una página base trae cerca del doble de
  // contenido que una hoja real (contentH: Letter 832px · A4 899px). Nadie lo
  // arregla acá porque cambia cuántas páginas dibuja el lienzo.
  const maxUnits = Math.max(18, Math.floor((Math.round(geom.pageH) - 96) / 34));
  // Reparto con alturas DOM reales: parte párrafos que exceden la hoja (sin recorte).
  return {
    geom,
    pages: applyPageFlow(computePages(elements, maxUnits, firstPageOnly), heights ?? new Map(), geom),
  };
};

export const PaperCanvas: React.FC<{ onElementClick?: (elementId: string, rect: DOMRect, element: any) => void; reviewHighlightIds?: Set<string>; aiMarks?: ReadonlyMap<string, number>; readOnly?: boolean; onlyCover?: boolean }> = ({ onElementClick, reviewHighlightIds, aiMarks, readOnly, onlyCover }) => {
  const { doc, rules, portada, selectedElementId, setSelectedElementId, setSelectedReferenceId, updateElementType, updateElementTable, zoomLevel, setZoomLevel, setForceRightPanelOpen, setWizardStep, setScrollTargetId, dismissComment, undo, redo, history, historyIndex, focusMode, setFocusMode, actionToast, clearActionToast } = useDocStore();
  const dismissedCommentIds = useDocStore((s) => s.dismissedCommentIds);
  const imagePanelOpen = useDocStore((s) => s.imagePanelOpen);
  const setImagePanelOpen = useDocStore((s) => s.setImagePanelOpen);
  /* Origen de marcas del lienzo. Vive ANTES del `if (!doc) return null` para no
     sumar otro hook despues de una salida temprana, y es el MISMO que usa la
     tarjeta de lectura (`useMarkSource`): un hallazgo no puede subrayarse en un
     canal y quedarse sin subrayar en el otro. La bandera de citas sale de acá. */
  const markBase = useMarkSourceBase();
  const [editingCoverElemId, setEditingCoverElemId] = useState<string | null>(null);
  const [editingCoverText, setEditingCoverText] = useState<string>('');

  /* Resaltado inline de revisión (vista Paso 5): fondo de acento suave en TODOS
     los tipos de elemento cuyo id esté en reviewHighlightIds. Sin prop → valores
     por defecto (fondo transparente), render idéntico al actual. */
  const reviewHighlightStyle = (id: string) => {
    /* Vista previa con manchas (Task 9): cuando hay marcas de IA, su tinte
       tiene precedencia sobre el resaltado de revisión. En el editor `aiMarks`
       llega ausente y este sino queda idéntico al anterior. */
    if (aiMarks?.has(id)) {
      return {
        backgroundColor: manchaDe(aiMarks.get(id) as number),
        borderRadius: 'var(--radius-sm)',
        transition: 'background-color 0.15s ease',
      };
    }
    const on = reviewHighlightIds?.has(id);
    return {
      backgroundColor: on ? 'var(--color-accent-soft)' : 'transparent',
      borderRadius: on ? 'var(--radius-sm)' : 0,
      transition: 'background-color 0.15s ease',
    };
  };

  // ── Medición DOM real (fase 1 motor híbrido): id → altura px ──
  // Solo se miden elementos renderizados COMPLETOS (los fragmentos partidos
  // no re-miden: conservarían solo su trozo y corromperían el total).
  const measuredRef = useRef<Map<string, number>>(new Map());
  const [, setMeasureTick] = useState(0);

  // Medición post-render: solo elementos con UN nodo completo (0 = virtualizados,
  // >1 = fragmentados → no re-medir para conservar la altura total).
  useEffect(() => {
    if (!doc || onlyCover) return;
    const map = measuredRef.current;
    const nextIds = new Set<string>();
    doc.elements.forEach((e) => nextIds.add(e.id));
    let changed = false;
    for (const id of Array.from(map.keys())) {
      if (!nextIds.has(id)) { map.delete(id); changed = true; }
    }
    nextIds.forEach((id) => {
      const nodes = document.querySelectorAll(`[id="paper-elem-${id}"]`);
      if (nodes.length !== 1) return;
      const h = (nodes[0] as HTMLElement).offsetHeight;
      if (h > 0 && map.get(id) !== h) { map.set(id, h); changed = true; }
    });
    if (changed) setMeasureTick((t) => t + 1);
  });

  /* El tamaño de hoja, reflejado en `<html data-page-size>`.
   *
   * La PAGINACIÓN de más arriba no lee este atributo: sale de `rules.page_size`
   * por `getPageGeometry`, que es la medida buena porque está en píxeles y la
   * paginación necesita números. El atributo es para el CSS —la hoja de
   * `design-system.css`, que antes tenía `210mm` escritos a mano y por eso
   * mostraba A4 mientras la paginación contaba Carta—.
   *
   * Vive acá y no en la pestaña que escribe el valor porque el lienzo se monta
   * siempre que hay un documento, y la pestaña solo si alguien abre Ajustes. Si
   * lo escribiera la pestaña, un documento guardado en A4 abriría con la hoja
   * de Carta hasta que alguien pasara por el hub. */
  useEffect(() => {
    aplicarPageSizeEnHtml(rules.page_size);
  }, [rules.page_size]);

  useEffect(() => {
    if (!actionToast) return;
    const timer = setTimeout(() => {
      clearActionToast();
    }, 2800);
    return () => clearTimeout(timer);
  }, [actionToast, clearActionToast]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.key === 'Escape' && focusMode) {
        setFocusMode(false);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, focusMode, setFocusMode]);

  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
  const [contextMenuElemId, setContextMenuElemId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [showAIHeatmap, setShowAIHeatmap] = useState<boolean>(true);
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [brokenFigureIds, setBrokenFigureIds] = useState<Record<string, string>>({});
  const [leyendaSugerida, setLeyendaSugerida] = useState<Record<string, string>>({});
  const [leyendaCargando, setLeyendaCargando] = useState<Record<string, boolean>>({});
  const [leyendaError, setLeyendaError] = useState<Record<string, string>>({});
  const [resizeState, setResizeState] = useState<{
    id: string;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    ratio: number;
  } | null>(null);
  const resizePendingRef = useRef<{ elemId: string; patch: any } | null>(null);
  const resizeTimerRef = useRef<number | null>(null);

  const flushResize = () => {
    if (resizePendingRef.current) {
      useDocStore.getState().updateElementImage(resizePendingRef.current.elemId, resizePendingRef.current.patch);
      resizePendingRef.current = null;
      resizeTimerRef.current = null;
    }
  };
  const wrapperRef = useRef<HTMLDivElement>(null);

  const startFigureResize = (e: React.PointerEvent, elem: ElementModel) => {
    if (!elem.image_info) return;
    /* SIN LOS DEFAULT DE 12 Y 8. Aquí el default NO es un dato que se muestra: es la
       última defensa para que el tirador de redimensionado no mida 0 y no se pueda
       agarrar. Sale del ancho ÚTIL de la hoja (`portada/geometria.ts`), o sea de
       la misma geometría que usa la portada, y no de un número que alguien escribió
       una vez. La medida real la dice el inspector, y ahí lo no declarado se DICE. */
    const utilCm = anchoUtilMm('carta') / 10;
    const w = elem.image_info.width_cm || utilCm;
    const h = elem.image_info.height_cm || utilCm * 0.66;
    setResizeState({
      id: elem.id,
      startX: e.clientX,
      startY: e.clientY,
      startW: w,
      startH: h,
      ratio: w / h,
    });
    e.stopPropagation();
    e.preventDefault();
  };

  const handleFigureResize = (e: React.PointerEvent) => {
    if (!resizeState) return;
    const dxPx = e.clientX - resizeState.startX;
    const dyPx = e.clientY - resizeState.startY;
    const dxCm = dxPx / 37.8;
    const dyCm = dyPx / 37.8;
    const lockRatio = !e.shiftKey;
    const elem = doc?.elements.find((x) => x.id === resizeState.id);
    if (!elem?.image_info) return;

    let patch: any;
    if (lockRatio) {
      const newW = Math.max(3, Math.min(16, resizeState.startW + dxCm));
      const newH = Math.round((newW / resizeState.ratio) * 10) / 10;
      patch = { ...elem.image_info, width_cm: Math.round(newW * 10) / 10, height_cm: newH };
    } else {
      const newW = Math.max(3, Math.min(16, resizeState.startW + dxCm));
      const newH = Math.max(3, Math.min(30, resizeState.startH + dyCm));
      patch = { ...elem.image_info, width_cm: Math.round(newW * 10) / 10, height_cm: Math.round(newH * 10) / 10 };
    }
    // Debounce: acumula el último parche y lo aplica cada 100ms
    resizePendingRef.current = { elemId: elem.id, patch };
    if (!resizeTimerRef.current) {
      resizeTimerRef.current = window.setTimeout(flushResize, 100);
    }
  };

  const endFigureResize = () => {
    flushResize();
    setResizeState(null);
  };


  const handleSuggestCaption = async (elem: ElementModel) => {
    if (!doc) return;
    setAiLoadingId(elem.id);
    try {
      // Contexto real: párrafos circundantes a la figura (el texto propio de
      // una imagen suele estar vacío, por eso la IA respondía con el prompt).
      const idx = doc.elements.findIndex((e) => e.id === elem.id);
      const ctx: string[] = [];
      for (let i = Math.max(0, idx - 2); i < Math.min(doc.elements.length, idx + 3); i++) {
        const e = doc.elements[i];
        if (e.id === elem.id) continue;
        if (e.type === 'paragraph' || e.type === 'heading' || e.type === 'bullet' || e.type === 'numbered_list') {
          const t = (e.text || '').trim();
          if (t) ctx.push(t);
        }
      }
      const contextText = ctx.join('\n') || elem.text || '';
      const apiKey = useDocStore.getState().apiKey;
      const suggestion = await suggestCaption(doc.session_id, elem.id, contextText, apiKey);
      if (elem.type === 'table') {
        const newTableInfo = { ...(elem.table_info || {}), caption: suggestion };
        useDocStore.getState().updateElementTable(elem.id, newTableInfo);
      } else {
        const newImageInfo = { ...elem.image_info, caption: suggestion };
        useDocStore.getState().updateElementImage(elem.id, newImageInfo);
      }
      useDocStore.getState().showToast('Leyenda sugerida aplicada', 'success');
    } catch (err: any) {
      useDocStore.getState().showToast(err.message || 'Error al sugerir leyenda', 'error');
    } finally {
      setAiLoadingId(null);
      setContextMenuElemId(null);
    }
  };

  const generarLeyendaTabla = async (elem: ElementModel) => {
    if (!doc) return;
    setLeyendaCargando((p) => ({ ...p, [elem.id]: true }));
    setLeyendaError((p) => ({ ...p, [elem.id]: '' }));
    try {
      const idx = doc.elements.findIndex((e) => e.id === elem.id);
      const ctx: string[] = [];
      for (let i = Math.max(0, idx - 2); i < Math.min(doc.elements.length, idx + 3); i++) {
        const e = doc.elements[i];
        if (e.id === elem.id) continue;
        if (e.type === 'paragraph' || e.type === 'heading' || e.type === 'bullet' || e.type === 'numbered_list') {
          const t = (e.text || '').trim();
          if (t) ctx.push(t);
        }
      }
      const texto = await suggestCaption(doc.session_id, elem.id, ctx.join('\n'), useDocStore.getState().apiKey);
      setLeyendaSugerida((p) => ({ ...p, [elem.id]: texto }));
    } catch (err: any) {
      setLeyendaError((p) => ({ ...p, [elem.id]: err?.message || 'No se pudo generar la leyenda' }));
    } finally {
      setLeyendaCargando((p) => ({ ...p, [elem.id]: false }));
    }
  };

  const handleRewriteText = async (elem: ElementModel) => {
    if (!doc) return;
    const instruction = prompt("Instrucción para reescribir (ej. 'Hazlo más formal' o 'Corrige ortografía'):", "Corrige la gramática y adapta al tono académico APA.");
    if (!instruction) return;
    
    setAiLoadingId(elem.id);
    try {
      const apiKey = useDocStore.getState().apiKey;
      const rewritten = await rewriteText(doc.session_id, elem.id, elem.text, instruction, apiKey);
      useDocStore.getState().updateElementType(elem.id, elem.type, elem.heading_level, rewritten);
      useDocStore.getState().showToast('Texto reescrito aplicado', 'success');
    } catch (err: any) {
      useDocStore.getState().showToast(err.message || 'Error al reescribir', 'error');
    } finally {
      setAiLoadingId(null);
      setContextMenuElemId(null);
    }
  };

  // Zoom con Ctrl + scroll. El handler SOLO llama preventDefault cuando Ctrl
  // está presionado (para hacer zoom). Cuando no lo está, no hace nada y deja
  // que el navegador haga scroll normal de la página. { passive: false } se
  // mantiene porque necesitamos poder llamar preventDefault en el caso del zoom.
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 10 : -10;
        const s = useDocStore.getState();
        s.setZoomLevel(s.zoomLevel + delta);
      }
      // Cuando Ctrl NO está presionado: no hacemos nada, el navegador hace
      // scroll normalmente. Esto evita bloquear el scroll de la página.
    };

    const el = wrapperRef.current;
    if (el) {
      el.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (el) el.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Scroll automático y resalte suave al seleccionar cualquier elemento desde el esquema o asistente
  useEffect(() => {
    if (selectedElementId && doc && !onlyCover) {
      // Si el elemento está en una página virtualizada lejana, activar esa página de inmediato.
      // Mismas páginas que dibuja el lienzo (no una cuenta con otra densidad).
      const docPages = computeRenderedPages({
        elements: doc.elements,
        rules,
        apaFormat: doc.apa_format,
        heights: measuredRef.current,
      }).pages;
      const pIdx = docPages.findIndex((p) => p.some((e) => e.id === selectedElementId));
      if (pIdx !== -1 && pIdx !== activePageIndex) {
        setActivePageIndex(pIdx);
      }

      let attempts = 0;
      let timer: any = null;

      const tryScroll = () => {
        const targetEl = document.getElementById(`paper-elem-${selectedElementId}`);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const prev = (targetEl as HTMLElement).style.boxShadow;
          (targetEl as HTMLElement).style.transition = 'box-shadow 0.3s';
          (targetEl as HTMLElement).style.boxShadow = 'inset 0 0 0 3px var(--accent-primary)';
          window.setTimeout(() => {
            (targetEl as HTMLElement).style.boxShadow = prev;
          }, 1400);
        } else if (attempts < 5) {
          attempts++;
          timer = setTimeout(() => requestAnimationFrame(tryScroll), 50 * attempts);
        }
      };

      requestAnimationFrame(tryScroll);
      return () => { if (timer) clearTimeout(timer); };
    }
  }, [selectedElementId, doc, rules, onlyCover]);

  // Scroll del DocumentOutline / auto-scroll a Referencias o Figuras SIN abrir el inspector
  const scrollTargetId = useDocStore((s) => s.scrollTargetId);
  useEffect(() => {
    if (scrollTargetId && doc && !onlyCover) {
      const pages = computeRenderedPages({
        elements: doc.elements,
        rules,
        apaFormat: doc.apa_format,
        heights: measuredRef.current,
      }).pages;
      const pageIdx = pages.findIndex((p) => p.some((e) => e.id === scrollTargetId));
      if (pageIdx !== -1 && pageIdx !== activePageIndex) {
        setActivePageIndex(pageIdx);
      }

      let attempts = 0;
      let timer: any = null;

      const tryScrollTarget = () => {
        const targetEl = document.getElementById(`paper-elem-${scrollTargetId}`);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetEl.classList.remove('target-glow-flash');
          void targetEl.offsetWidth;
          targetEl.classList.add('target-glow-flash');
        } else if (attempts < 6) {
          attempts++;
          timer = setTimeout(() => requestAnimationFrame(tryScrollTarget), 60 * attempts);
        }
      };

      requestAnimationFrame(tryScrollTarget);
      return () => { if (timer) clearTimeout(timer); };
    }
  }, [scrollTargetId, doc, rules, onlyCover]);

  // ── Marcas de transparencia: mapa elemento → etiqueta (SOLO LECTURA) ──
  // Lo escribe `store/slices/auditSlice` por `lib/marcasMap`, y se lee con la
  // MISMA función: leer el `localStorage` a mano aquí significaba leer la forma
  // vieja y mostrar `undefined` en cada marca sin que nada dijera nada.
  const marcasVisibles = useDocStore((s) => s.marcasVisibles);
  const layoutCuts = useDocStore((s) => s.layoutCuts);
  const [marcasMap, setMarcasMap] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!marcasVisibles) { setMarcasMap({}); return; }
    const load = () => setMarcasMap(leerMarcas());
    load();
    window.addEventListener('storage', load);
    return () => window.removeEventListener('storage', load);
  }, [marcasVisibles, doc]);

  // ── Fase 2: repaginación en vivo con Word COM ──
  useLayoutRepaginate(onlyCover ? null : doc);

  // ── Fase 4: capa PDF en reposo ──
  const { restLayerState, notifyMutation } = usePdfRestLayer(onlyCover ? null : (doc?.session_id ?? null));

  // Al detectar mutación (tecleo), pasar a hidden inmediatamente.
  // Usamos un ref para evitar loops: solo notificamos cuando hay un cambio
  // real en doc?.elements, no en cada render.
  const prevElementsRef = useRef(doc?.elements);
  useEffect(() => {
    if (prevElementsRef.current !== doc?.elements) {
      prevElementsRef.current = doc?.elements;
      if (restLayerState.status === 'ready') {
        notifyMutation();
      }
    }
  }, [doc?.elements, restLayerState.status, notifyMutation]);

  // Al llegar cortes Word, los ids se fragmentan (mismo id, >1 nodos →
  // querySelectorAll no re-mide) y conservarían la altura STALE del elemento
  // COMPLETO. Se borra: el flow usa estimación por trozo o deja la página
  // intacta (= verdad Word agrupada por page_number).
  const cutsKey = Object.keys(layoutCuts || {}).join(',');
  useEffect(() => {
    const map = measuredRef.current;
    let changed = false;
    for (const id of Object.keys(layoutCuts || {})) {
      if (map.delete(id)) changed = true;
    }
    if (changed) setMeasureTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutsKey]);

  if (!doc) return null;

  const fontFamily = rules.font_family || 'Times New Roman';

  // Geometría REAL + paginación REAL en una sola llamada compartida con el
  // índice de findings (computeRenderedPages): densidad por altura de hoja y
  // reflow por alturas medidas, sin una segunda cuenta en ningún lado.
  // ── Verdad Word: fragmenta por cortes reales ANTES de agrupar páginas ──
  const flowElems = expandByLineCuts(doc.elements, layoutCuts);
  const { geom, pages } = computeRenderedPages({
    elements: flowElems,
    rules,
    apaFormat: doc.apa_format,
    heights: measuredRef.current,
    firstPageOnly: !!onlyCover,
  });
  const PAGE_W = Math.round(geom.pageW);   // Letter 816px · A4 793px
  const PAGE_H = Math.round(geom.pageH);   // Letter 1056px · A4 1123px

  // ── Comentarios: fallas estructurales siempre; estilo solo tras auditar ──
  // Mismo constructor que los subrayados inline (`useMarkSourceBase`): si hay
  // burbuja, hay subrayado, y esa regla no se re-declara por canal.
  const { commentCtx } = markBase;
  // Los resaltados inline tienen una sola implementación (ReadingText) y una
  // sola fuente de marcas (`useMarkSource`): acá solo se le pasa el elemento.
  const readingSource = (target: ElementModel): MarkSource => buildMarkSource(markBase, target);
  // Un solo festejo: SOLO si el documento entero está impecable (cero comentarios).
  const positiveMap = new Map<string, boolean>();
  // Geometría de gutter: SI el documento tiene al menos un comentario, TODAS las
  // páginas reservan los mismos espaciadores (izq+der) → filas idénticas, hoja
  // siempre centrada, sin zigzag ni clipping lateral.
  const isMobile = useIsMobile();
  let docHasComments = false;
  if (!isMobile) {
    let anyComment = false;
    for (const pageElements of pages) {
      for (const e of pageElements) {
        if (getWhatsAppComment(e, commentCtx, 0) !== null) { anyComment = true; break; }
      }
      if (anyComment) break;
    }
    if (!anyComment) {
      for (const pageElements of pages) {
        const h = pageElements.find((e) => e.type === 'heading' && !e.is_cover_section);
        if (h) { positiveMap.set(h.id, true); break; }
      }
    }
    docHasComments = anyComment || positiveMap.size > 0;
  }

  // ── Gutter de comentarios (estilo Word): burbujas FUERA de la hoja, en una
  // columna a la derecha de cada página, alineadas con el elemento que señalan.
  // El offsetTop de cada elemento (medido tras pintar) define la posición.
  const allGutterIds = React.useMemo(() => {
    const set = new Set<string>();
    for (const page of pages) {
      for (const e of page) {
        if (positiveMap.get(e.id) || getWhatsAppComment(e, commentCtx, 0) !== null) set.add(e.id);
      }
    }
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, pages, positiveMap]);
  const [gutterOffsets, setGutterOffsets] = useState<Record<string, number>>({});

  useLayoutEffect(() => {
    const next: Record<string, number> = {};
    allGutterIds.forEach((id) => {
      const el = document.getElementById(`paper-elem-${id}`);
      if (el) next[id] = el.offsetTop;
    });
    setGutterOffsets((prev) => {
      let changed = Object.keys(prev).length !== Object.keys(next).length;
      if (!changed) {
        for (const k of Object.keys(next)) {
          if (prev[k] !== next[k]) { changed = true; break; }
        }
      }
      return changed ? next : prev;
    });
  }, [allGutterIds, doc, zoomLevel]);

  // Acción "Resolver" del comentario inline: enfoca el panel lateral correcto.
  const handleResolveComment = (comment: WhatsAppCommentData, elem: ElementModel) => {
    setForceRightPanelOpen(true);
    if (comment.kind === 'ghost_citation' || comment.kind === 'orphan_references') {
      setSelectedElementId(null);
      setSelectedReferenceId(null);
      setWizardStep(4);
      setScrollTargetId(elem.id);
      return;
    }
    setSelectedElementId(elem.id);
    if (comment.kind && comment.kind.startsWith('validation_') && (comment.kind.includes('figur') || comment.kind.includes('tabla'))) {
      setWizardStep(3); // inspector de la figura/tabla
    } else {
      // Para problemas de redacción, muletillas, repetición, etc.:
      // 1) scroll suave al elemento exacto en la hoja
      const domElem = document.getElementById(`paper-elem-${elem.id}`);
      if (domElem) domElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // 2) activar modo de edición directa
      if (elem.type === 'paragraph' || elem.type === 'bullet' || elem.type === 'numbered_list' || elem.type === 'heading') {
        setEditingId(elem.id);
        setEditValue(elem.text || '');
      }
      // 3) abrir copiloto IA
      useDocStore.getState().setLiveChatOpen(true);
    }
    setScrollTargetId(elem.id);
  };

  let globalListCounter = 0;

  // Numeración JERÁRQUICA de títulos (1, 1.1, 1.1.1) aplicada SOLO en el preview.
  // La lógica vive en `numeracionTitulos` para que la vista previa del índice
  // consuma exactamente la misma fuente que la hoja.
  const headingDisplayText = construirTextosDeTitulo(doc.elements, rules);
  /* La página REAL de cada encabezado, con las MISMAS páginas que dibuja el
   * lienzo. Antes el índice inventaba un número a mano; donde no hay dato va un
   * guion, que es la respuesta honesta. */
  const paginaDe = useMemo(() => paginasPorElemento(pages), [pages]);

  return (
    <div
      ref={wrapperRef}
      className="paper-canvas-scroll"
      style={{
        flex: 1,
        height: '100%',
        minHeight: 0,
        overflowY: 'auto',
        backgroundColor: 'var(--canvas-bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 16px',
        position: 'relative',
        overscrollBehavior: 'contain'
      }}
    >
      {/* Lente IA Quirúrgica (Micro-píldora flotante en selección de texto) */}
      <InlineAILens containerRef={wrapperRef} />

      {/* Zoom control minimalista — reemplaza la barra flotante gigante */}
      <div style={{
        position: 'sticky',
        bottom: '8px',
        zIndex: 50,
        alignSelf: 'flex-end',
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        backgroundColor: 'var(--surface-elevated)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-full)',
        padding: '3px 4px',
        marginBottom: '8px',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <button
          onClick={undo}
          disabled={historyIndex <= 0}
          title="Deshacer (Ctrl+Z)"
          style={{
            border: 'none',
            background: 'transparent',
            cursor: historyIndex > 0 ? 'pointer' : 'default',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            color: historyIndex > 0 ? 'var(--text-secondary)' : 'var(--border-strong)',
            opacity: historyIndex > 0 ? 1 : 0.4,
          }}
        >
          <Undo2 size={14} />
        </button>
        <button
          onClick={redo}
          disabled={historyIndex >= history.length - 1}
          title="Rehacer (Ctrl+Y)"
          style={{
            border: 'none',
            background: 'transparent',
            cursor: historyIndex < history.length - 1 ? 'pointer' : 'default',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            color: historyIndex < history.length - 1 ? 'var(--text-secondary)' : 'var(--border-strong)',
            opacity: historyIndex < history.length - 1 ? 1 : 0.4,
          }}
        >
          <Redo2 size={14} />
        </button>
        <div style={{ width: '1px', height: '12px', backgroundColor: 'var(--border-subtle)', margin: '0 2px' }} />
        <button
          onClick={() => setZoomLevel(zoomLevel - 10)}
          title="Reducir Zoom"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}
        >
          <ZoomOut size={14} />
        </button>
        <span style={{ fontWeight: 600, minWidth: '36px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)' }}>{zoomLevel}%</span>
        <button
          onClick={() => setZoomLevel(zoomLevel + 10)}
          title="Aumentar Zoom"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}
        >
          <ZoomIn size={14} />
        </button>
        <div style={{ width: '1px', height: '12px', backgroundColor: 'var(--border-subtle)', margin: '0 2px' }} />
        <button
          onClick={() => setFocusMode(!focusMode)}
          title={focusMode ? 'Salir del Modo Foco (Esc)' : 'Modo Foco / Pantalla Completa'}
          style={{
            border: 'none',
            background: focusMode ? 'var(--color-accent-soft)' : 'transparent',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: 'var(--radius-xs)',
            display: 'flex',
            alignItems: 'center',
            color: focusMode ? 'var(--accent-primary)' : 'var(--text-secondary)',
          }}
        >
          {focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      {/* Micro-Toast de Acción con Deshacer */}
      {actionToast && (
        <div
          className="canvas-toast-enter"
          style={{
            position: 'fixed',
            bottom: '56px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            backgroundColor: 'var(--color-bg-surface)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-full)',
            padding: '6px 16px',
            boxShadow: 'var(--shadow-card)',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          <span>{actionToast.message}</span>
          <button
            type="button"
            onClick={() => {
              undo();
              clearActionToast();
            }}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--accent-primary)',
              fontWeight: 700,
              cursor: 'pointer',
              padding: '2px 4px',
              borderRadius: 'var(--radius-xs)',
              fontSize: '12px',
            }}
          >
            Deshacer
          </button>
          <button
            type="button"
            onClick={clearActionToast}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Barra contextual de imagen (estilo Word: aparece al seleccionar una figura) */}
      {!readOnly && doc && selectedElementId && (() => {
        const selElem = doc.elements.find(e => e.id === selectedElementId);
        // C5: Show the contextual bar for images AND tables.
        if (!selElem || (selElem.type !== 'image' && selElem.type !== 'table')) return null;
        const img = selElem.image_info;
        const rot = img?.rotation || 0;
        const isImage = selElem.type === 'image' && !!img;
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
            backgroundColor: 'var(--surface-elevated)',
            border: '1px solid var(--accent-primary)',
            borderRadius: 'var(--radius-md)', padding: '6px 12px', marginBottom: '12px',
            fontSize: '11px', color: 'var(--text-secondary)', boxShadow: 'var(--shadow-md)',
          }}>
            <span style={{ fontWeight: 700, color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ImageIcon size={13} /> {isImage ? 'Imagen' : 'Tabla'} seleccionada
            </span>
            <span style={{ color: 'var(--text-muted)' }}>|</span>
            {/* C5: Rotación + Ancho solo para imágenes */}
            {isImage && (
            <>
            {/* Rotación */}
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              Rotar:
              {[0, 90, 180, 270].map((deg) => (
                <button key={deg} type="button"
                  onClick={() => useDocStore.getState().updateElementImage(selElem.id, { rotation: deg })}
                  title={`Rotar ${deg}°`}
                  style={{
                    padding: '2px 6px', borderRadius: 'var(--radius-xs)', cursor: 'pointer', fontSize: '10px',
                    background: rot === deg ? 'var(--accent-primary)' : 'var(--surface-subtle)',
                    color: rot === deg ? 'var(--color-text-on-accent)' : 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)', fontWeight: 600,
                  }}>
                  {deg === 0 ? '0°' : `${deg}°`}
                </button>
              ))}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>|</span>
            {/* Ancho */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              Ancho
              {/* Sin el default de 12: un `12` en el campo cuando el documento no
                  declara 12 es un dato falso, y el `parseFloat` de un campo vacío
                  terminaba escribiendo 12 con solo borrar el contenido. Vacío es
                  vacío; el inspector dice el tamaño real. */}
              <input type="number" min={2} max={20} step={0.5} placeholder="sin declarar"
                value={img.width_cm ?? ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  useDocStore.getState().updateElementImage(selElem.id, {
                    width_cm: Number.isFinite(v) && v > 0 ? v : undefined,
                  });
                }}
                style={{ width: '56px', padding: '2px 4px', fontSize: '10px', background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)', color: 'var(--text-main)' }}
              /> cm
            </label>
            </>
            )}
            {/* C5: Leyenda — funciona para imágenes (image_info.caption) y tablas (table_info.caption) */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, minWidth: '120px' }}>
              Leyenda
              <input type="text"
                value={(isImage ? img.caption : selElem.table_info?.caption) || ''}
                onChange={(e) => {
                  if (isImage) {
                    useDocStore.getState().updateElementImage(selElem.id, { caption: e.target.value });
                  } else {
                    const ti = selElem.table_info || {};
                    useDocStore.getState().updateElementTable(selElem.id, { ...ti, caption: e.target.value });
                  }
                }}
                placeholder={isImage ? "Escribí la leyenda de la figura..." : "Escribí el título de la tabla..."}
                style={{ flex: 1, padding: '3px 6px', fontSize: '10px', background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)', color: 'var(--text-main)' }}
              />
            </label>
            {/* C5: Sugerir con IA — visible para imágenes Y tablas */}
            <button type="button"
              onClick={() => handleSuggestCaption(selElem)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', fontSize: '10px', fontWeight: 600,
                background: 'var(--accent-primary)', color: 'var(--color-text-on-accent)', border: 'none', borderRadius: 'var(--radius-xs)', cursor: 'pointer',
              }}>
              <Wand2 size={11} /> Sugerir leyenda IA
            </button>
            {!isImage && selElem.table_info && (
              <TablaEstiloSelector
                valor={selElem.table_info.style}
                onChange={(p) => useDocStore.getState().updateElementTable(selElem.id, { ...selElem.table_info!, style: p })}
              />
            )}
            {/* C5: Panel de edición completo — solo para imágenes */}
            {isImage && (
            <button
              type="button"
              onClick={() => setImagePanelOpen(!imagePanelOpen)}
              aria-pressed={imagePanelOpen}
              title="Mostrar u ocultar el panel de edición de la imagen"
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', fontSize: '10px', fontWeight: 600,
                background: imagePanelOpen ? 'var(--color-accent-soft)' : 'var(--surface-subtle)',
                color: imagePanelOpen ? 'var(--accent-primary)' : 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)', cursor: 'pointer',
              }}>
              <PanelRight size={11} /> Editar panel
            </button>
            )}
          </div>
        );
      })()}

      {/* Fase 4: capa PDF en reposo (detrás del HTML) */}
      <PdfRestLayer
        pdfUrl={restLayerState.pdfUrl}
        pageCount={restLayerState.pageCount}
        status={restLayerState.status}
      />

      {/* Renderizado de Páginas */}
      <div style={{
        position: 'relative',
        zIndex: 2,
        zoom: zoomLevel / 100,
        transition: 'zoom 0.15s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px'
      }}>
        {(onlyCover ? pages.slice(0, 1) : pages).map((pageElements, pageIdx) => {
          const isCoverPage = pageIdx === 0;
          const hasTocElement = pageElements.some(e => e.type === 'toc');
          const showPageNumber = !isCoverPage && !hasTocElement;

          // Separar elementos de portada en bloques lógicos para renderizado limpio
          let coverHeaderTexts: ElementModel[] = [];
          let coverAuthorTexts: ElementModel[] = [];
          let coverFooterTexts: ElementModel[] = [];
          // CHANGE 2: Detect ANY image on the cover page (not just those wider than 2cm)
          const coverLogoImage = pageElements.find(e => (e.is_cover_section || e.type === 'portada_block') && e.image_info && e.image_info.relative_url);

          if (isCoverPage) {
            pageElements.forEach(e => {
              if (e.is_cover_section || e.type === 'portada_block') {
                const txt = (e.text || '').trim();
                const txtLower = txt.toLowerCase();

                if (
                  txtLower.includes('elaborado por') ||
                  txtLower.includes('presentado por') ||
                  txtLower.includes('br.') ||
                  txtLower.includes('carnet') ||
                  txtLower.includes('carne') ||
                  txtLower.includes('tutor') ||
                  txtLower.includes('autor')
                ) {
                  coverAuthorTexts.push(e);
                } else if (
                  txtLower.includes('docente') ||
                  txtLower.includes('profesor') ||
                  txtLower.includes('grupo') ||
                  txtLower.includes('managua') ||
                  txtLower.includes('nicaragua') ||
                  txtLower.includes('recinto') ||
                  txtLower.includes('fecha') ||
                  /\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/.test(txtLower) ||
                  /\b\d{4}\b/.test(txtLower)
                ) {
                  coverFooterTexts.push(e);
                } else if (txt) {
                  coverHeaderTexts.push(e);
                }
              }
            });
          }

          // Defensa en profundidad: colapsar bloques duplicados del original
          coverHeaderTexts = dedupCoverAuthors(coverHeaderTexts);
          coverAuthorTexts = dedupCoverAuthors(coverAuthorTexts);
          coverFooterTexts = dedupCoverAuthors(coverFooterTexts);

          // Elementos con comentario en esta página. Si hay gutter de comentarios,
          // se reserva un espaciador simétrico a la IZQUIERDA para que la hoja
          // permanezca centrada (antes solo el gutter derecho empujaba la hoja
          // ~135px y "bailaba" al activarse/desactivar comentarios).
          const pageCommentElems = pageElements.filter((e) => !dismissedCommentIds.includes(e.id) && (positiveMap.get(e.id) || getWhatsAppComment(e, commentCtx, 0) !== null));

          // Detección de tabla apaisada/horizontal en la página actual
          const hasLandscapeTable = pageElements.some(
            (e) => e.type === 'table' && e.table_info?.orientation === 'landscape'
          );
          const currentPageW = hasLandscapeTable ? PAGE_H : PAGE_W;
          const currentPageH = hasLandscapeTable ? PAGE_W : PAGE_H;

          // Virtualización segura de páginas cuando el documento es muy extenso (>12 páginas):
          // Solo renderiza el DOM completo para las páginas dentro del rango [activePageIndex - 4, activePageIndex + 4].
          // Las demás se renderizan como contenedores livianos para mantener fluida la UI sin perder cálculos ni auditorías.
          const isWindowed = pages.length > 12;
          const activeWindowStart = Math.max(0, activePageIndex - 4);
          const activeWindowEnd = Math.min(pages.length - 1, activePageIndex + 4);

          if (isWindowed && (pageIdx < activeWindowStart || pageIdx > activeWindowEnd)) {
            return (
              <div key={pageIdx} id={`paper-page-${pageIdx}`} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: '16px', position: 'relative', minWidth: 'fit-content' }}>
                {docHasComments && <div style={{ width: '250px', flexShrink: 0, pointerEvents: 'none' }} />}
                <div
                  onClick={() => setActivePageIndex(pageIdx)}
                  style={{
                    width: `${currentPageW}px`,
                    height: `${currentPageH}px`,
                    backgroundColor: 'var(--paper-white)',
                    boxShadow: 'var(--shadow-lg)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--paper-ink)',
                    cursor: 'pointer',
                    borderRadius: 'var(--radius-xs)',
                  }}
                >
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>Página {pageIdx + 1} de {pages.length}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Haz clic para enfocar esta página</span>
                </div>
                {docHasComments && <div style={{ width: '250px', flexShrink: 0, pointerEvents: 'none' }} />}
              </div>
            );
          }

          return (
            <div key={pageIdx} id={`paper-page-${pageIdx}`} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: isMobile ? '0px' : '16px', position: 'relative', minWidth: isMobile ? '100%' : 'fit-content' }}>
              {docHasComments && (
                <div style={{ width: '250px', flexShrink: 0, pointerEvents: 'none' }} />
              )}
              <div
                style={{
                  width: isMobile ? '100%' : `${currentPageW}px`,
                  maxWidth: `${currentPageW}px`,
                  height: isMobile ? 'auto' : `${currentPageH}px`,
                  minHeight: isMobile ? '500px' : undefined,
                  overflow: 'hidden',
                  backgroundColor: 'var(--paper-white)',
                  boxShadow: '0 8px 32px var(--scrim-overlay), 0 2px 8px var(--color-ink-a12)',
                  // Margen real del documento (Word: mismo valor en 4 lados)
                  padding: `${Math.round(geom.marginPx)}px`,
                  boxSizing: 'border-box',
                  position: 'relative',
                  fontFamily: fontFamily,
                  fontSize: `${rules.font_size_pt}pt`,
                  color: 'var(--paper-ink)',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Encabezado Superior de Página: APA 7 exige sin número en portada e índice */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '10pt',
                  fontFamily: fontFamily,
                  marginBottom: '16px',
                  color: 'var(--paper-ink)',
                  minHeight: '20px'
                }}>
                  {doc.apa_format === 'professional' && showPageNumber ? (
                    <span style={{ fontWeight: 600 }}>RUNNING HEAD</span>
                  ) : (
                    <span></span>
                  )}
                  <span>{showPageNumber ? pageIdx + 1 : ''}</span>
                </div>

                {/* RENDERIZADO ESTRUCTURADO DE PORTADA EN PÁGINA 1
                    La cadena ternaria evalúa en orden:
                    1. cover_mode === 'generate_uni_cover' && !use_original_cover → UNICoverPreview
                    2. !use_original_cover → APACoverEditor
                    3. isCoverPage con elementos de portada → Structured cover
                       (renderiza logo, textos de encabezado, autores y pie — incluso
                        cuando use_original_cover es true, para que el usuario VEA la
                        portada original en lugar de un placeholder)
                    4. else → Standard body rendering */}
                {isCoverPage && (portada.cover_mode === 'generate_uni_cover') && !portada.use_original_cover ? (
                  <UNICoverPreview />
                ) : isCoverPage && !portada.use_original_cover ? (
                  <APACoverEditor soloLectura={readOnly} />
                ) : isCoverPage && (coverHeaderTexts.length > 0 || coverAuthorTexts.length > 0 || coverFooterTexts.length > 0 || !!coverLogoImage || pageElements.some(e => e.is_cover_section || e.type === 'portada_block')) ? (
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between', minHeight: 0, padding: '4px 0' }}>

                    {/* Badge sutil: portada original conservada */}
                    {portada.use_original_cover && (
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        alignSelf: 'center',
                        fontSize: '8pt',
                        color: 'var(--text-muted)',
                        backgroundColor: 'var(--surface-subtle)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-xs)',
                        padding: '1px 8px',
                        marginBottom: '4px',
                        fontStyle: 'italic',
                      }}>
                        Portada original conservada
                      </div>
                    )}

                    {/* Logo institucional (si existe) */}
                    {(() => {
                      const coverLogoImage = pageElements.find(
                        (e) => e.type === 'image' && e.image_info?.relative_url
                      ) || (doc?.elements || []).find(
                        (e) => (e.is_cover_section || e.type === 'portada_block') && e.type === 'image' && e.image_info?.relative_url
                      );
                      const logoUrl = portada?.logo_url || coverLogoImage?.image_info?.relative_url;
                      if (!logoUrl) return null;
                      return (
                        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                          <img
                            src={resolveAssetUrl(logoUrl)}
                            alt="Logo institucional"
                            style={{ maxHeight: '90px', maxWidth: '280px', objectFit: 'contain' }}
                          />
                        </div>
                      );
                    })()}

                    {/* Renderizado secuencial de TODOS los elementos de portada en orden original con grilla para autores */}
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-evenly' }}>
                    {(() => {
                      const rawCoverElements = pageElements
                        .filter(e => (e.is_cover_section || e.type === 'portada_block') && !e.image_info);

                      type CoverGroup =
                        | { kind: 'single'; elem: ElementModel }
                        | { kind: 'author_grid'; elems: ElementModel[]; cards: CoverAuthorCard[] }
                        | { kind: 'columns'; columns: ElementModel[][] };

                      const coverGroups: CoverGroup[] = [];
                      const authorElems: ElementModel[] = [];
                      const tutorElems: ElementModel[] = [];

                      const isCoverMember = (e: ElementModel): boolean =>
                        isCoverAuthorElement(e) || isCoverTutorElement(e);
                      const coverMembers = rawCoverElements.filter(isCoverMember);
                      // Si el original traía cuadros de texto con posición horizontal,
                      // reconstruimos sus columnas reales (p. ej. el tutor a la derecha).
                      const hasColumnLayout = coverMembers.some(
                        (e) => parseAnchorEmu(e.anchor_pos_h) !== null
                      );

                      if (hasColumnLayout) {
                        let columnsPushed = false;
                        rawCoverElements.forEach((elem) => {
                          if (isCoverMember(elem)) {
                            if (!columnsPushed) {
                              coverGroups.push({ kind: 'columns', columns: buildCoverColumns(coverMembers) });
                              columnsPushed = true;
                            }
                            return;
                          }
                          coverGroups.push({ kind: 'single', elem });
                        });
                      } else {
                      // 1. Separar autores y tutores para evitar fragmentación de la grilla
                      rawCoverElements.forEach((elem) => {
                        if (isCoverAuthorElement(elem)) {
                          authorElems.push(elem);
                        } else if (isCoverTutorElement(elem)) {
                          tutorElems.push(elem);
                        } else {
                          // Si ya teníamos autores acumulados y encontramos un separador (ej: fecha o pie de página), los volcamos
                          if (authorElems.length > 0) {
                            const allCards = authorElems.flatMap(parseCoverAuthorCards);
                            if (allCards.length > 1) {
                              coverGroups.push({ kind: 'author_grid', elems: [...authorElems], cards: allCards });
                            } else {
                              authorElems.forEach((e) => coverGroups.push({ kind: 'single', elem: e }));
                            }
                            authorElems.length = 0;
                          }
                          // Si hay docentes acumulados, los colocamos inmediatamente antes del pie de página
                          if (tutorElems.length > 0) {
                            tutorElems.forEach((t) => coverGroups.push({ kind: 'single', elem: t }));
                            tutorElems.length = 0;
                          }
                          coverGroups.push({ kind: 'single', elem });
                        }
                      });

                      // Volcar cualquier autor o tutor restante
                      if (authorElems.length > 0) {
                        const allCards = authorElems.flatMap(parseCoverAuthorCards);
                        if (allCards.length > 1) {
                          coverGroups.push({ kind: 'author_grid', elems: [...authorElems], cards: allCards });
                        } else {
                          authorElems.forEach((e) => coverGroups.push({ kind: 'single', elem: e }));
                        }
                        authorElems.length = 0;
                      }

                      if (tutorElems.length > 0) {
                        tutorElems.forEach((t) => coverGroups.push({ kind: 'single', elem: t }));
                        tutorElems.length = 0;
                      }
                      }

                      const renderCoverSingle = (elem: ElementModel) => {
                        /* Read-only (vista previa): la portada se mide, no se escribe.
                           El editor no se abre ni aunque el doble clic fije el estado. */
                        const isEditing = !readOnly && editingCoverElemId === elem.id;
                        const isSelected = selectedElementId === elem.id;
                        const align = (elem.alignment as any) || 'center';
                        const bold = elem.is_bold || false;
                        const fontSize = elem.font_size ? `${elem.font_size}pt` : '11pt';
                        if (!elem.text?.trim()) return null;

                        if (isEditing) {
                          return (
                            <div key={elem.id} style={{ width: '100%', margin: '1px 0' }}>
                              <textarea
                                autoFocus
                                value={editingCoverText}
                                onChange={(e) => setEditingCoverText(e.target.value)}
                                onBlur={() => {
                                  if (editingCoverText !== elem.text) {
                                    useDocStore.getState().updateElementText(elem.id, editingCoverText);
                                  }
                                  setEditingCoverElemId(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    if (editingCoverText !== elem.text) {
                                      useDocStore.getState().updateElementText(elem.id, editingCoverText);
                                    }
                                    setEditingCoverElemId(null);
                                  } else if (e.key === 'Escape') {
                                    setEditingCoverElemId(null);
                                  }
                                }}
                                style={{
                                  width: '100%',
                                  fontFamily: fontFamily,
                                  fontSize,
                                  fontWeight: bold ? 'bold' : 'normal',
                                  textAlign: align,
                                  border: '2px solid var(--accent-primary)',
                                  borderRadius: 'var(--radius-xs)',
                                  padding: '3px 8px',
                                  background: 'var(--paper-white)',
                                  color: 'var(--paper-ink)',
                                  resize: 'vertical',
                                  outline: 'none',
                                  boxSizing: 'border-box',
                                  boxShadow: '0 0 0 3px var(--color-accent-a20)',
                                  minHeight: '28px',
                                }}
                              />
                            </div>
                          );
                        }

                        // "Ing." termina en punto, así que un \b tras \. nunca casa
                        // con el espacio siguiente; sin boundary el tutor sí se rotula.
                        const isDocenteElem = /^(?:ing\.|lic\.|dr\.|dra\.|m\.sc\.|docente|tutor|profesor|asesor)/i.test(elem.text.trim());

                        return (
                          <div
                            key={elem.id}
                            id={`paper-elem-${elem.id}`}
                            title="Doble clic para editar"
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditingCoverElemId(elem.id);
                              setEditingCoverText(elem.text || '');
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedElementId(elem.id);
                              onElementClick?.(elem.id, (e.currentTarget as HTMLElement).getBoundingClientRect(), elem);
                            }}
                            style={{
                              margin: isDocenteElem ? '6px 0' : '2px 0',
                              textAlign: align,
                              cursor: 'pointer',
                              padding: isDocenteElem ? '4px 8px' : '2px 6px',
                              borderRadius: 'var(--radius-xs)',
                              transition: 'background-color 0.12s ease, border-color 0.12s ease',
                              backgroundColor: isSelected
                                ? 'var(--color-accent-soft)'
                                : (reviewHighlightIds?.has(elem.id) ? 'var(--color-accent-soft)' : (isDocenteElem ? 'var(--surface-subtle)' : 'transparent')),
                              border: isSelected ? '1px dashed var(--accent-primary)' : (isDocenteElem ? '1px solid var(--border-subtle)' : '1px solid transparent'),
                            }}
                          >
                            {isDocenteElem && (
                              <div style={{ fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-accent)', fontWeight: 700, marginBottom: '2px' }}>
                                Docente / Tutor
                              </div>
                            )}
                            <div style={{
                              fontWeight: bold || isDocenteElem ? 'bold' : 'normal',
                              fontSize,
                              color: 'var(--paper-ink)',
                              whiteSpace: 'pre-line',
                              lineHeight: 1.4,
                            }}>
                              {elem.text}
                            </div>
                          </div>
                        );
                      };

                      return coverGroups.map((group, gIdx) => {
                        if (group.kind === 'columns') {
                          const cols = group.columns;
                          return (
                            <div
                              key={`cover-columns-${gIdx}`}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))`,
                                gap: '16px',
                                width: '100%',
                                margin: '8px 0',
                                padding: '4px 0',
                                alignItems: 'start',
                              }}
                            >
                              {cols.map((col, ci) => (
                                <div
                                  key={`cover-col-${gIdx}-${ci}`}
                                  style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}
                                >
                                  {col.map((colElem) => renderCoverSingle(colElem))}
                                </div>
                              ))}
                            </div>
                          );
                        }

                        if (group.kind === 'author_grid') {
                          const editingElem = group.elems.find((e) => e.id === editingCoverElemId);
                          if (editingElem) {
                            return (
                              <div key={`author-edit-${editingElem.id}`} style={{ width: '100%', margin: '4px 0' }}>
                                <textarea
                                  autoFocus
                                  value={editingCoverText}
                                  onChange={(e) => setEditingCoverText(e.target.value)}
                                  onBlur={() => {
                                    if (!readOnly && editingCoverText !== editingElem.text) {
                                      useDocStore.getState().updateElementText(editingElem.id, editingCoverText);
                                    }
                                    setEditingCoverElemId(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      if (!readOnly && editingCoverText !== editingElem.text) {
                                        useDocStore.getState().updateElementText(editingElem.id, editingCoverText);
                                      }
                                      setEditingCoverElemId(null);
                                    } else if (e.key === 'Escape') {
                                      setEditingCoverElemId(null);
                                    }
                                  }}
                                  style={{
                                    width: '100%',
                                    fontFamily: fontFamily,
                                    fontSize: '10pt',
                                    border: '2px solid var(--accent-primary)',
                                    borderRadius: 'var(--radius-xs)',
                                    padding: '6px 8px',
                                    background: 'var(--paper-white)',
                                    color: 'var(--paper-ink)',
                                    resize: 'vertical',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                    boxShadow: '0 0 0 3px var(--color-accent-a20)',
                                    minHeight: '60px',
                                  }}
                                />
                              </div>
                            );
                          }

                          // Distribución equilibrada: 4 autores -> 2 cols; 5 o 6 -> 3 cols; <=3 -> N cols
                          const count = group.cards.length;
                          const colCount = count <= 3 ? count : count === 4 ? 2 : 3;
                          return (
                            <div
                              key={`author-group-${gIdx}`}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
                                gap: '16px',
                                width: '100%',
                                margin: '8px 0',
                                padding: '4px 0',
                              }}
                            >
                              {group.cards.map((card, cIdx) => (
                                <div
                                  key={`${card.originalElemId}-${cIdx}`}
                                  title="Doble clic para editar datos de autor"
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    if (readOnly) return;
                                    const orig = group.elems.find((x) => x.id === card.originalElemId);
                                    if (orig) {
                                      setEditingCoverElemId(orig.id);
                                      setEditingCoverText(orig.text || '');
                                    }
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedElementId(card.originalElemId);
                                  }}
                                  style={{
                                    textAlign: 'center',
                                    padding: '6px 8px',
                                    borderRight:
                                      (cIdx + 1) % colCount !== 0 && cIdx !== group.cards.length - 1
                                        ? '1px solid var(--border-subtle)'
                                        : 'none',
                                    borderRadius: 'var(--radius-xs)',
                                    cursor: 'pointer',
                                    backgroundColor: selectedElementId === card.originalElemId ? 'var(--color-accent-a08)' : 'transparent',
                                    transition: 'background-color 0.12s ease',
                                  }}
                                >
                                  <div style={{ fontWeight: 'bold', fontSize: '10pt', color: 'var(--paper-ink)', lineHeight: 1.3 }}>
                                    {card.name}
                                  </div>
                                  {card.meta && (
                                    <div style={{ fontSize: '9pt', color: 'var(--paper-slate)', marginTop: '3px', lineHeight: 1.25 }}>
                                      {card.meta}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        }

                        return renderCoverSingle(group.elem);
                      });
                    })()}
                    </div>
                  </div>
              ) : (
                /* RENDERIZADO ESTÁNDAR DEL CUERPO (PÁGINAS > 1) */
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                  {pageElements.map((elem) => {
                    const isSelected = selectedElementId === elem.id;
                    const isContextMenuOpen = contextMenuElemId === elem.id;
                    const showFigureLabel = elem.type === 'image' && elem.image_info && (elem.image_info.figure_number || 0) > 0 && !elem.is_cover_section;
                    const captionPosition = elem.image_info?.caption_position ?? 'below';
                    const imgAlign = (elem.type === 'image' && elem.image_info?.alignment) || 'center';
                    const imgOuterTextAlign = imgAlign === 'left' ? 'left' : imgAlign === 'right' ? 'right' : 'center';
                    const imgInnerMargin = imgAlign === 'left' ? '8px auto 8px 0' : imgAlign === 'right' ? '8px 0 8px auto' : '8px auto';

                    if (elem.type === 'heading') {
                      globalListCounter = 0;
                    } else if (elem.type === 'numbered_list') {
                      globalListCounter += 1;
                    }
                    const currentItemNum = globalListCounter;

                    let aiBgColor = 'transparent';
                    let tooltipText = undefined;
                    
                    const hasGhostCitation = useDocStore.getState().citationAuditResult?.ghost_citations?.some((c: any) => c.element_id === elem.id);
                    let borderColor = 'transparent';
                    if (hasGhostCitation) borderColor = 'var(--color-danger)';
                    
                    if (showAIHeatmap) {
                      const score = elem.ai_score !== undefined ? elem.ai_score : (elem.confidence < 0.5 ? 0.9 : 0.1);
                      if (score >= 0.75) {
                        aiBgColor = 'var(--color-danger-a12)'; // High Risk - Red
                      } else if (score >= 0.4) {
                        aiBgColor = 'var(--color-warning-a12)'; // Medium Risk - Yellow
                      }
                      
                      if (elem.ai_findings && elem.ai_findings.length > 0) {
                        tooltipText = `Riesgo IA: ${Math.round(score * 100)}%\n` + 
                          elem.ai_findings.map(f => `- ${f.pattern}: ${f.detail}`).join('\n');
                      } else {
                        tooltipText = `Riesgo IA Estimado: ${Math.round(score * 100)}%`;
                      }
                    }

                    // Detector IA Margen (Siempre activo si el score > 0.5)
                    const aiScore = elem.ai_score !== undefined ? elem.ai_score : 0;
                    const isAIGenerated = aiScore > 0.5;
                    const aiMarginBorder = isAIGenerated ? '2px solid var(--color-accent-soft)' : '2px solid transparent';
                    const aiTooltip = isAIGenerated ? `Posible contenido IA (${Math.round(aiScore * 100)}%). Patrones detectados.` : undefined;

                    return (
                      <div
                        key={elem.id}
                        id={`paper-elem-${elem.id}`}
                        data-element-id={elem.id}
                        title={hasGhostCitation ? 'Este párrafo contiene una cita sin referencia bibliográfica.' : (tooltipText || aiTooltip)}
                        onMouseEnter={(e) => {
                          if (elem.type !== 'image' && elem.type !== 'table') {
                            (e.currentTarget as HTMLElement).dataset.hover = 'true';
                          }
                        }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).dataset.hover = ''; }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedElementId(elem.id);
                          onElementClick?.(elem.id, (e.currentTarget as HTMLElement).getBoundingClientRect(), elem);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          (window.getSelection?.() ?? null)?.removeAllRanges?.();
                          if (readOnly) return;
                          if (elem.type === 'image' && elem.image_info) {
                            setEditingId(elem.id);
                            setEditValue(elem.image_info.caption || '');
                          } else if (elem.type !== 'image' && elem.type !== 'table') {
                            setEditingId(elem.id);
                            setEditValue(elem.text || '');
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedElementId(elem.id);
                          if (!readOnly) setContextMenuElemId(elem.id);
                        }}
                        style={{
                          position: 'relative',
                          border: isSelected ? '2px solid var(--word-blue)' : hasGhostCitation ? '2px dashed var(--color-danger)' : '2px solid transparent',
                          borderLeft: isSelected ? '2px solid var(--word-blue)' : aiMarginBorder,
                          borderRadius: 'var(--radius-2xs)',
                          padding: '2px 2px 2px 6px',
                          backgroundColor: isSelected ? 'var(--color-accent-a05)' : (hasGhostCitation ? 'var(--color-danger-a12)' : aiBgColor),
                          transition: 'all 0.2s',
                          cursor: 'text',
                          // Hover contextual: la burbuja resalta el elemento referenciado
                          ...(hoveredCommentId === elem.id ? {
                            outline: '2px solid var(--accent-primary)',
                            outlineOffset: '2px',
                            backgroundColor: 'var(--color-accent-a08)',
                            boxShadow: '0 0 0 4px var(--color-accent-soft)',
                          } : {}),
                        }}
                      >
                        {/* Menú Contextual — debajo del elemento para que nunca
                            se salga por arriba del viewport en el primer elemento */}
                        {isContextMenuOpen && (
                          <div style={{
                            position: 'absolute',
                            top: 'calc(100% + 4px)',
                            left: '0',
                            backgroundColor: 'var(--paper-white)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-xs)',
                            padding: '4px 8px',
                            display: 'flex',
                            gap: '4px',
                            zIndex: 300,
                            boxShadow: '0 8px 24px var(--color-ink-a20)',
                            flexWrap: 'wrap',
                            maxWidth: '100%'
                          }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '2px 6px', fontSize: '10px' }}
                              onClick={() => { updateElementType(elem.id, 'heading', 1, elem.text); setContextMenuElemId(null); }}
                            >
                              Heading 1
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '2px 6px', fontSize: '10px' }}
                              onClick={() => { updateElementType(elem.id, 'heading', 2, elem.text); setContextMenuElemId(null); }}
                            >
                              Heading 2
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '2px 6px', fontSize: '10px' }}
                              onClick={() => { updateElementType(elem.id, 'paragraph', 1, elem.text); setContextMenuElemId(null); }}
                            >
                              Párrafo
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '2px 6px', fontSize: '10px' }}
                              onClick={() => { updateElementType(elem.id, 'bullet', 1, elem.text); setContextMenuElemId(null); }}
                            >
                              Viñeta
                            </button>
                            
                            {/* AI Actions */}
                            <div style={{ width: '1px', backgroundColor: 'var(--paper-line)', margin: '0 4px' }} />
                            {(elem.type === 'image' || elem.type === 'table') && (
                              <button
                                className="btn btn-sm"
                                style={{ padding: '2px 6px', fontSize: '10px', backgroundColor: 'var(--severity-success-tint)', color: 'var(--color-success)', border: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => handleSuggestCaption(elem)}
                              >
                                <Wand2 size={10} /> Sugerir Leyenda
                              </button>
                            )}
                            {elem.type === 'table' && (
                              <button
                                className="btn btn-sm"
                                style={{ padding: '2px 6px', fontSize: '10px', backgroundColor: 'var(--color-accent-soft)', color: 'var(--accent-primary)', border: '1px solid var(--color-accent-a30)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => {
                                  setSelectedElementId(elem.id);
                                  useDocStore.getState().setForceRightPanelOpen(true);
                                  setContextMenuElemId(null);
                                }}
                              >
                                <Edit3 size={10} /> Editar celdas
                              </button>
                            )}
                            {(elem.type === 'paragraph' || elem.type === 'heading') && (
                              <button
                                className="btn btn-sm"
                                style={{ padding: '2px 6px', fontSize: '10px', backgroundColor: 'var(--severity-success-tint)', color: 'var(--color-success)', border: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => handleRewriteText(elem)}
                              >
                                <Wand2 size={10} /> Reescribir Texto
                              </button>
                            )}
                          </div>
                        )}

                        {aiLoadingId === elem.id && (
                          <div style={{
                            position: 'absolute', inset: 0, backgroundColor: 'var(--color-on-media-a70)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
                          }}>
                            <Loader2 size={20} className="animate-spin" color="var(--word-blue)" />
                          </div>
                        )}

                        {/* Marca de transparencia: etiqueta del cambio APA aplicado arriba del párrafo */}
                        {marcasVisibles && marcasMap[elem.id] && (
                          <ChangeMark
                            label={marcasMap[elem.id]}
                            elem={elem}
                            finding={useDocStore.getState().proofreadFindings?.find(f => f.element_id === elem.id)}
                            onRewrite={handleRewriteText}
                            onDismiss={(eid) => {
                              const nextMap = { ...marcasMap };
                              delete nextMap[eid];
                              setMarcasMap(nextMap);
                              borrarMarca(eid);
                            }}
                          />
                        )}

                        {editingId === elem.id && elem.type !== 'image' ? (
                          INLINE_EDITABLE_TYPES.has(elem.type) ? (
                            /* Fase 3 — edición inline sobre el párrafo real.
                               El reflow es instantáneo: la medición DOM de Fase 1
                               observa este div (paper-elem) y re-pagina al escribir. */
                            <InlineTextEditor
                              initialText={elem.text || ''}
                              style={{
                                fontFamily: fontFamily,
                                fontSize: `${rules.font_size_pt - (elem.type === 'block_quote' ? 1 : 0)}pt`,
                                lineHeight: rules.line_spacing,
                                textAlign: elem.type === 'paragraph' ? 'justify' : 'left',
                                textIndent: elem.type === 'paragraph' ? '0.5in' : undefined,
                                marginLeft: elem.type === 'block_quote' ? '0.5in' : undefined,
                                marginTop: elem.type === 'block_quote' ? '6px' : '0',
                                marginBottom: '8px',
                              }}
                              onCommit={(text) => {
                                if (text !== (elem.text || '')) {
                                  updateElementType(elem.id, elem.type, elem.heading_level, text);
                                }
                                setEditingId(null);
                              }}
                              onCancel={() => setEditingId(null)}
                              onSplit={(before, after) => {
                                setEditingId(null);
                                void useDocStore.getState().splitParagraphAt(elem.id, before, after);
                              }}
                            />
                          ) : (
                          <div style={{ position: 'relative', margin: '4px 0' }}>
                            <textarea
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              autoFocus
                              style={{
                                width: '100%',
                                minHeight: '60px',
                                fontFamily: fontFamily,
                                fontSize: `${rules.font_size_pt}pt`,
                                padding: '8px',
                                border: '2px solid var(--word-blue)',
                                borderRadius: 'var(--radius-xs)',
                                outline: 'none',
                                resize: 'vertical'
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  setEditingId(null);
                                } else if (e.key === 'Enter' && e.ctrlKey) {
                                  if (elem.type === 'image') {
                                    if (editValue !== (elem.image_info?.caption || '')) {
                                      useDocStore.getState().updateElementImage(elem.id, { caption: editValue });
                                    }
                                  } else if (editValue !== elem.text) {
                                    updateElementType(elem.id, elem.type, elem.heading_level, editValue);
                                  }
                                  setEditingId(null);
                                } else if (e.key === 'Enter' && !e.shiftKey) {
                                  if (elem.type === 'image') {
                                    if (editValue !== (elem.image_info?.caption || '')) {
                                      useDocStore.getState().updateElementImage(elem.id, { caption: editValue });
                                    }
                                  } else if (editValue !== elem.text) {
                                    updateElementType(elem.id, elem.type, elem.heading_level, editValue);
                                  }
                                  setEditingId(null);
                                }
                              }}
                            />
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', marginTop: '4px' }}>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setEditingId(null)}
                                title="Cancelar (Esc)"
                              >
                                <X size={14} />
                              </button>
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => {
                                  if (editValue !== elem.text) {
                                    updateElementType(elem.id, elem.type, elem.heading_level, editValue);
                                  }
                                  setEditingId(null);
                                }}
                                title="Guardar (Ctrl+Enter)"
                              >
                                <Check size={14} />
                              </button>
                            </div>
                          </div>
                          )
                        ) : elem.type !== 'image' ? (
                          <>
                            {elem.type === 'heading' && (() => {
                              const isRef = esTituloDeReferencias(elem.text || '');
                              if (isRef) {
                                return (
                                  <div style={{ marginTop: '20px', marginBottom: '8px' }}>
                                    /* Por `ReadingText`, como su hermano de dos
                                       líneas más abajo (`:1961`) y como todos los
                                       demás bloques: un título de Referencias o
                                       de Conclusiones recibe burbuja del gutter
                                       —cita fantasma, emoji, gatillo de
                                       conclusión o de IA— y sin pasar por acá
                                       esa burbuja no tenía subrayado. Tres
                                       familias de comentario con anuncio y sin
                                       marca, que es el defecto exacto que este
                                       módulo existe para matar. */
                                    <p style={{
                                      fontFamily: fontFamily,
                                      fontWeight: 'bold', textAlign: 'center', fontSize: '14pt',
                                      margin: '0 0 12px 0',
                                      ...reviewHighlightStyle(elem.id),
                                    }}>
                                      <ReadingText text={elem.text} source={readingSource(elem)} />
                                    </p>
                                    {/* Lista de referencias estructuradas */}
                                    {doc.referencias && doc.referencias.length > 0 ? (
                                      <div style={{ ...APA_LISTA }}>
                                        {doc.referencias.map((ref, ri) => (
                                          <ReferenciaLinea key={ref.id || ri} referencia={ref} />
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              }
                              return (
                                <p style={{
                                  fontFamily: fontFamily,
                                  fontWeight: 'bold',
                                  fontStyle: elem.heading_level === 3 ? 'italic' : 'normal',
                                  textAlign: elem.heading_level === 1 ? 'center' : 'left',
                                  marginTop: '12px',
                                  marginBottom: '8px',
                                  // APA 7: sin decoración visual (bordes, paddings). Solo negrita/itálica/alineación.
                                  // El resaltado de revisión usa un fondo sutil, no un borde decorativo.
                                  ...reviewHighlightStyle(elem.id),
                                }}>
                                  <ReadingText text={headingDisplayText.get(elem.id) ?? elem.text} source={readingSource(elem)} />
                                </p>
                              );
                            })()}

                            {elem.type === 'paragraph' && (
                              <p style={{
                                fontFamily: fontFamily,
                                textIndent: '0.5in',
                                lineHeight: rules.line_spacing,
                                textAlign: 'justify',
                                margin: '0 0 8px 0',
                                ...reviewHighlightStyle(elem.id),
                              }}>
                                <ReadingText text={elem.text} source={readingSource(elem)} />
                              </p>
                            )}

                            {elem.type === 'block_quote' && (
                              <p style={{
                                fontFamily: fontFamily,
                                marginLeft: '0.5in',
                                lineHeight: rules.line_spacing,
                                fontSize: `${rules.font_size_pt - 1}pt`,
                                marginTop: '6px', marginBottom: '8px',
                                ...reviewHighlightStyle(elem.id),
                              }}>
                                <ReadingText text={elem.text} source={readingSource(elem)} />
                              </p>
                            )}

                            {elem.type === 'bullet' && (
                              <p style={{ fontFamily: fontFamily, lineHeight: rules.line_spacing, marginLeft: `${((elem.list_level || 1) - 1) * 24 + 24}px`, textIndent: '-12px', marginBottom: '8px', marginTop: '0', ...reviewHighlightStyle(elem.id) }}>
                                • <ReadingText text={elem.text} source={readingSource(elem)} />
                              </p>
                            )}

                            {elem.type === 'numbered_list' && (
                              <p style={{ fontFamily: fontFamily, lineHeight: rules.line_spacing, marginLeft: `${((elem.list_level || 1) - 1) * 24 + 24}px`, textIndent: '-12px', marginBottom: '8px', marginTop: '0', ...reviewHighlightStyle(elem.id) }}>
                                {currentItemNum}. <ReadingText text={elem.text} source={readingSource(elem)} />
                              </p>
                            )}

                            {elem.type === 'toc' && (
                              <div style={{
                                margin: '16px 0 24px 0',
                                padding: '20px 24px',
                                backgroundColor: reviewHighlightIds?.has(elem.id) ? 'var(--color-accent-soft)' : 'var(--paper-bg)',
                                border: '1.5px dashed var(--paper-faint)',
                                borderRadius: 'var(--radius-md)',
                                fontFamily: fontFamily,
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--paper-line)', paddingBottom: '8px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontWeight: 700, fontSize: '13pt', color: 'var(--paper-ink)' }}>Índice / Tabla de Contenidos</span>
                                    <span style={{ fontSize: '10px', backgroundColor: 'var(--severity-info-soft)', color: 'var(--color-info)', padding: '2px 8px', borderRadius: 'var(--radius-lg)', fontWeight: 600 }}>
                                      Nativo Word (TOC) con hipervínculos
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      useDocStore.getState().removeTocElement();
                                    }}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: 'var(--color-danger)',
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      padding: '2px 6px',
                                      borderRadius: 'var(--radius-xs)',
                                    }}
                                    title="Quitar este índice del documento"
                                  >
                                    Eliminar índice
                                  </button>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {doc.elements
                                    .filter(e => e.type === 'heading' && !e.is_cover_section && (e.heading_level || 1) <= 3)
                                    .map((h, hIdx) => {
                                      const lvl = h.heading_level || 1;
                                      const title = headingDisplayText.get(h.id) ?? h.text;
                                      return (
                                        <div
                                          key={h.id || hIdx}
                                          onClick={(ev) => {
                                            ev.stopPropagation();
                                            const target = document.getElementById(`paper-elem-${h.id}`);
                                            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                          }}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'baseline',
                                            justifyContent: 'space-between',
                                            marginLeft: `${(lvl - 1) * 20}px`,
                                            fontSize: `${rules.font_size_pt - 0.5}pt`,
                                            cursor: 'pointer',
                                            color: 'var(--paper-ink)',
                                            fontWeight: lvl === 1 ? 600 : 400,
                                            padding: '2px 4px',
                                            borderRadius: 'var(--radius-xs)',
                                            transition: 'background-color 0.15s ease',
                                          }}
                                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--paper-line)'; }}
                                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                        >
                                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                                            {title}
                                          </span>
                                          <span style={{ flex: 1, borderBottom: '1px dotted var(--paper-faint)', margin: '0 8px', minWidth: '20px' }}></span>
                                          <span style={{ fontSize: '10pt', color: 'var(--paper-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                            {paginaDe.get(h.id) ?? '—'}
                                          </span>
                                        </div>
                                      );
                                    })}
                                </div>
                                <div style={{ marginTop: '14px', fontSize: '10px', color: 'var(--paper-muted)', textAlign: 'center', fontStyle: 'italic' }}>
                                  Word COM generará este índice automáticamente con los números de página exactos y enlaces interactivos para PDF.
                                </div>
                              </div>
                            )}
                          </>
                        ) : null}

                        {/* CHANGE 2: Guard — los elementos de portada (is_cover_section)
                            ya son renderizados por el bloque de portada estructurado arriba.
                            No deben duplicarse como figura en el cuerpo. */}
                        {(elem.type === 'image' || elem.image_info) && !elem.is_cover_section && (
                          <div style={{
                            margin: '16px auto', maxWidth: '95%',
                            border: '1px solid var(--paper-line-strong)', borderRadius: 'var(--radius-md)',
                            backgroundColor: reviewHighlightIds?.has(elem.id) ? 'var(--color-accent-soft)' : 'var(--paper-near)', padding: '10px',
                            position: 'relative',
                            display: 'flex', flexDirection: 'column',
                          }}>
                            {/* Número de figura + caption (order: arriba=0, abajo=2) */}
                            {!showFigureLabel && (
                              <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'center' }}>
                                <button
                                  className="btn btn-xs"
                                  title="Generar leyenda APA 7 para esta figura"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    padding: '6px 14px',
                                    borderRadius: 'var(--radius-sm)',
                                    backgroundColor: 'var(--accent-primary)',
                                    color: 'var(--color-text-on-accent)',
                                    border: 'none',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 8px var(--color-accent-a30)',
                                    fontFamily: 'inherit',
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSuggestCaption(elem);
                                  }}
                                >
                                  <Wand2 size={13} />
                                  Generar leyenda APA 7
                                </button>
                              </div>
                            )}
                            {showFigureLabel && (
                              <div style={{ marginBottom: '8px', order: captionPosition === 'above' ? 0 : 2 }}>
                                <p style={{ fontWeight: 'bold', textAlign: 'left', margin: '0 0 2px 0', fontSize: '11pt' }}>
                                  Figura {elem.image_info?.figure_number}
                                </p>
                                {editingId === elem.id ? (
                                  <textarea
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    autoFocus
                                    onKeyDown={(ke) => {
                                      if (ke.key === 'Escape') setEditingId(null);
                                      else if (ke.key === 'Enter' && !ke.shiftKey) {
                                        if (editValue !== (elem.image_info?.caption || '')) {
                                          useDocStore.getState().updateElementImage(elem.id, { caption: editValue });
                                        }
                                        setEditingId(null);
                                      } else if (ke.key === 'Enter' && ke.ctrlKey) {
                                        if (editValue !== (elem.image_info?.caption || '')) {
                                          useDocStore.getState().updateElementImage(elem.id, { caption: editValue });
                                        }
                                        setEditingId(null);
                                      }
                                    }}
                                    style={{
                                      width: '100%', minHeight: '40px', fontSize: '11pt', fontStyle: 'italic',
                                      border: '1px solid var(--accent-primary)', borderRadius: 'var(--radius-xs)', padding: '4px 8px',
                                      outline: 'none',
                                    }}
                                  />
                                ) : (
                                  <p
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      (window.getSelection?.() ?? null)?.removeAllRanges?.();
                                      setEditingId(elem.id);
                                      setEditValue(elem.image_info?.caption || '');
                                    }}
                                    style={{ fontStyle: 'italic', textAlign: 'left', margin: 0, cursor: 'text', minHeight: '1em', userSelect: 'none', WebkitUserSelect: 'none' }}
                                  >
                                    {/* Limpiar prefijo "Figura N:" redundante para no duplicar el contador */}
                                    {(elem.image_info?.caption || '').replace(/\*/g, '').replace(/^(figura|fig\.?)\s+\d+[:\.\s]*\s*/i, '') || (
                                      <span style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>Doble clic para editar leyenda</span>
                                    )}
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Marco de la imagen / Paneles Multipanel */}
                            {elem.image_info?.design_style === 'multipanel' && elem.image_info?.subfigures && elem.image_info.subfigures.length > 0 ? (
                              <div
                                style={{
                                  order: 1,
                                  margin: '0 auto',
                                  width: '100%',
                                  display: 'grid',
                                  gridTemplateColumns: `repeat(${elem.image_info.subfigures.length}, 1fr)`,
                                  gap: '12px',
                                  alignItems: 'start',
                                }}
                              >
                                {elem.image_info.subfigures.map((sub, sIdx) => (
                                  <div
                                    key={sub.id || sIdx}
                                    style={{
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      gap: '6px',
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: '100%',
                                        height: (() => {
                                          const declarado = elem.image_info?.height_cm ? elem.image_info.height_cm * 30 : null;
                                          const alto = altoImagenAjustado(declarado, geom.contentH);
                                          return alto === null ? '170px' : `${alto}px`;
                                        })(),
                                        backgroundColor: 'var(--paper-bg)',
                                        border: '1px solid var(--paper-line)',
                                        borderRadius: 'var(--radius-xs)',
                                        overflow: 'hidden',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      {sub.relative_url ? (
                                        <img
                                          src={resolveAssetUrl(sub.relative_url)}
                                          alt={sub.title || `Panel ${sub.label}`}
                                          style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                                        />
                                      ) : elem.image_info?.relative_url ? (
                                        <img
                                          src={resolveAssetUrl(elem.image_info.relative_url)}
                                          alt={sub.title || `Panel ${sub.label}`}
                                          style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                                        />
                                      ) : (
                                        <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>Sin imagen</span>
                                      )}
                                    </div>
                                    <div style={{ fontSize: '10.5pt', color: 'var(--paper-ink)', textAlign: 'center', lineHeight: 1.3 }}>
                                      <span style={{ fontWeight: 600 }}>{sub.label || `(${String.fromCharCode(97 + sIdx)})`}</span>{' '}
                                      <span style={{ fontStyle: 'italic' }}>{sub.title}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                               <div
                                style={{
                                  order: 1,
                                  margin: (() => {
                                    const align = elem.image_info?.alignment || 'center';
                                    if (align === 'left') return '0 auto 0 0';
                                    if (align === 'right') return '0 0 0 auto';
                                    return '0 auto';
                                  })(),
                                  width: elem.image_info?.width_cm ? `${elem.image_info.width_cm * 37.8}px` : '100%',
                                  maxWidth: '100%',
                                  height: (() => {
                                    const declarado = elem.image_info?.height_cm ? elem.image_info.height_cm * 37.8 : null;
                                    const alto = altoImagenAjustado(declarado, geom.contentH);
                                    return alto === null ? '200px' : `${alto}px`;
                                  })(),
                                  minWidth: '120px',
                                  minHeight: '120px',
                                  overflow: 'hidden',
                                  backgroundColor: 'var(--paper-bg)',
                                  border: selectedElementId === elem.id
                                    ? '2px solid var(--accent-primary)'
                                    : (elem.image_info?.border === 'strong'
                                      ? '2px solid var(--paper-line-strong)'
                                      : (elem.image_info?.border === 'subtle'
                                        ? '1px solid var(--paper-line)'
                                        : 'none')),
                                  borderRadius: elem.image_info?.corner_radius === 'lg'
                                    ? 'var(--radius-lg)'
                                    : (elem.image_info?.corner_radius === 'md'
                                      ? 'var(--radius-md)'
                                      : (elem.image_info?.corner_radius === 'sm'
                                        ? 'var(--radius-sm)'
                                        : '0px')),
                                  boxShadow: elem.image_info?.shadow ? '0 4px 12px rgba(0,0,0,0.1)' : 'none',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'var(--text-secondary)',
                                  position: 'relative',
                                  cursor: 'grab',
                                  touchAction: 'none',
                                  transform: (() => {
                                    const rot = elem.image_info?.rotation || 0;
                                    const fx = elem.image_info?.flip_h ? -1 : 1;
                                    const fy = elem.image_info?.flip_v ? -1 : 1;
                                    const parts: string[] = [];
                                    if (rot) parts.push(`rotate(${rot}deg)`);
                                    if (fx !== 1 || fy !== 1) parts.push(`scale(${fx}, ${fy})`);
                                    return parts.length > 0 ? parts.join(' ') : undefined;
                                  })(),
                                  transformOrigin: 'center center',
                                  boxSizing: 'border-box',
                                }}
                              >
                                {elem.image_info?.relative_url && !elem.image_info?.render_error && !brokenFigureIds[elem.id] ? (
                                  <img
                                    src={resolveAssetUrl(elem.image_info.relative_url)}
                                    alt="Figura"
                                    style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', pointerEvents: 'none' }}
                                    onError={() => setBrokenFigureIds((prev) => ({
                                      ...prev,
                                      [elem.id]: 'La imagen no pudo cargarse en el navegador.',
                                    }))}
                                  />
                                ) : (
                                  <div style={{ padding: '12px', textAlign: 'left', maxWidth: '100%' }}>
                                    <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-warning)' }}>
                                      Previsualización no disponible
                                    </div>
                                    <div style={{ fontSize: '11px', lineHeight: 1.5, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>
                                      {brokenFigureIds[elem.id] || (elem.image_info as any)?.render_error || 'El formato original no puede renderizarse en este preview. Revisa el archivo original o exporta la figura a PNG/SVG.'}
                                    </div>
                                  </div>
                                )}

                                {/* Resize handle */}
                                {selectedElementId === elem.id && (
                                  <div
                                    onPointerDown={(e) => startFigureResize(e, elem)}
                                    onPointerMove={resizeState?.id === elem.id ? handleFigureResize : undefined}
                                    onPointerUp={endFigureResize}
                                    onPointerLeave={resizeState?.id === elem.id ? endFigureResize : undefined}
                                    title="Arrastrar para redimensionar · Shift para liberar proporción"
                                    style={{
                                      position: 'absolute', right: 0, bottom: 0,
                                      width: '0', height: '0',
                                      cursor: 'nwse-resize', touchAction: 'none',
                                      borderBottom: '18px solid var(--accent-primary)',
                                      borderLeft: '18px solid transparent',
                                      borderBottomRightRadius: '10px',
                                    }}
                                  />
                                )}
                              </div>
                            )}

                            {elem.image_info?.note && (
                              <p style={{ fontSize: '11px', marginTop: '8px', color: 'var(--paper-slate)', textAlign: 'left', order: 3 }}>
                                <span style={{ fontStyle: 'italic', fontWeight: 600 }}>Nota.</span> {elem.image_info.note}
                              </p>
                            )}
                            {/* Floating AI caption badge — only when no caption yet */}
                            {!elem.image_info?.caption && (
                              <CaptionSuggestionBadge
                                elementId={elem.id}
                                onApply={(cap) => useDocStore.getState().updateElementImage(elem.id, { ...elem.image_info, caption: cap })}
                              />
                            )}
                          </div>
                        )}

                        {elem.type === 'table' && elem.table_info && (() => {
                          const tabla = elem.table_slice
                            ? rebanadaDeTabla(elem.table_info, elem.table_slice.start, elem.table_slice.end)
                            : elem.table_info;
                          const esContinuacion = (elem.table_slice?.start ?? 0) > 0;
                          const mostrandoLeyenda = (elem.table_slice?.start ?? 0) === 0;
                          const esUltima =
                            !elem.table_slice ||
                            elem.table_slice.end >= (elem.table_info.rows?.length ?? 0);
                          return (
                            <div style={{ margin: '16px 0', width: '100%', maxWidth: '100%', boxSizing: 'border-box', ...reviewHighlightStyle(elem.id) }}>
                              <TablaRender
                                tabla={tabla}
                                mostrarLeyenda={mostrandoLeyenda}
                                esContinuacion={esContinuacion}
                                esUltima={esUltima}
                              />
                              {mostrandoLeyenda && !elem.table_info.caption && (
                                <div style={{ marginTop: 'var(--space-2)' }}>
                                  <MascotaLeyendaIA
                                    sugerida={leyendaSugerida[elem.id] ? { titulo: leyendaSugerida[elem.id] } : undefined}
                                    cargando={!!leyendaCargando[elem.id]}
                                    error={leyendaError[elem.id] || undefined}
                                    onGenerar={() => generarLeyendaTabla(elem)}
                                    onAplicar={(s) => updateElementTable(elem.id, { ...elem.table_info!, caption: s.titulo })}
                                    onRegenerar={() => generarLeyendaTabla(elem)}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })()}


                        {/* Comentarios estilo WhatsApp: ahora viven en el gutter
                            lateral (columna derecha fuera de la hoja, como Word). */}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Gutter de comentarios: columna lateral fuera de la hoja (estilo Word).
                Tope de burbujas por página (MAX_GUTTER) para no inundar; el resto
                se resume en un chip "+N más". */}
            {docHasComments && (
              <div style={{ position: 'relative', width: '250px', flexShrink: 0 }}>
                {(() => {
                  let shown = 0;
                  const extra = pageElements.filter(
                    (e) => !dismissedCommentIds.includes(e.id) && (positiveMap.get(e.id) || getWhatsAppComment(e, commentCtx, 0) !== null),
                  ).length;
                  return (
                    <>
                      {pageElements.map((elem, idx) => {
                        const positive = !!positiveMap.get(elem.id);
                        const hasComment = positive || getWhatsAppComment(elem, commentCtx, 0) !== null;
                        if (!hasComment || dismissedCommentIds.includes(elem.id)) return null;
                        if (shown >= MAX_GUTTER) return null;
                        shown += 1;
                        const measured = gutterOffsets[elem.id];
                        const top = typeof measured === 'number' && measured > 0
                          ? Math.min(measured, PAGE_H - 84)
                          : Math.min(idx * 96, PAGE_H - 84);
                        return (
                          <div
                            key={elem.id}
                            className="wa-gutter"
                            style={{ position: 'absolute', top: `${top}px`, left: 0, width: '100%' }}
                          >
                            <WhatsAppComment
                              elem={elem}
                              positive={positive}
                              onHover={setHoveredCommentId}
                              onLeave={() => setHoveredCommentId(null)}
                              onResolve={handleResolveComment}
                              onDismiss={dismissComment}
                            />
                          </div>
                        );
                      })}
                      {extra > MAX_GUTTER && (
                        <div style={{
                          position: 'absolute', top: `${Math.min((MAX_GUTTER + 1) * 96, PAGE_H - 84)}px`, left: 0, width: '100%',
                          fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700,
                          display: 'flex', alignItems: 'center', gap: '5px',
                        }}>
                          <span style={{
                            width: '22px', height: '22px', borderRadius: 'var(--radius-full)', flexShrink: 0,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'var(--surface-elevated)', border: '1px solid var(--border-subtle)',
                          }}>{extra - MAX_GUTTER}</span>
                          más en esta página
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* Conector punteado sutil (Google Docs / Figma): une la burbuja en
                hover con el borde del elemento referenciado en la hoja. */}
            {hoveredCommentId && pageElements.some((e) => e.id === hoveredCommentId) && gutterOffsets[hoveredCommentId] != null && (
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute', left: `${PAGE_W}px`, top: `${gutterOffsets[hoveredCommentId]}px`,
                  width: '20px', height: 0,
                  borderTop: '1.5px dashed var(--color-accent-a65)',
                  pointerEvents: 'none', zIndex: 20,
                }}
              />
            )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
