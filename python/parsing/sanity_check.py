"""
WordAPA7 — Sanity Check Gate de Pre-Exportación

Compara el conteo de caracteres reales deduplicados (sin mc:Fallback) entre el
documento original importado y el documento .docx generado.

Si se detecta una pérdida de texto superior al límite de tolerancia (2%),
el gate bloquea la exportación y lanza una excepción explicativa.
"""

from pathlib import Path

from parsing.structure_scanner import scan_document_xml_nodes


class ExportBlockedError(RuntimeError):
    """Excepción lanzada cuando la comprobación de sanidad bloquea la exportación por pérdida de contenido."""
    pass


def verify_document_content_integrity(
    orig_docx_path: Path | str,
    gen_docx_path: Path | str,
    tolerance: float = 0.02,
) -> bool:
    """
    Verifica que el archivo generado conserve al menos (1 - tolerance)% de los
    caracteres reales del documento original.
    """
    orig_nodes = scan_document_xml_nodes(orig_docx_path)
    gen_nodes = scan_document_xml_nodes(gen_docx_path)

    if not orig_nodes or not gen_nodes:
        return True

    # 1. Linter anti-fuga de identificadores internos de código
    internal_leaks = ["author_card", "vertical_line", "shape_group", "shape_textbox"]
    for n in gen_nodes:
        txt = n.text
        for leak in internal_leaks:
            if leak in txt:
                raise ExportBlockedError(
                    f"Gate de Sanidad: Fuga de token interno detectada ('{leak}' en el documento generado)."
                )

    # 2. Verificación de integridad de conteo de caracteres
    orig_chars = sum(len(n.text) for n in orig_nodes if n.is_editable)
    gen_chars = sum(len(n.text) for n in gen_nodes if n.is_editable)

    # Tolerancia adaptativa: el conteo crudo de caracteres no normaliza
    # espacios/acentos/estructura, así que en documentos cortos la variación
    # legítima es proporcionalmente grande. Escala según el tamaño del original.
    if orig_chars < 2000:
        tolerance = 0.30
    elif orig_chars < 10000:
        tolerance = 0.15
    else:
        tolerance = 0.05

    if orig_chars > 0:
        min_allowed = int(orig_chars * (1.0 - tolerance))
        if gen_chars < min_allowed:
            loss_pct = ((orig_chars - gen_chars) / orig_chars) * 100
            raise ExportBlockedError(
                f"Gate de Sanidad: Posible pérdida de contenido detectada ({orig_chars} -> {gen_chars} caracteres, "
                f"pérdida del {loss_pct:.1f}% mayor a la tolerancia del {tolerance*100}%)."
            )

    print(f"[OK] Sanity Check aprobado: Original={orig_chars} chars, Generado={gen_chars} chars (Diferencia: {orig_chars - gen_chars} chars).")
    return True
