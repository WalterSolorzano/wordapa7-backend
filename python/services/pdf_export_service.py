# python/services/pdf_export_service.py
"""FASE 4 — Exportación de PDF en reposo vía Word COM.

Word es la única autoridad de layout (decisión D-a). El flujo es:

1. is_available() ANTES de tocar nada (COM lazy — sin Word no se materializa).
2. Materializa el docx con el estado ACTUAL del modelo vía apply_inplace.
3. ExportAsFixedFormat → PDF de sesión.
4. Devuelve pdf_url + page_count.

Respuesta con claves SIEMPRE presentes: available, provider, reason,
pdf_url, page_count, elapsed_ms.
"""
from __future__ import annotations

import logging
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger("wordapa7")

_TIMEOUT_S = 20  # hot path con debounce 1.5s: menos que los 30s del upload


def _unavailable(reason: str, t0: float) -> dict:
    return {
        "available": False,
        "provider": "none",
        "reason": reason,
        "pdf_url": None,
        "page_count": None,
        "elapsed_ms": int((time.time() - t0) * 1000),
    }


def _materialize(doc: Any, original: Path, tmp_dir: Path) -> Path:
    """Copia del original con el texto/estado actual del modelo."""
    from generation.inplace_editor import apply_inplace
    rules = getattr(doc, "apa_rules", None)
    out = tmp_dir / "live.docx"
    apply_inplace(original, out, doc, rules, scopes=None)
    return out


def export_session_pdf(doc: Any, session_dir: Path) -> dict:
    """Exporta el PDF de sesión con Word COM (ExportAsFixedFormat).

    def (no async): el trabajo COM es bloqueante; FastAPI lo ejecuta en
    el threadpool y no congela el event loop.
    Sin Word → available=false + "Se requiere Microsoft Word" (D-a).
    """
    t0 = time.time()

    from services.word_com_service import get_word_com_service
    svc = get_word_com_service()
    if not svc.is_available():
        return _unavailable("Se requiere Microsoft Word", t0)

    original = session_dir / "original.docx"
    if not original.exists():
        return _unavailable("La sesión no tiene original.docx", t0)

    tmp_dir = Path(tempfile.mkdtemp(prefix="apa7-pdf-"))
    try:
        degraded = False
        try:
            src = _materialize(doc, original, tmp_dir)
        except Exception as exc:
            logger.warning(f"[PdfExport] materialize falló, uso original: {exc}")
            src = original
            degraded = True

        pdf_dir = session_dir / "preview_pages"
        pdf_dir.mkdir(parents=True, exist_ok=True)
        pdf_path = pdf_dir / "rest.pdf"

        # ExportAsFixedFormat vía Word COM
        result = svc.export_as_fixed_format(src, pdf_path, timeout=_TIMEOUT_S)
        if not result or not pdf_path.exists():
            return _unavailable("ExportAsFixedFormat no produjo el PDF", t0)

        # Contar páginas con pypdf o fallback
        page_count = _count_pages(pdf_path)

        reason = "Materialización falló: se exporta el original" if degraded else None

        return {
            "available": True,
            "provider": "word_com",
            "reason": reason,
            "pdf_url": f"/api/preview-pdf/{doc.session_id}/rest.pdf",
            "page_count": page_count,
            "elapsed_ms": int((time.time() - t0) * 1000),
        }
    except Exception as exc:
        logger.warning(f"[PdfExport] export falló: {exc}")
        return _unavailable(str(exc)[:200], t0)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _count_pages(pdf_path: Path) -> int:
    """Cuenta páginas del PDF con pypdf, o fallback a 0."""
    try:
        from pypdf import PdfReader
        return len(PdfReader(str(pdf_path)).pages)
    except Exception:
        return 0
