"""Generador de corpus sintetico OOXML para investigacion de viabilidad.

Crea .docx con variantes de portada + cuerpo estandar, registrando en
meta.json el ground-truth: cuantos hijos iniciales de w:body pertenecen
a la portada y que tipo de estructura tiene cada variante.
"""
from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "python"))

import docx
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Cm, Pt

OUT = Path(__file__).resolve().parents[1] / "corpus"

import base64

TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)

BODY_SENTINEL = "INICIO-DEL-CUERPO-SENTINEL"


def _tiny_image_part(doc):
    from docx.shared import Emu
    from docx.parts.image import ImagePart
    from io import BytesIO
    image = ImagePart.from_file(doc.part.package, BytesIO(TINY_PNG)) if False else None
    # python-docx moderno: usar run.add_picture con BytesIO directamente
    return None


def add_body(doc):
    """Cuerpo estandar identico para todas las variantes."""
    p = doc.add_paragraph(BODY_SENTINEL)
    p.style = doc.styles["Normal"]
    h = doc.add_heading("Introduccion", level=1)
    doc.add_paragraph(
        "El presente trabajo analiza la productividad mediante el estudio de metodos "
        "y tiempos aplicado al proceso productivo, con enfasis en ergonomia laboral."
    )
    bullets = doc.add_paragraph("Punto uno de la lista")
    bullets.style = doc.styles["List Bullet"]
    n = doc.add_paragraph("Paso numerado uno")
    n.style = doc.styles["List Number"]
    t = doc.add_table(rows=3, cols=3)
    t.cell(0, 0).text = "Actividad"
    t.cell(0, 1).text = "Tiempo (s)"
    t.cell(0, 2).text = "Frecuencia"
    cap = doc.add_paragraph()
    r = cap.add_run()
    r.add_picture(BytesIO := __import__("io").BytesIO(TINY_PNG), width=Cm(4))
    doc.add_paragraph("Figura 1. Diagrama del proceso.")


# ── variantes de portada ──────────────────────────────────────────────────────

def cover_plaintext(doc):
    for line in ("UNIVERSIDAD NACIONAL", "Facultad de Ingenieria",
                 "Proyecto de Estudio del Trabajo", "Br. Autor Uno",
                 "Carnet: 2022-0000X", "1 de enero de 2025"):
        p = doc.add_paragraph(line)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    return 6


def cover_table_logo(doc):
    n = 0
    t = doc.add_table(rows=2, cols=2)
    t.rows[0].cells[0].paragraphs[0].add_run().add_picture(
        __import__("io").BytesIO(TINY_PNG), width=Cm(2))
    t.rows[0].cells[1].text = "LOGO DERECHO"
    t.rows[1].cells[0].merge(t.rows[1].cells[1]).text = "UNIVERSIDAD CON TABLA"
    n += 1  # tabla cuenta como 1 hijo
    for line in ("Titulo centrado sobre tabla", "Autor Principal"):
        p = doc.add_paragraph(line); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; n += 1
    return n


TEXTBOX_XML = (
    '<w:p {ns}><w:r><w:t>ANTES-DEL-TEXTBOX</w:t></w:r></w:p>'
    '<w:p {ns}><mc:AlternateContent>'
    '<mc:Choice Requires="wps"><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="1" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">'
    '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH>'
    '<wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>'
    '<wp:extent cx="3600000" cy="900000"/><wp:wrapNone/>'
    '<wp:docPr id="91" name="TxBoxPortada"/>'
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">'
    '<wps:wsp><wps:txbx><w:txbxContent><w:p><w:r><w:t>AUTOR-EN-TEXTBOX-UNO</w:t></w:r></w:p>'
    '<w:p><w:r><w:t>AUTOR-EN-TEXTBOX-DOS</w:t></w:r></w:p></w:txbxContent></wps:txbx>'
    '<wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice>'
    '<mc:Fallback><w:pict><v:shape xmlns:v="urn:schemas-microsoft-com:vml" style="width:283pt;height:70pt">'
    '<v:textbox><w:txbxContent><w:p><w:r><w:t>AUTOR-EN-TEXTBOX-UNO</w:t></w:r></w:p>'
    '<w:p><w:r><w:t>AUTOR-EN-TEXTBOX-DOS</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></mc:Fallback>'
    '</mc:AlternateContent></w:p>'
    '<w:p {ns}><w:r><w:t>TITULO-TRAS-TEXTBOX</w:t></w:r></w:p>'
)

