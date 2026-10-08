/// <reference types="vite/client" />
/**
 * WordAPA7 — ningún flag de interfaz vuelve a quedarse sin lector.
 *
 * La Fase 7 del plan de Ajustes mató cinco flags que no iban a nada:
 * `settingsStudioOpen` y `settingsStudioTab`, `auditorMode`,
 * `isReviewOpen`/`isContentReviewOpen`, `stressTestModalOpen` y `aiStudioOpen`.
 * Los primeros tenían un escritor —un comando de la paleta, un botón— y ningún
 * lector: la persona apriyaba algo y no pasaba nada, y peor, el store guardaba la
 * mentira de que pasaba.
 *
 * Este archivo es la cuenta que queda saldada. No es un lint de estilo: mira, en
 * el store, cada booleano de interfaz y decide si tiene un lector en `src/`. La
 * lista de excepciones es CORTA y cada excepción dice POR QUÉ: un flag leído
 * solo por un test no cuenta como leído, porque un test que verifica que un
 * setter escriba en un store que nadie mira es la forma más eficiente de
 * mantener deuda viva.
 *
 * Los fuentes se leen con `import.meta.glob(..., '?raw')` y NO con `node:fs`: el
 * shim de `nodePolyfills()` de vite resuelve `readFileSync` a un stub de browser
 * y llamarlo desde un test es un `TypeError` en tiempo de import. El glob tiene
 * que ver de verdad: el primer caso de esta suite es exactamente el que se cae si
 * el listado vuelve vacío.
 */
import { describe, it, expect } from 'vitest';
import uiSliceSrc from '../store/slices/uiSlice.ts?raw';

/* `eager: true` porque el chequeo es síncrono y no queremos un await por cada
   archivo. Los `.test.` quedan fuera del conteo: un flag que solo aparece en una
   prueba no tiene lector, y eso es justo lo que hay que ver. */
const MODULOS = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/* La lista de excepciones, con el motivo. Corta a propósito: cada línea que se
   agrega es una excepción que alguien tiene que volver a justificar. */
