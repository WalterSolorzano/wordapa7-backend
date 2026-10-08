"""
WordAPA7 — Motor de Citas APA 7

Detecta y clasifica citas dentro del texto (Parenteticas, Narrativas, Secundarias,
Multiples, et al., con pagina), evitando falsos positivos en parentesis comunes
como "(vease Figura 1)" o "(100 kg)".
"""

import re
import unicodedata
from typing import List

from models import CitationModel, CitationType

# ── Terminos excluidos para evitar falsos positivos ────────────────────────────

EXCLUDED_PAREN_TERMS: set[str] = {
    "vease", "vease", "ver", "figura", "tabla", "cuadro", "anexo",
    "apendice", "apendice", "kg", "cm", "mm", "gr", "m", "km",
    "usd", "eur", "ejemplo", "e.g.", "i.e.", "cf.", "vid.",
    "fig.", "tab.", "n.", "ed.", "eds.", "vol.",
    "cap.", "seccion", "seccion", "inciso", "articulo", "articulo",
}


# ── Patrones Regex ─────────────────────────────────────────────────────────────

# Cita secundaria: (Garcia, 2020, como se cito en Perez, 2023)
# Detecta y asigna correctamente primary/secondary
REGEX_SECUNDARIA = re.compile(
    r"\(\s*"
    r"([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+(?:y|&)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?(?:\s+et\s+al\.?)?)"
    r"\s*,\s*(\d{4}[a-z]?)"
    r"\s*,\s*(?:como\s+se\s+cit[oó]\s+en|as\s+cited\s+in)\s+"
    r"([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+(?:y|&)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?(?:\s+et\s+al\.?)?)"
    r"\s*,\s*(\d{4}[a-z]?)"
    r"\s*\)",
    re.IGNORECASE,
)

# Cita parentetica: (Garcia, 2023), (Garcia & Lopez, 2023, p. 45), (Garcia et al., 2023),
# acronimo organizacional (OIT, 2007), apellido compuesto (Gutiérrez Pulido, 2012)
REGEX_PARENTETICA = re.compile(
    r"\(\s*"
    r"((?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+|[A-ZÁÉÍÓÚÑ]{2,6})"          # Primer autor (nombre o acronimo)
    r"(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*"                        # Apellido compuesto: "Gutiérrez Pulido"
    r"(?:\s*(?:y|&)\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*"             # Autores adicionales con & o y
    r"(?:,\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*(?:\s*(?:y|&)\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)*"  # Mas autores
    r"(?:\s+et\s+al\.?)?"                                     # et al opcional
    r")"
    r"\s*,\s*(\d{4}[a-z]?)"                                    # Ano
    r"(?:\s*,\s*(?:p[p]?\.|p[aá]g\.)\s*(\d+(?:[–\-]\d+)?))?"  # Pagina opcional
    r"\s*\)",
)

# Cita narrativa: Garcia (2023), Garcia y Lopez (2023, p. 12), Garcia et al. (2023),
# apellido compuesto con iniciales "Skaf Rehihil, T. (2025)", acronimo organizacional
# "OIT (2007)" y organizacion "Ministerio de Salud (2021)".
REGEX_NARRATIVA = re.compile(
    r"\b"
    r"("
    # 1. Apellido(s) + coma + iniciales: "Skaf Rehihil, T." / "García, A."
    r"[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*"
    r"\s*,\s*[A-ZÁÉÍÓÚÑ](?:[a-záéíóúñ]*\.?)?(?:\s*[A-ZÁÉÍÓÚÑ](?:[a-záéíóúñ]*\.?)?)*"
    r"|"
    # 2. Organizacion de varias palabras con conectores: "Ministerio de Salud",
    #    "Organización Internacional del Trabajo", "García y López"
    r"[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+|\s+(?:de|del|la|el|los|las|y|e|&)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*"
    r"|"
    # 3. Acronimo organizacional: OIT, UNESCO, OMS
    r"[A-ZÁÉÍÓÚÑ]{2,6}"
    r")"
    r"(?:\s+et\s+al\.?)?"
    r"\s*"
    r"\((\d{4}[a-z]?)"
    r"(?:,\s*(?:p[p]?\.|p[aá]g\.)\s*(\d+(?:[–\-]\d+)?))?"
    r"\)",
)

# Cita organizacional con acronimo en el parentesis: "Organización Internacional
# del Trabajo (OIT, 2007)" -> autor = nombre completo, year en el parentesis.
REGEX_ORG_ACRONIMO = re.compile(
    r"\b"
    r"([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+|\s+(?:de|del|la|el|los|las|y|e|&)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)"
    r"\s*\(([A-ZÁÉÍÓÚÑ]{2,6})\s*,\s*(\d{4}[a-z]?)\)",
)

