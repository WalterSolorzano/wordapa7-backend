"""
WordAPA7 — Modelos Pydantic (fuente de verdad del schema)

Todos los módulos importan desde aquí.
No usar dicts crudos para pasar datos entre módulos — siempre usar estos modelos.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

# ── ENUMERACIONES ────────────────────────────────────────────────────────────

class ElementType(str, Enum):
    HEADING        = "heading"
    PARAGRAPH      = "paragraph"
    BULLET         = "bullet"
    NUMBERED_LIST  = "numbered_list"
    IMAGE          = "image"
    TABLE          = "table"
    BLOCK_QUOTE    = "block_quote"
    PAGE_BREAK     = "page_break"
    SECTION_BREAK  = "section_break"
    EMPTY          = "empty"
    PORTADA_BLOCK  = "portada_block"
    EQUATION       = "equation"
    TOC            = "toc"           # Tabla de Contenidos nativa de Word
    CAPTION        = "caption"
    UNKNOWN        = "unknown"


class BulletStyle(str, Enum):
    DISC    = "disc"     # •
    CIRCLE  = "circle"   # ○
    SQUARE  = "square"   # ▪
    DASH    = "dash"     # –


class NumberStyle(str, Enum):
    DECIMAL      = "decimal"       # 1. 2. 3.
    LOWER_LETTER = "lowerLetter"   # a. b. c.
    UPPER_LETTER = "upperLetter"   # A. B. C.
    LOWER_ROMAN  = "lowerRoman"    # i. ii. iii.
    UPPER_ROMAN  = "upperRoman"    # I. II. III.
    NONE         = "none"


class APAFormat(str, Enum):
    STUDENT      = "student"
    PROFESSIONAL = "professional"


class TableBorderStyle(str, Enum):
    APA  = "apa"    # solo bordes horizontales (estilo APA 7)
    GRID = "grid"   # cuadrícula completa (revistas científicas / manuales)


class CitationType(str, Enum):
    PARENTETICA = "parentetica"    # (García, 2023)
    NARRATIVA   = "narrativa"      # García (2023)
    MULTIPLE    = "multiple"       # (García, 2023; López, 2021)
    SECUNDARIA  = "secundaria"     # (X, año, como se citó en Y, año)
    PAGINA      = "pagina"         # (García, 2023, p. 45)
    ET_AL       = "et_al"          # (García et al., 2023)


class ValidationStatus(str, Enum):
    OK      = "ok"
    WARNING = "warning"
    ERROR   = "error"


class WorkMode(str, Enum):
    QUICK  = "quick"
    REVIEW = "review"


# ── REGLAS APA PERSONALIZABLES ────────────────────────────────────────────────

class HeadingLevelConfig(BaseModel):
    bold: bool = True
    italic: bool = False
    alignment: str = "left"   # "left" | "center" | "right"
    indent_cm: float = 0.0
    inline_text: bool = False  # True para level 4 y 5


class APARuleSet(BaseModel):
    profile_name: str = "APA 7 Estándar"
    is_default: bool = True

    # Página
    margins_cm: float = 2.54

    # Fuente
    font_family: str = "Times New Roman"
    font_size_pt: int = 12

    # Párrafos
    line_spacing: float = 2.0
    paragraph_indent_cm: float = 1.27
    alignment: str = "left"   # "left" | "justify"
    space_before_pt: float = 0.0
    space_after_pt: float = 0.0

    # Listas
    bullet_style_level1: BulletStyle = BulletStyle.DISC
    bullet_style_level2: BulletStyle = BulletStyle.CIRCLE
    bullet_style_level3: BulletStyle = BulletStyle.SQUARE
    number_style_level1: NumberStyle = NumberStyle.DECIMAL
    number_style_level2: NumberStyle = NumberStyle.LOWER_LETTER
    number_style_level3: NumberStyle = NumberStyle.LOWER_ROMAN

    # Headings por nivel
    heading_levels: dict[int, HeadingLevelConfig] = Field(default_factory=lambda: {
        1: HeadingLevelConfig(bold=True, italic=False, alignment="center", inline_text=False),
        2: HeadingLevelConfig(bold=True, italic=False, alignment="left",   inline_text=False),
        3: HeadingLevelConfig(bold=True, italic=True,  alignment="left",   inline_text=False),
        4: HeadingLevelConfig(bold=True, italic=False, alignment="left",   indent_cm=1.27, inline_text=True),
        5: HeadingLevelConfig(bold=True, italic=True,  alignment="left",   indent_cm=1.27, inline_text=True),
    })

    # Numeracion de headings
    heading_numbering_style_lvl1: str = "decimal"  # "decimal" | "roman" | "none"
    heading_numbering_style_lvl2: str = "decimal"  # "decimal" | "roman" | "none"
    heading_numbering_style_lvl3: str = "decimal"  # "decimal" | "roman" | "none"

    # Referencias
    reference_hanging_indent_cm: float = 1.27
    doi_as_hyperlink: bool = True

    # Figuras y tablas
    figure_label_prefix: str = "Figura"
    table_label_prefix: str = "Tabla"
    table_border_style: TableBorderStyle = TableBorderStyle.APA


# ── SECCIONES ────────────────────────────────────────────────────────────────

class SectionInfo(BaseModel):
    section_index: int
    orientation: str          # "portrait" | "landscape"
    margins_original: dict[str, float]
    preserve_margins: bool    # True si landscape
    # Columnas múltiples (w:cols dentro de w:sectPr)
    columns: Optional[int] = None
    columns_space: Optional[int] = None


# ── ORIGINAL METADATA (no modificar) ─────────────────────────────────────────

class OriginalMetadata(BaseModel):
    style_name: str = ""
    alignment: Optional[str] = None
    bold: Optional[bool] = None
    italic: Optional[bool] = None
    font_size: Optional[float] = None
    font_name: Optional[str] = None
    left_indent: Optional[float] = None
    first_line_indent: Optional[float] = None
    num_id: Optional[int] = None
    ilvl: Optional[int] = None
    is_empty: bool = False
    section_index: int = 0


# ── ELEMENTO DEL DOCUMENTO ────────────────────────────────────────────────────

# ── CITA IN-TEXT ─────────────────────────────────────────────────────────────

class CitaError(BaseModel):
    type: str
    description: str


# ── REFERENCIA BIBLIOGRÁFICA ─────────────────────────────────────────────────

# ── VALIDACIÓN APA ────────────────────────────────────────────────────────────

class ValidationItem(BaseModel):
    category: str    # "formato" | "headings" | "figuras" | "tablas" | "citas" | "referencias" | "consistencia"
    status: ValidationStatus
    message: str
    element_id: Optional[str] = None
    auto_fixable: bool = False


class APAValidationResult(BaseModel):
    score: int = 0
    generated_at: str = ""
    items: list[ValidationItem] = Field(default_factory=list)


# ── PORTADA ────────────────────────────────────────────────────────────────────

class PortadaProfile(BaseModel):
    profile_name: str
    created_at: str = ""
    field_map: dict[str, str] = Field(default_factory=dict)  # {block_id: role}


# ── METADATOS DEL DOCUMENTO ───────────────────────────────────────────────────

class DocumentMeta(BaseModel):
    source_file: str = ""
    source_hash: str = ""
    wordapa7_version: str = "1.0.0"
    previously_processed: bool = False
    parsed_at: str = ""
    autosave_at: Optional[str] = None
    page_count: int = 0
    page_count_exact: bool = False
    paragraph_pages: List[int] = Field(default_factory=list)
    page_layout_provider: str = ""
    page_layout_confidence: float = 0.0
    word_count: int = 0
    has_images: bool = False
    has_tables: bool = False
    has_equations: bool = False
    has_ole_objects: bool = False
    # Detección de anclajes/enlaces: se registran para advertir al usuario,
    # ya que no se modelan como elementos propios en el pipeline actual.
    has_bookmarks: bool = False
    has_hyperlinks: bool = False
    hyperlink_count: int = 0
    portada_detected: bool = False
    apa_format: APAFormat = APAFormat.STUDENT
    work_mode: WorkMode = WorkMode.REVIEW
    content_source: str = "paragraphs"   # "paragraphs" | "textboxes" | "mixed"
    content_warning: Optional[str] = None
    sections: list[SectionInfo] = Field(default_factory=list)
    # Truncamiento preventivo cuando el documento excede el límite de elementos
    # configurado (WORDAPA7_MAX_ELEMENTS). Permite advertir al usuario que el
    # resto del documento no fue importado.
    elements_truncated: bool = False
    elements_truncated_at: int = 0
    forensic_metadata: Dict[str, Any] = Field(default_factory=dict)
    # Notas al pie / notas finales (lista de {id, text, is_endnote})
    footnotes: list[dict] = Field(default_factory=list)
    # Comentarios de Word (lista de {id, author, text})
    comments: list[dict] = Field(default_factory=list)
    comment_count: int = 0
    # Track Changes entrantes (w:ins/w:del detectados)
    has_track_changes: bool = False
    # Diseños multicolumna (w:cols con num > 1)
    has_multicolumn: bool = False
    # SmartArt y gráficos (gráficas de datos)
    has_smartart: bool = False
    has_charts: bool = False


# ── MODELO RAÍZ ───────────────────────────────────────────────────────────────

class DocumentModel(BaseModel):
    session_id: str = ""
    file_name: str = ""
    apa_format: APAFormat = APAFormat.STUDENT
    profile_id: str = "apa7"
    elements: list[ElementModel] = Field(default_factory=list)
    has_landscape_sections: bool = False
    meta: DocumentMeta = Field(default_factory=DocumentMeta)
    apa_rules: APARuleSet = Field(default_factory=APARuleSet)
    portada: dict[str, Any] = Field(default_factory=lambda: {
        "detected": False,
        "element_ids": [],
        "fields": {},
        "profile_name": None,
    })
    referencias: list[ReferenciaModel] = Field(default_factory=list)
    citas_intext: list[CitationModel] = Field(default_factory=list)
    apa_validation: Optional[APAValidationResult] = None


# ── REQUESTS / RESPONSES DE API ───────────────────────────────────────────────

class ParseRequest(BaseModel):
    """Body opcional para /api/parse (los metadatos del wizard)"""
    apa_format: APAFormat = APAFormat.STUDENT
    work_mode: WorkMode = WorkMode.REVIEW


class ClassifyRequest(BaseModel):
    session_id: str
    element_ids: list[str]


class ApplyRequest(BaseModel):
    session_id: str
    apa_rules: Optional[APARuleSet] = None


class PreviewRequest(BaseModel):
    session_id: str


class ReferenceRequest(BaseModel):
    input_type: str   # "doi" | "url" | "free_text"
    input_raw: str


class CitationApplyRequest(BaseModel):
    session_id: str
    cita_id: str
    action: str   # "apply" | "ignore"
    manual_text: Optional[str] = None  # Si el usuario editó manualmente


class PortadaMapRequest(BaseModel):
    session_id: str
    field_map: dict[str, str]
    values: dict[str, str]
    profile_name: Optional[str] = None


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "1.0.0"
    app: str = "WordAPA7"


# ── COMPATIBILITY ALIASES & CLASSES ──────────────────────────────────────────

class ImageModel(BaseModel):
    element_id: str
    file_path: str
    filename: str
    relative_url: str = ""
    render_error: Optional[str] = None
    width_cm: float = 12.0
    height_cm: float = 8.0
    caption: str = ""
    note: Optional[str] = None
    figure_number: int = 1
    # Nuevos campos configurables para control total de imagen
    width_inches: Optional[float] = None      # Ancho en pulgadas (si se prefiere sobre cm)
    height_inches: Optional[float] = None     # Alto en pulgadas
    alignment: str = "center"                 # "left" | "center" | "right"
    wrap_style: str = "inline"                # "inline" | "square" | "tight" | "top_and_bottom"
    caption_position: str = "above"           # "above" | "below"
    constrain_proportions: bool = True        # Mantener proporcion al cambiar ancho
    design_style: str = "standard"            # "standard" | "sidebar" | "scientific" | "corner" | "full_width"
    rotation: int = 0                          # grados de rotacion (0, 90, 180, 270)
    alt_text: str = ""                         # texto alternativo / accesibilidad

    # Nuevos atributos flotantes (anchor)
    is_anchor: bool = False
    anchor_pos_h: Optional[str] = None
    anchor_pos_v: Optional[str] = None


class TableModel(BaseModel):
    element_id: str
    headers: list[str] = Field(default_factory=list)
    rows: list[list[str]] = Field(default_factory=list)
    caption: str = ""
    note: Optional[str] = None
    table_number: int = 1


class ElementModel(BaseModel):
    id: str
    type: ElementType = ElementType.UNKNOWN
    heading_level: Optional[int] = 1
    list_level: Optional[int] = 1
    is_cover_section: bool = False
    text: str = ""
    original_text: Optional[str] = None
    style_name: str = "Normal"
    alignment: str = "left"
    font_name: str = "Times New Roman"
    font_size: float = 12.0
    is_bold: bool = False
    is_italic: bool = False
    is_bullet: bool = False
    left_indent_cm: float = 0.0
    confidence: float = 0.5
    is_user_modified: bool = False
    image_info: Optional[ImageModel] = None
    table_info: Optional[TableModel] = None
    page_number: Optional[int] = None
    ai_matches: Optional[List[str]] = None

    # Preservacion XML
    has_math: bool = False
    has_fields: bool = False

    # Clasificacion y revision
    needs_review: bool = True
    auto_applied: bool = False
    llm_reasoning: Optional[str] = None
    pre_classifier_rule: Optional[str] = None

    # Bullet y lista
    bullet_source: Optional[str] = None  # "ooxml_list" | "manual_char" | "tab_indent"
    bullet_style: Optional[BulletStyle] = None
    number_style: Optional[NumberStyle] = None
    number_start: Optional[int] = None
    original_char: Optional[str] = None

    # Citas en este parrafo
    cita_ids: list[str] = Field(default_factory=list)

    # Estado post-apply
    applied_style: Optional[str] = None
    applied_at: Optional[str] = None

    # Deteccion de IA
    ai_score: float = 0.0
    ai_findings: list[dict] = Field(default_factory=list)
    has_shading_residue: bool = False
    # Sombreado con colores web típicos de tablas copiadas (F4CCCC, FFE599, D9EAD3)
    has_web_shading_residue: bool = False

    # Notas al pie / notas finales referenciadas en este párrafo
    footnote_ids: list[int] = Field(default_factory=list)
    # Hipervínculos preservados: [{text, url}]
    hyperlinks: list[dict] = Field(default_factory=list)
    # Marcadores preservados: [{name, id}]
    bookmarks: list[dict] = Field(default_factory=list)

    # Configuración de ecuación (solo relevante si type == EQUATION)
    equation: Optional[EquationConfig] = None


class EquationConfig(BaseModel):
    """Configuración de presentación para una ecuación OMML.

    La ecuación en sí (el XML m:oMath) se preserva intacto desde el documento
    original; aquí solo se controla cómo se presenta alrededor de ella:
    alineación, número de ecuación y fuente tipográfica de apoyo.
    """
    show_number: bool = False
    number_format: str = "(1)"        # "(1)" | "[1]" | "1." | "(1.1)" | "Ecuación 1"
    number: Optional[str] = None      # número explícito (se auto-asigna si vacío)
    alignment: str = "center"         # "left" | "center" | "right"
    font_name: str = "Times New Roman"  # fuente de apoyo (número y etiqueta)
    font_size_pt: float = 12.0


class PortadaData(BaseModel):
    apa_format: APAFormat = APAFormat.STUDENT
    use_original_cover: bool = True  # Conservar portada original intacta del documento
    force_skip_cover: bool = False  # True = saltar todos los elementos de portada sin tocarlos
    title: str = ""
    author: str = ""
    institution: str = ""
    course: Optional[str] = None
    grupo: Optional[str] = None
    instructor: Optional[str] = None
    date: Optional[str] = None
    running_head: Optional[str] = None
    author_note: Optional[str] = None


class CitationModel(BaseModel):
    raw_text: str
    authors: list[str] = Field(default_factory=list)
    year: Optional[str] = None
    page: Optional[str] = None
    citation_type: CitationType = CitationType.PARENTETICA
    element_id: str = ""
    start_offset: int = 0
    end_offset: int = 0


class ReferenciaModel(BaseModel):
    id: str
    authors: list[str] = Field(default_factory=list)
    year: Optional[str] = None
    title: str = ""
    source: str = ""
    doi_or_url: Optional[str] = None
    raw_text: str = ""
    formatted_apa: Optional[str] = None
    # P2.17 — Conteo de citas en el cuerpo del documento.
    # citation_matcher.cross_check_citations_and_references() asigna estos
    # campos. Antes solo existían en ReferenciaItem (no usado por
    # DocumentModel.referencias), por lo que la asignación se perdía.
    cited_count: int = 0
    never_cited: bool = False


class ValidationIssueModel(BaseModel):
    rule_id: str
    severity: ValidationStatus = ValidationStatus.OK
    message: str
    suggestion: str = ""
