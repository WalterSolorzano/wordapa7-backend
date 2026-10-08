import pytest

from content.schema import parse_content_document


def test_short_form_roundtrip():
    payload = {
        "meta": {"title": "Tesis", "author": "Ana", "use_original_cover": False},
        "content": [
            {"h1": "Método"},
            {"p": "Texto con tilde.", "cite": "(González, 2021)"},
            {"bullets": ["uno", "dos"]},
            {"diagram": {"kind": "flow", "dsl": "Inicio > Fin", "caption": "Flujo"}},
        ],
        "references": ["González, P. (2021). Obra."],
    }
    doc = parse_content_document(payload)
    assert doc.meta.title == "Tesis"
    assert doc.content[0].h1 == "Método"
    assert doc.content[1].cite == "(González, 2021)"
    assert doc.content[3].diagram.kind == "flow"


def test_long_form_is_normalized():
    payload = {
        "content": [
            {"type": "heading", "level": 2, "text": "Sub"},
            {"type": "paragraph", "text": "Cuerpo"},
        ]
    }
    doc = parse_content_document(payload)
    assert doc.content[0].h2 == "Sub"
    assert doc.content[1].p == "Cuerpo"


def test_unknown_key_is_ignored_not_crashing():
    doc = parse_content_document({"content": [{"p": "ok", "zzz": 1}]})
    assert doc.content[0].p == "ok"


def test_item_rejects_two_types():
    with pytest.raises(ValueError):
        parse_content_document({"content": [{"h1": "A", "p": "B"}]})


def test_item_rejects_empty_block():
    with pytest.raises(ValueError):
        parse_content_document({"content": [{}]})
