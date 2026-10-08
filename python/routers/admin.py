from config import STORAGE_DIR
from fastapi import APIRouter
from persistence.session_manager import cleanup_expired_sessions

router = APIRouter(tags=["admin"])


def _mib(bytes_libres: int) -> str:
    """Mismo número que la barra de tareas usaría. Un '0 B' cuando se liberaron
    900 KB sería una forma elegante de no decir nada."""
    if bytes_libres < 1024:
        return f"{bytes_libres} B"
    if bytes_libres < 1024 * 1024:
        return f"{bytes_libres / 1024:.0f} KB"
    return f"{bytes_libres / (1024 * 1024):.1f} MB"


@router.post("/api/admin/cleanup")
async def cleanup_sessions_endpoint() -> dict:
    """
    Limpieza manual: borra lo vencido y DICE QUÉ BORRÓ.

    Antes llamaba a `maybe_run_gc`, que tiene un throttle de ~1h: apretar el
    botón dos veces en cinco minutos devolvía cero la segunda vez, y el botón
    informaba que no había nada que borrar cuando en realidad no se había mirado
    nada. Ahora va con `force=True`, que es lo único que cambia.

    Se sigue corriendo automático en cada subida de documento, con su throttle;
    este endpoint es el que se apretó a propósito.
    """
    contadores: dict = {}
    sesiones = cleanup_expired_sessions(STORAGE_DIR, force=True, contadores=contadores)
    archivos = contadores.get("archivos_temporales", 0)
    bytes_libres = contadores.get("bytes", 0)

    if sesiones == 0 and archivos == 0:
        mensaje = "No había nada que borrar: no hay sesiones vencidas ni archivos temporales."
    else:
        partes = []
        if sesiones:
            partes.append(f"{sesiones} {'sesión vencida' if sesiones == 1 else 'sesiones vencidas'}")
        if archivos:
            partes.append(f"{archivos} {'archivo temporal' if archivos == 1 else 'archivos temporales'}")
        mensaje = f"Se borraron {' y '.join(partes)} ({_mib(bytes_libres)})."

    return {
        "status": "ok",
        "sesiones_borradas": sesiones,
        "archivos_temporales": archivos,
        "bytes": bytes_libres,
        "message": mensaje,
        # Se conserva el nombre viejo porque algún cliente puede seguir leyéndolo.
        "sessions_deleted": sesiones,
    }
