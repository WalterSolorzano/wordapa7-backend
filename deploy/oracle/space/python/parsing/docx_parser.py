"""
WordAPA7 — Parser Principal de Archivos DOCX

Convierte un archivo .docx subido por el usuario en una estructura `DocumentModel`
completamente procesada y clasificada con imagenes extraidas en el almacenamiento local de sesion.
"""

import hashlib
import io
import os
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

import docx
from models import (
    APAFormat,
    BulletStyle,
    DocumentMeta,
    DocumentModel,
    ElementModel,
    ElementType,
    EquationConfig,
    ImageModel,
    NumberStyle,
    SectionInfo,
    TableModel,
    WorkMode,
)

from parsing.fast_mmap_parser import fast_parse_body_start
from parsing.image_extractor_recursive import (
    associate_captions_by_proximity,
    extract_all_images_recursive,
)
from parsing.pre_classifier import pre_classify_elements
from parsing.xml_deep_parser import (
    _deduplicate_textbox_texts,
    extract_textbox_paragraphs,
    extract_unique_textbox_pairs,
    get_section_orientation_info,
    process_numbering_single_pass,
)

# Namespace OOXML para constantes
W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'


def _extract_footnotes_and_endnotes(file_bytes: bytes) -> tuple[list[dict], list[dict]]:
    """
    Extrae las notas al pie (word/footnotes.xml) y notas finales (word/endnotes.xml)
    de un DOCX leyendo directamente el zip. Ignora separadores y referencias
    (w:separator, w:continuationSeparator, w:footnoteRef, w:footnoteReference).

    Retorna (footnotes, endnotes), cada una como lista de dicts {id, text}.
    """
    footnotes: list[dict] = []
    endnotes: list[dict] = []
    import zipfile
    from xml.etree import ElementTree as ET
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
            names = z.namelist()
            for entry, is_endnote in (('word/footnotes.xml', False), ('word/endnotes.xml', True)):
                if entry not in names:
                    continue
                try:
                    root = ET.fromstring(z.read(entry))
                    node_tag = f'{{{W_NS}}}endnote' if is_endnote else f'{{{W_NS}}}footnote'
                    for node in root.findall(f'.//{node_tag}'):
                        id_raw = node.attrib.get(f'{{{W_NS}}}id')
                        if id_raw is None:
                            continue
                        try:
                            fid = int(id_raw)
                        except (ValueError, TypeError):
                            continue
                        # Los ids 0/-1 son separadores internos de Word, no notas reales.
                        if fid < 1:
                            continue
                        parts: list[str] = []
                        for el in node.iter():
                            try:
                                local = el.tag.split('}')[-1] if '}' in str(el.tag) else str(el.tag)
                            except AttributeError:
                                continue
                            if local == 't' and el.text:
                                parts.append(el.text)
                            elif local == 'tab':
                                parts.append('\t')
                            elif local in ('br', 'cr'):
                                parts.append('\n')
                        text = ''.join(parts).strip()
                        record = {'id': fid, 'text': text}
                        if is_endnote:
                            endnotes.append(record)
                        else:
                            footnotes.append(record)
                except Exception as e:
                    print(f"[WARN] Error extrayendo {entry}: {e}")
    except Exception as e:
        print(f"[WARN] Error abriendo zip para notas al pie: {e}")
    return footnotes, endnotes


def _extract_comments(file_bytes: bytes) -> list[dict]:
    """
    Extrae los comentarios (word/comments.xml) de un DOCX.
    Retorna lista de dicts {id, author, text}.
    """
    comments: list[dict] = []
    import zipfile
    from xml.etree import ElementTree as ET
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
            if 'word/comments.xml' not in z.namelist():
                return comments
            root = ET.fromstring(z.read('word/comments.xml'))
            for node in root.findall(f'.//{{{W_NS}}}comment'):
                cid = node.attrib.get(f'{{{W_NS}}}id', '')
                author = node.attrib.get(f'{{{W_NS}}}author', '')
                parts: list[str] = []
                for el in node.iter():
                    try:
                        local = el.tag.split('}')[-1] if '}' in str(el.tag) else str(el.tag)
                    except AttributeError:
                        continue
                    if local == 't' and el.text:
                        parts.append(el.text)
                    elif local == 'tab':
                        parts.append('\t')
                comments.append({
                    'id': cid,
                    'author': author,
                    'text': ''.join(parts).strip(),
                })
    except Exception as e:
        print(f"[WARN] Error extrayendo comentarios: {e}")
    return comments


def _extract_paragraph_text_with_footnotes(p_element) -> tuple[str, list[int]]:
    """
    Extrae el texto plano de un w:p recorriendo su XML en orden.

    - Incluye texto dentro de w:ins (insertiones de Track Changes).
    - EXCLUYE completamente la rama w:del (eliminaciones de Track Changes),
      evitando duplicados cuando un párrafo contiene inserciones Y eliminaciones.
    - Preserva el texto de los hipervínculos (w:hyperlink).
    - Inserta un marcador inline "(nota N)" en la posición exacta de cada
      w:footnoteReference / w:endnoteReference para que la referencia no se pierda.

    Retorna (texto, ids_de_notas_en_orden).
    """
    out: list[str] = []
    footnote_ids: list[int] = []

    def _walk(el):
        try:
            local = el.tag.split('}')[-1] if '}' in str(el.tag) else str(el.tag)
        except AttributeError:
            return
        # Omitir eliminaciones de Track Changes (y su w:delText asociado)
        if local in ('del', 'delText'):
            return
        if local == 't' and el.text:
            out.append(el.text)
        elif local == 'tab':
            out.append('\t')
        elif local in ('br', 'cr'):
            out.append('\n')
        elif local in ('footnoteReference', 'endnoteReference'):
            id_raw = el.attrib.get(f'{{{W_NS}}}id')
            if id_raw:
                try:
                    fid = int(id_raw)
                except (ValueError, TypeError):
                    fid = None
                if fid is not None and fid not in footnote_ids:
                    footnote_ids.append(fid)
                if fid is not None:
                    out.append(f'(nota {fid})')
        for child in el:
            _walk(child)

    _walk(p_element)
    return ''.join(out), footnote_ids


def _extract_hyperlinks(p_element, doc) -> list[dict]:
    """
    Extrae los hipervínculos (w:hyperlink) de un párrafo junto con su destino.
    Retorna lista de dicts {text, url}.
    """
    hyperlinks: list[dict] = []
    try:
        for hl in p_element.iter(f'{{{W_NS}}}hyperlink'):
            r_id = hl.attrib.get(f'{{{R_NS}}}id')
            text = ''.join(
                n.text for n in hl.iter()
                if str(n.tag).endswith('}t') and n.text
            ).strip()
            url = ''
            anchor = hl.attrib.get(f'{{{W_NS}}}anchor', '')
            if anchor:
                url = '#' + anchor
            elif r_id:
                try:
                    if r_id in doc.part.rels:
                        rel = doc.part.rels[r_id]
                        url = getattr(rel, 'target_ref', '') or ''
                except Exception:
                    url = ''
            if text:
                hyperlinks.append({'text': text, 'url': url})
    except Exception:
        pass
    return hyperlinks


def _extract_bookmarks(p_element) -> list[dict]:
    """
    Extrae los marcadores (w:bookmarkStart) de un párrafo.
    Retorna lista de dicts {name, id}.
    """
    bookmarks: list[dict] = []
    try:
        for bm in p_element.iter(f'{{{W_NS}}}bookmarkStart'):
            name = bm.attrib.get(f'{{{W_NS}}}name', '')
            bid = bm.attrib.get(f'{{{W_NS}}}id', '')
            bookmarks.append({'name': name, 'id': bid})
    except Exception:
        pass
    return bookmarks


