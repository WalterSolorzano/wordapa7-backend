"""Endpoint /api/proofread-batch que conecta el proactive_auditor con el frontend.

El frontend (store/useDocStore -> runProofreadBatch) envía ``{ session_id }`` y
espera ``{ findings, used_llm, ai_indices }`` (ProofreadBatchResponse en
``src/api/backend.ts``).  Para tests y para el add-in también se acepta
``{ texts, element_ids }`` para auditar textos sueltos sin necesidad de una
sesión persistida.

Los hallazgos que devuelve ``audit_elements`` ya tienen el shape exacto que
espera el frontend (``ProofreadFinding`` en ``src/types/index.ts``):
``element_id``, ``start``, ``end``, ``excerpt``, ``kind``, ``severity``,
``message``, ``source`` y opcionalmente ``suggestion``.
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from modules.proactive_auditor import audit_elements, refine_with_llm

router = APIRouter()


class ProofreadRequest(BaseModel):
    session_id: Optional[str] = None
    texts: List[str] = []
    element_ids: List[str] = []
    # La clave y el proveedor los elige el usuario en la pestaña Conexión y
    # llegan en el request. Antes este endpoint no los aceptaba y leia
    # `os.getenv("NVIDIA_API_KEY")`, con lo cual un usuario de Groq, ZenMux,
    # Cerebras, Ollama o HuggingFace se quedaba sin refinamiento de
    # ortografia: la unica auditoria que dispara al abrir el documento.
    api_key: Optional[str] = None
    provider_id: Optional[str] = None


class _ProofElement:
    """Minimal element object compatible with ``proactive_auditor.audit_elements``.

    ``audit_elements`` lee ``.id``, ``.type`` (con ``.value`` si es enum) y
    ``.text``.  Usamos ``type = "paragraph"`` (string plano) para que el
    filtro ``str(etype) in ("paragraph", "para")`` del auditor lo procese.
    """

    def __init__(self, idx: int, text: str, eid: str):
        self.id = eid
        self.type = "paragraph"
        self.text = text
        self.heading_level = None
        # El auditor lee este atributo al construir el mapa de ambitos. Sin el
        # declarado, `getattr(e, "is_cover_section", False)` lo resuelve igual,
        # pero dejarlo explicito hace que este objeto no dependa de un default
        # que vive en otro modulo.
        self.is_cover_section = False


def _build_elements_from_texts(
    texts: List[str], element_ids: Optional[List[str]]
) -> List[_ProofElement]:
    """Construye ``_ProofElement`` a partir de textos sueltos (modo test/add-in)."""
    ids = element_ids or [str(i) for i in range(len(texts))]
    elements: List[_ProofElement] = []
    for i, t in enumerate(texts):
        if t and t.strip():
            eid = ids[i] if i < len(ids) else str(i)
            elements.append(_ProofElement(i, t, eid))
    return elements


def _compute_ai_indices(para_texts: List[str], findings: list) -> Optional[dict]:
    """Calcula los 6 índices de comportamiento IA (opcional, informativo).

    Devuelve ``None`` si el cálculo falla para no romper el endpoint.
    """
    try:
        from modules.ai_indices import compute_ai_indices

        imperfection = sum(
            1 for f in findings if f.get("kind") in ("ortografia", "pegado")
        )
        return compute_ai_indices(para_texts, imperfection_signals=imperfection)
    except Exception:
        return None


@router.post("/api/proofread-batch")
async def proofread_batch(req: ProofreadRequest) -> dict:
    """Revisor por lotes: ortografía, frases IA, texto pegado (local + LLM opcional).

    Dos modos de entrada:
      - ``{ texts, element_ids }``: audita textos sueltos (tests, add-in).
      - ``{ session_id }``: carga la sesión y audita sus párrafos (frontend).

    ``api_key`` y ``provider_id`` son los que la pestaña Conexión eligió, y
    llegan en el body. Devuelve ``{ findings, used_llm, ai_indices }`` — el
    shape que espera el frontend (``ProofreadBatchResponse`` en ``backend.ts``).

    Cada hallazgo de ``findings`` trae ``phase`` y ``read_only``: la fase es lo
    único que la vista necesita para nombrar el hallazgo, y mandarla por
    separado sería una segunda derivación del mismo dato que nadie leía. En el
    modo ``texts`` no hay H1, luego todo cae en ``portada`` y no hay fase de
    prosa que dispare.
    """
    # 1) Construir la lista de elementos a auditar
    if req.texts:
        elements = _build_elements_from_texts(req.texts, req.element_ids)
        para_texts = [e.text for e in elements]
    elif req.session_id:
        from config import STORAGE_DIR
        from persistence.session_manager import load_session_state

        doc = load_session_state(req.session_id, STORAGE_DIR)
        if not doc:
            raise HTTPException(status_code=404, detail="Sesion no encontrada.")
        # audit_elements filtra internamente a type "paragraph"/"para".
        elements = list(doc.elements)
        para_texts = [
            (e.text or "").strip()
            for e in doc.elements
            if (e.text or "").strip() and len((e.text or "").strip()) > 15
        ]
    else:
        return {"findings": [], "used_llm": False, "ai_indices": None}

    if not elements:
        return {"findings": [], "used_llm": False, "ai_indices": None}

    # 2) Auditoría local (siempre disponible, sin red ni API key)
    findings = audit_elements(elements)



    # 3) Refinamiento LLM opcional.
    #    Lo que decide si se intenta es el router, no una variable de entorno:
    #    `refine_with_llm` no lanza, y sin clave ni proveedor devuelve los
    #    hallazgos intactos. La condicion es "hay hallazgos que dudar", que es
    #    la unica que no puede mentir.
    used_llm = False
    if findings:
        try:
            findings, used_llm = await refine_with_llm(
                findings, elements,
                api_key=req.api_key or "",
                provider_id=req.provider_id or None,
            )
        except Exception:
            used_llm = False

    # 4) Índices de IA (opcional, informativo para el panel del frontend)
    ai_indices = _compute_ai_indices(para_texts, findings)

    return {"findings": findings, "used_llm": used_llm, "ai_indices": ai_indices}


class ReformulateRequest(BaseModel):
    text: str
    api_key: Optional[str] = None
    provider_id: Optional[str] = None


# Instrucción fija: la persona pide «reformular» y el motor propone una versión
# con voz de autor; nada se aplica solo (la vista la deja editable).
_REFORMULATE_INSTRUCTION = (
    "Reescribe el párrafo en español académico natural, conservando el "
    "significado y las citas, reduciendo las muletillas y la rigidez sintética."
)


@router.post("/api/ai/reformulate")
async def ai_reformulate(req: ReformulateRequest) -> dict:
    """Propone una reescritura editable de un párrafo. No toca el documento."""
    if not (req.text or "").strip():
        raise HTTPException(status_code=400, detail="Texto vacío.")
    from modules.ai_assistant import rewrite_text_suggestion

    try:
        propuesta = await rewrite_text_suggestion(
            req.text, _REFORMULATE_INSTRUCTION, req.api_key, req.provider_id
        )
    except Exception as exc:  # pragma: no cover - depende del proveedor
        raise HTTPException(status_code=502, detail=str(exc))
    return {"proposal": propuesta}
