"""
WordAPA7 — Idempotency Module

Detecta si un documento ya fue procesado previamente por WordAPA7
usando SHA-256 del contenido del archivo.

Estrategia:
1. Calcular SHA-256 del archivo .docx subido
2. Buscar en las sesiones existentes si ese hash ya fue procesado
3. Verificar si el documento tiene el marcador XML de WordAPA7
"""

import hashlib
import io
import json
import sqlite3
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class IdempotencyResult:
    already_processed: bool
    source_hash: str
    previous_session_id: Optional[str] = None
    processed_at: Optional[str] = None
    apa_score: Optional[int] = None
    has_marker: bool = False
    recommendation: str = "continue_previous"
    message: str = ""


# ── SQLite Database ──────────────────────────────────────────────────────────

DB_PATH: Optional[Path] = None


def init_sqlite_db(storage_dir: Path) -> Path:
    """
    Inicializa la base de datos SQLite para historial de sesiones.
    """
    global DB_PATH
    db_dir = storage_dir / "db"
    db_dir.mkdir(parents=True, exist_ok=True)
    DB_PATH = db_dir / "wordapa7.db"

    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id           TEXT PRIMARY KEY,
            filename     TEXT NOT NULL,
            source_hash  TEXT NOT NULL,
            processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            status       TEXT DEFAULT 'in_progress',
            apa_score    INTEGER,
            element_count INTEGER DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS hash_registry (
            source_hash  TEXT PRIMARY KEY,
            session_id   TEXT NOT NULL,
            file_name    TEXT NOT NULL,
            first_seen   DATETIME DEFAULT CURRENT_TIMESTAMP,
            times_processed INTEGER DEFAULT 1
        )
    """)
    conn.commit()
    conn.close()
    return DB_PATH


def compute_sha256(content: bytes) -> str:
    """
    Calcula el hash SHA-256 del contenido binario.
    """
    return hashlib.sha256(content).hexdigest()


def check_idempotency(
    content: bytes,
    storage_dir: Path,
) -> IdempotencyResult:
    """
    Verifica si un documento ya fue procesado por WordAPA7.

    Args:
        content: Bytes del archivo .docx subido.
        storage_dir: Directorio raiz de almacenamiento (donde estan las sesiones).

    Returns:
        IdempotencyResult con el diagnostico completo.
    """
    source_hash = compute_sha256(content)

    # Verificar el marcador XML dentro del DOCX
    has_marker = _check_wordapa7_marker(content)

    # Buscar en SQLite primero
    if DB_PATH and DB_PATH.exists():
        try:
            conn = sqlite3.connect(str(DB_PATH))
            row = conn.execute(
                "SELECT session_id, processed_at FROM hash_registry WHERE source_hash = ?",
                (source_hash,),
            ).fetchone()
            conn.close()

            if row:
                return IdempotencyResult(
                    already_processed=True,
                    source_hash=source_hash,
                    previous_session_id=row[0],
                    processed_at=row[1],
                    has_marker=has_marker,
                    recommendation="continue_previous",
                    message=(
                        f"Este documento ya fue procesado por WordAPA7 el {row[1] or 'desconocido'}. "
                        "Se recomienda continuar con la sesion anterior para no perder el progreso."
                    ),
                )
        except Exception:
            pass

    # Fallback: buscar en archivos de sesion en disco
    sessions_dir = storage_dir / "sessions"
    if not sessions_dir.exists():
        return IdempotencyResult(
            already_processed=False,
            source_hash=source_hash,
            has_marker=has_marker,
            recommendation="process_new",
            message="No hay sesiones previas. Se procesara como documento nuevo.",
        )

    for session_dir in sessions_dir.iterdir():
        if not session_dir.is_dir():
            continue

        hash_file = session_dir / "source_hash.txt"
        if hash_file.exists():
            stored_hash = hash_file.read_text().strip()
            if stored_hash == source_hash:
                return _build_result(source_hash, session_dir, has_marker)

        state_file = session_dir / "session_state.json"
        if state_file.exists():
            try:
                with open(state_file, "r", encoding="utf-8") as f:
                    state = json.load(f)
                meta = state.get("meta", {})
                if meta.get("source_hash") == source_hash:
                    return _build_result(source_hash, session_dir, has_marker)
            except (json.JSONDecodeError, KeyError, IOError):
                pass

    return IdempotencyResult(
        already_processed=False,
        source_hash=source_hash,
        has_marker=has_marker,
        recommendation="process_new",
        message="Documento nuevo. Se procesara normalmente.",
    )


def _build_result(
    source_hash: str,
    session_dir: Path,
    has_marker: bool,
) -> IdempotencyResult:
    """Construye IdempotencyResult desde un directorio de sesion existente."""
    processed_at = ""
    state_file = session_dir / "session_state.json"
    if state_file.exists():
        try:
            with open(state_file, "r", encoding="utf-8") as f:
                state = json.load(f)
            meta = state.get("meta", {})
            processed_at = meta.get("parsed_at", "")
        except Exception:
            pass

    return IdempotencyResult(
        already_processed=True,
        source_hash=source_hash,
        previous_session_id=session_dir.name,
        processed_at=processed_at,
        has_marker=has_marker,
        recommendation="continue_previous",
        message=(
            f"Este documento ya fue procesado por WordAPA7 el {processed_at or 'desconocido'}. "
            "Se recomienda continuar con la sesion anterior."
        ),
    )


def _check_wordapa7_marker(content: bytes) -> bool:
    """
    Verifica si el documento DOCX tiene el marcador invisible de WordAPA7.
    El marcador es un comentario XML: <!-- wordapa7:processed:version -->
    """
    try:
        with zipfile.ZipFile(io.BytesIO(content), "r") as zf:
            if "word/document.xml" in zf.namelist():
                doc_xml = zf.read("word/document.xml").decode("utf-8", errors="ignore")
                return "wordapa7:processed" in doc_xml
    except (zipfile.BadZipFile, UnicodeDecodeError, KeyError):
        pass
    return False


def add_marker_to_docx(docx_bytes: bytes, version: str = "1.0.0") -> bytes:
    """
    Agrega un marcador invisible de WordAPA7 al DOCX para deteccion futura.
    El marcador es un comentario XML en word/document.xml.
    """
    marker = f"<!-- wordapa7:processed:{version} -->".encode("utf-8")

    try:
        with zipfile.ZipFile(io.BytesIO(docx_bytes), "r") as in_zf:
            if "word/document.xml" not in in_zf.namelist():
                return docx_bytes

            doc_xml = in_zf.read("word/document.xml")
            if b"<w:body>" in doc_xml and marker not in doc_xml:
                doc_xml = doc_xml.replace(b"<w:body>", b"<w:body>" + marker)

            output = io.BytesIO()
            with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as out_zf:
                for item in in_zf.infolist():
                    if item.filename == "word/document.xml":
                        out_zf.writestr(item, doc_xml)
                    else:
                        out_zf.writestr(item, in_zf.read(item.filename))
            return output.getvalue()
    except (zipfile.BadZipFile, KeyError):
        return docx_bytes
