"""Diff XML canonico de w:body entre dos .docx.

Uso:
    from harness.xmldiff import body_children_c14n, zone_diff
    before = body_children_c14n("a.docx")
    after  = body_children_c14n("b.docx")
    report = zone_diff(before, after, cover_children=6)
"""
from __future__ import annotations

import zipfile
from lxml import etree

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def _c14n(el) -> str:
    raw = etree.tostring(el)
    return etree.canonicalize(raw.decode())


def body_children_c14n(path: str) -> list[str]:
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml")
    root = etree.fromstring(xml)
    body = root.find(f"{{{W}}}body")
    return [_c14n(child) for child in body]


def zone_diff(before: list[str], after: list[str], cover_children: int) -> dict:
    """Compara SOLO la zona de portada [0..cover_children) + resumen del resto."""
    b, a = before[:cover_children], after[:cover_children]
    identical = b == a
    diffs = []
    if not identical:
        for i in range(max(len(b), len(a))):
            sb = b[i] if i < len(b) else "<FALTA>"
            sa = a[i] if i < len(a) else "<FALTA>"
            if sb != sa:
                diffs.append({
                    "index": i,
                    "before_head": sb[:160],
                    "after_head": sa[:160],
                })
    return {
        "zone_identical": identical,
        "zone_children_before": len(b),
        "zone_children_after": len(a),
        "diffs": diffs[:10],
        "total_before": len(before),
        "total_after": len(after),
    }
