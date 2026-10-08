import re
import unicodedata
from difflib import SequenceMatcher
from typing import Any, Dict, List, Tuple

from models import CitationModel, CitationType, DocumentModel, ElementType

from parsing.pre_classifier import REGEX_CITATION_NARRATIVA, REGEX_CITATION_PARENTETICA


def _normalize_text(text: str) -> str:
    if not text:
        return ""
    nfkd = unicodedata.normalize('NFKD', text.lower())
    return ''.join(c for c in nfkd if not unicodedata.combining(c))

def _extract_authors_and_year(match_text: str, is_narrativa: bool = False) -> Tuple[List[str], str]:
    """Extrae autores y año de una cadena regex match."""
    # Remover paréntesis
    text = match_text.replace("(", "").replace(")", "").strip()

    # Dividir por coma para sacar el año
    parts = text.split(",")
    if not parts:
        return [], ""

    author_part = parts[0].strip()
    year = ""
    for p in parts[1:]:
        p_clean = p.strip()
        if re.match(r"^\d{4}[a-z]?$", p_clean):
            year = p_clean
            break
        elif re.match(r"^.*\d{4}.*$", p_clean):
            # Fallback for things like " p. 45, 2020"
            m = re.search(r"(\d{4}[a-z]?)", p_clean)
            if m:
                year = m.group(1)
                break

    if is_narrativa:
        # En narrativa a menudo viene "Garcia et al. (2020)" -> text era "Garcia et al. (2020)"
        pass # La regex devuelve 2 grupos: (Autores) y (Año)

    # Limpiar autores (separar por "y", "&")
    author_part = author_part.replace(" et al.", "").replace(" et al", "")
    authors_raw = re.split(r'\s+(?:y|&)\s+', author_part)
    authors = [a.strip() for a in authors_raw if a.strip()]

    return authors, year

def extract_all_citations(doc: DocumentModel) -> List[CitationModel]:
    citations: List[CitationModel] = []

    for elem in doc.elements:
        if elem.type not in (ElementType.PARAGRAPH, ElementType.HEADING, ElementType.BULLET, ElementType.NUMBERED_LIST, ElementType.BLOCK_QUOTE):
            continue

        text = elem.text or ""
        if not text:
            continue

        # Parentéticas
        for match in REGEX_CITATION_PARENTETICA.finditer(text):
            raw_text = match.group(0)
            authors, year = _extract_authors_and_year(raw_text, False)
            if authors and year:
                citations.append(CitationModel(
                    raw_text=raw_text,
                    authors=authors,
                    year=year,
                    citation_type=CitationType.PARENTETICA,
                    element_id=elem.id,
                    start_offset=match.start(),
                    end_offset=match.end()
                ))

        # Narrativas
        for match in REGEX_CITATION_NARRATIVA.finditer(text):
            raw_text = match.group(0)
            authors_str = match.group(1)
            year_str = match.group(2)

            authors_raw = re.split(r'\s+(?:y|&)\s+', authors_str.replace(" et al.", "").replace(" et al", ""))
            authors = [a.strip() for a in authors_raw if a.strip()]
            year = year_str.split(",")[0].strip() if "," in year_str else year_str.strip()

            if authors and year:
                citations.append(CitationModel(
                    raw_text=raw_text,
                    authors=authors,
                    year=year,
                    citation_type=CitationType.NARRATIVA,
                    element_id=elem.id,
                    start_offset=match.start(),
                    end_offset=match.end()
                ))

    return citations

def cross_check_citations_and_references(doc: DocumentModel) -> Dict[str, Any]:
    """
    Cruza las citas extraidas del texto con las referencias.
    Retorna { ghost_citations: [...], orphan_references: [...] }
    """
    citations = extract_all_citations(doc)
    doc.citas_intext = citations

    ghost_citations = []
    orphan_references = []

    # Contador de citas por id de referencia (para ReferenciaItem.cited_count)
    ref_match_count: Dict[str, int] = {}
    ref_matched_ids = set()

    for cit in citations:
        found_match = False
        cit_authors_norm = [_normalize_text(a) for a in cit.authors]

        for ref in doc.referencias:
            if not ref.authors or not ref.year:
                # Tratar de buscar por texto libre de la referencia
                ref_text_norm = _normalize_text(ref.raw_text or ref.title or "")
                if cit_authors_norm and cit_authors_norm[0] in ref_text_norm and str(cit.year) in ref_text_norm:
                    found_match = True
                    ref_matched_ids.add(ref.id)
                    ref_match_count[ref.id] = ref_match_count.get(ref.id, 0) + 1
                    break
                continue

            ref_authors_norm = [_normalize_text(a) for a in ref.authors]

            # Fuzzy match de primer autor y año
            if not cit_authors_norm:
                continue

            first_author_cit = cit_authors_norm[0]
            first_author_ref = ref_authors_norm[0] if ref_authors_norm else ""

            # Revisar si el primer autor de la cita esta en el primer autor de la ref
            author_match = (first_author_cit in first_author_ref) or (first_author_ref in first_author_cit)
            if not author_match and first_author_cit and first_author_ref:
                ratio = SequenceMatcher(None, first_author_cit, first_author_ref).ratio()
                if ratio > 0.8:
                    author_match = True

            year_match = str(cit.year) == str(ref.year)

            if author_match and year_match:
                found_match = True
                ref_matched_ids.add(ref.id)
                ref_match_count[ref.id] = ref_match_count.get(ref.id, 0) + 1
                break

        if not found_match:
            ghost_citations.append(cit.model_dump())

    for ref in doc.referencias:
        # Actualizar contadores de citación en el modelo (P2.17).
        # Estos campos ya existen en ReferenciaItem pero nunca se calculaban.
        ref.cited_count = ref_match_count.get(ref.id, 0)
        ref.never_cited = ref.id not in ref_matched_ids
        if ref.never_cited:
            orphan_references.append(ref.model_dump())

    return {
        "ghost_citations": ghost_citations,
        "orphan_references": orphan_references
    }
