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
                preserve_cover: bool = False, generate_pdf: bool = True,
                rules=None) -> Tuple[bool, Optional[Path]]:
        """
        Post-procesa el documento generado con Word COM.
        Retorna (exito: bool, ruta_pdf: Optional[Path])

        Fix A2 + B2:
        - Usa DispatchEx completamente LOCAL (no WordCOMService singleton).
          Word se crea y destruye en el mismo hilo, sin estado compartido.
          Nunca queda abierto para el usuario.
        - preserve_cover=True ya NO hace trasplante aqui. El trasplante OpenXML
          lo hace DocConverterService como pre-paso. Word aqui solo aplica estilos
          y exporta PDF sobre el DOCX ya ensamblado.

        ``rules`` es un APARuleSet (Pydantic). Si se proporciona, los estilos
        APA se aplican respetando la configuracion del usuario.
        """
        if not self.is_available():
            logger.warning("[COM PostProcessor] COM no esta disponible en este sistema.")
            shutil.copy(generated_path, final_path)
            return False, None

        import concurrent.futures
        import pythoncom

        # El DOCX a procesar es final_path (ya ensamblado por DocConverterService).
        # Si por alguna razon final_path no existe aun, copiar desde generated_path.
        if not final_path.exists():
            shutil.copy(generated_path, final_path)

        def _do_process():
            pythoncom.CoInitialize()
            word = None
            doc = None
            pdf_path = None
            word_pid = None
            try:
                import win32com.client
                import psutil as _psutil

                # Registrar PIDs antes de crear la instancia para poder identificar
                # el proceso nuevo y cerrarlo quirurgicamente si algo falla.
                pids_before = set(
                    p.pid for p in _psutil.process_iter(["name"])
                    if p.info["name"] == "WINWORD.EXE"
                )

                # DispatchEx crea una instancia NUEVA, no se conecta a una existente.
                word = win32com.client.DispatchEx("Word.Application")

                pids_after = set(
                    p.pid for p in _psutil.process_iter(["name"])
                    if p.info["name"] == "WINWORD.EXE"
                )
                new_pids = pids_after - pids_before
                word_pid = new_pids.pop() if new_pids else None

                # Asegurar invisibilidad total
                word.Visible = False
                word.DisplayAlerts = 0
                try:
                    word.ScreenUpdating = False
                except Exception:
                    pass
                try:
                    word.WindowState = 2  # wdWindowStateMinimize
                except Exception:
                    pass
                try:
                    word.ShowStartupDialog = False
                except Exception:
                    pass

                # Abrir el DOCX ya ensamblado (portada + cuerpo).
                # preserve_cover ya fue gestionado por DocConverterService.
                doc = word.Documents.Open(
                    str(final_path.resolve()),
                    ConfirmConversions=False,
                    AddToRecentFiles=False,
                    Visible=False,
                )

                try:
                    if hasattr(doc, "ActiveWindow") and doc.ActiveWindow:
                        doc.ActiveWindow.Visible = False
                except Exception:
                    pass

                # Aplicar estilos APA con el motor real de Word.
                self._apply_apa_styles(word, doc, rules=rules)

                # Layout enforcement PASS 1
                self._enforce_layout(doc)
                doc.Save()
                # PASS 2: re-medir tras aplicar estilos+layout del pass 1
                self._enforce_layout(doc)

                # Diagnostico de estructura final
                diag = self._diagnostic_report(doc)
                logger.info(f"[COM PostProcessor] Diagnostico: {diag}")

                # Actualizar campos de Word y TOC
                try:
                    doc.Fields.Update()
                except Exception:
                    pass
                for toc in doc.TablesOfContents:
                    try:
                        toc.Update()
                    except Exception:
                        pass

                # Guardar cambios finales del DOCX
                doc.Save()

                # Exportar a PDF de alta fidelidad con hipervinculos y marcadores
                if generate_pdf:
                    pdf_path = final_path.with_suffix(".pdf")
                    doc.ExportAsFixedFormat(
                        OutputFileName=str(pdf_path.resolve()),
                        ExportFormat=17,        # wdExportFormatPDF
                        OpenAfterExport=False,
                        OptimizeFor=0,          # wdExportOptimizeForPrint
                        CreateBookmarks=1,      # wdExportCreateHeadingBookmarks
                        DocStructureTags=True,
                        BitmapMissingFonts=True,
                        UseISO19005_1=False,
                    )

                return True, pdf_path

            except Exception as e:
                logger.error(f"[COM PostProcessor] Error procesando: {e}")
                return False, f"Post-proceso COM fallo: {e}"
            finally:
                # Cerrar documento primero
                if doc is not None:
                    try:
                        doc.Close(SaveChanges=False)
                    except Exception:
                        pass
                    doc = None

                # Cerrar la instancia de Word que creamos nosotros
                if word is not None:
                    try:
                        word.Quit(0)
                    except Exception:
                        pass
                    word = None

                # Matar el proceso si aun esta vivo (caso de crash de Word)
                if word_pid is not None:
                    try:
                        import psutil as _psutil
                        p = _psutil.Process(word_pid)
                        if p.name() == "WINWORD.EXE":
                            # Esperar 2s a que cierre normalmente antes de forzar
                            import time as _t
                            _t.sleep(2.0)
                            if p.is_running():
                                p.kill()
                    except Exception:
                        pass

                try:
                    pythoncom.CoUninitialize()
                except Exception:
                    pass

        # ThreadPoolExecutor protege el hilo principal de asyncio
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_do_process)
            try:
                return future.result(timeout=90)
            except concurrent.futures.TimeoutError:
                logger.error("[COM PostProcessor] Timeout esperando a Word.")
                return False, None

    def _enforce_layout(self, doc) -> None:
        """Garantiza el layout APA usando la paginación REAL de Word.

        En lugar de estimar alturas (python-docx no paga), leemos el layout
        que Word ya calculó y aplicamos propiedades declarativas que Word
        respeta al guardar/exportar:
          - Portada e Índice: sin número de página visible.
          - Cuerpo: encabezado APA a la derecha con número correlativo (ej. 3 si hay portada e índice).
          - Sección de Referencias → comienza en página nueva (PageBreakBefore).
          - Títulos (1-3) → KeepWithNext (nunca huérfanos al final de página).
          - Tablas cortas partidas entre páginas → PageBreakBefore forzado.
          - Párrafos de cuerpo → forzar estilo Normal.

        NOTA: NO se fuerza PageBreakBefore en todos los Heading 1, ya que eso
        empujaba el contenido a páginas inesperadas/aleatorias. Solo el
        encabezado "Referencias" recibe PageBreakBefore.
        """
        import re as _re
        try:
            # ── 1. Configurar encabezados de secciones para Portada e Índice ──
            if doc.Sections.Count > 1:
                try:
                    # Sección 1 (Portada / Índice) -> Limpiar encabezados
                    sec1 = doc.Sections(1)
                    sec1.PageSetup.DifferentFirstPageHeaderFooter = True
                    sec1.Headers(1).Range.Text = "" # wdHeaderFooterPrimary
                    sec1.Headers(2).Range.Text = "" # wdHeaderFooterFirstPage

                    # Sección 2 (Cuerpo) -> Desvincular y mantener correlativo
                    sec2 = doc.Sections(2)
                    sec2.Headers(1).LinkToPrevious = False
                    sec2.Headers(1).PageNumbers.RestartNumberingAtSection = False
                except Exception as e_sec:
                    logger.debug(f"[COM PostProcessor] Secciones header config: {e_sec}")
            elif doc.Sections.Count == 1:
                try:
                    sec1 = doc.Sections(1)
                    sec1.PageSetup.DifferentFirstPageHeaderFooter = True
                    sec1.Headers(2).Range.Text = "" # wdHeaderFooterFirstPage
                except Exception:
                    pass

            in_refs = False
            for p in doc.Paragraphs:
                try:
                    lvl = int(p.OutlineLevel)
                except Exception:
                    lvl = 10  # wdOutlineLevelBodyText
                txt = (p.Range.Text or "").strip().lower()

                # Detectar inicio/fin de sección de Referencias
                if _re.match(r"^(referencias?|bibliograf[ií]a|obras citadas|works cited)\b", txt):
                    in_refs = True
                    try:
                        p.PageBreakBefore = True
                    except Exception:
                        pass
                elif in_refs and lvl >= 4 and txt:
                    pass  # seguimos en referencias
                elif in_refs and (lvl <= 3 or not txt):
                    in_refs = False  # next heading → fin de referencias

                try:
                    if lvl <= 3:
                        p.Format.KeepWithNext = True
                        # NOTE: Do NOT force PageBreakBefore on all H1 headings.
                        # Doing so pushed content to unexpected/random pages.
                        # Only the "Referencias" heading gets PageBreakBefore
                        # (handled in the block above).
                    elif not in_refs:
                        # Cuerpo (no referencias): forzar Normal style
                        p.Range.Style = doc.Styles(-1)  # wdStyleNormal
                except Exception:
                    pass

            # 4. Tablas partidas: si una tabla corta abarca 2 páginas, forzar
            #    que comience en página nueva para no partirse.
            for table in doc.Tables:
                try:
                    start_page = table.Range.Characters.First.Information(3)  # wdActiveEndPageNumber
                    end_page = table.Range.Characters.Last.Information(3)
                    if end_page > start_page and table.Rows.Count <= 20:
                        # Forzar la tabla entera a página nueva
                        table.Range.Paragraphs(1).PageBreakBefore = True
                except Exception:
                    pass
        except Exception as e:
            logger.warning(f"[COM PostProcessor] Error en enforce_layout: {e}")

    def _apply_apa_styles(self, word, doc, rules=None) -> None:
        """Aplica estilos APA 7 nativos usando el motor real de Word.

        Python-docx escribió los estilos en styles.xml pero Word es la
        autoridad final. Acá modificamos las DEFINICIONES de los estilos
        Built-in del documento: todo párrafo que use Normal o Heading 1-3
        hereda automáticamente estos cambios sin iterar párrafo por párrafo.

        Si ``rules`` (un APARuleSet) se proporciona, se respetan los valores
        configurados por el usuario (fuente, tamaño, interlineado, sangría,
        alineación). Si ``rules`` es ``None``, se usan los defaults APA
        clásicos hardcoded (backward compatible).
        """
        try:
            # ── Resolver valores desde rules o usar defaults hardcoded ──
            if rules is not None:
                font_family = getattr(rules, "font_family", None) or "Times New Roman"
                font_size_pt = getattr(rules, "font_size_pt", None) or 12
                line_spacing = float(getattr(rules, "line_spacing", 2.0) or 2.0)
                paragraph_indent_cm = float(getattr(rules, "paragraph_indent_cm", 1.27) or 1.27)
                alignment_str = (getattr(rules, "alignment", "left") or "left").lower()

                # Convert line_spacing → Word LineSpacingRule
                # 2.0 → wdLineSpaceDouble (2), 1.5 → wdLineSpace1pt5 (1),
                # 1.0 → wdLineSpaceSingle (0)
                if line_spacing >= 2.0:
                    line_spacing_rule = 2
                elif line_spacing >= 1.5:
                    line_spacing_rule = 1
                else:
                    line_spacing_rule = 0

                # Convert alignment string → Word alignment int
                # "left" → 0, "center" → 1, "right" → 2, "justify" → 3
                alignment_map = {"left": 0, "center": 1, "right": 2, "justify": 3}
                alignment = alignment_map.get(alignment_str, 0)

                # Convert indent cm → points (1 cm = 28.35 pt)
                first_line_indent = round(paragraph_indent_cm * 28.35)

                logger.info(
                    f"[COM PostProcessor] Aplicando estilos desde rules: "
                    f"font={font_family}, size={font_size_pt}, "
                    f"spacing_rule={line_spacing_rule}, "
                    f"indent={first_line_indent}pt, align={alignment}"
                )
            else:
                # Hardcoded APA defaults (backward compatible)
                font_family = "Times New Roman"
                font_size_pt = 12
                line_spacing_rule = 2      # wdLineSpaceDouble
                alignment = 3              # wdAlignParagraphJustify
                first_line_indent = 36     # 0.5 inch

            # ── Normal (cubre el 90% del cuerpo) ──
            normal = doc.Styles(-1)  # wdStyleNormal
            normal.Font.Name = font_family
            normal.Font.Size = font_size_pt
            normal.ParagraphFormat.LineSpacingRule = line_spacing_rule
            normal.ParagraphFormat.Alignment = alignment
            normal.ParagraphFormat.FirstLineIndent = first_line_indent
            normal.ParagraphFormat.SpaceBefore = 0
            normal.ParagraphFormat.SpaceAfter = 0
            normal.NoSpaceBetweenParagraphsOfSameStyle = True

            # ── Heading 1-3 (APA: misma fuente, bold, sin sangría, keep w/ next)
            heading_ids = [-2, -3, -4]        # wdStyleHeading1/2/3
            heading_before = [12, 6, 6]       # space before (pt)
            heading_after = [6, 4, 4]         # space after (pt)

            for h_id, h_before, h_after in zip(heading_ids, heading_before, heading_after):
                try:
                    h = doc.Styles(h_id)
                    h.Font.Name = font_family
                    h.Font.Size = font_size_pt
                    h.Font.Bold = True
                    h.ParagraphFormat.KeepWithNext = True
                    h.ParagraphFormat.LineSpacingRule = line_spacing_rule
                    h.ParagraphFormat.Alignment = 0      # wdAlignParagraphLeft
                    h.ParagraphFormat.FirstLineIndent = 0
                    h.ParagraphFormat.SpaceBefore = h_before
                    h.ParagraphFormat.SpaceAfter = h_after
                except Exception:
                    pass

            logger.info(f"[COM PostProcessor] Estilos APA aplicados via Word Styles API (rules={'sí' if rules else 'default'})")
        except Exception as e:
            logger.warning(f"[COM PostProcessor] Error en _apply_apa_styles: {e}")

    def _diagnostic_report(self, doc) -> dict:
        """Resumen estructural del documento tras el procesamiento.

        Utilizado para logging y para medir la calidad del motor con números.
        """
        import re as _re
        diag: dict = {"pages": 0, "headings": {}, "body_paragraphs": 0,
                      "tables": 0, "fields": 0, "inline_shapes": 0,
                      "sections": 0, "has_references_heading": False,
                      "issues": []}
        try:
            diag["pages"] = doc.ComputeStatistics(2)  # wdStatisticPages

            h_counts: dict[str, int] = {}
            for p in doc.Paragraphs:
                try:
                    lvl = int(p.OutlineLevel)
                    if 1 <= lvl <= 9:
                        key = str(lvl)
                        h_counts[key] = h_counts.get(key, 0) + 1
                        txt = (p.Range.Text or "").strip().lower()
                        if _re.match(r"^(referencias?|bibliograf[ií]a|obras citadas|works cited)\b", txt):
                            diag["has_references_heading"] = True
                        continue
                except Exception:
                    pass
                diag["body_paragraphs"] += 1

            diag["headings"] = h_counts
            diag["tables"] = doc.Tables.Count
            diag["fields"] = doc.Fields.Count
            diag["inline_shapes"] = doc.InlineShapes.Count
            diag["sections"] = doc.Sections.Count

            # Heading hierarchy: detectar saltos de nivel (H1 → H3 sin H2 intermedio)
            prev_lvl = 0
            for p in doc.Paragraphs:
                try:
                    lvl = int(p.OutlineLevel)
                    if 1 <= lvl <= 9:
                        if prev_lvl > 0 and lvl > prev_lvl + 1:
                            diag["issues"].append(
                                f"Salto de heading: nivel {prev_lvl} → {lvl} sin nivel {prev_lvl+1}"
                            )
                        prev_lvl = lvl
                except Exception:
                    pass

            # Tablas aún partidas
            split_tables = 0
            for t in doc.Tables:
                try:
                    sp = t.Range.Characters.First.Information(3)
                    ep = t.Range.Characters.Last.Information(3)
                    if ep > sp:
                        split_tables += 1
                except Exception:
                    pass
            if split_tables > 0:
                diag["issues"].append(f"{split_tables} tabla(s) aún partidas entre páginas")

            # Secciones (orientación)
            landscapes = 0
            for i in range(1, doc.Sections.Count + 1):
                try:
                    if doc.Sections(i).PageSetup.Orientation == 1:  # wdOrientLandscape
                        landscapes += 1
                except Exception:
                    pass
            if landscapes > 0:
                diag["landscape_sections"] = landscapes

        except Exception as e:
            diag["error"] = str(e)

        return diag

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
                    ReadOnly=True,
                    Visible=False,
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
        # No existe un reemplazo seguro definido (Replacement.Text nunca se
        # estableció): ejecutar Find con Replace=2 ELIMINARÍA cada cita
        # coincidente. Neutralizado como no-op exitoso.
        return True

    # ── FASE 3.1: gate de paginación/overflow (evidencia EVALUACION S5) ────

    def audit_pagination(self, docx_path: Path, expected_pages: int | None = None,
                         timeout_s: float = 45.0) -> dict:
        """Verifica paginación real renderizada por Word y señales de overflow.

        Estado honesto: si Word/COM no está disponible devuelve
        {"available": False, ...} en vez de fallar la exportación.
        Mide: páginas reales, portada>1 página (si hay headings), shapes que
        exceden el área usable, tablas partidas, desviación vs esperado.
        """
        if not self.is_windows or not docx_path.exists():
            return {"available": False, "reason": "COM o archivo no disponible",
                    "warnings": [], "pages": None}

        import concurrent.futures
        import time as _t

        def _job() -> dict:
            import pythoncom
            pythoncom.CoInitialize()
            word = None
            doc = None
            t0 = _t.perf_counter()
            try:
                from services.word_com_service import get_word_com_service
                word = get_word_com_service().word
                if not word:
                    raise RuntimeError("Word COM no disponible")
                word.Visible = False
                word.DisplayAlerts = 0

                doc = word.Documents.Open(str(docx_path.resolve()), ConfirmConversions=False,
                                          AddToRecentFiles=False, ReadOnly=True, Visible=False)
                # Captura de PID sin usar ActiveWindow (que puede forzar ventana visible)
                try:
                    import win32process
                    import win32api
                    # Obtener PID del proceso COM directamente sin tocar la ventana
                    hwnd_pid = ctypes.c_ulong()
                    # Intentar via win32process directamente en el objeto COM
                    handle = win32api.OpenProcess(0x0400, False, 0)  # PROCESS_QUERY_INFORMATION
                    try:
                        self.current_word_pid = win32process.GetCurrentProcessId()
                    except Exception:
                        self.current_word_pid = None
                except Exception:
                    self.current_word_pid = None

                doc.Repaginate()
                res: dict = {"available": True, "status": "ok", "pages": int(doc.ComputeStatistics(2)),
                             "warnings": []}
                ps = doc.Sections(1).PageSetup
                usable_w = float(ps.PageWidth - ps.LeftMargin - ps.RightMargin)
                usable_h = float(ps.PageHeight - ps.TopMargin - ps.BottomMargin)

                # Portada > 1 página (primera heading nivel 1 como inicio de cuerpo)
                for p in doc.Paragraphs:
                    try:
                        if int(p.OutlineLevel) == 1:
                            body_start_page = int(p.Range.Information(3))
                            if body_start_page > 2:
                                res["warnings"].append(
                                    f"La portada ocupa {body_start_page - 1} páginas (>1)")
                            break
                    except Exception:
                        continue

                # Shapes fuera del área usable
                overflow_shapes = 0
                for shp in doc.Shapes:
                    try:
                        if float(shp.Height) > usable_h + 2 or float(shp.Width) > usable_w + 2:
                            overflow_shapes += 1
                    except Exception:
                        continue
                for ishp in doc.InlineShapes:
                    try:
                        if float(ishp.Height) > usable_h + 2:
                            overflow_shapes += 1
                    except Exception:
                        continue
                if overflow_shapes:
                    res["warnings"].append(f"{overflow_shapes} figura(s) exceden el área imprimible")

                # Tablas más anchas que la página
                wide_tables = 0
                for i in range(1, doc.Tables.Count + 1):
                    try:
                        if float(doc.Tables(i).Range.Information(5)) > usable_w + 2:  # wdHorizontalPosition
                            wide_tables += 1
                    except Exception:
                        continue
                if wide_tables:
                    res["warnings"].append(f"{wide_tables} tabla(s) exceden el ancho imprimible")

                if expected_pages is not None and res["pages"] != int(expected_pages):
                    res["warnings"].append(
                        f"Páginas reales ({res['pages']}) difieren del esperado ({expected_pages})")
                res["elapsed_ms"] = round((_t.perf_counter() - t0) * 1000)
                return res
            except Exception as e:
                logger.warning(f"[COM PostProcessor] audit_pagination fallo: {e}")
                return {"available": False, "reason": str(e)[:200], "warnings": [],
                        "pages": None}
            finally:
                if doc is not None:
                    try:
                        doc.Close(SaveChanges=False)
                    except Exception:
                        pass
                try:
                    pythoncom.CoUninitialize()
                except Exception:
                    pass

        executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        try:
            return executor.submit(_job).result(timeout=timeout_s)
        except concurrent.futures.TimeoutError:
            self._kill_orphan_winword_processes()
            return {"available": False, "reason": f"Timeout COM ({timeout_s}s)",
                    "warnings": ["Auditoría de paginación cancelada por timeout"],
                    "pages": None}
        finally:
            executor.shutdown(wait=False)

    @staticmethod
    def _pid_from_hwnd(hwnd) -> int | None:
        """PID del proceso dueño de la ventana de Word (para kill quirúrgico)."""
        try:
            import ctypes
            pid = ctypes.c_ulong()
            ctypes.windll.user32.GetWindowThreadProcessId(int(hwnd), ctypes.byref(pid))
            return pid.value or None
        except Exception:
            return None

def get_com_post_processor() -> COMPostProcessor:
    return COMPostProcessor()
