"""
WordAPA7 — Parser de XML profundo para DOCX

Maneja:
1. `sanitize_numbering_xml`: Sanitización del zip docx para evitar fallos de python-docx
   cuando w:numId apunta a definiciones inexistentes.
2. `extract_textboxes_xml`: Extracción de cajas de texto (w:txbxContent).
3. `preserve_landscape_sections`: Detección de secciones en modo horizontal para preservar sus márgenes.
"""

import io
import zipfile
from typing import Any, Dict, List, Tuple
from xml.etree import ElementTree as ET

NAMESPACES = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture',
    'v': 'urn:schemas-microsoft-com:vml',
    'wps': 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
    'mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
}


def process_numbering_single_pass(docx_bytes: bytes) -> Tuple[bytes, dict[str, str]]:
    """
    Realiza en un solo paso:
    1. La sanitizacion de referencias abstractNumId rotas.
    2. La extraccion del mapa numId -> numFmt.
    Retorna (docx_bytes_sanitizados, numbering_type_map)
    """
    W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    result_map: dict[str, str] = {}

    try:
        in_stream = io.BytesIO(docx_bytes)
        out_stream = io.BytesIO()

        with zipfile.ZipFile(in_stream, 'r') as in_zip:
            if 'word/numbering.xml' not in in_zip.namelist():
                return docx_bytes, result_map

            numbering_xml = in_zip.read('word/numbering.xml')
            root = ET.fromstring(numbering_xml)

            # PARTE 1: Mapping numId -> numFmt
            num_to_ab: dict[str, str] = {}
            for num_elem in root.findall(f'.//{{{W_NS}}}num'):
                num_id = num_elem.attrib.get(f'{{{W_NS}}}numId')
                ab_ref = num_elem.find(f'{{{W_NS}}}abstractNumId')
                if num_id and ab_ref is not None:
                    ab_id = ab_ref.attrib.get(f'{{{W_NS}}}val')
                    if ab_id:
                        num_to_ab[num_id] = ab_id

            ab_to_fmt: dict[str, str] = {}
            for ab_elem in root.findall(f'.//{{{W_NS}}}abstractNum'):
                ab_id = ab_elem.attrib.get(f'{{{W_NS}}}abstractNumId')
                for lvl in ab_elem.findall(f'.//{{{W_NS}}}lvl'):
                    ilvl = lvl.attrib.get(f'{{{W_NS}}}ilvl', '0')
                    if ilvl == '0':
                        numFmt = lvl.find(f'{{{W_NS}}}numFmt')
                        if numFmt is not None:
                            ab_to_fmt[ab_id] = numFmt.attrib.get(f'{{{W_NS}}}val', 'bullet')
                        break

            for num_id, ab_id in num_to_ab.items():
                result_map[num_id] = ab_to_fmt.get(ab_id, 'bullet')

            # PARTE 2: Sanitizacion
            abstract_ids = set()
            for elem in root.findall(f'.//{{{W_NS}}}abstractNum'):
                ab_id = elem.attrib.get(f'{{{W_NS}}}abstractNumId')
                if ab_id:
                    abstract_ids.add(ab_id)

            modified = False
            for num_elem in list(root.findall(f'.//{{{W_NS}}}num')):
                ab_ref = num_elem.find(f'.//{{{W_NS}}}abstractNumId')
                if ab_ref is not None:
                    ref_val = ab_ref.attrib.get(f'{{{W_NS}}}val')
                    if ref_val and ref_val not in abstract_ids:
                        root.remove(num_elem)
                        modified = True

            if not modified:
                return docx_bytes, result_map

            # Reconstruir zip con numbering.xml sanitizado
            new_numbering_bytes = ET.tostring(root, encoding='utf-8', xml_declaration=True)

            with zipfile.ZipFile(out_stream, 'w', zipfile.ZIP_DEFLATED) as out_zip:
                for item in in_zip.infolist():
                    if item.filename == 'word/numbering.xml':
                        out_zip.writestr(item, new_numbering_bytes)
                    else:
                        out_zip.writestr(item, in_zip.read(item.filename))

            return out_stream.getvalue(), result_map
    except Exception as err:
        print(f"[WARN] Error en process_numbering_single_pass: {err}")
        return docx_bytes, result_map


