"""
WordAPA7 — Tests para auditoría de referencias duplicadas y n-gramas repetidos
"""

import pytest
from models import ElementModel, ElementType, ReferenciaModel
from parsing.references_extractor import extract_references
from modules.proactive_auditor import detect_repeated_ngrams
from modules.doc_auditor import audit_document_heuristic

def test_extract_references_duplicate_counting():
    elements = [
        ElementModel(id="h1", type=ElementType.HEADING, heading_level=1, text="FUENTES Y REFERENCIAS"),
        ElementModel(id="p1", type=ElementType.PARAGRAPH, text="García, A. (2020). Título del libro. Editorial X."),
        ElementModel(id="p2", type=ElementType.PARAGRAPH, text="García, A. (2020). Título del libro. Editorial X."),
        ElementModel(id="p3", type=ElementType.PARAGRAPH, text="1. García, A. (2020). Título del libro. Editorial X."),
    ]
    refs = extract_references(elements)
    assert len(refs) == 1
    assert refs[0].is_duplicate is True
    assert refs[0].duplicate_count == 3

def test_ngram_repetition_detection():
    phrase = "esta es una prueba de repeticion de n-gramas academico"
    elements = [
        ElementModel(id="p1", type=ElementType.PARAGRAPH, text=f"En el primer capitulo {phrase} para verificar."),
        ElementModel(id="p2", type=ElementType.PARAGRAPH, text=f"Posteriormente {phrase} en el marco teorico."),
        ElementModel(id="p3", type=ElementType.PARAGRAPH, text=f"Finalmente {phrase} en las conclusiones."),
    ]
    findings = detect_repeated_ngrams(elements)
    assert len(findings) >= 3
    kinds = [f["kind"] for f in findings]
    assert "ngram_repetition" in kinds

def test_doc_audit_flags_duplicate_references():
    class DummyDoc:
        session_id = "test-session"
        elements = [
            ElementModel(id="h1", type=ElementType.HEADING, heading_level=1, text="Introducción"),
            ElementModel(id="p1", type=ElementType.PARAGRAPH, text="Texto del documento."),
        ]
        referencias = [
            ReferenciaModel(
                id="ref-1",
                raw_text="García, A. (2020). Título del libro. Editorial X.",
                is_duplicate=True,
                duplicate_count=3,
            )
        ]
        citas_intext = []

    res = audit_document_heuristic(DummyDoc())
    assert any("Referencias duplicadas" in issue for issue in res.reference_issues)
