"""Endpoints del scheduler de IA por demanda (Fase 1 del diseno).

El frontend reporta que elementos se ven (`/api/ai/demand`) y lee el estado real
(`/api/ai/jobs/{session}`). El scheduler es la unica verdad de concurrencia; este
router no ejecuta LLM, solo encola y consulta.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from modules.ai_scheduler import (
    PRIORITY_MANUAL,
    PRIORITY_PREFETCH,
    PRIORITY_VISIBLE,
    get_scheduler,
)

router = APIRouter(tags=["ai-scheduler"])


class DemandRequest(BaseModel):
    session_id: str
    element_ids: List[str] = []
    texts: Dict[str, str] = {}
    motors: List[str] = ["proofread"]
    prefetch: bool = False


class MotorsRequest(BaseModel):
    session_id: str
    motors: List[str] = []


class ResumeRequest(BaseModel):
    session_id: str
    motors: Optional[List[str]] = None


class CancelRequest(BaseModel):
    session_id: str


@router.post("/api/ai/demand")
async def ai_demand(req: DemandRequest) -> dict:
    sched = get_scheduler()
    priority = PRIORITY_PREFETCH if req.prefetch else PRIORITY_VISIBLE
    ids: List[str] = []
    for motor in req.motors:
        items = [
            {"element_id": eid, "text": req.texts.get(eid, ""), "payload": {"element_id": eid}}
            for eid in req.element_ids
        ]
        ids.extend(await sched.enqueue_many(req.session_id, motor, items, priority=priority))
    return {"ids": ids, "status": sched.status(req.session_id)["motores"]}


@router.post("/api/ai/run-all")
async def ai_run_all(req: MotorsRequest) -> dict:
    """El "o lo pida": re-encola lo pendiente con prioridad manual.

    Fase 1: no hay fuente de elementos en el router todavia, asi que "todo" se
    limita a re-encolar los jobs ya conocidos como pendientes. El encolado
    completo del documento llega en la Fase 3 (boton "Revisar todo ahora").
    """
    sched = get_scheduler()
    reencolados = await sched.resume_pending(
        req.session_id, req.motors or None, priority=PRIORITY_MANUAL
    )
    return {"resumed": reencolados}


@router.post("/api/ai/resume")
async def ai_resume(req: ResumeRequest) -> dict:
    sched = get_scheduler()
    reencolados = await sched.resume_pending(req.session_id, req.motors)
    return {"resumed": reencolados}


@router.get("/api/ai/jobs/{session_id}")
async def ai_jobs(session_id: str) -> dict:
    return get_scheduler().status(session_id)


@router.post("/api/ai/cancel")
async def ai_cancel(req: CancelRequest) -> dict:
    cancelados = await get_scheduler().cancel_session(req.session_id)
    return {"cancelled": cancelados}
