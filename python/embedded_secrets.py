"""
WordAPA7 — Claves de IA embebidas (ofuscadas)

En el instalador de escritorio no existe un archivo .env, por lo que para que
la IA funcione sin configuracion se empaquetan las claves de los proveedores
de forma OFUSCADA (XOR + base64) dentro de _embedded_payload.json.

IMPORTANTE: esto es OFUSCACION, no cifrado real. Cualquier proceso que pueda
USAR la clave tambien puede EXTRAERLA (basta con depurar la app o volcar su
memoria/entorno). Eleva la barrera contra extraccion casual (strings, grep,
escaneo binario), pero NO protege contra un atacante determinado. No
distribuyas este instalador publicamente si tus claves tienen costos o son de
produccion: todos los usuarios compartirian la misma clave y cuota.
"""

import base64
import hashlib
import json
import os
import sys
from pathlib import Path

_DATA_FILE = "_embedded_payload.json"

# Semilla para derivar la clave XOR de ofuscacion. No es un secreto: esta en
# el codigo a proposito (la ofuscacion solo dificulta la lectura directa).
SEED = "wordapa7-embedded-9f3a7c1e-2026"


def _is_packaged() -> bool:
    """Detecta si estamos corriendo en modo empaquetado.

    Soporta dos modos de empaquetado:
    - **PyInstaller (legacy)**: ``sys.frozen`` está definido.
    - **Embedded Python (actual)**: ``python.exe`` oficial está en
      ``resources/python-runtime/`` y el código fuente en
      ``resources/python-runtime/python/``. Con el embedded Python,
      ``sys.frozen`` NO está definido (no es PyInstaller), así que
      detectamos el modo empaquetado verificando que ``python.exe`` tenga
      un directorio ``python/`` con ``main.py`` al lado.
    """
    if getattr(sys, "frozen", False):
        return True
    # Embedded Python: python.exe está en resources/python-runtime/
    exe_dir = Path(sys.executable).parent
    return (exe_dir / "python" / "main.py").exists()


def _base_dir() -> str:
    """Directorio base donde buscar el payload embebido (_embedded_payload.json).

    - **PyInstaller (legacy)**: ``sys._MEIPASS`` apunta al directorio de
      extracción temporal donde PyInstaller descomprime los datos bundled.
    - **Embedded Python (actual)**: ``sys._MEIPASS`` no está definido.
      El payload viaja junto al código fuente en
      ``resources/python-runtime/python/_embedded_payload.json``, por lo que
      usamos el directorio de este módulo (``__file__``).
    - **Desarrollo**: igual que embedded Python — el payload está en el
      directorio ``python/`` junto a este módulo.
    """
    # PyInstaller (legacy): _MEIPASS apunta al directorio de extracción
    if getattr(sys, "_MEIPASS", False):
        return str(sys._MEIPASS)
    # Embedded Python o desarrollo: el payload está junto al código fuente
    return os.path.dirname(os.path.abspath(__file__))


def _payload_path() -> str:
    return os.path.join(_base_dir(), _DATA_FILE)


def _xor_key() -> bytes:
    return hashlib.sha256(SEED.encode("utf-8")).digest()


def decode_payload() -> dict:
    """Decodifica el payload embebido a {VARIABLE: clave}. Retorna {} si no hay."""
    try:
        with open(_payload_path(), "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return {}
    if not isinstance(data, dict):
        return {}
    key = _xor_key()
    out = {}
    for name, enc in data.items():
        try:
            raw = base64.b64decode(str(enc))
            dec = bytes(c ^ key[i % len(key)] for i, c in enumerate(raw)).decode("utf-8")
            if dec:
                out[name] = dec
        except Exception:
            continue
    return out


def load_embedded_into_env() -> int:
    """Inyecta en os.environ las claves embebidas que aun no esten definidas.

    Prioridad (de mayor a menor): env ya definido (launcher/Electron) >
    claves del usuario (ai_keys.json) > claves embebidas del instalador.
    """
    applied = 0
    for name, val in decode_payload().items():
        if val and name not in os.environ:
            os.environ[name] = val
            applied += 1
    return applied
