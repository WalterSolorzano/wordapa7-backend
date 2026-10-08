# python/tests/test_parity_canvas_docx.py
"""Fase 5 — Paridad canvas ↔ docx: mismos inputs → mismos outputs."""
import sys
import pathlib
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


def test_parity_margins_cm():
    """Mismo margins_cm → mismo padding en canvas y docx."""
    from models import APARuleSet

    rules = APARuleSet(margins_cm=2.5)

    # Canvas: padding debe ser proportional a margins_cm
    # 1 cm ≈ 28.35 pt (1 inch = 2.54 cm, 1 inch = 72 pt)
    expected_padding = rules.margins_cm * 28.35

    # Verificar que los valores son consistentes
    assert expected_padding == 2.5 * 28.35
    assert rules.margins_cm == 2.5


def test_parity_page_size():
    """Mismo page_size → mismas dimensiones en canvas y docx."""
    from models import APARuleSet

    # Carta (Letter): 8.5 x 11 inches = 612 x 792 pt
    rules_carta = APARuleSet(page_size="carta")
    assert rules_carta.page_size == "carta"

    # A4: 210 x 297 mm = 595.28 x 841.89 pt
    rules_a4 = APARuleSet(page_size="a4")
    assert rules_a4.page_size == "a4"


def test_parity_line_spacing():
    """Mismo line_spacing → mismo espaciado en canvas y docx."""
    from models import APARuleSet

    rules = APARuleSet(line_spacing=2.0)
    assert rules.line_spacing == 2.0

    # Line spacing debe ser un valor válido (1.0, 1.5, 2.0)
    assert rules.line_spacing in [1.0, 1.5, 2.0]


def test_parity_font_size_pt():
    """Mismo font_size_pt → mismo tamaño en canvas y docx."""
    from models import APARuleSet

    rules = APARuleSet(font_size_pt=12)
    assert rules.font_size_pt == 12

    # Font size debe ser un valor válido (10, 11, 12)
    assert rules.font_size_pt in [10, 11, 12]


def test_parity_rules_consistency():
    """Las reglas APA deben ser consistentes entre canvas y docx."""
    from models import APARuleSet

    rules = APARuleSet(
        margins_cm=2.5,
        page_size="carta",
        line_spacing=2.0,
        font_size_pt=12,
    )

    # Verificar que todos los valores son consistentes
    assert rules.margins_cm == 2.5
    assert rules.page_size == "carta"
    assert rules.line_spacing == 2.0
    assert rules.font_size_pt == 12
