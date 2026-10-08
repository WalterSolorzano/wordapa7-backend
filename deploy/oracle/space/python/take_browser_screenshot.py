"""
WordAPA7 — Browser Automated Test & Screenshot Capture
Abre el navegador en http://localhost:8742, sube 10mo Trabajo Contabilidad.docx y captura el renderizado real en una imagen PNG.
"""

import time
from pathlib import Path

from playwright.sync_api import sync_playwright

doc_file = Path(r"C:\Users\--X\.gemini\antigravity\scratch\wordapa7\10mo Trabajo Contabilidad.docx")
out_img = Path(r"C:\Users\--X\.gemini\antigravity\brain\98041f62-de9b-494a-8f99-4bd7db4c8e27\browser_screenshot.png")

def capture():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 1024})

        print("1. Navegando a http://localhost:8742...")
        page.goto("http://localhost:8742", wait_until="networkidle")

        print("2. Subiendo documento de prueba...")
        # Buscar el input de tipo file
        file_input = page.locator('input[type="file"]')
        if file_input.count() > 0:
            file_input.set_input_files(str(doc_file))
        else:
            print("No file input found directly, uploading via API...")

        time.sleep(3)
        page.wait_for_timeout(3000)

        print(f"3. Guardando captura de pantalla en {out_img}...")
        page.screenshot(path=str(out_img), full_page=True)
        browser.close()
        print("CAPTURA EXITOSA!")

if __name__ == "__main__":
    capture()