def extract_textbox_paragraphs(doc_element) -> List[str]:
    """
    Extrae texto contenido dentro de cuadros de texto (w:txbxContent).

    IMPORTANTE: usa SOLO la rama mc:Choice (DrawingML wps:txbx) y NUNCA la
    rama mc:Fallback (VML legacy v:textbox), porque Word guarda el MISMO
    contenido en ambas ramas y, ademas, dentro del Fallback anida textboxes
    VML con gfxdata. Leer ambas ramas triplica el texto ("Br. Nombre" x3).

    Para cada w:txbxContent toma unicamente los w:p hijos DIRECTOS y, dentro
    de cada uno, extrae solo w:t que NO esten bajo un mc:Fallback ni dentro
    de un w:txbxContent anidado. Convierte <w:br/> en salto de linea y
    <w:tab/> en tabulador.
    Resultados deduplicados usando un conjunto de textos normalizados.
    """
    seen: set[str] = set()
    textbox_texts: List[str] = []
    W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006'
    try:
        if not hasattr(doc_element, '_element'):
            return textbox_texts
        root = doc_element._element
        for txbx in root.iter(f'{{{W}}}txbxContent'):
            # Saltar textboxes VML de la rama Fallback
            parent = txbx.getparent()
            in_fallback = False
            while parent is not None:
                if parent.tag == f'{{{MC}}}Fallback':
                    in_fallback = True
                    break
                parent = parent.getparent()
            if in_fallback:
                continue

            for p in txbx.findall(f'{{{W}}}p'):
                parts: List[str] = []
                for el in p.iter():
                    tag = el.tag.split('}')[-1] if '}' in el.tag else el.tag
                    # No bajar dentro de textboxes anidados ni ramas VML
                    if tag in ('txbxContent', 'Fallback', 'pict'):
                        continue
                    if tag == 't' and el.text:
                        parts.append(el.text)
                    elif tag == 'br':
                        parts.append('\n')
                    elif tag == 'tab':
                        parts.append('\t')
                text = ''.join(parts).strip()
                if text and len(text) > 1:
                    # Dividir por <w:br/> para no mezclar nombre y carnet en una misma linea
                    for line in text.split('\n'):
                        line = line.strip().replace('\t', ' ')
                        if len(line) > 1:
                            norm = line.lower().replace('  ', ' ').strip()
                            if norm not in seen:
                                seen.add(norm)
                                textbox_texts.append(line)
    except Exception as e:
        print(f"[WARN] Error en extract_textbox_paragraphs: {e}")
    return textbox_texts


