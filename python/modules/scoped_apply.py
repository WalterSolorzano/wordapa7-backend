"""Aplicación POR ALCANCE sobre el documento ORIGINAL (sin regeneración).

Garantía contractual: cada función muta ÚNICAMENTE su alcance. Si el usuario
elige solo 'tablas_imagenes', ni la portada ni el texto del cuerpo cambian
ni un byte (los tests de aislamiento lo verifican comparando XML).

Alcances:
- texto            : estilos base (fuente/tamaño/interlineado) vía styles.xml
                     + sangría de primera línea en Normal.
- tablas_imagenes  : numeración APA (Tabla N arriba / Figura N abajo) y
                     bordes APA en tablas. No altera ningún otro párrafo.
- bibliografia     : formato de la sección Referencias (hanging indent,
                     doble espacio, sin space-after). No toca el cuerpo.
"""

from __future__ import annotations

import copy
import io
import re
from typing import Any, Dict, List

import docx
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Pt
from lxml import etree

VALID_SCOPES = ("texto", "tablas_imagenes", "bibliografia")

W_NS = W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

_REFS_HEADING = re.compile(
    r"^\s*(referencias|bibliograf[íi]a|references|works cited)\b", re.IGNORECASE
)


def _body_xml(doc: docx.Document) -> str:
    return doc.element.body.xml


# ------------------------------------------------------------- portada guard
# FASE 1.2 (evidencia: docs/evaluacion-tecnologica/EVALUACION_TECNOLOGICA.md S4,
# area1.json B_roundtrip zone_identical=false 5/5). Los scopes 'texto' y
# 'tablas_imagenes' dañaban la portada (sangría V2, reformateo de tablas V3).
# Guard: reutiliza el MISMO detector del parser (pre_classify_elements, fuente
# única usada por /api/addin/document-zones) y protege párrafos + tablas de la
# zona. SDT-wrapped covers ya son invisibles para doc.paragraphs.


def _cover_guard(doc: docx.Document) -> Dict[str, Any]:
    """Detecta la zona de portada y devuelve elementos XML protegidos.

    Retorna {"elements": set[lxml element], "protected": int, "detected": bool}.
    Nunca lanza: si el detector falla, protege nada (comportamiento previo)
    y lo reporta en "detected" — honestidad de estado.
    """
    empty = {"elements": set(), "protected": 0, "detected": False}
    try:
        from parsing.pre_classifier import pre_classify_elements
        from models import ElementModel, ElementType

        paras = list(doc.paragraphs)
        if not paras:
            return empty
        elems = [
            ElementModel(
                id=f"guard-{i}",
                type=ElementType.PARAGRAPH,
                text=(p.text or "").strip(),
                original_text=(p.text or "").strip(),
            )
            for i, p in enumerate(paras)
        ]
        classified = pre_classify_elements(elems)
        is_cover = [bool(getattr(e, "is_cover_section", False)) for e in classified]
        body_start = next((i for i, c in enumerate(is_cover) if not c), len(is_cover))
        if body_start == 0:
            # V1 (area1.json C_zones): el clasificador falla con portadas
            # estructurales (tabla/textbox/flotante primero). Capa estructural:
            # portada = bloques líderes ANTES del primer párrafo con señal de
            # cuerpo (estilo Heading, lista, o >=30 palabras).
            fb = _structural_cover(doc)
            if fb:
                ordered = _ordered_children(doc, fb)
                return {"elements": fb, "ordered": ordered,
                        "protected": len(fb), "detected": True}
            return empty
        protected = {paras[i]._p for i in range(body_start)}
        # tablas ubicadas antes del primer párrafo del cuerpo también son zona
        first_body_p = paras[body_start]._p if body_start < len(paras) else None
        for tbl in doc.tables:
            tbl_el = tbl._tbl
            if first_body_p is not None and _precedes(tbl_el, first_body_p):
                protected.add(tbl_el)
        ordered = _ordered_children(doc, protected)
        return {"elements": protected, "ordered": ordered,
                "protected": len(protected), "detected": True}
    except Exception:
        return empty


def _precedes(a, b) -> bool:
    """True si el elemento a aparece antes que b entre los hijos de body."""
    for child in a.getparent():
        if child is b:
            return False
        if child is a:
            return True
    return False


def _ordered_children(doc: docx.Document, members: set) -> list:
    """Los hijos de body miembros del guard, en orden documental."""
    return [c for c in doc.element.body if c in members]


