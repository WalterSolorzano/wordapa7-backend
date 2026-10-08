import logging
import os
import shutil
import threading
from pathlib import Path
from typing import Optional, Tuple

from generation.post_processor import get_com_post_processor
from services.lo_service import get_libreoffice_service

logger = logging.getLogger(__name__)

class DocConverterService:
    """
    Servicio unificado para conversiÃ³n DOCX â†’ PDF y post-procesamiento.

    Estrategia Dual Engine:
    1. Si FORCE_ENGINE == 'COM', fuerza usar pywin32 (falla si no estÃ¡ disponible)
    2. Si FORCE_ENGINE == 'LO', fuerza usar LibreOffice
    3. Default: intenta COM primero, si falla intenta LO.
    """

    def __init__(self):
        self._com_processor = get_com_post_processor()
        self._lo_service = get_libreoffice_service()
        self._lock = threading.Lock()

    def get_active_engine(self) -> str:
        """Determina quÃ© motor usar basado en disponibilidad y variables de entorno."""
        force_engine = os.getenv("FORCE_ENGINE", "").upper()

        if force_engine == "COM":
            return "COM" if self._com_processor.is_available() else "NONE"
        elif force_engine == "LO":
            return "LO" if self._lo_service.is_available() else "NONE"

        # Fallback automÃ¡tico
        if self._com_processor.is_available():
            return "COM"
        if self._lo_service.is_available():
            return "LO"

        return "NONE"

    def process_and_convert(
        self, original_path: Path, generated_path: Path, final_path: Path,
        preserve_cover: bool = False, generate_pdf: bool = True
    ) -> Tuple[bool, Optional[Path]]:
        """Aplica post-procesamiento (portada, TOC) y genera PDF usando el motor activo. Protegido por un Lock global para evitar concurrencia en COM/LO."""

        with self._lock:
            engine = self.get_active_engine()

            if engine == "COM":
                logger.info("[DocConverter] Usando motor COM para post-procesamiento y PDF.")
                return self._com_processor.process(
                    original_path, generated_path, final_path,
                    preserve_cover=preserve_cover, generate_pdf=generate_pdf
                )

            elif engine == "LO":
                logger.info("[DocConverter] Usando motor LibreOffice para post-procesamiento y PDF.")
                # LO no puede hacer el trasplante quirÃºrgico de portada tan fÃ¡cil como COM.
                # En caso de LO, si preserve_cover es True, perderemos fidelidad en la portada,
                # pero el usuario sabe que LO es un fallback o para previews.
                # Solo copiamos el generado al final.
                shutil.copy(generated_path, final_path)

                pdf_path = None
                if generate_pdf:
                    success = self._lo_service.convert(final_path, "pdf", final_path.parent)
                    if success:
                        pdf_path = final_path.with_suffix(".pdf")
                        return True, pdf_path
                    return False, None
                return True, None

            else:
                logger.warning("[DocConverter] NingÃºn motor disponible. Solo se copia el archivo generado.")
                shutil.copy(generated_path, final_path)
                return False, None

# Singleton
_doc_converter = DocConverterService()

def get_doc_converter() -> DocConverterService:
    return _doc_converter
