import re
from pathlib import Path

import docx

doc_path = Path(r"C:\Users\--X\.gemini\antigravity\scratch\wordapa7\10mo Trabajo Contabilidad_APA7.docx")
doc = docx.Document(str(doc_path))

print("=== BUSCANDO 'Wilmary' O 'Walter' O 'Carnet' EN TODOS LOS PARRAFOS ===")
for idx, p in enumerate(doc.paragraphs):
    xml_str = p._element.xml
    if 'Wilmary' in xml_str or 'Walter' in xml_str or 'Carnet' in xml_str:
        print(f"ENCONTRADO EN PARRAFO P{idx}:")
        texts = re.findall(r'<w:t[^>]*>(.*?)</w:t>', xml_str)
        print("   w:t:", [t for t in texts if t.strip()])