const EXCEPCIONES: Record<string, string> = {
  /* `isReviewLoading` no abre nada: es el estado de una operación en vuelo cuyo
     resultado, `reviewResult`, sí se lee. */
  isReviewLoading: 'estado de una operacion en vuelo; su resultado, reviewResult, si se lee',
  /* `viewMode` tiene ramas muertas por diseño (`result`, `split`) y así está
     escrito en `App.tsx`: una vista inalcanzable hoy puede ser alcanzable mañana
     y borrarla es una decisión de producto, no una limpieza. */
  viewMode: 'App.tsx lo ramifica; un modo sin escritor es una decision de producto',
  /* `isLoading` lo ponen y lo leen muchas acciones distintas a la vez: es un
     candado global, no el estado de una pantalla. */
  isLoading: 'candado global de operaciones, no estado de una pantalla',
  hasUnsavedChanges: 'lo escribe pushHistory; lo consume el guardado automatico',
  isSaving: 'lo escribe el guardado automatico; lo consume el chip de la barra',
  focusMode: 'lo alterna un atajo y lo lee AppShell',
  atHome: 'App.tsx monta Inicio o el editor segun este',
  showFileMenu: 'App.tsx monta el backstage segun este',
  mascotMessage: 'sayMascot lo escribe, MascotBubble lo lee',
  actionToast: 'triggerActionToast lo escribe y el toast lo lee',
  zoomLevel: 'lo escribe su setter y lo lee el layout del lienzo',
  railPinned: 'lo escriben los dos rails y lo lee el flyout',
  activityUnseen: 'lo lee el punto del rail',
  activityEvents: 'los lee el panel de actividad',
  dismissedCommentIds: 'los leen los dos canales del comentario',
  commandPaletteOpen: 'lo abre Ctrl+K y lo lee App.tsx',
  liveChatOpen: 'lo alterna el boton del Copiloto y lo lee su tarjeta',
  isNIMDiagnosticsOpen: 'lo abre el menu de la paleta y lo lee la barra de estado',
  settingsHubOpen: 'las siete entradas lo abren y App.tsx monta el hub con el',
  pendingQuickExport: 'lo consulta el modo rapido al abrir el modal de descarga',
  isDownloadModalOpen: 'lo abre el boton de descargar y lo lee su modal',
  /* `sugerenciasProactivas` lo escribe la pestaña Revisión de Ajustes y lo lee la
     auditoría; `marcasVisibles` lo escriben Revisión y los leen los dos canales. */
  sugerenciasProactivas: 'lo escribe la pestaña Revision y lo lee la auditoria',
  marcasVisibles: 'lo escribe la pestaña Revision y lo leen los dos canales',
  /* `imagePanelOpen` lo alterna el panel de imagen del inspector. */
  imagePanelOpen: 'lo alterna el panel de imagen del inspector',
  /* `showCitationMarks` lo escribe la pestaña Revisión y lo leen los dos
     canales del hallazgo, que antes decidían por su cuenta. */
  showCitationMarks: 'lo escribe la pestaña Revision y lo leen los dos canales',
  /* `iaCortes` lo escribe la pestaña Revisión y lo lee el mosaico de IA. */
  iaCortes: 'lo escribe la pestaña Revision y lo lee el mosaico de IA',
  /* `preflightReport` lo escribe `runAIReview` y lo lee el panel de preflight. */
  preflightReport: 'lo escribe runAIReview y lo lee el panel de preflight',
  /* `validationIssues` los escribe `runValidation` y los lee la fase 4. */
  validationIssues: 'los escribe runValidation y los lee la fase 4',
  /* `citationAuditResult` lo escribe `runCitationAudit` y lo leen los dos
     canales del hallazgo. */
  citationAuditResult: 'lo escribe runCitationAudit y lo leen los dos canales',
  /* `proofreadFindings` los escribe `runProofreadBatch` y los leen los canales. */
  proofreadFindings: 'los escribe runProofreadBatch y los leen los canales',
  /* `aiIndices` los escribe el corrector y los lee el mosaico. */
  aiIndices: 'los escribe el corrector y los lee el mosaico',
  /* `projectImages` lo escribe el Explorador de proyecto. */
  projectImages: 'lo escribe el Explorador de proyecto',
  /* `structureTab` lo alterna la barra de Estructura y lo lee `AppShell`. */
  structureTab: 'lo alterna la barra de Estructura y lo lee App.tsx',
  /* `selectedElementId` / `selectedReferenceId` los escribe el canvas y el panel
     de referencias. */
  selectedElementId: 'lo escribe el lienzo y lo lee el inspector',
  selectedReferenceId: 'lo escribe la lista de referencias y lo lee el panel',
  /* `lastRequestId` lo escribe el copiloto para descartar respuestas viejas. */
  lastRequestId: 'lo escribe el copiloto para descartar respuestas viejas',
  /* `exportSuccessAt` lo escribe la exportación y lo lee la pantalla de éxito. */
  exportSuccessAt: 'lo escribe la exportacion y lo lee la pantalla de exito',
  /* `retryBackend` / `backendCheckNonce` son el reintento del motor. */
  backendCheckNonce: 'lo sube retryBackend y lo lee el ciclo de vida del motor',
  /* `scrollTargetId` lo escribe quien navega y lo lee el lienzo. */
  scrollTargetId: 'lo escribe quien navega y lo lee el lienzo',
  /* `toasts` los escribe showToast y los lee el contenedor de toasts. */
  toasts: 'los escribe showToast y los lee el contenedor de toasts',
  /* `theme` lo escribe setTheme y lo leen media app y los tests de tokens. */
  theme: 'lo escribe setTheme y lo lee media app',
  /* `structureAuditResult` lo escribe `runStructureAudit`. */
  structureAuditResult: 'lo escribe runStructureAudit y lo lee la auditoria',
  /* `reviewResult` lo escribe `runAIReview` y lo leen los dos canales. */
  reviewResult: 'lo escribe runAIReview y lo leen los dos canales',
  /* `nimLogs` los escribe el logger de NIM y los lee el diagnóstico. */
  nimLogs: 'los escribe el logger de NIM y los lee el diagnostico',
  /* `sessionScopes` los escribe el alta de sesión y los lee el diagnóstico. */
  sessionScopes: 'los escribe el alta de sesion y los lee el diagnostico',
  /* `forceRightPanelOpen` lo escribe el export tunnel y el rail. */
  forceRightPanelOpen: 'lo escriben el tunel de exportacion y el rail',
  /* `rightPanelTab` / `activeTabIndex` los alternan las barras de tabs. */
  rightPanelTab: 'lo alterna la barra del panel derecho',
  /* `hasSeenTour` lo escribe el recorrido de bienvenida. */
  hasSeenTour: 'lo escribe el recorrido de bienvenida y lo lee su disparador',
  /* `coverSetupDone` lo escribe el asistente de portada. */
  coverSetupDone: 'lo escribe el asistente de portada y lo lee su disparador',
  /* `wordLayoutUnavailable` lo escribe la lectura de Word y lo lee el estado COM. */
  wordLayoutUnavailable: 'lo escribe la lectura de Word y lo lee el estado COM',
  /* Los flags que la Fase 7 BORRÓ, nombrados para que si uno vuelve a aparecer
     el test lo diga con el motivo al revés. */
  isContentReviewOpen: 'BORRADO en la Fase 7: la revision de contenido vive en el workbench del paso 5',
  isReviewOpen: 'BORRADO en la Fase 7: el workbench del paso 5 se llega por fase, no por un flag',
  auditorMode: 'BORRADO en la Fase 7: nadie lo leia',
  stressTestModalOpen: 'BORRADO en la Fase 7 junto con StressTestModal.tsx, que no tenia acceso',
  aiStudioOpen: 'BORRADO en la Fase 7: el estudio de IA se fusiono con el hub',
  settingsStudioOpen: 'BORRADO en la Fase 7 junto con SettingsPreviewStudio.tsx',
  settingsStudioTab: 'BORRADO en la Fase 7 junto con SettingsPreviewStudio.tsx',
};

