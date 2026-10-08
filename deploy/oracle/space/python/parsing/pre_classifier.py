"""
WordAPA7 — Clasificador Heuristico (Pre-Classifier)

Implementa una clasificacion en 3 pasadas:
- Pasada 1: Clasificacion inicial basada en formato visual, indentacion y patrones de texto (Regex).
- Pasada 2: Correccion jerarquica de niveles de Heading e imagenes de Portada vs Figuras.
- Pasada 3: Inferencia de jerarquia de headings por tamano de fuente relativo.

Meta: >85% de elementos clasificados sin LLM.
"""

import re
import unicodedata
from typing import List

from models import ElementModel, ElementType

from parsing.clustering_classifier import ClusteringHeadingClassifier


def _normalize_accent(text: str) -> str:
    """Elimina acentos y dieresis para comparacion insensible a tildes."""
    nfkd = unicodedata.normalize('NFKD', text)
    return ''.join(c for c in nfkd if not unicodedata.combining(c))


# ── Patrones Regex para deteccion ──────────────────────────────────────────────

# Cita parentetica: (Garcia, 2023) o (Garcia & Lopez, 2023, p. 45)
REGEX_CITATION_PARENTETICA = re.compile(
    r"\(([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s*(?:y|&)\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*"
    r"(?:\s+et\s+al\.?)?\s*,\s*\d{4}[a-z]?"
    r"(?:,\s*(?:p[p]?\.|p[aá]g\.)\s*\d+(?:[–\-]\d+)?)?)\)",
)

# Cita narrativa: Garcia (2023) o Garcia et al. (2023)
REGEX_CITATION_NARRATIVA = re.compile(
    r"\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+(?:y|&)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?"
    r"(?:\s+et\s+al\.?)?)\s+\((\d{4}[a-z]?"
    r"(?:,\s*(?:p[p]?\.|p[aá]g\.)\s*\d+(?:[–\-]\d+)?)?)\)",
)

# Heading numerado: "1.", "1.1.", "2.3.1.", "I.", "A."
REGEX_NUMBERED_HEADING = re.compile(
    r"^(?:(?:\d+\.){1,4}\d*|(?:X{0,3})(?:I[XV]|V?I{0,3})\.|[A-Z]\.)\s+\S",
)

# Bullet manual: caracteres de vineta + texto
REGEX_BULLET_CHAR = re.compile(r'^([•●▪◦○▸►→·\-\–\—\*])\s+')

# Bullet con numero o letra: "1.", "a)", "(1)", etc.
REGEX_BULLET_NUMBERED = re.compile(r'^(?:\(?\d+[\.\)]|\(?[a-z][\.\)])\s+')

# Heading 4/5 inline: texto negrita + punto + texto normal en mismo parrafo
REGEX_INLINE_HEADING = re.compile(
    r'^([A-ZÁÉÍÓÚÑ][^.]{1,80}\.)\s+([A-ZÁÉÍÓÚÑ].+)$'
)

# Caption de tabla: "Tabla 1", "Tabla 1."
REGEX_TABLE_CAPTION = re.compile(r'^(?:Tabla|Table|Cuadro)\s+\d+\.?', re.IGNORECASE)

# Caption de figura: "Figura 1", "Figura 1."
REGEX_FIGURE_CAPTION = re.compile(r'^(?:Figura|Figure|Fig\.)\s+\d+\.?', re.IGNORECASE)

# Referencia APA: "Apellido, A. (2000)." / "Apellido, A. B., & Apellido, C. (2000)."
# Soporta apellidos compuestos ("García López, H.") y organizaciones ("OIT", "(UNESCO)").
_REF_APELLIDO = r"[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ'’\-]+"
_REF_INICIALES = r"(?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ]*\.?\s*)+"
REFERENCE_PATTERN = re.compile(
    r'^' + _REF_APELLIDO + r'(?:\s+' + _REF_APELLIDO + r')*,\s*'
    + _REF_INICIALES
    + r'(?:,\s*&\s*' + _REF_APELLIDO + r'(?:\s+' + _REF_APELLIDO + r')*,\s*'
    + _REF_INICIALES + r')?'
    +     r'\s*\((?:\d{4}|n\.d\.)\)\.',
)
# Organización como autor: "Organización Internacional del Trabajo (OIT). (2007)."
REFERENCE_ORG_PATTERN = re.compile(
    r'^[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+){1,8}\s*\((?:[A-ZÁÉÍÓÚÑ]{2,}|[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\)\.\s*\(\d{4}\)\.',
)
REFERENCE_URL_PATTERN = re.compile(
    r'^(?:http|www\.|https://).{10,}\b|^[A-Z][^.]{5,}\.(?:Available from|Recuperado de|Disponible en|Tomado de)',
)
# Titulo de referencia que empieza por el nombre del trabajo (no por autor)
REFERENCE_TITLE_PATTERN = re.compile(
    r'^[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑ\s\'’\-]{8,}\b.{0,200}?(?:\(?\d{4}\)?|Available from|Recuperado de|researchgate|doi\.org|dx\.doi\.org)',
)

# Palabras clave que, cuando aparecen SOLAS o como titulo principal
# de un parrafo con formato de heading, deben clasificarse como HEADING 1
HEADING1_KEYWORDS: set[str] = {
    "introduccion", "introduccion",
    "indice", "indice",
    "conclusion", "conclusion",
    "conclusiones",
    "desarrollo",
    "antecedentes",
    "resultados",
    "objetivos",
    "objetivo general", "objetivos especificos",
    "marco teorico", "marco teorico",
    "metodologia", "metodologia",
    "metodo", "metodo",
    "recomendaciones",
    "referencias",
    "bibliografia", "bibliografia",
    "anexos", "anexo",
    "apendice", "apendice",
    "resumen",
    "abstract",
    "dedicatoria",
    "agradecimientos",
    "epigrafe", "epigrafe",
    "glosario",
    "planteamiento del problema",
    "justificacion", "justificacion",
    "hipotesis", "hipotesis",
    "alcance",
    "limitaciones",
    "capitulo I", "capitulo ii", "capitulo iii", "capitulo iv", "capitulo v",
    "capitulo vi", "capitulo vii", "capitulo viii", "capitulo ix", "capitulo x",
    "capitulo i", "capitulo ii", "capitulo iii", "capitulo iv", "capitulo v",
    "capitulo vi", "capitulo vii", "capitulo viii", "capitulo ix", "capitulo x",
    "diagnostico", "diagnostico",
    "estado del arte",
    "fundamentacion teorica",
    "base teorica", "bases teoricas",
    "analisis de resultados",
    "discusion de resultados",
    "propuesta",
    "cronograma",
    "presupuesto",
}


