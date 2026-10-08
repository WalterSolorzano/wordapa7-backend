import time
from pathlib import Path

from playwright.sync_api import sync_playwright

doc_file = Path(r"C:\Users\--X\.gemini\antigravity\scratch\wordapa7\10mo Trabajo Contabilidad.docx")
out_img_scroll = Path(r"C:\Users\--X\.gemini\antigravity\brain\98041f62-de9b-494a-8f99-4bd7db4c8e27\page2_scroll_screenshot.png")

def capture():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 1200})

        page.goto("http://localhost:8742", wait_until="networkidle")
        file_input = page.locator('input[type="file"]')
        if file_input.count() > 0:
            file_input.set_input_files(str(doc_file))

        time.sleep(3)
        page.wait_for_timeout(3000)

        # Scroll down to page 2 (1400px down inside canvas)
        canvas = page.locator('.paper-canvas-wrapper')
        if canvas.count() > 0:
            canvas.evaluate("el => el.scrollTop = 1100")
        time.sleep(1)
        page.screenshot(path=str(out_img_scroll))
        browser.close()
        print("Captura de pagina 2 realizada con exito!")

if __name__ == "__main__":
    capture()
