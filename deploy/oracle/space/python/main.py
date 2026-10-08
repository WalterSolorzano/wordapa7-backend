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
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# Restaurar claves de IA guardadas por el usuario (sobreviven a reinicios del backend)
try:
    from persistence.ai_keys import load_provider_keys_into_env
    _restored = load_provider_keys_into_env()
    if _restored:
        print(f"[AI] {_restored} claves de IA restauradas desde almacenamiento persistente")
except Exception as _e:
    print(f"[WARN] No se pudieron restaurar claves persistidas de IA: {_e}")

# Fallback: claves de IA embebidas (ofuscadas) que viajan en el instalador,
# para que funcione sin que el usuario configure nada. Prioridad menor a las
# anteriores (solo se usan las que ya no esten definidas en os.environ).
try:
    from embedded_secrets import load_embedded_into_env
    _emb = load_embedded_into_env()
    if _emb:
        print(f"[AI] {_emb} claves de IA cargadas desde paquete embebido (ofuscadas)")
except Exception as _e2:
    print(f"[WARN] No se pudieron cargar las claves embebidas de IA: {_e2}")

from fastapi import (
    BackgroundTasks,
    FastAPI,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Asegurar path de importacion
sys.path.insert(0, str(Path(__file__).resolve().parent))

from classification.llm_classifier import classify_document_with_llm, get_classify_progress

# ── CONFIGURACION Y RUTAS DE ALMACENAMIENTO ──────────────────────────────────
from config import BASE_DIR, DIST_DIR, STORAGE_DIR, get_apa7_template_path
from create_template import create_apa7_template
from generation.generator import generate_apa7_docx
from generation.layered_generator import generate_apa7_from_scratch
from generation.templates import (
    TEMPLATE_ENSAYO,
    TEMPLATE_INFORME,
    TEMPLATE_TESINA,
    DocumentTemplate,
)
from generation.track_changes_engine import create_tracked_changes_docx
from models import (
    APAFormat,
    APARuleSet,
    DocumentModel,
    ElementModel,
    ElementType,
    HealthResponse,
    PortadaData,
    ReferenciaModel,
    WorkMode,
)
from modules.apa_validator import validate_apa_integrity, validate_citations_with_llm
from modules.referencias_module import resolve_doi
from parsing.docx_parser import parse_docx_bytes
from persistence.idempotency import check_idempotency, init_sqlite_db
from persistence.session_manager import (
    delete_session,
    list_recent_sessions,
    load_session_state,
    maybe_run_gc,
    save_session_state,
)
from profiles import get_profile, list_profiles

STORAGE_DIR.mkdir(exist_ok=True)


from contextlib import asynccontextmanager

from services.word_com_service import get_word_com_service


@asynccontextmanager
async def lifespan_app(app: FastAPI):
    print("[INFO] Arrancando LibreOffice service...")
    get_libreoffice_service().start()
    print("[INFO] Arrancando Word COM service...")
    get_word_com_service().start()
    # Limpieza inicial de sesiones expiradas al arrancar el servidor (P1.4).
    # maybe_run_gc está acelerado (GC_INTERVAL_SECONDS) y es seguro llamarlo aquí.
    try:
        maybe_run_gc(STORAGE_DIR)
    except Exception as e:
        print(f"[WARN] GC inicial de sesiones falló: {e}")
    yield
    print("[INFO] Deteniendo LibreOffice service...")
    get_libreoffice_service().stop()
    print("[INFO] Deteniendo Word COM service...")
    get_word_com_service().stop()

app = FastAPI(title="WordAPA7 API", version="1.0.0", lifespan=lifespan_app)

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
    "app://-",
]


def _session_rules(doc: DocumentModel, req_rules: Optional[APARuleSet] = None) -> APARuleSet:
    """Reglas de formato: las del request (perfil elegido en el cliente) o, si
    no vienen, las persistidas en la sesión (perfil del documento)."""
    if req_rules is not None:
        return req_rules
    return doc.apa_rules if doc.apa_rules else APARuleSet()
_env_origins = os.environ.get("WORDAPA7_ALLOWED_ORIGINS", "").strip()
_allowed_origins = (
    [o.strip() for o in _env_origins.split(",") if o.strip()]
    if _env_origins
    else _DEFAULT_ALLOWED_ORIGINS
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

from security.auth import APIKeyAuthMiddleware

app.add_middleware(APIKeyAuthMiddleware)

from routers import admin

app.include_router(admin.router)

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


# Global dict to store progress for WebSockets
_parse_progress = {}

@app.websocket("/ws/parse-progress/{session_id}")
async def parse_progress_ws(websocket: WebSocket, session_id: str):
    await websocket.accept()
    try:
        while True:
            progress = _parse_progress.get(session_id)
            if progress:
                await websocket.send_json(progress)
                if progress.get("status") == "complete":
                    break
            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        pass


# Fase 8: Multi-player Collaboration Relay
class CollabManager:
    def __init__(self):
        # session_id -> list of connected websockets
        from typing import Dict, List
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = []
        self.active_connections[session_id].append(websocket)

    def disconnect(self, websocket: WebSocket, session_id: str):
        if session_id in self.active_connections:
            if websocket in self.active_connections[session_id]:
                self.active_connections[session_id].remove(websocket)
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]

    async def broadcast_update(self, session_id: str, message: dict, sender: WebSocket = None):
        if session_id in self.active_connections:
            for connection in self.active_connections[session_id]:
                if connection != sender:
                    try:
                        await connection.send_json(message)
                    except Exception:
                        pass

collab_manager = CollabManager()

@app.websocket("/ws/collab/{session_id}")
async def collab_ws(websocket: WebSocket, session_id: str):
    await collab_manager.connect(websocket, session_id)
    try:
        while True:
            data = await websocket.receive_json()
            # The client sends an action (e.g. UPDATE_ELEMENT)
            # We broadcast it to other clients
            await collab_manager.broadcast_update(session_id, data, sender=websocket)
    except WebSocketDisconnect:
        collab_manager.disconnect(websocket, session_id)
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


