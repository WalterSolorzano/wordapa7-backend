"""
WordAPA7 — Modelos Pydantic (fuente de verdad del schema)

Todos los módulos importan desde aquí.
No usar dicts crudos para pasar datos entre módulos — siempre usar estos modelos.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

try:
    from config import APP_VERSION
except Exception:
    APP_VERSION = "1.0.67"

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


class CellSpan(BaseModel):
    """Extensión de una celda de tabla (combinación horizontal/vertical)."""
    col: int = 1
    row: int = 1


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
    # Tamaño de hoja. Antes esto no existía como dato: el lienzo usaba un token
    # fijo de A4 y el `.docx` salía con el tamaño del original, así que la
    # pantalla y el archivo se contradecian. Ahora es un campo, y lo aplica
    # `apply_page_setup`.
    #
    # El default es "carta" y no "a4" porque es lo que dice `DESIGN.md:75`
    # (8.5" x 11"). Un valor cerrado con `Literal` y no un `str` con comentario:
    # un `page_size` que llega con otro nombre desde el cliente tiene que
    # rechazar, no colarse en silencio y dejar un papel del tamaño que sea.
    page_size: Literal["carta", "a4"] = "carta"
    margins_cm: float = 2.54

    @field_validator("page_size", mode="before")
    @classmethod
    def _normalizar_page_size(cls, v: Any) -> Any:
        """Acepta los nombres que el cliente ya usaba y los deja en el canónico.

        `pageGeometry.ts` ya recibía 'letter' y 'a4' como texto libre, y hay
        documentos guardados con esa forma. Sin esta normalización, reabrir uno
        de ellos fallaría la validación en vez de abrir con Carta, que es lo que
        dice su propia hoja.
        """
        if v is None or v == "":
            return "carta"
        if isinstance(v, str):
            v = v.strip().lower()
            if v in ("carta", "letter", "carta (letter)", "8.5x11"):
                return "carta"
            if v == "a4":
                return "a4"
        return v

    # Fuente
    export_mode: str = "inplace"  # inplace | rebuild
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
    # APA 7 does NOT require numbered headings: the 5 levels are distinguished
    # purely by formatting (bold, centered, italic, indented). The default is
    # therefore "none" so no spurious numbering (e.g. "0.1") is injected.
    heading_numbering_style_lvl1: str = "none"  # "none" | "decimal" | "upperRoman" | "lowerRoman" | "lowerLetter" | "upperLetter"
    heading_numbering_style_lvl2: str = "none"  # mismo dominio; se aplica al componente propio del nivel
    heading_numbering_style_lvl3: str = "none"  # mismo dominio (H3 no se numera hoy)

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
    wordapa7_version: str = APP_VERSION
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
    # ── EL ACTA ────────────────────────────────────────────────────────────
    # Autor, profesor asesor, comité y fecha de defensa son METADATOS DEL
    # DOCUMENTO, no de la portada. Antes vivían dentro de `PortadaData`, y con
    # `use_original_cover: true` no había de dónde sacarlos: el bloque de
    # portada no se toca, así que el `.docx` salía sin ellos. Eso es lo que
    # reportó el usuario: "conservar original" pierde al profesor y al grupo.
    #
    # `profesor_asesor` y `comite` son LISTAS y no texto: el comité de una
    # defensa tiene varias personas y un solo string las pegaba con comas, que
    # después el corrector de ortografía subrayaba como si fuera una palabra
    # rota.
    #
    # Todo con default vacío para que un documento guardado antes de este
    # cambio siga abriendo.
    autor: Optional[str] = None
    profesor_asesor: List[str] = Field(default_factory=list)
    comite: List[str] = Field(default_factory=list)
    fecha_defensa: Optional[str] = None
    grupo: Optional[str] = None
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


class LayoutPaginateRequest(BaseModel):
    """FASE 2 — repaginación en vivo: Word COM como autoridad de layout."""
    session_id: str


class LayoutPdfExportRequest(BaseModel):
    """FASE 4 — exportación de PDF en reposo: Word COM ExportAsFixedFormat."""
    session_id: str


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = APP_VERSION
    app: str = "WordAPA7"


class SubfigureModel(BaseModel):
    id: str
    label: str = "(a)"
    title: str = ""
    relative_url: str = ""
    file_path: Optional[str] = None
    filename: Optional[str] = None


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
    # Subfiguras multipanel APA 7 (a, b, c...)
    subfigures: list[SubfigureModel] = Field(default_factory=list)
    # Nuevos campos configurables para control total de imagen
    width_inches: Optional[float] = None      # Ancho en pulgadas (si se prefiere sobre cm)
    height_inches: Optional[float] = None     # Alto en pulgadas
    alignment: str = "center"                 # "left" | "center" | "right"
    wrap_style: str = "inline"                # "inline" | "square" | "tight" | "top_and_bottom"
    caption_position: str = "above"           # "above" | "below"
    constrain_proportions: bool = True        # Mantener proporcion al cambiar ancho
    design_style: str = "standard"            # "standard" | "sidebar" | "scientific" | "corner" | "full_width" | "multipanel"
    rotation: int = 0                          # grados de rotacion (0, 90, 180, 270)
    alt_text: str = ""                         # texto alternativo / accesibilidad
    border: str = "none"                        # "none" | "subtle" | "strong"
    shadow: bool = False                        # sombra sutil del marco
    corner_radius: str = "none"                # "none" | "sm" | "md" | "lg"
    flip_h: bool = False                        # espejo horizontal
    flip_v: bool = False                        # espejo vertical

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
    header_spans: Optional[list[CellSpan]] = None
    row_spans: Optional[list[list[CellSpan]]] = None
    style: Optional[str] = None   # TableStylePreset de la UI; None = usar la regla global
    orientation: str = "auto"     # auto | portrait | landscape
    column_widths: Optional[list[float]] = None


class ElementModel(BaseModel):
    id: str
    type: ElementType = ElementType.UNKNOWN
    heading_level: Optional[int] = 1
    outline_level: Optional[int] = None
    list_level: Optional[int] = 1
    is_cover_section: bool = False
    text: str = ""
    original_text: Optional[str] = None
    style_name: str = "Normal"
    alignment: str = "left"
    # Posición horizontal del cuadro de texto flotante (wp:positionH/wp:posOffset,
    # en EMU). Permite reconstruir las columnas originales de la portada (p. ej.
    # el docente/tutor en su columna derecha). None si el elemento no es textbox.
    anchor_pos_h: Optional[str] = None
    font_name: str = "Times New Roman"
    font_size: float = 12.0
    is_bold: bool = False
    is_italic: bool = False
    is_bullet: bool = False
    is_table_cell: bool = False
    left_indent_cm: float = 0.0
    first_line_indent_cm: float = 0.0
    space_before_pt: float = 0.0
    space_after_pt: float = 0.0
    line_spacing: Optional[float] = None
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


class LogoPortada(BaseModel):
    """Un logo que la portada pide, como DATO.

    `asset` es el nombre del archivo dentro de `python/assets/`, no una URL
    escrita en el `.tsx`. La diferencia importa: hoy la insignia vivia hardcodeada
    en el componente, y elegir UNAN pedia `logo_anan.png` con doble `a` mientras
    que el backend servia `logo_unan.png`. Un 404, y ninguno de los dos lados se
    entera.

    `ancho_fraccion` es una FRACCIÓN DEL ANCHO ÚTIL DE LA HOJA, no un milímetro.
    Es lo que hace que el mismo logo se vea igual en Carta y en A4: con
    milimetros absolutos, un ancho calibrado para una hoja se ve distinto en la
    otra, y con las dos hojas elegibles eso hace que el mismo diseño salga de dos
    tamaños.

    EL DEFAULT ES EL TAMAÑO QUE TENÍA ANTES, CON LA CUENTA HECHA.
    `portada_uni.py` ponía el logo con `add_picture(..., width=Cm(5.2))`. Para
    escribirlo como fracción del ancho útil hay que dividirlo por el ancho útil
    REAL de una carta, que es `215.9 - 2 × 25.4 = 165.1 mm = 16.51 cm`
    (`APARuleSet.margins_cm` es 2.54, o sea una pulgada por lado; NO 40 mm):

        5.2 cm / 16.51 cm = 0.315

    El 0.16 del plan se calibró como si el ancho útil fuera 13.59 cm, que este
    proyecto nunca produce; con el ancho útil real ese 0.16 son 2.64 cm: la
    mitad de lo que estaba, que es exactamente lo que reportó el usuario ("el
    logo que puso es super pequeño no se ve"). El número no se cambia sin motivo
    nuevo y escrito; si cambia el ancho útil, cambia la cuenta y no el default.
    """
    asset: str
    ancho_fraccion: float = 0.315
    institucion: Optional[str] = None

    @field_validator("ancho_fraccion")
    @classmethod
    def _validar_fraccion(cls, v: float) -> float:
        """Una fracción negativa o de más de la hoja produce un ancho que
        python-docx acepta y Word no sabe dibujar. Que lo rechace el modelo, que
        es donde un dato inválido se puede decir."""
        if v <= 0 or v > 1:
            raise ValueError(
                f"ancho_fraccion debe estar entre 0 y 1 (excluidos); vino {v}"
            )
        return v

    @field_validator("asset")
    @classmethod
    def _validar_asset(cls, v: str) -> str:
        """El asset es un NOMBRE de archivo, no una ruta ni una URL.

        Sin esto, un `asset` con `../` sale de la carpeta de assets y un
        `asset` con `https://` se resuelve contra el disco y falla en silencio.
        """
        limpio = str(v).strip()
        if not limpio:
            raise ValueError("el asset no puede estar vacio")
        if "/" in limpio or "\\" in limpio or limpio.startswith("."):
            raise ValueError(
                f"el asset es un nombre de archivo dentro de python/assets/, no una ruta: {v}"
            )
        return limpio


class PortadaData(BaseModel):
    apa_format: APAFormat = APAFormat.STUDENT
    use_original_cover: bool = True  # Conservar portada original intacta del documento
    force_skip_cover: bool = False  # True = saltar todos los elementos de portada sin tocarlos

    # EL MODO DE PORTADA. Estaba ausente del modelo y el cliente lo mandaba
    # igual: pydantic descarta las claves que no declara, asi que
    # `getattr(portada, "cover_mode", None)` era SIEMPRE `None` y
    # `generator.py` caia siempre en la portada APA.
    #
    # O sea que la portada UNI --la institucional, la que dibuja
    # `portada_uni.py` con el logo y la tabla de integrantes-- no se generaba
    # NUNCA, por mucho que la app encendiera su chip. Un control que se ve y
    # no hace nada.
    #
    # Los valores son los que el backend ya leia en `generator.py`:
    # `keep_original`, `keep_design_update_data`, `generate_apa7_template`,
    # `generate_uni_cover` y `apa_pro`. Vacio significa "el que toque por
    # `use_original_cover`", que es como estaba antes.
    cover_mode: str = ""
    title: str = ""
    institution: str = ""
    course: Optional[str] = None
    date: Optional[str] = None
    running_head: Optional[str] = None
    author_note: Optional[str] = None
    departamento: Optional[str] = None  # Área de Conocimiento / Departamento (portada UNI)
    logos: list[LogoPortada] = Field(default_factory=list)
    # La portada UNI dibuja su logo por defecto. `mostrar_logo=False` construye
    # la portada SIN la fila de logos (útil cuando el autor arma la portada a
    # medida). No confundir con `logos=[]`: vacío significa "usá el logo de la
    # institución", que es justo lo contrario de suprimirlo.
    mostrar_logo: bool = True

    # QUÉ SALIÓ DE AQUÍ Y POR QUÉ.
    #
    # `author`, `grupo` e `instructor` eran los datos del acta y vivían
    # DENTRO de la portada. Con `use_original_cover: true` el bloque de portada
    # no se toca —es una promesa escrita en AGENTS.md—, así que no había de
    # dónde sacarlos y el `.docx` salía sin el autor, sin el profesor asesor y
    # sin el grupo. Eso es lo que reportó el usuario.
    #
    # Ahora viven en `DocumentMeta` (`autor`, `profesor_asesor`, `comite`,
    # `fecha_defensa`, `grupo`), que es donde un dato del documento pertenece,
    # y los escribe `portada_module.format_acta_documento`, que corre en los
    # DOS modos: con portada sintética y con la original conservada.
    #
    # Lo que se queda acá es el DISEÑO de la hoja: qué dice el título, cuál es
    # la institución, cuál la asignatura, dónde el área y qué día. Eso es
    # portada. El quién es documento.

    # IDIOMA DEL DOCUMENTO. Antes no existía como dato: `date` era texto libre y
    # el idioma se lo adivinaba Word. Eso es lo que hace que la revisión de
    # ortografía subraye palabras que están bien escritas.
    #
    # POR QUÉ VIVE EN `PortadaData` Y NO EN `DocumentMeta`, que es donde
    # conceptualmente pertenece. Porque es el único de los dos que el cliente
    # manda en cada `/generate` y `/generate-pdf`: `DocumentMeta` vive en la
    # copia de la sesión que tiene el servidor y no hay ningún endpoint que la
    # escriba desde el cliente, así que un campo ahí sería un control que se ve
    # lleno y no llega al `.docx`. El día que exista un `PATCH /api/session/meta`
    # este campo se muda, y el nombre no tiene que cambiar: lo lee
    # `aplicar_idioma_documento`, no el lugar donde está guardado.
    language: Literal[
        "es-ES", "es-MX", "es-AR", "es-CO", "es-PE", "es-CL",
        "en-US", "en-GB", "pt-BR", "fr-FR", "de-DE", "it-IT",
    ] = "es-ES"

    @field_validator("language", mode="before")
    @classmethod
    def _normalizar_language(cls, v: Any) -> Any:
        """Deja el idioma en una etiqueta que Word entiende.

        Un documento viejo no trae el campo, y un cliente puede mandar 'es' o
        'EN' en mayúsculas. Sin esto, la primera habria fallado al exportarse.
        """
        if v is None or v == "":
            return "es-ES"
        if isinstance(v, str):
            n = v.strip().replace("_", "-")
            # Un idioma a secas se resuelve al regionally-tagged más cercano que
            # tenemos: 'es' es español de España en la configuración regional de
            # este producto, y 'en' es inglés de Estados Unidos.
            corto = {"es": "es-ES", "en": "en-US", "pt": "pt-BR", "fr": "fr-FR",
                     "de": "de-DE", "it": "it-IT"}
            return corto.get(n.lower(), n)
        return v


# ── MIGRACIÓN DE LOS DATOS DEL ACTA ───────────────────────────────────────────

# Los nombres que el acta tenía DENTRO de `PortadaData` antes de mudarse a
# `DocumentMeta`. Están escritos acá y no repetidos en el código porque la
# migración tiene que ser idempotente: se puede correr dos veces sobre la misma
# sesión sin duplicar nada.
CLAVES_ACTA_EN_PORTADA: tuple[str, ...] = ("author", "grupo", "instructor")

# A qué campo de `DocumentMeta` corresponde cada una. `instructor` era texto
# libre y pasa a ser la primera entrada de la lista de profesores asesores: el
# modelo es el mismo dato con su forma correcta.
TRADUCCION_ACTA: dict[str, str] = {
    "author": "autor",
    "grupo": "grupo",
    "instructor": "profesor_asesor",
}


def migrar_acta_vieja(portada_raw: Any, meta: DocumentMeta) -> list[str]:
    """Sube de `portada` a `meta` los datos del acta de una sesión guardada.

    Sin esto, un documento que el usuario guardó cuando el autor vivía dentro
    de la portada abre y sale sin autor: pydantic ignora las claves que el
    modelo ya no declara, y un dato que desaparece sin error es la peor forma
    de migrar.

    Idempotente: si `meta` ya tiene el dato, no lo pisa, y si `portada` ya no
    trae la clave no hace nada. Devuelve los nombres de las claves que se
    migraron, para que el llamador pueda avisar.
    """
    if not isinstance(portada_raw, dict):
        return []
    migradas: list[str] = []
    for vieja in CLAVES_ACTA_EN_PORTADA:
        valor = portada_raw.get(vieja)
        if valor in (None, "", []):
            continue
        destino = TRADUCCION_ACTA[vieja]
        actual = getattr(meta, destino, None)
        if destino == "profesor_asesor":
            # La lista gana: si ya hay anotados, se agregan los que falten.
            nombres = [n.strip() for n in str(valor).replace("\n", ",").split(",") if n.strip()]
            faltan = [n for n in nombres if n not in actual]
            if faltan:
                setattr(meta, destino, list(actual) + faltan)
                migradas.append(vieja)
        elif not actual:
            setattr(meta, destino, valor)
            migradas.append(vieja)
    return migradas


class CitationModel(BaseModel):
    raw_text: str
    authors: list[str] = Field(default_factory=list)
    year: Optional[str] = None
    page: Optional[str] = None
    citation_type: CitationType = CitationType.PARENTETICA
    element_id: str = ""
    start_offset: int = 0
    end_offset: int = 0


class ApaSegment(BaseModel):
    """Un tramo de la línea de referencia con su tipografía.

    La cursiva es un hecho del dato, no del render: el backend decide qué va
    en cursiva (título de libro, nombre de revista) y cada superficie se limita
    a dibujar el segmento como venga.
    """
    text: str
    italic: bool = False


# Mapa tipo APA 7 → tipo CSL-JSON. `otro` conserva la salida histórica para no
# romper exportadores que ya contaban con `article-journal`.
_CSL_TYPE_BY_TIPO = {
    "articulo": "article-journal",
    "libro": "book",
    "capitulo": "chapter",
    "tesis": "thesis",
    "web": "webpage",
    "informe": "report",
    "otro": "article-journal",
}


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
    is_duplicate: bool = False
    duplicate_count: int = 1

    # ¿Alguien contrastó esta referencia contra una fuente? El valor por
    # defecto es `False` y ése es el punto: una tesis que ya venía con su
    # bibliografía escrita no fue verificada contra nada, aunque el texto esté
    # impecable. El panel muestra una etiqueta con esto, porque sin ella una
    # lista de referencias bien formateadas y una lista de referencias que el
    # sistema inventó se ven exactamente igual.
    #
    # Sólo lo pone en `True` un resolutor real: DOI contra CrossRef, o una
    # búsqueda que devolvió la obra. Agregarla a mano NO la verifica.
    verificada: bool = False
    # De dónde salió la verificación, si la hubo: "doi", "cruzada", "isbn".
    # Es lo que va en el detalle detrás del click, para que "verificada" no sea
    # una palabra que nadie puede auditar.
    fuente_verificacion: Optional[str] = None

    # Tipo de fuente APA 7, y la línea ya segmentada. `formatted_apa` sigue
    # existiendo como texto plano derivado (copiar, LaTeX, panel del add-in).
    # articulo | libro | capitulo | tesis | web | informe | otro
    tipo: str = "otro"
    apa_segments: list[ApaSegment] = Field(default_factory=list)

    # FASE 3.2 (evidencia: docs/evaluacion-tecnologica/EVALUACION_TECNOLOGICA.md S3)
    def to_csl_json(self) -> dict:
        """Conversión CSL-JSON estándar (interoperabilidad Zotero/Mendeley).

        El render final sigue siendo el formateador propio; esto solo
        estructura los datos. Autores "Apellido, Nombre" se separan; si no hay
        coma, se trata como autor corporativo (family completo, literal=True).
        """
        authors = []
        for a in self.authors or []:
            a_clean = (a or "").strip()
            if not a_clean:
                continue
            if "," in a_clean:
                family, _, given = a_clean.partition(",")
                authors.append({"family": family.strip(), "given": given.strip()})
            else:
                authors.append({"family": a_clean, "literal": True})
        issued = {"date-parts": [[int(self.year[:4])]]} if (self.year or "").strip()[:4].isdigit() else {"raw": self.year or "s.f."}
        csl: dict = {
            "id": self.id,
            "type": _CSL_TYPE_BY_TIPO.get(self.tipo or "otro", "article-journal"),
            "title": self.title or self.raw_text[:120],
            "author": authors,
            "issued": issued,
        }
        if self.source:
            csl["container-title"] = self.source
        if self.doi_or_url:
            csl["DOI"] = self.doi_or_url if str(self.doi_or_url).lower().startswith("10.") else None
            csl["URL"] = None if str(self.doi_or_url).lower().startswith("10.") else str(self.doi_or_url)
            csl = {k: v for k, v in csl.items() if v is not None}
        return csl

    @model_validator(mode="after")
    def _normalizar_apa(self) -> "ReferenciaModel":
        # Import diferido: evita cargar el formateador (y potenciales ciclos)
        # durante el arranque de Pydantic. Nunca pisa un `apa_segments` ya
        # presente ni un `formatted_apa` ya presente.
        from modules.apa_format import normalizar_referencia
        normalizar_referencia(self)
        return self


class ValidationIssueModel(BaseModel):
    rule_id: str
    severity: ValidationStatus = ValidationStatus.OK
    message: str
    suggestion: str = ""
