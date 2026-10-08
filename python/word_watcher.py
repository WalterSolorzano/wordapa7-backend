"""
WordAPA7 — Watcher Ligero de Segundo Plano
==========================================

Proceso en segundo plano de BAJISIMO consumo que:

1. Se inicia automaticamente al iniciar sesion en Windows (registro Run).
2. Arranca el backend Python INMEDIATAMENTE al iniciar (pre-carga), sin
   esperar a que Word abra. Esto resuelve una race condition: Word intenta
   cargar el add-in desde https://localhost:8742/addin/taskpane.html y, si
   el backend no esta listo, el add-in falla al cargar.
3. Monitorea si Microsoft Word esta abierto (poll WINWORD.EXE cada 5s).
4. Si el backend se cayo y Word esta abierto, lo reinicia (recuperacion).
5. Llama a /api/addin/auto-setup para registrar el complemento en Word.
6. Cuando Word se cierra (y Electron tampoco esta), espera 60s y detiene
   el backend para ahorrar recursos.
7. Si Word se reabre dentro del periodo de gracia, cancela el apagado.

ESTRATEGIA DE PRE-CARGA:
El backend se inicia en cuanto el watcher arranca (login de Windows), NO
cuando se detecta Word. El proceso Python del backend es ligero (~30-50MB
RAM). Las partes pesadas (LibreOffice, Word COM) se inicializan bajo
demanda dentro del backend. Asi, cuando Word abre e intenta cargar el
add-in, el backend ya esta respondiendo en el puerto 8742.

Consumo: ~8-12 MB RAM, ~0% CPU (solo un tasklist cada 5 segundos).

Se ejecuta con pythonw.exe (sin ventana de consola) en desarrollo,
o como ``python.exe main.py --watcher`` en produccion (Python embebido).

Registro en inicio de Windows:
  HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\WordAPA7Watcher
  (sin permisos de administrador, instalacion por usuario)

Coordina con la app Electron:
  - Si Electron ya arranco el backend, el watcher lo detecta y no duplica.
  - Si el watcher arranco el backend y despues se abre Electron, Electron
    detecta el backend ya corriendo y no spawnea otro.
  - El backend solo se detiene si NI Word NI Electron estan abiertos.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import socket
import ssl
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

# ── CONFIGURACION ────────────────────────────────────────────────────────────

BACKEND_PORT = 8742
POLL_INTERVAL = 5          # segundos entre chequeos de Word
SHUTDOWN_GRACE = 60        # segundos tras cerrar Word antes de detener backend
BACKEND_STARTUP_WAIT = 3   # sonda rapida: no bloquear si el nucleo ya viene listo
HEALTH_TIMEOUT = 2         # timeout para health check del backend
# Techo real de espera al arranque en frio. Medido: ~45 s hasta que el nucleo
# escucha (imports + SSL + montaje del add-in). Un `sleep` fijo de 3 s
# convertia "lento" en "cayo"; este techo existe para seguir sondeando hasta
# que responda, y los 60 s de margen son para una maquina lenta, no para
# quedarse esperando un proceso que ya sabemos muerto.
BACKEND_READY_TIMEOUT = 90
BACKEND_READY_INTERVAL = 1  # segundos entre sondas de wait_for_backend
AUTO_SETUP_DELAY = 3       # delay antes de llamar auto-setup (dar tiempo al manifest)
AUTO_SETUP_RETRIES = 3     # reintentos de auto-setup
AUTO_SETUP_RETRY_DELAY = 3  # segundos entre reintentos

# Cada cuantos ticks (de POLL_INTERVAL) se barre Word huerfano. El barrido
# cuesta un PowerShell, y solo corre cuando no hay nucleo: no hace falta
# repetirlo cada 5 segundos.
REAP_COOLDOWN_TICKS = 6

# Backoff del supervisor del nucleo: si el backend no levanta, NO reintentar
# cada 10s eternamente (crash-loop visto en produccion). Escalar 10/30/60s.
SUPERVISOR_DELAYS = [10, 30, 60]


def delay_for_attempt(attempt: int) -> int:
    """Delay del supervisor para el intento dado, con tope en el ultimo."""
    return SUPERVISOR_DELAYS[min(max(attempt, 0), len(SUPERVISOR_DELAYS) - 1)]


# Lock compartido para la decision de spawn: el bucle principal (CASO 1 de
# run_watcher) y el hilo _core_supervisor pueden querer spawnear a la vez;
# sin el lock ambos pasan el chequeo "live_proc() is None" concurrentemente
# y terminan con DOS backends peleando por el bind :8742.
_spawn_lock = threading.Lock()


class SupervisorState:
    """Estado del supervisor: intentos de backoff + proceso que NOSOTROS spawneamos."""

    def __init__(self) -> None:
        self.attempt = 0
        self.our_proc: Optional[subprocess.Popen] = None

    def live_proc(self) -> Optional[subprocess.Popen]:
        """Retorna el proceso solo si sigue vivo; descarta los muertos."""
        if self.our_proc is not None and self.our_proc.poll() is not None:
            self.our_proc = None
        return self.our_proc

    def note_healthy(self) -> None:
        self.attempt = 0

    def note_spawn_failed(self) -> None:
        self.attempt += 1


def decide_supervisor_action(
    port_healthy: bool, our_proc: Optional[subprocess.Popen]
) -> str:
    """Que hacer en este tick del supervisor.

    - 'adopt': algo ya responde en :8742 (core_server del Run key, Electron,
      u otro watcher). NUNCA spawnear otro backend encima: pelear por el bind
      produce [Errno 10048] y crash-loop.
    - 'spawn': nadie responde; levantar el backend (rastreado en SupervisorState).
    """
    if port_healthy:
        return "adopt"
    return "spawn"


def child_log_file() -> Path:
    """Archivo de log del backend hijo (stdout+stderr).

    Antes era DEVNULL: los errores de bind morian invisibles y el crash-loop
    fue indetectable. Ahora todo queda en %APPDATA%\\WordAPA7\\backend-child.log.
    """
    appdata = os.environ.get("APPDATA", str(Path.home() / "AppData" / "Roaming"))
    log_dir = Path(appdata) / "WordAPA7"
    log_dir.mkdir(parents=True, exist_ok=True)
    return log_dir / "backend-child.log"


# ── DETECCION DE ENTORNO ─────────────────────────────────────────────────────


def _is_packaged() -> bool:
    """Detecta si estamos corriendo en el paquete Electron de produccion.

    Soporta DOS modos de empaquetado:
    1. PyInstaller (legacy): sys.frozen == True
    2. Python embebido (actual): python.exe oficial esta en
       resources/python-runtime/ y el codigo fuente en
       resources/python-runtime/python/main.py.
    """
    if getattr(sys, "frozen", False):
        return True
    # Python embebido: python.exe esta junto a python/main.py
    exe_dir = Path(sys.executable).parent
    return (exe_dir / "python" / "main.py").exists()


# ── RUTAS ─────────────────────────────────────────────────────────────────────


def _get_base_dir() -> Path:
    """Directorio base del proyecto (padre de python/)."""
    if _is_packaged():
        if getattr(sys, "frozen", False):
            # PyInstaller legacy: exe en resources/python-backend/python-backend/
            return Path(sys.executable).parent.parent.parent.parent
        # Python embebido: python.exe en resources/python-runtime/
        # El codigo fuente esta en resources/python-runtime/python/
        return Path(sys.executable).parent
    return Path(__file__).resolve().parent.parent


def _get_python_dir() -> Path:
    """Directorio donde esta main.py y word_watcher.py."""
    if _is_packaged():
        if getattr(sys, "frozen", False):
            # PyInstaller legacy
            return Path(sys.executable).parent
        # Python embebido: codigo en python-runtime/python/
        return Path(sys.executable).parent / "python"
    return Path(__file__).resolve().parent


def _get_storage_dir() -> Path:
    """Directorio de almacenamiento del usuario (AppData)."""
    appdata = os.environ.get("APPDATA", str(Path.home() / "AppData" / "Roaming"))
    return Path(appdata) / "WordAPA7" / "storage"


def _get_log_file() -> Path:
    """Ruta del archivo de log del watcher."""
    appdata = os.environ.get("APPDATA", str(Path.home() / "AppData" / "Roaming"))
    log_dir = Path(appdata) / "WordAPA7"
    log_dir.mkdir(parents=True, exist_ok=True)
    return log_dir / "watcher.log"


# ── LOGGING ───────────────────────────────────────────────────────────────────

_log_setup_done = False


def _setup_logging() -> logging.Logger:
    global _log_setup_done
    logger = logging.getLogger("wordapa7_watcher")
    if _log_setup_done:
        return logger
    _log_setup_done = True

    from logging.handlers import RotatingFileHandler

    handler = RotatingFileHandler(
        str(_get_log_file()),
        maxBytes=2 * 1024 * 1024,  # 2 MB
        backupCount=2,
        encoding="utf-8",
    )
    handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%Y-%m-%d %H:%M:%S")
    )
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    return logger


log = _setup_logging()


# ── DETECCION DE PROCESOS ─────────────────────────────────────────────────────


def _is_process_running(process_name: str) -> bool:
    """
    Verifica si un proceso esta corriendo usando ``tasklist`` (Windows).

    No requiere psutil ni ninguna libreria externa — tasklist viene con
    Windows. Es rapido (~10ms) y no eleva CPU.
    """
    try:
        result = subprocess.run(
            ["tasklist", "/FI", f"IMAGENAME eq {process_name}", "/NH", "/FO", "CSV"],
            capture_output=True,
            text=True,
            timeout=5,
            creationflags=0x08000000 if sys.platform == "win32" else 0,  # CREATE_NO_WINDOW
        )
        return process_name.lower() in result.stdout.lower()
    except Exception:
        return False


def is_word_running() -> bool:
    """Verifica si Microsoft Word (WINWORD.EXE) esta corriendo."""
    return _is_process_running("WINWORD.EXE")


def is_electron_running() -> bool:
    """
    Verifica si la app Electron (WordAPA7.exe) esta corriendo.

    Si Electron esta abierto, el backend ya esta siendo gestionado por
    python-manager.ts — el watcher no debe detenerlo.
    """
    return _is_process_running("WordAPA7.exe")


def user_word_running() -> bool:
    """True si hay un WINWORD abierto por el USUARIO (no de automatizacion).

    `is_word_running()` ve cualquier WINWORD. Un Word de COM huerfano —de un
    backend que murio— haria creer que el usuario tiene un documento abierto y
    dispararia CASO 1 (rearranque del backend) en bucle, justo despues de que
    `reap_orphan_word()` lo mato. Se filtra por `/Automation`, igual que
    `automation_word_pids()`: el Word del usuario nunca lleva ese flag.
    """
    if sys.platform != "win32":
        return is_word_running()
    try:
        res = subprocess.run(
            [
                "powershell", "-NoProfile", "-Command",
                "(Get-CimInstance Win32_Process -Filter \"Name='WINWORD.EXE'\" | "
                "Where-Object { $_.CommandLine -notlike '*Automation*' }).ProcessId",
            ],
            capture_output=True,
            text=True,
            timeout=10,
            creationflags=0x08000000,  # CREATE_NO_WINDOW
        )
        return any(tok.strip().isdigit() for tok in res.stdout.split())
    except Exception:
        # Ante la duda, no barrer: se conserva el comportamiento previo.
        return True


# ── WORD DE AUTOMATIZACION HUERFANO ──────────────────────────────────────────


def automation_word_pids() -> list:
    """PIDs de WINWORD.EXE lanzados por COM (``/Automation -Embedding``).

    El filtro por linea de comandos es lo que hace segura la limpieza: Word lo
    abre asi SOLO la automatizacion. El Word del usuario, abierto a mano o
    desde un .docx, no lleva ``/Automation`` nunca, asi que no entra en la
    lista ni por error.

    Se usa PowerShell/CIM y no ``wmic`` porque wmic esta deprecado y ya falta
    en algunas instalaciones de Windows 11.
    """
    if sys.platform != "win32":
        return []
    try:
        res = subprocess.run(
            [
                "powershell", "-NoProfile", "-Command",
                "(Get-CimInstance Win32_Process -Filter \"Name='WINWORD.EXE'\" | "
                "Where-Object { $_.CommandLine -like '*Automation*' }).ProcessId",
            ],
            capture_output=True,
            text=True,
            timeout=10,
            creationflags=0x08000000,  # CREATE_NO_WINDOW
        )
        return [int(x) for x in res.stdout.split() if x.strip().isdigit()]
    except Exception:
        return []


def reap_orphan_word() -> None:
    """Termina los Word de automatizacion que quedaron sin nucleo.

    POR QUE ESTO NO ES SOLO LIMPIEZA DE RAM

    ``is_word_running()`` mira WINWORD.EXE y no distingue quien lo abrio. Un
    Word de COM huerfano —de un backend que murio sin llamar a ``Quit``—
    deja ``word_open`` en True para siempre. Con eso el CASO 3 del bucle se
    cumple siempre y el CASO 2 nunca corre: el watcher NO recicla el nucleo,
    la app se queda pegada a un backend viejo y cada sesion suma un Word mas.

    Solo se llama cuando NO hay nucleo: si algo responde en :8742, ese Word
    puede ser legitimo (paginacion u ortografia en curso) y no se toca.
    """
    for pid in automation_word_pids():
        try:
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/F"],
                capture_output=True,
                timeout=5,
                creationflags=0x08000000,
            )
            log.info(f"Word de automatizacion huerfano terminado (PID {pid})")
        except Exception as e:
            log.warning(f"No se pudo terminar el Word huerfano {pid}: {e}")



# ── HEALTH CHECK DEL BACKEND ──────────────────────────────────────────────────


def _ssl_context() -> ssl.SSLContext:
    """Contexto SSL que acepta certificados auto-firmados (localhost)."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def is_backend_running() -> bool:
    """
    Verifica si el backend ya responde en el puerto 8742.

    Prueba HTTPS primero (el backend usa SSL por defecto) y HTTP como fallback.
    Usa urllib (stdlib) — no requiere requests ni httpx.
    """
    _ctx = _ssl_context()
    for proto in ("https", "http"):
        try:
            req = urllib.request.urlopen(
                f"{proto}://127.0.0.1:{BACKEND_PORT}/api/version",
                timeout=HEALTH_TIMEOUT,
                context=_ctx if proto == "https" else None,
            )
            if req.status == 200:
                return True
        except Exception:
            continue
    return False


