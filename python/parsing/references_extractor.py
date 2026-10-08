"""Extraccion de la seccion "Referencias" / "Bibliografia" del documento.

WordAPA7 nunca poblabA `doc.referencias` durante el parseo: las referencias
solo existian si el usuario las ingresaba a mano. Este modulo localiza la
seccion de referencias dentro de los elementos ya pre-clasificados y parsea
cada entrada en un `ReferenciaModel` (con authors/ano/titulo/fuente/doi en
calidad de "best effort"; `raw_text` siempre queda completo para edicion).
"""

from __future__ import annotations

import re
import uuid
from typing import List, Optional

from models import ElementModel, ElementType, ReferenciaModel

# Palabras que delimitan el titulo de la seccion de referencias.
# OJO: "fuentes" suelto NO esta aqui porque "Fuentes primarias"/"Fuentes
# secundarias" son secciones metodologicas, no la bibliografia.
_REFERENCES_HEADINGS = {
    "referencias",
    "referencias bibliograficas",
    "referencias bibliográficas",
    "referencia bibliografica",
    "referencia bibliográfica",
    "bibliografia",
    "bibliografía",
    "bibliografias",
    "bibliografías",
    "bibliografia consultada",
    "bibliografía consultada",
    "fuentes",
    "fuentes consultadas",
    "fuentes de informacion",
    "fuentes de información",
    "fuentes bibliograficas",
    "fuentes bibliográficas",
    "fuentes y referencias",
    "referencias y fuentes",
    "bibliografía y anexos",
    "bibliografia y anexos",
    "anexos y bibliografía",
    "anexos y bibliografia",
    "obras citadas",
    "obras consultadas",
    "literatura citada",
    "webgrafia",
    "webgrafía",
    "linkografia",
    "linkografía",
    "references",
    "references list",
    "works cited",
    "bibliographic references",
}

# Palabras que pueden aparecer en el texto del heading y aun asi contar
# (p.ej. "Referencias Bibliograficas" -> normalizamos).
_HEADING_NOISE = re.compile(r"[^a-zàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ\s]", re.IGNORECASE)

_YEAR_GROUP = re.compile(r"\((19[0-9]\d|20\d{2})\)")
_YEAR_LOOSE = re.compile(r"\b(19[0-9]\d|20\d{2})\b")
_URL_DOI = re.compile(
    r"(https?://\S+|www\.[a-z0-9\-]+(?:\.[a-z0-9\-]+)+\S*|doi:\s*\S+|10\.\d{4,9}/\S+)",
    re.IGNORECASE,
)
_RETRIEVAL_PREFIX = re.compile(
    r"(?:recuperado|obtenido|disponible|consultado|extraído|retrieved|available)\s+(?:el\s+\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4},?\s+)?(?:de|en|from|at)?\s*:?\s*$",
    re.IGNORECASE,
)
# Artefactos de exportación automática (Vancouver/IEEE) que APA 7 no usa y que
# pueden aparecer en cualquier posición, no solo al final del campo.
_ACCESSED_BRACKET = re.compile(
    r"[\[(]\s*(?:accessed|consultado|recuperado)(?:\s+[^\])]*)?[\])]", re.IGNORECASE
)
_AVAILABLE_PREFIX = re.compile(
    r"\bavailable\s*(?:from|at)?\s*:?\s*", re.IGNORECASE
)

# Prefijo de lista numerada manual al inicio de una entrada de bibliografia:
# "6. Hirano, H. (1995)..." / "10. Juran, J. M. (1999)...". El numeral NO es
# parte de la referencia APA y rompia el dedup de texto crudo (cada linea era
# "unica" por el numero, dejando 4 copias de Hirano). Se exige un espacio
# tras el punto/parentesis para no comerse titulos como "5 Pillars".
_LEADING_NUM_PREFIX = re.compile(r"^\s*\d+[.)]\s+")


def _normalize_heading(text: Optional[str]) -> str:
    if not text:
        return ""
    cleaned = _HEADING_NOISE.sub(" ", text.lower())
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    # Quitar numerales romanos (XIII., iv.) o arabigos (12.) al inicio,
    # solo si van seguidos de punto o espacio (evita romper "introducción").
    cleaned = re.sub(r"^(?:[ivxlcdm]+|\d+)(?:\s*\.)?\s+", "", cleaned)
    return cleaned.strip()


