"""
WordAPA7 - In-Memory Zip Virtualization & High-Speed Iterparse
Uses direct memory streaming and lxml C-bindings for near-native XML parsing.
"""

import io
import zipfile

from lxml import etree

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS_MAP = {'w': W_NS}

def fast_parse_body_start(file_bytes: bytes) -> int:
    """
    Returns the index of the first body paragraph (skipping cover) using ultra-fast iterparse.
    Bypasses python-docx entirely for this heuristic.
    """
    # Use memory mapped file reading if possible, or just io.BytesIO which is fast in RAM
    # Since file_bytes is already in memory, io.BytesIO is optimal here
    with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
        if "word/document.xml" not in zf.namelist():
            return 0

        # Stream the XML directly from the zip without loading the full file in memory
        with zf.open("word/document.xml") as xml_file:
            context = etree.iterparse(xml_file, events=('end',), tag=f"{{{W_NS}}}p")

            body_keywords = [
                "introduccion", "introducción", "resumen", "abstract",
                "metodologia", "metodología", "resultados", "discusion",
                "discusión", "conclusion", "conclusión", "conclusiones",
                "referencias", "bibliografia", "bibliografía", "anexo",
                "capitulo", "capítulo", "marco teorico", "marco teórico",
                "antecedentes", "planteamiento", "justificacion", "justificación",
            ]

            paragraph_idx = 0

            import re
            numbered_regex = re.compile(r'^(?:\d+\.){1,4}\d*\s')

            for event, elem in context:
                # Extract text using fast itertext
                texts = []
                for t_node in elem.iter(f"{{{W_NS}}}t"):
                    if t_node.text:
                        texts.append(t_node.text)

                full_text = "".join(texts).strip()
                if not full_text:
                    elem.clear()
                    paragraph_idx += 1
                    continue

                text_lower = full_text.lower()
                if text_lower.startswith(("tema:", "titulo:", "título:", "asignatura:", "materia:", "carrera:", "evaluacion:", "evaluación:")):
                    elem.clear()
                    paragraph_idx += 1
                    continue

                # Heuristics
                for kw in body_keywords:
                    if kw in text_lower:
                        return paragraph_idx

                words_len = len(full_text.split())
                if words_len > 35:
                    return paragraph_idx

                if numbered_regex.match(text_lower) and words_len <= 15:
                    return paragraph_idx

                # Clean up memory immediately
                elem.clear()
                while elem.getprevious() is not None:
                    del elem.getparent()[0]

                paragraph_idx += 1

    return 0
