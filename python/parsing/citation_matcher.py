import re
import unicodedata
from difflib import SequenceMatcher
from typing import Any, Dict, List, Tuple

from models import CitationModel, CitationType, DocumentModel, ElementType

from parsing.pre_classifier import REGEX_CITATION_NARRATIVA, REGEX_CITATION_PARENTETICA
from modules.citation_engine import REGEX_ORG_ACRONIMO
from modules.phase_scope import is_references_title


def _normalize_text(text: str) -> str:
    if not text:
        return ""
    nfkd = unicodedata.normalize('NFKD', text.lower())
    return ''.join(c for c in nfkd if not unicodedata.combining(c))


# Siglas organizacionales que el texto cita solas entre paréntesis: "(OIT, 2007)".
# El pre-clasificador exige `[A-Z][a-z]+`, así que una sigla en mayúsculas se le
# escapaba y la cita quedaba invisible para el cruce con la bibliografía.
REGEX_ACRONIMO_PARENTETICA = re.compile(
    r"\(\s*([A-ZÁÉÍÓÚÑ]{2,6})\s*,\s*(\d{4}[a-z]?)"
    r"(?:\s*,\s*(?:p[p]?\.|p[aá]g\.)\s*\d+(?:[–\-]\d+)?)?\s*\)"
)

# Palabras que no aportan inicial a una sigla organizacional.
_STOPWORDS_SIGLA = {"de", "del", "la", "el", "los", "las", "y", "e", "o", "u", "&"}

# Citas encadenadas dentro de un mismo paréntesis: "(García, 2020; López,
# 2021)". El patrón base de `pre_classifier` ancla el cierre justo tras el año,
# así que la primera se perdía por el `;` y la segunda por no ir tras el `(`.
# Y una cita a media frase —"(como recomienda la metodología; Hirano, 1995)"—
# no empieza tras el `(`, así que también se escapaba.
_AUTOR_APA = (
    r"[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*"
    r"(?:\s*(?:y|&)\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)*"
    r"(?:\s+et\s+al\.?)?"
)
REGEX_CITA_ANTES_DE_PUNTO_Y_COMA = re.compile(
    r"\(\s*(" + _AUTOR_APA + r")\s*,\s*(\d{4}[a-z]?)\s*;"
)
REGEX_CITA_TRAS_PUNTO_Y_COMA = re.compile(
    r";\s*(" + _AUTOR_APA + r")\s*,\s*(\d{4}[a-z]?)"
)


def _es_acronimo(texto: str) -> bool:
    """Un texto normalizado que es una sigla: 2-6 letras, sin espacios."""
    return bool(re.fullmatch(r"[a-z]{2,6}", texto.strip()))


def _iniciales(texto: str) -> str:
    """Iniciales de las palabras significativas, normalizadas.

    "Organización Internacional del Trabajo" -> "oit" (la "del" no cuenta), que
    es exactamente la sigla con la que el texto la cita.
    """
    palabras = _normalize_text(texto).split()
    return "".join(p[0] for p in palabras if p and p not in _STOPWORDS_SIGLA)


