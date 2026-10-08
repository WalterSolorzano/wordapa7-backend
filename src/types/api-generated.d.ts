// AUTO-GENERADO por python/scripts/export_api_types.py — NO editar a mano.
// Fuente de verdad: python/models.py (via openapi()). Regenerar:
//   npm run gen:api-types


export interface AIRewriteRequest {
  text: string
}

export type APAFormat = "student" | "professional"

export interface APARuleSet {
  profile_name?: string
  is_default?: boolean
  page_size?: "carta" | "a4"
  margins_cm?: number
  export_mode?: string
  font_family?: string
  font_size_pt?: number
  line_spacing?: number
  paragraph_indent_cm?: number
  alignment?: string
  space_before_pt?: number
  space_after_pt?: number
  bullet_style_level1?: BulletStyle
  bullet_style_level2?: BulletStyle
  bullet_style_level3?: BulletStyle
  number_style_level1?: NumberStyle
  number_style_level2?: NumberStyle
  number_style_level3?: NumberStyle
  heading_levels?: Record<string, HeadingLevelConfig>
  heading_numbering_style_lvl1?: string
  heading_numbering_style_lvl2?: string
  heading_numbering_style_lvl3?: string
  reference_hanging_indent_cm?: number
  doi_as_hyperlink?: boolean
  figure_label_prefix?: string
  table_label_prefix?: string
  table_border_style?: TableBorderStyle
}

export interface APAValidationResult {
  score?: number
  generated_at?: string
  items?: Array<ValidationItem>
}

export interface AddinScoreReq {
  texts?: Array<string>
  tables?: number
  figures?: number
  visual?: Record<string, unknown> | null
}

export interface AnalyzeAIDocumentRequest {
  paragraphs?: Array<string>
}

export interface AnalyzeAIRequest {
  text: string
}

export interface AnalyzeSelectionRequest {
  text: string
  context?: string | null
}

export interface AnalyzeTableAIRequest {
  headers?: Array<string>
  rows?: Array<Array<string>>
}

export interface ApplyCoverRequest {
  session_id: string
  cover_template_name: string
  title?: string
  author?: string
  institution?: string
  course?: string
  instructor?: string
  date?: string
}

export interface ApplyTemplateRequest {
  session_id: string
  template_name: string
  numbering_style?: string
}

export interface AuditDocumentRequest {
  text: string
}

export interface Body_audit_pagination_api_audit_pagination_post {
  file: string
  expected_pages?: null | number
}

export interface Body_audit_pdf_visual_endpoint_api_export_audit_pdf_visual_post {
  file: string
}

export interface Body_check_idempotency_endpoint_api_check_idempotency_post {
  file: string
}

export interface Body_classify_with_llm_api_classify__session_id__post {
  api_key?: string | null
  nim_url?: string | null
  use_local?: string | null
  provider_id?: string | null
}

export interface Body_import_references_file_endpoint_api_references_import_file_post {
  file?: string | null
  content?: string | null
  file_type?: string | null
}

export interface Body_replace_image_endpoint_api_replace_image__session_id___element_id__post {
  file: string
}

export interface Body_upload_cover_docx_endpoint_api_cover_templates_upload_docx_post {
  file: string
  name?: string
  description?: string
}

export interface Body_upload_cover_image_endpoint_api_cover_templates_upload_image_post {
  file: string
  name?: string
  description?: string
}

export interface Body_upload_docx_api_upload_post {
  file: string
  apa_format?: string | null
  work_mode?: string | null
  cover_page?: string | null
  profile_id?: string | null
}

export interface Body_validate_document_with_ai_api_validate_ai_post {
  session_id: string
  references?: string
  api_key?: string | null
  nim_url?: string | null
  use_local?: string | null
  provider_id?: string | null
}

export interface BuildBibliographyRequest {
  document_text?: string | null
}

export interface BulkAcceptRequest {
  session_id: string
  element_ids: Array<string>
}

export type BulletStyle = "disc" | "circle" | "square" | "dash"

export interface CaptionsPlanReq {
  texts?: Array<string>
  tables?: Array<number>
  figures?: Array<number>
}

export interface ChatCommentRequest {
  session_id: string
  element_id: string
  kind: string
  element_text: string
  examples?: Array<unknown>
  api_key?: string | null
  nim_url?: string | null
  use_local?: boolean
  provider_id?: string | null
}

