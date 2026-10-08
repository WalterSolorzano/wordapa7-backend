"""
WordAPA7 - Graph RAG (Retrieval-Augmented Generation) for Citations
Builds a networkx graph of Authors -> Years -> Works to validate citations
precisely and avoid LLM hallucination.
"""

import re
import unicodedata
from typing import Dict, List

import networkx as nx


_STOPWORDS_SIGLA = {"de", "del", "la", "el", "los", "las", "y", "e", "o", "u", "&"}


def _normaliza(texto: str) -> str:
    if not texto:
        return ""
    nfkd = unicodedata.normalize('NFKD', texto.lower())
    return ''.join(c for c in nfkd if not unicodedata.combining(c))


def _iniciales(texto: str) -> str:
    """Iniciales de las palabras significativas: 'Organización Internacional del
    Trabajo' -> 'oit', que es la sigla con la que el texto la cita."""
    palabras = _normaliza(texto).split()
    return "".join(p[0] for p in palabras if p and p not in _STOPWORDS_SIGLA)


def _surnames_de_autores(author_part: str) -> List[str]:
    """Todos los apellidos de una lista de autores APA.

    "Kroemer, K. H. E., & Grandjean, E." -> ["Kroemer", "Grandjean"].
    Las iniciales ("K. H. E.") se quitan ANTES de partir por comas: su punto
    partía el nombre y dejaba apellidos falsos. Un apellido compuesto
    ("Gutiérrez Pulido") o una organización sin comas quedan enteros.
    """
    sin_iniciales = re.sub(r'\b[A-ZÁÉÍÓÚÑ]\.(?:\s*[A-ZÁÉÍÓÚÑ]\.)*', ' ', author_part)
    crudos = re.split(r'\s*(?:&|,|\by\b)\s*', sin_iniciales)
    surnames: List[str] = []
    for c in crudos:
        c = c.strip().strip('.').strip()
        if not c:
            continue
        if _normaliza(c) in _STOPWORDS_SIGLA:
            continue
        surnames.append(c)
    return surnames


def build_citation_graph(references: List[str]) -> nx.DiGraph:
    """
    Builds a directed graph representing the bibliographic knowledge base.
    Nodes: Author, Year, Work
    Edges: Author -> Year, Year -> Work
    """
    G = nx.DiGraph()

    # Very simplified APA reference parser for Graph Construction
    # E.g. "Smith, J. (2019). The book of things. Publisher."
    year_pattern = re.compile(r'\((20\d{2}|19\d{2})\)')

    for ref in references:
        ref_clean = ref.strip()
        if not ref_clean:
            continue

        # Try to extract year
        year_match = year_pattern.search(ref_clean)
        year = year_match.group(1) if year_match else "Unknown"

        # Everything before the year is roughly the author(s)
        if year_match:
            author_part = ref_clean[:year_match.start()].strip()
            # Una sigla entre paréntesis pegada al nombre ("Organización
            # Internacional del Trabajo (OIT). (2007). ...") se descarta: su
            # coma interior partía el nombre en dos y dejaba un autor falso.
            author_part = re.sub(r'\s*\([^)]*\)\s*$', '', author_part).strip()
            # TODOS los apellidos, no solo el primero: un trabajo de tres
            # autores se cita a veces por el segundo, y con un solo nodo esa
            # cita se reportaba como sin referencia.
            surnames = _surnames_de_autores(author_part)
            # The rest is work title (after year)
            work = ref_clean[year_match.end():].strip('. ')
        else:
            surnames = _surnames_de_autores(ref_clean)
            work = ref_clean

        if not surnames:
            surnames = ["Unknown"]

        work_node = f"WORK:{work[:30]}..."
        G.add_node(work_node, type="work", original=ref_clean)

        for surname in surnames:
            author_node = f"AUTHOR:{surname}"
            year_node = f"YEAR:{year}_{surname}"
            G.add_node(author_node, type="author", label=surname)
            G.add_node(year_node, type="year", label=year)
            G.add_edge(author_node, year_node)
            G.add_edge(year_node, work_node)

    return G


def _work_text_has_surname_for_year(graph: nx.DiGraph, surname: str, year: str) -> bool:
    """¿Alguna obra de ese año menciona el apellido en su texto?

    Cubre el caso en que el nombre citado es el TEMA de la obra y no un autor
    ("Fisher" en "Campbell, G. (2008). Fisher, Alexander"): la referencia SÍ
    está en la bibliografía, solo que el apellido vive en el título.
    """
    sn = _normaliza(surname)
    if not sn:
        return False
    for node, data in graph.nodes(data=True):
        if data.get("type") != "work":
            continue
        if sn not in _normaliza(data.get("original", "")):
            continue
        for pred in graph.predecessors(node):
            pd = graph.nodes[pred]
            if pd.get("type") == "year" and pd.get("label") == year:
                return True
    return False

def validate_citations_against_graph(doc_text: str, graph: nx.DiGraph) -> List[Dict[str, str]]:
    """
    Validates in-text citations against the constructed Graph RAG.
    Returns a list of validation issues.
    """
    issues = []

    # Extract potential citations from text e.g. (Smith, 2019), Smith (2019) or
    # an all-caps organization acronym, (OIT, 2007).
    citation_pattern = re.compile(
        r'([A-Z][a-z]+(?:,\s*[A-Z][a-z]+)*|[A-ZÁÉÍÓÚÑ]{2,6})'
        r'\s*(?:\(\s*(20\d{2}|19\d{2})\s*\)|\,\s*(20\d{2}|19\d{2}))'
    )

    authors_in_graph = [n for n, d in graph.nodes(data=True) if d.get('type') == 'author']

    for match in citation_pattern.finditer(doc_text):
        author_raw = match.group(1).strip()
        year = match.group(2) or match.group(3)

        author_node = f"AUTHOR:{author_raw}"
        acro = _normaliza(author_raw)

        # El apellido citado se resuelve contra CUALQUIER autor del grafo: una
        # obra de tres autores se cita a veces por el segundo o el tercero.
        matched_label = author_raw if author_node in graph else None
        if matched_label is None:
            for ag in authors_in_graph:
                label = ag.split('AUTHOR:', 1)[-1]
                if _normaliza(author_raw) in _normaliza(ag) or _normaliza(label) in _normaliza(author_raw):
                    matched_label = label
                    break
                # "OIT" ↔ "Organización Internacional del Trabajo".
                if _iniciales(label) == acro:
                    matched_label = label
                    break

        if matched_label is None:
            # El nombre citado puede ser el TEMA de la obra, que vive en el
            # título y no en la lista de autores.
            if _work_text_has_surname_for_year(graph, author_raw, year):
                continue
            issues.append({
                "type": "missing_reference",
                "citation": f"{author_raw}, {year}",
                "message": f"Cita '{author_raw}' no encontrada en el Grafo de Referencias Bibliográficas."
            })
        else:
            # Author exists, check if year is connected
            year_node = f"YEAR:{year}_{matched_label}"
            if year_node not in graph or not graph.has_edge(f"AUTHOR:{matched_label}", year_node):
                issues.append({
                    "type": "year_mismatch",
                    "citation": f"{author_raw}, {year}",
                    "message": f"El autor '{author_raw}' existe, pero el año {year} no está asociado en el Grafo."
                })

    return issues