def _acronimo_de_organizacion(cita_autor: str, ref_autor: str) -> bool:
    """La sigla y el nombre completo de la MISMA organización son el mismo autor.

    "OIT" contra "Organización Internacional del Trabajo" no matchea por texto
    —ninguno contiene al otro— y `SequenceMatcher` da un ratio bajísimo. Sin
    esto, una cita válida de una organización se reportaba como sin referencia.
    """
    a = _normalize_text(cita_autor).strip()
    b = _normalize_text(ref_autor).strip()
    if not a or not b:
        return False
    if _es_acronimo(a):
        return a == _iniciales(b) or (_es_acronimo(b) and a == b)
    if _es_acronimo(b):
        return b == _iniciales(a)
    return False

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
        if elem.type == ElementType.HEADING and is_references_title(elem.text or ""):
            break

        if elem.type not in (ElementType.PARAGRAPH, ElementType.HEADING, ElementType.BULLET, ElementType.NUMBERED_LIST, ElementType.BLOCK_QUOTE):
            continue

        text = elem.text or ""
        if not text:
            continue

        # Organización + sigla + año: "Organización Internacional del Trabajo
        # (OIT, 2007)". Va antes que la sigla suelta para no contarla dos veces.
        org_spans = []
        for match in REGEX_ORG_ACRONIMO.finditer(text):
            nombre = match.group(1).strip()
            sigla = match.group(2).strip()
            year = match.group(3)
            if nombre and year:
                citations.append(CitationModel(
                    raw_text=match.group(0),
                    authors=[nombre, sigla],
                    year=year,
                    citation_type=CitationType.NARRATIVA,
                    element_id=elem.id,
                    start_offset=match.start(),
                    end_offset=match.end()
                ))
                org_spans.append((match.start(), match.end()))

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

        # Citas encadenadas y citas a media frase dentro del paréntesis. Se
        # leen los grupos directamente: el separador (`;` o `(`) no forma parte
        # del autor, y `_extract_authors_and_year` lo dejaría pegado.
        for regex in (REGEX_CITA_ANTES_DE_PUNTO_Y_COMA, REGEX_CITA_TRAS_PUNTO_Y_COMA):
            for match in regex.finditer(text):
                authors = [
                    a.strip() for a in re.split(r'\s+(?:y|&)\s+', match.group(1))
                    if a.strip()
                ]
                if authors and match.group(2):
                    citations.append(CitationModel(
                        raw_text=match.group(0),
                        authors=authors,
                        year=match.group(2),
                        citation_type=CitationType.PARENTETICA,
                        element_id=elem.id,
                        start_offset=match.start(),
                        end_offset=match.end()
                    ))

        # Siglas parentéticas solas: "(OIT, 2007)". Se salta la que ya forma
        # parte de "Nombre completo (SIGLA, año)".
        for match in REGEX_ACRONIMO_PARENTETICA.finditer(text):
            if any(s <= match.start() and match.end() <= e for s, e in org_spans):
                continue
            citations.append(CitationModel(
                raw_text=match.group(0),
                authors=[match.group(1)],
                year=match.group(2),
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

            if not cit_authors_norm:
                continue

            # La cita matchea si CUALQUIERA de sus autores matchea CUALQUIERA
            # de los de la ficha: un trabajo de tres autores se cita a veces por
            # el segundo ("Grandjean", en Kroemer y Grandjean). Mirar solo el
            # primer apellido marcaba como fantasma una cita que sí tenía ficha.
            author_match = False
            for cita_autor in cit_authors_norm:
                for ref_autor in ref_authors_norm:
                    if not cita_autor or not ref_autor:
                        continue
                    if cita_autor in ref_autor or ref_autor in cita_autor:
                        author_match = True
                        break
                    if SequenceMatcher(None, cita_autor, ref_autor).ratio() > 0.8:
                        author_match = True
                        break
                    # La sigla y el nombre completo de la misma organización son
                    # el mismo autor ("OIT" ↔ "Organización Internacional del
                    # Trabajo").
                    if _acronimo_de_organizacion(cita_autor, ref_autor):
                        author_match = True
                        break
                if author_match:
                    break

            # El nombre citado puede ser el TEMA de la obra, que vive en el
            # título y no en la lista de autores ("Fisher" en Campbell, 2008).
            # Si el apellido aparece como palabra completa en el texto de la
            # ficha y el año coincide, la referencia existe.
            if not author_match:
                ref_text_norm = _normalize_text(ref.raw_text or ref.title or "")
                for cita_autor in cit_authors_norm:
                    if cita_autor and re.search(
                        r"(?<![a-z])" + re.escape(cita_autor) + r"(?![a-z])", ref_text_norm
                    ):
                        author_match = True
                        break

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


# Citas numericas: corchete (IEEE) y parentesis corto (Vancouver). El anio APA
# tiene cuatro digitos, asi que "(12)" no lo confunde con una cita de autor-fecha.
_CITA_IEEE_RE = re.compile(r"\[\s*\d+(?:\s*[,\-–]\s*\d+)*\s*\]")
_CITA_VANCOUVER_RE = re.compile(r"\(\s*\d{1,3}\s*\)")
_CITA_APA_ANIO_RE = re.compile(r"\((?:[^()]{0,80}?)(?:1[89]|20)\d{2}[a-z]?\)")


def detect_citation_style(doc: DocumentModel) -> Dict[str, Any]:
    """Cuenta el estilo de las citas del CUERPO y avisa si hay mezcla.

    No convierte nada: decir "el documento mezcla IEEE y APA" es determinista;
    convertir exige los metadatos de cada fuente, que es otro trabajo. Se mira
    el texto de los parrafos, no la bibliografia, porque el estilo de cita es
    una propiedad del cuerpo.
    """
    ieee = vancouver = apa = 0
    for el in getattr(doc, "elements", []) or []:
        t = getattr(el, "type", "")
        et = str(getattr(t, "value", t) or "")
        if et not in ("paragraph", "para"):
            continue
        texto = getattr(el, "text", "") or ""
        if not texto:
            continue
        ieee += len(_CITA_IEEE_RE.findall(texto))
        vancouver += len(_CITA_VANCOUVER_RE.findall(texto))
        apa += len(_CITA_APA_ANIO_RE.findall(texto))

    estilos = {"ieee": ieee, "vancouver": vancouver, "apa": apa}
    presentes = [k for k, v in estilos.items() if v > 0]
    return {"mixed": len(presentes) > 1, **estilos}
