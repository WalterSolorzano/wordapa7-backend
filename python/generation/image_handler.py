"""
WordAPA7 — Manejador de Imagenes y Figuras APA 7 (Version Configurable)

Inserta y formatea figuras de acuerdo con el estandar APA 7:
1. "Figura X" en negrita (arriba o abajo segun caption_position).
2. Titulo de la figura en cursiva.
3. Imagen con alineacion configurable (centrada por defecto).
4. Nota de la figura opcional abajo.

SOPORTA ESTILOS DE DISENO:
- standard:   Figura centrada, caption debajo (APA estandar)
- sidebar:    Cuadro lateral derecho con borde, texto alrededor
- scientific: Borde negro fino estilo revista, "Figura X." arriba
- corner:     Esquina superior derecha, texto fluye alrededor
- full_width: Ancho completo de pagina, caption centrado
"""

import os
from copy import deepcopy

import docx
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Inches, Pt
from models import APARuleSet, ImageModel


def _apply_image_rotation(run_element, rotation: int) -> None:
    """
    Aplica rotacion (en grados, multiplos de 90) a la imagen inline del run.
    Escribe a:xfrm/a:rot (en 60000ths de grado) dentro del drawing.
    """
    try:
        drawing = run_element.find(qn('w:drawing'))
        if drawing is None:
            return
        inline = drawing.find(qn('wp:inline'))
        if inline is None:
            anchor = drawing.find(qn('wp:anchor'))
            if anchor is not None:
                inline = anchor
        if inline is None:
            return
        # El a:xfrm con rot esta en wp:extent -> a:graphic -> a:graphicData -> pic:pic -> pic:spPr -> a:xfrm
        extent = inline.find(qn('wp:extent'))
        if extent is None:
            return
        graphic = inline.find(qn('a:graphic'))
        if graphic is None:
            return
        graphicData = graphic.find(qn('a:graphicData'))
        if graphicData is None:
            return
        pic = graphicData.find(qn('pic:pic'))
        if pic is None:
            return
        spPr = pic.find(qn('pic:spPr'))
        if spPr is None:
            return
        xfrm = spPr.find(qn('a:xfrm'))
        if xfrm is None:
            xfrm = OxmlElement('a:xfrm')
            spPr.insert(0, xfrm)
        rot = xfrm.find(qn('a:rot'))
        if rot is None:
            rot = OxmlElement('a:rot')
            xfrm.append(rot)
        rot.set(qn('val'), str(int(rotation * 60000)))
        # Si rotamos 90/270, intercambiamos cx/cy para mantener proporciones
        if rotation % 180 != 0:
            cx = extent.get('cx')
            cy = extent.get('cy')
            if cx and cy:
                extent.set('cx', cy)
                extent.set('cy', cx)
    except Exception:
        pass


def _get_alignment(align_str: str):
    """Convierte string de alineacion a constante WD_ALIGN_PARAGRAPH."""
    mapping = {
        "left": WD_ALIGN_PARAGRAPH.LEFT,
        "center": WD_ALIGN_PARAGRAPH.CENTER,
        "right": WD_ALIGN_PARAGRAPH.RIGHT,
        "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
    }
    return mapping.get(align_str, WD_ALIGN_PARAGRAPH.CENTER)


def _add_paragraph_border(p_element, size_pt: int = 1, color: str = "000000"):
    """Agrega borde negro alrededor de un elemento de parrafo."""
    pPr = p_element.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    for side in ('top', 'left', 'bottom', 'right'):
        b = OxmlElement(f'w:{side}')
        b.set(qn('w:val'), 'single')
        b.set(qn('w:sz'), str(size_pt * 8))  # size_pt * 8 = eighths of a point
        b.set(qn('w:space'), '4')
        b.set(qn('w:color'), color)
        pBdr.append(b)
    pPr.append(pBdr)


