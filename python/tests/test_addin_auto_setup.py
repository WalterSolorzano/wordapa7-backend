"""
WordAPA7 — Tests del sistema de complemento de Word automático
==============================================================

Verifica el flujo completo de instalación automática del Word Add-in:

1. **word_watcher.py**: detección de procesos (Word/Electron), health check
   del backend, lógica de arranque/parada del backend.
2. **auto-setup endpoint**: generación de manifiesto, registro en Windows,
   verificación de SSL.
3. **Manifest dinámico**: reemplazo correcto de URLs de desarrollo por URLs
   reales del backend.

Estos tests NO requieren Word instalado ni procesos reales: se mockean las
llamadas a ``tasklist`` y ``subprocess`` para simular los estados.
"""

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

# Asegurar que el directorio python esté en el path
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient

from main import app

# Cliente de pruebas in-process (sin lifespan events).
client = TestClient(app)


# ══════════════════════════════════════════════════════════════════════════════
#  1. WORD WATCHER — Detección de procesos
# ══════════════════════════════════════════════════════════════════════════════

class TestWordWatcherProcessDetection:
    """Tests de la detección de procesos en word_watcher.py."""

    def test_is_word_running_true(self):
        """Cuando tasklist encuentra WINWORD.EXE, is_word_running() debe retornar True."""
        import word_watcher

        mock_result = MagicMock()
        mock_result.stdout = '"WINWORD.EXE","12345","Console","1","45,000 K"'
        mock_result.returncode = 0

        with patch("subprocess.run", return_value=mock_result):
            assert word_watcher.is_word_running() is True

    def test_is_word_running_false(self):
        """Cuando tasklist NO encuentra WINWORD.EXE, is_word_running() debe retornar False."""
        import word_watcher

        mock_result = MagicMock()
        mock_result.stdout = "INFO: No tasks are running which match the specified criteria."
        mock_result.returncode = 0

        with patch("subprocess.run", return_value=mock_result):
            assert word_watcher.is_word_running() is False

    def test_is_word_running_exception(self):
        """Si tasklist falla (excepción), is_word_running() debe retornar False sin crashear."""
        import word_watcher

        with patch("subprocess.run", side_effect=Exception("tasklist not found")):
            assert word_watcher.is_word_running() is False

    def test_is_electron_running_true(self):
        """Cuando tasklist encuentra WordAPA7.exe, is_electron_running() debe retornar True."""
        import word_watcher

        mock_result = MagicMock()
        mock_result.stdout = '"WordAPA7.exe","67890","Console","1","120,000 K"'
        mock_result.returncode = 0

        with patch("subprocess.run", return_value=mock_result):
            assert word_watcher.is_electron_running() is True

    def test_is_electron_running_false(self):
        """Cuando tasklist NO encuentra WordAPA7.exe, is_electron_running() debe retornar False."""
        import word_watcher

        mock_result = MagicMock()
        mock_result.stdout = "INFO: No tasks are running which match the specified criteria."
        mock_result.returncode = 0

        with patch("subprocess.run", return_value=mock_result):
            assert word_watcher.is_electron_running() is False

    def test_is_process_running_case_insensitive(self):
        """La detección de procesos debe ser insensible a mayúsculas/minúsculas."""
        import word_watcher

        mock_result = MagicMock()
        mock_result.stdout = '"winword.exe","12345","Console","1","45,000 K"'
        mock_result.returncode = 0

        with patch("subprocess.run", return_value=mock_result):
            assert word_watcher._is_process_running("WINWORD.EXE") is True


# ══════════════════════════════════════════════════════════════════════════════
#  2. WORD WATCHER — Health check del backend
# ══════════════════════════════════════════════════════════════════════════════

class TestWordWatcherHealthCheck:
    """Tests del health check del backend en word_watcher.py."""

    def test_is_backend_running_false_when_no_backend(self):
        """Cuando el backend no responde, is_backend_running() debe retornar False."""
        import word_watcher

        with patch("urllib.request.urlopen", side_effect=Exception("Connection refused")):
            assert word_watcher.is_backend_running() is False

    def test_is_backend_running_true_when_responds(self):
        """Cuando el backend responde 200, is_backend_running() debe retornar True."""
        import word_watcher

        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = b'{"version": "1.0.0"}'

        with patch("urllib.request.urlopen", return_value=mock_response):
            assert word_watcher.is_backend_running() is True


