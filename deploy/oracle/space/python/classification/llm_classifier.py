"""
WordAPA7 — Clasificador de LLM Multi-Proveedor con Progreso y Batching Adaptativo

Utiliza una cadena de proveedores (NVIDIA NIM > Groq > OpenRouter > Cerebras >
Mistral > OpenCodeZen > ZenMux > Gemini > heuristica local) para refinar
elementos con baja confianza (< 0.85). Incluye:
- Progreso en tiempo real via GET /api/classify/progress/{session_id}
- Batching adaptativo segun cantidad de elementos
- Delay de 1s entre lotes para evitar rate limiting
- Cache local SHA-256
"""

import asyncio
import json
import os
from typing import Any, Dict, List, Optional

from constants import DEFAULT_NIM_MODEL, NVIDIA_NIM_URL
from models import DocumentModel, ElementModel, ElementType

NVIDIA_NIM_URL: str = NVIDIA_NIM_URL
DEFAULT_MODEL: str = DEFAULT_NIM_MODEL

# ── Provider capacity profiles ──────────────────────────────────────────────
PROVIDER_CAPACITY = {
    "nvidia_nim": {"timeout": 25, "max_tokens_per_request": 4000, "requests_per_minute": 30, "typical_latency_s": 8},
    "groq": {"timeout": 10, "max_tokens_per_request": 4000, "requests_per_minute": 30, "typical_latency_s": 1.5},
    "openrouter": {"timeout": 20, "max_tokens_per_request": 4000, "requests_per_minute": 20, "typical_latency_s": 6},
    "cerebras": {"timeout": 15, "max_tokens_per_request": 4000, "requests_per_minute": 15, "typical_latency_s": 3},
    "mistral": {"timeout": 20, "max_tokens_per_request": 2000, "requests_per_minute": 10, "typical_latency_s": 5},
    "opencodezen": {"timeout": 25, "max_tokens_per_request": 2000, "requests_per_minute": 10, "typical_latency_s": 8},
    "zenmux": {"timeout": 25, "max_tokens_per_request": 2000, "requests_per_minute": 10, "typical_latency_s": 8},
    "gemini": {"timeout": 15, "max_tokens_per_request": 2000, "requests_per_minute": 10, "typical_latency_s": 4},
    # Cloudflare Workers AI — modelo 8B, muy rápido, plan free con límites.
    "cloudflare": {"timeout": 15, "max_tokens_per_request": 2000, "requests_per_minute": 20, "typical_latency_s": 3},
}

# ── Progress tracking (in-memory, keyed by session_id) ──────────────────────
_classify_progress: Dict[str, Dict[str, Any]] = {}


def get_classify_progress(session_id: str) -> Dict[str, Any]:
    """Return current LLM classification progress for a session."""
    return _classify_progress.get(session_id, {
        "status": "idle",
        "total_batches": 0,
        "completed_batches": 0,
        "current_provider": "",
        "current_provider_id": "",
        "elements_processed": 0,
        "elements_total": 0,
        "estimated_time_remaining_seconds": 0,
        "current_sample": "",
        "provider_fallbacks": [],
        "last_error": None,
    })


# ── Helpers ─────────────────────────────────────────────────────────────────

def _get_smart_batch_size(element_count: int) -> int:
    """Adaptive batch sizing based on element count."""
    if element_count <= 10:
        return element_count
    if element_count <= 30:
        return 15
    return 10