def _is_references_heading(elem: ElementModel) -> bool:
    # Aceptamos HEADING y tambien PARAGRAPH: muchos documentos traen
    # "REFERENCIAS"/"Bibliografía" como parrafo centrado en negrita que el
    # pre-clasificador no logra promover a heading.
    if elem.type not in (ElementType.HEADING, ElementType.PARAGRAPH):
        return False
    norm = _normalize_heading(elem.text)
    if not norm:
        return False
    # Un titulo de seccion es corto: evita capturar parrafos que solo
    # MENCIONEN "referencias" en una frase larga.
    if len(norm.split()) > 5:
        return False
    if norm in _REFERENCES_HEADINGS:
        return True
    # "referencias ..."
    for key in _REFERENCES_HEADINGS:
        if norm.startswith(key):
            return True
    return False


def _is_section_break_after(elem: ElementModel, refs_heading_level: int) -> bool:
    """Retorna True si este elemento marca el fin de la seccion de referencias."""
    if elem.type in (ElementType.PAGE_BREAK, ElementType.SECTION_BREAK):
        return False  # un salto de pagina no cierra la seccion necesariamente
    if elem.type == ElementType.HEADING and (elem.heading_level or 1) <= refs_heading_level:
        # Otra heading de nivel igual o superior -> nueva seccion (Anexos, etc.)
        norm = _normalize_heading(elem.text)
        # Si la heading sigue hablando de referencias, no cortar (sub-cabecera).
        for key in _REFERENCES_HEADINGS:
            if norm.startswith(key):
                return False
        return True
    return False


def _parse_single_reference(raw: str) -> dict:
    """Best-effort APA parse de una entrada individual."""
    text = re.sub(r"\s+", " ", raw or "").strip()
    if not text:
        return {}

    # DOI / URL
    doi: Optional[str] = None
    m_url = _URL_DOI.search(text)
    if m_url:
        doi = m_url.group(1).rstrip(".,;)")
        text_sin_url = (text[: m_url.start()] + text[m_url.end():]).strip(" .,;")
    else:
        text_sin_url = text

    # Anio
    year: Optional[str] = None
    m_year = _YEAR_GROUP.search(text_sin_url)
    if m_year:
        year = m_year.group(1)
        authors_chunk = text_sin_url[: m_year.start()].strip(" .,;")
        rest = text_sin_url[m_year.end():].lstrip(" .,")
    else:
        m_year = _YEAR_LOOSE.search(text_sin_url)
        if m_year:
            year = m_year.group(1)
            authors_chunk = text_sin_url[: m_year.start()].strip(" .,;")
            rest = text_sin_url[m_year.end():].lstrip(" .,")
        else:
            authors_chunk = ""
            rest = text_sin_url

    # Authors: si hay "Título." separado por punto, authors = antes del 1er punto.
    # OJO: NO cortar por ". " cuando va seguido de una inicial ("B. W.,") porque
    # destruiría coautores. Solo cortar si tras el punto viene una minúscula
    # (inicio de un título/frase) o un espacio en blanco de fin de chunk.
    if authors_chunk:
        m_dot = re.search(r"\.\s+(?=[a-záéíóúñ])", authors_chunk)
        if m_dot:
            authors_chunk = authors_chunk[: m_dot.start() + 1]
        authors_list = [a.strip() for a in re.split(r",|&|;", authors_chunk) if a.strip()]
        # Reagrupar iniciales con su autor: "Niebel, B. W., & Freivalds, A."
        # -> ['Niebel, B. W.', 'Freivalds, A.']. Un token de iniciales (letras
        # con puntos, p.ej. "B. W." o "K. H. E.") se pega al autor anterior.
        merged: List[str] = []
        for token in authors_list:
            is_initials = re.match(r"^[A-ZÁÉÍÓÚÑ](?:\.\s*[A-ZÁÉÍÓÚÑ]?\.?)*$", token)
            if merged and is_initials:
                merged[-1] = f"{merged[-1]}, {token}"
            else:
                merged.append(token)
        authors_list = merged
    else:
        authors_list = []

    # Titulo: resto hasta el primer ". "
    title = ""
    source = ""
    rest = rest.strip()
    if ". " in rest:
        title, source = rest.split(". ", 1)
        title = title.strip(" .")
        source = source.strip(" .")
    elif rest:
        title = rest.strip(" .")

    # Limpiar frases de recuperacion residuales tipo "Recuperado de:", "Retrieved from"
    if source:
        source = _RETRIEVAL_PREFIX.sub("", source).strip(" .,;")
    elif title:
        title = _RETRIEVAL_PREFIX.sub("", title).strip(" .,;")

    # Limpieza de artefactos de exportación automática en cualquier posición.
    title = _ACCESSED_BRACKET.sub(" ", title)
    source = _ACCESSED_BRACKET.sub(" ", source)
    title = _AVAILABLE_PREFIX.sub(" ", title)
    source = _AVAILABLE_PREFIX.sub(" ", source)
    title = re.sub(r"\s+", " ", title).strip(" .,;:")
    source = re.sub(r"\s+", " ", source).strip(" .,;:")

    return {
        "authors": authors_list,
        "year": year,
        "title": title,
        "source": source,
        "doi_or_url": doi,
        "raw_text": raw.strip(),
    }


