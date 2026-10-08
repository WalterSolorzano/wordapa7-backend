"""
WordAPA7 — Build Manifest Generator

Genera dist/version.json con hash de contenido de todos los assets
para detección de cambios y cache-busting en el frontend.
Se ejecuta automáticamente después de cada 'npm run build'.
"""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _sha256_file(filepath: Path) -> str:
    """Calcula SHA-256 de un archivo (solo primeros 64KB para velocidad)."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()[:12]


def _compute_build_hash(dist_dir: Path) -> str:
    """Hash compuesto de todos los archivos en dist/ ordenados por nombre."""
    files = sorted(f for f in dist_dir.rglob("*") if f.is_file())
    h = hashlib.sha256()
    for fp in files:
        rel = fp.relative_to(dist_dir).as_posix()
        h.update(rel.encode())
        h.update(_sha256_file(fp).encode())
    return h.hexdigest()[:12]


def _compute_src_content_hash(src_dir: Path) -> str:
    """Hash SHA-256 compuesto del contenido de src/ (mismo algoritmo que main.py)."""
    if not src_dir.exists():
        return "no-src"
    h = hashlib.sha256()
    for fp in sorted(src_dir.rglob("*")):
        if fp.is_file() and "node_modules" not in fp.parts:
            rel = fp.relative_to(src_dir).as_posix()
            h.update(rel.encode())
            try:
                with open(fp, "rb") as f:
                    while chunk := f.read(65536):
                        h.update(chunk)
            except Exception:
                pass
    return h.hexdigest()[:12]


def generate_build_manifest(dist_dir: str | Path | None = None) -> Path:
    """
    Genera dist/version.json con hash de build individuales y compuesto.
    Retorna la ruta al archivo generado.
    """
    dist = Path(dist_dir) if dist_dir else BASE_DIR / "dist"

    if not dist.exists():
        print(f"[build_manifest] dist/ no existe en {dist}. Creando directorio...")
        dist.mkdir(parents=True, exist_ok=True)

    files_meta: dict[str, dict] = {}
    all_files = sorted(f for f in dist.rglob("*") if f.is_file())
    for fp in all_files:
        rel = fp.relative_to(dist).as_posix()
        h = _sha256_file(fp)
        files_meta[rel] = {"hash": h, "size": fp.stat().st_size}

    build_hash = _compute_build_hash(dist)
    src_hash = _compute_src_content_hash(BASE_DIR / "src")

    manifest = {
        "version": "1.0.0",
        "build_hash": build_hash,
        "src_hash": src_hash,
        "build_time": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "total_files": len(files_meta),
        "files": files_meta,
    }

    out_path = dist / "version.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f"[build_manifest] [OK] version.json generado -- build_hash={build_hash}, {len(files_meta)} archivos")
    return out_path


if __name__ == "__main__":
    dist_arg = sys.argv[1] if len(sys.argv) > 1 else None
    generate_build_manifest(dist_arg)
