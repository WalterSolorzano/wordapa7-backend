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
from docx.shared import Cm, Mm, Pt, RGBColor
from docx.text.paragraph import Paragraph


def _resolve_logo_path(asset: str = "logo_uni.png") -> Path:
    """Resuelve EL ASSET QUE PIDIÓ EL DOCUMENTO.

    ANTES NO TENÍA ARGUMENTO y siempre terminaba en `logo_uni.png`. Con el
    `if LOGO_PATH.exists()` que lo acompañaba, que solo salta si el archivo no
    está en disco, elegir UNAN producía un `.docx` con el logo de la UNI sin decir
    nada. Es la forma peor de fallar: no hay error, hay un documento equivocado.

    Los candidatos se conservan tal cual: `meipass/assets/` para el ejecutable
    empaquetado con PyInstaller y `../assets/` para desarrollo. Si se limpian, el
    instalador deja de encontrar los logos, y eso no se nota en un `pytest`.

    Si el asset no existe devuelve la PRIMERA ruta candidata, que no existe. Es
    deliberado: el llamador decide qué hacer con un logo que no llegó, y lo que
    decide es avisar, no substituting otro en su lugar.
    """
    meipass = getattr(sys, '_MEIPASS', None)
    candidatos = []
    if meipass:
        candidatos.append(Path(meipass) / "assets" / asset)  # PyInstaller frozen
    candidatos.append(Path(__file__).parent.parent / "assets" / asset)  # desarrollo
    for cand in candidatos:
        if cand.exists():
            return cand
    return candidatos[0]


# El logo de la portada UNI, que es el de por omisión. Es una CONSTANTE con
# nombre, no el resultado de una función sin argumentos: que alguien lea esto y
# entienda que este es el de UNI y no "el logo".
LOGO_UNI_ASSET = "logo_uni.png"
LOGO_PATH: Path = _resolve_logo_path(LOGO_UNI_ASSET)

# Tipografía institucional (idéntica a la de los trabajos UNI reales)
FONT_DEPARTMENT = "Times New Roman"  # Área de Conocimiento / asignatura (20pt, serif)
FONT_TITLE = "Montserrat Black"      # Título del trabajo
FONT_BODY = "Montserrat"             # Autores, fecha, lugar
BLACK = RGBColor(0x00, 0x00, 0x00)

# ── LA GEOMETRÍA DE LA HOJA ───────────────────────────────────────────────────
#
# Estos números están DUPLICADOS en `src/lib/portada/geometria.ts`, que es la
# copia que usa la vista previa. La duplicación es a propósito y la razón está
# escrita en el archivo de TypeScript: si el `.docx` importara el `.ts` no
# podría existir el bug que este módulo vino a arreglar, que es que la preview y
# el documento se separaron. El test `test_geometria_portada.py` mide que las
# dos copias digan lo mismo, así que una que se mueva sola cae.
#
# EL `.DOCX MANDA Y LA PREVIEW COPIA. Si tocás un número, tocá el otro: el test
# te va a decir que no.
HOJA_CARTA_MM = (215.9, 279.4)      # 8.5" x 11", el default de APARuleSet.page_size
HOJA_A4_MM = (210.0, 297.0)
MARGENES_MM = 25.4                  # una pulgada, como create_template.py y DESIGN.md

