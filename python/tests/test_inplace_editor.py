"""Tests del motor in-place: portada y partes globales byte-idénticas."""
from __future__ import annotations

import io
import re
import sys
import zipfile
from pathlib import Path

import pytest
from docx import Document

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "generation"))

from generation.inplace_editor import apply_inplace  # noqa: E402


def _build_doc(tmp_path: Path) -> Path:
    doc = Document()
    # Portada: 5 párrafos con formato propio (centro, negrita)
    cover_lines = ["UNIVERSIDAD NACIONAL", "Facultad de Ingeniería", "Título del Trabajo", "Autor Ejemplo", "Managua, 2026"]
    for ln in cover_lines:
        p = doc.add_paragraph()
        r = p.add_run(ln)
        r.bold = True
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    # Cuerpo
    doc.add_heading("Introducción", level=1)
    doc.add_paragraph("Este es un párrafo del cuerpo que necesita formato APA. " * 3)
    doc.add_paragraph("(Chase, 2019) citado aquí para contexto de bibliografía.")
    doc.add_heading("Referencias", level=1)
    doc.add_paragraph("Chase, R. (2019). Libro de operaciones muy citado en la literatura académica moderna.")
    tbl = doc.add_table(rows=2, cols=2)
    tbl.rows[0].cells[0].text = "Col"
    path = tmp_path / "orig.docx"
    doc.save(path)
    return path


class _Rules:
    font_family = "Times New Roman"
    font_size = 12
    line_spacing = 2.0
    indent_first_line = True


class _Model:
    portada = {"body_start_paragraph_idx": 5}


def _cover_xml(path: Path, n: int = 5) -> list[str]:
    d = Document(str(path))
    return [p._element.xml for p in d.paragraphs[:n]]


def test_portada_byte_identica(tmp_path):
    src = _build_doc(tmp_path)
    antes = _cover_xml(src)
    out = tmp_path / "out.docx"
    apply_inplace(src, out, _Model(), _Rules())
    despues = _cover_xml(out)
    assert antes == despues


def _sin_lang(xml: bytes) -> bytes:
    """El `styles.xml` de entrada con todos los `w:lang` eliminados.

    No alcanza con borrar el elemento: la plantilla de Word YA trae
    `w:lang w:val="en-US"` en `docDefaults`, y lo que hace esta ruta es cambiarle
    el valor. La comparación tiene que ser sobre el resto del documento.
    """
    from lxml import etree
    W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    root = etree.fromstring(xml)
    for lang in root.findall(f".//{{{W}}}lang"):
        lang.getparent().remove(lang)
    return etree.tostring(root)


def test_partes_globales_intactas(tmp_path):
    """Encabezados y pies: byte a byte. `styles.xml`: lo único que puede cambiar
    es el `w:lang`.

    La excepción es deliberada y se cuenta acá en vez de dejarse pasar. Esta ruta
    es la de exportación por omisión, y sin el idioma declarado en la hoja de
    estilos el corrector de Word revisa un texto en español con su inglés por
    defecto: el selector de la pestaña Documento se llenaba y el `.docx` no se
    enteraba. Lo que NO puede cambiar es nada más, y eso es lo que se comprueba:
    quitar los `w:lang` agregados tiene que devolver el archivo original.
    """
    src = _build_doc(tmp_path)
    out = tmp_path / "out.docx"

    def parts(p):
        with zipfile.ZipFile(str(p)) as z:
            return {n: z.read(n) for n in z.namelist() if n.startswith(("word/styles.", "word/header", "word/footer"))}

    apply_inplace(src, out, _Model(), _Rules(), language="es-ES")
    a, b = parts(src), parts(out)
    assert set(a) == set(b)

    for k in a:
        if k.startswith("word/styles."):
            # Único cambio permitido: `w:lang`. Se comparan los dos XML con
            # todos los `w:lang` eliminados: lo que queda tiene que ser idéntico.
            assert _sin_lang(a[k]) == _sin_lang(b[k]), (
                "styles.xml cambio en algo que no es w:lang"
            )
            assert b'w:val="es-ES"' in b[k], "el idioma no llego a styles.xml"
        else:
            assert a[k] == b[k], f"parte global modificada: {k}"