def run_background_analysis(session_id: str, storage_dir: Path):
    """Ejecuta la deteccion de IA y el layout COM en background y actualiza la sesion."""
    try:
        from parsing.page_layout_provider import get_page_layout_provider
        from persistence.session_manager import load_session_state, save_session_state

        doc = load_session_state(session_id, storage_dir)
        if not doc: return

        modified = False

        # 1. Paginacion COM
        session_docx_path = storage_dir / "sessions" / session_id / "original.docx"
        try:
            provider = get_page_layout_provider()
            layout_result = provider.paginate(session_docx_path, timeout_seconds=30)
            if layout_result and layout_result.paragraph_pages:
                for i, elem in enumerate(doc.elements):
                    if i < len(layout_result.paragraph_pages):
                        elem.page_number = layout_result.paragraph_pages[i]

                doc.meta.page_count = layout_result.total_pages
                doc.meta.page_layout_provider = layout_result.provider_used
                doc.meta.page_layout_confidence = layout_result.confidence
                modified = True
                print(f"[INFO] Background COM Layout finished for {session_id}")
        except Exception as e:
            print(f"[WARN] Background Page layout provider fallo: {e}")

        # 2. Deteccion IA (pipeline unificado: párrafos + metadatos + tablas)
        from classification.ai_detector import analyze_document_ai, analyze_table_cells

        paras = []
        para_indices = []
        para_shadings = []
        para_web_shadings = []
        for idx, elem in enumerate(doc.elements):
            if elem.text and len(elem.text.strip()) >= 15:
                paras.append(elem.text)
                para_indices.append(idx)
                para_shadings.append(elem.has_shading_residue)
                para_web_shadings.append(elem.has_web_shading_residue)

        if paras:
            try:
                from parsing.pre_classifier import (
                    REGEX_CITATION_NARRATIVA,
                    REGEX_CITATION_PARENTETICA,
                )
                forensic_meta = doc.meta.forensic_metadata if doc.meta else None
                if forensic_meta is None:
                    forensic_meta = {}
                body_text = " ".join(paras)
                in_text = len(REGEX_CITATION_NARRATIVA.findall(body_text)) + \
                          len(REGEX_CITATION_PARENTETICA.findall(body_text))
                refs_count = len(doc.referencias) if doc.referencias else 0
                forensic_meta["in_text_citations"] = in_text
                forensic_meta["references_count"] = refs_count

                ai_results = analyze_document_ai(
                    paras, forensic_meta, para_shadings, para_web_shadings
                )
                for res, el_idx in zip(ai_results, para_indices):
                    elem = doc.elements[el_idx]
                    elem.ai_score = res.get("score", 0.0)
                    elem.ai_findings = res.get("findings", [])
                modified = True
            except Exception as e:
                print(f"[WARN] AI document analysis fallo: {e}")

        # Análisis IA en celdas de tablas (emojis de checklist de matrices copiadas)
        for elem in doc.elements:
            if elem.table_info and (elem.table_info.headers or elem.table_info.rows):
                t_score, t_findings = analyze_table_cells(
                    elem.table_info.headers, elem.table_info.rows
                )
                if t_score > 0:
                    elem.ai_score = t_score
                    elem.ai_findings = t_findings
                    modified = True

        if modified:
            save_session_state(doc, storage_dir)
            print(f"[INFO] Background analysis finished and saved for {session_id}")
    except Exception as e:
        print(f"[ERROR] Background analysis failed: {e}")


# ── SCHEMAS DE PETICION API ───────────────────────────────────────────────────

class UpdateElementRequest(BaseModel):
    session_id: str
    element_id: str
    type: str
    heading_level: Optional[int] = None
    text: Optional[str] = None
    image_info: Optional[dict] = None
    equation: Optional[dict] = None


class DetectSimilarRequest(BaseModel):
    session_id: str
    element_id: str
    new_type: str


class ReorderElementsRequest(BaseModel):
    session_id: str
    element_ids: List[str]


class GenerateRequest(BaseModel):
    session_id: str
    rules: Optional[APARuleSet] = None
    portada: Optional[PortadaData] = None
    references: Optional[List[ReferenciaModel]] = None


class PreviewRequest(BaseModel):
    session_id: str
    rules: Optional[APARuleSet] = None
    portada: Optional[PortadaData] = None
    references: Optional[List[ReferenciaModel]] = None


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

class ExplainElementRequest(BaseModel):
    element_type: str = ""
    text: str = ""
    rules_applied: str = ""
    confidence: float = 0.0
    api_key: Optional[str] = None


class RewriteTextRequest(BaseModel):
    session_id: str
    element_id: str
    text: str
    instruction: str
    api_key: Optional[str] = None


class RewriteVariationsRequest(BaseModel):
    """Genera N variaciones de reescritura de un párrafo (Fase F/propuesta 2)."""
    session_id: str
    element_id: str
    text: str
    instruction: str = "Reescribe en estilo académico APA 7, eliminando muletillas de IA."
    n: int = 3
    api_key: Optional[str] = None


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


# ── ENDPOINTS DE LA API REST ──────────────────────────────────────────────────

@app.get("/api/health")
async def health_check() -> HealthResponse:
    """Health check para Electron y monitoreo."""
    return HealthResponse(status="ok", version="1.0.0")


@app.post("/api/check-idempotency")
async def check_idempotency_endpoint(file: UploadFile = File(...)) -> dict:
    """
    Verifica si un documento ya fue procesado por WordAPA7.
    El frontend llama a esto ANTES de subir para decidir si mostrar
    el dialogo de recuperacion de sesion.
    """
    if not file.filename or not file.filename.lower().endswith(".docx"):
        raise HTTPException(
            status_code=400,
            detail="Solo se admiten archivos .docx de Microsoft Word.",
        )

    content: bytes = await file.read()
    if len(content) == 0:
        raise HTTPException(
            status_code=400,
            detail="El archivo esta vacio.",
        )

    # Inicializar BD si no existe
    init_sqlite_db(STORAGE_DIR)

    result = check_idempotency(content, STORAGE_DIR)
    return {
        "already_processed": result.already_processed,
        "source_hash": result.source_hash,
        "previous_session_id": result.previous_session_id,
        "processed_at": result.processed_at,
        "apa_score": result.apa_score,
        "has_marker": result.has_marker,
        "recommendation": result.recommendation,
    }


