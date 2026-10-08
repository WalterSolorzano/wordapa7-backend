import zipfile

doc_path = r"C:\Users\--X\.gemini\antigravity\scratch\wordapa7\10mo Trabajo Contabilidad_APA7.docx"

with zipfile.ZipFile(doc_path, 'r') as z:
    media_files = [f for f in z.namelist() if 'media/' in f]
    print(f"Archivos de imagen (media/) encontrados ({len(media_files)}):")
    for mf in media_files:
        info = z.getinfo(mf)
        print(f"   - {mf} ({info.file_size} bytes)")
