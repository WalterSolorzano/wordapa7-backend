"""
WordAPA7 — Motor de Listas y Viñetas APA 7 (OOXML Native Lists)

Formatea listas con viñetas o numeradas usando estructuras OOXML nativas (w:numPr).
No inserta caracteres planos como texto ("•\t"), garantizando que Microsoft Word
las reconozca como listas reales anidables de 3 niveles.
"""

import re
from typing import Optional

from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from models import APARuleSet, BulletStyle, NumberStyle

from generation.style_engine import set_run_font

APA_LIST_INDENT: dict[int, tuple[float, float]] = {
    1: (0.5, -0.25),    # Nivel 1: cuerpo 1.27cm (0.5 in)
    2: (1.0, -0.25),    # Nivel 2: cuerpo 2.54cm (0.5*2 in)
    3: (1.5, -0.25),    # Nivel 3: cuerpo 3.81cm (0.5*3 in)
}

# FASE 1.1 (evidencia: docs/evaluacion-tecnologica/EVALUACION_TECNOLOGICA.md S2,
# PoC area4.json misformat_confirmed=true): los numId fijos 1/2 colisionan con
# listas preexistentes del usuario. Ahora se aloja un numId LIBRE por documento
# y se garantiza un abstractNum dedicado para vineta/numero.

_LIST_KIND_SPEC = {
    "bullet": {"fmt": "bullet", "lvl_text": "\uf0b7", "font": "Symbol"},
    "number": {"fmt": "decimal", "lvl_text": "%1.", "font": None},
}


def _numbering_element(paragraph):
    """Localiza el elemento raiz de word/numbering.xml del documento del parrafo."""
    try:
        for rel in paragraph.part.rels.values():
            if rel.reltype.endswith("/numbering"):
                target = rel.target_part
                return getattr(target, "element", None) or target._element
    except Exception:
        pass
    return None


def get_or_create_list_num_id(paragraph, kind: str) -> Optional[int]:
    """Devuelve un numId LIBRE cuyo abstractNum garantiza el formato pedido.

    Reutiliza el mismo par (abstract,num) para todas las listas del mismo tipo
    dentro del documento (memo en el DocumentPart durante la corrida).
    Retorna None si el documento no tiene parte de numeracion: el llamador
    aplica su fallback legacy (comportamiento anterior, sin promesas nuevas).
    """
    spec = _LIST_KIND_SPEC[kind]
    numbering = _numbering_element(paragraph)
    if numbering is None:
        return None

    cache = getattr(paragraph.part, "_apa7_list_cache", None)
    if cache and kind in cache:
        return cache[kind]

    qn_abs, qn_num = qn("w:abstractNumId"), qn("w:numId")
    abs_ids = [int(a.get(qn("w:abstractNumId"))) for a in numbering.findall(qn("w:abstractNum"))]
    num_ids = [int(n.get(qn("w:numId"))) for n in numbering.findall(qn("w:num"))]
    new_abs = (max(abs_ids) + 1) if abs_ids else 0
    new_num = (max(num_ids) + 1) if num_ids else 1
    # evitar colisión si max ya ocupado por coincidencia (defensivo)
    while new_num in num_ids:
        new_num += 1

    abstract = OxmlElement("w:abstractNum")
    abstract.set(qn("w:abstractNumId"), str(new_abs))
    mlt = OxmlElement("w:multiLevelType"); mlt.set(qn("w:val"), "singleLevel")
    lvl = OxmlElement("w:lvl"); lvl.set(qn("w:ilvl"), "0")
    start = OxmlElement("w:start"); start.set(qn("w:val"), "1")
    numfmt = OxmlElement("w:numFmt"); numfmt.set(qn("w:val"), spec["fmt"])
    lvltext = OxmlElement("w:lvlText"); lvltext.set(qn("w:val"), spec["lvl_text"])
    lvljc = OxmlElement("w:lvlJc"); lvljc.set(qn("w:val"), "left")
    ppr = OxmlElement("w:pPr")
    ind = OxmlElement("w:ind")
    ind.set(qn("w:left"), "720"); ind.set(qn("w:hanging"), "360")
    ppr.append(ind)
    for child in (start, numfmt, lvltext, lvljc, ppr):
        lvl.append(child)
    if spec["font"]:
        rpr = OxmlElement("w:rPr")
        rfonts = OxmlElement("w:rFonts")
        rfonts.set(qn("w:ascii"), spec["font"]); rfonts.set(qn("w:hAnsi"), spec["font"])
        rfonts.set(qn("w:hint"), "default")
        rpr.append(rfonts); lvl.append(rpr)
    abstract.append(mlt); abstract.append(lvl)

    num = OxmlElement("w:num")
    num.set(qn("w:numId"), str(new_num))
    aid = OxmlElement("w:abstractNumId"); aid.set(qn("w:val"), str(new_abs))
    num.append(aid)

    # Orden de schema CT_Numbering: todos los abstractNum ANTES de los num.
    first_num = numbering.find(qn("w:num"))
    if first_num is not None:
        first_num.addprevious(abstract)
    else:
        numbering.append(abstract)
    numbering.append(num)

    if cache is None:
        cache = {}
    cache[kind] = new_num
    paragraph.part._apa7_list_cache = cache
    return new_num


