import xml.etree.ElementTree as ET

from diagrams.render import render_diagram


def test_render_is_deterministic_and_escapes_xml():
    a = render_diagram("flow", "Inicio > Análisis & Cierre")
    b = render_diagram("flow", "Inicio > Análisis & Cierre")
    assert a.svg == b.svg
    ET.fromstring(a.svg)  # no debe romper: el & debe estar escapado
    assert a.png[:8] == b"\x89PNG\r\n\x1a\n"
    assert a.width > 0 and a.height > 0


def test_render_unknown_kind_returns_png_with_warning():
    r = render_diagram("sequence", "A -> B")
    assert r.warnings
    assert r.png[:8] == b"\x89PNG\r\n\x1a\n"
