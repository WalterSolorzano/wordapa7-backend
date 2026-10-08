"""El resolvedor de citas fantasma no puede ANIDAR los candidatos.

`search_academic_metadata_cascade` devuelve un sobre
`{candidates, found, total_results}` cuando busca por autor+año. El endpoint lo
envolvía otra vez (`candidates: [result]`), así que el cliente recibía un único
candidato que era el sobre: sin `authors`, sin `year` y sin `title`. El frontend
lo tomaba como referencia y creaba una ficha en blanco que se pintaba como
"Autor (s.f.) / Sin título".
"""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402
from main import app  # noqa: E402
import modules.referencias_module as refmod  # noqa: E402

client = TestClient(app)


def test_candidatos_planos_cuando_la_cascada_devuelve_sobre(monkeypatch):
    async def fake_cascade(query, authors=[], year=""):
        return {
            "candidates": [
                {"authors": ["Hirano, H."], "year": "1995", "title": "5 Pillars"},
                {"authors": ["Otro, A."], "year": "1996", "title": "Segundo"},
            ],
            "found": True,
            "total_results": 2,
        }

    monkeypatch.setattr(refmod, "search_academic_metadata_cascade", fake_cascade)
    r = client.post(
        "/api/resolve-ghost-citation",
        json={"authors": ["Hirano"], "year": "1995"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["found"] is True
    assert data["total_results"] == 2
    assert len(data["candidates"]) == 2
    assert data["candidates"][0]["authors"] == ["Hirano, H."]
    assert data["candidates"][0]["title"] == "5 Pillars"


def test_una_referencia_plana_sigue_envolviendose_en_una_lista(monkeypatch):
    async def fake_flat(query, authors=[], year=""):
        return {"authors": ["Único, A."], "year": "2000", "title": "Solo"}

    monkeypatch.setattr(refmod, "search_academic_metadata_cascade", fake_flat)
    r = client.post(
        "/api/resolve-ghost-citation",
        json={"authors": ["Único"], "year": "2000"},
    )
    data = r.json()
    assert data["found"] is True
    assert data["total_results"] == 1
    assert data["candidates"][0]["title"] == "Solo"


def test_no_encontrado_devuelve_vacio(monkeypatch):
    async def fake_none(query, authors=[], year=""):
        return None

    monkeypatch.setattr(refmod, "search_academic_metadata_cascade", fake_none)
    r = client.post(
        "/api/resolve-ghost-citation",
        json={"authors": ["Nadie"], "year": "1900"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["found"] is False
    assert data["candidates"] == []
    assert data["total_results"] == 0
