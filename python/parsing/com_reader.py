"""
WordAPA7 — COM Reader (Engine V2, P0b)

Lee la estructura real del documento usando el Object Model de Word via COM.
Reemplaza las heurísticas OOXML de docx_parser por mediciones directas:

  - Sección de portada         → doc.Sections(1).Range  (rango EXACTO)
  - Jerarquía de headings      → Paragraph.OutlineLevel (niveles REALES)
  - Numeración de listas       → Paragraph.Range.ListFormat.ListString
  - Fuentes                     → Paragraph.Range.Font.Name
  - Campos (TOC, PAGE, REF...) → doc.Fields
  - Estructuras especiales      → doc.InlineShapes, doc.ContentControls
  - Secciones (orientación)     → doc.Sections().PageSetup.Orientation

Uso:
    from parsing.com_reader import COMReader
    reader = COMReader()
    info = reader.analyze(docx_path)  # devuelve dict con toda la info

El WordCOMService proporciona la instancia de Word (apartment persistente).
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

import pythoncom

logger = logging.getLogger(__name__)


class COMReader:
    """Lector de estructura de documentos .docx usando Word COM."""

    def is_available(self) -> bool:
        try:
            from services.word_com_service import get_word_com_service
            return get_word_com_service().is_available()
        except Exception:
            return False

    def analyze(self, docx_path: Path | str) -> Dict[str, Any]:
        """Análisis completo de la estructura del documento via Word COM.
        Devuelve un dict con todas las secciones de información."""
        if not self.is_available():
            return {"error": "COM not available"}

        pythoncom.CoInitialize()
        word = None
        doc = None
        result: Dict[str, Any] = {}

        try:
            from services.word_com_service import get_word_com_service
            word = get_word_com_service().word
            if not word:
                return {"error": "Word COM initialization failed"}

            try:
                word.DisplayAlerts = 0
                word.Visible = False
                word.ScreenUpdating = False
                word.WindowState = 2
            except Exception:
                pass

            doc = word.Documents.Open(
                str(Path(docx_path).resolve()),
                ConfirmConversions=False,
                AddToRecentFiles=False,
                ReadOnly=True,
                Visible=False,
            )
            try:
                if hasattr(doc, 'ActiveWindow') and doc.ActiveWindow:
                    doc.ActiveWindow.Visible = False
            except Exception:
                pass

            result["cover"] = self._read_cover(doc)
            para_data = self._read_all_paragraphs_data(doc)
            result["headings"] = para_data["headings"]
            result["lists"] = para_data["lists"]
            result["fonts"] = para_data["fonts"]
            result["paragraphs"] = para_data["paragraphs"]
            result["fields"] = self._read_fields(doc)
            result["shapes"] = self._read_shapes(doc)
            result["sections"] = self._read_sections(doc)
            result["ok"] = True

        except Exception as e:
            logger.error(f"[COMReader] Error en analyze: {e}")
            result["error"] = str(e)
        finally:
            if doc:
                try:
                    doc.Close(SaveChanges=False)
                except Exception:
                    pass
            try:
                pythoncom.CoUninitialize()
            except Exception:
                pass

        return result

    # ── Cover / first-page section ────────────────────────────────────────

    def _read_cover(self, doc) -> Dict[str, Any]:
        """Detecta la portada usando la sección de Word.
        Si la primera sección tiene configuración de primera página distinta
        o un salto de sección explícito, es la portada.
        Retorna: { start_para_idx, end_para_idx, detected, is_different_first_page }
        """
        try:
            sec = doc.Sections(1)
            is_diff_first = sec.PageSetup.DifferentFirstPageHeaderFooter
            # La portada es la primera sección si tiene first-page distinto
            # o si hay al menos 2 secciones y la primera es corta (<30% del doc).
            has_multiple = doc.Sections.Count > 1
            cover_range = sec.Range
            total_chars = doc.Content.End
            cover_chars = cover_range.End
            ratio = cover_chars / max(1, total_chars)

            detected = is_diff_first or (has_multiple and ratio < 0.35)
            # Si no se detecta por sección, intentamos por page break temprano
            if not detected:
                try:
                    page2 = doc.GoTo(1, 1, 2)  # wdGoToPage=1, wdGoToAbsolute=1
                    if page2.Start > 0 and page2.Start < doc.Content.End - 1:
                        page2_ratio = page2.Start / max(1, doc.Content.End)
                        if page2_ratio < 0.25:
                            end_para = self._count_paragraphs_before(doc, page2.Start)
                            return {
                                "detected": True,
                                "end_paragraph_idx": end_para,
                                "end_char": page2.Start,
                                "method": "page2_goto",
                            }
                except Exception:
                    pass

            end_para = self._count_paragraphs_before(doc, cover_range.End)
            return {
                "detected": detected,
                "end_paragraph_idx": end_para,
                "end_char": cover_range.End,
                "ratio": round(ratio, 3),
                "is_different_first_page": bool(is_diff_first),
                "section_count": doc.Sections.Count,
                "method": "section" if detected else "none",
            }
        except Exception as e:
            logger.warning(f"[COMReader] _read_cover error: {e}")
            return {"detected": False, "error": str(e)}

    def _count_paragraphs_before(self, doc, char_pos: int) -> int:
        """Cuenta cuántos párrafos hay antes de char_pos de forma secuencial rápida."""
        count = 0
        for p in doc.Paragraphs:
            try:
                if p.Range.Start >= char_pos:
                    return count
                count += 1
            except Exception:
                count += 1
        return count

    # ── Single-pass Paragraphs Collector (Headings, Lists, Fonts, Styles) ──

    def _read_all_paragraphs_data(self, doc) -> Dict[str, Any]:
        """Extrae headings, listas, fuentes y estilos en un único recorrido O(N).

        Retorna un dict con cuatro sub-dicts — ``headings``, ``lists``,
        ``fonts`` y ``paragraphs`` — para que ``analyze()`` pueda pasarlos
        directamente al resultado y ``enrich_document_from_com`` pueda leerlos
        sin KeyErrors silenciosos.
        """
        heading_list: List[Dict[str, Any]] = []
        level_counts: Dict[int, int] = {}
        list_items: List[Dict[str, Any]] = []
        font_counts: Dict[str, int] = {}
        paragraph_styles: Dict[str, int] = {}
        total = 0

        for i, p in enumerate(doc.Paragraphs, start=1):
            total += 1
            try:
                # 1. Headings / Outline level
                outline = int(p.OutlineLevel)
                if 1 <= outline <= 9:
                    text = (p.Range.Text or "").strip()
                    if text:
                        heading_list.append({
                            "index": i,
                            "level": outline,
                            "text": text[:120],
                            "char_start": p.Range.Start,
                        })
                        level_counts[outline] = level_counts.get(outline, 0) + 1

                # 2. Lists
                lf = p.Range.ListFormat
                if lf.ListType > 0:
                    list_items.append({
                        "index": i,
                        "list_string": str(lf.ListString or ""),
                        "list_level": int(lf.ListLevelNumber),
                        "list_type": int(lf.ListType),
                        "text": (p.Range.Text or "").strip()[:80],
                    })

                # 3. Fonts
                fn = str(p.Range.Font.Name or "").lower()
                if fn:
                    font_counts[fn] = font_counts.get(fn, 0) + 1

                # 4. Paragraph styles
                style_name = str(p.Style or "Normal")
                paragraph_styles[style_name] = paragraph_styles.get(style_name, 0) + 1
            except Exception:
                continue

        dominant = max(font_counts, key=font_counts.get) if font_counts else ""

        # ── FIX: previously only font_counts / total / dominant were returned,
        #    so heading_list and list_items were silently dropped.  This caused
        #    a KeyError in analyze() (caught by the broad except → result["error"]
        #    set → entire COM enrichment silently skipped).  Now we return the
        #    nested structure that both analyze() and enrich_document_from_com()
        #    expect.
        return {
            "headings": {
                "headings": heading_list,
                "level_counts": level_counts,
                "total": len(heading_list),
            },
            "lists": {
                "items": list_items,
                "total": len(list_items),
            },
            "fonts": {
                "counts": font_counts,
                "dominant": dominant,
                "total_unique": len(font_counts),
            },
            "paragraphs": {
                "total": total,
                "style_distribution": paragraph_styles,
            },
        }

    # ── Fields (TOC, PAGE, REF, HYPERLINK...) ────────────────────────────

    def _read_fields(self, doc) -> Dict[str, Any]:
        """Lee los campos del documento (TOC, PAGE, REF, HYPERLINK...)."""
        fields: List[Dict[str, Any]] = []
        try:
            for i in range(1, doc.Fields.Count + 1):
                f = doc.Fields(i)
                try:
                    code = str(f.Code or "").strip()[:120]
                    result = str(f.Result or "").strip()[:120]
                    kind = "unknown"
                    for kw in ["TOC", "PAGE", "REF", "HYPERLINK", "SEQ", "NUMPAGES",
                               "STYLEREF", "DATE", "TIME", "SECTIONPAGES"]:
                        if code.upper().startswith(kw):
                            kind = kw
                            break
                    fields.append({"index": i, "kind": kind, "code": code, "result": result})
                except Exception:
                    continue
        except Exception as e:
            logger.warning(f"[COMReader] _read_fields error: {e}")
        return {"fields": fields, "total": len(fields)}

    # ── Inline Shapes (images, SmartArt, OLE, charts) ─────────────────────

    def _read_shapes(self, doc) -> Dict[str, Any]:
        """Lee las formas inline (imágenes, SmartArt, OLE, gráficos)."""
        shapes: List[Dict[str, Any]] = []
        try:
            for i in range(1, doc.InlineShapes.Count + 1):
                s = doc.InlineShapes(i)
                try:
                    stype = int(s.Type)
                    # wdInlineShapePicture=3, wdInlineShapeLinkedPicture=4,
                    # wdInlineShapeSmartArt=15?, wdInlineShapeEmbeddedOLEObject=1
                    shapes.append({
                        "index": i,
                        "type": stype,
                        "width": s.Width,
                        "height": s.Height,
                    })
                except Exception:
                    shapes.append({"index": i, "error": "cannot read"})
        except Exception as e:
            logger.warning(f"[COMReader] _read_shapes error: {e}")
        return {"shapes": shapes, "total": len(shapes)}

    # ── Sections ──────────────────────────────────────────────────────────

    def _read_sections(self, doc) -> Dict[str, Any]:
        """Lee las secciones del documento (orientación, headers)."""
        sections: List[Dict[str, Any]] = []
        for i in range(1, doc.Sections.Count + 1):
            try:
                sec = doc.Sections(i)
                sections.append({
                    "index": i,
                    "orientation": str(sec.PageSetup.Orientation),
                    "different_first_page": bool(sec.PageSetup.DifferentFirstPageHeaderFooter),
                    "page_width": sec.PageSetup.PageWidth,
                    "page_height": sec.PageSetup.PageHeight,
                })
            except Exception:
                continue
        return {"sections": sections, "total": len(sections)}

    # ── Paragraphs (basic info) ──────────────────────────────────────────

    def _read_paragraphs(self, doc) -> Dict[str, Any]:
        """Información básica de párrafos: tipo de estilo, fuente dominante.

        Nota: este método está disponible por compatibilidad, pero la
        información de estilos ya se recolecta en ``_read_all_paragraphs_data``
        durante el recorrido único O(N).
        """
        paragraph_styles: Dict[str, int] = {}
        total_paragraphs = doc.Paragraphs.Count
        for i in range(1, min(total_paragraphs + 1, 1000)):
            try:
                p = doc.Paragraphs(i)
                style_name = str(p.Style or "Normal")
                paragraph_styles[style_name] = paragraph_styles.get(style_name, 0) + 1
            except Exception:
                continue
        return {
            "total": total_paragraphs,
            "style_distribution": paragraph_styles,
        }


# ── Singleton ──────────────────────────────────────────────────────────────

_reader: Optional[COMReader] = None


def get_com_reader() -> COMReader:
    global _reader
    if _reader is None:
        _reader = COMReader()
    return _reader


# ── Enrichment: corregir el DocumentModel con mediciones reales de Word ────

def enrich_document_from_com(doc_model: Any, original_docx_path: str | Path) -> dict:
    """
    Enriquece el DocumentModel con mediciones REALES de Word via COM.

    - Corrige `body_start_paragraph_idx` (portada exacta por sección de Word).
    - Corrige/corrobora `is_cover_section` en cada elemento.
    - Valida niveles de heading (`heading_level`) contra el OutlineLevel real.
    - Detecta listas numeradas y su número renderizado.
    - Extrae fuentes, campos y shapes (para métricas y diagnóstico).

    Retorna un dict con info de diagnóstico:
    { cover_corrected, headings_corrected, lists_found, font_dominant, ... }

    Si COM no está disponible, no hace nada y retorna {"com_available": False}.
    """
    reader = get_com_reader()
    if not reader.is_available():
        return {"com_available": False}

    import pythoncom
    pythoncom.CoInitialize()
    try:
        result = reader.analyze(original_docx_path)
    finally:
        try:
            pythoncom.CoUninitialize()
        except Exception:
            pass

    if result.get("error") or not result.get("ok"):
        return {"com_available": False, "error": result.get("error")}
    if not doc_model:
        return {"com_available": True, "error": "No doc_model"}

    diag: dict = {"com_available": True}

    # ── 1. Portada: corregir body_start_paragraph_idx ────────────────────
    cover_info = result.get("cover", {})
    if cover_info.get("detected"):
        end_idx = cover_info.get("end_paragraph_idx", 0)
        if end_idx > 0:
            old_body_start = doc_model.portada.get("body_start_paragraph_idx") if doc_model.portada else None
            if doc_model.portada is None:
                doc_model.portada = {}
            doc_model.portada["body_start_paragraph_idx"] = end_idx
            doc_model.portada["cover_com_detected"] = True
            doc_model.portada["cover_com_method"] = cover_info.get("method", "unknown")
            diag["cover_corrected"] = True
            diag["cover_old_start"] = old_body_start or "none"
            diag["cover_new_start"] = end_idx
            diag["cover_ratio"] = cover_info.get("ratio", 0)

            # Corregir is_cover_section en los elementos
            body_start_kws = ("resumen", "abstract", "introduccion", "introducción", "indice", "índice", "tabla de contenido", "desarrollo", "marco teorico", "conclusiones", "justificacion", "antecedentes", "objetivo")
            first_body_idx = None
            for idx_b, elem_b in enumerate(doc_model.elements):
                t_txt = (elem_b.text or "").strip().lower()
                if not t_txt:
                    continue
                is_body = any(kw in t_txt for kw in body_start_kws) or t_txt.startswith(("resumen", "abstract", "introducc"))
                is_meta = any(k in t_txt for k in ("docente", "tutor", "carnet", "carne", "recinto", "universidad", "facultad", "elaborado por", "carrera"))
                if is_body and not is_meta and len(t_txt.split()) <= 15:
                    first_body_idx = idx_b
                    break

            effective_end = max(end_idx, old_body_start or 0)
            if first_body_idx is not None and effective_end > first_body_idx:
                effective_end = first_body_idx
            doc_model.portada["body_start_paragraph_idx"] = effective_end

            corrected = 0
            for i, elem in enumerate(doc_model.elements):
                if first_body_idx is not None and i >= first_body_idx:
                    if elem.is_cover_section:
                        elem.is_cover_section = False
                        corrected += 1
                    if getattr(elem, "type", None) in ("portada_block", ElementType.PORTADA_BLOCK):
                        elem.type = ElementType.PARAGRAPH
                    continue

                was_cover = elem.is_cover_section or (getattr(elem, "type", None) in ("portada_block",))
                should_be_cover = was_cover or (i < effective_end)
                elem.is_cover_section = should_be_cover
                if was_cover != should_be_cover:
                    corrected += 1
            diag["cover_elements_corrected"] = corrected
        else:
            diag["cover_corrected"] = False
            diag["cover_reason"] = "end_paragraph_idx <= 0"
    else:
        diag["cover_corrected"] = False
        diag["cover_reason"] = "COM did not detect cover"

    # ── 2. Headings: validar niveles contra OutlineLevel de Word ────────
    #    result["headings"] is a dict: {"headings": [...], "level_counts": {...}, "total": N}
    heading_info = result.get("headings", {})
    com_headings = heading_info.get("headings", [])
    if com_headings:
        model_headings = [e for e in doc_model.elements if getattr(e, 'type', None) and str(e.type).lower() in ('heading',)]
        if len(model_headings) >= len(com_headings) * 0.5:
            com_levels_by_text: dict[str, int] = {}
            for h in com_headings:
                key = (h["text"] or "").strip().lower()[:60]
                if key:
                    com_levels_by_text[key] = h["level"]

            corrected = 0
            mismatches = 0
            for mh in model_headings:
                mh_text = (mh.text or "").strip().lower()[:60]
                if mh_text in com_levels_by_text:
                    real_lvl = com_levels_by_text[mh_text]
                    old_lvl = mh.heading_level or 1
                    if old_lvl != real_lvl:
                        mh.heading_level = real_lvl
                        mismatches += 1
                    corrected += 1
            diag["headings_checked"] = len(model_headings)
            diag["heading_corrected"] = mismatches
            diag["heading_correction_ratio"] = round(corrected / max(1, len(model_headings)), 3)

    # ── 3. Listas: información de diagnóstico ────────────────────────────
    #    result["lists"] is a dict: {"items": [...], "total": N}
    lists_info = result.get("lists", {})
    diag["lists_found"] = lists_info.get("total", 0)

    # ── 4. Fuentes ───────────────────────────────────────────────────────
    #    result["fonts"] is a dict: {"counts": {...}, "dominant": "...", "total_unique": N}
    fonts_info = result.get("fonts", {})
    diag["font_dominant"] = fonts_info.get("dominant", "")

    # ── 5. Campos y shapes ─────────────────────────────────────────────
    diag["field_count"] = result.get("fields", {}).get("total", 0)
    diag["shape_count"] = result.get("shapes", {}).get("total", 0)
    diag["section_count"] = result.get("sections", {}).get("total", 0)

    logger.info(f"[COM Enrichment] {diag}")
    return diag
