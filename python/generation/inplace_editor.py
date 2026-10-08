"""WordAPA7 â€” Motor de ediciÃ³n IN-PLACE.

Abre el .docx ORIGINAL y modifica SOLO los pÃ¡rrafos del cuerpo.
La portada original (todo pÃ¡rrafo con Ã­ndice < body_start_paragraph_idx),
las secciones (sectPr), headers/footers y estilos existentes NUNCA se tocan:
python-docx preserva intactas las partes que no se modifican.

Scopes soportados (coinciden con scoped_apply):
  texto            -> tipografÃ­a/interlineado/sangrÃ­a de pÃ¡rrafos del cuerpo
  tablas_imagenes  -> estilo APA de tablas (bordes/header row); imÃ¡genes intactas
  bibliografia     -> sangrÃ­a francesa en el bloque final de referencias

Contrato duro (testeado):
  * NingÃºn pÃ¡rrafo con idx < body_start cambia NI UN BYTE.
  * headers / footers byte-idÃ©nticos.
  * Si scopes estÃ¡ definido, solo esos Ã¡mbitos cambian.

EXCEPCIÓN, Y ES A PROPÓSITO — `sectPr` y `styles.xml`: antes eran byte-idénticos
también, y esta ruta no escribía ni el tamaño de hoja ni el idioma. Como es la
exportación por omisión, el selector de la pestaña Documento no llegaba al `.docx`:
el control se veía, respondía, y el archivo salía con el papel del original y con
el `en-US` de la plantilla de Word. Ahora se escriben `pgSz` (el tamaño que eligió
la persona, respetando la orientación de cada sección) y `w:lang`. Son dos
atributos de la hoja, no del contenido: los márgenes, la orientación, los
encabezados y los pies siguen intactos, y la portada sigue sin tocarse.
"""
from __future__ import annotations

import hashlib
import io
import re
import time
import zipfile
from pathlib import Path
from typing import Any, Iterable

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Inches, Pt

from generation.document_structure import refresh_or_flag_existing_toc
from generation.style_engine import (
    aplicar_idioma_documento,
    aplicar_tamano_pagina,
    update_docx_styles_xml,
)
from parsing.references_extractor import reference_looks_like_junk

try:
    from wordapa7_logger import log_event
except Exception:  # pragma: no cover
    def log_event(*a, **k): pass


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:12]


def _canon(data: bytes) -> str:
    """Hash canÃ³nico XML (inmune a re-serializaciÃ³n de python-docx)."""
    from lxml import etree
    try:
        tree = etree.fromstring(data)
        return hashlib.sha256(etree.tostring(tree, method="c14n")).hexdigest()[:12]
    except Exception:
        return _sha(data)


def _cover_floor_by_content(doc: Any) -> int:
    """Piso adicional: la portada termina antes del primer Heading real o del
    primer parrafo largo de cuerpo. Nunca confiar solo en el indice guardado."""
    floor = 0
    for i, para in enumerate(doc.paragraphs[:60]):
        txt = (para.text or "").strip()
        style = (para.style.name or "").lower() if para.style is not None else ""
        if "heading" in style or "tÃ­tulo" in style:
            return i
        # parrafo de cuerpo tipico: >180 chars o contiene citas (Autor, 2019)
        if len(txt) > 180 or re.search(r"\([A-Z][^)]{2,40},\s*(19|20)\d{2}\)", txt):
            return i
    return max(floor, 0)


def _body_start(doc_model: Any) -> int:
    p = getattr(doc_model, "portada", None) or {}
    if isinstance(p, dict):
        raw = p.get("body_start_paragraph_idx")
    else:
        raw = getattr(p, "body_start_paragraph_idx", None)
    try:
        v = int(raw)
        return max(v, 0)
    except (TypeError, ValueError):
        return 0


def _is_ref_paragraph(text: str) -> bool:
    t = text.strip()
    return bool(t) and len(t) > 40 and re.search(r"\(\d{4}\)|\(\d{4}[a-z]?\)", t)


def _normalize_ref_for_dedup(text: str) -> str:
    """Normaliza una entrada de bibliografia para dedup in-place: sin
    prefijo numeral, lowercase, espacios colapsados.

    '6. Hirano, H. (1995) ...' y '7. Hirano, H. (1995) ...' colapsan a la
    misma key. El bug original: el numeral distinto ('6.' vs '7.') impedia
    colapsar duplicados en el export in-place.
    """
    t = re.sub(r"^\s*\d+[.)]\s+", "", text or "")
    return re.sub(r"\s+", " ", t.lower()).strip()


