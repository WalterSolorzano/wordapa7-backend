/**
 * F1 · Task 3 — el estado vacío de la app, en un solo lugar.
 *
 * Antes de esto cada superficie escribía su propio texto de "no hay nada", y cada
 * uno lives inside de un panel que se puede esconder. El de Revisión vivía en el
 * `<aside>` del rack, que solo se renderiza con `rackVisible`: con la ventana bajo
 * 1180 px no había rack, y con el no había mensaje. Una pantalla vacía sin
 * explicación es un estado que no informa.
 *
 * La regla que este componente impone es una sola: cada motivo dice SU CAUSA, en
 * palabras, y no dice la posición de un panel que puede no haber. Un texto que
 * nombra "el panel de la derecha" en una ventana donde no hay panel a la derecha
 * es un texto que miente, y mentir en un estado vacío es peor que no decir nada:
 * el usuario busca el panel que no existe.
 */
import type { ReactNode } from 'react';
import { FileQuestion, Inbox, FilterX, MousePointerClick, Loader, BellOff, FolderPlus } from 'lucide-react';

export type MotivoVacio =
  | 'sin-documento'
  | 'sin-motor'
  | 'sin-resultados'
  | 'sin-seleccion'
  | 'corriendo'
  | 'sugerencias-apagadas'
  | 'proyecto-vacio';

export interface EstadoVacioProps {
  motivo: MotivoVacio;
  /** El filtro que dejó la pantalla vacía, cuando lo hay. Se NOMBRA en el texto. */
  filtroActivo?: string | null;
  /** La acción disponible, cuando hay una. Un estado vacío sin salida es un callejón. */
  accion?: ReactNode;
  /** Los motores que están corriendo AHORA. Solo lo lee `corriendo`. */
  motoresCorriendo?: string[];
}

interface Texto {
  titulo: string;
  detalle: string;
  Icon: typeof FileQuestion;
}

/* `sin-resultados` y `corriendo` NOMBRAN algo externo, así que son los únicos que
   arman su texto con un dato. Los otros cuatro son literales porque no tienen
   nada que leer: un texto que se arma con un valor que puede no existir tiene dos
   ramas, y la rama del valor ausente es la que dice "no hay resultados". */
const TEXTOS: Record<MotivoVacio, Texto> = {
  'sin-documento': {
    Icon: FileQuestion,
    titulo: 'No hay ningun documento abierto',
    detalle:
      'Carga un archivo .docx o crea uno nuevo. Sin documento no hay nada que revisar, y esta pantalla no tiene nada que mostrar todavia.',
  },
  'sin-motor': {
    Icon: Inbox,
    titulo: 'Todavia no corrio ningun motor',
    detalle:
      'Ningún motor reportó hallazgos todavía. Pulsa "Escanear" para correr la revisión completa.',
  },
  'sin-resultados': {
    Icon: FilterX,
    titulo: 'El filtro dejo la pantalla vacia',
    detalle:
      'El documento tiene hallazgos, pero ninguno pasa el filtro que esta activo. Vuelve a "Todo" para verlos.',
  },
  'sin-seleccion': {
    Icon: MousePointerClick,
    titulo: 'No hay ningun hallazgo seleccionado',
    detalle:
      'Hay hallazgos en el documento. Pulsa "Siguiente hallazgo" para recorrerlos de a uno, o elige cualquiera de la lista de motores.',
  },
  /* Los dos motivos que corrigen las dos mentiras que esta pantalla se contaba.
     Los globos se disparan solos al abrir un documento (`documentSlice.uploadFile`),
     así que decir "todavía no corrió ningún motor" mientras tres motores corrían
     era afirmar algo que el código no hacía. Y el interruptor de sugerencias
     proactivas descarta el resultado en silencio: sin decir nada, la pantalla
     vacía no tiene causa y parece un fallo. */
  'corriendo': {
    Icon: Loader,
    titulo: 'Los motores estan corriendo',
    detalle:
      'Los motores de fondo se disparan solos al abrir el documento, sin esperar a que pulses nada. Los hallazgos aparecen en cuanto terminan.',
  },
  'sugerencias-apagadas': {
    Icon: BellOff,
    titulo: 'Las sugerencias proactivas estan apagadas',
    detalle:
      'Los motores siguen corriendo, pero sus hallazgos se descartan y por eso esta pantalla queda vacía. Enciende "Sugerencias proactivas" en Ajustes, pestaña Revisión, y vuelve a escanear.',
  },
  'proyecto-vacio': {
    Icon: FolderPlus,
    titulo: 'Tu proyecto todavia no tiene nada',
    detalle:
      'Vinculá una carpeta o agregá un archivo .docx para empezar. WordAPA7 reconoce versiones, figuras y tablas de forma automática.',
  },
};

/** "citas y estilo" | "citas y estilo, legends" — con y, como se habla. */
const listaEnProsa = (motores: string[]): string =>
  motores.length <= 1
    ? motores[0] ?? ''
    : `${motores.slice(0, -1).join(', ')} y ${motores[motores.length - 1]}`;

export function EstadoVacio({ motivo, filtroActivo, accion, motoresCorriendo }: EstadoVacioProps) {
  const { Icon, titulo, detalle } = TEXTOS[motivo];
  /* El filtro se nombra acá y no en el texto fijo, porque es el único dato que
     cambia y es el único que el usuario puede tocar para arreglar la pantalla.
     Sin nombrarlo, el mensaje dice "el filtro" y el usuario tiene que adivinar
     cuál de los cinco era. */
  const conFiltro =
    motivo === 'sin-resultados' && filtroActivo
      ? `${detalle} El filtro activo es "${filtroActivo}".`
      : detalle;
  /* Lo que corre se NOMBRA, y no como dato suelto sino como frase: la lista sin
     conjunción ("citas, estilo, leyendas") se lee como un campo de texto, y el
     motivo de este texto es justamente que la persona sepa qué esperar. */
  const conMotores =
    motivo === 'corriendo' && motoresCorriendo && motoresCorriendo.length > 0
      ? ` Ahora mismo: ${listaEnProsa(motoresCorriendo)}.`
      : '';

  return (
    <div
      data-testid="estado-vacio"
      role="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-8) var(--space-6)',
        textAlign: 'center',
        minWidth: 0,
        color: 'var(--color-text-primary)',
      }}
    >
      <span
        aria-hidden
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '40px',
          height: '40px',
          borderRadius: 'var(--radius-full)',
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border-subtle)',
          color: 'var(--color-text-tertiary)',
        }}
      >
        <Icon size={20} strokeWidth="var(--icon-stroke)" />
      </span>

      <p
        style={{
          margin: 0,
          fontSize: 'var(--text-base)',
          fontWeight: 700,
          color: 'var(--color-text-primary)',
        }}
      >
        {titulo}
      </p>

      <p
        style={{
          margin: 0,
          maxWidth: '52ch',
          fontSize: 'var(--text-sm)',
          lineHeight: 1.5,
          color: 'var(--color-text-tertiary)',
        }}
      >
        {conFiltro}
        {conMotores}
      </p>

      {accion}
    </div>
  );
}

export default EstadoVacio;
