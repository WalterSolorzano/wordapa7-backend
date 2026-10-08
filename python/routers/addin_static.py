"""
WordAPA7 — Router de archivos estáticos del Word Add-in (Office.js)

Sirve los archivos construidos del Add-in (taskpane.html, commands.html, JS,
CSS, iconos) bajo la ruta ``/addin/`` para que el panel de Word pueda cargarse
directamente desde el backend de Python, sin necesidad de un servidor de
desarrollo separado en HTTPS:3000.

Además, expone un endpoint dinámico ``GET /api/addin/manifest`` que lee la
plantilla ``manifest.xml``, reemplaza la URL de desarrollo
(``https://localhost:3000``) por la URL real del Add-in y la devuelve como
``application/xml``.

MODO LOCAL HTTPS (por defecto en Windows):
  - El backend genera certificados SSL auto-firmados con ``ssl_cert_gen.py``
    (librería ``cryptography``) y los instala silenciosamente en el Trusted
    Root store de Windows vía CryptoAPI (ctypes, 100% in-process, sin diálogos).
  - El Add-in se sirve desde el propio backend en ``https://localhost:8742/addin/``.
  - El manifiesto apunta a la URL del backend (derivada de la petición).
  - El certificado se registra automáticamente en el registro de Windows
    para que Word lo cargue sin intervención del usuario.

MODO PRODUCCIÓN (URL pública):
  - El Add-in se carga desde una URL HTTPS pública configurada con la
    variable de entorno ``WORDAPA7_ADDIN_PUBLIC_URL``.
  - El backend corre localmente en ``http://127.0.0.1:8742`` (HTTP plano).
  - El frontend del Add-in se comunica con el backend local.

Endpoints:
  GET  /api/addin/manifest         — manifiesto XML dinámico (URL del Add-in)
  GET  /api/addin/manifest-info     — metadatos del manifiesto (URL de descarga)
  GET  /api/addin/registry-sideload — registra el Add-in en el registro de Windows
  GET  /api/addin/auto-setup        — configuración completa en una sola llamada

Función:
  init_addin_static(app)             — monta los archivos estáticos en ``/addin/``
"""

import os
import shutil
import sys
from datetime import datetime, timezone
from runtime_flags import use_ssl as _rf_use_ssl
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from config import BASE_DIR, STORAGE_DIR, _is_packaged

router = APIRouter(prefix="/api/addin", tags=["word-addin-static"])

# URL base del servidor de desarrollo del Add-in (lo que está en manifest.xml).
# Esta URL debe ser exactamente lo que está en manifest.xml para poder reemplazarla.
_DEV_ADDIN_URL = "https://localhost:3000"
# Fallback: the source manifest.xml (word-addin/manifest.xml) uses a different URL.
# This ensures replacement works regardless of which manifest is found.
# "https://localhost:8742/addin" is included because that is the actual URL
# used in the source manifest.xml — without it the replacement would be a no-op
# in production (public URL) mode.
_DEV_ADDIN_URLS = ["https://localhost:3000", "http://localhost:8742/addin", "https://localhost:8742/addin"]


# ── RESOLUCIÓN DE LA URL DEL ADD-IN ──────────────────────────────────────────

def _resolve_addin_base_url(request: Optional[Request] = None) -> str:
    """
    Determina la URL base del Add-in para usar en el manifiesto dinámico.

    Orden de prioridad:
      1. ``WORDAPA7_ADDIN_PUBLIC_URL`` — URL HTTPS pública (modo producción).
         El Add-in se carga desde aquí y se comunica con el backend local.
      2. URL del backend derivada de la petición + ``/addin`` — desarrollo
         local (cuando el Add-in lo sirve el propio backend).

    En el caso 1, la URL pública ya incluye la ruta base del Add-in
    (ej. ``https://wordapa7.pages.dev``), por lo que no se le añade
    ``/addin``. En el caso 2, el backend sirve los archivos en ``/addin/``.
    """
    public_url = os.environ.get("WORDAPA7_ADDIN_PUBLIC_URL", "").strip()
    if public_url:
        # Quitar trailing slash para que las concatenaciones sean consistentes.
        return public_url.rstrip("/")

    # Modo local SSL (comportamiento por defecto en Windows).
    # Office Add-ins REQUIEREN HTTPS; el backend sirve el Add-in en
    # https://localhost:8742/addin con certificado auto-firmado.
    # No usamos request.base_url aquí porque el TestClient de FastAPI
    # produce http://testserver, lo que daría una URL HTTP incorrecta.
    ssl_enabled = _rf_use_ssl()
    if ssl_enabled:
        return "https://localhost:8742/addin"

    # SSL deshabilitado (modo HTTP plano): usar la URL de la petición.
    if request is not None:
        base_url = str(request.base_url).rstrip("/")
        return f"{base_url}/addin"

    return "http://127.0.0.1:8742/addin"