# ── Funciones auxiliares ───────────────────────────────────────────────────────

def _text_word_count(text: str) -> int:
    """Cuenta palabras en un texto."""
    return len(text.split())


def _is_all_caps(text: str) -> bool:
    """Verifica si un texto esta en MAYUSCULAS (permitiendo acentos)."""
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return False
    return all(c.isupper() or c in "ÁÉÍÓÚÑ" for c in letters)


def _estimate_level_by_indent(left_indent_cm: float) -> int:
    """Estima nivel de bullet/list por su indentacion."""
    if left_indent_cm >= 2.0:
        return 3
    elif left_indent_cm >= 1.2:
        return 2
    return 1


def _is_empty_or_whitespace(text: str) -> bool:
    """Verifica si el texto esta vacio o solo tiene whitespace."""
    return not text or not text.strip()


def _apply_native_heading_length_guard(elem: ElementModel, word_count: int) -> bool:
    """
    Los estilos nativos de Word ('Heading 1') se aceptaban con confianza 0.99
    sin verificar longitud. Los usuarios aplican el estilo a parrafos largos
    que NO son titulos. Guard:
      - > 30 palabras  → degradar a parrafo (con revision pendiente).
      - > 20 palabras  → mantener heading pero marcar para revision.
    Retorna True si se mantiene como heading.
    """
    if word_count > 30:
        elem.type = ElementType.PARAGRAPH
        elem.heading_level = None
        elem.confidence = 0.75
        elem.needs_review = True
        return False
    if word_count > 20:
        elem.confidence = 0.70
        elem.needs_review = True
    return True


def _flag_numbering_skips(elements: List[ElementModel]) -> None:
    """
    Valida la cadena de numeracion decimal de headings (1, 1.1, 1.1.1).
    Detecta niveles que aparecen SIN su padre (p.ej. "3.1" sin un "3." previo,
    o "1.1" sin "1." antes) y los marca para revision del usuario.
    Es una advertencia, no una correccion automatica.
    """
    seen_prefixes: set[tuple] = set()
    for elem in elements:
        if elem.type != ElementType.HEADING or not elem.text:
            continue
        txt = elem.text.strip()
        m = re.match(r'^(\d+(?:\.\d+)*)\.\s', txt)
        if not m:
            continue
        nums = tuple(int(x) for x in m.group(1).split('.'))
        parent = nums[:-1] if len(nums) > 1 else ()
        if len(nums) > 1 and parent and parent not in seen_prefixes:
            # Un heading 2+ cuyo padre no aparecio antes = salto en la cadena
            if not elem.pre_classifier_rule:
                elem.pre_classifier_rule = "numbering_skip"
            elem.needs_review = True
        seen_prefixes.add(nums)


def _flag_atypical_single_word_headings(elements: List[ElementModel]) -> None:
    """
    Marca para revisión del usuario los headings de una sola palabra que no son
    títulos académicos estándar ni números de sección. Ejemplos típicos:
    "Enunciado", "Datos", "Huevo", "Cáscara", "Filtrado" — palabras en negrita
    que la heurística clasificó como heading por formato pero que en contexto
    son etiquetas de ejercicios o pasos de proceso, no headings APA.

    La definición de "atípico" es estructural: 1 palabra, no está en el set
    de palabras académicas estándar, y no es un número de sección.
    """
    # Palabras que SIEMPRE son válidas como heading de 1 palabra
    _valid_single_word_headings = {
        "introduccion", "introducción", "objetivos", "resumen", "abstract",
        "conclusion", "conclusión", "conclusiones", "recomendaciones",
        "referencias", "bibliografia", "bibliografía", "anexos", "anexo",
        "desarrollo", "resultados", "discusion", "discusión",
        "antecedentes", "justificacion", "justificación",
        "metodologia", "metodología", "hipotesis", "hipótesis",
        "alcance", "limitaciones", "propuesta", "cronograma", "presupuesto",
        "dedicatoria", "agradecimientos", "glosario", "epigrafe", "epígrafe",
        "indice", "índice", "apendice", "apéndice",
        "diagnostico", "diagnóstico",
    }
    for elem in elements:
        if elem.type != ElementType.HEADING or not elem.text:
            continue
        txt = elem.text.strip()
        words = txt.split()
        if len(words) != 1:
            continue
        word_lower = txt.lower().rstrip(".:;,")
        # Es un número de sección? (ej: "1.", "2.3", "IV.")
        if re.match(r'^[\dIVXLCDM.]+$', word_lower):
            continue
        # Es una palabra académica estándar?
        if word_lower in _valid_single_word_headings:
            continue
        # Atípico: marcar para revisión, mantener como heading
        elem.needs_review = True
        elem.confidence = min(elem.confidence or 0.80, 0.55)
        if not elem.pre_classifier_rule:
            elem.pre_classifier_rule = "atypical_single_word"


def _demote_numbered_headings(elements: List[ElementModel]) -> None:
    """
    Degrada headings numerados (p.ej. "3. ¿Cómo afecta...") que están
    sobre-nivelados (Nivel 1 centrado) porque el usuario aplicó Heading 1
    a todas las preguntas. Si el heading tiene prefijo numérico, busca el
    heading padre más cercano y lo pone a nivel + 1 (mínimo nivel 2).
    """
    import re
    # Primera pasada: recolectar los headings previos con su nivel
    prev_headings: List[tuple[int, int]] = []  # (idx, level)
    for idx, elem in enumerate(elements):
        if elem.type != ElementType.HEADING or not elem.text or not elem.heading_level:
            continue
        txt = elem.text.strip()
        # ¿Es un heading numerado? (ej. "3.", "3)", "3.1.")
        num_match = re.match(r'^(\d+)(?:\.(?:\d+))*[.)]\s', txt)
        if num_match and elem.heading_level <= 2:
            # Buscar el heading padre más cercano
            parent_level = 0
            for pidx, plvl in prev_headings:
                if plvl > parent_level:
                    parent_level = plvl
            # Si el padre es nivel 1, este debería ser al menos nivel 2
            # Si el padre es nivel 2, este debería ser al menos nivel 3
            target = max(elem.heading_level, parent_level + 1, 2)
            if target != elem.heading_level:
                elem.heading_level = min(target, 5)
                elem.needs_review = True
                if not elem.pre_classifier_rule:
                    elem.pre_classifier_rule = "demo_numbered"
        prev_headings.append((idx, elem.heading_level))