export interface CitationFixRequest {
  session_id: string
  citation_text: string
  reference_id?: string | null
  problem?: string
  api_key?: string | null
}

export interface CitationModel {
  raw_text: string
  authors?: Array<string>
  year?: string | null
  page?: string | null
  citation_type?: CitationType
  element_id?: string
  start_offset?: number
  end_offset?: number
}

export type CitationType = "parentetica" | "narrativa" | "multiple" | "secundaria" | "pagina" | "et_al"

export interface ClientLogRequest {
  component?: string
  event: string
  data?: Record<string, unknown> | null
  level?: string
}

export interface CoverSpec {
  template?: string
  title?: string
  author?: string
  institution?: string
  course?: string
  instructor?: string
  date?: string
}

export interface CreateFromTemplateRequest {
  template_id: string
  profile_id?: string
}

export interface DetectHeadingsRequest {
  paragraphs?: Array<string>
  document_text?: string | null
}

export interface DetectSimilarRequest {
  session_id: string
  element_id: string
  new_type: string
}

export interface DocAuditResult {
  heading_issues?: Array<string>
  missing_sections?: Array<string>
  reference_issues?: Array<string>
  format_suggestions?: Array<string>
  overall_assessment?: string
  summary?: string
}

export interface DocumentMeta {
  source_file?: string
  source_hash?: string
  wordapa7_version?: string
  previously_processed?: boolean
  parsed_at?: string
  autosave_at?: string | null
  page_count?: number
  page_count_exact?: boolean
  paragraph_pages?: Array<number>
  page_layout_provider?: string
  page_layout_confidence?: number
  word_count?: number
  has_images?: boolean
  has_tables?: boolean
  has_equations?: boolean
  has_ole_objects?: boolean
  has_bookmarks?: boolean
  has_hyperlinks?: boolean
  hyperlink_count?: number
  portada_detected?: boolean
  apa_format?: APAFormat
  work_mode?: WorkMode
  content_source?: string
  content_warning?: string | null
  sections?: Array<SectionInfo>
  elements_truncated?: boolean
  elements_truncated_at?: number
  forensic_metadata?: Record<string, unknown>
  footnotes?: Array<Record<string, unknown>>
  comments?: Array<Record<string, unknown>>
  comment_count?: number
  has_track_changes?: boolean
  has_multicolumn?: boolean
  has_smartart?: boolean
  has_charts?: boolean
}

export interface DocumentModel {
  session_id?: string
  file_name?: string
  apa_format?: APAFormat
  profile_id?: string
  elements?: Array<ElementModel>
  has_landscape_sections?: boolean
  meta?: DocumentMeta
  apa_rules?: APARuleSet
  portada?: Record<string, unknown>
  referencias?: Array<ReferenciaModel>
  citas_intext?: Array<CitationModel>
  apa_validation?: APAValidationResult | null
}

export interface DocumentZonesRequest {
  paragraphs: Array<string>
}

export interface ElementModel {
  id: string
  type?: ElementType
  heading_level?: null | number
  list_level?: null | number
  is_cover_section?: boolean
  text?: string
  original_text?: string | null
  style_name?: string
  alignment?: string
  font_name?: string
  font_size?: number
  is_bold?: boolean
  is_italic?: boolean
  is_bullet?: boolean
  is_table_cell?: boolean
  left_indent_cm?: number
  first_line_indent_cm?: number
  space_before_pt?: number
  space_after_pt?: number
  line_spacing?: null | number
  confidence?: number
  is_user_modified?: boolean
  image_info?: ImageModel | null
  table_info?: TableModel | null
  page_number?: null | number
  ai_matches?: Array<string> | null
  has_math?: boolean
  has_fields?: boolean
  needs_review?: boolean
  auto_applied?: boolean
  llm_reasoning?: string | null
  pre_classifier_rule?: string | null
  bullet_source?: string | null
  bullet_style?: BulletStyle | null
  number_style?: NumberStyle | null
  number_start?: null | number
  original_char?: string | null
  cita_ids?: Array<string>
  applied_style?: string | null
  applied_at?: string | null
  ai_score?: number
  ai_findings?: Array<Record<string, unknown>>
  has_shading_residue?: boolean
  has_web_shading_residue?: boolean
  footnote_ids?: Array<number>
  hyperlinks?: Array<Record<string, unknown>>
  bookmarks?: Array<Record<string, unknown>>
  equation?: EquationConfig | null
}

