"""Tests del lector .xlsx -> tablas APA (content.ingest)."""

import io

import pytest

openpyxl = pytest.importorskip("openpyxl")

from content.ingest import xlsx_to_tables  # noqa: E402


def _xlsx_bytes(rows, sheet_name="Datos"):
    """Workbook mínimo en memoria (BytesIO) con las filas dadas."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet_name
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_xlsx_to_tables_basico():
    """Hoja con encabezado + 2 filas -> headers/rows/caption correctos."""
    data = _xlsx_bytes(
        [
            ["Col A", "Col B"],
            ["1", "x"],
            ["2", "y"],
        ]
    )
    tables = xlsx_to_tables(data)
    assert len(tables) == 1
    t = tables[0]
    assert t["sheet"] == "Datos"
    assert t["caption"] == "Tabla 1"
    assert t["headers"] == ["Col A", "Col B"]
    assert t["rows"] == [["1", "x"], ["2", "y"]]


def test_xlsx_to_tables_salta_fila_vacia():
    """Una fila totalmente vacía en medio no llega a rows."""
    data = _xlsx_bytes(
        [
            ["Col A", "Col B"],
            ["1", "x"],
            [None, None],
            ["2", "y"],
        ]
    )
    tables = xlsx_to_tables(data)
    assert len(tables) == 1
    assert tables[0]["rows"] == [["1", "x"], ["2", "y"]]
