import * as api from '../api/backend';
import { DocumentModel, ElementModel, ElementType, APARuleSet, FormatProfile, PortadaData, PortadaProfile, ReferenciaModel, ValidationIssue, LLMProgressState, ImageModel, ProofreadFinding, ActaDocumento, ImagenProyecto } from '../types';
import type { Proyecto } from '../lib/proyecto';
import type { AIReviewResult, ProviderStatusResult, RewriteVariationsResult, CitationFixResult, StructureAuditResult, AIIndicesSummary } from '../api/backend';
import type { LayoutPaginateResult } from '../api/layout';
/* Solo el TIPO del diff, y con `import type` a proposito: el runtime lo borra.
   Igual asi el grafo de tipos se cierra solo —`DiffWord` y `RefrescoResultado`
   se referencian mutuamente— y lo que no puede ser es un ciclo en el grafo de
   MODULOS, que es el que rompe los mocks de los tests. */
import type { DiffWord } from '../lib/wordRefresh';

/**
 * Que paso cuando se leyo el `.docx` que Word tiene abierto.
 *
 * `hallazgos` es `number | null` y no `number` a proposito: `0` y "no se conto"
 * son cosas distintas. Poner `0` cuando no se re-audito haria que el aviso
 * dijera "0 hallazgos", que es una afirmacion sobre algo que nadie miro — y es la
 * misma mentira que ya se elimino del watcher. `null` es la respuesta honesta, y
 * es la misma distincion que `reusar` devuelve `None` en vez de `[]`.
 */
export interface RefrescoResultado {
  listo: boolean;
  cambiado: boolean;
  nuevos: number;
  eliminados: number;
  /** Lo que la reauditoria REALMENTE encontro. `null` = no se re-audito. */
  hallazgos: number | null;
}

/** Un evento del feed de actividad del panel derecho unificado (Layer 4). */
export interface ActivityEvent {
  id: string;
  kind: 'info' | 'success' | 'warning' | 'error';
  title: string;
  detail?: string;
  time: number;
}

export interface DocState {
  doc: DocumentModel | null;
  apiKey: string;
  /** Consentimiento explícito del usuario para enviar contenido a un LLM en la nube */
  llmCloudConsent: boolean;
  setLlmCloudConsent: (v: boolean) => void;
  /** Si hay una acción LLM pendiente que requiere consentimiento (modal propio) */
  llmConsentPending: boolean;
  setLlmConsentPending: (v: boolean) => void;
  isLoading: boolean;
  /** Qué está pasando durante la carga, para el overlay. `null` = sin texto
   *  forzado: el overlay deriva del estado. F7 Task 4. */
  loadingQue: string | null;
  /** Timestamp del último export con éxito (para la micro-animación de cierre) */
  exportSuccessAt: number | null;
  isBackendReady: boolean;  // true cuando el motor Python ha confirmado que está listo
  /** Reintenta la conexión al backend (incrementa un nonce que App escucha). */
  retryBackend: () => void;
  backendCheckNonce: number;
  error: string | null;
  selectedElementId: string | null;
  /** Referencia seleccionada en el Editor Unificado (sección Referencias). */
  selectedReferenceId: string | null;
  zoomLevel: number;
  /** El detalle del rail de iconos está anclado (flyout abierto) en vez de abrirse al hover. */
  railPinned: boolean;
  setRailPinned: (pinned: boolean) => void;
  nimLogs: any[];
  isNIMDiagnosticsOpen: boolean;

  // Toast notifications
  toastMessage: string | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning', action?: { label: string; onClick: () => void }) => void;
  toasts: { id: string; message: string; type: 'success' | 'error' | 'info' | 'warning'; action?: { label: string; onClick: () => void } }[];
  removeToast: (id: string) => void;

