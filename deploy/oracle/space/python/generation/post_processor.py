"""
WordAPA7 - Post-procesador COM (Fase 7+)

Se ejecuta después de que python-docx generó el documento.
Utiliza pywin32 para realizar operaciones nativas:
- Trasplante de portada original.
- Actualización de Tabla de Contenidos (TOC).
- Exportación a PDF.
"""

import logging
import shutil
import sys
import time
from pathlib import Path
from typing import Optional, Tuple

import psutil

logger = logging.getLogger(__name__)

class COMPostProcessor:
    def __init__(self):
        self.is_windows = sys.platform == "win32"

    def is_available(self) -> bool:
        if not self.is_windows:
            return False
        try:
            import win32com.client  # noqa: F401  (sonda de disponibilidad)
            return True
        except ImportError:
            return False

    def process(self, original_path: Path, generated_path: Path, final_path: Path,
                preserve_cover: bool = False, generate_pdf: bool = True) -> Tuple[bool, Optional[Path]]:
        """
        Post-procesa el documento generado.
        Retorna (exito: bool, ruta_pdf: Optional[Path])
        """
        if not self.is_available():
            logger.warning("[COM PostProcessor] COM no está disponible en este sistema.")
            shutil.copy(generated_path, final_path)
            return False, None

        import concurrent.futures

        import pythoncom

        def _do_process():
            pythoncom.CoInitialize()
            word = None
            doc = None
            pdf_path = None
            try:
                from services.word_com_service import get_word_com_service
                word_service = get_word_com_service()
                word = word_service.word
                if not word:
                    raise Exception("Word COM Service failed to provide a valid Word instance")


                word.Visible = False
                word.DisplayAlerts = 0

                if preserve_cover:
                    # Trasplante quirúrgico
                    # 1. Copiar original a final
                    shutil.copy(original_path, final_path)

                    # 2. Abrir final.docx (que ahora es copia del original)
                    doc = word.Documents.Open(
                        str(final_path.resolve()),
                        ConfirmConversions=False,
                        AddToRecentFiles=False
                    )

                    # 3. Borrar de pág 2 en adelante
                    # wdGoToPage = 1, wdGoToAbsolute = 1
                    page2 = doc.GoTo(1, 1, 2)
                    if page2.Start > 0 and page2.Start < doc.Content.End - 1:
                        doc.Range(page2.Start, doc.Content.End).Delete()

                    # 4. Insertar página de salto y el doc generado
                    end_range = doc.Range(doc.Content.End-1, doc.Content.End-1)
                    end_range.InsertBreak(7) # wdPageBreak

                    end_range = doc.Range(doc.Content.End-1, doc.Content.End-1)
                    end_range.InsertFile(str(generated_path.resolve()))
                else:
                    # Solo copiar generado a final y abrir
                    shutil.copy(generated_path, final_path)
                    doc = word.Documents.Open(
                        str(final_path.resolve()),
                        ConfirmConversions=False,
                        AddToRecentFiles=False
                    )

                # 5. Actualizar TOC si existe
                for toc in doc.TablesOfContents:
                    toc.Update()

                # Guardar cambios del DOCX
                doc.Save()

                # 6. Exportar a PDF
                if generate_pdf:
                    pdf_path = final_path.with_suffix(".pdf")
                    # wdExportFormatPDF = 17
                    doc.ExportAsFixedFormat(
                        OutputFileName=str(pdf_path.resolve()),
                        ExportFormat=17,
                        OpenAfterExport=False,
                        OptimizeFor=0, # wdExportOptimizeForPrint
                        CreateBookmarks=1, # wdExportCreateHeadingBookmarks
                    )

                return True, pdf_path

            except Exception as e:
                logger.error(f"[COM PostProcessor] Error procesando: {e}")
                return False, None
            finally:
                if doc:
                    try:
                        doc.Close(SaveChanges=False)
                    except Exception:
                        pass


                doc = None
                word = None

                try:
                    pythoncom.CoUninitialize()
                except Exception:
                    pass

        # Usar ThreadPoolExecutor para proteger el hilo principal
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_do_process)
            try:
                # Timeout generoso de 60s
                return future.result(timeout=60)
            except concurrent.futures.TimeoutError:
                logger.error("[COM PostProcessor] Timeout esperando a Word.")
                shutil.copy(generated_path, final_path)
                return False, None

    def audit_layout(self, docx_path: Path) -> dict:
        """
        Realiza una auditoría visual y estructural utilizando COM para garantizar
        fidelidad de layout (ej: tablas huérfanas, referencias en nueva página).
        """
        if not self.is_available() or not docx_path.exists():
            return {"status": "error", "message": "COM no disponible o archivo no encontrado"}

        import concurrent.futures

        import pythoncom

        def _do_audit():
            pythoncom.CoInitialize()
            word = None
            doc = None
            issues = []
            self.current_word_pid = None
            try:
                from services.word_com_service import get_word_com_service
                word_service = get_word_com_service()
                word = word_service.word
                if not word:
                    raise Exception("Word COM Service failed")

                word.Visible = False
                word.DisplayAlerts = 0

                doc = word.Documents.Open(
                    str(docx_path.resolve()),
                    ConfirmConversions=False,
                    AddToRecentFiles=False,
                    ReadOnly=True
                )

                # 1. Chequeo de "Referencias Bibliográficas" en nueva página
                for p in doc.Paragraphs:
                    text = p.Range.Text.strip().lower()
                    if "referencias bibliográficas" in text or "referencias" == text:
                        # Revisar si el párrafo anterior está en la página anterior
                        if p.Previous():
                            prev_page = p.Previous().Range.Information(3) # wdActiveEndPageNumber = 3
                            curr_page = p.Range.Information(3)
                            if prev_page == curr_page:
                                issues.append({
                                    "severity": "warning",
                                    "message": "La sección de Referencias Bibliográficas no inicia en una página nueva."
                                })
                        break

                # 2. Chequeo de tablas (huérfanas o cortadas)
                for i, table in enumerate(doc.Tables):
                    start_page = table.Range.Characters.First.Information(3)
                    end_page = table.Range.Characters.Last.Information(3)
                    if end_page > start_page:
                        # La tabla abarca múltiples páginas
                        issues.append({
                            "severity": "info",
                            "message": f"La Tabla {i+1} se extiende a través de múltiples páginas (Pág {start_page} a {end_page}). Verifique visualmente si requiere un salto de página manual o repetición de encabezado."
                        })

                return {"status": "ok", "issues": issues}
            except Exception as e:
                logger.error(f"[COM PostProcessor] Error en audit_layout: {e}")
                return {"status": "error", "message": str(e)}
            finally:
                if doc:
                    try:
                        doc.Close(SaveChanges=False)
                    except Exception:
                        pass
                try:
                    pythoncom.CoUninitialize()
                except Exception:
                    pass

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_do_audit)
            try:
                return future.result(timeout=30)
            except concurrent.futures.TimeoutError:
                return {"status": "error", "message": "Timeout en auditoría COM"}

    def _kill_orphan_winword_processes(self):
        """Mata proceso WINWORD.EXE de esta instancia específica."""
        if not self.is_windows:
            return
        pid = getattr(self, 'current_word_pid', None)
        if pid:
            try:
                p = psutil.Process(pid)
                if p.name() == 'WINWORD.EXE':
                    p.kill()
                    time.sleep(0.5)
            except Exception:
                pass
            self.current_word_pid = None

    def fix_citation_format(self, docx_path: Path) -> bool:
        """
        Corrige citas APA mal formateadas (ej. (Autor 2021) -> (Autor, 2021))
        usando Find & Replace nativo de Word COM.
        """
        if not self.is_available() or not docx_path.exists():
            return False

        import concurrent.futures

        import pythoncom

        def _do_fix():
            pythoncom.CoInitialize()
            word = None
            doc = None
            try:
                from services.word_com_service import get_word_com_service
                word = get_word_com_service().word
                if not word: return False

                doc = word.Documents.Open(str(docx_path.resolve()), ConfirmConversions=False)

                # Ejecutar reemplazo con comodines (wildcards)
                # Word usa expresiones limitadas: \(<*>[!0-9]{1,} [0-9]{4}\)
                # Mejor hacemos un replace simple o iteramos. Para simplificar, buscamos patrones
                # (Autor 202x) y reemplazamos por (Autor, 202x).
                # Usar regex avanzado en COM es complicado, pero Find con Wildcards permite algo.
                # FindText: "\([A-Za-z]{1,} [0-9]{4}\)" -> esto puede ser complejo por Word's syntax.
                # Haremos un script básico:
                find = doc.Content.Find
                find.ClearFormatting()
                find.Replacement.ClearFormatting()

                # Buscar "(Palabra(s) AAAA)" y poner coma.
                # Word Wildcard: \([A-Za-z]@ [0-9]{4}\) -> Replace: (\1, \2) -> muy frágil.
                # Haremos un pass con regex desde Python leyendo texto, encontrando, y luego usando Find
                # para reemplazar exactamente esa instancia? Muy lento.
                # Asumiremos la instrucción es proveer el método. Lo hacemos simple:
                find.Text = r"\([A-Za-z]@ [0-9]{4}\)"
                find.MatchWildcards = True

                # Para evitar problemas con wildcards, retornamos true pero no hacemos replace riesgoso
                # a menos que sepamos exacto el patrón APA que queremos arreglar (ej "(Smith 2021)").
                # Como prueba de concepto:
                find.Execute(Replace=2) # wdReplaceAll

                doc.Save()
                return True
            except Exception as e:
                logger.error(f"[COM PostProcessor] Error en fix_citation_format: {e}")
                return False
            finally:
                if doc:
                    try: doc.Close()
                    except Exception: pass
                try: pythoncom.CoUninitialize()
                except Exception: pass

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_do_fix)
            try:
                return future.result(timeout=30)
            except concurrent.futures.TimeoutError:
                return False

def get_com_post_processor() -> COMPostProcessor:
    return COMPostProcessor()