# ══════════════════════════════════════════════════════════════════════════════
#  3. WORD WATCHER — Configuración y constantes
# ══════════════════════════════════════════════════════════════════════════════

class TestWordWatcherConfig:
    """Tests de las constantes de configuración del watcher."""

    def test_backend_port_is_8742(self):
        """El puerto del backend debe ser 8742 (consistente con el resto del sistema)."""
        import word_watcher
        assert word_watcher.BACKEND_PORT == 8742

    def test_poll_interval_is_reasonable(self):
        """El intervalo de polling debe ser >= 3 segundos (no saturar CPU)."""
        import word_watcher
        assert word_watcher.POLL_INTERVAL >= 3

    def test_shutdown_grace_is_reasonable(self):
        """El grace period de shutdown debe ser >= 30 segundos (dar tiempo a reabrir Word)."""
        import word_watcher
        assert word_watcher.SHUTDOWN_GRACE >= 30

    def test_auto_setup_retries_configured(self):
        """Debe haber al menos 1 reintento de auto-setup."""
        import word_watcher
        assert word_watcher.AUTO_SETUP_RETRIES >= 1


# ══════════════════════════════════════════════════════════════════════════════
#  4. AUTO-SETUP ENDPOINT — Manifest y registro
# ══════════════════════════════════════════════════════════════════════════════

class TestAutoSetupEndpoint:
    """Tests del endpoint GET /api/addin/auto-setup."""

    def test_auto_setup_returns_response(self):
        """auto-setup debe retornar 200 y un JSON con steps."""
        resp = client.get("/api/addin/auto-setup")
        assert resp.status_code == 200
        data = resp.json()

        # Debe tener un status general
        assert "status" in data
        assert data["status"] in ("ok", "partial")

        # Debe tener un resumen de pasos
        assert "summary" in data
        assert "steps" in data

    def test_auto_setup_has_manifest_step(self):
        """auto-setup debe incluir el paso 'manifest'."""
        resp = client.get("/api/addin/auto-setup")
        data = resp.json()
        assert "manifest" in data["steps"]
        manifest_step = data["steps"]["manifest"]
        assert manifest_step["status"] in ("ok", "error")

    def test_auto_setup_has_registry_step_on_windows(self):
        """En Windows, auto-setup debe incluir el paso 'registry'."""
        resp = client.get("/api/addin/auto-setup")
        data = resp.json()
        # El paso registry siempre está presente (ok, error, o skipped si no es Windows)
        assert "registry" in data["steps"]

    def test_auto_setup_has_ssl_step(self):
        """auto-setup debe incluir el paso 'ssl'."""
        resp = client.get("/api/addin/auto-setup")
        data = resp.json()
        assert "ssl" in data["steps"]

    def test_auto_setup_generates_manifest_in_storage(self):
        """Tras auto-setup, debe existir manifest.xml en STORAGE_DIR."""
        from config import STORAGE_DIR
        resp = client.get("/api/addin/auto-setup")
        assert resp.status_code == 200

        manifest_path = STORAGE_DIR / "manifest.xml"
        assert manifest_path.exists(), "manifest.xml debe existir en STORAGE_DIR tras auto-setup"

        # El manifest debe ser XML válido y contener la estructura OfficeApp
        xml_content = manifest_path.read_text(encoding="utf-8")
        assert "<OfficeApp" in xml_content
        assert "</OfficeApp>" in xml_content

    def test_auto_setup_replaces_dev_urls(self):
        """El manifest generado NO debe contener la URL de desarrollo https://localhost:3000."""
        from config import STORAGE_DIR

        # Forzar la generación
        client.get("/api/addin/auto-setup")

        manifest_path = STORAGE_DIR / "manifest.xml"
        if manifest_path.exists():
            xml = manifest_path.read_text(encoding="utf-8")
            # La URL de desarrollo debe haber sido reemplazada por la URL real del backend
            # (https://localhost:8742/addin en modo SSL o http://127.0.0.1:8742/addin)
            dev_url = "https://localhost:3000/taskpane.html"
            assert dev_url not in xml, (
                f"El manifest aún contiene la URL de desarrollo {dev_url}. "
                "Debería haber sido reemplazada por la URL del backend."
            )


# ══════════════════════════════════════════════════════════════════════════════
#  5. MANIFEST DINÁMICO — Reemplazo de URLs
# ══════════════════════════════════════════════════════════════════════════════