def wait_for_backend(
    timeout: float = BACKEND_READY_TIMEOUT,
    interval: float = BACKEND_READY_INTERVAL,
) -> bool:
    """Espera ACTIVA a que el nucleo responda, con techo. `True` si respondio.

    Reemplaza al `time.sleep(BACKEND_STARTUP_WAIT)`. Dormir una constante fija
    no puede ser correcto: si es corta convierte la lentitud en fracaso (era el
    caso, 3 s contra ~45 medidos, y `watcher.log` lo registraba como "El backend
    no respondio tras el startup inicial"), y si es larga paga el peor caso en
    cada arranque aunque el nucleo ya estuviera listo.

    Sondea y corta en cuanto responde: un arranque de 2 s no espera 90, y uno
    de 50 no se declara muerto a los 3. Devuelve `False` solo cuando se agoto el
    techo, que es informacion distinta a "no responde todavia" — el llamador
    necesita saber cual de las dos para decidir si reintenta.
    """
    import time as _time

    deadline = _time.monotonic() + max(timeout, 0.0)
    while True:
        if is_backend_running():
            return True
        if _time.monotonic() >= deadline:
            return False
        _time.sleep(interval)


# ── GESTION DEL BACKEND ───────────────────────────────────────────────────────


def _find_backend_executable() -> Optional[str]:
    """
    Encuentra el ejecutable o script del backend segun el entorno.

    - Produccion (Python embebido): python.exe + main.py en resources/python-runtime/
    - Produccion (PyInstaller legacy): el propio exe con --port
    - Desarrollo: venv/Scripts/pythonw.exe o pythonw del PATH
    """
    if _is_packaged():
        if getattr(sys, "frozen", False):
            # PyInstaller legacy: el backend es el mismo exe
            return sys.executable
        # Python embebido: python.exe + main.py
        exe_dir = Path(sys.executable).parent
        python_exe = exe_dir / "python.exe"
        core = exe_dir / "python" / "core_server.py"
        main_script = core if core.exists() else exe_dir / "python" / "main.py"
        if python_exe.exists() and main_script.exists():
            return f'"{python_exe}" "{main_script}"'
        return None

    python_dir = _get_python_dir()
    main_script = python_dir / "main.py"

    # Preferir pythonw.exe del venv (sin ventana de consola)
    venv_pythonw = _get_base_dir() / "venv" / "Scripts" / "pythonw.exe"
    if venv_pythonw.exists():
        return f'"{venv_pythonw}" "{main_script}"'

    # Fallback: pythonw del PATH
    pythonw = shutil.which("pythonw")
    if pythonw:
        return f'"{pythonw}" "{main_script}"'

    # Ultimo recurso: python del PATH (con ventana de consola, no ideal)
    python = shutil.which("python")
    if python:
        return f'"{python}" "{main_script}"'

    return None


