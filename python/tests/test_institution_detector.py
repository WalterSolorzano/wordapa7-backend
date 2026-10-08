"""Tests de la detección real de institución (propuesta 1)."""

from parsing.institution_detector import detect_institution


def test_nombre_unan_detecta_unan():
    r = detect_institution(["Universidad Nacional Autónoma de Nicaragua (UNAN-Managua)"])
    assert r["codigo"] == "UNAN"
    assert r["confidence"] >= 0.75
    assert any("nombre" in e for e in r["evidence"])


def test_area_de_ingenieria_mas_ciudad_detecta_uni():
    r = detect_institution(
        ["Área de Conocimiento de Ingeniería y Afines", "Managua, Nicaragua"]
    )
    assert r["codigo"] == "UNI"
    assert any("area" in e for e in r["evidence"])


def test_ciudad_sola_no_decide():
    r = detect_institution(["Managua, Nicaragua"])
    assert r["codigo"] == ""
    assert r["confidence"] == 0.0


def test_sin_texto_no_inventa():
    assert detect_institution([])["codigo"] == ""
    assert detect_institution(None)["codigo"] == ""
    assert detect_institution([], None)["codigo"] == ""


def test_texto_irrelevante_no_decide():
    r = detect_institution(["Optimización del Proceso mediante Estudio de Métodos"])
    assert r["codigo"] == ""
