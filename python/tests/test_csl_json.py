"""FASE 3.2 — ReferenciaModel.to_csl_json: estructura estándar sin cambiar render."""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from models import ReferenciaModel


def test_basic_mapping():
    r = ReferenciaModel(id="r1", authors=["Hirano, Hiroyuki"], year="1995",
                        title="5 Pillars of the Visual Workplace",
                        source="Productivity Press", doi_or_url="10.1000/xyz")
    c = r.to_csl_json()
    assert c["type"] == "article-journal"
    assert c["author"][0] == {"family": "Hirano", "given": "Hiroyuki"}
    assert c["issued"]["date-parts"] == [[1995]]
    assert c["container-title"] == "Productivity Press"
    assert c["DOI"] == "10.1000/xyz" and "URL" not in c


def test_corporate_author_and_no_year():
    r = ReferenciaModel(id="r2", authors=["Organización Mundial de la Salud"],
                        year="", title="Guía de ergonomía")
    c = r.to_csl_json()
    assert c["author"][0]["literal"] is True
    assert c["issued"]["raw"] == "s.f."


def test_url_not_doi():
    r = ReferenciaModel(id="r3", authors=["García, Ana"], year="2020",
                        title="Estudio online", doi_or_url="https://example.org/a")
    c = r.to_csl_json()
    assert "DOI" not in c and c["URL"] == "https://example.org/a"


def test_render_untouched():
    """El formateador propio sigue siendo la fuente del texto final."""
    r = ReferenciaModel(id="r4", authors=["Hirano, H."], year="1995",
                        title="5 Pillars", formatted_apa="Hirano, H. (1995). 5 Pillars.")
    assert r.formatted_apa.startswith("Hirano")
