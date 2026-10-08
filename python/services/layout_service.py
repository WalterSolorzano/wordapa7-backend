# python/services/layout_service.py
"""FASE 2 — Paginación en vivo de la sesión con Word COM.

Word es la única autoridad de layout (decisión D-a). El flujo es:

1. is_available() ANTES de tocar nada (COM lazy — sin Word no se materializa).
2. Materializa el docx con el estado ACTUAL del modelo vía apply_inplace
   (mismo camino que /api/generate → el corte refleja lo que el usuario ve).
   Si materializar falla, se pagina el original degradando con honestidad.
3. Repaginate + cortes por binary search (page_layout_provider.with_cuts).
4. Mapeo párrafo→elemento por índice (convención de docx_parser/sessions.py)
   con clamp: offsets fuera del rango del texto del elemento se descartan.

Respuesta con claves SIEMPRE presentes: available, provider, reason,
degraded, total_pages, elements, line_cuts, page_setup, elapsed_ms.
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
        "degraded": False,
        "total_pages": None,
        "elements": [],
        "line_cuts": [],
        "page_setup": None,
        "elapsed_ms": int((time.time() - t0) * 1000),
    }


def _element_id(elem: Any) -> str:
    return elem.id if hasattr(elem, "id") else elem.get("id", "")


def _materialize(doc: Any, original: Path, tmp_dir: Path) -> Path:
    """Copia del original con el texto/estado actual del modelo."""
    from generation.inplace_editor import apply_inplace
    rules = getattr(doc, "apa_rules", None)
    out = tmp_dir / "live.docx"
    apply_inplace(original, out, doc, rules, scopes=None)
    return out


def paginate_session(doc: Any, session_dir: Path) -> dict:
    t0 = time.time()

    from parsing.page_layout_provider import COMPageLayoutProvider
    provider = COMPageLayoutProvider()
    if not provider.is_available():
        return _unavailable("Se requiere Microsoft Word", t0)

    original = session_dir / "original.docx"
    if not original.exists():
        return _unavailable("La sesión no tiene original.docx", t0)

    tmp_dir = Path(tempfile.mkdtemp(prefix="apa7-live-"))
    try:
        degraded = False
        try:
            src = _materialize(doc, original, tmp_dir)
        except Exception as exc:
            logger.warning(f"[Layout] materialize falló, uso original: {exc}")
            src = original
            degraded = True

        result = provider.paginate(src, timeout_seconds=_TIMEOUT_S,
                                   with_cuts=True)

        elements = []
        line_cuts = []
        for i, elem in enumerate(doc.elements):
            eid = _element_id(elem)
            if not eid or i >= len(result.paragraph_pages):
                continue
            elements.append({"element_id": eid,
                             "page_start": int(result.paragraph_pages[i])})
            if i < len(result.paragraph_cuts) and result.paragraph_cuts[i]:
                # Clamp: un offset fuera del texto del elemento = mapeo
                # párrafo↔elemento desfasado (tablas) → descartar ese corte.
                text_len = len(getattr(elem, "text", "") or "")
                cuts = [
                    {"offset": int(c["offset"]), "page": int(c["page"])}
                    for c in result.paragraph_cuts[i]
                    if 0 < int(c["offset"]) < text_len
                ]
                if cuts:
                    line_cuts.append({"element_id": eid, "cuts": cuts})

        # Señal honesta de degradación + warnings del provider (notes).
        # Ambas → degradación primero, todo unido con "; ".
        reason_parts: list[str] = []
        if degraded:
            reason_parts.append("Materialización falló: se pagina el original")
        reason_parts.extend(str(n) for n in (result.notes or []))
        reason = "; ".join(reason_parts) if reason_parts else None

        out = {
            "available": True,
            "provider": result.provider_used,
            "reason": reason,
            "degraded": degraded,
            "total_pages": int(result.total_pages),
            "elements": elements,
            "line_cuts": line_cuts,
            "page_setup": result.page_setup,
            "elapsed_ms": int((time.time() - t0) * 1000),
        }
        if out["elapsed_ms"] > 5000:
            logger.warning(f"[Layout] paginate lento: {out['elapsed_ms']}ms")
        return out
    except Exception as exc:
        logger.warning(f"[Layout] paginate falló: {exc}")
        return _unavailable(str(exc)[:200], t0)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
