"""Formateador canónico APA 7: segmentos, tipos, limpieza y URLs."""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from modules.apa_format import (
    build_apa_segments,
    format_apa_plain,
    inferir_tipo,
    limpiar_artefactos,
    url_segura,
)


def _plain(segs):
    return "".join(s.text for s in segs)


def _ital(segs):
    return "".join(s.text for s in segs if s.italic)


def test_libro_sin_url_cursiva_y_sin_enlace():
    ref = {"authors": ["Hirano, H."], "year": "1995", "title": "5 Pillars of the Visual Workplace",
           "source": "Productivity Press", "doi_or_url": None, "tipo": "libro"}
    segs = build_apa_segments(ref)
    assert _ital(segs) == "5 Pillars of the Visual Workplace"
    assert format_apa_plain(ref) == "Hirano, H. (1995). 5 Pillars of the Visual Workplace. Productivity Press."
    assert "http" not in format_apa_plain(ref)
    assert format_apa_plain(ref).endswith(".")


def test_libro_sin_autores_prefijo_anio():
    ref = {"authors": [], "year": "2020", "title": "Manual", "source": "Acme",
           "doi_or_url": None, "tipo": "libro"}
    assert format_apa_plain(ref) == "(2020). Manual. Acme."


def test_tesis_cursiva_etiqueta_e_https():
    ref = {"authors": ["Taha, M."], "year": "2021",
           "title": "Diseño de una planta", "source": "Universitat Politècnica de Catalunya",
           "doi_or_url": "http://upc.edu/tesis/123", "tipo": "tesis"}
    plain = format_apa_plain(ref)
    assert _ital(build_apa_segments(ref)) == "Diseño de una planta"
    assert "[Tesis" in plain and "Universitat Politècnica de Catalunya]" in plain
    assert "https://upc.edu/tesis/123" in plain and "http://" not in plain


def test_autor_corporativo_sin_siglas():
    ref = {"authors": ["Organización Internacional del Trabajo [OIT]"], "year": "2007",
           "title": "Convenio", "source": "OIT", "doi_or_url": None, "tipo": "informe"}
    plain = format_apa_plain(ref)
    assert plain.startswith("Organización Internacional del Trabajo")
    assert "[OIT]" not in plain


def test_articulo_cursiva_antes_de_la_primera_coma():
    ref = {"authors": ["García, A."], "year": "2023", "title": "Estudio",
           "source": "Revista Científica, 45(2), 123-145",
           "doi_or_url": "10.1016/j.edu.2023.01", "tipo": "articulo"}
    segs = build_apa_segments(ref)
    assert _ital(segs) == "Revista Científica"
    assert format_apa_plain(ref) == (
        "García, A. (2023). Estudio. Revista Científica, 45(2), 123-145. "
        "https://doi.org/10.1016/j.edu.2023.01"
    )


def test_web_cursiva_titulo():
    ref = {"authors": ["Pérez, J."], "year": "2021", "title": "Avances en tecnología",
           "source": "TechDaily", "doi_or_url": "https://techdaily.com/art1", "tipo": "web"}
    assert _ital(build_apa_segments(ref)) == "Avances en tecnología"
    assert format_apa_plain(ref) == (
        "Pérez, J. (2021). Avances en tecnología. TechDaily. https://techdaily.com/art1"
    )


def test_limpieza_vancouver():
    sucio = "Available from: https://x.com [accessed 26 Jun 2025]"
    limpio = limpiar_artefactos(sucio)
    assert "Available" not in limpio and "accessed" not in limpio


def test_url_segura_variantes():
    assert url_segura("http://a.com/x", "web") == "https://a.com/x"
    assert url_segura("www.a.com/x", "web") == "https://www.a.com/x"
    assert url_segura("10.1/x", "articulo") == "https://doi.org/10.1/x"
    assert url_segura("doi:10.1/x", "articulo") == "https://doi.org/10.1/x"
    assert url_segura(None, "libro") == ""


def test_inferir_tipo():
    assert inferir_tipo({"title": "Tesis de grado", "source": "", "raw_text": "", "doi_or_url": None}) == "tesis"
    assert inferir_tipo({"title": "X", "source": "Revista, 45(2), 1-2", "raw_text": "", "doi_or_url": None}) == "articulo"
    assert inferir_tipo({"title": "X", "source": "(12th ed.) McGraw", "raw_text": "", "doi_or_url": None}) == "libro"
    assert inferir_tipo({"title": "X", "source": "", "raw_text": "", "doi_or_url": "10.1234/x"}) == "articulo"
    assert inferir_tipo({"title": "X", "source": "McGraw-Hill", "raw_text": "", "doi_or_url": None}) == "libro"
    assert inferir_tipo({"title": "X", "source": "", "raw_text": "", "doi_or_url": "https://a.com"}) == "web"


def test_otro_replica_salida_plana():
    ref = {"authors": ["A, B."], "year": "2000", "title": "T", "source": "S",
           "doi_or_url": "https://x.com", "tipo": "otro"}
    assert format_apa_plain(ref) == "A, B. (2000). T. S. https://x.com"


def test_autor_corporativo_lleva_punto_antes_del_anio():
    ref = {"authors": ["Instituto Nicaragüense de Energía [INE]"], "year": "2026",
           "title": "", "source": "", "doi_or_url": None, "tipo": "otro"}
    assert format_apa_plain(ref).startswith("Instituto Nicaragüense de Energía. (2026)")

    _only = {"authors": ["Instituto Nicaragüense de Energía"], "year": "2026",
            "title": "", "source": "", "doi_or_url": None, "tipo": "otro"}
    assert format_apa_plain(_only).startswith("Instituto Nicaragüense de Energía. (2026)")


def test_limpieza_vancouver_sin_dos_puntos_huerfanos():
    limpio = limpiar_artefactos(
        "Avances en robótica. Available from: https://x.com [accessed 26 Jun 2025]"
    )
    assert limpio == "Avances en robótica. https://x.com"


def test_raw_con_doi_no_degenera():
    # Regresión: con raw_text/formatted_apa pero sin campos estructurados y con
    # doi_or_url, el formateador NO debe fabricar "(s.f.). <url>" y perder el texto.
    ref = {"authors": [], "year": None, "title": "", "source": "",
           "raw_text": "Perez, A. (2020). Un titulo real. Revista X, 3(2), 10-20. https://doi.org/10.1000/a",
           "doi_or_url": "10.1000/a", "tipo": "otro"}
    plain = format_apa_plain(ref)
    assert "Un titulo real" in plain
    assert "(s.f.)" not in plain
