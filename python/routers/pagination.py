"""FASE 3.1 — Gate de paginación post-generación vía Word COM.

POST /api/audit/pagination (multipart 'file', opcional 'expected_pages')
→ métricas renderizadas reales + warnings de overflow. Estado honesto si
Word no está: {"available": false} sin bloquear al usuario.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, UploadFile, HTTPException

from models import LayoutPaginateRequest

router = APIRouter()


@router.post("/api/audit/pagination")
async def audit_pagination(
    file: UploadFile = File(...),
    expected_pages: int | None = Form(default=None),
) -> dict:
    from generation.post_processor import get_com_post_processor

    suffix = Path(file.filename or "doc.docx").suffix or ".docx"
    tmp = Path(tempfile.mkdtemp(prefix="apa7-pag-")) / f"doc{suffix}"
    try:
        tmp.write_bytes(await file.read())
        result = get_com_post_processor().audit_pagination(tmp, expected_pages=expected_pages)
        return result
    finally:
        try:
            tmp.unlink(missing_ok=True)
            tmp.parent.rmdir()
        except Exception:
            pass


@router.post("/api/layout/paginate")
def layout_paginate(req: LayoutPaginateRequest) -> dict:
    """FASE 2 — Repagina la sesión con Word COM y devuelve el corte real.

    def (no async): el trabajo COM/python-docx es bloqueante; FastAPI lo
    ejecuta en el threadpool y no congela el event loop.
    Sin Word → available=false + "Se requiere Microsoft Word" (D-a).
    """
    from config import STORAGE_DIR
    from persistence.session_manager import load_session_state
    from services.layout_service import paginate_session

    doc = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    result = paginate_session(doc, STORAGE_DIR / "sessions" / req.session_id)
    return {**result, "session_id": req.session_id}
