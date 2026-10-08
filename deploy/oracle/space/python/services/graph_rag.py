"""
WordAPA7 - Graph RAG (Retrieval-Augmented Generation) for Citations
Builds a networkx graph of Authors -> Years -> Works to validate citations
precisely and avoid LLM hallucination.
"""

import re
from typing import Dict, List

import networkx as nx


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
            # Extract main surname
            surname = author_part.split(',')[0].strip()
            # The rest is work title (after year)
            work = ref_clean[year_match.end():].strip('. ')
        else:
            surname = "Unknown"
            work = ref_clean

        # Add to graph
        author_node = f"AUTHOR:{surname}"
        year_node = f"YEAR:{year}_{surname}"
        work_node = f"WORK:{work[:30]}..."

        G.add_node(author_node, type="author", label=surname)
        G.add_node(year_node, type="year", label=year)
        G.add_node(work_node, type="work", original=ref_clean)

        G.add_edge(author_node, year_node)
        G.add_edge(year_node, work_node)

    return G

def validate_citations_against_graph(doc_text: str, graph: nx.DiGraph) -> List[Dict[str, str]]:
    """
    Validates in-text citations against the constructed Graph RAG.
    Returns a list of validation issues.
    """
    issues = []

    # Extract potential citations from text e.g. (Smith, 2019) or Smith (2019)
    citation_pattern = re.compile(r'([A-Z][a-z]+(?:,\s*[A-Z][a-z]+)*)\s*(?:\(\s*(20\d{2}|19\d{2})\s*\)|\,\s*(20\d{2}|19\d{2}))')

    authors_in_graph = [n for n, d in graph.nodes(data=True) if d.get('type') == 'author']

    for match in citation_pattern.finditer(doc_text):
        author_raw = match.group(1).strip()
        year = match.group(2) or match.group(3)

        author_node = f"AUTHOR:{author_raw}"

        if author_node not in graph:
            # Maybe slight mismatch? Check if it exists as substring
            found = False
            for ag in authors_in_graph:
                if author_raw.lower() in ag.lower():
                    found = True
                    break

            if not found:
                issues.append({
                    "type": "missing_reference",
                    "citation": f"{author_raw}, {year}",
                    "message": f"Cita '{author_raw}' no encontrada en el Grafo de Referencias BibliogrÃ¡ficas."
                })
        else:
            # Author exists, check if year is connected
            year_node = f"YEAR:{year}_{author_raw}"
            if year_node not in graph or not graph.has_edge(author_node, year_node):
                issues.append({
                    "type": "year_mismatch",
                    "citation": f"{author_raw}, {year}",
                    "message": f"El autor '{author_raw}' existe, pero el aÃ±o {year} no estÃ¡ asociado en el Grafo."
                })

    return issues