def _get_backend_api_url() -> str:
    """
    URL del backend que el frontend del Add-in debe usar para llamadas a la API.

    En modo producción (sin SSL): ``http://127.0.0.1:8742`` (o el valor de
    ``WORDAPA7_BACKEND_URL`` si está seteado).
    En modo desarrollo HTTPS: ``https://127.0.0.1:8742``.
    """
    public_url = os.environ.get("WORDAPA7_ADDIN_PUBLIC_URL", "").strip()
    ssl_enabled = _rf_use_ssl()
    if ssl_enabled and not public_url:
        return "https://127.0.0.1:8742"
    return os.environ.get("WORDAPA7_BACKEND_URL", "").strip() or "http://127.0.0.1:8742"


def _generate_manifest_to_storage(request: Optional[Request] = None) -> Optional[Path]:
    """
    Genera el manifiesto XML con las URLs correctas y lo escribe en STORAGE_DIR.

    Lee la plantilla ``manifest.xml``, reemplaza las URLs de desarrollo por la
    URL real del Add-in y lo guarda en ``STORAGE_DIR/manifest.xml``.

    Retorna la ruta del archivo generado, o ``None`` si no se pudo generar.
    """
    manifest_path = _get_addin_manifest_path()
    if not manifest_path or not manifest_path.exists():
        print("[WARN] [ADD-IN] No se encontró la plantilla de manifest.xml")
        return None

    xml_content = manifest_path.read_text(encoding="utf-8")
    addin_base_url = _resolve_addin_base_url(request)

    # Reemplazar todas las URLs de desarrollo conocidas
    xml_content = xml_content.replace(_DEV_ADDIN_URL, addin_base_url)
    for _old_url in _DEV_ADDIN_URLS:
        xml_content = xml_content.replace(_old_url, addin_base_url)

    # Fallback final: hosts desnudos sin ruta /addin (p.ej. <AppDomains>).
    # Debe correr DESPUÉS de los reemplazos con ruta para no romperlos.
    if addin_base_url.endswith("/addin"):
        _bare_host = addin_base_url[: -len("/addin")]
        for _old_host in ("https://localhost:8742", "http://localhost:8742"):
            xml_content = xml_content.replace(_old_host, _bare_host)

    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    manifest_dest = STORAGE_DIR / "manifest.xml"
    manifest_dest.write_text(xml_content, encoding="utf-8")
    print(f"[ADD-IN] Manifiesto generado en: {manifest_dest} -> apuntando a {addin_base_url}")
    return manifest_dest


# ── RESOLUCIÓN DE RUTAS DE ARCHIVOS ──────────────────────────────────────────

def _get_addin_dist_dir() -> Optional[Path]:
    """
    Busca el directorio con los archivos construidos del Add-in.

    Orden de búsqueda:
      1. ``word-addin/dist/``  — entorno de desarrollo
      2. ``dist/addin/``       — build local (cuando se copia a dist/)
      3. ``resources/addin/``  — producción (embedded Python o PyInstaller)

    En modo empaquetado (embedded Python), la estructura es::

        resources/
          python-runtime/       ← python.exe
            python/             ← código fuente
          addin/                ← taskpane.html, manifest.xml, etc.

    Por lo tanto, desde ``sys.executable`` (``resources/python-runtime/python.exe``),
    el directorio ``addin/`` está en ``parent.parent / "addin"``
    (``parent`` = ``python-runtime/``, ``parent.parent`` = ``resources/``).

    Retorna el primer directorio que contenga ``taskpane.html``, o ``None``
    si no se encuentra ninguno.
    """
    candidates: list[Path] = []

    if _is_packaged():
        # Modo empaquetado (embedded Python o PyInstaller legacy).
        # python.exe está en resources/python-runtime/ (embedded Python) o
        # resources/python-backend/ (PyInstaller legacy).
        # El Add-in está en resources/addin/ (sibling del directorio del exe).
        exe_dir = Path(sys.executable).parent       # resources/python-runtime/
        candidates.append(exe_dir.parent / "addin")  # resources/addin/
        # Fallbacks por si la estructura varía
        candidates.append(exe_dir / "addin")
        candidates.append(exe_dir.parent.parent / "addin")
    else:
        # Desarrollo: word-addin/dist/ en la raíz del proyecto
        candidates.append(BASE_DIR / "word-addin" / "dist")
        candidates.append(BASE_DIR / "dist" / "addin")

    for path in candidates:
        if path.is_dir() and (path / "taskpane.html").exists():
            return path

    return None