def start_backend() -> Optional[subprocess.Popen]:
    """
    Inicia el backend Python en segundo plano (sin ventana de consola).

    Retorna el proceso Popen si se inicio correctamente, o None si fallo.
    """
    if _is_packaged():
        if getattr(sys, "frozen", False):
            # PyInstaller legacy: python-backend.exe --port 8742
            exe = sys.executable
            try:
                proc = subprocess.Popen(
                    [exe, "--port", str(BACKEND_PORT)],
                    creationflags=0x08000000,  # CREATE_NO_WINDOW
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    cwd=str(Path(exe).parent),
                )
                log.info(f"Backend iniciado (PyInstaller): {exe} --port {BACKEND_PORT} PID={proc.pid}")
                return proc
            except Exception as e:
                log.error(f"Error al iniciar backend (PyInstaller): {e}")
                return None

        # ── Python embebido (actual) ──────────────────────────────────────
        # Usamos python.exe (firmado por Python Software Foundation) en lugar
        # de un exe custom de PyInstaller que Windows Defender flaggea.
        exe_dir = Path(sys.executable).parent
        python_exe = exe_dir / "python.exe"
        main_script = exe_dir / "python" / "main.py"
        python_dir = exe_dir / "python"

        try:
            # stdout/stderr a archivo de log (antes DEVNULL: los crashes del
            # hijo eran invisibles y el crash-loop indetectable).
            child_log = open(str(child_log_file()), "a", encoding="utf-8", buffering=1)
            try:
                proc = subprocess.Popen(
                    [str(python_exe), str(main_script), "--port", str(BACKEND_PORT)],
                    creationflags=0x08000000,  # CREATE_NO_WINDOW
                    stdout=child_log,
                    stderr=child_log,
                    cwd=str(python_dir),
                    env={
                        **os.environ,
                        "APP_USERDATA": str(_get_storage_dir().parent),
                        "PYTHONUNBUFFERED": "1",
                    },
                )
            finally:
                # El hijo hereda el handle durante Popen; el padre NO debe
                # retenerlo (fuga de handles si se repite en crash-loops).
                child_log.close()
            log.info(
                f"Backend iniciado (Python embebido): {python_exe} main.py --port {BACKEND_PORT} "
                f"PID={proc.pid}"
            )
            return proc
        except Exception as e:
            log.error(f"Error al iniciar backend (Python embebido): {e}")
            return None

    # Desarrollo: pythonw.exe main.py --port 8742
    cmd_str = _find_backend_executable()
    if not cmd_str:
        log.error("No se encontro un interprete Python para iniciar el backend")
        return None

    python_dir = _get_python_dir()
    base_dir = _get_base_dir()
    main_script = python_dir / "main.py"

    # Buscar pythonw del venv o del PATH
    venv_pythonw = base_dir / "venv" / "Scripts" / "pythonw.exe"
    if venv_pythonw.exists():
        exe = str(venv_pythonw)
    else:
        exe = shutil.which("pythonw") or shutil.which("python") or "python"

    try:
        proc = subprocess.Popen(
            [exe, str(main_script), "--port", str(BACKEND_PORT)],
            creationflags=0x08000000,  # CREATE_NO_WINDOW
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            cwd=str(python_dir),
            env={
                **os.environ,
                # Asegurar que el backend sepa donde guardar datos
                "APP_USERDATA": str(_get_storage_dir().parent),
            },
        )
        log.info(f"Backend iniciado (dev): {exe} main.py --port {BACKEND_PORT} PID={proc.pid}")
        return proc
    except Exception as e:
        log.error(f"Error al iniciar backend (dev): {e}")
        return None


