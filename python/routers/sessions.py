"""Sesiones, subida y elementos - endpoints extraidos de main.py (mejora #4 / E-02)."""
from __future__ import annotations

import asyncio
import logging
import os
import re
import uuid
from pathlib import Path
from typing import List, Optional

from classification.llm_classifier import classify_document_with_llm, get_classify_progress
from config import STORAGE_DIR, get_apa7_template_path
from create_template import ensure_apa7_template
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from generation.layered_generator import generate_apa7_from_scratch
from generation.templates import (
    TEMPLATE_ENSAYO,
    TEMPLATE_IMRYD,
    TEMPLATE_INFORME,
    TEMPLATE_LIBRO_MATH,
    TEMPLATE_TESINA,
    DocumentTemplate,
)
from models import APAFormat, DocumentModel, ElementModel, ElementType, PortadaData, ReferenciaModel, WorkMode
from modules.doc_auditor import DocAuditResult, audit_document_structure
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
from pydantic import BaseModel


router = APIRouter(tags=["sessions"])

logger = logging.getLogger("wordapa7")

_TEMPLATE_ID_MAP: dict[str, DocumentTemplate] = {
    "essay": TEMPLATE_ENSAYO,
    "report": TEMPLATE_INFORME,
    "thesis": TEMPLATE_TESINA,
    "imryd": TEMPLATE_IMRYD,
    "math_book": TEMPLATE_LIBRO_MATH,
}


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

        # 2. Deteccion IA (pipeline unificado: pÃ¡rrafos + metadatos + tablas)
        from classification.ai_detector import analyze_document_ai, analyze_table_cells

        paras = []
        para_indices = []
        para_shadings = []
        para_web_shadings = []
        from modules.phase_scope import build_phase_map
        _phase_by_id, _ = build_phase_map(doc.elements)

        for idx, elem in enumerate(doc.elements):
            if elem.text and len(elem.text.strip()) >= 15:
                if _phase_by_id.get(str(elem.id)) == "referencias":
                    continue
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

        # AnÃ¡lisis IA en celdas de tablas (emojis de checklist de matrices copiadas)
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


# â”€â”€ SCHEMAS DE PETICION API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


class UpdateElementRequest(BaseModel):
    session_id: str
    element_id: str
    type: Optional[str] = None
    heading_level: Optional[int] = None
    text: Optional[str] = None
    image_info: Optional[dict] = None
    equation: Optional[dict] = None
    table_info: Optional[dict] = None


class InsertElementRequest(BaseModel):
    """FASE 3 — dividir un párrafo: inserta un párrafo físico en el docx
    y un elemento en el modelo, tras `after_element_id`."""
    session_id: str
    after_element_id: str
    new_element_id: str
    text: str
    type: str = "paragraph"
    heading_level: int = 1


class InsertImageRequest(BaseModel):
    """API de contenido / copiloto — inserta una figura ya renderizada por el
    backend (párrafo físico con imagen inline + ElementModel tipo image) tras
    `after_element_id`. Nunca inserta en la zona de portada."""
    session_id: str
    after_element_id: str
    new_element_id: str
    image: dict


class DetectSimilarRequest(BaseModel):
    session_id: str
    element_id: str
    new_type: str


class ReorderElementsRequest(BaseModel):
    session_id: str
    element_ids: List[str]


@router.post("/api/check-idempotency")
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


@router.post("/api/start-blank")
async def start_blank_document(background_tasks: BackgroundTasks) -> DocumentModel:
    """Inicia una nueva sesion usando la plantilla en blanco."""
    # Auto-generar o verificar la plantilla si hace falta (nunca debe fallar
    # por esto): ensure_apa7_template valida el sello sha256 antes de usarla.
    try:
        template_path = ensure_apa7_template(get_apa7_template_path())
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


@router.get("/api/profiles")
async def get_profiles_endpoint() -> dict:
    """
    Lista los perfiles de formato disponibles (config, no cÃ³digo).
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


@router.post("/api/profile/{session_id}")
async def set_session_profile(session_id: str, req: SetProfileRequest) -> DocumentModel:
    """
    Aplica un perfil de formato a la sesiÃ³n: persiste profile_id + apa_rules
    en el modelo, de modo que cualquier generaciÃ³n sin rules explÃ­citas
    (o una sesiÃ³n recargada) use el perfil elegido.
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
# "essay" -> Ensayo AcadÃ©mico, "report" -> Informe TÃ©cnico, "thesis" -> Tesina.