def _get_addin_manifest_path() -> Optional[Path]:
    """
    Busca el archivo ``manifest.xml`` del Add-in.

    Orden de búsqueda:
      1. Dentro del directorio dist del Add-in (``manifest.xml`` copiado)
      2. ``word-addin/manifest.xml`` — desarrollo (fuente)
      3. ``resources/addin/manifest.xml`` — producción (embedded Python o
         PyInstaller)

    En modo empaquetado, el manifiesto está en ``resources/addin/manifest.xml``.
    Ver ``_get_addin_dist_dir`` para el cálculo de rutas.
    """
    # 1. Buscar dentro del directorio dist del Add-in (el build lo copia)
    dist_dir = _get_addin_dist_dir()
    if dist_dir:
        manifest_in_dist = dist_dir / "manifest.xml"
        if manifest_in_dist.exists():
            return manifest_in_dist

    # 2. Buscar en ubicaciones fuente / de producción
    candidates: list[Path] = []
    if _is_packaged():
        exe_dir = Path(sys.executable).parent       # resources/python-runtime/
        candidates.append(exe_dir.parent / "addin" / "manifest.xml")   # resources/addin/manifest.xml
        # Fallbacks por si la estructura varía
        candidates.append(exe_dir / "addin" / "manifest.xml")
        candidates.append(exe_dir.parent.parent / "addin" / "manifest.xml")
    else:
        candidates.append(BASE_DIR / "word-addin" / "manifest.xml")

    for path in candidates:
        if path.exists():
            return path

    return None


# ── MONTAJE DE ARCHIVOS ESTÁTICOS ────────────────────────────────────────────

def init_addin_static(app) -> None:
    """
    Monta los archivos estáticos del Add-in en la ruta ``/addin/``.

    Debe llamarse **después** de registrar los routers de la API y **antes**
    de montar el SPA catch-all (``app.mount("/", StaticFiles(...))``), para
    que las rutas ``/addin/...`` tengan prioridad sobre la captura genérica.

    Si no se encuentran los archivos del Add-in, se registra un aviso pero no
    se lanza error: el resto del backend sigue funcionando con normalidad.

    En modo producción con ``WORDAPA7_ADDIN_PUBLIC_URL`` seteada, los
    archivos del Add-in se sirven desde la URL pública (no desde el backend).
    Sin embargo, el montaje local sigue siendo útil para desarrollo y como
    fallback.
    """
    public_url = os.environ.get("WORDAPA7_ADDIN_PUBLIC_URL", "").strip()
    if public_url:
        print(
            f"[ADD-IN] Modo PRODUCCIÓN: Add-in servido desde URL pública: {public_url}\n"
            f"         Backend API en: {_get_backend_api_url()}"
        )

    class _NoCacheStaticFiles(StaticFiles):
        async def get_response(self, path, scope):
            response = await super().get_response(path, scope)
            response.headers.setdefault("Cache-Control", "no-store")
            return response

    addin_dir = _get_addin_dist_dir()
    if addin_dir and addin_dir.is_dir():
        app.mount(
            "/addin",
            _NoCacheStaticFiles(directory=str(addin_dir), html=True),
            name="addin-static",
        )
        print(f"[ADD-IN] Archivos estáticos montados desde: {addin_dir}")
    else:
        print(
            "[ADD-IN] No se encontró el directorio del Add-in. "
            "Ejecuta 'npm run build:addin' para construirlo."
        )


# ── ENDPOINTS DE LA API ──────────────────────────────────────────────────────

