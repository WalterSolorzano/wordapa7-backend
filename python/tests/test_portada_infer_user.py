"""Inferencia de portada con patrón REAL del usuario (UNAN/Recinto/blob corrido)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from parsing.docx_parser import _infer_portada_from_textboxes  # noqa: E402
from parsing.xml_deep_parser import extract_unique_textbox_pairs  # noqa: E402

BLOB = (
    "Br. Alexa Marian Dona Hernandez Carnet: 2021-0251U"
    "Br. Lance Andrew Sobalvarro Padilla Carnet: 2023-0366U"
    "Br. Walter Noel Solorzano Gaitan Carnet: 2023-0432U"
    "Br. Wilmary Eunice Diaz Escorcia Carnet: 2023-0802I"
)


def _texts():
    return [
        "Estudio del trabajo",
        "UNAN-Managua",
        "Recinto: Denis Martinez Calero",
        BLOB,
        BLOB,  # duplicado Choice/Fallback
        "Elaborado Por:",
        "Managua, Nicaragua",
        "15 de mayo de 2025",
    ]


def test_title_not_recinto():
    f = _infer_portada_from_textboxes(_texts())
    assert f.get("title") == "Estudio del trabajo", f"title={f.get('title')!r}"


def test_institution_unan():
    f = _infer_portada_from_textboxes(_texts())
    assert "UNAN" in (f.get("institution") or ""), f"institution={f.get('institution')!r}"


def test_four_unique_authors_clean_carnets():
    pairs = extract_unique_textbox_pairs(_texts())
    students = [m for m in pairs if m.get("role") == "br."]
    ids = [m["id"] for m in students]
    assert len(students) == 4, f"{len(students)} estudiantes"
    assert len(ids) == len(set(ids)), f"carnets duplicados: {ids}"
    for cid in ids:
        assert not cid[-1].isalpha(), f"carnet con basura: {cid}"


def test_author_string_clean():
    f = _infer_portada_from_textboxes(_texts())
    a = f.get("author") or ""
    assert a.count("Carnet:") == 4, a
    assert "0251U" not in a and "0802I" not in a, a
