import { StateCreator } from 'zustand';
import { DocState } from '../types';
import { DocumentModel, ElementModel, ElementType, APARuleSet, FormatProfile, ReferenciaModel, ValidationIssue, LLMProgressState, ImageModel } from '../../types';
import * as api from '../../api/backend';
import { migrateDocument, toRoman, cleanHeadingPrefix } from '../../lib/textUtils';
import { parseDocumentVersion } from '../../lib/projectUtils';
import { syncCoverFieldToElements, defaultPortada, defaultActa, migrarActaDesdePortada } from './coverSlice';
import { CATALOGO_DE_UNIVERSIDADES } from '../../lib/portada/catalogo';
import { FRACCION_DE_ANCHO_DEL_LOGO } from '../../lib/portada/geometria';
import { ActaDocumento } from '../../types';
import {
  leerVariableDeLocalStorage,
  eleccionGuardada,
  guardarEleccion,
  resolverClave,
} from '../../lib/proveedoresIA';

const getApiBase = () => api.getApiBase();

const defaultRules: APARuleSet = {
  profile_name: 'APA 7 Estándar',
  /* Carta, no A4: es lo que dice DESIGN.md:75 y lo que ya paginaba el lienzo.
     Con A4 acá, el caso por defecto seguía siendo una contradicción entre la
     hoja que se ve y la del .docx. */
  page_size: 'carta',
  margins_cm: 2.54,
  font_family: 'Times New Roman',
  font_size_pt: 12,
  line_spacing: 2.0,
  paragraph_indent_cm: 1.27,
  alignment: 'left',
  space_before_pt: 0,
  space_after_pt: 0,
  bullet_style_level1: 'disc',
  bullet_style_level2: 'circle',
  bullet_style_level3: 'square',
  number_style_level1: 'decimal',
  number_style_level2: 'lowerLetter',
  number_style_level3: 'lowerRoman',
  heading_levels: {},
  heading_numbering_style_lvl1: 'decimal',
  heading_numbering_style_lvl2: 'decimal',
  heading_numbering_style_lvl3: 'decimal',
  reference_hanging_indent_cm: 1.27,
  doi_as_hyperlink: true,
  figure_label_prefix: 'Figura',
  table_label_prefix: 'Tabla',
  image_alignment: 'center',
  image_style: 'plain',
  toc_style: 'apa',
};

const defaultLLMProgress: LLMProgressState = {
  status: 'idle',
  total_batches: 0,
  completed_batches: 0,
  current_provider: '',
  current_provider_id: '',
  elements_processed: 0,
  elements_total: 0,
  estimated_time_remaining_seconds: 0,
  current_sample: '',
  provider_fallbacks: [],
  last_error: null,
};

/** Triggers a file download without navigating away from the app (Electron-safe). */
function triggerDownload(url: string, filename?: string) {
  // En caso de URL relativa, resolverla
  const targetUrl = url;
  // Intentar descarga vía Fetch + Blob para evitar problemas de CORS/sandbox de iframe en Electron
  fetch(targetUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.blob();
    })
    .then((blob) => {
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.style.display = 'none';
      if (filename) a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
      }, 2000);
    })
    .catch(() => {
      // Fallback a enlace directo estándar si fetch falla (ej. descarga directa del backend)
      const a = document.createElement('a');
      a.href = targetUrl;
      a.style.display = 'none';
      if (filename) a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.setTimeout(() => {
        document.body.removeChild(a);
      }, 1000);
    });
}

function cleanRedundantTitleParagraphs(doc: DocumentModel, targetElemId: string, captionText: string): DocumentModel {
  const idx = doc.elements.findIndex((e) => e.id === targetElemId);
  if (idx <= 0) return doc;
  const prevIdx = idx - 1;
  const prev = doc.elements[prevIdx];
  if (prev && (prev.type === 'paragraph' || prev.type === 'heading')) {
    const txt = (prev.text || '').trim();
    const isFigNum = /^(figura|tabla|fig\.?)\s+\d+$/i.test(txt);
    const isSimilarTitle = captionText && txt.length > 3 && (captionText.toLowerCase().includes(txt.toLowerCase()) || txt.toLowerCase().includes(captionText.toLowerCase()));
    if (isFigNum || isSimilarTitle) {
      const filtered = doc.elements.filter((_, i) => i !== prevIdx);
      return { ...doc, elements: filtered };
    }
  }
  return doc;
}

export function safeRefText(ref: unknown): string {
  try {
    const o = (ref ?? {}) as any;
    const a = Array.isArray(o.authors) ? o.authors.filter(Boolean).join(', ') : '';
    return [a, o.year ? `(${o.year})` : '', o.title || ''].filter(Boolean).join(' ').trim();
  } catch { return ''; }
}

/** Firma canónica de cortes: invariante al orden de claves de objeto y al orden
 *  de llegada de la lista de cortes. Solo cambia si cambia el contenido
 *  (offset/página). Evita `layoutEcho++` ante un payload semánticamente idéntico
 *  reordenado (defensa anti-bucle). */
function cutsSignature(cuts: Record<string, { offset: number; page: number }[]> | null | undefined): string {
  const rec = cuts || {};
  const keys = Object.keys(rec).sort();
  return JSON.stringify(
    keys.map((id) => [
      id,
      ...(rec[id] || [])
        .map((c) => [c.offset, c.page] as [number, number])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    ]),
  );
}

/** Campos de reset de la verdad COM del motor de render: cortes, eco y aviso
 *  D-a pertenecen al documento ANTERIOR. Se aplican SIEMPRE que una ruta
 *  instale un documento activo distinto (upload, openSession, blanco,
 *  plantilla). En este mismo slice no existe otra ruta que cambie la sesión
 *  activa: undo/redo navegan el history de la sesión activa y el resto de
 *  `set({ doc })` son mutaciones in-place con el mismo `session_id`.
 *  (Los resets por pestaña viven en uiSlice: switchToTab/removeTab, slice
 *  distinto → fuera de este helper a propósito.) */
function layoutResetFields() {
  return {
    layoutCuts: null as Record<string, { offset: number; page: number }[]> | null,
    layoutEcho: 0,
    wordLayoutUnavailable: false,
  };
}

