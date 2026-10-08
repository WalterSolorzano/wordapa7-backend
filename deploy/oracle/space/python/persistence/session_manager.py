"""
WordAPA7 — Gestor de Sesiones y Persistencia SQLite

Sustituye a la anterior persistencia JSON para mejorar el rendimiento
y escalabilidad.
"""
import json
import os
import shutil
import sqlite3
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from models import DocumentModel

# TTL por defecto para sesiones inactivas: 24 horas.
SESSION_TTL_SECONDS = int(os.environ.get("WORDAPA7_SESSION_TTL_HOURS", "24")) * 3600
# Intervalo entre recolecciones de basura: 1 hora.
GC_INTERVAL_SECONDS = int(os.environ.get("WORDAPA7_GC_INTERVAL_SECONDS", "3600"))
_last_gc_run: float = 0.0
_gc_lock = threading.Lock()

# Reutilizamos la base de datos ya inicializada en idempotency
DB_PATH: Optional[Path] = None
redis_client = None

def get_redis():
    global redis_client
    if redis_client is not None:
        return redis_client

    redis_url = os.environ.get("REDIS_URL")
    if redis_url:
        try:
            import redis
            client = redis.Redis.from_url(redis_url, decode_responses=True)
            client.ping()
            redis_client = client
            return redis_client
        except Exception as e:
            print(f"Warning: Failed to connect to Redis at {redis_url}. Fallback to SQLite. ({e})")
            pass
    return None

