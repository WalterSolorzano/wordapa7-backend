"""
WordAPA7 — Servidor Principal FastAPI

Servidor Web unificado que expone los endpoints REST para la manipulacion de documentos
y sirve la interfaz estatica construida en React (dist/).
"""

import asyncio
import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import List, Optional

# Asegurar que el directorio de este script esté en sys.path
_current_dir = str(Path(__file__).resolve().parent)
if _current_dir not in sys.path:
    sys.path.insert(0, _current_dir)

from key_loader import load_all_key_sources

# Cascada unica de claves (dotenv raiz -> ai_keys.json usuario -> embedded).
# La comparte con core_server.py para que ningun proceso quede sin claves.
load_all_key_sources()

from fastapi import (
    FastAPI,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Asegurar path de importacion
sys.path.insert(0, str(Path(__file__).resolve().parent))


# ── CONFIGURACION Y RUTAS DE ALMACENAMIENTO ──────────────────────────────────
from config import BASE_DIR, DIST_DIR, STORAGE_DIR, get_apa7_template_path, APP_VERSION, get_app_version
from create_template import ensure_apa7_template
from generation.generator import generate_apa7_docx
from generation.track_changes_engine import create_tracked_changes_docx
from models import (
    migrar_acta_vieja,
    APAFormat,
    APARuleSet,
    DocumentMeta,
    DocumentModel,
    ElementModel,
    ElementType,
    HealthResponse,
    PortadaData,
    ReferenciaModel,
    migrar_acta_vieja,
)
from modules.apa_validator import validate_apa_integrity, validate_citations_with_llm
from modules.referencias_module import resolve_doi
from persistence.session_manager import (
    load_session_state,
    maybe_run_gc,
    save_session_state,
)
from profiles import get_profile

STORAGE_DIR.mkdir(exist_ok=True)


from contextlib import asynccontextmanager

from services.word_com_service import get_word_com_service


@asynccontextmanager
async def lifespan_app(app: FastAPI):
    # Limpieza inicial de sesiones expiradas al arrancar el servidor (P1.4).
    # maybe_run_gc está acelerado (GC_INTERVAL_SECONDS) y es seguro llamarlo aquí.
    try:
        maybe_run_gc(STORAGE_DIR)
    except Exception as e:
        print(f"[WARN] GC inicial de sesiones falló: {e}")

    # Generar/actualizar manifest.xml dinámico en STORAGE_DIR al arrancar (sideload local)
    try:
        from routers.addin_static import (
            _DEV_ADDIN_URL,
            _DEV_ADDIN_URLS,
            _get_addin_manifest_path,
            _resolve_addin_base_url,
        )
        manifest_src = _get_addin_manifest_path()
        if manifest_src and manifest_src.exists():
            dest_manifest = STORAGE_DIR / "manifest.xml"
            xml_content = manifest_src.read_text(encoding="utf-8")
            addin_base_url = _resolve_addin_base_url()
            xml_content = xml_content.replace(_DEV_ADDIN_URL, addin_base_url)
            for _old_url in _DEV_ADDIN_URLS:
                xml_content = xml_content.replace(_old_url, addin_base_url)
            dest_manifest.write_text(xml_content, encoding="utf-8")
            print(f"[INFO] [ADD-IN] Manifiesto generado en: {dest_manifest} -> apuntando a {addin_base_url}")
        else:
            print("[WARN] [ADD-IN] No se encontró el manifest.xml original de origen para copiar.")
    except Exception as e:
        print(f"[ERROR] [ADD-IN] Error al generar manifest.xml en almacenamiento: {e}")

    yield
    # Shutdown: liberar Word COM heredado del bridge del add-in (antes
    # @app.on_event("shutdown"), deprecated — migrado al lifespan).
    if _rwa:
        try:
            _rwa(force=False)
        except Exception as e:
            print(f"[WARN] release_word_app fallo en shutdown: {e}")
    print("[INFO] Deteniendo LibreOffice service...")
    get_libreoffice_service().stop()
    print("[INFO] Deteniendo Word COM service...")
    get_word_com_service().stop()

app = FastAPI(title="WordAPA7 API", version=APP_VERSION, lifespan=lifespan_app)

from services.lo_service import get_libreoffice_service

# CORS middleware para desarrollo con Vite.
#  Antes se usaba allow_origins=["*"] con allow_credentials=True, lo cual
# es inseguro y viola la especificación CORS. Ahora se restringe a orígenes
# explícitos configurables vía WORDAPA7_ALLOWED_ORIGINS (CSV), con defaults
# seguros para desarrollo local (Vite# Enable CORS for the local Vite dev server and the Electron packaged app
_DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8742",
    "http://127.0.0.1:8742",
    "https://*.vercel.app",
    "https://*.pages.dev",
    "app://-",
    "*",
]

# Produccion: el add-in puede servirse desde URL publica (WORDAPA7_ADDIN_PUBLIC_URL)
# y llama al backend local en loopback => su origen debe entrar a la allowlist.
from urllib.parse import urlparse as _urlparse

_public_addin = os.environ.get("WORDAPA7_ADDIN_PUBLIC_URL", "").strip()
if _public_addin:
    _p = _urlparse(_public_addin if "//" in _public_addin else "https://" + _public_addin)
    if _p.netloc:
        _origin = f"{_p.scheme or 'https'}://{_p.netloc}"
        if _origin not in _DEFAULT_ALLOWED_ORIGINS:
            _DEFAULT_ALLOWED_ORIGINS.append(_origin)


def _session_rules(doc: DocumentModel, req_rules: Optional[APARuleSet] = None) -> APARuleSet:
    """Reglas de formato: las del request (perfil elegido en el cliente) o, si
    no vienen, las persistidas en la sesión (perfil del documento)."""
    if req_rules is not None:
        return req_rules
    return doc.apa_rules if doc.apa_rules else APARuleSet()


def _session_meta(doc: DocumentModel, requested: Optional[DocumentMeta]) -> DocumentMeta:
    """Los metadatos del documento, con la migracion de datos viejos.

    Una sesion guardada cuando el autor vivia dentro de `portada` tiene ahi el
    autor, el grupo y el profesor. `PortadaData` ya no declara esas claves, asi
    que pydantic las ignora y el dato se pierde sin error: pydar un documento
    viejo no puede significar devolverlo sin autor. `_migrar_acta_vieja` las sube
    a `meta`, que es donde viven ahora.
    """
    if requested is not None:
        meta = requested.model_copy(deep=True)
    else:
        meta = doc.meta.model_copy(deep=True)
    migradas = migrar_acta_vieja(doc.portada, meta)
    if migradas:
        print(f"[ACTA] Migrados desde portada: {migradas}")
    return meta


def _session_portada(doc: DocumentModel, requested: Optional[PortadaData]) -> PortadaData:
    if requested is not None:
        return requested
    value = doc.portada
    if isinstance(value, PortadaData):
        return value
    if isinstance(value, dict):
        try:
            return PortadaData.model_validate(value)
        except Exception:
            pass
    return PortadaData(apa_format=doc.apa_format, use_original_cover=True)


def _session_references(doc: DocumentModel, requested: Optional[List[ReferenciaModel]]) -> List[ReferenciaModel]:
    return requested if requested is not None else list(doc.referencias or [])


