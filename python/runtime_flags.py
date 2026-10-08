"""Flags de runtime centralizados (una sola fuente de verdad).

USE_SSL: Office exige HTTPS para web add-ins. Default = ACTIVADO.
Se desactiva SOLO con WORDAPA7_USE_SSL=false explícito o URL pública.
"""

from __future__ import annotations

import os
import sys


def use_ssl() -> bool:
    """True salvo desactivación explícita (WORDAPA7_USE_SSL=false) o URL pública."""
    public_url = os.environ.get("WORDAPA7_ADDIN_PUBLIC_URL", "").strip()
    if public_url:
        return False
    val = os.environ.get("WORDAPA7_USE_SSL", "").strip().lower()
    if val == "false":
        return False
    if val == "true":
        return True
    # Default: ON (Windows es nuestro único target de escritorio).
    return sys.platform == "win32"


def ssl_reason() -> str:
    if os.environ.get("WORDAPA7_ADDIN_PUBLIC_URL", "").strip():
        return "public_url"
    val = os.environ.get("WORDAPA7_USE_SSL", "").strip().lower()
    if val == "false":
        return "env_false"
    if val == "true":
        return "env_true"
    return "default_win_on"
