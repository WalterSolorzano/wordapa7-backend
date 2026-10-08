"""Historial de snapshots: listar y restaurar."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from fastapi.testclient import TestClient

from main import STORAGE_DIR, app
from persistence import session_manager


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def sesion(monkeypatch, tmp_path):
    session_id = "test-snapshots"
    monkeypatch.setattr(session_manager, "DB_PATH", None)
    session_manager.init_db(tmp_path)
    yield session_id, tmp_path
    session_manager.DB_PATH = None


def _doc(session_id, nombre):
    from models import DocumentModel
    d = DocumentModel(session_id=session_id)
    d.file_name = nombre
    return d


def test_listar_devuelve_los_snapshots_de_la_sesion(sesion):
    session_id, storage = sesion
    session_manager.save_session_snapshot(_doc(session_id, "uno.docx"), storage)
    session_manager.save_session_snapshot(_doc(session_id, "dos.docx"), storage)

    lista = session_manager.list_session_snapshots(session_id, storage)

    assert len(lista) == 2
    assert lista[0]["id"] > lista[1]["id"]  # más nuevo primero
    assert "created_at" in lista[0]


def test_restaurar_devuelve_el_estado_del_snapshot(sesion):
    session_id, storage = sesion
    session_manager.save_session_snapshot(_doc(session_id, "viejo.docx"), storage)
    snap_id = session_manager.list_session_snapshots(session_id, storage)[0]["id"]

    restaurado = session_manager.load_session_snapshot(snap_id, storage)

    assert restaurado is not None
    assert restaurado.file_name == "viejo.docx"


def test_snapshot_de_otra_sesion_no_se_restaura(sesion):
    session_id, storage = sesion
    session_manager.save_session_snapshot(_doc("otra", "x.docx"), storage)
    snap_id = session_manager.list_session_snapshots("otra", storage)[0]["id"]

    assert session_manager.load_session_snapshot(snap_id, storage).session_id == "otra"
    # el endpoint debe rechazar el cruce de sesión


def test_endpoint_listar(client, sesion, monkeypatch):
    session_id, storage = sesion
    monkeypatch.setattr("routers.sessions.STORAGE_DIR", storage)
    session_manager.save_session_snapshot(_doc(session_id, "a.docx"), storage)
    r = client.get(f"/api/sessions/{session_id}/snapshots")
    assert r.status_code == 200, r.text
    assert len(r.json()["snapshots"]) == 1


def test_endpoint_restaurar_devuelve_el_estado_guardado(client, sesion, monkeypatch):
    session_id, storage = sesion
    monkeypatch.setattr("routers.sessions.STORAGE_DIR", storage)
    session_manager.save_session_snapshot(_doc(session_id, "a.docx"), storage)
    snap_id = session_manager.list_session_snapshots(session_id, storage)[0]["id"]

    r = client.post(f"/api/sessions/{session_id}/restore-snapshot/{snap_id}")

    assert r.status_code == 200, r.text
    assert r.json()["file_name"] == "a.docx"


def test_endpoint_restaurar_rechaza_un_snapshot_de_otra_sesion(client, sesion, monkeypatch):
    """Un id adivinado no puede traer el documento de otra sesión: 404."""
    session_id, storage = sesion
    monkeypatch.setattr("routers.sessions.STORAGE_DIR", storage)
    session_manager.save_session_snapshot(_doc("otra", "x.docx"), storage)
    snap_id = session_manager.list_session_snapshots("otra", storage)[0]["id"]

    r = client.post(f"/api/sessions/{session_id}/restore-snapshot/{snap_id}")

    assert r.status_code == 404, r.text