def _strip_numeric_prefix(text: str) -> str:
    """Quita el prefijo de lista numerada ('6.', '10.') al inicio de la entrada.

    Se conserva el ``raw_text`` original (con prefijo) para edicion; el prefijo
    solo se elimina para construir la clave de dedup y para parsear autores
    limpios (evita que '6.' quede pegado al apellido del primer autor).
    """
    return _LEADING_NUM_PREFIX.sub("", text or "").strip()


def _first_author_surname(authors: List[str]) -> str:
    """Apellido del primer autor, normalizado a minusculas.

    'Hirano, H.' -> 'hirano'; 'Niebel, B. W.' -> 'niebel'.
    """
    if not authors:
        return ""
    first = (authors[0] or "").strip()
    surname = first.split(",")[0].strip()
    # Por si quedo un resto de prefijo numeral pegado al apellido.
    surname = _LEADING_NUM_PREFIX.sub("", surname + " ").strip()
    return surname.lower()


def _normalize_title_key(title: str) -> str:
    """Titulo normalizado a alfanumerico minuscula, primeros 40 caracteres."""
    norm = re.sub(r"[^a-z0-9]+", "", (title or "").lower())
    return norm[:40]


# Un autor real es corto y no es una URL ni una frase de recuperacion. Si el
# "autor" extraido parece el TITULO de una pagina web (p.ej. "... Scientific
# Figure on ResearchGate. Available from: http..."), la entrada NO es una
# referencia bibliografica y se descarta.
_JUNK_AUTHOR_MARKERS = re.compile(
    r"(scientific figure|available from|accessed|https?://|www\.)",
    re.IGNORECASE,
)


def is_junk_reference(raw: str, parsed: Optional[dict] = None) -> bool:
    """¿La entrada NO es una referencia bibliografica real?

    Caso raiz: una pagina de ResearchGate pegada en la bibliografia cuyo titulo
    se colaba como autor ('Business improvement strategy... Scientific Figure on
    ResearchGate. Available from: ...'). Un autor legitimo es corto y no es una
    URL ni una frase de recuperacion."""
    for a in (parsed or {}).get("authors") or []:
        a = (a or "").strip()
        if len(a) > 60:
            return True
        if _JUNK_AUTHOR_MARKERS.search(a):
            return True
    return False


def reference_looks_like_junk(raw: str) -> bool:
    """Igual que `is_junk_reference`, pero parseando el texto crudo. Lo usa el
    export in-place, que solo tiene el parrafo (no el modelo parseado)."""
    return is_junk_reference(raw, _parse_single_reference(_strip_numeric_prefix(raw)))


def _semantic_dedup_key(parsed: dict, raw_clean: str) -> str:
    """Clave de dedup semantica: apellido + anio + titulo normalizado.

    RAIZ del bug "Hirano x4": el dedup anterior usaba texto crudo (con
    prefijo numeral) — test raiz: tests/test_references_dedup.py.

    Si no se puede parsear autor/ano/titulo, se cae al texto crudo sin el
    prefijo numeral (``raw_clean``) colapsado y en minusculas.
    """
    authors = parsed.get("authors") or []
    year = parsed.get("year")
    title = parsed.get("title") or ""
    surname = _first_author_surname(authors)
    norm_title = _normalize_title_key(title)
    if surname and year and norm_title:
        return f"{surname}|{year}|{norm_title}"
    return re.sub(r"\s+", " ", raw_clean.lower()).strip()