@router.get("/manifest")
async def get_addin_manifest(request: Request):
    """
    Devuelve el manifiesto XML del Add-in con la URL del Add-in dinámica.

    Lee ``manifest.xml`` y reemplaza ``https://localhost:3000`` por la URL
    real del Add-in:

    - **Producción**: si ``WORDAPA7_ADDIN_PUBLIC_URL`` está seteada, las URLs
      del manifiesto apuntan a la URL pública HTTPS (ej.
      ``https://wordapa7.pages.dev``). El Add-in se carga desde allí y se
      comunica con el backend local en ``http://127.0.0.1:8742``.
    - **Desarrollo/SSL local**: las URLs apuntan al backend
      (``http://localhost:8742/addin`` o ``https://localhost:8742/addin``).

    Ejemplo de reemplazo (producción):
      - ``https://localhost:3000/taskpane.html``
        → ``https://wordapa7.pages.dev/taskpane.html``

    Ejemplo de reemplazo (desarrollo local):
      - ``https://localhost:3000/taskpane.html``
        → ``http://localhost:8742/addin/taskpane.html``
    """
    manifest_path = _get_addin_manifest_path()
    if not manifest_path or not manifest_path.exists():
        raise HTTPException(
            status_code=404,
            detail="No se encontró el archivo manifest.xml del Add-in. "
                   "Ejecuta 'npm run build:addin' para construirlo.",
        )

    # Resolver la URL base del Add-in (pública o local).
    addin_base_url = _resolve_addin_base_url(request)

    # Leer la plantilla del manifiesto y reemplazar la URL de desarrollo.
    xml_content = manifest_path.read_text(encoding="utf-8")
    xml_content = xml_content.replace(_DEV_ADDIN_URL, addin_base_url)
    for _old_url in _DEV_ADDIN_URLS:
        xml_content = xml_content.replace(_old_url, addin_base_url)

    return Response(content=xml_content, media_type="application/xml")


@router.get("/manifest-info")
async def get_addin_manifest_info(request: Request) -> dict:
    """
    Devuelve metadatos sobre el manifiesto del Add-in.

    Permite que Electron (o el usuario) descubra la URL desde donde se puede
    descargar el manifiesto dinámico, así como el estado de disponibilidad
    de los archivos del Add-in.

    En modo producción (``WORDAPA7_ADDIN_PUBLIC_URL``), ``taskpane_url`` y
    ``commands_url`` apuntan a la URL pública, mientras que ``manifest_url``
    apunta al backend local (que genera el manifiesto dinámico).
    """
    public_url = os.environ.get("WORDAPA7_ADDIN_PUBLIC_URL", "").strip().rstrip("/") or None
    addin_base_url = _resolve_addin_base_url(request)
    base_url = str(request.base_url).rstrip("/")
    manifest_url = f"{base_url}/api/addin/manifest"
    addin_dir = _get_addin_dist_dir()
    manifest_path = _get_addin_manifest_path()
    backend_api_url = _get_backend_api_url()

    return {
        "manifest_url": manifest_url,
        "taskpane_url": f"{addin_base_url}/taskpane.html" if addin_dir or public_url else None,
        "commands_url": f"{addin_base_url}/commands.html" if addin_dir or public_url else None,
        "available": addin_dir is not None,
        "manifest_available": manifest_path is not None,
        "addin_dist_path": str(addin_dir) if addin_dir else None,
        # Información del modo de operación.
        "mode": "production_http" if not public_url else "production_public",
        "public_addin_url": public_url,
        "backend_api_url": backend_api_url,
        "hint": (
            f"Add-in cargado desde URL pública ({public_url}) → backend en {backend_api_url}"
            if public_url
            else f"Add-in servido localmente desde {addin_base_url}"
        ),
    }


