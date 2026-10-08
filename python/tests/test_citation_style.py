"""Deteccion de estilo de cita mezclado (APA vs numerica).

El wizard solo avisa: convertir exige los metadatos de cada fuente, que es otro
trabajo. Lo que se fija aca es que la deteccion distinga APA de IEEE/Vancouver y
que no confunda el anio APA de cuatro digitos con una cita numerica.
"""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402
from models import DocumentModel, ElementModel, ElementType  # noqa: E402


def _doc(texto):
    return DocumentModel(session_id="s1", elements=[
        ElementModel(id="e0", type=ElementType.PARAGRAPH, heading_level=1, text=texto),
    ])


def test_solo_apa_no_es_mezcla():
    from parsing.citation_matcher import detect_citation_style
    out = detect_citation_style(_doc("La teoria (Perez, 2020) lo confirma."))
    assert out["apa"] == 1
    assert out["mixed"] is False


def test_numerica_y_apa_es_mezcla():
    from parsing.citation_matcher import detect_citation_style
    out = detect_citation_style(_doc("El estudio [12] confirma (Perez, 2020)."))
    assert out["ieee"] == 1
    assert out["apa"] == 1
    assert out["mixed"] is True


def test_endpoint_estilo(monkeypatch):
    from routers import sessions as router
    monkeypatch.setattr(router, "load_session_state", lambda sid, st: _doc("Ver [1] y (Lopez, 2019)."))
    from main import app
    r = TestClient(app).get("/api/citation-style/s1")
    assert r.status_code == 200
    assert r.json()["mixed"] is True
