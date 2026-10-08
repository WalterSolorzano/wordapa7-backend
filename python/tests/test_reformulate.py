"""Reformular con IA: propone una reescritura editable, nunca escribe el doc."""
from fastapi.testclient import TestClient


def test_reformulate_devuelve_propuesta(monkeypatch):
    import main

    async def fake_rewrite(text, instruction, api_key=None, provider_id=None):
        return "Propuesta editable"

    # El endpoint importa la función DENTRO del handler desde `modules.ai_assistant`;
    # se parchea ese módulo, que es el que resuelve el import en runtime.
    import modules.ai_assistant as ai_assistant
    monkeypatch.setattr(ai_assistant, "rewrite_text_suggestion", fake_rewrite)

    client = TestClient(main.app)
    resp = client.post("/api/ai/reformulate", json={"text": "La transformación digital ha redefinido"})
    assert resp.status_code == 200
    assert resp.json()["proposal"] == "Propuesta editable"


def test_reformulate_rechaza_texto_vacio():
    import main

    client = TestClient(main.app)
    resp = client.post("/api/ai/reformulate", json={"text": "   "})
    assert resp.status_code == 400
