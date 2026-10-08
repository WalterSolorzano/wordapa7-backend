"""
WordAPA7 — OOXML Cover Detector (sin COM)

Detecta la sección de portada usando el XML nativo del .docx (via python-docx / zipfile).
NUNCA abre Microsoft Word. Es el reemplazo directo del COMReader.enrich_document_from_com
para el flujo de upload, eliminando el problema de Word abriéndose visiblemente.

Estrategia (en orden de prioridad):
  1. Salto de sección en w:sectPr (CT_SectPr con w:type "nextPage" en el primer 25% del doc).
  2. Salto de página explícito (w:br w:type="page") en el primer 30% del doc.
  3. Heurística: si los primeros N párrafos suman < 300 palabras y hay un párrafo
     con estilo "Title" / "Título" / "Portada", marcar esa región como portada.
  4. Si portada.body_start_paragraph_idx ya existe (puesto por el pre_classifier),
     solo confirmar los elementos y retornar.
"""

from __future__ import annotations

import logging
import re
import zipfile
from pathlib import Path
from typing import Any, Dict, Optional
from xml.etree import ElementTree as ET

logger = logging.getLogger(__name__)

# Namespace de OOXML
_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def _w(tag: str) -> str:
    return f"{{{_W}}}{tag}"


def _paragraph_index_of_body_start(
    docx_path: str | Path,
    doc_model: Any,
    first_body_idx: Optional[int],
) -> Optional[int]:
    """Índice de PÁRRAFO (python-docx) del primer párrafo del cuerpo.

    `portada["body_start_paragraph_idx"]` se consume como índice de
    `doc.paragraphs` (generator borra `doc.paragraphs[:idx]`; inplace_editor
    protege ese prefijo). Por eso NO sirve reutilizar ni el índice de elemento
    filtrado ni el nodo XML: hay que ubicar el párrafo real. Un valor inflado
    aquí borraba el cuerpo entero al regenerar la portada.
    """
    try:
        import docx  # python-docx
        d = docx.Document(str(docx_path))
    except Exception:
        return None

    paras = d.paragraphs

    # 1) Anclar en el texto del primer elemento de cuerpo detectado por keyword.
    target = ""
    if first_body_idx is not None and 0 <= first_body_idx < len(doc_model.elements):
        target = (doc_model.elements[first_body_idx].text or "").strip()
    target_norm = re.sub(r"\s+", " ", target).strip().lower()
    if target_norm:
        for i, p in enumerate(paras):
            if re.sub(r"\s+", " ", (p.text or "").strip()).lower() == target_norm:
                return i

    # 2) Fallback: primer Heading/Título real o párrafo largo/cita.
    for i, p in enumerate(paras[:80]):
        if i == 0:
            continue
        txt = (p.text or "").strip()
        style = (p.style.name or "").lower() if p.style is not None else ""
        if "heading" in style or "título" in style or "titulo" in style:
            return i
        if len(txt) > 180 or re.search(r"\([A-Z][^)]{2,40},\s*(19|20)\d{2}\)", txt):
            return i

    return None


def detect_cover_ooxml(doc_model: Any, docx_path: str | Path) -> Dict[str, Any]:
    """
    Detecta la portada en el .docx sin usar COM/Word.

    Enriquece `doc_model` con:
      - portada["body_start_paragraph_idx"]: índice del primer párrafo del cuerpo
      - is_cover_section en cada elemento que pertenece a la portada

    Retorna un dict de diagnóstico:
      { cover_corrected, cover_new_start, cover_elements_corrected, method, ... }
    """
    diag: Dict[str, Any] = {"cover_corrected": False, "method": "none"}

    if not doc_model:
        return diag

    # Si el pre_classifier ya marcó elementos de portada y tenemos body_start,
    # simplemente confirmar y no sobreescribir.
    existing_start = None
    if doc_model.portada:
        existing_start = doc_model.portada.get("body_start_paragraph_idx")

    try:
        end_para = _detect_cover_end_paragraph(docx_path)
    except Exception as e:
        logger.warning(f"[OOXMLCover] Error analizando XML: {e}")
        end_para = None

    # Usar el máximo entre lo detectado por OOXML y lo ya marcado por pre_classifier
    if end_para is not None and end_para > 0:
        effective_end = max(end_para, existing_start or 0)
    elif existing_start is not None and existing_start > 0:
        effective_end = existing_start
    else:
        diag["cover_corrected"] = False
        diag["cover_reason"] = "No se pudo detectar portada"
        return diag

    # Actualizar el modelo
    if doc_model.portada is None:
        doc_model.portada = {}
    doc_model.portada["cover_ooxml_detected"] = True
    doc_model.portada["cover_ooxml_method"] = diag.get("method", "ooxml")

    # Marcar elementos is_cover_section (effective_end vive en espacio de
    # ELEMENTO filtrado)
    corrected = 0
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

    if first_body_idx is not None and effective_end > first_body_idx:
        effective_end = first_body_idx

    # body_start_paragraph_idx se consume como índice de doc.paragraphs, así
    # que debe guardarse en espacio de PÁRRAFO (no de elemento/nodo XML).
    # Guardar el índice de elemento borraba el cuerpo al regenerar la portada.
    para_start = _paragraph_index_of_body_start(docx_path, doc_model, first_body_idx)
    if para_start is None or para_start <= 0:
        para_start = existing_start if (existing_start and existing_start > 0) else effective_end
    doc_model.portada["body_start_paragraph_idx"] = para_start
    doc_model.portada["body_start_source"] = "ooxml_paragraph"

    for i, elem in enumerate(doc_model.elements):
        if first_body_idx is not None and i >= first_body_idx:
            if elem.is_cover_section:
                elem.is_cover_section = False
                corrected += 1
            if getattr(elem, "type", None) in ("portada_block", ElementType.PORTADA_BLOCK if 'ElementType' in globals() else "portada_block"):
                elem.type = ElementType.PARAGRAPH if 'ElementType' in globals() else "paragraph"
            continue

        was_cover = elem.is_cover_section or (getattr(elem, "type", None) == "portada_block")
        should_be_cover = was_cover or (i < effective_end)
        if was_cover != should_be_cover:
            elem.is_cover_section = should_be_cover
            corrected += 1
        elif should_be_cover and not elem.is_cover_section:
            elem.is_cover_section = True
            corrected += 1

    diag["cover_corrected"] = True
    diag["cover_new_start"] = effective_end
    diag["cover_body_paragraph"] = para_start
    diag["cover_elements_corrected"] = corrected
    return diag