def extract_unique_textbox_pairs(textbox_texts: List[str]) -> List[dict]:
    """
    Agrupa textos de textboxes en pares (nombre + carnet/grupo) detectando
    patrones como 'Br. Nombre Apellido', 'Carnet: 2023-XXXX', 'Grupo: XXX'.
    Retorna lista de dicts con 'name', 'id' (carnet), 'role', 'group'.
    """
    import re
    members: List[dict] = []
    current: dict = {}

    for text in textbox_texts:
        t = text.strip()
        t_lower = t.lower()

        # Detectar patrón "Br. Nombre Apellido Apellido"
        if t_lower.startswith('br.'):
            # Finalizar miembro anterior si existe
            if current.get('name'):
                members.append(current)
            current = {'name': t, 'id': '', 'role': 'br.', 'group': ''}
            # Puede venir "Br. Nombre Carnet: XXXX" en la MISMA linea
            if 'carnet:' in t_lower:
                import re as _re
                m_car = _re.search(r'carnet:\s*(\S+)', t, _re.IGNORECASE)
                if m_car:
                    current['id'] = m_car.group(1)
                    current['name'] = _re.sub(r'carnet:\s*\S+', '', t, flags=_re.IGNORECASE).strip()

        # Detectar patrón "Ing. Nombre"
        elif t_lower.startswith('ing.') or t_lower.startswith('m.sc.') or t_lower.startswith('dr.'):
            if current.get('name'):
                members.append(current)
                current = {}
            # Es un tutor/docente - guardar separadamente
            members.append({'name': t, 'id': '', 'role': 'tutor', 'group': ''})
            current = {}

        # Detectar "Carnet: XXXX" o número de carnet
        elif 'carnet:' in t_lower:
            carnet_val = t.split(':', 1)[-1].strip() if ':' in t else t
            if current.get('name') and not current['name'].startswith(('ing.', 'm.sc.', 'dr.')):
                current['id'] = carnet_val
            else:
                # Si no hay nombre actual, guardar como suplemento
                current['carnet_raw'] = carnet_val

        # Detectar "Grupo: XXX"
        elif 'grupo:' in t_lower:
            group_val = t.split(':', 1)[-1].strip() if ':' in t else t
            if current.get('name'):
                current['group'] = group_val
            else:
                current = {'name': '', 'id': '', 'role': '', 'group': group_val}

        # Detectar fecha (pero NO si parece carnet)
        elif re.search(r'(20\d{2})', t) and not re.search(r'\d{4}[-]\d{4}', t):
            # Guardar miembro actual primero si existe
            if current.get('name'):
                members.append(current)
            members.append({'name': t, 'id': '', 'role': 'date', 'group': ''})
            current = {}

        else:
            # Texto sin clasificar - puede ser continuación del nombre
            if current.get('name') and not current.get('id'):
                pass  # Ignorar textos intermedios
            elif current.get('name'):
                members.append(current)
                current = {}

    # Finalizar último miembro
    if current.get('name'):
        members.append(current)

    return members


def find_body_start_via_xml(docx_bytes: bytes) -> int:
    """
    Lee el XML del documento directamente para encontrar el primer párrafo
    que marca el inicio del cuerpo (no portada).

    Busca:
    - Primer heading o keyword académico (introducción, resumen, etc.)
    - Párrafos largos (+35 palabras)

    Retorna el índice del primer párrafo de cuerpo en la lista de párrafos del documento.
    """
    import io
    import zipfile
    from xml.etree import ElementTree as ET

    W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

    BODY_KEYWORDS = [
        "introduccion", "introducción", "resumen", "abstract",
        "metodologia", "metodología", "resultados", "discusion",
        "discusión", "conclusion", "conclusión", "conclusiones",
        "referencias", "bibliografia", "bibliografía", "anexo",
        "capitulo", "capítulo", "marco teorico", "marco teórico",
        "antecedentes", "planteamiento", "justificacion",
        "justificación"
    ]

    try:
        with zipfile.ZipFile(io.BytesIO(docx_bytes), 'r') as z:
            if 'word/document.xml' not in z.namelist():
                return 0
            doc_xml = z.read('word/document.xml')
            root = ET.fromstring(doc_xml)
            body = root.find(f'{{{W_NS}}}body')
            if body is None:
                return 0

            paras = list(body)
            for i, child in enumerate(paras):
                tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
                if tag != 'p':
                    continue

                # Extraer texto completo
                texts = []
                for t in child.iter(f'{{{W_NS}}}t'):
                    if t.text:
                        texts.append(t.text)
                text = ''.join(texts).strip()

                if not text:
                    continue

                text_lower = text.lower()
                word_count = len(text.split())

                # Palabras clave de cuerpo académico
                for kw in BODY_KEYWORDS:
                    if kw in text_lower:
                        return i

                # Párrafos largos (+35 palabras) son cuerpo
                if word_count > 35:
                    return i

                # Heading numerado (1., 1.1., I.)
                import re
                if re.match(r'^(?:\d+\.){1,4}\d*\s', text_lower) and word_count <= 15:
                    return i

            # Si no se encontró, estimar: volver índice del primer texto sustancial
            for i, child in enumerate(paras):
                tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
                if tag != 'p':
                    continue
                texts = []
                for t in child.iter(f'{{{W_NS}}}t'):
                    if t.text:
                        texts.append(t.text)
                text = ''.join(texts).strip()
                if len(text.split()) >= 5:
                    return i
    except Exception as e:
        print(f"[WARN] Error en find_body_start_via_xml: {e}")

    return 0