def cover_textbox_nested(doc):
    xml = TEXTBOX_XML.format(ns=nsdecls("w", "mc", "wp"))
    frag = parse_xml(f"<w:root {nsdecls('w')}>" + "</w:root>".join([""]) and
                     f'<w:dummy {nsdecls("w")}/>')  # placeholder, reemplazo abajo
    # insertar fragmentos: parse_xml exige raiz unica -> envolver en sdt dummy y extraer hijos
    wrapper = parse_xml(f'<w:p {nsdecls("w", "mc", "wp")}>{TEXTBOX_XML.format(ns=nsdecls("w", "mc", "wp")).split(">", 1)[1].rsplit("<", 1)[0]}</w:p>')
    # Enfoque robusto: construir por partes
    return -1  # marcador; construccion real en build()


def _build_textbox_variant(doc):
    """Inserta AlternateContent real dentro de un parrafo existente."""
    NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' \
         'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' \
         'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
    anchor_inner = (
        '<w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" '
        'relativeHeight="1" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">'
        '<wp:simplePos x="0" y="0"/>'
        '<wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH>'
        '<wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>'
        '<wp:extent cx="3600000" cy="900000"/><wp:wrapNone/>'
        '<wp:docPr id="91" name="TxBoxPortada"/>'
        '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
        '<a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">'
        '<wps:wsp xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">'
        '<wps:txbx><w:txbxContent>'
        '<w:p><w:r><w:t>AUTOR-EN-TEXTBOX-UNO</w:t></w:r></w:p>'
        '<w:p><w:r><w:t>AUTOR-EN-TEXTBOX-DOS</w:t></w:r></w:p>'
        '</w:txbxContent></wps:txbx><wps:bodyPr/></wps:wsp>'
        '</a:graphicData></a:graphic></wp:anchor></w:drawing>'
    )
    choice = f'<mc:Choice Requires="wps">{anchor_inner}</mc:Choice>'
    fallback = (
        '<mc:Fallback><w:pict><v:shape xmlns:v="urn:schemas-microsoft-com:vml" '
        'style="width:283pt;height:70pt"><v:textbox><w:txbxContent>'
        '<w:p><w:r><w:t>AUTOR-EN-TEXTBOX-UNO</w:t></w:r></w:p>'
        '<w:p><w:r><w:t>AUTOR-EN-TEXTBOX-DOS</w:t></w:r></w:p>'
        '</w:txbxContent></v:textbox></v:shape></w:pict></mc:Fallback>'
    )
    host = doc.add_paragraph()
    ac = parse_xml(
        f'<mc:AlternateContent {NS} xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">'
        f'{choice}{fallback}</mc:AlternateContent>'
    )
    host._p.append(ac)
    p2 = doc.add_paragraph("TITULO-TRAS-TEXTBOX"); p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    return 2  # host + titulo


def cover_floating_image(doc):
    n = 0
    p = doc.add_paragraph()
    r = p.add_run(); r.add_picture(__import__("io").BytesIO(TINY_PNG), width=Cm(3))
    # convertir inline a anchor flotante: suficiente para el corpus que exista wp:anchor aparte
    drawing = p._p.findall(".//" + qn("w:drawing"))
    if drawing:
        inline = drawing[0].find(qn("wp:inline"))
        if inline is not None:
            inline.tag = qn("wp:anchor")
            for tag, attrs in (("wp:simplePos", {}), ("wp:positionH", None), ("wp:positionV", None)):
                pass
            from lxml import etree
            W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            pos_h = etree.SubElement(inline, f"{{{WP}}}positionH"); pos_h.set("relativeFrom", "column")
            off = etree.SubElement(pos_h, f"{{{WP}}}posOffset"); off.text = "0"
            pos_v = etree.SubElement(inline, f"{{{WP}}}positionV"); pos_v.set("relativeFrom", "paragraph")
            off2 = etree.SubElement(pos_v, f"{{{WP}}}posOffset"); off2.text = "0"
            sp = etree.Element(f"{{{WP}}}simplePos"); sp.set("x", "0"); sp.set("y", "0")
            inline.insert(0, sp)
    n += 1
    for line in ("PORTADA-CON-IMAGEN-FLOTANTE", "Segundo Autor"):
        p = doc.add_paragraph(line); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; n += 1
    return n


def cover_multiline_mixed(doc):
    n = cover_table_logo(doc)
    m = _build_textbox_variant(doc)
    p = doc.add_paragraph("FECHA-MIXTA: 15 de marzo de 2025")
    return n + m + 1


VARIANTS = {
    "plaintext": cover_plaintext,
    "table_logo": cover_table_logo,
    "textbox_nested": lambda doc: _build_textbox_variant(doc),
    "floating_image": cover_floating_image,
    "mixed": cover_multiline_mixed,
}


def build_all():
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {}
    for name, fn in VARIANTS.items():
        doc = docx.Document()
        n_cover = fn(doc)
        add_body(doc)
        path = OUT / f"{name}.docx"
        doc.save(str(path))
        meta[name] = {"cover_children": n_cover, "sentinel": BODY_SENTINEL,
                      "structures": name}
    (OUT / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    build_all()
