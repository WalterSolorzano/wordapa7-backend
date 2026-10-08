"""FASE 3.1 — /api/audit/pagination: schema + integración condicional."""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient


def _client():
    from main import app
    return TestClient(app)


def test_endpoint_shape_with_mocked_com(monkeypatch):
    from generation import post_processor as pp

    def fake_audit(self, path, expected_pages=None, timeout_s=45.0):
        return {"available": True, "status": "ok", "pages": 12,
                "warnings": ["1 figura(s) exceden el área imprimible"],
                "elapsed_ms": 900}

    monkeypatch.setattr(pp.COMPostProcessor, "audit_pagination", fake_audit)
    c = _client()
    r = c.post("/api/audit/pagination",
               files={"file": ("d.docx", b"PK\x03\x04fake", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
               data={"expected_pages": "10"})
    assert r.status_code == 200
    data = r.json()
    assert data["available"] is True and data["pages"] == 12
    assert any("exceden" in w for w in data["warnings"])


def test_honest_unavailable_when_no_word(monkeypatch):
    from generation import post_processor as pp

    def fake_audit(self, path, expected_pages=None, timeout_s=45.0):
        return {"available": False, "reason": "COM no disponible",
                "warnings": [], "pages": None}

    monkeypatch.setattr(pp.COMPostProcessor, "audit_pagination", fake_audit)
    c = _client()
    r = c.post("/api/audit/pagination",
               files={"file": ("d.docx", b"PK\x03\x04fake")})
    data = r.json()
    assert data["available"] is False and data["pages"] is None


def _word_available() -> bool:
    try:
        import win32com.client  # noqa
        import pythoncom
        pythoncom.CoInitialize()
        w = win32com.client.DispatchEx("Word.Application")
        w.Quit()
        return True
    except Exception:
        return False


def test_integration_real_word_overflow_detected():
    if not _word_available():
        import pytest
        pytest.skip("Word COM no disponible en esta máquina")
    from docx import Document
    from docx.shared import Cm
    d = Document()
    d.add_paragraph("Portada corta")
    p = d.add_paragraph()
    p.add_run().add_picture(
        io_bytes(), width=Cm(14)) if False else None
    # imagen alta que desborda la página usable (~24.7cm A4)
    run = d.paragraphs[-1].add_run()
    run.add_picture(_tiny_png_big_height(), height=Cm(35))
    import tempfile
    tmp = pathlib.Path(tempfile.mkdtemp()) / "overflow.docx"
    d.save(str(tmp))
    from generation.post_processor import get_com_post_processor
    res = get_com_post_processor().audit_pagination(tmp)
    assert res["available"] is True and res["pages"] >= 2
    assert any("exceden" in w for w in res["warnings"])


def _tiny_png_big_height():
    """PNG 1x1 estirado por height_cm via COM add_picture(height=...)."""
    import base64
    return __import__("io").BytesIO(base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="))
