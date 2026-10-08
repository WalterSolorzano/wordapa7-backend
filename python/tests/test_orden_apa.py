"""Orden alfabetico APA 7 y su endpoint.

La clave vieja comparaba `authors[0].lower()` completo: "Ávila" caia DESPUES de
"Baez" porque la tilde tiene otro punto de codigo, y las iniciales participaban
del orden. Ahora ordena por el apellido, sin tildes ni iniciales.
"""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402
from models import DocumentModel, ReferenciaModel  # noqa: E402


def _ref(rid, author=None, title="", year="2020"):
    return ReferenciaModel(id=rid, authors=[author] if author else [], year=year,
                           title=title, raw_text=title or (author or ""))


def _client():
    from main import app
    return TestClient(app)


def test_ordena_por_apellido_sin_tildes():
    from modules.referencias_module import sort_referencias_alphabetically
    refs = [_ref("a", "Guzmán, J."), _ref("b", "Gutiérrez Pulido, H."), _ref("c", "García, L.")]
    assert [r.id for r in sort_referencias_alphabetically(refs)] == ["c", "b", "a"]


def test_la_tilde_no_empuja_al_final():
    from modules.referencias_module import sort_referencias_alphabetically
    refs = [_ref("a", "Báez, R."), _ref("b", "Ávila, M.")]
    assert [r.id for r in sort_referencias_alphabetically(refs)] == ["b", "a"]


def test_sin_autor_ordena_por_titulo():
    from modules.referencias_module import sort_referencias_alphabetically
    refs = [_ref("a", None, title="Zeta"), _ref("b", None, title="Alfa")]
    assert [r.id for r in sort_referencias_alphabetically(refs)] == ["b", "a"]


def _mk_session(monkeypatch, doc):
    from routers import sessions as router
    monkeypatch.setattr(router, "load_session_state", lambda sid, st: doc)
    monkeypatch.setattr(router, "save_session_state", lambda d, st: None)


def test_endpoint_sort_persiste_el_orden(monkeypatch):
    doc = DocumentModel(session_id="s1")
    doc.referencias = [_ref("a", "Zapata, J."), _ref("b", "Aguilar, M.")]
    _mk_session(monkeypatch, doc)
    r = _client().post("/api/references/sort/s1")
    assert r.status_code == 200
    assert [x["id"] for x in r.json()["referencias"]] == ["b", "a"]


def test_endpoint_sort_404_sin_sesion(monkeypatch):
    from routers import sessions as router
    monkeypatch.setattr(router, "load_session_state", lambda sid, st: None)
    r = _client().post("/api/references/sort/nope")
    assert r.status_code == 404


def test_endpoint_sort_usa_referencias_enviadas_por_el_cliente(monkeypatch):
    doc = DocumentModel(session_id="s1")
    # El backend tiene su lista desactualizada o vacía (caso típico de doc en blanco o refs añadidas en UI)
    doc.referencias = [_ref("old", "Zapata, J.")]
    _mk_session(monkeypatch, doc)
    
    # El cliente manda 3 referencias creadas en la interfaz
    client_refs = [
        {"id": "r1", "authors": ["Zapata, J."], "year": "2020", "title": "Obra Z"},
        {"id": "r2", "authors": ["Aguilar, M."], "year": "2021", "title": "Obra A"},
        {"id": "r3", "authors": ["Castro, F."], "year": "2019", "title": "Obra C"},
    ]
    r = _client().post("/api/references/sort/s1", json={"references": client_refs})
    assert r.status_code == 200
    ids_ordenados = [x["id"] for x in r.json()["referencias"]]
    assert ids_ordenados == ["r2", "r3", "r1"]
    # Verifica que además se persistan en doc.referencias del backend
    assert [x.id for x in doc.referencias] == ["r2", "r3", "r1"]