# Cita multiple: (Garcia, 2023; Lopez, 2021; Martinez, 2019)
REGEX_MULTIPLE = re.compile(
    r"\(\s*"
    r"([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+(?:y|&)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?"
    r"(?:\s+et\s+al\.?)?\s*,\s*\d{4}[a-z]?)"
    r"(\s*;\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+(?:y|&)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?"
    r"(?:\s+et\s+al\.?)?\s*,\s*\d{4}[a-z]?)+"
    r"\s*\)",
)


# ── Funciones de extraccion ────────────────────────────────────────────────────

def _is_excluded_parenthetical(match_text: str) -> bool:
    """Verifica si un parentesis capturado es un falso positivo."""
    text_lower = match_text.lower()
    # Si hay un año (4 dígitos), es una cita real: NO descartar por "p."/"pp."
    # de página (p. 45). Ese caso se excluye solo cuando no hay año.
    has_year = re.search(r"\(?\s*\d{4}[a-z]?\s*[,\)]", text_lower) is not None
    # Verificar terminos excluidos
    for term in EXCLUDED_PAREN_TERMS:
        if term in text_lower:
            return True
    # "p." / "pp." sin año → falso positivo (p. ej. "(ver p. 12)")
    if not has_year and re.search(r"(?:^|[\s(])(?:p[p]?|p[aá]g)\.?\s*\d", text_lower):
        return True
    # Verificar si es una referencia a figura/tabla (e.g., "(vease Figura 1)")
    if re.search(r"(?:figura|tabla|cuadro|anexo)\s+\d+", text_lower):
        return True
    # Verificar si son solo numeros/medidas (e.g., "(100 kg)", "(p < .05)")
    if re.match(r'^\([\d\.\s<>=*/+\-%,]+\s*(?:kg|cm|mm|gr|m|km|usd|eur)?\)$', match_text.strip()):
        return True
    return False


def normalize_surname_key(author: str) -> str:
    """
    Normaliza un apellido para comparaciones (insensible a acentos y mayúsculas).
    Maneja apellidos compuestos en formato "Apellido1 Apellido2, Nombre":
    toma todo lo que hay antes de la primera coma (pueden ser varias palabras),
    lo pasa a minúsculas y elimina tildes. Así "GARCÍA LÓPEZ, A." -> "garcia lopez".
    """
    if not author:
        return ""
    surname = author.split(",")[0].strip().lower()
    nfkd = unicodedata.normalize("NFKD", surname)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).strip()


def _parse_authors_from_match(author_text: str) -> List[str]:
    """
    Extrae autores individuales de un match de autor.
    Soporta: "Garcia", "Garcia y Lopez", "Garcia & Lopez", "Garcia et al."
    Descarta iniciales sueltas (p. ej. "M." en "García, M.") para no
    crear autores espurios con apellidos compuestos.
    """
    authors: List[str] = []
    # Quitar introductores comunes que el regex puede capturar ("Según", "Como", etc.)
    author_text = re.sub(r'^(?:seg[uú]n|como|tal|entre|durante|mediante)\s+', '', author_text, flags=re.IGNORECASE).strip()
    # Limpiar et al.
    clean = re.sub(r'\s+et\s+al\.?', '', author_text, flags=re.IGNORECASE)
    # Dividir por & o y (requiere espacios alrededor: "Garcia y Lopez",
    # pero NO parte "Godfrey" en "Godfre y")
    parts = re.split(r'\s+(?:y|&)\s+', clean)
    for part in parts:
        part = part.strip().rstrip(",")
        if not part:
            continue
        if part[0].isupper() and not re.match(r'^[A-ZÁÉÍÓÚÑ]\.?$', part):
            authors.append(part)
    return authors if authors else [author_text.strip()]


