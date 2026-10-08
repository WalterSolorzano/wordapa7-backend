/* WordAPA7 — TypeScript Definitions */

export type ElementType =
  | 'heading'
  | 'paragraph'
  | 'bullet'
  | 'numbered_list'
  | 'image'
  | 'table'
  | 'block_quote'
  | 'page_break'
  | 'section_break'
  | 'empty'
  | 'portada_block'
  | 'equation'
  | 'toc'
  | 'caption'
  | 'unknown';

export type APAFormat = 'student' | 'professional';

export type WorkMode = 'quick' | 'review';

export type BulletStyle = 'disc' | 'circle' | 'square' | 'dash';

export type NumberStyle = 'decimal' | 'lowerLetter' | 'upperLetter' | 'lowerRoman' | 'upperRoman' | 'none';

export type CitationType =
  | 'parentetica'
  | 'narrativa'
  | 'multiple'
  | 'secundaria'
  | 'pagina'
  | 'et_al';

export type WizardCoverPage = 'use_existing' | 'import_saved' | 'none';

export type ValidationStatus = 'ok' | 'warning' | 'error';

export interface WizardAnswers {
  apa_format: APAFormat;
  cover_page: WizardCoverPage;
  work_mode: WorkMode;
}

// ── IMAGE / TABLE MODELS ─────────────────────────────────────────────────────

export type DesignStyle = 'standard' | 'sidebar' | 'scientific' | 'corner' | 'full_width' | 'multipanel';

export interface SubfigureItem {
  id: string;
  label: string; // ej. '(a)'
  title: string; // ej. 'Vista general'
  relative_url: string;
  file_path?: string;
  filename?: string;
}

/**
 * Una imagen del proyecto, en disco y no en la memoria de la pestaña.
 *
 * `assetId` es lo que la identifica, y `previewUrl` es la ruta del asset ya
 * resuelta. El `File` NO vive acá: un `File` es la imagen entera en memoria, y
 * lo que hace falta para volver a mostrarla manana es el identificador.
 *
 * F7 Task 1. Antes esto era `{ id, name, url, file }` con `url` hecho a
 * `URL.createObjectURL`, que muere con la pestaña.
 */
export interface ImagenProyecto {
  id: string;
  name: string;
  /** Identificador del asset en `/api/assets`. Es la identidad de la imagen. */
  assetId: string;
  /** Ruta del asset, resuelta con `resolveAssetUrl`. Nunca un `blob:`. */
  previewUrl: string;
  /** Solo mientras la subida no termina: el `File` todavia no esta en disco. */
  pending?: boolean;
}

export interface ImageModel {
  element_id: string;
  file_path: string;
  filename: string;
  relative_url: string;
  render_error?: string | null;
  width_cm: number;
  height_cm: number;
  caption: string;
  note?: string;
  figure_number: number;
  // Subfiguras multipanel APA 7 (a, b, c...)
  subfigures?: SubfigureItem[];
  // Nuevos campos configurables para control total de imagen
  width_inches?: number | null;
  height_inches?: number | null;
  alignment: 'left' | 'center' | 'right';
  wrap_style: 'inline' | 'square' | 'tight' | 'top_and_bottom';
  caption_position: 'above' | 'below';
  constrain_proportions: boolean;
  design_style: DesignStyle;
  rotation?: number;
  alt_text?: string;
  // Presentacion del marco (tokens del design-system, no valores crudos)
  border?: 'none' | 'subtle' | 'strong';
  shadow?: boolean;
  corner_radius?: 'none' | 'sm' | 'md' | 'lg';
  flip_h?: boolean;
  flip_v?: boolean;
  // Floating (anchor) attributes
  is_anchor?: boolean;
  anchor_pos_h?: string | null;
  anchor_pos_v?: string | null;
}

export type TableStylePreset = 'apa' | 'compact' | 'expanded' | 'grid' | 'zebra';
export type TableOrientation = 'auto' | 'portrait' | 'landscape';

/** Metadata de combinación de una celda. `col`/`row` en unidades de grid. */
export interface CellSpan {
  col: number;
  row: number;
}

