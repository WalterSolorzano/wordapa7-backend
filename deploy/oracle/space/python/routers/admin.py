from config import STORAGE_DIR
from fastapi import APIRouter
from persistence.session_manager import maybe_run_gc

router = APIRouter(tags=["admin"])

@router.post("/api/admin/cleanup")
async def cleanup_sessions_endpoint() -> dict:
    """
    Fuerza la limpieza de sesiones expiradas y archivos temporales acumulados.

    Disponible para mantenimiento manual; el GC automático se ejecuta con un
    throttle de ~1h en cada subida de documento.
    """
    deleted = maybe_run_gc(STORAGE_DIR)
    return {
        "status": "ok",
        "sessions_deleted": deleted,
        "message": f"Se eliminaron {deleted} sesiones expiradas y sus archivos temporales asociados."
    }
