from __future__ import annotations

from typing import Any

from pathlib import Path

import config
from content.builder import build_content_document
from content.emit import emit_docx
from content.oneshot import build_from_files as _build_from_files
from content.rubric import build_rubric_report as _build_rubric_report
from diagrams.parser import SUPPORTED_KINDS
from diagrams.render import render_diagram

FIGURES_STYLES = ["standard", "sidebar", "scientific", "corner", "full_width", "multipanel"]

SCHEMA_HINT = (
    "Payload: {meta:{title,author,institution,course,date,use_original_cover,cover_mode}, "
    "content:[item], references:[str]}. "
    "cover_mode: '' decide por use_original_cover; 'generate_uni_cover' = portada UNI; "
    "'generate_apa7_template' = portada APA sintetica. "
    "item corto: {h1|h2|h3, p, cite, bullets:[str], numbered:[str], "
    "table:{caption,note,headers,rows}, diagram:{kind,dsl,caption,note,style,width_cm,height_cm}, page_break}. "
    "DSL: flow 'A > B' y 'A >|etiqueta| B'; tree 'Raíz' luego '- Hijo' y '-- Nieto'; "
    "net 'A -- B' (no dirigido) y 'A -> B' (dirigido). "
    "Herramientas de archivo: build_document emite el .docx y devuelve 'path'; "
    "build_from_files toma rutas de .docx/.xlsx y devuelve el .docx formateado. "
    "analyze_rubric(rubric_path, docx_path) = Traductor de Rubrica: lee la rubrica "
    "(Word/Excel) y el documento y devuelve un informe JSON de cumplimiento "
    "(criterio -> peso -> puntaje -> evidencia), determinista y sin IA (0 tokens)."
)


def content_schema() -> dict[str, Any]:
    return {
        "schema": SCHEMA_HINT,
        "diagram_kinds": list(SUPPORTED_KINDS),
        "figure_styles": FIGURES_STYLES,
    }


def build_document(
    payload: dict,
    output_path: str | None = None,
    try_com: bool = True,
) -> dict[str, Any]:
    """Construye y EMITE el .docx; devuelve su ruta en ``path``."""
    result = build_content_document(payload, config.STORAGE_DIR)
    doc = result.document
    if output_path:
        out = Path(output_path)
    else:
        out = (
            Path(config.STORAGE_DIR)
            / "sessions"
            / doc.session_id
            / (doc.file_name or "documento.docx")
        )
    final = Path(emit_docx(doc, out, try_com=try_com))
    return {
        "session_id": doc.session_id,
        "elements": len(doc.elements),
        "warnings": result.warnings,
        "path": str(final),
    }


def build_from_files(
    docx_path: str | None = None,
    xlsx_path: str | None = None,
    cover_mode: str = "",
    title: str = "",
    out_path: str | None = None,
    try_com: bool = True,
) -> dict[str, Any]:
    """One-shot: rutas de .docx/.xlsx -> .docx APA 7 formateado."""
    return _build_from_files(
        docx_path=docx_path,
        xlsx_path=xlsx_path,
        cover_mode=cover_mode,
        title=title,
        out_path=out_path,
        try_com=try_com,
    )


def render_diagram_png(kind: str, dsl: str) -> bytes:
    return render_diagram(kind, dsl).png


def analyze_rubric(rubric_path: str, docx_path: str) -> dict[str, Any]:
    """Traductor de Rúbrica: rúbrica (Word/Excel) + documento -> informe de cumplimiento."""
    return _build_rubric_report(rubric_path, docx_path)


def build_server():
    try:
        from mcp.server.fastmcp import FastMCP
    except Exception as exc:  # pragma: no cover - entorno sin MCP
        raise RuntimeError("MCP no instalado") from exc

    server = FastMCP("wordapa7-content")

    @server.tool()
    def tool_content_schema() -> dict:
        return content_schema()

    @server.tool()
    def tool_build_document(payload: dict) -> dict:
        return build_document(payload)

    @server.tool()
    def tool_build_from_files(
        docx_path: str | None = None,
        xlsx_path: str | None = None,
        cover_mode: str = "",
        title: str = "",
        out_path: str | None = None,
    ) -> dict:
        return build_from_files(
            docx_path=docx_path,
            xlsx_path=xlsx_path,
            cover_mode=cover_mode,
            title=title,
            out_path=out_path,
        )

    @server.tool()
    def tool_render_diagram(kind: str, dsl: str) -> bytes:
        return render_diagram_png(kind, dsl)

    @server.tool()
    def tool_analyze_rubric(rubric_path: str, docx_path: str) -> dict:
        return analyze_rubric(rubric_path, docx_path)

    return server


def main() -> None:
    build_server().run()


if __name__ == "__main__":
    main()
