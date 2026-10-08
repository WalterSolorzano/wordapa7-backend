"""El endpoint de reformateo devuelve segmentos y tipo inferido."""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_format_libro_sin_url():
    r = client.post("/api/references/format", json={
        "authors": ["Hirano, H."], "year": "1995",
        "title": "5 Pillars of the Visual Workplace",
        "source": "Productivity Press",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["tipo"] == "libro"
    assert data["formatted_apa"] == (
        "Hirano, H. (1995). 5 Pillars of the Visual Workplace. Productivity Press."
    )
    assert any(s["italic"] and "5 Pillars" in s["text"] for s in data["apa_segments"])


def test_format_infiere_tipo_si_viene_otro():
    r = client.post("/api/references/format", json={
        "authors": ["Taha, M."], "year": "2021", "title": "Tesis de grado en diseño",
        "source": "Upc.edu", "doi_or_url": "http://upc.edu/t/1",
    })
    assert r.json()["tipo"] == "tesis"
    assert "https://upc.edu/t/1" in r.json()["formatted_apa"]


def test_format_respeta_tipo_explicito_con_doi():
    r = client.post("/api/references/format", json={
        "authors": ["Autor, A."], "year": "2020", "title": "Un libro",
        "source": "Editorial", "doi_or_url": "https://doi.org/10.1000/x", "tipo": "libro",
    })
    assert r.json()["tipo"] == "libro"