def _detect_toc_paragraph_indices(body) -> set[int]:
    """
    Pre-recorrido del cuerpo del documento para detectar TODOS los parrafos
    que pertenecen a un campo TOC de Word.

    Un campo TOC en OOXML tiene esta estructura:
      <w:r><w:fldChar w:fldCharType="begin"/></w:r>
      <w:r><w:instrText>TOC \\o "1-3" \\h \\z</w:instrText></w:r>
      <w:r><w:fldChar w:fldCharType="separate"/></w:r>
      <w:r><w:t>Tabla de Contenidos generada...</w:t></w:r>
      ... (pueden haber multiples parrafos con texto generado) ...
      <w:r><w:fldChar w:fldCharType="end"/></w:r>

    Retorna un set de indices de parrafo (0-based dentro del body) que estan
    dentro del rango TOC (desde 'begin' hasta 'end' inclusive).
    """
    toc_indices: set[int] = set()
    inside_toc = False
    toc_field_depth = 0  # Seguimiento de anidamiento de campos dentro del TOC

    for idx, child in enumerate(body):
        tag = child.tag if isinstance(child.tag, str) else ""
        if not tag.endswith("p"):
            continue

        if not inside_toc:
            # Buscar si este parrafo inicia un campo TOC
            try:
                instrs = child.findall(f'.//{{{W_NS}}}instrText')
                has_toc_instr = any(
                    it.text and 'TOC' in it.text.upper()
                    for it in instrs
                )
            except Exception:
                has_toc_instr = False

            if has_toc_instr:
                inside_toc = True
                toc_field_depth = 0  # Se incrementara con los fldChar begin del parrafo
                toc_indices.add(idx)
                # Contar campos en el mismo parrafo para inicializar la profundidad
                try:
                    fldchars = child.findall(f'.//{{{W_NS}}}fldChar')
                    for fc in fldchars:
                        fld_type = fc.attrib.get(f'{{{W_NS}}}fldCharType', '')
                        if fld_type == 'begin':
                            toc_field_depth += 1
                        elif fld_type == 'end':
                            toc_field_depth -= 1
                except Exception:
                    pass
                # Si no se encontro begin (caso raro), forzar depth=1
                if toc_field_depth <= 0:
                    toc_field_depth = 1
        else:
            # Dentro del campo TOC: mantener contador de profundidad
            # para manejar campos anidados (PAGEREF dentro de entradas TOC)
            try:
                fldchars = child.findall(f'.//{{{W_NS}}}fldChar')
                for fc in fldchars:
                    fld_type = fc.attrib.get(f'{{{W_NS}}}fldCharType', '')
                    if fld_type == 'begin':
                        toc_field_depth += 1  # Nuevo campo anidado
                    elif fld_type == 'end':
                        toc_field_depth -= 1  # Cierre de campo anidado o TOC
            except Exception:
                pass

            if toc_field_depth > 0:
                toc_indices.add(idx)
            else:
                # La profundidad llego a 0: el campo TOC se cerro
                toc_indices.add(idx)  # El parrafo con 'end' del TOC tambien se marca
                inside_toc = False
                toc_field_depth = 0

    return toc_indices


def _normalize_multiline_field(value: str) -> str:
    lines = [line.strip() for line in value.replace('\r', '\n').split('\n') if line.strip()]
    deduped: list[str] = []
    seen: set[str] = set()
    for line in lines:
        normalized = re.sub(r'\s+', ' ', line).strip()
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(normalized)
    return '\n'.join(deduped)


def _infer_portada_from_textboxes(textbox_texts: list[str]) -> dict[str, str]:
    """
    Analiza el texto extraido de cuadros de texto/shapes de Word e infiere
    los campos de portada APA (title, author, institution, course, instructor, date).

    Estrategia:
    1. Buscar keywords institucionales ("universidad", "facultad", etc.) -> institution
    2. Buscar keywords de curso ("seminario", "curso", etc.) -> course
    3. Buscar keywords de instructor ("profesor", "dr.", etc.) -> instructor
    4. Buscar patron de fecha (año, formato fecha) -> date
    5. Intentar detectar nombre de autor (patrones nombre+apellido)
    6. Extraer Miembros/Integrantes individuales con sus carnets
    7. El texto restante mas largo/substancial -> title

    Retorna un dict con los campos inferidos (solo los que se detectaron).
    """
    import re

    fields: dict[str, str] = {}

    if not textbox_texts:
        return fields

    # Normalizar: eliminar textos vacios y limpiar whitespace
    cleaned = [t.strip() for t in textbox_texts if t.strip()]
    if not cleaned:
        return fields

    # PRIMERO: Extraer miembros/integrantes desde los textboxes
    # Esto captura pares (Br. Nombre + Carnet: XXXX) y tutores
    member_pairs = extract_unique_textbox_pairs(textbox_texts)
    if member_pairs:
        # Extraer FECHA si algun miembro tiene role='date'
        for m in member_pairs:
            if m.get('role') == 'date' and m.get('name'):
                fields["date"] = m['name']
                break

        # Separar tutores de estudiantes
        student_members = []
        tutor_members = []
        for m in member_pairs:
            if m.get('role') == 'tutor':
                tutor_members.append(m)
            elif m.get('name') and m['role'] == 'br.':
                student_members.append(m)
            elif not m.get('role'):
                student_members.append(m)

        if student_members:
            # Construir author string: "Br. Nombre Apellido | Carnet: 2023-XXXX"
            author_parts = []
            seen_parts: set[str] = set()
            for m in student_members:
                part = m['name']
                if m.get('id'):
                    part += f" | Carnet: {m['id']}"
                normalized_part = re.sub(r'\s+', ' ', part).strip()
                key = normalized_part.lower()
                if key in seen_parts:
                    continue
                seen_parts.add(key)
                author_parts.append(normalized_part)
            fields["author"] = _normalize_multiline_field("\n".join(author_parts))

        if tutor_members:
            tutor_names = [m['name'] for m in tutor_members if m.get('name')]
            if tutor_names:
                fields["instructor"] = _normalize_multiline_field("\n".join(tutor_names))

        # Si ya tenemos miembros, quitar esos textos de 'cleaned' para no re-asignarlos
        used_texts = set()
        for m in member_pairs:
            if m.get('name'):
                used_texts.add(m['name'].lower().replace('  ', ' ').strip())
            if m.get('carnet_raw'):
                used_texts.add(m['carnet_raw'].lower().strip())

        remaining = [
            t for t in cleaned
            if t.lower().replace('  ', ' ').strip() not in used_texts
        ]
        if not remaining:
            return fields
    else:
        remaining = list(cleaned)

    # Track de indices ya asignados para no reusar el mismo texto
    assigned: set[int] = set()
    # Re-indexar 'remaining' para el proceso de inferencia de campos
    remaining_with_idx = list(enumerate(remaining))

    # ---- Patrones de deteccion ----
    INSTITUTION_KW = [
        "universidad", "facultad", "escuela", "instituto", "colegio",
        "departamento", "universidad de", "universidad del",
        "universidad autonoma", "universidad nacional",
        "politecnico", "politécnico",
    ]
    COURSE_KW = [
        "curso", "asignatura", "materia", "seminario", "taller",
        "catedra", "cátedra", "modulo", "módulo",
    ]
    INSTRUCTOR_KW = [
        "profesor", "profesora", "prof.", "prof ",
        "docente", "tutor", "tutora",
        "dr.", "dra.", "doctor", "doctora",
        "mgtr.", "magister", "máster", "ph.d.", "phd",
        "lic.", "ing.", "arq.", "abg.", "eco.",
        "director", "directora",
    ]
    DATE_PATTERNS = [
        re.compile(r'\b(20\d{2})\b'),
        re.compile(r'\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(de\s+)?(20\d{2})\b', re.IGNORECASE),
        re.compile(r'\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(de\s+)?(20\d{2})\b', re.IGNORECASE),
        re.compile(r'\b(\d{1,2})/(\d{1,2})/(20\d{2})\b'),
    ]

    # ---- Paso 1: Detectar institution ----
    for i, text in remaining_with_idx:
        if i in assigned:
            continue
        text_lower = text.lower()
        if any(kw in text_lower for kw in INSTITUTION_KW):
            fields["institution"] = text
            assigned.add(i)
            break

    # ---- Paso 2: Detectar course ----
    for i, text in remaining_with_idx:
        if i in assigned:
            continue
        text_lower = text.lower()
        if any(kw in text_lower for kw in COURSE_KW):
            fields["course"] = text
            assigned.add(i)
            break

    # ---- Paso 3: Detectar instructor (si aun no se asigno via member_pairs) ----
    if not fields.get("instructor"):
        for i, text in remaining_with_idx:
            if i in assigned:
                continue
            text_lower = text.lower()
            if any(kw in text_lower for kw in INSTRUCTOR_KW):
                fields["instructor"] = text
                assigned.add(i)
                break

    # ---- Paso 4: Detectar date ----
    for i, text in remaining_with_idx:
        if i in assigned:
            continue
        # NO detectar como fecha si contiene patron de carnet (2022-0215I)
        if re.search(r'Carnet\s*:', text, re.IGNORECASE) or re.search(r'\b\d{4}[-]\d{4}[A-Za-z]?\b', text):
            # Texto contiene carnet, no es fecha
            if 'carnet' in text.lower():
                assigned.add(i)
            continue
        for pat in DATE_PATTERNS:
            m = pat.search(text)
            if m:
                # Verificar que no sea parte de un carnet
                full_match = m.group(0)
                context_start = max(0, m.start() - 5)
                context = text[context_start:m.end() + 5]
                if not re.search(r'Carnet|carnet|[-]\d{4}', context):
                    fields["date"] = text.strip()
                    assigned.add(i)
                    break
        if i in assigned:
            break

    # ---- Paso 5: Detectar title ----
    # El texto mas largo no asignado (excluyendo carnets, grupos y textos muy cortos)
    unassigned = [
        (i, remaining[i])
        for i in range(len(remaining))
        if i not in assigned
    ]
    # Filtrar textos que parecen carnets, IDs, grupos o nombres de miembros
    filtered = []
    for i, t in unassigned:
        t_stripped = t.strip()
        if re.search(r'^\d{4}[-]\d{4}', t_stripped) or re.search(r'Carnet|carnet', t_stripped):
            continue
        if len(t_stripped) < 4:
            continue
        if re.match(r'^[\d\-]+$', t_stripped):
            continue
        if re.search(r'grupo|grupo:', t_stripped, re.IGNORECASE):
            continue
        if re.match(r'^(Br\.|Ing\.|Dr\.|Lic\.|M\.Sc\.)', t_stripped, re.IGNORECASE):
            continue
        filtered.append((i, t))

    if filtered:
        # Elegir el texto mas largo (tipicamente el titulo es lo mas extenso)
        filtered.sort(key=lambda x: len(x[1]), reverse=True)
        fields["title"] = filtered[0][1]
    # Si no hay candidatos validos, NO asignar title (permitir fallback a parrafos)
    # El parse_docx_bytes hara el merge con _infer_portada_from_paragraphs

    return fields