def _get_active_providers(custom_key: Optional[str] = None, custom_nim_url: Optional[str] = None, use_local: bool = False) -> List[Dict[str, Any]]:
    """
    Return ordered list of available AI providers with their keys and endpoints.
    Priority: NVIDIA NIM > Groq > OpenRouter > Cerebras > Mistral > OpenCodeZen > ZenMux > Gemini > Cloudflare AI
    """
    providers = []

    # 1. NVIDIA NIM (Priority 1 — Default or Local)
    nv_key = custom_key or os.getenv("NVIDIA_API_KEY", "")

    if use_local and custom_nim_url:
        providers.append({
            "name": "NVIDIA NIM (Local)",
            "id": "nvidia_nim",
            "url": custom_nim_url,
            "key": nv_key or "local-no-key",
            "model": os.getenv("NVIDIA_NIM_MODEL", "meta/llama-3.1-70b-instruct"),
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"} if k != "local-no-key" else {"Content-Type": "application/json"},
        })
    elif nv_key:
        providers.append({
            "name": "NVIDIA NIM",
            "id": "nvidia_nim",
            "url": NVIDIA_NIM_URL,
            "key": nv_key,
            "model": os.getenv("NVIDIA_NIM_MODEL", "meta/llama-3.1-70b-instruct"),
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
        })

    # 2. Groq (Priority 2 — Ultra-fast)
    groq_key = os.getenv("GROQ_API_KEY", "")
    if groq_key:
        providers.append({
            "name": "Groq",
            "id": "groq",
            "url": "https://api.groq.com/openai/v1/chat/completions",
            "key": groq_key,
            "model": "llama-3.3-70b-versatile",
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
        })

    # 3. OpenRouter (Priority 3 — Multi-model)
    or_key = os.getenv("OPENROUTER_API_KEY", "")
    if or_key:
        providers.append({
            "name": "OpenRouter",
            "id": "openrouter",
            "url": "https://openrouter.ai/api/v1/chat/completions",
            "key": or_key,
            "model": "meta-llama/llama-3.3-70b-instruct",
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
        })

    # 4. Cerebras (Priority 4 — Ultra-low latency)
    cer_key = os.getenv("CEREBRAS_API_KEY", "")
    if cer_key:
        providers.append({
            "name": "Cerebras",
            "id": "cerebras",
            "url": "https://api.cerebras.ai/v1/chat/completions",
            "key": cer_key,
            "model": "llama3.1-70b",
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
        })

    # 5. Mistral AI (Priority 5)
    mis_key = os.getenv("MISTRAL_API_KEY", "")
    if mis_key:
        providers.append({
            "name": "Mistral AI",
            "id": "mistral",
            "url": "https://api.mistral.ai/v1/chat/completions",
            "key": mis_key,
            "model": "mistral-small-latest",
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
        })

    # 6. OpenCodeZen (Priority 6)
    ocz_key = os.getenv("OPENCODEZEN_API_KEY", "")
    if ocz_key:
        providers.append({
            "name": "OpenCodeZen",
            "id": "opencodezen",
            "url": "https://opencodezen.com/v1/chat/completions",
            "key": ocz_key,
            "model": "meta-llama/llama-3.3-70b-instruct",
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
        })

    # 7. ZenMux (Priority 7)
    zm_key = os.getenv("ZENMUX_API_KEY", "")
    if zm_key:
        providers.append({
            "name": "ZenMux",
            "id": "zenmux",
            "url": "https://zenmux.ai/v1/chat/completions",
            "key": zm_key,
            "model": "meta-llama/llama-3.3-70b-instruct",
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
        })

    # 8. Gemini (Priority 8 — OpenAI-compatible endpoint)
    gem_key = os.getenv("GEMINI_API_KEY", "")
    if gem_key:
        providers.append({
            "name": "Gemini",
            "id": "gemini",
            "url": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
            "key": gem_key,
            "model": "gemini-1.5-flash",
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
        })

    # 9. Cloudflare Workers AI (Priority 9)
    cf_token = os.getenv("CLOUDFLARE_API_TOKEN", "")
    cf_account = os.getenv("CLOUDFLARE_ACCOUNT_ID", "")
    if cf_token and cf_account:
        cf_model = os.getenv("CLOUDFLARE_AI_MODEL", "@cf/meta/llama-3.1-8b-instruct")
        providers.append({
            "name": "Cloudflare AI",
            "id": "cloudflare",
            "url": f"https://api.cloudflare.com/client/v4/accounts/{cf_account}/ai/v1/chat/completions",
            "key": cf_token,
            "model": cf_model,
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
        })

    return providers


# ── System prompt for classification ────────────────────────────────────────

CLASSIFICATION_SYSTEM_PROMPT: str = (
    "Eres un experto en estructura de documentos academicos APA 7ma edicion. "
    "Analiza el mapa jerarquico del documento ANTES de clasificar elementos individuales.\n\n"
    "IMPORTANTE:\n"
    "- Los niveles de heading son RELATIVOS: el Heading 1 de un doc es el titulo mas grande/importante.\n"
    "- Infiere jerarquia desde: numeracion explicita (1., 1.1.), tamano relativo de fuente, contexto del documento.\n"
    "- Para bullet y numbered_list: nivel 1, 2 o 3 basado en indentacion.\n"
    "- Solo clasifica lo que realmente no puedes determinar con certeza.\n\n"
    "RESPONDE con JSON valido unicamente:\n"
    '{"classifications": [{"id": "elem_042", "type": "heading", "heading_level": 2, "confidence": 0.88, "reasoning": "razon breve"}]}'
)


