"""FASE 5 — Guard D-a en DocConverterService.get_active_engine.

Sin Word disponible, get_active_engine debe lanzar RuntimeError con mensaje
"Se requiere Microsoft Word". Elimina fallback a LibreOffice y heurístico
en la ruta de export.
"""
import sys
import pathlib
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


def _make_converter(monkeypatch, *, com_available=False, lo_available=False):
    """Crea un DocConverterService con mocks de disponibilidad."""
    from services.doc_converter import DocConverterService
    from unittest.mock import MagicMock

    mock_com = MagicMock()
    mock_com.is_available.return_value = com_available
    mock_lo = MagicMock()
    mock_lo.is_available.return_value = lo_available

    # Parchear los singletons ANTES de crear el servicio
    monkeypatch.setattr("services.doc_converter.get_com_post_processor", lambda: mock_com)
    monkeypatch.setattr("services.doc_converter.get_libreoffice_service", lambda: mock_lo)

    svc = DocConverterService()
    svc._com_processor = mock_com
    svc._lo_service = mock_lo
    return svc


def test_com_disponible_retorna_com(monkeypatch):
    """COM disponible → retorna 'COM'."""
    svc = _make_converter(monkeypatch, com_available=True)
    assert svc.get_active_engine() == "COM"


def test_com_no_disponible_lanza_runtime_error(monkeypatch):
    """COM no disponible → RuntimeError con mensaje 'Se requiere Microsoft Word'."""
    svc = _make_converter(monkeypatch, com_available=False, lo_available=False)
    with pytest.raises(RuntimeError, match="Se requiere Microsoft Word"):
        svc.get_active_engine()


def test_com_no_disponible_con_lo_disponible_igual_lanza(monkeypatch):
    """Aunque LO esté disponible, sin COM debe lanzar (D-a: sin degradación)."""
    svc = _make_converter(monkeypatch, com_available=False, lo_available=True)
    with pytest.raises(RuntimeError, match="Se requiere Microsoft Word"):
        svc.get_active_engine()


def test_force_engine_com_sin_word_lanza(monkeypatch):
    """FORCE_ENGINE=COM sin Word → RuntimeError."""
    monkeypatch.setenv("FORCE_ENGINE", "COM")
    svc = _make_converter(monkeypatch, com_available=False)
    with pytest.raises(RuntimeError, match="Se requiere Microsoft Word"):
        svc.get_active_engine()


def test_force_engine_lo_sin_lo_lanza(monkeypatch):
    """FORCE_ENGINE=LO sin LO → RuntimeError."""
    monkeypatch.setenv("FORCE_ENGINE", "LO")
    svc = _make_converter(monkeypatch, lo_available=False)
    with pytest.raises(RuntimeError, match="Se requiere LibreOffice"):
        svc.get_active_engine()


def test_force_engine_lo_con_lo_retorna_lo(monkeypatch):
    """FORCE_ENGINE=LO con LO disponible → retorna 'LO'."""
    monkeypatch.setenv("FORCE_ENGINE", "LO")
    svc = _make_converter(monkeypatch, lo_available=True)
    assert svc.get_active_engine() == "LO"
