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
    2: (1.0, -0.25),    # Nivel 2: cuerpo 2.54cm (1.0 in)
    3: (1.5, -0.25),    # Nivel 3: cuerpo 3.81cm (1.5 in)
}


def clean_bullet_prefix(text: str) -> str:
    """
    Remueve prefijos de viñeta o número existentes en el texto del usuario.
    """
    cleaned = re.sub(
        r'^(?:[•○▪–\-\*]|\(?\d+[\.\)]|\(?[a-zA-Z][\.\)])\s*',
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

    # Inyectar estructura OOXML nativa de viñeta
    apply_bullet_from_template(p._element, num_id=1, level=level)

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

    # Inyectar estructura OOXML nativa de lista numerada (numId=2)
    apply_bullet_from_template(p._element, num_id=2, level=level)

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
