/* WordAPA7 — shell: catálogo de destinos del rail.
   Los destinos son datos para que el editor (6 fases) y la pantalla de Inicio
   compartan la misma gramática de navegación sin duplicar JSX. */

import { FileText, ListTree, Image as ImageIcon, BookOpen, ShieldCheck, Download,
  Home, History, PlusCircle, Settings, LayoutDashboard } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type RailStatus = 'done' | 'pending' | 'idle';

export interface RailDestination {
  /** Clave estable para React y para los tests. */
  id: string;
  /** Fase del asistente, o null si el destino no es una fase. */
  step: number | null;
  label: string;
  /** Etiqueta corta opcional para el chip del rail (evita cortes y asfixia visual). */
  shortLabel?: string;
  /** Descripción contextual clara para el flyout de detalle. */
  description?: string;
  Icon: LucideIcon;
  /**
   * Estado del trabajo de este destino, u `undefined` si NO tiene estado: un
   * destino que no es una fase (Ajustes) no se completa ni se postpone, y tampoco
   * tiene un cero honesto que announce. Sin este opcional, la gramática obligaba
   * a fabricar un `idle` que el flyout imprimía como "Sin pendientes" sobre un
   * botón.
   */
  status?: RailStatus;
  /** Cantidad de pendientes, para el punto del icono. */
  pending?: number;
  /** Si el flyout de este destino debe incluir el mapa del documento. */
  showOutline: boolean;
  /**
   * Si el destino abre su flyout de detalle al hacer clic. `false` en Exportar:
   * al hacer clic ya se entra al túnel de exportación, y un panel que lo
   * describa al lado competiría con la pantalla final, que ya dice dónde
   * descargar. Ausente/`true` deja el comportamiento normal.
   */
  showFlyout?: boolean;
  /** "Estás acá", para los destinos que no son fases (Inicio ⇄ Recientes).
   *  El editor no lo usa: su fase activa la sigue mandando `wizardStep`, y un
   *  destino sin fase no tiene nada que aportar a ese store. */
  current?: boolean;
}

/* F7 Task 5: el catalogo del rail mezcla DOS clases de cosa y el tipo lo dice de
   una vez. Las seis primeras son FASES (`step` es un numero y el `wizardStep` las
   enciende). `mis-proyectos` tiene `step: null` porque no es una fase: es una
   pantalla, `AGENTS.md` §5 la lista como principal, y abrirla no avanza el
   asistente. El `step: null` no es un caso raro del tipo: es lo que hace que
   `IconRail` no lo ilumine por `wizardStep` y que `AppShell` sepa que no hay fase
   a la que saltar. */
