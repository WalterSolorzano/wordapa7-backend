from __future__ import annotations

import json
import re
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from config import STORAGE_DIR
from content.builder import build_content_document
from content.emit import emit_docx
from persistence.session_manager import save_session_state

router = APIRouter(tags=["content"])

_UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_name(name: str) -> str:
    base = Path(name or "documento.docx").name
    base = _UNSAFE.sub("_", base).strip("._") or "documento"
    if not base.lower().endswith(".docx"):
        base += ".docx"
    return base


def _write_manifest(session_dir: Path, artifact_id: str, **data: Any) -> None:
    exports = session_dir / "exports"
    exports.mkdir(parents=True, exist_ok=True)
    (exports / f"{artifact_id}.json").write_text(
        json.dumps({"artifact_id": artifact_id, **data}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


@router.post("/api/content/build")
async def build_content(payload: dict) -> dict:
    if not (payload.get("content") or []):
        raise HTTPException(status_code=400, detail="El payload no tiene contenido.")

    session_id = str(uuid.uuid4())
    try:
        result = build_content_document(payload, STORAGE_DIR, session_id=session_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    doc = result.document
    save_session_state(doc, STORAGE_DIR)

    session_dir = Path(STORAGE_DIR) / "sessions" / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    artifact_id = uuid.uuid4().hex[:12]
    out_path = session_dir / _safe_name(doc.file_name)
    final = Path(emit_docx(doc, out_path, try_com=True))

    # El manifiesto debe vivir en <session>/exports/<id>.json y apuntar a un
    # archivo directamente en <session>/ (así lo resuelve /api/download-artifact).
    _write_manifest(
        session_dir,
        artifact_id,
        filename=final.name,
        kind="docx",
        source="content.build",
        warnings=result.warnings,
    )
    return {
        "session_id": session_id,
        "download_url": f"/api/download-artifact/{session_id}/{artifact_id}",
        "file_name": final.name,
        "warnings": result.warnings,
    }