export interface TableModel {
  element_id: string;
  headers: string[];
  rows: string[][];
  caption: string;
  note?: string;
  table_number: number;
  /** Spans paralelos a `headers`. Vacío = todo `{col:1,row:1}`. */
  header_spans?: CellSpan[];
  /** Spans paralelos a `rows`. Vacío = todo `{col:1,row:1}`. */
  row_spans?: CellSpan[][];
  /** Preset de estilo. Default `apa` en la UI. */
  style?: TableStylePreset;
  /** Orientación de la tabla. Default `auto`. */
  orientation?: TableOrientation;
  /** Fracciones que suman 1; vacío = ancho automático. */
  column_widths?: number[];
}

// ── ELEMENT MODEL ─────────────────────────────────────────────────────────────

export interface OriginalMetadata {
  style_name: string;
  alignment?: string;
  bold?: boolean;
  italic?: boolean;
  font_size?: number;
  font_name?: string;
  left_indent?: number;
  first_line_indent?: number;
  num_id?: number;
  ilvl?: number;
  is_empty: boolean;
  section_index: number;
}

export interface AIFinding {
  pattern: string;
  severity: string;
  detail: string;
  count: number;
}

export interface ElementModel {
  id: string;
  type: ElementType;
  heading_level?: number;
  list_level?: number;
  is_cover_section?: boolean;
  text: string;
  original_text?: string;
  style_name: string;
  alignment: string;
  /**
   * Posición horizontal del cuadro de texto flotante original (EMU,
   * `wp:positionH/wp:posOffset`). Permite reconstruir las columnas de la
   * portada. `undefined`/`null` en elementos que no son cuadros de texto.
   */
  anchor_pos_h?: string | null;
  font_name: string;
  font_size: number;
  is_bold: boolean;
  is_italic: boolean;
  is_bullet: boolean;
  left_indent_cm: number;
  confidence: number;
  is_user_modified: boolean;
  image_info?: ImageModel;
  table_info?: TableModel;
  page_number?: number;
  /**
   * Fragmento de párrafo partido entre hojas (applyPageFlow/flowPagination).
   * 0 = primer fragmento; >0 = continuación. undefined = elemento completo.
   */
  split_chunk?: number;

  /**
   * Rebanada de filas de una tabla partida entre páginas (solo render).
   * start/end son índices de fila (0-based, end exclusivo) sobre `table_info.rows`.
   */
  table_slice?: { start: number; end: number };

  // Classification
  needs_review: boolean;
  auto_applied: boolean;
  llm_reasoning?: string;
  pre_classifier_rule?: string;

  // Bullet / list
  bullet_source?: string;
  bullet_style?: BulletStyle;
  number_style?: NumberStyle;
  number_start?: number;
  original_char?: string;

  // Citations
  cita_ids: string[];

  // Post-apply state
  applied_style?: string;
  applied_at?: string;

  // AI detection
  ai_score?: number;
  ai_findings?: AIFinding[];
  has_shading_residue?: boolean;
  has_web_shading_residue?: boolean;

  // Math preservation
  has_math?: boolean;
  has_fields?: boolean;

  // Equation presentation config
  equation?: EquationConfig;

  // Extra fields echoed from Python ElementModel
  ai_matches?: string[] | null;
  footnote_ids?: number[];
  hyperlinks?: Array<Record<string, string>>;
  bookmarks?: Array<Record<string, string>>;
}

export interface EquationConfig {
  show_number: boolean;
  number_format: string;   // "(1)" | "[1]" | "1." | "(1.1)" | "Ecuación 1"
  number?: string;
  alignment: string;       // "left" | "center" | "right"
  font_name: string;
  font_size_pt: number;
}

// ── APA RULES ─────────────────────────────────────────────────────────────────

export interface HeadingLevelConfig {
  bold: boolean;
  italic: boolean;
  alignment: 'left' | 'center' | 'right';
  indent_cm: number;
  inline_text: boolean;
}

/** Tamaño de hoja. "carta" es 8.5" x 11" y "a4" es 210 x 297 mm.
 *  Es un valor cerrado y no texto libre: `pageGeometry.ts` (el lienzo) y
 *  `APARuleSet.page_size` (el `.docx`) tienen que decidir lo mismo, y un
 *  `string` cualquiera haría que uno de los dos caiga a su valor por omisión en
 *  silencio. El default es Carta porque es lo que dice `DESIGN.md:75`. */
