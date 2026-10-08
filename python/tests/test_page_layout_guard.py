"""FASE 5 — Guard D-a en get_page_layout_provider.

Sin Word disponible, get_page_layout_provider debe lanzar RuntimeError con
mensaje "Se requiere Microsoft Word". Elimina fallback a LibreOffice y
heurístico en la ruta de layout.
"""
import sys
import pathlib
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


def test_com_disponible_retorna_com_provider(monkeypatch):
    """COM disponible → retorna COMPageLayoutProvider."""
    from parsing import page_layout_provider as plp
    from parsing.page_layout_provider import COMPageLayoutProvider

    monkeypatch.setattr(plp, "COMPageLayoutProvider", COMPageLayoutProvider)
    monkeypatch.setattr(plp, "_cached_provider", None)

    provider = plp.get_page_layout_provider()
    assert isinstance(provider, COMPageLayoutProvider)


def test_com_no_disponible_lanza_runtime_error(monkeypatch):
    """COM no disponible → RuntimeError con mensaje 'Se requiere Microsoft Word'."""
    from parsing import page_layout_provider as plp

    class FakeCOMProvider:
        def is_available(self):
            return False

    monkeypatch.setattr(plp, "COMPageLayoutProvider", FakeCOMProvider)
    monkeypatch.setattr(plp, "_cached_provider", None)

    with pytest.raises(RuntimeError, match="Se requiere Microsoft Word"):
        plp.get_page_layout_provider()


def test_sin_com_con_lo_disponible_igual_lanza(monkeypatch):
    """Aunque LO esté disponible, sin COM debe lanzar (D-a: sin degradación)."""
    from parsing import page_layout_provider as plp

    class FakeCOMProvider:
        def is_available(self):
            return False

    class FakeLOProvider:
        def is_available(self):
            return True

    monkeypatch.setattr(plp, "COMPageLayoutProvider", FakeCOMProvider)
    monkeypatch.setattr(plp, "LibreOfficePageLayoutProvider", FakeLOProvider)
    monkeypatch.setattr(plp, "_cached_provider", None)

    with pytest.raises(RuntimeError, match="Se requiere Microsoft Word"):
        plp.get_page_layout_provider()