def _is_list_item(para: Any, text: str) -> bool:
    """Detecta si un parrafo es viÃ±eta o lista numerada."""
    try:
        if para._p.pPr is not None and para._p.pPr.numPr is not None:
            return True
    except Exception:
        pass
    return bool(re.match(r"^(?:[\u2022\u2023\u25E6\u2043\u2219\*\-\â€“\â€”]|\d+[\.\)]|[a-zA-Z][\.\)]|\([a-zA-Z\d]+\))\s+", text))


def _is_toc_line(text: str) -> bool:
    """Detecta lineas de tabla de contenidos / indice."""
    return bool(re.search(r"(?:\.{2,}|_{2,}|\t|\s{4,})\s*\d+\s*$", text))


# Tipos de elemento del modelo que corresponden a un párrafo físico de
# `doc.paragraphs`. Es la MISMA lista que usa `apply_inplace` para mapear.
_PARAGRAPH_LIKE_TYPES = ("paragraph", "heading", "bullet", "numbered_list", "portada_block")

_REGEX_TABLE_CAPTION = re.compile(r"^(?:Tabla|Table|Cuadro)\s+\d+\.?", re.IGNORECASE)
_REGEX_FIGURE_CAPTION = re.compile(r"^(?:Figura|Figure|Fig\.)\s+\d+\.?", re.IGNORECASE)


def _model_body_element_indices(doc_model: Any) -> list[int]:
    """Índices (dentro de `doc_model.elements`) de los elementos que son un
    párrafo del cuerpo: tipo párrafo y NO portada, en orden.

    Es la única correspondencia estable con `doc.paragraphs`: el modelo omite
    párrafos vacíos y parte/une bloques de portada, así que el ordinal global
    de elementos NO es un índice de párrafo."""
    out: list[int] = []
    for i, elem in enumerate(getattr(doc_model, "elements", None) or []):
        et = getattr(elem, "type", None)
        ets = et.value if hasattr(et, "value") else str(et)
        if ets in _PARAGRAPH_LIKE_TYPES and not getattr(elem, "is_cover_section", False):
            out.append(i)
    return out


def physical_paragraph_index(
    doc_model: Any, paragraphs: list, model_element_index: int, body_start: int
) -> int | None:
    """Índice físico en `doc.paragraphs` del elemento del modelo, con la MISMA
    correspondencia que `apply_inplace`: párrafos NO vacíos del cuerpo
    (>= `body_start`), en orden, contra elementos de cuerpo (no portada), en
    orden. Devuelve `None` si el elemento no es un párrafo de cuerpo o no se
    puede ubicar."""
    body = _model_body_element_indices(doc_model)
    if model_element_index not in body:
        return None
    pos = body.index(model_element_index)
    k = 0
    for pi in range(body_start, len(paragraphs)):
        if (paragraphs[pi].text or "").strip():
            if k == pos:
                return pi
            k += 1
    return None


def locate_physical_paragraph(doc_model: Any, physical_doc: Any, model_element_index: int) -> int | None:
    """Igual que `physical_paragraph_index`, pero calcula `body_start` desde el
    modelo y el piso de portada por contenido. Punto único para que la inserción
    de elementos (routers/sessions) use la misma convención que el export."""
    paragraphs = physical_doc.paragraphs
    body_start = max(_body_start(doc_model), 0)
    body_start = max(body_start, _cover_floor_by_content(physical_doc))
    return physical_paragraph_index(doc_model, paragraphs, model_element_index, body_start)


def _caption_paragraph_text(el: Any) -> str:
    W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    return "".join(t.text or "" for t in el.iter(f"{W}t")).strip()


def _find_caption_near(block_el: Any, pattern: re.Pattern, window: int = 6) -> Any:
    """Devuelve el párrafo de leyenda (Figura N / Tabla N) cercano al bloque,
    o `None`. Un .docx hecho a mano la pone arriba o abajo, a veces con
    párrafos vacíos (o el segundo dibujo de la misma figura) en medio, así que
    se mira el propio bloque y hasta `window` hermanos por lado."""
    W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    if block_el.tag == f"{W}p" and pattern.match(_caption_paragraph_text(block_el)):
        return block_el
    for direction in ("getprevious", "getnext"):
        el = getattr(block_el, direction)()
        steps = 0
        while el is not None and steps < window:
            if el.tag == f"{W}p" and pattern.match(_caption_paragraph_text(el)):
                return el
            el = getattr(el, direction)()
            steps += 1
    return None


