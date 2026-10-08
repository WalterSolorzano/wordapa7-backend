from __future__ import annotations

import os
from pathlib import Path

from models import DocumentModel, PortadaData

from generation.generator import generate_apa7_docx


def _portada(doc: DocumentModel) -> PortadaData:
    data = doc.portada or {}
    valid = {k: v for k, v in data.items() if k in PortadaData.model_fields}
    return PortadaData(**valid)


def _safe_unlink(path: Path) -> None:
    try:
        Path(path).unlink()
    except OSError:
        pass


def emit_docx(doc: DocumentModel, out_path: Path, try_com: bool = True) -> Path:
    """Construye el .docx con python-docx y, si hay Word disponible, aplica el
    MISMO post-proceso COM que usa `/api/generate` (calidad), entregando el
    resultado en `out_path`. Sin Word, entrega el rebuild puro. Nunca lanza por
    ausencia de COM.

    Se escribe primero en un archivo temporal para que `process_and_convert`
    pueda copiar a `out_path` sin chocar consigo mismo (`SameFileError`)."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = out_path.with_name(f".{out_path.stem}.gen{out_path.suffix}")
    generate_apa7_docx(doc, tmp_path, doc.apa_rules, _portada(doc), doc.referencias)

    if try_com:
        try:
            from services.doc_converter import get_doc_converter

            converter = get_doc_converter()
            if converter.get_active_engine() == "COM":
                ok, final = converter.process_and_convert(
                    original_path=tmp_path,
                    generated_path=tmp_path,
                    final_path=out_path,
                    preserve_cover=False,
                    generate_pdf=False,
                    rules=doc.apa_rules,
                )
                if ok and final and Path(final).exists():
                    _safe_unlink(tmp_path)
                    return Path(final)
        except RuntimeError:
            pass
        except Exception:
            pass

    if tmp_path != out_path and tmp_path.exists():
        os.replace(tmp_path, out_path)
    return out_path