export const EDITOR_RAIL_ITEMS: ReadonlyArray<{
  id: string;
  step: number | null;
  label: string;
  shortLabel?: string;
  description?: string;
  Icon: LucideIcon;
  showOutline: boolean;
  showFlyout?: boolean;
}> = [
  /* `showOutline` SOLO en Estructura, y no por descuido: es la fase de la
     jerarquía del documento, y el árbol de estructura es lo que esa fase
     ofrece. En Figuras y Referencias el mismo árbol se superponía sobre una
     pantalla que no es de estructura —el reporte literal del usuario: "al
     pasar el mouse por una fase que no salga la ventana flotante"—, y un árbol
     de títulos encima de la lista de figuras es un panel que contradice a la
     fase que el rail dice que está activa.

     Es la misma regla del §1: el rail no puede contradecir a la pantalla a la
     que lleva. Un detalle que no pertenece a la fase es un detalle que
     describe otra fase. */
  { id: 'step-1', step: 1, label: 'Portada', shortLabel: 'Portada', description: 'Edición y formato de portada estándar APA 7.', Icon: FileText, showOutline: false, showFlyout: false },
  { id: 'step-2', step: 2, label: 'Estructura', shortLabel: 'Estruct.', description: 'Niveles de títulos y organización de secciones.', Icon: ListTree, showOutline: true, showFlyout: false },
  { id: 'step-3', step: 3, label: 'Figuras', shortLabel: 'Figuras', description: 'Tablas, figuras y numeración editorial.', Icon: ImageIcon, showOutline: false, showFlyout: false },
  { id: 'step-4', step: 4, label: 'Referencias', shortLabel: 'Refer.', description: 'Bibliografía, sangría francesa y formato APA.', Icon: BookOpen, showOutline: false, showFlyout: false },
  { id: 'step-5', step: 5, label: 'Revisión & IA', shortLabel: 'Revisión', description: 'Auditoría de estilo, ortografía y citas cruzadas.', Icon: ShieldCheck, showOutline: false, showFlyout: false },
  { id: 'step-6', step: 6, label: 'Exportar', shortLabel: 'Exportar', description: 'Generación final de archivo .docx validado.', Icon: Download, showOutline: false, showFlyout: false },
  /* SIN `status` Y SIN `pending`, Y NO POR OLVIDO. Es una pantalla, no una fase:
     no hay trabajo que completar ni que posponer, asi que no tiene un cero
     honesto que anunciar. Es el mismo motivo por el que Ajustes no lleva estado
     (ver `HOME_RAIL_ITEMS`) y por el que `status` es opcional en
     `RailDestination`: un "Listo" sobre un boton que abre una pantalla es un
     vocabulario de estado aplicado a una accion, y el rail no puede contradecir
     a la pantalla a la que lleva. `railPending` sigue siendo la UNICA derivacion
     de trabajo pendiente, y este destino no participa porque no tiene trabajo.

     UNA SOLA PANTALLA DE PROYECTO. Antes habia DOS destinos de proyecto: un
     "Explorador de proyecto" que abria una ventana modal y "Mis proyectos" con su
     pantalla. Dos caminos al mismo dato, y el modal encima de lo que hubiera.
     Ahora el explorador vive ADENTRO de esta pantalla, asi que el rail tiene un
     unico destino: esta.

     SIN `description`, A PROPOSITO. `RailFlyout` no dibuja panel si el destino no
     tiene detalle (`description`, `status` u `showOutline`), y una pantalla no
     necesita un flyout que la describa al lado: al hacer clic ya se esta en ella.
     La descripcion de una pantalla que uno va a abrir es ruido. */
  { id: 'mis-proyectos', step: null, label: 'Mis proyectos', shortLabel: 'Proyectos', Icon: LayoutDashboard, showOutline: false },
];

/* Inicio tiene su propio juego de destinos, pero el MISMO componente de rail.
   Todos con `step: null`: un destino de Inicio no es una fase, así que ninguno
   se enciende por `wizardStep`. Los dos que son "pestañas" (Inicio, Recientes)
   reciben `current` desde la pantalla, que es la que sabe cuál está a la vista. */
/* Ninguno lleva `status`: son ACCIONES y pestañas, no fases del asistente. No
   hay trabajo pendiente de completar en "Ajustes", así que el flyout no
   dibuja fila de estado y el rail no pone punto. Este es el motivo por el que
   `status` es opcional en `RailDestination` y no un `idle` obligatorio. */
/* Un rail con TRES entradas de configuración no es un rail: es un menú
   disfrazado de iconos, y peor que el menú, porque esconde lo que hace detrás de
   un glifo. "Complemento de Word", "Ajustes" y "Tema" eran tres filas del hub
   dispersas en tres iconos; ahora son una fila, `home-ajustes`, y las tres cosas
   se cambian en el lugar donde están las otras cuarenta. El hub se abre en la
   pestaña Conexión: es donde vive el registro de Office, el certificado y la
   instalación, y es donde se elige el tema. */
export const HOME_RAIL_ITEMS: RailDestination[] = [
  { id: 'home-inicio', step: null, label: 'Inicio', shortLabel: 'Inicio', description: 'Plantillas oficiales APA 7 y acceso rápido.', Icon: Home, showOutline: false },
  { id: 'home-recientes', step: null, label: 'Recientes', shortLabel: 'Historial', description: 'Documentos y sesiones guardadas previamente.', Icon: History, showOutline: false },
  { id: 'home-nueva', step: null, label: 'Nueva transformación', shortLabel: 'Nuevo', description: 'Carga un documento Word (.docx) para darle formato APA 7.', Icon: PlusCircle, showOutline: false },
  { id: 'home-ajustes', step: null, label: 'Ajustes', shortLabel: 'Ajustes', description: 'Proveedores de IA, complemento de Word, tema y todo lo demás, en cinco pestañas.', Icon: Settings, showOutline: false },
];