def _detect_cover_end_paragraph(docx_path: str | Path) -> Optional[int]:
    """
    Analiza el XML del .docx para detectar el índice del párrafo donde
    termina la portada.

    Retorna el índice (1-based, igual que COMReader) del primer párrafo
    del cuerpo, o None si no se detecta portada.
    """
    path = Path(docx_path)
    if not path.exists():
        return None

    with zipfile.ZipFile(path, "r") as z:
        if "word/document.xml" not in z.namelist():
            return None
        xml_bytes = z.read("word/document.xml")

    root = ET.fromstring(xml_bytes)
    body = root.find(_w("body"))
    if body is None:
        return None

    paragraphs = list(body)  # w:p, w:tbl, w:sdt, w:sectPr, etc.
    total = len(paragraphs)
    if total == 0:
        return None

    # Estrategia 1: salto de sección explícito (w:sectPr)
    for i, node in enumerate(paragraphs):
        if node.tag == _w("p"):
            pPr = node.find(_w("pPr"))
            if pPr is not None:
                sectPr = pPr.find(_w("sectPr"))
                if sectPr is not None:
                    ratio = i / max(1, total)
                    if ratio < 0.40:
                        return i + 1

    # Estrategia 2: salto de página explícito (w:br type="page")
    for i, node in enumerate(paragraphs):
        if node.tag == _w("p"):
            for r in node.iter(_w("r")):
                for br in r.findall(_w("br")):
                    br_type = br.get(_w("type"), "")
                    if br_type == "page":
                        ratio = i / max(1, total)
                        if ratio < 0.35:
                            return i + 1

    # Estrategia 3: estilo "Title" / "Título" / "Portada"
    COVER_STYLES = {"title", "titulo", "portada", "cover", "tituloprincipal"}
    title_idx: Optional[int] = None
    for i, node in enumerate(paragraphs):
        if node.tag == _w("p"):
            pPr = node.find(_w("pPr"))
            if pPr is not None:
                pStyle = pPr.find(_w("pStyle"))
                if pStyle is not None:
                    style_val = (pStyle.get(_w("val")) or "").lower().replace(" ", "").replace("_", "")
                    style_norm = re.sub(r"[áàâä]", "a", re.sub(r"[éèêë]", "e",
                        re.sub(r"[íìîï]", "i", re.sub(r"[óòôö]", "o",
                        re.sub(r"[úùûü]", "u", style_val)))))
                    if any(cs in style_norm for cs in COVER_STYLES):
                        title_idx = i
                        break

    if title_idx is not None:
        for j in range(title_idx + 1, min(title_idx + 25, total)):
            node = paragraphs[j]
            if node.tag == _w("p"):
                for r in node.iter(_w("r")):
                    for br in r.findall(_w("br")):
                        if br.get(_w("type"), "") == "page":
                            return j + 1
        return min(title_idx + 10, int(total * 0.25))

    # Estrategia 4: heurística de densidad de texto
    if total >= 20:
        candidate_limit = max(5, int(total * 0.20))
        word_count = 0
        for i, node in enumerate(paragraphs[:candidate_limit]):
            if node.tag == _w("p"):
                text = "".join(n.text or "" for n in node.iter(_w("t")))
                word_count += len(text.split())
        if word_count < 350:
            return candidate_limit

    return None
