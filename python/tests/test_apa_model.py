"""Contrato de ReferenciaModel para APA 7 (tipo + segmentos)."""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from models import ApaSegment, ReferenciaModel


def test_apa_segment_defaults():
    s = ApaSegment(text="Hola")
    assert s.text == "Hola"
    assert s.italic is False


def test_referencia_defaults_tipo_otro_sin_segmentos():
    # Referencia totalmente vacía: ni el validador de Task 3 debe poblarla.
    r = ReferenciaModel(id="r1")
    assert r.tipo == "otro"
    assert r.apa_segments == []


def test_csl_type_mapea_libro():
    r = ReferenciaModel(id="r2", authors=["Hirano, H."], year="1995",
                        title="5 Pillars", tipo="libro")
    assert r.to_csl_json()["type"] == "book"


def test_csl_type_mapea_tesis():
    r = ReferenciaModel(id="r3", authors=["Taha, M."], year="2021",
                        title="Diseño", tipo="tesis")
    assert r.to_csl_json()["type"] == "thesis"


def test_validador_migra_dato_viejo():
    r = ReferenciaModel(id="r4", authors=["Hirano, H."], year="1995",
                        title="5 Pillars", source="Productivity Press")
    assert r.tipo == "libro"
    assert len(r.apa_segments) >= 2
    assert r.formatted_apa == "Hirano, H. (1995). 5 Pillars. Productivity Press."


def test_validador_no_pisa_formatted_apa_existente():
    r = ReferenciaModel(id="r5", authors=["A, B."], year="2000", title="T",
                        formatted_apa="TEXTO PREVIO DEL USUARIO")
    assert r.formatted_apa == "TEXTO PREVIO DEL USUARIO"


def test_validador_no_rompe_referencia_vacia():
    r = ReferenciaModel(id="r6")
    assert r.apa_segments == []
    assert (r.formatted_apa or "") == ""


def test_validador_no_degenera_con_raw_y_doi():
    raw = "Perez, A. (2020). Un titulo real. Revista X. https://doi.org/10.1000/a"
    r = ReferenciaModel(id="r7", raw_text=raw, formatted_apa=raw, doi_or_url="10.1000/a")
    assert "Un titulo real" in "".join(s.text for s in r.apa_segments)