@app.post("/api/start-blank")
async def start_blank_document(background_tasks: BackgroundTasks) -> DocumentModel:
    """Inicia una nueva sesion usando la plantilla en blanco."""
    template_path = get_apa7_template_path()
    if not template_path.exists():
        # Auto-generar la plantilla si no existe (nunca debe fallar por esto)
        try:
            create_apa7_template(template_path)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"No se pudo generar la plantilla base: {e}")

    session_id: str = uuid.uuid4().hex[:12]
    content: bytes = template_path.read_bytes()

    session_dir = STORAGE_DIR / "sessions" / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / "original.docx").write_bytes(content)

    try:
        doc: DocumentModel = await asyncio.to_thread(
            parse_docx_bytes, content, "Nuevo_Documento_APA7.docx", session_id, STORAGE_DIR, skip_page_layout=True
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"No se pudo procesar la plantilla base: {e}")

    doc.file_name = "Nuevo_Documento_APA7.docx"
    doc.session_id = session_id

    save_session_state(doc, STORAGE_DIR)

    return doc


@app.get("/api/profiles")
async def get_profiles_endpoint() -> dict:
    """
    Lista los perfiles de formato disponibles (config, no código).
    El frontend construye selectores y labels a partir de esta lista.
    """
    profiles = list_profiles()
    return {
        "profiles": [
            {
                "profile_id": p.profile_id,
                "display_name": p.display_name,
                "description": p.description,
                "rules": p.rules,
                "cover_required_fields": p.cover_required_fields,
                "latex_documentclass": p.latex_documentclass,
                "latex_options": p.latex_options,
                "cover_apa_format": p.cover_apa_format,
            }
            for p in profiles
        ]
    }


class SetProfileRequest(BaseModel):
    profile_id: str


