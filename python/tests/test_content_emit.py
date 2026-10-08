import uuid

from content.builder import build_content_document
from content.emit import emit_docx
from docx import Document


def test_emit_produces_openable_docx(tmp_path):
    result = build_content_document(
        {
            "meta": {"title": "Tesis", "use_original_cover": False},
            "content": [
                {"h1": "Método"},
                {"p": "Cuerpo."},
                {"diagram": {"kind": "flow", "dsl": "A > B", "caption": "Fases"}},
            ],
        },
        tmp_path, session_id="e" + uuid.uuid4().hex[:8],
    )
    out = tmp_path / "salida.docx"
    final = emit_docx(result.document, out, try_com=False)
    assert final.exists()
    opened = Document(str(final))
    assert len(opened.paragraphs) > 0


def test_emit_without_word_falls_back(tmp_path):
    result = build_content_document({"content": [{"p": "x"}]}, tmp_path, session_id="f" + uuid.uuid4().hex[:8])
    out = tmp_path / "s.docx"
    final = emit_docx(result.document, out, try_com=True)
    assert final.exists()


def test_emit_uses_com_when_available(tmp_path, monkeypatch):
    import shutil

    import services.doc_converter as dc

    calls = {}

    class FakeConverter:
        def get_active_engine(self):
            return "COM"

        def process_and_convert(self, original_path, generated_path, final_path, **kwargs):
            shutil.copy(generated_path, final_path)
            calls["original"] = original_path
            calls["final"] = final_path
            return True, final_path

    monkeypatch.setattr(dc, "get_doc_converter", lambda: FakeConverter())
    result = build_content_document({"content": [{"p": "x"}]}, tmp_path, session_id="g" + uuid.uuid4().hex[:8])
    out = tmp_path / "com.docx"
    final = emit_docx(result.document, out, try_com=True)
    assert final == out
    assert out.exists()
    assert calls["original"] != calls["final"]
