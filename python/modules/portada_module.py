"""
WordAPA7 — Módulo de Portada APA 7

Genera y formatea la página de portada en sus dos modalidades APA 7:
1. Estudiante: Título en negrita centrado en la mitad superior, autor, afiliación, curso, profesor, fecha.
2. Profesional: Incluye nota de autor (Author Note) y Running Head.
"""

import docx
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.shared import Inches, Pt, RGBColor
from docx.text.paragraph import Paragraph
from models import APAFormat, APARuleSet, DocumentMeta, PortadaData


class _CoverBuilder:
    """Construye la portada INSERTÁNDOLA al inicio del cuerpo del documento
    (posición 0) en vez de al final — evita títulos desordenados y portada
    colgando al final del archivo generado."""

    def __init__(self, doc: docx.Document):
        self.doc = doc
        self._body = doc.element.body
        self._idx = 0

    def add_paragraph(self) -> Paragraph:
        p_elem = OxmlElement('w:p')
        self._body.insert(self._idx, p_elem)
        self._idx += 1
        return Paragraph(p_elem, self.doc)

    def add_page_break(self) -> None:
        p_elem = OxmlElement('w:p')
        r_elem = OxmlElement('w:r')
        br_elem = OxmlElement('w:br')
        br_elem.set(docx.oxml.ns.qn('w:type'), 'page')
        r_elem.append(br_elem)
        p_elem.append(r_elem)
        self._body.insert(self._idx, p_elem)
        self._idx += 1

    @property
    def paragraph_count(self) -> int:
        return self._idx


def _hay_acta(meta: DocumentMeta | None) -> bool:
    if meta is None:
        return False
    return bool(
        (meta.autor or "").strip()
        or [n for n in (meta.profesor_asesor or []) if str(n).strip()]
        or [n for n in (meta.comite or []) if str(n).strip()]
        or (meta.fecha_defensa or "").strip()
    )


def format_acta_documento(
    doc: docx.Document,
    meta: DocumentMeta | None,
    rules: APARuleSet,
    indice_insercion: int = 0,
) -> int:
    """Escribe los datos del acta como un bloque propio, FUERA de la portada.

    Esta función es la razón de que los datos del acta vivan en
    `DocumentMeta`: corre en los DOS modos. Con la portada original
    conservada se escribe al final del bloque protegido, y no dentro de él — la
    promesa de `AGENTS.md` es que del bloque de portada no se toca ni un
    carácter, y un autor escrito dentro de la portada es exactamente eso.

    `indice_insercion` es dónde cae el primer párrafo. El generador pasa la
    longitud del bloque de portada, así que el acta va detrás; en el editor
    in-place va en el mismo lugar. Nunca 0 con la portada original: en 0 el
    acta se comería la primera línea de la portada.

    Devuelve cuántos párrafos escribió, para que el llamador corra el índice si
    necesita escribir algo más después.
    """
    if not _hay_acta(meta):
        return 0

    assert meta is not None  # `_hay_acta` ya lo garantiza
    font_name = rules.font_family
    font_size = Pt(rules.font_size_pt)
    escribio = 0

    # Ancla: el párrafo del cuerpo donde empieza el texto. Se resuelve POR
    # ELEMENTO y no por índice, porque `body.insert(i)` cuenta también las
    # tablas y un índice de párrafo corrido escribiría el acta en el lugar
    # equivocado sin avisar. Si el cuerpo no tiene ese párrafo, el acta va al
    # final, antes del `sectPr` de cierre.
    if 0 <= indice_insercion < len(doc.paragraphs):
        ancla = doc.paragraphs[indice_insercion]._element
    else:
        ancla = doc.element.body.find(docx.oxml.ns.qn("w:sectPr"))

    def _parrafo(texto: str, *, negrita: bool = False, sangria: bool = False):
        nonlocal escribio
        p_elem = OxmlElement('w:p')
        if ancla is not None:
            ancla.addprevious(p_elem)
        else:
            doc.element.body.append(p_elem)
        escribio += 1
        p = Paragraph(p_elem, doc)
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.line_spacing = rules.line_spacing
        p.paragraph_format.first_line_indent = Inches(0.5 if sangria else 0)
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(texto)
        r.bold = negrita
        r.font.name = font_name
        r.font.size = font_size
        r.font.color.rgb = RGBColor(0, 0, 0)
        return p

    # Separación: el acta es un bloque y no una línea más del párrafo anterior.
    if indice_insercion > 0:
        _parrafo("")

    if (meta.autor or "").strip():
        _parrafo(meta.autor.strip(), sangria=True)

    asesores = [str(n).strip() for n in (meta.profesor_asesor or []) if str(n).strip()]
    for asesor in asesores:
        _parrafo(f"Profesor asesor: {asesor}", sangria=True)

    comite = [str(n).strip() for n in (meta.comite or []) if str(n).strip()]
    if comite:
        _parrafo(f"Comité: {', '.join(comite)}", sangria=True)
        for persona in comite:
            _parrafo(persona, sangria=True)

    if (meta.fecha_defensa or "").strip():
        _parrafo(f"Fecha de defensa: {meta.fecha_defensa.strip()}", sangria=True)

    _parrafo("")
    return escribio



