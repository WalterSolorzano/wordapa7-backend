/* WordAPA7 — Full Desktop Application Assembly (Fluent Design with Guided Wizard Flow) */

import React, { useEffect, useRef } from 'react';
import { useDocStore } from './store/useDocStore';
import { useAutosave } from './lib/useAutosave';
import { railPendingInputFrom } from './hooks/useRailDestinations';
import { pendingCountForPhase as pendingCountForPhaseIn } from './lib/railPending';
import { crearRefrescador, refrescarDesdeWord, type DiffWord } from './lib/wordRefresh';
import type { RefrescoResultado } from './store/types';
import { ProjectTabs } from './components/layout/ProjectTabs';
import { FileMenu } from './components/layout/FileMenu';
import { TemplateDialog } from './components/shared/TemplateDialog';
import { PDFPreview } from './components/layout/PDFPreview';
import { ReactPDFPreview } from './components/layout/ReactPDFPreview';
import { StatusBar } from './components/layout/StatusBar';
import { Step0QuickStart } from './components/wizard/Step0QuickStart';
import { SettingsHub } from './components/settings/SettingsHub';
import { ExportView } from './components/export/ExportView';
import { LoadingTips } from './components/layout/LoadingTips';
import { DownloadSuccessOverlay } from './components/layout/DownloadSuccessOverlay';
import { CommandPalette } from './components/CommandPalette';

// Guided Wizard Components
import { Step1PortadaWizard } from './components/wizard/Step1PortadaWizard';
import { EscritorioEstructura } from './components/structure/EscritorioEstructura';
import { TallerFigurasView } from './components/figures/TallerFigurasView';
import { Step5ReferencesWizard } from './components/referencias/Step5ReferencesWizard';
import { Step5AuditIAWizard } from './components/wizard/Step5AuditIAWizard';
import { AppShell } from './components/shell/AppShell';
import { CoverEditorPanel } from './components/wizard/CoverEditorPanel';

import { LLMConsentDialog } from './components/shared/LLMConsentDialog';
import { OnboardingTour } from './components/shared/OnboardingTour';
import { getApiBaseAsync, resetProtocolCache } from './api/http';
import { syncAllProviderKeys } from './api/backend';
import { AIBatteryIndicator } from './components/AIBatteryIndicator';
import { ExpressQuickTransformModal } from './components/quick/ExpressQuickTransformModal';
import { RightSidePanel } from './components/activity/RightSidePanel';
import { MascotBubble } from './components/activity/MascotBubble';
import { ValidatorView } from './components/validator/ValidatorView';
import { DocumentAIChat } from './components/chat/DocumentAIChat';
import { ProyectoNotificacion } from './components/project/ProyectoNotificacion';
import { ProyectosScreen } from './components/project/ProyectosScreen';
import { useIsMobile } from './hooks/useMediaQuery';

import { X } from 'lucide-react';

/* ═══ WIZARD STEP MAPPING (refactor UX) ═══
   1. Portada                          — CoverEditorPanel + Step1PortadaWizard (PaperCanvas)
   2. Estructura   (Índice + Títulos + Cuerpo) — EscritorioEstructura / Step2HeadingsWizard / Step5BodyWizard
   3. Figuras y tablas                 — TallerFigurasView
   4. Referencias                      — Step5ReferencesWizard
   5. Exportar                         — openExportTunnel() (viewMode='export')
*/

/* Ctrl+Enter salta a la primera fase con trabajo pendiente. La cuenta sale de
   `lib/railPending` —la misma del rail y de la fase 5 del workbench—: un
   atajo que cuenta otra cosa salta a una fase que el rail acaba de declarar
   "Lista". */
const pendingCountForPhase = (phaseId: number) =>
  pendingCountForPhaseIn(railPendingInputFrom(useDocStore.getState()), phaseId);