def _write_export_manifest(session_dir: Path, artifact_id: str, **data: object) -> None:
    manifest_dir = session_dir / "exports"
    manifest_dir.mkdir(parents=True, exist_ok=True)
    (manifest_dir / f"{artifact_id}.json").write_text(
        json.dumps({"artifact_id": artifact_id, **data}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _artifact_url(session_id: str, artifact_id: str) -> str:
    return f"/api/download-artifact/{session_id}/{artifact_id}"


_env_origins = os.environ.get("WORDAPA7_ALLOWED_ORIGINS", "").strip()
_allowed_origins = (
    [o.strip() for o in _env_origins.split(",") if o.strip()]
    if _env_origins
    else _DEFAULT_ALLOWED_ORIGINS
)
app.add_middleware(
    CORSMiddleware,
    # Allowlist explícita (el comentario histórico ya lo prometía). "*" con
    # credenciales es inválido y expone la API local a cualquier página web
    # abierta en el navegador del usuario (drive-by CSRF hacia 127.0.0.1).
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

from security.auth import APIKeyAuthMiddleware

app.add_middleware(APIKeyAuthMiddleware)

from routers import admin

app.include_router(admin.router)

# ── WORD ADD-IN ROUTERS (Office.js) ──────────────────────────────────────────
# Endpoints del Task Pane que vive dentro de Microsoft Word + archivos estaticos.
from routers import addin
from routers import references as references_router

app.include_router(addin.router)
# `/api/resolve-doi`: la ruta que llama `documentSlice.resolveDoiReference`
# (`${getApiBase()}/resolve-doi`). Estaba montado en `/api/addin/resolve-doi`,
# una ruta que no existia, y por eso el boton de resolver DOI de la interfaz
# no resolvia nada.
app.include_router(references_router.router)

from routers import addin_static

app.include_router(addin_static.router)

# ── PROOFREAD BATCH ROUTER (revisor proactivo: ortografia/IA/pegado) ──────────
from routers import proofread

app.include_router(proofread.router)

from routers import pagination as pagination_router

app.include_router(pagination_router.router)
from routers import pdf_export as pdf_export_router

app.include_router(pdf_export_router.router)
from routers import presets as presets_router

app.include_router(presets_router.router)
from routers import spec as spec_router

app.include_router(spec_router.router)
from routers import ws as ws_router

app.include_router(ws_router.router)
from routers import sessions as sessions_router

app.include_router(sessions_router.router)
# F7 Task 1: los assets de imagen del proyecto. Antes la imagen vivia en un
# `URL.createObjectURL` del navegador y se perdia al cerrar la pestana.
from routers import assets as assets_router

app.include_router(assets_router.router)

# F7 Task 2: los proyectos. Antes "proyecto" era el prefijo del nombre del
# archivo: renombrar el archivo renombraba el proyecto y reiniciar el servicio se
# lo llevaba. Ahora es una entidad, y vive en la MISMA base que las sesiones.
from routers import proyectos as proyectos_router

app.include_router(proyectos_router.router)

# ── SCHEDULER DE IA POR DEMANDA (Fase 1) ─────────────────────────────────────
# La unica verdad de concurrencia y tiempos del trabajo LLM interno. El
# frontend reporta visibilidad y lee el estado real; no ejecuta LLM aqui.
from routers import ai as ai_scheduler_router

app.include_router(ai_scheduler_router.router)

# ── API DE CONTENIDO (IA externa -> .docx APA 7) ─────────────────────────────
from routers import content as content_router

app.include_router(content_router.router)

# ── F8: endpoints de archivo y carpetas (proyecto_manager) ────────────────────
from modules.proyecto_manager import (
    configurar_raiz,
    crear_proyecto,
    agregar_version,
    archivar_version,
    purgar_papelera,
)

@app.post("/api/proyectos-archivo/configurar-raiz")
async def endpoint_configurar_raiz(body: dict):
    ruta = body.get("ruta", "")
    if not ruta:
        raise HTTPException(422, "ruta requerida")
    return configurar_raiz(ruta)

@app.post("/api/proyectos-archivo/crear")
async def endpoint_crear_proyecto(body: dict):
    try:
        return crear_proyecto(body["nombre"], body["archivo_origen"])
    except FileExistsError as e:
        raise HTTPException(409, str(e))
    except (KeyError, ValueError) as e:
        raise HTTPException(422, str(e))

@app.post("/api/proyectos-archivo/agregar-version")
async def endpoint_agregar_version(body: dict):
    try:
        return agregar_version(body["proyecto_id"], body["archivo_origen"])
    except FileExistsError as e:
        raise HTTPException(409, str(e))
    except KeyError as e:
        raise HTTPException(404, str(e))

@app.post("/api/proyectos-archivo/archivar-version")
async def endpoint_archivar_version(body: dict):
    try:
        return archivar_version(body["proyecto_id"], body["archivo"])
    except KeyError as e:
        raise HTTPException(404, str(e))


@app.post("/api/proyectos-archivo/restaurar-version")
async def proyectos_restaurar_version(body: dict) -> dict:
    """Devuelve una versión archivada a la carpeta del proyecto."""
    from modules import proyecto_manager
    try:
        return proyecto_manager.restaurar_version(body["proyecto_id"], body["archivo"])
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except KeyError as e:
        raise HTTPException(404, str(e))

@app.get("/api/proyectos-archivo/purgar-papelera")
async def endpoint_purgar_papelera():
    return purgar_papelera()

# ── ERROR HANDLERS ESTANDARIZADOS ─────────────────────────────────────────────

def api_error(status_code: int, detail: str, error_type: str = "validation_error") -> JSONResponse:
    """Standardized error response with request tracing info."""
    return JSONResponse(
        status_code=status_code,
        content={
            "error": True,
            "type": error_type,
            "detail": detail,
            "timestamp": __import__('datetime').datetime.utcnow().isoformat() + "Z",
        }
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": True,
            "type": "http_error",
            "detail": exc.detail,
            "request_id": getattr(request.state, 'request_id', None),
        }
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": True,
            "type": "validation_error",
            "detail": str(exc.errors()),
            "request_id": getattr(request.state, 'request_id', None),
        }
    )


# ── PROVIDER STATUS ENDPOINT ──────────────────────────────────────────────────

@app.get("/api/provider-status")
async def provider_status_endpoint() -> dict:
    """Returns the status of all configured AI providers."""
    import os

    from classification.llm_classifier import PROVIDER_CAPACITY, _get_active_providers

    all_providers = [
        {"id": "nvidia_nim", "name": "NVIDIA NIM", "env_var": "NVIDIA_API_KEY"},
        {"id": "groq", "name": "Groq", "env_var": "GROQ_API_KEY"},
        {"id": "openrouter", "name": "OpenRouter", "env_var": "OPENROUTER_API_KEY"},
        {"id": "cerebras", "name": "Cerebras", "env_var": "CEREBRAS_API_KEY"},
        {"id": "mistral", "name": "Mistral AI", "env_var": "MISTRAL_API_KEY"},
        {"id": "opencodezen", "name": "OpenCodeZen", "env_var": "OPENCODEZEN_API_KEY"},
        {"id": "zenmux", "name": "ZenMux", "env_var": "ZENMUX_API_KEY"},
        {"id": "gemini", "name": "Gemini", "env_var": "GEMINI_API_KEY"},
        {"id": "cloudflare", "name": "Cloudflare Workers AI", "env_var": "CLOUDFLARE_API_TOKEN"},
        {"id": "aion", "name": "Aion Labs", "env_var": "AION_API_KEY"},
        {"id": "kilocode", "name": "Kilo Code", "env_var": "KILOCODE_API_KEY"},
        {"id": "ollama_cloud", "name": "Ollama Cloud", "env_var": "OLLAMA_API_KEY"},
        {"id": "huggingface", "name": "Hugging Face", "env_var": "HUGGINGFACE_API_KEY"},
    ]

    active_providers = _get_active_providers()
    active_ids = {p["id"] for p in active_providers}

    providers_status = []
    for p in all_providers:
        cap = PROVIDER_CAPACITY.get(p["id"], {})
        providers_status.append({
            "id": p["id"],
            "name": p["name"],
            "active": p["id"] in active_ids,
            "capacity": {
                "timeout_s": cap.get("timeout", 25),
                "typical_latency_s": cap.get("typical_latency_s", 10),
                "max_tokens": cap.get("max_tokens_per_request", 2000),
            } if p["id"] in active_ids else None,
        })

    configured_env_vars = [
        "NVIDIA_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "CEREBRAS_API_KEY",
        "MISTRAL_API_KEY", "OPENCODEZEN_API_KEY", "ZENMUX_API_KEY", "GEMINI_API_KEY",
        "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID",
        "AION_API_KEY", "KILOCODE_API_KEY", "OLLAMA_API_KEY",
        "HUGGINGFACE_API_KEY",
    ]
    total_configured = sum(1 for v in configured_env_vars if os.getenv(v, "").strip())

    return {
        "providers": providers_status,
        "total_active": len(active_providers),
        "total_configured": total_configured,
        "classification_available": len(active_providers) > 0,
    }


@app.get("/api/ai/health")
async def ai_health_endpoint() -> dict:
    """
    Estado de salud de los proveedores de IA por especialidad (FAST / HEAVY / REASONING).

    Formato consumido por src/components/AIBatteryIndicator.tsx:
      { [specialty]: { provider: str, percentage: int, status: 'good'|'warning'|'critical' } }
    """
    from modules.ai_client import get_ai_system_health
    return get_ai_system_health()


class GenerateRequest(BaseModel):
    session_id: str
    rules: Optional[APARuleSet] = None
    portada: Optional[PortadaData] = None
    references: Optional[List[ReferenciaModel]] = None
    # `meta` es donde viajan los datos del acta (autor, profesor asesor, comite,
    # fecha de defensa). Son metadatos del DOCUMENTO y hace un tiempo vivian
    # DENTRO de `portada`; con `use_original_cover` no habia de donde sacarlos y
    # el `.docx` salia sin ellos. El cliente los manda en cada exportacion, que
    # es lo que hace falta: `DocumentMeta` del servidor es una copia y no hay
    # ningun endpoint que la escriba desde el cliente.
    meta: Optional[DocumentMeta] = None


class PreviewRequest(BaseModel):
    session_id: str
    rules: Optional[APARuleSet] = None
    portada: Optional[PortadaData] = None
    references: Optional[List[ReferenciaModel]] = None
    meta: Optional[DocumentMeta] = None


class ResolveDoiRequest(BaseModel):
    doi: str


class ResolveBatchRequest(BaseModel):
    references: List[str]


class ResolveGhostCitationRequest(BaseModel):
    authors: List[str]
    year: str


class SuggestCaptionRequest(BaseModel):
    session_id: str
    element_id: str
    context_text: str
    api_key: Optional[str] = None
    provider_id: Optional[str] = None

class ExplainElementRequest(BaseModel):
    element_type: str = ""
    text: str = ""
    rules_applied: str = ""
    confidence: float = 0.0
    api_key: Optional[str] = None
    provider_id: Optional[str] = None
    # C3: campos de compatibilidad enviados por el frontend
    session_id: Optional[str] = None
    element_id: Optional[str] = None
    question: str = ""


class RewriteTextRequest(BaseModel):
    session_id: str
    element_id: str
    text: str
    instruction: str
    api_key: Optional[str] = None
    provider_id: Optional[str] = None


class RewriteVariationsRequest(BaseModel):
    """Genera N variaciones de reescritura de un párrafo (Fase F/propuesta 2)."""
    session_id: str
    element_id: str
    text: str
    instruction: str = "Reescribe el párrafo en tono académico formal sin muletillas de IA."
    n: int = 3
    api_key: Optional[str] = None
    provider_id: Optional[str] = None


class LiveChatRequest(BaseModel):
    session_id: str
    user_instruction: str
    selected_element_id: Optional[str] = None
    history: Optional[List[dict]] = None
    api_key: Optional[str] = None
    provider_id: Optional[str] = None


class ProactiveCaptionsRequest(BaseModel):
    session_id: str
    api_key: Optional[str] = None
    provider_id: Optional[str] = None


class ProactiveDiagnoseRequest(BaseModel):
    session_id: str
    element_id: str
    api_key: Optional[str] = None
    provider_id: Optional[str] = None


class ChatCommentRequest(BaseModel):
    """Genera un comentario humorístico estilo WhatsApp sobre un elemento."""
    session_id: str
    element_id: str
    kind: str            # emoji | ghost_citation | validation_* | shouting | spanglish | ...
    element_text: str    # el texto del elemento (contexto)
    examples: list = []  # ejemplos del tono buscado
    api_key: Optional[str] = None
    nim_url: Optional[str] = None
    use_local: bool = False
    provider_id: Optional[str] = None


class LoadingTipRequest(BaseModel):
    """Genera un tip de carga (pantalla de progreso) con IA."""
    category: Optional[str] = None  # process | jokes | apa | honest
    phase: Optional[str] = None     # upload | classify | export
    api_key: Optional[str] = None
    nim_url: Optional[str] = None
    use_local: bool = False
    provider_id: Optional[str] = None


class CitationFixRequest(BaseModel):
    """Sugiere la corrección APA de una cita (propuesta 6)."""
    session_id: str
    citation_text: str
    reference_id: Optional[str] = None
    problem: str = ""
    api_key: Optional[str] = None
    provider_id: Optional[str] = None


# ── ENDPOINTS DE LA API REST ──────────────────────────────────────────────────

@app.get("/api/health")
async def health_check() -> HealthResponse:
    """Health check para Electron y monitoreo."""
    return HealthResponse(status="ok", version=APP_VERSION)



class DoiRequest(BaseModel):
    doi: str


@app.post("/api/ai/suggest-caption")
async def api_suggest_caption(req: SuggestCaptionRequest) -> dict:
    from modules.ai_assistant import generate_caption_suggestion
    try:
        suggestion = await generate_caption_suggestion(
            req.context_text, req.api_key, req.provider_id)
        return {"suggestion": suggestion}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ai/explain-element")
async def api_explain_element(req: ExplainElementRequest) -> dict:
    from modules.ai_assistant import explain_element
    try:
        explanation = await explain_element(
            req.element_type, req.text, req.rules_applied, req.confidence,
            req.api_key, req.provider_id)
        return {"explanation": explanation}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ai/rewrite")
async def api_rewrite_text(req: RewriteTextRequest) -> dict:
    from modules.ai_assistant import rewrite_text_suggestion
    try:
        rewritten = await rewrite_text_suggestion(
            req.text, req.instruction, req.api_key, req.provider_id)
        return {"rewritten": rewritten}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/rewrite-variations")
async def api_rewrite_variations(req: RewriteVariationsRequest) -> dict:
    """
    Genera N (1-3) variaciones de reescritura de un párrafo usando LLM.
    Cada variación conserva el significado y cita las mismas fuentes, pero
    reduce las señales de IA detectadas. Devuelve proveedor usad para logs.
    """
    from modules.ai_client import execute_with_specialty
    n = max(1, min(3, req.n))
    system_prompt = (
        "Eres un editor académico experto en APA 7ma edición. "
        "Reescribes párrafos en español universitario natural, eliminando "
        "muletillas de IA (en conclusión, es importante destacar, no obstante, "
        "vale la pena, resulta fundamental) y variando la estructura de las "
        "oraciones. Devuelves EXCLUSIVAMENTE un JSON válido: un array de "
        "strings, cada uno es una versión reescrita. Sin comillas extra."
    )
    user_prompt = (
        f"Instrucción: {req.instruction}\n"
        f"Texto original:\n{req.text}\n\n"
        f"Genera {n} versiones distintas. Devuelve JSON (array de strings)."
    )
    try:
        content = await execute_with_specialty(
            prompt=user_prompt,
            system_prompt=system_prompt,
            specialty="FAST",
            api_key=req.api_key,
            provider_id=req.provider_id,
            temperature=0.6,
            max_tokens=1400,
            use_cache=False,
            return_provider_info=True,
        )
        if isinstance(content, tuple) and len(content) == 3:
            raw, provider_name, provider_id = content
        else:
            raw, provider_name, provider_id = content, "unknown", "unknown"
        text = raw.strip()
        if text.startswith("```json"):
            text = text[7:-3]
        elif text.startswith("```"):
            text = text[3:-3]
        import json as _json
        try:
            variations = _json.loads(text.strip())
            if not isinstance(variations, list):
                variations = [str(variations)]
        except Exception:
            variations = [text]
        variations = [v for v in variations if isinstance(v, str) and v.strip()]
        variations = variations[:n]
        return {
            "variations": variations,
            "provider": provider_name,
            "provider_id": provider_id,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/live-chat")
async def api_live_chat(req: LiveChatRequest) -> dict:
    """
    Asistente conversacional en vivo: interpreta instrucciones en lenguaje natural
    y devuelve una respuesta explicativa junto con acciones estructuradas (DSL)
    para editar el DocumentModel de forma atómica y segura.
    """
    doc = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    from modules.ai_document_editor import process_live_document_chat
    try:
        result = await process_live_document_chat(
            document=doc,
            user_instruction=req.user_instruction,
            selected_element_id=req.selected_element_id,
            history=req.history,
            api_key=req.api_key,
            provider_id=req.provider_id,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/proactive-captions")
async def api_proactive_captions(req: ProactiveCaptionsRequest) -> dict:
    """
    Analiza en segundo plano las figuras y tablas del documento y sugiere
    automáticamente títulos descriptivos en cursiva y notas APA 7.
    """
    doc = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    from modules.ai_proactive_captioner import analyze_document_proactive_captions
    try:
        suggestions = await analyze_document_proactive_captions(
            document=doc,
            api_key=req.api_key,
            provider_id=req.provider_id,
        )
        return {"suggestions": suggestions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/proactive-diagnose")
async def api_proactive_diagnose(req: ProactiveDiagnoseRequest) -> dict:
    """
    Diagnostica de forma proactiva un elemento del documento y formula una
    propuesta de corrección académica lista para aplicar con 1 clic.
    """
    doc = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    elem = next((e for e in doc.elements if e.id == req.element_id), None)
    if not elem:
        raise HTTPException(status_code=404, detail="Elemento no encontrado")

    from modules.ai_proactive_reviewer import diagnose_element_with_ai
    try:
        diagnosis = await diagnose_element_with_ai(
            elem=elem,
            api_key=req.api_key,
            provider_id=req.provider_id,
        )
        return {"proposal": diagnosis}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/test/sample-documents")
async def api_get_sample_documents() -> dict:
    """Retorna la lista de documentos de prueba y estrés disponibles."""
    return {
        "samples": [
            {
                "id": "citations",
                "name": "Citas Complejas y Bibliografía",
                "desc": "Citas parentéticas, narrativas, 3+ autores (et al.), secundarias, citas fantasma y referencias huérfanas.",
            },
            {
                "id": "headings",
                "name": "Jerarquía de Títulos y Estructura",
                "desc": "Títulos desordenados (H1 -> H3 -> H2), numeración romana/arábiga y detección de encabezados.",
            },
            {
                "id": "tables_figures",
                "name": "Tablas y Figuras sin Formato",
                "desc": "Tablas estadísticas sin formato APA y párrafos contextuales para auto-captioning.",
            },
        ]
    }


@app.get("/api/test/sample-documents/{doc_type}")
async def api_download_sample_document(doc_type: str):
    """Genera y descarga el documento de prueba seleccionado."""
    from tools.stress_doc_generator import (
        generate_stress_citations_doc,
        generate_stress_headings_and_structure_doc,
        generate_stress_tables_and_figures_doc,
    )
    if doc_type == "citations":
        path = generate_stress_citations_doc()
    elif doc_type == "headings":
        path = generate_stress_headings_and_structure_doc()
    elif doc_type == "tables_figures":
        path = generate_stress_tables_and_figures_doc()
    else:
        raise HTTPException(status_code=404, detail="Tipo de documento de prueba no encontrado")

    return FileResponse(
        path,
        filename=f"stress_{doc_type}.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@app.post("/api/ai/chat-comment")
async def api_chat_comment(req: ChatCommentRequest) -> dict:
    """
    Genera un comentario humorístico estilo WhatsApp sobre un elemento del
    documento (emojis, citas fantasma, muletillas IA, formato APA...).

    Se usa el LLM con contexto + ejemplos para que el tono sea el del "bro"
    que comenta el trabajo. Es un toque de personalidad; si falla o no hay
    API key, el frontend cae al comentario de la biblioteca (plantillas).
    """
    from modules.ai_client import execute_with_specialty

    # Guarda de seguridad: recortar el texto para no saturar tokens
    element_text = (req.element_text or "")[:800]

    system_prompt = (
        "Sos un amigo universitario que comenta el trabajo de un compañero por "
        "WhatsApp: con humor, jerga argentina/universitaria, frases CORTAS "
        "(máximo 18 palabras) y sin ser pesado. El texto va dentro de una burbuja "
        "de chat. Usás emojis. Nunca corregís el contenido de verdad: solo "
        "comentás con onda. Respondés EXCLUSIVAMENTE con el comentario, sin "
        "comillas, sin explicaciones ni intro."
    )

    # Mapear la categoría a una instrucción clara para el LLM
    kind_hint = {
        "ghost_citation": "una cita que aparece en el texto pero NO está en la bibliografía",
        "orphan_references": "referencias que están en la bibliografía pero nunca se citaron",
        "shouting": "un párrafo escrito TODO en MAYÚSCULAS",
        "spanglish": "una frase que mezcla inglés y español",
        "duplicate": "una palabra repetida seguida (error de tipeo/pegado)",
        "long_paragraph": "un párrafo larguísimo de una sola tirada",
        "first_person": "uso de primera persona (yo/nosotros) en un trabajo académico",
        "acronym": "una sigla o abreviatura sin definir",
        "excess_punctuation": "signos de exclamación/interrogación exagerados (!!/??)",
        "validation_figuras": "un problema con el formato APA de una figura",
        "validation_tablas": "un problema con el formato APA de una tabla",
        "validation_headings": "un problema con la jerarquía o formato de un título",
        "validation_formato": "un problema general de formato APA",
        "validation_citas": "un problema con una cita",
        "validation_referencias": "un problema con la bibliografía",
        "validation_consistencia": "una inconsistencia detectada en el documento",
        "conclusion": "una muletilla típica de IA ('en conclusión', 'en resumen')",
        "ai": "una muletilla típica de IA",
        "emoji": "un emoji o símbolo de checklist que se coló en el texto",
        "table_emoji": "una tabla con emojis de checklist pegados de un chat",
        "image_no_caption": "una imagen sin leyenda",
    }.get(req.kind, "algo sospechoso en el trabajo académico")

    examples = req.examples or [
        "¿por qué gritás? ",
        "¿spanglish? ",
        "esta cita es de pablito? ",
        "bro, los emojis quedaron pegados del chat ",
        "respirá, bro, es un párrafo larguísimo ‍",
        "ese cierre lo escribió el robot, se nota ",
    ]

    examples_str = "\n".join(f"- {ex}" for ex in examples[:6])
    user_prompt = (
        f"Comentá esto: {kind_hint}.\n\n"
        f"Texto del elemento:\n\"{element_text}\"\n\n"
        f"Ejemplos del tono que quiero:\n{examples_str}\n\n"
        "Escribí SOLO el comentario (una frase corta con emoji)."
    )

    try:
        content = await execute_with_specialty(
            prompt=user_prompt,
            system_prompt=system_prompt,
            specialty="FAST",
            api_key=req.api_key,
            nim_url=req.nim_url,
            use_local=req.use_local,
            provider_id=req.provider_id,
            temperature=0.85,
            max_tokens=90,
            use_cache=False,
        )
        comment = (content or "").strip()
        # Limpiar comillas/backticks que el LLM pueda meter
        comment = comment.strip('"\'`')
        if not comment:
            raise ValueError("Respuesta vacía")
        return {"comment": comment[:140]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/loading-tip")
async def api_loading_tip(req: LoadingTipRequest) -> dict:
    """
    Genera un tip de carga (pantalla de progreso) con el LLM: verbos de
    proceso, chistes internos o curiosidades APA. El frontend rota por
    categoría; si esto falla o no hay API key, usa la biblioteca local.
    """
    from modules.ai_client import execute_with_specialty

    category = req.category or "process"
    phase = req.phase or ""

    phase_hint = {
        "upload": "subiendo un documento",
        "classify": "clasificando elementos con IA",
        "export": "generando el archivo formateado",
    }.get(phase, "procesando un documento")

    category_hint = {
        "process": "un verbo de proceso humorístico (lo que está haciendo la app)",
        "jokes": "un chiste interno sobre la app o el proceso",
        "apa": "una curiosidad o error común de APA 7",
        "honest": "un mensaje honesto y tranquilo porque el proceso tarda",
    }.get(category, "un verbo de proceso humorístico")

    examples = {
        "process": [
            "domesticando tablas…",
            "poniéndole orden a las comas…",
            "negociando con las sangrías…",
            "midiendo márgenes con precisión quirúrgica…",
            "reconciliando a Times New Roman con el resto del mundo…",
            "convirtiendo tus 'Enter, Enter, Enter' en sangría de verdad…",
            "desenredando el nudo de las notas al pie…",
        ],
        "jokes": [
            "leyendo tu bibliografía… ojalá no sea todo Wikipedia.",
            "ese título en mayúsculas sostenidas no engaña a nadie.",
            "alguien tradujo esto con IA y se nota el 'asimismo'.",
            "ese gráfico de Excel pegado se ve como se ve.",
            "la conclusión que dice lo mismo que la introducción, otra vez.",
            "si esto tarda, no es la app, es que tu profe pidió demasiadas fuentes.",
        ],
        "apa": [
            "el error más común en trabajos de estudiante: olvidar el DOI. ¿vos lo tenés?",
            "las tablas no llevan líneas verticales en APA 7.",
            "si son 3 o más autores, va 'et al.' desde la primera cita.",
            "las citas de más de 40 palabras van en bloque, sin comillas.",
            "el DOI empieza con 'https://doi.org/', no con el número pelado.",
        ],
        "honest": [
            "esto está tardando más de lo normal — tu doc es grande, tranquilo, seguimos.",
            "no se colgó, solo está siendo minucioso.",
            "último tramo, ya casi.",
        ],
    }.get(category, [])

    examples_str = "\n".join(f"- {ex}" for ex in examples[:5])

    system_prompt = (
        "Sos el 'bro' de una app que formatea trabajos académicos a APA 7. "
        "Escribís tips cortos para la pantalla de carga: con humor, jerga "
        "universitaria, máximo 60 caracteres, SIN emojis (debe verse sobrio, "
        "no como texto de IA). Respondés SOLO el tip, sin comillas ni intro."
    )
    user_prompt = (
        f"Generá un tip de carga de categoría: {category_hint}.\n"
        f"Contexto: la app está {phase_hint}.\n\n"
        f"Ejemplos del tono:\n{examples_str}\n\nEscribí SOLO el tip."
    )

    try:
        content = await execute_with_specialty(
            prompt=user_prompt,
            system_prompt=system_prompt,
            specialty="FAST",
            api_key=req.api_key,
            nim_url=req.nim_url,
            use_local=req.use_local,
            provider_id=req.provider_id,
            temperature=0.9,
            max_tokens=70,
            use_cache=True,
        )
        text = (content or "").strip().strip('"\'`')
        if not text:
            raise ValueError("Respuesta vacía")
        return {"category": category, "text": text[:110]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
@app.post("/api/ai/citation-fix")
async def api_citation_fix(req: CitationFixRequest) -> dict:
    """
    Sugiere la corrección APA 7 de una cita problemática (propuesta 6).
    Devuelve la forma corregida, el motivo y la acción sugerida.
    """
    from modules.ai_client import execute_with_specialty
    from persistence.session_manager import load_session_state
    doc = load_session_state(req.session_id, STORAGE_DIR)
    ref_hint = ""
    if doc and req.reference_id:
        for r in doc.referencias or []:
            if r.id == req.reference_id:
                ref_hint = f"\nReferencia encontrada: {r.formatted_apa or r.raw_text or r.title}"
                break
    system_prompt = (
        "Eres un experto en normas APA 7ma edición. Para una cita problemática, "
        "propones la forma corregida exacta. Devuelves SOLO un JSON válido: "
        '{"corrected": "(Apellido, 2023, p. 45)", "reason": "Falta el número de página", "action": "reemplazar"}.'
    )
    user_prompt = (
        f"Cita actual: {req.citation_text}\n"
        f"Problema: {req.problem or 'formato APA 7 incorrecto'}"
        f"{ref_hint}\n\n"
        "Propón la corrección exacta."
    )
    try:
        content = await execute_with_specialty(
            prompt=user_prompt,
            system_prompt=system_prompt,
            specialty="FAST",
            api_key=req.api_key,
            provider_id=req.provider_id,
            temperature=0.2,
            max_tokens=300,
            use_cache=True,
        )
        text = content.strip()
        if text.startswith("```json"):
            text = text[7:-3]
        elif text.startswith("```"):
            text = text[3:-3]
        import json as _json
        try:
            data = _json.loads(text.strip())
        except Exception:
            data = {"corrected": "", "reason": content, "action": "reviewar"}
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ProbarProveedorRequest(BaseModel):
    """Que proveedor quiere el usuario probar, y con que clave."""

    provider_id: str
    # La clave es opcional: si no se manda, se usa la que este en el entorno, que
    # es lo que ya habria escrito en la pestana. Mandarla es lo que permite
    # probar una clave recien escrita sin esperar al autoguardado.
    api_key: Optional[str] = None


def _entrada_de_proveedor(provider_id: str, clave: str) -> Optional[dict]:
    """La entrada de UN proveedor, exista o no su clave en el entorno.

    Es la unica forma de probar una clave recien escrita: `_get_active_providers`
    solo arma entradas de los proveedores que ya tienen clave puesta, asi que
    para un proveedor sin clave levanta `ValueError` y no hay nada que probar.

    **No se escribe una URL mas aca.** La entrada se arma poniendo la clave en el
    entorno y dejando que `_get_active_providers` la construya, que es el mismo
    camino que usa el router. Escribir aqui la URL seria la decimocuarta
    direccion de un proveedor: la unica que nadie actualiza cuando el proveedor
    muda de endpoint, y la unica que nadie puede probar con los tests por
    proveedor.

    Se usa un entorno temporal, no el de verdad: si el nombre de la variable ya
    esta puesto, se respeta el valor que habia, que es el camino normal.
    """
    from classification.llm_classifier import _get_active_providers
    from persistence.ai_keys import VARIABLES_DE_CLAVE_POR_ID

    variables = VARIABLES_DE_CLAVE_POR_ID.get(provider_id)
    if not variables:
        return None

    posted: dict = {}
    try:
        for variable in variables:
            posted[variable] = os.environ.get(variable, "")
            if not posted[variable] and clave:
                os.environ[variable] = clave
        entradas = _get_active_providers(None, None, False, provider_id)
    except ValueError:
        # Habia clave en el request pero el proveedor no se pudo construir.
        # Pasa con Cloudflare y una sola de sus dos variables: sin el id de
        # cuenta su endpoint no existe. No es una excepcion del ping, es "no se
        # puede probar", y el ping lo tiene que decir en vez de romperse.
        entradas = []
    finally:
        for variable, valor in posted.items():
            if valor:
                os.environ[variable] = valor
            else:
                os.environ.pop(variable, None)

    return entradas[0] if entradas else None


@app.post("/api/ai/probar-proveedor")
async def probar_proveedor(req: ProbarProveedorRequest) -> dict:
    """Le pregunta al proveedor UNA cosa minima, y dice cuanto costo y cuanto tardo.

    Existia un problema concreto que esto resuelve: `get_ai_system_health()` dice
    como esta el token bucket de cada especialidad, no si tu clave funciona. Un
    usuario que escribe una clave no tiene forma de saber si sirve sin gastar
    una tarea completa del documento, y un 401 no se distingue de "no tengo
    credito" sin mirar.

    El prompt es el mas corto posible y `max_tokens` es 1: el objetivo no es la
    respuesta, es la linea de estado. Se manda `provider_id` para que no vaya a
    preguntar por el primero de la lista.

    Nunca lanza: un proveedor caido es un resultado con `ok: false` y un motivo,
    no un 500. Un boton "Probar" que tira una excepcion en pantalla no es un
    boton Probar.
    """
    import time

    from modules.ai_client import _try_provider
    from classification.llm_classifier import _get_active_providers

    inicio = time.perf_counter()
    resultado: dict = {
        "provider_id": req.provider_id,
        "ok": False,
        "status": None,
        "ms": 0,
        "model": None,
        "motivo": "",
    }

    # El proveedor se busca SIN la clave del request: la lista se arma con las
    # variables del entorno, y el ping tiene que poder probar una clave recien
    # escrita que todavia no llego a ninguna variable. Se busca por id entre las
    # que se pueden construir, y si el id no existe se dice.
    # El proveedor se busca por su id, SIN exigir que tenga clave. Es lo que
    # permite probar una clave recien escrita que todavia no llego a ninguna
    # variable de entorno, que es el caso que el boton existe para cubrir: el
    # campo tiene un debounce de 800 ms y sin esto habria una ventana en la que
    # el boton dice "no hay clave" y el usuario piensa que escribio mal.
    #
    # `_get_active_providers` arma la lista solo con los que TIENEN clave, asi
    # que para un proveedor sin clave devuelve `ValueError`. Eso no es "no
    # existe": puede existir y no tener clave, y son dos mensajes distintos para
    # el usuario. Uno es "no lo conozco"; el otro es "falta la clave".
    from persistence.ai_keys import VARIABLES_DE_CLAVE_POR_ID
    conocido = req.provider_id in VARIABLES_DE_CLAVE_POR_ID

    entrada = None
    try:
        entradas = _get_active_providers(None, None, False, req.provider_id)
        entrada = entradas[0] if entradas else None
    except ValueError:
        if conocido:
            entrada = _entrada_de_proveedor(req.provider_id, (req.api_key or "").strip())

    if entrada is None:
        resultado["motivo"] = (
            f"A {req.provider_id} no le diste una clave todavia."
            if conocido
            else f"Proveedor desconocido: {req.provider_id}."
        )
        resultado["ms"] = int((time.perf_counter() - inicio) * 1000)
        return resultado

    resultado["model"] = entrada["model"]

    # La clave del request se usa SOLO si el proveedor no tiene la suya en el
    # entorno. Y se la pone a ESE y solo a ese: inyectarla en la entrada de NIM
    # como hacia antes con `custom_key` fue el defecto que esta fase corrigio, y
    # repetirlo aca seria el mismo defecto con otro nombre.
    clave = (req.api_key or "").strip()
    if clave and not entrada.get("key"):
        entrada = dict(entrada, key=clave)
    from classification.llm_classifier import PROVIDER_CAPACITY
    timeout = PROVIDER_CAPACITY.get(req.provider_id, {}).get("timeout", 25)

    try:
        # `retries=1` es un intento, no cero: `_try_provider` recorre
        # `range(retries)`, asi que cero intentos devuelve `None` sin hacer la
        # llamada y el ping dice "no contesto" sin haber preguntado nada.
        crudo = await _try_provider(entrada, {
            "model": entrada["model"],
            "messages": [{"role": "user", "content": "di hola"}],
            "max_tokens": 1,
        }, timeout, retries=1)
    except Exception as e:
        crudo = None
        resultado["motivo"] = f"No se pudo completar la consulta: {e}"

    resultado["ms"] = int((time.perf_counter() - inicio) * 1000)
    if crudo is not None:
        resultado["ok"] = True
        resultado["status"] = 200
    elif not resultado["motivo"]:
        from modules.ai_client import _provider_health

        observado = _provider_health.get(req.provider_id, {})
        estado = observado.get("status", "sin respuesta")
        http = observado.get("http_status")
        resultado["status"] = http
        if estado == "healthy":
            resultado["ok"] = True
        else:
            resultado["motivo"] = _MOTIVO_DE_ESTADO.get(estado, estado)
    return resultado


# Por que un proveedor no contesto, en palabras que un usuario entienda. Sin
# esto la UI muestra "rate_limited", que es un nombre interno que no dice si hay
# que esperar, cambiar el modelo o cambiar la clave.
_MOTIVO_DE_ESTADO: dict = {
    "rate_limited": "El proveedor esta limitando por cuota. Espera un momento.",
    "unavailable": "El proveedor rechazo la consulta. Revisa la clave y el modelo.",
    "offline": "No se pudo conectar con el proveedor.",
    "sin respuesta": "El proveedor no contesto.",
}


@app.post("/api/sync-provider-keys")
async def sync_provider_keys_endpoint(request: Request) -> dict:
    """
    Recibe lo que el usuario escribio en la pestana Conexion y lo inyecta en
    os.environ, para que `_get_active_providers()` lo use sin reiniciar el
    backend ni editar .env a mano.

    Acepta CLAVES y MODELOS. Antes `allowed` era un `dict` de variables de
    clave, con lo cual los nueve campos de modelo de la UI se guardaban en
    localStorage y no llegaban: un control decorativo con la etiqueta de uno
    funcional, y la propia UI lo admitia por escrito.

    Lo que se acepta sale del catalogo de `persistence.ai_keys`, que es la misma
    lista que se persiste. Derivar de ahi y no de una copia escrita acá es lo que
    evita la tercera omision: cuando se agrego HuggingFace, esta lista, el mapa
    del renderer y `PROVIDER_ENV_VARS` quedaron con trece y el catalogo con
    catorce.

    Solo inyecta si el valor no esta vacio; nunca sobrescribe una existente salvo
    que se mande un valor nuevo.
    """
    from persistence.ai_keys import PROVIDER_ENV_VARS

    try:
        body = await request.json()
    except Exception:
        body = {}
    permitidas = set(PROVIDER_ENV_VARS)

    # Las claves y los modelos llegan en dos cuerpos distintos porque en la UI
    # son dos campos de formulario distintos. Se juntan en un solo diccionario
    # para que el camino de aplicacion y el de persistencia sean uno: aplicarlas
    # por un lado y guardarlas por otro es como una clave llega a `os.environ` y
    # no sobrevive al reinicio.
    recibido: dict = {}
    for campo in ("keys", "modelos", "models"):
        parte = body.get(campo, {}) or {}
        if isinstance(parte, dict):
            recibido.update(parte)
    # Y tambien sueltas en la raiz, que es como las mando el primer cliente.
    for nombre, valor in body.items():
        if nombre in permitidas:
            recibido[nombre] = valor

    applied = []
    for env_var in PROVIDER_ENV_VARS:
        val = str(recibido.get(env_var, "") or "").strip()
        if val:
            os.environ[env_var] = val
            applied.append(env_var)

    # Lo que se aplico, se persiste. Y se persiste SOLO lo que se aplico: lo
    # demas no salio de acá y no tiene por que quedar en un archivo.
    try:
        from persistence.ai_keys import save_provider_keys
        save_provider_keys({k: recibido.get(k) for k in applied})
    except Exception as e:
        print(f"[WARN] No se pudo persistir claves de IA: {e}")

    return {"applied": applied, "count": len(applied)}


@app.get("/api/assets/logo_uni.png")
async def get_uni_logo() -> FileResponse:
    """
    Sirve el logo institucional UNI para la portada universitaria
    (preview en el lienzo y generacion).
    """
    logo_path: Path = Path(__file__).parent / "assets" / "logo_uni.png"
    if not logo_path.exists():
        raise HTTPException(status_code=404, detail="Logo UNI no encontrado.")
    return FileResponse(logo_path)


@app.get("/api/assets/logo_unan.png")
async def get_unan_logo() -> FileResponse:
    """
    Sirve el logo de la UNAN-Managua para la preset de esa universidad.

    El preset de la UNAN en `CoverEditorPanel` pedia este logo y no habia ruta
    que lo sirviera, asi que la miniatura salia rota.
    """
    logo_path: Path = Path(__file__).parent / "assets" / "logo_unan.png"
    if not logo_path.exists():
        raise HTTPException(status_code=404, detail="Logo UNAN no encontrado.")
    return FileResponse(logo_path)


@app.post("/api/resolve-doi")
async def resolve_doi_endpoint(req: ResolveDoiRequest) -> dict:
    """
    Resuelve un DOI via Crossref content negotiation (gratis, sin API key).
    Retorna la referencia formateada en APA 7.
    """
    doi_clean: str = req.doi.strip()
    if not doi_clean:
        raise HTTPException(
            status_code=400,
            detail="El DOI no puede estar vacio.",
        )

    try:
        formatted = await resolve_doi(doi_clean)
        if formatted:
            return {"doi": doi_clean, "formatted": formatted}
        else:
            return {
                "doi": doi_clean,
                "formatted": None,
                "error": "No se pudo resolver el DOI. Verifica que sea correcto.",
            }
    except Exception as e:
        return {
            "doi": doi_clean,
            "formatted": None,
            "error": f"Error al consultar Crossref: {str(e)}",
        }


@app.post("/api/references/resolve-batch")
async def resolve_batch_endpoint(req: ResolveBatchRequest) -> dict:
    from modules.referencias_module import resolve_dois_batch
    try:
        results = await resolve_dois_batch(req.references)
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/resolve-ghost-citation")
async def resolve_ghost_citation_endpoint(req: ResolveGhostCitationRequest):
    """
    Busca en cascada (Crossref -> OpenAlex -> Semantic Scholar) referencias por autor + año.
    """
    from modules.referencias_module import search_academic_metadata_cascade
    query = f"{' '.join(req.authors)} {req.year}".strip()
    result = await search_academic_metadata_cascade(query, authors=req.authors, year=req.year)
    if not result:
        return {"found": False, "candidates": [], "total_results": 0}
    # La cascada por autor+año ya devuelve un sobre {candidates, found,
    # total_results}. Envolverlo otra vez mandaba al cliente un único candidato
    # que ERA el sobre: sin autores ni título, y se creaba una ficha en blanco.
    if isinstance(result, dict) and "candidates" in result:
        cands = result.get("candidates") or []
        return {
            "found": bool(cands),
            "candidates": cands,
            "total_results": result.get("total_results", len(cands)),
        }
    return {"found": True, "candidates": [result], "total_results": 1}


@app.post("/api/references/import-file")
async def import_references_file_endpoint(
    file: Optional[UploadFile] = File(None),
    content: Optional[str] = Form(None),
    file_type: Optional[str] = Form(None),
):
    """Importa bibliotecas de Zotero/Mendeley en formato BibTeX (.bib) o RIS (.ris)."""
    from parsing.bibtex_ris_parser import parse_bibtex_text, parse_ris_text

    raw_text = ""
    filename = ""
    if file:
        raw_bytes = await file.read()
        raw_text = raw_bytes.decode("utf-8", errors="ignore")
        filename = file.filename or ""
    elif content:
        raw_text = content

    if not raw_text.strip():
        raise HTTPException(status_code=400, detail="No se proporcionó contenido para importar.")

    is_ris = (file_type and file_type.lower() == "ris") or filename.lower().endswith(".ris") or "TY  -" in raw_text or "ER  -" in raw_text
    if is_ris:
        imported = parse_ris_text(raw_text)
    else:
        imported = parse_bibtex_text(raw_text)

    return {
        "success": True,
        "count": len(imported),
        "imported_references": [r.model_dump() for r in imported],
    }


@app.post("/api/export/audit-pdf-visual")
async def audit_pdf_visual_endpoint(file: UploadFile = File(...)):
    """Audita el maquetado visual de un archivo PDF renderizado usando PyMuPDF."""
    from modules.visual_auditor import audit_pdf_visual_layout
    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Archivo PDF vacío.")
    audit_res = audit_pdf_visual_layout(pdf_bytes)
    return audit_res


@app.post("/api/validate")
async def validate_document(req: GenerateRequest) -> dict:
    """
    Ejecuta la validacion cruzada entre citas y referencias, más las
    verificaciones científicas APA 7 (resumen, palabras clave, notación
    estadística, figuras/tablas, running head, niveles y formato de refs).
    """
    doc: Optional[DocumentModel] = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(
            status_code=404,
            detail="Sesion no encontrada.",
        )

    references = req.references if req.references is not None else (doc.referencias or [])
    issues = validate_apa_integrity(doc, references)
    return {"issues": [i.model_dump() for i in issues]}


@app.post("/api/validate/ai")
async def validate_document_with_ai(
    session_id: str = Form(...),
    references: str = Form("[]"),
    api_key: Optional[str] = Form(None),
    nim_url: Optional[str] = Form(None),
    use_local: Optional[str] = Form(None),
    provider_id: Optional[str] = Form(None),
) -> dict:
    """
    Validacion de citas potenciada por IA (opcional).
    Usa LLM para verificar matches inciertos entre citas y referencias.
    Solo se ejecuta si el usuario proporciona API key y lo habilita explicitamente.
    """
    doc: Optional[DocumentModel] = load_session_state(session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesion no encontrada.")

    refs = json.loads(references) if references else []
    ref_models = [ReferenciaModel(**r) for r in refs]

    issues = await validate_citations_with_llm(
        doc, ref_models, api_key, nim_url, use_local == 'true', provider_id)
    return {"issues": [i.model_dump() for i in issues]}


@app.post("/api/preview")
async def generate_preview(req: PreviewRequest) -> dict:
    """
    Genera un preview HTML rapido del documento formateado.
    Genera el DOCX APA 7 en un archivo temporal y lo convierte a HTML
    usando mammoth.js (el frontend se encarga de la conversion real
    via mammoth.js en el navegador — este endpoint solo genera el DOCX
    y retorna la URL de descarga para el preview).
    """
    doc: Optional[DocumentModel] = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(
            status_code=404,
            detail="Sesion no encontrada.",
        )

    rules: APARuleSet = _session_rules(doc, req.rules)
    out_dir: Path = STORAGE_DIR / "sessions" / req.session_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file: Path = out_dir / f"Preview_{doc.file_name}"

    try:
        output_file: Path = generate_apa7_docx(
            doc,
            out_file,
            rules=rules,
            portada=req.portada,
            references=req.references,
        )

        return {
            "status": "ok",
            "session_id": req.session_id,
            "download_url": f"/api/download-preview/{req.session_id}",
            "output_file": str(output_file.name),
            "updated_elements_count": len(doc.elements),
        }
    except Exception as e:
        print(f"[ERROR] Error generando preview: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error generando vista previa: {str(e)}",
        )



# ????????????????????????? WordAPA7 add-in bridge & infra (2026-08) ?????????????????????????
try:
    from modules.word_com import release_word_app as _rwa
except Exception:
    _rwa = None


class ClientLogRequest(BaseModel):
    component: str = "renderer"
    event: str
    data: Optional[dict] = None
    level: str = "info"


@app.post("/api/client-log")
async def client_log_endpoint(req: ClientLogRequest) -> dict:
    """Receptor de logs del frontend y del add-in."""
    from wordapa7_logger import log_error as _le2
    from wordapa7_logger import log_event as _lv2
    comp = (req.component or "client").replace("/", "_")[:24]
    if req.level == "error":
        _le2(comp, req.event, Exception(str(req.data)), req.data)
    _lv2(comp, req.event, req.data, level=req.level)
    return {"ok": True}


@app.get("/api/diagnostics")
async def diagnostics_endpoint() -> dict:
    from wordapa7_logger import collect_diagnostics
    return collect_diagnostics()


_ADDIN_LAST_SEEN: dict = {}


@app.post("/api/addin/heartbeat")
async def addin_heartbeat() -> dict:
    import time as _t
    _ADDIN_LAST_SEEN["ts"] = _t.time()
    return {"ok": True}


@app.get("/api/addin/sideload-status-v2")
async def addin_sideload_status_v2() -> dict:
    import time as _t
    age = None
    if _ADDIN_LAST_SEEN.get("ts"):
        age = round(_t.time() - _ADDIN_LAST_SEEN["ts"], 1)
    return {"installed": True, "heartbeat_age_s": age,
            "active_in_word": age is not None and age < 120}


class OpenLocalReq(BaseModel):
    path: str


@app.post("/api/open-local")
async def open_local_document(req: OpenLocalReq) -> dict:
    """Flujo click-derecho: abre un .docx local (misma maquina)."""
    src = Path(req.path)
    if not src.exists() or src.suffix.lower() != ".docx":
        raise HTTPException(status_code=400, detail="Archivo .docx no encontrado")
    import io as _io

    from fastapi import UploadFile as _UF
    from routers.sessions import upload_docx
    _up = _UF(file=_io.BytesIO(src.read_bytes()), filename=src.name)
    return await upload_docx(_up)


class FormatPlanReq(BaseModel):
    texts: List[str] = []
    full: bool = False


class CaptionsPlanReq(BaseModel):
    texts: List[str] = []
    tables: List[int] = []   # indices de tablas (orden documento)
    figures: List[int] = []  # indices de parrafos con imagen


@app.post("/api/addin/captions-plan")
async def addin_captions_plan(req: CaptionsPlanReq) -> dict:
    """Que captions FALTAN y con que numero (serie continua, idempotente)."""
    from modules.captions import scan_existing
    base = scan_existing(req.texts)
    nt, nf = base["max_table"], base["max_figure"]
    ops = []
    for i in req.tables:
        nt += 1
        ops.append({"i": i, "kind": "table", "number": nt})
    for i in req.figures:
        nf += 1
        ops.append({"i": i, "kind": "figure", "number": nf})
    return {"ops": ops}

@app.post("/api/addin/format-plan")
async def addin_format_plan(req: FormatPlanReq) -> dict:
    """Piso de portada + reglas desde el MOTOR CENTRAL.
    El add-in ejecuta; nunca decide formato ni limites por su cuenta."""
    import re as _re

    from modules.apa_rules import RULES

    def _floor(texts: List[str]) -> int:
        for i, t in enumerate(texts[:60]):
            s = (t or "").strip()
            if not s:
                continue
            low = s.lower().rstrip(":")
            if low in ("introduccion", "introducci?n", "resumen", "abstract") or _re.match(r"^\d+(\.\d+)*\.?\s+\S", s):
                return i
            if len(s) > 180 or _re.search(r"\([A-Z??????][^)]{2,40},\s*(19|20)\d{2}\)", s):
                return i
        return 0

    if req.full:
        from modules.plan_engine import classify
        from modules.plan_engine import findings as _findings
        plan = classify(req.texts)
        plan["findings"] = _findings(req.texts, plan["floor"])
        return plan
    return {"floor": _floor(req.texts), "rules": RULES}


@app.post("/api/addin/setup-catalog")
async def addin_setup_catalog() -> dict:
    from routers.addin_static import _purge_wef_cache_full, _setup_trusted_catalog
    cat = _setup_trusted_catalog()
    purged = _purge_wef_cache_full()
    return {"catalog": cat, "wef_purged": purged}

# ????????????????????????? fin bloque add-in bridge ?????????????????????????


@app.post("/api/generate-pdf")
async def generate_pdf_endpoint(req: GenerateRequest) -> dict:
    """
    Genera el archivo PDF final formateado con APA 7 a partir del DOCX.

    F8: acepta `destino_en_disco` opcional. Si está presente, el PDF se copia
    a esa ruta además de devolverse por HTTP (para Exportados/ de proyectos).
    """
    doc: Optional[DocumentModel] = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")

    # FASE 5 — Guard D-a: sin Word, error claro (sin fallback LO/heurístico)
    from services.doc_converter import get_doc_converter
    try:
        if get_doc_converter().get_active_engine() != "COM":
            raise HTTPException(status_code=503, detail="Se requiere Microsoft Word")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    out_dir = STORAGE_DIR / "sessions" / req.session_id
    out_dir.mkdir(parents=True, exist_ok=True)

    clean_file_name = doc.file_name or "document.docx"
    clean_file_name = clean_file_name.replace(" ", "_")
    artifact_id = uuid.uuid4().hex
    docx_name = f"APA7_{artifact_id}_{clean_file_name}"
    docx_path = out_dir / docx_name
    pdf_name = docx_name.rsplit(".", 1)[0] + ".pdf"
    pdf_path = out_dir / pdf_name

    rules = _session_rules(doc, req.rules)
    portada = _session_portada(doc, req.portada)
    meta = _session_meta(doc, req.meta)
    doc.meta = meta  # el generador lee el acta de aca
    references = _session_references(doc, req.references)

    from services.doc_converter import get_doc_converter
    doc_converter = get_doc_converter()

    preserve_cover = portada.use_original_cover and doc.portada.get("detected", False)

    # Si el modo de exportación es inplace y se preserva portada original, generar vía apply_inplace para paridad 100%
    export_mode = getattr(rules, "export_mode", "inplace")
    use_orig_cover = getattr(portada, "use_original_cover", True)
    original_path = STORAGE_DIR / "sessions" / req.session_id / "original.docx"
    used_inplace = False

    if export_mode == "inplace" and use_orig_cover and original_path.exists():
        try:
            from generation.inplace_editor import apply_inplace
            apply_inplace(
                original_path, docx_path, doc, rules, scopes=None,
                language=getattr(portada, "language", None),
                acta=meta,
            )
            used_inplace = True
        except Exception as e_ip:
            print(f"[WARN] Error en apply_inplace para PDF: {e_ip}, recurriendo a generador general")

    if not used_inplace:
        # Remove cover paragraphs only if we have COM active, because LO doesn't do transplant yet
        is_com = doc_converter.get_active_engine() == "COM"
        generate_apa7_docx(
            doc, docx_path, rules=rules, portada=portada, references=references,
            remove_cover_paragraphs=preserve_cover and is_com
        )

    # Inyectar Post-Processor Dual Engine para PDF.
    # El archivo intermedio DEBE tener extensión .docx: Word COM decide el
    # formato de apertura/guardado por extensión y con alertas suprimidas
    # (DisplayAlerts=0) un nombre sin extensión produce aperturas erráticas
    # (formato incorrecto o recuperación de texto).
    final_path = out_dir / f"FinalPDFSource_{clean_file_name}"
    if final_path.suffix.lower() != ".docx":
        final_path = final_path.with_suffix(".docx")

    engine_used = doc_converter.get_active_engine()

    success, pdf_out_path = doc_converter.process_and_convert(
        original_path=original_path,
        generated_path=docx_path,
        final_path=final_path,
        preserve_cover=preserve_cover,
        generate_pdf=True,

        rules=rules
    )

    pdf_generated = False

    if success and pdf_out_path and pdf_out_path.exists():
        pdf_generated = True
        # Mover el PDF al path correcto
        import shutil
        shutil.move(str(pdf_out_path), str(pdf_path))
        if final_path.exists():
            final_path.unlink()
    else:
        # Fallback a LibreOffice vía el servicio singleton (resuelve la ruta
        # real de soffice.exe en Windows y usa perfil aislado). El subprocess
        # directo con "libreoffice" no existe en el PATH de Windows y este
        # eslabón moría SIEMPRE en silencio.
        try:
            lo = get_libreoffice_service()
            if lo.convert(docx_path, "pdf", out_dir) and pdf_path.exists():
                pdf_generated = True
                engine_used = "LO"
        except Exception as e:
            print(f"[WARN] LibreOffice conversion exception: {e}")

    if not pdf_generated:
        try:
            from services.doc_converter import get_doc_converter
            dc_ok, dc_pdf = get_doc_converter().process_and_convert(
                docx_path, docx_path, docx_path, preserve_cover=False, generate_pdf=True
            )
            if dc_ok and dc_pdf and dc_pdf.exists():
                shutil.move(str(dc_pdf), str(pdf_path))
                pdf_generated = True
                engine_used = "COM"
        except Exception as e:
            print(f"[WARN] Fallback PDF converter exception: {e}")

    if pdf_generated and pdf_path.exists():
        _write_export_manifest(
            out_dir,
            artifact_id,
            kind="pdf",
            filename=pdf_path.name,
            engine=engine_used or "unknown",
            source_docx=docx_path.name,
        )
        return {
            "status": "ok",
            "session_id": req.session_id,
            "download_url": _artifact_url(req.session_id, artifact_id),
            "artifact_id": artifact_id,
            "pdf_name": pdf_name,
            "file_path": str(pdf_path.resolve()),
            "engine": engine_used or "COM",
        }
    else:
        _write_export_manifest(
            out_dir,
            artifact_id,
            kind="docx",
            filename=docx_path.name,
            source_docx=docx_path.name,
            postprocessed=False,
        )
        return {
            "status": "fallback_docx",
            "session_id": req.session_id,
            "download_url": f"/api/download/{req.session_id}?artifact_id={artifact_id}",
            "docx_name": docx_name,
            "engine": engine_used,
            "message": "No se pudo generar el PDF en este entorno; se descarga la versión DOCX oficial.",
        }


@app.get("/api/download-pdf/{session_id}")
async def download_pdf(session_id: str, artifact_id: Optional[str] = None):
    if artifact_id:
        return await download_artifact(session_id, artifact_id)
    raise HTTPException(status_code=400, detail="Falta artifact_id de exportación.")


@app.get("/api/download-artifact/{session_id}/{artifact_id}")
async def download_artifact(session_id: str, artifact_id: str):
    manifest = STORAGE_DIR / "sessions" / session_id / "exports" / f"{artifact_id}.json"
    if not manifest.exists():
        raise HTTPException(status_code=404, detail="Artefacto de exportación no encontrado.")
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
        target = manifest.parent.parent / Path(data["filename"]).name
        if not target.exists() or target.parent != manifest.parent.parent:
            raise HTTPException(status_code=404, detail="Archivo exportado no encontrado.")
        media_type = "application/pdf" if data.get("kind") == "pdf" else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        return FileResponse(target, media_type=media_type, filename=target.name)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Manifiesto de exportación inválido: {exc}")


@app.get("/api/download-preview/{session_id}")
async def download_preview_docx(session_id: str) -> FileResponse:
    """
    Descarga el DOCX generado para preview.
    El frontend usa mammoth.js para convertir este DOCX a HTML en el navegador.
    """
    out_dir: Path = STORAGE_DIR / "sessions" / session_id
    files: list = sorted(out_dir.glob("Preview_*.docx"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        raise HTTPException(
            status_code=404,
            detail="Vista previa no encontrada. Genera el preview primero con /api/preview.",
        )

    target_file: Path = files[0]
    return FileResponse(
        target_file,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=target_file.name,
    )


# ── PREVIEW VÍA LIBREOFFICE (PNG por página, fiel al DOCX real) ──────────────

import shutil

_LIBREOFFICE = shutil.which("libreoffice") or shutil.which("soffice")


@app.post("/api/preview-pages/{session_id}")
async def generate_preview_pages(session_id: str, req: PreviewRequest) -> dict:
    """
    Genera preview como imagenes PNG (una por pagina) via LibreOffice.
    Si LibreOffice no esta instalado, retorna fallback al DOCX tradicional.
    Este preview es 100% fiel porque se renderiza desde el mismo DOCX final.
    """
    doc: Optional[DocumentModel] = load_session_state(session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesion no encontrada.")

    rules = _session_rules(doc, req.rules)
    portada = _session_portada(doc, req.portada)
    meta = _session_meta(doc, req.meta)
    doc.meta = meta  # el generador lee el acta de aca
    references = _session_references(doc, req.references)
    out_dir: Path = STORAGE_DIR / "sessions" / session_id / "preview_pages"
    out_dir.mkdir(parents=True, exist_ok=True)

    # Limpiar previews anteriores
    for old in out_dir.glob("page_*.png"):
        old.unlink()

    # Generar DOCX
    preview_docx = out_dir / "preview.docx"
    try:
        generate_apa7_docx(doc, preview_docx, rules=rules,
                   portada=portada, references=references)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando preview: {e}")

    from services.lo_service import get_libreoffice_service
    lo = get_libreoffice_service()

    if not lo.is_available():
        return {
            "status": "fallback_html",
            "message": "LibreOffice no instalado",
            "pages": [],
            "total_pages": 0,
            "fallback_docx_url": f"/api/download-preview/{session_id}",
        }

    # Convertir DOCX → PDF via DocConverterService (Word COM si está disponible, o LibreOffice)
    try:
        from services.doc_converter import get_doc_converter
        dc = get_doc_converter()
        pdf_generated = False
        pdf_file = out_dir / "preview.pdf"

        # Intentar con DocConverterService (que usa Word COM de alta fidelidad en Windows)
        success, dc_pdf = await asyncio.to_thread(
            dc.process_and_convert, preview_docx, preview_docx, preview_docx, False, True
        )
        if success and dc_pdf and dc_pdf.exists():
            if dc_pdf.resolve() != pdf_file.resolve():
                shutil.move(str(dc_pdf), str(pdf_file))
            pdf_generated = True

        # Fallback a LibreOffice si Word COM no produjo el PDF
        if not pdf_generated and lo.is_available():
            lo_success = await asyncio.to_thread(lo.convert, preview_docx, "pdf", out_dir)
            if lo_success and pdf_file.exists():
                pdf_generated = True

        if not pdf_generated or not pdf_file.exists():
            raise Exception("No se pudo generar el PDF de vista previa.")

        return {
            "status": "pdf",
            "pdf_url": f"/api/preview-pdf/{session_id}/preview.pdf",
            "message": "Preview generado"
        }
    except Exception as e:
        return {
            "status": "fallback_html",
            "message": f"Error: {e}",
            "pages": [],
            "total_pages": 0,
            "fallback_docx_url": f"/api/download-preview/{session_id}",
        }

@app.get("/api/preview-pdf/{session_id}/preview.pdf")
async def get_preview_pdf(session_id: str) -> FileResponse:
    """
    Sirve el PDF generado para el preview de la sesión.
    """
    pdf_path: Path = STORAGE_DIR / "sessions" / session_id / "preview_pages" / "preview.pdf"
    if not pdf_path.exists():
        raise HTTPException(
            status_code=404,
            detail="PDF no encontrado. Genera el preview primero.",
        )
    return FileResponse(pdf_path, media_type="application/pdf")


@app.get("/api/preview-pdf/{session_id}/rest.pdf")
async def get_rest_pdf(session_id: str) -> FileResponse:
    """Sirve el PDF de reposo generado por Fase 4 (POST /api/layout/pdf-export)."""
    pdf_path: Path = STORAGE_DIR / "sessions" / session_id / "preview_pages" / "rest.pdf"
    if not pdf_path.exists():
        raise HTTPException(
            status_code=404,
            detail="PDF de reposo no encontrado. Genera el export primero.",
        )
    return FileResponse(pdf_path, media_type="application/pdf")


def _safe_output_path(target_path: Path) -> Path:
    """Verifica si el archivo está bloqueado por Word en Windows y devuelve una ruta escribible."""
    if not target_path.exists():
        return target_path
    try:
        with open(target_path, "a+b"):
            pass
        return target_path
    except (PermissionError, OSError):
        stem = target_path.stem
        parent = target_path.parent
        for i in range(1, 100):
            cand = parent / f"{stem}_v{i}.docx"
            if not cand.exists():
                return cand
            try:
                with open(cand, "a+b"):
                    return cand
            except (PermissionError, OSError):
                continue
        import time
        return parent / f"{stem}_{int(time.time())}.docx"


@app.post("/api/export-latex/{session_id}")
async def export_latex_endpoint(session_id: str):
    """
    Fase 8: Exporta semánticamente el modelo a LaTeX compilable.
    """
    doc: Optional[DocumentModel] = load_session_state(session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")

    from generation.latex_exporter import export_to_latex
    try:
        latex_code = export_to_latex(doc, profile_id=doc.profile_id)
        return {"latex": latex_code}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate")
async def generate_docx(req: GenerateRequest) -> dict:
    """
    Genera el archivo .docx final formateado con APA 7 para ser descargado por el usuario.
    """
    doc: Optional[DocumentModel] = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(
            status_code=404,
            detail="Sesion no encontrada.",
        )

    if not doc.elements or len(doc.elements) == 0:
        raise HTTPException(
            status_code=400,
            detail="El documento no tiene elementos para generar. Sube un documento primero."
        )

    # FASE 5 — Guard D-a: sin Word, error claro (sin fallback LO/heurístico)
    from services.doc_converter import get_doc_converter
    try:
        if get_doc_converter().get_active_engine() != "COM":
            raise HTTPException(status_code=503, detail="Se requiere Microsoft Word")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    rules: APARuleSet = _session_rules(doc, req.rules)
    out_dir: Path = STORAGE_DIR / "sessions" / req.session_id
    raw_out_file: Path = out_dir / f"APA7_{doc.file_name}"
    out_file: Path = _safe_output_path(raw_out_file)
    artifact_id = uuid.uuid4().hex
    portada = _session_portada(doc, req.portada)
    meta = _session_meta(doc, req.meta)
    doc.meta = meta  # el generador lee el acta de aca
    references = _session_references(doc, req.references)

    # RUTA IN-PLACE (default): edita el original; portada/secciones intocables
    export_mode = getattr(rules, "export_mode", "inplace")
    use_orig_cover = getattr(portada, "use_original_cover", True)
    if export_mode == "inplace" and use_orig_cover:
        original_path_ip: Path = out_dir / "original.docx"
        if original_path_ip.exists():
            try:
                from generation.inplace_editor import apply_inplace
                from starlette.concurrency import run_in_threadpool
                # apply_inplace es bloqueante (lxml + IO): fuera del event loop.
                await run_in_threadpool(
                    apply_inplace,
                    original_path_ip, out_file, doc, rules, scopes=None,
                    language=getattr(portada, "language", None),
                    acta=meta,
                )
                try:
                    from persistence.idempotency import add_marker_to_docx
                    marked = add_marker_to_docx(out_file)
                    if marked is not None and Path(marked).exists():
                        Path(marked).replace(out_file)
                except Exception:
                    pass
                _write_export_manifest(
                    out_dir,
                    artifact_id,
                    kind="docx",
                    filename=out_file.name,
                    source_docx=out_file.name,
                    postprocessed=False,
                )
                return {
                    "success": True,
                    "download_url": _artifact_url(req.session_id, artifact_id),
                    "artifact_id": artifact_id,
                    "file_name": out_file.name,
                    "open_path": str(out_file),
                    "mode": "inplace",
                    "message": "Documento formateado in-place: portada y estructura originales intactas.",
                }
            except RuntimeError as rip:
                try:
                    from wordapa7_logger import log_event as _lf
                    _lf("generate", "inplace_fallback_rebuild", data={"reason": str(rip)[:200]})
                except Exception:
                    pass
            except Exception as exc_ip:
                try:
                    from wordapa7_logger import log_error as _lg
                    _lg("generate", "inplace_failed", exc_ip)
                except Exception:
                    pass


    try:
        from persistence.idempotency import add_marker_to_docx
        from services.doc_converter import get_doc_converter
        doc_converter = get_doc_converter()
        preserve_cover = portada.use_original_cover and doc.portada.get("detected", False)

        is_com = doc_converter.get_active_engine() == "COM"

        from starlette.concurrency import run_in_threadpool
        generated_path: Path = await run_in_threadpool(
            generate_apa7_docx,
            doc, out_file, rules, portada, references,
            remove_cover_paragraphs=preserve_cover and is_com,
        )

        original_path = STORAGE_DIR / "sessions" / req.session_id / "original.docx"

        # Inyectar Post-Processor Dual Engine. Va en threadpool porque COM es
        # bloqueante y NO debe correr en el event loop (congelaba el servidor
        # mientras Word trabajaba). Y si el post-proceso revienta, NO se pierde
        # el .docx ya generado: se devuelve sin post-procesar.
        final_path = out_dir / f"Final_{artifact_id}_{doc.file_name}"
        try:
            success, pdf_path = await run_in_threadpool(
                doc_converter.process_and_convert,
                original_path=original_path,
                generated_path=generated_path,
                final_path=final_path,
                preserve_cover=preserve_cover,
                generate_pdf=True,
                rules=rules,
            )
        except Exception as _post_exc:
            print(f"[WARN] Post-proceso falló; se devuelve el .docx sin post-procesar: {_post_exc}")
            success, pdf_path = False, None

        if success and final_path.exists():
            generated_path = final_path

        # Agregar marcador de idempotencia al DOCX generado
        try:
            marked_bytes = add_marker_to_docx(generated_path.read_bytes())
            with open(generated_path, "wb") as f:
                f.write(marked_bytes)
        except Exception:
            pass

        _write_export_manifest(
            out_dir,
            artifact_id,
            kind="docx",
            filename=generated_path.name,
            source_docx=out_file.name,
            postprocessed=bool(success and final_path.exists()),
        )
        return {
            "download_url": _artifact_url(req.session_id, artifact_id),
            "artifact_id": artifact_id,
            "filename": generated_path.name,
            "open_path": str(generated_path),
        }
    except Exception as e:
        print(f"[ERROR] Error generando DOCX: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error generando el documento APA 7: {str(e)}",
        )


@app.get("/api/download/{session_id}")
async def download_generated_docx(session_id: str, artifact_id: Optional[str] = None) -> FileResponse:
    """
    Descarga el archivo generado.
    """
    if artifact_id:
        return await download_artifact(session_id, artifact_id)
    out_dir: Path = STORAGE_DIR / "sessions" / session_id
    files: list = sorted(list(out_dir.glob("APA7_*.docx")), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        raise HTTPException(
            status_code=404,
            detail="Archivo generado no encontrado. Genera el documento primero con /api/generate.",
        )

    target_file: Path = files[0]
    return FileResponse(
        target_file,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=target_file.name,
    )


@app.post("/api/generate-tracked")
async def generate_tracked_docx_endpoint(req: GenerateRequest) -> dict:
    """
    Genera el archivo .docx con marcas de revision de cambios (Track Changes OOXML).
    """
    doc: Optional[DocumentModel] = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(
            status_code=404,
            detail="Sesion no encontrada.",
        )

    rules: APARuleSet = _session_rules(doc, req.rules)
    out_dir: Path = STORAGE_DIR / "sessions" / req.session_id
    out_file: Path = out_dir / f"Tracked_{doc.file_name}"

    try:
        create_tracked_changes_docx(doc, out_file, rules)
        return {
            "download_url": f"/api/download-tracked/{req.session_id}",
            "filename": f"Tracked_{doc.file_name}",
            "open_path": str(out_file),
        }
    except Exception as e:
        print(f"[ERROR] Error generando tracked changes: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error generando documento con control de cambios: {str(e)}",
        )


@app.get("/api/download-tracked/{session_id}")
async def download_tracked_docx(session_id: str) -> FileResponse:
    """
    Descarga el archivo con control de cambios generado.
    """
    out_dir: Path = STORAGE_DIR / "sessions" / session_id
    files: list = list(out_dir.glob("Tracked_*.docx"))
    if not files:
        raise HTTPException(
            status_code=404,
            detail="Archivo de comparacion no encontrado.",
        )
    target_file: Path = files[0]
    return FileResponse(
        target_file,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=target_file.name,
    )


# ── ENDPOINTS DE FUNCIONALIDADES AVANZADAS (CITAS, REFERENCIAS, ESTRUCTURA) ──


@app.post("/api/validate-citations/{session_id}")
async def validate_citations_endpoint(session_id: str) -> dict:
    """
    Cruza las citas extraídas del texto con las referencias para detectar
    citas fantasma (ghost citations) y referencias huérfanas (orphan references).
    No usa LLM, es 100% heurístico.
    """
    doc: Optional[DocumentModel] = load_session_state(session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")

    from parsing.citation_matcher import cross_check_citations_and_references
    from services.graph_rag import build_citation_graph, validate_citations_against_graph

    # 1. Base validation
    result = cross_check_citations_and_references(doc)

    # 2. Advanced Graph RAG validation
    if doc.referencias:
        references_text = [(r.raw_text or r.formatted_apa or "") for r in doc.referencias]
        references_text = [t for t in references_text if t]
        graph = build_citation_graph(references_text)

        graph_issues = []
        for elem in doc.elements:
            if elem.type == ElementType.PARAGRAPH and elem.text:
                issues = validate_citations_against_graph(elem.text, graph)
                if issues:
                    graph_issues.extend(issues)

        if graph_issues:
            # We append Graph RAG advanced issues
            result['ghost_citations'].extend([iss["citation"] for iss in graph_issues if iss["type"] == "missing_reference"])

            # For year mismatch, we can add a new field or just format it as ghost citation
            result['ghost_citations'].extend([iss["message"] for iss in graph_issues if iss["type"] == "year_mismatch"])

            # Deduplicate just in case. `set()` a secas revienta con las citas
            # fantasma que `citation_matcher` devuelve como dict: son
            # unhashables, y el endpoint solo no caía porque hasta ahora el
            # cruce base devolvía cero fantasmas en los casos con grafo.
            vistos = set()
            deduplicadas = []
            for fantasma in result['ghost_citations']:
                if isinstance(fantasma, str):
                    clave = ('str', fantasma)
                else:
                    clave = (
                        'dict',
                        fantasma.get('raw_text'),
                        tuple(fantasma.get('authors') or []),
                        str(fantasma.get('year') or ''),
                    )
                if clave in vistos:
                    continue
                vistos.add(clave)
                deduplicadas.append(fantasma)
            result['ghost_citations'] = deduplicadas

    # Save the doc since we mutated `doc.citas_intext`
    save_session_state(doc, STORAGE_DIR)

    return result


@app.get("/api/templates")
async def list_templates_endpoint() -> dict:
    """
    Lista las plantillas de estructura de documento disponibles.
    """
    from generation.templates import AVAILABLE_TEMPLATES

    result = []
    for t in AVAILABLE_TEMPLATES:
        result.append({
            "name": t.name,
            "description": t.description,
            "has_cover_page": t.has_cover_page,
            "has_toc": t.has_toc,
            "has_references": t.has_references,
            "section_count": len(t.sections),
        })
    return {"templates": result}


class ApplyTemplateRequest(BaseModel):
    session_id: str
    template_name: str
    numbering_style: str = "decimal"  # "decimal" | "roman"


class CreateFromTemplateRequest(BaseModel):
    template_id: str
    profile_id: str = "apa7"


def _get_section_guide_text(heading_text: str) -> str:
    h = heading_text.lower().strip()
    if "índice" in h or "tabla de contenido" in h:
        return "La tabla de contenidos se genera de forma automática a partir de los títulos y subtítulos del documento."
    if "introducción" in h:
        return "Esta sección presenta el planteamiento general del trabajo, los antecedentes teóricos más relevantes, la justificación de la investigación y los objetivos específicos que guían el estudio."
    if "antecedente" in h:
        return "Se revisan las investigaciones previas nacionales e internacionales directamente relacionadas con el objeto de estudio, destacando sus aportes y vacíos de conocimiento."
    if "problema" in h:
        return "Describe con claridad la situación problemática observada, su delimitación contextual y la formulación formal de la pregunta principal de investigación."
    if "objetivo" in h:
        return "Establece el objetivo general y los objetivos específicos que delimitan el alcance analítico y metodológico del proyecto."
    if "justificación" in h:
        return "Expone la relevancia teórica, metodológica y práctica del estudio, argumentando el valor añadido de sus resultados para la comunidad académica."
    if "marco teórico" in h or "marco conceptual" in h:
        return "Desarrolla las teorías, modelos y conceptos fundamentales que sustentan el análisis. Las citas en el texto deben seguir el formato APA 7 (Apellido, Año)."
    if "metodología" in h or "método" in h:
        return "Describe detalladamente el enfoque de investigación, el diseño metodológico, la población, muestra y las técnicas e instrumentos de recolección de datos."
    if "tipo de investigación" in h:
        return "Especifica el paradigma, nivel (descriptivo, correlacional, explicativo) y diseño (experimental o no experimental) adoptado en el estudio."
    if "población" in h or "muestra" in h:
        return "Define las características de la unidad de análisis, los criterios de inclusión/exclusión y el método de muestreo probabilístico o no probabilístico."
    if "instrumento" in h:
        return "Describe las herramientas de medición o recolección de datos empleadas, detallando sus propiedades de validez y confiabilidad."
    if "resultado" in h:
        return "Presenta de manera objetiva los hallazgos empíricos obtenidos. Incluya tablas y figuras numeradas secuencialmente conforme a las directrices APA 7ma Edición."
    if "discusión" in h:
        return "Interpreta y contrasta los resultados alcanzados con las hipótesis planteadas y los hallazgos de investigaciones previas citadas en el marco teórico."
    if "conclusión" in h or "conclusiones" in h:
        return "Sintetiza las principales conclusiones derivadas del estudio, responde a los objetivos planteados y propone recomendaciones para futuras líneas de investigación."
    if "referencia" in h:
        return "Lista alfabética de todas las fuentes citadas en el texto, con sangría francesa de 1.27 cm (0.5 in) e interlineado doble según Normas APA 7."
    if "resumen" in h:
        return "Párrafo único sin sangría de entre 150 y 250 palabras que sintetiza el objetivo, metodología, resultados principales y conclusiones del trabajo."
    return f"Desarrollo académico correspondiente a la sección de {heading_text}, estructurado con interlineado doble, sangría de primera línea de 1.27 cm y tipografía uniforme APA 7."


@app.post("/api/create-from-template")
async def create_from_template_endpoint(req: CreateFromTemplateRequest) -> DocumentModel:
    """
    Crea una NUEVA sesión de trabajo a partir de una plantilla de estructura:
    genera el DocumentModel con los títulos de la plantilla y párrafos guía,
    lo persiste como sesión y lo devuelve con el mismo shape que /api/upload.
    """
    from routers.sessions import _TEMPLATE_ID_MAP

    profile = get_profile(req.profile_id)
    template = _TEMPLATE_ID_MAP.get(req.template_id)
    if template is None:
        raise HTTPException(
            status_code=400,
            detail=f"Plantilla desconocida: {req.template_id}.",
        )

    elements: list[ElementModel] = []

    def _add_sections(sections) -> None:
        for section in sections:
            # 1. Título estructurado
            elements.append(
                ElementModel(
                    id=f"tpl-{req.template_id}-{len(elements)}",
                    type=ElementType.HEADING,
                    heading_level=section.heading_level,
                    text=section.suggested_text,
                    original_text=section.suggested_text,
                    confidence=1.0,
                    is_cover_section=False,
                    needs_review=False,
                )
            )
            # 2. Párrafo guía explicativo de la sección
            guide_text = _get_section_guide_text(section.suggested_text)
            elements.append(
                ElementModel(
                    id=f"tpl-{req.template_id}-{len(elements)}",
                    type=ElementType.PARAGRAPH,
                    text=guide_text,
                    original_text=guide_text,
                    confidence=1.0,
                    is_cover_section=False,
                    needs_review=False,
                )
            )
            _add_sections(section.sub_sections)

    _add_sections(template.sections)

    fmt = profile.cover_apa_format
    apa_format = APAFormat.PROFESSIONAL if fmt == "professional" else APAFormat.STUDENT

    sample_refs = [
        ReferenciaModel(
            id="ref-tpl-1",
            raw_text="Hernández-Sampieri, R., & Mendoza, C. P. (2018). Metodología de la investigación: Las rutas cuantitativa, cualitativa y mixta. McGraw-Hill Education.",
            authors=["Hernández-Sampieri, R.", "Mendoza, C. P."],
            year="2018",
            title="Metodología de la investigación: Las rutas cuantitativa, cualitativa y mixta",
            source="McGraw-Hill Education",
        ),
        ReferenciaModel(
            id="ref-tpl-2",
            raw_text="American Psychological Association. (2020). Publication manual of the American Psychological Association (7th ed.). https://doi.org/10.1037/0000165-000",
            authors=["American Psychological Association"],
            year="2020",
            title="Publication manual of the American Psychological Association",
            source="American Psychological Association",
            doi_or_url="10.1037/0000165-000",
        ),
    ]

    doc = DocumentModel(
        session_id=f"sess-{uuid.uuid4().hex[:12]}",
        file_name=f"{template.name.split('(')[0].strip()}.docx",
        apa_format=apa_format,
        profile_id=profile.profile_id,
        elements=elements,
        referencias=sample_refs,
        apa_rules=profile.rules.model_copy(deep=True),
    )

    save_session_state(doc, STORAGE_DIR)
    return doc


@app.post("/api/apply-template")
async def apply_template_endpoint(req: ApplyTemplateRequest) -> dict:
    """
    Aplica una plantilla de estructura al documento:
    - Inserta secciones faltantes según la plantilla elegida
    - Reordena headings existentes
    - Retorna el resumen de cambios realizados
    """
    from generation.templates import TemplateSection, get_template

    doc: Optional[DocumentModel] = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesion no encontrada.")

    template = get_template(req.template_name)
    if not template:
        raise HTTPException(status_code=404, detail=f"Plantilla '{req.template_name}' no encontrada.")

    # Analizar qué headings ya existen en el documento
    existing_headings: dict[str, ElementModel] = {}
    existing_heading_texts_lower: set[str] = set()
    for elem in doc.elements:
        if elem.type == ElementType.HEADING and elem.text and elem.text.strip():
            lower = elem.text.strip().lower()
            existing_headings[lower] = elem
            existing_heading_texts_lower.add(lower)

    changes_made: list[dict] = []
    sections_created: int = 0

    # Función recursiva para procesar secciones de la plantilla
    def _process_section(section: TemplateSection, parent_idx: int = -1) -> None:
        nonlocal sections_created
        text_lower = section.suggested_text.strip().lower()

        if text_lower not in existing_heading_texts_lower:
            # Crear nuevo elemento de heading faltante
            new_elem = ElementModel(
                id=f"template_elem_{len(doc.elements) + sections_created + 1}",
                type=ElementType.HEADING,
                heading_level=section.heading_level,
                text=section.suggested_text,
                original_text=section.suggested_text,
                confidence=1.0,
                is_user_modified=False,
                needs_review=False,
                auto_applied=True,
                pre_classifier_rule="template",
            )
            # Insertar al final de los elementos (antes de referencias si existen)
            insert_idx = len(doc.elements)
            for ei, existing in enumerate(doc.elements):
                if existing.type == ElementType.HEADING and existing.text:
                    et_lower = existing.text.strip().lower()
                    if any(kw in et_lower for kw in ["referencia", "bibliograf"]):
                        insert_idx = ei
                        break
            doc.elements.insert(insert_idx, new_elem)
            existing_heading_texts_lower.add(text_lower)
            sections_created += 1
            changes_made.append({
                "action": "created",
                "text": section.suggested_text,
                "level": section.heading_level,
            })
        else:
            # Ya existe: marcar como modificado por plantilla
            existing = existing_headings.get(text_lower)
            if existing:
                changes_made.append({
                    "action": "preserved",
                    "text": section.suggested_text,
                    "level": existing.heading_level,
                })

        # Procesar sub-secciones
        for sub in section.sub_sections:
            _process_section(sub)

    for section in template.sections:
        _process_section(section)

    save_session_state(doc, STORAGE_DIR)

    return {
        "status": "ok",
        "session_id": req.session_id,
        "template_applied": req.template_name,
        "sections_created": sections_created,
        "changes_made": changes_made,
    }


# ── COVER DESIGNER ENDPOINTS ─────────────────────────────────────────────────

@app.get("/api/cover-templates")
async def list_cover_templates_endpoint() -> dict:
    """
    Lista todas las plantillas de portada disponibles (integradas + del usuario).
    """
    from modules.cover_designer import list_cover_templates
    templates = list_cover_templates(STORAGE_DIR)
    return {
        "templates": [
            {
                "name": t.name,
                "description": t.description,
                "source_type": t.source_type,
                "source_path": t.source_path if not t.is_builtin else "",
                "preview_path": t.preview_path if not t.is_builtin else "",
                "is_builtin": t.is_builtin,
                "created_at": t.created_at,
            }
            for t in templates
        ]
    }


class UploadCoverImageRequest(BaseModel):
    name: str
    description: str = ""


@app.post("/api/cover-templates/upload-image")
async def upload_cover_image_endpoint(
    file: UploadFile = File(...),
    name: str = Form("Mi Portada"),
    description: str = Form(""),
) -> dict:
    """
    Sube una imagen como portada y la guarda como plantilla reutilizable.
    """
    from modules.cover_designer import create_cover_from_image

    if not file.filename:
        raise HTTPException(status_code=400, detail="Archivo no valido.")

    allowed_image_exts = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tif", ".tiff"}
    original_ext = Path(file.filename).suffix.lower()
    if original_ext not in allowed_image_exts:
        raise HTTPException(status_code=400, detail="Formato de imagen no admitido.")

    # Guardar imagen temporalmente
    temp_dir = STORAGE_DIR / "temp_covers"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_path = temp_dir / f"{uuid.uuid4().hex}{original_ext}"
    content = await file.read()

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="El archivo esta vacio.")
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="La imagen excede el limite de 20 MB.")

    temp_path.write_bytes(content)

    try:
        template = create_cover_from_image(
            temp_path, name, description, STORAGE_DIR
        )
        return {
            "status": "ok",
            "template": {
                "name": template.name,
                "description": template.description,
                "source_type": template.source_type,
                "source_path": template.source_path,
                "preview_path": template.preview_path,
                "is_builtin": template.is_builtin,
            },
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error creando plantilla de portada: {str(e)}",
        )
    finally:
        # Limpiar archivo temporal
        if temp_path.exists():
            temp_path.unlink()


@app.post("/api/cover-templates/upload-docx")
async def upload_cover_docx_endpoint(
    file: UploadFile = File(...),
    name: str = Form("Mi Portada Word"),
    description: str = Form(""),
) -> dict:
    """
    Sube un documento Word como portada y lo guarda como plantilla reutilizable.
    Si logra detectar campos de portada, los devuelve para dejar la plantilla
    editable sin tocar la versión original del documento del usuario.
    """
    from modules.cover_designer import create_cover_from_docx, detect_cover_fields_from_docx

    if not file.filename or not file.filename.lower().endswith(".docx"):
        raise HTTPException(
            status_code=400,
            detail="Solo se admiten archivos .docx.",
        )

    temp_dir = STORAGE_DIR / "temp_covers"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_path = temp_dir / f"{uuid.uuid4().hex}.docx"
    content = await file.read()

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="El archivo esta vacio.")
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="La portada DOCX excede el limite de 50 MB.")
    if content[:4] != b"PK\x03\x04":
        raise HTTPException(status_code=400, detail="El archivo no es un DOCX valido.")

    temp_path.write_bytes(content)

    try:
        template = create_cover_from_docx(
            temp_path, name, description, STORAGE_DIR
        )
        detection = detect_cover_fields_from_docx(temp_path)
        return {
            "status": "ok",
            "detected": detection.get("detected", False),
            "fields": detection.get("fields", {}),
            "template": {
                "name": template.name,
                "description": template.description,
                "source_type": template.source_type,
                "source_path": template.source_path,
                "preview_path": template.preview_path,
                "is_builtin": template.is_builtin,
            },
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error creando plantilla de portada: {str(e)}",
        )
    finally:
        if temp_path.exists():
            temp_path.unlink()


@app.delete("/api/cover-templates/{name:path}")
async def delete_cover_template_endpoint(name: str) -> dict:
    """
    Elimina una plantilla de portada creada por el usuario.
    Las plantillas integradas no se pueden eliminar.
    """
    from modules.cover_designer import delete_cover_template

    success = delete_cover_template(name, STORAGE_DIR)
    if not success:
        raise HTTPException(
            status_code=404,
            detail="Plantilla no encontrada o no se pudo eliminar. Las plantillas integradas no se pueden eliminar.",
        )
    return {"status": "ok", "message": f"Plantilla '{name}' eliminada correctamente."}


class ApplyCoverRequest(BaseModel):
    session_id: str
    cover_template_name: str
    title: str = ""
    author: str = ""
    institution: str = ""
    course: str = ""
    instructor: str = ""
    date: str = ""


@app.post("/api/apply-cover")
async def apply_cover_endpoint(req: ApplyCoverRequest) -> dict:
    """
    Aplica una plantilla de portada al documento generado.
    La portada se antepone al inicio del documento sin ser modificada por APA 7.
    """
    from modules.cover_designer import CoverTemplate, list_cover_templates

    doc: Optional[DocumentModel] = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesion no encontrada.")

    # Snapshot antes de modificar portada
    from persistence.session_manager import save_session_snapshot
    save_session_snapshot(doc, STORAGE_DIR)

    # Buscar la plantilla por nombre
    templates = list_cover_templates(STORAGE_DIR)
    template: Optional[CoverTemplate] = None
    for t in templates:
        if t.name == req.cover_template_name:
            template = t
            break

    if not template:
        raise HTTPException(
            status_code=404,
            detail=f"Plantilla '{req.cover_template_name}' no encontrada.",
        )

    # Guardar la seleccion de portada en la sesion para que generator.py la use
    doc.portada = doc.portada or {}
    if isinstance(doc.portada, dict):
        doc.portada["cover_template_id"] = req.cover_template_name
        doc.portada["use_original_cover"] = False
        doc.portada["force_skip_cover"] = True
    save_session_state(doc, STORAGE_DIR)

    # Reload to return updated doc state
    updated_doc = load_session_state(req.session_id, STORAGE_DIR)

    response: dict = {
        "status": "ok",
        "message": f"Portada '{req.cover_template_name}' aplicada correctamente.",
        "cover_template_name": req.cover_template_name,
    }

    if updated_doc:
        response["document"] = updated_doc.model_dump()

    return response


class ServeCoverPreviewRequest(BaseModel):
    name: str


@app.get("/api/cover-templates/preview/{name:path}")
async def serve_cover_preview(name: str) -> FileResponse:
    """
    Sirve la imagen de preview de una plantilla de portada.
    """
    from modules.cover_designer import list_cover_templates

    templates = list_cover_templates(STORAGE_DIR)
    for t in templates:
        if t.name == name and t.preview_path:
            preview_file = Path(t.preview_path)
            if preview_file.exists():
                return FileResponse(preview_file, media_type="image/png")

    # Fallback: retornar placeholder
    raise HTTPException(status_code=404, detail="Preview no disponible para esta plantilla.")


# ── BUILD HASH CACHE ─────────────────────────────────────────────────────────

_build_hash_cache: str | None = None
_build_hash_cache_time: float = 0.0


def _read_build_hash() -> str:
    """Lee build_hash de dist/version.json con caché de 60 segundos."""
    global _build_hash_cache, _build_hash_cache_time
    import time
    now = time.time()
    if _build_hash_cache and (now - _build_hash_cache_time) < 60:
        return _build_hash_cache

    version_file = None
    for cand in [
        DIST_DIR / "version.json",
        Path(__file__).resolve().parent / "version.json",
        BASE_DIR / "dist" / "version.json",
        Path(__file__).resolve().parent.parent / "dist" / "version.json",
    ]:
        if cand.exists():
            version_file = cand
            break

    try:
        if version_file and version_file.exists():
            with open(version_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            _build_hash_cache = data.get("build_hash", "unknown")
            _build_hash_cache_time = now
            return _build_hash_cache
    except Exception:
        pass
    _build_hash_cache = "unknown"
    _build_hash_cache_time = now
    return _build_hash_cache


# ── DEBUG LOGGING Y TRACING ───────────────────────────────────────────────────
import datetime


class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_record = {
            "ts": datetime.datetime.fromtimestamp(record.created).astimezone().isoformat(),
            "level": record.levelname.lower(),
            "module": record.name,
            "msg": record.getMessage()
        }
        if record.exc_info:
            log_record["msg"] += f" | Exception: {self.formatException(record.exc_info)}"
        return json.dumps(log_record)

# Determine the log file path based on APP_USERDATA env var or default STORAGE_DIR
user_data_dir = os.environ.get('APP_USERDATA', str(STORAGE_DIR))
log_file_path = os.path.join(user_data_dir, 'python-backend.log')

# Log rotativo (máx. 5 MB por archivo, 3 copias): el log NO debe crecer sin límite.
from logging.handlers import RotatingFileHandler

file_handler = RotatingFileHandler(
    log_file_path, maxBytes=5 * 1024 * 1024, backupCount=3, encoding='utf-8'
)
file_handler.setFormatter(JsonFormatter())

stream_handler = logging.StreamHandler()
stream_handler.setFormatter(JsonFormatter())

logging.basicConfig(
    level=logging.DEBUG,
    handlers=[file_handler, stream_handler]
)

logger = logging.getLogger('wordapa7')


@app.middleware("http")
async def debug_logging_middleware(request: Request, call_next):
    """Log ALL requests and responses for debugging (pre-production)."""
    request_id = uuid.uuid4().hex[:8]
    start = time.time()

    logger.info(f"[REQ {request_id}] {request.method} {request.url.path}")

    response = await call_next(request)

    duration_ms = (time.time() - start) * 1000
    logger.info(
        f"[RES {request_id}] {response.status_code} | "
        f"Duration: {duration_ms:.1f}ms"
    )

    response.headers["X-Request-ID"] = request_id
    return response





# ── SERVIR FRONTEND ESTATICO ──────────────────────────────────────────────────

# Umbral ÚNICO de alerta de IA (0–100), espejo de `UMBRAL_IA` en src/lib/aiPerfil.ts.
AI_UMBRAL = 50


@app.post("/api/ai-review/{session_id}")
async def ai_review_endpoint(session_id: str, request: Request) -> dict:
    """
    Revisor unificado: por cada párrafo devuelve
      - índice de IA (% 0-100), categoría (LOW/MEDIUM/HIGH) y hallazgos
        con la frase exacta que lo disparó + el motivo.
      - errores ortográficos mapeados al párrafo (con sugerencias) usando
        Word COM (Windows) vía el validador existente.

    Es la etapa opcional "Revisor IA + Ortografía" (Fase F).
    """
    import re as _re

    from classification.ai_detector import analyze_ai_risk, analyze_table_cells
    from modules.spelling_validator import validate_spelling_and_grammar

    doc_model = load_session_state(session_id, STORAGE_DIR)
    if not doc_model:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")

    text_types = {
        ElementType.HEADING, ElementType.PARAGRAPH, ElementType.BULLET,
        ElementType.NUMBERED_LIST, ElementType.BLOCK_QUOTE, ElementType.EQUATION,
    }

    paragraphs: list[dict] = []
    flagged = 0
    score_sum = 0
    score_n = 0

    from modules.phase_scope import build_phase_map
    phase_by_id, _ = build_phase_map(doc_model.elements)

    # 1) Análisis de IA por párrafo
    for idx, e in enumerate(doc_model.elements):
        if e.type not in text_types:
            continue
        text = (e.text or e.original_text or "").strip()
        if not text or len(text) < 15:
            continue
        # Las referencias bibliográficas no son prosa y no deben evaluarse con el detector de IA
        if phase_by_id.get(str(e.id)) == "referencias":
            continue
        risk = analyze_ai_risk(text)
        ai_score = int(round(risk.get("score", 0.0) * 100))
        category = risk.get("category", "LOW")
        findings = []
        for f in risk.get("findings", []):
            pattern = f.get("pattern", "")
            detail = f.get("detail", "")
            # Localizar la frase exacta en el texto (búsqueda insensible)
            phrase = f.get("phrase", "") or ""
            # Lista de frases para resaltado inline (sentence_structure ahora la provee)
            phrases = f.get("phrases") or []
            # Limpiar artefactos: nunca mostrar corchetes regex ni backslashes
            phrase = _re.sub(r'[\[\]\\]', '', phrase).strip()
            phrases = [_re.sub(r'[\[\]\\]', '', p).strip() for p in phrases if p and p.strip()]
            if not phrase:
                if pattern == "phrase":
                    # Extraer la primera palabra clave del detail entre comillas
                    m = _re.search(r"'([^']+)'", detail)
                    phrase = m.group(1) if m else ""
                    phrase = _re.sub(r'[\[\]\\]', '', phrase).strip()
                elif pattern == "sentence_structure":
                    phrase = phrases[0] if phrases else "(oraciones homogéneas)"
                elif pattern == "semicolon_overuse":
                    phrase = ";"
                elif pattern == "generic_conclusion":
                    phrase = "(cierre genérico)"
            findings.append({
                "phrase": phrase,
                "phrases": phrases,
                "detail": _re.sub(r'[\[\]\\]', '', detail),
                "severity": f.get("severity", "LOW"),
            })
        paragraphs.append({
            "element_id": e.id,
            "index": idx,
            "type": e.type.value if hasattr(e.type, "value") else str(e.type),
            "text": text,
            "ai_score": ai_score,
            "ai_category": category,
            "findings": findings,
            "spelling": [],
        })
        if ai_score >= AI_UMBRAL:
            flagged += 1
        score_sum += ai_score
        score_n += 1

    # 1b) Auditor proactivo: palabras duplicadas, texto pegado, primera
    #     persona, muletillas, ortografia local.  Fusiona hallazgos locales
    #     (sin red ni API key) en los parrafos ya analizados por la IA.
    _unmatched_findings: list[dict] = []
    try:
        from modules.proactive_auditor import audit_elements as _audit_elements
        _pa_findings = _audit_elements(doc_model.elements)
        _para_by_id = {p["element_id"]: p for p in paragraphs}
        _SEV_MAP = {"info": "LOW", "warn": "MEDIUM", "error": "HIGH"}
        for _f in _pa_findings:
            _p = _para_by_id.get(_f.get("element_id"))
            if _p is None:
                # El párrafo ya no existe (editado/borrado durante la sesión):
                # conservar el hallazgo en vez de perderlo silenciosamente.
                _unmatched_findings.append({
                    "element_id": _f.get("element_id"),
                    "phrase": _f.get("excerpt", ""),
                    "phrases": [],
                    "detail": _f.get("message", ""),
                    "severity": _SEV_MAP.get(_f.get("severity", "info"), "LOW"),
                })
                continue
            _p["findings"].append({
                "phrase": _f.get("excerpt", ""),
                "phrases": [],
                "detail": _f.get("message", ""),
                "severity": _SEV_MAP.get(_f.get("severity", "info"), "LOW"),
            })
    except Exception as _ex:
        logger.warning(f"Error fusionando hallazgos del auditor proactivo: {_ex}")

    # 2) Ortografía sobre el .docx original (Word COM)
    spelling_status = "not_run"
    spelling_count = 0
    try:
        session_dir = STORAGE_DIR / "sessions" / session_id
        docx_path = session_dir / "original.docx"
        if docx_path.exists():
            spell = await validate_spelling_and_grammar(str(docx_path))
            spelling_status = spell.get("status", "error")
            if spelling_status == "ok":
                raw_errors = spell.get("spelling_errors", [])
                spelling_count = len(raw_errors)
                # Mapear cada error al párrafo que contiene la palabra
                for err in raw_errors:
                    w = (err.get("word") or "").strip()
                    if not w:
                        continue
                    sugs = err.get("suggestions", [])
                    pattern_w = r"\b" + _re.escape(w.lower()) + r"\b"
                    for p in paragraphs:
                        if _re.search(pattern_w, p["text"].lower()):
                            p["spelling"].append({"word": w, "suggestions": sugs})
        else:
            spelling_status = "no_original"
    except Exception:
        spelling_status = "error"

    ai_avg = round(score_sum / score_n, 1) if score_n > 0 else 0.0

    # 3) Señales a nivel documento: celdas de tabla + metadatos forenses
    table_signals: list[dict] = []
    try:
        for e in doc_model.elements:
            if e.table_info and (e.table_info.headers or e.table_info.rows):
                t_score, t_findings = analyze_table_cells(e.table_info.headers, e.table_info.rows)
                for tf in t_findings:
                    table_signals.append({
                        "element_id": e.id,
                        "type": "table",
                        "pattern": tf.get("pattern", ""),
                        "detail": tf.get("detail", ""),
                        "severity": tf.get("severity", "LOW"),
                        "count": tf.get("count", 0),
                        "phrase": tf.get("phrase", ""),
                    })
    except Exception as ex:
        logger.warning(f"Error analizando tablas en ai-review: {ex}")

    doc_signals: list[str] = []
    try:
        from classification.ai_detector import _metadata_document_signals
        meta_boost, meta_sigs = _metadata_document_signals(
            doc_model.meta.forensic_metadata if doc_model.meta else None
        )
        doc_signals = meta_sigs
    except Exception:
        pass

    return {
        "session_id": session_id,
        "total_paragraphs": len(paragraphs),
        "ai_avg_score": ai_avg,
        "flagged_count": flagged,
        "spelling_count": spelling_count,
        "spelling_status": spelling_status,
        "paragraphs": paragraphs,
        "unmatched_findings": _unmatched_findings,
        "table_signals": table_signals,
        "document_signals": doc_signals,
    }


# ── MONTAJE DEL FRONTEND (SPA) ───────────────────────────────────────────────

@app.middleware("http")
async def add_no_cache_headers(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path

    # X-Build-Hash en todas las respuestas para debug
    build_hash = _read_build_hash()
    response.headers["X-Build-Hash"] = build_hash

    # Estrategia de caché por tipo de archivo
    if path == "/" or path.endswith("/index.html") or path.endswith("version.json"):
        # HTML raíz y manifest NUNCA se cachean
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    elif path.startswith("/assets/"):
        # Assets con hash de Vite (inmutables por build) → 24h
        if any(ext in path for ext in (".js", ".css", ".woff", ".woff2", ".ttf")):
            response.headers["Cache-Control"] = "public, max-age=86400, immutable"
        else:
            response.headers["Cache-Control"] = "public, max-age=3600, must-revalidate"
    elif any(path.endswith(ext) for ext in (".js", ".css", ".json", ".svg", ".png", ".jpg", ".ico", ".woff2")):
        # Otros archivos estáticos
        response.headers["Cache-Control"] = "public, max-age=3600, must-revalidate"

    return response


@app.get("/api/version")
async def get_version():
    """Retorna la versión y build_hash actual para que el frontend detecte cambios y readiness."""
    build_hash = _read_build_hash()
    version_file = None
    for cand in [
        DIST_DIR / "version.json",
        Path(__file__).resolve().parent / "version.json",
        BASE_DIR / "dist" / "version.json",
        Path(__file__).resolve().parent.parent / "dist" / "version.json",
    ]:
        if cand.exists():
            version_file = cand
            break

    build_time = None
    app_version = APP_VERSION
    if version_file and version_file.exists():
        try:
            with open(version_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            build_time = data.get("build_time")
            app_version = data.get("version", app_version)
        except Exception:
            pass

    return {
        "version": app_version,
        "mode": "main",
        "status": "ok",
        "build_hash": build_hash,
        "build_time": build_time,
        "stale": build_hash == "unknown",
    }


# ── Contrato add-in: rutas que core_server también expone (TIER_BOTH) ────────
# Estas vivían SOLO en core_server y el add-in recibía 404 cuando lo servía
# la app completa (clase de bug detectada por test_addin_contract_parity).

_BOOT_TS = time.time()


class AddinScoreReq(BaseModel):
    texts: List[str] = []
    tables: int = 0
    figures: int = 0
    visual: Optional[dict] = None


@app.post("/api/addin/apa-score")
async def addin_apa_score(req: AddinScoreReq) -> dict:
    """Score 'qué tan APA está' — misma implementación que core_server."""
    from modules.apa_score import compute
    return compute(req.texts, req.tables, req.figures, req.visual)


class OpenInWordReq(BaseModel):
    path: str


@app.post("/api/open-in-word")
async def open_in_word_endpoint(req: OpenInWordReq) -> dict:
    """Rescate: abre un .docx del almacenamiento con su app predeterminada (Word).

    Guard idéntico al core_server (config.validate_open_in_word_path): solo
    se permiten .docx dentro de STORAGE_DIR del proceso."""
    from config import validate_open_in_word_path
    try:
        target = validate_open_in_word_path(req.path)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    if not target.exists():
        raise HTTPException(400, "Archivo no encontrado")
    os.startfile(str(target))
    return {"ok": True}


class ConnectWordReq(BaseModel):
    path: str


@app.post("/api/connect-word")
async def connect_word_endpoint(req: ConnectWordReq) -> dict:
    """Trae a primer plano el Word DEL USUARIO con su `.docx` abierto.

    El panel del complemento NO se puede abrir desde afuera: Office.js lo abre
    con un gesto dentro de Word o con `setStartupBehavior(load)`. Lo unico que
    esta app puede hacer es abrir el archivo donde el panel vive, y eso es todo
    lo que hace este endpoint. `os.startfile` es deliberado y no COM: abre el
    documento en el Word que la persona YA tiene abierto, en vez de crear la
    instancia invisible propia de `word_com_service`.

    La respuesta NO declara estado de conexion a proposito. Que un archivo se
    haya abierto no prueba que el add-in este vivo: eso lo prueba su latido
    (`/api/addin/sideload-status-v2.active_in_word`). Devolver un
    `connected: true` aca dejaria al chip pintandose conectado sin haberlo
    comprobado, que es la mentira que este producto no se permite.

    El guard es el mismo criterio que el write-back (`/api/send-to-word`):
    extension `.docx` y archivo real en disco. Se agrega `is_file()` porque un
    directorio llamado `carpeta.docx` pasa el filtro de extension y no es un
    documento que se pueda abrir.
    """
    raw = (req.path or "").strip()
    if not raw:
        raise HTTPException(400, "Falta la ruta del documento a abrir en Word")

    dest = Path(raw)
    if dest.suffix.lower() != ".docx":
        raise HTTPException(400, "Solo se puede conectar con un archivo .docx")
    if not dest.is_file():
        raise HTTPException(400, f"Archivo no encontrado: {dest}")

    opener = getattr(os, "startfile", None)
    if opener is None:
        raise HTTPException(500, "Abrir en Word solo esta disponible en Windows")
    try:
        opener(str(dest))
    except OSError as exc:
        logger.warning("connect_word: no se pudo abrir '%s': %s", dest, exc)
        raise HTTPException(500, "No se pudo abrir el documento en Word") from exc

    logger.info("connect_word: '%s' enviado al Word del usuario", dest)
    return {"ok": True}


class SendToWordReq(BaseModel):
    nombre: Optional[str] = None
    """Nombre del archivo original, SOLO para nombrar y mostrar la copia.

    No decide rutas de escritura: la copia de trabajo vive dentro de
    `STORAGE_DIR`. El frontend manda su ruta, pero el backend la trata como
    texto, no como destino.
    """
    forzar: bool = False
    """Descartar lo que la persona tiene SIN GUARDAR en Word."""
    guardar: bool = False
    """Guardar en Word lo que está sin guardar, en vez de descartarlo."""


def _carpeta_de_trabajo(session_id: str) -> Path:
    """Carpeta app-owned donde vive la copia que Word abre.

    No es la carpeta del usuario: la app puede escribir y pisar acá todo lo que
    quiera sin tocar su trabajo. `mkdir` es idempotente.
    """
    carpeta = STORAGE_DIR / "sessions" / session_id / "word"
    carpeta.mkdir(parents=True, exist_ok=True)
    return carpeta


def _nombre_de_copia(nombre: Optional[str]) -> str:
    """`C:/tesis/Tesis final.docx` → `Tesis final_APA7.docx`.

    Solo el stem, y se limpia todo lo que no sea palabra, guion o espacio: sin
    esto un `nombre` con `..` o `/` escribiría fuera de la carpeta de trabajo.
    """
    base = Path(nombre).stem if nombre else "documento"
    base = re.sub(r"[^\w\- ]+", "_", base, flags=re.UNICODE).strip() or "documento"
    return f"{base}_APA7.docx"


def _documento_abierto_en_word(app, dest: Path):
    """El `Document` de Word que corresponde a `dest`, o `None`.

    `None` y "está abierto pero no se pudo leer" se distinguen: en el primer
    caso hay que preguntar por lo que tiene sin guardar, y en el segundo no se
    puede preguntar, así que se sigue como si no estuviera abierto.
    """
    dest_str = str(dest).lower()
    try:
        for i in range(1, app.Documents.Count + 1):
            try:
                d = app.Documents(i)
            except Exception:
                continue
            if str(getattr(d, "FullName", "")).lower() == dest_str:
                return d
    except Exception as e:
        logger.warning("send_to_word: no se pudo iterar Documents: %s", e)
    return None


def _tiene_cambios_sin_guardar(doc) -> bool:
    """Si el documento de Word tiene cambios que todavía no están en el disco.

    `Saved` es la bandera que Word mantiene. Si el objeto no la expone —un doble
    de prueba, una versión vieja de la interfaz— se asume que está guardado:
    adivinar que hay trabajo sin guardar bloquearía el write-back sin motivo, que
    es el otro extremo del mismo error.
    """
    valor = getattr(doc, "Saved", True)
    if valor is None:
        return False
    return not bool(valor)


@app.post("/api/send-to-word/{session_id}")
async def send_to_word_endpoint(session_id: str, req: SendToWordReq) -> dict:
    """Abre en Word una COPIA de trabajo del APA 7 generado.

    Ya no pisa el `.docx` original del estudiante. Escribe el generado en
    `STORAGE_DIR/sessions/<id>/word/<nombre>_APA7.docx` y abre ESA copia. El
    original no se toca, así que no hay `.bak`: no hay nada que respaldar.

    Con la copia abierta en Word y cambios sin guardar, no se cierra ni se copia:
    devuelve `requiere_confirmacion` y las dos salidas viajan en el body
    (`guardar` / `forzar`).
    """
    output_path = STORAGE_DIR / "sessions" / session_id / "output.docx"
    if not output_path.exists():
        raise HTTPException(404, "Generá primero el documento APA 7")

    dest = _carpeta_de_trabajo(session_id) / _nombre_de_copia(req.nombre)

    word_app = None
    target_doc = None
    try:
        from modules.word_com import word_session  # import lazy: COM nunca toca startup

        with word_session() as app:
            target_doc = _documento_abierto_en_word(app, dest)
            if target_doc is not None and _tiene_cambios_sin_guardar(target_doc):
                if req.guardar:
                    try:
                        target_doc.Save()
                        logger.info("send_to_word: guardado lo que estaba sin guardar en Word")
                    except Exception as e:
                        logger.warning("send_to_word: Save() falló: %s", e)
                elif not req.forzar:
                    return JSONResponse(
                        status_code=409,
                        content={
                            "ok": False,
                            "requiere_confirmacion": True,
                            "message": (
                                "Tenés cambios sin guardar en la copia abierta en Word. "
                                "Guardalos antes de abrirla, o confirmá para descartarlos."
                            ),
                        },
                    )
            word_app = app
    except Exception as e:
        logger.warning("send_to_word: COM no disponible, copia directa: %s", e)

    if target_doc is not None and word_app is not None:
        try:
            target_doc.Close(SaveChanges=0)
            logger.info("send_to_word: cerrada la copia '%s' (COM)", dest)
        except Exception as e:
            logger.warning("send_to_word: Close() falló: %s", e)

        shutil.copy2(str(output_path), str(dest))
        try:
            word_app.Documents.Open(str(dest))
            logger.info("send_to_word: reabierta la copia '%s' (COM)", dest)
        except Exception as e:
            logger.warning("send_to_word: Open() falló: %s", e)

        return {
            "ok": True,
            "method": "com",
            "working_path": str(dest),
            "message": "Copia APA 7 abierta en Word. Tu archivo original no se modificó.",
        }

    shutil.copy2(str(output_path), str(dest))
    logger.info("send_to_word: copia escrita en '%s' (fallback)", dest)
    return {
        "ok": True,
        "method": "copy",
        "working_path": str(dest),
        "message": "Copia APA 7 actualizada. Tu archivo original no se modificó.",
    }


@app.get("/api/addin/build-info")
async def addin_build_info() -> dict:
    """Anti-stale: el taskpane compara su build con este y avisa si difieren."""
    return {
        "mode": "app",
        "version": APP_VERSION,
        "build_hash": _read_build_hash(),
        "started_at": _BOOT_TS,
    }


def _compute_src_content_hash(src_dir: Path) -> str:
    """Hash SHA-256 compuesto del contenido de src/ para detectar cambios reales."""
    if not src_dir.exists():
        return "no-src"
    h = hashlib.sha256()
    for fp in sorted(src_dir.rglob("*")):
        if fp.is_file() and "node_modules" not in fp.parts:
            rel = fp.relative_to(src_dir).as_posix()
            h.update(rel.encode())
            try:
                with open(fp, "rb") as f:
                    while chunk := f.read(65536):
                        h.update(chunk)
            except Exception:
                pass
    return h.hexdigest()[:12]


def check_and_auto_build_frontend() -> None:
    """
    Verifica si el frontend necesita recompilación comparando hash de contenido
    de src/ contra el build_hash guardado en dist/version.json.
    Si dist/ no existe, version.json no existe, o los hashes difieren, hace rebuild.
    """
    src_dir = BASE_DIR / "src"
    dist_index = BASE_DIR / "dist" / "index.html"
    version_file = BASE_DIR / "dist" / "version.json"

    if not src_dir.exists():
        return

    should_build = False
    reason = ""

    if not dist_index.exists():
        should_build = True
        reason = "dist/index.html no existe"
    elif not version_file.exists():
        should_build = True
        reason = "dist/version.json no existe (build manifest)"
    else:
        # Comparar hash de contenido de src/ contra el src_hash guardado por
        # build_manifest.py en el momento del build (mismo algoritmo, mismos archivos).
        src_hash = _compute_src_content_hash(src_dir)
        try:
            with open(version_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            stored_src_hash = data.get("src_hash", "")
        except Exception:
            stored_src_hash = ""

        if stored_src_hash == "":
            should_build = True
            reason = "version.json sin src_hash (manifest de build anterior)"
        elif src_hash != stored_src_hash:
            should_build = True
            reason = f"src_hash={src_hash} != src_hash={stored_src_hash} (cambios detectados en c\u00f3digo fuente)"

    if should_build:
        print(f"[AUTO-BUILD] {reason}. Recompilando con 'npm run build'...")
        try:
            cmd = ["npm.cmd", "run", "build"] if os.name == 'nt' else ["npm", "run", "build"]
            res = subprocess.run(cmd, cwd=str(BASE_DIR), capture_output=True, text=True)
            if res.returncode == 0:
                print("[AUTO-BUILD] [OK] Recompilacion exitosa del frontend!")
                # Invalidar caché de build_hash
                global _build_hash_cache, _build_hash_cache_time
                _build_hash_cache = None
                _build_hash_cache_time = 0.0
            else:
                print(f"[WARN] Error durante npm run build: {res.stderr[:200]}")
        except Exception as e:
            print(f"[WARN] No se pudo ejecutar npm run build automáticamente: {e}")


# Montar archivos estaticos del Word Add-in (Office.js) en /addin/.
# Debe ir ANTES del montaje catch-all del SPA para que las rutas /addin/*
# sean interceptadas correctamente por Starlette.
from routers.addin_static import init_addin_static

init_addin_static(app)

if DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=str(DIST_DIR), html=True), name="static")
else:
    @app.get("/")
    async def serve_index():
        return JSONResponse({
            "message": (
                "Servidor backend de WordAPA7 listo. "
                "Construye la UI con 'npm run build' para servir la interfaz estatica aqui."
            ),
        })


# ── INICIO DEL SERVIDOR ────────────────────────────────────────────────────────

def _setup_ssl_for_addin() -> tuple[Optional[Path], Optional[Path]]:
    """
    Genera certificados SSL auto-firmados para el Word Add-in.

    Office Add-ins requieren HTTPS incluso en localhost. Esta funcion sigue
    una estrategia de respaldo en cascada:

    1. PRIMERO intenta generar los certs con el modulo Python ``ssl_cert_gen``
       (usa la libreria ``cryptography``, incluida en el instalador). NO
       depende de herramientas CLI externas, asi que funciona en cualquier
       maquina sin instalacion adicional.
    2. Si eso falla, recurre a ``mkcert`` (CLI externa) si esta en el PATH
       (instalada por setup.bat o manualmente).
    3. Si ambos fallan, retorna ``(None, None)`` y el backend corre en HTTP
       (Word puede rechazar el Add-in).

    Los certs persisten entre reinicios en ``STORAGE_DIR/ssl/`` (AppData del
    usuario en produccion) y no se regeneran si ya existen y son validos.

    Retorna: (cert_path, key_path) o (None, None).
    """
        # ── SSL es el COMPORTAMIENTO POR DEFECTO en Windows ─────────
    # Office Add-ins REQUIEREN HTTPS incluso en localhost. Sin SSL, Word
    # rechaza el Add-in (panel en blanco o no aparece). El módulo
    # ssl_cert_gen genera certificados auto-firmados y los instala
    # silenciosamente en el Trusted Root store de Windows via CryptoAPI.
    #
    # SSL se DESACTIVA solo si:
    #   1. WORDAPA7_USE_SSL=false (desactivación explícita)
    #   2. WORDAPA7_ADDIN_PUBLIC_URL está seteada (modo producción con URL pública HTTPS)
    public_url = os.environ.get("WORDAPA7_ADDIN_PUBLIC_URL", "").strip()
    ssl_disabled = os.environ.get("WORDAPA7_USE_SSL", "").strip().lower() == "false"

    if ssl_disabled or public_url:
        if public_url:
            print(f"[SSL] Desactivado — Add-in servido desde URL pública: {public_url}")
        else:
            print("[SSL] Desactivado explícitamente (WORDAPA7_USE_SSL=false)")
        return None, None

    import shutil
    import subprocess as _sp

    certs_dir = STORAGE_DIR / "ssl"
    cert_path = certs_dir / "localhost.pem"
    key_path = certs_dir / "localhost-key.pem"

    # ------------------------------------------------------------------
    # 1. Intento: generador Python puro (libreria cryptography).
    #    No requiere herramientas externas; funciona en el instalador
    #    empaquetado con PyInstaller. Maneja idempotencia internamente:
    #    si los certs ya existen y son validos (no expirados, clave
    #    coherente), los reutiliza sin regenerar.
    # ------------------------------------------------------------------
    try:
        from ssl_cert_gen import generate_self_signed_cert
    except Exception as _e:
        print(f"[SSL] No se pudo importar el modulo ssl_cert_gen: {_e}")
        generate_self_signed_cert = None

    if generate_self_signed_cert is not None:
        _cert, _key = generate_self_signed_cert(cert_path, key_path)
        if _cert is not None and _key is not None:
            return _cert, _key
        print("[SSL] El generador Python (cryptography) fallo — intentando mkcert como respaldo...")
    else:
        print("[SSL] ssl_cert_gen no disponible — intentando mkcert como respaldo...")

    # ------------------------------------------------------------------
    # 2. Respaldo: mkcert (CLI externa).
    #    Se conserva para compatibilidad con instalaciones donde mkcert ya
    #    estaba configurado y su CA raiz confia en el sistema.
    # ------------------------------------------------------------------

    # Reutilizar certs existentes si el generador Python no estuvo disponible.
    if cert_path.exists() and key_path.exists():
        print(f"[SSL] Reutilizando certificados Add-in existentes: {cert_path}")
        return cert_path, key_path

    mkcert_bin = shutil.which("mkcert")
    if not mkcert_bin:
        print(
            "[SSL] mkcert tampoco esta disponible — el Add-in correra en HTTP "
            "(Word puede rechazarlo). El generador Python (cryptography) deberia "
            "ser suficiente; revisa los logs de [SSL] arriba."
        )
        return None, None

    # Generar certificados con mkcert
    certs_dir.mkdir(parents=True, exist_ok=True)
    try:
        # Instalar CA local (si no esta ya instalada; mkcert -install es idempotente)
        _sp.run([mkcert_bin, "-install"], check=True, capture_output=True, timeout=30)
        # Generar cert para localhost / 127.0.0.1
        _sp.run(
            [mkcert_bin, "-key-file", str(key_path), "-cert-file", str(cert_path),
             "localhost", "127.0.0.1"],
            check=True,
            cwd=str(certs_dir),
            capture_output=True,
            timeout=30,
        )
        print(f"[SSL] Certificados Add-in generados con mkcert: {cert_path}")
        return cert_path, key_path
    except Exception as e:
        print(f"[SSL] Error al generar certificados con mkcert: {e}")
        return None, None

@app.get("/api/addin/ssl-status")
async def get_addin_ssl_status():
    """
    Informa si el backend esta corriendo con HTTPS (necesario para Word Add-ins).

    El frontend puede consultar este endpoint al iniciar para saber si el
    certificado SSL ya esta disponible. La generacion principal usa el modulo
    Python ``ssl_cert_gen`` (libreria cryptography); mkcert es solo un respaldo.
    """
    import shutil

    certs_dir = STORAGE_DIR / "ssl"
    cert_path = certs_dir / "localhost.pem"
    key_path = certs_dir / "localhost-key.pem"
    mkcert_available = shutil.which("mkcert") is not None

    # El generador Python (cryptography) es el metodo principal.
    try:
        import ssl_cert_gen  # noqa: F401
        python_ssl_available = True
    except Exception:
        python_ssl_available = False

    ssl_active = cert_path.exists() and key_path.exists()

    use_ssl_enabled = os.environ.get("WORDAPA7_USE_SSL", "").strip().lower() != "false" and not os.environ.get("WORDAPA7_ADDIN_PUBLIC_URL", "").strip()
    addin_public_url = os.environ.get("WORDAPA7_ADDIN_PUBLIC_URL", "").strip() or None

    if use_ssl_enabled:
        backend_url = "https://127.0.0.1:8742"
    else:
        backend_url = os.environ.get("WORDAPA7_BACKEND_URL", "").strip() or "http://127.0.0.1:8742"

    return {
        "ssl_active": ssl_active,
        "python_ssl_available": python_ssl_available,
        "mkcert_available": mkcert_available,
        "cert_path": str(cert_path) if cert_path.exists() else None,
        "install_url": "https://github.com/FiloSottile/mkcert#installation",
        "hint": (
            "SSL activo — el Add-in puede cargar en Word sin problemas"
            if ssl_active
            else "El certificado SSL se genera automaticamente con cryptography al iniciar el backend"
        ),
        "mode": "dev_https" if use_ssl_enabled else "production_http",
        "use_ssl_enabled": use_ssl_enabled,
        "backend_url": backend_url,
        "addin_public_url": addin_public_url,
    }


@app.get("/api/addin/config")
async def get_addin_config():
    """
    Devuelve la configuración de conexión del backend para el Add-in.

    En MODO PRODUCCIÓN (por defecto):
      - El Add-in se carga desde una URL HTTPS pública (WORDAPA7_ADDIN_PUBLIC_URL)
      - El backend corre localmente en http://127.0.0.1:8742 (HTTP plano)
      - El frontend del Add-in usa esta URL para las llamadas a la API

    En MODO DESARROLLO HTTPS (WORDAPA7_USE_SSL=true):
      - El backend genera certificados SSL auto-firmados
      - El Add-in se sirve desde el propio backend en HTTPS
    """
    addin_public_url = os.environ.get("WORDAPA7_ADDIN_PUBLIC_URL", "").strip() or None
    use_ssl = os.environ.get("WORDAPA7_USE_SSL", "").strip().lower() != "false" and not addin_public_url

    # Determinar la URL del backend que el frontend debe usar
    if use_ssl:
        backend_url = "https://127.0.0.1:8742"
    else:
        backend_url = os.environ.get("WORDAPA7_BACKEND_URL", "").strip() or "http://127.0.0.1:8742"

    return {
        "mode": "dev_https" if use_ssl else "production_http",
        "use_ssl": use_ssl,
        "backend_url": backend_url,
        "addin_public_url": addin_public_url,
        "port": 8742,
        "hint": (
            "Add-in cargado desde URL HTTPS pública → backend local HTTP"
            if not use_ssl and addin_public_url
            else "Modo desarrollo HTTPS local" if use_ssl
            else "Backend en HTTP plano — configura WORDAPA7_ADDIN_PUBLIC_URL para producción"
        ),
    }


def _backend_already_running(port: int) -> bool:
    """Detecta si ya hay una instancia del backend respondiendo en 127.0.0.1:<port>.

    Prueba HTTPS primero (aceptando el certificado auto-firmado) y luego HTTP.
    Si /api/version responde 200, otra instancia vive (arrancada por el watcher,
    la app Electron o manualmente) y esta NO debe arrancar: pelear por el bind
    produce [Errno 10048], crash-loop del watchdog y churn de servicios
    (Word COM / LibreOffice) que desestabiliza todo el sistema.
    """
    import http.client

    try:
        import ssl as _ssl
        ctx = _ssl._create_unverified_context()
    except Exception:
        ctx = None

    for use_tls in (True, False):
        try:
            if use_tls and ctx is not None:
                conn = http.client.HTTPSConnection("127.0.0.1", port, context=ctx, timeout=2)
            else:
                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
            conn.request("GET", "/api/version")
            resp = conn.getresponse()
            ok = resp.status == 200
            resp.read()
            conn.close()
            if ok:
                return True
        except Exception:
            continue
    return False




def _port_in_use(port: int) -> bool:
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sk:
        sk.settimeout(0.4)
        return sk.connect_ex(("127.0.0.1", port)) == 0


if __name__ == "__main__":
    import argparse

    # En builds empaquetados (PyInstaller, console=False) los streams pueden ser
    # None y uvicorn crashea al configurar logging (sys.stderr.isatty()).
    import os

    import uvicorn
    if sys.stdout is None or sys.stderr is None:
        devnull = open(os.devnull, "w")
        if sys.stdout is None:
            sys.stdout = devnull
        if sys.stderr is None:
            sys.stderr = devnull

    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8742, help='Port to run the server on')
    parser.add_argument('--watcher', action='store_true',
                        help='Run as lightweight Word watcher (starts backend when Word opens, stops when closed)')
    args, unknown = parser.parse_known_args()

    # Modo Watcher: proceso ligero que detecta Word y arranca el backend.
    # Si se pasa --watcher, NO arrancamos uvicorn. En su lugar, ejecutamos
    # el bucle del watcher (word_watcher.py) que monitorea si Word esta
    # abierto y arranca/detiene el backend segun sea necesario.
    # Esto permite que el mismo ejecutable (python-backend.exe en produccion)
    # funcione tanto como servidor como como watcher.
    if args.watcher:
        from word_watcher import run_watcher
        run_watcher()
        sys.exit(0)

    # 0. Single-instance: si ya hay un backend sano en este puerto, salir
    # limpio en vez de pelear por el bind (evita [Errno 10048] + crash-loop).
    if _backend_already_running(args.port):
        print(f"[BACKEND] Instancia ya activa en el puerto {args.port} — saliendo (single-instance).")
        sys.exit(0)

    # 1. Verificar y recompilar frontend si hubo cambios en src/
    check_and_auto_build_frontend()

    # 2. Crear o verificar la plantilla inicial (una sola ruta de generacion)
    try:
        template_path: Path = ensure_apa7_template(get_apa7_template_path())
        print(f"[INFO] Plantilla APA 7 verificada en: {template_path}")
    except Exception as e:
        print(f"[WARN] No se pudo crear la plantilla APA 7: {e}")

    # 3. Configurar SSL para el Word Add-in (requiere mkcert instalado)
    ssl_certfile, ssl_keyfile = _setup_ssl_for_addin()

    print("=" * 60)
    protocol = "https" if ssl_certfile else "http"
    print(f" WordAPA7 — Servidor iniciado en {protocol}://localhost:{args.port}")
    if ssl_certfile:
        print(" Modo: DESARROLLO HTTPS (SSL activo)")
        print(" Add-in HTTPS: ACTIVO — sirve el panel en HTTPS local")
    else:
        addin_pub = os.environ.get("WORDAPA7_ADDIN_PUBLIC_URL", "").strip()
        if addin_pub:
            print(f" Modo: PRODUCCION (Add-in desde {addin_pub})")
            print(f" Backend API: http://127.0.0.1:{args.port} (HTTP plano)")
            print(" El Add-in se carga desde la URL publica y llama a este backend local.")
        else:
            print(" Modo: LOCAL HTTPS (SSL automatico)")
            print(f" Backend API: https://127.0.0.1:{args.port}")
            print(" Add-in: se sirve desde el backend en HTTPS. Word deberia cargarlo sin problemas.")
            print(" El complemento se registra automaticamente en Word al iniciar.")
    print(" Presiona Ctrl+C para detener")
    print("=" * 60)

    if ssl_certfile and ssl_keyfile:
        uvicorn.run(
            app,
            host="127.0.0.1",
            port=args.port,
            ssl_certfile=str(ssl_certfile),
            ssl_keyfile=str(ssl_keyfile),
        )
    else:
        uvicorn.run(app, host="127.0.0.1", port=args.port)