def _convert_inline_to_anchor(drawing_elem, width_emu: int, height_emu: int,
                              align_h: str = "right", wrap: str = "square"):
    """
    Convierte un elemento drawing con wp:inline a wp:anchor para imagen flotante.

    Args:
        drawing_elem: Elemento w:drawing
        width_emu: Ancho en EMU
        height_emu: Alto en EMU
        align_h: "left" | "right" | "center"
        wrap: "square" | "tight" | "topAndBottom"
    """
    from docx.oxml import OxmlElement

    # Extraer el wp:inline
    inline = drawing_elem.find(qn('wp:inline'))
    if inline is None:
        return  # Ya es anchor o no es manipulable

    # Posicion horizontal
    pos_h_map = {
        "left": "left",
        "center": "center",
        "right": "right",
    }
    align = pos_h_map.get(align_h, "right")

    # Crear wp:anchor
    anchor_xml = (
        f'<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="2" '
        f'behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1" '
        f'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
        f'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        f'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<wp:simplePos x="0" y="0"/>'
        f'<wp:positionH relativeFrom="column">'
        f'<wp:align>{align}</wp:align>'
        f'</wp:positionH>'
        f'<wp:positionV relativeFrom="paragraph">'
        f'<wp:posOffset>0</wp:posOffset>'
        f'</wp:positionV>'
        f'<wp:extent cx="{width_emu}" cy="{height_emu}"/>'
        f'<wp:wrapNone/>'
        f'<wp:docPr id="1" name="Floating"/>'
        f'</wp:anchor>'
    )

    anchor = parse_xml(anchor_xml)

    # Elegir wrap segun estilo
    wrap_elem = anchor.find(qn('wp:wrapNone'))
    if wrap == "square":
        sq = OxmlElement('wp:wrapSquare')
        sq.set('wrapText', 'both')
        sq.set('distL', '114300')  # ~0.1 inch
        sq.set('distR', '114300')
        sq.set('distT', '0')
        sq.set('distB', '0')
        anchor.replace(wrap_elem, sq)
    elif wrap == "tight":
        ti = OxmlElement('wp:wrapTight')
        ti.set('wrapText', 'both')
        ti.set('distL', '114300')
        ti.set('distR', '114300')
        anchor.replace(wrap_elem, ti)
    elif wrap == "topAndBottom":
        tb = OxmlElement('wp:wrapTopAndBottom')
        tb.set('distT', '0')
        tb.set('distB', '0')
        anchor.replace(wrap_elem, tb)

    # Mover contenido de inline al anchor
    for child in list(inline):
        anchor.append(deepcopy(child))

    # Reemplazar inline con anchor en el drawing
    drawing_elem.replace(inline, anchor)


def _usable_height_emu(doc) -> int | None:
    """Alto utilizable de la página (page_height − top − bottom) en EMU, o None."""
    try:
        section = doc.sections[0] if (doc is not None and doc.sections) else None
        if section is None:
            return None
        ph = section.page_height
        tm = section.top_margin
        bm = section.bottom_margin
        if ph is None or tm is None or bm is None:
            return None
        usable = int(ph) - int(tm) - int(bm)
        return usable if usable > 0 else None
    except Exception:
        return None


def _clamp_picture_height_to_page(p_img, doc) -> None:
    """Escala proporcionalmente la imagen para que su altura no exceda el alto
    utilizable de la página (evita desbordamiento vertical)."""
    usable_emu = _usable_height_emu(doc)
    if not usable_emu:
        return
    for drawing in p_img._element.iter(qn('w:drawing')):
        extents = list(drawing.iter(qn('wp:extent')))
        if not extents:
            continue
        extent = extents[0]
        try:
            cx = int(extent.get('cx', '0') or '0')
            cy = int(extent.get('cy', '0') or '0')
        except (ValueError, TypeError):
            continue
        if cy <= 0 or cy <= usable_emu:
            continue
        scale = usable_emu / cy
        new_cy = usable_emu
        new_cx = max(1, int(cx * scale))
        for ext in extents:
            ext.set('cx', str(new_cx))
            ext.set('cy', str(new_cy))
        for a_ext in drawing.iter(qn('a:ext')):
            a_ext.set('cx', str(new_cx))
            a_ext.set('cy', str(new_cy))