def _infer_portada_from_paragraphs(elements: List[ElementModel], textbox_texts: list[str] | None = None) -> dict[str, str]:
    """
    Inferir titulo, autor, institucion y tutor desde los parrafos iniciales o textboxes.
    Si hay textbox_texts disponibles, los usa prioritariamente para autores y tutor
    (ya que los parrafos pueden tener texto concatenado de shapes).
    """
    import re

    fields: dict[str, str] = {}

    # PRIORIDAD 1: Usar textboxes si existen (tienen datos limpios de autores/tutor)
    if textbox_texts:
        deduplicated = _deduplicate_textbox_texts(textbox_texts)
        member_pairs = extract_unique_textbox_pairs(deduplicated)

        if member_pairs:
            student_members = []
            tutor_members = []
            for m in member_pairs:
                if m.get('role') == 'tutor':
                    tutor_members.append(m)
                elif m.get('name') and m['role'] == 'br.':
                    student_members.append(m)
                elif m.get('name') and not m.get('role'):
                    student_members.append(m)

            if student_members:
                author_parts = []
                seen_parts: set[str] = set()
                for m in student_members:
                    part = m['name']
                    if m.get('id'):
                        part += f" | Carnet: {m['id']}"
                    normalized_part = re.sub(r'\s+', ' ', part).strip()
                    key = normalized_part.lower()
                    if key in seen_parts:
                        continue
                    seen_parts.add(key)
                    author_parts.append(normalized_part)
                fields["author"] = _normalize_multiline_field("\n".join(author_parts))

            if tutor_members:
                tutor_names = [m['name'] for m in tutor_members if m.get('name')]
                if tutor_names:
                    fields["instructor"] = _normalize_multiline_field("\n".join(tutor_names))

            # Si ya tenemos autores, no necesitamos procesar parrafos
            if fields.get("author"):
                # Aun buscar titulo e institution en parrafos
                cover_elems = [e for e in elements[:15] if e.text and e.text.strip()]
                for e in cover_elems:
                    txt = e.text.strip()
                    txt_lower = txt.lower()
                    if any(kw in txt_lower for kw in ["universidad", "facultad", "escuela", "instituto"]):
                        fields["institution"] = txt
                    elif (len(txt.split()) <= 15
                          and not any(kw in txt_lower for kw in ["universidad", "facultad", "elaborado por", "tutor", "carnet", "br."])
                          and not txt_lower.startswith("area de")):
                        if e.alignment == "center" or e.is_bold or (e.font_size and e.font_size >= 14):
                            if not fields.get("title") or len(txt) > len(fields["title"]):
                                fields["title"] = txt
                return fields

    # PRIORIDAD 2: No hay textboxes, inferir desde parrafos
    cover_elems = [e for e in elements[:20] if e.text and e.text.strip()]
    if not cover_elems:
        return fields

    # --- Institucion ---
    for e in cover_elems:
        txt = e.text.strip()
        if any(kw in txt.lower() for kw in ["universidad", "facultad", "escuela", "instituto"]):
            fields["institution"] = txt
            break

    # --- Titulo ---
    title_candidates = []
    for e in cover_elems:
        txt = e.text.strip()
        txt_lower = txt.lower()
        if (2 <= len(txt.split()) <= 20
                and not any(kw in txt_lower for kw in ["universidad", "facultad", "elaborado por", "tutor", "carnet", "br.", "ing.", "grupo:", "proyecto de", "area de"])
                and not txt_lower.startswith(("managua", "nicaragua"))):
            if e.alignment == "center" or (e.font_size and e.font_size >= 14):
                title_candidates.append((len(txt), txt))
    if title_candidates:
        # Elegir el mas largo (tipicamente el titulo real)
        title_candidates.sort(key=lambda x: x[0], reverse=True)
        fields["title"] = title_candidates[0][1]

    # --- Autor/es y Tutor (desde parrafos, con manejo de texto concatenado) ---
    # Los parrafos pueden tener texto concatenado porque python-docx incluye
    # texto de shapes/textboxes dentro del parrafo.
    # Estrategia: buscar patrones "Br." y "Carnet:" para dividir.
    autores = []
    tutor = ""
    for e in cover_elems:
        txt = e.text.strip()
        txt_lower = txt.lower()

        # Detectar si el texto contiene multiple "Br." -> dividir
        br_matches = list(re.finditer(r'\bBr\.\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+', txt))
        if len(br_matches) >= 1:
            for m in br_matches:
                member_text = m.group(0).strip()
                # Buscar carnet cercano
                carnet_match = re.search(r'Carnet:\s*(\S+)', txt[m.end():m.end()+100])
                if carnet_match:
                    member_text += f" | Carnet: {carnet_match.group(1)}"
                autores.append(member_text)
        elif "elaborado por" in txt_lower:
            pass  # No extraer como autor (es cabecera)
        elif "br." in txt_lower or "carnet:" in txt_lower:
            autores.append(txt)
        elif "tutor" in txt_lower or "docente" in txt_lower or "profesor" in txt_lower or "ing." in txt_lower or "dr." in txt_lower:
            tutor = txt

    if autores:
        fields["author"] = _normalize_multiline_field("\n".join(autores))
    if tutor:
        fields["instructor"] = _normalize_multiline_field(tutor)

    # --- Date ---
    date_patterns = [
        re.compile(r'\b(20\d{2})\b'),
        re.compile(r'\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(de\s+)?(20\d{2})\b', re.IGNORECASE),
    ]
    for e in cover_elems:
        txt = e.text.strip()
        for pat in date_patterns:
            m = pat.search(txt)
            if m:
                fields["date"] = txt
                break
        if fields.get("date"):
            break

    return fields