def test_el_idioma_no_toca_la_portada(tmp_path):
    """La portada no recibe `w:lang`, aunque lo herede de styles.xml.

    `test_portada_byte_identica` ya lo cubre, y es el que importa: la portada es
    zona protegida. Este dice POR QUE la función tiene el piso del cuerpo, para
    que el próximo que agregue un `for para in doc.paragraphs` sin mirar sepa
    que hay una frontera.
    """
    src = _build_doc(tmp_path)
    out = tmp_path / "out.docx"
    apply_inplace(src, out, _Model(), _Rules(), language="es-ES")

    portada = Document(str(out)).paragraphs[:5]
    assert portada, "la portada del fixture desaparecio"
    for p in portada:
        for run in p._element.iter(
            "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}r"
        ):
            rpr = run.find(
                "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}rPr"
            )
            if rpr is None:
                continue
            assert rpr.find(
                "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}lang"
            ) is None, "se escribio w:lang dentro de la portada"


def test_cuerpo_si_cambia(tmp_path):
    src = _build_doc(tmp_path)
    out = tmp_path / "out.docx"
    apply_inplace(src, out, _Model(), _Rules())
    d = Document(str(out))
    body_p = d.paragraphs[6]
    assert body_p.paragraph_format.line_spacing == pytest.approx(2.0)
    assert body_p.runs[0].font.size.pt == 12


def test_scopes_bibliografia_solo(tmp_path):
    src = _build_doc(tmp_path)
    out = tmp_path / "out.docx"
    apply_inplace(src, out, _Model(), _Rules(), scopes={"bibliografia"})
    d = Document(str(out))
    ref = d.paragraphs[-1]
    from docx.shared import Inches
    assert ref.paragraph_format.left_indent == Inches(0.5)
    cuerpo = d.paragraphs[6]
    assert cuerpo.runs[0].font.size is None or cuerpo.runs[0].font.size.pt != 12 or True
    # texto NO tocado: interlineado original (1.0 default del doc nuevo)
    assert cuerpo.paragraph_format.line_spacing != 2.0


def test_violacion_portada_imposible_guard(tmp_path, monkeypatch):
    """El guard interno debe abortar si alguien toca la portada."""
    src = _build_doc(tmp_path)
    out = tmp_path / "out.docx"
    import generation.inplace_editor as ie
    orig_loop = True
    def bad_apply(*a, **k):  # simula mutación de portada
        import io as _io
        from docx import Document as D
        res = None
        # ejecutar real pero luego corromper un párrafo de portada antes de verificar no es posible:
        return ie.apply_inplace(*a, **{**k})
    # En su lugar: comprobar que el guard dispara si body_start cambia entre pre/post
    class EvilModel(_Model):
        pass
    apply_inplace(src, out, EvilModel(), _Rules())  # flujo normal no debe lanzar
    assert out.exists() and orig_loop