  // Panel derecho unificado (Layer 4): pestañas Actividad | Inspector
  rightPanelTab: 'activity' | 'inspector';
  setRightPanelTab: (tab: 'activity' | 'inspector') => void;
  /** Cantidad de eventos de actividad aún no vistos (badge en la barra de estado) */
  activityUnseen: number;
  /** Feed de actividad (notificaciones, clasificación, validación, revisiones) */
  activityEvents: ActivityEvent[];
  pushActivityEvent: (kind: ActivityEvent['kind'], title: string, detail?: string) => void;

  // Debug request tracing
  lastRequestId: string | null;
  setLastRequestId: (id: string | null) => void;

  // LLM Progress tracking
  llmProgress: LLMProgressState;
  aiProviderConfig: {
    nimUrl: string;
    useLocal: boolean;
    providerId: string;
  };

  citationAuditResult: {
    ghost_citations: any[];
    orphan_references: any[];
  } | null;

  // ── Fase 2 — Motor de render híbrido: verdad COM en vivo ──
  /** Fase 2 — verdad COM en vivo: cortes de página por elemento (id → cortes).
   *  `null` = sin layout conocido (documento nuevo o sin Word: nunca pintar
   *  cortes de otro documento, los ids son posicionales). */
  layoutCuts: Record<string, { offset: number; page: number }[]> | null;
  /** Eco de aplicación: incrementa SOLO cuando una respuesta cambió algo. El hook compara para no re-agendar. */
  layoutEcho: number;
  /** D-a: la última respuesta informó que no hay Word. */
  wordLayoutUnavailable: boolean;
  applyLayoutPagination: (resp: LayoutPaginateResult) => void;

  /** Engine V2 (P2): resultado de la auditoría estructural global via LLM. */
  structureAuditResult: import('../api/backend').StructureAuditResult | null;

  // Template system
  showTemplateDialog: boolean;
  availableTemplates: Array<{
    name: string;
    description: string;
    has_cover_page: boolean;
    has_toc: boolean;
    has_references: boolean;
    section_count: number;
  }>;

  llmUsageStats: {
    total_tokens: number;
    providers_used: string[];
    estimated_cost_usd: number;
    cache_hits: number;
    api_calls: number;
  };

  setIsNIMDiagnosticsOpen: (open: boolean) => void;

  wizardStep: number;
  /** De que fase se salio la ultima vez. Ver el comentario en `uiSlice.ts`. */
  wizardStepAnterior: number;
  /** Volver a la portada (paso 1), sea cual sea la etapa en la que se este. */
  volverAPortada: () => void;
  /** Lo llama el rail al entrar a una fase del editor. */
  recordarFaseAnterior: (paso: number) => void;
  showFileMenu: boolean;
  /* El hub de Ajustes (Fase 1 del plan de las cinco pestañas). La pestaña es
     `PestanaId`, el tipo del catálogo: no se re-declara acá, o el store y la
     barra de pestañas empezarían a aceptar conjuntos distintos. */
  settingsHubOpen: boolean;
  settingsHubTab: import('../components/settings/tabs').PestanaId;
  setSettingsHubOpen: (open: boolean, tab?: import('../components/settings/tabs').PestanaId) => void;
  setSettingsHubTab: (tab: import('../components/settings/tabs').PestanaId) => void;
  isDownloadModalOpen: boolean;
  setDownloadModalOpen: (open: boolean) => void;
  /** True si el modal de descarga se abrió desde Modo Rápido (bloqueadores duros deshabilitan Descargar) */
  pendingQuickExport: boolean;
  clearQuickExport: () => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  hasSeenTour: boolean;
  coverSetupDone: boolean;
  setCoverSetupDone: (done: boolean) => void;
  viewMode: 'edit' | 'result' | 'native-pdf' | 'split' | 'export' | 'proyectos';
  /** El formato de salida elegido. Vive en el store porque hay DOS superficies
   *  que lo ofrecen —la vista de Exportar y el menú de Archivo— y si cada una
   *  tuviera el suyo dirían cosas distintas. Ver el comentario en `uiSlice.ts`. */
  format: 'docx' | 'pdf' | 'latex';
  setFormat: (formato: 'docx' | 'pdf' | 'latex') => void;
  /** Marcas de control de cambios en la exportación. Mismo origen que `format`. */
  tracked: boolean;
  setTracked: (activo: boolean) => void;
  forceRightPanelOpen: boolean;
  setForceRightPanelOpen: (open: boolean) => void;