@app.post("/api/profile/{session_id}")
async def set_session_profile(session_id: str, req: SetProfileRequest) -> DocumentModel:
    """
    Aplica un perfil de formato a la sesión: persiste profile_id + apa_rules
    en el modelo, de modo que cualquier generación sin rules explícitas
    (o una sesión recargada) use el perfil elegido.
    """
    doc: Optional[DocumentModel] = load_session_state(session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesion no encontrada.")

    profile = get_profile(req.profile_id)
    doc.profile_id = profile.profile_id
    doc.apa_rules = profile.rules.model_copy(deep=True)
    # El perfil define el formato de portada por defecto (student | professional)
    fmt = profile.cover_apa_format
    doc.apa_format = APAFormat.PROFESSIONAL if fmt == "professional" else APAFormat.STUDENT
    if doc.meta:
        doc.meta.apa_format = doc.apa_format

    save_session_state(doc, STORAGE_DIR)
    return doc


# Estructuras internas disponibles para generar plantillas descargables.
# Son variantes de estructura (secciones) dentro del perfil de formato:
# "essay" -> Ensayo Académico, "report" -> Informe Técnico, "thesis" -> Tesina.
_TEMPLATE_ID_MAP: dict[str, DocumentTemplate] = {
    "essay": TEMPLATE_ENSAYO,
    "report": TEMPLATE_INFORME,
    "thesis": TEMPLATE_TESINA,
}


@app.get("/api/template-docx")
async def download_template_docx(
    profile_id: str = "apa7",
    template_id: str = "essay",
) -> FileResponse:
    """
    Genera y descarga una plantilla .docx ya formateada: portada del perfil
    (con marcadores de posición) + títulos de las secciones de la estructura
    elegida. No abre ninguna sesión ni UI de edición: el usuario la descarga
    y escribe en su Word.
    """
    profile = get_profile(profile_id)
    template = _TEMPLATE_ID_MAP.get(template_id)
    if template is None:
        raise HTTPException(
            status_code=400,
            detail=f"Plantilla desconocida: {template_id}. Usa essay, report o thesis.",
        )

    elements: list[ElementModel] = []

    def _add_sections(sections) -> None:
        for section in sections:
            elements.append(
                ElementModel(
                    id=f"tpl-{template_id}-{len(elements)}",
                    type=ElementType.HEADING,
                    heading_level=section.heading_level,
                    text=section.suggested_text,
                    is_cover_section=False,
                )
            )
            _add_sections(section.sub_sections)

    _add_sections(template.sections)

    fmt = profile.cover_apa_format
    apa_format = APAFormat.PROFESSIONAL if fmt == "professional" else APAFormat.STUDENT

    doc_model = DocumentModel(
        session_id=f"tpl-{template_id}",
        file_name=f"WordAPA7_{profile.profile_id}_{template_id}.docx",
        apa_format=apa_format,
        profile_id=profile.profile_id,
        elements=elements,
        apa_rules=profile.rules.model_copy(deep=True),
    )

    portada = PortadaData(
        apa_format=apa_format,
        use_original_cover=False,
        force_skip_cover=False,
        title="Título del Trabajo",
        author="Nombre del Autor o Autora",
        institution="Nombre de la Institución",
        course="Nombre del Curso",
        instructor="Nombre del Docente",
        date="Fecha",
        running_head=None,
    )

    out_dir: Path = STORAGE_DIR / "exports"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path: Path = out_dir / doc_model.file_name

    try:
        await asyncio.to_thread(
            generate_apa7_from_scratch,
            doc_model,
            out_path,
            rules=profile.rules,
            portada=portada,
            references=[],
        )
    except Exception as e:
        print(f"[ERROR] Error generando plantilla .docx: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error generando la plantilla: {str(e)}",
        )

    return FileResponse(
        out_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=out_path.name,
    )


@app.post("/api/upload")
async def upload_docx(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    apa_format: Optional[str] = Form(None),
    work_mode: Optional[str] = Form(None),
    cover_page: Optional[str] = Form(None),
    profile_id: Optional[str] = Form(None),
) -> DocumentModel:
    """
    Sube un documento .docx, lo parsea, extrae imagenes y genera la sesion inicial.

    Acepta parametros del wizard:
    - apa_format: "student" o "professional" (determina formato de portada y running head)
    - work_mode: "quick" o "review" (determina si se aplican cambios automaticamente)
    - cover_page: "use_existing", "import_saved", o "none"
    """
    if not file.filename or not file.filename.lower().endswith(".docx"):
        raise HTTPException(
            status_code=400,
            detail="Solo se admiten archivos .docx de Microsoft Word. "
                   "Los archivos .doc antiguos no son compatibles.",
        )

    session_id: str = uuid.uuid4().hex[:12]
    content: bytes = await file.read()

    # Recolector de basura throttled: limpia sesiones inactivas (>24h) y
    # archivos temporales acumulados. No bloquea la subida (se ejecuta tras
    # responder, en background).
    background_tasks.add_task(maybe_run_gc, STORAGE_DIR)

    if len(content) < 4 or content[:4] != b'PK\x03\x04':
        raise HTTPException(
            status_code=400,
            detail="El archivo no es un documento .docx valido. Los archivos .docx son archivos ZIP con contenido XML."
        )

    if len(content) == 0:
        raise HTTPException(
            status_code=400,
            detail="El archivo esta vacio. Por favor selecciona un documento .docx valido.",
        )

    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="El archivo excede el limite maximo de 50 MB.",
        )

    # Guardar original.docx en la carpeta de sesion
    session_dir = STORAGE_DIR / "sessions" / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / "original.docx").write_bytes(content)

    try:
        # Validar y aplicar wizard params
        fmt = APAFormat.STUDENT
        if apa_format and apa_format.lower() == "professional":
            fmt = APAFormat.PROFESSIONAL

        mode = WorkMode.REVIEW
        if work_mode and work_mode.lower() == "quick":
            mode = WorkMode.QUICK

        doc_model: DocumentModel = await asyncio.to_thread(
            parse_docx_bytes, content, file.filename, session_id, STORAGE_DIR, skip_page_layout=True
        )

        # Run AI text detector (Library patterns)
        try:
            from classification.ai_detector import analyze_table_cells
            from modules.ai_text_detector import get_ai_text_detector
            detector = get_ai_text_detector()
            # Prepare paragraphs to analyze
            paras = []
            para_indices = []
            para_shadings = []
            para_web_shadings = []
            for idx, el in enumerate(doc_model.elements):
                # Analyze only PARAGRAPH or UNKNOWN (body text candidate)
                if el.type.value in ("PARAGRAPH", "UNKNOWN", "paragraph", "unknown") and el.text.strip():
                    paras.append(el.text)
                    para_indices.append(idx)
                    para_shadings.append(el.has_shading_residue)
                    para_web_shadings.append(el.has_web_shading_residue)

            # Análisis IA en celdas de tablas (emojis de checklist, etc.)
            table_flag_count = 0
            for el in doc_model.elements:
                if el.table_info and (el.table_info.headers or el.table_info.rows):
                    t_score, t_findings = analyze_table_cells(
                        el.table_info.headers, el.table_info.rows
                    )
                    if t_score > 0:
                        el.ai_score = t_score
                        el.ai_findings = t_findings
                        table_flag_count += len(t_findings)

            if paras:
                forensic_meta = doc_model.meta.forensic_metadata if doc_model.meta else None
                if forensic_meta is None:
                    forensic_meta = {}
                    if doc_model.meta:
                        doc_model.meta.forensic_metadata = forensic_meta

                # Señal de cruce citas ↔ referencias (contenido pegado con biblioteca decorativa)
                try:
                    from parsing.pre_classifier import (
                        REGEX_CITATION_NARRATIVA,
                        REGEX_CITATION_PARENTETICA,
                    )
                    body_text = " ".join(paras)
                    in_text = len(REGEX_CITATION_NARRATIVA.findall(body_text)) + \
                              len(REGEX_CITATION_PARENTETICA.findall(body_text))
                    refs_count = len(doc_model.referencias) if doc_model.referencias else 0
                    forensic_meta["in_text_citations"] = in_text
                    forensic_meta["references_count"] = refs_count
                except Exception:
                    pass

                results = detector.analyze_document(
                    paras, forensic_meta, para_shadings, para_web_shadings
                )
                for res, el_idx in zip(results, para_indices):
                    doc_model.elements[el_idx].ai_score = res["score"]
                    doc_model.elements[el_idx].ai_matches = res["matches"]
        except Exception as e:
            logger.error(f"Error executing AI Text Detector: {e}")

        # Apply wizard settings to model
        doc_model.apa_format = fmt

        # Aplicar perfil de formato si el cliente lo indica (Modo Rápido / selector de perfil)
        if profile_id:
            profile = get_profile(profile_id)
            doc_model.profile_id = profile.profile_id
            doc_model.apa_rules = profile.rules.model_copy(deep=True)
            pfmt = profile.cover_apa_format
            doc_model.apa_format = APAFormat.PROFESSIONAL if pfmt == "professional" else APAFormat.STUDENT
        if doc_model.meta:
            doc_model.meta.apa_format = fmt
            doc_model.meta.work_mode = mode

        # Inicializar BD de sesiones
        init_sqlite_db(STORAGE_DIR)

        # Guardar sesion inicial
        save_session_state(doc_model, STORAGE_DIR)

        # Encolar deteccion de IA en background
        background_tasks.add_task(run_background_analysis, session_id, STORAGE_DIR)

        return doc_model
    except HTTPException:
        # Re-lanzar HTTPExceptions sin envolver (ej: archivo corrupto = 400, no 500)
        raise
    except Exception as e:
        print(f"[ERROR] Error parseando docx: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error procesando el documento: {str(e)}. "
                   "Verifica que el archivo no este danado o protegido con contrasena.",
        )


class DoiRequest(BaseModel):
    doi: str


class BulkAcceptRequest(BaseModel):
    session_id: str
    element_ids: List[str]


@app.post("/api/bulk-accept")
async def bulk_accept_endpoint(req: BulkAcceptRequest) -> DocumentModel:
    """
    Aprueba atómicamente una lista de elementos en 1 solo guardado de sesión.
    """
    doc: Optional[DocumentModel] = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesion no encontrada.")

    target_ids = set(req.element_ids)
    for elem in doc.elements:
        if elem.id in target_ids:
            elem.needs_review = False
            elem.auto_applied = True

    save_session_state(doc, STORAGE_DIR)
    return doc


