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


# Señales que delatan una portada maquetada en tabla. Una tabla del cuerpo con
# datos no las tiene, así que no se confunde.
_COVER_TABLE_KW = (
    'universidad', 'facultad', 'carrera', 'elaborado por', 'br.',
    'carnet:', 'grupo:', 'tutor', 'docente', 'asesor', 'integrante',
    'título', 'titulo', 'proyecto',
)


def extract_cover_table_texts(doc_element, max_body_index: int = 12) -> List[str]:
    """Extrae texto de celdas de tablas que pertenecen a la PORTADA.

    Una portada puede vivir dentro de un ``w:tbl`` (logo + universidad +
    integrantes en una rejilla). Solo se miran las primeras ``max_body_index``
    posiciones del cuerpo y se exige una señal de portada en las celdas, para
    no arrastrar una tabla de datos del cuerpo. Reutiliza el mismo formato de
    líneas que ``extract_textbox_paragraphs`` para que
    ``extract_unique_textbox_pairs`` las agrupe igual.
    """
    seen: set[str] = set()
    out: List[str] = []
    W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    try:
        if not hasattr(doc_element, '_element'):
            return out
        body = doc_element._element.body
        for idx, child in enumerate(body):
            if idx >= max_body_index:
                break
            tag = child.tag if isinstance(child.tag, str) else ''
            if not tag.endswith('tbl'):
                continue

            cells: List[str] = []
            for tc in child.iter(f'{{{W}}}tc'):
                parts: List[str] = []
                for el in tc.iter():
                    t = el.tag.split('}')[-1] if '}' in el.tag else el.tag
                    if t == 't' and el.text:
                        parts.append(el.text)
                    elif t == 'br':
                        parts.append('\n')
                cell_text = ''.join(parts).strip()
                if cell_text:
                    cells.append(cell_text)

            joined = ' '.join(cells).lower()
            if not any(kw in joined for kw in _COVER_TABLE_KW):
                continue

            for cell_text in cells:
                for line in cell_text.split('\n'):
                    line = line.strip().replace('\t', ' ')
                    if len(line) <= 1:
                        continue
                    norm = line.lower().replace('  ', ' ').strip()
                    if norm not in seen:
                        seen.add(norm)
                        out.append(line)
    except Exception as e:
        print(f"[WARN] Error en extract_cover_table_texts: {e}")
    return out