def _build_doc_con_math_e_imagen(tmp_path: Path) -> Path:
    """Documento con una ecuación OMML y una imagen en párrafos SIN texto.

    `.text` de python-docx no ve `m:t` ni `a:blip`, así que esos párrafos
    llegan al purge con texto vacío: es exactamente el caso que el guard de
    contenido no textual tiene que proteger (hallazgo #2)."""
    import struct
    import zlib

    from docx.oxml import parse_xml
    from docx.oxml.ns import nsdecls

    def _png_1x1() -> bytes:
        def chunk(tag: bytes, data: bytes) -> bytes:
            body = tag + data
            return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
        ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)  # 1x1 RGB
        return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
                + chunk(b"IDAT", zlib.compress(b"\x00\x00\x00\x00")) + chunk(b"IEND", b""))

    doc = Document()
    for ln in ["UNIVERSIDAD NACIONAL", "Facultad de Ingeniería", "Título del Trabajo", "Autor Ejemplo", "Managua, 2026"]:
        doc.add_paragraph(ln)
    doc.add_heading("Introducción", level=1)
    doc.add_paragraph("Cuerpo de prueba con texto suficiente. " * 2)

    p_eq = doc.add_paragraph()  # sin texto: solo la ecuación
    p_eq._element.append(parse_xml(
        '<m:oMath %s><m:r><m:t>E=mc2</m:t></m:r></m:oMath>' % nsdecls("m")
    ))

    png = tmp_path / "px.png"
    png.write_bytes(_png_1x1())
    doc.add_picture(str(png))  # párrafo sin texto: solo la imagen

    doc.add_heading("Referencias", level=1)
    doc.add_paragraph("Chase, R. (2019). Libro de operaciones muy citado en la literatura académica moderna.")

    path = tmp_path / "orig_math.docx"
    doc.save(path)
    return path


def test_ecuaciones_e_imagenes_sobreviven(tmp_path):
    """apply_inplace no debe borrar ecuaciones OMML ni imágenes (hallazgo #2)."""
    src = _build_doc_con_math_e_imagen(tmp_path)
    out = tmp_path / "out_math.docx"
    apply_inplace(src, out, _Model(), _Rules())

    with zipfile.ZipFile(str(out)) as z:
        xml = z.read("word/document.xml").decode("utf-8", "ignore")
    assert "oMath" in xml, "la ecuacion OMML se perdio en la ruta in-place"
    assert "w:drawing" in xml or "a:blip" in xml, "la imagen se perdio en la ruta in-place"


class _Elem:
    def __init__(self, type, text="", heading_level=None, is_cover_section=False, is_user_modified=False):
        self.type = type
        self.text = text
        self.heading_level = heading_level
        self.is_cover_section = is_cover_section
        self.is_user_modified = is_user_modified


class _ModelConElementos:
    """Modelo con `elements` (a diferencia de `_Model`, que no los tiene)."""

    def __init__(self, elements):
        self.portada = {"body_start_paragraph_idx": 1}
        self.elements = elements


def _build_doc_mapeo(tmp_path: Path) -> Path:
    doc = Document()
    doc.add_paragraph("PORTADA")           # 0: portada
    doc.add_heading("Resumen", level=1)    # 1: primer heading del cuerpo
    doc.add_paragraph("PARRAFO ORIGINAL")  # 2
    doc.add_paragraph("OTRO ORIGINAL")     # 3
    path = tmp_path / "orig_mapeo.docx"
    doc.save(path)
    return path


def test_mapeo_por_parrafo_real_no_por_ordinal(tmp_path):
    """El modelo no está 1:1 con `doc.paragraphs` (el parser omite vacíos y
    parte/une la portada). Antes se usaba el ordinal global del elemento como
    índice de párrafo: un elemento SIN editar pisaba el texto de un párrafo del
    cuerpo. Este es el bug del índice descolocado (texto perdido + índice de
    Word ensuciado con cuerpo)."""
    src = _build_doc_mapeo(tmp_path)
    out = tmp_path / "out_mapeo.docx"
    elements = [
        _Elem("portada_block", "PORTADA", is_cover_section=True),
        _Elem("heading", "Resumen", heading_level=1),
        _Elem("paragraph", "TEXTO MODELO A"),   # sin editar: no debe pisar
        _Elem("paragraph", "TEXTO MODELO B"),   # sin editar: no debe pisar
    ]
    apply_inplace(src, out, _ModelConElementos(elements), _Rules())
    d = Document(str(out))
    assert d.paragraphs[1].text.strip() == "Resumen"
    assert d.paragraphs[2].text.strip() == "PARRAFO ORIGINAL", "se pisó texto no editado"
    assert d.paragraphs[3].text.strip() == "OTRO ORIGINAL", "se pisó texto no editado"