const RUTA_UI_SLICE = '../store/slices/uiSlice.ts';

/* El slice sin comentarios. Hace falta porque varios comentarios nombran flags a
   propósito —el de `stressTestModalOpen` cuenta qué se borró y por qué— y un
   `grep` que cuenta menciones contaría la explicación como si fuera código. */
const uiSliceSinComentarios = uiSliceSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

const FUENTES = Object.entries(MODULOS)
  .filter(([ruta]) => !/\.test\.tsx?$/.test(ruta))
  .map(([ruta, texto]) => ({ ruta, texto }));

/** Todos los archivos de `src/`, menos los de prueba y menos el propio slice. */
const OTRAS = FUENTES.filter((f) => f.ruta !== RUTA_UI_SLICE);

const seUsaEnOtroLugar = (flag: string) =>
  new RegExp(`\\b${flag}\\b`).test(OTRAS.map((f) => f.texto).join('\n'));

/** Los booleanos que `uiSlice` DECLARA con su valor inicial. */
function declaradosEnUiSlice(): string[] {
  return [...uiSliceSrc.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9_]*): (?:true|false),$/gm)].map((m) => m[1]);
}

describe('los flags de interfaz tienen un lector o están en la lista de excepciones', () => {
  it('el escaneo ve los archivos que cree ver', () => {
    // Un listado vacío hace que TODAS las cuentas de abajo pasen por no haber
    // nada que mirar, y eso es un lint verde y mudo.
    expect(FUENTES.length).toBeGreaterThan(100);
    expect(FUENTES.some((f) => f.ruta.endsWith('/App.tsx'))).toBe(true);
    expect(FUENTES.some((f) => f.ruta.endsWith('/store/types.ts'))).toBe(true);
    expect(FUENTES.some((f) => f.ruta.endsWith('CommandPalette.tsx'))).toBe(true);
  });

  it('el slice de UI sigue teniendo flags que mirar', () => {
    // Si la Fase 8 vacía el slice, este test tiene que avisar de que ya no
    // vigila nada, no pasar en verde por debilidad. El número es bajo a
    // propósito: son 18, y la cuenta tiene que aguantar que caigan.
    expect(declaradosEnUiSlice().length).toBeGreaterThan(12);
  });

  it('ningún booleano de uiSlice se queda sin lector', () => {
    const sinLector = declaradosEnUiSlice().filter(
      (flag) => !(flag in EXCEPCIONES) && !seUsaEnOtroLugar(flag),
    );
    expect(sinLector, `flags de uiSlice sin lector: ${sinLector.join(', ')}`).toEqual([]);
  });

  it('las excepciones que nombran un flag BORRADO no están en el store', () => {
    // Si `auditorMode` vuelve a `uiSlice`, la excepción deja de describir una
    // deuda saldada y pasa a tapar un flag vivo.
    const borrados = Object.keys(EXCEPCIONES).filter((k) => EXCEPCIONES[k].startsWith('BORRADO'));
    expect(borrados.length).toBeGreaterThan(0);
    for (const flag of borrados) {
      expect(uiSliceSinComentarios, `${flag} sigue declarado en uiSlice`).not.toMatch(new RegExp(`\\b${flag}\\b`));
    }
  });

  it('las excepciones que nombran un flag VIVO tienen de verdad un lector', () => {
    // La cuenta al revés: una excepción que ya no aplica es una puerta que
    // alguien dejó abierta y que nadie va a cruzar nunca más.
    const vivas = Object.keys(EXCEPCIONES).filter((k) => !EXCEPCIONES[k].startsWith('BORRADO'));
    expect(vivas.length).toBeGreaterThan(0);
    const huerfanas = vivas.filter((f) => !seUsaEnOtroLugar(f) && !new RegExp(`\\b${f}\\b`).test(uiSliceSinComentarios));
    expect(huerfanas, `excepciones que ya no describen nada: ${huerfanas.join(', ')}`).toEqual([]);
  });
});