export type ElementType = "heading" | "paragraph" | "bullet" | "numbered_list" | "image" | "table" | "block_quote" | "page_break" | "section_break" | "empty" | "portada_block" | "equation" | "toc" | "caption" | "unknown"

export interface EquationConfig {
  show_number?: boolean
  number_format?: string
  number?: string | null
  alignment?: string
  font_name?: string
  font_size_pt?: number
}

export interface EquipmentCardElement {
  type?: string
  number: string
  title: string
  image: string
  specs?: Record<string, string>
}

export interface ExplainElementRequest {
  element_type?: string
  text?: string
  rules_applied?: string
  confidence?: number
  api_key?: string | null
  session_id?: string | null
  element_id?: string | null
  question?: string
}

export interface ExtractCitationsRequest {
  text: string
  element_id?: string | null
}

export interface FigureElement {
  type?: string
  image: string
  caption?: string
  title?: string
}

export interface FormatBibliographyRequest {
  references?: Array<string>
}

export interface FormatPlanReq {
  texts?: Array<string>
  full?: boolean
}

export interface GenerateRequest {
  session_id: string
  rules?: APARuleSet | null
  portada?: PortadaData | null
  references?: Array<ReferenciaModel> | null
}

export interface HTTPValidationError {
  detail?: Array<ValidationError>
}

export interface HeadingElement {
  type?: string
  level: number
  text: string
}

export interface HeadingLevelConfig {
  bold?: boolean
  italic?: boolean
  alignment?: string
  indent_cm?: number
  inline_text?: boolean
}

export interface HealthResponse {
  status?: string
  version?: string
  app?: string
}

export interface ImageModel {
  element_id: string
  file_path: string
  filename: string
  relative_url?: string
  render_error?: string | null
  width_cm?: number
  height_cm?: number
  caption?: string
  note?: string | null
  figure_number?: number
  subfigures?: Array<SubfigureModel>
  width_inches?: null | number
  height_inches?: null | number
  alignment?: string
  wrap_style?: string
  caption_position?: string
  constrain_proportions?: boolean
  design_style?: string
  rotation?: number
  alt_text?: string
  is_anchor?: boolean
  anchor_pos_h?: string | null
  anchor_pos_v?: string | null
}

export interface LayoutPaginateRequest {
  session_id: string
}

export interface LiveChatRequest {
  session_id: string
  user_instruction: string
  selected_element_id?: string | null
  history?: Array<Record<string, unknown>> | null
  api_key?: string | null
}

export interface LoadingTipRequest {
  category?: string | null
  phase?: string | null
  api_key?: string | null
  nim_url?: string | null
  use_local?: boolean
  provider_id?: string | null
}

export interface NextNumberRequest {
  document_text: string
}

export interface NormalizeHeadingsRequest {
  session_id: string
}

export type NumberStyle = "decimal" | "lowerLetter" | "upperLetter" | "lowerRoman" | "upperRoman" | "none"

export interface OpenInWordReq {
  path: string
}

export interface OpenLocalReq {
  path: string
}

export interface OutputSpec {
  filename?: string
}

export interface ParagraphElement {
  type?: string
  text: string
}

export interface PortadaData {
  apa_format?: APAFormat
  use_original_cover?: boolean
  force_skip_cover?: boolean
  title?: string
  author?: string
  institution?: string
  course?: string | null
  grupo?: string | null
  instructor?: string | null
  date?: string | null
  running_head?: string | null
  author_note?: string | null
  departamento?: string | null
  language?: "es-ES" | "es-MX" | "es-AR" | "es-CO" | "es-PE" | "es-CL" | "en-US" | "en-GB" | "pt-BR" | "fr-FR" | "de-DE" | "it-IT"
}

export interface PresetPayload {
  name: string
  type: "table" | "heading" | "layout"
  description?: string
  definition?: Record<string, unknown>
  overwrite?: boolean
}

export interface PresetRefs {
  table?: string | null
  heading?: string | null
  layout?: string | null
}

export interface PreviewRequest {
  session_id: string
  rules?: APARuleSet | null
  portada?: PortadaData | null
  references?: Array<ReferenciaModel> | null
}

