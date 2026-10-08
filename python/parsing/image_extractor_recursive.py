from pathlib import Path
from typing import Any, Dict, List

import docx


def extract_all_images_recursive(doc: docx.Document, output_dir: Path) -> List[Dict[str, Any]]:
    """
    Extracts all images from a DOCX document recursively, including floating images,
    images inside shapes, and SmartArt.
    Returns a list of dictionaries with image metadata.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    extracted_images = []

    # We will iterate over all XML elements looking for blip/imagedata
    root = doc._element
    nsmap = {
        'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
        'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture',
        'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
        'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
        'v': 'urn:schemas-microsoft-com:vml'
    }

    # Find drawingML blips
    blips = root.findall('.//a:blip', nsmap)
    # Find VML imagedata
    imagedatas = root.findall('.//v:imagedata', nsmap)

    image_idx = 0

    def process_embed(embed_id, xml_element, is_floating=False):
        nonlocal image_idx
        if not embed_id:
            return

        try:
            part = doc.part.related_parts[embed_id]
            image_bytes = part.blob
            ext = part.content_type.split('/')[-1]
            if ext == 'jpeg': ext = 'jpg'

            filename = f"image_{image_idx}.{ext}"
            filepath = output_dir / filename

            with open(filepath, 'wb') as f:
                f.write(image_bytes)

            extracted_images.append({
                'id': embed_id,
                'path': str(filepath),
                'src': f"file://{filepath.absolute().as_posix()}",
                'is_floating': is_floating,
                'filename': filename,
                'xml_element': xml_element
            })
            image_idx += 1
        except KeyError:
            pass

    for blip in blips:
        embed_id = blip.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')

        # Check if it's floating (has wp:anchor parent)
        is_floating = False
        parent = blip.getparent()
        while parent is not None:
            if parent.tag.endswith('anchor'):
                is_floating = True
                break
            parent = parent.getparent()

        process_embed(embed_id, blip, is_floating)

    for imagedata in imagedatas:
        embed_id = imagedata.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
        process_embed(embed_id, imagedata, False)

    return extracted_images

def associate_captions_by_proximity(elements: List[Any]) -> List[Any]:
    import re
    caption_pattern = re.compile(r'^(figura|figure|tabla|table)\s*\d+.*', re.IGNORECASE)

    for i, elem in enumerate(elements):
        if getattr(elem, 'type', None) == 'IMAGE' or getattr(elem, 'type', None) == 'TABLE':
            # Look ahead for caption
            for j in range(i+1, min(i+3, len(elements))):
                next_elem = elements[j]
                if getattr(next_elem, 'type', None) == 'EMPTY':
                    continue
                if next_elem.text and caption_pattern.match(next_elem.text.strip()):
                    if getattr(elem, 'image_info', None):
                        elem.image_info.caption = next_elem.text
                    elif getattr(elem, 'table_info', None):
                        elem.table_info.caption = next_elem.text
                    next_elem.type = 'CAPTION'
                    break

            # Look behind for caption
            for j in range(i-1, max(-1, i-3), -1):
                prev_elem = elements[j]
                if getattr(prev_elem, 'type', None) == 'EMPTY':
                    continue
                if prev_elem.text and caption_pattern.match(prev_elem.text.strip()):
                    if getattr(elem, 'image_info', None):
                        elem.image_info.caption = prev_elem.text
                    elif getattr(elem, 'table_info', None):
                        elem.table_info.caption = prev_elem.text
                    prev_elem.type = 'CAPTION'
                    break

    return elements
