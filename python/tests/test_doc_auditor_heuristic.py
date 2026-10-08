from __future__ import annotations
from types import SimpleNamespace
import pytest


def _make_element(elem_type, text="", heading_level=None, caption="", alt_text="", title=""):
    class FakeType:
        def __init__(self, v): self.value = v
    return SimpleNamespace(type=FakeType(elem_type), text=text, heading_level=heading_level,
                           caption=caption, alt_text=alt_text, title=title)


def _make_doc(elements, portada=None, referencias=None, citas_intext=None):
    return SimpleNamespace(elements=elements, portada=portada or {},
                           referencias=referencias or [], citas_intext=citas_intext or [],
                           apa_rules=None)


from modules.doc_auditor import audit_document_heuristic


def test_heuristic_heading_skip_h1_to_h3():
    elements = [_make_element("heading", "Intro", heading_level=1),
                _make_element("paragraph", "Texto."),
                _make_element("heading", "Sub", heading_level=3)]
    result = audit_document_heuristic(_make_doc(elements))
    assert len(result.heading_issues) > 0
    assert any("H1" in i and "H3" in i for i in result.heading_issues)


def test_heuristic_no_heading_skip_h1_to_h2():
    elements = [_make_element("heading", "Cap", heading_level=1),
                _make_element("heading", "Sec", heading_level=2)]
    result = audit_document_heuristic(_make_doc(elements))
    skip = [i for i in result.heading_issues if chr(8594) in i]
    assert len(skip) == 0


def test_heuristic_numbered_heading():
    elements = [_make_element("heading", "1. Introduccion", heading_level=1),
                _make_element("heading", "2. Marco", heading_level=1)]
    result = audit_document_heuristic(_make_doc(elements))
    numbered = [i for i in result.heading_issues if "numerado" in i.lower()]
    assert len(numbered) > 0


def test_heuristic_running_head_too_long():
    portada = {"running_head": "A" * 55}
    result = audit_document_heuristic(_make_doc([], portada=portada))
    rh = [s for s in result.format_suggestions if "running" in s.lower() or "Running" in s]
    assert len(rh) > 0


def test_heuristic_running_head_ok():
    portada = {"running_head": "RUNNING HEAD CORTO"}
    result = audit_document_heuristic(_make_doc([], portada=portada))
    rh = [s for s in result.format_suggestions if "running" in s.lower() or "Running" in s]
    assert len(rh) == 0


def test_heuristic_abstract_too_short():
    elements = [_make_element("heading", "Abstract", heading_level=1),
                _make_element("paragraph", "Resumen muy corto.")]
    result = audit_document_heuristic(_make_doc(elements))
    ai = [s for s in result.format_suggestions if "Abstract" in s or "abstract" in s]
    assert len(ai) > 0


def test_heuristic_abstract_too_long():
    long_abstract = " ".join(["palabra"] * 300)
    elements = [_make_element("heading", "Abstract", heading_level=1),
                _make_element("paragraph", long_abstract)]
    result = audit_document_heuristic(_make_doc(elements))
    ai = [s for s in result.format_suggestions if "Abstract" in s or "abstract" in s]
    assert len(ai) > 0


def test_heuristic_figure_without_caption():
    elements = [_make_element("image", caption="", alt_text="")]
    result = audit_document_heuristic(_make_doc(elements))
    fi = [s for s in result.format_suggestions if "figura" in s.lower()]
    assert len(fi) > 0


def test_heuristic_figure_with_caption_ok():
    elements = [_make_element("image", caption="Figura 1. Diagrama.")]
    result = audit_document_heuristic(_make_doc(elements))
    fi = [s for s in result.format_suggestions if "figura" in s.lower()]
    assert len(fi) == 0


def test_heuristic_table_without_title():
    elements = [_make_element("table", caption="", title="")]
    result = audit_document_heuristic(_make_doc(elements))
    ti = [s for s in result.format_suggestions if "tabla" in s.lower()]
    assert len(ti) > 0


def test_heuristic_returns_valid_result():
    elements = [_make_element("heading", "Intro", heading_level=1),
                _make_element("paragraph", "Texto.")]
    result = audit_document_heuristic(_make_doc(elements))
    assert hasattr(result, "heading_issues")
    assert hasattr(result, "format_suggestions")
    assert hasattr(result, "overall_assessment")
    assert result.overall_assessment in ("good", "needs_review", "critical")


def test_heuristic_clean_doc_is_good():
    elements = [_make_element("heading", "Intro", heading_level=1),
                _make_element("paragraph", "Contenido."),
                _make_element("heading", "Marco", heading_level=1),
                _make_element("heading", "Sub", heading_level=2),
                _make_element("paragraph", "Contenido 2.")]
    result = audit_document_heuristic(_make_doc(elements))
    assert result.overall_assessment == "good", f"Got: {result.overall_assessment}. Issues: {result.heading_issues}"


def test_heuristic_critical_with_heading_skips():
    elements = [_make_element("heading", "Cap", heading_level=1),
                _make_element("heading", "Sub3", heading_level=3),
                _make_element("heading", "Sub4", heading_level=4)]
    result = audit_document_heuristic(_make_doc(elements))
    assert result.overall_assessment == "critical"


def test_audit_structure_no_api_key_uses_heuristics():
    from modules.doc_auditor import audit_document_structure
    elements = [_make_element("heading", "Cap 1", heading_level=1),
                _make_element("heading", "Sec 1.3", heading_level=3),
                _make_element("paragraph", "Contenido.")]
    import asyncio
    result = asyncio.run(audit_document_structure(_make_doc(elements), api_key=""))
    assert "No hay clave" not in result.summary
    assert len(result.heading_issues) > 0