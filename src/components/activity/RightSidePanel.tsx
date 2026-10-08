/* WordAPA7 — Panel derecho integrado (flex, no overlay).
   Forma parte del layout flex: cuando se abre, empuja el documento
   hacia la izquierda en lugar de flotar encima.
   - ActionBar + Inspector según contexto.
   - Sin bloques de "Resumen" ni "Revision IA" repetidos.

   D1: El toggle del Asistente IA (Sparkles) vive en este panel, no en una
   columna separada de 52px (EditorRail fue eliminado). Cuando el panel está
   cerrado se muestra una franja colapsada de 40px con el botón Sparkles. */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useDocStore } from '../../store/useDocStore';
import { ImageEditPanel } from '../inspector/ImageEditPanel';
import { EquationEditor } from '../inspector/EquationEditor';
import { ReferenceForm } from '../referencias/ReferenceForm';
import { ActionBar } from './ActionBar';
import { OutlineTree } from '../wizard/OutlineTree';
import { Activity, X, FileText, BookOpen, Map, Sparkles } from 'lucide-react';

const EVENT_ICONS: Record<string, React.ReactNode> = {
  success: <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>&#x2714;</span>,
  error: <span style={{ color: 'var(--color-danger)', fontWeight: 700 }}>&#x2716;</span>,
  info: <span style={{ color: 'var(--color-info)', fontWeight: 700 }}>i</span>,
  warning: <span style={{ color: 'var(--color-warning)', fontWeight: 700 }}>!</span>,
};

function timeAgo(t: number): string {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 10) return 'ahora';
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

const DEFAULT_WIDTH = 310;
const MIN_WIDTH = 260;
const MAX_WIDTH = 620;
const LOCAL_STORAGE_KEY = 'wordapa7-inspector-width';

/** Botón Sparkles reutilizable: toggle del Asistente IA (panel derecho). */
const SparklesToggle: React.FC<{ open: boolean; onClick: () => void }> = ({ open, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    title={open ? 'Ocultar Asistente IA' : 'Asistente IA (Herramientas de revisión)'}
    aria-label="Asistente IA"
    aria-expanded={open}
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: '28px', height: '28px', borderRadius: 'var(--radius-sm)',
      cursor: 'pointer', border: 'none', background: 'transparent', fontFamily: 'inherit',
      color: open ? 'var(--accent-primary)' : 'var(--text-secondary)',
      flexShrink: 0, transition: 'color 0.15s ease',
    }}
    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--surface-subtle)'; }}
    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
  >
    <Sparkles size={15} />
  </button>
);

