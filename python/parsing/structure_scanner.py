"""
WordAPA7 — Scanner de Estructura XML Profunda (Deep XML Scanner with lxml)

Recorre el documento XML completo de un archivo .docx para catalogar y extraer
textos en contenedores especiales que python-docx no puede ver por defecto:
- Shapes y Cajas de Texto (<wps:wsp>, <wps:txbxContent>)
- Grupos de Dibujo (<wpg:wgp>)
- Controles de Contenido (<w:sdt>)
- Campos de Word (<w:instrText>)

Reglas de Deduplicación:
- Nodos dentro de <mc:Fallback> son ignorados (previene la duplicación 2x de textos en Word moderno).
- Nodos dentro de <w:instrText> son preservados como código de campo opaco de solo lectura.
"""

import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import List

from lxml import etree

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
MC_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006"
WPS_NS = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
WPG_NS = "http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"

NS_MAP = {
    'w': W_NS,
    'mc': MC_NS,
    'wps': WPS_NS,
    'wpg': WPG_NS,
}


@dataclass
class TextNodeInfo:
    text: str
    container_type: str
    xpath: str
    is_editable: bool = True
    is_fallback: bool = False
    is_field_code: bool = False


def _get_container_type(element: etree._Element) -> str:
    """Determina el tipo de contenedor XML de un elemento."""
    parent = element.getparent()
    while parent is not None:
        tag = parent.tag
        if isinstance(tag, str):
            if tag.endswith("txbxContent"):
                return "shape_textbox"
            elif tag.endswith("wgp"):
                return "shape_group"
            elif tag.endswith("sdt"):
                return "content_control"
            elif tag.endswith("tbl"):
                return "table_cell"
            elif tag.endswith("instrText"):
                return "field_code"
            elif tag.endswith("Fallback"):
                return "vml_legacy"
        parent = parent.getparent()
    return "body_paragraph"


def scan_document_xml_nodes(docx_path: Path | str) -> List[TextNodeInfo]:
    """
    Lee word/document.xml del archivo .docx y retorna la lista deduplicada
    de todos los nodos de texto real con su tipo de contenedor y ruta XPath.
    """
    docx_path = Path(docx_path)
    if not docx_path.exists():
        return []

    nodes: List[TextNodeInfo] = []

    try:
        with zipfile.ZipFile(docx_path, 'r') as zf:
            if "word/document.xml" not in zf.namelist():
                return []
            xml_bytes = zf.read("word/document.xml")

        root = etree.fromstring(xml_bytes)
        tree = root.getroottree()

        # Iterar sobre todos los elementos <w:t>
        for t_node in root.xpath("//w:t", namespaces=NS_MAP):
            text_val = t_node.text or ""
            container_type = _get_container_type(t_node)
            xpath = tree.getpath(t_node)

            # Verificar si está en la rama mc:Fallback (descartar para evitar duplicados)
            is_fallback = container_type == "vml_legacy"
            if is_fallback:
                continue

            is_field_code = container_type == "field_code"
            is_editable = not is_field_code

            nodes.append(TextNodeInfo(
                text=text_val,
                container_type=container_type,
                xpath=xpath,
                is_editable=is_editable,
                is_fallback=is_fallback,
                is_field_code=is_field_code
            ))

    except Exception as err:
        print(f"[WARN] Error escaneando XML profundo en {docx_path}: {err}")

    return nodes


def extract_textbox_texts(docx_path: Path | str) -> List[str]:
    """
    Extrae únicamente los textos pertenecientes a cuadros de texto (<wps:txbxContent>)
    y grupos de dibujo (<wpg:wgp>) deduplicados.
    """
    nodes = scan_document_xml_nodes(docx_path)
    textbox_texts: List[str] = []

    current_block: List[str] = []
    for n in nodes:
        if n.container_type in ("shape_textbox", "shape_group") and n.text.strip():
            current_block.append(n.text)
        else:
            if current_block:
                textbox_texts.append(" ".join(current_block))
                current_block = []

    if current_block:
        textbox_texts.append(" ".join(current_block))

    return textbox_texts
