"""
WordAPA7 — Suite de pruebas de la Fase de Expansión Avanzada
"""

import pytest
from parsing.bibtex_ris_parser import parse_bibtex_text, parse_ris_text
from modules.referencias_module import search_academic_metadata_cascade
from modules.proactive_auditor import _SPACY_NLP, _audit_spacy_and_spellchecker
from modules.visual_auditor import audit_pdf_visual_layout


def test_bibtex_import():
    bib_sample = """
    @article{sample2023,
      author = {García, Juan and Pérez, Maria},
      title = {Estudio sobre IA y APA 7},
      journal = {Revista Científica},
      year = {2023},
      doi = {10.1234/sample.2023}
    }
    """
    refs = parse_bibtex_text(bib_sample)
    assert len(refs) == 1
    assert "García" in refs[0].raw_text
    assert refs[0].year == "2023"
    assert "Estudio sobre IA" in refs[0].title


def test_ris_import():
    ris_sample = "TY  - JOUR\nAU  - López, Carlos\nTI  - Avances en Tipografía Académica\nJO  - Anales de la Universidad\nPY  - 2022\nER  - \n"
    refs = parse_ris_text(ris_sample)
    assert len(refs) == 1
    assert "López" in refs[0].raw_text
    assert refs[0].year == "2022"


def test_spacy_passive_voice_detection():
    if _SPACY_NLP is None:
        pytest.skip("spacy + es_core_news_sm no disponibles (dependencia opcional)")
    text = "El informe fue realizado por el equipo de investigación en tres fases consecutivas."
    findings = _audit_spacy_and_spellchecker("p1", text)
    kinds = [f["kind"] for f in findings]
    assert "passive_voice" in kinds


def test_visual_auditor_empty_buffer():
    res = audit_pdf_visual_layout(b"")
    assert res["passed"] is True
    assert res["page_count"] == 0
