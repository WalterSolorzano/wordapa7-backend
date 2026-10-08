"""Lint APA 7 de la seccion de Referencias.

Seis reglas de forma que hoy no existian: la fase `referencias` no declaraba
`criteria`, asi que la bibliografia no producia ningun hallazgo. Estos tests
fijan que cada una dispara sobre una entrada mal escrita, calla sobre la
correcta, y que el encabezado de la seccion no se reporta a si mismo.
"""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from modules.finding import mk  # noqa: E402
from modules.phase_scope import phase_findings  # noqa: E402


def _f(text, eid="r1"):
    return phase_findings("referencias", eid, text, mk=mk)


def _kinds(text):
    return [f["kind"] for f in _f(text)]


def test_ampersand_en_la_lista_de_autores():
    out = _f("García, J., y López, M. (2019). Título del libro.")
    f = next(x for x in out if x["kind"] == "apa_ampersand")
    assert " & " in f["suggestion"]
    assert f["phase"] == "referencias"
    assert f["read_only"] is False


def test_ampersand_no_dispara_si_ya_esta_bien():
    assert "apa_ampersand" not in _kinds("García, J., & López, M. (2019). Título.")


def test_ampersand_no_mira_la_y_del_titulo():
    # La "y" esta DESPUES del anio: es parte del titulo, no de los autores.
    assert "apa_ampersand" not in _kinds(
        "Pérez, A. (2020). Ingeniería industrial y métodos de trabajo."
    )


def test_doi_se_normaliza_a_url_canonica():
    out = _f("Taha, S. R. (2025). Análisis de video. doi:10.1234/abcd.5678")
    f = next(x for x in out if x["kind"] == "apa_doi_forma")
    assert f["suggestion"].endswith("https://doi.org/10.1234/abcd.5678")


def test_doi_dx_se_normaliza():
    out = _f("Autor, A. (2020). Título. http://dx.doi.org/10.1000/xyz")
    f = next(x for x in out if x["kind"] == "apa_doi_forma")
    assert "https://doi.org/10.1000/xyz" in f["suggestion"]
    assert "dx.doi.org" not in f["suggestion"]


def test_doi_canonico_no_dispara():
    assert "apa_doi_forma" not in _kinds(
        "Autor, A. (2020). Título. https://doi.org/10.1000/xyz"
    )


def test_edicion_espanola_se_normaliza():
    out = _f("Gutiérrez Pulido, H. (2012). Calidad total y productividad (2a ed.). McGraw-Hill.")
    f = next(x for x in out if x["kind"] == "apa_edicion")
    assert "(2.ª ed.)" in f["suggestion"]


def test_edicion_canonica_no_dispara():
    assert "apa_edicion" not in _kinds(
        "Gutiérrez Pulido, H. (2012). Calidad total y productividad (2.ª ed.). McGraw-Hill."
    )


def test_edicion_inglesa_no_dispara():
    assert "apa_edicion" not in _kinds(
        "Juran, J. M., & Godfrey, A. B. (1999). Juran's Quality Handbook (5th ed.). McGraw-Hill."
    )


def test_et_al_sin_punto():
    out = _f("Smith, J., et al (2021). Título del trabajo.")
    assert "apa_et_al" in [x["kind"] for x in out]


def test_et_al_correcto_no_dispara():
    assert "apa_et_al" not in _kinds("Smith, J., et al. (2021). Título del trabajo.")


def test_doble_espacio():
    out = _f("Autor,  A. (2020). Título del trabajo.")
    assert "apa_espaciado" in [x["kind"] for x in out]


def test_espacio_antes_de_punto():
    out = _f("Autor, A. (2020). Título del trabajo .")
    assert "apa_espaciado" in [x["kind"] for x in out]


def test_punto_final_faltante():
    out = _f("Niebel, B. W., & Freivalds, A. (2009). Ingeniería industrial y métodos de trabajo")
    f = next(x for x in out if x["kind"] == "apa_punto_final")
    assert f["suggestion"].endswith("trabajo.")


def test_punto_final_no_dispara_con_doi():
    assert "apa_punto_final" not in _kinds(
        "Taha, S. R. (2025). Análisis de video. https://doi.org/10.1234/abcd"
    )


def test_el_encabezado_de_la_seccion_no_se_reporta():
    assert _f("Referencias") == []
    assert _f("Bibliografía") == []


def test_una_entrada_correcta_no_produce_hallazgos():
    texto = "Juran, J. M., & Godfrey, A. B. (1999). Juran's Quality Handbook (5th ed.). McGraw-Hill."
    assert _f(texto) == []
