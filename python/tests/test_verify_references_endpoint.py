"""La verificacion masiva marca "verificada" SOLO con match confiable.

Una referencia importada nace con `verificada=False` porque nadie la contrasto.
El endpoint la contrasta: DOI exacto primero, autor+año+titulo despues. Estas
pruebas fijan lo unico que hace que "Verificada" signifique algo: un candidato
con el mismo autor pero OTRO titulo —o con relevancia media— NO se marca.
"""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402
from main import app  # noqa: E402
import modules.referencias_module as refmod  # noqa: E402

client = TestClient(app)


def _patch(monkeypatch, cascade=None, crossref=None):
    async def fake_cascade(query, authors=[], year=""):
        return cascade

    async def fake_crossref(doi):
        return crossref

    monkeypatch.setattr(refmod, "search_academic_metadata_cascade", fake_cascade)
    monkeypatch.setattr(refmod, "fetch_crossref_metadata", fake_crossref)


def _post(items):
    return client.post("/api/references/verify", json={"references": items})


def test_doi_se_resuelve_y_se_marca_verificada(monkeypatch):
    async def fake_crossref(doi):
        assert doi == "10.1000/xyz"
        return {"title": "5 Pillars", "year": "1995", "provider": "crossref"}

    async def fake_cascade(query, authors=[], year=""):
        raise AssertionError("con DOI no debe buscar por autor/año")

    monkeypatch.setattr(refmod, "fetch_crossref_metadata", fake_crossref)
    monkeypatch.setattr(refmod, "search_academic_metadata_cascade", fake_cascade)

    r = _post([{
        "id": "r1", "authors": ["Hirano, H."], "year": "1995",
        "title": "5 Pillars", "doi_or_url": "10.1000/xyz",
    }])
    assert r.status_code == 200
    data = r.json()
    assert data["verificadas"] == 1
    res = data["results"][0]
    assert res["id"] == "r1"
    assert res["verificada"] is True
    assert res["fuente_verificacion"] == "doi"
    assert res["doi_or_url"] == "10.1000/xyz"


def test_candidato_high_con_mismo_titulo_se_verifica(monkeypatch):
    _patch(monkeypatch, cascade={
        "candidates": [{
            "authors": ["Hirano, H."], "year": "1995",
            "title": "5 Pillars of the Visual Workplace", "relevance": "high",
        }],
        "found": True, "total_results": 1,
    })
    res = _post([{
        "id": "r1", "authors": ["Hirano, H."], "year": "1995",
        "title": "5 Pillars of the Visual Workplace",
    }]).json()["results"][0]
    assert res["verificada"] is True
    assert res["fuente_verificacion"] == "cruzada"


def test_candidato_high_pero_otro_titulo_no_se_verifica(monkeypatch):
    """El homonimo: mismo autor, mismo año, distinta obra. No es la fuente."""
    _patch(monkeypatch, cascade={
        "candidates": [{
            "authors": ["Hirano, H."], "year": "1995",
            "title": "Una biografia completamente distinta sobre otra cosa",
            "relevance": "high",
        }],
        "found": True, "total_results": 1,
    })
    res = _post([{
        "id": "r1", "authors": ["Hirano, H."], "year": "1995",
        "title": "5 Pillars of the Visual Workplace",
    }]).json()["results"][0]
    assert res["verificada"] is False


def test_candidato_de_relevancia_media_no_se_verifica(monkeypatch):
    _patch(monkeypatch, cascade={
        "candidates": [{
            "authors": ["Otro, A."], "year": "1995",
            "title": "5 Pillars of the Visual Workplace", "relevance": "medium",
        }],
        "found": True, "total_results": 1,
    })
    res = _post([{
        "id": "r1", "authors": ["Hirano, H."], "year": "1995",
        "title": "5 Pillars of the Visual Workplace",
    }]).json()["results"][0]
    assert res["verificada"] is False


def test_sin_match_queda_pendiente(monkeypatch):
    _patch(monkeypatch, cascade=None)
    data = _post([{
        "id": "r1", "authors": ["Nadie, N."], "year": "1900", "title": "Inexistente",
    }]).json()
    assert data["verificadas"] == 0
    assert data["pendientes"] == 1
    assert data["results"][0]["verificada"] is False


def test_dict_plano_por_titulo_se_verifica(monkeypatch):
    _patch(monkeypatch, cascade={"title": "Analisis de metodologias", "year": "2021"})
    res = _post([{
        "id": "r1", "authors": [], "year": "", "title": "Analisis de metodologias",
    }]).json()["results"][0]
    assert res["verificada"] is True
    assert res["fuente_verificacion"] == "cruzada"


def test_lote_mixto_reporta_conteos(monkeypatch):
    _patch(monkeypatch, cascade={
        "candidates": [{
            "authors": ["Hirano, H."], "year": "1995",
            "title": "5 Pillars of the Visual Workplace", "relevance": "high",
        }],
        "found": True, "total_results": 1,
    })
    data = _post([
        {"id": "r1", "authors": ["Hirano, H."], "year": "1995",
         "title": "5 Pillars of the Visual Workplace"},
        {"id": "r2", "authors": ["Nadie, N."], "year": "1900", "title": "Inexistente"},
    ]).json()
    assert data["verificadas"] == 1
    assert data["pendientes"] == 1
    assert [r["id"] for r in data["results"]] == ["r1", "r2"]
