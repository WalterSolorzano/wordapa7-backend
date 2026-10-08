import os
import sys
from pathlib import Path

# ── CONFIGURACION Y RUTAS DE ALMACENAMIENTO ──────────────────────────────────
# BASE_DIR es la raiz del proyecto en desarrollo.
# En produccion, los archivos fuente estan empaquetados, pero los DATOS del
# usuario deben guardarse en AppData para que:
# 1. Persistan entre reinicios de la app
# 2. No se borren al actualizar la app
# 3. Funcionen correctamente para CUALQUIER usuario en cualquier computadora


def _is_packaged() -> bool:
    """Detecta si estamos corriendo en el paquete Electron instalado.

    Soporta dos modos de empaquetado:
    - PyInstaller (legacy): sys.frozen está definido
    - Embedded Python (actual): python.exe oficial está en resources/python-runtime/
      y el código fuente en resources/python-runtime/python/

    Con el embedded Python, sys.frozen NO está definido (no es PyInstaller),
    así que detectamos el modo empaquetado verificando que python.exe tenga
    un directorio 'python/' con 'main.py' al lado.
    """
    if getattr(sys, "frozen", False):
        return True
    # Embedded Python: python.exe está en resources/python-runtime/
    exe_dir = Path(sys.executable).parent
    return (exe_dir / "python" / "main.py").exists()


# WORDAPA7_STORAGE_DIR permite redirigir los datos del usuario a un disco
# persistente (ej. /data en Hugging Face Spaces) para que las sesiones,
# exports y la base SQLite sobrevivan reinicios del contenedor.
_override = os.environ.get('WORDAPA7_STORAGE_DIR')
if _override:
    BASE_DIR = Path(__file__).resolve().parent.parent
    STORAGE_DIR = Path(_override)
    DIST_DIR = BASE_DIR / 'dist'
elif _is_packaged():
    # Entorno empaquetado (embedded Python en Electron)
    # python.exe está en resources/python-runtime/
    # Los datos del usuario van a AppData/Roaming (estándar Windows)
    BASE_DIR = Path(sys.executable).parent
    _appdata = Path(os.environ.get('APPDATA', Path.home() / 'AppData' / 'Roaming'))
    STORAGE_DIR = _appdata / 'WordAPA7' / 'storage'
    DIST_DIR = BASE_DIR  # No aplica en producción empaquetada
else:
    # Entorno desarrollo
    # IMPORTANTE: en desarrollo usamos la MISMA ubicación que producción
    # (%APPDATA%/WordAPA7/storage). Antes era BASE_DIR/storage, y eso hacía
    # que una instancia dev y la app instalada escribieran rutas distintas en
    # la MISMA clave del registro (HKCU\...\Wef\Developer\WordAPA7), pisándose
    # mutuamente y rompiendo el Add-in de Word según cuál hubiera corrido último.
    BASE_DIR = Path(__file__).resolve().parent.parent
    _appdata = Path(os.environ.get('APPDATA', Path.home() / 'AppData' / 'Roaming'))
    STORAGE_DIR = _appdata / 'WordAPA7' / 'storage'
    DIST_DIR = BASE_DIR / 'dist'

STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# Guard compartido por /api/open-in-word en AMBOS motores (main.py y
# core_server.py): deben rechazar exactamente lo mismo.
OPEN_IN_WORD_REJECT_MSG = "Solo se permiten .docx del almacenamiento de WordAPA7"


def validate_open_in_word_path(raw_path: str) -> Path:
    """Guard de seguridad para /api/open-in-word (criterio único compartido).

    Resuelve la ruta recibida y exige:
      1. sufijo ``.docx`` (case-insensitive)
      2. que resuelva DENTRO de STORAGE_DIR del proceso

    Lanza ValueError(OPEN_IN_WORD_REJECT_MSG) si viola el guard. La validación
    de contención va ANTES de consultar existencia en disco: así no se filtra
    información sobre archivos fuera del almacenamiento.
    """
    raw = (raw_path or "").strip()
    p = Path(raw)
    if not raw or p.suffix.lower() != ".docx":
        raise ValueError(OPEN_IN_WORD_REJECT_MSG)
    resolved = p.resolve()
    try:
        resolved.relative_to(STORAGE_DIR.resolve())
    except ValueError:
        raise ValueError(OPEN_IN_WORD_REJECT_MSG) from None
    return resolved


def get_apa7_template_path() -> Path:
    """Ruta del documento base APA 7 (apa7_template.docx).

    En desarrollo vive en la raíz del proyecto; en producción se regenera
    bajo AppData para evitar tocar el directorio de la app.
    """
    if _is_packaged():
        return STORAGE_DIR / 'apa7_template.docx'
    return BASE_DIR / 'apa7_template.docx'


def get_app_version() -> str:
    """Obtiene la versión de la app desde package.json o version.json de forma unificada."""
    import json
    for p_path in [
        BASE_DIR / "package.json",
        Path(__file__).resolve().parent / "package.json",
        Path(__file__).resolve().parent.parent / "package.json",
        Path(__file__).resolve().parent.parent.parent / "package.json",
    ]:
        if p_path.exists():
            try:
                with open(p_path, "r", encoding="utf-8") as f:
                    v = json.load(f).get("version")
                    if v:
                        return v
            except Exception:
                pass

    for v_path in [
        DIST_DIR / "version.json",
        Path(__file__).resolve().parent / "version.json",
        BASE_DIR / "dist" / "version.json",
        Path(__file__).resolve().parent.parent / "dist" / "version.json",
    ]:
        if v_path.exists():
            try:
                with open(v_path, "r", encoding="utf-8") as f:
                    v = json.load(f).get("version")
                    if v:
                        return v
            except Exception:
                pass

    return "unknown"


APP_VERSION = get_app_version()
