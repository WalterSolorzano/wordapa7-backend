"""
WordAPA7 — Proactive AI Diagnostic & Proposal Engine
Analiza autónomamente los elementos del documento y genera propuestas de solución
concretas y listas para aplicar con 1 clic (sin que el usuario tenga que escribir prompts).
Regla estricta: Cero emojis en todas las respuestas y diagnósticos.
"""

import logging
import re
from typing import Any, Dict, List, Optional
from models import DocumentModel, ElementModel, ElementType
from modules.ai_client import execute_with_specialty
from modules.referencias_module import search_crossref_by_author_year

logger = logging.getLogger(__name__)

# Heurísticas rápidas locales para diagnóstico proactivo sin latencia
FIRST_PERSON_PATTERNS = [
    (r"\b(yo\s+hice|yo\s+realic[eé]|yo\s+investigu[eé]|en\s+mi\s+opini[oó]n|a\s+mi\s+parecer|yo\s+considero)\b", "Uso de primera persona singular (APA 7 requiere voz impersonal)"),
    (r"\b(nosotros\s+creemos|nosotros\s+consideramos|en\s+nuestro\s+estudio\s+creemos|nosotros\s+hicimos)\b", "Uso de primera persona plural informal"),
]

AI_FILLER_PATTERNS = [
    (r"\b(en\s+conclusi[oó]n\s*,?\s*es\s+importante\s+destacar\s+que)\b", "Muletilla común de IA"),
    (r"\b(cabe\s+resaltar\s+que\s+resulta\s+fundamental\s+comprender)\b", "Construcción redundante de IA"),
    (r"\b(en\s+el\s+vasto\s+tapiz\s+de|en\s+el\s+mundo\s+actual\s+en\s+constante\s+evoluci[oó]n)\b", "Frase cliché típica de modelos generativos"),
]

def generate_local_diagnostic(elem: ElementModel) -> Optional[Dict[str, Any]]:
    """Analiza un elemento con reglas deterministas APA 7 y genera una propuesta inmediata."""
    text = (elem.text or "").strip()
    if not text:
        return None

    # 1. Chequeo de primera persona / tono
    for pattern, desc in FIRST_PERSON_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            # Proponer sustitución impersonal básica
            proposed = re.sub(r"\byo\s+realic[eé]\b", "se realizó", text, flags=re.IGNORECASE)
            proposed = re.sub(r"\byo\s+investigu[eé]\b", "se investigó", proposed, flags=re.IGNORECASE)
            proposed = re.sub(r"\ben\s+mi\s+opini[oó]n\b", "de acuerdo con la evidencia", proposed, flags=re.IGNORECASE)
            proposed = re.sub(r"\byo\s+considero\b", "se considera", proposed, flags=re.IGNORECASE)
            proposed = re.sub(r"\bnosotros\s+creemos\b", "los resultados sugieren", proposed, flags=re.IGNORECASE)
            return {
                "element_id": elem.id,
                "type": "formalize_tone",
                "diagnosis": desc,
                "original_text": text,
                "proposed_text": proposed,
                "action_type": "update_text",
            }

    # 2. Detección de cita larga (>40 palabras con comillas) en párrafo normal
    if elem.type == "paragraph" and ('"' in text or "“" in text or "«" in text):
        quote_match = re.search(r'["“«]([^"”»]{150,})["”»]', text)
        if quote_match:
            words = quote_match.group(1).split()
            if len(words) >= 40:
                return {
                    "element_id": elem.id,
                    "type": "convert_block_quote",
                    "diagnosis": f"Cita textual extensa ({len(words)} palabras): APA 7 requiere formato de cita en bloque sin comillas e indentación de 1.27 cm.",
                    "original_text": text,
                    "proposed_text": quote_match.group(1).strip(),
                    "action_type": "set_type",
                    "new_type": "block_quote",
                }

    # 3. Detección de ecuación sin formato
    if elem.type == "paragraph" and re.search(r"[a-zA-Z]\s*=\s*[-+]?[0-9a-zA-Z\(\)\/\*\^\\]+", text) and len(text) < 120:
        if not re.search(r"\b(el|la|los|las|de|en|con|por)\b", text, re.IGNORECASE):
            return {
                "element_id": elem.id,
                "type": "format_equation",
                "diagnosis": "Ecuación matemática detectada: APA 7 requiere centrado y numeración consecutiva a la derecha.",
                "original_text": text,
                "proposed_text": text,
                "action_type": "set_type",
                "new_type": "equation",
            }

    return None

async def diagnose_element_with_ai(
    elem: ElementModel,
    surrounding_context: str = "",
    api_key: Optional[str] = None,
    provider_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Usa el router rápido (Groq/Cerebras) para formular una propuesta académica proactiva de 1 clic."""
    local = generate_local_diagnostic(elem)
    if local:
        return local

    text = (elem.text or "").strip()
    if len(text) < 25:
        return None

    prompt = (
        "Analiza el siguiente párrafo académico. Si tiene fallas de redacción APA 7 (tono informal, "
        "primera persona, falta de concisión), redacta la versión corregida formal.\n\n"
        f"Texto:\n{text}\n\n"
        "Responde ÚNICAMENTE en JSON válido sin texto extra:\n"
        "{\n"
        '  "has_issue": true,\n'
        '  "diagnosis": "Breve motivo del problema en una frase.",\n'
        '  "proposed_text": "Texto corregido en estilo APA 7"\n'
        "}"
    )

    system_prompt = "Eres un auditor de estilo APA 7. Responde estrictamente con el JSON solicitado sin emojis."

    try:
        raw = await execute_with_specialty(
            prompt=prompt,
            system_prompt=system_prompt,
            specialty="FAST",
            api_key=api_key,
            provider_id=provider_id,
            temperature=0.2,
            max_tokens=600,
            use_cache=True,
        )
        import json
        match = re.search(r"\{.*?\}", raw, re.DOTALL)
        if match:
            data = json.loads(match.group(0))
            if data.get("has_issue") and data.get("proposed_text"):
                return {
                    "element_id": elem.id,
                    "type": "ai_enhancement",
                    "diagnosis": data.get("diagnosis", "Mejora de estilo formal APA 7"),
                    "original_text": text,
                    "proposed_text": data.get("proposed_text", "").strip(),
                    "action_type": "update_text",
                }
    except Exception as e:
        logger.warning(f"Error en diagnóstico proactivo con IA: {e}")

    return None