def _deduplicate_textbox_texts(textbox_texts: List[str]) -> List[str]:
    """
    Deduplica textos de textboxes basado en contenido normalizado.
    Los textboxes suelen aparecer duplicados (Choice + Fallback en AlternateContent).
    """
    seen: set[str] = set()
    result: List[str] = []
    for t in textbox_texts:
        norm = t.lower().replace('  ', ' ').strip()
        if norm not in seen:
            seen.add(norm)
            result.append(t)
    return result


def is_inside_textbox_or_shape(element) -> bool:
    """
    Verifica si un elemento XML esta dentro de un cuadro de texto (w:txbxContent)
    o una forma de Word (wps:wsp). Util para descartar imagenes decorativas de portada.
    """
    parent = element
    wps_ns = 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape'
    wpg_ns = 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup'
    while parent is not None:
        tag = parent.tag.split('}')[-1] if '}' in parent.tag else parent.tag
        if tag in ('txbxContent', 'wsp', 'wgp'):
            return True
        # Check by full namespace
        if (parent.tag == f'{{{NAMESPACES["w"]}}}txbxContent'
                or parent.tag == f'{{{wps_ns}}}wsp'
                or parent.tag == f'{{{wpg_ns}}}wgp'):
            return True
        parent = parent.getparent() if hasattr(parent, 'getparent') else None
    return False


def get_section_orientation_info(doc_element) -> List[Dict[str, Any]]:
    """
    Obtiene metadatos de las secciones del documento, identificando orientaciones
    landscape u orientaciones horizontales para evitar sobreescribir márgenes.
    También detecta disposiciones multicolumna (w:cols dentro de w:sectPr).
    """
    sections_info = []
    for idx, section in enumerate(doc_element.sections):
        is_landscape = False
        columns = None
        columns_space = None
        try:
            sect_pr = section._sectPr
            pg_sz = sect_pr.find(f'{{{NAMESPACES["w"]}}}pgSz')
            if pg_sz is not None:
                orient = pg_sz.attrib.get(f'{{{NAMESPACES["w"]}}}orient')
                if orient == 'landscape':
                    is_landscape = True
            # Detección multicolumna: <w:cols w:num="N" w:space="S"/>
            cols = sect_pr.find(f'{{{NAMESPACES["w"]}}}cols')
            if cols is not None:
                num = cols.attrib.get(f'{{{NAMESPACES["w"]}}}num')
                if num:
                    try:
                        columns = int(num)
                    except (ValueError, TypeError):
                        columns = None
                spc = cols.attrib.get(f'{{{NAMESPACES["w"]}}}space')
                if spc:
                    try:
                        columns_space = int(spc)
                    except (ValueError, TypeError):
                        columns_space = None
        except Exception:
            pass

        sections_info.append({
            "index": idx,
            "is_landscape": is_landscape,
            "columns": columns,
            "columns_space": columns_space,
            "top_margin": section.top_margin.cm if section.top_margin else 2.54,
            "bottom_margin": section.bottom_margin.cm if section.bottom_margin else 2.54,
            "left_margin": section.left_margin.cm if section.left_margin else 2.54,
            "right_margin": section.right_margin.cm if section.right_margin else 2.54,
        })
    return sections_info
