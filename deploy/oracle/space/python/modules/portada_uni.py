"""
WordAPA7 — Módulo de Recreación de Portada UNI (Nicaragua)

Replica la portada institucional de la Universidad Nacional de Ingeniería
tal como aparece en los trabajos reales de los estudiantes:

- Logo UNI (imagen que ya incluye el nombre de la universidad), centrado arriba
- Área de Conocimiento (fuente Butler, 20pt) — se sustituye por Times si no está instalada
- Título del trabajo (Montserrat Black, 20pt)
- Asignatura (Butler, 20pt)
- "Elaborado por" (Montserrat Bold, 11pt)
- Autores en 4 columnas (3 de estudiantes + 1 de docente) con separadores
  verticales negros, Montserrat 10pt
- Fecha (izquierda) y lugar (Managua, Nicaragua)
- Salto de página al final

La portada se INSERTA al inicio del documento (posición 0).
"""

import sys
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from docx.text.paragraph import Paragraph


def _resolve_logo_path() -> Path:
    meipass = getattr(sys, '_MEIPASS', None)
    candidates = []
    if meipass:
        candidates.append(Path(meipass) / "assets" / "logo_uni.png")  # PyInstaller frozen
    candidates.append(Path(__file__).parent.parent / "assets" / "logo_uni.png")  # desarrollo
    for cand in candidates:
        if cand.exists():
            return cand
    return candidates[0]


LOGO_PATH: Path = _resolve_logo_path()

# Tipografía institucional (idéntica a la de los trabajos UNI reales)
FONT_DEPARTMENT = "Times New Roman"  # Área de Conocimiento / asignatura (20pt, serif)
FONT_TITLE = "Montserrat Black"      # Título del trabajo
FONT_BODY = "Montserrat"             # Autores, fecha, lugar
BLACK = RGBColor(0x00, 0x00, 0x00)


def _add_run_styled(paragraph, text: str, bold=False, size_pt=12,
                    font: str = FONT_BODY, color: RGBColor = BLACK):
    """Agrega un run con estilo específico a un párrafo."""
    run = paragraph.add_run(text)
    run.bold = bold
    run.font.name = font
    run.font.size = Pt(size_pt)
    run.font.color.rgb = color
    # Fijar también la fuente en el atributo eastAsia para respetar el nombre exacto
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.append(rFonts)
    rFonts.set(qn('w:ascii'), font)
    rFonts.set(qn('w:hAnsi'), font)
    return run


def _set_paragraph_spacing(p, before=0, after=0, line_spacing=1.0):
    """Configura el espaciado de un párrafo."""
    pf = p.paragraph_format
    pf.space_before = Pt(before)
    pf.space_after = Pt(after)
    pf.line_spacing = line_spacing


class _UniCoverBuilder:
    """Construye la portada UNI INSERTÁNDOLA al inicio del documento (posición 0)."""

    def __init__(self, doc: Document):
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
        br_elem.set(qn('w:type'), 'page')
        r_elem.append(br_elem)
        p_elem.append(r_elem)
        self._body.insert(self._idx, p_elem)
        self._idx += 1

    def insert_table(self, table) -> None:
        """Inserta una tabla en la posición actual del builder."""
        self._body.insert(self._idx, table._element)
        self._idx += 1

    @property
    def paragraph_count(self) -> int:
        return self._idx


def _clear_cell_borders(cell, keep_right: bool = False):
    """Elimina todos los bordes de la celda; opcionalmente conserva el derecho."""
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcBorders = OxmlElement('w:tcBorders')
    for side in ['top', 'left', 'bottom', 'insideH', 'insideV']:
        border = OxmlElement(f'w:{side}')
        border.set(qn('w:val'), 'nil')
        tcBorders.append(border)
    if keep_right:
        right_border = OxmlElement('w:right')
        right_border.set(qn('w:val'), 'single')
        right_border.set(qn('w:sz'), '4')
        right_border.set(qn('w:color'), '000000')
        tcBorders.append(right_border)
    else:
        border = OxmlElement('w:right')
        border.set(qn('w:val'), 'nil')
        tcBorders.append(border)
    tcPr.append(tcBorders)