@app.post("/api/classify/{session_id}")
async def classify_with_llm(
    session_id: str,
    api_key: Optional[str] = Form(None),
    nim_url: Optional[str] = Form(None),
    use_local: Optional[str] = Form(None),
    provider_id: Optional[str] = Form(None),
) -> DocumentModel:
    """
    Ejecuta el refinamiento con LLM multi-proveedor (NVIDIA > Groq > OpenRouter > ...)
    para elementos con baja confianza. Incluye fallback automatico, batching adaptativo
    y progreso en tiempo real via GET /api/classify/progress/{session_id}.
    """
    doc: Optional[DocumentModel] = load_session_state(session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(
            status_code=404,
            detail="Sesion no encontrada. El documento debe ser subido primero con /api/upload.",
        )

    updated_doc: DocumentModel = await classify_document_with_llm(doc, api_key, nim_url, use_local == 'true')
    save_session_state(updated_doc, STORAGE_DIR)
    return updated_doc


@app.get("/api/classify/progress/{session_id}")
async def get_classify_progress_endpoint(session_id: str) -> dict:
    """
    Retorna el progreso actual de la clasificacion con LLM para una sesion.
    El frontend consulta este endpoint periodicamente para mostrar el progreso
    en tiempo real durante la clasificacion.
    """
    progress = get_classify_progress(session_id)
    return progress


@app.post("/api/update-element")
async def update_element(req: UpdateElementRequest) -> DocumentModel:
    """
    Permite al usuario cambiar el tipo, nivel de titulo o texto de un elemento
    manualmente desde la UI.
    """
    doc: Optional[DocumentModel] = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(
            status_code=404,
            detail="Sesion no encontrada. Recarga la pagina y vuelve a intentarlo.",
        )

    # Snapshot antes de modificar
    from persistence.session_manager import save_session_snapshot
    save_session_snapshot(doc, STORAGE_DIR)

    found: bool = False
    for elem in doc.elements:
        elem_id: str = elem.id if hasattr(elem, 'id') else elem.get('id', '')
        if elem_id == req.element_id:
            if hasattr(elem, 'type'):
                elem.type = req.type
            else:
                elem['type'] = req.type

            if req.heading_level is not None:
                if hasattr(elem, 'heading_level'):
                    elem.heading_level = req.heading_level
                else:
                    elem['heading_level'] = req.heading_level

            if req.text is not None:
                if hasattr(elem, 'text'):
                    elem.text = req.text
                else:
                    elem['text'] = req.text

            if hasattr(elem, 'is_user_modified'):
                elem.is_user_modified = True
                elem.confidence = 1.0
            else:
                elem['is_user_modified'] = True
                elem['confidence'] = 1.0

            # Actualizar campos de image_info si se proporcionan
            if req.image_info is not None:
                if hasattr(elem, 'image_info') and elem.image_info is not None:
                    for k, v in req.image_info.items():
                        if hasattr(elem.image_info, k):
                            setattr(elem.image_info, k, v)
                elif hasattr(elem, 'image_info') and elem.image_info is None:
                    # Crear ImageModel desde cero si no existe pero se intenta actualizar
                    from models import ImageModel
                    img = ImageModel(element_id=req.element_id, file_path="", filename="")
                    for k, v in req.image_info.items():
                        if hasattr(img, k):
                            setattr(img, k, v)
                    elem.image_info = img

            # Actualizar configuración de ecuación (presentación, no el XML OMML)
            if req.equation is not None:
                from models import EquationConfig
                if hasattr(elem, 'equation') and isinstance(elem.equation, EquationConfig):
                    for k, v in req.equation.items():
                        if hasattr(elem.equation, k):
                            setattr(elem.equation, k, v)
                else:
                    elem.equation = EquationConfig(**{
                        k: v for k, v in req.equation.items()
                        if k in EquationConfig.model_fields
                    })

            found = True
            break

    if not found:
        valid_ids = [e.id if hasattr(e, 'id') else e.get('id', '?') for e in doc.elements]
        raise HTTPException(
            status_code=404,
            detail=f"Elemento con ID '{req.element_id}' no encontrado. IDs validos: {valid_ids[:20]}",
        )

    save_session_state(doc, STORAGE_DIR)
    return doc


@app.post("/api/detect-similar")
async def detect_similar_headings(req: DetectSimilarRequest) -> dict:
    """
    Después de que el usuario corrige un heading manualmente, buscar otros headings
    con el mismo estilo Word original y longitud similar para ofrecer aplicar
    el mismo cambio en lote.
    """
    doc: Optional[DocumentModel] = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")

    source_elem = None
    for e in doc.elements:
        eid = e.id if hasattr(e, 'id') else e.get('id', '')
        if eid == req.element_id:
            source_elem = e
            break

    if not source_elem:
        return {"similar_ids": [], "count": 0}

    source_style = getattr(source_elem, 'original_word_style', None) or ''
    source_text = getattr(source_elem, 'text', '') or ''
    source_len = len(source_text)

    similar_ids = []
    for e in doc.elements:
        eid = e.id if hasattr(e, 'id') else e.get('id', '')
        if eid == req.element_id:
            continue
        etype = e.type if hasattr(e, 'type') else e.get('type', '')
        if etype != 'heading':
            continue

        estilo = getattr(e, 'original_word_style', None) or ''
        texto = getattr(e, 'text', '') or ''
        # Match: same original style AND similar length (±40%)
        if estilo and estilo == source_style and abs(len(texto) - source_len) / max(source_len, 1) < 0.4:
            similar_ids.append(eid)

    return {"similar_ids": similar_ids, "count": len(similar_ids)}


@app.post("/api/ai/suggest-caption")
async def api_suggest_caption(req: SuggestCaptionRequest) -> dict:
    from modules.ai_assistant import generate_caption_suggestion
    try:
        suggestion = await generate_caption_suggestion(req.context_text, req.api_key)
        return {"suggestion": suggestion}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ai/explain-element")
async def api_explain_element(req: ExplainElementRequest) -> dict:
    from modules.ai_assistant import explain_element
    try:
        explanation = await explain_element(req.element_type, req.text, req.rules_applied, req.confidence, req.api_key)
        return {"explanation": explanation}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ai/rewrite")
async def api_rewrite_text(req: RewriteTextRequest) -> dict:
    from modules.ai_assistant import rewrite_text_suggestion
    try:
        rewritten = await rewrite_text_suggestion(req.text, req.instruction, req.api_key)
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


@app.post("/api/sync-provider-keys")
async def sync_provider_keys_endpoint(request: Request) -> dict:
    """
    Recibe las claves de API guardadas por el usuario en la UI (localStorage)
    y las inyecta en os.environ para que _get_active_providers() las use
    sin necesidad de reiniciar el backend ni editar .env.
    Solo inyecta si el valor no está vacío; nunca sobrescribe una existente
    salvo que se envíe un valor nuevo.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}
    keys = body.get("keys", {}) or {}
    if not isinstance(keys, dict):
        keys = {}

    # Mapa de variable de entorno -> clave del cuerpo
    allowed = {
        "NVIDIA_API_KEY": "NVIDIA_API_KEY",
        "GROQ_API_KEY": "GROQ_API_KEY",
        "OPENROUTER_API_KEY": "OPENROUTER_API_KEY",
        "CEREBRAS_API_KEY": "CEREBRAS_API_KEY",
        "MISTRAL_API_KEY": "MISTRAL_API_KEY",
        "OPENCODEZEN_API_KEY": "OPENCODEZEN_API_KEY",
        "ZENMUX_API_KEY": "ZENMUX_API_KEY",
        "GEMINI_API_KEY": "GEMINI_API_KEY",
        "CLOUDFLARE_API_TOKEN": "CLOUDFLARE_API_TOKEN",
        "CLOUDFLARE_ACCOUNT_ID": "CLOUDFLARE_ACCOUNT_ID",
    }

    applied = []
    for env_var, key_name in allowed.items():
        val = str(keys.get(key_name, "") or "").strip()
        if val:
            os.environ[env_var] = val
            applied.append(env_var)

    # Persistir en disco para que las claves sobrevivan a un reinicio del backend
    try:
        from persistence.ai_keys import save_provider_keys
        save_provider_keys(keys)
    except Exception as e:
        print(f"[WARN] No se pudo persistir claves de IA: {e}")

    return {"applied": applied, "count": len(applied)}


@app.post("/api/replace-image/{session_id}/{element_id}")
async def replace_image_endpoint(
    session_id: str,
    element_id: str,
    file: UploadFile = File(...),
) -> DocumentModel:
    """
    Reemplaza la imagen de un elemento IMAGE por un archivo nuevo (multipart).
    Guarda el blob en storage/sessions/{session_id}/images/ y actualiza
    file_path / relative_url / filename en el ImageModel.
    """
    doc: Optional[DocumentModel] = load_session_state(session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesion no encontrada.")

    session_dir = STORAGE_DIR / "sessions" / session_id
    img_dir = session_dir / "images"
    img_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename or "imagen.png").suffix or ".png"
    if ext.lower() not in (".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".emf", ".wmf", ".tif", ".tiff"):
        ext = ".png"
    img_filename = f"img_{uuid.uuid4().hex[:8]}{ext}"
    img_path = img_dir / img_filename

    try:
        content = await file.read()
        with open(img_path, "wb") as f_img:
            f_img.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar imagen: {e}")

    # Buscar el elemento y actualizar su ImageModel
    from models import ImageModel
    found = False
    for elem in doc.elements:
        if elem.id == element_id and elem.image_info is not None:
            elem.image_info.file_path = str(img_path)
            elem.image_info.filename = img_filename
            elem.image_info.relative_url = f"/api/images/{session_id}/{img_filename}"
            elem.is_user_modified = True
            found = True
            break

    if not found:
        # Puede no existir image_info; intentar crearlo sobre el elemento
        for elem in doc.elements:
            if elem.id == element_id:
                if elem.image_info is None:
                    elem.image_info = ImageModel(
                        element_id=element_id,
                        file_path=str(img_path),
                        filename=img_filename,
                        relative_url=f"/api/images/{session_id}/{img_filename}",
                        width_cm=12, height_cm=8,
                        caption="", figure_number=0,
                        alignment="center", wrap_style="inline",
                        caption_position="above", constrain_proportions=True,
                        design_style="standard",
                    )
                elem.is_user_modified = True
                found = True
                break

    if not found:
        raise HTTPException(status_code=404, detail="Elemento no encontrado.")

    save_session_state(doc, STORAGE_DIR)
    return doc


@app.post("/api/reorder-elements")
async def reorder_elements(req: ReorderElementsRequest) -> DocumentModel:
    """
    Reordena la lista de elementos (util para mover tablas o figuras arriba/abajo en la UI).
    """
    doc: Optional[DocumentModel] = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(
            status_code=404,
            detail="Sesion no encontrada.",
        )

    # Snapshot antes de reordenar
    from persistence.session_manager import save_session_snapshot
    save_session_snapshot(doc, STORAGE_DIR)

    elem_map: dict = {}
    for e in doc.elements:
        eid = e.id if hasattr(e, 'id') else e.get('id', '')
        elem_map[eid] = e

    new_elements: list = []
    for eid in req.element_ids:
        if eid in elem_map:
            new_elements.append(elem_map[eid])

    existing_ids = set(req.element_ids)
    for e in doc.elements:
        eid = e.id if hasattr(e, 'id') else e.get('id', '')
        if eid not in existing_ids:
            new_elements.append(e)

    doc.elements = new_elements
    save_session_state(doc, STORAGE_DIR)
    return doc


@app.get("/api/sessions")
async def list_sessions_endpoint() -> dict:
    """
    Lista las sesiones recientes para mostrar en el historial de la UI.
    """
    sessions = list_recent_sessions(STORAGE_DIR, limit=10)
    # Wrap in SessionRecovery format expected by frontend
    recovery_list: list[dict] = []
    for s in sessions:
        recovery_list.append({
            "session": s,
            "available": True,
        })
    return {"sessions": recovery_list}

@app.get("/api/session/{session_id}")
async def get_session(session_id: str) -> DocumentModel:
    """
    Obtiene el estado completo de la sesion.
    """
    doc: Optional[DocumentModel] = load_session_state(session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(
            status_code=404,
            detail="Sesion no encontrada. Es posible que haya expirado o el ID sea incorrecto.",
        )
    return doc


@app.delete("/api/session/{session_id}")
async def delete_session_endpoint(session_id: str) -> dict:
    success: bool = delete_session(session_id, STORAGE_DIR)
    if not success:
        raise HTTPException(
            status_code=404,
            detail="Sesion no encontrada o no se pudo eliminar.",
        )
    return {"status": "ok", "message": f"Sesion {session_id} eliminada correctamente."}


@app.get("/api/images/{session_id}/{filename}")
async def get_session_image(session_id: str, filename: str) -> FileResponse:
    """
    Sirve las imagenes extraidas del documento durante el parsing.
    """
    img_path: Path = STORAGE_DIR / "sessions" / session_id / "images" / filename
    if not img_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Imagen no encontrada. Es posible que la sesion haya expirado.",
        )
    return FileResponse(img_path)


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
    Busca en Crossref API referencias por apellido(s) de autor + año.
    API gratuita (Crossref), sin API key. Retorna hasta 5 candidatos
    formateados en APA 7 para que el usuario elija.
    """
    from modules.referencias_module import search_crossref_by_author_year
    result = await search_crossref_by_author_year(req.authors, req.year)
    if result:
        return {"found": True, "candidates": result.get("candidates", []), "total_results": result.get("total_results", 0)}
    return {"found": False, "candidates": [], "total_results": 0}


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

    issues = await validate_citations_with_llm(doc, ref_models, api_key, nim_url, use_local == 'true')
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


@app.post("/api/generate-pdf")
async def generate_pdf_endpoint(req: GenerateRequest) -> dict:
    """
    Genera el archivo PDF final formateado con APA 7 a partir del DOCX.
    """
    doc: Optional[DocumentModel] = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")

    out_dir = STORAGE_DIR / "sessions" / req.session_id
    out_dir.mkdir(parents=True, exist_ok=True)

    clean_file_name = doc.file_name or "document.docx"
    clean_file_name = clean_file_name.replace(" ", "_")
    docx_name = f"APA7_{clean_file_name}"
    docx_path = out_dir / docx_name
    pdf_name = docx_name.rsplit(".", 1)[0] + ".pdf"
    pdf_path = out_dir / pdf_name

    rules = _session_rules(doc, req.rules)
    portada = req.portada or PortadaData()
    references = req.references or []

    from services.doc_converter import get_doc_converter
    doc_converter = get_doc_converter()

    preserve_cover = portada.use_original_cover and doc.portada.get("detected", False)

    # Remove cover paragraphs only if we have COM active, because LO doesn't do transplant yet
    is_com = doc_converter.get_active_engine() == "COM"

    generate_apa7_docx(
        doc, docx_path, rules=rules, portada=portada, references=references,
        remove_cover_paragraphs=preserve_cover and is_com
    )

    original_path = STORAGE_DIR / "sessions" / req.session_id / "original.docx"

    # Inyectar Post-Processor Dual Engine para PDF
    final_path = out_dir / f"FinalPDFSource_{clean_file_name}"

    success, pdf_out_path = doc_converter.process_and_convert(
        original_path=original_path,
        generated_path=docx_path,
        final_path=final_path,
        preserve_cover=preserve_cover,
        generate_pdf=True
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
        # Fallback a LibreOffice o docx2pdf
        try:
            res = subprocess.run(["libreoffice", "--headless", "--convert-to", "pdf", "--outdir", str(out_dir), str(docx_path)], capture_output=True, timeout=30)
            if res.returncode == 0 and pdf_path.exists():
                pdf_generated = True
        except Exception as e:
            print(f"[WARN] LibreOffice conversion exception: {e}")

    if not pdf_generated:
        try:
            from docx2pdf import convert
            convert(str(docx_path), str(pdf_path))
            if pdf_path.exists():
                pdf_generated = True
        except Exception as e:
            print(f"[WARN] docx2pdf conversion exception: {e}")

    if pdf_generated and pdf_path.exists():
        return {
            "status": "ok",
            "session_id": req.session_id,
            "download_url": f"/api/download-pdf/{req.session_id}",
            "pdf_name": pdf_name,
        }
    else:
        return {
            "status": "fallback_docx",
            "session_id": req.session_id,
            "download_url": f"/api/download/{req.session_id}",
            "docx_name": docx_name,
            "message": "Conversión PDF no disponible en este entorno; se descargará la versión DOCX oficial.",
        }


@app.get("/api/download-pdf/{session_id}")
async def download_pdf(session_id: str):
    out_dir = STORAGE_DIR / "sessions" / session_id
    files = list(out_dir.glob("*.pdf"))
    if not files:
        raise HTTPException(status_code=404, detail="Archivo PDF no encontrado.")
    return FileResponse(
        files[0],
        media_type="application/pdf",
        filename=files[0].name,
    )


@app.get("/api/download-preview/{session_id}")
async def download_preview_docx(session_id: str) -> FileResponse:
    """
    Descarga el DOCX generado para preview.
    El frontend usa mammoth.js para convertir este DOCX a HTML en el navegador.
    """
    out_dir: Path = STORAGE_DIR / "sessions" / session_id
    files: list = list(out_dir.glob("Preview_*.docx"))
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
    out_dir: Path = STORAGE_DIR / "sessions" / session_id / "preview_pages"
    out_dir.mkdir(parents=True, exist_ok=True)

    # Limpiar previews anteriores
    for old in out_dir.glob("page_*.png"):
        old.unlink()

    # Generar DOCX
    preview_docx = out_dir / "preview.docx"
    try:
        generate_apa7_docx(doc, preview_docx, rules=rules,
                           portada=req.portada, references=req.references)
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

    # Convertir DOCX → PDF via LibreOffice Service
    import asyncio
    try:
        # Usamos asyncio.to_thread para no bloquear si demora un poco
        success = await asyncio.to_thread(lo.convert, preview_docx, "pdf", out_dir)
        if not success:
            raise Exception("LibreOffice Falló al generar el PDF")

        pdf_file = out_dir / "preview.pdf"
        if not pdf_file.exists():
            raise Exception("PDF no fue creado.")

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

    rules: APARuleSet = _session_rules(doc, req.rules)
    out_dir: Path = STORAGE_DIR / "sessions" / req.session_id
    out_file: Path = out_dir / f"APA7_{doc.file_name}"

    try:
        from persistence.idempotency import add_marker_to_docx
        from services.doc_converter import get_doc_converter
        doc_converter = get_doc_converter()
        preserve_cover = (req.portada is not None) and req.portada.use_original_cover and doc.portada.get("detected", False)

        is_com = doc_converter.get_active_engine() == "COM"

        generated_path: Path = generate_apa7_docx(
            doc, out_file, rules, req.portada, req.references,
            remove_cover_paragraphs=preserve_cover and is_com
        )

        original_path = STORAGE_DIR / "sessions" / req.session_id / "original.docx"

        # Inyectar Post-Processor Dual Engine
        final_path = out_dir / f"Final_{doc.file_name}"
        success, pdf_path = doc_converter.process_and_convert(
            original_path=original_path,
            generated_path=generated_path,
            final_path=final_path,
            preserve_cover=preserve_cover,
            generate_pdf=False # El endpoint de PDF se maneja en /api/generate-pdf
        )

        if success and final_path.exists():
            # Si COM tuvo éxito, el archivo oficial es final_path
            # Lo renombramos a APA7_...
            final_path.replace(generated_path)

        # Agregar marcador de idempotencia al DOCX generado
        try:
            with open(generated_path, "rb") as f:
                generated_bytes = f.read()
            marked_bytes = add_marker_to_docx(generated_bytes)
            with open(generated_path, "wb") as f:
                f.write(marked_bytes)
        except Exception:
            pass

        return {
            "download_url": f"/api/download/{req.session_id}",
            "filename": f"APA7_{doc.file_name}",
        }
    except Exception as e:
        print(f"[ERROR] Error generando DOCX: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error generando el documento APA 7: {str(e)}",
        )


@app.get("/api/download/{session_id}")
async def download_generated_docx(session_id: str) -> FileResponse:
    """
    Descarga el archivo generado.
    """
    out_dir: Path = STORAGE_DIR / "sessions" / session_id
    files: list = list(out_dir.glob("APA7_*.docx"))
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
    if doc.references:
        references_text = [r.text for r in doc.references if r.text]
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

            # Deduplicate just in case
            result['ghost_citations'] = list(set(result['ghost_citations']))

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
    templates = list_cover_templates(BASE_DIR)
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

    # Guardar imagen temporalmente
    temp_dir = STORAGE_DIR / "temp_covers"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_path = temp_dir / file.filename
    content = await file.read()

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="El archivo esta vacio.")

    temp_path.write_bytes(content)

    try:
        template = create_cover_from_image(
            temp_path, name, description, BASE_DIR
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
    """
    from modules.cover_designer import create_cover_from_docx

    if not file.filename or not file.filename.lower().endswith(".docx"):
        raise HTTPException(
            status_code=400,
            detail="Solo se admiten archivos .docx.",
        )

    temp_dir = STORAGE_DIR / "temp_covers"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_path = temp_dir / file.filename
    content = await file.read()

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="El archivo esta vacio.")

    temp_path.write_bytes(content)

    try:
        template = create_cover_from_docx(
            temp_path, name, description, BASE_DIR
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
        if temp_path.exists():
            temp_path.unlink()


@app.delete("/api/cover-templates/{name:path}")
async def delete_cover_template_endpoint(name: str) -> dict:
    """
    Elimina una plantilla de portada creada por el usuario.
    Las plantillas integradas no se pueden eliminar.
    """
    from modules.cover_designer import delete_cover_template

    success = delete_cover_template(name, BASE_DIR)
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
    templates = list_cover_templates(BASE_DIR)
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

    templates = list_cover_templates(BASE_DIR)
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

    version_file = DIST_DIR / "version.json"
    try:
        if version_file.exists():
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

file_handler = logging.FileHandler(log_file_path, encoding='utf-8')
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

@app.post("/api/sessions/{session_id}/snapshot")
async def save_session_snapshot_endpoint(session_id: str) -> dict:
    """
    Guarda un snapshot intermedio del progreso del usuario (sesión propia).
    Permite volver a un punto guardado explícitamente (E.2).
    """
    from persistence.session_manager import save_session_snapshot
    doc_model = load_session_state(session_id, STORAGE_DIR)
    if not doc_model:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")
    save_session_snapshot(doc_model, STORAGE_DIR)
    return {"status": "ok", "message": "Progreso guardado", "session_id": session_id}


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

    # 1) Análisis de IA por párrafo
    for idx, e in enumerate(doc_model.elements):
        if e.type not in text_types:
            continue
        text = (e.text or e.original_text or "").strip()
        if not text or len(text) < 15:
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
        if ai_score >= 40:
            flagged += 1
        score_sum += ai_score
        score_n += 1

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
    """Retorna la versión y build_hash actual para que el frontend detecte cambios."""
    build_hash = _read_build_hash()
    version_file = DIST_DIR / "version.json"
    build_time = None
    if version_file.exists():
        try:
            with open(version_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            build_time = data.get("build_time")
        except Exception:
            pass

    return {
        "version": "1.0.0",
        "build_hash": build_hash,
        "build_time": build_time,
        "stale": build_hash == "unknown",
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
    args, unknown = parser.parse_known_args()

    # 1. Verificar y recompilar frontend si hubo cambios en src/
    check_and_auto_build_frontend()

    # 2. Crear plantilla inicial si no existe
    template_path: Path = get_apa7_template_path()
    if not template_path.exists():
        try:
            create_apa7_template(template_path)
            print(f"[INFO] Plantilla APA 7 creada en: {template_path}")
        except Exception as e:
            print(f"[WARN] No se pudo crear la plantilla APA 7: {e}")

    print("=" * 60)
    print(f" WordAPA7 — Servidor iniciado en http://localhost:{args.port}")
    print(" Presiona Ctrl+C para detener")
    print("=" * 60)
    uvicorn.run(app, host="127.0.0.1", port=args.port)