export type PageSize = 'carta' | 'a4';

export interface APARuleSet {
  profile_name: string;
  is_default?: boolean;

  // Page
  page_size?: PageSize;
  margins_cm: number;

  // Font
  font_family: string;
  font_size_pt: number;

  // Paragraphs
  line_spacing: number;
  paragraph_indent_cm: number;
  alignment: 'left' | 'justify';
  space_before_pt: number;
  space_after_pt: number;

  // Lists (per-level)
  bullet_style_level1: BulletStyle;
  bullet_style_level2: BulletStyle;
  bullet_style_level3: BulletStyle;
  number_style_level1: NumberStyle;
  number_style_level2: NumberStyle;
  number_style_level3: NumberStyle;

  // Headings
  heading_levels: Record<number, HeadingLevelConfig>;
  heading_numbering_style_lvl1: 'none' | 'decimal' | 'upperRoman' | 'lowerRoman' | 'lowerLetter' | 'upperLetter';
  heading_numbering_style_lvl2: 'none' | 'decimal' | 'upperRoman' | 'lowerRoman' | 'lowerLetter' | 'upperLetter';
  heading_numbering_style_lvl3: 'none' | 'decimal' | 'upperRoman' | 'lowerRoman' | 'lowerLetter' | 'upperLetter';

  // References
  reference_hanging_indent_cm: number;
  doi_as_hyperlink: boolean;

  // Figures and tables
  figure_label_prefix: string;
  table_label_prefix: string;
  table_border_style?: 'apa' | 'grid';

  // Visual preview studio (optional, defaults applied in UI)
  image_alignment?: 'left' | 'center' | 'right';
  image_style?: 'plain' | 'journal';
  toc_style?: 'apa' | 'dotted' | 'plain';
}

// ── PERFILES DE FORMATO (config swappable, no código por perfil) ──────────────

export interface FormatProfile {
  profile_id: string;
  display_name: string;
  description: string;
  rules: APARuleSet;
  /** Campos de portada que el Health Check exige completos antes de descargar */
  cover_required_fields: string[];
  latex_documentclass: string;
  latex_options: string;
  /** "student" | "professional" — formato de portada por defecto del perfil */
  cover_apa_format: string;
}

// ── PORTADA ───────────────────────────────────────────────────────────────────

export interface PortadaData {
  apa_format: APAFormat;
  use_original_cover?: boolean;
  force_skip_cover?: boolean;
  cover_template_id?: string;
  cover_mode?: string;
  title: string;
  institution: string;
  course?: string;
  date?: string;

  /* LA INSTITUCION ELEGIDA, COMO ESTADO.
     Antes el chip se encendia con `institution.toLowerCase().includes(codigo)`,
     o sea derivando el estado de un campo de TEXTO LIBRE. Con dos
     instituciones escritas ahi quedaban los dos chips encendidos a la vez, y el
     valor guardado no era el de ninguna: era lo que el usuario habia escrito.
     El estado no era de la UI, era del DATO.

     Ahora es un `codigo` de preset o `null`, comparado por igualdad EXACTA. El
     nombre se resuelve del catalogo (`lib/portada/catalogo.ts`) y el campo de
     texto libre sigue siendo el campo de texto libre: escribir a mano
     deselecciona el chip. */
  institucionSeleccionada?: string | null;
  /** La carrera elegida, mismo patron. `departamento` es el texto libre. */
  carreraSeleccionada?: string | null;
  /**
   * Los logos de la portada, como DATO.
   *
   * Antes el logo era una constante del `.docx`: poner el de la UNI era lo único
   * que sabía hacer, y elegir UNAN salía con el de la UNI en silencio. Ahora el
   * asset viaja en el modelo y `portada_uni._resolve_logo_path` lo pide.
   *
   * `ancho_fraccion` es una FRACCIÓN DEL ANCHO ÚTIL y no un milímetro, y esa es
   * la diferencia entre un logo que se ve igual en Carta y en A4 y uno que no.
   */
  logos?: LogoPortada[];

