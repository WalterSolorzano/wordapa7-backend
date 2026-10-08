/* WordAPA7 — Ajustes, en un solo menu con cinco pestañas.
 *
 * Es un DIÁLOGO modal, no un div: entra con el foco adentro, Escape lo cierra y
 * al cerrarse el foco vuelve a donde estaba. El backdrop es el de la app
 * (`Modal` de `components/ui/wordapa7.tsx`), el mismo que usa el resto: nadie
 * escribe un velo nuevo con un `rgba()` a mano.
 *
 * Va a PANTALLA COMPLETA (`full`): `App.tsx` lo monta EN LUGAR de la app, así
 * que la tarjeta centrada de 880px era una ventana flotante sin nada detrás que
 * justificara el vuelo. El cuerpo se centra con `maxWidth: 1100px` para que las
 * rejillas `auto-fit` de las pestañas usen el ancho sin estirar líneas largas.
 *
 * La barra de pestañas es HORIZONTAL, arriba. `DESIGN.md:167` prohíbe los
 * side-tabs gruesos de 3-4px de color en un solo lado, y el inventario los
 * encontró ya en dos lugares: repetirlos acá sería el tercero.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Modal } from '../ui/wordapa7';
import { useDocStore } from '../../store/useDocStore';
import { PESTANAS, pestanaPorId } from './tabs';
import { ConexionTab } from './tabs/ConexionTab';
import { RevisionTab } from './tabs/RevisionTab';
import { FormatoTab } from './tabs/FormatoTab';
import { DocumentoTab } from './tabs/DocumentoTab';
import { AppTab } from './tabs/AppTab';

export const SettingsHub: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const tab = useDocStore((s) => s.settingsHubTab);
  const setSettingsHubTab = useDocStore((s) => s.setSettingsHubTab);
  const setSettingsHubOpen = useDocStore((s) => s.setSettingsHubOpen);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const activa = pestanaPorId(tab);

  const cerrar = useCallback(() => {
    setSettingsHubOpen(false);
    onClose?.();
  }, [onClose, setSettingsHubOpen]);

  /* Al abrir entra el foco; al cerrar vuelve al elemento que estaba focused.
     Sin esto el teclado se pierde en el body y la persona tiene que empezar a
     tabular de nuevo desde arriba. */
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    shellRef.current?.focus();
    return () => {
      previo?.focus?.();
    };
  }, []);

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cerrar();
        return;
      }
      /* Tab atrapado: el foco no puede quedarse en la página de atrás, que
         sigue siendo visible detrás del velo y no se puede leer. */
      if (e.key !== 'Tab' || !shellRef.current) return;
      const focuses = Array.from(
        shellRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled'));
      if (focuses.length === 0) return;
      const primero = focuses[0];
      const ultimo = focuses[focuses.length - 1];
      const actual = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (actual === primero || !shellRef.current.contains(actual))) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && actual === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [cerrar]);

  return (
    <Modal
      open
      onClose={cerrar}
      zIndex="var(--z-modal)"
      full
      style={{ display: 'flex', flexDirection: 'column', background: 'var(--app-bg)' }}
    >
      <div
        ref={shellRef}
        role="dialog"
        aria-modal="true"
        aria-label="Ajustes"
        tabIndex={-1}
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, fontFamily: 'var(--font-family)' }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 'var(--space-3)', padding: 'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
        }}>
          <h2 style={{
            margin: 0, fontSize: 'var(--text-lg)', fontWeight: 800,
            color: 'var(--text-main)',
          }}>
            Ajustes
          </h2>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar Ajustes"
            title="Cerrar"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 'var(--space-2)', border: 'none', borderRadius: 'var(--radius-md)',
              background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            <X size={18} strokeWidth="var(--icon-stroke)" />
          </button>
        </div>

        {/* La barra: horizontal, arriba, y la activa con fondo de acento. */}
        <div
          data-testid="settings-hub-tabs"
          role="tablist"
          aria-label="Secciones de Ajustes"
          style={{
            display: 'flex', flexDirection: 'row', flexWrap: 'wrap',
            borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
          }}
        >
          {PESTANAS.map((p) => {
            const esActiva = p.id === activa.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSettingsHubTab(p.id)}
                aria-selected={esActiva}
                role="tab"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 'var(--space-3) var(--space-5)', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 'var(--text-sm)',
                  fontWeight: esActiva ? 700 : 600, whiteSpace: 'nowrap',
                  background: esActiva ? 'var(--color-accent-soft)' : 'transparent',
                  color: esActiva ? 'var(--color-accent)' : 'var(--text-secondary)',
                  border: 'none',
                  borderBottom: esActiva ? '2px solid var(--color-accent)' : '2px solid transparent',
                }}
              >
                {p.etiqueta}
              </button>
            );
          })}
        </div>

        {/* El ámbito, escrito una vez por pestaña. */}
        <p
          data-testid="settings-hub-subtitulo"
          style={{
            margin: 0, padding: 'var(--space-3) var(--space-5)',
            fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
            background: 'var(--color-bg-surface-hover)', flexShrink: 0,
          }}
        >
          {activa.subtitulo}
        </p>

        <div
          data-testid="settings-hub-cuerpo"
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-5)' }}
        >
          {/* El ancho de lectura, UNA sola vez, acá. Las pestañas son rejillas
              `auto-fit`: con el shell a 100% del viewport, el límite evita que
              un control solitario se estire de borde a borde en un monitor
              ancho, y las que sí tienen varias columnas lo aprovechan solas. */}
          <div style={{ width: '100%', maxWidth: '1100px', margin: '0 auto' }}>
            {CUERPOS[activa.id]}
          </div>
        </div>
      </div>
    </Modal>
  );
};

/* Los cuerpos de las cinco pestañas. Cada una llega con su fase, y ya están las
   cinco: Documento y Formato (Fases 3 y 4), Conexión y Revisión (Fase 5) y App
   (Fase 6). Que una quede en `null` no es una pestaña vacía: es una pantalla
   rota, y el Review Focus #4 pide lo contrario. */
const CUERPOS: Record<string, React.ReactNode> = {
  documento: <DocumentoTab />,
  formato: <FormatoTab />,
  conexion: <ConexionTab />,
  revision: <RevisionTab />,
  app: <AppTab />,
};

export default SettingsHub;
