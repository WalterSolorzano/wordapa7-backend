"""Ruta one-shot: archivos de entrada -> un .docx APA 7 listo.

Pensado para el servidor MCP: el agente llama UNA herramienta con rutas de
archivos y recibe la ruta del .docx generado, sin conocer los motores ni
mapear el repositorio.

- ``docx_path``: documento base (Word). Si falta, se parte de un documento
  en blanco.
- ``xlsx_path``: hojas de cálculo que se anexan como tablas APA.
- ``cover_mode``: ``generate_uni_cover`` para la portada UNI, etc.
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Optional, Union

from models import DocumentModel, ElementModel, ElementType, PortadaData, TableModel

# Modos que CONSERVAN la portada original (no generan una nueva).
MODOS_QUE_CONSERVAN = ("keep_original", "keep_design_update_data")


def _new_id() -> str:
    return uuid.uuid4().hex


def _blank_document(sid: str, title: str = "") -> DocumentModel:
    doc = DocumentModel(session_id=sid, file_name="documento.docx", elements=[])
    data = PortadaData().model_dump(mode="json")
    if title:
        data["title"] = title
    doc.portada = data
    return doc


def _apply_cover(doc: DocumentModel, cover_mode: str, title: str = "") -> None:
    """Fija el modo de portada y, si se indica, el titulo en ``doc.portada``."""
    data = dict(doc.portada or {})
    if cover_mode:
        data["cover_mode"] = cover_mode
        # Un modo que GENERA portada nunca conserva la original.
        if cover_mode not in MODOS_QUE_CONSERVAN:
            data["use_original_cover"] = False
    if title:
        data["title"] = title
    doc.portada = data


def _append_xlsx_tables(
    doc: DocumentModel,
    xlsx_path: Union[str, Path],
    *,
    sheets=None,
    header_row: int = 0,
    caption_prefix: str = "Tabla",
) -> list[str]:
    from content.ingest import xlsx_to_tables

    warnings: list[str] = []
    tables = xlsx_to_tables(
        xlsx_path, sheets=sheets, header_row=header_row, caption_prefix=caption_prefix
    )
    existing = sum(1 for e in doc.elements if e.type == ElementType.TABLE)
    for i, t in enumerate(tables, start=existing + 1):
        table = TableModel(
            element_id="",
            headers=list(t["headers"]),
            rows=[list(r) for r in t["rows"]],
            caption=t["caption"],
            note="",
            table_number=i,
        )
        element = ElementModel(id=_new_id(), type=ElementType.TABLE, table_info=table)
        table.element_id = element.id
        doc.elements.append(element)
    if not tables:
        warnings.append("El .xlsx no produjo ninguna tabla.")
    return warnings


def build_from_files(
    *,
    docx_path: Optional[Union[str, Path]] = None,
    xlsx_path: Optional[Union[str, Path]] = None,
    cover_mode: str = "",
    title: str = "",
    out_path: Optional[Union[str, Path]] = None,
    storage_dir: Optional[Union[str, Path]] = None,
    try_com: bool = True,
    xlsx_sheets=None,
    xlsx_header_row: int = 0,
    caption_prefix: str = "Tabla",
) -> dict:
    """Construye un .docx APA 7 desde archivos y devuelve su ruta.

    Devuelve ``{"session_id", "path", "elements", "warnings"}``.
    """
    from config import STORAGE_DIR
    from content.emit import emit_docx

    storage = Path(storage_dir) if storage_dir else Path(STORAGE_DIR)
    sid = _new_id()
    warnings: list[str] = []

    if docx_path:
        from parsing.docx_parser import parse_docx_bytes

        src = Path(docx_path)
        if not src.exists():
            raise FileNotFoundError(f"No existe el .docx: {src}")
        doc = parse_docx_bytes(src.read_bytes(), src.name, sid, storage)
    else:
        doc = _blank_document(sid, title)

    _apply_cover(doc, cover_mode, title)

    if xlsx_path:
        warnings.extend(
            _append_xlsx_tables(
                doc,
                xlsx_path,
                sheets=xlsx_sheets,
                header_row=xlsx_header_row,
                caption_prefix=caption_prefix,
            )
        )

    if out_path:
        out = Path(out_path)
    else:
        out = storage / "sessions" / sid / (doc.file_name or "documento.docx")

    final = Path(emit_docx(doc, out, try_com=try_com))
    return {
        "session_id": sid,
        "path": str(final),
        "elements": len(doc.elements),
        "warnings": warnings,
    }
