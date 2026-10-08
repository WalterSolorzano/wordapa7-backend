import json
import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

async def validate_spelling_and_grammar(docx_path: str) -> Dict[str, Any]:
    """
    Usa COM (Word.Application) para extraer errores ortográficos y gramaticales nativos.
    Retorna la lista de errores y conteos.
    """
    if os.name != 'nt':
        return {"spelling_errors": [], "grammar_errors_count": 0, "status": "not_supported"}

    try:
        from services.word_com_service import get_word_com_service
        word_service = get_word_com_service()
        word = word_service.word
        if not word:
            return {"spelling_errors": [], "grammar_errors_count": 0, "status": "com_error"}

        doc = word.Documents.Open(
            str(docx_path),
            ConfirmConversions=False,
            ReadOnly=True,
            AddToRecentFiles=False
        )

        spelling_errors = []
        try:
            # Iterar errores ortográficos (SpellingErrors devuelve Range)
            # Solo traemos una muestra (max 100) para no colapsar la memoria o tardar mucho
            errors = doc.SpellingErrors
            count = 0
            for err in errors:
                if count >= 100:
                    break
                word_text = err.Text
                # Para sugerencias, usar GetSpellingSuggestions
                suggestions_obj = word.GetSpellingSuggestions(word_text)
                sugs = []
                if suggestions_obj:
                    for i in range(1, min(4, suggestions_obj.Count + 1)):
                        sugs.append(suggestions_obj.Item(i).Name)

                spelling_errors.append({
                    "word": word_text,
                    "suggestions": sugs
                })
                count += 1

            grammar_count = doc.GrammaticalErrors.Count

            return {
                "spelling_errors": spelling_errors,
                "grammar_errors_count": grammar_count,
                "status": "ok"
            }
        finally:
            doc.Close(SaveChanges=False)

    except Exception as e:
        logger.error(f"[SpellingValidator] Error COM: {e}")
        return {"spelling_errors": [], "grammar_errors_count": 0, "status": "error", "message": str(e)}

async def check_spelling_with_ia(errors: List[Dict[str, Any]], api_key: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Filtra los errores usando IA (NVIDIA NIM u otros) para descartar jerga técnica, usando fallback y chunking.
    """
    if not errors or not api_key:
        return errors

    import asyncio

    # Procesar en lotes (Chunking) para evitar limites de tokens
    CHUNK_SIZE = 25
    words = [e["word"] for e in errors]
    batches = [words[i:i + CHUNK_SIZE] for i in range(0, len(words), CHUNK_SIZE)]

    ai_map = {}

    for i, batch in enumerate(batches):
        words_str = ", ".join(batch)
        prompt = (
            "Eres un editor académico estricto. "
            "A continuación se presenta una lista de palabras marcadas como errores ortográficos por Word. "
            "Indica cuáles son verdaderos errores ortográficos y cuáles son términos técnicos válidos, nombres propios o jerga académica en español. "
            "Responde SOLO con un JSON, un array de objetos con 'word' y 'is_error' (booleano)."
            f"\n\nPalabras: {words_str}"
        )
        system_prompt = "Responde únicamente con un JSON válido."

        try:
            from modules.ai_client import execute_with_specialty
            content = await execute_with_specialty(
                prompt=prompt,
                system_prompt=system_prompt,
                specialty="FAST",
                api_key=api_key,
                temperature=0.1,
                max_tokens=1000,
                use_cache=True
            )

            # Parse JSON
            if content.startswith("```json"):
                content = content[7:-3]
            elif content.startswith("```"):
                content = content[3:-3]

            ai_results = json.loads(content.strip())

            for item in ai_results:
                if isinstance(item, dict):
                    ai_map[item.get("word")] = item.get("is_error", True)

        except Exception as e:
            logger.error(f"Error AI Spelling Check (Batch {i+1}): {e}")

        # Pequeño delay entre batches para cuotas gratuitas (ej. Groq 30 requests/min)
        if i < len(batches) - 1:
            await asyncio.sleep(1.5)

    # Merge with original errors
    for err in errors:
        # Por defecto True (es un error) si la IA falló o no lo incluyó
        err["ai_is_error"] = ai_map.get(err["word"], True)

    return errors
