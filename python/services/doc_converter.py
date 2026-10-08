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
    Servicio unificado para conversion DOCX a PDF y post-procesamiento.

    Fix B: openxml_cover se usa como PRE-PASO en AMBOS motores (COM y LO)
    antes de abrir el documento en Word o LibreOffice. Esto elimina la logica
    de trasplante destructiva (doc.GoTo + doc.Range.Delete) del post_processor.

    Estrategia Dual Engine:
    1. Si FORCE_ENGINE == 'COM', fuerza usar pywin32 (falla si no disponible)
    2. Si FORCE_ENGINE == 'LO', fuerza usar LibreOffice
    3. Default: intenta COM primero, si falla intenta LO.
    """

    def __init__(self):
        self._com_processor = get_com_post_processor()
        self._lo_service = get_libreoffice_service()
        self._lock = threading.Lock()

    def get_active_engine(self) -> str:
        """Determina que motor usar. D-a duro: solo COM, sin fallback LO.

        FASE 5 — Guard D-a: sin Word disponible, lanza RuntimeError con mensaje
        claro. Elimina fallback a LibreOffice y heurístico en la ruta de export.
        """
        force_engine = os.getenv("FORCE_ENGINE", "").upper()

        if force_engine == "COM":
            if self._com_processor.is_available():
                return "COM"
            raise RuntimeError("Se requiere Microsoft Word")
        elif force_engine == "LO":
            if self._lo_service.is_available():
                return "LO"
            raise RuntimeError("Se requiere LibreOffice")

        # Default: COM es la única autoridad (D-a: sin degradación)
        if self._com_processor.is_available():
            return "COM"

        raise RuntimeError("Se requiere Microsoft Word")

    def process_and_convert(
        self, original_path: Path, generated_path: Path, final_path: Path,
        preserve_cover: bool = False, generate_pdf: bool = True, rules=None
    ) -> Tuple[bool, Optional[Path]]:
        """Aplica post-procesamiento (portada, TOC) y genera PDF usando el motor activo.
        Protegido por un Lock global para evitar concurrencia en COM/LO.

        Fix B: Si preserve_cover=True, se aplica openxml_cover PRIMERO (antes
        de que Word abra el archivo), ensamblando la portada original con el cuerpo
        generado en un DOCX intermedio. Word/LO solo recibe el DOCX ya ensamblado
        y solo hace: aplicar estilos + exportar PDF.

        ``rules`` es opcionalmente un ``APARuleSet`` (Pydantic) con la
        configuracion de formato del usuario.
        """

        with self._lock:
            try:
                engine = self.get_active_engine()
            except RuntimeError as e:
                logger.warning(f"[DocConverter] {e}")
                return False, None

            # FASE 5 — Guard D-a: sin motor, abortar antes de tocar archivos.
            if engine == "NONE":
                logger.warning("[DocConverter] Sin motor disponible (D-a: se requiere Microsoft Word).")
                return False, None

            # ── Pre-paso: trasplante de portada via OpenXML (sin COM, sin LO) ──
            # Si preserve_cover=True, ensamblar portada + cuerpo en un DOCX
            # intermedio antes de pasar al motor. Esto reemplaza la logica
            # destructiva doc.GoTo + doc.Range.Delete del post_processor.
            if preserve_cover:
                try:
                    from generation.openxml_cover import splice_cover_with_openxml
                    splice_cover_with_openxml(original_path, generated_path, final_path)
                    logger.info("[DocConverter] Portada trasplantada via OpenXML (sin COM).")
                    # A partir de aqui, final_path tiene la portada + cuerpo correctos.
                    # El motor solo necesita aplicar estilos y exportar PDF.
                    working_path = final_path
                except Exception as e:
                    logger.warning(f"[DocConverter] Trasplante OpenXML fallo: {e}; usando copia directa")
                    shutil.copy(generated_path, final_path)
                    working_path = final_path
            else:
                shutil.copy(generated_path, final_path)
                working_path = final_path

            # engine == "COM" garantizado por el guard D-a arriba
            logger.info("[DocConverter] Usando motor COM para estilos APA y exportacion PDF.")
            return self._com_processor.process(
                original_path, working_path, working_path,
                preserve_cover=False, generate_pdf=generate_pdf,
                rules=rules
            )

# Singleton
_doc_converter = DocConverterService()

def get_doc_converter() -> DocConverterService:
    return _doc_converter