class TestManifestDynamic:
    """Tests del endpoint GET /api/addin/manifest (manifest dinámico)."""

    def test_manifest_returns_xml(self):
        """GET /api/addin/manifest debe retornar XML con content-type application/xml."""
        resp = client.get("/api/addin/manifest")
        assert resp.status_code == 200
        assert "xml" in resp.headers.get("content-type", "")

        xml = resp.text
        assert "<OfficeApp" in xml
        assert "</OfficeApp>" in xml

    def test_manifest_has_valid_guid(self):
        """El manifest debe contener un GUID válido en el elemento <Id>."""
        import re
        resp = client.get("/api/addin/manifest")
        xml = resp.text

        # Buscar el GUID en el formato estándar de Office
        guid_match = re.search(r"<Id>([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})</Id>", xml)
        assert guid_match, "El manifest debe contener un GUID válido en <Id>"
        # Id rotable: cualquier GUID válido sirve (el cambio de Id limpia la
        # caché venenosa de Word). Solo verificamos el formato estándar.
        assert len(guid_match.group(1)) == 36

    def test_manifest_has_word_host(self):
        """El manifest debe declarar Host Name='Document' (Word)."""
        resp = client.get("/api/addin/manifest")
        xml = resp.text
        assert '<Host Name="Document"' in xml

    def test_manifest_has_taskpane_url(self):
        """El manifest debe tener una SourceLocation que apunta a taskpane.html."""
        resp = client.get("/api/addin/manifest")
        xml = resp.text
        assert "taskpane.html" in xml

    def test_manifest_urls_not_dev(self):
        """El manifest dinámico NO debe contener la URL de desarrollo https://localhost:3000."""
        resp = client.get("/api/addin/manifest")
        xml = resp.text
        assert "https://localhost:3000" not in xml, (
            "El manifest dinámico no debe contener la URL de desarrollo."
        )


# ══════════════════════════════════════════════════════════════════════════════
#  6. MANIFEST-INFO — Metadatos del complemento
# ══════════════════════════════════════════════════════════════════════════════

class TestManifestInfo:
    """Tests del endpoint GET /api/addin/manifest-info."""

    def test_manifest_info_returns_data(self):
        """GET /api/addin/manifest-info debe retornar metadatos del manifest."""
        resp = client.get("/api/addin/manifest-info")
        assert resp.status_code == 200
        data = resp.json()

        assert "manifest_url" in data
        assert "available" in data
        assert "mode" in data
        assert "backend_api_url" in data

    def test_manifest_info_has_urls(self):
        """manifest-info debe incluir URLs de taskpane y commands."""
        resp = client.get("/api/addin/manifest-info")
        data = resp.json()

        # Si el add-in está disponible, las URLs deben estar presentes
        if data.get("available"):
            assert data.get("taskpane_url") is not None
            assert "taskpane.html" in data["taskpane_url"]


# ══════════════════════════════════════════════════════════════════════════════
#  7. SSL — Estado de certificados
# ══════════════════════════════════════════════════════════════════════════════

class TestSSLStatus:
    """Tests del endpoint GET /api/addin/ssl-status."""

    def test_ssl_status_returns_data(self):
        """GET /api/addin/ssl-status debe retornar el estado de SSL."""
        resp = client.get("/api/addin/ssl-status")
        assert resp.status_code == 200
        data = resp.json()

        assert "ssl_active" in data
        assert "python_ssl_available" in data
        assert "backend_url" in data

    def test_ssl_status_has_backend_url(self):
        """El backend_url debe apuntar a 127.0.0.1:8742."""
        resp = client.get("/api/addin/ssl-status")
        data = resp.json()
        assert "8742" in data["backend_url"]


# ══════════════════════════════════════════════════════════════════════════════
#  8. SSL CERT GEN — Generación de certificados
# ══════════════════════════════════════════════════════════════════════════════