export interface ProactiveCaptionsRequest {
  session_id: string
  api_key?: string | null
}

export interface ProactiveDiagnoseRequest {
  session_id: string
  element_id: string
  api_key?: string | null
}

export interface ProofreadRequest {
  session_id?: string | null
  texts?: Array<string>
  element_ids?: Array<string>
}

export interface ReferenceItem {
  apa?: string | null
  doi?: string | null
}

export interface ReferencesElement {
  type?: string
  items: Array<ReferenceItem>
}

export interface ApaSegment {
  text: string
  italic: boolean
}

export interface ReferenciaModel {
  id: string
  authors?: Array<string>
  year?: string | null
  title?: string
  source?: string
  doi_or_url?: string | null
  raw_text?: string
  formatted_apa?: string | null
  cited_count?: number
  never_cited?: boolean
  is_duplicate?: boolean
  duplicate_count?: number
  verificada?: boolean
  fuente_verificacion?: string | null
  tipo?: string | null
  apa_segments?: Array<ApaSegment>
}

export interface ReorderElementsRequest {
  session_id: string
  element_ids: Array<string>
}

export interface ResolveBatchRequest {
  references: Array<string>
}

export interface ResolveDoisRequest {
  text: string
  guardar?: boolean
}

export interface ResolveGhostCitationRequest {
  authors: Array<string>
  year: string
}

export interface RewriteTextRequest {
  session_id: string
  element_id: string
  text: string
  instruction: string
  api_key?: string | null
}

export interface RewriteVariationsRequest {
  session_id: string
  element_id: string
  text: string
  instruction?: string
  n?: number
  api_key?: string | null
}

export interface SaveReferenceRequest {
  id?: string | null
  authors?: Array<string>
  year?: string | null
  title?: string
  source?: string
  doi_or_url?: string | null
  raw_text?: string
}

export interface ScopedApplyLiveRequest {
  ooxml_base64: string
  scopes: Array<string>
  rules?: Record<string, unknown> | null
}

export interface SectionInfo {
  section_index: number
  orientation: string
  margins_original: Record<string, number>
  preserve_margins: boolean
  columns?: null | number
  columns_space?: null | number
}

export interface SetProfileRequest {
  profile_id: string
}

export interface SpecDocument {
  spec_version: string
  output?: OutputSpec
  cover?: CoverSpec | null
  presets?: PresetRefs
  elements: Array<unknown>
  options?: SpecOptions
}

export interface SpecOptions {
  resolve_doi?: boolean
}

export interface SubfigureModel {
  id: string
  label?: string
  title?: string
  relative_url?: string
  file_path?: string | null
  filename?: string | null
}

export interface SuggestCoverRequest {
  document_text: string
}

export type TableBorderStyle = "apa" | "grid"

export interface TableElement {
  type?: string
  caption?: string
  title?: string
  columns: Array<string>
  rows?: Array<Array<string>>
  note?: string | null
  repeat_header?: boolean
  preset?: string | null
}

export interface TableModel {
  element_id: string
  headers?: Array<string>
  rows?: Array<Array<string>>
  caption?: string
  note?: string | null
  table_number?: number
}

export interface UpdateElementRequest {
  session_id: string
  element_id: string
  type: string
  heading_level?: null | number
  text?: string | null
  image_info?: Record<string, unknown> | null
  equation?: Record<string, unknown> | null
  table_info?: Record<string, unknown> | null
}

export interface ValidateFragmentRequest {
  text: string
  element_type?: string | null
}

export interface ValidationError {
  loc: Array<number | string>
  msg: string
  type: string
}

export interface ValidationItem {
  category: string
  status: ValidationStatus
  message: string
  element_id?: string | null
  auto_fixable?: boolean
}

export type ValidationStatus = "ok" | "warning" | "error"

export type WorkMode = "quick" | "review"

export interface main__ResolveDoiRequest {
  doi: string
}

export interface main__SuggestCaptionRequest {
  session_id: string
  element_id: string
  context_text: string
  api_key?: string | null
}

export interface routers__addin__SuggestCaptionRequest {
  type: string
  context_text: string
}

export interface routers__references__ResolveDoiRequest {
  doi: string
  guardar?: boolean
}
