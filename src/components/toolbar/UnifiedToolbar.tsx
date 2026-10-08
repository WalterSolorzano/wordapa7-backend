/* WordAPA7 — toolbar: la barra mínima del mockup (48px).
   Izquierda: logo/Archivo, título y chip "Guardado". Derecha: Copiloto,
   botón de más acciones y avatar. Todo lo demas vive en ToolbarOverflowMenu. */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, History, Loader2, MoreHorizontal, Sparkles } from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';
import { ToolbarOverflowMenu } from './ToolbarOverflowMenu';
import { SnapshotHistory } from './SnapshotHistory';
import { AppBrandLogo } from '../shared/AppBrandLogo';
import { useIsMobile } from '../../hooks/useMediaQuery';

type ChromeStyle = React.CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' };
const noDragRegion = { WebkitAppRegion: 'no-drag' } as ChromeStyle;

/** "hace 2 min", o `null` si todavía no se sabe cuándo se guardó.
 *
 *  `null` es la respuesta para "no lo sé", y por eso se devuelve en vez de
 *  inventar un "hace 0 min": un reloj que arranca en cero en cuanto se abre la
 *  app es un reloj que dice que acabás de guardar algo que no guardaste.
 *
 *  Y pasa a horas pasada la hora, porque "hace 61 min" no informa de nada y
 *  ocupa más ancho que "hace 1 h". */
