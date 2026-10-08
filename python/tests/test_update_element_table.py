"""
WordAPA7 — Test: UpdateElementRequest with table_info (C2)

Verifies that the /api/update-element endpoint correctly persists
table_info changes (caption, note, table_number) when the frontend
sends them as part of the request body.

These tests use FastAPI's TestClient with an in-memory temporary storage
so no real session is needed — we create one via /api/start-blank and then
insert a table element manually.
"""

import sys
from pathlib import Path

# Ensure the python directory is on the path
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from fastapi.testclient import TestClient

from main import app, STORAGE_DIR
from models import (
    DocumentModel,
    ElementModel,
    ElementType,
    TableModel,
)
from persistence.session_manager import save_session_state


@pytest.fixture
def client():
    """TestClient without lifespan (avoids starting COM/LO services).

    Nota: NO usar `with TestClient(...)` — el context manager dispara los
    eventos de lifespan (startup/shutdown). En shutdown, main.py llama a
    word_com_service.stop() que intenta Quit sobre Word COM no inicializado
    en el hilo de test → "Windows fatal exception: code 0x800401f0".
    Construir el TestClient sin context manager omite el lifespan (igual que
    test_proofread_batch.py) y evita el crash de teardown.
    """
    c = TestClient(app)
    yield c


@pytest.fixture
def session_with_table(tmp_path):
    """Create a session with one table element in storage."""
    session_id = "test-table-session-c2"

    table_elem = ElementModel(
        id="table-1",
        type=ElementType.TABLE,
        text="",
        style_name="Normal",
        alignment="left",
        font_name="Times New Roman",
        font_size=12,
        is_bold=False,
        is_italic=False,
        is_bullet=False,
        left_indent_cm=0,
        confidence=0.9,
        is_user_modified=False,
        needs_review=False,
        auto_applied=False,
        cita_ids=[],
        table_info=TableModel(
            element_id="table-1",
            headers=["Variable", "Media", "Desviación"],
            rows=[["Edad", "25.3", "3.1"]],
            caption="",
            note="",
            table_number=1,
        ),
    )

    doc = DocumentModel(
        session_id=session_id,
        file_name="test_tables.docx",
        apa_format="student",
        elements=[table_elem],
    )

    save_session_state(doc, STORAGE_DIR)
    yield session_id

    # Cleanup: remove the session dir if it exists
    session_dir = STORAGE_DIR / "sessions" / session_id
    if session_dir.exists():
        import shutil
        shutil.rmtree(session_dir, ignore_errors=True)


@pytest.fixture
def session_with_paragraph(tmp_path):
    """Create a session with one paragraph element, para probar cambios de tipo."""
    session_id = "test-paragraph-session-c2"

    parrafo = ElementModel(
        id="p-1",
        type=ElementType.PARAGRAPH,
        text="Texto de prueba",
        style_name="Normal",
        alignment="left",
        font_name="Times New Roman",
        font_size=12,
        is_bold=False,
        is_italic=False,
        is_bullet=False,
        left_indent_cm=0,
        confidence=0.9,
        is_user_modified=False,
    )
    doc = DocumentModel(
        session_id=session_id,
        file_name="test_parrafos.docx",
        apa_format="student",
        elements=[parrafo],
    )
    save_session_state(doc, STORAGE_DIR)
    yield session_id
    session_dir = STORAGE_DIR / "sessions" / session_id
    if session_dir.exists():
        import shutil
        shutil.rmtree(session_dir, ignore_errors=True)


class TestUpdateElementTableInfo:
    """C2: Verify table_info persists via the /update-element endpoint."""

    def test_update_table_caption(self, client, session_with_table):
        """Updating table_info.caption should persist in the session."""
        resp = client.post(
            "/api/update-element",
            json={
                "session_id": session_with_table,
                "element_id": "table-1",
                "type": "table",
                "heading_level": 1,
                "table_info": {
                    "caption": "Resultados del análisis estadístico",
                    "table_number": 2,
                },
            },
        )
        assert resp.status_code == 200, resp.text
        doc = resp.json()
        elem = next(e for e in doc["elements"] if e["id"] == "table-1")
        assert elem["table_info"]["caption"] == "Resultados del análisis estadístico"
        assert elem["table_info"]["table_number"] == 2
        # Headers/rows should be preserved
        assert elem["table_info"]["headers"] == ["Variable", "Media", "Desviación"]
        assert len(elem["table_info"]["rows"]) == 1

    def test_update_table_note(self, client, session_with_table):
        """Updating table_info.note should persist."""
        resp = client.post(
            "/api/update-element",
            json={
                "session_id": session_with_table,
                "element_id": "table-1",
                "type": "table",
                "heading_level": 1,
                "table_info": {
                    "note": "Datos recopilados en 2024.",
                },
            },
        )
        assert resp.status_code == 200, resp.text
        doc = resp.json()
        elem = next(e for e in doc["elements"] if e["id"] == "table-1")
        assert elem["table_info"]["note"] == "Datos recopilados en 2024."

    def test_update_table_without_table_info(self, client, session_with_table):
        """Updating type without table_info should not break table_info."""
        resp = client.post(
            "/api/update-element",
            json={
                "session_id": session_with_table,
                "element_id": "table-1",
                "type": "table",
                "heading_level": 1,
                "text": "",
            },
        )
        assert resp.status_code == 200, resp.text
        doc = resp.json()
        elem = next(e for e in doc["elements"] if e["id"] == "table-1")
        # table_info should remain intact
        assert elem["table_info"]["headers"] == ["Variable", "Media", "Desviación"]
        assert elem["table_info"]["table_number"] == 1

    def test_update_table_marks_user_modified(self, client, session_with_table):
        """Updating table_info should mark the element as user-modified."""
        resp = client.post(
            "/api/update-element",
            json={
                "session_id": session_with_table,
                "element_id": "table-1",
                "type": "table",
                "heading_level": 1,
                "table_info": {"caption": "New caption"},
            },
        )
        assert resp.status_code == 200, resp.text
        doc = resp.json()
        elem = next(e for e in doc["elements"] if e["id"] == "table-1")
        assert elem["is_user_modified"] is True
        assert elem["confidence"] == 1.0

    def test_image_info_update_does_not_convert_table(self, client, session_with_table):
        """Un update con image_info sobre una tabla NO debe convertirla en imagen.

        Backstop del bug del Taller: enviaba image_info para tablas y el endpoint
        reescribía el type, haciendo desaparecer la tabla y saltando de activo.
        """
        resp = client.post(
            "/api/update-element",
            json={
                "session_id": session_with_table,
                "element_id": "table-1",
                "type": "image",
                "heading_level": 1,
                "image_info": {"caption": "Esto era una tabla"},
            },
        )
        assert resp.status_code == 200, resp.text
        doc = resp.json()
        elem = next(e for e in doc["elements"] if e["id"] == "table-1")
        assert elem["type"] == "table"
        assert elem["table_info"]["headers"] == ["Variable", "Media", "Desviación"]

    def test_explicit_type_change_without_info_still_works(
        self, client, session_with_paragraph
    ):
        """El cambio de tipo legítimo (párrafo -> título) sin info sigue funcionando."""
        resp = client.post(
            "/api/update-element",
            json={
                "session_id": session_with_paragraph,
                "element_id": "p-1",
                "type": "heading",
                "heading_level": 2,
                "text": "Nuevo título",
            },
        )
        assert resp.status_code == 200, resp.text
        doc = resp.json()
        elem = next(e for e in doc["elements"] if e["id"] == "p-1")
        assert elem["type"] == "heading"
        assert elem["heading_level"] == 2
