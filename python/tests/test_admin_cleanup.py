"""El botón "Depurar caché" de la pestaña App: que borre y que diga qué borró.

El endpoint existía (`python/routers/admin.py`) pero el botón de Ajustes no lo
llamaba: mostraba un toast de éxito sin borrar nada. Estas pruebas miran las dos
cosas que el toast promete — que se borra, y que la cuenta es cierta.
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """TestClient sin context manager (evita lifespan/COM)."""
    from main import app
    return TestClient(app)


def test_el_endpoint_responde_y_dice_que_no_habia_nada(client):
    r = client.post("/api/admin/cleanup")
    assert r.status_code == 200
    cuerpo = r.json()
    # Los dos contadores existen y son números: un mensaje sin cuentas detrás es
    # una afirmación, no un informe.
    assert isinstance(cuerpo["sesiones_borradas"], int)
    assert isinstance(cuerpo["archivos_temporales"], int)
    assert isinstance(cuerpo["bytes"], int)
    assert cuerpo["message"]


def test_el_boton_puede_apretarse_dos_veces_y_la_segunda_igual_mira(client, monkeypatch):
    """La razón de que el endpoint use `force=True` en vez de `maybe_run_gc`.

    `maybe_run_gc` tiene un throttle de una hora: la segunda llamada en cinco
    minutos devolvía cero sin mirar nada, y el botón informaba que no había nada
    que borrar. Con `force`, la segunda pasada corre de verdad.
    """
    from persistence import session_manager as sm

    llamadas = []
    real = sm.cleanup_expired_sessions

    def contando(*args, **kwargs):
        llamadas.append(kwargs.get("force", False))
        return real(*args, **kwargs)

    monkeypatch.setattr("routers.admin.cleanup_expired_sessions", contando)

    assert client.post("/api/admin/cleanup").status_code == 200
    assert client.post("/api/admin/cleanup").status_code == 200
    assert llamadas == [True, True], "la segunda pasada no forzo la limpieza"


def test_cuenta_lo_que_borra(tmp_path, monkeypatch):
    """Con sesiones y temporales vencidos a mano, la cuenta es la de verdad."""
    from persistence import session_manager as sm

    storage = tmp_path / "storage"
    vieja = storage / "sessions" / "vieja"
    vieja.mkdir(parents=True)
    # La carpeta de la sesión vencida tiene un archivo de 4 KB: cuenta como
    # bytes, NO como temporal, porque se va con `rmtree` de la carpeta entera.
    (vieja / "documento.docx").write_bytes(b"x" * 4096)
    # Y una sesión VIVA con un temporal viejo: ese sí se cuenta uno por uno.
    viva = storage / "sessions" / "viva"
    viva.mkdir(parents=True)
    temporal = viva / "preview.pdf"
    temporal.write_bytes(b"y" * 2048)
    viejo = time.time() - 10 * 24 * 3600
    import os
    os.utime(temporal, (viejo, viejo))

    # Una sesión vencida, con su carpeta y su fila en la base.
    sm.init_db(storage)
    import sqlite3
    conn = sqlite3.connect(str(sm.DB_PATH))
    conn.execute(
        "INSERT INTO session_data (session_id, data, updated_at) VALUES (?, ?, ?)",
        ("vieja", "{}", "2000-01-01 00:00:00"),
    )
    conn.commit()
    conn.close()

    contadores = {}
    borradas = sm.cleanup_expired_sessions(storage, force=True, contadores=contadores)

    assert borradas == 1, "la sesión vencida no se contó"
    assert not vieja.exists(), "la carpeta de la sesión vencida sigue ahí"
    assert not temporal.exists(), "el temporal viejo sigue ahí"
    assert contadores["archivos_temporales"] == 1
    assert contadores["bytes"] == 4096 + 2048


def test_el_mensaje_dice_las_cuentas():
    """El texto del toast se arma en el backend: se prueba sin servidor."""
    from routers.admin import _mib

    assert _mib(0) == "0 B"
    assert _mib(900) == "900 B"
    assert _mib(2048) == "2 KB"
    assert _mib(3 * 1024 * 1024) == "3.0 MB"