def stop_backend(backend_proc: Optional[subprocess.Popen]) -> None:
    """
    Detiene el backend de forma graceful.

    Si tenemos el proceso Popen (lo iniciamos nosotros), lo terminamos.
    Si no (lo inicio Electron), no hacemos nada — Electron lo gestiona.
    """
    if backend_proc is None:
        return

    try:
        backend_proc.terminate()
        try:
            backend_proc.wait(timeout=10)
            log.info("Backend detenido gracefully")
        except subprocess.TimeoutExpired:
            backend_proc.kill()
            backend_proc.wait(timeout=5)
            log.info("Backend detenido (kill forzado)")
    except Exception as e:
        log.warning(f"Error al detener backend: {e}")


# ── AUTO-SETUP DEL ADD-IN ──────────────────────────────────────────────────────


def call_auto_setup() -> Optional[dict]:
    """
    Llama al endpoint /api/addin/auto-setup del backend.

    Este endpoint hace TODO en una sola llamada:
    1. Genera el manifiesto XML con URLs HTTPS correctas
    2. Lo registra en el registro de Windows (sideload de Word)
    3. Copia el manifiesto a un catalogo compartido (fallback)
    4. Verifica el certificado SSL

    Tiene reintentos porque el backend puede tardar unos segundos en
    tener el manifiesto listo despues de responder al health check.
    """
    _ctx = _ssl_context()
    for attempt in range(1, AUTO_SETUP_RETRIES + 1):
        for proto in ("https", "http"):
            try:
                req = urllib.request.urlopen(
                    f"{proto}://127.0.0.1:{BACKEND_PORT}/api/addin/auto-setup",
                    timeout=10,
                    context=_ctx if proto == "https" else None,
                )
                if req.status == 200:
                    data = json.loads(req.read())
                    log.info(
                        f"Auto-setup OK (intento {attempt}): "
                        f"status={data.get('status')} "
                        f"summary={data.get('summary')}"
                    )
                    return data
            except Exception:
                continue

        if attempt < AUTO_SETUP_RETRIES:
            log.info(f"Auto-setup intento {attempt} fallo, reintentando en {AUTO_SETUP_RETRY_DELAY}s...")
            time.sleep(AUTO_SETUP_RETRY_DELAY)

    log.warning("Auto-setup fallo tras todos los intentos")
    return None


