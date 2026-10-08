"""Storage aislado: los tests jamas escriben en el storage real (Issue #16).

Indice de comportamiento: conftest.py fija WORDAPA7_STORAGE_DIR a un
directorio temporal ANTES de que config.py se importe, de modo que
sesiones, presets y exports de prueba no tocan el APPDATA del usuario.
"""

import os
from pathlib import Path


def test_conftest_fija_wordapa7_storage_dir():
    """El conftest declara el storage temporal de pruebas al cargar."""
    env = os.environ.get("WORDAPA7_STORAGE_DIR")
    assert env, (
        "conftest.py debe fijar WORDAPA7_STORAGE_DIR antes de importar config"
    )


def test_config_usa_storage_aislado():
    """config.STORAGE_DIR apunta al temporal, nunca al APPDATA real."""
    from config import STORAGE_DIR

    env = Path(os.environ["WORDAPA7_STORAGE_DIR"])
    assert STORAGE_DIR == env, (
        f"STORAGE_DIR={STORAGE_DIR} ignora el override {env}"
    )
    assert STORAGE_DIR.exists()

    appdata = os.environ.get("APPDATA")
    if appdata:
        real = (Path(appdata) / "WordAPA7" / "storage").resolve()
        assert real != STORAGE_DIR.resolve()
        assert real not in STORAGE_DIR.resolve().parents