  /* LO QUE SE FUE DE ACA, y por que.
     `author`, `grupo` e `instructor` eran los datos del acta y vivian DENTRO
     de la portada. Con `use_original_cover: true` el bloque de portada no se
     toca --es una promesa de AGENTS.md--, asi que no habia de donde sacarlos y
     el `.docx` salia sin el autor, sin el profesor asesor y sin el grupo. Eso
     es lo que reporto el usuario: "conservar original" pierde al profesor y al
     grupo.

     Ahora viven en `ActaDocumento`, que viaja al backend en el campo `meta` de
     cada exportacion. Lo que se queda en la portada es el DISENO de la hoja:
     que dice el titulo, cual es la institucion, cual la asignatura y que dia
     es. El quien es del documento. */
  running_head?: string;
  author_note?: string;
  /** Área de Conocimiento / Departamento (portada UNI) — editable por el usuario. */
  departamento?: string;
  logo_url?: string;
  /** Idioma en que está escrito el documento. Decide el `w:lang` del `.docx`,
   *  que es lo que hace que la revisión de ortografía no subraye un texto en
   *  español con el corrector en inglés. Etiquetas CLDR, cerradas: el backend
   *  las valida. `PortadaData` es donde viven y no `DocumentMeta` por una razón
   *  escrita en `python/models.py`: es el único de los dos que viaja al
   *  generador en cada exportación. */
  language?: PortadaLanguage;
}

/** Etiquetas de idioma que el backend acepta. La lista está escrita acá y en
 *  `PortadaData.language` de `python/models.py`, y son las dos que tienen que
 *  coincidir: si el cliente manda uno que el modelo no declara, la exportación
 *  falla con un error de validación en vez de aplicar el idioma.
 *  `documentoTab.test.tsx` contrasta las dos listas, archivo contra archivo. */
export type PortadaLanguage =
  | 'es-ES' | 'es-MX' | 'es-AR' | 'es-CO' | 'es-PE' | 'es-CL'
  | 'en-US' | 'en-GB'
  | 'pt-BR' | 'fr-FR' | 'de-DE' | 'it-IT';

export const PORTADA_IDIOMAS: { valor: PortadaLanguage; etiqueta: string }[] = [
  { valor: 'es-ES', etiqueta: 'Español (España)' },
  { valor: 'es-MX', etiqueta: 'Español (México)' },
  { valor: 'es-AR', etiqueta: 'Español (Argentina)' },
  { valor: 'es-CO', etiqueta: 'Español (Colombia)' },
  { valor: 'es-PE', etiqueta: 'Español (Perú)' },
  { valor: 'es-CL', etiqueta: 'Español (Chile)' },
  { valor: 'en-US', etiqueta: 'English (United States)' },
  { valor: 'en-GB', etiqueta: 'English (United Kingdom)' },
  { valor: 'pt-BR', etiqueta: 'Português (Brasil)' },
  { valor: 'fr-FR', etiqueta: 'Français (France)' },
  { valor: 'de-DE', etiqueta: 'Deutsch (Deutschland)' },
  { valor: 'it-IT', etiqueta: 'Italiano (Italia)' },
];

export interface PortadaProfile {
  profile_name: string;
  created_at: string;
  data?: PortadaData;
  field_map?: Record<string, any>;
}

// ── REFERENCES ────────────────────────────────────────────────────────────────

export interface ReferenciaModel {
  id: string;
  authors: string[];
  year?: string;
  title: string;
  source: string;
  doi_or_url?: string;
  raw_text: string;
  formatted_apa?: string;
  cited_count?: number;
  never_cited?: boolean;
  /** ¿Alguien la contrastó contra una fuente? Por defecto NO: una bibliografía
   *  que ya venía en el .docx no fue verificada contra nada. Sólo un resolutor
   *  real (DOI contra CrossRef, o una búsqueda que devolvió la obra) lo pone en
   *  `true`; agregarla a mano no la verifica. El panel muestra una etiqueta con
   *  esto, porque sin ella una lista bien formateada y una lista inventada por
   *  el sistema se ven igual. */
  verificada?: boolean;
  /** De dónde salió la verificación: "doi", "cruzada", "isbn". */
  fuente_verificacion?: string;
  /** Tipo de fuente APA 7; el backend lo infiere si queda en "otro". */
  tipo?: 'articulo' | 'libro' | 'capitulo' | 'tesis' | 'web' | 'informe' | 'otro';
  /** La línea APA ya segmentada (texto + cursiva). Si falta, usar formatted_apa. */
  apa_segments?: { text: string; italic: boolean }[];
}

