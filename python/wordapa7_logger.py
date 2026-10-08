"""Logger unificado WordAPA7 — JSONL por componente en %APPDATA%/WordAPA7/logs.

Todo evento relevante queda registrado paso a paso para diagnóstico posterior:
arranque, decisiones de SSL, generación de manifiesto, sideload, registro,
parseo, exportación, errores con stack. Un archivo por componente + índice.

Uso:
    from wordapa7_logger import log_event
    log_event("backend", "ssl_decision", {"use_ssl": True, "why": "default_win"})
"""

from __future__ import annotations

import json
import os
import threading
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

_LOCK = threading.Lock()

_BASE = None


def _logs_dir() -> Path:
    global _BASE
    if _BASE is None:
        base = os.environ.get("WORDAPA7_LOG_DIR")
        if not base:
            appdata = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
            base = str(Path(appdata) / "WordAPA7" / "logs")
        Path(base).mkdir(parents=True, exist_ok=True)
        _BASE = Path(base)
    return _BASE


MAX_SIZE = 5 * 1024 * 1024  # rota a .1


def _write(component: str, line: str) -> None:
    d = _logs_dir()
    f = d / f"{component}.log"
    try:
        if f.exists() and f.stat().st_size > MAX_SIZE:
            f.replace(d / f"{component}.1.log")
        with open(f, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except Exception:
        pass


def log_event(component: str, event: str, data: Optional[Dict[str, Any]] = None,
              level: str = "info") -> None:
    rec = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "component": component,
        "event": event,
        "data": data or {},
    }
    with _LOCK:
        _write(component, json.dumps(rec, ensure_ascii=False, default=str))


def log_error(component: str, event: str, exc: BaseException,
              data: Optional[Dict[str, Any]] = None) -> None:
    log_event(component, event, {
        **(data or {}),
        "error": str(exc),
        "stack": traceback.format_exc(limit=6),
    }, level="error")


# ------------------------------------------------------------- diagnostics
def collect_diagnostics(tail_lines: int = 200) -> dict:
    """Snapshot completo: entorno SSL/cert/manifest/registro + colas de logs."""
    import sys

    d = _logs_dir()
    logs = {}
    for f in sorted(d.glob("*.log")):
        try:
            lines = f.read_text(encoding="utf-8", errors="ignore").splitlines()
            logs[f.name] = lines[-tail_lines:]
        except Exception as e:
            logs[f.name] = [f"<error leyendo: {e}>"]

    env_snap = {}
    for k in ("WORDAPA7_USE_SSL", "WORDAPA7_ADDIN_PUBLIC_URL", "WORDAPA7_BACKEND_URL",
              "WORDAPA7_LAYERED_GEN", "APP_USERDATA"):
        env_snap[k] = os.environ.get(k)

    manifest_info = {}
    try:
        from config import STORAGE_DIR
        m = STORAGE_DIR / "manifest.xml"
        if m.exists():
            xml = m.read_text(encoding="utf-8", errors="ignore")
            import re as _re
            ids = _re.findall(r"<Id>([^<]+)</Id>", xml)
            urls = _re.findall(r'DefaultValue="(https?://[^"]+)"', xml)[:4]
            manifest_info = {"path": str(m), "size": m.stat().st_size,
                             "mtime": datetime.fromtimestamp(m.stat().st_mtime).isoformat(),
                             "id": ids[0] if ids else None, "urls_sample": urls}
    except Exception as e:
        manifest_info = {"error": str(e)}

    ssl_state = {"use_ssl_env": os.environ.get("WORDAPA7_USE_SSL")}
    try:
        from config import STORAGE_DIR as SD
        cert = SD / "ssl" / "localhost.pem"
        ssl_state["cert_exists"] = cert.exists()
    except Exception:
        pass

    registry = {}
    if sys.platform == "win32":
        try:
            import winreg
            kpath = r"Software\Microsoft\Office\16.0\Wef\Developer"
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, kpath) as k:
                i = 0
                while True:
                    try:
                        name, val, _ = winreg.EnumValue(k, i)
                    except OSError:
                        break
                    registry[f"{kpath}\\{name}"] = val
                    i += 1
        except Exception as e:
            registry["error"] = str(e)

    system_feed = {}
    if sys.platform == "win32":
        sf = (Path(os.environ.get("APPDATA", "")) / "Microsoft" / "Windows"
              / "Start Menu" / "Programs" / "Microsoft Office System Feed")
        target = sf / "WordAPA7.xml"
        system_feed = {"dir_exists": sf.is_dir(), "manifest_installed": target.exists()}
        if target.exists():
            system_feed["size"] = target.stat().st_size
            system_feed["mtime"] = datetime.fromtimestamp(target.stat().st_mtime).isoformat()

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "pid": os.getpid(),
        "python": sys.version.split()[0],
        "env": env_snap,
        "ssl": ssl_state,
        "manifest": manifest_info,
        "registry_wef_developer": registry,
        "system_feed": system_feed,
        "logs_tail": logs,
    }
