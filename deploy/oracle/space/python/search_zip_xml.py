import re
import zipfile
from pathlib import Path

doc_path = Path(r"C:\Users\--X\.gemini\antigravity\scratch\wordapa7\10mo Trabajo Contabilidad_APA7.docx")

with zipfile.ZipFile(doc_path, 'r') as z:
    for filename in z.namelist():
        if filename.endswith('.xml'):
            content = z.read(filename).decode('utf-8', errors='ignore')
            if 'Wilmary' in content or 'Walter' in content or 'Carnet' in content:
                print(f"=== ENCONTRADO EN {filename} ===")
                matches = re.findall(r'.{0,50}(?:Wilmary|Walter|Carnet).{0,50}', content)
                for m in matches[:10]:
                    print("   MATCH:", m.strip())
