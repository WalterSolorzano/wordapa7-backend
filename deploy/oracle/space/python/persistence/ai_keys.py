"""
WordAPA7 — Persistencia de claves de IA

Las claves de API guardadas por el usuario en la UI (localStorage) se inyectan
en os.environ via /api/sync-provider-keys. Pero os.environ se pierde cuando el
backend Python se reinicia (watchdog, actualizaciones, crash). Este modulo
persiste las claves en un archivo JSON dentro de STORAGE_DIR para que se
restauren automaticamente al arrancar.
"""

import json
import os
from pathlib import Path

from config import STORAGE_DIR

# Variables de entorno de proveedores soportados (orden estable)
PROVIDER_ENV_VARS = [
    "NVIDIA_API_KEY",
    "GROQ_API_KEY",
    "OPENROUTER_API_KEY",
    "CEREBRAS_API_KEY",
    "MISTRAL_API_KEY",
    "OPENCODEZEN_API_KEY",
    "ZENMUX_API_KEY",
    "GEMINI_API_KEY",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
]


def _keys_path() -> Path:
    return STORAGE_DIR / "ai_keys.json"


def save_provider_keys(keys: dict) -> None:
    """Persiste las claves no vacias en el archivo de almacenamiento."""
    try:
        clean = {k: v for k, v in (keys or {}).items() if v and str(v).strip()}
        if not clean:
            return
        _keys_path().write_text(
            json.dumps(clean, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception as e:
        print(f"[WARN] No se pudieron persistir las claves de IA: {e}")


def load_provider_keys_into_env() -> int:
    """
    Carga las claves guardadas en os.environ (sin sobrescribir las ya presentes,
    por ejemplo las inyectadas por el gestor de entorno de Electron).
    Retorna cuantas claves se aplicaron.
    """
    try:
        if not _keys_path().exists():
            return 0
        data = json.loads(_keys_path().read_text(encoding="utf-8"))
    except Exception as e:
        print(f"[WARN] No se pudieron leer las claves persistidas de IA: {e}")
        return 0

    applied = 0
    for env_var in PROVIDER_ENV_VARS:
        val = str(data.get(env_var, "") or "").strip()
        if val and env_var not in os.environ:
            os.environ[env_var] = val
            applied += 1
    return applied
