import { StateCreator } from 'zustand';
import { DocState } from '../types';
import * as api from '../../api/backend';
import { escribirMarcas } from '../../lib/marcasMap';

const getApiBase = () => api.getApiBase();

function ghostKey(t: unknown): string {
  const s = typeof t === 'string' ? t : String((t as any)?.raw_text || (t as any)?.formatted_apa || JSON.stringify(t));
  const a = s.replace(/[()]/g,'').split(',')[0]?.trim().toLowerCase() || '';
  const y = s.match(/\b(19|20)\d{2}\b/)?.[0] || '';
  return `${a}|${y}`;
}

export const createAuditSlice: StateCreator<DocState, [], [], Partial<DocState>> = (set, get) => ({
  citationAuditResult: null,
  structureAuditResult: null,
  reviewResult: null,
  isReviewLoading: false,
  runAIReview: async () => {
    const { doc } = get();
    if (!doc) return;
    set({ isReviewLoading: true });
    get().pushActivityEvent('info', 'Iniciando revisión IA del documento…');
    try {
      const result = await api.runAIReview(doc.session_id);
      set({ reviewResult: result, isReviewLoading: false });
      get().pushActivityEvent(
        'success',
        `Revisión IA completada: ${result.total_paragraphs} párrafos`,
        result.flagged_count > 0 ? `${result.flagged_count} con señales de IA u ortografía. Resultados en la pestaña Actividad.` : 'Sin señales relevantes.',
      );
      // Preflight report derivado del review (propuesta 3)
      const high = result.paragraphs.filter(p => p.ai_category === 'HIGH').length;
      const medium = result.paragraphs.filter(p => p.ai_category === 'MEDIUM').length;
      set({
        preflightReport: {
          headings: doc.elements.filter(e => e.type === 'heading').length,
          figures: doc.elements.filter(e => e.type === 'image' && e.image_info && (e.image_info.figure_number || 0) > 0).length,
          tables: doc.elements.filter(e => e.type === 'table' && e.table_info).length,
          paragraphs: result.total_paragraphs,
          flaggedHigh: high,
          flaggedMedium: medium,
          reviewed: doc.elements.filter(e => !e.needs_review).length,
        },
      });
    } catch (err: any) {
      set({ isReviewLoading: false });
      get().showToast(err.message || 'Error en el revisor IA', 'error');
    }
  },
  /* `isContentReviewOpen` / `setContentReviewOpen` se fueron con la Fase 7: la
     revisión de contenido (Bloom, secciones) vive hoy en el workbench del paso
     5, que se llega por fase y no por un flag. */
  providerStatus: null,
  fetchProviderStatus: async () => {
    try {
      // Asegura que las claves guardadas en localStorage lleguen al backend
      // (os.environ) antes de consultar el estado de proveedores. Sin esto,
      // tras un reinicio del watchdog las claves se pierden y la IA "no trabaja".
      await api.syncAllProviderKeys();
      const status = await api.getProviderStatus();
      set({ providerStatus: status });
    } catch (err: any) {
      // silencioso
    }
  },
  applyRewriteVariation: async (elementId, text, asTracked) => {
    const { doc, pushHistory } = get();
    if (!doc) return;
    try {
      // Conservar tipo/heading_level para updateElementType
      const elem = doc.elements.find(e => e.id === elementId);
      if (!elem) return;
      // Si es tracked, el backend generará Track Changes vs el texto original
      if (asTracked) {
        // Generamos docx con Track Changes marcando el cambio IA (propuesta track changes IA)
        const base = getApiBase();
        await fetch(`${base}/update-element`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: doc.session_id,
            element_id: elementId,
            type: elem.type,
            heading_level: elem.heading_level,
            text,
            author: 'IA WordAPA7',
          }),
        });
      } else {
        const updated = await api.updateElement(doc.session_id, elementId, elem.type, elem.heading_level, text);
        pushHistory(updated);
        set({ doc: updated });
      }
      get().showToast(asTracked ? 'Reescritura aplicada como cambio IA (Track Changes)' : 'Párrafo reescrito por IA', 'success');
    } catch (err: any) {
      get().showToast(err.message || 'Error al aplicar reescritura', 'error');
    }
  },
  preflightReport: null,
  setPreflightReport: (r) => set({ preflightReport: r }),
  suggestCitationFix: async (citationText, referenceId, problem) => {
    const { doc, apiKey } = get();
    if (!doc) return null;
    try {
      const result = await api.citationFix(doc.session_id, citationText, referenceId, problem, apiKey);
      return result;
    } catch (err: any) {
      get().showToast(err.message || 'Error al sugerir corrección', 'error');
      return null;
    }
  },
  sugerenciasProactivas: (() => { try { return localStorage.getItem('wordapa7_proactivas') !== 'false'; } catch { return true; } })(),
  setSugerenciasProactivas: (v) => {
    set({ sugerenciasProactivas: v });
    try { localStorage.setItem('wordapa7_proactivas', String(v)); } catch { /* noop */ }
  },
  marcasVisibles: (() => { try { return localStorage.getItem('wordapa7_marcas') !== 'false'; } catch { return true; } })(),
  setMarcasVisibles: (v) => {
    set({ marcasVisibles: v });
    try { localStorage.setItem('wordapa7_marcas', String(v)); } catch { /* noop */ }
  },
  sessionScopes: [],
  setSessionScopes: (s) => set({ sessionScopes: s }),
  proofreadFindings: [],
  aiIndices: null,

  /* ── EL ESTADO DE CORRIDA DE LOS GLOBOS ──────────────────────────────────
     El que estaba antes era un `useState` de la vista de Revisión, y por eso
     la pantalla decía "Todavía no corrió ningún motor" mientras los motores
     corrían solos: los globos se disparan al abrir un documento
     (`documentSlice.uploadFile`), sobreviven al desmontaje de la vista, y un
     flag que vive en la vista no sabe de ellos. Una UI que afirma algo que el
     código no hace es la clase de mentira que este proyecto vino a matar.

     NO ES UN BOOLEANO SINO UNA LISTA, y esa es la diferencia que importa: con
     un booleano, dos globos que arrancan y uno que termina lo apagan, y la
     pantalla vuelve a mentir en la dirección contraria. La lista se apaga
     sola cuando queda vacía, así que los dos campos no pueden separarse: los
     escriben las MISMAS dos acciones (`notarAuditoria` y `olvidarAuditoria`) y
     no hay un tercer escritor. */
  isAuditing: false,
  motoresAuditando: [] as string[],
  /* Anota un globo. Es idempotente por motor: dos llamadas del mismo nombre no
     cuentan dos, porque el `finally` que la apaga tiene que poder casar con su
     `try` aunque el motor se haya lanzado dos veces. */
  notarAuditoria: (motor: string) => set((s) => {
    if (s.motoresAuditando.includes(motor)) return {};
    const motores = [...s.motoresAuditando, motor];
    return { motoresAuditando: motores, isAuditing: true };
  }),
  /* La apaga SOLO si ese motor era el último. Por eso el `finally` va en cada
     globo y no en el que llama: si uno falla, los otros dos siguen corriendo y
     la pantalla tiene que seguir diciendo que algo corre. */
  olvidarAuditoria: (motor: string) => set((s) => {
    const motores = s.motoresAuditando.filter((m) => m !== motor);
    return { motoresAuditando: motores, isAuditing: motores.length > 0 };
  }),

  runProofreadBatch: async () => {
    const { doc, sugerenciasProactivas, apiKey, aiProviderConfig } = get();
    if (!doc || doc.elements.length === 0) return;
    /* La anotación va DESPUÉS de la guarda, no antes: si no hay documento este
       motor no arrancó, y anotarlo prendería una pantalla que dice "corriendo"
       sobre algo que no corre. */
    get().notarAuditoria('ortografía, texto pegado e IA');
    try {
      /* La clave y el proveedor viajan con la peticion. Sin esto, el backend
         resolvia el refinamiento contra su propio entorno y un usuario de
         cualquier proveedor que no sea NVIDIA se quedaba sin ortografia
         revisada. */
      const res = await api.proofreadBatch(doc.session_id, {
        apiKey, providerId: aiProviderConfig?.providerId,
      });
      set({ aiIndices: res.ai_indices || null });
      if (sugerenciasProactivas) {
        set({ proofreadFindings: res.findings || [] });
        // Marcas de transparencia: cada elemento marcado explica su motivo.
        // Los rótulos salen de `rotuloDeKind` y el mapa lleva versión; antes
        // eran diez filas escritas a mano, y el fallback al `kind` guardaba el
        // `snake_case` crudo para que `PaperCanvas` lo pintara en el párrafo.
        escribirMarcas(res.findings || []);
      }
    } catch { /* silencioso */ }
    /* El `finally` y no el final del `try`: el `catch` de arriba se traga el
       fallo, y sin esto un motor caído dejaría la pantalla diciendo "corriendo"
       para siempre. El error se sigue tragando —es un globo en background— pero
       la verdad del estado de corrida se escribe igual. */
    finally { get().olvidarAuditoria('ortografía, texto pegado e IA'); }
  },

  // Auditorías silenciosas que activan los globos proactivos sin loading global.,
  clearProofreadFindings: () => set({ proofreadFindings: [] }),

  /* Tira TODOS los hallazgos, no los de los parrafos que "no cambiaron".
     `element_id` es un indice posicional (`docx_parser.py:1099` genera
     `elem_{contador}`), asi que insertar un parrafo arriba del todo en Word corre
     TODOS los ids de abajo con el mismo texto. Parchear por id dejaria un
     hallazgo pegado al parrafo equivocado, con el subrayado en la frase
     equivocada: un error que se lee como error de redaccion. Lo unico correcto
     es recalcular todo, y recalcular casi todo es local y gratis. */
  invalidarHallazgosRancios: () => {
    set({
      proofreadFindings: [],
      reviewResult: null,
      citationAuditResult: null,
      aiIndices: null,
      /* Los descartes son claves que incluyen element_id, asi que tambien quedan
         rancios: un descarte de "elem_7" no puede seguir borrando el hallazgo
         nuevo de un parrafo que ahora ocupa ese id. */
      dismissedCommentIds: [],
    });
    /* wordapa7_marcas_map esta indexado por element_id y NO tiene poda en ningun
       lado (mas arriba, en runProofreadBatch, solo agrega). Es la misma trampa que
       los hallazgos: hay que vaciarlo, no podarlo. */
    try { localStorage.removeItem('wordapa7_marcas_map'); } catch { /* noop */ }
  },

  // Revisor por lotes (F): local siempre + LLM si hay clave. Silencioso.,
  autoResolveGhosts: async () => {
    const { doc, citationAuditResult, references } = get();
    if (!doc || !citationAuditResult) return;
    const rawGhosts = citationAuditResult.ghost_citations || [];
    const seenK = new Set<string>();
    const uniqGhosts = rawGhosts.filter((g: any) => { const k = ghostKey(g); if (seenK.has(k)) return false; seenK.add(k); return true; });
    if (rawGhosts.length === 0) return;
    let added = 0;
    const MAX_AUTO = 15;
    for (let i = 0; i < Math.min(uniqGhosts.length, MAX_AUTO); i++) {
      const g = uniqGhosts[i];
      const text = typeof g === 'string'
        ? g
        : (g as any)?.raw_text || [ (g as any)?.authors?.join(', '), (g as any)?.year ? `(${(g as any).year})` : '' ].filter(Boolean).join(' ');
      const author = String(text).replace(/[()]/g, '').split(',')[0]?.trim() || '';
      const year = String(text).match(/\b(19|20)\d{2}\b/)?.[0] || '';
      if (!author || !year) continue;
      try {
        set({ isLoading: false });
        const result = await api.resolveGhostCitation([author], year);
        if (result?.found && result.candidates?.[0]) {
          const ref = result.candidates[0];
          /* Un candidato sin autores NI título es un sobre mal formado, no una
             referencia: agregarlo fabrica la ficha "Autor (s.f.) / Sin título". */
          const tieneDatos = Boolean(
            (Array.isArray(ref.authors) && ref.authors.length > 0) || ref.title,
          );
          if (!tieneDatos) continue;
          get().addReference({
            id: `ghost-auto-${Date.now()}-${i}`,
            authors: ref.authors, year: ref.year, title: ref.title,
            source: ref.source, doi_or_url: ref.doi || '',
            raw_text: ref.formatted_apa, formatted_apa: ref.formatted_apa,
          });
          added += 1;
          get().pushActivityEvent('success', `Referencia agregada automáticamente: ${ref.authors?.[0] ?? ''} (${ref.year ?? ''})`, author);
        } else {
          /* No está en las bases externas, pero la cita trae autor y año. Se
             crea la ficha con eso —queda Pendiente, falta título y fuente— en
             vez de dejar la cita sin ficha. El DOI no es requisito. */
          const rawText = `${author} (${year}).`;
          get().addReference({
            id: `ghost-auto-${Date.now()}-${i}`,
            authors: [author], year, title: '', source: '', doi_or_url: '',
            raw_text: rawText, formatted_apa: rawText,
          });
          added += 1;
          get().pushActivityEvent('info', `Ficha creada con lo disponible: ${author} (${year})`, author);
        }
      } catch { /* seguir con la siguiente */ }
    }
    if (added > 0) {
      get().runCitationAudit().catch(() => {});
      get().showToast(`Se buscaron ${Math.min(uniqGhosts.length, MAX_AUTO)} citas faltantes y se agregaron ${added} referencias`, 'success');
    } else if (uniqGhosts.length > 0) {
      get().showToast(`Hay ${rawGhosts.length} citas sin referencia; revísalas en Validación`, 'info');
    }
  },
  autoCaptionAll: async () => {
    const { doc, apiKey } = get();
    if (!doc) return;
    const targets = doc.elements.filter((e) => {
      if (e.type === 'image' && !e.is_cover_section) {
        return !e.image_info?.caption?.trim();
      }
      if (e.type === 'table') {
        return !e.table_info?.caption?.trim();
      }
      return false;
    });
    if (targets.length === 0) {
      get().showToast('Todas las figuras y tablas ya tienen leyenda', 'info');
      return;
    }
    get().pushActivityEvent('info', `Generando ${targets.length} leyenda(s) con IA…`);
    let success = 0;
    let errors = 0;
    for (const elem of targets) {
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
        const contextText = ctx.join('\n') || elem.text || '';
        const suggestion = await api.suggestCaption(doc.session_id, elem.id, contextText, apiKey);
        if (elem.type === 'image') {
          await get().updateElementImage(elem.id, { ...(elem.image_info || {}), caption: suggestion });
        } else if (elem.type === 'table') {
          await get().updateElementTable(elem.id, { ...(elem.table_info || {}), caption: suggestion });
        }
        success++;
      } catch (err: any) {
        errors++;
        // Continue with next element; don't abort the batch
      }
    }
    if (errors === 0) {
      get().pushActivityEvent('success', `${success} leyenda(s) generada(s) con IA`);
      get().showToast(`${success} leyenda(s) generada(s) con IA`, 'success');
    } else {
      get().pushActivityEvent('warning', `${success} leyenda(s) generada(s), ${errors} error(es)`);
      get().showToast(`${success} generadas, ${errors} con error`, 'warning');
    }
  },
  runValidation: async () => {
    const { doc, references } = get();
    if (!doc) return;
    try {
      const issues = await api.validateDocument(doc.session_id, references);

      set({ validationIssues: issues });
      get().pushActivityEvent(
        'info',
        `Validación APA: ${issues.length} hallazgo(s)`,
        issues.length > 0 ? 'Revisá la pestaña Referencias → Validación para corregirlos.' : 'El documento cumple las reglas verificadas.',
      );
    } catch (err: any) {
      console.error('Error validating document:', err);
    }
  },
  runCitationAudit: async () => {
    const { doc } = get();
    if (!doc) return;
    set({ isLoading: true, error: null });
    try {
      const result = await api.validateCitations(doc.session_id);
      set({ citationAuditResult: result });
      get().pushActivityEvent(
        'success',
        'Auditoría de citas completada',
        `${result.ghost_citations?.length ?? 0} cita(s) sin referencia, ${result.orphan_references?.length ?? 0} referencia(s) sin cita.`,
      );
    } catch (err: any) {
      set({ error: err.message || 'Error al validar citas' });
      get().showToast(err.message, 'error');
    } finally {
      set({ isLoading: false });
    }
  },
  runStructureAudit: async () => {
    const { doc, apiKey, aiProviderConfig } = get();
    if (!doc) return;
    set({ isLoading: true });
    try {
      const result = await api.auditDocumentStructure(doc.session_id, {
        apiKey,
        nimUrl: aiProviderConfig.nimUrl,
        useLocal: aiProviderConfig.useLocal,
        providerId: aiProviderConfig.providerId,
      });
      set({ structureAuditResult: result });
      const issues = (result.heading_issues.length || 0)
        + (result.missing_sections.length || 0)
        + (result.reference_issues.length || 0);
      get().pushActivityEvent(
        result.overall_assessment === 'good' ? 'success' : 'warning',
        `Auditoría global: ${result.overall_assessment === 'good' ? 'OK' : `${issues} hallazgos`}`,
        result.summary,
      );
    } catch (err: any) {
      get().showToast(err.message || 'Error en auditoría estructural', 'error');
    } finally {
      set({ isLoading: false });
    }
  },

  // Auto-resolución proactiva de citas fantasma vía Crossref (silenciosa).,
});
