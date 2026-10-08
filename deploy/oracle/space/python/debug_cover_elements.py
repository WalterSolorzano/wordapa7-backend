import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent))

from parsing.docx_parser import parse_docx_bytes

doc_path = Path(r"C:\Users\--X\.gemini\antigravity\scratch\wordapa7\10mo Trabajo Contabilidad.docx")
with open(doc_path, "rb") as f:
    file_bytes = f.read()

doc_model = parse_docx_bytes(file_bytes, "10mo Trabajo Contabilidad.docx", "debug_sess", Path(r"C:\Users\--X\.gemini\antigravity\scratch\wordapa7\storage"))

print(f"Total elements: {len(doc_model.elements)}")
print("\n--- ELEMENTS 0 to 20 ---")
for idx, elem in enumerate(doc_model.elements[:20]):
    text_snippet = elem.text[:60] if elem.text else "[NO TEXT]"
    img_info = f"Img: {elem.image_info.filename}" if elem.image_info else "NoImg"
    print(f"[{idx:02d}] Type: {elem.type:<15} | {img_info:<20} | Text: '{text_snippet}'")
