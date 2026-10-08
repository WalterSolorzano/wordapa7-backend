"""
WordAPA7 — Motor de Trasplante Quirúrgico de Portada OpenXML (Metodologías A + B)

Combina:
- Metodología A: Clonación directa de nodos XML puros (<w:p>, <w:tbl>, <w:sdt>, <w:drawing>, <v:shape>)
  y transferencia de relaciones rId (imágenes, gráficos, logos) directamente en la estructura ZIP/OpenXML.
- Metodología B: Inserción de un salto de sección w:sectPr independiente (nextPage) al final de la portada,
  desvinculando encabezados y pies de página (linkToPrevious=False) para blindar la portada frente a los
  márgenes e interlineado 2.0 APA 7 del cuerpo del trabajo.

Funciona nativamente en Python en Windows, Linux y macOS sin requerir Word COM.
"""

import os
import shutil
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional, Set

from docx import Document
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn, nsdecls

logger = logging.getLogger(__name__)

# Nombres de espacio OpenXML relevantes
NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main"
NS_V = "urn:schemas-microsoft-com:vml"


def find_all_rel_ids(xml_element) -> Set[str]:
    """Busca todas las referencias a r:id, r:embed, r:link en un subárbol XML."""
    rel_ids = set()
    for el in xml_element.iter():
        for attr_name, attr_val in el.attrib.items():
            if attr_name.endswith("}id") or attr_name.endswith("}embed") or attr_name.endswith("}link"):
                if attr_val and isinstance(attr_val, str) and attr_val.startswith("rId"):
                    rel_ids.add(attr_val)
    return rel_ids


def remap_rel_ids(xml_element, id_map: Dict[str, str]) -> None:
    """Reemplaza los rId antiguos por los nuevos rId en el subárbol XML."""
    for el in xml_element.iter():
        for attr_name, attr_val in list(el.attrib.items()):
            if attr_name.endswith("}id") or attr_name.endswith("}embed") or attr_name.endswith("}link"):
                if attr_val in id_map:
                    el.attrib[attr_name] = id_map[attr_val]


def transfer_cover_relationships(src_doc: Document, dst_doc: Document, cover_elements: List[Any]) -> Dict[str, str]:
    """Copia las partes de medios (imágenes, logos) referenciadas en la portada
    desde src_doc a dst_doc y devuelve un mapa de rId antiguo -> nuevo rId.
    """
    id_map: Dict[str, str] = {}
    src_rels = src_doc.part.rels

    for elem in cover_elements:
        rel_ids = find_all_rel_ids(elem)
        for old_rid in rel_ids:
            if old_rid in id_map:
                continue
            rel = src_rels.get(old_rid)
            if rel is None:
                continue

            try:
                # Si la relación apunta a una parte binaria (imagen, logo, etc.)
                if hasattr(rel, "target_part") and rel.target_part is not None:
                    target_part = rel.target_part
                    new_rel = dst_doc.part.relate_to(target_part, rel.reltype)
                    id_map[old_rid] = new_rel.rId
                elif hasattr(rel, "target_ref"):
                    # Relación externa (hyperlink, etc.)
                    new_rel = dst_doc.part.relate_to(rel.target_ref, rel.reltype, is_external=True)
                    id_map[old_rid] = new_rel.rId
            except Exception as e:
                logger.warning(f"[OpenXML Cover] Error transfiriendo relación {old_rid}: {e}")

    return id_map


def create_isolated_section_break() -> parse_xml:
    """Crea un salto de sección OpenXML independiente (w:sectPr con nextPage).
    Aísla la portada para que el interlineado 2.0 y márgenes del cuerpo no la afecten.
    """
    xml_str = (
        f'<w:p {nsdecls("w")}>'
        f'  <w:pPr>'
        f'    <w:sectPr>'
        f'      <w:type w:val="nextPage"/>'
        f'      <w:docPartObj/>'
        f'    </w:sectPr>'
        f'  </w:pPr>'
        f'</w:p>'
    )
    return parse_xml(xml_str)


def splice_cover_with_openxml(
    original_path: Path | str,
    generated_path: Path | str,
    output_path: Path | str,
    body_start_idx: Optional[int] = None,
) -> bool:
    """Ejecuta el trasplante quirúrgico de portada combinando Metodología A y B.

    1. Abre original_path y extrae el bloque de nodos de portada.
    2. Transfiere todas las imágenes/relaciones rId hacia generated_path.
    3. Inyecta los nodos de portada al inicio de generated_path.
    4. Inserta un salto de sección w:sectPr (Metodología B) desvinculado.
    5. Guarda en output_path.
    """
    orig_path = Path(original_path)
    gen_path = Path(generated_path)
    out_path = Path(output_path)

    if not orig_path.exists() or not gen_path.exists():
        logger.error("[OpenXML Cover] Archivo original o generado no existe.")
        return False

    try:
        orig_doc = Document(str(orig_path))
        gen_doc = Document(str(gen_path))

        orig_body = orig_doc.element.body
        gen_body = gen_doc.element.body

        # ── 1. Determinar elementos de la portada ────────────────────────────
        cover_nodes: List[Any] = []
        count = 0
        limit = body_start_idx if (body_start_idx is not None and body_start_idx > 0) else 15

        for child in orig_body:
            # Omitir el sectPr final del body
            if child.tag.endswith("sectPr"):
                continue
            
            has_sect_pr = bool(child.xpath("w:pPr/w:sectPr"))
            cover_nodes.append(child)
            count += 1

            if has_sect_pr or count >= limit:
                break

        if not cover_nodes:
            logger.warning("[OpenXML Cover] No se encontraron nodos de portada en el original.")
            shutil.copy(gen_path, out_path)
            return False

        # ── 2. Clonar relaciones rId e imágenes ─────────────────────────────
        id_map = transfer_cover_relationships(orig_doc, gen_doc, cover_nodes)

        # ── 3. Inyectar nodos de portada en el documento generado ────────────
        insert_idx = 0
        for node in cover_nodes:
            cloned = parse_xml(node.xml)
            if id_map:
                remap_rel_ids(cloned, id_map)
            gen_body.insert(insert_idx, cloned)
            insert_idx += 1

        # ── 4. Insertar Salto de Sección Aislado (Metodología B) ─────────────
        sect_break = create_isolated_section_break()
        gen_body.insert(insert_idx, sect_break)

        # ── 5. Desvincular encabezados de la Sección 2 (cuerpo APA 7) ─────────
        try:
            if len(gen_doc.sections) > 1:
                body_section = gen_doc.sections[1]
                body_section.header.is_linked_to_previous = False
                body_section.footer.is_linked_to_previous = False
        except Exception as se:
            logger.warning(f"[OpenXML Cover] No se pudo desvincular encabezados de sección 2: {se}")

        gen_doc.save(str(out_path))
        logger.info(f"[OpenXML Cover] Portada transplantada con éxito ({len(cover_nodes)} nodos, {len(id_map)} relaciones) -> {out_path.name}")
        return True

    except Exception as e:
        logger.error(f"[OpenXML Cover] Falló el trasplante OpenXML: {e}", exc_info=True)
        try:
            shutil.copy(gen_path, out_path)
        except Exception:
            pass
        return False
