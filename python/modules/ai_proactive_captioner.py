"""
WordAPA7 — Proactive Auto-Captioning Engine
Analiza en segundo plano el documento para detectar figuras y tablas sin leyenda,
extrayendo el contexto semántico de los párrafos adyacentes para sugerir títulos y notas APA 7.
"""

import logging
from typing import Any, Dict, List, Optional
from models import DocumentModel, ElementModel
from modules.ai_client import execute_with_specialty, en_lote

logger = logging.getLogger(__name__)

CAPTION_PROMPT = """Eres un especialista en Normas APA 7ma edición.
A continuación tienes una figura o tabla y los párrafos que la rodean en un documento académico.

Genera:
1. "caption": Título breve y descriptivo en cursiva según APA 7 (máximo 8 palabras).
2. "note": Nota de figura o tabla APA 7 (comienza con "Nota. ...", describe la fuente o elaboración propia).

Responde ÚNICAMENTE en formato JSON válido:
{
  "caption": "Distribución porcentual de los rendimientos térmicos",
  "note": "Nota. Adaptado de los registros experimentales de la fase 2."
}
"""

@en_lote
async def analyze_document_proactive_captions(
    document: DocumentModel,
    api_key: Optional[str] = None,
    provider_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Recorre las tablas e imágenes del documento y sugiere leyendas y notas para aquellas que las necesite."""
    suggestions = []
    elements = document.elements

    for i, elem in enumerate(elements):
        if elem.type not in ("image", "table"):
            continue

        is_image = (elem.type == "image")
        current_caption = ""
        current_note = ""

        if is_image and elem.image_info:
            current_caption = elem.image_info.caption or ""
            current_note = getattr(elem.image_info, "note", "") or ""
        elif not is_image and elem.table_info:
            current_caption = elem.table_info.caption or ""
            current_note = getattr(elem.table_info, "note", "") or ""

        # Si ya tiene una leyenda personalizada detallada, omitir
        if len(current_caption.strip()) > 15:
            continue

        # Extraer ventana de contexto (2 párrafos antes y 2 después)
        surrounding_text = []
        start_idx = max(0, i - 2)
        end_idx = min(len(elements), i + 3)

        for neighbor in elements[start_idx:end_idx]:
            if neighbor.id != elem.id and neighbor.text and neighbor.text.strip():
                surrounding_text.append(neighbor.text.strip())

        context_str = "\n".join(surrounding_text)
        if not context_str.strip():
            context_str = f"Elemento de tipo {'Figura' if is_image else 'Tabla'} en sección de resultados."

        elem_desc = f"Tipo: {'Figura' if is_image else 'Tabla'}\nTexto contextual:\n{context_str}"

        try:
            raw = await execute_with_specialty(
                prompt=f"{elem_desc}\n\nGenera el JSON con 'caption' y 'note'.",
                system_prompt=CAPTION_PROMPT,
                specialty="FAST",
                api_key=api_key,
                provider_id=provider_id,
                temperature=0.3,
                max_tokens=250,
                use_cache=True,
            )
            # Parsear JSON
            import json, re
            match = re.search(r"\{.*?\}", raw, re.DOTALL)
            if match:
                data = json.loads(match.group(0))
                suggestions.append({
                    "element_id": elem.id,
                    "type": elem.type,
                    "caption": data.get("caption", "").strip(),
                    "note": data.get("note", "").strip(),
                })
        except Exception as e:
            logger.warning(f"No se pudo generar auto-caption para elemento {elem.id}: {e}")

    return suggestions
