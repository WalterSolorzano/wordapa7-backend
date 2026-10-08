/* WordAPA7 — toolbar: menu de desborde.
   La barra se quedo con titulo, guardado y avatar; aqui vive todo lo que
   antes saturaba la derecha. Las entradas con panel (Puntuacion, Modulos)
   montan su componente dentro del menu para que nadie tenga que sacarlos
   de la barra a mano.

   El estado del autoUpdater NO vive en useDocStore: sale de useUpdateStore,
   asi que la suscripcion al IPC y la condicion de "descargada" se leen de ahi. */

import React, { useEffect, useRef } from 'react';
import { Home, Undo2, Redo2, Copy, Puzzle, Download, Settings, Sun, Moon } from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';
import { useUpdateStore } from '../../store/useUpdateStore';
import { APAScoreCard } from './APAScoreCard';
import { APAModuleToggles } from './APAModuleToggles';
import { isWeb } from '../../lib/env';

/* Un grupo con nombre: el menú tenía ocho entradas separadas por tres líneas
   anónimas, así que nada decía qué era "documento" y qué era "app". El rótulo va
   en un `role="group"` con `aria-label` para que el teclado lo anuncie antes de
   sus entradas; el texto visible queda `aria-hidden` para no leerlo dos veces. */
const Grupo = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <div role="group" aria-label={titulo} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    <div
      aria-hidden
      style={{
        padding: '2px 10px 4px',
        fontSize: 10,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--color-text-tertiary)',
      }}
    >
      {titulo}
    </div>
    {children}
  </div>
);

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  width: '100%',
  padding: '6px 10px',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  background: 'transparent',
  color: 'var(--color-text-primary)',
  font: 'inherit',
  fontSize: 'var(--text-sm)',
  textAlign: 'left',
  cursor: 'pointer',
};

const Item = ({
  label, onClick, children, disabled, itemRef,
}: {
  label: string; onClick: () => void; children?: React.ReactNode;
  disabled?: boolean; itemRef?: React.Ref<HTMLButtonElement>;
}) => (
  <button
    type="button"
    role="menuitem"
    ref={itemRef}
    disabled={disabled}
    onClick={onClick}
    style={{ ...itemStyle, color: disabled ? 'var(--color-text-tertiary)' : undefined }}
  >
    {children}
    <span>{label}</span>
  </button>
);

/* Fila con panel: no es un comando, es el hueco del menu donde vive un control.
   `role="none"` y NO `menuitem`: este <div> no es accionable ni enfocable, y un
   menuitem que no se puede enfocar rompe el patrón de widget (el teclado
   recorre el menu y se topa con algo que no responde). Como no puede ser
   menuitem, su etiqueta va en un grupo con nombre: se sigue leyendo
   "Puntuación APA" antes de los controles que hay debajo. */
const Panel = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div role="group" aria-label={label} style={{ padding: '4px 6px' }}>
    {children}
  </div>
);

/** `role="menu"` no promete más de lo que cumple: las entradas son botones
 *  enfocables con `role="menuitem"`, y al abrirse el foco entra en la primera
 *  para que un usuario de teclado pueda recorrerlo. */
export function ToolbarOverflowMenu({ onClose }: { onClose: () => void }) {
  /* Suscripción por campo, no `useDocStore()` a secas: el menu abierto se
     re-pinta con CADA escritura del store —incluidas las de un barrido de
     proofreading que llegan en lote— y no lee nada más que estos ocho campos. */
  const doc = useDocStore((s) => s.doc);
  const historyIndex = useDocStore((s) => s.historyIndex);
  const historyLength = useDocStore((s) => s.history.length);
  const atHome = useDocStore((s) => s.atHome);
  const theme = useDocStore((s) => s.theme);
  const goHome = useDocStore((s) => s.goHome);
  const undo = useDocStore((s) => s.undo);
  const redo = useDocStore((s) => s.redo);
  const setTheme = useDocStore((s) => s.setTheme);
  const setSettingsHubOpen = useDocStore((s) => s.setSettingsHubOpen);
  const copyPdfToClipboard = useDocStore((s) => s.copyPdfToClipboard);
  const updateState = useUpdateStore((s) => s.state);
  const initUpdate = useUpdateStore((s) => s.init);
  const installUpdate = useUpdateStore((s) => s.install);

  // El menu es el unico consumidor del estado de actualizacion, asi que aqui se
  // inicializa la suscripcion al autoUpdater (una sola vez, el store se guarda).
  useEffect(() => { initUpdate(); }, [initUpdate]);

  // Al abrirse, el foco entra a la primera entrada. Un menu que se abre con
  // Enter y se abandona con Tab deja el foco en el botón de la barra y 260px
  // flotando sobre el documento, con el teclado sin forma de alcanzarlo.
  const firstItemRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { firstItemRef.current?.focus(); }, []);

  const run = (fn: () => void) => () => { fn(); onClose(); };
  const canUndo = !!doc && historyIndex > 0;
  const canRedo = !!doc && historyIndex < historyLength - 1;

  return (
    <div
      role="menu"
      aria-label="Más acciones"
      className="app-no-drag"
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        right: 0,
        minWidth: 260,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: 6,
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
        zIndex: 'var(--z-dropdown)',
      }}
    >
      {/* Dos mitades con nombre: lo que es del documento y lo que es del
          sistema. "Inicio" y el historial no editan nada, y los paneles de la
          app (Puntuación, Módulos) no son comandos, así que van agrupados y no
          sueltos entre líneas. */}
      <Grupo titulo="Documento">
        <Item label="Inicio" onClick={run(() => goHome())} disabled={atHome} itemRef={firstItemRef}>
          <Home size={14} strokeWidth={1.75} aria-hidden />
        </Item>
        <Item label="Deshacer" onClick={run(() => undo())} disabled={!canUndo}>
          <Undo2 size={14} strokeWidth={1.75} aria-hidden />
        </Item>
        <Item label="Rehacer" onClick={run(() => redo())} disabled={!canRedo}>
          <Redo2 size={14} strokeWidth={1.75} aria-hidden />
        </Item>
        <Item label="Copiar PDF para WhatsApp" onClick={run(() => void copyPdfToClipboard())}>
          <Copy size={14} strokeWidth={1.75} aria-hidden />
        </Item>
      </Grupo>

      <Grupo titulo="Sistema">
        <Panel label="Puntuación APA"><APAScoreCard /></Panel>
        <Panel label="Módulos APA"><APAModuleToggles /></Panel>
        {/* El complemento vive en la pestaña Conexión, que es donde están el
            registro de Office, el certificado y la instalación. Antes apuntaba a
            una pestaña 'addin' de un estudio que ya no existe. */}
        <Item label="Complemento de Word" onClick={run(() => setSettingsHubOpen(true, 'conexion'))}>
          <Puzzle size={14} strokeWidth={1.75} aria-hidden />
        </Item>
        {!isWeb() && updateState === 'downloaded' && (
          <Item label="Instalar actualización" onClick={run(() => installUpdate())}>
            <Download size={14} strokeWidth={1.75} aria-hidden />
          </Item>
        )}
        <Item label="Tema" onClick={run(() => setTheme(theme === 'light' ? 'dark' : 'light'))}>
          {theme === 'light'
            ? <Moon size={14} strokeWidth={1.75} aria-hidden />
            : <Sun size={14} strokeWidth={1.75} aria-hidden />}
        </Item>
        <Item label="Ajustes" onClick={run(() => setSettingsHubOpen(true))}>
          <Settings size={14} strokeWidth={1.75} aria-hidden />
        </Item>
      </Grupo>
    </div>
  );
}