def _extract_toc_entries(elements: List[ElementModel]) -> List[tuple]:
    """
    Extrae (texto normalizado, nivel TOC) de los elementos TOC nativos de Word.
    Las entradas del TOC son ground truth: si un heading aparece ahi, su nivel
    es confiable. Retorna lista de tuplas (texto_norm, nivel_opt).
    """
    entries: List[tuple] = []
    for e in elements:
        if e.type != ElementType.TOC or not e.text:
            continue
        txt = e.text.strip()
        if txt in ("[Tabla de Contenidos]", "[TOC Field]"):
            continue
        # Quitar el numero de pagina que Word agrega tras un tab
        m = re.search(r'\t\d+\s*$', txt)
        if m:
            txt = txt[: m.start()].strip()
        txt_norm = _normalize_accent(txt.lower()).strip()
        if not txt_norm or len(txt_norm) < 4:
            continue
        level = None
        style = (e.style_name or "").lower()
        m2 = re.search(r'\btoc\s*(\d+)\b', style)
        if m2:
            level = int(m2.group(1))
        entries.append((txt_norm, level))
    return entries


def _apply_toc_validation(elements: List[ElementModel], toc_entries: List[tuple]) -> None:
    """
    Si el documento tiene TOC nativo, los titulos que aparecen en el son
    confiables: se confirman como HEADING con su nivel y needs_review=False.
    """
    if not toc_entries:
        return
    for elem in elements:
        if not elem.text or not elem.text.strip():
            continue
        if elem.pre_classifier_rule in (
            "exclude_table_caption", "exclude_table_legal",
            "exclude_figure_caption_upper", "reference_item",
        ):
            continue
        txt_norm = _normalize_accent(elem.text.strip().lower())
        for toc_norm, toc_level in toc_entries:
            if txt_norm == toc_norm:
                match = True
            else:
                shorter, longer = (
                    (txt_norm, toc_norm)
                    if len(txt_norm) < len(toc_norm)
                    else (toc_norm, txt_norm)
                )
                match = (
                    len(shorter) >= 8
                    and len(shorter) / len(longer) >= 0.8
                    and longer.startswith(shorter)
                )
            if match:
                elem.type = ElementType.HEADING
                if toc_level and 1 <= toc_level <= 5:
                    elem.heading_level = toc_level
                elif not elem.heading_level:
                    elem.heading_level = 1
                elem.confidence = max(elem.confidence or 0, 0.97)
                elem.needs_review = False
                elem.pre_classifier_rule = "toc_validated"
                break


# ── Clasificacion principal ────────────────────────────────────────────────────

