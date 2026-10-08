"""CRUD de presets de estilo. Builtin en repo, usuario en STORAGE_DIR/presets."""
from __future__ import annotations

from typing import Optional

from config import STORAGE_DIR
from fastapi import APIRouter, HTTPException, Query
from preset_store import (
    PRESET_TYPES,
    BuiltinDeleteError,
    PresetExists,
    PresetNotFound,
    PresetPayload,
    delete_preset,
    get_preset,
    list_presets,
    save_preset,
)
from pydantic import ValidationError

router = APIRouter(tags=["presets"])


def _cover_records() -> list[dict]:
    """Plantillas de portada del cover-designer con forma de PresetRecord.

    Proxy SOLO lectura para descubrimiento unico del agente: la fuente
    unica sigue siendo /api/cover-templates (nada se guarda ni borra aqui).
    """
    from modules.cover_designer import list_cover_templates
    return [{
        "name": t.name,
        "type": "cover",
        "description": t.description,
        "definition": {"source_type": t.source_type},
        "version": 1,
        "created_at": t.created_at,
        "updated_at": "",
        "origin": "builtin" if t.is_builtin else "user",
    } for t in list_cover_templates(STORAGE_DIR)]


@router.get("/api/presets")
async def list_presets_endpoint(
        type: Optional[str] = Query(
            None,
            openapi_examples={
                "portadas": {
                    "summary": "Plantillas de portada",
                    "description": ("Proxy solo lectura de "
                                    "cover-templates (fuente unica)."),
                    "value": "cover",
                },
            },
        ),
) -> list[dict]:
    """Lista presets; type=cover (y el listado sin filtro) incluye portadas."""
    if type is None:
        return ([p.model_dump() for p in list_presets(STORAGE_DIR, None)]
                + _cover_records())
    if type == "cover":
        return _cover_records()
    if type not in PRESET_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Tipo '{type}' desconocido. Validos: "
                   f"{sorted(PRESET_TYPES) + ['cover']}.")
    return [p.model_dump() for p in list_presets(STORAGE_DIR, type)]


@router.get("/api/presets/{name}")
async def get_preset_endpoint(name: str) -> dict:
    """Detalle de un preset (usuario pisa builtin); resuelve portadas."""
    try:
        return get_preset(name, STORAGE_DIR).model_dump()
    except PresetNotFound as e:
        for rec in _cover_records():
            if rec["name"] == name:
                return rec
        raise HTTPException(status_code=404,
                            detail={"detail": str(e), "available": e.available})


@router.post("/api/presets")
async def save_preset_endpoint(payload: PresetPayload) -> dict:
    """Guarda un preset (explícito). Sin overwrite y ya existe -> 409."""
    try:
        return save_preset(payload, STORAGE_DIR).model_dump()
    except PresetExists:
        raise HTTPException(status_code=409,
                            detail=f"Preset '{payload.name}' ya existe. "
                                   f"Usa overwrite=true.")
    except ValidationError as e:
        raise HTTPException(
            status_code=422,
            detail=[{"path": ".".join(str(x) for x in err["loc"]),
                     "msg": err["msg"]} for err in e.errors()])


@router.delete("/api/presets/{name}")
async def delete_preset_endpoint(name: str) -> dict:
    """Borra preset de usuario. Builtin -> 400."""
    try:
        delete_preset(name, STORAGE_DIR)
        return {"status": "ok", "deleted": name}
    except BuiltinDeleteError:
        raise HTTPException(status_code=400,
                            detail=f"'{name}' es builtin y no se puede borrar.")
    except PresetNotFound as e:
        for rec in _cover_records():
            if rec["name"] == name:
                raise HTTPException(
                    status_code=422,
                    detail=f"'{name}' es una plantilla de portada: se gestiona "
                           f"en /api/cover-templates, aqui solo presets.")
        raise HTTPException(status_code=404,
                            detail={"detail": str(e), "available": e.available})
