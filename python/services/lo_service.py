import logging
import shutil
import subprocess
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

class LibreOfficeService:
    def __init__(self):
        self._lock = threading.Lock()

        self._lo_path = shutil.which('libreoffice') or shutil.which('soffice')
        if not self._lo_path:
            # Check common Windows paths
            common_paths = [
                r"C:\Program Files\LibreOffice\program\soffice.exe",
                r"C:\Program Files (x86)\LibreOffice\program\soffice.exe"
            ]
            for p in common_paths:
                if Path(p).exists():
                    self._lo_path = p
                    break

        self._daemon_process = None
        self._port = 2002

    def is_available(self) -> bool:
        return self._lo_path is not None

    def start(self):
        if not self.is_available() or self._daemon_process is not None:
            return

        try:
            logger.info(f"[LibreOffice Service] Iniciando daemon persistente en puerto {self._port}...")
            self._daemon_process = subprocess.Popen(
                [self._lo_path, '--headless', '--invisible', '--nologo', '--nodefault', '--norestore',
                 f'--accept=socket,host=localhost,port={self._port};urp;StarOffice.ServiceManager'],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
        except Exception as e:
            logger.error(f"[LibreOffice Service] Error iniciando daemon: {e}")

    def stop(self):
        if self._daemon_process:
            self._daemon_process.terminate()
            self._daemon_process = None

    def convert(self, input_path: Path, output_format: str, output_dir: Path) -> bool:
        if not self.is_available():
            return False
        with self._lock:
            import tempfile
            try:
                # Perfil de usuario aislado en un TemporaryDirectory que se
                # autolimpia: ANTES cada conversión creaba ~/.lo_convert_<uuid>
                # en el HOME y nunca lo borraba (decenas de MB acumulados).
                with tempfile.TemporaryDirectory(prefix='lo_profile_') as tmp:
                    env_arg = f"-env:UserInstallation=file:///{Path(tmp).as_posix()}"
                    result = subprocess.run(
                        [self._lo_path, env_arg, '--headless', '--norestore',
                         '--convert-to', output_format,
                         '--outdir', str(output_dir.resolve()),
                         str(input_path.resolve())],
                        capture_output=True, timeout=60
                    )
                    if result.returncode != 0:
                        logger.error(f"[LibreOffice Service] Error en conversión: {result.stderr.decode('utf-8', errors='ignore')}")
                        return False
                    return True
            except subprocess.TimeoutExpired:
                logger.error("[LibreOffice Service] Timeout en la conversión.")
                return False
            except Exception as e:
                logger.error(f"[LibreOffice Service] Excepción en conversión: {e}")
                return False

# Singleton
_lo_service = LibreOfficeService()

def get_libreoffice_service() -> LibreOfficeService:
    return _lo_service

