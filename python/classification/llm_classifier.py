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
from parsing.pre_classifier import (
    REGEX_BULLET_CHAR,
    REGEX_BULLET_NUMBERED,
    REGEX_NUMBERED_HEADING,
    _estimate_level_by_indent,
)

NVIDIA_NIM_URL: str = NVIDIA_NIM_URL
DEFAULT_MODEL: str = DEFAULT_NIM_MODEL


def _normalize_llm_list_fields(elem: ElementModel) -> None:
    """
    Reaplica la misma normalizacion que el branch manual_char/numbered del
    pre_classifier cuando un tipo BULLET/NUMBERED_LIST llega desde el cache
    o el LLM: strip del prefijo, campos derivados y nivel por indentacion.
    """
    text = (elem.text or "").strip()
    if elem.type == ElementType.BULLET:
        m = REGEX_BULLET_CHAR.match(text)
        if m:
            elem.original_char = m.group(1)
            elem.bullet_source = "manual_char"
            elem.text = text[m.end():].lstrip()
        elem.heading_level = _estimate_level_by_indent(elem.left_indent_cm)
    elif elem.type == ElementType.NUMBERED_LIST:
        m_num = REGEX_BULLET_NUMBERED.match(text)
        if m_num and not REGEX_NUMBERED_HEADING.match(text):
            elem.text = text[m_num.end():].lstrip()
        elem.heading_level = _estimate_level_by_indent(elem.left_indent_cm)