@router.get("/api/template-docx")
async def download_template_docx(
    profile_id: str = "apa7",
    template_id: str = "essay",
) -> FileResponse:
    """
    Genera y descarga una plantilla .docx ya formateada: portada del perfil
    (con marcadores de posiciÃ³n) + tÃ­tulos de las secciones de la estructura
    elegida. No abre ninguna sesiÃ³n ni UI de ediciÃ³n: el usuario la descarga
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
        institution="Nombre de la Institución",
        course="Nombre del Curso",
        date="Fecha",
        running_head=None,
    )
    # El autor y el docente son datos del acta, no del diseno de la hoja:
    # van en `meta` (ver el motivo en `models.py`).
    doc_model.meta.autor = "Nombre del Autor o Autora"
    doc_model.meta.profesor_asesor = ["Nombre del Docente"]

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


@router.post("/api/upload")
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

        # Fix A1: Enriquecimiento de portada 100% OOXML nativo â€” NUNCA abre Word.
        # El COM se usa exclusivamente en la exportaciÃ³n (post-procesador), no en el upload.
        # RazÃ³n: abrir Word via COM al importar causa que el usuario vea Word abrirse/cerrarse
        # y en algunos casos queda colgado con un documento vacÃ­o.
        original_path = session_dir / "original.docx"
        try:
            from parsing.ooxml_cover_detector import detect_cover_ooxml
            ooxml_diag = await asyncio.to_thread(
                detect_cover_ooxml, doc_model, str(original_path)
            )
            if ooxml_diag.get("cover_corrected"):
                logger.info(
                    f"[OOXML Cover] Portada detectada nativa: body_start={ooxml_diag.get('cover_new_start')}, "
                    f"elementos marcados={ooxml_diag.get('cover_elements_corrected', 0)}"
                )
        except Exception as e:
            logger.warning(f"[OOXML Cover] DetecciÃ³n nativa fallÃ³ (no crÃ­tico): {e}")

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

            # AnÃ¡lisis IA en celdas de tablas (emojis de checklist, etc.)
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

                # SeÃ±al de cruce citas â†” referencias (contenido pegado con biblioteca decorativa)
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

        # Aplicar perfil de formato si el cliente lo indica (Modo RÃ¡pido / selector de perfil)
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


class BulkAcceptRequest(BaseModel):
    session_id: str
    element_ids: List[str]


@router.post("/api/bulk-accept")
async def bulk_accept_endpoint(req: BulkAcceptRequest) -> DocumentModel:
    """
    Aprueba atÃ³micamente una lista de elementos en 1 solo guardado de sesiÃ³n.
    """
    doc: Optional[DocumentModel] = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesion no encontrada.")

    target_ids = set(req.element_ids)
    for elem in doc.elements:
        if elem.id in target_ids:
            elem.needs_review = False
            elem.auto_applied = True
            elem.is_user_modified = True
            elem.confidence = 1.0

    save_session_state(doc, STORAGE_DIR)
    return doc


class NormalizeHeadingsRequest(BaseModel):
    session_id: str


@router.post("/api/normalize-headings")
async def normalize_headings_endpoint(req: NormalizeHeadingsRequest) -> DocumentModel:
    """
    Normaliza automÃ¡ticamente la jerarquÃ­a de tÃ­tulos del documento segÃºn APA 7.
    - Secciones estÃ¡ndar (Resumen, IntroducciÃ³n, etc.) -> Nivel 1
    - NumeraciÃ³n (1. -> 1, 1.1 -> 2, 1.1.1 -> 3, etc.)
    - Corrige saltos de nivel y marca todos como aprobados.
    """
    doc: Optional[DocumentModel] = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesion no encontrada.")

    # No hay lista local de secciones: `match_phase_exact` es la UNICA fuente
    # de verdad. Antes este endpoint tenia su propio `LEVEL1_PATTERNS`, y eso
    # era el mismo defecto por tercera puerta: no conocia `objetivos`, asi que
    # un H2 "Objetivos" no se promovia, la fase no abria y `bloom_vague` no
    # disparaba nunca; tampoco quita numeracion romana; y promovia
    # `recomendaciones`, que no esta en el vocabulario y quedaba abriendo
    # `sin_fase`. Se usa `match_phase_exact` y no `match_phase` a proposito: un
    # "Resultados de la encuesta" bajo "Metodo" es una subseccion que el autor
    # puso ahi, y aplanarla es el defecto que este arreglo viene a cerrar.
    from modules.phase_scope import match_phase_exact

    last_level = 1
    for elem in doc.elements:
        if elem.type != ElementType.HEADING or elem.is_cover_section:
            continue

        text = (elem.text or "").strip()

        num_match = re.match(r"^(\d+(?:\.\d+)*)", text)
        if num_match:
            parts = [p for p in num_match.group(1).split(".") if p]
            level = min(len(parts), 5)
        elif match_phase_exact(text) is not None:
            level = 1
        else:
            level = elem.heading_level if elem.heading_level in (1, 2, 3, 4, 5) else 2

        if level > last_level + 1:
            level = last_level + 1

        elem.heading_level = level
        elem.needs_review = False
        elem.is_user_modified = True
        elem.confidence = 1.0
        last_level = level

    save_session_state(doc, STORAGE_DIR)
    return doc


@router.post("/api/classify/{session_id}")
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

    updated_doc: DocumentModel = await classify_document_with_llm(
        doc, api_key, nim_url, use_local == 'true', provider_id=provider_id
    )
    save_session_state(updated_doc, STORAGE_DIR)
    return updated_doc


@router.get("/api/classify/progress/{session_id}")
async def get_classify_progress_endpoint(session_id: str) -> dict:
    """
    Retorna el progreso actual de la clasificacion con LLM para una sesion.
    El frontend consulta este endpoint periodicamente para mostrar el progreso
    en tiempo real durante la clasificacion.
    """
    progress = get_classify_progress(session_id)
    return progress


@router.post("/api/update-element")
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
            # El tipo del request es una pista del cliente, no una orden:
            # si viene junto a un payload que contradice el tipo real
            # del elemento (image_info sobre una tabla o viceversa), el tipo
            # existente manda para no convertir el elemento por accidente.
            current_type = elem.type if hasattr(elem, 'type') else elem.get('type')
            new_type = req.type
            if new_type is not None:
                if req.image_info is not None and current_type == 'table':
                    new_type = None
                elif req.table_info is not None and current_type == 'image':
                    new_type = None
            if new_type is not None:
                if hasattr(elem, 'type'):
                    elem.type = new_type
                else:
                    elem['type'] = new_type

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

            # Actualizar campos de table_info si se proporcionan
            if req.table_info is not None:
                if hasattr(elem, 'table_info') and elem.table_info is not None:
                    for k, v in req.table_info.items():
                        if hasattr(elem.table_info, k):
                            setattr(elem.table_info, k, v)
                elif hasattr(elem, 'table_info') and elem.table_info is None:
                    from models import TableModel
                    tbl = TableModel(
                        element_id=req.element_id,
                        headers=[],
                        rows=[],
                        caption="",
                        table_number=1,
                    )
                    for k, v in req.table_info.items():
                        if hasattr(tbl, k):
                            setattr(tbl, k, v)
                    elem.table_info = tbl

            # Actualizar configuraciÃ³n de ecuaciÃ³n (presentaciÃ³n, no el XML OMML)
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


class SortReferencesRequest(BaseModel):
    references: Optional[List[ReferenciaModel]] = None


@router.post("/api/references/sort/{session_id}")
async def sort_references_endpoint(
    session_id: str,
    req: Optional[SortReferencesRequest] = None,
) -> DocumentModel:
    """Reordena la bibliografia por apellido APA 7 y persiste el orden.

    Si el cliente envia las referencias actuales (`req.references`), se toman
    esas para no pisar ni borrar referencias agregadas en la interfaz (DOI,
    manuales o citas resueltas). Si no, usa las persistidas en `doc.referencias`.
    """
    from modules.referencias_module import sort_referencias_alphabetically

    doc: Optional[DocumentModel] = load_session_state(session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesion no encontrada.")
    
    lista_a_ordenar = (
        req.references if (req is not None and req.references is not None)
        else list(doc.referencias or [])
    )
    doc.referencias = sort_referencias_alphabetically(list(lista_a_ordenar))
    save_session_state(doc, STORAGE_DIR)
    return doc



@router.get("/api/citation-style/{session_id}")
async def citation_style_endpoint(session_id: str) -> dict:
    """Estilo de las citas del cuerpo: APA, numerica (IEEE/Vancouver) o mezcla."""
    from parsing.citation_matcher import detect_citation_style

    doc: Optional[DocumentModel] = load_session_state(session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesion no encontrada.")
    return detect_citation_style(doc)


@router.post("/api/elements/insert")
async def insert_element(req: InsertElementRequest) -> DocumentModel:
    """FASE 3 — Inserta un párrafo físico en original.docx y un elemento en
    el modelo. La inserción física es obligatoria: apply_inplace mapea
    modelo↔docx por índice y un elemento nuevo sin párrafo desfasaría todos
    los siguientes. Nunca inserta en la zona de portada (is_cover_section).
    """
    from persistence.session_manager import save_session_snapshot
    from docx import Document
    from docx.oxml import OxmlElement
    from docx.text.paragraph import Paragraph

    doc: Optional[DocumentModel] = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")

    idx = next(
        (i for i, e in enumerate(doc.elements)
         if (e.id if hasattr(e, "id") else e.get("id", "")) == req.after_element_id),
        None,
    )
    if idx is None:
        raise HTTPException(
            status_code=404,
            detail=f"Elemento con ID '{req.after_element_id}' no encontrado.",
        )

    target = doc.elements[idx]
    if getattr(target, "is_cover_section", False):
        raise HTTPException(
            status_code=400,
            detail="No se puede dividir un párrafo de portada.",
        )

    original = STORAGE_DIR / "sessions" / req.session_id / "original.docx"
    d = Document(str(original))
    paragraphs = d.paragraphs

    # Índice del párrafo físico con la MISMA correspondencia que apply_inplace:
    # párrafos NO vacíos del cuerpo (>= body_start), en orden, contra elementos
    # de cuerpo (no portada), en orden. El ordinal global de elementos no sirve
    # (el parser omite vacíos y parte/une la portada).
    from generation.inplace_editor import locate_physical_paragraph
    phys = locate_physical_paragraph(doc, d, idx)
    if phys is None or phys >= len(paragraphs):
        raise HTTPException(status_code=500, detail="Posición de párrafo fuera de rango.")

    src = paragraphs[phys]
    new_p = OxmlElement("w:p")
    src._p.addnext(new_p)
    new_para = Paragraph(new_p, src._parent)
    new_para.style = src.style
    run = new_para.add_run(req.text)
    # Heredar tipografía del párrafo fuente (bold/italic del primer run)
    if src.runs:
        s0 = src.runs[0]
        run.bold = s0.bold
        run.italic = s0.italic
    d.save(str(original))

    try:
        etype = ElementType(req.type)
    except ValueError:
        etype = ElementType.PARAGRAPH
    new_elem = ElementModel(
        id=req.new_element_id,
        type=etype,
        heading_level=req.heading_level,
        text=req.text,
        is_user_modified=True,
        confidence=1.0,
    )
    doc.elements.insert(idx + 1, new_elem)
    save_session_snapshot(doc, STORAGE_DIR)
    save_session_state(doc, STORAGE_DIR)
    return doc


@router.post("/api/elements/insert-image")
async def insert_image_element(req: InsertImageRequest) -> DocumentModel:
    """API de contenido / copiloto — Inserta una imagen física (párrafo con
    imagen inline) y su ElementModel tipo image tras `after_element_id`. Si no
    hay `original.docx` la inserción física se omite (documento aún sintético)
    pero el elemento entra al modelo. Nunca inserta en la zona de portada.
    """
    from docx import Document
    from docx.shared import Cm
    from docx.oxml import OxmlElement
    from docx.text.paragraph import Paragraph
    from models import ImageModel
    from persistence.session_manager import save_session_snapshot

    doc: Optional[DocumentModel] = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")

    idx = next(
        (i for i, e in enumerate(doc.elements)
         if (e.id if hasattr(e, "id") else e.get("id", "")) == req.after_element_id),
        None,
    )
    if idx is None:
        raise HTTPException(
            status_code=404,
            detail=f"Elemento con ID '{req.after_element_id}' no encontrado.",
        )

    target = doc.elements[idx]
    if getattr(target, "is_cover_section", False):
        raise HTTPException(
            status_code=400,
            detail="No se puede insertar una figura en la portada.",
        )

    image_data = {k: v for k, v in req.image.items() if k in ImageModel.model_fields}
    image_data.setdefault("element_id", req.new_element_id)
    image = ImageModel(**image_data)

    original = STORAGE_DIR / "sessions" / req.session_id / "original.docx"
    if original.exists():
        d = Document(str(original))
        paragraphs = d.paragraphs

        # Índice del párrafo físico con la MISMA correspondencia que apply_inplace
        # (párrafos NO vacíos del cuerpo, en orden; el ordinal de elementos no sirve).
        from generation.inplace_editor import locate_physical_paragraph
        phys = locate_physical_paragraph(doc, d, idx)
        if phys is not None and phys < len(paragraphs):
            src = paragraphs[phys]
            new_p = OxmlElement("w:p")
            src._p.addnext(new_p)
            new_para = Paragraph(new_p, src._parent)
            new_para.style = src.style
            try:
                if image.file_path:
                    new_para.add_run().add_picture(
                        image.file_path, width=Cm(image.width_cm or 12.0)
                    )
            except Exception:
                new_para.add_run("[imagen]")
            d.save(str(original))

    element = ElementModel(
        id=req.new_element_id,
        type=ElementType.IMAGE,
        image_info=image,
        is_user_modified=True,
        confidence=1.0,
    )
    image.element_id = element.id
    doc.elements.insert(idx + 1, element)
    save_session_snapshot(doc, STORAGE_DIR)
    save_session_state(doc, STORAGE_DIR)
    return doc


@router.post("/api/detect-similar")
async def detect_similar_headings(req: DetectSimilarRequest) -> dict:
    """
    DespuÃ©s de que el usuario corrige un heading manualmente, buscar otros headings
    con el mismo estilo Word original y longitud similar para ofrecer aplicar
    el mismo cambio en lote.
    """
    doc: Optional[DocumentModel] = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="SesiÃ³n no encontrada.")

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
        # Match: same original style AND similar length (Â±40%)
        if estilo and estilo == source_style and abs(len(texto) - source_len) / max(source_len, 1) < 0.4:
            similar_ids.append(eid)

    return {"similar_ids": similar_ids, "count": len(similar_ids)}


@router.post("/api/replace-image/{session_id}/{element_id}")
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


@router.post("/api/reorder-elements")
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


@router.get("/api/sessions")
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


@router.get("/api/session/{session_id}")
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


@router.delete("/api/session/{session_id}")
async def delete_session_endpoint(session_id: str) -> dict:
    success: bool = delete_session(session_id, STORAGE_DIR)
    if not success:
        raise HTTPException(
            status_code=404,
            detail="Sesion no encontrada o no se pudo eliminar.",
        )
    return {"status": "ok", "message": f"Sesion {session_id} eliminada correctamente."}


@router.get("/api/images/{session_id}/{filename}")
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


@router.post("/api/sessions/{session_id}/snapshot")
async def save_session_snapshot_endpoint(session_id: str) -> dict:
    """
    Guarda un snapshot intermedio del progreso del usuario (sesiÃ³n propia).
    Permite volver a un punto guardado explÃ­citamente (E.2).
    """
    from persistence.session_manager import save_session_snapshot
    doc_model = load_session_state(session_id, STORAGE_DIR)
    if not doc_model:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")
    save_session_snapshot(doc_model, STORAGE_DIR)
    return {"status": "ok", "message": "Progreso guardado", "session_id": session_id}


@router.get("/api/sessions/{session_id}/snapshots")
async def list_session_snapshots_endpoint(session_id: str) -> dict:
    """Historial de puntos guardados de la sesión, del más nuevo al más viejo."""
    from persistence.session_manager import list_session_snapshots
    return {"snapshots": list_session_snapshots(session_id, STORAGE_DIR)}


@router.post("/api/sessions/{session_id}/restore-snapshot/{snapshot_id}")
async def restore_session_snapshot_endpoint(session_id: str, snapshot_id: int) -> DocumentModel:
    """Restaura un snapshot como estado actual y lo persiste.

    Rechaza un snapshot que no pertenezca a esta sesión: sin ese control, un id
    adivinado podría traer el documento de otra persona.
    """
    from persistence.session_manager import load_session_snapshot, save_session_state
    snap = load_session_snapshot(snapshot_id, STORAGE_DIR)
    if not snap or snap.session_id != session_id:
        raise HTTPException(status_code=404, detail="Snapshot no encontrado")
    save_session_state(snap, STORAGE_DIR)
    return snap


@router.post("/api/refresh-from-word/{session_id}")
async def refresh_from_word(session_id: str, ruta: str = Query(...)) -> dict:
    """Relee el `.docx` que tiene Word abierto y devuelve el diff por elemento.

    LO QUE HACE HOY Y NO HACIA: `src/App.tsx:267` atiende el watcher de Word con
    un unico `showToast` que decia "el documento esta sincronizado", y no
    reparseaba nada. Este endpoint es lo que hace que esa frase sea cierta, o la
    frase se va.

    `ruta` la manda el frontend porque el backend no la conoce: Word escribe
    sobre el archivo donde la persona lo tiene, no sobre la copia de la sesion
    (`sessions/<id>/original.docx`). Es leer un archivo del disco local desde
    un backend que escucha en localhost y al que solo habla la app de Electron,
    asi que la confianza es de proceso, no de red — pero aun asi se valida que
    sea un `.docx` y que exista, y no se acepta una ruta arbitraria a ciegas.

    Un `.docx` es un ZIP, y Word lo reescribe entero en cada guardado: si se lee
    a mitad de eso, `zipfile` revienta. Por eso el `BadZipFile` NO es un error
    para la persona sino una respuesta de "todavia no" — el watcher reintenta y
    en el peor caso se queda un guardado sin ver, que es recuperable con el
    siguiente Ctrl+S. Devolver un 500 pondria un error en la cara de alguien que
    esta escribiendo.
    """
    import zipfile

    from modules.word_refresh import diff_por_elemento

    previo = load_session_state(session_id, STORAGE_DIR)
    if not previo:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")

    ruta_docx = Path(ruta)
    if ruta_docx.suffix.lower() != ".docx":
        raise HTTPException(
            status_code=400,
            detail="La ruta tiene que apuntar a un archivo .docx de Word.",
        )
    if not ruta_docx.is_file():
        raise HTTPException(
            status_code=404,
            detail=f"No se encuentra el archivo: {ruta_docx.name}",
        )

    try:
        content = ruta_docx.read_bytes()
    except OSError as e:
        raise HTTPException(
            status_code=503,
            detail=f"No se pudo leer el archivo: {e}",
        )

    # El archivo puede estar a medio escribir. No es un error: se responde
    # "todavia no" y el watcher vuelve a mirar.
    try:
        with zipfile.ZipFile(ruta_docx):
            pass
    except zipfile.BadZipFile:
        return {
            "session_id": session_id,
            "cambiado": False,
            "listo": False,
            "motivo": "archivo_a_medio_escribir",
            "hash_estructura": "",
            "elementos": [],
            "ids_nuevos": [],
            "ids_eliminados": [],
        }

    try:
        # EL MISMO parser que usa /api/upload. Un segundo parser es la clase de
        # divergencia que este proyecto ha pagado varias veces: los dos leen
        # distinto y el diff entre lo que guardo y lo que leyo no dice nada.
        reparseado: DocumentModel = await asyncio.to_thread(
            parse_docx_bytes, content, ruta_docx.name, session_id, STORAGE_DIR,
            skip_page_layout=True,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(
            status_code=422,
            detail=f"El archivo se abrio pero no se pudo interpretar: {e}",
        )

    diff = diff_por_elemento(previo, reparseado)
    diff["session_id"] = session_id
    diff["listo"] = True
    if not diff["cambiado"]:
        # No se reparsea para nada: sin cambios, el estado guardado sigue siendo
        # el bueno y no hay por qué reemplazarlo.
        return diff

    reparseado.file_name = previo.file_name or ruta_docx.name
    reparseado.apa_format = previo.apa_format
    reparseado.profile_id = previo.profile_id
    reparseado.apa_rules = previo.apa_rules
    save_session_state(reparseado, STORAGE_DIR)
    return diff


@router.post("/api/audit-structure/{session_id}")
async def audit_structure_endpoint(session_id: str, request: Request) -> DocAuditResult:
    """
    Engine V2 (P2): AuditorÃ­a global de estructura vÃ­a LLM con salida JSON.
    Analiza heading hierarchy, secciones faltantes, consistencia de citas
    y da sugerencias de formato en espaÃ±ol. Sin API key retorna un resultado
    vacÃ­o indicando que no hay IA configurada.
    """
    doc_model: Optional[DocumentModel] = load_session_state(session_id, STORAGE_DIR)
    if not doc_model:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")

    # Obtener API key del usuario (NVIDIA u otro provider)
    api_key = os.getenv("NVIDIA_API_KEY", "")
    body: dict = {}
    try:
        body = await request.json()
    except Exception:
        pass
    if body.get("api_key"):
        api_key = body["api_key"]

    provider_config = {
        "nim_url": body.get("nim_url", ""),
        "use_local": body.get("use_local", "false") == "true",
        "provider_id": body.get("provider_id", ""),
    }

    result = await audit_document_structure(doc_model, api_key, provider_config)
    return result
