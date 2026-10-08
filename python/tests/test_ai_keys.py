"""
WordAPA7 — Tests de persistencia de claves de IA (persistence/ai_keys.py).
Verifica que las claves se guarden a disco y se restablezcan en os.environ
sin pisar valores ya presentes.
"""

import json
import os

import pytest


@pytest.fixture(autouse=True)
def isolated_keys(tmp_path, monkeypatch):
    """Apunta ai_keys a un directorio temporal y limpia el entorno."""
    import persistence.ai_keys as ak
    # Redirigir el archivo de claves al tmp_path
    monkeypatch.setattr(ak, "_keys_path", lambda: tmp_path / "ai_keys.json")
    # Limpiar variables de IA del entorno
    for env in ak.PROVIDER_ENV_VARS:
        monkeypatch.delenv(env, raising=False)
    yield ak


def test_save_and_restore_keys(isolated_keys):
    ak = isolated_keys
    ak.save_provider_keys({
        "NVIDIA_API_KEY": "nvapi-test-123",
        "GROQ_API_KEY": "gsk-test",
        "GEMINI_API_KEY": "",   # vacío se ignora
    })

    # El archivo existe y no contiene claves vacías
    path = ak._keys_path()
    assert path.exists()
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data == {"NVIDIA_API_KEY": "nvapi-test-123", "GROQ_API_KEY": "gsk-test"}

    # Cargar restaura en os.environ
    applied = ak.load_provider_keys_into_env()
    assert applied == 2
    assert os.environ.get("NVIDIA_API_KEY") == "nvapi-test-123"
    assert os.environ.get("GROQ_API_KEY") == "gsk-test"


def test_load_does_not_overwrite_existing_env(isolated_keys):
    ak = isolated_keys
    ak.save_provider_keys({"NVIDIA_API_KEY": "nvapi-nueva"})
    os.environ["NVIDIA_API_KEY"] = "nvapi-existente"

    applied = ak.load_provider_keys_into_env()
    # No debe sobrescribir la variable ya presente
    assert applied == 0
    assert os.environ["NVIDIA_API_KEY"] == "nvapi-existente"


def test_no_file_returns_zero(isolated_keys):
    ak = isolated_keys
    assert ak.load_provider_keys_into_env() == 0
