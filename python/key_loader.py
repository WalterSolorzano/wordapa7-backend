"""Carga unica de claves de IA para cualquier proceso (main.py y core_server.py).

Orden, primero gana (todos respetan "si no esta en os.environ"):
  1. .env de la raiz del repo (solo dev; en el instalador no existe)
  2. %APPDATA%\\WordAPA7\\storage\\ai_keys.json  (lo escribe la UI: gana sobre embedded)
  3. _embedded_payload.json                      (viaja en el instalador)

Ruling (Task 3): load_provider_keys_into_env() no acepta ruta; lee de
_keys_path() en persistence.ai_keys. Esta funcion no lo redefine: lo llama tal
cual, para que la ruta real y la inyectada en tests sigan viviendo en un solo
lugar. En tests se monkeypatchea persistence.ai_keys._keys_path.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, Optional

from dotenv import load_dotenv

from embedded_secrets import load_embedded_into_env
from persistence.ai_keys import load_provider_keys_into_env


def load_all_key_sources(repo_root: Optional[Path] = None) -> Dict[str, str]:
    """Aplica las tres fuentes de claves y devuelve cuantas aplico cada una.

    Nunca pisa una variable ya presente en os.environ: el usuario (o el
    launcher de Electron) siempre gana sobre lo persistido y lo embebido.
    """
    aplicadas: Dict[str, str] = {}
    raiz = Path(repo_root) if repo_root else Path(__file__).resolve().parent.parent
    env_file = raiz / ".env"
    if env_file.exists():
        load_dotenv(env_file)
        aplicadas["dotenv"] = "aplicado"

    antes = set(k for k, v in os.environ.items() if v)
    load_provider_keys_into_env()
    aplicadas["ai_keys"] = str(len([k for k in os.environ if k not in antes]))

    antes = set(k for k, v in os.environ.items() if v)
    load_embedded_into_env()
    aplicadas["embedded"] = str(len([k for k in os.environ if k not in antes]))
    return aplicadas
