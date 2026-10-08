"""
WordAPA7 — la copia de trabajo en Word.

`/api/send-to-word/{session_id}` YA NO pisa el `.docx` original del estudiante.
Escribe el APA 7 generado en una copia dentro de `STORAGE_DIR` y abre esa copia.
El original no se toca nunca: no hay `.bak` porque no hay nada que respaldar.

Se fija: (1) el original queda igual byte a byte, (2) la copia se escribe dentro
de STORAGE_DIR con el contenido generado, (3) con cambios sin guardar en Word no
se cierra ni se copia: `requiere_confirmacion`.

El doble de prueba (FakeWord) evita levantar COM en CI, como exige AGENTS.md.
"""

import sys
from contextlib import contextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from fastapi.testclient import TestClient

import modules.word_com as word_com
from main import STORAGE_DIR, app

ORIGINAL = b"contenido-del-estudiante"
GENERADO = b"contenido-generado-en-apa-7"


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def sesion():
    session_id = "test-send-to-word"
    out_dir = STORAGE_DIR / "sessions" / session_id
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "output.docx").write_bytes(GENERADO)
    yield session_id
    import shutil as _shutil
    _shutil.rmtree(out_dir, ignore_errors=True)


@pytest.fixture
def original(tmp_path):
    d = tmp_path / "tesis.docx"
    d.write_bytes(ORIGINAL)
    return d


@pytest.fixture
def sin_com(monkeypatch):
    @contextmanager
    def _que_falla():
        raise OSError("COM no disponible en el test")
        yield  # pragma: no cover
    monkeypatch.setattr(word_com, "word_session", _que_falla)


# ── El doble de prueba de la rama de COM ─────────────────────────────────────

class FakeDocumento:
    def __init__(self, full_name, saved=True):
        self.FullName = full_name
        self.Saved = saved
        self.llamadas = []

    def Save(self):  # noqa: N802
        self.llamadas.append(("Save",))
        self.Saved = True

    def Close(self, SaveChanges=0):  # noqa: N803
        self.llamadas.append(("Close", SaveChanges))
        self.Saved = True


class FakeDocuments:
    def __init__(self, documentos):
        self._docs = list(documentos)

    @property
    def Count(self):  # noqa: N802
        return len(self._docs)

    def __call__(self, indice):
        return self._docs[indice - 1]

    def Open(self, ruta):  # noqa: N802
        self.abrio = ruta
        return None


class FakeWord:
    def __init__(self, documentos):
        self.Documents = FakeDocuments(documentos)


@pytest.fixture
def palabra_sin_certeza(monkeypatch):
    def _instalar(*documentos):
        app_falso = FakeWord(documentos)
        @contextmanager
        def _sesion():
            yield app_falso
        monkeypatch.setattr(word_com, "word_session", _sesion)
        return app_falso
    return _instalar


# ── 1. El original no se toca ────────────────────────────────────────────────

def test_no_pisa_el_original(client, sesion, original, sin_com):
    antes = original.read_bytes()
    r = client.post(f"/api/send-to-word/{sesion}", json={"nombre": str(original)})
    assert r.status_code == 200, r.text
    assert original.read_bytes() == antes, "el original se modificó"


def test_no_deja_backup_al_lado_del_original(client, sesion, original, sin_com):
    client.post(f"/api/send-to-word/{sesion}", json={"nombre": str(original)})
    assert not original.with_name(original.name + ".bak").exists()


def test_la_copia_queda_dentro_del_almacenamiento(client, sesion, original, sin_com):
    r = client.post(f"/api/send-to-word/{sesion}", json={"nombre": str(original)})
    working = Path(r.json()["working_path"])
    assert working.exists()
    assert working.read_bytes() == GENERADO
    working.resolve().relative_to(STORAGE_DIR.resolve())  # no debe lanzar


def test_la_copia_lleva_el_nombre_apa7(client, sesion, original, sin_com):
    r = client.post(f"/api/send-to-word/{sesion}", json={"nombre": str(original)})
    assert Path(r.json()["working_path"]).name == "tesis_APA7.docx"


def test_un_nombre_con_ruta_no_escapa_de_la_carpeta(client, sesion, sin_com):
    r = client.post(f"/api/send-to-word/{sesion}", json={"nombre": "../../evil.docx"})
    assert r.status_code == 200, r.text
    working = Path(r.json()["working_path"])
    assert working.name == "evil_APA7.docx"
    working.resolve().relative_to(STORAGE_DIR.resolve())


def test_la_respuesta_no_trae_backup(client, sesion, original, sin_com):
    r = client.post(f"/api/send-to-word/{sesion}", json={"nombre": str(original)})
    assert "backup" not in r.json()


# ── 2. Lo que está sin guardar ───────────────────────────────────────────────

class TestSinGuardar:

    def _copia_abierta(self, sesion, original):
        return STORAGE_DIR / "sessions" / sesion / "word" / "tesis_APA7.docx"

    def test_no_cierra_una_copia_con_cambios_sin_guardar(
        self, client, sesion, original, palabra_sin_certeza
    ):
        doc = FakeDocumento(str(self._copia_abierta(sesion, original)), saved=False)
        palabra_sin_certeza(doc)
        r = client.post(f"/api/send-to-word/{sesion}", json={"nombre": str(original)})
        assert r.status_code == 409, r.text
        assert r.json()["requiere_confirmacion"] is True
        assert ("Close", 0) not in doc.llamadas

    def test_guardar_manda_save_antes_de_cerrar(
        self, client, sesion, original, palabra_sin_certeza
    ):
        doc = FakeDocumento(str(self._copia_abierta(sesion, original)), saved=False)
        palabra_sin_certeza(doc)
        r = client.post(
            f"/api/send-to-word/{sesion}",
            json={"nombre": str(original), "guardar": True},
        )
        assert r.status_code == 200, r.text
        assert ("Save",) in doc.llamadas

    def test_forzar_descarta_y_sigue(
        self, client, sesion, original, palabra_sin_certeza
    ):
        doc = FakeDocumento(str(self._copia_abierta(sesion, original)), saved=False)
        palabra_sin_certeza(doc)
        r = client.post(
            f"/api/send-to-word/{sesion}",
            json={"nombre": str(original), "forzar": True},
        )
        assert r.status_code == 200, r.text
        assert ("Close", 0) in doc.llamadas
