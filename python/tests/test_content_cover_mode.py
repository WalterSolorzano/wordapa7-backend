from __future__ import annotations

import docx

from content.builder import build_content_document
from content.emit import emit_docx


def _payload(cover_mode: str, use_original_cover: bool = False) -> dict:
    return {
        "meta": {
            "title": "Trabajo de prueba",
            "author": "Br. Ana Perez | Carnet: 2023-0001",
            "institution": "UNI",
            "course": "Ingenieria",
            "use_original_cover": use_original_cover,
            "cover_mode": cover_mode,
        },
        "content": [{"h1": "Introduccion"}, {"p": "Texto de prueba."}],
        "references": [],
    }


def test_builder_exposes_cover_mode(tmp_path):
    result = build_content_document(_payload("generate_uni_cover"), tmp_path)
    assert result.document.portada["cover_mode"] == "generate_uni_cover"
    # Un modo que genera portada no puede conservar la original.
    assert result.document.portada["use_original_cover"] is False


def test_builder_forces_generation_even_if_use_original_cover_true(tmp_path):
    result = build_content_document(
        _payload("generate_uni_cover", use_original_cover=True), tmp_path
    )
    assert result.document.portada["use_original_cover"] is False


def test_uni_cover_without_original(tmp_path):
    result = build_content_document(_payload("generate_uni_cover"), tmp_path)
    out = tmp_path / "out.docx"
    emit_docx(result.document, out, try_com=False)

    doc = docx.Document(str(out))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "Trabajo de prueba" in text
    # Linea de lugar de la portada UNI (default de generate_uni_cover).
    assert "Managua" in text
