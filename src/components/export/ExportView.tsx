/* WordAPA7 — Túnel de Exportación & Pantalla Final de Descarga
   COLUMPA ÚNICA ALINEADA A LA IZQUIERDA (no centrada): la pantalla con menos
   elementos del flujo — ícono de éxito → título → una línea de descripción →
   dos botones pegados (principal sólida + secundaria fantasma).
   - Sin listas, tarjetas, columnas ni scroll en el estado por defecto.
   - Formato, opciones y vista previa viven OCULTOS tras el toggle
     "Opciones", que va DEBAJO de las dos acciones para no competir con ellas.
   - El resumen de hallazgos/estadísticas se mostró en la vista de revisión:
     no se repite aquí. El espacio en blanco es intencional.
   Refactorizado a design tokens CSS — sin clases Tailwind, compatible light/dark. */

import React, { useCallback, useEffect, useState } from 'react';
import { useDocStore } from '../../store/useDocStore';
import { ReactPDFPreview } from '../layout/ReactPDFPreview';
import { PaperCanvas } from '../layout/PaperCanvas';
import { resolveAssetUrl, connectWord } from '../../api/backend';
import { getApiBase } from '../../api/http';
import {
  FileText, FileType, FileCode, CheckCircle2,
  AlertTriangle,
  Eye, ZoomIn, ZoomOut,
  Columns2,
  Copy, FolderOpen, ExternalLink, Upload, ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { DocumentMascot } from '../layout/DocumentMascot';
import {
  CUATRO_GRUPOS, CONTROLES_DEL_PANEL, DERIVADOS_DEL_PANEL,
} from './panelDeExportacion';
import { PORTADA_IDIOMAS, type PortadaLanguage } from '../../types';
import { calcularDestinoPDF } from '../../lib/exportDestino';
import { isWeb } from '../../lib/env';

function triggerDownload(url: string, filename?: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

type Format = 'docx' | 'pdf' | 'latex';
type PreviewMode = 'canvas' | 'diff' | 'pdf';

const FORMATS: {
  id: Format;
  label: string;
  sublabel: string;
  ext: string;
  icon: React.ElementType;
  iconColor: string;
}[] = [
  {
    id: 'docx',
    label: 'Word APA 7',
    sublabel: 'Documento editable',
    ext: '.docx',
    icon: FileText,
    iconColor: 'var(--color-accent)',
  },
  {
    id: 'pdf',
    label: 'PDF Listo',
    sublabel: 'Para entrega / imprimir',
    ext: '.pdf',
    icon: FileType,
    iconColor: 'var(--color-danger)',
  },
  {
    id: 'latex',
    label: 'LaTeX',
    sublabel: 'Código fuente .tex',
    ext: '.tex',
    icon: FileCode,
    iconColor: 'var(--color-success)',
  },
];

export const ExportView: React.FC = () => {
  const {
    doc, isLoading,
    exportDocx, exportPdf, exportLatex,
    setViewMode,
    sayMascot, clearQuickExport,
    zoomLevel, setZoomLevel,
    goHome, showToast,
  } = useDocStore();

  const activeFilePath = useDocStore((s) => s.activeFilePath);

  /* El formato y el control de cambios salen del store, no de un `useState`
     local. Eran locales y por eso se perdían al salir del paso, mientras el
     menú de Archivo tenía los suyos: dos verdades para lo mismo. Ver el
     comentario en `uiSlice.ts`. */
  const format = useDocStore((s) => s.format);
  const setFormat = useDocStore((s) => s.setFormat);
  const tracked = useDocStore((s) => s.tracked);
  const setTracked = useDocStore((s) => s.setTracked);

  const [previewMode, setPreviewMode] = useState<PreviewMode>('canvas');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<string>('Generando tipografía APA 7...');
  const [downloadedFile, setDownloadedFile] = useState<{ path: string; filename: string } | null>(null);
  const [isSending, setIsSending] = useState(false);
  /* "Ver en Word" genera el .docx APA y lo abre en Word SIN tocar el original:
     es una vista previa real, no un reemplazo. Estado propio para no confundir
     su progreso con el de "Enviar a Word". */
  const [viendoEnWord, setViendoEnWord] = useState(false);

  /* LO QUE ESTÁ SIN GUARDAR EN WORD.
     El backend no lo descarta: devuelve 409 con `requiere_confirmacion` y no
     toca nada. acá se ofrece LAS DOS SALIDAS, con un botón cada una: guardar en
     Word y mandar, o descartar y mandar. Un toast con el texto "tenés cambios
     sin guardar" informa y no deja decidir, que es el mismo defecto que el
     aviso de citas fantasma que reaparecía al siguiente clic. */
  const [sinGuardar, setSinGuardar] = useState<string | null>(null);
  /* Dónde quedó la copia de trabajo, DICHA en la pantalla y no solo en un
     toast que se va solo. Una copia que la persona no sabe nombrar no la puede
     ir a buscar, y el aviso de "tu original no se tocó" tiene que venir con la
     ruta, o es una promesa sin prueba. */
  const [copiaDeTrabajo, setCopiaDeTrabajo] = useState<string | null>(null);

  const enviarAWord = useCallback(async (opcion: { guardar?: boolean; forzar?: boolean } = {}) => {
    if (!doc?.session_id || !activeFilePath) return;
    setIsSending(true);
    setSinGuardar(null);
    setCopiaDeTrabajo(null);
    try {
      const res = await fetch(`${getApiBase()}/send-to-word/${doc.session_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: activeFilePath, ...opcion }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.requiere_confirmacion) {
        /* No es un error: es una pregunta. El documento sigue abierto en Word
           y el archivo original sigue como estaba. */
        setSinGuardar(data.message ?? 'Tenés cambios sin guardar en Word.');
        return;
      }
      if (!res.ok) {
        showToast(data.detail || `Error ${res.status} al enviar a Word`, 'error');
        return;
      }
      showToast(data.message ?? 'Documento APA enviado a Word', data.method === 'com' ? 'success' : 'info');
      if (data.working_path) setCopiaDeTrabajo(data.working_path);
    } catch (e) {
      showToast('No se pudo conectar al motor para enviar a Word', 'error');
    } finally {
      setIsSending(false);
    }
  }, [doc?.session_id, activeFilePath, showToast]);

  /* ABRIR EN WORD (EN VIVO). No reemplaza nada: abre el `.docx` del usuario en
     su Word con `os.startfile` para que el panel del complemento trabaje sobre
     el documento real. Es un verbo distinto del de "Enviar a Word", que pisa el
     archivo con la versión generada, y por eso son dos botones y no uno. */
  const [conectando, setConectando] = useState(false);
  const abrirEnWord = useCallback(async () => {
    if (!activeFilePath) return;
    setConectando(true);
    try {
      await connectWord(activeFilePath);
      showToast(
        'Documento abierto en tu Word. Si el panel no aparece: pestaña WordAPA7, botón Panel.',
        'success',
      );
    } catch {
      showToast('No se pudo abrir el documento en Word', 'error');
    } finally {
      setConectando(false);
    }
  }, [activeFilePath, showToast]);

  /* VER EN WORD (no destructivo). Genera el .docx APA y lo abre en Word para
     revisarlo, sin pisar el archivo original. Reutiliza dos motores que ya
     existen: /api/generate (o /generate-tracked) produce el archivo y devuelve
     su ruta absoluta en `open_path`, y /api/open-in-word lo abre con el Word
     del usuario. Es el verbo que faltaba: "Abrir" muestra el original,
     "Enviar" pisa el original, "Ver" muestra el RESULTADO sin tocar nada. */
  const verEnWord = useCallback(async () => {
    const { doc: docActual, rules, portada, acta, references } = useDocStore.getState();
    if (!docActual?.session_id) return;
    setViendoEnWord(true);
    try {
      const base = getApiBase();
      const endpoint = tracked ? `${base}/generate-tracked` : `${base}/generate`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: docActual.session_id, rules, portada, meta: acta, references,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.detail || `Error ${res.status} al generar el documento`, 'error');
        return;
      }
      if (!data.open_path) {
        showToast('El motor no devolvió la ruta del documento generado', 'error');
        return;
      }
      const openRes = await fetch(`${base}/open-in-word`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: data.open_path }),
      });
      const openData = await openRes.json().catch(() => ({}));
      if (!openRes.ok) {
        showToast(openData.detail || `Error ${openRes.status} al abrir en Word`, 'error');
        return;
      }
      showToast('Documento APA abierto en Word. Tu archivo original no se modificó.', 'success');
    } catch {
      showToast('No se pudo conectar al motor para abrir en Word', 'error');
    } finally {
      setViendoEnWord(false);
    }
  }, [tracked, showToast]);

  useEffect(() => {
    sayMascot('Tu documento cumple con las pautas de APA 7ma Edición. Listo para descargar.', 'success');
  }, [sayMascot]);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onDownloadCompleted) return undefined;
    return api.onDownloadCompleted((data: { path: string; filename: string }) => {
      setDownloadedFile(data);
    });
  }, []);

  // Manejo de fases dinámicas durante exportación
  useEffect(() => {
    let t1: ReturnType<typeof setTimeout>, t2: ReturnType<typeof setTimeout>;
    if (isLoading) {
      setLoadingPhase('Generando tipografía APA 7...');
      t1 = setTimeout(() => setLoadingPhase('Validando saltos de página y márgenes...'), 1200);
      t2 = setTimeout(() => setLoadingPhase('Empaquetando documento final...'), 2600);
    }
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isLoading]);

  // Ambos handlers van memoizados: el atajo de teclado depende de
  // `doExport`, y sin `useCallback` esa dependencia cambia en cada
  // render, lo que devuelve el efecto a suscribirse en cada render.
  const doExport = useCallback(async () => {
    clearQuickExport();
    setDownloadedFile(null);
    if (format === 'pdf') {
      const destino = calcularDestinoPDF();
      if (destino) {
        // Con proyecto activo: llamar a la API directamente con el destino
        const { doc, rules, portada, acta, references } = useDocStore.getState();
        if (!doc) return;
        try {
          const base = getApiBase();
          const res = await fetch(`${base}/generate-pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: doc.session_id,
              rules,
              portada,
              meta: acta,
              references,
              destino_en_disco: destino,
            }),
          });
          if (!res.ok) throw new Error('Error al exportar PDF');
          const data = await res.json();
          if (data.download_url) {
            let path = data.download_url;
            if (!path.startsWith('http')) {
              if (base.endsWith('/api') && path.startsWith('/api/')) {
                path = path.slice(4);
              }
            }
            const downloadUrl = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
            triggerDownload(downloadUrl, data.pdf_name || (doc.file_name?.replace(/\.[^.]+$/, '') + '.pdf'));
          }
          showToast('PDF guardado en Exportados/', 'success');
        } catch (err: any) {
          showToast(err.message || 'Error al exportar PDF', 'error');
        }
      } else {
        // Sin proyecto: comportamiento actual
        exportPdf();
      }
    } else if (format === 'latex') exportLatex();
    else exportDocx(tracked);
  }, [clearQuickExport, format, tracked, exportPdf, exportLatex, exportDocx, showToast]);

  const handleDownloadClick = doExport;

  // Atajo de teclado: Ctrl + S o Cmd + S para descargar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleDownloadClick();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDownloadClick]);

  if (!doc) return null;

  /* El botón principal nombra el archivo que se va a descargar. Quien elige
     PDF en el panel y después lo cierra tiene que saber que sale un PDF, no
     un "documento" de tipo desconocido. */
  const destino = format === 'pdf' ? 'documento PDF' : format === 'latex' ? 'código LaTeX (.tex)' : 'Word APA 7 (.docx)';

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        backgroundColor: 'var(--color-bg-canvas)',
      }}
    >

      {/* ── COLUMNA ÚNICA ALINEADA A LA IZQUIERDA: pantalla final de descarga ── */}
      <aside
        aria-label="Exportación lista para descargar"
        className="export-view-panel"
        style={{
          width: 'clamp(420px, 38vw, 520px)',
          flexShrink: 0,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          gap: '16px',
          padding: '60px 48px',
          backgroundColor: 'transparent',
          borderRight: previewOpen ? '1px solid var(--color-border-subtle)' : 'none',
          overflowY: 'auto',
          textAlign: 'left',
          zIndex: 10,
        }}
      >
        {/* 1. Check de 22px */}
        <CheckCircle2 size={22} strokeWidth={1.75} aria-hidden style={{ color: 'var(--color-success)' }} />

        {/* 2. Título */}
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)' }}>
          Documento listo
        </h1>

        <div
          className="export-file-identity"
          aria-label={`Archivo de salida: ${doc.file_name || 'documento'}`}
        >
          <FileText size={18} strokeWidth={1.75} aria-hidden />
          <div style={{ minWidth: 0 }}>
            <strong>{doc.file_name || 'Documento sin nombre'}</strong>
            <span>{FORMATS.find((item) => item.id === format)?.label} {FORMATS.find((item) => item.id === format)?.ext}</span>
          </div>
        </div>

        {/* Una sola línea de descripción. No repite hallazgos ni estadísticas. */}
        <p style={{ margin: 0, maxWidth: '50ch', fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          Descarga el archivo final o vuelve al documento para hacer ajustes.
        </p>

        {/* 4. Las dos decisiones que quedan: este archivo u otro archivo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleDownloadClick}
            disabled={isLoading}
            style={{
              padding: '10px 18px', border: 'none', borderRadius: 'var(--radius-md)',
              background: 'var(--color-accent)', color: 'var(--color-text-on-accent)',
              fontFamily: 'inherit', fontSize: 'var(--text-base)', fontWeight: 600,
              /* La exportacion tarda 2.6s: deshabilitado pero con relleno de
                 acento y cursor de puntero, el boton pide un clic que no
                 hace nada. Tiene que verse muerto. */
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? loadingPhase : `Descargar ${destino}`}
          </button>
          <button
            type="button"
            onClick={() => goHome()}
            style={{
              padding: '10px 16px', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)',
              background: 'transparent', color: 'var(--color-text-secondary)',
              fontFamily: 'inherit', fontSize: 'var(--text-base)', fontWeight: 500, cursor: 'pointer',
            }}
          >
            Convertir otro
          </button>
        </div>

        {/* Acciones de Word — solo para .docx. "Ver en Word" NO necesita un
            archivo activo: genera la versión APA y la abre en Word para
            revisarla SIN tocar el original (reutiliza /api/generate +
            /api/open-in-word). "Abrir en Word" y "Enviar a Word" sí trabajan
            sobre el .docx del usuario, así que solo aparecen con
            `activeFilePath`: el primero lo trae al frente, el segundo lo pisa */}
        {format === 'docx' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={verEnWord}
              disabled={viendoEnWord || isLoading}
              title="Abrir en Word la versión APA ya formateada, sin modificar tu archivo original."
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '8px 14px',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-md)',
                background: 'transparent',
                color: viendoEnWord ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                fontFamily: 'inherit', fontSize: 'var(--text-sm)', fontWeight: 600,
                cursor: viendoEnWord || isLoading ? 'not-allowed' : 'pointer',
                opacity: viendoEnWord || isLoading ? 0.6 : 1,
                transition: 'color 0.15s, opacity 0.15s',
              }}
            >
              <Eye size={14} strokeWidth={1.75} aria-hidden />
              {viendoEnWord ? 'Abriendo en Word…' : 'Ver en Word'}
            </button>
            {activeFilePath && (
              <>
                <button
                  type="button"
                  onClick={abrirEnWord}
                  disabled={conectando || isLoading}
                  title={`Abrir ${activeFilePath.split(/[\\/]/).pop()} en tu Word para editar en vivo con el panel.`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '7px',
                    padding: '8px 14px',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    background: 'transparent',
                    color: 'var(--color-text-secondary)',
                    fontFamily: 'inherit', fontSize: 'var(--text-sm)', fontWeight: 600,
                    cursor: conectando || isLoading ? 'not-allowed' : 'pointer',
                    opacity: conectando || isLoading ? 0.6 : 1,
                    transition: 'color 0.15s, opacity 0.15s',
                  }}
                >
                  <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
                  {conectando ? 'Abriendo…' : 'Abrir en Word'}
                </button>
                <button
                  type="button"
                  onClick={() => enviarAWord()}
                  disabled={isSending || isLoading}
                  title="Abre una copia APA 7 en Word. Tu archivo original no se modifica."
                  style={{
                    display: 'flex', alignItems: 'center', gap: '7px',
                    padding: '8px 14px',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    background: 'transparent',
                    color: isSending ? 'var(--color-text-tertiary)' : 'var(--color-accent)',
                    fontFamily: 'inherit', fontSize: 'var(--text-sm)', fontWeight: 600,
                    cursor: isSending || isLoading ? 'not-allowed' : 'pointer',
                    opacity: isSending || isLoading ? 0.6 : 1,
                    transition: 'color 0.15s, opacity 0.15s',
                  }}
                >
                  <Upload size={14} strokeWidth={1.75} aria-hidden />
                  {isSending ? 'Abriendo copia…' : 'Abrir copia en Word'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Dónde quedó la copia que Word abrió, dicha y no solo implícita. */}
        {copiaDeTrabajo && (
          <p
            data-testid="ruta-de-la-copia"
            style={{
              margin: 0, width: '100%', display: 'flex', alignItems: 'flex-start', gap: '7px',
              fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-normal)',
            }}
          >
            <ShieldCheck size={14} strokeWidth={1.75} aria-hidden style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>
              {`Word abrió una copia de trabajo en ${copiaDeTrabajo}. Tu archivo original no se modificó.`}
            </span>
          </p>
        )}

        {/* ── La pregunta, no el aviso ──────────────────────────────────────
            Dos salidas y un botón para no hacer nada. "Guardar y enviar"
            guarda de verdad en Word a través del motor; "Descartar y enviar"
            manda `forzar` y el trabajo sin guardar se pierde, que es lo que
            dice el botón. Un aviso con un solo botón de cerrar no ofrece
            ninguna de las dos. */}
        {sinGuardar && (
          <div
            data-testid="confirmacion-sin-guardar"
            role="alertdialog"
            aria-label="El documento tiene cambios sin guardar en Word"
            style={{
              display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
              padding: '12px', width: '100%',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-warning)',
              backgroundColor: 'var(--color-accent-soft)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <AlertTriangle size={15} strokeWidth={1.75} aria-hidden style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: '2px' }} />
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)', lineHeight: 'var(--leading-normal)' }}>
                {sinGuardar}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => enviarAWord({ guardar: true })}
                disabled={isSending}
                style={{
                  flex: 1, minWidth: '140px', padding: '6px 10px',
                  backgroundColor: 'var(--color-accent)', color: 'var(--color-text-on-accent)',
                  border: 'none', borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-xs)', fontWeight: 700, cursor: isSending ? 'not-allowed' : 'pointer',
                }}
              >
                Guardar y enviar
              </button>
              <button
                type="button"
                onClick={() => enviarAWord({ forzar: true })}
                disabled={isSending}
                style={{
                  flex: 1, minWidth: '140px', padding: '6px 10px',
                  backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-danger)',
                  border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-xs)', fontWeight: 600, cursor: isSending ? 'not-allowed' : 'pointer',
                }}
              >
                Descartar y enviar
              </button>
              <button
                type="button"
                onClick={() => setSinGuardar(null)}
                disabled={isSending}
                style={{
                  padding: '6px 10px', background: 'transparent', color: 'var(--color-text-tertiary)',
                  border: 'none', borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-xs)', cursor: isSending ? 'not-allowed' : 'pointer',
                }}
              >
                Mejor no
              </button>
            </div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', lineHeight: 'var(--leading-normal)' }}>
              Tu archivo original no se tocó: la copia se actualiza recién cuando elijas.
            </span>
          </div>
        )}

        {downloadedFile && (
          <div className="export-downloaded-actions" aria-live="polite">
            <span>Descarga completada: {downloadedFile.filename}</span>
            <div>
              <button
                type="button"
                onClick={() => (window as any).electronAPI?.openPath?.(downloadedFile.path)}
              >
                <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
                Abrir archivo
              </button>
              <button
                type="button"
                onClick={() => (window as any).electronAPI?.showItemInFolder?.(downloadedFile.path)}
              >
                <FolderOpen size={14} strokeWidth={1.75} aria-hidden />
                Mostrar en carpeta
              </button>
            </div>
          </div>
        )}

        {/* Lo secundario (formato, ajustes, avisos, vista previa) se abre y se
            cierra desde acá: la columna final no lo muestra, solo lo guarda.

            El toggle deja de ser un link terciario sin icono y pasa a ser un
            botón CON ICONO y con la misma jerarquía que "Volver a editar": las
            dos entradas son del mismo nivel, y antes una era terciaria
            (`--color-text-tertiary`, sin icono) y la otra no, en un `div` que
            no jerarquizaba nada entre ellas. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setOptionsOpen((v) => !v)}
            aria-expanded={optionsOpen}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: 0, border: 'none', background: 'transparent',
              color: 'var(--color-accent)', fontFamily: 'inherit',
              fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer',
            }}
          >
            <SlidersHorizontal size={14} strokeWidth={1.75} aria-hidden />
            Opciones
          </button>
          <button
            type="button"
            onClick={() => { clearQuickExport(); setViewMode('edit'); }}
            style={{
              padding: 0, border: 'none', background: 'transparent',
              color: 'var(--color-accent)', fontFamily: 'inherit',
              fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Volver a editar
          </button>
        </div>

        {/* Zona OCULTA por defecto: formato, opciones, fricción y vista previa */}
        {optionsOpen && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              marginTop: 'var(--space-2)',
              paddingTop: 'var(--space-4)',
              borderTop: '1px solid var(--color-border-subtle)',
            }}
          >
            {/* Selector de Formato */}
            <div
              aria-label="Selector de formato"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '6px',
                padding: '4px',
                backgroundColor: 'var(--surface-subtle)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border-subtle)',
              }}
            >
              {FORMATS.map((f) => {
                const Icon = f.icon;
                const isSelected = format === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFormat(f.id)}
                    aria-pressed={isSelected}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '10px 6px',
                      borderRadius: 'var(--radius-md)',
                      textAlign: 'center',
                      transition: 'all var(--transition-fast)',
                      cursor: 'pointer',
                      border: '1px solid',
                      ...(isSelected
                        ? {
                            backgroundColor: 'var(--color-bg-surface)',
                            color: 'var(--color-text-primary)',
                            boxShadow: 'var(--shadow-sm)',
                            borderColor: 'var(--color-border-subtle)',
                          }
                        : {
                            backgroundColor: 'transparent',
                            color: 'var(--color-text-secondary)',
                            borderColor: 'transparent',
                          }),
                    }}
                  >
                    <Icon size={20} strokeWidth={1.75} style={{ color: f.iconColor }} aria-hidden />
                    {/* La extensión y el sublabel van ACÁ, que es donde la
                        persona elige. Antes solo aparecían en la línea de
                        identidad del documento, que no es donde se decide: un
                        formato del que hay que acordarse. */}
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', marginTop: 'var(--space-1)' }}>
                      {f.label}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                      {f.ext}
                    </span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                      {f.sublabel}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* ── EL PANEL DE AJUSTES ─────────────────────────────────────
                Lo que se revelaba antes era UN checkbox de track changes,
                visible solo si el formato era docx. Eso no era un panel de
                ajustes: era un interruptor con un botón al lado.

                La tabla de controles vive en `panelDeExportacion.ts`, con el
                destino de cada uno escrito. Lo que no llega a una llamada o a un
                parámetro del generador no está en el panel, y su motivo está
                en ese archivo y no en un comentario perdido acá. */}
            <PanelDeAjustes />

            {/* Acción secundaria: Copiar PDF físico al portapapeles para WhatsApp */}
            {format === 'pdf' && (
              <button
                type="button"
                onClick={async () => {
                  await useDocStore.getState().copyPdfToClipboard();
                }}
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  backgroundColor: 'var(--surface-subtle)',
                  color: 'var(--color-text-primary)',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600,
                  fontSize: 'var(--text-xs)',
                  border: '1px solid var(--color-border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.15s ease',
                }}
                title="Copiar archivo PDF al portapapeles de Windows para pegar con Ctrl+V en WhatsApp"
              >
                {/* T20: era un <svg> a mano con `strokeWidth="var(--icon-stroke)"`. Los iconos
                    vienen de lucide-react y su grosor es `--icon-stroke`. */}
                <Copy size={14} strokeWidth={1.75} aria-hidden />
                <span>Copiar PDF para WhatsApp (Ctrl+V)</span>
              </button>
            )}

            {/* Segunda fila de acciones fantasma: vista previa */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setPreviewOpen((v) => !v)}
                aria-pressed={previewOpen}
                style={{
                  padding: '8px 14px',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 'var(--font-semibold)',
                  color: previewOpen ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  background: previewOpen ? 'var(--color-accent-soft)' : 'transparent',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  transition: 'background var(--transition-fast), border-color var(--transition-fast)',
                }}
              >
                {previewOpen ? 'Ocultar vista previa' : 'Previsualizar'}
              </button>
            </div>
          </div>
        )}
      </aside>

      {!previewOpen && (
        <main
          className="export-companion-stage"
          aria-label="Mesa de entrega"
        >
          <div className="export-companion-art" aria-hidden="true">
            <div className="export-companion-paper">
              {/* 1.75 es el valor de `--icon-stroke`: el grosor de línea es uno en
                  toda la app, y un icono grande no es la excepción que lo admits. */}
              <FileText size={28} strokeWidth={1.75} aria-hidden />
              <span />
              <span />
              <span />
            </div>
            <div className="export-companion-mascot">
              <DocumentMascot size={92} kind="highlighter" expression="excited" />
            </div>
          </div>
          <div className="export-companion-copy">
            <span className="export-companion-kicker">MESA DE ENTREGA</span>
            <h2>Tu documento tiene salida.</h2>
            <p>Elige el formato, revisa una página si lo necesitas y llévatelo contigo.</p>
            <button
              type="button"
              onClick={() => {
                setOptionsOpen(true);
                setPreviewOpen(true);
              }}
            >
              <Eye size={15} strokeWidth={1.75} aria-hidden />
              Ver una página
            </button>
          </div>
        </main>
      )}

      {/* ── PANEL DERECHO: PREVISUALIZACIÓN (solo bajo toggle) ── */}
      {previewOpen && (
      <main
        aria-label="Previsualización en Vivo del Documento"
        style={{
          flex: 1,
          minWidth: 0,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--color-bg-canvas)',
          overflow: 'hidden',
        }}
      >
        {/* Barra Superior de Herramientas del Preview */}
        <header
          style={{
            height: '48px',
            padding: '0 var(--space-6)',
            flexShrink: 0,
            backgroundColor: 'var(--color-bg-surface)',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
            zIndex: 10,
            boxShadow: 'var(--shadow-sm)',
          }}
        >

          {/* Selector de Modo de Vista */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              padding: '2px',
              backgroundColor: 'var(--color-bg-surface-alt)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <button
              type="button"
              onClick={() => setPreviewMode('canvas')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-semibold)',
                transition: 'all var(--transition-fast)',
                cursor: 'pointer',
                border: 'none',
                ...(previewMode === 'canvas'
                  ? {
                      backgroundColor: 'var(--color-bg-surface)',
                      color: 'var(--color-accent)',
                      boxShadow: 'var(--shadow-sm)',
                    }
                  : {
                      backgroundColor: 'transparent',
                      color: 'var(--color-text-secondary)',
                    }),
              }}
            >
              <Eye size={13} strokeWidth={1.75} aria-hidden />
              <span>Páginas APA (Interactivo)</span>
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('diff')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-semibold)',
                transition: 'all var(--transition-fast)',
                cursor: 'pointer',
                border: 'none',
                ...(previewMode === 'diff'
                  ? {
                      backgroundColor: 'var(--color-bg-surface)',
                      color: 'var(--color-accent)',
                      boxShadow: 'var(--shadow-sm)',
                    }
                  : {
                      backgroundColor: 'transparent',
                      color: 'var(--color-text-secondary)',
                    }),
              }}
            >
              <Columns2 size={13} strokeWidth={1.75} aria-hidden />
              <span>Comparador Antes / Después</span>
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('pdf')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-semibold)',
                transition: 'all var(--transition-fast)',
                cursor: 'pointer',
                border: 'none',
                ...(previewMode === 'pdf'
                  ? {
                      backgroundColor: 'var(--color-bg-surface)',
                      color: 'var(--color-accent)',
                      boxShadow: 'var(--shadow-sm)',
                    }
                  : {
                      backgroundColor: 'transparent',
                      color: 'var(--color-text-secondary)',
                    }),
              }}
            >
              <FileType size={13} strokeWidth={1.75} aria-hidden />
              <span>PDF Compilado</span>
            </button>
          </div>

          {/* Controles de Zoom */}
          {previewMode === 'canvas' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setZoomLevel(Math.max(50, zoomLevel - 10))}
                title="Reducir zoom"
                style={{
                  padding: '6px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-subtle)',
                  backgroundColor: 'var(--color-bg-surface-alt)',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  transition: 'background-color var(--transition-fast)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ZoomOut size={13} strokeWidth={1.75} aria-hidden />
              </button>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 'var(--font-semibold)',
                  color: 'var(--color-text-primary)',
                  minWidth: '40px',
                  textAlign: 'center',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {zoomLevel}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel(Math.min(200, zoomLevel + 10))}
                title="Aumentar zoom"
                style={{
                  padding: '6px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-subtle)',
                  backgroundColor: 'var(--color-bg-surface-alt)',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  transition: 'background-color var(--transition-fast)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ZoomIn size={13} strokeWidth={1.75} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(100)}
                title="Restablecer zoom a 100%"
                style={{
                  marginLeft: '4px',
                  padding: '4px 8px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 'var(--font-medium)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-subtle)',
                  backgroundColor: 'var(--color-bg-surface-alt)',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  transition: 'background-color var(--transition-fast)',
                }}
              >
                100%
              </button>
            </div>
          )}
        </header>

        {/* Contenedor del Lienzo */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {previewMode === 'canvas' ? (
            <PaperCanvas />
          ) : previewMode === 'diff' ? (
            <SplitDiffPreview doc={doc} />
          ) : (
            <ReactPDFPreview />
          )}
        </div>
      </main>
      )}

    </div>
  );
};