# ── BUCLE PRINCIPAL ────────────────────────────────────────────────────────────


def run_watcher() -> None:
    """
    Bucle principal del watcher.

    Se ejecuta indefinidamente hasta que el proceso sea terminado.
    El consumo de recursos es minimo: un ``tasklist`` cada 5 segundos
    y un ``urlopen`` solo cuando cambia el estado de Word.

    ESTRATEGIA DE PRE-CARGA:
    El backend se inicia INMEDIATAMENTE al arrancar el watcher (en el
    login de Windows), sin esperar a que Word abra. Esto resuelve el
    problema de carrera (race condition): Word intenta cargar el add-in
    desde https://localhost:8742/addin/taskpane.html y, si el backend no
    esta listo, el add-in falla. Pre-cargando el backend, este ya esta
    respondiendo cuando Word abre.

    El backend Python es ligero (~30-50MB RAM). Las partes pesadas
    (LibreOffice, Word COM) se inicializan bajo demanda dentro del backend.
    """
    log.info("=" * 50)
    log.info("WordAPA7 Watcher iniciado")
    log.info(f"  Puerto backend: {BACKEND_PORT}")
    log.info(f"  Poll interval: {POLL_INTERVAL}s")
    log.info(f"  Shutdown grace: {SHUTDOWN_GRACE}s")
    log.info(f"  Packaged: {_is_packaged()}")
    log.info(f"  Frozen: {getattr(sys, 'frozen', False)}")
    log.info(f"  Base dir: {_get_base_dir()}")
    log.info(f"  Python dir: {_get_python_dir()}")
    log.info(f"  sys.executable: {sys.executable}")
    log.info("=" * 50)

    backend_state = SupervisorState()
    shutdown_timer = 0.0
    auto_setup_done = False
    reap_cooldown = 0

    # ── PRE-CARGA: adoptar o iniciar el backend inmediatamente ─────────────
    # Si algo ya responde en :8742 (core_server del Run key, Electron, una
    # sesion anterior), se ADOPTA: spawnear otro backend produce conflicto de
    # bind ([Errno 10048]) y crash-loop.
    log.info("Pre-carga: verificando si ya hay nucleo en :%d...", BACKEND_PORT)
    if is_backend_running():
        log.info("Nucleo ya activo (adoptado, no se spawnea otro)")
        time.sleep(AUTO_SETUP_DELAY)
        call_auto_setup()
        auto_setup_done = True
    else:
        backend_state.our_proc = start_backend()
        if backend_state.our_proc:
            if wait_for_backend():
                log.info("Backend pre-cargado y listo antes de que Word abra")
                time.sleep(AUTO_SETUP_DELAY)
                call_auto_setup()
                auto_setup_done = True
            else:
                log.warning("El backend no respondio tras el startup inicial")
                backend_state.note_spawn_failed()
        else:
            log.error("No se pudo iniciar el backend en el arranque del watcher")
            backend_state.note_spawn_failed()

    # Supervisor del nucleo: adopta si el puerto esta sano; solo spawnea si
    # NADIE responde; backoff real 10/30/60s (nunca resetear al fallar).
    threading.Thread(
        target=_core_supervisor,
        args=(backend_state,),
        daemon=True, name="WordAPA7-core-supervisor",
    ).start()

    while True:
        try:
            word_open = is_word_running()
            electron_open = is_electron_running()
            backend_up = is_backend_running()

            # ── CASO 0: sin nucleo, barrer Word de automatizacion huerfano ──
            # Un Word de COM sin dueño mantiene `word_open` en True para
            # siempre, y con eso el CASO 3 siempre se cumple: el nucleo no se
            # recicla nunca y la app queda pegada a un backend viejo. Barrer
            # aqui es lo que rompe ese circulo. El cooldown evita un PowerShell
            # cada 5 segundos.
            if not backend_up and word_open:
                if reap_cooldown <= 0:
                    reap_orphan_word()
                    reap_cooldown = REAP_COOLDOWN_TICKS
                else:
                    reap_cooldown -= 1

            # ── CASO 1: Word abierto y backend no corriendo ──────────────
            # RUTA DE RECUPERACION: el backend debio haberse pre-cargado al
            # inicio del watcher, asi que si no esta corriendo cuando Word
            # abre, es porque se cayo (crash) o nunca pudo arrancar. Se
            # reintenta el arranque.
            if word_open and not backend_up:
                if not user_word_running():
                    # El único Word vivo es de automatización (huérfano de un
                    # backend muerto). No es un documento del usuario: se barre
                    # y NO se rearranca el núcleo, que era lo que alimentaba el
                    # bucle (barrer el huérfano liberaba `word_open`, el ciclo
                    # lo volvía a leer como Word abierto y resucitaba el backend).
                    reap_orphan_word()
                    reap_cooldown = REAP_COOLDOWN_TICKS
                    shutdown_timer = 0
                    continue
                log.warning(
                    "Word detectado pero el backend no responde — "
                    "recuperacion (posible crash del backend)..."
                )
                # Reintentar solo si NUESTRO proc no vive ya. Chequeo+spawn
                # bajo _spawn_lock: el supervisor corre en otro hilo y sin el
                # lock ambos pueden decidir spawnear simultaneamente.
                with _spawn_lock:
                    if backend_state.live_proc() is None:
                        backend_state.our_proc = start_backend()
                if backend_state.live_proc() is not None:
                    # Verificar que realmente arranco (sondeo con techo, no sleep)
                    if wait_for_backend():
                        log.info("Backend recuperado correctamente tras crash")
                        backend_state.note_healthy()
                        # Llamar auto-setup tras un delay
                        time.sleep(AUTO_SETUP_DELAY)
                        if not auto_setup_done:
                            call_auto_setup()
                            auto_setup_done = True
                    else:
                        log.warning("El backend no respondio tras el startup wait")
                        backend_state.note_spawn_failed()
                else:
                    log.error("No se pudo recuperar el backend")
                shutdown_timer = 0
                continue

            # ── CASO 2: Word cerrado pero backend corriendo ──────────────
            if not word_open and backend_up:
                if electron_open:
                    # Electron esta abierto — no tocar el backend
                    if shutdown_timer > 0:
                        log.info("Electron detectado — cancelando shutdown del backend")
                        shutdown_timer = 0
                elif backend_state.live_proc() is not None:
                    # El watcher inicio el backend (pre-carga o recuperacion) —
                    # cuenta regresiva para detenerlo y ahorrar memoria. Si el
                    # backend lo inicio Electron (live_proc() is None), Electron
                    # gestiona su ciclo de vida y el watcher no debe tocarlo.
                    if shutdown_timer == 0:
                        log.info(
                            f"Word y Electron cerrados — el backend se detendra "
                            f"en {SHUTDOWN_GRACE}s si no se reabren"
                        )
                    shutdown_timer += POLL_INTERVAL

                    if shutdown_timer >= SHUTDOWN_GRACE:
                        log.info("Grace period agotada — deteniendo backend...")
                        stop_backend(backend_state.live_proc())
                        backend_state.our_proc = None
                        auto_setup_done = False
                        shutdown_timer = 0
                # else: backend iniciado por Electron (backend_proc is None) —
                # Electron gestiona su ciclo de vida; el watcher no hace nada.

            # ── CASO 3: Word abierto y backend ya corriendo ───────────────
            if word_open and backend_up:
                # Todo en orden — resetear timer
                if shutdown_timer > 0:
                    log.info("Word reabierta — cancelando shutdown del backend")
                    shutdown_timer = 0

                # Asegurar que auto-setup se ejecuto al menos una vez.
                # Si el backend lo inicio Electron (backend_proc is None) y
                # auto-setup aun no se ha llamado, hacerlo ahora. Si ya se hizo
                # (pre-carga o ciclo anterior), se omite.
                if not auto_setup_done and backend_state.live_proc() is None:
                    call_auto_setup()
                    auto_setup_done = True

            # ── CASO 4: Ni Word ni backend ────────────────────────────────
            # Nada que hacer — esperar al proximo ciclo

        except KeyboardInterrupt:
            log.info("Watcher detenido por el usuario (Ctrl+C)")
            break
        except Exception as e:
            log.error(f"Error en bucle del watcher: {e}")
            # No crashear — seguir intentando

        time.sleep(POLL_INTERVAL)

    # Limpieza al salir
    if backend_state.live_proc() is not None:
        stop_backend(backend_state.live_proc())
    log.info("Watcher terminado")