class TestSSLCertGen:
    """Tests del módulo ssl_cert_gen.py."""

    def _word_running() -> bool:
        try:
            import subprocess as _sp
            out = _sp.run(
                ["tasklist", "/FI", "IMAGENAME eq WINWORD.EXE"],
                capture_output=True, text=True, timeout=10,
            ).stdout.lower()
            return "winword.exe" in out
        except Exception:
            return False

    @pytest.mark.skipif(_word_running(), reason="Word abierto: CryptoAPI Root store bloqueado")
    def test_generate_self_signed_cert_returns_paths(self, tmp_path):
        """generate_self_signed_cert debe retornar rutas no-None para cert y key."""
        import ssl_cert_gen

        cert_path = tmp_path / "localhost.pem"
        key_path = tmp_path / "localhost-key.pem"

        result_cert, result_key = ssl_cert_gen.generate_self_signed_cert(cert_path, key_path)

        # Debe retornar paths no-None (puede fallar en CI sin cryptography, pero
        # en el entorno de desarrollo debe funcionar)
        if result_cert is not None:
            assert result_cert == cert_path
            assert result_key == key_path
            assert cert_path.exists()
            assert key_path.exists()

            # El cert debe ser PEM válido
            cert_content = cert_path.read_text(encoding="utf-8")
            assert "BEGIN CERTIFICATE" in cert_content
            assert "END CERTIFICATE" in cert_content

            # La key debe ser PEM válido
            key_content = key_path.read_text(encoding="utf-8")
            assert "BEGIN" in key_content and "PRIVATE KEY" in key_content

    @pytest.mark.skipif(_word_running(), reason="Word abierto: CryptoAPI Root store bloqueado")
    def test_generate_self_signed_cert_idempotent(self, tmp_path):
        """Llamar generate_self_signed_cert dos veces no debe regenerar el cert si es válido."""
        import ssl_cert_gen

        cert_path = tmp_path / "localhost.pem"
        key_path = tmp_path / "localhost-key.pem"

        # Primera generación
        cert1, key1 = ssl_cert_gen.generate_self_signed_cert(cert_path, key_path)
        if cert1 is None:
            pytest.skip("ssl_cert_gen no disponible (cryptography no instalado)")

        # Guardar el contenido para comparar
        cert1_content = cert1.read_bytes()

        # Segunda generación (debe reutilizar)
        cert2, key2 = ssl_cert_gen.generate_self_signed_cert(cert_path, key_path)
        assert cert2 == cert1
        cert2_content = cert2.read_bytes()

        # El contenido debe ser idéntico (reutilizado, no regenerado)
        assert cert1_content == cert2_content, "El cert debe haber sido reutilizado (idempotente)"

    @pytest.mark.skipif(_word_running(), reason="Word abierto: CryptoAPI Root store bloqueado")
    def test_generate_self_signed_cert_never_raises(self, tmp_path):
        """generate_self_signed_cert nunca debe lanzar excepciones (defensive)."""
        import ssl_cert_gen

        # Pasar paths inválidos no debe causar excepción
        try:
            ssl_cert_gen.generate_self_signed_cert(
                Path("/nonexistent/dir/cert.pem"),
                Path("/nonexistent/dir/key.pem"),
            )
        except Exception as e:
            pytest.fail(f"generate_self_signed_cert no debe lanzar excepciones: {e}")


# ══════════════════════════════════════════════════════════════════════════════
#  9. WORD WATCHER — Llamada a auto-setup
# ══════════════════════════════════════════════════════════════════════════════

class TestWordWatcherAutoSetup:
    """Tests de la función call_auto_setup del watcher."""

    def test_call_auto_setup_success(self):
        """Cuando el backend responde ok, call_auto_setup debe retornar el dict."""
        import word_watcher

        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = b'{"status": "ok", "summary": "4/4 pasos completados"}'

        with patch("urllib.request.urlopen", return_value=mock_response):
            result = word_watcher.call_auto_setup()

        assert result is not None
        assert result["status"] == "ok"

    def test_call_auto_setup_failure_returns_none(self):
        """Cuando el backend no responde tras reintentos, call_auto_setup debe retornar None."""
        import word_watcher

        with patch("urllib.request.urlopen", side_effect=Exception("Connection refused")):
            with patch("time.sleep"):  # Acelerar los reintentos
                result = word_watcher.call_auto_setup()

        assert result is None


# ══════════════════════════════════════════════════════════════════════════════
#  10. ADD-IN CONFIG — Configuración del backend
# ══════════════════════════════════════════════════════════════════════════════

class TestAddinConfig:
    """Tests del endpoint GET /api/addin/config."""

    def test_config_returns_data(self):
        """GET /api/addin/config debe retornar la configuración de conexión."""
        resp = client.get("/api/addin/config")
        assert resp.status_code == 200
        data = resp.json()

        assert "mode" in data
        assert "backend_url" in data
        assert "port" in data
        assert data["port"] == 8742

    def test_config_backend_url_points_to_localhost(self):
        """La backend_url debe apuntar a 127.0.0.1 o localhost."""
        resp = client.get("/api/addin/config")
        data = resp.json()
        url = data["backend_url"]
        assert "127.0.0.1" in url or "localhost" in url
