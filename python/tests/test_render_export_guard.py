# python/tests/test_render_export_guard.py
"""Fase 5 — Guard D-a en rutas de render/export: sin COM → 503."""
import sys
import pathlib
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


def _client():
    from fastapi.testclient import TestClient
    from main import app
    return TestClient(app)


def _mock_session():
    """Mock de load_session_state que retorna un documento válido."""
    mock_doc = MagicMock()
    mock_doc.file_name = "test.docx"
    mock_doc.elements = [MagicMock()]
    mock_doc.portada = {"detected": False, "use_original_cover": False}
    mock_doc.meta = {}
    return mock_doc


def test_generate_no_com_returns_503():
    """Sin COM, /api/generate debe retornar 503 con mensaje claro."""
    with patch("main.load_session_state", return_value=_mock_session()), \
         patch("services.doc_converter.get_doc_converter") as mock_get:
        mock_converter = MagicMock()
        mock_converter.get_active_engine.side_effect = RuntimeError("Se requiere Microsoft Word")
        mock_get.return_value = mock_converter

        r = _client().post("/api/generate", json={
            "session_id": "test-session",
            "elements": [],
            "apa_rules": {},
        })
        assert r.status_code == 503, f"Esperado 503, llegó {r.status_code}"
        assert "Microsoft Word" in r.json()["detail"]


def test_export_pdf_no_com_returns_503():
    """Sin COM, /api/generate-pdf debe retornar 503 con mensaje claro."""
    with patch("main.load_session_state", return_value=_mock_session()), \
         patch("services.doc_converter.get_doc_converter") as mock_get:
        mock_converter = MagicMock()
        mock_converter.get_active_engine.side_effect = RuntimeError("Se requiere Microsoft Word")
        mock_get.return_value = mock_converter

        r = _client().post("/api/generate-pdf", json={
            "session_id": "test-session",
            "elements": [],
            "apa_rules": {},
        })
        assert r.status_code == 503, f"Esperado 503, llegó {r.status_code}"
        assert "Microsoft Word" in r.json()["detail"]


def test_generate_com_available_passes_guard():
    """Con COM, /api/generate no debe retornar 503 por guard D-a."""
    with patch("main.load_session_state", return_value=_mock_session()), \
         patch("services.doc_converter.get_doc_converter") as mock_get, \
         patch("main.generate_apa7_docx", side_effect=Exception("mock")), \
         patch("main._session_rules", return_value=MagicMock()), \
         patch("main._session_portada", return_value=MagicMock()), \
         patch("main._session_meta", return_value=MagicMock()), \
         patch("main._session_references", return_value=[]):
        mock_converter = MagicMock()
        mock_converter.get_active_engine.return_value = "COM"
        mock_get.return_value = mock_converter

        # No importa si el resto del endpoint falla; el guard no debe bloquear
        r = _client().post("/api/generate", json={
            "session_id": "test-session",
            "elements": [],
            "apa_rules": {},
        })
        # No debe ser 503 por guard D-a (puede ser otro error por mocks incompletos)
        assert r.status_code != 503 or "Microsoft Word" not in r.json().get("detail", "")