def _set_cell_width(cell, width_cm: float):
    """Fija el ancho de una celda de tabla en centímetros."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcW = tcPr.find(qn('w:tcW'))
    if tcW is None:
        tcW = OxmlElement('w:tcW')
        tcPr.append(tcW)
    tcW.set(qn('w:w'), str(int(width_cm * 567)))
    tcW.set(qn('w:type'), 'dxa')


def generate_uni_cover(
    doc: Document,
    titulo: str,
    asignatura: str,
    autores: list[dict],   # [{nombre, carnet}, ...]
    tutor: str,
    grupo: str,
    departamento: str = "Área de Conocimiento de Ingeniería y Afines",
    fecha: str = "",
    lugar: str = "Managua, Nicaragua",
) -> int:
    """
    Inserta al inicio del documento una portada institucional UNI fiel al
    formato de los trabajos reales:

        [Logo UNI centrado]
        Área de Conocimiento de Ingeniería y Afines        (Butler 20pt)
        Título del trabajo                                  (Montserrat Black 20pt)
        Asignatura                                          (Butler 20pt)

        Elaborado por                                       (Montserrat Bold 11pt)
        ──────────┬──────────┬──────────┬─────────────────
        │ Autor 1  │ Autor 3  │ Autor 5  │ Tutor           │
        │ Carnet   │ Carnet   │ Carnet   │ Grupo: XXX      │
        │ Autor 2  │ Autor 4  │          │                 │
        │ Carnet   │ Carnet   │          │                 │
        ──────────┴──────────┴──────────┴─────────────────

        25 de junio del año 2025
        Managua, Nicaragua

    Returns: Número de párrafos insertados (para cover_paragraph_count).
    """
    if not fecha:
        from datetime import date
        d = date.today()
        months = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
        fecha = f"{d.day} de {months[d.month-1]} del año {d.year}"

    builder = _UniCoverBuilder(doc)

    # ── 1. Logo UNI centrado (la imagen incluye el nombre de la universidad) ──
    logo_p = builder.add_paragraph()
    logo_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _set_paragraph_spacing(logo_p, before=0, after=6)
    if LOGO_PATH.exists():
        run_logo = logo_p.add_run()
        run_logo.add_picture(str(LOGO_PATH), width=Cm(5.2))

    # ── 2. Departamento (Butler 20pt, centrado) ──────────────────────────────
    dept_p = builder.add_paragraph()
    dept_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _add_run_styled(dept_p, departamento, bold=False, size_pt=20, font=FONT_DEPARTMENT)
    _set_paragraph_spacing(dept_p, before=6, after=30)

    # ── 3. Título (Montserrat Black 20pt, centrado) ──────────────────────────
    titulo_p = builder.add_paragraph()
    titulo_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _add_run_styled(titulo_p, titulo, bold=False, size_pt=20, font=FONT_TITLE)
    _set_paragraph_spacing(titulo_p, before=0, after=30)

    # ── 4. Asignatura (Butler 20pt, centrado) ────────────────────────────────
    if asignatura:
        asig_p = builder.add_paragraph()
        asig_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        _add_run_styled(asig_p, asignatura, bold=False, size_pt=20, font=FONT_DEPARTMENT)
        _set_paragraph_spacing(asig_p, before=0, after=60)

    # ── 5. "Elaborado por" (Montserrat Bold 11pt, izquierda) ─────────────────
    elab_p = builder.add_paragraph()
    elab_p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    _add_run_styled(elab_p, "Elaborado por", bold=True, size_pt=11, font=FONT_BODY)
    _set_paragraph_spacing(elab_p, before=0, after=10)

    # ── 6. Autores en 4 columnas con separadores verticales negros ───────────
    estudiantes = [a for a in autores if not a.get("es_tutor", False)]

    # Distribuir en 3 columnas de estudiantes (la 4ª columna es el docente)
    n_student_cols = 3
    cols_students: list[list[dict]] = [[] for _ in range(n_student_cols)]
    for i, est in enumerate(estudiantes):
        cols_students[i % n_student_cols].append(est)

    tutor_entry = None
    if tutor:
        tutor_entry = {"nombre": tutor, "carnet": grupo if grupo else "", "es_tutor": True}

    n_cols = n_student_cols + (1 if tutor_entry else 0)
    max_rows = max((len(c) for c in cols_students), default=0)
    if tutor_entry:
        max_rows = max(max_rows, 1)
    max_rows = max(max_rows, 1)

    if n_cols > 0:
        # Ancho total de la página ~16cm: 3 columnas de 3.6cm + 1 de 5.2cm
        col_widths_cm = [3.6, 3.6, 3.6, 5.2][:n_cols]
        authors_table = doc.add_table(rows=max_rows, cols=n_cols)
        authors_table.autofit = False

        for col_i in range(n_cols):
            is_tutor_col = (col_i == n_student_cols and tutor_entry)
            col_data = cols_students[col_i] if not is_tutor_col else [tutor_entry]

            for row_i in range(max_rows):
                cell = authors_table.cell(row_i, col_i)
                _set_cell_width(cell, col_widths_cm[col_i])
                # Separador vertical negro entre columnas (todos menos la última)
                _clear_cell_borders(cell, keep_right=(col_i < n_cols - 1))

                if row_i < len(col_data):
                    autor = col_data[row_i]
                    p = cell.paragraphs[0]
                    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                    _set_paragraph_spacing(p, before=0, after=0, line_spacing=1.1)

                    nombre = autor.get("nombre", "")
                    carnet = autor.get("carnet", "")

                    if is_tutor_col:
                        _add_run_styled(p, nombre, bold=True, size_pt=10, font=FONT_BODY)
                        if carnet:
                            p2 = cell.add_paragraph()
                            p2.alignment = WD_ALIGN_PARAGRAPH.LEFT
                            _set_paragraph_spacing(p2, before=0, after=0, line_spacing=1.1)
                            _add_run_styled(p2, f"Grupo: {carnet}", bold=True, size_pt=10, font=FONT_BODY)
                    else:
                        _add_run_styled(p, nombre, bold=False, size_pt=10, font=FONT_BODY)
                        if carnet:
                            p2 = cell.add_paragraph()
                            p2.alignment = WD_ALIGN_PARAGRAPH.LEFT
                            _set_paragraph_spacing(p2, before=0, after=0, line_spacing=1.1)
                            _add_run_styled(p2, carnet, bold=False, size_pt=10, font=FONT_BODY)

        builder.insert_table(authors_table)

    # ── 7. Fecha (izquierda) ─────────────────────────────────────────────────
    fecha_p = builder.add_paragraph()
    fecha_p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    _add_run_styled(fecha_p, fecha, bold=False, size_pt=11, font=FONT_BODY)
    _set_paragraph_spacing(fecha_p, before=24, after=2)

    # ── 8. Lugar (Managua, Nicaragua) ────────────────────────────────────────
    lugar_p = builder.add_paragraph()
    lugar_p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    _add_run_styled(lugar_p, lugar, bold=False, size_pt=11, font=FONT_BODY)
    _set_paragraph_spacing(lugar_p, before=0, after=0)

    # ── 9. Salto de página ───────────────────────────────────────────────────
    builder.add_page_break()

    return builder.paragraph_count