/**
 * El cierre del ciclo del watcher, en una funcion aparte y exportada para que
 * se pueda probar sin montar la app entera.
 *
 * LA RECARGA LA HACE `aplicarRefresco` DEL STORE, Y LE PASA ESTE MISMO DIFF
 *
 * El endpoint `/api/refresh-from-word` es de UN solo disparo: cuando ve un
 * cambio, guarda el documento reparseado (`python/routers/sessions.py:1103`) y
 * recien ahi devuelve el diff. La lectura siguiente, si Word no guardo otra vez,
 * compara el archivo contra el estado que ella misma acaba de escribir y
 * responde `cambiado: false`. O sea que el diff que el watcher ya consumio no se
 * puede volver a pedir, y por eso la recarga no vuelve a pegarle al endpoint:
 * usa el diff que esta mano tiene, que es el UNICO que puede decir que algo
 * cambio. Contra lo que YA esta guardado se recarga igual —`recoverSession` es
 * una lectura, no una escritura— y los conteos que se devuelven son los del
 * diff que detecto el cambio, que es el unico que los tiene.
 *
 * QUE HACE, EN ORDEN, Y POR QUE EN ESE ORDEN
 *
 * 1. Recarga el documento. Si eso TIRA, se devuelve `null` y no se toca nada: es
 *    preferible un hallazgo viejo a una pantalla vacia sin aviso — el primero se
 *    nota y se corrige, la segunda parece que la app perdio el documento.
 * 2. Recien con el documento ya recargado se invalidan los hallazgos rancios.
 *    `element_id` es un indice posicional, asi que los hallazgos viejos apuntan
 *    a parrafos que quizas ya son otros: no se pueden conservar.
 * 3. Los motores corren sobre el texto nuevo, y el conteo que se devuelve es el
 *    que ellos dejaron en el store — no el que el diff supuso.
 *
 * Lo devuelve `null` tambien cuando no hay documento abierto. El watcher lo cae
 * al silencio: una recarga que no ocurrio no se anuncia.
 */
export async function reauditarTrasRefresco(diff: DiffWord): Promise<RefrescoResultado | null> {
  const st = useDocStore.getState();
  if (!st.doc?.session_id) return null;

  // La recarga vive en el store: el diff ya esta en la mano, y pegarle otra vez
  // al endpoint seria la lectura de un solo disparo que responde "no cambio nada".
  let res;
  try {
    res = await st.aplicarRefresco(diff);
  } catch {
    // Los hallazgos viejos se quedan: ver el porque mas arriba.
    return null;
  }

  st.invalidarHallazgosRancios();
  await Promise.all([
    st.runProofreadBatch(),
    // Las citas son un motor mas y su fallo no puede tragarse la re-auditoria
    // entera: un aviso de citas que falla deja el estado como estaba, que ya es
    // un estado honesto.
    st.runCitationAudit().catch(() => {}),
  ]);
  // `listo`, `cambiado` y los conteos de parrafos son los del store, que los
  // saco del MISMO diff. Lo unico que se agrega aca es el numero de hallazgos,
  // porque los motores son de esta tarea y el store no los corrio.
  return { ...res, hallazgos: useDocStore.getState().proofreadFindings.length };
}



/** F4: Drawer del validador global — montado a nivel raíz para que se pueda
    abrir desde cualquier paso del wizard (antes solo existía en Step5). */
const ValidatorDrawer: React.FC = () => {
  const validatorOpen = useDocStore((s) => s.validatorOpen);
  const setValidatorOpen = useDocStore((s) => s.setValidatorOpen);
  if (!validatorOpen) return null;
  return (
    <div
      data-testid="validator-drawer"
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(640px, 64%)', zIndex: 1000,
        display: 'flex', flexDirection: 'column',
        backgroundColor: 'var(--sidebar-bg)',
        borderLeft: '1px solid var(--border-subtle)',
        boxShadow: '-10px 0 28px rgba(0,0,0,0.25)',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '9px 14px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
      }}>
        <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)', flex: 1 }}>
          Validador de citas y referencias
        </span>
        <button
          type="button"
          onClick={() => setValidatorOpen(false)}
          aria-label="Cerrar validador"
          title="Cerrar (Esc)"
          style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', borderRadius: '6px' }}
        >
          <X size={14} />
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <ValidatorView />
      </div>
    </div>
  );
};