def pre_classify_elements(elements: List[ElementModel]) -> List[ElementModel]:
    """
    Ejecuta 3 pasadas de clasificacion sobre la lista de elementos del documento.

    Pasada 1: Clasificacion heuristica por formato, estilo e indentacion.
    Pasada 2: Re-numeracion secuencial de figuras/tablas y deteccion de portada.
    Pasada 3: Inferencia de jerarquia de headings por tamano de fuente relativo.
    """
    first_heading_idx: int = -1
    first_body_text_idx: int = -1

    # ── PASADA 1: Clasificacion Heuristica por Formato ──────────────────────
    for idx, elem in enumerate(elements):
        text: str = elem.text.strip() if elem.text else ""

        # CRITICO: Elementos ya detectados como imagen/tabla/portada_block mantienen su tipo
        if elem.type in (
            ElementType.IMAGE,
            ElementType.TABLE,
            ElementType.PAGE_BREAK,
            ElementType.SECTION_BREAK,
            ElementType.PORTADA_BLOCK,
            ElementType.TOC,  # TOC nativo se preserva tal cual
        ):
            elem.confidence = 1.0
            elem.needs_review = False
            continue

        # CRITICO: Ecuaciones OMML (Office Math). Si el parser detecto m:oMath,
        # el parrafo ES una ecuacion: preservar el XML intacto y no tratarlo
        # como parrafo normal (aunque tenga texto). Va ANTES del check de vacio
        # porque una ecuacion puede consistir solo en simbolos matematicos.
        if getattr(elem, 'has_math', False):
            elem.type = ElementType.EQUATION
            elem.confidence = 1.0
            elem.needs_review = False
            elem.pre_classifier_rule = "omml_equation"
            continue

        # CRITICO: Parrafo vacio — debe ir ANTES de cualquier otra deteccion
        if _is_empty_or_whitespace(text):
            elem.type = ElementType.EMPTY
            elem.confidence = 1.0
            continue

        style_name: str = (elem.style_name or "").lower()
        word_count: int = _text_word_count(text)
        is_bold: bool = elem.is_bold
        is_italic: bool = elem.is_italic
        font_size: float = elem.font_size
        alignment: str = elem.alignment
        left_indent: float = elem.left_indent_cm
        # Variables de formato (definidas temprano para que esten disponibles en toda la pasada)
        is_centered: bool = alignment == "center"
        all_bold: bool = is_bold
        all_caps: bool = _is_all_caps(text)
        has_period_end: bool = text.rstrip().endswith(".")
        has_indent: bool = left_indent >= 0.5
        is_short: bool = word_count <= 12
        is_medium: bool = word_count <= 20

        # Guard: Elementos sin texto que no son imagen ni tabla siempre son EMPTY
        if not text and not elem.image_info and not elem.table_info and elem.type not in (ElementType.IMAGE, ElementType.TABLE):
            elem.type = ElementType.EMPTY
            elem.heading_level = None
            elem.confidence = 1.0
            continue

        # --- CERTEZA 0.95: Lista con numeración OOXML nativa (ANTES que heading) ---
        if elem.bullet_source == "ooxml_list":
            if elem.type not in (ElementType.BULLET, ElementType.NUMBERED_LIST):
                has_auto_number = bool(REGEX_BULLET_NUMBERED.match(text)) or bool(REGEX_NUMBERED_HEADING.match(text))
                elem.type = ElementType.NUMBERED_LIST if has_auto_number else ElementType.BULLET
            if not elem.heading_level or elem.heading_level == 0:
                elem.heading_level = _estimate_level_by_indent(left_indent)
            elem.confidence = 0.95
            continue

        # --- CERTEZA 0.93: EXCLUSION de captions/encabezados de tablas y textos legales ---
        # "Tabla 1. Condiciones...", "Tabla Condiciones...", "Artículo 13. ...",
        # "Figura 1", "Figura8" — NO deben clasificarse como Heading aunque tengan
        # estilo Heading de Word (los usuarios abusan del estilo en anexos).
        if REGEX_TABLE_CAPTION.match(text) or REGEX_FIGURE_CAPTION.match(text):
            elem.type = ElementType.PARAGRAPH
            elem.confidence = 0.90
            elem.pre_classifier_rule = "exclude_table_caption"
            continue

        if re.match(r'^(?:tabla|cuadro|artículo|articulo|figura|fig)\b', text, re.IGNORECASE):
            elem.type = ElementType.PARAGRAPH
            elem.confidence = 0.85
            elem.pre_classifier_rule = "exclude_table_legal"
            continue

        # Texto de evaluación de riesgo / conclusiones de tablas de anexos
        if re.match(r'^(?:el riesgo es|es moderado|es alto|es bajo|el nivel de riesgo|el resultado es|se concluye que|en base a lo anterior|por lo tanto el|este peligro|este riesgo)', text, re.IGNORECASE):
            elem.type = ElementType.PARAGRAPH
            elem.confidence = 0.85
            elem.pre_classifier_rule = "exclude_table_legal"
            continue

        # Caption de figura sin espacio: "Figura8", "Tabla2"
        if re.match(r'^(?:figura|tabla)\s*\d+$', text, re.IGNORECASE):
            elem.type = ElementType.PARAGRAPH
            elem.confidence = 0.90
            elem.pre_classifier_rule = "exclude_figure_caption_upper"
            continue

        # Figuras/tablas sin estilo de caption pero en mayusculas de encabezado
        if re.match(r'^(?:FIGURA|TABLA)\s*\d*', text):
            elem.type = ElementType.PARAGRAPH
            elem.confidence = 0.80
            elem.pre_classifier_rule = "exclude_figure_caption_upper"
            continue

        # Referencias APA: "Apellido, A. (2000)." o URLs de researchgate no son headings
        if REFERENCE_PATTERN.match(text) or REFERENCE_URL_PATTERN.match(text) or REFERENCE_TITLE_PATTERN.match(text) or REFERENCE_ORG_PATTERN.match(text):
            elem.type = ElementType.PARAGRAPH
            elem.confidence = 0.92
            elem.needs_review = False
            elem.pre_classifier_rule = "reference_item"
            continue

        # --- CERTEZA 1.0: Estilo de Word explicito ---
        if "heading" in style_name or "titulo" in style_name or "título" in style_name:
            elem.type = ElementType.HEADING
            match_lvl = re.search(r'\d', style_name)
            if match_lvl:
                elem.heading_level = min(max(int(match_lvl.group(0)), 1), 5)
            else:
                elem.heading_level = 1
            elem.confidence = 0.92
            if first_heading_idx == -1:
                first_heading_idx = idx
            continue

        if "list bullet" in style_name:
            elem.type = ElementType.BULLET
            lvl_match = re.search(r'list bullet\s*(\d)', style_name)
            elem.heading_level = int(lvl_match.group(1)) if lvl_match else 1
            elem.confidence = 0.97
            continue

        if "list number" in style_name:
            elem.type = ElementType.NUMBERED_LIST
            lvl_match = re.search(r'list number\s*(\d)', style_name)
            elem.heading_level = int(lvl_match.group(1)) if lvl_match else 1
            elem.confidence = 0.97
            continue

        if "block text" in style_name or "quote" in style_name:
            elem.type = ElementType.BLOCK_QUOTE
            elem.confidence = 0.95
            continue

        # --- CERTEZA 0.95: Palabras clave como Heading 1 (introduccion, conclusion, etc.) ---
        # Si el parrafo tiene formato de heading (centrado, bold, tamano grande) y su texto
        # normalizado coincide EXACTAMENTE con una keyword de HEADING1_KEYWORDS (o es solo eso)
        text_clean = text.rstrip(".:;,").strip().lower()
        text_normalized = _normalize_accent(text_clean)
        # Tambien verificar si la palabra esta sola o es el unico contenido significativo
        is_keyword_only = text_normalized in HEADING1_KEYWORDS
        # O si comienza con la palabra clave y es corto (max 5 palabras)
        words_in_text = text_clean.split()
        first_words_normalized = _normalize_accent(" ".join(words_in_text[:3]))
        is_keyword_heading = (
            is_keyword_only
            or (len(words_in_text) <= 5 and any(
                text_normalized.startswith(kw) or text_normalized == kw
                for kw in HEADING1_KEYWORDS
            ))
        )
        if is_keyword_heading and (is_centered or all_bold or font_size >= 14):
            elem.type = ElementType.HEADING
            elem.heading_level = 1
            # Si el texto es exactamente la keyword, confianza maxima
            if is_keyword_only:
                elem.confidence = 0.97
            else:
                elem.confidence = 0.90
            elem.pre_classifier_rule = "heading1_keyword"
            if first_heading_idx == -1:
                first_heading_idx = idx
            continue

        # --- CERTEZA 0.91: Heading numerado por patron (1.1, 2.3.1, I., A.) ---
        # Excepcion: "1. Seiri", "2. Cocineras" son ITEMS de lista, no headings.
        # Si es numeracion simple (1.) con guion/2-puntos y pocas palabras, es lista.
        if REGEX_NUMBERED_HEADING.match(text) and word_count <= 20:
            _is_simple_item = (
                re.match(r'^\d+\.\s', text)
                and re.match(r'^[^.]{1,3}\.\s', text)  # solo un segmento
                and (re.search(r'[—–:]\s', text) or word_count <= 4)
            )
            if _is_simple_item:
                elem.type = ElementType.NUMBERED_LIST
                elem.heading_level = 1
                elem.confidence = 0.90
                elem.needs_review = False
                continue

            elem.type = ElementType.HEADING
            parts = text.split()
            prefix = parts[0] if parts else ""
            if prefix.endswith('.'):
                core = prefix.rstrip('.')
                if re.match(r'^(?:X{0,3})(?:I[XV]|V?I{0,3})$', core):
                    elem.heading_level = 1
                    elem.confidence = 0.78
                    elem.needs_review = True
                elif re.match(r'^[A-Z]$', core):
                    elem.heading_level = 1
                    elem.confidence = 0.80
                    elem.needs_review = True
                else:
                    segments = core.split('.')
                    elem.heading_level = min(max(len(segments), 1), 5)
                    elem.confidence = 0.91
                    # Si viene de estilo Heading de Word, marcar para revision IA
                    if "heading" in style_name:
                        elem.needs_review = True
            else:
                elem.heading_level = 1
            if first_heading_idx == -1:
                first_heading_idx = idx
            continue

        # --- CERTEZA 0.93: Bullet por caracter manual ---
        bullet_match = REGEX_BULLET_CHAR.match(text)
        if bullet_match:
            elem.type = ElementType.BULLET
            elem.original_char = bullet_match.group(1)
            elem.bullet_source = "manual_char"
            elem.heading_level = _estimate_level_by_indent(left_indent)
            elem.confidence = 0.93
            continue

        # --- CERTEZA 0.90: Numero/letra de lista manual ---
        if REGEX_BULLET_NUMBERED.match(text) and not REGEX_NUMBERED_HEADING.match(text):
            elem.type = ElementType.NUMBERED_LIST
            elem.heading_level = _estimate_level_by_indent(left_indent)
            elem.confidence = 0.88
            continue

        # --- CERTEZA 0.96: Parrafo largo (+35 palabras) ---
        if word_count > 35:
            elem.type = ElementType.PARAGRAPH
            elem.confidence = 0.96
            if first_body_text_idx == -1 and first_heading_idx != -1:
                first_body_text_idx = idx
            continue

        # --- CERTEZA 0.88: Dash al inicio -> bullet manual ---
        if text.startswith(("- ", "– ", "— ")):
            elem.type = ElementType.BULLET
            elem.bullet_source = "manual_char"
            elem.original_char = text[0]
            elem.heading_level = _estimate_level_by_indent(left_indent)
            elem.confidence = 0.88
            continue

        # --- CERTEZA variable: Heading por formato directo ---
        # Heading 1: centrado + negrita + corto + posible MAYUSCULAS
        if is_centered and all_bold and is_short and not is_italic:
            if all_caps:
                elem.type = ElementType.HEADING
                elem.heading_level = 1
                elem.confidence = 0.88
            else:
                elem.type = ElementType.HEADING
                elem.heading_level = 1
                elem.confidence = 0.80
            if first_heading_idx == -1:
                first_heading_idx = idx
            continue

        # Heading 3: izquierda + negrita + cursiva + corto
        if not is_centered and all_bold and is_italic and is_short:
            elem.type = ElementType.HEADING
            elem.heading_level = 3
            elem.confidence = 0.82
            if first_heading_idx == -1:
                first_heading_idx = idx
            continue

        # Heading 4: sangria + negrita + termina en punto (inline)
        if has_indent and all_bold and has_period_end and word_count <= 18 and not is_italic:
            elem.type = ElementType.HEADING
            elem.heading_level = 4
            elem.confidence = 0.82
            if first_heading_idx == -1:
                first_heading_idx = idx
            continue

        # Heading 5: sangria + negrita + cursiva + termina en punto (inline)
        if has_indent and all_bold and is_italic and has_period_end and word_count <= 18:
            elem.type = ElementType.HEADING
            elem.heading_level = 5
            elem.confidence = 0.84
            if first_heading_idx == -1:
                first_heading_idx = idx
            continue

        # Heading 2: izquierda + negrita + sin cursiva + corto + fuente >= 13pt
        # ponytail: font_size >= 13 gate prevents bold phrases in body text
        # from being falsely classified as Heading 2 (confidence raised from 0.74)
        if not is_centered and all_bold and not is_italic and is_short and font_size >= 13:
            elem.type = ElementType.HEADING
            elem.heading_level = 2
            elem.confidence = 0.80
            if first_heading_idx == -1:
                first_heading_idx = idx
            continue

        # Heading 4/5 inline: "Titulo del heading. El parrafo continua..." en el
        # MISMO parrafo (negrita + punto + texto normal). Patron definido pero
        # nunca activado antes. Solo si el inicio es negrita y es corto.
        inline_match = REGEX_INLINE_HEADING.match(text)
        if inline_match and is_bold and word_count <= 20 and not is_centered:
            elem.type = ElementType.HEADING
            elem.heading_level = 4
            elem.confidence = 0.80
            elem.needs_review = True
            if first_heading_idx == -1:
                first_heading_idx = idx
            continue

        # --- CERTEZA 0.85: Caption de tabla/figura ---
        if REGEX_TABLE_CAPTION.match(text):
            elem.type = ElementType.PARAGRAPH
            elem.confidence = 0.85
            continue

        if REGEX_FIGURE_CAPTION.match(text):
            elem.type = ElementType.PARAGRAPH
            elem.confidence = 0.85
            continue

        # --- CERTEZA 0.80: Bloque de cita (indentado + largo) ---
        if left_indent >= 1.0 and word_count > 25:
            elem.type = ElementType.BLOCK_QUOTE
            elem.confidence = 0.80
            continue

        # --- CERTEZA 0.80: Titulo principal (centrado, tamano grande) ---
        if is_centered and font_size >= 14:
            elem.type = ElementType.HEADING
            elem.heading_level = 1
            elem.confidence = 0.80
            if first_heading_idx == -1:
                first_heading_idx = idx
            continue

        # --- CERTEZA 0.75: Parrafo normal por defecto ---
        elem.type = ElementType.PARAGRAPH
        elem.confidence = 0.75
        if first_body_text_idx == -1 and first_heading_idx != -1:
            first_body_text_idx = idx

    # ── PASADA 2: Portada inteligente + Numeración secuencial ───────
    figure_counter: int = 0
    table_counter: int = 0

    # --- Señales múltiples para detección robusta de portada ---

    portada_boundary = None
    page1_boundary_override = None
    # El boundary por página solo es autoritativo si el documento es MULTIPÁGINA
    # Y tiene una página 1 razonable (<= 20 elementos, una portada típica).
    # Si la página 1 tiene muchos elementos (>20), probablemente el documento
    # no formatea bien los saltos de página y debemos usar otras señales.
    if elements and getattr(elements[0], "page_number", None) is not None:
        any_after_page1 = any(
            (getattr(e, "page_number", 1) or 1) > 1 for e in elements
        )
        if any_after_page1:
            page1_end = 0
            for idx, elem in enumerate(elements):
                if getattr(elem, "page_number", None) == 1:
                    page1_end = idx + 1
                else:
                    break
            if page1_end <= 20:
                portada_boundary = page1_end
            else:
                # Página 1 muy grande (>20 elementos): guardar para usar
                # como cota superior, pero buscar señales mejores dentro
                page1_boundary_override = page1_end

    # Señal A: Palabras clave de cuerpo (body_start)
    body_start_idx = -1
    for idx, elem in enumerate(elements):
        txt_norm = _normalize_accent((elem.text or "").lower())
        if any(kw in txt_norm for kw in [
            "introducc", "resumen", "abstract", "marco teorico",
            "antecedentes", "metodologia", "resultado", "discusion",
            "conclusion", "referencias", "bibliografia", "anexo",
            "planteamiento del problema", "justificacion"
        ]):
            body_start_idx = idx
            break

    # Señal B: Palabras clave explícitas de portada
    cover_kw_list = [
        "universidad", "facultad", "carrera", "elaborado por", "tutor", "carnet",
        "managua", "nicaragua", "proyecto de estudio", "area de conocimiento",
        "área de conocimiento", "presentado por", "docente",
        "monografia", "monografía", "tesis", "seminario de", "catedratico",
        "catedrático", "licenciatura", "maestria", "maestría", "doctorado",
        "trabajo de investigacion", "trabajo de investigación",
        "departamento de", "escuela de", "instituto de", "plan de estudio",
        "asignatura", "materia", "curso de", "dirigido por", "revisado por",
        "miembro del tribunal", "tribunal examinador", "carnet universitario",
        "numero de carnet", "presentada por", "presentado por", "para optar",
    ]

    has_explicit_cover_keywords = False
    cover_keyword_count = 0
    for e in elements[:40]:
        text_norm = _normalize_accent((e.text or "").lower())
        for kw in cover_kw_list:
            # Las palabras sueltas ("tutor", "materia") deben matchear como palabra
            # completa, no como subcadena ("tutoría", "material" dan falsos positivos).
            if " " in kw:
                matched = kw in text_norm
            else:
                matched = f" {kw} " in f" {text_norm} "
            if matched:
                has_explicit_cover_keywords = True
                cover_keyword_count += 1
                break

    # Señal C: Imágenes en primeros elementos (logotipos de portada)
    images_in_first_page = sum(
        1 for e in elements[:25] if e.image_info is not None
    )

    # Señal D: Bloques de texto centrado y corto en los primeros elementos (portada)
    # NOTA: Solo contar elementos que NO son headings (los headings son centrados y cortos por diseño)
    centered_short_blocks = 0
    for e in elements[:20]:
        if e.text and e.text.strip():
            words = len(e.text.split())
            is_heading_style = (e.style_name or "").lower().startswith("heading")
            if e.alignment == "center" and words <= 10 and not is_heading_style:
                centered_short_blocks += 1

    # Señal E: Densidad de palabras clave de portada en primeros 15 elementos
    strong_keyword_density = cover_keyword_count >= 3

    # Señal F: Buscar el primer heading real después de la portada
    # (cuando no hay body_start_idx por keywords, o body_start_idx está muy lejos)
    first_real_heading_after_cover = -1
    # Expandir body keywords para detectar más patrones de inicio de cuerpo
    _expanded_body_kws = [
        "introducc", "resumen", "abstract", "marco teorico",
        "antecedentes", "metodologia", "resultado", "discusion",
        "conclusion", "referencias", "bibliografia", "anexo",
        "planteamiento del problema", "justificacion",
        "recoleccion de datos", "recolección de datos",
        "presentacion del proceso", "presentación del proceso",
        "descripcion del proceso", "descripción del proceso",
        "analisis de la situacion", "análisis de la situación",
        "objetivo general", "objetivos especificos",
        "desarrollo", "diagnostico", "diagnóstico",
        "propuesta", "recomendaciones", "cronograma",
        "fundamentacion", "fundamentación",
    ]
    if body_start_idx == -1 or (body_start_idx > 25 and has_explicit_cover_keywords):
        for idx, elem in enumerate(elements):
            if idx < 5:
                continue  # saltar las primeras líneas de portada
            txt = (elem.text or "").strip()
            style = (elem.style_name or "").lower()
            txt_norm = _normalize_accent(txt.lower())
            # NO debe tener keywords de portada
            has_cover_kw = any(
                (f" {kw} " if " " in kw else f" {kw} ") in f" {txt_norm} "
                for kw in cover_kw_list
            )
            if has_cover_kw:
                continue
            # Señal 1: Heading de Word explícito
            if "heading" in style:
                first_real_heading_after_cover = idx
                break
            # Señal 2: Heading numerado con formato bold (ej. "1.Recolección", "2. Presentación")
            num_match = re.match(r'^(\d+)[.)]\s+\S', txt)
            if num_match and elem.is_bold and len(txt.split()) <= 12:
                first_real_heading_after_cover = idx
                break
            # Señal 3: Centrado + bold + corto (heading clásico)
            if elem.alignment == "center" and elem.is_bold and len(txt.split()) <= 6:
                first_real_heading_after_cover = idx
                break
            # Señal 4: Body keyword expandida
            if any(kw in txt_norm for kw in _expanded_body_kws):
                if not elem.is_bold or len(txt.split()) <= 15:
                    first_real_heading_after_cover = idx
                    break
            # Señal 5: Cambio estructural: párrafo largo left-aligned después de zona de portada
            if elem.alignment in ("left", "justify") and len(txt.split()) > 30 and idx > 8:
                first_real_heading_after_cover = idx
                break

    # Decisión combinada: portada_boundary
    if portada_boundary is None:
        if has_explicit_cover_keywords and body_start_idx != -1:
            # Si hay un heading estructural más cercano que body_start_idx, preferirlo
            if first_real_heading_after_cover != -1 and first_real_heading_after_cover < body_start_idx:
                portada_boundary = first_real_heading_after_cover
            else:
                portada_boundary = body_start_idx
        elif has_explicit_cover_keywords:
            if first_real_heading_after_cover != -1:
                portada_boundary = first_real_heading_after_cover
            else:
                # Sin heading claro, usar un limite conservador basado en
                # el numero tipico de lineas de portada (~15-20 elementos)
                # + buscar ruptura estructural (cambio de centrado a izquierda,
                # parrafo largo, etc.)
                structural_break = -1
                consecutive_left_paras = 0
                for idx, elem in enumerate(elements):
                    if idx < 8:
                        continue
                    txt = (elem.text or "").strip()
                    # Señal de ruptura: parrafo justificado o left + largo
                    if elem.alignment in ("left", "justify") and len(txt.split()) > 20:
                        structural_break = idx
                        break
                    # Señal: varios parrafos consecutivos alineados a izquierda
                    if elem.alignment == "left" and not txt.startswith(("Elaborado", "Docente", "Tutor", "Carnet", "Fecha", "Grupo", "Recinto")):
                        consecutive_left_paras += 1
                        if consecutive_left_paras >= 3:
                            structural_break = idx - 2
                            break
                    else:
                        consecutive_left_paras = 0
                if structural_break != -1:
                    portada_boundary = structural_break
                else:
                    portada_boundary = min(len(elements), 20)
        elif images_in_first_page >= 1 and centered_short_blocks >= 2:
            portada_boundary = 15
        elif centered_short_blocks >= 3:
            portada_boundary = 15
        elif strong_keyword_density:
            portada_boundary = min(len(elements), 20)
        else:
            portada_boundary = 0

    # Si el boundary por página 1 era demasiado grande (>20), recortarlo
    # usando las señales estructurales disponibles, pero nunca excederlo.
    if page1_boundary_override is not None and portada_boundary is None:
        # No se encontró boundary por otras señales. Usar el body_start_idx si existe
        if body_start_idx != -1:
            portada_boundary = min(body_start_idx, page1_boundary_override)
        elif first_real_heading_after_cover != -1:
            portada_boundary = min(first_real_heading_after_cover, page1_boundary_override)
        else:
            # Buscar ruptura estructural dentro de la página 1
            structural_break = -1
            consecutive_left = 0
            for idx, elem in enumerate(elements[:page1_boundary_override]):
                if idx < 8:
                    continue
                txt = (elem.text or "").strip()
                style = (elem.style_name or "").lower()
                # Si encontramos un heading de Word dentro de la página 1, es el límite
                if "heading" in style:
                    has_cover_kw_check = any(
                        (f" {kw} " if " " in kw else f" {kw} ") in f" {_normalize_accent(txt.lower())} "
                        for kw in cover_kw_list
                    )
                    if not has_cover_kw_check:
                        structural_break = idx
                        break
                if elem.alignment in ("left", "justify") and len(txt.split()) > 20:
                    structural_break = idx
                    break
                if elem.alignment == "left" and not txt.startswith(("Elaborado", "Docente", "Tutor", "Carnet", "Fecha", "Grupo", "Recinto")):
                    consecutive_left += 1
                    if consecutive_left >= 3:
                        structural_break = idx - 2
                        break
                else:
                    consecutive_left = 0
            if structural_break != -1:
                portada_boundary = structural_break
            else:
                portada_boundary = min(page1_boundary_override, 20)

    for idx, elem in enumerate(elements):
        if idx < portada_boundary:
            elem.is_cover_section = True
            # Convertir tanto párrafos como headings a portada_block dentro
            # de la portada (evita que "Docente:", "Grupo:", fecha y lugar
            # queden como encabezados del cuerpo).
            if elem.type in (ElementType.PARAGRAPH, ElementType.HEADING):
                elem.type = ElementType.PORTADA_BLOCK
                elem.confidence = 0.95
                if elem.heading_level is None:
                    elem.heading_level = 1
            if elem.image_info:
                elem.image_info.figure_number = 0
        else:
            elem.is_cover_section = False
            if elem.type == ElementType.IMAGE and elem.image_info:
                figure_counter += 1
                elem.image_info.figure_number = figure_counter

                # Buscar caption arriba (idx-1) o abajo (idx+1)
                for offset in [-1, 1, -2, 2]:
                    neighbor_idx = idx + offset
                    if 0 <= neighbor_idx < len(elements):
                        neighbor = elements[neighbor_idx]
                        if neighbor.text and REGEX_FIGURE_CAPTION.match(neighbor.text):
                            # Extraer número de figura del caption
                            caption_num_match = re.search(r'\d+', neighbor.text)
                            if caption_num_match and int(caption_num_match.group()) == figure_counter:
                                elem.image_info.caption = neighbor.text
                                neighbor.type = ElementType.EMPTY  # Consumido como caption
                                break

            elif elem.type == ElementType.TABLE and elem.table_info:
                table_counter += 1
                elem.table_info.table_number = table_counter

    # ── PASADA 3: Scoring Multi-Criterio e Inferencia de Jerarquía ─────────────
    # Calcular mediana de tamaño de fuente
    body_sizes = [e.font_size for e in elements if e.font_size and e.font_size > 0 and not e.is_cover_section]
    median_size = sorted(body_sizes)[len(body_sizes) // 2] if body_sizes else 12.0

    highest_level_seen = 0

    for elem_idx, elem in enumerate(elements):
        if elem.is_cover_section or elem.type == ElementType.PORTADA_BLOCK:
            elem.heading_level = None
            elem.needs_review = False
            continue

        style_lower = (elem.style_name or "").lower()
        txt = (elem.text or "").strip()
        words = txt.split()

        if not txt and not elem.image_info and not elem.table_info and elem.type not in (
            ElementType.IMAGE,
            ElementType.TABLE,
            ElementType.SECTION_BREAK,
            ElementType.PAGE_BREAK,
            ElementType.TOC,
            ElementType.EQUATION,
        ):
            elem.type = ElementType.EMPTY
            elem.heading_level = None
            elem.needs_review = False
            continue

        # 0.5. EXCLUSIONES de Pasada 1 tienen prioridad TOTAL sobre el estilo de Word.
        # Captions de figura/tabla, textos legales, referencias APA y listas numeradas
        # NO deben ser headings aunque el usuario haya usado estilo "Heading 1".
        if elem.pre_classifier_rule in (
            "exclude_table_caption", "exclude_table_legal",
            "exclude_figure_caption_upper", "reference_item",
        ):
            elem.needs_review = elem.confidence < 0.85
            if elem.type == ElementType.HEADING:
                elem.type = ElementType.PARAGRAPH
                elem.confidence = max(elem.confidence, 0.85)
            continue

        # 1. Caso A: Estilos Nativos de Word (Confianza Máxima 0.99)
        # Guard de longitud: los usuarios abusan del estilo Heading en párrafos
        # largos que no son títulos → degradar o marcar revisión.
        if "heading 1" in style_lower or "título 1" in style_lower or "titulo 1" in style_lower:
            elem.type = ElementType.HEADING
            elem.heading_level = 1
            elem.confidence = 0.99
            elem.needs_review = False
            if _apply_native_heading_length_guard(elem, len(words)):
                highest_level_seen = max(highest_level_seen, 1)
            continue
        elif "heading 2" in style_lower or "título 2" in style_lower or "titulo 2" in style_lower:
            elem.type = ElementType.HEADING
            elem.heading_level = 2
            elem.confidence = 0.99
            elem.needs_review = False
            if _apply_native_heading_length_guard(elem, len(words)):
                highest_level_seen = max(highest_level_seen, 2)
            continue
        elif "heading 3" in style_lower or "título 3" in style_lower or "titulo 3" in style_lower:
            elem.type = ElementType.HEADING
            elem.heading_level = 3
            elem.confidence = 0.99
            elem.needs_review = False
            if _apply_native_heading_length_guard(elem, len(words)):
                highest_level_seen = max(highest_level_seen, 3)
            continue
        elif "heading 4" in style_lower or "título 4" in style_lower:
            elem.type = ElementType.HEADING
            elem.heading_level = 4
            elem.confidence = 0.99
            elem.needs_review = False
            if _apply_native_heading_length_guard(elem, len(words)):
                highest_level_seen = max(highest_level_seen, 4)
            continue
        elif "heading 5" in style_lower or "título 5" in style_lower:
            elem.type = ElementType.HEADING
            elem.heading_level = 5
            elem.confidence = 0.99
            elem.needs_review = False
            if _apply_native_heading_length_guard(elem, len(words)):
                highest_level_seen = max(highest_level_seen, 5)
            continue

        # Preservar elementos clasificados con alta confianza en Pasada 1 (bullets, tablas, etc.)
        if elem.confidence >= 0.85 and elem.type not in (ElementType.PARAGRAPH, ElementType.HEADING):
            elem.needs_review = False
            continue

        # Skip non-textual or special elements
        if elem.type in (ElementType.EMPTY, ElementType.IMAGE, ElementType.TABLE, ElementType.PAGE_BREAK, ElementType.SECTION_BREAK, ElementType.TOC, ElementType.EQUATION):
            elem.needs_review = False
            continue

        # 1.5. EXCLUSION de referencias bibliograficas APA
        # Patron "Autor, A. (2000)." o "Autor, A. B., & Autor, C. (2000)." o URLs de researchgate
        if REFERENCE_PATTERN.match(txt) or REFERENCE_URL_PATTERN.match(txt) or REFERENCE_TITLE_PATTERN.match(txt) or REFERENCE_ORG_PATTERN.match(txt):
            elem.type = ElementType.PARAGRAPH
            elem.confidence = 0.92
            elem.needs_review = False
            elem.pre_classifier_rule = "reference_item"
            continue

        # 2. Caso B: Algoritmo de Scoring Heurístico Multi-Criterio
        score = 0.0

        if elem.is_bold:
            score += 0.4
        if len(words) < 12:
            score += 0.2
        if txt and not txt.endswith("."):
            score += 0.1
        if elem.font_size > median_size:
            score += 0.2
        if elem.alignment == "center":
            score += 0.15
        # Penalizar solo si hay MULTIPLES ORACIONES reales (punto + espacio +
        # mayuscula). Las abreviaturas tipo "S.C.E.M." tienen varios puntos
        # pero NO son multiples oraciones — antes esto degradaba titulos con
        # acronimos (p.ej. "Aplicación del Método S.C.E.M.").
        multi_sentence = bool(re.search(r'\.\s+[A-ZÁÉÍÓÚÑ]', txt)) if txt else False
        if len(words) > 25 or multi_sentence:
            score -= 0.5

        # Salto de fuente relativo al PÁRRAFO SIGUIENTE: si este párrafo corto
        # es >= 2pt más grande que el que le sigue, es candidato a heading
        # (los títulos suelen ir seguidos de texto de cuerpo más pequeño).
        if len(words) < 20 and (elem_idx + 1) < len(elements):
            next_font = getattr(elements[elem_idx + 1], "font_size", None)
            if next_font and elem.font_size and (elem.font_size - next_font) >= 2:
                score += 0.15

        # Decisiones por Umbral de Score
        # Heuristically-detected headings always need review so the user
        # can confirm or correct; only native Word styles skip the review gate.
        if score >= 0.7:
            elem.type = ElementType.HEADING
            elem.confidence = min(0.95, 0.70 + (score * 0.25))
            elem.needs_review = True
        elif 0.4 <= score < 0.7:
            elem.type = ElementType.HEADING
            elem.confidence = 0.65
            elem.needs_review = True
        else:
            if elem.type == ElementType.HEADING and not elem.style_name:
                elem.type = ElementType.PARAGRAPH
                elem.confidence = 0.75
                elem.needs_review = True
            else:
                elem.needs_review = elem.confidence < 0.80

        # Inferencia de Jerarquía Incremental
        if elem.type == ElementType.HEADING:
            if re.match(r'^\d+\.\d+\.\d+\s', txt):
                target_lvl = 3
            elif re.match(r'^\d+\.\d+\s', txt):
                target_lvl = 2
            elif re.match(r'^\d+\.\s', txt):
                target_lvl = 1
            elif re.match(r'^(?:X{0,3})(?:I[XV]|V?I{1,3})\.\s', txt):
                target_lvl = 1
                if elem.confidence > 0.80:
                    elem.confidence = 0.78
                    elem.needs_review = True
            elif elem.alignment == "center" or elem.font_size > median_size:
                target_lvl = 1
            elif elem.is_bold and elem.is_italic:
                target_lvl = 3
            else:
                target_lvl = 2

            # Garantizar desarrollo incremental de la jerarquía (no saltar a H3 si no hay H1/H2)
            if target_lvl > highest_level_seen + 1:
                target_lvl = min(target_lvl, highest_level_seen + 1 if highest_level_seen > 0 else 1)

            elem.heading_level = target_lvl
            highest_level_seen = max(highest_level_seen, target_lvl)

    # ── PASADA 4: Clustering Global (Huella de Estilo) ─────────────────────────
    # Agrupa los elementos según su huella visual y les asigna nivel,
    # sobreescribiendo inferencias débiles anteriores.
    classifier = ClusteringHeadingClassifier()
    elements = classifier.classify(elements)

    # ── PASADA 4a: Guard — headings de 1 palabra atípica → needs_review ────────
    # Los headings de una sola palabra que no son títulos académicos estándar
    # (Introducción, Anexos, etc.) ni números de sección se marcan para revisión
    # del usuario. Cubre casos como "Enunciado", "Huevo", "Datos" que la heurística
    # clasificó como heading por formato (bold + corto + sin punto final) pero que
    # en contexto son etiquetas de ejercicios o pasos de proceso.
    _flag_atypical_single_word_headings(elements)

    # ── PASADA 5: Validación con Tabla de Contenidos nativa ───────────────────
    # Si el documento tiene TOC de Word, sus entradas son ground truth:
    # confirmar esos títulos con su nivel y quitar la marca de revisión.
    toc_entries = _extract_toc_entries(elements)
    _apply_toc_validation(elements, toc_entries)

    # ── PASADA 6: Validación de cadena de numeración ──────────────────────────
    # Marcar para revisión los headings numerados que saltan niveles o
    # aparecen sin su padre (p.ej. "3.1" sin un "3." previo).
    _flag_numbering_skips(elements)

    # ── PASADA 6a: Demotion de headings numerados sobre-nivelados ──────────────
    # Los headings con prefijo numérico (ej. "3. ¿Cómo afecta...") que están
    # mal clasificados como Nivel 1 (centrados) deben degradarse al nivel del
    # heading padre + 1 (normalmente Nivel 2 o 3, alineados a la izquierda).
    # Esto es común en exámenes/trabajos donde cada pregunta usa Heading 1.
    _demote_numbered_headings(elements)

    # ── PASADA 7: Safety net — todo heading sin nivel asignado → nivel 1 ──────
    for elem in elements:
        if elem.type == ElementType.HEADING and elem.heading_level is None:
            elem.heading_level = 1
            elem.needs_review = True

    return elements
