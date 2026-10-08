"""Assets de imagen del proyecto: subir un archivo a disco y devolver su id.

F7 Task 1. Antes no existia nada: la imagen del proyecto vivia en un
`URL.createObjectURL` del navegador, que muere con la pestana. Este router le da
un lugar en disco, y `resolveAssetUrl` en el frontend se encarga de la URL.

Se sigue el patron de los otros routers de `routers/`: un `APIRouter` con tag, los
handlers async, y `main.py` lo registra con `include_router`. No se agrega nada
al `main.py` que no sea el `include_router`.
"""
from __future__ import annotations

import re
import uuid
from pathlib import Path

from config import STORAGE_DIR
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

router = APIRouter(tags=["assets"])

# Un id de asset es un UUID en hexadecimal. Es lo que viaja en la URL, asi que se
# valida ANTES de tocar el disco: sin esto, un `asset_id` con `../` sale de la
# carpeta de assets. Es la misma guarda que aplica `PortadaLogo` en `models.py`.
_ASSET_ID = re.compile(r"^[0-9a-f]{32}$")

_EXTENSIONES = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg"}
_LIMITE_BYTES = 20 * 1024 * 1024


def _carpeta_assets() -> Path:
    d = STORAGE_DIR / "assets"
    d.mkdir(parents=True, exist_ok=True)
    return d


@router.post("/api/assets/subir")
async def subir_asset(file: UploadFile = File(...)) -> dict:
    """Sube una imagen a `STORAGE_DIR/assets` y devuelve su identificador.

    El nombre original NO se usa como nombre en disco: se guarda con el id, y el
    nombre que el usuario empezo a escribir viaja en la respuesta para que la
    interfaz lo muestre. Un nombre de archivo es entrada del usuario y va al
    disco; un id generado no.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Archivo no valido.")

    extension = Path(file.filename).suffix.lower()
    if extension not in _EXTENSIONES:
        raise HTTPException(
            status_code=400, detail="Formato de imagen no admitido."
        )

    contenido = await file.read()
    if len(contenido) == 0:
        raise HTTPException(status_code=400, detail="El archivo esta vacio.")
    if len(contenido) > _LIMITE_BYTES:
        raise HTTPException(
            status_code=413, detail="La imagen excede el limite de 20 MB."
        )

    asset_id = uuid.uuid4().hex
    destino = _carpeta_assets() / f"{asset_id}{extension}"
    destino.write_bytes(contenido)

    return {"asset_id": asset_id, "name": Path(file.filename).name}


# El segmento es `archivo` y no un parametro suelto, y el motivo NO es estetico:
# `main.py` sirve los logos institucionales en `/api/assets/logo_uni.png` y
# `/api/assets/logo_unan.png`, y los registra DESPUES de este router. Un
# `/api/assets/{asset_id}` declarado aca se registraria primero, ganaria el
# emparejamiento, y el logo de la UNI pasaria a devolver 400 en vez de la
# imagen: una rota de la portada institucional por agregar un archivo. Un
# subdirectorio propio no se cruza con ninguna de las dos.
@router.get("/api/assets/archivo/{asset_id}")
async def leer_asset(asset_id: str) -> FileResponse:
    """Sirve un asset subido. La validacion del id va antes que la busqueda."""
    if not _ASSET_ID.match(asset_id):
        raise HTTPException(status_code=400, detail="Identificador de asset invalido.")

    for ruta in sorted(_carpeta_assets().glob(f"{asset_id}.*")):
        if ruta.is_file():
            return FileResponse(ruta)
    raise HTTPException(status_code=404, detail="El asset no existe.")
