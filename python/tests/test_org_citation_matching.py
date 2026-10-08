"""
WordAPA7 — Citas de organizaciones con sigla.

Una cita válida de una organización —"(OIT, 2007)" o "Organización
Internacional del Trabajo (OIT, 2007)"— debe cruzarse con su ficha aunque la
ficha guarde el nombre completo y el texto la cite por su sigla. Antes el
pre-clasificador exigía `[A-Z][a-z]+` y la sigla en mayúsculas quedaba
invisible, así que la referencia salía como no citada y la cita como sin ficha.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from models import DocumentModel, ElementModel, ElementType, ReferenciaModel
from parsing.citation_matcher import (
    cross_check_citations_and_references,
    extract_all_citations,
    _acronimo_de_organizacion,
)
from services.graph_rag import build_citation_graph, validate_citations_against_graph


def _doc(texto: str, referencias=None) -> DocumentModel:
    return DocumentModel(
        session_id="org_test",
        elements=[ElementModel(id="p1", type=ElementType.PARAGRAPH, text=texto)],
        referencias=list(referencias or []),
    )


def _ref_oit() -> ReferenciaModel:
    return ReferenciaModel(
        id="r_oit",
        authors=["Organización Internacional del Trabajo"],
        year="2007",
        title="Trabajo decente y protección social",
        source="OIT",
        raw_text="Organización Internacional del Trabajo. (2007). Trabajo decente.",
    )


class TestOrgAcronymDetection:
    def test_parenthetical_acronym_detected(self):
        cits = extract_all_citations(_doc("El informe (OIT, 2007) define los estándares."))
        assert len(cits) == 1
        assert cits[0].authors == ["OIT"]
        assert cits[0].year == "2007"

    def test_narrative_org_acronym_detected_once(self):
        texto = "Organización Internacional del Trabajo (OIT, 2007) define los estándares."
        cits = extract_all_citations(_doc(texto))
        # Una sola cita: la sigla dentro del paréntesis no se cuenta aparte.
        assert len(cits) == 1
        assert cits[0].authors[0].startswith("Organización Internacional")
        assert cits[0].year == "2007"


class TestOrgAcronymCrossCheck:
    def test_parenthetical_acronym_matches_full_name_reference(self):
        doc = _doc("El informe (OIT, 2007) define los estándares.", [_ref_oit()])
        result = cross_check_citations_and_references(doc)
        assert result["ghost_citations"] == []
        assert result["orphan_references"] == []
        assert doc.referencias[0].never_cited is False
        assert doc.referencias[0].cited_count == 1

    def test_narrative_acronym_matches_full_name_reference(self):
        doc = _doc(
            "Organización Internacional del Trabajo (OIT, 2007) define los estándares.",
            [_ref_oit()],
        )
        result = cross_check_citations_and_references(doc)
        assert result["ghost_citations"] == []
        assert doc.referencias[0].never_cited is False

    def test_acronym_helper_is_symmetric(self):
        assert _acronimo_de_organizacion("OIT", "Organización Internacional del Trabajo")
        assert _acronimo_de_organizacion("Organización Internacional del Trabajo", "OIT")
        assert not _acronimo_de_organizacion("OIT", "Organización Mundial de la Salud")


class TestGraphRagOrgAcronym:
    def test_graph_keeps_full_org_name(self):
        graph = build_citation_graph(
            ["Organización Internacional del Trabajo. (2007). Trabajo decente. OIT."]
        )
        labels = [d.get("label") for _, d in graph.nodes(data=True) if d.get("type") == "author"]
        assert labels == ["Organización Internacional del Trabajo"]

    def test_validate_accepts_acronym_for_full_name(self):
        graph = build_citation_graph(
            ["Organización Internacional del Trabajo. (2007). Trabajo decente. OIT."]
        )
        issues = validate_citations_against_graph("Según el informe (OIT, 2007), ...", graph)
        assert issues == []
