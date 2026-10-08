"""FASE 5 — Paridad canvas ↔ docx exportado (backend).

Verifica que page_setup_dict produce las mismas dimensiones que
getPageGeometry (frontend) para los mismos inputs.
"""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


def test_page_setup_dict_dimensions():
    """page_setup_dict retorna dimensiones en pt que coinciden con getPageGeometry."""
    from parsing.page_layout_provider import page_setup_dict

    # Mock de doc con PageSetup
    class FakePageSetup:
        PageWidth = 612.0
        PageHeight = 792.0
        TopMargin = 72.0
        BottomMargin = 72.0
        LeftMargin = 72.0
        RightMargin = 72.0

    class FakeDoc:
        PageSetup = FakePageSetup()

    result = page_setup_dict(FakeDoc())

    assert result is not None
    assert result["width_pt"] == 612.0
    assert result["height_pt"] == 792.0
    assert result["margin_top_pt"] == 72.0
    assert result["margin_bottom_pt"] == 72.0
    assert result["margin_left_pt"] == 72.0
    assert result["margin_right_pt"] == 72.0


def test_page_setup_dict_a4():
    """page_setup_dict con A4 retorna dimensiones correctas."""
    from parsing.page_layout_provider import page_setup_dict

    class FakePageSetup:
        PageWidth = 595.0
        PageHeight = 842.0
        TopMargin = 72.0
        BottomMargin = 72.0
        LeftMargin = 72.0
        RightMargin = 72.0

    class FakeDoc:
        PageSetup = FakePageSetup()

    result = page_setup_dict(FakeDoc())

    assert result is not None
    assert result["width_pt"] == 595.0
    assert result["height_pt"] == 842.0


def test_page_setup_dict_none_on_error():
    """page_setup_dict retorna None si hay error."""
    from parsing.page_layout_provider import page_setup_dict

    class FakeDoc:
        pass  # No tiene PageSetup

    result = page_setup_dict(FakeDoc())
    assert result is None


def test_parity_frontend_backend():
    """Paridad: mismos inputs → mismas dimensiones.

    Frontend: getPageGeometry retorna px (96 DPI)
    Backend: page_setup_dict retorna pt (72 DPI)

    1 pt = 96/72 px = 1.333... px
    """
    from parsing.page_layout_provider import page_setup_dict

    # Valores de Letter
    class FakePageSetup:
        PageWidth = 612.0
        PageHeight = 792.0
        TopMargin = 72.0
        BottomMargin = 72.0
        LeftMargin = 72.0
        RightMargin = 72.0

    class FakeDoc:
        PageSetup = FakePageSetup()

    backend_result = page_setup_dict(FakeDoc())

    # Frontend: PT_TO_PX = 96/72
    px_per_pt = 96 / 72

    # Letter: 612 x 792 pt → 816 x 1056 px
    assert backend_result["width_pt"] * px_per_pt == 816.0
    assert backend_result["height_pt"] * px_per_pt == 1056.0

    # Margen: 72 pt → 96 px
    assert backend_result["margin_top_pt"] * px_per_pt == 96.0