/** Ventana Flotante del Copiloto Editorial IA (Edición en vivo en lenguaje natural). */
const LiveChatFloatingCard: React.FC = () => {
  const liveChatOpen = useDocStore((s) => s.liveChatOpen);
  const setLiveChatOpen = useDocStore((s) => s.setLiveChatOpen);
  const doc = useDocStore((s) => s.doc);
  const atHome = useDocStore((s) => s.atHome);
  const isMobile = useIsMobile();

  if (atHome || !doc) return null;

  // Sin píldora flotante: el único disparador del Copiloto es el botón de la
  // UnifiedToolbar (MessageSquare). Se evita doble CTA para la misma acción.
  if (!liveChatOpen) return null;

  return (
    <aside
      aria-label="Copiloto Editorial IA"
      className="copilot-drawer animate-fade-in"
      style={{
        position: 'fixed',
        top: isMobile ? 0 : '48px',
        right: 0,
        bottom: isMobile ? 0 : '24px',
        left: isMobile ? 0 : undefined,
        width: isMobile ? '100%' : 'min(380px, 92vw)',
        height: isMobile ? '100%' : undefined,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--surface-elevated)',
        borderLeft: isMobile ? 'none' : '1px solid var(--border-subtle)',
        boxShadow: isMobile ? 'none' : '-8px 0 32px rgba(0,0,0,0.18)',
        overflow: 'hidden',
        zIndex: 999,
      }}
    >
      <DocumentAIChat
        onClose={() => setLiveChatOpen(false)}
        onMinimize={() => setLiveChatOpen(false)}
      />
    </aside>
  );
};