def format_apa_figure(doc: docx.Document, img_data: ImageModel, rules: APARuleSet):
    """
    Inserta la imagen en el documento con estructura APA 7 configurable.

    Respeta:
    - img_data.design_style (standard|sidebar|scientific|corner|full_width)
    - img_data.alignment (left|center|right)
    - img_data.width_inches / width_cm
    - img_data.caption_position (above|below)
    - img_data.wrap_style
    """
    design = img_data.design_style or "standard"
    alignment = _get_alignment(img_data.alignment)

    # Ajustes segun estilo de diseno
    effective_width_cm = img_data.width_cm
    effective_alignment = img_data.alignment
    effective_wrap = img_data.wrap_style
    add_border = False

    if design == "full_width":
        usable_cm = None
        try:
            sec = doc.sections[0] if doc.sections else None
            if (sec is not None and sec.page_width is not None
                    and sec.left_margin is not None and sec.right_margin is not None):
                usable_cm = float((sec.page_width - sec.left_margin - sec.right_margin) / 360000)
        except Exception:
            usable_cm = None
        effective_width_cm = usable_cm if usable_cm else 16.0  # Ancho completo del area de texto APA
        effective_alignment = "center"
    elif design == "scientific":
        add_border = True
        if img_data.caption_position == "above" or img_data.caption_position != "below":
            pass  # Figura label arriba ya se maneja
    elif design == "sidebar":
        effective_alignment = "right"
        effective_wrap = "square"
    elif design == "corner":
        effective_alignment = "right"
        effective_wrap = "tight"

    # 1. Numero de Figura + Titulo
    if img_data.caption_position == "above" or img_data.caption_position != "below":
        _add_figure_label_and_caption(doc, img_data, rules)

    # 1.5 Si es diseño multipanel con subfiguras, maquetar en cuadrícula de columnas
    if design == "multipanel" and getattr(img_data, "subfigures", None) and len(img_data.subfigures) > 0:
        subs = img_data.subfigures
        num_cols = len(subs)
        tbl_multi = doc.add_table(rows=2, cols=num_cols)
        tbl_multi.autofit = False
        tblPr = tbl_multi._tbl.tblPr
        if tblPr is not None:
            borders_xml = parse_xml(
                f'<w:tblBorders {nsdecls("w")}>'
                f'  <w:top w:val="none"/>'
                f'  <w:bottom w:val="none"/>'
                f'  <w:left w:val="none"/>'
                f'  <w:right w:val="none"/>'
                f'  <w:insideH w:val="none"/>'
                f'  <w:insideV w:val="none"/>'
                f'</w:tblBorders>'
            )
            tblPr.append(borders_xml)

        col_w = Inches(6.0 / max(1, num_cols))
        for ci, sub in enumerate(subs):
            # Fila 0: Imagen
            cell_img = tbl_multi.cell(0, ci)
            cell_img.width = col_w
            p_img = cell_img.paragraphs[0]
            p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_img.paragraph_format.space_before = Pt(4)
            p_img.paragraph_format.space_after = Pt(4)
            p_img.paragraph_format.first_line_indent = Inches(0)
            sub_path = sub.file_path or (os.path.join(os.path.dirname(img_data.file_path), sub.filename) if (img_data.file_path and sub.filename) else "")
            if sub_path and os.path.exists(sub_path):
                r = p_img.add_run()
                r.add_picture(sub_path, width=Inches((6.0 / max(1, num_cols)) * 0.92))
            elif img_data.file_path and os.path.exists(img_data.file_path):
                r = p_img.add_run()
                r.add_picture(img_data.file_path, width=Inches((6.0 / max(1, num_cols)) * 0.92))

            # Fila 1: Sub-etiqueta tipo (a) Vista general
            cell_lbl = tbl_multi.cell(1, ci)
            cell_lbl.width = col_w
            p_lbl = cell_lbl.paragraphs[0]
            p_lbl.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_lbl.paragraph_format.space_before = Pt(2)
            p_lbl.paragraph_format.space_after = Pt(6)
            p_lbl.paragraph_format.first_line_indent = Inches(0)
            sub_lbl_run = p_lbl.add_run(f"{sub.label or f'({chr(97 + ci)})'} ")
            sub_lbl_run.bold = False
            sub_lbl_run.font.name = rules.font_family
            sub_lbl_run.font.size = Pt(rules.font_size_pt)
            if sub.title:
                sub_txt_run = p_lbl.add_run(sub.title)
                sub_txt_run.font.name = rules.font_family
                sub_txt_run.font.size = Pt(rules.font_size_pt)

        # 3. Titulo / caption ABAJO si se configuro asi
        if img_data.caption_position == "below":
            _add_figure_label_and_caption(doc, img_data, rules)

        # 4. Nota al pie común de figura
        if img_data.note and img_data.note.strip() not in {"author_card", "vertical_line", "shape_group", "shape_textbox"}:
            p_note = doc.add_paragraph()
            p_note.paragraph_format.space_before = Pt(4)
            p_note.paragraph_format.space_after = Pt(12)
            p_note.paragraph_format.first_line_indent = Inches(0)
            r_label = p_note.add_run("Nota. ")
            r_label.italic = True
            r_label.font.name = rules.font_family
            r_label.font.size = Pt(10)
            r_text = p_note.add_run(img_data.note)
            r_text.font.name = rules.font_family
            r_text.font.size = Pt(10)
        return

    # 2. Imagen individual estándar
    p_img = doc.add_paragraph()
    p_img.alignment = alignment
    p_img.paragraph_format.space_before = Pt(6)
    p_img.paragraph_format.space_after = Pt(6)
    p_img.paragraph_format.first_line_indent = Inches(0)
    p_img.paragraph_format.keep_together = True
    p_img.paragraph_format.widow_control = True

    if img_data.file_path and os.path.exists(img_data.file_path):
        run = p_img.add_run()
        run_element = run._element

        # Calcular ancho
        width = None
        if effective_width_cm and effective_width_cm > 0:
            width = Inches(effective_width_cm / 2.54)

        if width is not None:
            run.add_picture(img_data.file_path, width=width)
        else:
            run.add_picture(img_data.file_path)

        # Aplicar rotacion (0, 90, 180, 270) via a:xfrm/a:rot dentro del drawing
        rotation = int(getattr(img_data, "rotation", 0) or 0)
        if rotation:
            _apply_image_rotation(run_element, rotation)

        # D4: limitar la altura de la imagen al alto utilizable de la página.
        _clamp_picture_height_to_page(p_img, doc)

        # Texto alternativo (accesibilidad) — se escribe en el drawing y el docProps
        alt_text = (getattr(img_data, "alt_text", "") or "").strip()
        if alt_text:
            try:
                drawing = run_element.find(qn('w:drawing'))
                if drawing is not None:
                    wp_inline = drawing.find(qn('wp:inline'))
                    target = wp_inline if wp_inline is not None else drawing.find(qn('wp:anchor'))
                    if target is not None:
                        descr = OxmlElement('wp:docPr')
                        descr.set(qn('id'), '0')
                        descr.set(qn('name'), 'Imagen')
                        descr.set(qn('descr'), alt_text[:255])
                        target.insert(0, descr)
            except Exception:
                pass

        # Aplicar estilos de diseno avanzados (floating, borders)
        if design in ("sidebar", "corner"):
            # Convertir imagen inline a floating anchor
            drawing = run_element.find(qn('w:drawing'))
            if drawing is not None:
                # Extraer dimensiones EMU del inline
                inline = drawing.find(qn('wp:inline'))
                if inline is not None:
                    extent = inline.find(qn('wp:extent'))
                    if extent is not None:
                        cx = extent.get('cx', '0')
                        cy = extent.get('cy', '0')
                        wrap_map = {
                            "square": "square",
                            "tight": "tight",
                            "top_and_bottom": "topAndBottom",
                        }
                        _convert_inline_to_anchor(
                            drawing,
                            int(cx), int(cy),
                            align_h=effective_alignment,
                            wrap=wrap_map.get(effective_wrap, "square"),
                        )
        elif design == "scientific" and add_border:
            _add_paragraph_border(p_img._element, size_pt=1, color="000000")
    else:
        r_ph = p_img.add_run(f"[Imagen: {img_data.filename}]")
        r_ph.italic = True

    # 3. Titulo / caption ABAJO si se configuro asi
    if img_data.caption_position == "below":
        _add_figure_label_and_caption(doc, img_data, rules)

    # 4. Nota al pie de figura si existe
    internal_tokens = {"author_card", "vertical_line", "shape_group", "shape_textbox"}
    if img_data.note and img_data.note.strip() not in internal_tokens:
        p_note = doc.add_paragraph()
        p_note.paragraph_format.space_before = Pt(4)
        p_note.paragraph_format.space_after = Pt(12)
        p_note.paragraph_format.first_line_indent = Inches(0)

        # Para estilo scientific, la nota tambien va con borde
        if design == "scientific":
            _add_paragraph_border(p_note._element, size_pt=1, color="000000")

        r_label = p_note.add_run("Nota. ")
        r_label.italic = True
        r_label.font.name = rules.font_family
        r_label.font.size = Pt(10)

        r_text = p_note.add_run(img_data.note)
        r_text.font.name = rules.font_family
        r_text.font.size = Pt(10)


