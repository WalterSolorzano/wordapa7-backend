# python/tests/test_page_layout_provider_guard.py
"""Fase 5 — Guard D-a en page_layout_provider: sin COM → RuntimeError, sin fallback LO/heurístico."""
import sys
import pathlib
import pytest
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


def test_get_page_layout_provider_no_com_raises():
    """Sin COM disponible, get_page_layout_provider() debe lanzar RuntimeError."""
    from parsing import page_layout_provider as plp

    # Reset cache dentro del test (el módulo ya fue importado por otros tests)
    plp._cached_provider = None

    mock_com = MagicMock()
    mock_com.is_available.return_value = False

    with patch.object(plp, "COMPageLayoutProvider", return_value=mock_com):
        with pytest.raises(RuntimeError, match="Se requiere Microsoft Word"):
            plp.get_page_layout_provider()


def test_get_page_layout_provider_com_available():
    """Con COM disponible, get_page_layout_provider() debe retornar COMPageLayoutProvider."""
    from parsing import page_layout_provider as plp

    plp._cached_provider = None

    mock_com = MagicMock()
    mock_com.is_available.return_value = True

    with patch.object(plp, "COMPageLayoutProvider", return_value=mock_com):
        result = plp.get_page_layout_provider()

    assert result is mock_com, f"Esperado COMPageLayoutProvider, llegó {result}"


def test_get_page_layout_provider_no_libreoffice_fallback():
    """Sin COM, NO debe retornar LibreOfficePageLayoutProvider."""
    from parsing import page_layout_provider as plp

    plp._cached_provider = None

    mock_com = MagicMock()
    mock_com.is_available.return_value = False
    mock_lo = MagicMock()
    mock_lo.is_available.return_value = True  # LO disponible pero no debe usarse

    with patch.object(plp, "COMPageLayoutProvider", return_value=mock_com), \
         patch.object(plp, "LibreOfficePageLayoutProvider", return_value=mock_lo):
        with pytest.raises(RuntimeError, match="Se requiere Microsoft Word"):
            plp.get_page_layout_provider()


def test_get_page_layout_provider_no_heuristic_fallback():
    """Sin COM, NO debe retornar HeuristicPageLayoutProvider."""
    from parsing import page_layout_provider as plp

    plp._cached_provider = None

    mock_com = MagicMock()
    mock_com.is_available.return_value = False
    mock_heuristic = MagicMock()
    mock_heuristic.is_available.return_value = True

    with patch.object(plp, "COMPageLayoutProvider", return_value=mock_com), \
         patch.object(plp, "HeuristicPageLayoutProvider", return_value=mock_heuristic):
        with pytest.raises(RuntimeError, match="Se requiere Microsoft Word"):
            plp.get_page_layout_provider()
