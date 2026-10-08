"""FASE 4 — POST /api/layout/pdf-export: contrato del endpoint.

El endpoint exporta el PDF de sesión usando ExportAsFixedFormat (Word COM).
Sin Word disponible, responde honesto (available: false).
"""
import pytest
from fastapi.testclient import TestClient
from main import app


client = TestClient(app)


def test_pdf_export_endpoint_exists():
    """El endpoint existe y responde."""
    r = client.post("/api/layout/pdf-export", json={"session_id": "test-session"})
    # Puede ser 200 (con o sin Word) o 404 (sesión no encontrada)
    assert r.status_code in (200, 404)


def test_pdf_export_session_not_found():
    """Sesión inexistente → 404 con detalle."""
    r = client.post("/api/layout/pdf-export", json={"session_id": "no-existe"})
    assert r.status_code == 404
    assert "detail" in r.json()


def test_pdf_export_response_shape():
    """Respuesta 200 tiene el shape correcto."""
    r = client.post("/api/layout/pdf-export", json={"session_id": "test-session"})
    if r.status_code == 200:
        data = r.json()
        assert "session_id" in data
        assert "available" in data
        if data["available"]:
            assert "pdf_url" in data
            assert "page_count" in data
        else:
            assert "reason" in data
