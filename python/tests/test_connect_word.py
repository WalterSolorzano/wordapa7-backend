"""`POST /api/connect-word`: traer a primer plano el Word DEL USUARIO.

Que problema resuelve, y que NO resuelve.

La app no puede abrir el panel del complemento desde afuera: el taskpane de
Office.js se abre con un gesto dentro de Word (el boton del ribbon) o con
`setStartupBehavior(load)`. Lo que si puede es abrir el `.docx` del usuario con
su Word ya en ejecucion, que es donde el panel vive. Este endpoint hace
exactamente eso y nada mas.

Por eso el contrato es deliberadamente pobre: devuelve `ok` y NADA sobre el
estado de la conexion. La conexion la prueba el latido del add-in
(`/api/addin/sideload-status-v2.active_in_word`). Si este endpoint devolviera un
`connected: true`, la app podria pintar "conectado" por haber abierto un archivo,
que es justo la mentira que el chip no puede contar.
"""
import os
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def cliente():
    import main as main_mod
    return TestClient(main_mod.app)


@pytest.fixture
def startfile_espiado(monkeypatch):
    """`os.startfile` espiado: el test nunca abre un Word de verdad."""
    abiertos: list[str] = []
    monkeypatch.setattr(os, "startfile", lambda p: abiertos.append(str(p)), raising=False)
    return abiertos


class TestConnectWordAbreElArchivoDelUsuario:
    def test_un_docx_real_se_abre(self, cliente, startfile_espiado, tmp_path):
        docx = tmp_path / f"tesis-{uuid.uuid4().hex[:6]}.docx"
        docx.write_bytes(b"PK\x03\x04")

        r = cliente.post("/api/connect-word", json={"path": str(docx)})

        assert r.status_code == 200, r.text
        assert startfile_espiado == [str(docx)]


class TestConnectWordRechazaLoQueNoEsUnDocx:
    def test_extension_ajena_es_rechazada(self, cliente, startfile_espiado, tmp_path):
        malicioso = tmp_path / f"algo-{uuid.uuid4().hex[:6]}.exe"
        malicioso.write_bytes(b"MZ")

        r = cliente.post("/api/connect-word", json={"path": str(malicioso)})

        assert r.status_code == 400, r.text
        assert startfile_espiado == [], "un archivo que no es .docx no se abre"

    def test_archivo_inexistente_es_rechazado(self, cliente, startfile_espiado, tmp_path):
        fantasma = tmp_path / f"no-existe-{uuid.uuid4().hex[:6]}.docx"

        r = cliente.post("/api/connect-word", json={"path": str(fantasma)})

        assert r.status_code == 400, r.text
        assert startfile_espiado == []

    def test_directorio_es_rechazado(self, cliente, startfile_espiado, tmp_path):
        """Un directorio llamado .docx no es un documento."""
        carpeta = tmp_path / "carpeta.docx"
        carpeta.mkdir()

        r = cliente.post("/api/connect-word", json={"path": str(carpeta)})

        assert r.status_code == 400, r.text
        assert startfile_espiado == []

    def test_ruta_vacia_es_rechazada(self, cliente, startfile_espiado):
        r = cliente.post("/api/connect-word", json={"path": ""})

        assert r.status_code == 400, r.text
        assert startfile_espiado == []


class TestLaRespuestaNoMienteSobreLaConexion:
    def test_no_anuncia_ningun_estado_de_conexion(self, cliente, startfile_espiado, tmp_path):
        """Abrir un archivo no es conectar: la respuesta no puede decir que si.

        El estado real lo prueba el latido del complemento. Si este cuerpo
        trajera `connected` o `active_in_word`, la UI podria pintarse conectada
        por haber abierto un `.docx`, y el chip estaria afirmando algo que no
        comprobo.
        """
        docx = tmp_path / f"informe-{uuid.uuid4().hex[:6]}.docx"
        docx.write_bytes(b"PK\x03\x04")

        cuerpo = cliente.post("/api/connect-word", json={"path": str(docx)}).json()

        assert cuerpo == {"ok": True}, cuerpo
        for bandera_prohibida in ("connected", "active_in_word", "conectado", "vinculado"):
            assert bandera_prohibida not in cuerpo