@router.get("/registry-sideload")
async def registry_sideload(request: Request) -> dict:
    """
    Registra el manifiesto del Add-in en el registro de Windows para
    que Word lo cargue automáticamente (sideload sin intervención manual).

    Escribe en:
      HKCU\\Software\\Microsoft\\Office\\16.0\\Wef\\Developer\\WordAPA7
      → (Default) = <Ruta del manifiesto XML local en STORAGE_DIR>

    Este es el mecanismo oficial de Office para sideload de desarrolladores.
    No requiere permisos de administrador (usa HKCU).
    Es idempotente: llamarlo múltiples veces actualiza la ruta sin duplicar.
    """
    if sys.platform != "win32":
        return {
            "status": "not_supported",
            "reason": "El registro de Windows solo está disponible en Windows",
        }

    try:
        import winreg

        # Asegurar de escribir el archivo actualizado en STORAGE_DIR
        manifest_dest = _generate_manifest_to_storage(request)
        if not manifest_dest:
            return {
                "status": "error",
                "reason": "No se pudo generar el manifiesto del Add-in",
            }

        # Clave oficial de sideload de desarrolladores de Office
        reg_path = r"Software\Microsoft\Office\16.0\Wef\Developer"
        key_name = "WordAPA7"

        # Crear / abrir la clave (CREATE_KEY es idempotente)
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, reg_path) as wef_key:
            winreg.SetValueEx(wef_key, key_name, 0, winreg.REG_SZ, str(manifest_dest))

        full_key = f"HKCU\\{reg_path}\\{key_name}"
        public_url = os.environ.get("WORDAPA7_ADDIN_PUBLIC_URL", "").strip() or None
        return {
            "status": "ok",
            "registry_key": full_key,
            "manifest_path": str(manifest_dest),
            "public_addin_url": public_url,
            "hint": (
                "Reinicia Word para que detecte el Add-in. "
                "Si no aparece, ve a Insertar → Mis complementos → Complementos de desarrollador."
            ),
        }

    except ImportError:
        return {
            "status": "error",
            "reason": "winreg no disponible en este entorno Python",
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al escribir en el registro de Windows: {e}",
        )