def install_numbering_part(document, defs: list[dict]):
    """Reemplaza word/numbering.xml del documento por definiciones minimas.

    Uso principal: fixtures de tests. `defs` items:
      {abstract_num_id, num_id, fmt, lvl_text}
    Retorna un NUEVO Document recargado desde los bytes inyectados.
    """
    import io
    import zipfile

    ns_w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    parts_xml = []
    for dspec in defs:
        parts_xml.append(
            f'<w:abstractNum w:abstractNumId="{dspec["abstract_num_id"]}">'
            '<w:multiLevelType w:val="singleLevel"/>'
            f'<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="{dspec["fmt"]}"/>'
            f'<w:lvlText w:val="{dspec["lvl_text"]}"/><w:lvlJc w:val="left"/></w:lvl>'
            "</w:abstractNum>"
        )
    nums_xml = "".join(
        f'<w:num w:numId="{d["num_id"]}"><w:abstractNumId w:val="{d["abstract_num_id"]}"/></w:num>'
        for d in defs
    )
    numbering = (
        f'<w:numbering xmlns:w="{ns_w}">{"".join(parts_xml)}{nums_xml}</w:numbering>'
    )
    buf = io.BytesIO()
    document.save(buf)
    out = io.BytesIO()
    with zipfile.ZipFile(buf) as zin, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.namelist():
            data = zin.read(item)
            if item == "word/numbering.xml":
                data = numbering.encode()
            zout.writestr(item, data)
    from docx import Document as _Doc
    out.seek(0)
    return _Doc(out)


def clean_bullet_prefix(text: str) -> str:
    """
    Remueve prefijos de viñeta o número existentes en el texto del usuario.
    """
    cleaned = re.sub(
        r'^(?:[•●▪◦○▸►→·\-–—\*]|\(?\d+[\.\)]|\(?[a-zA-Z][\.\)])\s*',
        '',
        text.strip(),
    )
    return cleaned


def _get_indent_for_level(level: int) -> tuple[float, float]:
    """Obtiene la indentación APA para un nivel de lista (1-3)."""
    clamped: int = min(max(level, 1), 3)
    return APA_LIST_INDENT.get(clamped, (0.5, -0.25))


def apply_bullet_from_template(
    paragraph_el,
    num_id: int = 1,
    level: int = 0,
) -> None:
    """
    Inyecta w:numPr nativo en el elemento XML del párrafo (w:p).
    """
    pPr = paragraph_el.find(qn('w:pPr'))
    if pPr is None:
        pPr = OxmlElement('w:pPr')
        paragraph_el.insert(0, pPr)

    existing_numPr = pPr.find(qn('w:numPr'))
    if existing_numPr is not None:
        pPr.remove(existing_numPr)

    numPr = OxmlElement('w:numPr')

    ilvl = OxmlElement('w:ilvl')
    ilvl.set(qn('w:val'), str(max(0, level - 1)))
    numPr.append(ilvl)

    numId_el = OxmlElement('w:numId')
    numId_el.set(qn('w:val'), str(num_id))
    numPr.append(numId_el)

    pPr.append(numPr)


