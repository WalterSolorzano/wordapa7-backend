"""WordAPA7 — Citas de autores que NO son el primero de la ficha.

Un trabajo de tres autores se cita a veces por el segundo o el tercero, y una
obra sobre una persona se cita por el nombre del tema, que vive en el título y
no en la lista de autores. En los dos casos la referencia SÍ está en la
bibliografía y el sistema la reportaba como cita sin fuente.

Dos verdades que tienen que coincidir:
  - `citation_matcher` (el cruce principal).
  - `graph_rag` (el validador avanzado que el endpoint agrega encima).
Antes, las dos miraban solo el PRIMER apellido de cada ficha, así que
"Kroemer y Grandjean (2001)" marcaba a Grandjean como fantasma aunque la ficha
"Kroemer, K. H. E., & Grandjean, E. (2001)" estuviera en la bibliografía.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from models import DocumentModel, ElementModel, ElementType, ReferenciaModel
from parsing.citation_matcher import (
    cross_check_citations_and_references,
    extract_all_citations,
)
from services.graph_rag import build_citation_graph, validate_citations_against_graph


def _doc(texto: str, referencias=None) -> DocumentModel:
    return DocumentModel(
        session_id="multiauthor_test",
        elements=[ElementModel(id="p1", type=ElementType.PARAGRAPH, text=texto)],
        referencias=list(referencias or []),
    )


def _ref(ref_id: str, authors, year: str, title: str = "", raw_text: str = "") -> ReferenciaModel:
    return ReferenciaModel(
        id=ref_id,
        authors=list(authors),
        year=year,
        title=title,
        raw_text=raw_text or f"{authors[0] if authors else 'Autor'} ({year}). {title}",
    )


# ── citation_matcher: cualquier autor de la ficha ────────────────────────────


class TestCrossCheckAnyAuthor:
    def test_narrative_citation_of_second_author_matches(self):
        doc = _doc(
            "Según Kroemer y Grandjean (2001), la ergonomía del puesto...",
            [_ref("r1", ["Kroemer, K. H. E.", "Grandjean, E."], "2001", "Fitting the Task to the Human")],
        )
        assert cross_check_citations_and_references(doc)["ghost_citations"] == []

    def test_citation_by_only_the_second_surname_matches(self):
        doc = _doc(
            "Grandjean (2001) afirma que...",
            [_ref("r1", ["Kroemer, K. H. E.", "Grandjean, E."], "2001", "Fitting the Task to the Human")],
        )
        assert cross_check_citations_and_references(doc)["ghost_citations"] == []

    def test_first_author_still_matches(self):
        doc = _doc(
            "Según Niebel y Freivalds (2009), ...",
            [_ref("r1", ["Niebel, B. W.", "Freivalds, A."], "2009", "Ingeniería industrial")],
        )
        assert cross_check_citations_and_references(doc)["ghost_citations"] == []

    def test_unknown_author_is_still_a_ghost(self):
        doc = _doc(
            "Según Pérez (2001), ...",
            [_ref("r1", ["Kroemer, K. H. E.", "Grandjean, E."], "2001", "Fitting the Task to the Human")],
        )
        ghosts = cross_check_citations_and_references(doc)["ghost_citations"]
        assert len(ghosts) == 1

    def test_wrong_year_is_still_a_ghost(self):
        doc = _doc(
            "Grandjean (1999) afirma que...",
            [_ref("r1", ["Kroemer, K. H. E.", "Grandjean, E."], "2001", "Fitting the Task to the Human")],
        )
        assert len(cross_check_citations_and_references(doc)["ghost_citations"]) == 1

    def test_subject_of_title_matches(self):
        doc = _doc(
            "Campbell (2008) analiza a Fisher...",
            [_ref("r1", ["Campbell, G."], "2008", "Fisher, Alexander",
                       "Campbell, G. (2008). Fisher, Alexander. Oxford Art Online.")],
        )
        assert cross_check_citations_and_references(doc)["ghost_citations"] == []


class TestMidParenthesisCitation:
    def test_citation_after_semicolon_is_extracted(self):
        cits = extract_all_citations(
            _doc("Mejoraría la higiene (como recomienda la metodología de las 5S; Hirano, 1995).")
        )
        assert any(c.authors == ["Hirano"] and c.year == "1995" for c in cits)

    def test_mid_parenthesis_citation_becomes_ghost_when_absent(self):
        doc = _doc("Mejoraría la higiene (como recomienda la metodología de las 5S; Hirano, 1995).")
        ghosts = cross_check_citations_and_references(doc)["ghost_citations"]
        assert any("Hirano" in str(g) for g in ghosts)

    def test_mid_parenthesis_citation_matches_when_present(self):
        doc = _doc(
            "Mejoraría la higiene (como recomienda la metodología de las 5S; Hirano, 1995).",
            [_ref("r1", ["Hirano, H."], "1995", "5 Pillars of the Visual Workplace")],
        )
        assert cross_check_citations_and_references(doc)["ghost_citations"] == []


# ── graph_rag: indexa TODOS los autores y el texto de la obra ────────────────


class TestGraphRagAllAuthors:
    def test_graph_indexes_every_author(self):
        graph = build_citation_graph(
            ["Kroemer, K. H. E., & Grandjean, E. (2001). Fitting the Task to the Human."]
        )
        labels = sorted(
            d.get("label") for _, d in graph.nodes(data=True) if d.get("type") == "author"
        )
        assert labels == ["Grandjean", "Kroemer"]

    def test_validate_accepts_second_author(self):
        graph = build_citation_graph(
            ["Kroemer, K. H. E., & Grandjean, E. (2001). Fitting the Task to the Human."]
        )
        assert validate_citations_against_graph("Según Kroemer y Grandjean (2001), ...", graph) == []

    def test_validate_accepts_only_second_surname(self):
        graph = build_citation_graph(
            ["Kroemer, K. H. E., & Grandjean, E. (2001). Fitting the Task to the Human."]
        )
        assert validate_citations_against_graph("Grandjean (2001) afirma que...", graph) == []

    def test_validate_accepts_subject_of_title(self):
        graph = build_citation_graph(
            ["Campbell, G. (2008). Fisher, Alexander. Oxford Art Online."]
        )
        assert validate_citations_against_graph("Campbell analiza (Ron Fisher, 2008)", graph) == []

    def test_validate_still_flags_unknown_author(self):
        graph = build_citation_graph(
            ["Kroemer, K. H. E., & Grandjean, E. (2001). Fitting the Task to the Human."]
        )
        issues = validate_citations_against_graph("Lopez (2001) afirma que...", graph)
        assert any(i["type"] == "missing_reference" for i in issues)

    def test_validate_still_flags_wrong_year(self):
        graph = build_citation_graph(
            ["Kroemer, K. H. E., & Grandjean, E. (2001). Fitting the Task to the Human."]
        )
        issues = validate_citations_against_graph("Grandjean (1999) afirma que...", graph)
        assert any(i["type"] == "year_mismatch" for i in issues)