def init_db(storage_dir: Path):
    global DB_PATH
    db_dir = storage_dir / "db"
    db_dir.mkdir(parents=True, exist_ok=True)
    DB_PATH = db_dir / "wordapa7_sessions.db"

    conn = sqlite3.connect(str(DB_PATH))
    # Activar WAL para mejorar concurrencia (lecturas no bloquean escrituras)
    # y reducir errores "database is locked" en escenarios multi-worker.
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA wal_autocheckpoint=1000")
    except sqlite3.OperationalError as e:
        print(f"[WARN] No se pudo activar WAL mode: {e}")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS session_data (
            session_id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS session_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

def save_session_state(doc: DocumentModel, storage_dir: Path) -> Path:
    if DB_PATH is None:
        init_db(storage_dir)

    if doc.meta:
        doc.meta.autosave_at = datetime.now(timezone.utc).isoformat()

    json_data = doc.model_dump_json()

    r = get_redis()
    if r:
        r.set(f"session:{doc.session_id}", json_data, ex=86400) # 24 hour expiry
    else:
        conn = sqlite3.connect(str(DB_PATH))
        conn.execute(
            "INSERT OR REPLACE INTO session_data (session_id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
            (doc.session_id, json_data)
        )
        conn.commit()
        conn.close()

    # Fake file path to keep compatibility
    return storage_dir / "sessions" / doc.session_id / "session_state.json"

def load_session_state(session_id: str, storage_dir: Path) -> Optional[DocumentModel]:
    r = get_redis()
    json_data = None

    if r:
        json_data = r.get(f"session:{session_id}")

    if not json_data:
        if DB_PATH is None:
            init_db(storage_dir)

        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute("SELECT data FROM session_data WHERE session_id = ?", (session_id,))
        row = cursor.fetchone()
        conn.close()

        if row:
            json_data = row[0]
            # Warm up redis cache if we fetched from sqlite
            if r:
                r.set(f"session:{session_id}", json_data, ex=86400)

    if not json_data:
        return None

    try:
        data = json.loads(json_data)
        return DocumentModel.model_validate(data)
    except Exception as e:
        print(f"Error loading session {session_id}: {e}")
        return None

def list_recent_sessions(storage_dir: Path, limit: int = 10) -> list[dict]:
    if DB_PATH is None:
        init_db(storage_dir)

    sessions = []
    try:
        conn = sqlite3.connect(str(DB_PATH))
        rows = conn.execute("SELECT session_id, data FROM session_data ORDER BY updated_at DESC LIMIT ?", (limit,)).fetchall()
        conn.close()

        for row in rows:
            try:
                data = json.loads(row[1])
                elements = data.get("elements", [])
                pending_count = sum(1 for e in elements if e.get("needs_review", True) or e.get("confidence", 0) < 0.85)
                sessions.append({
                    "session_id": row[0],
                    "file_name": data.get("file_name", "Desconocido"),
                    "element_count": len(elements),
                    "pending_count": pending_count,
                    "apa_format": data.get("apa_format", "student"),
                    "parsed_at": data.get("meta", {}).get("parsed_at", ""),
                    "autosave_at": data.get("meta", {}).get("autosave_at", ""),
                    "last_saved": data.get("meta", {}).get("autosave_at", ""),
                    "validation_score": data.get("apa_validation", {}).get("score") if data.get("apa_validation") else None,
                })
            except Exception:
                continue
    except Exception as e:
        print(f"[ERROR] Error al listar sesiones recientes SQLite: {e}")

    return sessions

def delete_session(session_id: str, storage_dir: Path) -> bool:
    if DB_PATH is None:
        init_db(storage_dir)

    try:
        conn = sqlite3.connect(str(DB_PATH))
        conn.execute("DELETE FROM session_data WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM session_snapshots WHERE session_id = ?", (session_id,))
        conn.commit()
        conn.close()

        # Opcionalmente borrar la carpeta
        import shutil
        session_dir = storage_dir / "sessions" / session_id
        if session_dir.exists():
            shutil.rmtree(session_dir)

        return True
    except Exception as e:
        print(f"[ERROR] Error eliminando sesion {session_id}: {e}")
        return False

def save_session_snapshot(doc_model, storage_dir: Path):
    if DB_PATH is None:
        init_db(storage_dir)
    try:
        json_data = doc_model.model_dump_json()
        conn = sqlite3.connect(str(DB_PATH))

        # Keep only last 5 snapshots
        count = conn.execute("SELECT COUNT(*) FROM session_snapshots WHERE session_id = ?", (doc_model.session_id,)).fetchone()[0]
        if count >= 5:
            oldest_id = conn.execute("SELECT id FROM session_snapshots WHERE session_id = ? ORDER BY id ASC LIMIT 1", (doc_model.session_id,)).fetchone()[0]
            conn.execute("DELETE FROM session_snapshots WHERE id = ?", (oldest_id,))

        conn.execute(
            "INSERT INTO session_snapshots (session_id, data) VALUES (?, ?)",
            (doc_model.session_id, json_data)
        )
        conn.commit()
        conn.close()

        return "snapshot_saved_sqlite"
    except Exception as e:
        print(f"[WARN] Error saving snapshot SQLite: {e}")
        return None


def cleanup_expired_sessions(storage_dir: Path, ttl_seconds: Optional[int] = None) -> int:
    """
    Elimina sesiones inactivas por más de `ttl_seconds`.

    Limpia:
      - Filas en `session_data` y `session_snapshots` con updated_at antiguo.
      - Carpetas en storage_dir/sessions/{session_id} asociadas.
      - Archivos temporales sueltos (preview.pdf, page_*.png, APA7_*.docx,
        Tracked_*.docx, Preview_*.docx, FinalPDFSource_*.docx) en cada sesión.

    Devuelve el número de sesiones eliminadas. Es idempotente y seguro de
    llamar concurrentemente (protegido por _gc_lock).
    """
    global _last_gc_run
    if ttl_seconds is None:
        ttl_seconds = SESSION_TTL_SECONDS

    if DB_PATH is None:
        init_db(storage_dir)

    deleted = 0
    # THROTTLE: ejecutar como máximo una vez cada GC_INTERVAL_SECONDS.
    acquired = _gc_lock.acquire(blocking=False)
    if not acquired:
        return 0
    try:
        now = time.time()
        if now - _last_gc_run < GC_INTERVAL_SECONDS:
            return 0
        _last_gc_run = now

        cutoff_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        # SQLite almacena updated_at como texto ISO; comparamos restando segundos.
        conn = sqlite3.connect(str(DB_PATH))
        try:
            rows = conn.execute(
                "SELECT session_id FROM session_data "
                "WHERE CAST(strftime('%s', updated_at) AS INTEGER) < ?",
                (int(now) - ttl_seconds,)
            ).fetchall()
            expired_ids = [r[0] for r in rows]
        finally:
            conn.close()

        sessions_root = storage_dir / "sessions"
        # Patrones de archivos temporales que se acumulan indefinidamente.
        temp_patterns = ("preview.pdf", "FinalPDFSource_", "Preview_", "APA7_", "Tracked_")

        for sid in expired_ids:
            # Borrar DB rows (ignora sesiones inexistentes)
            try:
                conn = sqlite3.connect(str(DB_PATH))
                conn.execute("DELETE FROM session_data WHERE session_id = ?", (sid,))
                conn.execute("DELETE FROM session_snapshots WHERE session_id = ?", (sid,))
                conn.commit()
                conn.close()
            except Exception as e:
                print(f"[GC] Error borrando sesión {sid} de DB: {e}")

            # Borrar carpeta completa de la sesión
            session_dir = sessions_root / sid
            if session_dir.exists():
                try:
                    shutil.rmtree(session_dir)
                except Exception as e:
                    print(f"[GC] Error borrando directorio {session_dir}: {e}")

            deleted += 1

        # Limpieza de archivos temporales sueltos en sesiones aún vivas
        # (que por su antigüedad hayan superado la mitad del TTL).
        if sessions_root.exists():
            half_ttl = ttl_seconds // 2
            cutoff_mtime = now - half_ttl
            for session_dir in sessions_root.iterdir():
                if not session_dir.is_dir():
                    continue
                try:
                    for f in session_dir.iterdir():
                        try:
                            if (f.is_file()
                                    and f.stat().st_mtime < cutoff_mtime
                                    and (f.name.startswith(temp_patterns)
                                         or f.name.startswith("page_"))):
                                f.unlink()
                        except Exception:
                            continue
                except Exception:
                    continue

        return deleted
    finally:
        _gc_lock.release()


def maybe_run_gc(storage_dir: Path) -> int:
    """Ejecuta cleanup_expired_sessions solo si ha pasado el intervalo."""
    return cleanup_expired_sessions(storage_dir)
