import { StateCreator } from 'zustand';
import { DocState } from '../types';
import { DocumentModel } from '../../types';
import type { PestanaId } from '../../components/settings/tabs';
import { leerCortesGuardados, normalizarCortes, guardarCortes } from '../../lib/aiMosaic';
import type { Proyecto } from '../../lib/proyecto';
import * as api from '../../api/backend';

let mascotTimer: ReturnType<typeof setTimeout> | null = null;

/** Dónde queda anotado que Ajustes se abrió alguna vez. Vive acá y no en la
 *  pestaña App porque lo escribe quien abre el hub, no quien mira la pestaña. */
export const AJUSTES_VISTOS = 'wordapa7-ajustes-vistos';

/** Si Ajustes se abrió alguna vez en este equipo. */
export function ajustesVistos(): boolean {
  try { return localStorage.getItem(AJUSTES_VISTOS) === 'true'; } catch { return false; }
}

export const createUISlice: StateCreator<DocState, [], [], Partial<DocState>> = (set, get) => ({
  isLoading: false,
  exportSuccessAt: null,
  isBackendReady: false,
  retryBackend: () => set((state) => ({ backendCheckNonce: state.backendCheckNonce + 1 })),
  backendCheckNonce: 0,
  zoomLevel: 100,
  setZoomLevel: (zoom) => set({ zoomLevel: Math.min(300, Math.max(50, zoom)) }),
  // El rail de iconos es de 56px fijos. Su detalle se abre en un flyout al
  // hover, no estirando la columna, así que ya no hay ancho que ajustar.
  railPinned: false,
  setRailPinned: (pinned) => set({ railPinned: pinned }),
  nimLogs: [],
  isNIMDiagnosticsOpen: false,
  setIsNIMDiagnosticsOpen: (open) => set({ isNIMDiagnosticsOpen: open }),
  toastMessage: null,
  toasts: [],
  showToast: (message, type = 'info', action) => {
    const DURATIONS: Record<string, number> = { info: 4000, success: 5000, warning: 6000, error: 8000 };
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    set((state) => ({
      toastMessage: message,
      toasts: [...state.toasts.slice(-2), { id, message, type, action }],
      // NOTA (Layer 4, ruido): los toasts NO se empujan al feed de actividad.
      // El panel de trabajo solo muestra eventos útiles (clasificación,
      // validación, revisiones), no mensajes sociales ni de sistema.
    }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      set((state) => ({ toastMessage: state.toasts.length > 0 ? state.toasts[state.toasts.length - 1].message : null }));
    }, DURATIONS[type]);
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  rightPanelTab: 'inspector',
  setRightPanelTab: (tab) => set((state) => ({
    rightPanelTab: tab,
    // Abrir la pestaña Actividad marca todos los eventos como vistos
    activityUnseen: tab === 'activity' ? 0 : state.activityUnseen,
  })),
  activityUnseen: 0,
  activityEvents: [],
  pushActivityEvent: (kind, title, detail) => set((state) => {
    const first = state.activityEvents[0];
    if (first && first.title === title && Date.now() - first.time < 5000) {
      const updated = [{ ...first, kind, detail: detail || first.detail, time: Date.now() }, ...state.activityEvents.slice(1)];
      return { activityEvents: updated };
    }
    return {
      activityEvents: [
        {
          id: `act_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          kind,
          title,
          detail,
          time: Date.now(),
        },
        ...state.activityEvents,
      ].slice(0, 60),
      activityUnseen: state.activityUnseen + 1,
    };
  }),
  lastRequestId: null,
  setLastRequestId: (id) => set({ lastRequestId: id }),
  wizardStep: 1,
  /* DE DONDE VIENES.
     `wizardStep` no tenia memoria: al ir a la etapa 3 y volver, no se recordaba
     que estabas en la 1, y la portada se perdia. Ese es el bug que reporto el
     usuario, textualmente: "se va a otra etapa y no vuelve a la portada".

     El rail actualiza `wizardStepAnterior` cuando entra a una fase del editor
     (AGENTS.md: un destino del rail es una fase, asi que un clic tambien
     vuelve a `viewMode: 'edit'`), y `setWizardStep` lo actualiza en cada salto.
     Con eso, volver a la portada es una pregunta con respuesta. */
  wizardStepAnterior: 1,
  volverAPortada: () => set({ wizardStep: 1, viewMode: 'edit' }),
  recordarFaseAnterior: (paso) => set({ wizardStepAnterior: Math.min(6, Math.max(1, paso)) }),
  setWizardStep: (step) => set((state) => {
    const acotado = Math.min(6, Math.max(1, step));
    return {
      wizardStep: acotado,
      /* Solo se recuerda el salto de fase a fase. Al exportar (6) y volver, el
         destino es el editor, no "la pantalla de exportacion de antes". */
      wizardStepAnterior: acotado === 1 ? state.wizardStepAnterior : acotado,
      viewMode: acotado === 6 ? 'export' : 'edit',
    };
  }),
  /* El índice es lo que se ve al llegar a Estructura. Antes arrancaba en
     'headings', que es el lienzo con el revisor de títulos, y eso es lo que el
     usuario reportó: el centro de la fase era el documento entero. El
     documento sigue a un clic, como toggle DENTRO del índice. */
  structureTab: 'indice',
  setStructureTab: (tab) => set({ structureTab: tab }),
  showFileMenu: false,
  setShowFileMenu: (show) => set({ showFileMenu: show }),
  /* El hub de Ajustes: una sola pantalla con cinco pestañas, alcanzable desde
     cualquier lado. La pestaña vive acá, no en el componente, para que las siete
     entradas que lo abran compartan el mismo estado. `settingsStudioOpen`, el
     estudio viejo, se fue con la Fase 7: su ultimo lector era `App.tsx` y sus
     ultimos llamadores, los siete caminos de entrada. */
  settingsHubOpen: false,
  settingsHubTab: 'documento',
  /* Abrir el hub, en cualquier pestaña, deja constancia de que se abrió. No es un
     ajuste: es un hecho, y la mascota de la pestaña App lo usa para no poner la
     cara de "contenta" a alguien a quien Ajustes le acaba de abrir en la cara.
     Se escribe en el store y no en la pestaña porque la pestaña solo se entera
     cuando la montan, y eso llega tarde. */
  setSettingsHubOpen: (open: boolean, tab?: PestanaId) => {
    if (open) {
      try { localStorage.setItem(AJUSTES_VISTOS, 'true'); } catch { /* sin almacenamiento */ }
    }
    set({ settingsHubOpen: open, settingsHubTab: tab || 'documento' });
  },
  setSettingsHubTab: (tab: PestanaId) => set({ settingsHubTab: tab }),
  isDownloadModalOpen: false,
  setDownloadModalOpen: (open: boolean) => set((state) => ({
    isDownloadModalOpen: open,
    // El modo rápido solo bloquea la descarga mientras su modal está abierto;
    // si el usuario lo cierra, vuelve a un flujo normal (edición guiada).
    pendingQuickExport: open ? state.pendingQuickExport : false,
  })),
  pendingQuickExport: false,
  clearQuickExport: () => set({ pendingQuickExport: false }),
  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  hasSeenTour: false,
  setHasSeenTour: (seen) => set({ hasSeenTour: seen }),
  viewMode: 'edit',
  setViewMode: (mode) => set({ viewMode: mode }),
  /* EL FORMATO DE SALIDA, UNO SOLO, Y CON VIDA DE FASE A FASE.
     `format` era `useState` local de `ExportView`, o sea que se perdía al
     salir del paso: se iba a Estructura y volvía a docx sin que nadie lo
     hubiera pedido. Y `FileMenu` traía sus propios dos botones con
     `exportDocx(true)` fijo, sin consultar nada. Dos verdades para lo mismo: la
     persona elige PDF en la vista, va al menú, y el menú dice .docx.

     Vive acá y no en `documentSlice` porque es una decisión de la sesión de
     trabajo —como `viewMode` y `pendingQuickExport`, que también viven acá— y
     no un dato del documento: no viaja al backend, no se persiste, y no se
     reinicia al abrir otro archivo. Es exactamente la misma clase de estado
     que el que ya estaba en la vista, solo que compartido. */
  format: 'docx',
  setFormat: (formato) => set({ format: formato }),
  /* El control de cambios también. El menú lo forzaba a `true` al exportar
     desde su segunda tarjeta, y la vista tenía el suyo: se activaba en un
     lado y el otro no lo sabía. */
  tracked: false,
  setTracked: (activo) => set({ tracked: activo }),
  forceRightPanelOpen: false,
  setForceRightPanelOpen: (open: boolean) => set({ forceRightPanelOpen: open }),
  mascotMessage: null,
  sayMascot: (text, tone = 'info') => {
    set({ mascotMessage: { text, tone } });
    if (mascotTimer) clearTimeout(mascotTimer);
    mascotTimer = setTimeout(() => set({ mascotMessage: null }), 7000);
  },
  scrollTargetId: null,
  setScrollTargetId: (id) => set({ scrollTargetId: id }),
  validatorOpen: false,
  setValidatorOpen: (open) => set({ validatorOpen: open }),
  openExportTunnel: () => set({ isDownloadModalOpen: false, viewMode: 'export', forceRightPanelOpen: false }),
  /* Resaltado de citas APA: UN interruptor para los DOS canales que muestran el
     hallazgo (el lienzo y la tarjeta de lectura). Antes cada canal decidía por
     su cuenta --el lienzo con estado local, la tarjeta con `true` fijo-- y
     apagar uno dejaba al otro subrayando citas: un defecto, dos verdades. El
     dueño es el store porque los dos canales viven en vistas distintas.

     El setter llegó con la Fase 5: la pestaña Revisión de Ajustes es el control
     que el comentario de abajo pedía, y escribe por acá para que los dos
     canales la sigan solos. */
  showCitationMarks: true,
  setShowCitationMarks: (on) => set({ showCitationMarks: on }),
  /* La calibración de la rampa del mosaico de IA. `null` es AUTOMÁTICO, que es
     el valor de partida y el que hay que poder recuperar: escribirla es una
     decisión, y una decisión que no se puede deshacer no es un ajuste.

     No se guarda en el store persistido sino en localStorage con la rampa misma
     (`aiMosaic.ts`), que es donde vive el resto de la calibración: un solo lugar
     por ajuste, como el resto de las pestañas. */
  iaCortes: leerCortesGuardados(),
  setIaCortes: (cortes) => {
    const v = normalizarCortes(cortes);
    set({ iaCortes: v });
    guardarCortes(v);
  },
  dismissedCommentIds: [],
  dismissComment: (id) => set((state) => ({
    dismissedCommentIds: state.dismissedCommentIds.includes(id) ? state.dismissedCommentIds : [...state.dismissedCommentIds, id],
  })),
  restoreComment: (id) => set((state) => ({ dismissedCommentIds: state.dismissedCommentIds.filter((x) => x !== id) })),
  dismissedFindingIds: [],
  dismissFinding: (id) => set((state) => ({
    dismissedFindingIds: state.dismissedFindingIds.includes(id) ? state.dismissedFindingIds : [...state.dismissedFindingIds, id],
  })),
  restoreFinding: (id) => set((state) => ({ dismissedFindingIds: state.dismissedFindingIds.filter((x) => x !== id) })),
  imagePanelOpen: false,
  setImagePanelOpen: (open: boolean) => set({ imagePanelOpen: open }),
  tabs: [],
  activeTabIndex: 0,
  tabDocs: {},
  switchToTab: (index) => set((state) => {
    if (index < 0 || index >= state.tabs.length) return {};
    const tab = state.tabs[index];
    const tabDoc = state.tabDocs[tab.session_id];
    if (tabDoc) {
      // Cambio de documento activo → la verdad COM (cortes/eco/D-a) no aplica.
      const docChanged = state.doc?.session_id !== tabDoc.session_id;
      return {
        activeTabIndex: index, doc: tabDoc, references: tabDoc.referencias || [], atHome: false, selectedElementId: null, selectedReferenceId: null, scrollTargetId: null,
        ...(docChanged ? { layoutCuts: null, layoutEcho: 0, wordLayoutUnavailable: false } : {}),
      };
    }
    return { activeTabIndex: index, atHome: false };
  }),
  removeTab: (index) => set((state) => {
    const tab = state.tabs[index];
    if (!tab) return {};
    const newTabs = state.tabs.filter((_, i) => i !== index);
    const newTabDocs = { ...state.tabDocs };
    delete newTabDocs[tab.session_id];
    const newIndex = Math.min(state.activeTabIndex, newTabs.length - 1);
    const newDoc = newTabs.length > 0 && newTabs[newIndex]
      ? newTabDocs[newTabs[newIndex].session_id] || null
      : null;
    // Cambio de documento activo → la verdad COM (cortes/eco/D-a) no aplica.
    const docChanged = (state.doc?.session_id ?? null) !== (newDoc?.session_id ?? null);
    return {
      tabs: newTabs,
      tabDocs: newTabDocs,
      activeTabIndex: Math.max(0, newIndex),
      doc: newDoc,
      atHome: newDoc ? false : state.atHome,
      selectedElementId: null,
      selectedReferenceId: null,
      scrollTargetId: null,
      ...(docChanged ? { layoutCuts: null, layoutEcho: 0, wordLayoutUnavailable: false } : {}),
    };
  }),
  /* EL PROYECTO ABIERTO. F7 Task 3.
     *
     * Antes no había nada acá: el nombre del proyecto se derivaba del nombre
     * del archivo de la pestaña activa, y cuando no había pestaña, la pantalla
     * ponía la cadena literal `'Proyecto APA 7'`. Renombrar el archivo renombraba
     * el proyecto, y cerrar la app lo dejaba en nada.
     *
     * `setProyecto` RECIBE un `Proyecto` armado por `crearProyecto` y no arma
     * ninguno: si el store completara los campos que faltan, cada lugar que
     * guarda un proyecto volvería a ser un lugar que puede dejar uno incompleto.
     *
     * El nombre NO se deriva de la pestaña acá. Si algún día hace falta
     * suggesting un nombre a partir de un archivo, eso es `parseDocumentVersion`,
     * que para eso existe, y el resultado se le pasa a `crearProyecto` como
     * sugerencia — nunca se recalcula sobre cada render. */
  proyecto: null,
  /* F7 Task 2. `setProyecto` REGISTRA el proyecto en el backend cuando todavia
     no existe ahi.

     Antes era un `set` puro y con eso bastaba, porque el proyecto vivia solo en
     indexedDB. Con la entidad del backend no basta: un proyecto que no esta en
     la base no tiene contra que synchronous, y `cerrarProyecto` borraria una
     fila que nunca existio — un borrado que dice "ok" sin borrar nada, que es
     peor que uno que falla.

     El id se conserva: el que paso el llamador sigue siendo el del store, y el
     backend devuelve el suyo, que manda. Si la creacion falla, el proyecto
     sigue en el store: perder el nombre del trabajo en memoria por un fallo de
     red es la peor respuesta posible, y se avisa. */
  setProyecto: async (proyecto: Proyecto) => {
    set({ proyecto });
    try {
      const creado = await api.crearProyectoEnDisco({ nombre: proyecto.nombre, raiz: proyecto.raiz });
      if (creado?.id) set({ proyecto: { ...proyecto, id: creado.id, creado: creado.creado ?? proyecto.creado } });
    } catch (e) {
      const detalle = e instanceof Error ? e.message : 'sin conexion';
      get().showToast(`El proyecto "${proyecto.nombre}" quedo solo en esta maquina: ${detalle}`, 'warning');
    }
  },
  /* F7 Task 2. `cerrarProyecto` borra ADEMAS en el backend, y por eso es async.

     Antes (y ahora todavia en el `partialize`) el proyecto vivia solo en
     indexedDB, que es la memoria de ESTA maquina: sobrevive a cerrar la
     pestana y no a reinstalar la app o abrirla en otra. Con la entidad del
     backend, borrar solo la copia local deja el proyecto de verdad, y la
     proxima lectura lo trae de vuelta sin que la persona entienda por que.

     Y SI EL BORRADO FALLA, NO SE BORRA EN LOCAL. Se conserva el estado y se
     avisa. La alternativa —dejar la pantalla sin proyecto mientras el backend
     lo tiene— hace que la siguiente lectura lo reaprezca como si fuera nuevo, y
     eso es peor que un aviso de error: es un proyecto que reaparece solo. */
  cerrarProyecto: async () => {
    const actual = get().proyecto;
    if (actual) {
      try {
        await api.borrarProyectoEnDisco(actual.id);
      } catch (e) {
        const detalle = e instanceof Error ? e.message : 'No se pudo borrar el proyecto';
        get().showToast(`No se pudo borrar "${actual.nombre}": ${detalle}`, 'error');
        return;
      }
    }
    set({ proyecto: null });
  },

  /* SINCRONIZAR CON EL DISCO. F7 Task 2/4.
   *
   * Antes el Explorador subiaba un `.docx` por archivo, en serie, cada uno con su
   * auditoria completa y su `isLoading`: veinte capitulos eran veinte pantallas
   * de carga seguidas. Con la entidad del backend, "abrir la carpeta" es UNA
   * operacion: el backend relee el disco y devuelve que encontro.
   *
   * Y `setProyecto` con `persistir: true` REGISTRA el proyecto en el backend la
   * primera vez. Sin eso el proyecto vive solo en indexedDB —la memoria de esta
   * maquina— y `cerrarProyecto` no tendria nada que borrar, osea que el borrado
   * pareceria funcionar sin borrar nunca nada. */
  sincronizarProyectoActual: async () => {
    const actual = get().proyecto;
    if (!actual) return null;
    try {
      const r = await api.sincronizarProyecto(actual.id);
      set({ proyecto: { ...actual, documentos: r.documentos } });
      /* El `error` del backend NO se tira: el endpoint contesta 200 con la lista
         que conservo y el por que. Tirarlo perderia los documentos que si se
         pudieron leer, y el aviso va aparte para que la pantalla diga que no
         pudo releer sin perder lo que ya tenia. */
      if (r.error) {
        get().showToast(`No se pudo releer la carpeta: ${r.error}`, 'warning');
      }
      return r.documentos;
    } catch (e) {
      const detalle = e instanceof Error ? e.message : 'No se pudo sincronizar';
      get().showToast(`No se pudo sincronizar "${actual.nombre}": ${detalle}`, 'error');
      return null;
    }
  },

  /* Los proyectos del backend, para reabrir uno en otra maquina. */
  cargarProyectos: async () => {
    try {
      return await api.listarProyectos();
    } catch {
      /* Sin lista no hay picker de proyectos, pero el proyecto ABIERTO sigue
         en pie y la app sigue trabajando. Un fallo al listar no puede ser un
         fallo de la app entera. */
      return [];
    }
  },

  /* EL PROGRESO DE CARGA, PARA EL OVERLAY. F7 Task 4.
   *
   * El overlay de carga (F1) ya tiene la prop `que` para decir "Subiendo
   * capítulo 3 de 20", pero nadie la escribía: el store no tenía un campo de
   * progreso y el overlay adivinaba con un "Procesando documento…" genérico.
   *
   * Vive acá y no en el componente que lo muestra porque más de una pantalla
   * escribe progreso (la subida de documentos, la sincronización de carpeta) y
   * el overlay se monta a nivel raíz, una sola vez. Un progreso local de cada
   * componente sería un progreso que el overlay no puede ver. */
  loadingQue: null,
  projectImages: [],
  addProjectImage: async (file: File) => {
    /* F7 Task 1. Antes esto era un object URL mas el `File` entero en el store.
       El blob vivia en la memoria de la PESTANA: al reabrir la app, el string
       que quedo guardado no resuelve, y la galeria se llenaba de imagenes
       rotas que parecian cargadas. Ademas el `File` ocupaba la memoria del
       archivo entero por cada imagen.

       Ahora la imagen sube a `/api/assets` y lo que queda en el store es su
       identificador y la URL del asset. El `File` desaparece: no hace falta
       para volver a mostrar la imagen manana, y era lo que la mantenia viva en
       memoria.

       Y NO hay object URL ni siquiera como previsualizacion mientras sube. La
       tentacion —"mientras espera, mostrala igual"— tiene un precio que no se ve
       en la pantalla: el store vuelve a llevar un `blob:`, que es la clase
       exacta de dato que esta tarea vino a matar. Un store donde el mismo campo
       a veces es una URL que resuelve y a veces un string muerto no es un store
       con un caso raro: es un store que hay que leer dos veces. La galeria
       muestra la imagen cuando llega, y el aviso de subida dice cuantas van. */
    try {
      const { assetId } = await api.subirImagenDeProyecto(file);
      const item = {
        id: `pimg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        assetId,
        previewUrl: api.urlDeAsset(assetId),
      };
      set((state) => ({ projectImages: [...state.projectImages, item] }));
      return item.id;
    } catch {
      /* Una subida que falla no deja una entrada: una imagen que no esta en disco
         no se puede volver a bajar de ningun lado, y un thumbnail con la
         miniatura rota y sin forma de arreglarlo es peor que no tenerlo. */
      get().showToast(`No se pudo subir "${file.name}"`, 'error');
      return null;
    }
  },
  removeProjectImage: (id: string) => {
    /* F7 Task 1: esto NO revocaba nada. Era una fuga de memoria: cada imagen
       borrada dejaba su blob vivo hasta que moria la pestana, y con muchos
       proyectos se acumula.

       El `revoke` sigue aqui aunque hoy el store no cree blobs, y no es codigo
       muerto: es lo que libera el object URL de las imagenes VIEJAS que una
       instalacion anterior dejo persistidas. Mientras esos blobs esten vivos en
       la sesion —que es exactamente lo que pasa en la sesion en que se actualiza
       la app— quitarlos sin revocar seria cambiar una fuga por otra. Cuando el
       store ya no tenga ninguno, esta rama se puede borrar con la certeza de que
       no hace falta, y el guardián de la fase avisa cuando ya no hay nada que
       revocar. */
    set((state) => {
      const img = state.projectImages.find((i) => i.id === id);
      if (img?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(img.previewUrl);
      return { projectImages: state.projectImages.filter((i) => i.id !== id) };
    });
  },
  mergeDocuments: (targetSessionId: string, sourceSessionId: string, parts: ('cover' | 'body' | 'references')[]) => {
    set((state) => {
      const targetDoc = state.tabDocs[targetSessionId];
      const sourceDoc = state.tabDocs[sourceSessionId];
      if (!targetDoc || !sourceDoc) return {};

      let mergedElements = [...targetDoc.elements];
      const mergedReferences = [...(targetDoc.referencias || [])];

      // 1. Fusionar Portada (si se solicita, reemplaza los bloques de portada de destino por los de origen)
      if (parts.includes('cover')) {
        const sourceCoverElements = sourceDoc.elements.filter((e) => e.is_cover_section || e.type === 'portada_block');
        const targetBodyElements = mergedElements.filter((e) => !e.is_cover_section && e.type !== 'portada_block');
        mergedElements = [...sourceCoverElements, ...targetBodyElements];
      }

      // 2. Fusionar Cuerpo (si se solicita, añade los elementos del cuerpo de origen tras el cuerpo de destino)
      if (parts.includes('body')) {
        const sourceBodyElements = sourceDoc.elements.filter((e) => !e.is_cover_section && e.type !== 'portada_block');
        mergedElements = [...mergedElements, ...sourceBodyElements];
      }

      // 3. Fusionar Referencias (deduplicadas por texto)
      if (parts.includes('references')) {
        const sourceRefs = sourceDoc.referencias || [];
        const existingTexts = new Set(mergedReferences.map((r) => (r.raw_text || r.title || '').toLowerCase().trim()));
        for (const sRef of sourceRefs) {
          const refKey = (sRef.raw_text || sRef.title || '').toLowerCase().trim();
          if (refKey && !existingTexts.has(refKey)) {
            mergedReferences.push(sRef);
            existingTexts.add(refKey);
          }
        }
      }

      const updatedDoc: DocumentModel = {
        ...targetDoc,
        elements: mergedElements,
        referencias: mergedReferences,
      };

      const updatedTabDocs = {
        ...state.tabDocs,
        [targetSessionId]: updatedDoc,
      };

      return {
        tabDocs: updatedTabDocs,
        doc: state.doc?.session_id === targetSessionId ? updatedDoc : state.doc,
        references: state.doc?.session_id === targetSessionId ? mergedReferences : state.references,
        hasUnsavedChanges: true,
      };
    });
  },
  atHome: true,
  goHome: () => set({ atHome: true }),
  theme: 'light',
  setTheme: (t) => {
    document.documentElement.setAttribute('data-theme', t);
    try {
      localStorage.setItem('wordapa7-theme', t);
    } catch { /* noop */ }
    const ew = window as any;
    if (ew.electronAPI?.setTheme) {
      try { ew.electronAPI.setTheme(t); } catch { /* noop */ }
    }
    set({ theme: t });
  },
  focusMode: false,
  setFocusMode: (f) => set({ focusMode: f }),
  actionToast: null,
  triggerActionToast: (message) => set({ actionToast: { message, timestamp: Date.now() } }),
  clearActionToast: () => set({ actionToast: null }),
  liveChatOpen: false,
  setLiveChatOpen: (open) => set({ liveChatOpen: open }),
  /* Se fueron con la Fase 7, cada uno por su razón:
       - `aiStudioOpen` / `setAiStudioOpen`: el estudio de IA que abría se
         fusionó con el hub de Ajustes, y no quedó nadie que lo leyera.
       - `stressTestModalOpen` / `setStressTestModalOpen`: el modal existía
         (`StressTestModal.tsx`, 244 líneas) y `setStressTestModalOpen(true)`
         no aparecía en ningún lado. Un banco de pruebas al que no se llega es
         un banco de pruebas escrito al vacío. Con el flag y el modal se van
         también `listSampleDocuments` y `getSampleDocumentUrl`, que solo
         existían para dibujarlo. */
});