export const RightSidePanel: React.FC = () => {
  const {
    forceRightPanelOpen, setForceRightPanelOpen,
    selectedElementId, selectedReferenceId, doc, wizardStep,
    setSelectedElementId, setSelectedReferenceId,
  } = useDocStore();
  const imagePanelOpen = useDocStore((s) => s.imagePanelOpen);
  const setImagePanelOpen = useDocStore((s) => s.setImagePanelOpen);

  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  /* El panel ya NO se abre solo al seleccionar un elemento cualquiera.
     El Inspector general (tipo, nivel, contenido) se fue: era una UI sobre la UI
     de cada fase y abría un cajón cada vez que tocabas un párrafo — sea para
     leerlo o para mirarlo. Lo que sí abre el panel es una SELECCIÓN CON
     DESTINO: una referencia (`ReferenceForm`) o una figura con
     `imagePanelOpen` (`ImageEditPanel`). Seleccionar para leer no abre nada. */
  useEffect(() => {
    if (selectedReferenceId && doc) setForceRightPanelOpen(true);
  }, [selectedReferenceId, doc, setForceRightPanelOpen]);

  useEffect(() => {
    if (imagePanelOpen && selectedElementId && doc) setForceRightPanelOpen(true);
  }, [imagePanelOpen, selectedElementId, doc, setForceRightPanelOpen]);

  /* Una ecuación seleccionada TAMBIÉN es una selección con destino: su editor de
     presentación (número, formato, alineación, tipografía). Mismo patrón que la
     figura. Va como efecto y no como rama del render porque seleccionar la
     ecuación tiene que ABRIR el panel, no solo llenarlo si ya estaba abierto. */
  useEffect(() => {
    if (!doc || !selectedElementId) return;
    const el = doc.elements.find((e) => e.id === selectedElementId);
    if (el?.type === 'equation') setForceRightPanelOpen(true);
  }, [selectedElementId, doc, setForceRightPanelOpen]);

  /* El efecto que abría el panel al entrar en el paso 4 SE FUE con la rama de
     paso 4, y por el mismo motivo: `App.tsx` EXCLUYE el panel derecho del paso
     4, así que este componente no se monta ahí y su condición nunca era cierta.
     El paso 4 tiene su propio espacio de trabajo, y el inspector general se
     abre —como en cualquier otra fase— al seleccionar un elemento. */

  // Guardar ancho en localStorage
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, panelWidth.toString());
  }, [panelWidth]);

  // Resize via drag en el borde izquierdo
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newW = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - e.clientX));
      setPanelWidth(newW);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
  }, [isResizing]);

  // ── D1: Estado colapsado — franja delgada con el toggle Sparkles ──
  // Cuando el panel está cerrado, mostramos una franja de 40px con el botón
  // Sparkles para que el usuario pueda reabrirlo. Reemplaza la columna
  // EditorRail de 52px que existía antes.
  if (!forceRightPanelOpen) {
    return (
      <div
        style={{
          width: '40px', flexShrink: 0, height: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          backgroundColor: 'var(--sidebar-bg)',
          borderLeft: '1px solid var(--border-subtle)',
          paddingTop: '10px',
        }}
      >
        <SparklesToggle
          open={false}
          onClick={() => {
            setSelectedReferenceId(null);
            setSelectedElementId(null);
            setForceRightPanelOpen(true);
          }}
        />
      </div>
    );
  }

  const hasReference = !!selectedReferenceId && !!doc;
  // ── Imagen seleccionada: el editor de imagen vive DENTRO de este panel
  //    (antes era una cuarta columna propia que aplastaba el documento). ──
  const selectedImage = doc && imagePanelOpen && selectedElementId
    ? doc.elements.find(
        (e) => e.id === selectedElementId && e.type === 'image' && !e.is_cover_section
      )
    : undefined;

  /* Una ecuación seleccionada es una SELECCIÓN CON DESTINO, como la figura: su
     editor de presentación. El tipo se lee del documento, no se adivina. */
  const selectedEquation = doc && selectedElementId
    ? doc.elements.find((e) => e.id === selectedElementId && e.type === 'equation')
    : undefined;

  /* Cuántas figuras hay en el documento, para el alcance de "aplicar a todas". Se
     cuenta UNA vez acá, con los logotipos de la portada afuera, que es la misma
     regla que aplica `contextosDeFiguras`. El panel no lo cuenta: lo recibe. */
  const totalFiguras = doc
    ? doc.elements.filter((e) => e.type === 'image' && !e.is_cover_section).length
    : 0;

  const sectionNames: Record<number, string> = {
    1: 'Portada', 2: 'Estructura', 3: 'Figuras y tablas', 4: 'Referencias',
  };
  const currentSection = sectionNames[wizardStep] || '';

  return (
    <div
      ref={panelRef}
      style={{
        // Flex item: empuja el documento en lugar de flotar encima.
        width: panelWidth,
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--sidebar-bg)',
        borderLeft: '1px solid var(--border-subtle)',
        position: 'relative', // para que el resize handle se posicione relativo a este contenedor
        overflow: 'hidden',
      }}
    >
      {/* Resize handle en el borde izquierdo */}
      <div
        onMouseDown={handleResizeStart}
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: 5, cursor: 'col-resize', zIndex: 26,
        }}
      />

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0,
        padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--sidebar-bg)',
      }}>
        {hasReference ? (
          <BookOpen size={14} color="var(--accent-primary)" />
        ) : (
          <FileText size={14} color="var(--accent-primary)" />
        )}
        <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)' }}>
          {selectedImage ? 'Imagen' : selectedEquation ? 'Ecuación' : hasReference ? 'Referencia' : `Documento${currentSection ? ` / ${currentSection}` : ''}`}
        </span>
        <div style={{ flex: 1 }} />
        {/* D1: Toggle del Asistente IA integrado en el header */}
        <SparklesToggle
          open={true}
          onClick={() => {
            setSelectedReferenceId(null);
            setSelectedElementId(null);
            setForceRightPanelOpen(false);
          }}
        />
        <button
          type="button"
          onClick={() => setForceRightPanelOpen(false)}
          aria-label="Cerrar panel"
          title="Cerrar panel"
          style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', borderRadius: '6px' }}
        >
          <X size={14} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {selectedImage ? (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)',
              flexShrink: 0, background: 'var(--sidebar-bg)',
            }}>
              <span style={{
                fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)',
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
                Inspector de la figura
              </span>
              {/* ESTO NAVEGA, NO CIERRA. La función ya era la correcta
                  (`setImagePanelOpen(false)`); lo que faltaba era el NOMBRE. Una
                  `X` muda es un control que hay que adivinar, y sin nombre no hay
                  forma de saber si se cierra el panel o si se vuelve al inspector
                  general. Ahora dice a dónde lleva, y lo dice en texto. */}
              <button
                type="button"
                onClick={() => setImagePanelOpen(false)}
                title="Volver al inspector general del elemento"
                aria-label="Volver al inspector"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 'auto', cursor: 'pointer', background: 'transparent',
                  border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)',
                  fontFamily: 'inherit', padding: '3px 8px', gap: '4px',
                }}
              >
                <X size={12} strokeWidth="var(--icon-stroke)" /> Volver al inspector
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto' }}>
              {/* `totalFiguras` lo cuenta el panel que tiene el documento delante: el
                  inspector no deduce el alcance de "todas", lo RECIBE. Con una sola
                  figura, el selector de alcance no aparece. */}
              <ImageEditPanel elem={selectedImage} totalFiguras={totalFiguras} />
            </div>
          </>
        ) : selectedEquation ? (
          <EquationEditor elemento={selectedEquation} />
        ) : hasReference ? (
          <ReferenceForm key={selectedReferenceId} />
        ) : (
          /* `wizardStep === 4` estaba acá y era INALCANZABLE: `App.tsx` excluye
             este panel del paso 4. No era un panel del paso: era una rama que no
             se podía ejecutar y que mantenía vivo un componente entero de 395
             líneas con dos archivos de prueba que nadie veía. El paso 4 no lleva
             tercera columna a propósito: su propio taller ya son dos, y F4
             encontró que "una columna más" es donde aparecen los bugs. */
          <DocumentPanel />
        )}
      </div>
    </div>
  );
};