# ── Main classification function ────────────────────────────────────────────

async def classify_document_with_llm(
    doc: DocumentModel,
    api_key: Optional[str] = None,
    nim_url: Optional[str] = None,
    use_local: bool = False,
) -> DocumentModel:
    """
    Refina todos los elementos con confianza < 0.85 usando una cadena de
    proveedores LLM con fallback automatico. Incluye batching adaptativo,
    cache local y tracking de progreso.
    """
    session_id = doc.session_id

    # Initialize progress state
    _classify_progress[session_id] = {
        "status": "processing",
        "total_batches": 0,
        "completed_batches": 0,
        "current_provider": "",
        "current_provider_id": "",
        "elements_processed": 0,
        "elements_total": 0,
        "estimated_time_remaining_seconds": 0,
        "current_sample": "",
        "provider_fallbacks": [],
        "last_error": None,
    }

    providers = _get_active_providers(api_key, nim_url, use_local)
    if not providers:
        print("[WARN] No AI providers available (Local or Cloud). Usando fallback heuristico...")
        total = len(doc.elements)
        _classify_progress[session_id]["status"] = "complete"
        _classify_progress[session_id]["current_provider"] = "reglas heuristicas"
        _classify_progress[session_id]["elements_total"] = total
        _classify_progress[session_id]["elements_processed"] = total
        _classify_progress[session_id]["completed_batches"] = 1
        _classify_progress[session_id]["total_batches"] = 1
        return doc

    # Collect uncertain elements
    uncertain_elements: List[ElementModel] = []
    for e in doc.elements:
        if e.needs_review:
            uncertain_elements.append(e)
        elif e.confidence < 0.85:
            if e.type not in (ElementType.EMPTY, ElementType.IMAGE, ElementType.TABLE,
                              ElementType.PAGE_BREAK, ElementType.SECTION_BREAK):
                uncertain_elements.append(e)

    if not uncertain_elements:
        print("[INFO] No hay elementos inciertos que clasificar.")
        total = len(doc.elements)
        _classify_progress[session_id]["status"] = "complete"
        _classify_progress[session_id]["current_provider"] = "reglas heuristicas"
        _classify_progress[session_id]["elements_total"] = total
        _classify_progress[session_id]["elements_processed"] = total
        _classify_progress[session_id]["completed_batches"] = 1
        _classify_progress[session_id]["total_batches"] = 1
        return doc

    # Build heading map for structural context
    heading_map: List[dict] = []
    for e in doc.elements:
        if e.type == ElementType.HEADING:
            heading_map.append({
                "id": e.id,
                "text": (e.text or "")[:80],
                "level": e.heading_level or 1,
                "font_size": e.font_size,
                "is_bold": e.is_bold,
            })

    # Adaptive batching
    batch_size = _get_smart_batch_size(len(uncertain_elements))
    total_elements = len(uncertain_elements)
    _classify_progress[session_id]["elements_total"] = total_elements

    batches = [uncertain_elements[i:i + batch_size]
               for i in range(0, len(uncertain_elements), batch_size)]
    total_batches = len(batches)
    _classify_progress[session_id]["total_batches"] = total_batches

    est_time = total_batches * 4
    _classify_progress[session_id]["estimated_time_remaining_seconds"] = est_time

    # Load cache (now imported from ai_client to share state)
    from modules.ai_client import (
        _compute_text_hash,
        _load_cache,
        _save_cache,
        execute_with_specialty,
    )
    cache = _load_cache()

    completed_batches = 0
    elements_processed = 0
    best_result = None

    # Process each batch
    for i, batch in enumerate(batches):

        # Check cache first
        need_api: List[ElementModel] = []
        for e in batch:
            h = _compute_text_hash(e.text or "")
            cached_type = cache.get(h)
            if cached_type:
                try:
                    e.type = ElementType(cached_type)
                    e.confidence = 0.95
                    e.needs_review = False
                except Exception:
                    need_api.append(e)
            else:
                need_api.append(e)

        elements_processed += len(batch) - len(need_api)
        _classify_progress[session_id]["elements_processed"] = elements_processed
        if need_api:
            _classify_progress[session_id]["current_sample"] = (need_api[0].text or "")[:100]

        if need_api:
            # Build payload once for all providers
            payload_items = []
            for e in need_api:
                payload_items.append({
                    "id": e.id,
                    "text": (e.text or "")[:200],
                    "current_type": e.type.value if isinstance(e.type, ElementType) else str(e.type),
                    "heading_level": e.heading_level,
                    "is_bold": e.is_bold,
                    "is_italic": e.is_italic,
                    "font_size": e.font_size,
                    "alignment": e.alignment,
                    "left_indent_cm": e.left_indent_cm,
                    "style_name": e.style_name,
                })

            user_prompt = (
                "Mapa jerarquico de titulos del documento (para contexto de estructura):\n"
                f"{json.dumps(heading_map[:30], ensure_ascii=False, indent=2)}\n\n"
                "Elementos a clasificar en este lote:\n"
                f"{json.dumps(payload_items, ensure_ascii=False, indent=2)}"
            )

            try:
                content, p_name, p_id = await execute_with_specialty(
                    prompt=user_prompt,
                    system_prompt=CLASSIFICATION_SYSTEM_PROMPT,
                    specialty="HEAVY",
                    api_key=api_key,
                    nim_url=nim_url,
                    use_local=use_local,
                    temperature=0.1,
                    max_tokens=2000,
                    use_cache=False, # Cache is handled manually here to cache per-element!
                    return_provider_info=True
                )

                json_start = content.find("[")
                json_end = content.rfind("]") + 1
                if json_start != -1 and json_end > json_start:
                    results = json.loads(content[json_start:json_end])
                    best_result = {
                        "provider_name": p_name,
                        "provider_id": p_id,
                        "results": results,
                    }
            except Exception as e:
                print(f"[LLM] Error in execute_with_fallback: {e}")
                best_result = None

            if best_result:
                _classify_progress[session_id]["current_provider"] = best_result["provider_name"]
                _classify_progress[session_id]["current_provider_id"] = best_result["provider_id"]
                res_map: Dict[str, dict] = {r["id"]: r for r in best_result["results"] if "id" in r}

                updated_count = 0
                for elem in doc.elements:
                    if elem.id in res_map:
                        res = res_map[elem.id]
                        new_type_str: str = res.get("type", "")
                        if new_type_str:
                            try:
                                elem.type = ElementType(new_type_str)
                            except ValueError:
                                pass

                        if elem.type == ElementType.HEADING:
                            new_level = res.get("heading_level")
                            if new_level is not None:
                                elem.heading_level = min(max(int(new_level), 1), 5)

                        llm_confidence = float(res.get("confidence", 0.90))
                        elem.confidence = llm_confidence

                        reasoning = res.get("reasoning", "")
                        if reasoning:
                            elem.llm_reasoning = reasoning

                        if elem.confidence >= 0.85:
                            elem.needs_review = False

                        cache[_compute_text_hash(elem.text or "")] = elem.type.value
                        updated_count += 1

                print(f"[OK] Lote {i + 1}/{total_batches} clasificado con {best_result['provider_name']} "
                      f"({updated_count} elementos)")
            else:
                print(f"[WARN] Ningun proveedor LLM respondio para el lote {i + 1}/{total_batches}.")

        elements_processed += len(need_api) if need_api else 0
        completed_batches += 1
        remaining = total_batches - completed_batches
        _classify_progress[session_id].update({
            "completed_batches": completed_batches,
            "elements_processed": elements_processed,
            "estimated_time_remaining_seconds": remaining * 4,
        })

        if need_api and not best_result:
            msg = f"Ningun proveedor LLM respondio para el lote {i + 1}. Usando heuristica local."
            print(f"[WARN] {msg}")
            _classify_progress[session_id]["last_error"] = msg

        # Delay to avoid rate limiting is now partially handled by the backoff in execute_with_fallback,
        # but we still sleep slightly between batches to pace requests for free tiers.
        if i < len(batches) - 1:
            await asyncio.sleep(1.0)

    # Save cache
    _save_cache(cache)

    # Mark complete
    final_provider_name = best_result["provider_name"] if best_result else (providers[0]["name"] if providers else "local")
    final_provider_id = best_result["provider_id"] if best_result else (providers[0]["id"] if providers else "local")
    _classify_progress[session_id].update({
        "status": "complete",
        "current_provider": final_provider_name,
        "current_provider_id": final_provider_id,
        "completed_batches": total_batches,
        "elements_processed": total_elements,
        "estimated_time_remaining_seconds": 0,
    })

    return doc
