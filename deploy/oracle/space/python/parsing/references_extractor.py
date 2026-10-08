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
    "bibliografia",
    "bibliografía",
    "bibliografia consultada",
    "bibliografía consultada",
    "fuentes consultadas",
    "obras citadas",
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
_URL_DOI = re.compile(r"(https?://\S+|doi:\s*\S+|10\.\d{4,9}/\S+)", re.IGNORECASE)


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
    if elem.type != ElementType.HEADING:
        return False
    norm = _normalize_heading(elem.text)
    if not norm:
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

    return {
        "authors": authors_list,
        "year": year,
        "title": title,
        "source": source,
        "doi_or_url": doi,
        "raw_text": raw.strip(),
    }


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
        return refs

    # Recoger entradas hasta encontrar otra seccion top-level
    collected_texts: List[str] = []
    for e in elements[start_idx:]:
        if _is_section_break_after(e, refs_heading_level):
            break
        if e.type in (ElementType.EMPTY, ElementType.PAGE_BREAK, ElementType.SECTION_BREAK,
                      ElementType.TABLE, ElementType.IMAGE):
            continue
        # Un heading nivel > refs_heading_level (sub-cabecera tipo "Libros")
        # lo tomamos como separador omitible, no como entrada.
        if e.type == ElementType.HEADING:
            continue
        text = (e.text or "").strip()
        if not text or len(text) < 4:
            continue
        collected_texts.append(text)

    seen = set()
    for raw in collected_texts:
        key = re.sub(r"\s+", " ", raw.lower()).strip()
        if key in seen:
            continue
        seen.add(key)
        parsed = _parse_single_reference(raw)
        if not parsed:
            continue
        refs.append(ReferenciaModel(
            id=f"ref-{uuid.uuid4().hex[:8]}",
            authors=parsed.get("authors", []),
            year=parsed.get("year"),
            title=parsed.get("title", ""),
            source=parsed.get("source", ""),
            doi_or_url=parsed.get("doi_or_url"),
            raw_text=parsed.get("raw_text", raw),
        ))

    return refs