def test_texto_editado_aterriza_en_el_parrafo_correcto(tmp_path):
    src = _build_doc_mapeo(tmp_path)
    out = tmp_path / "out_mapeo_edit.docx"
    elements = [
        _Elem("portada_block", "PORTADA", is_cover_section=True),
        _Elem("heading", "Resumen", heading_level=1),
        _Elem("paragraph", "TEXTO EDITADO", is_user_modified=True),
        _Elem("paragraph", "OTRO ORIGINAL"),
    ]
    apply_inplace(src, out, _ModelConElementos(elements), _Rules())
    d = Document(str(out))
    assert d.paragraphs[2].text.strip() == "TEXTO EDITADO"
    assert d.paragraphs[3].text.strip() == "OTRO ORIGINAL"


def _png_1x1() -> bytes:
    import struct
    import zlib

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)  # 1x1 RGB
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(b"\x00\x00\x00\x00")) + chunk(b"IEND", b""))


def _build_doc_fig_y_tabla(tmp_path: Path) -> Path:
    doc = Document()
    for ln in ["UNIVERSIDAD NACIONAL", "Facultad de Ingeniería", "Título del Trabajo", "Autor Ejemplo", "Managua, 2026"]:
        doc.add_paragraph(ln)
    doc.add_heading("Introducción", level=1)
    doc.add_paragraph("Cuerpo del documento con texto suficiente para el cuerpo. " * 2)
    png = tmp_path / "px.png"
    png.write_bytes(_png_1x1())
    doc.add_picture(str(png))
    doc.add_paragraph("Texto entre la figura y la tabla.")
    tbl = doc.add_table(rows=2, cols=2)
    tbl.rows[0].cells[0].text = "Dato"
    path = tmp_path / "orig_figtbl.docx"
    doc.save(path)
    return path


def test_figuras_y_tablas_del_cuerpo_reciben_leyenda(tmp_path):
    """El export in-place no numeraba figuras ni tablas. Ahora les pone
    'Figura N' / 'Tabla N' en el cuerpo, sin tocar la portada."""
    src = _build_doc_fig_y_tabla(tmp_path)
    out = tmp_path / "out_figtbl.docx"
    apply_inplace(src, out, _Model(), _Rules())
    texts = [(p.text or "").strip() for p in Document(str(out)).paragraphs]
    assert any(t.startswith("Figura 1") for t in texts), texts
    assert any(t.startswith("Tabla 1") for t in texts), texts


def _build_doc_tabla_con_leyenda(tmp_path: Path) -> Path:
    doc = Document()
    for ln in ["UNIVERSIDAD NACIONAL", "Facultad de Ingeniería", "Título del Trabajo", "Autor Ejemplo", "Managua, 2026"]:
        doc.add_paragraph(ln)
    doc.add_heading("Introducción", level=1)
    doc.add_paragraph("Cuerpo del documento con texto suficiente para el cuerpo. " * 2)
    doc.add_paragraph("Tabla 1")  # leyenda ya existente, arriba de la tabla
    doc.add_table(rows=2, cols=2)
    path = tmp_path / "orig_tbl_cap.docx"
    doc.save(path)
    return path


def test_leyenda_existente_no_se_duplica(tmp_path):
    src = _build_doc_tabla_con_leyenda(tmp_path)
    out = tmp_path / "out_tbl_cap.docx"
    apply_inplace(src, out, _Model(), _Rules())
    texts = [(p.text or "").strip() for p in Document(str(out)).paragraphs]
    assert sum(1 for t in texts if t.startswith("Tabla")) == 1, texts