def format_apa_portada(
    doc: docx.Document,
    portada: PortadaData,
    rules: APARuleSet,
    original_textbox_texts: list[str] | None = None,
    acta: DocumentMeta | None = None,
):
    """
    Inserta la portada APA 7 formateada al inicio del documento.

    Si se proporciona original_textbox_texts, estos se insertan como parrafos
    centrados preservados ANTES de la portada generada, para no perder
    contenido original de cuadros de texto, WordArt, logos, etc.

    `acta` son los metadatos del documento (autor, profesor asesor, comité). NO
    viven en `portada` desde que se movieron: con `use_original_cover` el
    bloque de portada no se toca, así que un autor guardado ahí no tenía de
    dónde salir.
    """
    font_name = rules.font_family
    font_size = Pt(rules.font_size_pt)
    autor = (acta.autor or "").strip() if acta else ""
    profesores = (
        [str(n).strip() for n in (acta.profesor_asesor or []) if str(n).strip()]
        if acta
        else []
    )

    builder = _CoverBuilder(doc)

    # Contenido original de cuadros de texto (preservado antes de la portada)
    if original_textbox_texts:
        for tb_text in original_textbox_texts:
            if not tb_text or not tb_text.strip():
                continue
            p_tb = builder.add_paragraph()
            p_tb.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_tb.paragraph_format.line_spacing = rules.line_spacing
            p_tb.paragraph_format.first_line_indent = Inches(0)
            p_tb.paragraph_format.space_before = Pt(0)
            p_tb.paragraph_format.space_after = Pt(6)
            r_tb = p_tb.add_run(tb_text.strip())
            r_tb.font.name = font_name
            r_tb.font.size = font_size
            r_tb.font.color.rgb = RGBColor(0, 0, 0)

        # Pequeña separacion antes de la portada generada
        p_sep = builder.add_paragraph()
        p_sep.paragraph_format.space_before = Pt(12)
        p_sep.paragraph_format.space_after = Pt(6)

    # 3 o 4 líneas en blanco iniciales
    for _ in range(3):
        p_blank = builder.add_paragraph()
        p_blank.paragraph_format.line_spacing = rules.line_spacing
        p_blank.paragraph_format.space_before = Pt(0)
        p_blank.paragraph_format.space_after = Pt(0)

    # Título en Negrita, Centrado
    p_title = builder.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_title.paragraph_format.line_spacing = rules.line_spacing
    p_title.paragraph_format.first_line_indent = Inches(0)
    p_title.paragraph_format.space_before = Pt(0)
    p_title.paragraph_format.space_after = Pt(0)

    r_title = p_title.add_run(portada.title or "Título del Trabajo")
    r_title.bold = True
    r_title.font.name = font_name
    r_title.font.size = font_size
    r_title.font.color.rgb = RGBColor(0, 0, 0)

    # 1 o 2 líneas en blanco de separación
    p_sep = builder.add_paragraph()
    p_sep.paragraph_format.line_spacing = rules.line_spacing

    # Datos del Autor y Afiliación
    lines = []
    if autor:
        from modules.portada_normalize import normalize_author_lines
        for _ln in normalize_author_lines(autor).split('\n'):
            _ln = _ln.strip()
            if _ln:
                lines.append(_ln)
    if portada.institution:
        lines.append(portada.institution)

    if portada.apa_format == APAFormat.STUDENT:
        if portada.course:
            lines.append(portada.course)
        for profesor in profesores:
            lines.append(profesor)
        if portada.date:
            lines.append(portada.date)

    for line in lines:
        p_line = builder.add_paragraph()
        p_line.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_line.paragraph_format.line_spacing = rules.line_spacing
        p_line.paragraph_format.first_line_indent = Inches(0)
        p_line.paragraph_format.space_before = Pt(0)
        p_line.paragraph_format.space_after = Pt(0)

        r = p_line.add_run(line)
        r.font.name = font_name
        r.font.size = font_size
        r.font.color.rgb = RGBColor(0, 0, 0)

    # Nota de Autor para portada profesional al pie
    if portada.apa_format == APAFormat.PROFESSIONAL and portada.author_note:
        p_an_hdr = builder.add_paragraph()
        p_an_hdr.paragraph_format.space_before = Pt(36)
        p_an_hdr.paragraph_format.space_after = Pt(6)
        p_an_hdr.alignment = WD_ALIGN_PARAGRAPH.CENTER

        r_an_hdr = p_an_hdr.add_run("Nota del Autor")
        r_an_hdr.bold = True
        r_an_hdr.font.name = font_name
        r_an_hdr.font.size = font_size

        p_an = builder.add_paragraph()
        p_an.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p_an.paragraph_format.line_spacing = rules.line_spacing
        p_an.paragraph_format.first_line_indent = Inches(0.5)

        r_an = p_an.add_run(portada.author_note)
        r_an.font.name = font_name
        r_an.font.size = font_size

    # Salto de página al finalizar la portada
    builder.add_page_break()

    return builder.paragraph_count