// ── CITATIONS ─────────────────────────────────────────────────────────────────

export interface CitationModel {
  raw_text: string;
  authors: string[];
  year?: string;
  page?: string;
  citation_type: CitationType;
  element_id: string;
  start_offset: number;
  end_offset: number;
}

// ── VALIDATION ────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  rule_id: string;
  severity: ValidationStatus;
  message: string;
  suggestion: string;
}

// Python ValidationItem — shape que llega en el JSON de sesión (doc.apa_validation)
export interface ValidationItem {
  category: string;
  status: ValidationStatus;
  message: string;
  element_id?: string | null;
  auto_fixable?: boolean;
}

export interface APAValidationResult {
  score: number;
  generated_at: string;
  items: (ValidationIssue | ValidationItem)[];
}

// ── DOCUMENT METADATA ─────────────────────────────────────────────────────────

export interface SectionInfo {
  section_index: number;
  orientation: string;
  margins_original: Record<string, number>;
  preserve_margins: boolean;
  columns?: number | null;
  columns_space?: number | null;
}

/** Un logo pedido por la portada. Espejo de `LogoPortada` en `python/models.py`. */
export interface LogoPortada {
  /** El nombre del archivo dentro de `python/assets/`, no una URL. */
  asset: string;
  /**
   * Fracción del ancho ÚTIL de la hoja.
   *
   * El default (0.315) son los 5.2 cm que ponía el `Cm(5.2)` de antes, medidos
   * sobre los 16.51 cm de ancho útil de una carta (una pulgada de margen por
   * lado). La cuenta completa está en `FRACCION_DE_ANCHO_DEL_LOGO`, en
   * `src/lib/portada/geometria.ts`, y el default de Python en
   * `LogoPortada.ancho_fraccion`.
   */
  ancho_fraccion: number;
  institucion?: string | null;
}

/** Los datos del acta: QUIEN firma el trabajo.
 *
 *  Son metadatos del DOCUMENTO, no de la portada. El motivo esta escrito en
 *  `python/models.py` y en la nota de arriba de `PortadaData`: con la portada
 *  original conservada, un dato guardado dentro de la portada no tiene de
 *  dónde salir, porque el bloque no se toca.
 *
 *  `autor` es texto porque la portada UNI escribe una tabla de integrantes con
 *  carnet, y el formato que llega del cliente es el mismo que siempre
 *  (`nombre | carnet`). `profesor_asesor` y `comite` son LISTAS: un comite de
 *  defensa tiene varias personas, y pegarlas con comas en un solo string hacia
 *  que el corrector de ortografia subrayara una coma pegada a dos apellidos.
 */
export interface ActaDocumento {
  autor: string;
  profesor_asesor: string[];
  comite: string[];
  fecha_defensa: string;
  grupo: string;
}

/** Las claves del acta dentro de `PortadaData`, de donde vivian antes.
 *  Solo se usan por la migracion de datos guardados. */
export const CLAVES_ACTA_EN_PORTADA = ['author', 'grupo', 'instructor'] as const;

export interface DocumentMeta {
  source_file: string;
  source_hash: string;
  wordapa7_version: string;
  previously_processed: boolean;
  parsed_at: string;
  autosave_at?: string;
  page_count: number;
  word_count: number;
  has_images: boolean;
  has_tables: boolean;
  has_equations: boolean;
  has_ole_objects: boolean;
  portada_detected: boolean;
  apa_format: APAFormat;
  work_mode: WorkMode;
  /* El acta viaja DENTRO de los metadatos del documento. No es una copia: es
     el unico lugar donde esta, y la razon esta escrita arriba y en
     `python/models.py`. */
  autor?: string | null;
  profesor_asesor?: string[];
  comite?: string[];
  fecha_defensa?: string | null;
  grupo?: string | null;
  content_source: string;
  content_warning?: string;
  sections: SectionInfo[];
  page_count_exact?: boolean;
  paragraph_pages?: number[];
  page_layout_provider?: string;
  page_layout_confidence?: number;
  // Bookmarks / hyperlinks
  has_bookmarks?: boolean;
  has_hyperlinks?: boolean;
  hyperlink_count?: number;
  // Preventive truncation (WORDAPA7_MAX_ELEMENTS)
  elements_truncated?: boolean;
  elements_truncated_at?: number;
  forensic_metadata?: Record<string, any>;
  // Footnotes / endnotes (lista de {id, text, is_endnote})
  footnotes?: Array<Record<string, any>>;
  // Word comments (lista de {id, author, text})
  comments?: Array<Record<string, any>>;
  comment_count?: number;
  // Track changes / multicolumn / smartart / charts
  has_track_changes?: boolean;
  has_multicolumn?: boolean;
  has_smartart?: boolean;
  has_charts?: boolean;
}