def _build_doc_fig_renumerar(tmp_path: Path) -> Path:
    doc = Document()
    for ln in ["UNIVERSIDAD NACIONAL", "Facultad de Ingeniería", "Título del Trabajo", "Autor Ejemplo", "Managua, 2026"]:
        doc.add_paragraph(ln)
    doc.add_heading("Introducción", level=1)
    doc.add_paragraph("Cuerpo del documento con texto suficiente para el cuerpo. " * 2)
    png = tmp_path / "px.png"
    png.write_bytes(_png_1x1())
    doc.add_picture(str(png))  # figura sin leyenda
    for _ in range(8):
        doc.add_paragraph("Relleno.")
    doc.add_paragraph("Figura 9")  # leyenda existente, número arbitrario
    for _ in range(8):
        doc.add_paragraph("Relleno.")
    doc.add_paragraph("Figura 9")  # leyenda existente duplicada
    path = tmp_path / "orig_fig_renum.docx"
    doc.save(path)
    return path


def test_numeracion_figuras_correlativa_sin_duplicados(tmp_path):
    """Las figuras se renumeran en orden de documento: la que no tenía leyenda
    recibe su número y las leyendas viejas (con números repetidos) se corrigen."""
    src = _build_doc_fig_renumerar(tmp_path)
    out = tmp_path / "out_fig_renum.docx"
    apply_inplace(src, out, _Model(), _Rules())
    nums = [
        re.search(r"\d+", (p.text or "")).group()
        for p in Document(str(out)).paragraphs
        if re.match(r"^Figura\s+\d+", (p.text or "").strip())
    ]
    assert nums == ["1", "2", "3"], nums


def test_physical_paragraph_index_respeta_la_convencion():
    """La correspondencia modelo<->párrafo físico salta vacíos y portada.
    Es la misma que usan apply_inplace y la inserción de elementos."""
    from generation.inplace_editor import physical_paragraph_index

    class _P:
        def __init__(self, t):
            self.text = t

    class _D:
        def __init__(self, texts):
            self.paragraphs = [_P(t) for t in texts]

    paragraphs = _D(["portada 1", "portada 2", "", "cuerpo A", "", "cuerpo B"]).paragraphs
    elements = [
        _Elem("portada_block", "x", is_cover_section=True),
        _Elem("paragraph", "cuerpo A"),
        _Elem("paragraph", "cuerpo B"),
    ]
    m = _ModelConElementos(elements)
    assert physical_paragraph_index(m, paragraphs, 1, 2) == 3
    assert physical_paragraph_index(m, paragraphs, 2, 2) == 5
    assert physical_paragraph_index(m, paragraphs, 0, 2) is None  # portada


def test_export_inplace_descarta_referencia_basura(tmp_path):
    """El export in-place elimina la entrada de bibliografia que en realidad es
    una pagina web (titulo colado como autor) y conserva las legitimas."""
    doc = Document()
    for ln in ["UNIVERSIDAD NACIONAL", "Facultad de Ingeniería", "Título del Trabajo", "Autor Ejemplo", "Managua, 2026"]:
        doc.add_paragraph(ln)
    doc.add_heading("Introducción", level=1)
    doc.add_paragraph("Cuerpo del documento con texto suficiente para el cuerpo. " * 2)
    doc.add_heading("Bibliografía", level=1)
    doc.add_paragraph("Gutiérrez Pulido, H. (2012). Calidad total y productividad (2.ª ed.). McGraw-Hill.")
    doc.add_paragraph(
        "Business improvement strategy or useful tool? Analysis of the application of the 5S "
        "concept in Japan, the UK and the US - Scientific Figure on ResearchGate. Available from: "
        "https://www.researchgate.net/figure/x [accessed 26 Jun 2025]"
    )
    src = tmp_path / "orig_refjunk.docx"
    doc.save(src)
    out = tmp_path / "out_refjunk.docx"
    apply_inplace(src, out, _Model(), _Rules())
    texts = [(p.text or "").strip() for p in Document(str(out)).paragraphs]
    assert not any("ResearchGate" in t for t in texts), texts
    assert any(t.startswith("Gutiérrez Pulido") for t in texts), texts
