from fastapi.testclient import TestClient

from main import app


def test_build_endpoint_returns_download_url():
    client = TestClient(app)
    payload = {
        "meta": {"title": "Tesis", "use_original_cover": False},
        "content": [{"h1": "Método"}, {"p": "Cuerpo."}],
    }
    res = client.post("/api/content/build", json=payload)
    assert res.status_code == 200
    body = res.json()
    assert body["session_id"]
    assert body["download_url"].startswith("/api/download-artifact/")
    assert body["warnings"] == []


def test_build_endpoint_rejects_empty_content():
    client = TestClient(app)
    res = client.post("/api/content/build", json={"content": []})
    assert res.status_code == 400


def test_build_download_url_serves_docx():
    client = TestClient(app)
    payload = {
        "meta": {"title": "Tesis", "use_original_cover": False},
        "content": [{"h1": "Método"}, {"p": "Cuerpo."}],
    }
    res = client.post("/api/content/build", json=payload)
    assert res.status_code == 200
    download = client.get(res.json()["download_url"])
    assert download.status_code == 200
    assert download.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )


def test_build_endpoint_rejects_multiple_types():
    client = TestClient(app)
    res = client.post("/api/content/build", json={"content": [{"h1": "A", "p": "B"}]})
    assert res.status_code == 422