// ── DOCUMENT MODEL (root) ─────────────────────────────────────────────────────

export interface DocumentPortada {
  detected: boolean;
  element_ids: string[];
  fields: Record<string, string>;
  profile_name?: string;
  textbox_texts?: string[];
  body_start_paragraph_idx?: number;
  body_start_source?: string;
}

export interface DocumentModel {
  session_id: string;
  file_name: string;
  apa_format: APAFormat;
  profile_id?: string;
  elements: ElementModel[];
  has_landscape_sections: boolean;
  meta: DocumentMeta;
  apa_rules: APARuleSet;
  portada: DocumentPortada;
  referencias: ReferenciaModel[];
  citas_intext: CitationModel[];
  apa_validation?: APAValidationResult;
  schema_version?: number;
}

// ── SESSIONS ──────────────────────────────────────────────────────────────────

export interface SessionInfo {
  session_id: string;
  file_name: string;
  element_count: number;
  pending_count: number;
  apa_format: APAFormat;
  parsed_at: string;
  autosave_at?: string;
  last_saved: string;
  validation_score?: number;
}

export interface SessionRecovery {
  session: SessionInfo;
  available: boolean;
}

// ── IDEMPOTENCY ───────────────────────────────────────────────────────────────

export interface IdempotencyResult {
  already_processed: boolean;
  source_hash: string;
  previous_session_id?: string;
  processed_at?: string;
  apa_score?: number;
  has_marker: boolean;
  recommendation: string;
  message: string;
}

// ── API REQUEST / RESPONSE TYPES ──────────────────────────────────────────────

export interface GenerateResponse {
  download_url: string;
  filename: string;
}

export interface PreviewResponse {
  status?: string;
  session_id?: string;
  download_url?: string;
  output_file?: string;
  saved_path?: string;
  html?: string;
}


export interface ProofreadFinding {
  element_id: string;
  start: number;
  end: number;
  excerpt: string;
  kind: 'first_person' | 'ortografia' | 'ai_phrase' | 'pegado' | 'muletilla' | 'ngram_repetition' | 'bloom_vague' | 'bloom_low' | 'repeticion' | 'persona' | 'incompleta' | 'ambigua' | 'passive_voice' | 'long_sentence' | string;
  severity: 'info' | 'warn' | 'error';
  message: string;
  suggestion?: string;
  source: 'local' | 'llm';
  /**
   * Ámbito de fase (clave de `PHASES` en `python/modules/phase_scope.py`).
   * `'global'` o ausente = regla general, que no pertenece a ninguna fase.
   */
  phase?: string;
  /**
   * true = solo lectura: el hallazgo se informa pero no se puede aplicar.
   * Es el caso de la portada, que `AGENTS.md` §1 protege de escritura.
   */
  read_only?: boolean;
}

export interface LLMProgressState {
  status: 'idle' | 'processing' | 'complete' | 'error';
  total_batches: number;
  completed_batches: number;
  current_provider: string;
  current_provider_id: string;
  elements_processed: number;
  elements_total: number;
  estimated_time_remaining_seconds: number;
  current_sample: string;
  provider_fallbacks: Array<{ from: string; to: string }>;
  last_error: string | null;
}

export interface LLMUsageStats {
  total_tokens: number;
  providers_used: string[];
  estimated_cost_usd: number;
  cache_hits: number;
  api_calls: number;
}

export interface ProviderInfo {
  id: string;
  name: string;
  logo?: string;
  description: string;
  isAvailable: boolean;
  priority: number;
}