  // Mascota IA (rate-limited, máx. 1 línea). Se usa en hitos importantes:
  // abrir el túnel de exportación, validar un paso o terminar una acción IA.
  mascotMessage: { text: string; tone: 'info' | 'success' | 'warning' } | null;
  sayMascot: (text: string, tone?: 'info' | 'success' | 'warning') => void;

  /** Elemento al que PaperCanvas debe hacer scroll SIN abrir el inspector. */
  scrollTargetId: string | null;
  setScrollTargetId: (id: string | null) => void;

  /** Overlay no bloqueante del Validador (drawer) — el canvas nunca se oculta. */
  validatorOpen: boolean;
  setValidatorOpen: (open: boolean) => void;

  /** Abre el Túnel de Exportación (viewMode='export') reemplazando el modal. */
  openExportTunnel: () => void;

  /** Resaltado de citas APA en los dos canales (lienzo y tarjeta de lectura).
   *  Un solo interruptor: si cada canal lo decidiera por su cuenta, apagar uno
   *  dejaría al otro subrayando el mismo hallazgo. El control es el de la
   *  pestaña Revisión de Ajustes. */
  showCitationMarks: boolean;
  setShowCitationMarks: (on: boolean) => void;
  /** La calibración de la rampa del mosaico de IA. `null` es la automática: los
   *  percentiles del propio documento. Editarla la vuelve absoluta, y por eso
   *  existe `setIaCortes` con `null` como vuelta atrás y no solo un setter. */
  iaCortes: import('../lib/aiMosaic').CortesIa | null;
  setIaCortes: (cortes: import('../lib/aiMosaic').CortesIa | null) => void;

  /** Comentarios inline descartados por el usuario (persisten en la sesión). */
  dismissedCommentIds: string[];
  dismissComment: (id: string) => void;
  restoreComment: (id: string) => void;
  /** Hallazgos de la fase Revisión & IA descartados por el usuario. El id es la
   *  clave de contenido que produce `collectAuditItems` (no la posición). */
  dismissedFindingIds: string[];
  dismissFinding: (id: string) => void;
  restoreFinding: (id: string) => void;
  imagePanelOpen: boolean;
  setImagePanelOpen: (open: boolean) => void;
  tabs: {
    session_id: string;
    file_name: string;
    project_name?: string;
    version_label?: string;
    file_path?: string;
    updated_at?: number;
  }[];
  activeTabIndex: number;
  tabDocs: Record<string, DocumentModel>;
  pdfPreviewCache: { hash: string; url: string } | null;
  /**
   * El proyecto abierto, o `null` si no hay ninguno.
   *
   * F7 Task 3. Vive acá y no en `documentSlice` porque es una decisión de la
   * SESIÓN DE TRABAJO, como `viewMode` y `pendingQuickExport`: no viaja al
   * backend como parte del documento y no se reinicia al abrir otro archivo. Lo
   * que lo distingue de `projectImages` es que este SÍ se persiste (está en el
   * `partialize`), porque un proyecto que muere al cerrar la app es la etiqueta
   * que la F7 vino a matar.
   *
   * `null` es una respuesta, no un forgot: sin proyecto, el chrome de proyecto
   * no se monta. Antes la app ponía `'Proyecto APA 7'` en pantalla, y un nombre
   * inventado en pantalla es peor que no tener nombre.
   */
  proyecto: Proyecto | null;
  /** Fija el proyecto abierto y lo REGISTRA en el backend si no existe ahi.
   *  `async` por eso: un proyecto que queda solo en indexedDB no se puede
   *  sincronizar ni borrar despues. */
  setProyecto: (proyecto: Proyecto) => Promise<void>;
  /** Cierra el proyecto: borra en el backend y, si eso sale bien, en el store.
   *  Si el borrado falla, conserva el proyecto y avisa. `async` por eso. */
  cerrarProyecto: () => Promise<void>;
  /** Relee la carpeta del proyecto abierto por el backend y devuelve la lista de
   *  documentos, o `null` si no se pudo. Es UNA operacion para toda la carpeta. */
  sincronizarProyectoActual: () => Promise<string[] | null>;
  /** Los proyectos que tiene el backend, para reabrir uno. */
  cargarProyectos: () => Promise<Proyecto[]>;
  projectImages: ImagenProyecto[];
  /** Sube la imagen a disco y devuelve su id, o `null` si la subida falló. */
  addProjectImage: (file: File) => Promise<string | null>;
  removeProjectImage: (id: string) => void;
  mergeDocuments: (targetSessionId: string, sourceSessionId: string, parts: ('cover' | 'body' | 'references')[]) => void;

