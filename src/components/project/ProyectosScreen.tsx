import React, { useState } from 'react';
import { FolderOpen, Sparkles, FileDown, ChevronRight } from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';
import { VersionTimeline } from './VersionTimeline';
import { ExploradorProyecto } from './ExploradorProyecto';
import type { Proyecto } from '../../lib/proyectoStore';
import type { ProyectoSlice } from '../../store/slices/proyectoSlice';
import type { DocState } from '../../store/types';

type Store = DocState & ProyectoSlice;
// Cast de conveniencia: useDocStore está tipado con DocState solo; ProyectoSlice
// se combina en runtime vía createProyectoSlice. El cast es seguro porque el
// store se construye con ambos slices (useDocStore.ts línea ~73).
const useStore = useDocStore as unknown as import('zustand').UseBoundStore<import('zustand').StoreApi<Store>>;

/**
 * Pantalla de gestión de proyectos.
 *
 * Columna única CENTRADA (decisión 2026-10): el explorador de proyecto —que
 * antes era una ventana modal externa— vive adentro, junto a la lista de
 * proyectos y la línea de tiempo de versiones. Una sola superficie de proyecto,
 * un solo destino en el rail.
 *
 * El ancho se limita y se centra con una columna de 860px: el layout anterior
 * era lista a la izquierda + detalle a la derecha, que dejaba todo el peso
 * pegado al borde y obligaba a barrer la pantalla de lado a lado. La lectura es
 * una sola pasada vertical.
 */
const ANCHO_COLUMNA = 'min(860px, 100%)';

/** Los tres momentos del trabajo, en una tira. Solo se dibuja cuando la
 *  pantalla está realmente vacía: es lo que explica PARA QUÉ existe, en vez
 *  de dejar el hueco sin causa. */
const PASOS_DE_USO = [
  { Icon: FolderOpen, texto: 'Cargá tus documentos' },
  { Icon: Sparkles, texto: 'Revisá con la IA' },
  { Icon: FileDown, texto: 'Exportá en APA 7' },
] as const;

