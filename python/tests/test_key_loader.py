"""Cascada unica de carga de claves, compartida por main.py y core_server.py.

Ruling (Task 3): el plan invocaba load_provider_keys_into_env(path), pero la
firma real es load_provider_keys_into_env() -> int y lee de _keys_path()
(STORAGE_DIR). El test inyecta la ruta monkeypatcheando _keys_path en el modulo
persistence.ai_keys, que es de donde la funcion la toma de verdad.
"""
import os

import key_loader


def test_usuario_gana_sobre_embedded(tmp_path, monkeypatch):
    # ai_keys.json define GROQ_API_KEY de usuario
    (tmp_path / "ai_keys.json").write_text(
        '{"GROQ_API_KEY": "usuario-123"}', encoding="utf-8"
    )
    monkeypatch.setattr(
        "persistence.ai_keys._keys_path", lambda: tmp_path / "ai_keys.json"
    )
    os.environ.pop("GROQ_API_KEY", None)
    # embedded intenta poner otra
    monkeypatch.setattr(
        key_loader, "load_embedded_into_env",
        lambda: 1, raising=False,
    )
    monkeypatch.setattr(
        key_loader, "_embedded_payload_override",
        {"GROQ_API_KEY": "embedded-999"}, raising=False,
    )
    # repo_root=tmp_path: no leer el .env real del dev, que contaminaria el caso.
    key_loader.load_all_key_sources(repo_root=tmp_path)
    assert os.environ["GROQ_API_KEY"] == "usuario-123"


def test_no_pisa_lo_ya_presente_en_entorno(tmp_path, monkeypatch):
    os.environ["NVIDIA_API_KEY"] = "pre-existente"
    monkeypatch.setattr(
        "persistence.ai_keys._keys_path", lambda: None
    )
    monkeypatch.setattr(
        key_loader, "load_embedded_into_env",
        lambda: 0, raising=False,
    )
    key_loader.load_all_key_sources(repo_root=tmp_path)
    assert os.environ["NVIDIA_API_KEY"] == "pre-existente"