@router.get("/auto-setup")
async def auto_setup_addin(request: Request) -> dict:
    """
    Configuración completa del Add-in en una sola llamada.

    Este endpoint hace TODO lo necesario para que el complemento aparezca
    en Word sin intervención del usuario:

    1. **Generar el manifiesto** con las URLs HTTPS correctas y lo guarda
       en ``STORAGE_DIR/manifest.xml``.
    2. **Registrar en el registro de Windows** (sideload de desarrollador):
       ``HKCU\\Software\\Microsoft\\Office\\16.0\\Wef\\Developer\\WordAPA7``
    3. **Copiar el manifiesto a un catálogo compartido** como fallback:
       ``%APPDATA%\\WordAPA7\\catalog\\manifest.xml``
    4. **Verificar el certificado SSL** esté en el Trusted Root store.

    Es llamado automáticamente por Electron (``python-manager.ts``) cuando
    el backend está listo. No requiere que el usuario haga nada manualmente.

    Es idempotente: llamarlo múltiples veces es seguro y no duplica nada.

    Retorna un resumen con el estado de cada paso.
    """
    result = {
        "status": "ok",
        "platform": sys.platform,
        "steps": {},
    }

    # ── Paso 1: Generar el manifiesto ──────────────────────────────────
    try:
        manifest_dest = _generate_manifest_to_storage(request)
        if manifest_dest:
            result["steps"]["manifest"] = {
                "status": "ok",
                "path": str(manifest_dest),
            }
            # Verificar que el manifiesto tenga URLs HTTPS
            xml = manifest_dest.read_text(encoding="utf-8")
            if "https://localhost:8742" in xml or "https://127.0.0.1:8742" in xml:
                result["steps"]["manifest"]["urls"] = "https_ok"
            else:
                result["steps"]["manifest"]["urls"] = "warning: no https urls found"
        else:
            result["steps"]["manifest"] = {"status": "error", "reason": "manifest.xml not found"}
            result["status"] = "partial"
    except Exception as e:
        result["steps"]["manifest"] = {"status": "error", "reason": str(e)}
        result["status"] = "partial"

    # ── Paso 2: Registrar en el registro de Windows (sideload) ─────────
    if sys.platform == "win32":
        try:
            import winreg

            manifest_path_str = str(STORAGE_DIR / "manifest.xml")
            reg_path = r"Software\Microsoft\Office\16.0\Wef\Developer"
            key_name = "WordAPA7"

            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, reg_path) as wef_key:
                winreg.SetValueEx(wef_key, key_name, 0, winreg.REG_SZ, manifest_path_str)

            result["steps"]["registry"] = {
                "status": "ok",
                "key": f"HKCU\\{reg_path}\\{key_name}",
                "value": manifest_path_str,
            }
            print(f"[ADD-IN] [auto-setup] Registro: HKCU\\{reg_path}\\{key_name} = {manifest_path_str}")
        except Exception as e:
            result["steps"]["registry"] = {"status": "error", "reason": str(e)}
            result["status"] = "partial"
            print(f"[WARN] [ADD-IN] [auto-setup] Error en registro: {e}")

            # ── Paso 2a: caché de Word — claves viejas del Id anterior y Wef local ──
        # Si el manifiesto cambia de <Id>, Word conserva la app vieja rechazada
        # en su caché (%LOCAPP%\Microsoft\Office\16.0\Wef) y NUNCA muestra la
        # nueva. Registramos AMBAS claves (nombre legible + Id actual) y
        # limpiamos carpetas de caché {GUID} que referencien manifests nuestros.
        try:
            manifest_for_cache = STORAGE_DIR / "manifest.xml"
            reg_path = r"Software\Microsoft\Office\16.0\Wef\Developer"
            import uuid as _uuid
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, reg_path) as wef_key:
                winreg.SetValueEx(wef_key, "WordAPA7", 0, winreg.REG_SZ, str(manifest_for_cache))
                try:
                    _id_line = ""
                    for _ln in manifest_for_cache.read_text(encoding="utf-8").splitlines():
                        if "<Id>" in _ln:
                            _id_line = _ln.replace("<Id>", "").replace("</Id>", "").strip()
                            break
                    if _id_line:
                        winreg.SetValueEx(wef_key, _id_line, 0, winreg.REG_SZ, str(manifest_for_cache))
                except Exception:
                    pass
            result["steps"]["registry"] = {
                "status": "ok",
                "key": f"HKCU\\{reg_path}\\WordAPA7 (+Id)",
                "value": str(manifest_for_cache),
            }
            # Purga de caché local SOLO cuando cambió el Id del manifiesto
            # (purga en cada request costaba minutos con stores lockeados).
            marker = STORAGE_DIR / ".wef_purge_marker"
            try:
                current_sig = ""
                if manifest_for_cache.exists():
                    for _ln in manifest_for_cache.read_text(encoding="utf-8").splitlines():
                        if "<Id>" in _ln:
                            current_sig = _ln.strip()
                            break
            except Exception:
                current_sig = ""

            if marker.exists() and marker.read_text(encoding="utf-8", errors="ignore").strip() == current_sig and current_sig:
                result["steps"]["wef_cache"] = {"status": "ok", "purged": 0, "skipped": "sin cambios"}
            else:
                wef_cache = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "Office" / "16.0" / "Wef"
                purged = []
                if wef_cache.exists():
                    for sub in list(wef_cache.iterdir()):
                        name = sub.name.upper()
                        if sub.is_dir() and name.startswith("{") and name.endswith("}"):
                            try:
                                import shutil as _sh
                                _sh.rmtree(sub, ignore_errors=True)
                                purged.append(name)
                            except Exception:
                                pass
                    for cache_sub in ("AddinInfo", "AppCommands"):
                        d = wef_cache / cache_sub
                        if d.exists():
                            try:
                                import shutil as _sh
                                _sh.rmtree(d, ignore_errors=True)
                                purged.append(cache_sub)
                            except Exception:
                                pass
                try:
                    marker.write_text(current_sig, encoding="utf-8")
                except Exception:
                    pass
                result["steps"]["wef_cache"] = {"status": "ok", "purged": len(purged)}
        except Exception as e:
            result["steps"]["registry"] = {"status": "error", "reason": str(e)}
            result["status"] = "partial"

        # ── Paso 2b: Sideload REAL (carpeta System Feed que Word vigila) ──        # El registro Wef\\Developer NO es un mecanismo de descubrimiento de
        # Office. Word sideloadea complementos de desarrollador leyendo los
        # .xml sueltos dentro de:
        #   %APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Microsoft Office System Feed\\
        try:
            manifest_src = STORAGE_DIR / "manifest.xml"
            if manifest_src.exists():
                feed_dir = (
                    Path(os.environ.get("APPDATA", str(Path.home() / "AppData" / "Roaming")))
                    / "Microsoft" / "Windows" / "Start Menu" / "Programs"
                    / "Microsoft Office System Feed"
                )
                feed_dir.mkdir(parents=True, exist_ok=True)
                feed_manifest = feed_dir / "WordAPA7.xml"
                shutil.copy2(str(manifest_src), str(feed_manifest))
                result["steps"]["system_feed"] = {
                    "status": "ok",
                    "path": str(feed_manifest),
                }
                print(f"[ADD-IN] [auto-setup] System Feed: {feed_manifest}")
            else:
                result["steps"]["system_feed"] = {
                    "status": "skipped",
                    "reason": "no manifest to copy",
                }
        except Exception as e:
            result["steps"]["system_feed"] = {"status": "error", "reason": str(e)}
            result["status"] = "partial"
            print(f"[WARN] [ADD-IN] [auto-setup] Error en System Feed: {e}")

        # ── Paso 3: Copiar a catálogo compartido (fallback) ────────────
        try:
            catalog_dir = STORAGE_DIR.parent / "catalog"
            catalog_dir.mkdir(parents=True, exist_ok=True)
            catalog_manifest = catalog_dir / "manifest.xml"
            manifest_src = STORAGE_DIR / "manifest.xml"
            if manifest_src.exists():
                shutil.copy2(str(manifest_src), str(catalog_manifest))
                result["steps"]["catalog"] = {
                    "status": "ok",
                    "path": str(catalog_manifest),
                }
                print(f"[ADD-IN] [auto-setup] Catálogo: {catalog_manifest}")
            else:
                result["steps"]["catalog"] = {"status": "skipped", "reason": "no manifest to copy"}
        except Exception as e:
            result["steps"]["catalog"] = {"status": "error", "reason": str(e)}
            result["status"] = "partial"

        # ── Paso 4: Verificar certificado SSL ──────────────────────────
        try:
            certs_dir = STORAGE_DIR / "ssl"
            cert_path = certs_dir / "localhost.pem"
            key_path = certs_dir / "localhost-key.pem"
            ssl_ok = cert_path.exists() and key_path.exists()
            result["steps"]["ssl"] = {
                "status": "ok" if ssl_ok else "missing",
                "cert_path": str(cert_path) if cert_path.exists() else None,
            }
            if ssl_ok:
                print("[ADD-IN] [auto-setup] SSL: certificado presente")
            else:
                print("[WARN] [ADD-IN] [auto-setup] SSL: certificado NO encontrado")
        except Exception as e:
            result["steps"]["ssl"] = {"status": "error", "reason": str(e)}

    else:
        result["steps"]["registry"] = {"status": "skipped", "reason": "not windows"}
        result["steps"]["catalog"] = {"status": "skipped", "reason": "not windows"}
        result["steps"]["ssl"] = {"status": "skipped", "reason": "not windows"}

    # ── Resumen ────────────────────────────────────────────────────────
    addin_base_url = _resolve_addin_base_url(request)
    backend_api_url = _get_backend_api_url()
    result["addin_base_url"] = addin_base_url
    result["backend_api_url"] = backend_api_url
    result["manifest_available"] = (STORAGE_DIR / "manifest.xml").exists()

    # Contar pasos exitosos
    ok_count = sum(1 for v in result["steps"].values() if v.get("status") == "ok")
    total_count = len(result["steps"])
    result["summary"] = f"{ok_count}/{total_count} pasos completados"

    print(f"[ADD-IN] [auto-setup] Completo: {result['summary']}")

    try:
        from wordapa7_logger import log_event, log_error
        log_event("backend", "auto_setup", {"summary": result["summary"], "steps": result["steps"]})
        for step_name, st in result["steps"].items():
            if st.get("status") == "error":
                log_error("backend", f"auto_setup_step_{step_name}", Exception(st.get("reason", "")), st)
    except Exception:
        pass

    return result