export const ProyectosScreen: React.FC = () => {
  const proyectos = useStore(s => s.proyectos);
  const tabs = useStore(s => s.tabs);
  const projectImages = useStore(s => s.projectImages);
  const cerrarProyecto = useStore(s => s.cerrarProyecto);
  const marcarVersionActiva = useStore(s => s.marcarVersionActiva);
  const restaurarVersion = useStore(s => s.restaurarVersion);
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);

  const nadaAun = proyectos.length === 0 && tabs.length === 0 && projectImages.length === 0;

  const seleccionado: Proyecto | undefined =
    proyectos.find((p: Proyecto) => p.id === seleccionadoId) ?? proyectos[0];

  return (
    <section
      style={{
        height: '100%',
        overflowY: 'auto',
        display: 'flex',
        justifyContent: 'center',
        padding: 'var(--space-6)',
      }}
    >
      <div
        style={{
          width: ANCHO_COLUMNA,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-6)',
        }}
      >
        {/* El encabezado ya NO es condicional: es el ancla de la pantalla. Antes
            solo aparecía sin proyectos, y con proyectos la pantalla arrancaba
            directamente en la tarjeta, sin decir qué era todo esto. */}
        <header style={{ textAlign: 'center', paddingTop: 'var(--space-4)' }}>
          <h2
            style={{
              fontSize: 'var(--text-xl)',
              fontWeight: 700,
              color: 'var(--text-main)',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            Organizar mis documentos
          </h2>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-muted)',
              margin: 'var(--space-2) auto 0',
              maxWidth: '52ch',
              lineHeight: 1.55,
            }}
          >
            Acá viven tus documentos, versiones e imágenes del proyecto.
            WordAPA7 crea las subcarpetas por vos.
          </p>
        </header>

        {/* Los pasos son una SECUENCIA, no controles. Vestirlos de pill
            (borde + radius-full + fondo) los hacía idénticos a los chips
            clickeables del propio proyecto y el usuario iba a intentar
            pulsarlos. Acá van como flujo plano: ícono + texto separados por un
            chevron, sin caja, con el peso de una línea de contexto. El chevron
            no es decoración: dice que hay un orden, y el orden es el contenido. */}
        {nadaAun && (
          <ol
            aria-label="Cómo se trabaja el proyecto"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexWrap: 'wrap',
              gap: 'var(--space-3)',
              listStyle: 'none',
              margin: 0,
              padding: 0,
            }}
          >
            {PASOS_DE_USO.map(({ Icon, texto }, i) => (
              <React.Fragment key={texto}>
                <li style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span aria-hidden style={{ display: 'inline-flex', color: 'var(--accent-primary)' }}>
                    <Icon size={15} strokeWidth="var(--icon-stroke)" />
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {texto}
                  </span>
                </li>
                {i < PASOS_DE_USO.length - 1 && (
                  <li aria-hidden style={{ display: 'inline-flex', flexShrink: 0, color: 'var(--color-text-tertiary)' }}>
                    <ChevronRight size={14} strokeWidth="var(--icon-stroke)" />
                  </li>
                )}
              </React.Fragment>
            ))}
          </ol>
        )}

        <ExploradorProyecto />

        {seleccionado && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Los proyectos son un selector, no una navegación de segundo
                nivel: se muestran como chips en una sola tira que envuelve, y
                el detalle vive abajo. Antes eran dos columnas que partían la
                atención entre elegir y leer. */}
            <div>
              <h3
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  margin: '0 0 var(--space-3)',
                }}
              >
                Mis proyectos
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                {proyectos.map((p: Proyecto) => {
                  const activo = seleccionado?.id === p.id;
                  return (
                    <ProyectoChip
                      key={p.id}
                      nombre={p.nombre}
                      activo={activo}
                      versiones={p.versiones.length}
                      cerrado={p.cerrado}
                      onClick={() => setSeleccionadoId(p.id)}
                    />
                  );
                })}
              </div>
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  marginBottom: 'var(--space-4)',
                }}
              >
                <h2
                  style={{
                    fontSize: 'var(--text-lg)',
                    fontWeight: 600,
                    color: 'var(--text-main)',
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {seleccionado.nombre}
                  {seleccionado.cerrado && (
                    <span
                      style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        background: 'var(--border-subtle)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Cerrado
                    </span>
                  )}
                </h2>
                {!seleccionado.cerrado && (
                  <button
                    type="button"
                    onClick={() => cerrarProyecto(seleccionado.id)}
                    style={{
                      padding: 'var(--space-2) var(--space-3)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      background: 'transparent',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                    }}
                  >
                    Cerrar proyecto
                  </button>
                )}
              </div>
              {!seleccionado.cerrado && (
                <VersionTimeline
                  versiones={seleccionado.versiones}
                  onMarcarActiva={(versionId) => marcarVersionActiva(seleccionado.id, versionId)}
                  onRestaurar={(versionId) => restaurarVersion(seleccionado.id, versionId)}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

interface ProyectoChipProps {
  nombre: string;
  activo: boolean;
  versiones: number;
  cerrado: boolean;
  onClick: () => void;
}

/** Chip de proyecto. Estado activo con tinte de acento (no un bloque sólido):
 *  la selección se lee como pertenencia, no como un botón de acción. Una tira
 *  de bloques azules sólidos convertiría el selector en la cosa más pesada de
 *  la pantalla, que es exactamente al revés de lo que es. */
const ProyectoChip: React.FC<ProyectoChipProps> = ({ nombre, activo, versiones, cerrado, onClick }) => {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-pressed={activo}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        textAlign: 'left',
        background: activo ? 'var(--color-accent-soft)' : hover ? 'var(--surface-elevated)' : 'var(--surface-subtle)',
        color: 'var(--text-main)',
        border: `1px solid ${activo ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        fontSize: 'var(--text-sm)',
        transition: 'background 0.12s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.12s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <span style={{ fontWeight: activo ? 700 : 600 }}>{nombre}</span>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        {versiones} {versiones === 1 ? 'versión' : 'versiones'}
        {cerrado && ' · Cerrado'}
      </span>
    </button>
  );
};
