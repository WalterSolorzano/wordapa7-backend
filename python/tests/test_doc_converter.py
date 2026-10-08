# python/tests/test_doc_converter.py
"""Fase 5 — Guard D-a en doc_converter: sin COM → RuntimeError, sin fallback LO."""
import sys
import pathlib
import pytest
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


def _make_svc(*, com_available=False, lo_available=False):
    """Crea un DocConverterService con mocks de disponibilidad."""
    from services.doc_converter import DocConverterService
    from generation.post_processor import get_com_post_processor
    from services.lo_service import get_libreoffice_service

    # Parchear los singletons ANTES de crear el servicio
    mock_com = MagicMock()
    mock_com.is_available.return_value = com_available
    mock_lo = MagicMock()
    mock_lo.is_available.return_value = lo_available

    with patch("services.doc_converter.get_com_post_processor", return_value=mock_com), \
         patch("services.doc_converter.get_libreoffice_service", return_value=mock_lo):
        svc = DocConverterService()

    svc._com_processor = mock_com
    svc._lo_service = mock_lo
    return svc


def test_get_active_engine_no_com_raises():
    """Sin COM disponible, get_active_engine() debe lanzar RuntimeError."""
    svc = _make_svc(com_available=False, lo_available=True)

    with patch.dict("os.environ", {"FORCE_ENGINE": ""}):
        with pytest.raises(RuntimeError, match="Se requiere Microsoft Word"):
            svc.get_active_engine()


def test_get_active_engine_force_lo_raises():
    """FORCE_ENGINE=LO sin LO → RuntimeError."""
    svc = _make_svc(com_available=False, lo_available=False)

    with patch.dict("os.environ", {"FORCE_ENGINE": "LO"}):
        with pytest.raises(RuntimeError, match="Se requiere LibreOffice"):
            svc.get_active_engine()


def test_get_active_engine_com_available():
    """Con COM disponible, get_active_engine() debe retornar 'COM'."""
    svc = _make_svc(com_available=True, lo_available=False)

    with patch.dict("os.environ", {"FORCE_ENGINE": ""}):
        engine = svc.get_active_engine()
    assert engine == "COM", f"Esperado 'COM', llegó '{engine}'"


def test_process_and_convert_no_engine_returns_false():
    """Sin motor disponible, process_and_convert debe retornar (False, None)."""
    svc = _make_svc(com_available=False, lo_available=True)

    with patch.dict("os.environ", {"FORCE_ENGINE": ""}):
        success, pdf_path = svc.process_and_convert(
            original_path=pathlib.Path("original.docx"),
            generated_path=pathlib.Path("generated.docx"),
            final_path=pathlib.Path("final.docx"),
            preserve_cover=False,
            generate_pdf=True,
        )
    assert success is False, f"Esperado success=False sin motor, llegó {success}"
    assert pdf_path is None, f"Esperado pdf_path=None sin motor, llegó {pdf_path}"


def test_process_and_convert_no_engine_no_lo_fallback():
    """Sin COM, process_and_convert NO debe intentar fallback LO."""
    svc = _make_svc(com_available=False, lo_available=True)
    svc._lo_service.convert.return_value = True  # LO "funcionaría" pero no debe llamarse

    with patch.dict("os.environ", {"FORCE_ENGINE": ""}):
        success, pdf_path = svc.process_and_convert(
            original_path=pathlib.Path("original.docx"),
            generated_path=pathlib.Path("generated.docx"),
            final_path=pathlib.Path("final.docx"),
            preserve_cover=False,
            generate_pdf=True,
        )
    assert success is False
    svc._lo_service.convert.assert_not_called(), "NO se debe llamar a LO como fallback"