# ------------------------------------------------- FASE 2.1: SDT opt-in
def wrap_cover_zone_sdt(doc: docx.Document, guard: Dict[str, Any]) -> bool:
    """Envuelve la zona de portada en un w:sdt con w:lock='locked'.

    Garantía estructural (evidencia S4): saca los bloques de doc.paragraphs/
    doc.tables (nuestro pipeline deja de tocarlos) y Word UI respeta el lock.
    Idempotente: si el primer bloque ya vive dentro de un w:sdt, no re-envuelve.
    Retorna True si envolvió ahora.
    """
    ordered = guard.get("ordered") or []
    if not ordered or guard.get("sdt_wrapped"):
        return False
    first = ordered[0]
    if etree.QName(first.getparent()).localname == "sdtContent":
        return False  # ya envuelto por una pasada previa
    from docx.oxml import parse_xml
    from docx.oxml.ns import nsdecls

    sdt = parse_xml(
        '<w:sdt %s>'
        "<w:sdtPr><w:id w:val=\"777777\"/><w:lock w:val=\"locked\"/>"
        '<w:docPartObj><w:docPartGallery w:val="WordAPA7-Portada"/></w:docPartObj></w:sdtPr>'
        "<w:sdtContent/></w:sdt>" % nsdecls("w")
    )
    content = sdt.find(qn("w:sdtContent"))
    first.addprevious(sdt)
    for child in ordered:
        content.append(child)  # append MUEVE (lxml)
    return True


def _structural_cover(doc: docx.Document) -> set:
    """Bloques líderes hasta la primera señal de cuerpo (Heading/lista/parrafo
    largo). Devuelve set vacío si no hay señal (evita proteger el doc entero)."""
    protected: set = set()
    for child in doc.element.body:
        tag = etree.QName(child).localname
        if tag == "p":
            style_el = child.find(f"{{{W_NS}}}pPr/{{{W_NS}}}pStyle")
            style_val = style_el.get(f"{{{W_NS}}}val") if style_el is not None else ""
            text = "".join(t.text or "" for t in child.iter(f"{{{W_NS}}}t"))
            words = len(text.split())
            is_body_signal = (
                style_val.lower().startswith("heading")
                or style_val in ("Title", "Subtitle")
                or words >= 30
                or _REFS_HEADING.match(text or "")
            )
            if is_body_signal:
                return protected
            protected.add(child)
        elif tag == "tbl":
            protected.add(child)
        else:
            break  # sectPr u otro cierre: fin de zona candidata
    return set()  # nunca hubo señal de cuerpo: no arriesgar


def _cover_guard_summary(guard: Dict[str, Any]) -> Dict[str, Any]:
    return {"protected": guard.get("protected", 0), "detected": guard.get("detected", False)}


# ------------------------------------------------------------------ texto
def apply_scope_texto(doc: docx.Document, rules: Dict[str, Any], guard: Dict[str, Any] | None = None) -> None:
    """Estilos globales + sangría. No crea/borra/mueve contenido."""
    from generation.style_engine import update_docx_styles_xml

    class _R:  # adapter mínimo al APARuleSet real
        pass

    r = _R()
    r.font_family = rules.get("font_family", "Times New Roman")
    r.font_size_pt = float(rules.get("font_size_pt", 12))
    r.line_spacing = float(rules.get("line_spacing", 2.0))
    try:
        update_docx_styles_xml(doc, r)
    except Exception:
        pass
    indent_cm = float(rules.get("first_line_indent_cm", 1.27))
    protected = (guard or {}).get("elements") or set()
    for p in doc.paragraphs:
        if p._p in protected:
            continue
        pf = p.paragraph_format
        if pf.first_line_indent is None:
            pf.first_line_indent = Cm(indent_cm)


# -------------------------------------------------------- tablas_imagenes
def _set_apa_table_borders(table) -> None:
    tbl_pr = table._tbl.tblPr
    for old in tbl_pr.findall(qn("w:tblBorders")):
        tbl_pr.remove(old)
    borders = parse_borders()
    tbl_pr.append(borders)


def parse_borders():
    from docx.oxml import parse_xml
    from docx.oxml.ns import nsdecls

    xml = (
        '<w:tblBorders %s>'
        '<w:top w:val="single" w:sz="12" w:color="000000"/>'
        '<w:bottom w:val="single" w:sz="12" w:color="000000"/>'
        '<w:left w:val="none" w:sz="0"/>'
        '<w:right w:val="none" w:sz="0"/>'
        '<w:insideH w:val="single" w:sz="6" w:color="000000"/>'
        '<w:insideV w:val="none" w:sz="0"/>'
        "</w:tblBorders>"
    ) % nsdecls("w")
    return parse_xml(xml)


