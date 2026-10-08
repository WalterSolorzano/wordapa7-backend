"""scoped-apply-live: OOXML de Word → DOCX procesado por alcances."""

import base64
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

OOXML = (
    '<?xml version="1.0"?>'
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    "<w:body>"
    "<w:p><w:r><w:t>T\u00edtulo del Trabajo</w:t></w:r></w:p>"
    '<w:p><w:r><w:t>Br. Autor Uno | Carnet: 2021-0251</w:t></w:r></w:p>'
    '<w:p><w:r><w:t>P\u00e1rrafo del cuerpo.</w:t></w:r></w:p>'
    "</w:body></w:document>"
)


def _client():
    os.environ.setdefault("WORDAPA7_USE_SSL", "false")
    from fastapi.testclient import TestClient
    import main as M
    return TestClient(M.app)


def test_live_tablas_scope_returns_docx():
    import os
    r = _client().post(
        "/api/addin/scoped-apply-live",
        json={
            "ooxml_base64": base64.b64encode(OOXML.encode("utf-8")).decode("ascii"),
            "scopes": ["bibliografia"],
        },
    )
    # Sin tabla ni refs en el doc mínimo: igualmente debe responder ok
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    assert "docx_base64" in data


def test_invalid_scope_rejected():
    import os
    r = _client().post(
        "/api/addin/scoped-apply-live",
        json={"ooxml_base64": base64.b64encode(OOXML.encode()).decode(), "scopes": ["portada"]},
    )
    assert r.status_code == 400


import os  # noqa: E402