# Removido: _get_numbering_type_map (ahora en xml_deep_parser.process_numbering_single_pass)


# Mapping de numFmt OOXML a estilos APA
OOXML_NUMFMT_TO_NUMBER_STYLE: dict[str, NumberStyle] = {
    'decimal': NumberStyle.DECIMAL,
    'upperLetter': NumberStyle.UPPER_LETTER,
    'lowerLetter': NumberStyle.LOWER_LETTER,
    'upperRoman': NumberStyle.UPPER_ROMAN,
    'lowerRoman': NumberStyle.LOWER_ROMAN,
}


def parse_docx_bytes(
    file_bytes: bytes,
    file_name: str,
    session_id: str,
    storage_dir: Path,
    skip_page_layout: bool = False,
) -> DocumentModel:
    """
    Parsea los bytes de un DOCX en un DocumentModel.

    - Sanitiza numbering.xml
    - Extrae elementos (parrafos, titulos, listas, tablas, imagenes)
    - Extrae imagenes a archivos locales bajo storage_dir/session_id/images/
    - Ejecuta pre-clasificador de 3 pasadas
    - Inicializa metadatos completos del documento
    """
    # Calcular hash para idempotencia
    source_hash: str = hashlib.sha256(file_bytes).hexdigest()

    sanitized_bytes, numbering_type_map = process_numbering_single_pass(file_bytes)

    # Crear directorio de imagenes de sesion
    session_img_dir = storage_dir / "sessions" / session_id / "images"
    session_img_dir.mkdir(parents=True, exist_ok=True)

    # Cargar documento docx desde bytes
    import zipfile

    from fastapi import HTTPException
    try:
        doc = docx.Document(io.BytesIO(sanitized_bytes))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="El documento está corrupto o protegido con contraseña. Por favor, asegúrate de que sea un archivo .docx válido y no requiera contraseña.")

    # Extraer forensic metadata directamente de los bytes (zip)
    forensic_metadata = {}
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
            try:
                app_xml = z.read('docProps/app.xml').decode('utf-8')
                total_time = re.search(r'<TotalTime>(\d+)</TotalTime>', app_xml)
                words = re.search(r'<Words>(\d+)</Words>', app_xml)
                if total_time:
                    forensic_metadata["total_editing_time_minutes"] = int(total_time.group(1))
                if words:
                    forensic_metadata["words"] = int(words.group(1))
            except Exception:
                pass

            try:
                core_xml = z.read('docProps/core.xml').decode('utf-8')
                revision = re.search(r'<cp:revision>(\d+)</cp:revision>', core_xml)
                if revision:
                    forensic_metadata["revision_count"] = int(revision.group(1))
                # Senales de metadatos para el detector de IA: quien creo el
                # documento, quien lo modifico por ultima vez, y fechas.
                creator = re.search(r'<dc:creator>(.*?)</dc:creator>', core_xml)
                if creator:
                    forensic_metadata["creator"] = creator.group(1).strip()
                last_mod = re.search(r'<cp:lastModifiedBy>(.*?)</cp:lastModifiedBy>', core_xml)
                if last_mod:
                    forensic_metadata["last_modified_by"] = last_mod.group(1).strip()
                created = re.search(
                    r'<dcterms:created[^>]*>(.*?)</dcterms:created>', core_xml)
                if created:
                    forensic_metadata["created_iso"] = created.group(1).strip()
                modified = re.search(
                    r'<dcterms:modified[^>]*>(.*?)</dcterms:modified>', core_xml)
                if modified:
                    forensic_metadata["modified_iso"] = modified.group(1).strip()
            except Exception:
                pass
    except Exception:
        pass

    # Notas al pie / notas finales y comentarios (lectura directa del zip)
    footnotes_parsed, endnotes_parsed = _extract_footnotes_and_endnotes(file_bytes)
    all_footnotes: list[dict] = [
        {**fn, 'is_endnote': False} for fn in footnotes_parsed
    ] + [
        {**en, 'is_endnote': True} for en in endnotes_parsed
    ]
    comments_parsed = _extract_comments(file_bytes)
    comment_count: int = len(comments_parsed)
    has_comment_anchors: bool = False

    # Extracción recursiva de imágenes (Fase 4)
    extracted_images_meta = extract_all_images_recursive(doc, session_img_dir)

    elements: List[ElementModel] = []
    element_counter: int = 0
    total_words: int = 0
    has_images: bool = False
    has_tables_detected: bool = False

    # Extraer info de secciones
    sections_info = get_section_orientation_info(doc)
    has_landscape: bool = any(s.get("is_landscape", False) for s in sections_info)
    has_multicolumn: bool = any((s.get("columns") or 0) > 1 for s in sections_info)
    sections_models: list[SectionInfo] = []
    for _si in sections_info:
        try:
            sections_models.append(SectionInfo(
                section_index=_si.get("index", 0),
                orientation="landscape" if _si.get("is_landscape") else "portrait",
                margins_original={
                    "top": _si.get("top_margin", 2.54),
                    "bottom": _si.get("bottom_margin", 2.54),
                    "left": _si.get("left_margin", 2.54),
                    "right": _si.get("right_margin", 2.54),
                },
                preserve_margins=bool(_si.get("is_landscape")),
                columns=_si.get("columns"),
                columns_space=_si.get("columns_space"),
            ))
        except Exception:
            pass

    # Detectar OMML (ecuaciones), OLE (objetos Excel), bookmarks e hyperlinks.
    # Los bookmarks/hyperlinks no se modelan como elementos propios, pero se
    # registran como flags en el meta para que el generador y la UI puedan
    # advertir al usuario que esos anclajes/enlaces existen y pueden requerir
    # revisión manual tras la conversión APA.
    has_equations: bool = False
    has_ole: bool = False
    has_bookmarks: bool = False
    has_hyperlinks: bool = False
    hyperlink_count: int = 0
    has_track_changes: bool = False
    has_smartart: bool = False
    has_charts: bool = False
    try:
        root = doc._element
        nsmap = {
            'm': 'http://schemas.openxmlformats.org/officeDocument/2006/math',
            'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
            'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
            'dgm': 'http://schemas.openxmlformats.org/drawingml/2006/diagram',
            'c': 'http://schemas.openxmlformats.org/drawingml/2006/chart',
        }
        omath_elems = root.findall('.//m:oMath', nsmap)
        if omath_elems:
            has_equations = True
        ole_elems = root.findall('.//w:object', nsmap)
        if ole_elems:
            has_ole = True
        # Bookmarks: w:bookmarkStart delimita un anclaje referenciable
        # (p. ej. usado por PAGEREF / referencias cruzadas).
        bookmark_elems = root.findall('.//w:bookmarkStart', nsmap)
        if bookmark_elems:
            has_bookmarks = True
        # Hyperlinks: w:hyperlink puede ser interno (anchor) o externo (r:id).
        hyperlink_elems = root.findall('.//w:hyperlink', nsmap)
        if hyperlink_elems:
            has_hyperlinks = True
            hyperlink_count = len(hyperlink_elems)
        # Track Changes: w:ins (insertiones) / w:del (eliminaciones).
        track_change_elems = root.findall('.//w:ins', nsmap) + root.findall('.//w:del', nsmap)
        if track_change_elems:
            has_track_changes = True
        # SmartArt: namespace dgm (relIds/dataModel dentro de a:graphicData).
        if root.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/diagram}relIds') \
                or root.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/diagram}dataModel'):
            has_smartart = True
        # Charts: namespace c (gráficas de datos).
        if root.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/chart}chart'):
            has_charts = True
    except Exception:
        pass

    # Extraer texto de cuadros de texto y shapes ANTES de recorrer parrafos
    # (para detectar portadas basadas en shapes que no tienen parrafos normales)
    textbox_texts = extract_textbox_paragraphs(doc)
    textbox_has_content = any(t.strip() for t in textbox_texts)

    # PRIMERO: Pre-deteccion de parrafos TOC para marcar todo el rango del campo
    # (desde w:fldChar begin hasta w:fldChar end, incluyendo el texto generado)
    toc_paragraph_indices = _detect_toc_paragraph_indices(doc._element.body)

    # Recorrer los elementos del cuerpo en orden secuencial exacto (parrafos y tablas intercalados)
    # Límite configurable de elementos para evitar que documentos gigantes (p. ej. 500+ págs)
    # agoten memoria o cuelguen la petición HTTP indefinidamente.
    MAX_ELEMENTS = int(os.environ.get("WORDAPA7_MAX_ELEMENTS", "3000"))
    # Guard de tiempo de pared (wall-clock) para evitar que un documento patológico
    # (tablas/paragraphs extremadamente pesados) cuelgue la petición HTTP indefinidamente.
    PARSE_TIMEOUT_SECONDS = float(os.environ.get("WORDAPA7_PARSE_TIMEOUT_SECONDS", "120"))
    _parse_start_time = time.monotonic()
    elements_truncated = False
    for child_idx, child in enumerate(doc._element.body):
        # Truncar al llegar al límite: dejamos de añadir elementos pero
        # conservamos los ya parseados y marcamos el flag para advertir al usuario.
        if element_counter >= MAX_ELEMENTS:
            elements_truncated = True
            break
        # Truncar si se excede el timeout de parseo (P3.30).
        if (child_idx % 100 == 0) and (time.monotonic() - _parse_start_time) > PARSE_TIMEOUT_SECONDS:
            elements_truncated = True
            print(f"[WARN] Timeout de parseo ({PARSE_TIMEOUT_SECONDS}s) alcanzado en elemento {element_counter}; truncando.")
            break
        tag = child.tag if isinstance(child.tag, str) else ""

        # --- CASO A: PARRAFO (<w:p>) ---
        if tag.endswith("p"):
            element_counter += 1
            p = docx.text.paragraph.Paragraph(child, doc)
            # Extracción de texto propia que respeta Track Changes (omite w:del,
            # incluye w:ins) y preserva la posición de las notas al pie.
            raw_text, footnote_ids = _extract_paragraph_text_with_footnotes(child)
            text: str = raw_text.strip() if raw_text else ""

            # Detectar anclas de comentarios (w:commentRangeStart) en el párrafo.
            if child.findall(f'.//{{{W_NS}}}commentRangeStart'):
                has_comment_anchors = True
            hyperlinks = _extract_hyperlinks(child, doc)
            bookmarks = _extract_bookmarks(child)

            # Check for math (OMML), fields, and shading
            p_has_math = False
            p_has_fields = False
            p_has_shading = False
            p_has_web_shading = False
            try:
                # Math
                if p._element.findall('.//{http://schemas.openxmlformats.org/officeDocument/2006/math}oMath') or p._element.findall('.//{http://schemas.openxmlformats.org/officeDocument/2006/math}oMathPara'):
                    p_has_math = True
                # Fields
                if p._element.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}fldSimple') or p._element.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}instrText'):
                    p_has_fields = True
                # Shading (Background color). Los colores web típicos de tablas
                # copiadas (F4CCCC/FFE599/D9EAD3, etc.) se marcan aparte como
                # señal fuerte de contenido pegado desde la web/chat.
                shd_nodes = p._element.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}shd')
                if shd_nodes:
                    p_has_shading = True
                    for shd in shd_nodes:
                        fill = shd.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}fill')
                        if fill and fill.upper() in {
                            "F4CCCC", "FFE599", "D9EAD3", "FFF2CC", "D9D2E9",
                            "FCE5CD", "CFE2F3", "EAD1DC", "FFFF00", "FF9900",
                            "FF0000", "00B050",
                        }:
                            p_has_web_shading = True
                            break
            except Exception:
                pass

            # Contar palabras
            if text:
                total_words += len(text.split())

            # Detectar formato directo
            is_bold: bool = False
            is_italic: bool = False
            font_size: float = 12.0
            font_name: str = "Times New Roman"

            for r in p.runs:
                if r.bold:
                    is_bold = True
                if r.italic:
                    is_italic = True
                if r.font.size and r.font.size.pt:
                    font_size = float(r.font.size.pt)
                if r.font.name:
                    font_name = r.font.name

            # Determinar alineacion
            align_str: str = "left"
            if p.alignment is not None:
                raw_align = str(p.alignment)
                if "CENTER" in raw_align.upper():
                    align_str = "center"
                elif "RIGHT" in raw_align.upper():
                    align_str = "right"
                elif "JUSTIFY" in raw_align.upper():
                    align_str = "justify"

            # Obtener indentacion
            left_indent_cm: float = 0.0
            try:
                pf = p.paragraph_format
                if pf.left_indent:
                    left_indent_cm = pf.left_indent.cm if pf.left_indent.cm else 0.0
            except Exception:
                pass

            #  Detectar parrafos dentro del rango de un campo TOC de Word
            # (detectado por _detect_toc_paragraph_indices en el pre-scan)
            is_toc_paragraph: bool = child_idx in toc_paragraph_indices

            if is_toc_paragraph:
                style_name_toc: str = p.style.name if p.style else "Normal"
                # Determinar si es el parrafo de definicion del campo (contiene instrText con TOC)
                # o un parrafo de contenido generado por Word
                try:
                    instr_texts = p._element.findall(
                        f'.//{{{W_NS}}}instrText'
                    )
                    has_toc_instr = any(
                        it.text and 'TOC' in it.text.upper()
                        for it in instr_texts
                    )
                except Exception:
                    has_toc_instr = False

                # Si el texto del TOC generado parece vacio o solo tiene el TAG,
                # usar un placeholder amigable para la UI
                display_text = text if text else "[Tabla de Contenidos]"

                # El parrafo con la definicion del campo (instrText) se preserva
                # como marcador; los parrafos de contenido generado conservan su texto original
                elem = ElementModel(
                    id=f"elem_{element_counter}",
                    type=ElementType.TOC,
                    text=display_text,
                    original_text=text if text else "[TOC Field]",
                    style_name=style_name_toc,
                    alignment=align_str,
                    font_name=font_name,
                    font_size=font_size,
                    is_bold=is_bold,
                    is_italic=is_italic,
                    left_indent_cm=left_indent_cm,
                    confidence=1.0,
                    heading_level=None,
                    footnote_ids=footnote_ids,
                    hyperlinks=hyperlinks,
                    bookmarks=bookmarks,
                )
                elements.append(elem)

            if is_toc_paragraph:
                # Saltar deteccion de imagenes y procesamiento normal de estilo/lista.
                # Los parrafos TOC son puramente texto generado por Word y se preservan
                # tal cual hasta que el generador decida regenerarlos desde headings.
                continue

            # Deteccion de imagenes (drawingml blip y vml imagedata)
            images_in_p: List[ImageModel] = []
            A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'
            V_NS = 'urn:schemas-microsoft-com:vml'
            R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
            WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
            WPG_NS = 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup'
            WPS_NS = 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape'

            # Guardar (r_id, anchor_info, width_cm, height_cm)
            blip_info = []

            def _process_drawing(drawing_elem):
                anchor_elem = drawing_elem.find(f'.//{{{WP_NS}}}anchor')
                extent_elem = drawing_elem.find(f'.//{{{WP_NS}}}extent')
                width_cm = 12.0
                height_cm = 8.0
                if extent_elem is not None:
                    try:
                        width_cm = int(extent_elem.get('cx', 0)) / 360000.0
                        height_cm = int(extent_elem.get('cy', 0)) / 360000.0
                    except (ValueError, TypeError):
                        pass

                anchor_data = None
                if anchor_elem is not None:
                    # Capturar atributos del anchor
                    pos_h_elem = anchor_elem.find(f'.//{{{WP_NS}}}positionH')
                    pos_v_elem = anchor_elem.find(f'.//{{{WP_NS}}}positionV')
                    pos_h = pos_h_elem.find(f'.//{{{WP_NS}}}posOffset').text if pos_h_elem is not None and pos_h_elem.find(f'.//{{{WP_NS}}}posOffset') is not None else None
                    pos_v = pos_v_elem.find(f'.//{{{WP_NS}}}posOffset').text if pos_v_elem is not None and pos_v_elem.find(f'.//{{{WP_NS}}}posOffset') is not None else None

                    wrap_style = "square"
                    if anchor_elem.find(f'.//{{{WP_NS}}}wrapTight') is not None:
                        wrap_style = "tight"
                    elif anchor_elem.find(f'.//{{{WP_NS}}}wrapTopAndBottom') is not None:
                        wrap_style = "top_and_bottom"
                    elif anchor_elem.find(f'.//{{{WP_NS}}}wrapThrough') is not None:
                        wrap_style = "through"

                    anchor_data = {
                        "is_anchor": True,
                        "anchor_pos_h": pos_h,
                        "anchor_pos_v": pos_v,
                        "wrap_style": wrap_style
                    }

                # Buscar blips en este drawing
                for b in drawing_elem.findall(f'.//{{{A_NS}}}blip'):
                    r_id = b.attrib.get(f'{{{R_NS}}}embed')
                    if r_id:
                        blip_info.append((r_id, anchor_data, width_cm, height_cm))

            # 1. Procesar todos los drawings directos
            for drawing in p._element.findall(f'.//{{{WP_NS}}}inline') + p._element.findall(f'.//{{{WP_NS}}}anchor'):
                _process_drawing(drawing)

            # 2. Procesar shapes agrupados recursivamente (wpg:wgp -> wsp:wsp)
            for wgp in p._element.findall(f'.//{{{WPG_NS}}}wgp'):
                for wsp in wgp.findall(f'.//{{{WPS_NS}}}wsp'):
                    for b in wsp.findall(f'.//{{{A_NS}}}blip'):
                        r_id = b.attrib.get(f'{{{R_NS}}}embed')
                        if r_id:
                            # Los shapes anidados asumen formato inline relativo a su grupo
                            ext = wsp.find(f'.//{{{A_NS}}}ext')
                            w_cm, h_cm = 12.0, 8.0
                            if ext is not None:
                                try:
                                    w_cm = int(ext.get('cx', 0)) / 360000.0
                                    h_cm = int(ext.get('cy', 0)) / 360000.0
                                except (ValueError, TypeError): pass
                            blip_info.append((r_id, None, w_cm, h_cm))

            # 3. Legacy VML
            vml_elems = p._element.findall(f'.//{{{V_NS}}}imagedata')
            for v in vml_elems:
                r_id = v.attrib.get(f'{{{R_NS}}}embed') or v.attrib.get(f'{{{R_NS}}}href')
                if r_id:
                    blip_info.append((r_id, None, 12.0, 8.0))

            for r_id, anchor_data, w_cm, h_cm in blip_info:
                if r_id in doc.part.rels:
                    rel = doc.part.rels[r_id]
                    if "image" in rel.target_ref:
                        try:
                            image_part = rel.target_part
                            img_filename: str = f"img_{uuid.uuid4().hex[:8]}.png"
                            img_path = session_img_dir / img_filename

                            with open(img_path, "wb") as f_img:
                                f_img.write(image_part.blob)

                            img_note = None
                            render_error = None

                            content_type = (getattr(image_part, 'content_type', '') or '').lower()
                            if any(token in content_type for token in ('image/x-emf', 'image/emf', 'image/x-wmf', 'image/wmf')):
                                render_error = 'Formato vectorial EMF/WMF no renderizable directamente en el navegador.'
                            else:
                                try:
                                    from PIL import Image as PILImage
                                    with PILImage.open(img_path) as test_img:
                                        test_img.verify()
                                except ModuleNotFoundError:
                                    # Pillow no instalado (p.ej. bundle sin PIL): no marcar la imagen como
                                    # no renderizable — el archivo se sirve igual por /api/images/{file}.
                                    render_error = None
                                except Exception as verify_err:
                                    render_error = f'La imagen no pudo verificarse para previsualización: {verify_err.__class__.__name__}'

                            has_images = True
                            # Clamp image width to APA usable page width (16 cm max), preserving natural size
                            clamped_w = min(round(w_cm, 2), 16.0)
                            clamped_h = round(h_cm * (clamped_w / w_cm), 2) if w_cm > 0 else round(h_cm, 2)
                            img_model = ImageModel(
                                element_id=f"elem_{element_counter}",
                                file_path=str(img_path),
                                filename=img_filename,
                                relative_url=f"/api/images/{session_id}/{img_filename}",
                                render_error=render_error,
                                width_cm=clamped_w,
                                height_cm=clamped_h,
                                caption="",
                                figure_number=0,
                                note=img_note,
                            )

                            if anchor_data:
                                img_model.is_anchor = anchor_data.get("is_anchor", False)
                                img_model.anchor_pos_h = anchor_data.get("anchor_pos_h")
                                img_model.anchor_pos_v = anchor_data.get("anchor_pos_v")
                                img_model.wrap_style = anchor_data.get("wrap_style", "inline")

                            images_in_p.append(img_model)
                        except Exception as img_err:
                            print(f"[WARN] Error extrayendo imagen: {img_err}")

            # Si hay imagenes en el parrafo, agregar elementos IMAGE
            if images_in_p:
                for img in images_in_p:
                    elem_img = ElementModel(
                        id=f"elem_{element_counter}",
                        type=ElementType.IMAGE,
                        text="",
                        confidence=1.0,
                        image_info=img,
                    )
                    elements.append(elem_img)

            # Si ademas hay texto en el parrafo (o si no habia imagen), agregar elemento de texto/parrafo
            if text or not images_in_p:
                style_name: str = p.style.name if p.style else "Normal"
                bullet_source: Optional[str] = None
                num_level: Optional[int] = None
                detected_number_style: Optional[NumberStyle] = None
                detected_bullet_style: Optional[BulletStyle] = None
                detected_element_type = ElementType.PARAGRAPH
                try:
                    pPr_ns = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
                    num_pr = p._element.find(f'{pPr_ns}pPr/{pPr_ns}numPr')
                    if num_pr is not None:
                        bullet_source = "ooxml_list"
                        ilvl_el = num_pr.find(f'{pPr_ns}ilvl')
                        if ilvl_el is not None:
                            num_level = int(ilvl_el.attrib.get(f'{pPr_ns}val', '0'))

                        numId_el = num_pr.find(f'{pPr_ns}numId')
                        if numId_el is not None:
                            num_id_val = numId_el.attrib.get(f'{pPr_ns}val', '')
                            numfmt = numbering_type_map.get(num_id_val, 'bullet')

                            if numfmt == 'bullet':
                                detected_element_type = ElementType.BULLET
                                detected_bullet_style = BulletStyle.DISC
                            else:
                                detected_element_type = ElementType.NUMBERED_LIST
                                detected_number_style = OOXML_NUMFMT_TO_NUMBER_STYLE.get(
                                    numfmt, NumberStyle.DECIMAL
                                )
                except Exception:
                    pass

                initial_type = detected_element_type if bullet_source == "ooxml_list" else ElementType.PARAGRAPH

                elem = ElementModel(
                    id=f"elem_{element_counter}",
                    type=initial_type,
                    text=text,
                    original_text=text,
                    style_name=style_name,
                    alignment=align_str,
                    font_name=font_name,
                    font_size=font_size,
                    is_bold=is_bold,
                    is_italic=is_italic,
                    left_indent_cm=left_indent_cm,
                    confidence=0.95 if bullet_source == "ooxml_list" else 0.5,
                    bullet_source=bullet_source,
                    bullet_style=detected_bullet_style,
                    number_style=detected_number_style,
                    list_level=(num_level + 1) if num_level is not None else 1,
                    heading_level=None,
                    has_math=p_has_math,
                    has_fields=p_has_fields,
                    has_shading_residue=p_has_shading,
                    has_web_shading_residue=p_has_web_shading,
                    footnote_ids=footnote_ids,
                    hyperlinks=hyperlinks,
                    bookmarks=bookmarks,
                    equation=EquationConfig() if p_has_math else None,
                )
                elements.append(elem)

            # Si el párrafo contiene un w:sectPr en su pPr, es un corte de sección:
            # emitir un elemento SECTION_BREAK inmediatamente después.
            if child.find(f'{{{W_NS}}}pPr/{{{W_NS}}}sectPr') is not None:
                element_counter += 1
                elements.append(ElementModel(
                    id=f"elem_{element_counter}",
                    type=ElementType.SECTION_BREAK,
                    text="",
                    confidence=1.0,
                ))

        # --- CASO B1: SECTPR DIRECTO DEL BODY (sectPr final de la última sección) ---
        elif tag.endswith("sectPr"):
            element_counter += 1
            elements.append(ElementModel(
                id=f"elem_{element_counter}",
                type=ElementType.SECTION_BREAK,
                text="",
                confidence=1.0,
            ))

        # --- CASO B: TABLA (<w:tbl>) ---
        elif tag.endswith("tbl"):
            element_counter += 1
            has_tables_detected = True

            # --- NUEVO: Extraer imagenes embebidas en la tabla ---
            tbl_blips = []
            A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'
            R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
            WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
            V_NS = 'urn:schemas-microsoft-com:vml'

            for drawing in child.findall(f'.//{{{WP_NS}}}inline') + child.findall(f'.//{{{WP_NS}}}anchor'):
                extent_elem = drawing.find(f'.//{{{WP_NS}}}extent')
                w_cm, h_cm = 12.0, 8.0
                if extent_elem is not None:
                    try:
                        w_cm = int(extent_elem.get('cx', 0)) / 360000.0
                        h_cm = int(extent_elem.get('cy', 0)) / 360000.0
                    except (ValueError, TypeError): pass
                for b in drawing.findall(f'.//{{{A_NS}}}blip'):
                    r_id = b.attrib.get(f'{{{R_NS}}}embed')
                    if r_id: tbl_blips.append((r_id, w_cm, h_cm))

            for v in child.findall(f'.//{{{V_NS}}}imagedata'):
                r_id = v.attrib.get(f'{{{R_NS}}}embed') or v.attrib.get(f'{{{R_NS}}}href')
                if r_id: tbl_blips.append((r_id, 12.0, 8.0))

            for r_id, w_cm, h_cm in tbl_blips:
                if r_id in doc.part.rels:
                    rel = doc.part.rels[r_id]
                    if "image" in rel.target_ref:
                        try:
                            image_part = rel.target_part
                            img_filename = f"img_{uuid.uuid4().hex[:8]}.png"
                            img_path = session_img_dir / img_filename
                            with open(img_path, "wb") as f_img:
                                f_img.write(image_part.blob)

                            has_images = True
                            clamped_w = min(round(w_cm, 2), 16.0)
                            clamped_h = round(h_cm * (clamped_w / w_cm), 2) if w_cm > 0 else round(h_cm, 2)
                            img_model = ImageModel(
                                element_id=f"elem_{element_counter}",
                                file_path=str(img_path),
                                filename=img_filename,
                                relative_url=f"/api/images/{session_id}/{img_filename}",
                                width_cm=clamped_w,
                                height_cm=clamped_h,
                                caption="",
                                figure_number=0,
                            )
                            elem_img = ElementModel(
                                id=f"elem_{element_counter}",
                                type=ElementType.IMAGE,
                                text="",
                                confidence=1.0,
                                image_info=img_model,
                            )
                            elements.append(elem_img)
                            element_counter += 1
                        except Exception as e:
                            print(f"[WARN] Error tbl image: {e}")
            # --- FIN EXTRACCION IMAGENES TABLA ---

            t = docx.table.Table(child, doc)
            headers: List[str] = []
            rows_data: List[List[str]] = []

            num_cols: int = len(t.columns) if t.columns else 0
            try:
                tbl_grid = t._tbl.find('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tblGrid')
                if tbl_grid is not None:
                    grid_cols = tbl_grid.findall('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}gridCol')
                    if grid_cols:
                        num_cols = len(grid_cols)
            except Exception:
                pass

            for row_idx, row in enumerate(t.rows):
                row_cells = [cell.text.strip() for cell in row.cells]
                while len(row_cells) < num_cols:
                    row_cells.append("")
                if row_idx == 0:
                    headers = row_cells
                else:
                    rows_data.append(row_cells)

            tbl_model = TableModel(
                element_id=f"elem_{element_counter}",
                headers=headers,
                rows=rows_data,
                caption="",
                table_number=0,
            )

            elem = ElementModel(
                id=f"elem_{element_counter}",
                type=ElementType.TABLE,
                text=f"Tabla con {len(headers)} columnas",
                confidence=1.0,
                table_info=tbl_model,
            )
            elements.append(elem)

    # Fallback: agregar texto de cuadros de texto/shapes si el doc parece vacio de parrafos
    if not elements or all(
        e.type == ElementType.EMPTY
        for e in elements
        if e.type != ElementType.IMAGE and e.type != ElementType.TABLE
    ):
        for t_text in textbox_texts:
            element_counter += 1
            if t_text.strip():
                total_words += len(t_text.split())
            elem = ElementModel(
                id=f"elem_{element_counter}",
                type=ElementType.PORTADA_BLOCK,
                text=t_text,
                original_text=t_text,
                confidence=0.70,
            )
            elements.append(elem)

    # NOTA: Ya NO insertamos textbox_texts como PORTADA_BLOCK al inicio de documentos
    # con contenido real. El texto de cuadros de texto SOLO se usa para inferir metadatos
    # de portada (guardados en doc_model.portada). La portada original NO se toca —
    # el usuario llena el formulario y se genera una portada APA limpia.

    # Detectar si hay elementos que parecen portada (antes del primer heading)
    portada_detected: bool = False
    for elem in elements:
        if elem.type == ElementType.IMAGE or (
            elem.text and any(
                kw in elem.text.lower()
                for kw in ["universidad", "facultad", "escuela", "tesis", "monografia"]
            )
        ):
            portada_detected = True
            break

    # Deduplicar IDs de elementos para garantizar unicidad absoluta
    seen_ids = set()
    for e_idx, elem in enumerate(elements):
        while not elem.id or elem.id in seen_ids:
            element_counter += 1
            elem.id = f"elem_{element_counter}"
        seen_ids.add(elem.id)

    # ── PAGINACION EXACTA VIA COM/LIBREOFFICE ────────────────────────────
    from parsing.page_layout_provider import get_page_layout_provider
    session_docx_path = storage_dir / "sessions" / session_id / "original.docx"
    layout_result = None
    if not skip_page_layout:
        try:
            session_docx_path.parent.mkdir(parents=True, exist_ok=True)
            session_docx_path.write_bytes(file_bytes)
            provider = get_page_layout_provider()
            layout_result = provider.paginate(session_docx_path, timeout_seconds=30)
        except Exception as e:
            print(f"[WARN] Page layout provider falló: {e}")

    body_start_idx_from_layout = None
    if layout_result and layout_result.paragraph_pages:
        for i, elem in enumerate(elements):
            if i < len(layout_result.paragraph_pages):
                elem.page_number = layout_result.paragraph_pages[i]

        last_page1_idx = max(
            (i for i, pg in enumerate(layout_result.paragraph_pages) if pg == 1),
            default=-1
        )
        if last_page1_idx != -1:
            body_start_idx_from_layout = last_page1_idx + 1

    # ── PASO 4: Asociación de Leyendas por Proximidad (Fase 4) ─────────────
    elements = associate_captions_by_proximity(elements)

    # ── PASO 5: Pre-clasificación ──────────────────────────────────────────
    elements = pre_classify_elements(elements)

    # ── PASO 5b: Extracción de la sección "Referencias" ────────────────────
    # Antes no se poblabA doc.referencias: el usuario tenía que ingresarlas
    # a mano. Ahora localizamos la sección y la chupamos automáticamente.
    from parsing.references_extractor import extract_references as _extract_refs
    extracted_references = _extract_refs(elements)

    # ── LA DETECCION DE IA AHORA SE HACE EN BACKGROUND ───────────────

    # Construir metadatos
    meta = DocumentMeta(
        source_file=file_name,
        source_hash=source_hash,
        wordapa7_version="1.0.0",
        previously_processed=False,
        parsed_at=datetime.now(timezone.utc).isoformat(),
        page_count=layout_result.total_pages if layout_result else max(1, total_words // 250),
        page_count_exact=bool(layout_result and layout_result.provider_used != "heuristic"),
        forensic_metadata=forensic_metadata,
        paragraph_pages=layout_result.paragraph_pages if layout_result else [],
        page_layout_provider=layout_result.provider_used if layout_result else "",
        page_layout_confidence=layout_result.confidence if layout_result else 0.0,
        word_count=total_words,
        has_images=has_images,
        has_tables=has_tables_detected,
        has_equations=has_equations,
        has_ole_objects=has_ole,
        has_bookmarks=has_bookmarks,
        has_hyperlinks=has_hyperlinks,
        hyperlink_count=hyperlink_count,
        portada_detected=portada_detected,
        apa_format=APAFormat.STUDENT,
        work_mode=WorkMode.REVIEW,
        sections=sections_models,
        footnotes=all_footnotes,
        comments=comments_parsed,
        comment_count=comment_count,
        has_track_changes=has_track_changes,
        has_multicolumn=has_multicolumn,
        has_smartart=has_smartart,
        has_charts=has_charts,
    )

    # Inferir campos de portada desde el texto de cuadros de texto/shapes o parrafos iniciales
    inferred_portada_fields: dict[str, str] = {}
    if textbox_has_content:
        inferred_portada_fields = _infer_portada_from_textboxes(textbox_texts)

    if not inferred_portada_fields or not inferred_portada_fields.get("title"):
        para_fields = _infer_portada_from_paragraphs(elements, textbox_texts if textbox_has_content else None)
        inferred_portada_fields = {**para_fields, **inferred_portada_fields}

    # Detectar inicio del cuerpo usando el parser ultra-rápido en memoria C-binding
    # (evita recorrer todos los elementos extraídos y regex lento)
    body_start_paragraph_idx = fast_parse_body_start(sanitized_bytes)

    doc_model = DocumentModel(
        session_id=session_id,
        file_name=file_name,
        apa_format=APAFormat.STUDENT,
        elements=elements,
        has_landscape_sections=has_landscape,
        meta=meta,
    )

    # Poblar referencias extraídas del documento (si se encontró la sección)
    if extracted_references:
        doc_model.referencias = extracted_references

    # Guardar texto de textboxes y campos inferidos en el modelo
    # para que el frontend pueda pre-llenar el formulario de portada
    # y el generador pueda preservar el contenido original
    if textbox_has_content or inferred_portada_fields:
        cleaned_portada_fields = {
            key: (value.strip() if isinstance(value, str) else value)
            for key, value in inferred_portada_fields.items()
        }
        doc_model.portada = {
            "detected": portada_detected or textbox_has_content or bool(inferred_portada_fields),
            "element_ids": [
                e.id for e in elements
                if e.type == ElementType.PORTADA_BLOCK
            ],
            "textbox_texts": textbox_texts,
            "fields": cleaned_portada_fields,
            "profile_name": None,
            "body_start_paragraph_idx": body_start_paragraph_idx,
        }
    else:
        # Asegurar que body_start_paragraph_idx se guarda incluso sin portada
        doc_model.portada["body_start_paragraph_idx"] = body_start_paragraph_idx

    # Sobreescribir body_start_paragraph_idx si el layout lo calculó
    if body_start_idx_from_layout is not None:
        doc_model.portada["body_start_paragraph_idx"] = body_start_idx_from_layout
        doc_model.portada["body_start_source"] = "page_layout"

    # Marcar truncamiento preventivo si se excedió el límite de elementos.
    # Se informa al usuario vía content_warning y los flags explícitos del meta.
    if elements_truncated:
        doc_model.meta.elements_truncated = True
        doc_model.meta.elements_truncated_at = len(elements)
        doc_model.meta.content_warning = (
            f"El documento excede el límite de {MAX_ELEMENTS} elementos y fue "
            f"truncado. Importa solo los primeros {len(elements)} elementos. "
            f"Para procesar documentos más grandes, ajusta la variable de "
            f"entorno WORDAPA7_MAX_ELEMENTS."
        )

    # Avisos no fatales de contenido preservado (notas, comentarios, Track Changes).
    extra_warnings: list[str] = []
    if comment_count or has_comment_anchors:
        extra_warnings.append(
            f"El documento contiene {comment_count} comentario(s) de Word que no se importan al formato APA."
        )
    if has_track_changes:
        extra_warnings.append(
            "El documento contiene cambios controlados (Track Changes); el texto eliminado se omitió."
        )
    if all_footnotes:
        extra_warnings.append(
            f"Se detectaron {len(all_footnotes)} nota(s) al pie/final que se conservan al final de cada párrafo."
        )
    if extra_warnings:
        existing_warning = doc_model.meta.content_warning
        doc_model.meta.content_warning = (
            (existing_warning + " | " + " ".join(extra_warnings))
            if existing_warning
            else " ".join(extra_warnings)
        )

    # ── Filtro de ruido: eliminar elementos empty sin contenido real ────
    original_count = len(doc_model.elements)
    doc_model.elements = [
        e for e in doc_model.elements
        if not (
            e.type == ElementType.EMPTY
            and not (e.image_info and (e.image_info.width_cm or e.image_info.relative_url))
            and not (e.text and e.text.strip())
            and not e.table_info
        )
    ]
    if original_count > len(doc_model.elements):
        print(f"[docx_parser] Filtrados {original_count - len(doc_model.elements)} elementos vacíos sin contenido.")

    return doc_model
