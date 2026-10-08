import pytest

pytest.importorskip("mcp")

from mcp_server import build_document, content_schema, render_diagram_png


def test_content_schema_lists_kinds_and_styles():
    info = content_schema()
    assert "flow" in info["diagram_kinds"]
    assert "scientific" in info["figure_styles"]
    assert "content" in info["schema"]


def test_build_document_tool(tmp_path, monkeypatch):
    import os

    import config

    monkeypatch.setattr(config, "STORAGE_DIR", tmp_path)
    out = build_document(
        {"content": [{"h1": "H"}, {"diagram": {"kind": "flow", "dsl": "A > B"}}]},
        try_com=False,
    )
    assert out["elements"] == 2
    assert out["session_id"]
    assert out["path"].endswith(".docx")
    assert os.path.exists(out["path"])


def test_render_diagram_png_tool():
    png = render_diagram_png("flow", "A > B")
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