def _add_figure_label_and_caption(doc: docx.Document, img_data: ImageModel, rules: APARuleSet):
    """Anade el numero de figura y caption como parrafo independiente."""
    p_num = doc.add_paragraph()
    p_num.paragraph_format.space_before = Pt(12)
    p_num.paragraph_format.space_after = Pt(0)
    p_num.paragraph_format.line_spacing = rules.line_spacing
    p_num.paragraph_format.first_line_indent = Inches(0)

    r_num = p_num.add_run(f"Figura {img_data.figure_number}")
    r_num.bold = True
    r_num.font.name = rules.font_family
    r_num.font.size = Pt(rules.font_size_pt)
    p_num.paragraph_format.keep_with_next = True

    # Titulo de la Figura en Cursiva
    if img_data.caption:
        p_cap = doc.add_paragraph()
        p_cap.paragraph_format.space_before = Pt(0)
        p_cap.paragraph_format.space_after = Pt(6)
        p_cap.paragraph_format.line_spacing = rules.line_spacing
        p_cap.paragraph_format.first_line_indent = Inches(0)
        p_cap.paragraph_format.keep_with_next = True

        r_cap = p_cap.add_run(img_data.caption)
        r_cap.italic = True
        r_cap.font.name = rules.font_family
        r_cap.font.size = Pt(rules.font_size_pt)


