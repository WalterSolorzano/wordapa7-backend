import pytest
from parsing.references_extractor import _parse_single_reference, extract_references
from modules.addin_references_store import _format_apa_reference
from models import ElementModel, ElementType


def test_parse_web_reference_with_https():
    raw = (
        "Organización Mundial de la Salud. (2020). Enfermedad por coronavirus (COVID-19). "
        "https://www.who.int/emergencies/diseases/novel-coronavirus-2019"
    )
    parsed = _parse_single_reference(raw)
    assert parsed["year"] == "2020"
    assert "Organización Mundial de la Salud" in parsed["authors"]
    assert parsed["doi_or_url"] == "https://www.who.int/emergencies/diseases/novel-coronavirus-2019"
    assert "https://" not in parsed["title"]
    assert "https://" not in parsed["source"]


def test_parse_web_reference_with_www_and_retrieval_phrase():
    raw = (
        "Pérez, J. (2021). Avances en robótica médica. Noticias de Ciencia. "
        "Recuperado el 15 de marzo de 2022, de www.cienciamedica.org/articulos/robotica"
    )
    parsed = _parse_single_reference(raw)
    assert parsed["year"] == "2021"
    assert parsed["authors"] == ["Pérez, J"]
    assert parsed["doi_or_url"] == "www.cienciamedica.org/articulos/robotica"
    assert "Recuperado" not in parsed["source"]
    assert "Recuperado" not in parsed["title"]
    assert parsed["title"] == "Avances en robótica médica"


def test_parse_web_reference_with_query_params_and_anchor():
    raw = (
        "Smith, R. (2019). Guide to web design. Web Standards. "
        "http://standards.org/guide.html?ver=2&lang=es#intro"
    )
    parsed = _parse_single_reference(raw)
    assert parsed["year"] == "2019"
    assert parsed["doi_or_url"] == "http://standards.org/guide.html?ver=2&lang=es#intro"
    assert parsed["title"] == "Guide to web design"


def test_format_apa_reference_with_web_url():
    ref_https = {
        "authors": ["Pérez, J."],
        "year": "2021",
        "title": "Avances en tecnología",
        "source": "TechDaily",
        "doi_or_url": "https://techdaily.com/art1",
    }
    formatted = _format_apa_reference(ref_https)
    assert formatted == "Pérez, J. (2021). Avances en tecnología. TechDaily. https://techdaily.com/art1"

    ref_www = {
        "authors": ["Gómez, M."],
        "year": "2022",
        "title": "Informe Anual",
        "source": "ONG",
        "doi_or_url": "www.ong.org/reporte",
    }
    formatted_www = _format_apa_reference(ref_www)
    assert formatted_www == "Gómez, M. (2022). Informe Anual. ONG. https://www.ong.org/reporte"
    assert "doi.org" not in formatted_www


def test_format_apa_reference_with_actual_doi():
    ref_doi = {
        "authors": ["García, A."],
        "year": "2023",
        "title": "Estudio APA",
        "source": "Revista Científica",
        "doi_or_url": "10.1016/j.edu.2023.01",
    }
    formatted = _format_apa_reference(ref_doi)
    assert formatted == "García, A. (2023). Estudio APA. Revista Científica. https://doi.org/10.1016/j.edu.2023.01"


def test_normalize_web_url():
    from modules.doi_resolver import normalize_web_url

    assert normalize_web_url("https://elpais.com/noticia.html") == "https://elpais.com/noticia.html"
    assert normalize_web_url("www.elpais.com/noticia.html") == "https://www.elpais.com/noticia.html"
    assert normalize_web_url("http://sitio.org/pagina?a=1#seccion") == "http://sitio.org/pagina?a=1#seccion"
    # DOIs no son tratados como URLs ordinarias
    assert normalize_web_url("10.1016/j.edu.2023.01") is None
    assert normalize_web_url("https://doi.org/10.1016/j.edu.2023.01") is None