  // Home / multi-doc (Fase E)
  atHome: boolean;
  goHome: () => void;
  openSession: (sessionId: string) => Promise<void>;
  /**
   * Aplica un diff de Word YA OBTENIDO: si el diff vio un cambio real, recarga
   * el documento desde el backend. Si no, no toca nada.
   *
   * RECIBE EL DIFF, NO LA RUTA, Y POR QUE
   *
   * `/api/refresh-from-word` es de UN solo disparo: cuando ve un cambio, guarda
   * el documento reparseado y recien ahi devuelve el diff. Volver a pegarle al
   * endpoint compara el documento reparseado contra si mismo, responde
   * `cambiado: false` y no recarga nada — la accion dead que se acaba de borrar.
   * El diff que el watcher ya tiene es el UNICO que puede decir que algo cambio,
   * asi que es lo unico que esta accion puede usar sin mentir.
   *
   * No toca tabs, no levanta `isLoading` y no resetea la geometria de pagina:
   * esto no es abrir un documento, es el mismo documento con el texto nuevo, y
   * un guardado de Word no puede mandar a la persona al primer paso del asistente.
   *
   * Un archivo a medias (`listo: false`) no recarga nada, porque el backend no
   * guardo nada y recargar seria tirar el estado guardado para atras.
   */
  aplicarRefresco: (diff: DiffWord) => Promise<RefrescoResultado>;
  saveSnapshot: () => Promise<void>;
  snapshots: import('../api/backend').SessionSnapshot[];
  loadSnapshots: () => Promise<void>;
  restoreSnapshot: (snapshotId: number) => Promise<void>;

  // Revisor IA + Ortografía (Fase F)
  /* `isReviewOpen` y su setter se fueron con la Fase 7: ningún componente los
     leía. El workbench de Revisión (`ReviewWorkbench`, paso 5) es el que muestra
     los hallazgos, y no se abre con un flag: se llega a la fase. Un flag que
     solo lo escribía un test es un flag que no existe. */
  reviewResult: AIReviewResult | null;
  isReviewLoading: boolean;
  runAIReview: () => Promise<void>;

  liveChatOpen: boolean;
  setLiveChatOpen: (open: boolean) => void;
  runProactiveAutoCaptioning: () => Promise<void>;
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;
  providerStatus: ProviderStatusResult | null;
  fetchProviderStatus: () => Promise<void>;
  applyRewriteVariation: (elementId: string, text: string, asTracked: boolean) => Promise<void>;
  preflightReport: {
    headings: number;
    figures: number;
    tables: number;
    paragraphs: number;
    flaggedHigh: number;
    flaggedMedium: number;
    reviewed: number;
  } | null;
  setPreflightReport: (r: any) => void;

  // Citas IA consejero (propuesta 6)
  suggestCitationFix: (citationText: string, referenceId: string | undefined, problem: string) => Promise<CitationFixResult | null>;

  // Export LaTeX (funcionalidad x)
  exportLatex: () => Promise<void>;