def extract_unique_textbox_pairs(textbox_texts: List[str]) -> List[dict]:
    """
    Agrupa textos de textboxes en pares (nombre + carnet/grupo) detectando
    patrones como 'Br. Nombre Apellido', 'Carnet: 2023-XXXX', 'Grupo: XXX'.
    Retorna lista de dicts con 'name', 'id' (carnet), 'role', 'group'.
    """
    import re
    members: List[dict] = []
    current: dict = {}
    # Último miembro ya agregado. En portadas con columnas, el carnet o el
    # grupo suelen venir en un textbox SEPARADO de su nombre; sin esta
    # referencia se descartaban (4 de 5 carnets perdidos).
    last_member: dict | None = None

    for text in textbox_texts:
        t = text.strip()
        t_lower = t.lower()

        # Detectar patrón "Br. Nombre Apellido Apellido"
        # Puede venir VARIOS integrantes corridos en UNA sola línea
        # ("Br. A Carnet: 2021-0251UBr. B Carnet: 2023-0366U..."): se parte
        # por cada título personal y el carnet se NORMALIZA a \d{4}-\d{2,6}
        # (la letra basura pegada al carnet rompía el dedupe → duplicados).
        if (t_lower.startswith('br.')
                or ('br.' in t_lower and 'carnet:' in t_lower)
                or ('br.' in t_lower and re.search(r'\(\s*\d{4}[-.]\d{2,6}', t))):
            import re as _re
            segments = [s.strip() for s in _re.split(r"(?=Br\.)", t) if s.strip()]
            if not segments:
                segments = [t]
            for seg in segments:
                # Carnet en formato "Carnet: 2021-0251" o entre paréntesis
                # "(2023-0296U)" — el original del usuario usa paréntesis.
                m_car = _re.search(r'carnet\s*:\s*(\d{4}-\d{2,6})', seg, _re.IGNORECASE)
                if not m_car:
                    m_car = _re.search(r'\(\s*(\d{4}[-.]\d{2,6})\s*[A-Za-z]?\s*\)', seg)
                cid = m_car.group(1) if m_car else ''
                cid = cid.replace('.', '-')
                name = _re.sub(r'carnet\s*:\s*\S+', '', seg, flags=_re.IGNORECASE)
                name = _re.sub(r'\(\s*\d{4}[-.]\d{2,6}\s*[A-Za-z]?\s*\)', '', name).strip(' .,;')
                if not name:
                    continue
                # Cerrar el miembro en curso antes de abrir uno nuevo.
                if current.get('name'):
                    members.append(current)
                    current = {}
                new_member = {'name': name, 'id': cid, 'role': 'br.', 'group': ''}
                members.append(new_member)
                last_member = new_member
            current = {}
            continue

        # Detectar Docente / Tutor / Profesor explícito o por prefijo
        m_tutor = re.match(r'^(?:docente|tutor(?:a)?|profesor(?:a)?|asesor(?:a)?)\b\s*:?\s*(.*)$', t, re.IGNORECASE)
        if m_tutor:
            tutor_val = m_tutor.group(1).strip()
            # Si el label venía solo en una línea (e.g. "Docente:"), no guardarlo vacío
            tutor_name = tutor_val if tutor_val else t
            if current.get('name'):
                members.append(current)
                current = {}
            new_member = {'name': tutor_name, 'id': '', 'role': 'tutor', 'group': ''}
            members.append(new_member)
            last_member = new_member
            current = {}
            continue

        # Detectar patrón "Ing. Nombre", "Dr.", "M.Sc."
        elif t_lower.startswith(('ing.', 'm.sc.', 'dr.', 'dra.', 'ph.d.', 'mgtr.')):
            if current.get('name'):
                members.append(current)
                current = {}
            # Es un tutor/docente - guardar separadamente, extrayendo grupo si viene pegado
            tutor_str = t
            tutor_group = ''
            m_grp = re.search(r'\bgrupo\s*:\s*([^,\n]+)', t, re.IGNORECASE)
            if m_grp:
                tutor_group = m_grp.group(1).strip()
                tutor_str = t[:m_grp.start()].strip()
            members_new = {'name': tutor_str, 'id': '', 'role': 'tutor', 'group': tutor_group}
            members.append(members_new)
            last_member = members_new
            current = {}

        # Detectar "Carnet: XXXX" o número de carnet
        elif 'carnet:' in t_lower:
            import re as _re2
            _m_id = _re2.search(r'\d{4}[-.]\d{2,6}[A-Za-z]?', t)
            carnet_val = _m_id.group(0).replace('.', '-') if _m_id else (t.split(':', 1)[-1].strip() if ':' in t else t)
            if current.get('name') and not current['name'].startswith(('ing.', 'm.sc.', 'dr.')):
                current['id'] = carnet_val
            elif last_member is not None and last_member.get('role') == 'br.' and not last_member.get('id'):
                # El carnet viene en su propio textbox, justo después del
                # nombre: pegarlo al último estudiante en vez de descartarlo.
                last_member['id'] = carnet_val
            else:
                # Si no hay nombre actual, guardar como suplemento
                current['carnet_raw'] = carnet_val

        # Detectar "Grupo: XXX"
        elif 'grupo:' in t_lower:
            group_val = t.split(':', 1)[-1].strip() if ':' in t else t
            if current.get('name'):
                current['group'] = group_val
            elif last_member is not None and not last_member.get('group'):
                # "Grupo: X" suele venir en su propio textbox, tras el docente
                # o el último integrante: pegarlo al miembro previo.
                last_member['group'] = group_val
            else:
                current = {'name': '', 'id': '', 'role': '', 'group': group_val}

        # Detectar fecha (pero NO si parece carnet)
        elif re.search(r'(20\d{2})', t) and not re.search(r'\d{4}[-]\d{4}', t):
            # Guardar miembro actual primero si existe
            if current.get('name'):
                members.append(current)
            members.append({'name': t, 'id': '', 'role': 'date', 'group': ''})
            current = {}
            last_member = None

        else:
            # Texto sin clasificar - puede ser continuación del nombre
            if current.get('name') and not current.get('id'):
                pass  # Ignorar textos intermedios
            elif current.get('name'):
                members.append(current)
                current = {}
            last_member = None

    # Finalizar último miembro
    if current.get('name'):
        members.append(current)

    # Dedupe duro por carnet: Choice+Fallback, shapes duplicadas o textboxes
    # repetidos producen los mismos integrantes DOS veces (bug reportado:
    # portada con 8 autores en vez de 4).
    seen_ids: set = set()
    unique: List[dict] = []
    for m in members:
        key = (m.get('id') or '').strip().lower()
        if key:
            if key in seen_ids:
                continue
            seen_ids.add(key)
        else:
            name_key = re.sub(r'\s+', ' ', (m.get('name') or '').lower()).strip()
            if name_key and any(re.sub(r'\s+', ' ', (u.get('name') or '').lower()).strip() == name_key for u in unique):
                continue
        unique.append(m)
    return unique


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