def extract_references(elements: List[ElementModel]) -> List[ReferenciaModel]:
    """Localiza la seccion de referencias y devuelve la lista de ReferenciaModel."""
    refs: List[ReferenciaModel] = []
    if not elements:
        return refs

    start_idx = -1
    refs_heading_level = 1
    # Tomar el ULTIMO heading de referencias: el primer "Fuentes primarias"
    # puede aparecer dentro de la metodologia; la bibliografia real va al final.
    for i, e in enumerate(elements):
        if _is_references_heading(e):
            start_idx = i + 1
            refs_heading_level = e.heading_level or 1

    if start_idx < 0:
        print("[REFS] [extract_references] No se encontro heading de "
              "referencias/bibliografia en el documento")
        return refs

    # Recoger entradas hasta encontrar otra seccion top-level
    collected_texts: List[str] = []
    for e in elements[start_idx:]:
        if _is_section_break_after(e, refs_heading_level):
            break
        if e.type in (ElementType.EMPTY, ElementType.PAGE_BREAK, ElementType.SECTION_BREAK,
                      ElementType.IMAGE):
            continue
        # Bibliografia dentro de una tabla (formato comun en plantillas
        # universitarias): cada fila/celda es una entrada candidata.
        if e.type == ElementType.TABLE:
            info = getattr(e, "table_info", None)
            rows = list(getattr(info, "rows", None) or [])
            for row in rows:
                for cell in row:
                    cell_text = (cell or "").strip()
                    if cell_text and len(cell_text) >= 4:
                        collected_texts.append(cell_text)
            continue
        # Un heading nivel > refs_heading_level (sub-cabecera tipo "Libros")
        # lo tomamos como separador omitible, no como entrada.
        if e.type == ElementType.HEADING:
            continue
        text = (e.text or "").strip()
        if not text or len(text) < 4:
            continue
        collected_texts.append(text)

    # Un bloque puede traer VARIAS entradas unidas con saltos de linea (w:br).
    # Dividir antes de parsear: _parse_single_reference colapsa whitespace y
    # solo interpretaria la primera entrada, perdiendo el resto.
    # Ademas: si el titulo "Bibliografia"/"Referencias" venia pegado al primer
    # bloque (un solo parrafo con salto blando), esa linea se descarta aqui
    # para que no aparezca como parte de la primera entrada.
    entry_lines: List[str] = []
    for block in collected_texts:
        for line in block.split("\n"):
            line = line.strip()
            if not line or len(line) < 4:
                continue
            line_norm = _normalize_heading(line)
            if line_norm in _REFERENCES_HEADINGS or any(line_norm.startswith(k) for k in _REFERENCES_HEADINGS):
                continue
            entry_lines.append(line)

    # Dedup SEMANTICO: la clave es apellido + anio + titulo normalizado, no el
    # texto crudo. Antes se usaba el texto crudo (lower + whitespace), lo que
    # dejaba duplicados como '6. Hirano (1995)...' y '7. Hirano (1995)...' como
    # entradas distintas porque solo diferian en el prefijo numeral de lista.
    seen: dict[str, ReferenciaModel] = {}
    for raw in entry_lines:
        raw_clean = _strip_numeric_prefix(raw)  # para parseo/clave; raw se conserva
        parsed = _parse_single_reference(raw_clean)
        if not parsed:
            continue
        if is_junk_reference(raw_clean, parsed):
            # Pagina web cuyo titulo se colaba como autor: no es una referencia.
            continue
        key = _semantic_dedup_key(parsed, raw_clean)
        if key in seen:
            seen[key].duplicate_count += 1
            seen[key].is_duplicate = True
            continue
        ref_model = ReferenciaModel(
            id=f"ref-{uuid.uuid4().hex[:8]}",
            authors=parsed.get("authors", []),
            year=parsed.get("year"),
            title=parsed.get("title", ""),
            source=parsed.get("source", ""),
            doi_or_url=parsed.get("doi_or_url"),
            raw_text=raw.strip(),
        )
        seen[key] = ref_model
        refs.append(ref_model)

    if not refs and start_idx >= 0:
        print(f"[REFS] [extract_references] Heading encontrado en idx={start_idx - 1} "
              f"pero 0 entradas recolectadas (posible seccion vacia o formato no reconocido)")

    return refs