  // Undo/Redo
  history: DocumentModel[];
  historyIndex: number;

  // Modo Foco & Toasts de Acción
  focusMode: boolean;
  setFocusMode: (f: boolean) => void;
  actionToast: { message: string; timestamp: number } | null;
  triggerActionToast: (message: string) => void;
  clearActionToast: () => void;

  rules: APARuleSet;
  ruleProfiles: APARuleSet[];
  /** Perfiles de formato disponibles (config servido por /api/profiles) */
  profiles: FormatProfile[];
  activeProfileId: string;
  fetchProfiles: () => Promise<void>;
  setActiveProfile: (profileId: string) => Promise<void>;
  portada: PortadaData;
  /** Los datos del acta (autor, profesor asesor, comite, fecha de defensa).
   *  Van aparte de `portada` y no por prolijidad: con la portada original
   *  conservada, un dato guardado dentro de la portada no sale, porque el
   *  bloque no se toca. El motivo esta en `python/models.py`. */
  acta: ActaDocumento;
  portadaProfiles: PortadaProfile[];
  references: ReferenciaModel[];
  validationIssues: ValidationIssue[];

  setApiKey: (key: string) => void;
  setAiProviderConfig: (config: Partial<{ nimUrl: string, useLocal: boolean, providerId: string }>) => void;
  setWizardStep: (step: number) => void;
  /** Sub-pestaña del paso 2 (Estructura): Títulos | Cuerpo. Global para que
      acciones del store (p.ej. goToCitation del validador) puedan navegar al cuerpo. */
  /* `indice` es la vista que se ve al llegar a la fase 2, y la que el spec §7
     pide de centro: el armazón del documento, no el archivo. Las otras dos
     siguen ahí para lo que hacen y no se reemplazan. */
  structureTab: 'indice' | 'headings' | 'body';
  setStructureTab: (tab: 'indice' | 'headings' | 'body') => void;
  setSelectedElementId: (id: string | null) => void;
  setSelectedReferenceId: (id: string | null) => void;
  setShowTemplateDialog: (show: boolean) => void;
  fetchTemplates: () => Promise<void>;
  applyTemplate: (templateName: string) => Promise<void>;
  renumberHeadings: (style: 'roman' | 'decimal') => void;
  setZoomLevel: (zoom: number) => void;
  setShowFileMenu: (show: boolean) => void;
  setHasSeenTour: (seen: boolean) => void;
  setViewMode: (mode: 'edit' | 'result' | 'native-pdf' | 'split' | 'export' | 'proyectos') => void;
  setPdfPreviewCache: (cache: { hash: string; url: string } | null) => void;

  switchToTab: (index: number) => void;
  removeTab: (index: number) => void;

  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (val: boolean) => void;
  /**
   * CUÁNDO quedó guardado el documento por última vez, en epoch ms, o `null`
   * si todavía no se sabe.
   *
   * El backend ya guarda solo: `python/routers/sessions.py` llama a
   * `save_session_state` en diez endpoints de mutación. Lo que faltaba era que
   * la app lo DIJERA, y sin una marca de tiempo no puede: un chip que solo
   * dice "Guardado" no le da a nadie ninguna confianza.
   *
   * `null` es un valor de verdad y no una comodidad: cuando todavía no se sabe,
   * el chip dice "Guardado" a secas. Poner "hace 0 min" ahí sería inventar una
   * hora para parecer vivo.
   */
  lastSavedAt: number | null;
  /**
   * Hay un guardado en vuelo. Sin este tercer estado el reloj miente: entre
   * una edición y la siguiente el documento ya está limpio y el chip diría
   * "Guardado" aunque nada se acabara de escribir.
   */
  isSaving: boolean;

