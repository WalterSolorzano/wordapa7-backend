"""Proyectos: la entidad, por HTTP.

F7 Task 2. Antes el nombre de un proyecto salia del prefijo del nombre del
archivo y no habia donde guardarlo. Ahora hay un modelo con persistencia, y esto
es su puerta.

Se sigue el patron de `routers/assets.py` (que hizo la F7 Task 1): un
`APIRouter` con tag, handlers async, y `main.py` lo registra con
`include_router`. `main.py` no recibe nada mas que esa linea.

LOS TRES ENDPOINTS Y QUE CADA UNO CONTESTA

- `GET  /api/proyectos`               lista, del mas reciente al mas viejo
- `POST /api/proyectos`               crea uno, y NO.sync: crear no relee disco
- `POST /api/proyectos/{id}/sync`     relee la carpeta y devuelve lo que hay

`crear` y `sync` estan separados a proposito. Crear un proyecto no puede fallar
porque la carpeta no este montada todavia —la persona la elige un segundo antes—,
y si `crear` hiciera el sync, un proyecto recien creado sin carpeta vendria con
error y el usuario leeria que su proyecto esta roto.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from config import STORAGE_DIR
from persistence.proyectos import TiendaProyectos

router = APIRouter(tags=["proyectos"])


class CrearProyectoRequest(BaseModel):
    nombre: str = Field(..., min_length=1, description="Nombre del trabajo. No puede ir vacio.")
    raiz: str | None = Field(None, description="Carpeta de trabajo en disco.")


def _store() -> TiendaProyectos:
    return TiendaProyectos(STORAGE_DIR)


@router.get("/api/proyectos")
async def listar_proyectos() -> dict:
    """Los proyectos, del mas reciente al mas viejo."""
    return {"proyectos": [p.a_dict() for p in _store().listar()]}


@router.post("/api/proyectos")
async def crear_proyecto(req: CrearProyectoRequest) -> dict:
    """Crea un proyecto. No relee el disco: ver el docstring del modulo."""
    try:
        proyecto = _store().crear(nombre=req.nombre, raiz=req.raiz)
    except ValueError as e:
        # El nombre vacio llega aca por el `min_length` de Pydantic si viene con
        # espacios en blanco, que no son un nombre. 400 y no 500: es una entrada
        # invalida, no un fallo del servicio.
        raise HTTPException(status_code=400, detail=str(e)) from e
    return proyecto.a_dict()


@router.post("/api/proyectos/{proyecto_id}/sync")
async def sincronizar_proyecto(proyecto_id: str) -> dict:
    """Relee la carpeta del proyecto y devuelve lo que hay en disco.

    IDEMPOTENTE: llamarlo dos veces no duplica documentos. Se reemplaza la lista
    en vez de unirla, porque unir hace que la lista crezca en cada pulsacion.

    Y si la carpeta no se puede leer, NO se vacia la lista: se conserva y se
    devuelve el error. Un proyecto sin documentos parece un proyecto vacio, que
    es la peor lectura posible de un fallo que quiza ni existe.
    """
    store = _store()
    proyecto = store.obtener(proyecto_id)
    if proyecto is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")

    resultado = store.sync(proyecto)
    return {
        "proyecto": store.obtener(proyecto_id).a_dict(),
        "documentos": resultado.documentos,
        "error": resultado.error,
    }


@router.delete("/api/proyectos/{proyecto_id}")
async def borrar_proyecto(proyecto_id: str) -> dict:
    """Borra un proyecto. LAS SESIONES NO SE TOCAN.

    Un proyecto es un conjunto de sesiones, no las sesiones. Borrar el proyecto
    quita el agrupador y deja los documentos donde estaban, que es lo unico que
    se puede hacer sin que "borrar un proyecto" signifique "borrar el trabajo de
    alguien" sin avisar.
    """
    if not _store().borrar(proyecto_id):
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    return {"status": "ok", "id": proyecto_id}