# ── Provider capacity profiles ──────────────────────────────────────────────
PROVIDER_CAPACITY = {
    "nvidia_nim": {"timeout": 25, "max_tokens_per_request": 4000, "requests_per_minute": 30, "typical_latency_s": 8},
    "groq": {"timeout": 10, "max_tokens_per_request": 4000, "requests_per_minute": 30, "typical_latency_s": 1.5},
    "openrouter": {"timeout": 20, "max_tokens_per_request": 4000, "requests_per_minute": 20, "typical_latency_s": 6},
    "cerebras": {"timeout": 15, "max_tokens_per_request": 4000, "requests_per_minute": 5, "typical_latency_s": 3},
    "mistral": {"timeout": 20, "max_tokens_per_request": 2000, "requests_per_minute": 10, "typical_latency_s": 5},
    "opencodezen": {"timeout": 25, "max_tokens_per_request": 2000, "requests_per_minute": 10, "typical_latency_s": 8},
    "zenmux": {"timeout": 25, "max_tokens_per_request": 2000, "requests_per_minute": 10, "typical_latency_s": 8},
    "gemini": {"timeout": 15, "max_tokens_per_request": 2000, "requests_per_minute": 10, "typical_latency_s": 4},
    # Cloudflare Workers AI — modelo 8B, muy rápido, plan free con límites.
    "cloudflare": {"timeout": 15, "max_tokens_per_request": 2000, "requests_per_minute": 20, "typical_latency_s": 3},
    # Aion Labs — Free tier 15 RPM, 20K TPD
    "aion": {"timeout": 20, "max_tokens_per_request": 3000, "requests_per_minute": 15, "typical_latency_s": 4},
    # Kilo Code Gateway — Free tier models (kilo-auto/free)
    "kilocode": {"timeout": 25, "max_tokens_per_request": 3000, "requests_per_minute": 15, "typical_latency_s": 5},
    # Ollama Cloud / API — Modelos Cloud (gpt-oss:20b, nemotron-3-nano)
    "ollama_cloud": {"timeout": 25, "max_tokens_per_request": 3000, "requests_per_minute": 15, "typical_latency_s": 5},
    # HuggingFace Inference Router - OpenAI-compatible, capa gratuita
    "huggingface": {"timeout": 30, "max_tokens_per_request": 3000, "requests_per_minute": 20, "typical_latency_s": 4},
    # ModelScope (Alibaba) - API OpenAI-compatible, sin doc publica de RPM.
    "modelscope": {"timeout": 25, "max_tokens_per_request": 3000, "requests_per_minute": 10, "typical_latency_s": 6},
    # SambaNova Cloud - free tier conservador.
    "sambanova": {"timeout": 20, "max_tokens_per_request": 3000, "requests_per_minute": 10, "typical_latency_s": 4},
    # DashScope (Alibaba Qwen) - OpenAI-compatible, limpieza conservadora.
    "dashscope": {"timeout": 25, "max_tokens_per_request": 3000, "requests_per_minute": 10, "typical_latency_s": 6},
    # Agnes AI - proveedor propio del autor, limites desconocidos -> conservador.
    "agnes_ai": {"timeout": 25, "max_tokens_per_request": 3000, "requests_per_minute": 10, "typical_latency_s": 5},
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


def _get_active_providers(custom_key: Optional[str] = None, custom_nim_url: Optional[str] = None, use_local: bool = False, provider_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Return ordered list of available AI providers with their keys and endpoints.
    Priority: NVIDIA NIM > Groq > OpenRouter > Cerebras > Mistral > OpenCodeZen > ZenMux > Gemini > Cloudflare AI

    `custom_key` es la clave que eligio el usuario en la pestana Conexion. Antes
    se inyectaba en la entrada de NVIDIA NIM sin mirar de que proveedor vinha:
    elegias Groq, mandabas la key de Groq, se ponia en NIM, NIM contestaba 401 y
    la entrada entraba en cooldown de 600 s. Elegir proveedor en la UI no
    seleccionaba proveedor: seleccionaba que key se le mandaba al primero de la
    lista.

    Ahora la clave se resuelve POR PROVEEDOR: cada entrada usa la suya, leida
    del entorno. `custom_key` ya no se inyecta en ninguna: es la clave del
    proveedor que eligio el usuario, y meterla en la entrada de NIM hacia que
    la key de Groq se mandara a NVIDIA, con un 401 y un cooldown de 600 s por
    detrás.

    Un proveedor que pide una clave y no la tiene NO entra a la cola. Entrar a
    disparar un 401 cuesta un cooldown para todos los que vengan atras, y el
    proveedor elegido por el usuario no puede ser el unico que se cuelgue.
    """
    providers = []

    # 1. NVIDIA NIM (Priority 1 — Default or Local)
    #    NIM usa SU clave. Antes tomaba `custom_key` sin mirar de que proveedor
    #    venía, con lo cual la key de Groq se mandaba a
    #    `integrate.api.nvidia.com`, contestaban 401 y la entrada entraba en
    #    cooldown de 600 s para todos los que vinieran atras.
    #
    #    `custom_key` ya no entra aca. Es la clave del proveedor que eligio el
    #    usuario, y el frontend la escribe en el entorno de este proceso al
    #    arrancar (`syncAllProviderKeys`), asi que la variable de entorno de NIM
    #    ya esta puesta cuando hay una key de NIM. Lo que no puede pasar es que
    #    una key de otro proveedor rellene este hueco.
    nv_key = os.getenv("NVIDIA_API_KEY", "")
    if use_local and custom_nim_url:
        providers.append({
            "name": "NVIDIA NIM (Local)",
            "id": "nvidia_nim",
            "url": custom_nim_url,
            "key": nv_key or "local-no-key",
            "model": os.getenv("NVIDIA_NIM_MODEL", "nvidia/nemotron-3-super-120b-a12b"),
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"} if k != "local-no-key" else {"Content-Type": "application/json"},
        })
    elif nv_key:
        providers.append({
            "name": "NVIDIA NIM",
            "id": "nvidia_nim",
            "url": NVIDIA_NIM_URL,
            "key": nv_key,
            "model": os.getenv("NVIDIA_NIM_MODEL", "nvidia/nemotron-3-super-120b-a12b"),
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
            "model": os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"),
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
            "model": os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct"),
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
            "model": os.getenv("CEREBRAS_MODEL", "llama3.1-70b"),
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
            "model": os.getenv("MISTRAL_MODEL", "mistral-small-latest"),
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
            "model": os.getenv("OPENCODEZEN_MODEL", "meta-llama/llama-3.3-70b-instruct"),
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
        })

    # 7. ZenMux (Priority 7)
    zm_key = os.getenv("ZENMUX_API_KEY", "")
    if zm_key:
        providers.append({
            "name": "ZenMux",
            "id": "zenmux",
            # La URL lleva `/api`. `zenmux.ai/v1/...` devuelve 302 a una pagina
            # de error; `zenmux.ai/api/v1/...` responde 200. Sonda, no
            # inferencia: con la URL mala, el unico proveedor que funcionaba
            # parecia caido y las tres especialidades caian.
            "url": "https://zenmux.ai/api/v1/chat/completions",
            "key": zm_key,
            # El modelo era `meta-llama/llama-3.3-70b-instruct` fijo y devolvia
            # 404 invalid_model: el nombre estaba retirado del catalogo, no era
            # la key. La key servia y el catalogo tiene 203 modelos.
            #
            # El default es un modelo FREE a proposito: la cuota de esta cuenta
            # solo alcanza para unos pocos del catalogo y todos los demas dan
            # 402 sin credito. `z-ai/glm-4.6v-flash-free` es el que responde sin
            # pagar, y para corregir prosa y registrar conectores alcanza de
            # sobra. Salir de `ZENMUX_MODEL` para cambiarlo, no editar codigo.
            # Sonda: python tools/llm_probe.py --modelos
            "model": os.getenv("ZENMUX_MODEL", "z-ai/glm-4.6v-flash-free"),
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
            "model": os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
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
            "url": f"https://api.cloudflare.com/client/v4/accounts/{cf_account}/ai/run/{cf_model}",
            "key": cf_token,
            "model": cf_model,
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
        })

    # 10. Aion Labs (Priority 10 — 15 RPM, 20K TPD Free Tier)
    aion_key = os.getenv("AION_API_KEY", "")
    if aion_key:
        providers.append({
            "name": "Aion Labs",
            "id": "aion",
            "url": "https://api.aionlabs.ai/v1/chat/completions",
            "key": aion_key,
            "model": os.getenv("AION_MODEL", "aion-labs/aion-3.0-mini"),
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
        })

    # 11. Kilo Code (Priority 11 — Kilo AI Gateway Free Tier)
    kilo_key = os.getenv("KILOCODE_API_KEY", "")
    if kilo_key:
        providers.append({
            "name": "Kilo Code",
            "id": "kilocode",
            "url": "https://api.kilo.ai/api/gateway/chat/completions",
            "key": kilo_key,
            "model": os.getenv("KILOCODE_MODEL", "kilo-auto/free"),
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
        })

    # 12. Ollama Cloud (Priority 12 — Cloud API / Hosted Models)
    ollama_key = os.getenv("OLLAMA_API_KEY", "")
    if ollama_key:
        providers.append({
            "name": "Ollama Cloud",
            "id": "ollama_cloud",
            "url": "https://ollama.com/v1/chat/completions",
            "key": ollama_key,
            "model": os.getenv("OLLAMA_MODEL", "gpt-oss:20b"),
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
        })

    # 13. HuggingFace Inference Router (Priority 13)
    #     OpenAI-compatible, mismo formato que el resto. La capa gratuita del
    #     router responde sin tarjeta; el modelo sale del catalogo, asi que el
    #     default es uno chico y de proposito.
    hf_key = os.getenv("HUGGINGFACE_API_KEY", "")
    if hf_key:
        providers.append({
            "name": "HuggingFace",
            "id": "huggingface",
            "url": "https://router.huggingface.co/v1/chat/completions",
            "key": hf_key,
            "model": os.getenv("HUGGINGFACE_MODEL", "meta-llama/Llama-3.1-8B-Instruct"),
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
        })

    # 14. ModelScope (Alibaba) - OpenAI-compatible. La clave vivia huerfana en
    #     el .env: se leia en tools/llm_connect.py pero el clasificador no la
    #     conocia, asi que nunca entraba a la cola. Ahora es de primera clase.
    ms_key = os.getenv("MODELSCOPE_API_KEY", "")
    if ms_key:
        providers.append({
            "name": "ModelScope",
            "id": "modelscope",
            "url": "https://api-inference.modelscope.cn/v1/chat/completions",
            "key": ms_key,
            "model": os.getenv("MODELSCOPE_MODEL", "Qwen/Qwen2.5-72B-Instruct"),
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
        })

    # 15. SambaNova Cloud - OpenAI-compatible, free tier conservador.
    sn_key = os.getenv("SAMBANOVA_API_KEY", "")
    if sn_key:
        providers.append({
            "name": "SambaNova",
            "id": "sambanova",
            "url": "https://api.sambanova.ai/v1/chat/completions",
            "key": sn_key,
            "model": os.getenv("SAMBANOVA_MODEL", "Meta-Llama-3.3-70B-Instruct"),
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
        })

    # 16. DashScope (Alibaba Qwen) - endpoint internacional OpenAI-compatible.
    ds_key = os.getenv("DASHSCOPE_API_KEY", "")
    if ds_key:
        providers.append({
            "name": "DashScope",
            "id": "dashscope",
            "url": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
            "key": ds_key,
            "model": os.getenv("DASHSCOPE_MODEL", "qwen-plus"),
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
        })

    # 17. Agnes AI - proveedor propio del autor, limites desconocidos ->
    #     se trata conservador (10 RPM) hasta conocer sus numeros reales.
    ag_key = os.getenv("AGNES_AI_API_KEY", "")
    if ag_key:
        providers.append({
            "name": "Agnes AI",
            "id": "agnes_ai",
            "url": "https://api.agnes.ai/v1/chat/completions",
            "key": ag_key,
            "model": os.getenv("AGNES_AI_MODEL", "gpt-4o-mini"),
            "headers": lambda k: {"Authorization": f"Bearer {k}", "Content-Type": "application/json"},
        })

    if provider_id:
        selected = [p for p in providers if p["id"] == provider_id]
        if not selected:
            raise ValueError(f"Proveedor no configurado: {provider_id}")
        return selected
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


def _classification_cache_key(elem: ElementModel) -> str:
    # El import va ACÁ, no arriba: `modules.ai_client` importa ESTE módulo
    # (`ai_client.py:13`, `PROVIDER_CAPACITY` y `_get_active_providers`), así que
    # un import a nivel de módulo sería un ciclo.
    #
    # Y va acá y no en `classify_document_with_llm`, que es donde estaba: un
    # import dentro de esa función deja el nombre en el LOCAL de esa función, y
    # esta es OTRA función. Sus globales no lo ven, y cada elemento se comía un
    # `NameError: name '_compute_text_hash' is not defined`. La clasificación
    # entera devolvía 500 y el documento se quedaba con los tipos con los que
    # entró: se veía como si la app fuera vieja, y la app estaba rota.
    from modules.ai_client import _compute_text_hash

    payload = {
        "prompt_version": 2,
        "text": elem.text or "",
        "current_type": elem.type.value if isinstance(elem.type, ElementType) else str(elem.type),
        "heading_level": elem.heading_level,
        "style_name": elem.style_name,
        "font_size": elem.font_size,
        "is_bold": elem.is_bold,
    }
    return _compute_text_hash(json.dumps(payload, ensure_ascii=False, sort_keys=True))


# ── Main classification function ────────────────────────────────────────────

async def classify_document_with_llm(
    doc: DocumentModel,
    api_key: Optional[str] = None,
    nim_url: Optional[str] = None,
    use_local: bool = False,
    provider_id: Optional[str] = None,
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

    providers = _get_active_providers(api_key, nim_url, use_local, provider_id)
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
    #
    # `_compute_text_hash` NO está en esta lista a propósito: quien lo necesita
    # (`_classification_cache_key`) lo resuelve adentro, que es el único lugar
    # donde el nombre funciona sin ciclo. Acá adentro quedaría en el local de
    # esta función, que es justo el bug que se está arreglando.
    from modules.ai_client import (
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
            h = _classification_cache_key(e)
            cached_type = cache.get(h)
            if cached_type:
                try:
                    new_type = ElementType(cached_type)
                    if new_type != e.type:
                        e.original_char = None
                        e.bullet_source = None
                        e.pre_classifier_rule = None
                    e.type = new_type
                    e.confidence = 0.95
                    e.needs_review = False
                    if new_type in (ElementType.BULLET, ElementType.NUMBERED_LIST):
                        _normalize_llm_list_fields(e)
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
                    provider_id=provider_id,
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
                                new_type = ElementType(new_type_str)
                                if new_type != elem.type:
                                    elem.original_char = None
                                    elem.bullet_source = None
                                    elem.pre_classifier_rule = None
                                elem.type = new_type
                                if new_type in (ElementType.BULLET, ElementType.NUMBERED_LIST):
                                    _normalize_llm_list_fields(elem)
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

                        cache[_classification_cache_key(elem)] = elem.type.value
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