// ── Panel "Documento": ActionBar + tabs [Mapa | Actividad] ──
// El tab "Mapa" monta OutlineTree (mismo módulo/diseño que el mapa del paso
// Estructura); se eliminó la implementación duplicada propia.

const DocumentPanel: React.FC = () => {
  const { doc, activityEvents } = useDocStore();
  const [docTab, setDocTab] = useState<'mapa' | 'actividad'>('mapa');

  if (!doc) return null;

  const tabBtn = (id: 'mapa' | 'actividad', label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setDocTab(id)}
      aria-pressed={docTab === id}
      title={label}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
        padding: '6px 8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        background: docTab === id ? 'var(--color-accent-soft)' : 'transparent',
        color: docTab === id ? 'var(--accent-primary)' : 'var(--text-secondary)',
        border: 'none', borderBottom: docTab === id ? '2px solid var(--accent-primary)' : '2px solid transparent',
      }}
    >
      {icon} {label}
    </button>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 12px 0 12px', flexShrink: 0 }}>
        <ActionBar />
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, marginTop: '10px' }}>
        {tabBtn('mapa', 'Mapa', <Map size={13} />)}
        {tabBtn('actividad', 'Actividad', <Activity size={13} />)}
      </div>

      {docTab === 'mapa' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <OutlineTree />
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {activityEvents.length === 0 && (
            <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
              Sin actividad todavía.
            </div>
          )}
          {activityEvents.slice(0, 8).map((ev: any) => (
            <div key={ev.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '9px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ flexShrink: 0, marginTop: '1px' }}>{EVENT_ICONS[ev.kind] || EVENT_ICONS.info}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.4 }}>{ev.title}</div>
                {ev.detail && <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: '2px' }}>{ev.detail}</div>}
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>{timeAgo(ev.time)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RightSidePanel;
