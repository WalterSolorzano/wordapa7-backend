import os
import sys
from pathlib import Path

# ── CONFIGURACION Y RUTAS DE ALMACENAMIENTO ──────────────────────────────────
# BASE_DIR es la raiz del proyecto en desarrollo.
# En produccion (PyInstaller frozen), los archivos fuente estan en un directorio
# temporal, pero los DATOS del usuario deben guardarse en AppData para que:
# 1. Persistan entre reinicios de la app
# 2. No se borren al actualizar la app
# 3. Funcionen correctamente para CUALQUIER usuario en cualquier computadora

# WORDAPA7_STORAGE_DIR permite redirigir los datos del usuario a un disco
# persistente (ej. /data en Hugging Face Spaces) para que las sesiones,
# exports y la base SQLite sobrevivan reinicios del contenedor.
_override = os.environ.get('WORDAPA7_STORAGE_DIR')
if _override:
    BASE_DIR = Path(__file__).resolve().parent.parent
    STORAGE_DIR = Path(_override)
    DIST_DIR = BASE_DIR / 'dist'
elif getattr(sys, 'frozen', False):
    # Entorno PyInstaller (produccion)
    BASE_DIR = Path(sys.executable).parent
    # Usar AppData/Roaming para datos del usuario (estandar Windows)
    _appdata = Path(os.environ.get('APPDATA', Path.home() / 'AppData' / 'Roaming'))
    STORAGE_DIR = _appdata / 'WordAPA7' / 'storage'
    DIST_DIR = Path(sys.executable).parent  # No aplica en produccion
else:
    # Entorno desarrollo
    BASE_DIR = Path(__file__).resolve().parent.parent
    STORAGE_DIR = BASE_DIR / 'storage'
    DIST_DIR = BASE_DIR / 'dist'

STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def get_apa7_template_path() -> Path:
    """Ruta del documento base APA 7 (apa7_template.docx).

    En desarrollo vive en la raíz del proyecto; en producción (PyInstaller)
    se regenera bajo AppData para evitar tocar el directorio de la app.
    """
    if getattr(sys, 'frozen', False):
        return STORAGE_DIR / 'apa7_template.docx'
    return BASE_DIR / 'apa7_template.docx'
