"""FASE 4 — Exportación de PDF en reposo vía Word COM.

POST /api/layout/pdf-export → exporta el PDF de sesión usando ExportAsFixedFormat.
Sin Word disponible, responde honesto (available: false).
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from models import LayoutPdfExportRequest

router = APIRouter()


@router.post("/api/layout/pdf-export")
def layout_pdf_export(req: LayoutPdfExportRequest) -> dict:
    """Exporta el PDF de sesión con Word COM (ExportAsFixedFormat).

    def (no async): el trabajo COM es bloqueante; FastAPI lo ejecuta en
    el threadpool y no congela el event loop.
    Sin Word → available=false + "Se requiere Microsoft Word" (D-a).
    """
    from config import STORAGE_DIR
    from persistence.session_manager import load_session_state
    from services.pdf_export_service import export_session_pdf

    doc = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    result = export_session_pdf(doc, STORAGE_DIR / "sessions" / req.session_id)
    return {**result, "session_id": req.session_id}