/* ── EL PANEL DE AJUSTES ───────────────────────────────────────────────────
 *
 * Cuatro grupos, y cada control dice qué pasa si se APAGA, no solo qué pasa si
 * se activa: un interruptor que solo dice qué activa vende una cosa y hace
 * otra.
 *
 * LO QUE NO ESTÁ ACÁ Y POR QUÉ. La tabla de `panelDeExportacion.ts` lo dice
 * completo; lo que suma este componente es la regla que se ve:
 *
 *  - Un control edita. Un DERIVADO se lee. Los tamaño de hoja, los márgenes y
 *    la tipografía son DERIVADOS: Ajustes ya los tiene, con 31 controles en su
 *    pestaña Formato, y un segundo control editable sobre el mismo campo serían
 *    dos verdades para un dato.
 *  - El plan pedía "qué se incluye: portada, índice, figuras, tablas, referencias
 *    y apéndices". De esos, solo la portada tiene un parámetro real detrás. Los
 *    otros cinco tienen un interruptor que no llega a nada, y eso es peor que
 *    que no estén: ocupa el lugar de uno que sí llega.
 */
const FUENTES_APA7_RAPIDAS = [
  { id: 'Times New Roman', nombre: 'Times New Roman 12 pt', size: 12 },
  { id: 'Arial', nombre: 'Arial 11 pt', size: 11 },
  { id: 'Calibri', nombre: 'Calibri 11 pt', size: 11 },
  { id: 'Georgia', nombre: 'Georgia 11 pt', size: 11 },
  { id: 'Lucida Sans', nombre: 'Lucida Sans 10 pt', size: 10 },
];

