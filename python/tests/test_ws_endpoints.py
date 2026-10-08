"""F1 (mejora #4): los WebSocket siguen vivos tras extraerlos a routers/ws.py."""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    import main
    return TestClient(main.app)


def test_parse_progress_emite_y_cierra(client):
    """Acepta, emite el progreso sembrado y el handler corta en 'complete'."""
    from routers import ws as _ws

    _ws._parse_progress["f1-ses"] = {"status": "complete", "pct": 100}
    with client.websocket_connect("/ws/parse-progress/f1-ses") as ws:
        assert ws.receive_json() == {"status": "complete", "pct": 100}


def test_collab_broadcast_entre_dos_clientes(client):
    """Relay Fase 8: A envía, B recibe (CollabManager + broadcast intactos)."""
    with client.websocket_connect("/ws/collab/f1-ses") as a:
        with client.websocket_connect("/ws/collab/f1-ses") as b:
            a.send_json({"action": "UPDATE_ELEMENT", "element_id": 1})
            assert b.receive_json() == {"action": "UPDATE_ELEMENT", "element_id": 1}
