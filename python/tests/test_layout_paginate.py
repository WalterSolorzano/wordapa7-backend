# python/tests/test_layout_paginate.py
"""FASE 2 — POST /api/layout/paginate: contrato del endpoint y del servicio.

Word se simula (monkeypatch de COMPageLayoutProvider / apply_inplace):
el test nunca toma una instancia COM real.
"""
import sys
import pathlib
import types
import uuid

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient


def _client():
    from main import app
    return TestClient(app)


def test_endpoint_404_sesion_desconocida():
    r = _client().post("/api/layout/paginate",
                       json={"session_id": f"nope-{uuid.uuid4().hex}"})
    assert r.status_code == 404
    assert r.json()["detail"] == "Sesión no encontrada."


def test_endpoint_shape_with_mocked_service(monkeypatch):
    from persistence import session_manager as sm
    monkeypatch.setattr(sm, "load_session_state", lambda sid, st: object())
    from services import layout_service as ls
    monkeypatch.setattr(ls, "paginate_session", lambda doc, sd: {
        "available": True, "provider": "com", "reason": None,
        "total_pages": 7,
        "elements": [{"element_id": "e0", "page_start": 1},
                     {"element_id": "e1", "page_start": 2}],
        "line_cuts": [{"element_id": "e1",
                       "cuts": [{"offset": 120, "page": 2}]}],
        "page_setup": {"width_pt": 612.0, "height_pt": 792.0,
                       "margin_top_pt": 72.0, "margin_bottom_pt": 72.0,
                       "margin_left_pt": 72.0, "margin_right_pt": 72.0},
        "elapsed_ms": 5,
    })
    r = _client().post("/api/layout/paginate", json={"session_id": "abc"})
    assert r.status_code == 200
    data = r.json()
    assert data["session_id"] == "abc"
    assert data["available"] is True and data["total_pages"] == 7
    assert data["elements"][1]["page_start"] == 2
    assert data["line_cuts"][0]["cuts"][0] == {"offset": 120, "page": 2}
    assert data["page_setup"]["width_pt"] == 612.0


def _fake_doc():
    return types.SimpleNamespace(
        elements=[
            types.SimpleNamespace(id="e0", text="hola"),
            types.SimpleNamespace(id="e1", text="x" * 300),
        ],
        apa_rules=None,
    )


def _session_dir(tmp_path):
    d = tmp_path / "sessions" / "s1"
    d.mkdir(parents=True)
    (d / "original.docx").write_bytes(b"PK\x03\x04fake")
    return d


def _result(paragraph_pages, paragraph_cuts, notes=None):
    from parsing.page_layout_provider import PageLayoutResult
    return PageLayoutResult(
        paragraph_pages=paragraph_pages,
        total_pages=7,
        provider_used="com",
        confidence=1.0,
        notes=notes or [],
        paragraph_cuts=paragraph_cuts,
        page_setup={"width_pt": 612.0, "height_pt": 792.0,
                    "margin_top_pt": 72.0, "margin_bottom_pt": 72.0,
                    "margin_left_pt": 72.0, "margin_right_pt": 72.0},
    )


def _patch_provider(monkeypatch, *, available=True, result=None, raises=None):
    from parsing import page_layout_provider as plp

    class FakeProvider:
        def is_available(self):
            return available

        def paginate(self, path, timeout_seconds=30, with_cuts=False):
            assert path.exists()
            if raises:
                raise raises
            assert with_cuts is True
            return result

    monkeypatch.setattr(plp, "COMPageLayoutProvider", FakeProvider)


def _patch_inplace(monkeypatch, *, fail=False):
    from generation import inplace_editor as ie

    def fake(original_path, out_path, doc_model, rules, scopes=None):
        if fail:
            raise RuntimeError("inplace boom")
        out_path.write_bytes(original_path.read_bytes())
        return out_path

    monkeypatch.setattr(ie, "apply_inplace", fake)


def test_service_mapea_pages_y_corts(tmp_path, monkeypatch):
    from services.layout_service import paginate_session
    res = _result([1, 2], [[], [{"offset": 120, "page": 2},
                                {"offset": 9999, "page": 3}]])
    _patch_provider(monkeypatch, result=res)
    _patch_inplace(monkeypatch)
    out = paginate_session(_fake_doc(), _session_dir(tmp_path))
    assert out["available"] is True and out["total_pages"] == 7
    assert out["elements"] == [{"element_id": "e0", "page_start": 1},
                               {"element_id": "e1", "page_start": 2}]
    # offset 9999 > len(text e1)=300 → descartado (clamp defensivo)
    assert out["line_cuts"] == [{"element_id": "e1",
                                 "cuts": [{"offset": 120, "page": 2}]}]
    assert out["page_setup"]["height_pt"] == 792.0
    assert out["elapsed_ms"] >= 0
    # Sin degradación ni notes → estado limpio (contrato de 9 claves)
    assert out["degraded"] is False and out["reason"] is None


def test_service_unavailable_sin_word(tmp_path, monkeypatch):
    from services.layout_service import paginate_session
    _patch_provider(monkeypatch, available=False)
    out = paginate_session(_fake_doc(), _session_dir(tmp_path))
    assert out["available"] is False
    assert "Se requiere Microsoft Word" in out["reason"]
    assert out["degraded"] is False  # rama no disponible: clave siempre presente
    assert out["elements"] == [] and out["total_pages"] is None


def test_service_inplace_fallo_usa_original(tmp_path, monkeypatch):
    from services.layout_service import paginate_session
    res = _result([1, 1], [])
    _patch_provider(monkeypatch, result=res)
    _patch_inplace(monkeypatch, fail=True)
    out = paginate_session(_fake_doc(), _session_dir(tmp_path))
    assert out["available"] is True  # degrada al original, no se rompe
    # Degradación honesta: el consumidor debe poder distinguirlo
    assert out["degraded"] is True
    assert "Materialización falló" in out["reason"]


def test_service_notes_del_provider_en_reason(tmp_path, monkeypatch):
    from services.layout_service import paginate_session
    res = _result([1, 1], [], notes=["aviso X"])
    _patch_provider(monkeypatch, result=res)
    _patch_inplace(monkeypatch)
    out = paginate_session(_fake_doc(), _session_dir(tmp_path))
    assert out["available"] is True
    assert out["degraded"] is False
    assert out["reason"] == "aviso X"


def test_service_excepcion_com_devuelve_unavailable(tmp_path, monkeypatch):
    from services.layout_service import paginate_session
    _patch_provider(monkeypatch, raises=RuntimeError("Word no respondió en 20s"))
    _patch_inplace(monkeypatch)
    out = paginate_session(_fake_doc(), _session_dir(tmp_path))
    assert out["available"] is False
    assert "Word no respondió" in out["reason"]
