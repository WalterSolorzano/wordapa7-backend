"""
WordAPA7 — Generador de plantillas APA 7 base (.docx)

Genera el archivo `apa7_template.docx` utilizado como punto de partida
para exportar o aplicar estilos APA 7.
"""

from pathlib import Path

import docx
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt, RGBColor


def create_apa7_template(output_path: Path | str = "apa7_template.docx") -> Path:
    target_path = Path(output_path)

    doc = docx.Document()

    # Configurar márgenes de 1 pulgada (2.54 cm)
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)

    styles = doc.styles

    # Estilo Normal (Párrafos)
    style_normal = styles['Normal']
    font_normal = style_normal.font
    font_normal.name = 'Times New Roman'
    font_normal.size = Pt(12)
    font_normal.color.rgb = RGBColor(0, 0, 0)
    pf_normal = style_normal.paragraph_format
    pf_normal.line_spacing = 2.0
    pf_normal.first_line_indent = Inches(0.5)
    pf_normal.space_after = Pt(0)
    pf_normal.space_before = Pt(0)
    pf_normal.alignment = WD_ALIGN_PARAGRAPH.LEFT

    # Estilos de Títulos (Heading 1 a 5)
    headings_config = [
        ("Heading 1", WD_ALIGN_PARAGRAPH.CENTER, True, False, Inches(0)),
        ("Heading 2", WD_ALIGN_PARAGRAPH.LEFT, True, False, Inches(0)),
        ("Heading 3", WD_ALIGN_PARAGRAPH.LEFT, True, True, Inches(0)),
        ("Heading 4", WD_ALIGN_PARAGRAPH.LEFT, True, False, Inches(0.5)),
        ("Heading 5", WD_ALIGN_PARAGRAPH.LEFT, True, True, Inches(0.5)),
    ]

    for name, align, bold, italic, indent in headings_config:
        try:
            h_style = styles[name]
        except KeyError:
            h_style = styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)

        h_style.base_style = styles['Normal']
        font = h_style.font
        font.name = 'Times New Roman'
        font.size = Pt(12)
        font.bold = bold
        font.italic = italic
        font.color.rgb = RGBColor(0, 0, 0)

        pf = h_style.paragraph_format
        pf.alignment = align
        pf.first_line_indent = indent
        pf.line_spacing = 2.0
        pf.space_before = Pt(0)
        pf.space_after = Pt(0)

    target_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(target_path))
    return target_path


if __name__ == "__main__":
    path = create_apa7_template()
    print(f"Plantilla APA 7 creada en: {path.resolve()}")
