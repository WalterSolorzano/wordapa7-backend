import uuid

from fastapi.testclient import TestClient

from main import app
from models import DocumentModel, ElementModel, ElementType


def _seed_session(tmp_path, monkeypatch, sid):
    import config
    from persistence.session_manager import save_session_state

    monkeypatch.setattr(config, "STORAGE_DIR", tmp_path)
    doc = DocumentModel(session_id=sid, file_name="d.docx")
    doc.elements = [
        ElementModel(id="e1", type=ElementType.PARAGRAPH, text="Intro"),
    ]
    save_session_state(doc, tmp_path)
    return doc


def test_insert_image_endpoint_appends_image_element(tmp_path, monkeypatch):
    sid = "c" + uuid.uuid4().hex[:8]
    _seed_session(tmp_path, monkeypatch, sid)
    client = TestClient(app)
    res = client.post("/api/elements/insert-image", json={
        "session_id": sid,
        "after_element_id": "e1",
        "new_element_id": "img1",
        "image": {"file_path": "x.png", "filename": "x.png", "caption": "Fig", "figure_number": 1},
    })
    assert res.status_code == 200, res.text
    doc = res.json()
    assert doc["elements"][1]["type"] == "image"


def test_resolve_diagram_actions_renders_png(tmp_path):
    from pathlib import Path

    from modules.ai_document_editor import _resolve_diagram_actions

    doc = DocumentModel(session_id="abcd1234", file_name="d.docx")
    doc.elements = [ElementModel(id="e1", type=ElementType.PARAGRAPH, text="Intro")]
    result = {
        "reply": "listo",
        "actions": [
            {"type": "add_diagram", "element_id": "e1",
             "diagram": {"kind": "flow", "dsl": "A > B", "caption": "Flujo"}}
        ],
    }
    out = _resolve_diagram_actions(doc, result, tmp_path)
    act = out["actions"][0]
    assert act["image"]["figure_number"] == 1
    assert act["image"]["design_style"] == "standard"
    assert act["image"]["caption"] == "Flujo"
    assert Path(act["image"]["file_path"]).exists()


def test_deterministic_fallback_asks_for_dsl():
    from modules.ai_document_editor import _deterministic_chat_fallback

    doc = DocumentModel(session_id="x", file_name="d.docx")
    res = _deterministic_chat_fallback(doc, "agrega un diagrama de flujo")
    assert res["actions"] == []
    assert "DSL" in res["reply"]