export const App: React.FC = () => {
  const {
    doc,
    showFileMenu,
    exportDocx,
    exportPdf,
    undo,
    redo,
    wizardStep,
    setWizardStep,
    setIsNIMDiagnosticsOpen,
    viewMode,
    settingsHubOpen,
    commandPaletteOpen,
    atHome,
    goHome,
    tabs,
    focusMode,
    isBackendReady,
    structureTab,
    setStructureTab,
  } = useDocStore();

  /* Punto de restauración automático: cada 30 s, al ocultar la pestaña y al
     cerrar, y solo si hay cambios. La guarda `isSaving` vive dentro del hook. */
  useAutosave();

  // ── Context Menu Integration ──────────────────────────────────────────────
  const pendingOSFile = useRef<{ fileName: string; buffer: Uint8Array; isQuick?: boolean; filePath?: string } | null>(null);
  const [quickModalData, setQuickModalData] = React.useState<{ fileName: string; buffer?: Uint8Array; filePath?: string } | null>(null);

  const processPendingOSFile = () => {
    try {
      const data = pendingOSFile.current;
      if (!data || !data.buffer) return;
      pendingOSFile.current = null;

      let ab: ArrayBuffer;
      const raw = data.buffer as any;
      if (raw instanceof ArrayBuffer) {
        ab = raw;
      } else if (raw.buffer && raw.buffer instanceof ArrayBuffer) {
        ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + (raw.byteLength ?? raw.length ?? 0));
      } else if (typeof raw === 'object') {
        const arr = new Uint8Array(Object.values(raw));
        ab = arr.buffer;
      } else {
        ab = new ArrayBuffer(0);
      }

      const file = new File(
        [ab],
        data.fileName || 'documento.docx',
        { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
      );

      if (!data.isQuick) {
        useDocStore.getState().showToast(`Abriendo "${file.name}"…`, 'info');
      }
      if (data.filePath) {
        useDocStore.getState().setActiveFilePath(data.filePath);
      }
      useDocStore.getState().uploadFile(file);
    } catch (err) {
      console.error('[App] Error al procesar archivo desde el SO:', err);
      useDocStore.getState().showToast('Error al abrir el documento. Intenta seleccionarlo desde el editor.', 'error');
    }
  };

  useEffect(() => {
    const electronWindow = window as any;
    if (!electronWindow.electronAPI?.onOpenFileFromOS) return;

    const cleanup = electronWindow.electronAPI.onOpenFileFromOS(
      (data: { fileName: string; buffer: Uint8Array; isQuick?: boolean; filePath?: string }) => {
        pendingOSFile.current = data;
        if (data.isQuick) {
          setQuickModalData({
            fileName: data.fileName,
            buffer: data.buffer,
            filePath: data.filePath,
          });
        }
        if (useDocStore.getState().isBackendReady) {
          processPendingOSFile();
        }
      }
    );
    return () => { if (typeof cleanup === 'function') cleanup(); };
  }, []);

  useEffect(() => {
    if (isBackendReady && pendingOSFile.current) {
      processPendingOSFile();
    }
  }, [isBackendReady]);

  // ── Sincronización en Paralelo con Word (Live Watcher) ──────────────────────
  const activeFilePath = useDocStore((s) => s.activeFilePath);
  const sessionId = doc?.session_id;
  useEffect(() => {
    const ew = window as any;
    if (!ew.electronAPI?.watchDocumentFile || !activeFilePath || !sessionId) return;

    // Lo que dice el aviso lo decide el DIFF, o la REAUDITORIA si corrio. Antes
    // este bloque decia "el documento esta sincronizado" sin reparsear nada: la
    // frase describia un trabajo que no se hacia. `mensajeDeRefresco` y
    // `mensajeDeReauditoria` son los unicos que arman texto aca, y hay pruebas
    // que les prohiben esas palabras.
    //
    // El "una vez a la vez" vive adentro del refrescador y no en el disparador:
    // si estuviera aca, dos disparos seguidos abririan dos lecturas del mismo
    // `.docx`, y la segunda se llevaria un `BadZipFile` que no es real.
    const refrescador = crearRefrescador({
      pedir: (ruta) => refrescarDesdeWord(sessionId, ruta),
      avisar: (texto, tipo) => useDocStore.getState().showToast(texto, tipo),
      archivo: () => activeFilePath,
      // Recargar, tirar lo rancio y re-correr los motores vive en la funcion de
      // arriba, no aca: el watcher no sabe de documentos ni de hallazgos, y por
      // eso se puede probar entero sin montar la app.
      alRefrescar: (d) => reauditarTrasRefresco(d),
    });
    const cleanup = ew.electronAPI.watchDocumentFile(
      activeFilePath,
      (_data: { filePath: string; fileName: string; timestamp: number }) => {
        void refrescador.refrescar();
      }
    );
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [activeFilePath, sessionId]);

  // ── Global backend readiness ──────────────────────────────────────────────
  // CRITICAL: Cuando el backend se vuelve ready, reseteamos el cache de
  // protocolo para forzar una re-detección limpia. Antes, el cache podía
  // tener 'http' (fallback de cuando el backend no había arrancado) y nunca
  // se actualizaba a 'https', causando que todas las peticiones (incluida
  // la subida de archivos) fallaran silenciosamente.
  const backendCheckNonce = useDocStore((s) => s.backendCheckNonce);
  useEffect(() => {
    const electronWindow = window as any;
    let cancelled = false;

    const checkBackendOnce = async (): Promise<boolean> => {
      try {
        const apiBase = await getApiBaseAsync();
        const res = await fetch(`${apiBase}/version`);
        if (res.ok) {
          useDocStore.setState({ isBackendReady: true });
          syncAllProviderKeys().catch(() => {});
          useDocStore.getState().fetchProfiles().catch(() => {});
          return true;
        }
      } catch (_) {}
      return false;
    };

    const pollLoop = async () => {
      while (!cancelled) {
        if (await checkBackendOnce()) return;
        await new Promise((r) => setTimeout(r, 2000));
      }
    };

    if (electronWindow.electronAPI?.onPythonReady) {
      const cleanup = electronWindow.electronAPI.onPythonReady(() => {
        // CRITICAL: Resetear el cache de protocolo ANTES de marcar el backend
        // como ready. El cache puede tener 'http' de cuando el backend no
        // había arrancado, y necesitamos que se re-detecte como 'https'.
        resetProtocolCache();
        useDocStore.setState({ isBackendReady: true });
        syncAllProviderKeys().catch(() => {});
        useDocStore.getState().fetchProfiles().catch(() => {});
        useDocStore.getState().showToast('Motor de procesamiento listo', 'success');
      });

      if (electronWindow.electronAPI.onPythonCrashed) {
        electronWindow.electronAPI.onPythonCrashed(() => {
          useDocStore.setState({ isBackendReady: false });
          useDocStore.getState().showToast('El motor falló y no pudo reiniciarse. Reiniciá la app.', 'error');
        });
      }
      if (electronWindow.electronAPI.onPythonRestarting) {
        electronWindow.electronAPI.onPythonRestarting(() => {
          useDocStore.setState({ isBackendReady: false });
          useDocStore.getState().showToast('El motor se está reiniciando…', 'info');
        });
      }

      let addinCleanup: (() => void) | undefined;
      if (electronWindow.electronAPI.onAddinSideloaded) {
        addinCleanup = electronWindow.electronAPI.onAddinSideloaded((data: { status: string; hint: string }) => {
          if (data.status === 'ok') {
            useDocStore.getState().showToast(
              'Complemento de Word disponible. Reiniciá Word para usarlo.',
              'success'
            );
          }
        });
      }

      pollLoop();
      return () => {
        cancelled = true;
        if (typeof cleanup === 'function') cleanup();
        if (typeof addinCleanup === 'function') addinCleanup();
      };
    } else {
      pollLoop();
      return () => { cancelled = true; };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendCheckNonce]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable;
      if (isInput) return;

      if (e.key === 'Escape') {
        const s = useDocStore.getState();
        if (s.liveChatOpen) { s.setLiveChatOpen(false); return; }
        if (s.validatorOpen) { s.setValidatorOpen(false); return; }
        if (s.viewMode === 'export') { s.setViewMode('edit'); return; }
        if (s.isNIMDiagnosticsOpen) { s.setIsNIMDiagnosticsOpen(false); return; }
        if (s.commandPaletteOpen) { s.setCommandPaletteOpen(false); return; }
        if (s.showFileMenu) { s.setShowFileMenu(false); return; }
        if (s.isDownloadModalOpen) { s.setDownloadModalOpen(false); return; }
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.shiftKey && (e.key === ']' || e.key === '}')) {
          e.preventDefault();
          if (!doc) return;
          const step = useDocStore.getState().wizardStep;
          if (step < 5) useDocStore.getState().setWizardStep(step + 1);
          else if (step === 5) useDocStore.getState().setWizardStep(6);
          return;
        }
        if (e.shiftKey && (e.key === '[' || e.key === '{')) {
          e.preventDefault();
          if (!doc) return;
          const s = useDocStore.getState();
          // Si estamos en el túnel de export, primero salir de él.
          if (s.viewMode === 'export') { s.setViewMode('edit'); return; }
          const step = s.wizardStep;
          if (step > 1) s.setWizardStep(step - 1);
          return;
        }

        switch (e.key.toLowerCase()) {
          case 'enter': {
            e.preventDefault();
            if (!doc) break;
            const step = useDocStore.getState().wizardStep;
            const nextWithPending = [1, 2, 3, 4, 5].find(s => s > step && pendingCountForPhase(s) > 0);
            if (nextWithPending) {
              useDocStore.getState().setWizardStep(nextWithPending);
            } else if (step < 5) {
              useDocStore.getState().setWizardStep(step + 1);
            } else if (step === 5) {
              useDocStore.getState().setWizardStep(6);
            }
            break;
          }
          case 's':
            e.preventDefault();
            if (doc) {
              const vm = useDocStore.getState().viewMode;
              if (vm === 'export') {
                // ExportView tiene su propio handler que respeta el formato elegido.
                break;
              }
              if (e.shiftKey) exportPdf();
              else exportDocx(false);
            }
            break;
          case 'z':
            e.preventDefault();
            if (!e.shiftKey) undo();
            break;
          case 'y':
            e.preventDefault();
            redo();
            break;
          case 'k':
            e.preventDefault();
            useDocStore.setState({ commandPaletteOpen: true });
            break;
          case '1': case '2': case '3': case '4': case '5':
            e.preventDefault();
            if (doc) {
              useDocStore.getState().setWizardStep(parseInt(e.key));
            }
            break;
          case '6':
            e.preventDefault();
            if (doc) {
              /* La 6 es el túnel de exportación, y por eso usa `openExportTunnel`
                 y no `setWizardStep(6)`: el túnel además cierra el modal de
                 descarga. Es la misma acción que el comando `goto-exportar` de
                 la paleta, y por eso `atajosDeFase.test.ts` puede exigir que
                 las dos mitades digan lo mismo. */
              useDocStore.getState().openExportTunnel();
            }
            break;
          default:
            break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    let removeMenuListener = () => {};
    const electronWindow = window as any;
    if (electronWindow.electronAPI && electronWindow.electronAPI.onMenuAction) {
      removeMenuListener = electronWindow.electronAPI.onMenuAction((_event: any, action: string) => {
        if (action === 'trigger-export') {
           useDocStore.getState().exportDocx(false);
        } else if (action === 'trigger-preferences') {
           /* Entrada #7: la del menú nativo. Va directa al store, sin el viaje
              de un CustomEvent: el evento era un segundo camino al mismo flag, y
              dos caminos son dos verdades. Las otras tres acciones del menú sí
              necesitan el evento, porque las escucha el componente que las
              monta. */
           useDocStore.getState().setSettingsHubOpen(true);
        } else if (action === 'trigger-upload' || action === 'wordapa7-start-blank' || action === 'wordapa7-start-template') {
           window.dispatchEvent(new CustomEvent(action));
        }
      });
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [doc, exportDocx, exportPdf, undo, redo]);

  useEffect(() => {
    const listeners: Array<[string, () => void]> = [
      ['trigger-upload', () => useDocStore.getState().setShowFileMenu(true)],
      ['wordapa7-start-blank', () => { useDocStore.getState().startBlankDocument(); }],
      ['wordapa7-start-template', () => useDocStore.getState().setShowTemplateDialog(true)],
    ];
    const cleanups = listeners.map(([action, handler]) => {
      const fn = () => handler();
      window.addEventListener(action, fn);
      return () => window.removeEventListener(action, fn);
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  if (quickModalData) {
    return (
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <ExpressQuickTransformModal
          fileName={quickModalData.fileName}
          filePath={quickModalData.filePath}
          fileBuffer={quickModalData.buffer}
          onClose={() => {
            setQuickModalData(null);
            const ew = window as any;
            if (ew.electronAPI?.windowClose) ew.electronAPI.windowClose();
          }}
          onOpenFullEditor={() => {
            setQuickModalData(null);
            const ew = window as any;
            if (ew.electronAPI?.expandToFullEditor) ew.electronAPI.expandToFullEditor();
          }}
        />
      </div>
    );
  }

  /* El hub de Ajustes, montado AQUÍ y no dentro del editor a propósito. La rama
     va antes de `showFileMenu` y antes del `!doc || atHome`, y no en `AppShell`:
     Ajustes tiene que abrir con un documento abierto —que es el caso en el que
     se lo necesita— y también desde el backstage, y una pantalla de
     configuración que solo existe en una de las dos es media entrada. El flag
     vive en el store, así que hay un solo sitio donde decidir y ninguno donde
     se monte dos veces. */
  if (settingsHubOpen) {
    return (
      <>
        <SettingsHub />
        <LoadingTips />
      </>
    );
  }

  if (showFileMenu) {
    return (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', borderRadius: '0', backgroundColor: 'var(--app-bg)' }}>
          <FileMenu />
          <StatusBar />
        </div>
        <LoadingTips />
      </>
    );
  }

  if (!doc || atHome) {
    return (
      <>
        {/* El guard de pestañas vive en `ProjectTabs`, que además es el único
            montaje del Explorador de proyecto y del cajón de figuras. El
            envoltorio `sticky` que había acá aplicaba un segundo criterio
            (`tabs.length > 0`) que, con el guard nuevo, dejaba un div vacío en
            el caso común de un solo documento. */}
        <ProjectTabs />
        {isBackendReady ? <Step0QuickStart /> : <div style={{ flex: 1 }} />}
        <LoadingTips />
      </>
    );
  }

  return (
    <AppShell>
      {/* `viewMode: 'result'` y `viewMode: 'split'` no tienen hoy ningún escritor
          en `src/`: son ramas MUERTAS, y se dejan como están. Un modo de vista
          inalcanzable hoy puede ser alcanzable mañana, y borrar la rama es una
          decisión de producto, no una limpieza. Lo que sí se arregla es el
          desajuste que sí ocurre hoy: el rail, siempre montado, tiene que tener
          una fase a la vista. `handleSelect` vuelve a 'edit' cuando el destino es otra
          fase (AppShell.tsx), y Exportar se marca como destino actual mientras el
          túnel está abierto (`useRailDestinations`). */}
      {viewMode === 'result' ? (
        <div key="view-result" className="wizard-step-enter" style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--canvas-bg)' }}>
          <PDFPreview />
        </div>
      ) : viewMode === 'export' ? (
        <div key="view-export" className="wizard-step-enter" style={{ flex: 1, height: '100%', overflow: 'hidden', display: 'flex', minWidth: 0 }}>
          <ExportView />
        </div>
      ) : viewMode === 'native-pdf' ? (
        <div key="view-native-pdf" className="wizard-step-enter" style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--canvas-bg)' }}>
          <ReactPDFPreview />
        </div>
      ) : viewMode === 'proyectos' ? (
        <div key="view-proyectos" className="wizard-step-enter" style={{ flex: 1, height: '100%', overflow: 'hidden', display: 'flex', minWidth: 0 }}>
          <ProyectosScreen />
        </div>
      ) : viewMode === 'split' ? (
        <div style={{ flex: 1, display: 'flex', height: '100%', overflow: 'hidden', minWidth: 0 }}>
          <div style={{ flex: 1, display: 'flex', height: '100%', overflow: 'hidden', minWidth: 0, flexDirection: 'column' }}>
            <div style={{ flex: 1, display: 'flex', height: '100%', overflow: 'hidden', minWidth: 0 }} className="wizard-step-enter" key={`split-${wizardStep}`}>
              {wizardStep === 1 && <Step1PortadaWizard />}
              {wizardStep === 2 && <EscritorioEstructura />}
              {wizardStep === 3 && <TallerFigurasView />}
              {wizardStep === 4 && <Step5ReferencesWizard />}
            </div>
          </div>
          <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--canvas-bg)', borderLeft: '2px solid var(--border-subtle)' }}>
            <PDFPreview />
          </div>
        </div>
      ) : wizardStep === 1 ? (
        <div style={{ flex: 1, height: '100%', overflow: 'hidden', minWidth: 0 }} className="wizard-step-enter" key="step-1-canvas">
          <Step1PortadaWizard />
        </div>
      ) : (
        /* D1: la navegación por fases vive en el rail de 56px de AppShell */
        <div style={{ display: 'flex', flexDirection: 'row', flex: 1, height: '100%', overflow: 'hidden', minWidth: 0, position: 'relative' }}>
          <div style={{ flex: 1, height: '100%', overflow: 'hidden', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, height: '100%', overflow: 'hidden', minWidth: 0 }} className="wizard-step-enter" key={`step-${wizardStep}`}>
              {wizardStep === 2 && <EscritorioEstructura />}
              {wizardStep === 3 && <TallerFigurasView />}
              {wizardStep === 4 && <Step5ReferencesWizard />}
              {wizardStep === 5 && <Step5AuditIAWizard />}
              {wizardStep === 6 && <ExportView />}
            </div>
          </div>
          {/* Mapa del documento y panel contextual: activo únicamente en paso 3 */}
          {wizardStep !== 4 && wizardStep !== 5 && wizardStep !== 6 && !focusMode && <RightSidePanel />}
        </div>
      )}

      {/* Copiloto Editorial IA (oculto en Portada para mantener foco total) */}
      {doc && wizardStep !== 1 && <LiveChatFloatingCard />}

      <TemplateDialog />
      <OnboardingTour />
      <LLMConsentDialog />

      {doc && commandPaletteOpen && <CommandPalette />}
      <LoadingTips />
      <DownloadSuccessOverlay />
      <AIBatteryIndicator />
      {doc && <MascotBubble />}
      {/* F4: Drawer del validador a nivel raíz — abrible desde cualquier paso */}
      {doc && <ValidatorDrawer />}
      <ProyectoNotificacion />
    </AppShell>
  );
};

export default App;
