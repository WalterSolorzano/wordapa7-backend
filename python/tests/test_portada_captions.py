"""Leyendas de figura/tabla NUNCA son campos de portada + carnet entre paréntesis.

Bug reportado (portada UNI): "Figura 9. Recepción de la materia prima en grano
seco." se colaba como ASIGNATURA (la subcadena "materia" está en COURSE_KW) y
"Figura 1. Fotografía del proceso de Melanger..." como TÍTULO (era el texto no
asignado más largo). Además el carnet venía como "(2023-0296U)" y no se extraía.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from parsing.docx_parser import (  # noqa: E402
    _infer_portada_from_textboxes,
    _is_caption_text,
)
from parsing.xml_deep_parser import extract_unique_textbox_pairs  # noqa: E402

CAPTION_1 = (
    "Figura 1. Fotografia del proceso de Melanger que evidencia un registro "
    "fotografico."
)
CAPTION_9 = "Figura 9. Recepcion de la materia prima en grano seco."

# Blob real del usuario: 6 integrantes con carnet entre paréntesis.
BLOB = (
    "Br. Ivis Ariana Vargas Amador (2023-0296U)"
    " Br. Silvania Gabriela Gomez Obando (2023-0494U)"
    " Br. Oscar Joel Rugama Chow (2023-0440U)"
    " Br. Yireh Alejandro Beteta Torrez (2023.0334U)"
    " Br. Lance Andrew Sobalvarro Padilla (2023-0366U)"
    " Br. Maria del Pilar Bermudez Bermudez (2023-0451U)"
)


def _texts():
    return [
        "UNIVERSIDAD NACIONAL DE INGENIERIA",
        "Diseno de un proceso artesanal para la elaboracion de chocolate",
        "Seminario de Graduacion",
        CAPTION_1,
        CAPTION_9,
        BLOB,
    ]


def test_is_caption_text():
    assert _is_caption_text(CAPTION_1)
    assert _is_caption_text(CAPTION_9)
    assert _is_caption_text("Tabla 2. Resultados del experimento.")
    assert _is_caption_text("Grafico 3: Comparacion")
    assert not _is_caption_text("Diseno de un proceso artesanal")
    assert not _is_caption_text("Figuras de la investigacion")  # sin numero


def test_captions_never_become_cover_fields():
    f = _infer_portada_from_textboxes(_texts())
    title = f.get("title") or ""
    course = f.get("course") or ""
    assert "Figura" not in title, f"title contaminado: {title!r}"
    assert "Figura" not in course, f"course contaminado: {course!r}"
    assert "materia prima" not in course, f"course contaminado: {course!r}"
    assert "proceso artesanal" in title, f"title real perdido: {title!r}"


def test_parenthesized_carnets_are_extracted():
    students = [
        m for m in extract_unique_textbox_pairs(_texts()) if m.get("role") == "br."
    ]
    assert len(students) == 6, f"{len(students)} estudiantes"
    ids = [m["id"] for m in students]
    assert all(ids), f"carnets vacios: {ids}"
    assert len(ids) == len(set(ids)), f"carnets duplicados: {ids}"
    assert all(cid[-1].isdigit() for cid in ids), f"carnet con basura: {ids}"
    assert all("(" not in m["name"] for m in students), f"parentesis en nombre: {students}"


def test_author_string_canonical_pipe_format():
    a = _infer_portada_from_textboxes(_texts()).get("author") or ""
    assert a.count("| Carnet:") == 6, a
    assert "(" not in a and ")" not in a, a
