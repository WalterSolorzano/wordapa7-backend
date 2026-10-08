"""WordAPA7 CORE SERVICE — núcleo permanente para el complemento.
Solo inteligencia (planes/refs/sugerencias). Sin UI, sin parsing pesado.
Login → pythonw core_server.py :8742 → el add-in tiene artillería instantánea.
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from typing import List

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from key_loader import load_all_key_sources

# Sin esto, el core queda sin ninguna key (el NSIS lo registra en autostart) y
# la IA del complemento arrancaria muda. Misma cascada que main.py.
load_all_key_sources()

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

try:
    from wordapa7_logger import log_event, log_error
except Exception:
    def log_event(*a, **k): pass
    def log_error(*a, **k): pass

from modules.apa_rules import RULES
from modules.plan_engine import classify, findings as _findings
from modules.captions import scan_existing

app = FastAPI(title="WordAPA7 Core", docs_url=None, redoc_url=None)
_STARTED = time.time()


class TextsReq(BaseModel):
    texts: List[str] = []
    full: bool = False


class CaptionsReq(BaseModel):
    texts: List[str] = []
    tables: List[int] = []
    figures: List[int] = []


class CiteReq(BaseModel):
    authors: List[str] = []
    year: str = ""


@app.get("/api/version")
async def version() -> dict:
    return {"version": "core-1.0", "mode": "core", "uptime_s": round(time.time() - _STARTED, 1)}


@app.get("/api/core/status")
async def status() -> dict:
    import psutil
    proc = psutil.Process()
    return {
        "mode": "core", "capabilities": ["format-plan", "captions-plan",
        "resolve-ghost-citation", "suggest-caption-lite", "heartbeat"],
        "ram_mb": round(proc.memory_info().rss / 1048576, 1),
        "uptime_s": round(time.time() - _STARTED, 1),
    }


@app.post("/api/addin/format-plan")
async def format_plan(req: TextsReq) -> dict:
    if req.full:
        plan = classify(req.texts)
        plan["findings"] = _findings(req.texts, plan["floor"])
        return plan
    from modules.plan_engine import _cover_floor
    return {"floor": _cover_floor(req.texts), "rules": RULES}


@app.post("/api/addin/captions-plan")
async def captions_plan(req: CaptionsReq) -> dict:
    base = scan_existing(req.texts)
    nt, nf = base["max_table"], base["max_figure"]
    ops = []
    for i in req.tables:
        nt += 1
        ops.append({"i": i, "kind": "table", "number": nt})
    for i in req.figures:
        nf += 1
        ops.append({"i": i, "kind": "figure", "number": nf})
    return {"ops": ops}


class OpenWordReq(BaseModel):
    path: str


@app.post("/api/open-in-word")
async def open_in_word(req: OpenWordReq) -> dict:
    """Rescate: abre un .docx del almacenamiento con su app predeterminada (Word).

    Guard idéntico al monolito (config.validate_open_in_word_path): solo
    se permiten .docx dentro de STORAGE_DIR del proceso."""
    import os as _os
    from config import validate_open_in_word_path
    try:
        target = validate_open_in_word_path(req.path)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    if not target.exists():
        raise HTTPException(400, "Archivo no encontrado")
    _os.startfile(str(target))  # asociacion del usuario (Word)
    return {"ok": True}

class ScoreReq(BaseModel):
    texts: List[str] = []
    tables: int = 0
    figures: int = 0
    visual: dict | None = None


@app.post("/api/addin/apa-score")
async def apa_score(req: ScoreReq) -> dict:
    from modules.apa_score import compute
    return compute(req.texts, req.tables, req.figures, req.visual)

@app.post("/api/addin/heartbeat")
async def heartbeat() -> dict:
    return {"ok": True}


@app.get("/api/addin/sideload-status-v2")
async def sideload_v2() -> dict:
    """Estado HONESTO: core no puede saber si Word cargo el add-in (sin
    telemetria). Mentir True hace que el chip del taskpane mienta tambien."""
    # Lectura POR-REQUEST de APPDATA (no cachear en import): permite aislar
    # en tests vía monkeypatch.setenv y refleja cambios de entorno.
    appdata = Path(os.environ.get("APPDATA") or (Path.home() / "AppData" / "Roaming"))
    manifest = appdata / "WordAPA7" / "storage" / "manifest.xml"
    return {"installed": manifest.exists(), "active_in_word": None}


@app.get("/api/addin/build-info")
async def build_info() -> dict:
    """Anti-stale: el taskpane compara su build con este y avisa si difieren."""
    return {
        "mode": "core",
        "version": "core-1.0",
        "build_hash": f"core-{int(_STARTED)}",
        "started_at": _STARTED,
    }


class ClientLogReq(BaseModel):
    component: str = "addin"
    event: str
    data: dict | None = None
    level: str = "info"


@app.post("/api/client-log")
async def client_log(req: ClientLogReq) -> dict:
    comp = (req.component or "addin").replace("/", "_")[:24]
    if req.level == "error":
        log_error(comp, req.event, Exception(str(req.data)), req.data)
    else:
        log_event(comp, req.event, req.data, level=req.level)
    return {"ok": True}


@app.post("/api/resolve-ghost-citation")
async def resolve_ghost(req: CiteReq) -> dict:
    """Crossref directo — sin depender del monolito."""
    import requests
    author = (req.authors or [""])[0].strip()
    if not author or not req.year:
        raise HTTPException(400, "authors/year requeridos")
    try:
        r = requests.get(
            "https://api.crossref.org/works",
            params={"query.bibliographic": f"{author} {req.year}", "rows": 3},
            timeout=8,
            headers={"User-Agent": "WordAPA7/1.0 (mailto:core@wordapa7.local)"},
        )
        items = (r.json().get("message", {}).get("items") or [])[:3]
        cands = []
        for it in items:
            title = (it.get("title") or [""])[0]
            auths = [f"{a.get('family','')} {a.get('given','')}".strip()
                     for a in it.get("author", [])][:4]
            year = None
            for k in ("published-print", "published-online", "issued"):
                dp = it.get(k, {}).get("date-parts", [[None]])
                if dp and dp[0] and dp[0][0]:
                    year = dp[0][0]; break
            src = (it.get("container-title") or [""])[0]
            doi = it.get("DOI", "")
            from modules.apa_format import format_apa_plain
            apa = format_apa_plain({
                "authors": auths, "year": year, "title": title,
                "source": src, "doi_or_url": doi, "raw_text": "",
            })
            cands.append({"authors": auths, "year": year, "title": title,
                          "source": src, "doi": doi, "formatted_apa": apa})
        return {"found": bool(cands), "candidates": cands}
    except Exception as exc:
        log_error("core", "crossref_failed", exc)
        return {"found": False, "candidates": []}


def _tls_pair() -> tuple[str, str] | None:
    appdata = Path(os.environ.get("APPDATA") or (Path.home() / "AppData" / "Roaming"))
    base = appdata / "WordAPA7" / "storage" / "ssl"
    pem, key = base / "localhost.pem", base / "localhost-key.pem"
    return (str(pem), str(key)) if pem.exists() and key.exists() else None


def main() -> None:
    port = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 8742
    pair = _tls_pair()
    kwargs = {}
    if pair:
        kwargs = {"ssl_certfile": pair[0], "ssl_keyfile": pair[1]}
    log_event("core", "boot", data={"port": port, "tls": bool(pair)})
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning", **kwargs)


if __name__ == "__main__":
    main()