def format_bullet_item(
    p,
    text: str,
    level: int = 1,
    rules: Optional[APARuleSet] = None,
    bullet_style: Optional[BulletStyle] = None,
    is_bold: bool = False,
    is_italic: bool = False,
) -> None:
    """
    Formatea un elemento de lista con viñeta usando OOXML nativo.
    """
    if rules is None:
        rules = APARuleSet()

    cleaned_text: str = clean_bullet_prefix(text)
    left_indent, first_line = _get_indent_for_level(level)

    # FASE 1.1: numId dedicado libre (evita secuestrar la lista numId=1 del usuario)
    allocated = get_or_create_list_num_id(p, "bullet")
    apply_bullet_from_template(p._element, num_id=allocated if allocated is not None else 1, level=level)

    p.text = ""
    # ponytail: clear inherited style to prevent double indentation
    try:
        p.style = None
    except Exception:
        pass
    p.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.left_indent = Inches(left_indent)
    p.paragraph_format.first_line_indent = Inches(first_line)
    p.paragraph_format.line_spacing = rules.line_spacing
    p.paragraph_format.space_before = Pt(rules.space_before_pt)
    p.paragraph_format.space_after = Pt(rules.space_after_pt)

    r_text = p.add_run(cleaned_text)
    set_run_font(r_text, rules.font_family, rules.font_size_pt)
    r_text.bold = is_bold
    r_text.italic = is_italic
    r_text.font.color.rgb = RGBColor(0, 0, 0)

    # Igualar las propiedades de la marca de párrafo (¶) a la fuente APA para
    # que las viñetas no arrastren la fuente/propiedades del estilo original.
    pPr = p._element.find(qn('w:pPr'))
    if pPr is not None:
        p_rPr = pPr.find(qn('w:rPr'))
        if p_rPr is None:
            p_rPr = OxmlElement('w:rPr')
            pPr.append(p_rPr)
        for old in p_rPr.findall(qn('w:rFonts')):
            p_rPr.remove(old)
        rFonts = OxmlElement('w:rFonts')
        for attr in ('w:ascii', 'w:hAnsi', 'w:eastAsia', 'w:cs'):
            rFonts.set(qn(attr), rules.font_family)
        p_rPr.append(rFonts)


def format_numbered_item(
    p,
    text: str,
    level: int = 1,
    index: int = 1,
    rules: Optional[APARuleSet] = None,
    num_style: Optional[NumberStyle] = None,
    is_bold: bool = False,
    is_italic: bool = False,
) -> None:
    """
    Formatea un elemento de lista numerada usando OOXML nativo.
    """
    if rules is None:
        rules = APARuleSet()

    cleaned_text: str = clean_bullet_prefix(text)
    left_indent, first_line = _get_indent_for_level(level)

    # FASE 1.1: numId dedicado libre (no reinicia/continua la lista numerada del usuario)
    allocated = get_or_create_list_num_id(p, "number")
    apply_bullet_from_template(p._element, num_id=allocated if allocated is not None else 2, level=level)

    p.text = ""
    # ponytail: clear inherited style to prevent double indentation
    try:
        p.style = None
    except Exception:
        pass
    p.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.left_indent = Inches(left_indent)
    p.paragraph_format.first_line_indent = Inches(first_line)
    p.paragraph_format.line_spacing = rules.line_spacing
    p.paragraph_format.space_before = Pt(rules.space_before_pt)
    p.paragraph_format.space_after = Pt(rules.space_after_pt)

    r_text = p.add_run(cleaned_text)
    set_run_font(r_text, rules.font_family, rules.font_size_pt)
    r_text.bold = is_bold
    r_text.italic = is_italic
    r_text.font.color.rgb = RGBColor(0, 0, 0)

    # Marca de párrafo con la fuente APA (mismo criterio que las viñetas)
    pPr = p._element.find(qn('w:pPr'))
    if pPr is not None:
        p_rPr = pPr.find(qn('w:rPr'))
        if p_rPr is None:
            p_rPr = OxmlElement('w:rPr')
            pPr.append(p_rPr)
        for old in p_rPr.findall(qn('w:rFonts')):
            p_rPr.remove(old)
        rFonts = OxmlElement('w:rFonts')
        for attr in ('w:ascii', 'w:hAnsi', 'w:eastAsia', 'w:cs'):
            rFonts.set(qn(attr), rules.font_family)
        p_rPr.append(rFonts)