def _has_caption_near(block_el: Any, pattern: re.Pattern, window: int = 6) -> bool:
    return _find_caption_near(block_el, pattern, window) is not None


def _set_caption_number(caption_el: Any, new_num: int) -> None:
    """Reescribe el número de una leyenda existente conservando sus runs
    (formato). Cambia el primer bloque de dígitos que encuentre."""
    W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    for r in caption_el.findall(f"{W}r"):
        for t in r.findall(f"{W}t"):
            if t.text and re.search(r"\d+", t.text):
                t.text = re.sub(r"\d+", str(new_num), t.text, count=1)
                return


def _insert_caption_label(doc: Any, block_el: Any, text: str, rules: Any) -> None:
    """Inserta un párrafo de etiqueta APA ("Figura N" / "Tabla N") justo antes
    del bloque, en negrita y pegado a él (`keep_with_next`). No toca nada más."""
    from docx.oxml import OxmlElement
    from docx.text.paragraph import Paragraph

    new_p = OxmlElement("w:p")
    block_el.addprevious(new_p)
    para = Paragraph(new_p, doc)
    pf = para.paragraph_format
    pf.space_before = Pt(6)
    pf.space_after = Pt(2)
    try:
        pf.line_spacing = getattr(rules, "line_spacing", 2.0)
    except Exception:
        pass
    pf.first_line_indent = Inches(0)
    pf.keep_with_next = True
    run = para.add_run(text)
    run.bold = True
    run.font.name = getattr(rules, "font_family", None)
    size = getattr(rules, "font_size_pt", None)
    if size:
        try:
            run.font.size = Pt(size)
        except Exception:
            pass
    return new_p


def _caption_units(doc: Any, body_start: int, pattern: re.Pattern, kind: str) -> list:
    """Unidades numerables del cuerpo en orden de documento (`kind` = 'figure'
    o 'table'). Cada unidad es `(elemento, ya_tiene_leyenda)`: si `True`, el
    elemento es el párrafo de leyenda existente (se reescribe su número); si
    `False`, es un bloque sin leyenda (se le inserta una). Una leyenda que ya
    aparece cuenta una sola vez aunque cubra varios dibujos."""
    W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    units = []
    seen = set()

    def _add(el: Any, existing: bool) -> None:
        key = el.getroottree().getpath(el)
        if key in seen:
            return
        seen.add(key)
        units.append((el, existing))

    pidx = 0
    for child in list(doc.element.body):
        tag = child.tag
        if tag == f"{W}p":
            in_body = pidx >= body_start
            pidx += 1
            if not in_body:
                continue
            if pattern.match(_caption_paragraph_text(child)):
                _add(child, True)  # leyenda suelta (p. ej. sin dibujo cerca)
                continue
            if kind == "figure" and (
                child.findall(f".//{W}drawing") or child.findall(f".//{W}pict")
            ):
                cap = _find_caption_near(child, pattern)
                if cap is not None:
                    _add(cap, True)
                else:
                    _add(child, False)
        elif tag == f"{W}tbl":
            if kind != "table" or pidx < body_start:
                continue
            cap = _find_caption_near(child, pattern)
            if cap is not None:
                _add(cap, True)
            else:
                _add(child, False)
    return units


def _ensure_body_captions(doc: Any, body_start: int, rules: Any) -> None:
    """Numera en APA las figuras y tablas del CUERPO.

    La portada (todo lo anterior a `body_start`) no se toca. Se recorre el
    cuerpo en orden y cada figura/tabla recibe su número correlativo: si ya
    tenía leyenda se reescribe el número (así se corrigen duplicados y saltos
    del original), y si no la tenía se inserta 'Figura N' / 'Tabla N'. Las
    unidades se calculan ANTES de insertar para que las leyendas nuevas no se
    confundan con las del propio documento."""
    fig_prefix = getattr(rules, "figure_label_prefix", "Figura")
    tbl_prefix = getattr(rules, "table_label_prefix", "Tabla")
    fig_units = _caption_units(doc, body_start, _REGEX_FIGURE_CAPTION, "figure")
    tbl_units = _caption_units(doc, body_start, _REGEX_TABLE_CAPTION, "table")
    for n, (el, existing) in enumerate(fig_units, start=1):
        if existing:
            _set_caption_number(el, n)
        else:
            _insert_caption_label(doc, el, f"{fig_prefix} {n}", rules)
    for n, (el, existing) in enumerate(tbl_units, start=1):
        if existing:
            _set_caption_number(el, n)
        else:
            _insert_caption_label(doc, el, f"{tbl_prefix} {n}", rules)