# ── PUNTO DE ENTRADA ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    run_watcher()


def _core_supervisor(state: SupervisorState):
    """Supervisor del nucleo: adopta si el puerto esta sano, spawnea solo si
    nadie responde, con backoff real 10/30/60s que NUNCA se resetea al fallar.

    Bug corregido: la version anterior ignoraba el puerto y re-spawneaba cada
    10s sin rastrear el proceso — crash-loop eterno "(intento 1)" cuando otro
    dueno (core_server del Run key) ya ocupaba :8742.
    """
    while True:
        time.sleep(delay_for_attempt(state.attempt))
        try:
            healthy = is_backend_running()
            if decide_supervisor_action(healthy, state.our_proc) == "adopt":
                # Alguien sano en :8742 (aunque no sea nuestro): no tocar.
                # Solo descartar nuestro proc si murio.
                state.live_proc()
                state.note_healthy()
                continue

            # Puerto muerto: matar nuestro proc zombi si existe (vivo pero
            # sin responder) antes de spawnear uno nuevo. Chequeo+spawn bajo
            # el MISMO lock del CASO 1: decision atomica entre hilos.
            with _spawn_lock:
                proc = state.live_proc()
                if proc is not None:
                    try:
                        proc.terminate()
                    except Exception:
                        pass

                new = start_backend()
                state.our_proc = new
            if new is None:
                log.error("[WATCHER] Reinicio fallo: start_backend devolvio None")
                state.note_spawn_failed()
                continue

            if wait_for_backend():
                log.info("[WATCHER] Backend recuperado tras reinicio")
                state.note_healthy()
            else:
                state.note_spawn_failed()
                log.warning(
                    "[WATCHER] Backend sigue sin responder; proximo reintento en %ds "
                    "(ver %s)",
                    delay_for_attempt(state.attempt), child_log_file(),
                )
        except Exception as e:
            log.error("[WATCHER] Error en supervisor: %s", e)
            state.note_spawn_failed()
