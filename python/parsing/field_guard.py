"""
WordAPA7 — Guardián de Campos Nativos y Tabla de Contenidos (Field Guard)

Protege campos nativos de Word (<w:instrText>, TOC, PAGEREF, CITATION) tratándolos
como contenido opaco de solo lectura.

Si el documento resultante requiere que Word actualice sus campos dinámicos
(ej. números de página del índice), setea <w:updateFields w:val="true"/>
en word/settings.xml para que Word los recalcule automáticamente al abrir el archivo.
"""

import zipfile
from pathlib import Path

from lxml import etree

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS_MAP = {'w': W_NS}


def enable_word_update_fields(docx_path: Path | str) -> bool:
    """
    Inserta o actualiza <w:updateFields w:val="true"/> en word/settings.xml
    dentro del archivo .docx.
    """
    docx_path = Path(docx_path)
    if not docx_path.exists():
        return False

    temp_zip_path = docx_path.with_suffix(".tmp.zip")

    try:
        with zipfile.ZipFile(docx_path, 'r') as xin:
            with zipfile.ZipFile(temp_zip_path, 'w', zipfile.ZIP_DEFLATED) as xout:
                for item in xin.infolist():
                    data = xin.read(item.filename)
                    if item.filename == "word/settings.xml":
                        try:
                            tree = etree.fromstring(data)
                            update_fields = tree.find(f"{{{W_NS}}}updateFields")
                            if update_fields is None:
                                update_fields = etree.SubElement(tree, f"{{{W_NS}}}updateFields")
                            update_fields.set(f"{{{W_NS}}}val", "true")
                            data = etree.tostring(tree, xml_declaration=True, encoding="UTF-8")
                        except Exception as e:
                            print(f"[WARN] Error actualizando settings.xml: {e}")
                    # Timestamp fijo para salida determinística (idempotencia de hash)
                    zi = zipfile.ZipInfo(item.filename, date_time=(1980, 1, 1, 0, 0, 0))
                    zi.compress_type = zipfile.ZIP_DEFLATED
                    zi.external_attr = item.external_attr
                    xout.writestr(zi, data)

        temp_zip_path.replace(docx_path)
        return True

    except Exception as err:
        print(f"[WARN] Error en enable_word_update_fields: {err}")
        if temp_zip_path.exists():
            temp_zip_path.unlink()
        return False
