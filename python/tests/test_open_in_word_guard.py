"""Guard de seguridad de POST /api/open-in-word (monolito + core).

Criterio compartido vía config.validate_open_in_word_path: SOLO se permiten
.docx que resuelvan dentro del STORAGE_DIR del proceso. Casos:
  - .docx dentro del storage      -> 200 (os.startfile mockeado)
  - .docx fuera del storage       -> 400
  - extensión no-.docx en storage -> 400
Ambos motores (main.py y core_server.py) deben comportarse IDÉNTICO.
"""
import os
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient

import config


@pytest.fixture(scope="module")
def mono_client():
    import main as main_mod
    return TestClient(main_mod.app)


@pytest.fixture(scope="module")
def core_client():
    import core_server as core_mod
    return TestClient(core_mod.app)


@pytest.fixture
def sandbox_storage(tmp_path, monkeypatch):
    """STORAGE_DIR redirigido a tmp (el guard lee config.STORAGE_DIR por
    llamada, así que setattr basta) + os.startfile espiado (nunca abre nada)."""
    storage = tmp_path / "storage"
    storage.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(config, "STORAGE_DIR", storage)
    calls: list[str] = []
    monkeypatch.setattr(os, "startfile", lambda p: calls.append(str(p)), raising=False)
    return {"storage": storage, "calls": calls}


def _assert_rejected(client, path: str, calls: list[str]) -> None:
    r = client.post("/api/open-in-word", json={"path": path})
    assert r.status_code == 400
    detail = r.json()["detail"]
    assert "Solo se permiten .docx" in detail, detail
    assert calls == [], "startfile NO debió invocarse"


class TestOpenInWordGuard:
    def test_docx_inside_storage_opens(self, mono_client, core_client, sandbox_storage):
        docx = sandbox_storage["storage"] / f"informe-{uuid.uuid4().hex[:6]}.docx"
        docx.write_bytes(b"PK\x03\x04")  # firma zip mínima; el guard no la mira
        for cli, name in ((mono_client, "mono"), (core_client, "core")):
            sandbox_storage["calls"].clear()
            r = cli.post("/api/open-in-word", json={"path": str(docx)})
            assert r.status_code == 200, name
            assert r.json() == {"ok": True}
            assert len(sandbox_storage["calls"]) == 1, name

    def test_docx_outside_storage_rejected(self, mono_client, core_client, sandbox_storage, tmp_path):
        outside = tmp_path / f"fuga-{uuid.uuid4().hex[:6]}.docx"
        outside.write_bytes(b"PK\x03\x04")
        for cli, name in ((mono_client, "mono"), (core_client, "core")):
            _assert_rejected(cli, str(outside), sandbox_storage["calls"])

    def test_non_docx_extension_rejected(self, mono_client, core_client, sandbox_storage):
        exe = sandbox_storage["storage"] / f"malicioso-{uuid.uuid4().hex[:6]}.exe"
        exe.write_bytes(b"MZ")
        for cli, name in ((mono_client, "mono"), (core_client, "core")):
            _assert_rejected(cli, str(exe), sandbox_storage["calls"])

    def test_traversal_escape_rejected(self, mono_client, core_client, sandbox_storage):
        """../ normalizado no debe colarse fuera del storage."""
        for cli, name in ((mono_client, "mono"), (core_client, "core")):
            _assert_rejected(
                cli,
                str(sandbox_storage["storage"] / ".." / ".." / "system32" / "evil.docx"),
                sandbox_storage["calls"],
            )