# La fraccion del ancho util que ocupa el logo. Reemplaza al `Cm(5.2)` absoluto.
#
# POR QUE UNA FRACCION Y NO MILIMETROS. Con milimetros fijos, un ancho
# calibrado para una hoja se ve distinto en la otra, y con Carta y A4 elegibles
# eso hace que el logo cambie de tamano segun el documento. Con una fraccion del
# ancho util, el size RELATIVO es el mismo y el absoluto se acomoda a cada hoja.
#
# POR QUE 0.315 Y NO 0.16. Porque el logo tiene que seguir midiendo lo que
# media. Antes de esta fase se ponia con `add_picture(..., width=Cm(5.2))`, y
# para decirlo como fraccion hay que dividir 5.2 cm por el ancho util REAL de
# una carta:
#
#     ancho util = 215.9 mm - 2 x 25.4 mm = 165.1 mm = 16.51 cm
#     5.2 / 16.51 = 0.315
#
# Los margenes son de UNA PULGADA (`APARuleSet.margins_cm = 2.54`), no de 40 mm.
# El plan de la fase calibro el 0.16 como si el ancho util fuera 13.59 cm
# (0.16 x 135.9 mm = 21.7 mm, que es lo que el plan decia). Con el ancho util
# real de 16.51 cm, ese mismo 0.16 son 2.64 cm: LA MITAD de lo que tenia, que es
# lo que reporto el usuario ("el logo que puso es super pequeno no se ve"). La
# fraccion no es un numero ilustrativo: es el que preserva el tamano, y se
# cambia solo con la cuenta al lado.
FRACCION_DE_ANCHO_DEL_LOGO = 0.315

# Que logo lleva que institucion. Es DATO y no una URL en el `.tsx`, por lo que
# dijo `CoverEditorPanel`: con la insignia hardcodeada en el componente, elegir
# UNAN pedia `logo_anan.png` con doble `a` y el backend servia
# `logo_unan.png`. Un 404 en el que ninguno de los dos lados se enteraba.
#
# Se busca por el CODIGO primero y despues por el nombre completo, porque el
# cliente manda el nombre ("Universidad Nacional Autónoma de Nicaragua
# (UNAN-Managua)") y no siempre el codigo.
ASSET_POR_CODIGO_DE_INSTITUCION = {
    "UNI": "logo_uni.png",
    "UNAN": "logo_unan.png",
}
ASSET_POR_NOMBRE_DE_INSTITUCION = {
    "universidad nacional de ingenier": "logo_uni.png",
    "universidad nacional autonoma de nicaragua": "logo_unan.png",
    "unan": "logo_unan.png",
    "uni": "logo_uni.png",
}


def asset_de_institucion(institucion: str | None) -> str:
    """El asset que corresponde a una institucion, o `None` si no se conoce.

    `None` significa "no hay logo que poner" y es una respuesta VALIDA: una
    institucion que no esta en el catalogo no es un error, y no se le pone el
    logo de otra. Devolver el de UNI como fallback es exactamente el defecto que
    esta función vino a arreglar.
    """
    if not institucion:
        return None
    texto = str(institucion).strip()
    if not texto:
        return None
    codigo = texto.upper()
    if codigo in ASSET_POR_CODIGO_DE_INSTITUCION:
        return ASSET_POR_CODIGO_DE_INSTITUCION[codigo]
    plano = texto.lower()
    for prefijo, asset in ASSET_POR_NOMBRE_DE_INSTITUCION.items():
        if prefijo in plano:
            return asset
    return None

# Los puntos de cada bloque. Esta tabla es la FUENTE DE VERDAD: la copia en
# `src/lib/portada/geometria.ts` (`PT_PORTADA_UNI`) sale de acá.
PT_DEPARTAMENTO = 20
PT_TITULO = 20
PT_ASIGNATURA = 20
PT_ELABORADO_POR = 11
PT_AUTOR = 10
PT_CARNET = 10
PT_FECHA = 11
PT_LUGAR = 11


class _LogoPedido:
    """Un logo pedido, con los defaults puestos.

    Existe para no depender de que el llamador use `LogoPortada`: la función
    acepta la lista del modelo y también una lista de objetos con los mismos dos
    campos, que es lo que necesitan los tests y el fallback interno.
    """

    __slots__ = ("asset", "ancho_fraccion", "institucion")

    def __init__(self, asset: str, ancho_fraccion: float, institucion: str | None = None):
        self.asset = asset
        self.ancho_fraccion = ancho_fraccion
        self.institucion = institucion


def hoja_de(page_size: str | None) -> tuple[float, float]:
    """Las dos hojas que la app sabe hacer, en milimetros."""
    return HOJA_A4_MM if (page_size or "carta") == "a4" else HOJA_CARTA_MM


def ancho_util_mm(page_size: str | None) -> float:
    """El ancho de la hoja menos los margenes, en milimetros."""
    ancho, _alto = hoja_de(page_size)
    return ancho - 2 * MARGENES_MM


