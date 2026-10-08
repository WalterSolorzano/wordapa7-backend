"""
WordAPA7 — Motor de Auditoría Visual de PDFs (PyMuPDF + V-LLM).

Convierte páginas de PDF exportado a imágenes PNG en memoria y realiza
análisis de layout (títulos huérfanos cerca del borde inferior, desbordamiento
de tablas/figuras, márgenes ajustados) antes de entregar el archivo final.
"""

from __future__ import annotations

import base64
import io
from typing import Any, Dict, List, Optional

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None


def audit_pdf_visual_layout(pdf_bytes: bytes) -> Dict[str, Any]:
    """Audita el PDF renderizado para detectar anomalías visuales en las páginas."""
    result: Dict[str, Any] = {
        "page_count": 0,
        "anomalies": [],
        "passed": True,
    }
    if not pdf_bytes or not fitz:
        return result

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        result["page_count"] = len(doc)
        anomalies: List[Dict[str, Any]] = []

        for page_num in range(len(doc)):
            page = doc[page_num]
            rect = page.rect
            page_h = rect.height

            # Extraer bloques de texto con bounding box
            blocks = page.get_text("blocks")
            if not blocks:
                continue

            # 1. Título huérfano cerca del margen inferior (últimos 80px)
            last_block = blocks[-1]
            last_text = (last_block[4] or "").strip()
            last_y1 = last_block[3]

            if last_text and len(last_text) < 80 and (page_h - last_y1) < 80:
                if any(last_text.startswith(prefix) for prefix in ("1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.", "Capítulo", "Sección", "Introducción", "Método", "Resultados")):
                    anomalies.append({
                        "page": page_num + 1,
                        "kind": "orphan_heading",
                        "severity": "warn",
                        "message": f"Posible título huérfano cerca del final de la página {page_num + 1}: '{last_text[:40]}...'",
                    })

            # 2. Desbordamiento de imágenes o elementos visuales
            images = page.get_images()
            for img in images:
                xref = img[0]
                base_image = doc.extract_image(xref)
                if base_image:
                    h = base_image.get("height", 0)
                    if h > (page_h * 0.85):
                        anomalies.append({
                            "page": page_num + 1,
                            "kind": "large_image_overflow",
                            "severity": "info",
                            "message": f"Imagen extensa en la página {page_num + 1} abarca más del 85% de la altura útil.",
                        })

        result["anomalies"] = anomalies
        result["passed"] = len(anomalies) == 0
        return result
    except Exception as err:
        print(f"[WARN] Error en audit_pdf_visual_layout: {err}")
        return result


async def audit_pdf_with_multimodal_llm(
    pdf_bytes: bytes,
    page_num: int,
    api_key: str,
    prompt: Optional[str] = None,
    provider_id: Optional[str] = None,
) -> Optional[str]:
    """Renderiza una página de PDF a PNG y consulta al modelo visual a través
    del router de IA (TokenBucket, cooldowns, breaker y presupuesto diario).

    Antes hacía una petición HTTP directa a NVIDIA: evadía el rate limiting, se
    comía el cupo sin contarlo y no respetaba `Retry-After`. Ahora la imagen
    viaja como bloque multimodal por `execute_with_specialty`, que es el único
    camino que conoce los límites reales del proveedor.
    """
    if not fitz or not pdf_bytes:
        return None

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        if page_num < 1 or page_num > len(doc):
            return None

        page = doc[page_num - 1]
        pix = page.get_pixmap(dpi=150)
        img_bytes = pix.tobytes("png")

        b64_img = base64.b64encode(img_bytes).decode("utf-8")
        query_prompt = prompt or "Analiza el maquetado APA 7 de esta página: ¿hay tablas cortadas, títulos huérfanos o márgenes desalineados? Responde conciso."

        from modules.ai_client import execute_with_specialty

        return await execute_with_specialty(
            prompt=query_prompt,
            system_prompt="Eres un auditor visual de documentos APA 7.",
            specialty="HEAVY",
            api_key=api_key,
            temperature=0.2,
            max_tokens=500,
            use_cache=False,
            provider_id=provider_id,
            image_b64=b64_img,
        )
    except Exception as e:
        print(f"[WARN] Error en V-LLM visual audit: {e}")

    return None
