import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from modules.captions import scan_existing, build_caption


def test_continua_serie():
    assert scan_existing(["Tabla 1 x", "Figura 2 y"]) == {"max_table": 1, "max_figure": 2}


def test_vacio():
    assert scan_existing([]) == {"max_table": 0, "max_figure": 0}


def test_formato_apa():
    assert build_caption("table", 3) == ["Tabla 3"]
    assert build_caption("figura", 5) == ["Figura 5"]