def _strip_accents(text: str) -> str:
    """Quita acentos para comparar cabeceras ("Bibliografía" == "bibliografia").

    El archivo traia literales no-ASCII corruptos; comparar sin acentos evita
    depender de ellos y ademas reconoce el titulo acentuado real.
    """
    import unicodedata

    return "".join(
        c for c in unicodedata.normalize("NFKD", text or "") if not unicodedata.combining(c)
    )


def apply_inplace(
    original_path: Path,
    out_path: Path,
    doc_model: Any,
    rules: Any,
    scopes: Iterable[str] | None = None,
    language: str | None = None,
    acta: Any = None,
) -> Path:
    """Edita el documento original respetando portada/secciones al 100%.

    `language` es un parámetro aparte y no un campo de `rules` a propósito: el
    idioma viaja en `PortadaData` (ver el motivo en `models.py`) y `rules` es
    `APARuleSet`, así que leerlo de ahí sería leer una cosa que nunca estuvo.

    `acta` es `DocumentMeta` y trae los datos del acta: autor, profesor asesor,
    comite y fecha de defensa. Va aparte por la misma razon que el idioma, y por
    una mas: son metadatos del DOCUMENTO, no de la portada, y esta funcion es la
    ruta de exportacion por omision cuando la portada original se conserva. Sin
    ella el `.docx` salia sin el autor ni el profesor, que es justo lo que
    reporto el usuario al marcar "conservar original".
    """
    t0 = time.time()
    active = set(scopes) if scopes is not None else {"texto", "tablas_imagenes", "bibliografia"}
    body_start = max(_body_start(doc_model), 0)

    orig_bytes = Path(original_path).read_bytes()

    # Snapshots de garantÃ­a: portada (pÃ¡rrafos < body_start) y partes globales.
    pre = Document(io.BytesIO(orig_bytes))
    try:
        body_start = max(body_start, _cover_floor_by_content(pre))
    except Exception:
        pass

    cover_before = [_sha(p._element.xml.encode("utf-8")) for p in pre.paragraphs[:body_start]]
    global_before = {}
    with zipfile.ZipFile(io.BytesIO(orig_bytes)) as z:
        for name in z.namelist():
            if name.startswith(("word/styles.", "word/header", "word/footer")) or name.endswith("document.xml.rels"):
                global_before[name] = _canon(z.read(name))

    doc = Document(io.BytesIO(orig_bytes))
    paragraphs = doc.paragraphs
    font_name = getattr(rules, "font_family", None) or "Times New Roman"
    font_size = Pt(getattr(rules, "font_size_pt", 12) or 12)
    line_sp = float(getattr(rules, "line_spacing", 2.0) or 2.0)

    # Asegurar campo TOC dinámico si el documento tiene índice previo o manual
    try:
        refresh_or_flag_existing_toc(doc)
    except Exception:
        pass

    # Construir mapa de texto y heading level editado por el usuario en el editor.
    # El modelo NO está 1:1 con doc.paragraphs: el parser omite párrafos vacíos
    # y parte/une bloques de portada. Por eso el ordinal global de elementos NO
    # sirve como índice de párrafo (desfasaba el texto ~20 posiciones y
    # convertía cuerpo en títulos, ensuciando el índice de Word). La única
    # correspondencia estable es: párrafos NO vacíos del cuerpo (i >= body_start),
    # en orden, contra elementos de cuerpo (no portada), en orden.
    modified_text_map: dict[int, str] = {}
    heading_level_map: dict[int, int] = {}
    if hasattr(doc_model, "elements") and doc_model.elements:
        body_elems = _model_body_element_indices(doc_model)
        j = 0
        for i in range(body_start, len(paragraphs)):
            if not paragraphs[i].text.strip():
                continue
            if j >= len(body_elems):
                break
            elem = doc_model.elements[body_elems[j]]
            etype = getattr(elem, "type", None)
            etype_str = etype.value if hasattr(etype, "value") else str(etype)
            j += 1
            # Solo el texto que el usuario editó se reescribe; el resto se deja
            # intacto para no pisar contenido ni glifos de viñeta.
            if getattr(elem, "is_user_modified", False):
                t = getattr(elem, "text", None)
                if t:
                    modified_text_map[i] = t
            if etype_str == "heading":
                lvl = getattr(elem, "heading_level", 1) or 1
                heading_level_map[i] = lvl

    changed = 0
    # Capa de defensa (no raiz): la causa del duplicado es la extraccion;
    # test raiz: tests/test_references_dedup.py. Este dedup in-place cubre
    # documentos que YA llegan con bibliografia duplicada.
    ref_seen: set[str] = set()
    removed_refs = 0
    ref_zone_start = len(paragraphs)
    if "texto" in active or "bibliografia" in active:
        from modules.phase_scope import is_references_title
        # Localizar inicio de bibliografía: último heading 'Referencias' o primer párrafo-ref
        for i in range(len(paragraphs) - 1, body_start, -1):
            cand = _strip_accents(paragraphs[i].text.strip().rstrip(":"))
            if is_references_title(cand) or cand.lower() in ("referencias", "bibliografia", "references", "referencias bibliograficas"):
                ref_zone_start = i + 1
                break

    for i, para in enumerate(paragraphs):
        if i < body_start:
            continue  # PORTADA INTOCABLE â€” contrato duro
        text = para.text.strip()
        if not text:
            # Preservar saltos de pÃ¡gina manuales (rendered como w:br con type="page" o lastRenderedPageBreak)
            has_page_break = bool(para._element.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}br[@{http://schemas.openxmlformats.org/wordprocessingml/2006/main}type="page"]'))
            has_rendered_break = bool(para._element.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}lastRenderedPageBreak'))

            # Preservar contenido NO textual. `.text` de python-docx solo
            # concatena `w:t`, asi que una ecuacion OMML (`m:oMath`/`m:oMathPara`
            # solo tienen `m:t`), una imagen (`w:drawing`/`a:blip`) o un objeto
            # VML (`w:pict`/`v:imagedata`) dan `text == ""`. Sin este guard el
            # purge los borraba y el .docx salia sin ecuaciones ni figuras.
            _M = "{http://schemas.openxmlformats.org/officeDocument/2006/math}"
            _A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
            _V = "{urn:schemas-microsoft-com:vml}"
            _W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
            has_no_textual = bool(
                para._element.findall(f".//{_M}oMath")
                or para._element.findall(f".//{_M}oMathPara")
                or para._element.findall(f".//{_W}drawing")
                or para._element.findall(f".//{_W}object")
                or para._element.findall(f".//{_A}blip")
                or para._element.findall(f".//{_V}imagedata")
            )

            if "texto" in active and not (has_page_break or has_rendered_break or has_no_textual):
                para._element.getparent().remove(para._element)
            continue
        style_name = (para.style.name or "").lower() if para.style is not None else ""
        is_heading_style = "heading" in style_name or "tÃ­tulo" in style_name or "titulo" in style_name
        is_heading_model = i in heading_level_map

        if is_heading_style or is_heading_model:
            para.paragraph_format.keep_with_next = True
            para.paragraph_format.widow_control = True
            lvl = heading_level_map.get(i, 1)
            # Asignar estilo nativo Heading correspondiente si no lo tiene
            try:
                style_candidates = [f"Heading {lvl}", f"Título {lvl}"]
                doc_styles = doc.styles
                for sc in style_candidates:
                    if sc in doc_styles:
                        para.style = doc_styles[sc]
                        break
            except Exception:
                pass

            # Si el texto del título fue modificado en el editor, sincronizarlo
            if i in modified_text_map:
                new_title = modified_text_map[i]
                if new_title and new_title.strip() != text:
                    if len(para.runs) >= 1:
                        para.runs[0].text = new_title
                        for r in para.runs[1:]:
                            r.text = ""
                    else:
                        para.text = new_title

            # Aplicar formato APA 7 al título
            if lvl == 1:
                para.paragraph_format.page_break_before = True
                para.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
                para.paragraph_format.first_line_indent = Inches(0)
                for r in para.runs:
                    r.bold = True
                    r.font.name = font_name
                    r.font.size = font_size
            elif lvl == 2:
                para.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
                para.paragraph_format.first_line_indent = Inches(0)
                for r in para.runs:
                    r.bold = True
                    r.font.name = font_name
                    r.font.size = font_size
            elif lvl == 3:
                para.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
                para.paragraph_format.first_line_indent = Inches(0)
                for r in para.runs:
                    r.bold = True
                    r.italic = True
                    r.font.name = font_name
                    r.font.size = font_size
            continue

        # Linea de indice / TOC -> NO aplicar sangria de primera linea
        if _is_toc_line(text) or text.strip().lower() in ("indice", "Ã­ndice", "tabla de contenido", "tabla de contenidos"):
            continue

        if "bibliografia" in active and i >= ref_zone_start and reference_looks_like_junk(text):
            # Entrada que no es una referencia (pagina web cuyo titulo se colo
            # como autor): se elimina del bloque de bibliografia.
            para._element.getparent().remove(para._element)
            removed_refs += 1
            continue

        if "bibliografia" in active and i >= ref_zone_start and _is_ref_paragraph(text):
            # Dedup de bibliografia in-place: misma referencia con distinto
            # numeral de lista ('6.' y '7.') se colapsa eliminando el
            # parrafo duplicado del documento.
            dedup_key = _normalize_ref_for_dedup(text)
            if dedup_key in ref_seen:
                para._element.getparent().remove(para._element)
                removed_refs += 1
                continue
            ref_seen.add(dedup_key)
            pf = para.paragraph_format
            pf.left_indent = Inches(0.5)
            pf.first_line_indent = Inches(-0.5)
            pf.line_spacing = line_sp
            pf.space_before = Pt(0)
            pf.space_after = Pt(0)
            para.alignment = WD_ALIGN_PARAGRAPH.LEFT
            changed += 1
            continue

        # ViÃ±etas o listas -> margen izquierdo 0.5", SIN sangria de primera linea APA
        if _is_list_item(para, text):
            if "texto" in active:
                pf = para.paragraph_format
                pf.left_indent = Inches(0.5)
                pf.first_line_indent = Inches(0)
                pf.line_spacing = line_sp
                pf.space_after = Pt(0)
                pf.space_before = Pt(0)
                for run in para.runs:
                    run.font.name = font_name
                    run.font.size = font_size
                changed += 1
            continue

        # Figuras y leyendas de tablas -> margen 0, SIN sangría de primera línea
        is_caption = bool(_REGEX_TABLE_CAPTION.match(text) or _REGEX_FIGURE_CAPTION.match(text))
        if is_caption:
            pf = para.paragraph_format
            pf.left_indent = Inches(0)
            pf.right_indent = Inches(0)
            pf.first_line_indent = Inches(0)
            pf.line_spacing = line_sp
            pf.space_after = Pt(0)
            pf.space_before = Pt(0)
            for run in para.runs:
                run.font.name = font_name
                run.font.size = font_size
            changed += 1
            continue

        if "texto" in active:
            pf = para.paragraph_format
            pf.left_indent = Inches(0)
            pf.right_indent = Inches(0)
            pf.line_spacing = line_sp
            pf.space_after = Pt(0)
            pf.space_before = Pt(0)
            first_vis = bool(getattr(rules, "indent_first_line", True))
            pf.first_line_indent = Inches(0.5) if first_vis else Inches(0)
            
            # Si el elemento fue modificado en el editor, sincronizar su texto
            if modified_text_map and i in modified_text_map:
                new_text = modified_text_map[i]
                if new_text and new_text.strip() != text:
                    if len(para.runs) == 1:
                        para.runs[0].text = new_text
                    elif len(para.runs) > 1:
                        para.runs[0].text = new_text
                        for r in para.runs[1:]:
                            r.text = ""
                    else:
                        para.text = new_text

            # Si todos los runs de un párrafo ordinario traen negrita por herencia errónea, apagarla
            all_bold = all(r.bold is True for r in para.runs if r.text.strip())
            for run in para.runs:
                run.font.name = font_name
                run.font.size = font_size
                if all_bold:
                    run.bold = False
            changed += 1

    if "tablas_imagenes" in active:
        from docx.oxml.ns import qn
        from docx.oxml import OxmlElement

        for tbl in doc.tables:
            tbl.alignment = WD_ALIGN_PARAGRAPH.CENTER if hasattr(tbl, "alignment") else tbl.alignment
            tbl.autofit = True
            if len(tbl.rows) > 0:
                try:
                    trPr = tbl.rows[0]._tr.get_or_add_trPr()
                    if trPr.find(qn("w:tblHeader")) is None:
                        trPr.append(OxmlElement("w:tblHeader"))
                    if trPr.find(qn("w:cantSplit")) is None:
                        trPr.append(OxmlElement("w:cantSplit"))
                    for row in tbl.rows[1:]:
                        rPr = row._tr.get_or_add_trPr()
                        if rPr.find(qn("w:cantSplit")) is None:
                            rPr.append(OxmlElement("w:cantSplit"))
                except Exception:
                    pass
            # Bordes horizontales Ãºnicamente (estilo APA clÃ¡sico)
            tblPr = tbl._tbl.tblPr
            borders = tblPr.find(qn("w:tblBorders"))
            if borders is not None:
                tblPr.remove(borders)
            borders = OxmlElement("w:tblBorders")
            for edge in ("top", "bottom"):
                el = OxmlElement(f"w:{edge}")
                el.set(qn("w:val"), "single"); el.set(qn("w:sz"), "8")
                el.set(qn("w:color"), "000000")
                borders.append(el)
            for edge in ("left", "right", "insideH", "insideV"):
                el = OxmlElement(f"w:{edge}")
                el.set(qn("w:val"), "none")
                borders.append(el)
            tblPr.append(borders)

        # Leyendas APA para figuras/tablas del cuerpo que no la tengan.
        _ensure_body_captions(doc, body_start, rules)

    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Tamaño de hoja e idioma. Esta es la ruta de export por omisión
    # (`export_mode: "inplace"` con la portada original conservada), así que lo
    # que no se escriba acá NO LLEGA AL `.docx`: el selector de la pestaña
    # Documento sería otro control que no hace nada, que es el defecto exacto
    # que esta fase viene a matar.
    #
    # La orientación se respeta: una sección apaisada se queda apaisada y se le
    # cruzan ancho y alto. Los MÁRGENES no se tocan acá, porque el contrato duro
    # de esta ruta es preservar la maquetación del original.
    _page_size = getattr(rules, "page_size", None) or "carta"
    for _sec in doc.sections:
        _landscape = False
        try:
            _pg = _sec._sectPr.find(qn("w:pgSz"))
            _landscape = _pg is not None and _pg.attrib.get(qn("w:orient")) == "landscape"
        except Exception:
            pass
        aplicar_tamano_pagina(_sec, _page_size, landscape=_landscape)
    # Los datos del acta se escriben DESPUES de la pasada de cuerpo y ANTES de
    # la de idioma, por dos razones: la pasada de cuerpo no los tiene en cuenta
    # (los acaba de crear) y la de idioma los necesita para no declarar el
    # autor en el idioma de omision de la plantilla.
    #
    # Van en `body_start`, que es justo donde termina el bloque protegido: ni
    # dentro de la portada ni delante de ella.
    if acta is not None:
        try:
            from modules.portada_module import format_acta_documento
            format_acta_documento(doc, acta, rules, indice_insercion=body_start)
        except Exception as err:
            log_event("inplace_editor", "acta_write_warning", data={"error": str(err)})

    aplicar_idioma_documento(doc, language or "es-ES", skip_body_paragraphs=body_start)

    doc.save(str(out_path))

    # VerificaciÃ³n post: asegurar que la portada no mutÃ³
    post_bytes = out_path.read_bytes()
    post = Document(io.BytesIO(post_bytes))
    cover_after = [_sha(p._element.xml.encode("utf-8")) for p in post.paragraphs[:body_start]]
    if cover_before != cover_after:
        log_event("inplace_editor", "cover_drift_warning",
                  data={"body_start": body_start, "diffs": sum(1 for a, b in zip(cover_before, cover_after) if a != b)})

    log_event("inplace_editor", "completed",
              data={"scope": sorted(active), "body_start": body_start, "changed": changed,
                    "removed_refs": removed_refs,
                    "elapsed_ms": int((time.time() - t0) * 1000)})
    return out_path