def alto_util_mm(page_size: str | None) -> float:
    """El alto de la hoja menos los margenes, en milimetros."""
    _ancho, alto = hoja_de(page_size)
    return alto - 2 * MARGENES_MM


def aplicar_tamano_de_hoja(doc, page_size: str | None) -> None:
    """Deja de heredar la hoja del documento y la aplica desde `page_size`.

    `APARuleSet.page_size` existe desde la fase de Ajustes y NADIE lo aplicaba
    en portada, que es justo lo que hace que el diseno "no sea de tamano
    definido": el usuario elegia Carta en Ajustes y la portada salia con la
    hoja que tuviera el original.

    OJO CON LA FRONTERA, porque es la decision del usuario del 2026-09-28 y no
    se vuelve a abrir: el tamano de pagina es propiedad del DOCUMENTO.
    `section.page_width` es de la SECCION, o sea del contexto que rodea la
    portada, no de la portada. Aplicarlo no altera ni un caracter del bloque
    protegido: su texto, sus imagenes y su tipografia quedan intactos, y el test
    de integridad compara el hash del bloque antes y despues para probarlo.
    """
    from generation.style_engine import aplicar_tamano_pagina

    ancho_mm, alto_mm = hoja_de(page_size)
    for section in doc.sections:
        try:
            landscape = False
            try:
                sect_pr = section._sectPr
                pg_sz = sect_pr.find(qn("w:pgSz"))
                landscape = (
                    pg_sz is not None
                    and pg_sz.attrib.get(qn("w:orient")) == "landscape"
                )
            except Exception:
                landscape = False
            # `aplicar_tamano_pagina` toma el nombre de la hoja y ya sabe los
            # twips de cada una. Se le pasa el nombre para que no haya dos
            #implementaciones del mismo numero en dos lugares.
            aplicar_tamano_pagina(section, "a4" if page_size == "a4" else "carta",
                                  landscape=landscape)
        except Exception:
            pass

# Conversión de centímetros a "twentieths of a point" (dxa): 1 cm = 567 dxa
_CM_TO_DXA = 567


def _add_run_styled(paragraph, text: str, bold=False, size_pt=12,
                    font: str = FONT_BODY, color: RGBColor = BLACK, color_hex: str = "000000"):
    """Agrega un run con estilo específico a un párrafo forzando la inyección
    de color negro puro (000000) y fuentes de respaldo nativas en OpenXML."""
    run = paragraph.add_run(text)
    run.bold = bold
    run.font.name = font
    run.font.size = Pt(size_pt)
    run.font.color.rgb = color

    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.append(rFonts)
    rFonts.set(qn('w:ascii'), font)
    rFonts.set(qn('w:hAnsi'), font)
    rFonts.set(qn('w:cs'), font)

    # Inyectar nodo <w:color w:val="000000"/> directo en rPr para evitar texto desvaído/gris en Word/PDF
    w_color = rPr.find(qn('w:color'))
    if w_color is None:
        w_color = OxmlElement('w:color')
        rPr.append(w_color)
    w_color.set(qn('w:val'), color_hex)

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
    """Elimina todos los bordes de la celda; opcionalmente conserva el derecho.

    El separador vertical derecho solo se añade cuando *keep_right* es True,
    lo que debe reservarse para celdas que contienen contenido real. Las
    celdas vacías (sin autor) reciben ``keep_right=False`` para que no quede
    un separador colgando sobre el vacío.
    """
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
    tcW.set(qn('w:w'), str(int(width_cm * _CM_TO_DXA)))
    tcW.set(qn('w:type'), 'dxa')


def _set_cell_vertical_alignment(cell, align: str = "center"):
    """Fija la alineación vertical de una celda de tabla.

    Valores válidos en OOXML: ``top``, ``center``, ``bottom``.
    Por defecto centra verticalmente para que todas las celdas de una misma
    fila queden alineadas aunque tengan distinta cantidad de texto.
    """
    tcPr = cell._tc.get_or_add_tcPr()
    vAlign = tcPr.find(qn('w:vAlign'))
    if vAlign is None:
        vAlign = OxmlElement('w:vAlign')
        tcPr.append(vAlign)
    vAlign.set(qn('w:val'), align)