def apply_scope_tablas_imagenes(doc: docx.Document, guard: Dict[str, Any] | None = None) -> Dict[str, int]:
    """Numera tablas (caption arriba) y figuras (caption abajo). Solo inserta
    párrafos nuevos adyacentes; jamás edita párrafos existentes."""
    counts = {"tablas": 0, "figuras": 0}
    protected = (guard or {}).get("elements") or set()

    # --- Tablas: caption ARRIBA ---
    t_idx = 0
    for tbl in doc.tables:
        if tbl._tbl in protected:
            continue  # tabla de portada: intocable
        t_idx += 1
        anchor = tbl._tbl
        new_p = copy.deepcopy(anchor.getprevious() if anchor.getprevious() is not None else anchor)
        # construir párrafo limpio
        from docx.oxml import OxmlElement

        p_el = OxmlElement("w:p")
        anchor.addprevious(p_el)
        para = docx.text.paragraph.Paragraph(p_el, tbl._tbl)
        para.alignment = WD_ALIGN_PARAGRAPH.LEFT
        run = para.add_run(f"Tabla {t_idx}")
        run.bold = True
        counts["tablas"] = t_idx

    # --- Figuras: caption DEBAJO de párrafos con drawing ---
    f_idx = 0
    body_paras = list(doc.paragraphs)
    for i, p in enumerate(body_paras):
        if p._p in protected:
            continue  # imagen de portada: sin caption automática
        if p._p.findall(".//" + qn("w:drawing")):
            f_idx += 1
            from docx.oxml import OxmlElement

            p_el = OxmlElement("w:p")
            p._p.addnext(p_el)
            para = docx.text.paragraph.Paragraph(p_el, p._parent)
            para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = para.add_run(f"Figura {f_idx}.")
            run.bold = True
            body_paras.insert(i + 1, para)
    counts["figuras"] = f_idx
    return counts


# ------------------------------------------------------------ bibliografia
def apply_scope_bibliografia(doc: docx.Document) -> int:
    """Hanging indent + doble espacio SOLO dentro de la sección de referencias."""
    start = None
    for i, p in enumerate(doc.paragraphs):
        if _REFS_HEADING.match(p.text or ""):
            start = i + 1
    if start is None:
        return 0
    count = 0
    for p in doc.paragraphs[start:]:
        if not (p.text or "").strip():
            continue
        if _REFS_HEADING.match(p.text or ""):
            break
        pf = p.paragraph_format
        pf.left_indent = Cm(1.27)
        pf.first_line_indent = Cm(-1.27)
        pf.line_spacing = 2.0
        pf.space_after = Pt(0)
        pf.space_before = Pt(0)
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        count += 1
    return count


# ------------------------------------------------------------------ entry
def apply_scopes(file_bytes: bytes, scopes: List[str], rules: Dict[str, Any]) -> tuple[bytes, Dict[str, Any]]:
    """Punto único: aplica SOLO los alcances pedidos sobre el original."""
    invalid = [s for s in scopes if s not in VALID_SCOPES]
    if invalid:
        raise ValueError(f"Alcances inválidos: {invalid}")

    doc = docx.Document(io.BytesIO(file_bytes))
    summary: Dict[str, Any] = {"scopes": list(scopes)}

    guard = _cover_guard(doc)
    summary["cover_guard"] = _cover_guard_summary(guard)
    guard["sdt_wrapped"] = False

    if "texto" in scopes:
        apply_scope_texto(doc, rules, guard)
        summary["texto"] = True
    if "bibliografia" in scopes:
        summary["refs_formateadas"] = apply_scope_bibliografia(doc)
    if "tablas_imagenes" in scopes:
        summary.update(apply_scope_tablas_imagenes(doc, guard))

    # FASE 2.1: blindaje estructural opt-in (nunca sin permiso explícito)
    if rules.get("cover_protect_sdt"):
        try:
            summary["cover_sdt"] = wrap_cover_zone_sdt(doc, guard)
        except Exception as e:  # honestidad: no falla la exportación por esto
            summary["cover_sdt"] = False
            summary["cover_sdt_error"] = repr(e)[:160]

    out = io.BytesIO()
    doc.save(out)
    return out.getvalue(), summary