def extract_citations_from_text(text: str, element_id: str) -> List[CitationModel]:
    """
    Escanea un texto y devuelve todas las citas APA 7 detectadas con su posicion y tipo.

    Soporta:
    - Parenteticas: (Garcia, 2023), (Garcia & Lopez, 2023, p. 45)
    - Narrativas: Garcia (2023), Garcia et al. (2023)
    - Secundarias: (Garcia, 2020, como se cito en Perez, 2023)
    - Multiples: (Garcia, 2023; Lopez, 2021)
    - et al: (Garcia et al., 2023)
    - Con pagina: (Garcia, 2023, p. 45) o (Garcia, 2023, pag. 45)
    """
    citations: List[CitationModel] = []
    processed_ranges: List[tuple[int, int]] = []

    def _is_overlapping(start: int, end: int) -> bool:
        for ps, pe in processed_ranges:
            if start < pe and end > ps:
                return True
        return False

    # 1. Citas Secundarias (patron mas especifico primero)
    for match in REGEX_SECUNDARIA.finditer(text):
        start, end = match.start(), match.end()
        if _is_overlapping(start, end):
            continue
        processed_ranges.append((start, end))

        raw_match = match.group(0)
        primary_author = match.group(1).strip()
        primary_year = match.group(2)
        secondary_author = match.group(3).strip()
        secondary_year = match.group(4)

        citations.append(CitationModel(
            raw_text=raw_match,
            authors=[secondary_author],  # Solo la fuente secundaria va a la bibliografia
            year=secondary_year,
            citation_type=CitationType.SECUNDARIA,
            element_id=element_id,
            start_offset=start,
            end_offset=end,
        ))

    # 2. Citas Parenteticas Estandar
    for match in REGEX_PARENTETICA.finditer(text):
        start, end = match.start(), match.end()
        if _is_overlapping(start, end):
            continue

        raw_match = match.group(0)

        # Saltar falsos positivos
        if _is_excluded_parenthetical(raw_match):
            continue
        if "como se cito en" in raw_match.lower() or "as cited in" in raw_match.lower():
            continue

        processed_ranges.append((start, end))

        author_text = match.group(1).strip()
        year = match.group(2)
        page = match.group(3) if match.lastindex and match.lastindex >= 3 else None

        # Determinar tipo de cita
        if "et al." in raw_match.lower() or "et al" in raw_match.lower():
            c_type = CitationType.ET_AL
        else:
            c_type = CitationType.PARENTETICA

        citations.append(CitationModel(
            raw_text=raw_match,
            authors=_parse_authors_from_match(author_text),
            year=year,
            page=page,
            citation_type=c_type,
            element_id=element_id,
            start_offset=start,
            end_offset=end,
        ))

    # 3. Citas Narrativas
    for match in REGEX_NARRATIVA.finditer(text):
        start, end = match.start(), match.end()
        if _is_overlapping(start, end):
            continue

        raw_match = match.group(0)
        processed_ranges.append((start, end))

        author_text = match.group(1).strip()
        year = match.group(2)
        page = match.group(3) if match.lastindex and match.lastindex >= 3 else None

        c_type = CitationType.NARRATIVA
        if "et al." in author_text.lower() or "et al" in author_text.lower():
            c_type = CitationType.ET_AL

        citations.append(CitationModel(
            raw_text=raw_match,
            authors=_parse_authors_from_match(author_text),
            year=year,
            page=page,
            citation_type=c_type,
            element_id=element_id,
            start_offset=start,
            end_offset=end,
        ))

    # 4. Cita organizacional con acronimo: "Organización Internacional del Trabajo (OIT, 2007)"
    for match in REGEX_ORG_ACRONIMO.finditer(text):
        start, end = match.start(), match.end()
        if _is_overlapping(start, end):
            continue

        raw_match = match.group(0)
        processed_ranges.append((start, end))

        org_name = match.group(1).strip()
        acronym = match.group(2)
        year = match.group(3)

        citations.append(CitationModel(
            raw_text=raw_match,
            authors=[org_name],
            year=year,
            citation_type=CitationType.NARRATIVA,
            element_id=element_id,
            start_offset=start,
            end_offset=end,
        ))

    # 5. Citas multiples: (Garcia, 2023; Lopez, 2021; Martinez, 2019)
    for match in REGEX_MULTIPLE.finditer(text):
        start, end = match.start(), match.end()
        if _is_overlapping(start, end):
            continue
        raw_match = match.group(0)
        processed_ranges.append((start, end))
        # Cada sub-cita "Autor, año" se agrega como cita parentetica separada
        inner = raw_match[1:-1].strip()
        for chunk in inner.split(';'):
            chunk = chunk.strip()
            m_seg = re.match(
                r"^([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s*(?:y|&)\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?(?:\s+et\s+al\.?)?)\s*,\s*(\d{4}[a-z]?)$",
                chunk,
            )
            if m_seg:
                seg_authors = m_seg.group(1).strip()
                seg_year = m_seg.group(2)
                c_type = CitationType.ET_AL if ('et al' in seg_authors.lower()) else CitationType.PARENTETICA
                citations.append(CitationModel(
                    raw_text=chunk,
                    authors=_parse_authors_from_match(seg_authors),
                    year=seg_year,
                    citation_type=c_type,
                    element_id=element_id,
                    start_offset=start,
                    end_offset=end,
                ))

    return citations