def add_apa_equipment_card(
    doc: docx.Document,
    fig_num: int,
    fig_title: str,
    img_path: str,
    specs_dict: dict[str, str],
    rules: APARuleSet | None = None,
) -> None:
    """
    F-04: Maqueta evidencias de equipos con estética académica y máxima nitidez:
    construye una tabla de 1 fila y 2 columnas sin bordes externos:
    - Columna 1: Foto real del equipo con etiqueta y título APA 7 (Figura N).
    - Columna 2: Ficha técnica estructurada en texto nativo editable (Times New Roman 8.5 pt)
      con especificaciones (fabricante, modelo, potencia, tensión, régimen de uso, etc.).
    """
    font_name = rules.font_family if rules else "Times New Roman"

    # Etiqueta APA 7
    p_num = doc.add_paragraph()
    p_num.paragraph_format.space_before = Pt(12)
    p_num.paragraph_format.space_after = Pt(0)
    p_num.paragraph_format.keep_with_next = True
    p_num.paragraph_format.first_line_indent = Inches(0)
    r_num = p_num.add_run(f"Figura {fig_num}")
    r_num.bold = True
    r_num.font.name = font_name
    r_num.font.size = Pt(rules.font_size_pt if rules else 12)

    p_cap = doc.add_paragraph()
    p_cap.paragraph_format.space_before = Pt(0)
    p_cap.paragraph_format.space_after = Pt(6)
    p_cap.paragraph_format.keep_with_next = True
    p_cap.paragraph_format.first_line_indent = Inches(0)
    r_cap = p_cap.add_run(fig_title)
    r_cap.italic = True
    r_cap.font.name = font_name
    r_cap.font.size = Pt(rules.font_size_pt if rules else 12)

    # Tabla principal de 1 fila, 2 columnas
    table = doc.add_table(rows=1, cols=2)
    table.autofit = False

    # Eliminar bordes de la tabla contenedor
    tblPr = table._tbl.tblPr
    if tblPr is not None:
        borders_xml = parse_xml(
            f'<w:tblBorders {nsdecls("w")}>'
            f'  <w:top w:val="none"/>'
            f'  <w:bottom w:val="none"/>'
            f'  <w:left w:val="none"/>'
            f'  <w:right w:val="none"/>'
            f'  <w:insideH w:val="none"/>'
            f'  <w:insideV w:val="none"/>'
            f'</w:tblBorders>'
        )
        tblPr.append(borders_xml)

    # Columna 1: Imagen (ancho ~7.5 cm / ~2.9 in)
    cell_img = table.cell(0, 0)
    cell_img.width = Inches(3.0)
    p_cell_img = cell_img.paragraphs[0]
    p_cell_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
    if img_path and os.path.exists(img_path):
        run_img = p_cell_img.add_run()
        run_img.add_picture(img_path, width=Inches(2.8))

    # Columna 2: Subtabla con especificaciones técnicas
    cell_specs = table.cell(0, 1)
    cell_specs.width = Inches(3.5)
    p_specs_header = cell_specs.paragraphs[0]
    p_specs_header.paragraph_format.space_before = Pt(0)
    p_specs_header.paragraph_format.space_after = Pt(4)
    r_sh = p_specs_header.add_run("Ficha Técnica del Equipo")
    r_sh.bold = True
    r_sh.font.name = font_name
    r_sh.font.size = Pt(9.5)

    if specs_dict:
        subtable = cell_specs.add_table(rows=len(specs_dict), cols=2)
        subtable.autofit = False
        # Bordes limpios de ficha APA
        sub_tblPr = subtable._tbl.tblPr
        if sub_tblPr is not None:
            sub_borders = parse_xml(
                f'<w:tblBorders {nsdecls("w")}>'
                f'  <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>'
                f'  <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>'
                f'  <w:left w:val="none"/>'
                f'  <w:right w:val="none"/>'
                f'  <w:insideH w:val="single" w:sz="4" w:space="0" w:color="D3D3D3"/>'
                f'  <w:insideV w:val="none"/>'
                f'</w:tblBorders>'
            )
            sub_tblPr.append(sub_borders)

        for row_i, (k, v) in enumerate(specs_dict.items()):
            row = subtable.rows[row_i]
            # cantSplit
            r_trPr = row._tr.get_or_add_trPr()
            if r_trPr.find(qn('w:cantSplit')) is None:
                r_trPr.append(OxmlElement('w:cantSplit'))

            c_key = row.cells[0]
            c_key.width = Inches(1.4)
            p_k = c_key.paragraphs[0]
            p_k.paragraph_format.space_before = Pt(1)
            p_k.paragraph_format.space_after = Pt(1)
            rk = p_k.add_run(str(k))
            rk.bold = True
            rk.font.name = font_name
            rk.font.size = Pt(8.5)

            c_val = row.cells[1]
            c_val.width = Inches(2.1)
            p_v = c_val.paragraphs[0]
            p_v.paragraph_format.space_before = Pt(1)
            p_v.paragraph_format.space_after = Pt(1)
            rv = p_v.add_run(str(v))
            rv.font.name = font_name
            rv.font.size = Pt(8.5)

    # Nota al pie de figura opcional
    p_foot = doc.add_paragraph()
    p_foot.paragraph_format.space_before = Pt(4)
    p_foot.paragraph_format.space_after = Pt(12)
    p_foot.paragraph_format.first_line_indent = Inches(0)
    r_nl = p_foot.add_run("Nota. ")
    r_nl.italic = True
    r_nl.font.name = font_name
    r_nl.font.size = Pt(10)
    r_nt = p_foot.add_run("Evidencia fotográfica y datos de placa obtenidos in situ.")
    r_nt.font.name = font_name
    r_nt.font.size = Pt(10)
