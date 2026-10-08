"""FASE 2.1 — wrap_cover_zone_sdt: blindaje estructural opt-in de portada."""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from tests.test_cover_protection_roundtrip import (
    _variant_plaintext,
    _variant_table_first,
    _c14n_children,
)
import io
import zipfile

from lxml import etree

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def _apply(raw: bytes):
    from modules.scoped_apply import apply_scopes
    return apply_scopes(raw, ["texto"], {"cover_protect_sdt": True})


def test_wrap_preserves_content_and_hides_from_iterators():
    raw = _variant_plaintext()
    out, summary = _apply(raw)
    assert summary["cover_sdt"] is True and "cover_sdt_error" not in summary

    def body(path_bytes):
        root = etree.fromstring(zipfile.ZipFile(io.BytesIO(path_bytes)).read("word/document.xml"))
        return root.find(f"{{{W}}}body")

    b_body, a_body = body(raw), body(out)
    # 1) contenido idéntico: los hijos originales ahora viven dentro de sdtContent
    sdt = a_body.find(f"{{{W}}}sdt")
    assert sdt is not None, "no se envolvio la portada"
    content = list(sdt.find(f"{{{W}}}sdtContent"))
    before_children = list(b_body)[: len(content)]
    c_before = [etree.canonicalize(etree.tostring(c).decode()) for c in before_children]
    c_after = [etree.canonicalize(etree.tostring(c).decode()) for c in content]
    assert c_before == c_after, "el contenido de la portada cambio al envolver"
    # 2) lock presente
    lock = sdt.find(f"{{{W}}}sdtPr/{{{W}}}lock")
    assert lock is not None and lock.get(f"{{{W}}}val") in ("locked", "contentLocked", "sdtLocked")
    # 3) iteradores ya no ven la portada
    from docx import Document as _D
    d2 = _D(io.BytesIO(out))
    texts = [p.text for p in d2.paragraphs]
    assert all("UNIVERSIDAD NACIONAL" not in t for t in texts)


def test_wrap_is_idempotent():
    raw = _variant_table_first()
    out1, s1 = _apply(raw)
    out2, s2 = _apply(out1)  # segunda pasada sobre doc ya envuelto
    # el guard ya no ve parrafos de portada -> no re-envuelve; sin error
    assert s2.get("cover_sdt") in (False, None)
    assert "cover_sdt_error" not in s2


def test_sin_flag_no_envuelve():
    from modules.scoped_apply import apply_scopes
    raw = _variant_plaintext()
    out, summary = apply_scopes(raw, ["texto"], {})
    assert summary.get("cover_sdt") is None
    body = etree.fromstring(zipfile.ZipFile(io.BytesIO(out)).read("word/document.xml")).find(f"{{{W}}}body")
    assert body.find(f"{{{W}}}sdt") is None