@pytest.mark.anyio
async def test_resolve_web_metadata_html_parsing(monkeypatch):
    from modules.doi_resolver import resolve_web_metadata
    import httpx

    fake_html = """
    <!DOCTYPE html>
    <html>
    <head>
      <meta property="og:title" content="Gran Descubrimiento Científico - El Diario" />
      <meta property="og:site_name" content="El Diario" />
      <meta name="author" content="García, Juan" />
      <meta property="article:published_time" content="2023-04-12T10:00:00Z" />
    </head>
    <body><h1>Contenido</h1></body>
    </html>
    """

    class DummyResponse:
        status_code = 200
        text = fake_html

    class DummyClient:
        def __init__(self, *args, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            pass
        async def get(self, url, *args, **kwargs):
            return DummyResponse()

    monkeypatch.setattr(httpx, "AsyncClient", DummyClient)

    ref = await resolve_web_metadata("https://eldiario.es/noticia123")
    assert ref["title"] == "Gran Descubrimiento Científico"
    assert ref["source"] == "El Diario"
    assert ref["year"] == "2023"
    assert "García, J." in ref["authors"]
    assert ref["doi_or_url"] == "https://eldiario.es/noticia123"
    assert ref["formatted_apa"].startswith("García, J. (2023). Gran Descubrimiento Científico. El Diario.")


@pytest.mark.anyio
async def test_resolve_web_metadata_rejects_empty_title(monkeypatch):
    from modules.doi_resolver import resolve_web_metadata
    import httpx

    fake_html = "<html><head></head><body>Sin título ni metadatos</body></html>"

    class DummyResponse:
        status_code = 200
        text = fake_html

    class DummyClient:
        def __init__(self, *args, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            pass
        async def get(self, url, *args, **kwargs):
            return DummyResponse()

    monkeypatch.setattr(httpx, "AsyncClient", DummyClient)

    with pytest.raises(ValueError, match="no contiene título"):
        await resolve_web_metadata("https://sitio-vacio.com")


def test_apa_ellipsis_se_reexporta():
    from modules.addin_references_store import APA_ELLIPSIS
    from modules.apa_format import APA_ELLIPSIS as CANON
    assert APA_ELLIPSIS == CANON == "..."


def test_format_apa_reference_limpia_vancouver():
    ref = {
        "authors": ["Pérez, J."],
        "year": "2021",
        "title": "Avances en robótica. Available from: https://x.com [accessed 26 Jun 2025]",
        "source": "",
        "doi_or_url": "https://x.com",
    }
    out = _format_apa_reference(ref)
    assert "Available" not in out and "accessed" not in out


def test_parse_limpia_available_from_y_accessed_midstring():
    raw = ("ResearchGate (2020). Available from: https://researchgate.net/figure/123 "
           "[accessed 26 Jun 2025]")
    parsed = _parse_single_reference(raw)
    joined = " ".join([parsed.get("title", ""), parsed.get("source", "")])
    assert "Available" not in joined
    assert "[accessed" not in joined and "accessed" not in joined


def test_descarta_pagina_web_cuyo_titulo_se_colo_como_autor():
    """Una pagina de ResearchGate pegada en la bibliografia no es una
    referencia: su titulo se colaba como autor y ensuciaba el listado."""
    from parsing.references_extractor import reference_looks_like_junk

    bogus = ("Business improvement strategy or useful tool? Analysis of the "
             "application of the 5S concept in Japan, the UK and the US - "
             "Scientific Figure on ResearchGate. Available from: "
             "https://www.researchgate.net/figure/x [accessed 26 Jun 2025]")
    assert reference_looks_like_junk(bogus) is True


def test_no_descarta_referencias_legitimas():
    from parsing.references_extractor import reference_looks_like_junk

    ok = "Gutiérrez Pulido, H. (2012). Calidad total y productividad (2.ª ed.). McGraw-Hill."
    assert reference_looks_like_junk(ok) is False
    # Una web real con autor corto tampoco se descarta.
    web = ("ResearchGate (2020). Available from: https://researchgate.net/figure/123 "
           "[accessed 26 Jun 2025]")
    assert reference_looks_like_junk(web) is False
