# python/tests/test_guards_com_regression.py
"""Fase 5 — Tests de regresión para guards D-a: sin fallback LO/heurístico."""
import sys
import pathlib
import pytest
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


def test_no_libreoffice_fallback_in_doc_converter():
    """process_and_convert nunca usa LO como fallback."""
    from services.doc_converter import DocConverterService

    svc = DocConverterService()
    svc._com_processor = MagicMock()
    svc._com_processor.is_available.return_value = False
    svc._lo_service = MagicMock()
    svc._lo_service.is_available.return_value = True
    svc._lo_service.convert.return_value = True

    with patch.dict("os.environ", {"FORCE_ENGINE": ""}):
        success, pdf_path = svc.process_and_convert(
            original_path=pathlib.Path("original.docx"),
            generated_path=pathlib.Path("generated.docx"),
            final_path=pathlib.Path("final.docx"),
            preserve_cover=False,
            generate_pdf=True,
        )

    assert success is False
    assert pdf_path is None
    svc._lo_service.convert.assert_not_called(), "NO se debe llamar a LO como fallback"


def test_no_heuristic_fallback_in_page_layout():
    """get_page_layout_provider nunca retorna HeuristicPageLayoutProvider."""
    from parsing import page_layout_provider as plp

    # Reset cache
    plp._cached_provider = None

    mock_com = MagicMock()
    mock_com.is_available.return_value = False
    mock_heuristic = MagicMock()
    mock_heuristic.is_available.return_value = True

    with patch.object(plp, "COMPageLayoutProvider", return_value=mock_com), \
         patch.object(plp, "HeuristicPageLayoutProvider", return_value=mock_heuristic):
        with pytest.raises(RuntimeError, match="Se requiere Microsoft Word"):
            plp.get_page_layout_provider()


def test_layout_service_no_com_returns_unavailable():
    """paginate_session sin COM → available: False."""
    from services.layout_service import paginate_session

    mock_doc = MagicMock()
    mock_doc.elements = []
    mock_doc.apa_rules = None

    mock_session_dir = MagicMock()
    mock_session_dir.__truediv__ = MagicMock(return_value=MagicMock())
    mock_session_dir.exists.return_value = True

    with patch("parsing.page_layout_provider.COMPageLayoutProvider") as mock_provider_class:
        mock_provider = MagicMock()
        mock_provider.is_available.return_value = False
        mock_provider_class.return_value = mock_provider

        result = paginate_session(mock_doc, mock_session_dir)

    assert result["available"] is False, f"Esperado available=False, llegó {result['available']}"
    assert result["provider"] == "none"
    assert "Microsoft Word" in result["reason"]


def test_no_libreoffice_fallback_in_page_layout():
    """get_page_layout_provider nunca retorna LibreOfficePageLayoutProvider."""
    from parsing import page_layout_provider as plp

    # Reset cache
    plp._cached_provider = None

    mock_com = MagicMock()
    mock_com.is_available.return_value = False
    mock_lo = MagicMock()
    mock_lo.is_available.return_value = True

    with patch.object(plp, "COMPageLayoutProvider", return_value=mock_com), \
         patch.object(plp, "LibreOfficePageLayoutProvider", return_value=mock_lo):
        with pytest.raises(RuntimeError, match="Se requiere Microsoft Word"):
            plp.get_page_layout_provider()