  // Acciones Principales
  sugerenciasProactivas: boolean;
  setSugerenciasProactivas: (v: boolean) => void;
  runProactiveAudits: () => Promise<void>;
  // Marcas de transparencia (H21): etiquetas junto a cada cambio aplicado.
  marcasVisibles: boolean;
  setMarcasVisibles: (v: boolean) => void;
  // Alcances elegidos en el filtro de importación ([] = formato completo).
  sessionScopes: string[];
  setSessionScopes: (s: string[]) => void;
  // Revisor por lotes (F): hallazgos ortografia/IA/texto pegado.
  proofreadFindings: ProofreadFinding[];
  aiIndices: api.AIIndicesSummary | null;
  runProofreadBatch: () => Promise<void>;
  clearProofreadFindings: () => void;
  /**
   * Hay ALGO corriendo ahora mismo: los globos que se disparan al abrir un
   * documento, no el "Escanear" de la vista de Revisión.
   *
   * Vive en el store y no en la vista por una razón concreta: los globos se
   * lanzan en `documentSlice.uploadFile` y sobreviven al desmontaje. Un flag de
   * la vista no los ve, y por eso la pantalla afirmaba "todavía no corrió ningún
   * motor" mientras tres motores corrían solos.
   *
   * Los NOMBRES de los que corren van aparte porque la pantalla vacía tiene que
   * decir cuáles, no "pulsa Escanear": `motoresAuditando` es la lista y
   * `isAuditing` es su "¿vacía?" derivado en el mismo `set`, de modo que no
   * puedan separarse.
   */
  isAuditing: boolean;
  motoresAuditando: string[];
  notarAuditoria: (motor: string) => void;
  olvidarAuditoria: (motor: string) => void;
  /**
   * Tira TODOS los hallazgos, porque `element_id` es un indice posicional: insertar
   * un parrafo arriba en Word corre todos los ids de abajo y un hallazgo conservado
   * queda pegado al parrafo equivocado. No es "limpiar lo que quedo huerfano": es
   * dejar la lista vacia para que la reauditoria la vuelva a armar sobre el
   * documento que ahora esta en pantalla.
   *
   * Tambien vacia `dismissedCommentIds` y el mapa de marcas del `localStorage`,
   * porque sus claves llevan `element_id` adentro y son rancios por la misma razon.
   */
  invalidarHallazgosRancios: () => void;
  autoResolveGhosts: () => Promise<void>;
  uploadFile: (file: File, opts?: { profileId?: string; mode?: 'quick' | 'review' }) => Promise<void>;
  startBlankDocument: () => Promise<void>;
  createFromTemplate: (templateId: string) => Promise<void>;
  runLLMClassify: (opts?: { silent?: boolean }) => Promise<void>;
  updateElementType: (elementId: string, type: ElementType, headingLevel?: number, text?: string) => Promise<void>;
  updateElementText: (elementId: string, text: string) => Promise<void>;
  /** Fase 3 — divide un párrafo en el cursor (Enter del editor inline):
   *  commit de `before` al párrafo actual (updateElementType) + inserción
   *  del párrafo `after` (insertElement). */
  splitParagraphAt: (elementId: string, before: string, after: string) => Promise<void>;
  /** API de contenido / copiloto — inserta una figura ya renderizada tras `afterId`. */
  insertImageElement: (afterId: string, image: Partial<import('../types').ImageModel>) => Promise<void>;
  updateElementImage: (elementId: string, imageInfo: Partial<ImageModel>) => Promise<void>;
  updateElementTable: (elementId: string, tableInfo: Partial<import('../types').TableModel>) => Promise<void>;
  /** La presentación de una ecuación: número, formato, alineación y tipografía de
   *  apoyo. El XML de la ecuación (OMML) viaja intacto; esto no lo toca. */
  updateElementEquation: (
    elementId: string,
    equation: import('../types').EquationConfig,
  ) => Promise<void>;
  /** El mismo parche sobre varias figuras, de a una. El alcance lo DECLARA quien
   *  llama pasando los ids: esta action no sabe qué es "todas" ni lo deduce. */
  aplicarImagenAMuchas: (
    elementIds: readonly string[],
    imageInfo: Partial<ImageModel>,
    onProgreso?: (hechos: number, total: number) => void,
  ) => Promise<void>;
  replaceImage: (elementId: string, file: File) => Promise<void>;
  reorderElements: (elementIds: string[]) => Promise<void>;
  acceptHighConfidenceElements: () => Promise<void>;
  approveAllHeadings: () => Promise<void>;
  autoNormalizeHeadings: () => Promise<void>;
  /** "Arreglámelo": aplica el 90% del formato automáticamente (acepta
   *  clasificaciones seguras, valida y audita citas). Solo el usuario decide
   *  lo que de verdad necesita su criterio. */
  runQuickFix: () => Promise<void>;
  insertTocElement: () => void;
  removeTocElement: () => void;
  /** C6: Sugiere leyendas IA para todas las figuras y tablas sin caption. */
  autoCaptionAll: () => Promise<void>;