const PanelDeAjustes: React.FC = () => {
  const portada = useDocStore((s) => s.portada);
  const setPortada = useDocStore((s) => s.setPortada);
  const rules = useDocStore((s) => s.rules);
  const setRules = useDocStore((s) => s.setRules);
  const tracked = useDocStore((s) => s.tracked);
  const setTracked = useDocStore((s) => s.setTracked);
  const format = useDocStore((s) => s.format);

  const idioma = portada.language || 'es-ES';
  const incluyePortada = !portada.force_skip_cover;

  /* El valor y el setter de cada control, en un solo lugar. Un control sin
     entrada acá no se dibuja: la tabla y lo dibujado no pueden separarse. */
  const valorDe = (id: string): boolean => {
    if (id === 'incluir-portada') return incluyePortada;
    if (id === 'idioma') return idioma === PORTADA_IDIOMAS[0]?.valor;
    if (id === 'marcas-de-cambio') return tracked;
    return false;
  };

  const cambiar = (id: string, v: boolean) => {
    if (id === 'incluir-portada') {
      setPortada({ force_skip_cover: !v });
      return;
    }
    if (id === 'idioma') {
      setPortada({ language: (v ? PORTADA_IDIOMAS[1] : PORTADA_IDIOMAS[0])?.valor as PortadaLanguage });
      return;
    }
    if (id === 'marcas-de-cambio') setTracked(v);
  };

  return (
    <div
      aria-label="Ajustes de exportación"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
    >
      {/* ── AJUSTES RÁPIDOS DE FORMATO (PERSONALIZADO) ───────────────────── */}
      <details
        className="export-accordion"
        open
        style={{
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: 'var(--space-2) var(--space-3)',
          background: 'var(--color-bg-surface)',
        }}
      >
        <summary
          style={{
            cursor: 'pointer',
            userSelect: 'none',
            outline: 'none',
            marginBottom: 'var(--space-2)',
          }}
        >
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
            }}
          >
            Ajustes Rápidos de Formato (Personalizado)
          </span>
        </summary>

        <section
          aria-label="Ajustes Rápidos de Formato (Personalizado)"
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-1)' }}
        >
          {/* Selector de fuente oficial APA 7 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <label
              htmlFor="export-rapido-fuente"
              style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-primary)' }}
            >
              Fuente oficial APA 7
            </label>
            <select
              id="export-rapido-fuente"
              data-testid="selector-fuente-apa7"
              value={rules.font_family || 'Times New Roman'}
              onChange={(e) => {
                const fuente = FUENTES_APA7_RAPIDAS.find((f) => f.id === e.target.value);
                if (fuente) {
                  setRules({ font_family: fuente.id, font_size_pt: fuente.size });
                } else {
                  setRules({ font_family: e.target.value });
                }
              }}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: 'var(--space-2) var(--space-3)',
                fontSize: 'var(--text-sm)', fontFamily: 'var(--font-family)',
                background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)',
              }}
            >
              {FUENTES_APA7_RAPIDAS.map((f) => (
                <option key={f.id} value={f.id}>{f.nombre}</option>
              ))}
              {!FUENTES_APA7_RAPIDAS.some((f) => f.id === rules.font_family) && rules.font_family && (
                <option value={rules.font_family}>{rules.font_family}</option>
              )}
            </select>
          </div>

          {/* Selector de interlineado (chips rápidos para 2.0, 1.5, 1.0) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Interlineado
            </span>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {[2.0, 1.5, 1.0].map((esp) => {
                const activo = rules.line_spacing === esp;
                return (
                  <button
                    key={esp}
                    type="button"
                    data-testid={`chip-interlineado-${esp}`}
                    onClick={() => setRules({ line_spacing: esp })}
                    style={{
                      padding: 'var(--space-1) var(--space-3)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: activo ? 700 : 500,
                      borderRadius: 'var(--radius-full)',
                      border: activo ? '1px solid var(--color-accent)' : '1px solid var(--color-border-subtle)',
                      background: activo ? 'var(--color-accent-soft)' : 'var(--color-bg-surface)',
                      color: activo ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {esp.toFixed(1)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Checkbox de justificación: "Justificar texto completo" */}
          <label
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
              cursor: 'pointer', fontSize: 'var(--text-xs)',
              color: 'var(--color-text-secondary)', userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              data-testid="check-justificar-texto"
              checked={rules.alignment === 'justify'}
              onChange={(e) => setRules({ alignment: e.target.checked ? 'justify' : 'left' })}
              style={{
                borderRadius: 'var(--radius-sm)',
                width: '14px', height: '14px',
                cursor: 'pointer', accentColor: 'var(--color-accent)',
              }}
            />
            <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
              Justificar texto completo
            </span>
          </label>

          {/* Checkbox de sangría: "Sangría de 1.27 cm en párrafos" */}
          <label
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
              cursor: 'pointer', fontSize: 'var(--text-xs)',
              color: 'var(--color-text-secondary)', userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              data-testid="check-sangria-parrafos"
              checked={rules.paragraph_indent_cm === 1.27}
              onChange={(e) => setRules({ paragraph_indent_cm: e.target.checked ? 1.27 : 0 })}
              style={{
                borderRadius: 'var(--radius-sm)',
                width: '14px', height: '14px',
                cursor: 'pointer', accentColor: 'var(--color-accent)',
              }}
            />
            <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
              Sangría de 1.27 cm en párrafos
            </span>
          </label>
        </section>
      </details>

      {/* ── CUATRO GRUPOS REGLAMENTARIOS EN ACORDEONES ──────────────────── */}
      {CUATRO_GRUPOS.map((titulo) => {
        const controles = CONTROLES_DEL_PANEL.filter((c) => c.grupo === titulo);
        const derivados = DERIVADOS_DEL_PANEL.filter((d) => d.grupo === titulo);
        if (controles.length === 0 && derivados.length === 0) return null;
        return (
          <details
            key={titulo}
            className="export-accordion"
            open
            style={{
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-2) var(--space-3)',
              background: 'var(--color-bg-surface)',
            }}
          >
            <summary
              style={{
                cursor: 'pointer',
                userSelect: 'none',
                outline: 'none',
                marginBottom: 'var(--space-2)',
              }}
            >
              <span
                style={{
                  fontSize: 'var(--text-xs)', fontWeight: 700,
                  color: 'var(--color-text-primary)',
                }}
              >
                {titulo}
              </span>
            </summary>

            <section
              aria-label={titulo}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
            >
              {/* Lo que se cambia acá. */}
              {controles.map((c) => {
                /* Un control que solo aplica a .docx no se dibuja con otro
                   formato encendido: se dibujaría y no haría nada. */
                if (c.soloDocx && format !== 'docx') return null;
                if (c.id === 'idioma') {
                  return (
                    <div
                      key={c.id}
                      data-testid={`control-${c.id}`}
                      data-al-apagar={c.alApagar}
                      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}
                    >
                      <label
                        htmlFor="export-idioma"
                        style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-primary)' }}
                      >
                        {c.etiqueta}
                      </label>
                      <select
                        id="export-idioma"
                        data-testid="campo-idioma"
                        value={idioma}
                        onChange={(e) => setPortada({ language: e.target.value as PortadaLanguage })}
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          padding: 'var(--space-2) var(--space-3)',
                          fontSize: 'var(--text-sm)', fontFamily: 'var(--font-family)',
                          background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)',
                          border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        {PORTADA_IDIOMAS.map((i) => (
                          <option key={i.valor} value={i.valor}>{i.etiqueta}</option>
                        ))}
                      </select>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                        {c.alEncender}
                      </span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                        {c.alApagar}
                      </span>
                    </div>
                  );
                }
                return (
                  <label
                    key={c.id}
                    data-testid={`control-${c.id}`}
                    data-al-apagar={c.alApagar}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)',
                      cursor: 'pointer', fontSize: 'var(--text-xs)',
                      color: 'var(--color-text-secondary)', userSelect: 'none',
                    }}
                  >
                    <input
                      type="checkbox"
                      data-testid={`campo-${c.id}`}
                      checked={valorDe(c.id)}
                      onChange={(e) => cambiar(c.id, e.target.checked)}
                      style={{
                        marginTop: '2px',
                        borderRadius: 'var(--radius-sm)',
                        width: '14px', height: '14px',
                        cursor: 'pointer', accentColor: 'var(--color-accent)',
                      }}
                    />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{c.etiqueta}</span>
                      <span>{c.alEncender}</span>
                      <span style={{ color: 'var(--color-text-tertiary)' }}>{c.alApagar}</span>
                    </span>
                  </label>
                );
              })}

              {/* Lo que Ajustes ya tiene y acá solo se lee. */}
              {derivados.map((d) => (
                <div
                  key={d.id}
                  data-testid={`derivado-${d.id}`}
                  data-solo-lectura="true"
                  style={{
                    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                    gap: 'var(--space-2)', fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <span style={{ color: 'var(--color-text-primary)' }}>{d.etiqueta}</span>
                  <span style={{ textAlign: 'right' }}>
                    {d.leer()}
                    <span style={{ display: 'block', color: 'var(--color-text-tertiary)' }}>
                      {`Se cambia en ${d.seCambiaEn}`}
                    </span>
                  </span>
                </div>
              ))}
            </section>
          </details>
        );
      })}
    </div>
  );
};