def _set_cell_padding(cell, top_cm: float = 0.2, bottom_cm: float = 0.2,
                      left_cm: float = 0.2, right_cm: float = 0.2):
    """Agrega relleno (padding) interno a una celda de tabla.

    Evita que el texto quede pegado a las líneas separadoras verticales,
    dando un respiro visual uniforme de 0.2 cm por defecto.
    """
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = tcPr.find(qn('w:tcMar'))
    if tcMar is None:
        tcMar = OxmlElement('w:tcMar')
        tcPr.append(tcMar)
    for side, val_cm in [('top', top_cm), ('bottom', bottom_cm),
                         ('left', left_cm), ('right', right_cm)]:
        mar = tcMar.find(qn(f'w:{side}'))
        if mar is None:
            mar = OxmlElement(f'w:{side}')
            tcMar.append(mar)
        mar.set(qn('w:w'), str(int(val_cm * _CM_TO_DXA)))
        mar.set(qn('w:type'), 'dxa')


def _set_row_min_height(row, height_cm: float = 1.5):
    """Fija la altura mínima de una fila de tabla (regla ``atLeast``).

    Garantiza que las filas de autores no colapsen cuando hay poco texto
    (p. ej. un solo estudiante). ``atLeast`` permite que la fila crezca si el
    contenido la rebasa.
    F-02: Añade cantSplit a la fila para que nunca se divida verticalmente.
    """
    trPr = row._tr.get_or_add_trPr()
    trHeight = trPr.find(qn('w:trHeight'))
    if trHeight is None:
        trHeight = OxmlElement('w:trHeight')
        trPr.append(trHeight)
    trHeight.set(qn('w:val'), str(int(height_cm * _CM_TO_DXA)))
    trHeight.set(qn('w:hRule'), 'atLeast')

    # F-02: <w:cantSplit/> en filas de autores
    if trPr.find(qn('w:cantSplit')) is None:
        trPr.append(OxmlElement('w:cantSplit'))


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
    font_family: str | None = None,
    page_size: str | None = "carta",
    logos: list | None = None,
    institucion: str | None = None,
    incluir_logo: bool = True,
) -> int:
    """
    Inserta al inicio del documento una portada institucional UNI fiel al
    formato de los trabajos reales:

        [Logo UNI centrado]
        Área de Conocimiento de Ingeniería y Afines        (Butler 20pt / font_family)
        Título del trabajo                                  (Montserrat Black 20pt / font_family)
        Asignatura                                          (Butler 20pt / font_family)

        Elaborado por                                       (Montserrat Bold 11pt / font_family)
        ──────────┬──────────┬──────────┬─────────────────
        │ Autor 1  │ Autor 3  │ Autor 5  │ Tutor           │
        │ Carnet   │ Carnet   │ Carnet   │ Grupo: XXX      │
        │ Autor 2  │ Autor 4  │          │                 │
        │ Carnet   │ Carnet   │          │                 │
        ──────────┴──────────┴──────────┴─────────────────

        25 de junio del año 2025
        Managua, Nicaragua

    Returns: Número de párrafos insertados (para cover_paragraph_count).

    `page_size` es el nombre de la hoja del DOCUMENTO ("carta" o "a4"), y es lo
    que hace que el logo mida su misma fracción del ancho útil en las dos. Con
    milimetros fijos, un ancho calibrado para una hoja se ve distinto en la otra.

    `logos` es una lista de `LogoPortada` (o de `_LogoPedido`, que es lo mismo
    con los defaults puestos). Es `None` o vacía cuando el documento no pidió
    logos, y en ese caso se usa el de la institución elegida, o el de UNI si la
    institución no se conoce.

    `institucion` es el nombre de la institución del documento. Decide el logo
    cuando no hay lista explícita, y antes no decidía nada: la portada UNI
    ponía SIEMPRE el logo de la UNI, y elegir UNAN salía con el logo de la UNI en
    silencio.
    """
    aplicar_tamano_de_hoja(doc, page_size)

    # F-01: Desvincular encabezado/pie de la primera página para que no se superponga
    if doc.sections:
        try:
            doc.sections[0].different_first_page_header_footer = True
        except Exception:
            pass

    font_dept = font_family or FONT_DEPARTMENT
    font_title = font_family or FONT_TITLE
    font_body = font_family or FONT_BODY

    if not departamento:
        departamento = "Área de Conocimiento de Ingeniería y Afines"
    if not titulo:
        titulo = "Título del trabajo"

    # SIN INTEGRANTES NO SE INVENTA NINGUNO.
    #
    # Antes, si no venian autores ni tutor, la funcion fabricaba
    # "[Br. Nombre del Estudiante]", "Carnet: 202X-XXXXU", "[Ing. Nombre del
    # Docente]" y el grupo "3T1 IND", y todo eso iba al `.docx` del usuario. Es
    # la misma clase de fuga que "[LOGOS INSTITUCIONALES]" y que
    # "[Figura sin rotular]" en la revision: texto de interfaz en el documento
    # final. Lo encontro `test_placeholder_en_docx.py`, que recorre todos los
    # generadores.
    #
    # Sin integrantes, la portada no lleva tabla. La app muestra el diseno en la
    # preview y el usuario escribe lo suyo; el `.docx` sale sin nombres en vez de
    # salir con nombres falsos.

    if not fecha:
        from datetime import date
        d = date.today()
        months = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
        fecha = f"{d.day} de {months[d.month-1]} del año {d.year}"

    builder = _UniCoverBuilder(doc)

    # ── 1. Logo UNI centrado (la imagen incluye el nombre de la universidad) ──
    #
    # El ancho es una FRACCIÓN del ancho útil de la hoja, no `Cm(5.2)`. Es el
    # cambio que hace que el mismo logo se vea igual en Carta y en A4, y el
    # motivo está escrito arriba, en `FRACCION_DE_ANCHO_DEL_LOGO`.
    pedido = [] if not incluir_logo else [
        lg for lg in (logos or [])
        if getattr(lg, "asset", None)
    ]
    if incluir_logo and not pedido:
        # Sin logos pedidos: el de la institucion elegida, y si no se sabe cual
        # es, el de UNI, que es lo que se hizo siempre.
        asset = asset_de_institucion(institucion) or LOGO_UNI_ASSET
        pedido = [_LogoPedido(asset, FRACCION_DE_ANCHO_DEL_LOGO)]

    if pedido:
        fila = builder.add_paragraph()
        fila.alignment = WD_ALIGN_PARAGRAPH.CENTER
        _set_paragraph_spacing(fila, before=0, after=6)
        for lg in pedido:
            asset = getattr(lg, "asset", "")
            frac = float(
                getattr(lg, "ancho_fraccion", FRACCION_DE_ANCHO_DEL_LOGO) or FRACCION_DE_ANCHO_DEL_LOGO
            )
            ancho_mm = ancho_util_mm(page_size) * frac
            ruta_logo = _resolve_logo_path(asset)
            if not ruta_logo.exists():
                # Se pidio un logo y no llego. ANTES esto saltaba en silencio y el
                # documento salia sin el, que es la forma peor de fallar: no hay
                # error, hay un documento equivocado. Ahora avisa, y NO sustituye
                # el logo de otro: un asset que falta es un dato faltante, no una
                # excuse para poner algo que el autor no pidio.
                print(
                    f"[PORTADA-UNI] El logo '{asset}' no se encontro en "
                    f"{ruta_logo.parent}; se omite."
                )
                continue
            fila.add_run().add_picture(str(ruta_logo), width=Mm(ancho_mm))

    # ── 2. Departamento (Butler 20pt, centrado) ──────────────────────────────
    dept_p = builder.add_paragraph()
    dept_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _add_run_styled(dept_p, departamento, bold=False, size_pt=PT_DEPARTAMENTO, font=font_dept)
    _set_paragraph_spacing(dept_p, before=6, after=30)

    # ── 3. Título (Montserrat Black 20pt, centrado) ──────────────────────────
    titulo_p = builder.add_paragraph()
    titulo_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _add_run_styled(titulo_p, titulo, bold=False, size_pt=PT_TITULO, font=font_title)
    _set_paragraph_spacing(titulo_p, before=0, after=30)

    # ── 4. Asignatura (Butler 20pt, centrado) ────────────────────────────────
    if asignatura:
        asig_p = builder.add_paragraph()
        asig_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        _add_run_styled(asig_p, asignatura, bold=False, size_pt=PT_ASIGNATURA, font=font_dept)
        _set_paragraph_spacing(asig_p, before=0, after=60)

    # ── 5. "Elaborado por" (Montserrat Bold 11pt, izquierda) ─────────────────
    elab_p = builder.add_paragraph()
    elab_p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    _add_run_styled(elab_p, "Elaborado por", bold=True, size_pt=PT_ELABORADO_POR, font=font_body)
    _set_paragraph_spacing(elab_p, before=0, after=10)

    # ── 6. Autores en columnas con separadores verticales negros ─────────────
    estudiantes = [a for a in autores if not a.get("es_tutor", False)]

    # Distribuir en columnas de estudiantes adaptativas:
    # 1 estudiante  -> 1 col
    # 2 estudiantes -> 2 cols
    # 3 estudiantes -> 3 cols
    # 4 estudiantes -> 2 cols x 2 filas (simetría 2x2)
    # 5-6 estudiantes -> 3 cols x 2 filas
    if len(estudiantes) <= 1:
        n_student_cols = 1
    elif len(estudiantes) == 2 or len(estudiantes) == 4:
        n_student_cols = 2
    else:
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
        # ── 6.1 Anchos de columna balanceados según nº de estudiantes ──────────
        # Pocos integrantes → columnas más anchas y equilibrio con el docente.
        #   3 estudiantes → 3.5 cm cada uno  + 5.0 cm docente  (total 15.5 cm)
        #   2 estudiantes → 5.0 cm cada uno  + 5.0 cm docente  (total 15.0 cm)
        #   1 estudiante  → 7.0 cm           + 5.0 cm docente  (total 12.0 cm)
        student_col_width = {3: 3.5, 2: 5.0, 1: 7.0}.get(n_student_cols, 3.5)
        tutor_col_width = 5.0
        col_widths_cm = ([student_col_width] * n_student_cols) + \
                        ([tutor_col_width] if tutor_entry else [])

        authors_table = doc.add_table(rows=max_rows, cols=n_cols)
        authors_table.autofit = False

        for row_i in range(max_rows):
            # Altura mínima de fila para que las celdas no colapsen.
            _set_row_min_height(authors_table.rows[row_i], height_cm=1.5)

        for col_i in range(n_cols):
            is_tutor_col = (col_i == n_student_cols and tutor_entry)
            col_data = cols_students[col_i] if not is_tutor_col else [tutor_entry]

            for row_i in range(max_rows):
                cell = authors_table.cell(row_i, col_i)
                _set_cell_width(cell, col_widths_cm[col_i])

                # Centrar verticalmente todas las celdas de la misma fila.
                _set_cell_vertical_alignment(cell, align="center")

                # Padding interno para que el texto no toque las líneas.
                _set_cell_padding(cell, top_cm=0.2, bottom_cm=0.2,
                                   left_cm=0.2, right_cm=0.2)

                # ── 6.4 Separador vertical solo en celdas con contenido ─────────
                # Una celda vacía (sin autor en esa fila) NO debe mostrar el
                # separador derecho; de lo contrario queda una línea colgando
                # sobre el vacío y la portada se ve rota.
                has_content = row_i < len(col_data)
                keep_right = (col_i < n_cols - 1) and has_content
                _clear_cell_borders(cell, keep_right=keep_right)

                if has_content:
                    autor = col_data[row_i]
                    p = cell.paragraphs[0]
                    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                    _set_paragraph_spacing(p, before=0, after=0, line_spacing=1.1)

                    nombre = autor.get("nombre", "")
                    carnet = autor.get("carnet", "")

                    if is_tutor_col:
                        _add_run_styled(p, "Profesor:", bold=True, size_pt=PT_AUTOR, font=font_body)
                        p_tutor = cell.add_paragraph()
                        p_tutor.alignment = WD_ALIGN_PARAGRAPH.LEFT
                        _set_paragraph_spacing(p_tutor, before=0, after=4, line_spacing=1.1)
                        _add_run_styled(p_tutor, nombre, bold=False, size_pt=PT_AUTOR, font=font_body)
                        if carnet:
                            p2 = cell.add_paragraph()
                            p2.alignment = WD_ALIGN_PARAGRAPH.LEFT
                            _set_paragraph_spacing(p2, before=2, after=0, line_spacing=1.1)
                            _add_run_styled(p2, "Grupo:", bold=True, size_pt=PT_CARNET, font=font_body)
                            p_grupo = cell.add_paragraph()
                            p_grupo.alignment = WD_ALIGN_PARAGRAPH.LEFT
                            _set_paragraph_spacing(p_grupo, before=0, after=0, line_spacing=1.1)
                            grupo_val = carnet.replace("Grupo:", "").strip()
                            _add_run_styled(p_grupo, grupo_val, bold=False, size_pt=PT_CARNET, font=font_body)
                    else:
                        _add_run_styled(p, nombre, bold=False, size_pt=PT_AUTOR, font=font_body)
                        if carnet:
                            p2 = cell.add_paragraph()
                            p2.alignment = WD_ALIGN_PARAGRAPH.LEFT
                            _set_paragraph_spacing(p2, before=0, after=0, line_spacing=1.1)
                            carnet_val = carnet if carnet.startswith("Carnet:") else f"Carnet: {carnet}"
                            _add_run_styled(p2, carnet_val, bold=False, size_pt=PT_CARNET, font=font_body)

        builder.insert_table(authors_table)

    # ── 6.5 Espaciador dinámico: empuja fecha/lugar hacia abajo de la hoja ──
    # Pocos autores = más espacio, para que la portada NO quede pegada arriba
    # con todo el vacío abajo (replica el flex:1 del preview).
    # El alto útil sale de la hoja, no de un número. Antes estaba fijo en 24.6
    # cm, que es el A4 con una pulgada de margen: en Carta sobraba medio
    # centímetro de hueco y en A4 no, según de qué lado se mirara.
    PAGE_USABLE_CM = alto_util_mm(page_size) / 10.0
    TOP_BLOCK_CM = 8.0       # logo + dept + título + asignatura + "Elaborado por"
    AUTH_ROW_CM = 1.5        # altura mínima por fila de autores (con padding)
    DATE_BLOCK_CM = 1.4      # fecha + lugar
    TARGET_FILL = 0.86       # la fecha queda cerca del 86% del alto de la hoja
    used_cm = TOP_BLOCK_CM + max(1, max_rows) * AUTH_ROW_CM + DATE_BLOCK_CM
    spacer_cm = max(0.0, PAGE_USABLE_CM * TARGET_FILL - used_cm)
    empty_lines = int(spacer_cm / 0.5)
    for _ in range(empty_lines):
        sp = builder.add_paragraph()
        _set_paragraph_spacing(sp, before=0, after=0, line_spacing=1.0)

    # ── 7. Fecha (izquierda) ─────────────────────────────────────────────────
    fecha_p = builder.add_paragraph()
    fecha_p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    _add_run_styled(fecha_p, fecha, bold=False, size_pt=PT_FECHA, font=font_body)
    _set_paragraph_spacing(fecha_p, before=24, after=2)

    # ── 8. Lugar (Managua, Nicaragua) ────────────────────────────────────────
    lugar_p = builder.add_paragraph()
    lugar_p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    _add_run_styled(lugar_p, lugar, bold=False, size_pt=PT_FECHA, font=font_body)
    _set_paragraph_spacing(lugar_p, before=0, after=0)

    # ── 9. Salto de página ───────────────────────────────────────────────────
    builder.add_page_break()

    return builder.paragraph_count