# ── SSL STATUS Y CONFIG (movidos de main.py para registro antes del catch-all) ─

@router.get("/sideload-status")
async def get_sideload_status() -> dict:
    """
    Estado del sideload real del add-in: presencia del manifiesto en la
    carpeta System Feed de Windows (la unica que Word descubre como
    complemento de desarrollador) y coincidencia con el manifiesto actual.
    """
    feed_dir = (
        Path(os.environ.get("APPDATA", str(Path.home() / "AppData" / "Roaming")))
        / "Microsoft" / "Windows" / "Start Menu" / "Programs"
        / "Microsoft Office System Feed"
    )
    feed_manifest = feed_dir / "WordAPA7.xml"
    storage_manifest = STORAGE_DIR / "manifest.xml"

    installed = feed_manifest.exists()
    matches = False
    mtime: Optional[str] = None
    if installed:
        try:
            mtime = datetime.fromtimestamp(feed_manifest.stat().st_mtime, timezone.utc).isoformat()
            if storage_manifest.exists():
                matches = feed_manifest.read_bytes() == storage_manifest.read_bytes()
        except Exception:
            pass

    return {
        "installed": installed,
        "up_to_date": bool(installed and matches),
        "path": str(feed_manifest),
        "installed_at": mtime,
    }


@router.get("/ssl-status")
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

    use_ssl_enabled = _rf_use_ssl()
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