  // Undo/Redo
  undo: () => void;
  redo: () => void;
  pushHistory: (doc: DocumentModel) => void;

  setRules: (rules: Partial<APARuleSet>) => void;
  saveRuleProfile: (name: string) => void;
  resetRulesToDefault: () => void;

  setPortada: (portada: Partial<PortadaData>) => void;
  updateCoverField: (field: keyof PortadaData, value: any) => void;
  /** Elegir una institucion del catalogo. `null` la deselecciona. */
  updateCoverInstitucion: (codigo: string | null) => void;
  /** Elegir una carrera del catalogo. `null` la deselecciona. */
  updateCoverCarrera: (codigo: string | null) => void;
  setActa: (parcial: Partial<ActaDocumento>) => void;
  updateActaField: (campo: keyof ActaDocumento, valor: string | string[]) => void;
  /** Sube de una `portada` vieja los datos del acta a su nuevo lugar. */
  migrarActa: (portadaVieja: Partial<PortadaData> | null | undefined) => void;
  savePortadaProfile: (name: string) => void;

  updateReferences: (refs: ReferenciaModel[]) => void;
  addReference: (ref: ReferenciaModel) => void;
  addReferencia: (ref: ReferenciaModel) => void;

  removeReference: (id: string) => void;
  resolveDoiReference: (doi: string) => Promise<void>;
  /** Tipo Zotero: un bloque de DOIs, uno por linea. Lo que falla se reporta
   *  sin tirar lo demas. */
  resolveDoisBlock: (text: string) => Promise<void>;
  /** Contrasta las referencias YA cargadas contra una fuente real: DOI exacto
   *  primero, cascada autor+año despues. Solo marca `verificada` con match
   *  confiable; lo que no se encuentra queda Pendiente. */
  verifyReferences: () => Promise<void>;
  resolveGhostCitation: (authors: string[], year: string) => Promise<{
    id: string; authors: string[]; year: string; title: string;
    source: string; doi_or_url: string; raw_text: string; formatted_apa: string;
    candidates?: { authors: string[]; year: string; title: string; source: string; doi?: string; formatted_apa: string; relevance: string }[];
  } | null>;
  autoResolveAllGhostCitations: () => Promise<void>;

  /** Engine V2 (P2): auditoría estructural global via LLM. */
  runStructureAudit: () => Promise<void>;

  runValidation: () => Promise<void>;
  runCitationAudit: () => Promise<void>;
  exportDocx: (tracked?: boolean) => Promise<void>;
  exportPdf: () => Promise<void>;
  copyPdfToClipboard: () => Promise<boolean>;
  activeFilePath: string | null;
  setActiveFilePath: (path: string | null) => void;

  // ── F8 — Proyectos: gestor de versiones ──
  /** F8 — evaluar si este archivo pertenece a un proyecto (no bloquea, no pregunta dos veces) */
  evaluarProyectoParaArchivo: (file: File) => Promise<void>;
}

export type UISlice = Partial<DocState>;
export type CoverSlice = Partial<DocState>;
export type AuditSlice = Partial<DocState>;
export type DocumentSlice = Partial<DocState>;