const SplitDiffPreview: React.FC<{ doc: any }> = ({ doc }) => {
  const elements = (doc?.elements || []).filter((e: any) => e.type !== 'empty' && e.type !== 'page_break');
  const leftScrollRef = React.useRef<HTMLDivElement>(null);
  const rightScrollRef = React.useRef<HTMLDivElement>(null);
  const syncingRef = React.useRef(false);

  const onScrollLeft = () => {
    if (syncingRef.current || !leftScrollRef.current || !rightScrollRef.current) return;
    syncingRef.current = true;
    const ratio = leftScrollRef.current.scrollTop / Math.max(1, leftScrollRef.current.scrollHeight - leftScrollRef.current.clientHeight);
    rightScrollRef.current.scrollTop = ratio * Math.max(1, rightScrollRef.current.scrollHeight - rightScrollRef.current.clientHeight);
    requestAnimationFrame(() => { syncingRef.current = false; });
  };

  const onScrollRight = () => {
    if (syncingRef.current || !leftScrollRef.current || !rightScrollRef.current) return;
    syncingRef.current = true;
    const ratio = rightScrollRef.current.scrollTop / Math.max(1, rightScrollRef.current.scrollHeight - rightScrollRef.current.clientHeight);
    leftScrollRef.current.scrollTop = ratio * Math.max(1, leftScrollRef.current.scrollHeight - leftScrollRef.current.clientHeight);
    requestAnimationFrame(() => { syncingRef.current = false; });
  };

  const renderOriginalElem = (elem: any, idx: number) => {
    if (elem.type === 'table') {
      const rows = elem.table_info?.rows || elem.rows || [];
      return (
        <div key={idx} style={{ padding: '10px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)', overflowX: 'auto', marginBottom: '8px' }}>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
            Tabla original (sin formato)
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)', border: '1px solid var(--border-subtle)' }}>
            <tbody>
              {rows.map((r: any, rIdx: number) => (
                <tr key={rIdx}>
                  {(r.cells || r || []).map((c: any, cIdx: number) => (
                    <td key={cIdx} style={{ border: '1px solid var(--border-subtle)', padding: '4px 6px', color: 'var(--text-main)' }}>
                      {typeof c === 'string' ? c : c.text || ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    if (elem.type === 'image') {
      return (
        <div key={idx} style={{ padding: '10px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)' }}>Figura original</div>
          {elem.image_info?.relative_url && (
            <img src={resolveAssetUrl(elem.image_info.relative_url)} alt="Figura" style={{ maxHeight: '160px', maxWidth: '100%', objectFit: 'contain', borderRadius: 'var(--radius-sm)' }} />
          )}
          {elem.text && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{elem.text}</div>}
        </div>
      );
    }
    const isHeading = elem.type === 'heading';
    return (
      <div key={idx} style={{
        fontFamily: 'var(--font-sans)',
        fontSize: isHeading ? 'var(--text-sm)' : 'var(--text-xs)',
        fontWeight: isHeading ? 700 : 400,
        color: 'var(--text-main)',
        opacity: 0.9,
        lineHeight: 1.5,
        padding: '8px 12px',
        borderRadius: 'var(--radius-sm)',
        backgroundColor: 'var(--surface-subtle)',
        border: '1px solid var(--border-subtle)',
        marginBottom: '6px',
      }}>
        {elem.text || ''}
      </div>
    );
  };

  const renderApaElem = (elem: any, idx: number) => {
    if (elem.type === 'table') {
      const rows = elem.table_info?.rows || elem.rows || [];
      const tableNum = elem.table_info?.table_number || (idx + 1);
      const title = elem.table_info?.caption || elem.table_info?.title || 'Título formal de la tabla';
      const note = elem.table_info?.note;
      return (
        <div key={idx} style={{ padding: '12px 0', margin: '14px 0', borderBottom: '1px dashed var(--border-subtle)' }}>
          <div style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '12pt', fontWeight: 'bold', color: 'var(--paper-ink)' }}>
            Tabla {tableNum}
          </div>
          <div style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '12pt', fontStyle: 'italic', color: 'var(--paper-ink)', marginBottom: '8px' }}>
            {title}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: '"Times New Roman", Times, serif', fontSize: '10pt', borderTop: '2px solid var(--paper-ink)', borderBottom: '2px solid var(--paper-ink)' }}>
            {rows.length > 0 && (
              <thead>
                <tr style={{ borderBottom: '1px solid var(--paper-ink)' }}>
                  {(rows[0].cells || rows[0] || []).map((c: any, cIdx: number) => (
                    <th key={cIdx} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--paper-ink)' }}>
                      {typeof c === 'string' ? c : c.text || ''}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {rows.slice(1).map((r: any, rIdx: number) => (
                <tr key={rIdx}>
                  {(r.cells || r || []).map((c: any, cIdx: number) => (
                    <td key={cIdx} style={{ padding: '5px 10px', color: 'var(--paper-ink)' }}>
                      {typeof c === 'string' ? c : c.text || ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '10pt', color: 'var(--paper-ink)', marginTop: '6px' }}>
            <strong>Nota.</strong> {note || 'Adaptado conforme a los estándares de formato y presentación APA 7.ª edición.'}
          </div>
        </div>
      );
    }
    if (elem.type === 'image') {
      const figNum = elem.image_info?.figure_number || 1;
      const caption = elem.image_info?.caption || 'Ilustración del proceso';
      const note = elem.image_info?.note;
      return (
        <div key={idx} style={{ padding: '12px 0', margin: '14px 0', display: 'flex', flexDirection: 'column', gap: '4px', borderBottom: '1px dashed var(--border-subtle)' }}>
          <div style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '12pt', fontWeight: 'bold', color: 'var(--paper-ink)' }}>
            Figura {figNum}
          </div>
          <div style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '12pt', fontStyle: 'italic', color: 'var(--paper-ink)', marginBottom: '6px' }}>
            {caption}
          </div>
          {elem.image_info?.relative_url && (
            <div style={{ textAlign: 'center', margin: '8px 0' }}>
              <img src={resolveAssetUrl(elem.image_info.relative_url)} alt={`Figura ${figNum}`} style={{ maxHeight: '220px', maxWidth: '100%', objectFit: 'contain' }} />
            </div>
          )}
          <div style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '10pt', color: 'var(--paper-ink)', marginTop: '4px' }}>
            <strong>Nota.</strong> {note || 'Presentación gráfica formal APA 7 con alineación y resolución óptima.'}
          </div>
        </div>
      );
    }
    const isHeading = elem.type === 'heading';
    const isRef = elem.type === 'reference';
    const isBullet = elem.type === 'bullet' || elem.type === 'numbered_list';
    const isCover = elem.is_cover_section || elem.type === 'portada_block';

    let textAlign: 'center' | 'left' = 'left';
    let fontWeight: 'bold' | 'normal' = 'normal';
    let fontStyle: 'italic' | 'normal' = 'normal';
    let textIndent: string | undefined = undefined;
    let paddingLeft: string = '0px';

    if (isCover) {
      textAlign = 'center';
      fontWeight = 'bold';
    } else if (isHeading) {
      fontWeight = 'bold';
      if (elem.heading_level === 1 || !elem.heading_level) {
        textAlign = 'center';
      } else if (elem.heading_level === 3) {
        fontStyle = 'italic';
      } else if (elem.heading_level === 4) {
        textIndent = '1.27cm';
      } else if (elem.heading_level === 5) {
        textIndent = '1.27cm';
        fontStyle = 'italic';
      }
    } else if (isRef) {
      paddingLeft = '1.27cm';
      textIndent = '-1.27cm';
    } else if (isBullet) {
      paddingLeft = '1.27cm';
    } else {
      textIndent = '1.27cm';
    }

    return (
      <div key={idx} style={{
        fontFamily: '"Times New Roman", Times, serif',
        fontSize: '12pt',
        lineHeight: 2.0,
        color: 'var(--paper-ink)',
        textAlign,
        fontWeight,
        fontStyle,
        textIndent,
        paddingLeft,
        margin: '4px 0',
      }}>
        {elem.text || ''}
      </div>
    );
  };

  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', height: '100%', overflow: 'hidden', backgroundColor: 'var(--canvas-bg)' }}>
      {/* Columna Izquierda: Original */}
      <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-subtle)', height: '100%', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', backgroundColor: 'var(--surface-elevated)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Original
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Sin formato APA 7</span>
        </div>
        <div
          ref={leftScrollRef}
          onScroll={onScrollLeft}
          style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: 'var(--canvas-bg)' }}
        >
          {elements.map((elem: any, idx: number) => renderOriginalElem(elem, idx))}
        </div>
      </div>

      {/* Columna Derecha: Formato APA 7 (Hoja de Papel Blanco) */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', backgroundColor: 'var(--surface-elevated)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Transformado (Norma APA 7)
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent-primary)', fontWeight: 600 }}>Formato Oficial Editable</span>
        </div>
        <div
          ref={rightScrollRef}
          onScroll={onScrollRight}
          style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', backgroundColor: 'var(--canvas-bg)' }}
        >
          <div style={{ backgroundColor: 'var(--paper-white)', color: 'var(--paper-ink)', padding: '36px 40px', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-md)', minHeight: '100%' }}>
            {elements.map((elem: any, idx: number) => renderApaElem(elem, idx))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportView;