export function tiempoRelativo(lastSavedAt: number | null, ahora = Date.now()): string | null {
  if (lastSavedAt == null) return null;
  const minutos = Math.floor((ahora - lastSavedAt) / 60_000);
  if (minutos < 1) return '0 min';
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas} h`;
  const dias = Math.floor(horas / 24);
  return `${dias} ${dias === 1 ? 'día' : 'días'}`;
}

export function UnifiedToolbar() {
  const doc = useDocStore((s) => s.doc);
  const hasUnsavedChanges = useDocStore((s) => s.hasUnsavedChanges);
  const lastSavedAt = useDocStore((s) => s.lastSavedAt);
  const isSaving = useDocStore((s) => s.isSaving);
  /* La hora avanza sola. `lastSavedAt` es un número y no cambia; si no lo
     miramos con un temporizador, "hace 2 min" se queda congelado en 2 para
     siempre y un reloj que miente es peor que no tener reloj. Se re-renderiza
     una vez por minuto: más fino sería gasto de CPU para un texto que la
     persona lee de reojo. */
  /* El VALOR del tick, no su setter. `setState` devuelve una función estable en
     todas las rendereizadas, así que ponerlo en las dependencias del `memo` no
     cambiaba nunca: el reloj se congelaba en "hace 0 min" para siempre. Es el
     error clásico de depender de un setter, y la prueba lo agarró porque el
     texto que buscaba era exactamente el número congelado. */
  const [tick, forzarTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forzarTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  /* SOLO `isSaving`. `hasUnsavedChanges` dejó de mandarlo: significa "hay
     trabajo sin confirmar en esta sesión" y lo levanta `pushHistory`, que se
     llama después de que el servidor ya guardó — usarlo hacía que la barra
     anunciara "Sin guardar" con el documento en el servidor. */
  const esGuardando = isSaving;
  const haceCuanto = useMemo(
    () => tiempoRelativo(lastSavedAt),
    [lastSavedAt, isSaving, tick],
  );
  const showFileMenu = useDocStore((s) => s.showFileMenu);
  const setShowFileMenu = useDocStore((s) => s.setShowFileMenu);
  const liveChatOpen = useDocStore((s) => s.liveChatOpen);
  const setLiveChatOpen = useDocStore((s) => s.setLiveChatOpen);
  const setSettingsHubOpen = useDocStore((s) => s.setSettingsHubOpen);
  const [overflowOpen, setOverflowOpen] = useState(false);
  /* El historial de versiones vive en la barra, junto al chip "Guardado": el
     lugar donde la app ya dice "está guardado" es donde tiene que poder
     mostrar DESDE CUÁNDO y volver atrás. */
  const [historialOpen, setHistorialOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const overflowButtonRef = useRef<HTMLButtonElement>(null);

  /* El menú de desborde se cerraba solo con un segundo clic en su botón. Un
     `mousedown` afuera lo cierra —como el overflow de `ProjectTabs`—, `Escape`
     lo cierra aunque el foco esté dentro, y al abrirse el foco entra a la
     primera entrada: sin eso, un usuario de teclado abre el menú con Enter y se
     va con Tab dejando 260px flotando sobre el documento. La barra no puede
     conmutar el estado del menú: vive local, y solo este componente lo cierra. */
  useEffect(() => {
    if (!overflowOpen) return;
    const onDown = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOverflowOpen(false);
        overflowButtonRef.current?.focus();
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [overflowOpen]);

  // Badge del Copiloto: hallazgos pendientes. Sigue en la barra porque el
  // Copiloto es la funcion principal del producto y se queda visible.
  const citationAudit = useDocStore((s) => s.citationAuditResult);
  const proofreadFindings = useDocStore((s) => s.proofreadFindings || []);
  const copilotIssueCount =
    (citationAudit?.ghost_citations?.length || 0) + (proofreadFindings.length > 0 ? 1 : 0);

  // Electron dibuja los botones nativos de ventana sobre la esquina superior
  // derecha, asi que la barra reserva ese ancho.
  const isElectron = !!(window as any).electronAPI;
  const isMobile = useIsMobile();

  return (
    <header
      className="app-drag"
      style={{
        display: isMobile ? 'flex' : 'grid',
        gridTemplateColumns: isMobile ? undefined : 'minmax(max-content, 1fr) minmax(0, auto) minmax(max-content, 1fr)',
        justifyContent: isMobile ? 'space-between' : undefined,
        alignItems: 'center',
        height: 48,
        flexShrink: 0,
        padding: isElectron ? '0 150px 0 16px' : (isMobile ? '0 8px' : '0 16px'),
        backgroundColor: 'var(--color-bg-surface)',
        borderBottom: '1px solid var(--color-border-subtle)',
        position: 'relative',
        zIndex: 'var(--z-sticky)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <button
          type="button"
          onClick={() => setShowFileMenu(!showFileMenu)}
          aria-label="Menú Archivo"
          aria-expanded={showFileMenu}
          aria-haspopup="dialog"
          title="Archivo"
          style={{
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
            background: 'none', border: 'none', padding: '4px 6px',
            cursor: 'pointer', borderRadius: 'var(--radius-sm)',
            ...noDragRegion,
          }}
        >
          <AppBrandLogo size={20} />
        </button>
      </div>

      {doc && (
        <div
          data-testid="toolbar-centro-doc"
          style={{
            minWidth: 0,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            pointerEvents: 'none',
          }}
        >
          <span
            title="Nombre del documento activo"
            style={{
              maxWidth: 380,
              flex: '0 1 auto',
              minWidth: 0,
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              pointerEvents: 'auto',
            }}
          >
            {doc.file_name || 'Documento sin título'}
          </span>
          <span
            title={esGuardando
              ? 'Guardando en el servidor…'
              : 'Este documento se guarda automáticamente en el servidor. Para bajar el .docx, usá Exportar.'}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 'var(--text-xs)',
              color: esGuardando ? 'var(--color-warning)' : 'var(--color-text-tertiary)',
              WebkitLineClamp: 1,
              pointerEvents: 'auto',
              flexShrink: 0,
            }}
          >
            {esGuardando
              ? <Loader2 size={11} strokeWidth={1.75} aria-hidden />
              : <Check size={11} strokeWidth={1.75} aria-hidden style={{ color: 'var(--color-success)' }} />}
            {esGuardando ? 'Guardando…' : 'Guardado'}
            {!esGuardando && haceCuanto && <span>{` · hace ${haceCuanto}`}</span>}
          </span>
          <div style={{ position: 'relative', pointerEvents: 'auto', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setHistorialOpen((v) => !v)}
              aria-label="Historial de versiones"
              aria-expanded={historialOpen}
              title="Historial de versiones"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 6px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border-subtle)',
                background: 'transparent', color: 'var(--color-text-tertiary)',
                fontSize: 'var(--text-xs)', cursor: 'pointer',
              }}
            >
              <History size={12} strokeWidth={1.75} aria-hidden />
              Versiones
            </button>
            {historialOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 'var(--z-dropdown)' }}>
                <SnapshotHistory />
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => setLiveChatOpen(!liveChatOpen)}
          aria-label="Copiloto Editorial IA"
          aria-expanded={liveChatOpen}
          aria-haspopup="dialog"
          title="Copiloto Editorial IA"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 10px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border-subtle)',
            background: 'var(--color-accent-soft)', color: 'var(--color-accent)',
            fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer',
            ...noDragRegion,
          }}
        >
          <Sparkles size={14} strokeWidth={1.75} aria-hidden />
          Copiloto
          {copilotIssueCount > 0 && (
            <span
              title={`${copilotIssueCount} observaciones pendientes`}
              style={{
                minWidth: 16, height: 16, borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-danger)', color: 'var(--color-text-on-accent)',
                fontSize: 9, fontWeight: 800, lineHeight: 1,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 4px',
              }}
            >
              {copilotIssueCount > 99 ? '99+' : copilotIssueCount}
            </span>
          )}
        </button>

        <div ref={overflowRef} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <button
            ref={overflowButtonRef}
            type="button"
            onClick={() => setOverflowOpen((v) => !v)}
            aria-label="Más acciones"
            aria-expanded={overflowOpen}
            aria-haspopup="menu"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-sm)', background: 'transparent',
              color: 'var(--color-text-secondary)', cursor: 'pointer',
              ...noDragRegion,
            }}
          >
            <MoreHorizontal size={15} strokeWidth={1.75} aria-hidden />
          </button>
          {overflowOpen && <ToolbarOverflowMenu onClose={() => setOverflowOpen(false)} />}
        </div>

        {/* Sin cuenta en el store, este botón no puede anunciar una sesión: la
            "W" de WordAPA7 es la marca, y lo que abre son Ajustes. Se nombra
            por lo que hace. "Vista previa" se fue del nombre porque la
            previsualización en vivo del estudio viejo también: lo que abría era
            el hub, y el nombre tenía que decir el hub. */}
        <button
          type="button"
          onClick={() => setSettingsHubOpen(true)}
          aria-label="Ajustes"
          title="Ajustes"
          style={{
            width: 28, height: 28, borderRadius: 'var(--radius-full)',
            border: 'none', backgroundColor: 'var(--color-accent)',
            color: 'var(--color-text-on-accent)', fontSize: 'var(--text-xs)',
            fontWeight: 700, cursor: 'pointer', ...noDragRegion,
          }}
        >
          W
        </button>
      </div>
    </header>
  );
}
