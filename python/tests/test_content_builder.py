import uuid

import pytest

from content.builder import build_content_document
from models import ElementType


def _sid():
    return "t" + uuid.uuid4().hex[:8]


def test_builds_elements_and_numbers_figures(tmp_path):
    payload = {
        "meta": {"title": "Informe", "author": "Ana", "institution": "UNI"},
        "content": [
            {"h1": "Método"},
            {"p": "Cuerpo.", "cite": "(Pérez, 2020)"},
            {"diagram": {"kind": "flow", "dsl": "A > B", "caption": "Fases", "style": "scientific"}},
            {"table": {"caption": "Datos", "rows": [["a", "b"]]}},
            {"diagram": {"kind": "tree", "dsl": "R\n- H", "caption": "Árbol"}},
        ],
    }
    result = build_content_document(payload, tmp_path, session_id=_sid())
    doc = result.document
    types = [e.type for e in doc.elements]
    assert types[0] == ElementType.HEADING
    assert types[1] == ElementType.PARAGRAPH
    figs = [e for e in doc.elements if e.type == ElementType.IMAGE]
    assert [f.image_info.figure_number for f in figs] == [1, 2]
    assert figs[0].image_info.design_style == "scientific"
    tbl = next(e for e in doc.elements if e.type == ElementType.TABLE)
    assert tbl.table_info.table_number == 1


def test_empty_content_is_valid(tmp_path):
    result = build_content_document({"content": []}, tmp_path, session_id=_sid())
    assert result.document.elements == []


def test_unknown_kind_omits_diagram_and_warns(tmp_path):
    result = build_content_document(
        {"content": [{"diagram": {"kind": "sequence", "dsl": "A -> B"}}]},
        tmp_path, session_id=_sid(),
    )
    assert result.warnings
    assert not any(e.type == ElementType.IMAGE for e in result.document.elements)


def test_invalid_style_falls_back_to_standard(tmp_path):
    result = build_content_document(
        {"content": [{"diagram": {"kind": "flow", "dsl": "A > B", "style": "fancy"}}]},
        tmp_path, session_id=_sid(),
    )
    fig = next(e for e in result.document.elements if e.type == ElementType.IMAGE)
    assert fig.image_info.design_style == "standard"
    assert any("fancy" in w for w in result.warnings)


def test_rejects_too_many_blocks(tmp_path):
    from content.builder import MAX_CONTENT_BLOCKS

    payload = {"content": [{"p": "x"} for _ in range(MAX_CONTENT_BLOCKS + 1)]}
    with pytest.raises(ValueError):
        build_content_document(payload, tmp_path, session_id=_sid())


def test_raw_reference_not_mangled(tmp_path):
    # Regresión: una referencia que solo trae texto crudo no debe fabricar el
    # prefijo "(s.f.)." ni perder texto al quitarse el marcador de lista.
    from modules.apa_format import format_apa_plain

    raw = "Pérez, A. (2020). Inteligencia artificial y educación. Editorial UNI."
    payload = {"meta": {"title": "Informe"}, "references": [raw]}
    result = build_content_document(payload, tmp_path, session_id=_sid())
    ref = result.document.referencias[0]
    plain = format_apa_plain(ref)
    assert plain.startswith("Pérez, A. (2020).")
    assert "f.)." not in plain
    assert "(s.f.)" not in plain
    assert "Editorial UNI." in plain


def test_strip_ref_prefix_keeps_no_date():
    # El recorte de marcadores de lista no debe mutilar un "(s.f.)" de APA.
    from modules.referencias_module import _strip_ref_prefix

    assert _strip_ref_prefix("(s.f.). Título de la obra.") == "(s.f.). Título de la obra."
    assert _strip_ref_prefix("(a) Texto") == "Texto"
    assert _strip_ref_prefix("1. Texto") == "Texto"
    assert _strip_ref_prefix("• Texto") == "Texto"