@router.get("/config")
async def get_addin_config():
    """
    Devuelve la configuracion de conexion del backend para el Add-in.

    En MODO LOCAL HTTPS (por defecto en Windows):
      - El backend genera certificados SSL auto-firmados
      - El Add-in se sirve desde el propio backend en HTTPS

    En MODO PRODUCCION (URL publica):
      - El Add-in se carga desde una URL HTTPS publica (WORDAPA7_ADDIN_PUBLIC_URL)
      - El backend corre localmente en http://127.0.0.1:8742 (HTTP plano)
      - El frontend del Add-in usa esta URL para las llamadas a la API
    """
    addin_public_url = os.environ.get("WORDAPA7_ADDIN_PUBLIC_URL", "").strip() or None
    use_ssl = _rf_use_ssl() and not addin_public_url

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
            "Add-in cargado desde URL HTTPS publica → backend local HTTP"
            if not use_ssl and addin_public_url
            else "Modo desarrollo HTTPS local" if use_ssl
            else "Backend en HTTP plano — configura WORDAPA7_ADDIN_PUBLIC_URL para produccion"
        ),
    }


def _setup_trusted_catalog() -> dict:
    """Catálogo confiable local (método desktop confiable según MS Learn):
    carpeta + clave HKCU WEF\\TrustedCatalogs; el usuario añade desde
    Insertar > Mis complementos > CARPETA COMPARTIDA."""
    import shutil, uuid, winreg
    result = {"ok": False, "catalog_dir": None, "reg_key": None, "error": None}
    try:
        base = Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData/Local"))) / "WordAPA7" / "addin-catalog"
        base.mkdir(parents=True, exist_ok=True)
        manifest_src = _addin_dist_dir() / "manifest.xml"
        if not manifest_src.exists():
            manifest_src = Path(__file__).resolve().parents[2] / "word-addin" / "dist" / "manifest.xml"
        if manifest_src.exists():
            shutil.copy2(manifest_src, base / "manifest.xml")
            result["catalog_dir"] = str(base)
            key_path = r"Software\Microsoft\Office\16.0\WEF\TrustedCatalogs\{B7A2F3D1-5C4E-4E8A-9A21-WORDAPA7CAT}"
            key_path = key_path.replace("WORDAPA7CAT", "0C0FFEED")
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as k:
                winreg.SetValueEx(k, "Url", 0, winreg.REG_SZ, str(base))
                winreg.SetValueEx(k, "Flags", 0, winreg.REG_DWORD, 1)
                winreg.SetValueEx(k, "Id", 0, winreg.REG_SZ, "{B7A2F3D1-5C4E-4E8A-9A21-0C0FFEED}")
            result["reg_key"] = key_path
            result["ok"] = True
    except Exception as exc:
        result["error"] = str(exc)[:200]
    return result


def _purge_wef_cache_full() -> int:
    """Purga TOTAL de %LOCALAPPDATA%\\Microsoft\\Office\\16.0\\Wef (bug conocido
    office-js#6009: caché corrupta → complemento invisible). Con marcador anti-loop."""
    import shutil as _sh
    wef = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "Office" / "16.0" / "Wef"
    marker = wef.parent / ('.wordapa7_wef_purged_' + _build_stamp())
    if marker.exists():
        return -1  # ya purgado esta instalación
    n = 0
    if wef.exists():
        for child in wef.iterdir():
            try:
                if child.is_dir():
                    _sh.rmtree(child, ignore_errors=True)
                else:
                    child.unlink(missing_ok=True)
                n += 1
            except Exception:
                pass
    try:
        marker.write_text("purged", encoding="utf-8")
    except Exception:
        pass
    return n

def _build_stamp() -> str:
    """Huella del dist actual: cambia => proximo arranque purga Wef (Word recarga taskpane)."""
    import hashlib
    d = _addin_dist_dir()
    h = hashlib.md5()
    for p in sorted(d.rglob('*.js')):
        h.update(str(p.stat().st_mtime_ns).encode())
    return h.hexdigest()[:10]
