#!/usr/bin/env python3
"""
WordAPA7 — Build Embedded Python Runtime
=======================================

Reemplaza PyInstaller con la distribución oficial de Python embebida
(Python Embeddable Distribution) para EVITAR falsos positivos de
Windows Defender.

PROBLEMA con PyInstaller:
  PyInstaller crea python-backend.exe, un ejecutable cuyo patrón de
  comportamiento (extraer a temp, cargar DLLs embebidas) es idéntico
  al del malware. Windows Defender lo flaggea sistemáticamente, tanto
  durante el build como en la máquina del usuario final.

SOLUCIÓN con Python embebido:
  Usamos el python.exe OFICIAL de python.org, firmado por Python
  Software Foundation. Defender confía en él por defecto. El código
  fuente viaja como archivos .py normales (nadie los flaggea).
  Electron ejecuta:  python.exe main.py --port 8742

SALIDA: dist-python/python-runtime/
  ├── python.exe          (oficial, firmado por PSF)
  ├── pythonw.exe         (sin ventana de consola)
  ├── python313.dll
  ├── python313._pth      (configurado para site-packages)
  ├── Lib/site-packages/  (todas las dependencias)
  └── python/             (código fuente de la app)
      ├── main.py
      ├── config.py
      ├── ...
      └── _embedded_payload.json
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

# ── CONFIGURACIÓN ────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent.parent
PYTHON_SRC = ROOT / "python"
OUTPUT_DIR = ROOT / "dist-python" / "python-runtime"
REQUIREMENTS = ROOT / "requirements.txt"

# Directorios/archivos a excluir al copiar el código fuente
_EXCLUDE_DIRS = {
    "__pycache__", "tests", "storage", ".pytest_cache", ".ruff_cache",
    "capturas-stitch", "screenshots",
}


def _py_version() -> str:
    """Versión de Python del sistema (ej: 3.13.7)."""
    return f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"


def _py_tag() -> str:
    """Tag corto (ej: 313 para Python 3.13)."""
    return f"{sys.version_info.major}{sys.version_info.minor}"


def _download(url: str, dest: Path) -> None:
    """Descarga un archivo con indicación de progreso."""
    print(f"  Descargando {url} ...")
    req = urllib.request.urlopen(url)
    total = int(req.headers.get("Content-Length", 0))
    downloaded = 0
    chunk = 64 * 1024
    with open(dest, "wb") as f:
        while True:
            data = req.read(chunk)
            if not data:
                break
            f.write(data)
            downloaded += len(data)
            if total > 0:
                pct = downloaded * 100 // total
                mb = downloaded // (1024 * 1024)
                tmb = total // (1024 * 1024)
                print(f"\r  {mb} / {tmb} MB ({pct}%)", end="", flush=True)
    print()


def _run_with_retries(cmd: list[str], max_retries: int = 3, delay: int = 5,
                      cwd: str | None = None, label: str = "") -> subprocess.CompletedProcess:
    """Ejecuta un comando con reintentos para errores transitorios.

    Windows Defender puede bloquear archivos temporalmente mientras los
    escanea (WinError 32: archivo en uso). Con reintentos + delay, el
    scan termina y el siguiente intento funciona.
    """
    for attempt in range(1, max_retries + 1):
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
        if result.returncode == 0:
            return result
        stderr_short = (result.stderr or "")[-500:]
        if attempt < max_retries:
            print(f"  [{label}] Intento {attempt}/{max_retries} falló, reintentando en {delay}s...")
            print(f"  Error: {stderr_short.strip()[:200]}")
            time.sleep(delay)
        else:
            print(f"  [{label}] Falló tras {max_retries} intentos")
            print(f"  Error final: {stderr_short.strip()[:500]}")
            return result
    return result


def _ignore_fn(directory: str, names: list[str]) -> set[str]:
    """Función de exclusión para shutil.copytree."""
    ignored: set[str] = set()
    for name in names:
        full = Path(directory) / name
        if name in _EXCLUDE_DIRS:
            ignored.add(name)
        elif name.endswith((".pyc", ".pyo")):
            ignored.add(name)
        # Excluir scripts de debug/análisis del nivel raíz de python/
        elif full.parent == PYTHON_SRC and name.endswith(".py"):
            lower = name.lower()
            if (
                lower.startswith("test_")
                or lower.startswith("deep_analyze")
                or lower.startswith("analyze_")
                or lower.startswith("check_")
                or lower.startswith("compare_")
                or lower.startswith("fix_")
                or lower.startswith("regenerate_")
                or lower.startswith("inspect_")
                or lower.startswith("search_")
                or lower.startswith("take_")
                or lower.startswith("trace_")
                or lower.startswith("demo_")
                or lower.startswith("audit_")
                or lower.startswith("scratch_")
                or lower.startswith("_")
                or lower in {"find_authors.py", "trainer.py", "upload_test.py",
                             "test_flow.py", "debug_cover_elements.py"}
            ):
                ignored.add(name)
        # Excluir documentos .docx de prueba
        elif name.endswith(".docx") and name != "apa7_template.docx":
            ignored.add(name)
    return ignored


def main() -> int:
    version = _py_version()
    tag = _py_tag()
    print(f"{'=' * 60}")
    print(f"  Build Embedded Python Runtime  (Python {version})")
    print(f"{'=' * 60}")

    # ── STEP 1: Limpiar salida ──────────────────────────────────────────────
    if OUTPUT_DIR.exists():
        print("\n[1/9] Limpiando directorio de salida...")
        shutil.rmtree(OUTPUT_DIR, ignore_errors=True)
    OUTPUT_DIR.parent.mkdir(parents=True, exist_ok=True)

    # ── STEP 2: Descargar distribución embebida ─────────────────────────────
    print(f"\n[2/9] Descargando Python {version} embeddable...")
    zip_url = (
        f"https://www.python.org/ftp/python/{version}/"
        f"python-{version}-embed-amd64.zip"
    )
    zip_path = OUTPUT_DIR.parent / f"python-{version}-embed-amd64.zip"
    if zip_path.exists():
        print(f"  Usando cache local: {zip_path}")
    else:
        try:
            _download(zip_url, zip_path)
        except Exception as e:
            print(f"  ERROR: No se pudo descargar Python {version} embeddable.")
            print(f"  URL: {zip_url}")
            print(f"  Error: {e}")
            print(f"  Descarga manual y coloca el zip en: {zip_path}")
            return 1

    # ── STEP 3: Extraer ──────────────────────────────────────────────────────
    print(f"\n[3/9] Extrayendo distribucion embebida...")
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(OUTPUT_DIR)
    print(f"  Extraido en: {OUTPUT_DIR}")

    # ── STEP 4: Habilitar site-packages y carpeta python (._pth) ───────────
    print(f"\n[4/9] Configurando site-packages y sys.path...")
    pth_file = OUTPUT_DIR / f"python{tag}._pth"
    if pth_file.exists():
        # Reescribir el archivo para asegurar que `import site`, `python/` y `Lib/site-packages/` estén activos
        pth_file.write_text(
            f"python{tag}.zip\n"
            f".\n"
            f"python\n"
            f"Lib/site-packages\n"
            f"import site\n",
            encoding="utf-8",
        )
        print(f"  {pth_file.name} configurado (site-packages y python habilitados)")
    else:
        print(f"  WARNING: {pth_file.name} no encontrado")

    # ── STEP 5: Instalar pip (con reintentos) ──────────────────────────────
    print(f"\n[5/9] Instalando pip...")
    get_pip = OUTPUT_DIR / "get-pip.py"
    try:
        _download("https://bootstrap.pypa.io/get-pip.py", get_pip)
    except Exception as e:
        print(f"  ERROR: No se pudo descargar get-pip.py: {e}")
        return 1

    py_exe = str(OUTPUT_DIR / "python.exe")
    result = _run_with_retries(
        [py_exe, str(get_pip), "--no-warn-script-location", "--no-cache-dir"],
        max_retries=3, delay=5, cwd=str(OUTPUT_DIR), label="get-pip"
    )
    if result.returncode != 0:
        print(f"  ERROR: pip installation failed")
        return 1
    get_pip.unlink(missing_ok=True)
    print("  pip instalado correctamente")

    # ── STEP 6: Instalar dependencias (con reintentos) ─────────────────────
    print(f"\n[6/9] Instalando dependencias desde requirements.txt...")
    if not REQUIREMENTS.exists():
        print(f"  ERROR: {REQUIREMENTS} no encontrado")
        return 1

    result = _run_with_retries(
        [py_exe, "-m", "pip", "install",
         "-r", str(REQUIREMENTS),
         "--no-warn-script-location",
         "--no-cache-dir",
         "--disable-pip-version-check"],
        max_retries=3, delay=5, cwd=str(OUTPUT_DIR), label="pip install"
    )
    if result.returncode != 0:
        print(f"  ERROR: pip install failed")
        return 1
    print("  Dependencias instaladas correctamente")

    # ── STEP 6b: pywin32 post-install (best-effort) ──────────────────────────
    postinstall = OUTPUT_DIR / "Scripts" / "pywin32_postinstall.py"
    if postinstall.exists():
        print("  Configurando pywin32...")
        try:
            subprocess.run(
                [py_exe, str(postinstall), "-install"],
                capture_output=True, text=True, cwd=str(OUTPUT_DIR),
                timeout=30,
            )
            print("  pywin32 postinstall OK")
        except Exception as e:
            print(f"  pywin32 postinstall omitido (no critico): {e}")

    # ── STEP 7: Copiar codigo fuente ────────────────────────────────────────
    print(f"\n[7/9] Copiando codigo fuente de la aplicacion...")
    src_dest = OUTPUT_DIR / "python"
    shutil.copytree(str(PYTHON_SRC), str(src_dest), ignore=_ignore_fn, dirs_exist_ok=True)
    print(f"  Codigo fuente copiado en: {src_dest}")

    # Copiar _embedded_payload.json (generado por embed_payload.py)
    payload = PYTHON_SRC / "_embedded_payload.json"
    if payload.exists():
        shutil.copy2(str(payload), str(src_dest / "_embedded_payload.json"))
        print("  Payload de claves ofuscadas copiado")
    else:
        print("  WARNING: _embedded_payload.json no encontrado")

    # ── STEP 8: Limpiar archivos innecesarios ──────────────────────────────
    print(f"\n[8/9] Limpiando archivos innecesarios...")
    removed = 0
    for item in list(OUTPUT_DIR.rglob("__pycache__")):
        shutil.rmtree(item, ignore_errors=True)
        removed += 1
    for item in list(OUTPUT_DIR.rglob("*.pdb")):
        item.unlink(missing_ok=True)
        removed += 1
    # ── STEP 8b: Reasegurar ._pth ──────────────────────────────────────────
    pth_file = OUTPUT_DIR / f"python{tag}._pth"
    if pth_file.exists():
        pth_file.write_text(
            f"python{tag}.zip\n"
            f".\n"
            f"python\n"
            f"Lib/site-packages\n"
            f"import site\n",
            encoding="utf-8",
        )

    # ── STEP 9: Verificar ──────────────────────────────────────────────────
    print(f"\n[9/9] Verificando instalacion...")
    verify_cmd = (
        "import fastapi, uvicorn, docx, lxml, PIL, pydantic, "
        "cryptography, networkx, openai, aiofiles, psutil; "
        "print('OK: todas las dependencias importadas correctamente')"
    )
    result = subprocess.run(
        [py_exe, "-c", verify_cmd],
        capture_output=True, text=True, cwd=str(OUTPUT_DIR)
    )
    if result.returncode == 0:
        print(f"  OK: {result.stdout.strip()}")
    else:
        print(f"  ERROR de importacion:\n  {result.stderr.strip()}")
        return 1

    # Verificar que main.py es importable
    result2 = subprocess.run(
        [py_exe, "-c", "import sys; sys.path.insert(0, r'python'); import config; print(f'config.BASE_DIR={config.BASE_DIR}')"],
        capture_output=True, text=True, cwd=str(OUTPUT_DIR)
    )
    if result2.returncode == 0:
        print(f"  OK: {result2.stdout.strip()}")
    else:
        print(f"  WARNING importando config:\n  {result2.stderr.strip()[:300]}")

    # ── Resumen ─────────────────────────────────────────────────────────────
    total_size = sum(f.stat().st_size for f in OUTPUT_DIR.rglob("*") if f.is_file())
    print(f"\n{'=' * 60}")
    print(f"  Runtime creado exitosamente")
    print(f"{'=' * 60}")
    print(f"  Ubicacion:  {OUTPUT_DIR}")
    print(f"  Tamano:     {total_size // (1024 * 1024)} MB")
    print(f"  Python:     {version}")
    print(f"  python.exe: {OUTPUT_DIR / 'python.exe'}")
    print(f"  Source:     {OUTPUT_DIR / 'python' / 'main.py'}")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