export const createDocumentSlice: StateCreator<DocState, [], [], Partial<DocState>> = (set, get) => ({
  doc: null,
  // ── Fase 2 — Motor de render híbrido: verdad COM en vivo ──
  layoutCuts: null,
  layoutEcho: 0,
  wordLayoutUnavailable: false,
  /* La clave que manda. Antes esta IIFE caminaba una lista de variables escrita
     a mano y se quedaba con la primera que encontraba, en orden fijo: con dos
     claves puestas no había forma de decir "usá Groq". Ahora la lista es
     `PROVEEDORES_IA` —el mismo orden de prioridad que el backend— y la ELECCIÓN
     gana cuando existe. Si la elección no tiene clave, cae al primer proveedor
     listo, que es el comportamiento de siempre. */
  apiKey: (() => {
    try {
      return resolverClave(leerVariableDeLocalStorage, eleccionGuardada());
    } catch { return ''; }
  })(),
  // Consentimiento explícito para enviar contenido a un LLM en la nube.,
  llmCloudConsent: false,
  llmConsentPending: false,
  setLlmConsentPending: (v) => set({ llmConsentPending: v }),
  error: null,
  selectedElementId: null,
  selectedReferenceId: null,
  llmProgress: defaultLLMProgress,
  llmUsageStats: {
    total_tokens: 0,
    providers_used: [],
    estimated_cost_usd: 0,
    cache_hits: 0,
    api_calls: 0,
  },
  aiProviderConfig: {
    nimUrl: 'http://localhost:8000/v1/chat/completions',
    useLocal: false,
    /* `''` es AUTOMÁTICO, no "sin proveedor": con `''` el backend no filtra y
       responde el primero que conteste, que es el orden de `PROVEEDORES_IA`.
       Antes decía `'nvidia_nim'` fijo, y eso era una mentira: si no había
       clave de NVIDIA, el backend recibía un `provider_id` que no podía
       satisfacer y respondía "Proveedor no configurado: nvidia_nim". Nadie lo
       notaba porque `setAiProviderConfig` no lo escribía nunca. */
    providerId: '',
  },
  pdfPreviewCache: null,
  history: [],
  historyIndex: -1,
  rules: defaultRules,
  ruleProfiles: [defaultRules],
  profiles: [],
  activeProfileId: 'apa7',
  references: [],
  validationIssues: [],
  hasUnsavedChanges: false,
  /* El estado del chip de guardado arranca sin hora y sin vuelo. "Sin hora"
     porque al abrir la app todavía no se guardó nada en esta sesión, y el chip
     lo dice a secas en vez de inventar un "hace 0 min". */
  lastSavedAt: null,
  isSaving: false,
  setHasUnsavedChanges: (val) => set({ hasUnsavedChanges: val }),
  setApiKey: (key) => {
    try { localStorage.setItem('wordapa7-provider-key:NVIDIA_API_KEY', key); } catch { /* noop */ }
    set({ apiKey: key });
  },
  setLlmCloudConsent: (v) => set({ llmCloudConsent: v }),
  /* Elegir proveedor no es solo guardar un texto: es volver a resolver la clave
     que manda. `apiKey` viaja en cada llamada al backend, y antes de esta fase
     quedaba clavada en la clave que hubiera encontrado al cargar la app: elegir
     Groq con dos claves puestas guardaba el id y seguías mandando la de NVIDIA.
     La elección se copia a localStorage porque `apiKey` se inicializa con una
     IIFE sincrónica, antes de que `persist` rehidrate. */
  setAiProviderConfig: (config) => set((state) => {
    const aiProviderConfig = { ...state.aiProviderConfig, ...config };
    if (config.providerId === undefined) return { aiProviderConfig };
    guardarEleccion(config.providerId);
    let apiKey = state.apiKey;
    try {
      apiKey = resolverClave(leerVariableDeLocalStorage, config.providerId);
    } catch { /* sin localStorage se conserva la clave anterior */ }
    return { aiProviderConfig, apiKey };
  }),
  setSelectedElementId: (id) => set((state) => ({
    selectedElementId: id,
    selectedReferenceId: id ? null : state.selectedReferenceId,
  })),
  setSelectedReferenceId: (id) => set((state) => ({
    selectedReferenceId: id,
    selectedElementId: id ? null : state.selectedElementId,
  })),
  runProactiveAudits: async () => {
    const { doc, sugerenciasProactivas, apiKey, aiProviderConfig } = get();
    if (!sugerenciasProactivas || !doc) return;
    /* Este globo son DOS motores (citas y revisión de estilo) que se lanzan
       juntos. Se anotan juntos y se apagan juntos: separarlos daría un estado
       de corrida que dice "corre el de estilo" mientras el de citas ya terminó,
       y la pantalla quedaría mintiendo en el detalle. */
    get().notarAuditoria('citas y estilo');
    get().notarAuditoria('revisión de estilo con IA');
    try {
      const result = await api.validateCitations(doc.session_id);
      set({ citationAuditResult: result });
    } catch { /* silencioso: los globos de citas esperarán la auditoría manual */ }
    try {
      const result = await api.runAIReview(doc.session_id);
      // FILTER_QUE: 'que' aislado NO es problema (falso positivo clasico del LLM)
      try {
        const ev = (result as any)?.findings || (result as any)?.issues || [];
        for (const f of ev as any[]) {
          if (typeof f?.evidence === 'string' && /^\s*["\u00ab']?que["\u00bb']?\.?\s*$/i.test(f.evidence)) {
            (f as any)._dismissed = true;
          }
          if (typeof f?.message === 'string' && /\bque\b/i.test(f.message) && String(f?.category||'').includes('ai')) {
            f.message = f.message.replace(/\b"que"\b/gi, 'conector');
          }
        }
      } catch {}
      set({ reviewResult: result });
    } catch { /* silencioso: estilo/IA esperarán la revisión manual */ }
    // Proactivo total: buscar referencias faltantes en Crossref sin molestar.
    try { await get().autoResolveGhosts(); } catch { /* noop */ }
    /* Los dos `catch` de arriba se tragan su propio fallo, así que sin este
       `finally` una caída dejaría dos motores prendidos en el store y la vista
       de Revisión anunciando una corrida que ya terminó. */
    finally {
      get().olvidarAuditoria('citas y estilo');
      get().olvidarAuditoria('revisión de estilo con IA');
    }
  },
  runProactiveAutoCaptioning: async () => {
    const { doc } = get();
    if (!doc) return;
    get().notarAuditoria('leyendas de figuras y tablas');
    try {
      const res = await api.fetchProactiveCaptions(doc.session_id);
      if (res.suggestions && res.suggestions.length > 0) {
        res.suggestions.forEach((sug) => {
          if (sug.type === 'image') {
            get().updateElementImage(sug.element_id, { caption: sug.caption, note: sug.note });
          } else if (sug.type === 'table') {
            get().updateElementTable(sug.element_id, { caption: sug.caption, note: sug.note });
          }
        });
        get().pushActivityEvent(
          'success',
          `Auto-captioning proactivo: ${res.suggestions.length} leyendas generadas`,
          'Títulos y notas APA 7 asignados automáticamente'
        );
      }
    } catch { /* silencioso */ }
    finally { get().olvidarAuditoria('leyendas de figuras y tablas'); }
  },
  setPdfPreviewCache: (cache) => set({ pdfPreviewCache: cache }),
  renumberHeadings: (style) => {
    const { doc, pushHistory } = get();
    if (!doc) return;
    let count = 0;
    const updatedElements = doc.elements.map((e) => {
      if (e.type === 'heading' && (e.heading_level || 1) === 1) {
        count += 1;
        const rawText = e.text || e.original_text || '';
        const baseText = cleanHeadingPrefix(rawText);
        const prefix = style === 'roman' ? `${toRoman(count)}.` : `${count}.`;
        return {
          ...e,
          original_text: baseText,
          text: `${prefix} ${baseText}`,
        };
      }
      return e;
    });
    const updatedDoc = { ...doc, elements: updatedElements };
    pushHistory(updatedDoc);
    set({ doc: updatedDoc });
  },
  openSession: async (sessionId) => {
    set({ isLoading: true, error: null });
    try {
      let recovered = await api.recoverSession(sessionId);
      recovered = migrateDocument(recovered);
      set((state) => {
        const existing = state.tabs.findIndex((t) => t.session_id === sessionId);
        if (existing >= 0) {
          const newTabDocs = { ...state.tabDocs, [sessionId]: recovered };
          return {
            doc: recovered,
            references: recovered.referencias || [],
            tabDocs: newTabDocs,
            activeTabIndex: existing,
            atHome: false,
            isLoading: false,
            wizardStep: Math.max(1, state.wizardStep),
            selectedElementId: null,
            selectedReferenceId: null,
            scrollTargetId: null,
            // Sesión recuperada → la verdad COM de la sesión anterior no aplica.
            ...layoutResetFields(),
          };
        }
        const newTab = { session_id: recovered.session_id, file_name: recovered.file_name };
        const newTabs = [...state.tabs, newTab];
        const newTabDocs = { ...state.tabDocs, [recovered.session_id]: recovered };
        return {
          doc: recovered,
          references: recovered.referencias || [],
          tabs: newTabs,
          activeTabIndex: newTabs.length - 1,
          tabDocs: newTabDocs,
          atHome: false,
          isLoading: false,
          history: [recovered],
          historyIndex: 0,
          wizardStep: 1,
          liveChatOpen: false,
          selectedElementId: null,
          selectedReferenceId: null,
          scrollTargetId: null,
          // Sesión recuperada → la verdad COM de la sesión anterior no aplica.
          ...layoutResetFields(),
        };
      });
    } catch (err: any) {
      set({ error: err.message || 'Error al abrir la sesión', isLoading: false });
      get().showToast(err.message || 'Error al abrir la sesión', 'error');
    }
  },
  aplicarRefresco: async (diff) => {
    const { doc } = get();
    /* Sin documento abierto no hay nada que recargar. El watcher dispara por
       evento del sistema de archivos, no por accion del usuario: puede saltar
       con la app en Home. */
    if (!doc) return { listo: false, cambiado: false, nuevos: 0, eliminados: 0, hallazgos: null };
    if (!diff.listo || !diff.cambiado) {
      return { listo: diff.listo, cambiado: diff.cambiado, nuevos: 0, eliminados: 0, hallazgos: null };
    }
    /* El backend YA guardo el documento reparseado, y el diff que se recibio es
       la prueba. Recargarlo es la unica forma de que la pantalla y el backend no
       se contradigan: mientras tanto, el texto nuevo estaria en el servidor y el
       viejo en la vista. Y a la inversa, cuando `listo` es falso el backend NO
       guardo nada, asi que recargar ahi tiraria el estado guardado para atras y
       el texto recien escrito se perderia de la pantalla. Por eso la recarga va
       despues de los dos filtros, no antes. */
    const recargado = migrateDocument(await api.recoverSession(doc.session_id));
    /* `references` es estado rancio del mismo tipo que los hallazgos: viene del
       documento y el documento acaba de cambiar. `openSession` lo actualiza con
       las referencias recuperadas (linea 314) y esta accion no lo hacia, asi que
       si Word agrego o saco una entrada de la bibliografia el panel de Referencias
       seguia mostrando las viejas — el documento en pantalla y el panel
       contradiendose dentro de la misma app. Sin cambio (`cambiado: false`) no se
       llega aca, asi que un Ctrl+S que no toco nada no pisa nada. */
    set((state) => ({
      doc: recargado,
      references: recargado.referencias || [],
      tabDocs: { ...state.tabDocs, [doc.session_id]: recargado },
    }));
    return {
      listo: true,
      cambiado: true,
      /* Los conteos salen DEL DIFF, no de la recarga: el diff conto parrafos y
         la recarga no cuenta nada. */
      nuevos: diff.ids_nuevos.length,
      eliminados: diff.ids_eliminados.length,
      hallazgos: null,
    };
  },
  saveSnapshot: async () => {
    const { doc } = get();
    if (!doc) return;
    set({ isSaving: true });
    try {
      await api.saveSessionSnapshot(doc.session_id);
      /* La hora se fija acá y no con la latencia de la llamada: el chip informa
         de cuándo quedó guardado, no de cuánto tardó el servidor. Medir el
         reloj del cliente alrededor del `await` incluiría la red en la
         respuesta a "¿cuándo se guardó?", que es una pregunta distinta. */
      set({ hasUnsavedChanges: false, lastSavedAt: Date.now(), isSaving: false });
    } catch (err: any) {
      set({ isSaving: false });
      get().showToast(err.message || 'Error al guardar', 'error');
    }
  },
  snapshots: [],
  loadSnapshots: async () => {
    const { doc } = get();
    if (!doc) return;
    try {
      const snapshots = await api.listSessionSnapshots(doc.session_id);
      set({ snapshots });
    } catch (err: any) {
      get().showToast(err.message || 'No se pudo cargar el historial', 'error');
    }
  },
  restoreSnapshot: async (snapshotId) => {
    const { doc } = get();
    if (!doc) return;
    set({ isSaving: true });
    try {
      await api.restoreSessionSnapshot(doc.session_id, snapshotId);
      /* Igual que `aplicarRefresco`: la pantalla se recarga desde el backend
         restaurado, para que no quede una mezcla de versiones en la vista. */
      const recargado = migrateDocument(await api.recoverSession(doc.session_id));
      set((state) => ({
        doc: recargado,
        references: recargado.referencias || [],
        tabDocs: { ...state.tabDocs, [doc.session_id]: recargado },
        hasUnsavedChanges: false,
        lastSavedAt: Date.now(),
        isSaving: false,
      }));
      get().showToast('Versión restaurada', 'success');
    } catch (err: any) {
      set({ isSaving: false });
      get().showToast(err.message || 'No se pudo restaurar la versión', 'error');
    }
  },
  exportLatex: async () => {
    const { doc } = get();
    if (!doc) return;
    set({ isLoading: true });
    try {
      const latex = await api.exportLatex(doc.session_id);
      // Descargar como .tex
      const blob = new Blob([latex], { type: 'application/x-tex' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (doc.file_name || 'documento').replace(/\.[^.]+$/, '') + '.tex';
      a.click();
      URL.revokeObjectURL(url);
      get().showToast('LaTeX exportado', 'success');
    } catch (err: any) {
      get().showToast(err.message || 'Error al exportar LaTeX', 'error');
    } finally {
      set({ isLoading: false });
    }
  },
  uploadFile: async (file, opts) => {
    /* F7 Task 3. `activeFilePath` es `null` por defecto y antes NUNCA se
       escribia en este camino: solo se establecia en `App.tsx:298`, que es el
       menu contextual de Windows. O sea, el boton "Abrir carpeta" del Explorador
       —`ProjectFolderModal.tsx`— no aparecia nunca en el modo de uso normal, que
       es elegir el archivo desde la app. Nadie lo noto porque nadie lo veia.

       ESTA ES LA PRIMERA SENTENCIA DEL CAMINO, Y NO POR ORDEN ESTETICO. Este
       `uploadFile` arranca con un `await import` de los chistes, o sea que antes
       de llegar a la subida hay un salto al microtask queue. Escribir la ruta
       despues de ese salto hacia que la ruta arrive tarde: la persona abre el
       Explorador mientras la subida sigue en curso y el boton no esta. La ruta
       del archivo ya se conoce en este punto, asi que se escribe antes de
       cualquier salto.

       Y SOLO si la hay: un `File` de navegador no trae `.path`, y poner `null` en
       ese caso borraria la ruta del documento que todavia esta abierto,
       dejandolo sin "Abrir carpeta" sobre el archivo que tiene delante. */
    const rutaDelArchivo = (file as File & { path?: string }).path;
    if (rutaDelArchivo) set({ activeFilePath: rutaDelArchivo });

    // Chistes contextuales: nombre de archivo tipo "final_v3" y reincidencia
    try {
      const { getFilenameComment, getRepeatComment } = await import('../../lib/studentJokes');
      const joke = getFilenameComment(file.name) || getRepeatComment();
      if (joke) get().showToast(joke, 'info');
    } catch { /* no crítico */ }

    const effectiveMode = opts?.mode || 'review';
    set({ isLoading: true, error: null });
    get().pushActivityEvent('info', `Procesando ${file.name}…`);
    try {
      let doc = await api.uploadDocxFile(file, { profileId: opts?.profileId, mode: effectiveMode });
      doc = migrateDocument(doc);
      // Sincronizar reglas con el perfil elegido en la subida (si el backend lo aplicó)
      const uploadedProfile = get().profiles.find((p) => p.profile_id === (opts?.profileId || doc.profile_id || 'apa7'));
      set((state) => {
        const parsed = parseDocumentVersion(doc.file_name);
        const newTab = {
          session_id: doc.session_id,
          file_name: doc.file_name,
          project_name: parsed.projectName,
          version_label: parsed.versionLabel,
          updated_at: Date.now(),
        };
        const newTabs = [...state.tabs, newTab];
        const newTabDocs = { ...state.tabDocs, [doc.session_id]: doc };

        let updatedPortada = { ...defaultPortada, ...state.portada };
        let updatedActa: ActaDocumento = { ...defaultActa };
        if (doc.portada?.fields && typeof doc.portada.fields === 'object') {
          const f = doc.portada.fields as any;
          const toStr = (v: any) => (Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : v != null ? String(v) : '');
          /* Autor y docente NO van a `portada`: van al acta. Con la portada
             original conservada, un autor guardado en la portada no sale nunca
             porque el bloque no se toca. Ver el motivo en `python/models.py`. */
          const autor = toStr(f.author);
          const docente = toStr(f.instructor);
          if (autor) updatedActa.autor = autor;
          if (docente) {
            const docList = docente.split(/[,\n]/).map((d: string) => d.trim()).filter(Boolean);
            updatedActa.profesor_asesor = docList.length > 0 ? docList : [docente];
          }
          if (f.grupo) updatedActa.grupo = toStr(f.grupo);

          const instStr = toStr(f.institution);
          const instCodigo = toStr(f.institucion_codigo).toUpperCase();
          const esUni = /uni\b|universidad nacional de ingenier[ií]a/i.test(instStr);
          const presetPorCodigo = instCodigo
            ? CATALOGO_DE_UNIVERSIDADES.find((u) => u.codigo === instCodigo)
            : undefined;
          const uniPreset = presetPorCodigo
            ?? (esUni ? CATALOGO_DE_UNIVERSIDADES.find((u) => u.codigo === 'UNI') : undefined);

          updatedPortada = {
            ...updatedPortada,
            title: toStr(f.title) || updatedPortada.title,
            institution: uniPreset ? uniPreset.nombre : (instStr || updatedPortada.institution),
            departamento: uniPreset ? uniPreset.areaDefault : updatedPortada.departamento,
            institucionSeleccionada: uniPreset ? uniPreset.codigo : updatedPortada.institucionSeleccionada,
            logos: (uniPreset && uniPreset.logoUrl)
              ? [{ asset: uniPreset.logoUrl.split('/').pop() as string, ancho_fraccion: FRACCION_DE_ANCHO_DEL_LOGO }]
              : updatedPortada.logos,
            course: toStr(f.course) || updatedPortada.course || '',
            date: toStr(f.date) || updatedPortada.date || '',
          };
        }

        return {
          doc,
          references: doc.referencias || [],
          portada: updatedPortada,
          rules: uploadedProfile ? uploadedProfile.rules : state.rules,
          activeProfileId: uploadedProfile ? uploadedProfile.profile_id : state.activeProfileId,
          isLoading: false,
          tabs: newTabs,
          activeTabIndex: newTabs.length - 1,
          tabDocs: newTabDocs,
          history: [doc],
          historyIndex: 0,
          /* Un documento nuevo arranca con los datos detectados de portada/acta */
          acta: updatedActa,
          coverSetupDone: false,
          atHome: false,
          wizardStep: 1,
          liveChatOpen: false,
          // Documento nuevo → la verdad COM del doc anterior no aplica aquí.
          ...layoutResetFields(),
        };
      });
      if (doc.portada?.fields && Object.keys(doc.portada.fields).length > 0) {
        get().showToast('Detectamos datos de tu portada y los precargamos', 'info');
      }
      if (!doc.elements || doc.elements.length === 0) {
        get().showToast(
          'El documento se abrió pero no se detectó contenido. Puede estar protegido, corrupto o ser un formato no soportado.',
          'error'
        );
      }
      get().pushActivityEvent('success', `Documento listo: ${doc.elements.length} elementos`, doc.file_name);
      // Globos proactivos: auditorías silenciosas en background
      get().runProactiveAudits().catch(() => {});
      get().runProactiveAutoCaptioning().catch(() => {});
      // Revisor por lotes (ortografía/IA/pegado): silencioso
      get().runProofreadBatch().catch(() => {});
      // Revisor IA de párrafos y voz sintética (evita que aparezca 0% al entrar al Paso 5)
      get().runAIReview().catch(() => {});

      // Auto-disparar clasificación LLM en background silencioso sin bloquear la UI
      const uncertainCount = doc.elements.filter(
        (e: any) => e.needs_review || (e.confidence < 0.85 && e.type !== 'empty' && e.type !== 'image' && e.type !== 'table')
      ).length;
      if (uncertainCount > 0) {
        get().runLLMClassify({ silent: true }).catch(() => {});
      }
      // F8: evaluar proyecto para este archivo (no bloquea, no pregunta dos veces)
      setTimeout(() => get().evaluarProyectoParaArchivo(file), 800);
    } catch (err: any) {
      set({ error: err.message || 'Error al procesar archivo', isLoading: false });
      get().pushActivityEvent('error', 'Error al procesar el archivo', err.message || 'Intenta de nuevo.');
    }
  },
  startBlankDocument: async () => {
    set({ isLoading: true, error: null });
    try {
      const doc = await api.startBlankDocument();
      set((state) => {
        const newTab = { session_id: doc.session_id, file_name: doc.file_name };
        const newTabs = [...state.tabs, newTab];
        const newTabDocs = { ...state.tabDocs, [doc.session_id]: doc };

        return {
          doc,
          isLoading: false,
          tabs: newTabs,
          activeTabIndex: newTabs.length - 1,
          tabDocs: newTabDocs,
          history: [doc],
          historyIndex: 0,
          /* Un documento nuevo arranca con el acta vacia: sin esto los datos
             del acta del documento anterior quedan pegados al nuevo. */
          acta: { ...defaultActa },
          coverSetupDone: false,
          atHome: false,
          wizardStep: 1,
          // Documento nuevo → la verdad COM del doc anterior no aplica aquí.
          ...layoutResetFields(),
        };
      });
    } catch (err: any) {
      set({ error: err.message || 'Error al iniciar documento', isLoading: false });
    }
  },
  createFromTemplate: async (templateId) => {
    set({ isLoading: true, error: null });
    try {
      let doc = await api.createFromTemplate(templateId, get().activeProfileId);
      doc = migrateDocument(doc);
      const prof = get().profiles.find((p) => p.profile_id === (doc.profile_id || get().activeProfileId));
      set((state) => {
        const newTab = { session_id: doc.session_id, file_name: doc.file_name };
        const newTabs = [...state.tabs, newTab];
        const newTabDocs = { ...state.tabDocs, [doc.session_id]: doc };
        return {
          doc,
          references: doc.referencias || [],
          rules: prof ? prof.rules : state.rules,
          activeProfileId: prof ? prof.profile_id : state.activeProfileId,
          isLoading: false,
          tabs: newTabs,
          activeTabIndex: newTabs.length - 1,
          tabDocs: newTabDocs,
          history: [doc],
          historyIndex: 0,
          /* Un documento nuevo arranca con el acta vacia: sin esto los datos
             del acta del documento anterior quedan pegados al nuevo. */
          acta: { ...defaultActa },
          coverSetupDone: false,
          atHome: false,
          wizardStep: 1,
          // Documento nuevo → la verdad COM del doc anterior no aplica aquí.
          ...layoutResetFields(),
        };
      });
      get().showToast('Documento creado desde la plantilla: completá la portada y escribí.', 'success');
    } catch (err: any) {
      set({ error: err.message || 'Error al crear documento desde plantilla', isLoading: false });
      get().showToast(err?.message || 'No se pudo crear el documento desde la plantilla', 'error');
    }
  },

  // Undo/Redo,
  pushHistory: (doc) => set((state) => {
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(structuredClone(doc));
    if (newHistory.length > 50) newHistory.shift();
    /* `pushHistory` es el punto donde el SERVIDOR ya confirmó: se la llama con
       el documento que volvió de la mutación, y cada una de esas mutaciones
       persiste server-side. Por eso la hora del chip se sella acá y no en un
       guardado aparte —que además no lo llama nadie—: si se sellara en un
       temporizador, el chip iría diciendo "hace 0 min" con cambios que el
       servidor todavía no vio.

       Y `hasUnsavedChanges` sigue significando lo que siempre significo: hay
       trabajo sin confirmar en ESTA sesión, que es lo que usa el aviso de
       descartar. No es "el servidor no lo tiene", y por eso el chip ya no lo
       usa para su aviso. */
    return {
      history: newHistory,
      historyIndex: newHistory.length - 1,
      hasUnsavedChanges: true,
      lastSavedAt: Date.now(),
      isSaving: false,
    };
  }),
  undo: () => set((state) => {
    if (state.historyIndex <= 0 || !state.doc) return {};
    const newIndex = state.historyIndex - 1;
    const prevDoc = state.history[newIndex];
    const newTabDocs = { ...state.tabDocs, [prevDoc.session_id]: prevDoc };
    return { doc: prevDoc, historyIndex: newIndex, tabDocs: newTabDocs };
  }),
  redo: () => set((state) => {
    if (state.historyIndex >= state.history.length - 1 || !state.doc) return {};
    const newIndex = state.historyIndex + 1;
    const nextDoc = state.history[newIndex];
    const newTabDocs = { ...state.tabDocs, [nextDoc.session_id]: nextDoc };
    return { doc: nextDoc, historyIndex: newIndex, tabDocs: newTabDocs };
  }),
  runLLMClassify: async (opts?: { silent?: boolean }) => {
    const { doc, apiKey, aiProviderConfig, llmCloudConsent } = get();
    if (!doc) return;

    // Consentimiento informado: si hay API key de un proveedor en la nube,
    // el contenido del documento sale de la computadora. Se pide una sola vez
    // mediante un modal propio (App.tsx renderiza el diálogo cuando
    // llmConsentPending === true).
    if (apiKey && !llmCloudConsent && !aiProviderConfig.useLocal) {
      set({ llmConsentPending: true });
      return;
    }
    set({ llmConsentPending: false });

    const silent = Boolean(opts?.silent);
    if (!silent) {
      set({ isLoading: true, error: null, llmProgress: { ...defaultLLMProgress, status: 'processing' } });
    } else {
      set({ llmProgress: { ...defaultLLMProgress, status: 'processing' } });
    }

    const startTime = Date.now();
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    // Start polling progress
    pollInterval = setInterval(async () => {
      try {
        const progress = await api.getClassifyProgress(doc.session_id);
        const state = get();
        if (state.llmProgress.status !== progress.status) {
          set({ llmProgress: progress });
        } else {
          set({ llmProgress: progress });
        }
      } catch {
        // Silently fail on poll errors
      }
    }, 1000);

    try {
      const updated = await api.classifyWithLLM(doc.session_id, apiKey, aiProviderConfig);
      const durationMs = Date.now() - startTime;

      // Clear polling
      if (pollInterval) clearInterval(pollInterval);

      // Get final progress
      let finalProgress = defaultLLMProgress;
      try {
        finalProgress = await api.getClassifyProgress(doc.session_id);
      } catch {
        finalProgress = { ...defaultLLMProgress, status: 'complete' };
      }

      const tokensUsed = Math.min(5000, doc.elements.length * 25);
      const logItem = {
        id: `log_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        endpoint: '/api/classify-batch',
        statusCode: 200,
        tokensUsed,
        durationMs,
        status: 'success' as const,
        message: apiKey
          ? `Clasificación multi-proveedor completada. Proveedor final: ${finalProgress.current_provider || 'NVIDIA NIM'}`
          : 'Completado con clasificación heurística local (Sin API Key configurada).'
      };

      set((state) => ({
        doc: updated,
        ...(silent ? {} : { isLoading: false }),
        llmProgress: finalProgress,
        nimLogs: [logItem, ...(state.nimLogs || [])],
        llmUsageStats: {
          total_tokens: (state.llmUsageStats.total_tokens || 0) + tokensUsed,
          providers_used: finalProgress.provider_fallbacks?.length
            ? [...new Set([
                ...finalProgress.provider_fallbacks.map((f: any) => f.from),
                ...finalProgress.provider_fallbacks.map((f: any) => f.to),
                finalProgress.current_provider_id,
              ])]
            : [finalProgress.current_provider_id || 'nvidia_nim'],
          estimated_cost_usd: 0,
          cache_hits: 0,
          api_calls: finalProgress.total_batches || 1,
        },
      }));

      // Preflight accionable tras clasificar (propuesta 3)
      const d = get().doc || updated;
      const heads = d.elements.filter((e: any) => e.type === 'heading').length;
      const figs = d.elements.filter((e: any) => e.type === 'image' && e.image_info && (e.image_info.figure_number || 0) > 0).length;
      const tabs = d.elements.filter((e: any) => e.type === 'table' && e.table_info).length;
      set({
        preflightReport: {
          headings: heads,
          figures: figs,
          tables: tabs,
          paragraphs: d.elements.filter((e: any) => e.type === 'paragraph').length,
          flaggedHigh: 0,
          flaggedMedium: 0,
          reviewed: d.elements.filter((e: any) => !e.needs_review).length,
        },
      });
      get().showToast(
        `Clasificación completada: ${heads} títulos, ${figs} figuras, ${tabs} tablas. Abrir Revisor IA →`,
        'success',
        {
          label: 'Abrir Revisor',
          onClick: () => {
            get().runAIReview();
            get().setForceRightPanelOpen(true);
            get().setRightPanelTab('activity');
          },
        }
      );
    } catch (err: any) {
      if (pollInterval) clearInterval(pollInterval);
      const durationMs = Date.now() - startTime;
      const logItem = {
        id: `log_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        endpoint: '/api/classify-batch',
        statusCode: 500,
        tokensUsed: 0,
        durationMs,
        status: 'error' as const,
        message: err.message || 'Error en comunicación con proveedor LLM'
      };
      set((state) => ({
        error: err.message || 'Error en clasificación LLM',
        ...(silent ? {} : { isLoading: false }),
        llmProgress: { ...defaultLLMProgress, status: 'error', last_error: err.message },
        nimLogs: [logItem, ...(state.nimLogs || [])],
      }));
      get().showToast(err.message || 'Error en clasificación LLM', 'error');
    }
  },
  updateElementType: async (elementId, type, headingLevel, text) => {
    const { doc, pushHistory } = get();
    if (!doc) return;
    try {
      const localElem = doc.elements.find((e) => e.id === elementId);
      const equation = localElem?.type === 'equation' ? localElem.equation : undefined;
      const updated = await api.updateElement(doc.session_id, elementId, type, headingLevel, text, equation);
      pushHistory(updated);
      set({ doc: updated });
    } catch (err: any) {
      // C7: Show visible error toast instead of silent console.error
      get().showToast(err?.message || 'Error al actualizar elemento', 'error');
    }
  },
  updateElementText: async (elementId, text) => {
    const { doc } = get();
    if (!doc) return;
    const elem = doc.elements.find((e) => e.id === elementId);
    if (!elem) return;
    await get().updateElementType(elementId, elem.type, elem.heading_level, text);
  },
  splitParagraphAt: async (elementId, before, after) => {
    const { doc, pushHistory } = get();
    if (!doc) return;
    const idx = doc.elements.findIndex((e) => e.id === elementId);
    if (idx < 0) return;
    const elem = doc.elements[idx];
    // 1) Commit del texto ANTES del cursor al párrafo actual (ruta existente).
    await get().updateElementType(elementId, elem.type, elem.heading_level, before);
    // 2) Párrafo nuevo con el texto DESPUÉS del cursor.
    if (!after) return;   // split al final: no hay párrafo nuevo que insertar
    const c = globalThis.crypto as Crypto | undefined;
    const newId = c && typeof c.randomUUID === 'function'
      ? c.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
    try {
      const updated = await api.insertElement(doc.session_id, elementId, newId, after);
      pushHistory(updated);
      set({ doc: updated });
    } catch (err: any) {
      get().showToast(err?.message || 'Error al insertar párrafo', 'error');
    }
  },
  insertImageElement: async (afterId, image) => {
    const { doc, pushHistory } = get();
    if (!doc) return;
    const c = globalThis.crypto as Crypto | undefined;
    const newId = c && typeof c.randomUUID === 'function'
      ? c.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
    try {
      const updated = await api.insertImageElement(doc.session_id, afterId, newId, image);
      pushHistory(updated);
      set({ doc: updated });
    } catch (err: any) {
      get().showToast(err?.message || 'Error al insertar la figura', 'error');
    }
  },
  updateElementImage: async (elementId, imageInfo) => {
    const { doc, pushHistory } = get();
    if (!doc) return;
    const cleanCaption = imageInfo.caption ? imageInfo.caption.replace(/\*/g, '') : imageInfo.caption;
    const sanitizedInfo = { ...imageInfo, ...(cleanCaption !== undefined ? { caption: cleanCaption } : {}) };
    try {
      let updated = await api.updateElementImage(doc.session_id, elementId, sanitizedInfo);
      if (cleanCaption) {
        updated = cleanRedundantTitleParagraphs(updated, elementId, cleanCaption);
      }
      pushHistory(updated);
      set({ doc: updated });
    } catch (err: any) {
      get().showToast(err?.message || 'Error al actualizar imagen', 'error');
    }
  },

  updateElementTable: async (elementId, tableInfo) => {
    const { doc, pushHistory } = get();
    if (!doc) return;
    const cleanCaption = tableInfo.caption ? tableInfo.caption.replace(/\*/g, '') : tableInfo.caption;
    const sanitizedInfo = { ...tableInfo, ...(cleanCaption !== undefined ? { caption: cleanCaption } : {}) };
    try {
      let updated = await api.updateElementTable(doc.session_id, elementId, sanitizedInfo);
      if (cleanCaption) {
        updated = cleanRedundantTitleParagraphs(updated, elementId, cleanCaption);
      }
      pushHistory(updated);
      set({ doc: updated });
    } catch (err: any) {
      get().showToast(err?.message || 'Error al actualizar tabla', 'error');
    }
  },
  /**
   * La presentación de una ecuación: número, formato, alineación y tipografía de
   * apoyo. El XML (OMML) viaja intacto —`api.updateElement` lo recibe aparte— y
   * entra en el deshacer como cualquier otro PATCH del elemento.
   *
   * Existe como action propia en vez de reusar `updateElementType` porque esto
   * es un cambio de un CAMPO (la ecuación), no del tipo ni del texto: una action
   * que miente sobre lo que cambia es la próxima que alguien reusa mal.
   */
  updateElementEquation: async (elementId, equation) => {
    const { doc, pushHistory } = get();
    if (!doc) return;
    const elem = doc.elements.find((e) => e.id === elementId);
    if (!elem || elem.type !== 'equation') return;
    try {
      const updated = await api.updateElement(
        doc.session_id,
        elementId,
        elem.type,
        elem.heading_level ?? 1,
        elem.text,
        equation,
      );
      pushHistory(updated);
      set({ doc: updated });
    } catch (err: any) {
      get().showToast(err?.message || 'Error al actualizar la ecuación', 'error');
    }
  },
  /**
   * El mismo `patch` sobre varias figuras, de a una.
   *
   * POR QUÉ UN `for` Y NO UN ENDPOINT EN LOTE. El endpoint es `/api/update-element`
   * (`python/routers/sessions.py:684`) y acepta un `element_id` por llamada; las
   * veinte figuras de la F7 son veinte llamadas, y eso es un costo conocido y
   * tolerable. Un endpoint en lote es el arreglo correcto y es otra fase: cablear
   * un botón a un endpoint que no existe es peor que no cablearlo (spec §3.5).
   *
   * EL ALCANCE SE DECLARA EN EL PARÁMETRO. Esta action no sabe qué es "todas" y no
   * lo deduce: quien llama pasa los ids, y el que pasó los ids es el que sabe por
   * qué. Un `for` sobre `figures.length` adentro de la vista sería una decisión de
   * alcance escondida en un botón, que es exactamente lo que F3 resolvió
   * mostrando "(esta rama)" al lado de cada acción.
   *
   * `onProgreso` es lo que permite que la UI diga "7 de 20" en vez de freezing.
   */
  aplicarImagenAMuchas: async (
    elementIds: readonly string[],
    patch: Partial<ImageModel>,
    onProgreso?: (hechos: number, total: number) => void,
  ) => {
    const { doc, showToast } = get();
    if (!doc) return;
    /* Deduplicar ANTES de empezar: un ids con repetidos hace el trabajo dos veces
       y cobra dos veces, y el "N de N" que se muestra no cuadra con nada. */
    const unicos = Array.from(new Set(elementIds));
    const total = unicos.length;
    if (total === 0) return;

    let ultimo: DocumentModel | null = null;
    for (let i = 0; i < total; i++) {
      const id = unicos[i];
      try {
        /* NO se consulta `ultimo.elements` para saltar los ya aplicados. El
           endpoint devuelve el documento ENTERO, no solo el elemento tocado, así
           que ese chequeo encuentra todos los ids presentes y la corrida termina
           después de la primera llamada. La deduplicación va antes, sobre el ids. */
        ultimo = await api.updateElementImage(doc.session_id, id, patch);
      } catch (err: any) {
        /* Se dice cuántas salieron y por qué se paró, y se deja el store en el
           último estado bueno. Decir "listo" con la mitad aplicada es la peor
           versión de este botón: la persona cree que el documento está uniforme y
           no lo está. */
        showToast(
          `Se aplicó a ${i} de ${total} figuras. La ${i + 1} falló: ${err?.message ?? 'error desconocido'}`,
          'error',
        );
        if (ultimo) { get().pushHistory(ultimo); set({ doc: ultimo }); }
        return;
      }
      onProgreso?.(i + 1, total);
    }
    if (ultimo) { get().pushHistory(ultimo); set({ doc: ultimo }); }
    showToast(`Se aplicó a ${total} ${total === 1 ? 'figura' : 'figuras'}`, 'success');
  },

  replaceImage: async (elementId, file) => {
    const { doc, pushHistory } = get();
    if (!doc) return;
    const updated = await api.replaceImageFile(doc.session_id, elementId, file);
    pushHistory(updated);
    set({ doc: updated });
  },
  reorderElements: async (elementIds) => {
    const { doc, pushHistory } = get();
    if (!doc) return;
    try {
      const updated = await api.reorderElements(doc.session_id, elementIds);
      pushHistory(updated);
      set({ doc: updated });
    } catch (err: any) {
      console.error('Error reordering elements:', err);
    }
  },
  acceptHighConfidenceElements: async () => {
    const { doc, pushHistory } = get();
    if (!doc) return;
    const highConf = doc.elements.filter((e) => e.confidence >= 0.85 && !e.is_user_modified && e.type !== 'empty');
    if (highConf.length === 0) return;
    set({ isLoading: true });
    try {
      const updated = await api.bulkAcceptElements(doc.session_id, highConf.map(e => e.id));
      pushHistory(updated);
      set({ doc: updated, isLoading: false });
    } catch (e: any) {
      set({ error: e.message || 'Error al aprobar elementos', isLoading: false });
    }
  },
  approveAllHeadings: async () => {
    const { doc, pushHistory } = get();
    if (!doc) return;
    const headings = doc.elements.filter((e) => e.type === 'heading');
    if (headings.length === 0) return;
    set({ isLoading: true });
    try {
      const updated = await api.bulkAcceptElements(doc.session_id, headings.map(e => e.id));
      const updatedElements = updated.elements.map(e => {
        if (e.type === 'heading') {
          return { ...e, needs_review: false, is_user_modified: true, confidence: 1.0, auto_applied: true };
        }
        return e;
      });
      const finalDoc = { ...updated, elements: updatedElements };
      pushHistory(finalDoc);
      set({ doc: finalDoc, isLoading: false });
      get().showToast(`${headings.length} títulos validados y aprobados`, 'success');
    } catch (e: any) {
      set({ error: e.message || 'Error al aprobar títulos', isLoading: false });
    }
  },
  autoNormalizeHeadings: async () => {
    const { doc, pushHistory } = get();
    if (!doc) return;
    set({ isLoading: true });
    try {
      const updated = await api.normalizeHeadings(doc.session_id);
      pushHistory(updated);
      set({ doc: updated, isLoading: false });
      get().showToast('Jerarquía de títulos normalizada según APA 7ma edición', 'success');
    } catch (e: any) {
      set({ error: e.message || 'Error al normalizar títulos', isLoading: false });
    }
  },
  runQuickFix: async () => {
    const { doc } = get();
    if (!doc) {
      get().showToast('Subí un documento primero', 'warning');
      return;
    }
    set({ isLoading: true });
    try {
      await get().acceptHighConfidenceElements().catch(() => {});
      await get().runValidation().catch(() => {});
      await get().runCitationAudit().catch(() => {});
      const res = get().citationAuditResult;
      const ghosts = res?.ghost_citations?.length || 0;
      const orphans = res?.orphan_references?.length || 0;
      get().pushActivityEvent(
        'success',
        'Formato aplicado automáticamente',
        ghosts + orphans > 0
          ? `Quedan ${ghosts + orphans} citas/referencias por resolver`
          : 'Clasificación, validación y citas al día',
      );
      get().showToast(
        ghosts + orphans > 0
          ? 'Documento arreglado. Revisá las citas en Referencias.'
          : 'Documento arreglado: formato aplicado y citas al día.',
        ghosts + orphans > 0 ? 'warning' : 'success',
      );
    } catch (err: any) {
      get().showToast(err.message || 'No se pudo aplicar el formato', 'error');
    } finally {
      set({ isLoading: false });
    }
  },
  insertTocElement: () => {
    const { doc } = get();
    if (!doc) return;
    // No duplicar si ya hay un TOC
    if (doc.elements.some((e) => e.type === 'toc')) {
      get().showToast('Ya existe un índice en el documento.', 'warning');
      return;
    }
    const tocElem: any = {
      id: `toc_${Date.now()}`,
      type: 'toc',
      heading_level: 1,
      text: 'Índice / Tabla de Contenidos',
      style_name: 'Normal',
      alignment: 'left',
      font_name: doc.elements[0]?.font_name || 'Times New Roman',
      font_size: doc.elements[0]?.font_size || 12,
      is_bold: false,
      is_italic: false,
      is_bullet: false,
      left_indent_cm: 0,
      confidence: 1.0,
      is_user_modified: true,
      needs_review: false,
      auto_applied: false,
      cita_ids: [],
      toc_style: 'dotted',
    };
    // Insertar después de la portada (tras los elementos de portada / portada_block)
    let insertIdx = 0;
    for (let i = 0; i < doc.elements.length; i++) {
      const e = doc.elements[i];
      if (e.is_cover_section || e.type === 'portada_block' || e.type === 'page_break') insertIdx = i + 1;
    }
    const next = [...doc.elements];
    next.splice(insertIdx, 0, tocElem);
    get().pushHistory(doc);
    set({ doc: { ...doc, elements: next } });
    get().showToast('Índice insertado tras la portada. Se generará como Tabla de Contenidos de Word.', 'success');
  },
  removeTocElement: () => {
    const { doc } = get();
    if (!doc) return;
    const next = doc.elements.filter((e) => e.type !== 'toc');
    get().pushHistory(doc);
    set({ doc: { ...doc, elements: next } });
    get().showToast('Índice eliminado del documento.', 'info');
  },

  // C6: Auto-generate captions for all images and tables that lack one.
  // Iterates sequentially with error protection per element.,
  setRules: (newRules) => set((state) => ({ rules: { ...state.rules, ...newRules } })),
  fetchProfiles: async () => {
    try {
      const data = await api.listProfiles();
      set({ profiles: data.profiles || [] });
    } catch {
      // Sin red/backend: quedan los perfiles persistidos en IndexedDB (partialize).
      // El fallback a APA7 por defecto no bloquea el arranque.
    }
  },
  setActiveProfile: async (profileId) => {
    const profile = get().profiles.find((p) => p.profile_id === profileId);
    if (!profile) return;
    set({ activeProfileId: profileId, rules: profile.rules });
    const doc = get().doc;
    if (doc) {
      try {
        const updated = await api.setSessionProfile(doc.session_id, profileId);
        const migrated = migrateDocument(updated);
        set((state) => ({
          doc: migrated,
          tabDocs: { ...state.tabDocs, [doc.session_id]: migrated },
        }));
      } catch (err: any) {
        get().showToast(err.message || 'Error al aplicar el perfil', 'error');
      }
    }
  },
  saveRuleProfile: (name) => set((state) => {
    const profile = { ...state.rules, profile_name: name, is_default: false };
    return { ruleProfiles: [...state.ruleProfiles, profile] };
  }),
  resetRulesToDefault: () => set({ rules: defaultRules }),
  updateReferences: (refs) => set((state) => ({ references: refs, doc: state.doc ? { ...state.doc, referencias: refs } : state.doc })),
  addReference: (ref) => set((state) => {
    const nextRefs = [...state.references, ref];
    return { references: nextRefs, doc: state.doc ? { ...state.doc, referencias: nextRefs } : state.doc };
  }),
  addReferencia: (ref) => get().addReference(ref),
  removeReference: (id) => set((state) => {
    const nextRefs = state.references.filter((r) => r.id !== id);
    return { references: nextRefs, doc: state.doc ? { ...state.doc, referencias: nextRefs } : state.doc };
  }),
  resolveDoiReference: async (doi: string) => {
    set({ isLoading: true });
    try {
      const res = await fetch(`${getApiBase()}/resolve-doi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doi }),
      });
      if (res.ok) {
        const data = await res.json();
        /* Se guarda lo que devuelve el servidor, no lo que escribio la persona
           y no lo que este codigo inventa:
           - `doi_or_url` es el DOI o URL ya NORMALIZADO por el backend.
           - `authors`, `title`, `source` y `year` NO llevan valor inventado. */
        const fuenteVerif = data.tipo === 'web' ? 'web' : 'doi';
        get().addReference({
          id: Date.now().toString(),
          authors: data.authors ?? [],
          year: data.year ?? 's.f.',
          title: data.title ?? '',
          source: data.source ?? '',
          doi_or_url: data.doi_or_url ?? doi,
          raw_text: data.apa_formatted ?? '',
          formatted_apa: data.apa_formatted ?? '',
          verificada: true,
          fuente_verificacion: fuenteVerif,
        });
        get().showToast(
          data.tipo === 'web' ? 'Referencia agregada desde enlace web' : 'Referencia agregada desde DOI',
          'success',
        );
      } else {
        let msg = `No se pudo resolver (error ${res.status})`;
        try {
          const errData = await res.json();
          if (errData?.detail?.mensaje) {
            msg = errData.detail.mensaje;
          } else if (typeof errData?.detail === 'string') {
            msg = errData.detail;
          }
        } catch {
          // Si no es JSON, conservar mensaje base
        }
        get().showToast(msg, 'error');
      }
    } catch (e) {
      console.error('Error resolving DOI or URL:', e);
      get().showToast(e instanceof Error ? e.message : 'Error al resolver la referencia', 'error');
    } finally {
      set({ isLoading: false });
    }
  },
  resolveDoisBlock: async (text: string) => {
    /* Tipo Zotero: pegar un bloque de DOIs, uno por linea, y que se arme la
       lista. El backend ya deduplica por DOI normalizado y separa lo que
       resolvio de lo que fallo, asi que aca solo se agregan las resueltas y se
       reporta el resto: un DOI malo NO puede tirar abajo las otras 19. */
    set({ isLoading: true });
    try {
      const res = await fetch(`${getApiBase()}/resolve-dois`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        get().showToast(`No se pudieron resolver los DOI (error ${res.status})`, 'error');
        return;
      }
      const data = await res.json();
      const resueltas: any[] = data.resueltas || [];
      const fallidas: any[] = data.fallidas || [];
      for (const r of resueltas) {
        get().addReference({
          id: `doi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          authors: r.authors ?? [],
          year: r.year ?? 's.f.',
          title: r.title ?? '',
          source: r.source ?? '',
          doi_or_url: r.doi_or_url ?? '',
          raw_text: r.apa_formatted ?? '',
          formatted_apa: r.apa_formatted ?? '',
          verificada: true,
          fuente_verificacion: 'doi',
        });
      }
      if (resueltas.length && !fallidas.length) {
        get().showToast(`${resueltas.length} referencia(s) agregada(s)`, 'success');
      } else if (resueltas.length && fallidas.length) {
        get().showToast(
          `${resueltas.length} agregada(s), ${fallidas.length} sin resolver: ` +
          fallidas.map((f: any) => f.entrada).join(', '),
          'warning',
        );
      } else if (fallidas.length) {
        get().showToast(`Ninguno se pudo resolver: ${fallidas[0]?.entrada ?? ''}`, 'error');
      }
    } catch (e) {
      console.error('Error resolving DOI block:', e);
      get().showToast(e instanceof Error ? e.message : 'Error al resolver los DOI', 'error');
    } finally {
      set({ isLoading: false });
    }
  },
  verifyReferences: async () => {
    /* Contrastar la bibliografia ya cargada. DOI exacto primero, autor+año
       despues. El backend SOLO marca las que matchean con confianza; aca se
       refleja ese veredicto y no se inventa uno: una referencia que no se pudo
       contrastar sigue Pendiente. */
    const refs = get().references;
    if (!refs.length) return;
    set({ isLoading: true });
    try {
      const res = await fetch(`${getApiBase()}/references/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          references: refs.map((r) => ({
            id: r.id,
            authors: r.authors ?? [],
            year: r.year ?? '',
            title: r.title ?? '',
            doi_or_url: r.doi_or_url ?? '',
          })),
        }),
      });
      if (!res.ok) {
        get().showToast(`No se pudo verificar la bibliografía (error ${res.status})`, 'error');
        return;
      }
      const data = await res.json();
      const porId = new Map(
        ((data.results || []) as any[]).map((r) => [String(r.id), r]),
      );
      const actualizadas = refs.map((r) => {
        const v = porId.get(String(r.id));
        if (!v || !v.verificada) return r;
        return {
          ...r,
          verificada: true,
          fuente_verificacion: v.fuente_verificacion ?? 'cruzada',
          // Solo se agrega el DOI que la ficha no tenia; no se reescribe nada.
          doi_or_url: r.doi_or_url || v.doi_or_url || '',
        };
      });
      get().updateReferences(actualizadas);

      const verificadas = Number(data.verificadas ?? 0);
      const pendientes = Number(data.pendientes ?? 0);
      if (verificadas && !pendientes) {
        get().showToast(`${verificadas} referencia(s) verificada(s)`, 'success');
      } else if (verificadas && pendientes) {
        get().showToast(`${verificadas} verificada(s), ${pendientes} sin coincidencia`, 'warning');
      } else {
        get().showToast('Ninguna referencia se pudo contrastar', 'warning');
      }
    } catch (e) {
      console.error('Error verifying references:', e);
      get().showToast(e instanceof Error ? e.message : 'Error al verificar la bibliografía', 'error');
    } finally {
      set({ isLoading: false });
    }
  },
  resolveGhostCitation: async (authors: string[], year: string) => {
    // NOTA: sin isLoading global — el overlay fullscreen de carga tapaba toda
    // la UI (parecía "volver al menú de carga"). El paso 4 ya muestra su propio
    // spinner por ítem.
    try {
      const result = await api.resolveGhostCitation(authors, year);
      if (result.found && result.candidates && result.candidates.length > 0) {
        // Auto-agregar el primer candidato (relevance=high) o todos para que el usuario elija
        const ref = result.candidates[0];
        const newRef = {
          id: `ghost-${Date.now()}`,
          authors: ref.authors,
          year: ref.year,
          title: ref.title,
          source: ref.source,
          doi_or_url: ref.doi || '',
          raw_text: ref.formatted_apa,
          formatted_apa: ref.formatted_apa,
          /* Salió de la búsqueda: el backend encontró la obra. Verificada. */
          verificada: true,
          fuente_verificacion: 'cruzada',
        };
        get().addReference(newRef);
        const extra = result.candidates.length > 1 ? ` (${result.candidates.length} resultados, se agregó el mejor match)` : '';
        get().showToast(`Referencia encontrada: ${safeRefText(ref) || 'candidato'}${extra}`, 'success');
        get().runCitationAudit();
        return { ...newRef, candidates: result.candidates };
      }
      /* NO se encontró la obra, pero la cita EXISTE en el texto con su autor y
         su año. Negarse a crear la ficha —o pedir un DOI para hacerlo— deja la
         cita en el limbo: el autor ve "no hay referencia" sobre un dato que sí
         tiene. Se crea la ficha con lo que hay (autor + año) y la auditoría
         volverá a cruzarla; queda como Pendiente —le falta título y fuente—,
         no como un hueco. El DOI nunca fue obligatorio: si aparece después, la
         ficha se completa. */
      const autorTxt = authors.map((a) => (a || '').trim()).filter(Boolean).join(', ') || 'Autor';
      const anioTxt = (year || '').trim() || 's.f.';
      const rawText = `${autorTxt} (${anioTxt}).`;
      const newRef = {
        id: `ghost-${Date.now()}`,
        authors: authors.map((a) => (a || '').trim()).filter(Boolean),
        year: (year || '').trim(),
        title: '',
        source: '',
        doi_or_url: '',
        raw_text: rawText,
        formatted_apa: rawText,
        verificada: false,
      };
      get().addReference(newRef);
      get().showToast(
        `Se creó la ficha de ${autorTxt} (${anioTxt}): completá el título y la fuente.`,
        'info',
      );
      get().runCitationAudit();
      return { ...newRef, candidates: [] };
    } catch (err: any) {
      get().showToast(err.message || 'Error al buscar referencia', 'error');
      return null;
    }
  },
  exportDocx: async (tracked = false) => {
    const { doc, rules, portada, acta, references } = get();
    if (!doc) return;
    set({ isLoading: true });
    try {
      const base = getApiBase();
      const endpoint = tracked ? `${base}/generate-tracked` : `${base}/generate`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        /* `meta` lleva el acta. Sin esto el backend no tiene de donde sacar el
           autor ni el profesor cuando la portada original se conserva, que es
           justo el caso por omision. El backend solo toma de `meta` los campos
           del acta y deja el resto de los metadatos como estaban. */
        body: JSON.stringify({ session_id: doc.session_id, rules, portada, meta: acta, references }),
      });
      if (!res.ok) throw new Error('Error al generar el documento');
      const data = await res.json();
      /* `download_url` es root-relative (`/api/download-artifact/...`) y `base`
         ya termina en `/api`: concatenar tal cual producía `/api/api/...`, el
         backend devolvía 404 y el navegador bajaba ese JSON en vez del .docx.
         El PDF ya hacía este recorte; el DOCX lo había perdido. */
      let path: string = data.download_url;
      if (!/^https?:\/\//i.test(path)) {
        if (base.endsWith('/api') && path.startsWith('/api/')) path = path.slice(4);
        path = `${base}${path.startsWith('/') ? '' : '/'}${path}`;
      }
      triggerDownload(path, data.filename || `APA7_${doc.file_name}`);
      set({ hasUnsavedChanges: false, exportSuccessAt: Date.now() });
      get().showToast('¡Documento DOCX descargado con éxito!', 'success');
    } catch (err: any) {
      set({ error: err.message || 'Error al exportar DOCX', isLoading: false });
      get().showToast(err.message || 'Error al descargar DOCX', 'error');
    } finally {
      set({ isLoading: false });
    }
  },
  exportPdf: async () => {
    const { doc, rules, portada, acta, references } = get();
    if (!doc) return;
    set({ isLoading: true });
    try {
      const base = getApiBase();
      const res = await fetch(`${base}/generate-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: doc.session_id,
          rules,
          portada,
          /* El acta viaja en `meta`. Las dos rutas de exportacion a PDF
             necesitan mandarlo: el backend solo lee el autor y el profesor
             asesor de ahi, y sin esto el PDF sale sin ellos igual que el
             `.docx`. */
          meta: acta,
          references,
        }),
      });
      if (!res.ok) throw new Error('Error al exportar PDF');
      const data = await res.json();
      if (data.status === 'fallback_docx' && data.download_url) {
        // El backend no pudo generar el PDF: avisa en vez de entregar un DOCX como si nada.
        get().showToast('El PDF no pudo generarse en este equipo; se descargó el DOCX oficial.', 'warning');
      }
      if (data.download_url) {
        let path = data.download_url;
        if (!path.startsWith('http')) {
          if (base.endsWith('/api') && path.startsWith('/api/')) {
            path = path.slice(4); // quitar '/api' duplicate
          }
        }
        const downloadUrl = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
        triggerDownload(downloadUrl, data.pdf_name || (doc.file_name?.replace(/\.[^.]+$/, '') + '.pdf'));
        set({ hasUnsavedChanges: false, exportSuccessAt: Date.now() });
        get().showToast('¡Documento PDF descargado con éxito!', 'success');
      }
    } catch (err: any) {
      set({ error: err.message || 'Error al exportar PDF', isLoading: false });
      get().showToast(err.message || 'Error al descargar PDF', 'error');
    } finally {
      set({ isLoading: false });
    }
  },
  activeFilePath: null,
  setActiveFilePath: (path) => set({ activeFilePath: path }),
  copyPdfToClipboard: async () => {
    const { doc, rules, portada, acta, references } = get();
    if (!doc) return false;
    set({ isLoading: true });
    try {
      const base = getApiBase();
      const res = await fetch(`${base}/generate-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: doc.session_id,
          rules,
          portada,
          /* El acta viaja en `meta`. Las dos rutas de exportacion a PDF
             necesitan mandarlo: el backend solo lee el autor y el profesor
             asesor de ahi, y sin esto el PDF sale sin ellos igual que el
             `.docx`. */
          meta: acta,
          references,
        }),
      });
      if (!res.ok) throw new Error('Error al generar PDF para portapapeles');
      const data = await res.json();
      if (!data.file_path) {
        throw new Error('El motor no devolvió la ruta local del archivo PDF.');
      }
      const ew = window as any;
      if (ew.electronAPI?.copyFileToClipboard) {
        const ok = await ew.electronAPI.copyFileToClipboard(data.file_path);
        if (ok) {
          get().showToast('PDF copiado al portapapeles. Pégalo con Ctrl+V en WhatsApp.', 'success');
          return true;
        }
      }
      throw new Error('La función de portapapeles solo está disponible en la app de escritorio.');
    } catch (err: any) {
      get().showToast(err.message || 'Error al copiar PDF al portapapeles', 'error');
      return false;
    } finally {
      set({ isLoading: false });
    }
  },
  applyLayoutPagination: (resp) => {
    const { doc } = get();
    if (!doc || resp.session_id !== doc.session_id) return;   // sesión obsoleta
    if (!resp.available) {
      // D-a: aviso, sin mutar doc. Sin Word el layout es desconocido → no se
      // pinta un documento con cortes viejos (podrían ser de otro doc).
      set((s) => ({
        wordLayoutUnavailable: true,
        ...(s.layoutCuts ? { layoutCuts: null } : {}),
      }));
      return;
    }

    const pagesById = new Map<string, number>(
      (resp.elements || []).map((e) => [e.element_id, e.page_start]),
    );
    let elementsChanged = false;
    const elements = doc.elements.map((el) => {
      const pn = pagesById.get(el.id);
      if (pn !== undefined && pn !== el.page_number) {
        elementsChanged = true;
        return { ...el, page_number: pn };
      }
      return el;
    });

    const nextCuts: Record<string, { offset: number; page: number }[]> = {};
    for (const c of resp.line_cuts || []) {
      if (c.cuts.length > 0) nextCuts[c.element_id] = c.cuts;
    }
    // Firma canónica: JSON.stringify crudo dependía del orden de claves/listas
    // del payload → un reordenamiento semánticamente idéntico re-agendaba.
    const cutsChanged =
      cutsSignature(nextCuts) !== cutsSignature(get().layoutCuts);
    const total = resp.total_pages ?? 0;
    const countChanged = total > 0 && doc.meta.page_count !== total;

    if (!elementsChanged && !cutsChanged && !countChanged) {
      // Respuesta idéntica → nada cambió → SIN layoutEcho → el hook NO
      // re-agenda. Este es el guard que corta el bucle de repaginación.
      if (get().wordLayoutUnavailable) set({ wordLayoutUnavailable: false });
      return;
    }

    set({
      doc: {
        ...doc,
        elements: elementsChanged ? elements : doc.elements,
        meta: countChanged
          ? {
              ...doc.meta,
              page_count: total,
              page_count_exact: true,
              page_layout_provider: resp.provider || 'com',
              page_layout_confidence: 1,
            }
          : doc.meta,
      },
      layoutCuts: nextCuts,
      layoutEcho: (get().layoutEcho || 0) + 1,
      wordLayoutUnavailable: false,
    });
  },
});
