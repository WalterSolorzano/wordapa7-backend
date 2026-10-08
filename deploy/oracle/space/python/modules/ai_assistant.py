import logging
from typing import Optional

from modules.ai_client import execute_with_specialty

logger = logging.getLogger(__name__)

async def generate_caption_suggestion(context_text: str, api_key: Optional[str] = None) -> str:
    """Generates a figure/table caption suggestion using an LLM provider."""

    prompt = (
        "Eres un asistente experto en normas APA 7ma edicin. "
        "Se te proporcionar el texto que rodea a una figura o tabla en un documento acadmico. "
        "Tu tarea es generar un ttulo (caption) descriptivo, claro y conciso para la figura o tabla, "
        "que cumpla con el estilo APA 7 (el ttulo debe ser breve, descriptivo y en cursiva, pero t solo devuelve el texto sin formato Markdown).\n\n"
        f"Contexto:\n{context_text}\n\n"
        "Ttulo sugerido:"
    )

    system_prompt = "Genera sugerencias directas sin texto de relleno."

    try:
        content = await execute_with_specialty(
            prompt=prompt,
            system_prompt=system_prompt,
            specialty="FAST",
            api_key=api_key,
            temperature=0.3,
            max_tokens=100,
            use_cache=True
        )
        return content.strip().replace('"', '')
    except Exception as e:
        logger.error(f"Error generando caption: {e}")
        raise

async def rewrite_text_suggestion(text: str, instruction: str, api_key: Optional[str] = None) -> str:
    """Rewrites a paragraph according to a specific instruction using an LLM provider."""

    prompt = (
        "Eres un asistente experto en redaccin acadmica y normas APA 7ma edicin. "
        "Se te proporcionar un texto y una instruccin sobre cmo reescribirlo. "
        "Reescribe el texto siguiendo exactamente la instruccin. "
        "Devuelve NICAMENTE el texto reescrito, sin prembulos, sin comillas adicionales y sin explicaciones.\n\n"
        f"Instruccin: {instruction}\n\n"
        f"Texto original:\n{text}\n\n"
        "Texto reescrito:"
    )

    system_prompt = "Eres un editor acadmico estricto. Solo devuelve el texto corregido."

    try:
        content = await execute_with_specialty(
            prompt=prompt,
            system_prompt=system_prompt,
            specialty="FAST",
            api_key=api_key,
            temperature=0.4,
            max_tokens=1000,
            use_cache=True
        )
        return content.strip()
    except Exception as e:
        logger.error(f"Error reescribiendo texto: {e}")
        raise

async def explain_element(element_type: str, text: str, rules_applied: str, confidence: float, api_key: Optional[str] = None) -> str:
    """Explains why an element was classified as such."""

    prompt = (
        f"Eres un asistente experto en normas APA 7ma edicin. "
        f"El sistema ha clasificado el siguiente texto como '{element_type}' con una confianza del {confidence*100:.1f}%. "
        f"La regla o justificacin interna fue: {rules_applied}. "
        f"Responde a la pregunta: 'Por qu este elemento fue clasificado as?' en 1 o 2 oraciones, de forma clara y directa al usuario.\n\n"
        f"Texto original:\n{text}\n\n"
        "Explicacin breve:"
    )

    system_prompt = "Eres un asistente conciso. Responde en 1-2 oraciones mximo sin prembulos."

    try:
        content = await execute_with_specialty(
            prompt=prompt,
            system_prompt=system_prompt,
            specialty="REASONING",
            api_key=api_key,
            temperature=0.2,
            max_tokens=150,
            use_cache=True
        )
        return content.strip()
    except Exception as e:
        logger.error(f"Error explicando elemento: {e}")
        raise
