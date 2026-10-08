/* WordAPA7 — el catálogo de las cinco pestañas de Ajustes.
 *
 * Este archivo es la respuesta a la pregunta "este ajuste, ¿de quién es?". La
 * respuesta es `ambito`, y por eso vive en la PESTAÑA y no repetido en cada
 * control: dos ajustes de la misma pestaña que escribe en lugares distintos son
 * un defecto, no una excepción.
 *
 * La promesa que hace esta tabla —"Documento y Formato viajan con el documento,
 * Conexión, Revisión y App valen para toda la app"— no está sostenida por este
 * texto: la sostiene `src/__tests__/ambitoDeAjustes.test.ts`. Si mañana alguien
 * mete un ajuste de documento en la pestaña Conexión, ese test se cae.
 */
import type { MascotKind } from '../layout/EditorialMascot';

/** Si el ajuste viaja con el documento o con la app. */
export type AmbitoAjuste = 'documento' | 'app';

export type PestanaId = 'documento' | 'formato' | 'conexion' | 'revision' | 'app';

export interface Pestana {
  id: PestanaId;
  etiqueta: string;
  /** Si el ajuste viaja con el documento o con la app. NO es decorativo:
   *  `ambitoDeAjustes.test.ts` falla si un control de una pestaña de `documento`
   *  escribe en localStorage, o al revés. */
  ambito: AmbitoAjuste;
  /** Una línea, en palabras. Se escribe UNA vez por pestaña, no por control. */
  subtitulo: string;
  /** De la familia `EditorialMascot`. El kind se RESUELVE en `mascotDePestana`
   *  antes de dibujarse, así que un kind sin dibujo no deja la mascota en
   *  blanco. */
  mascotKind: MascotKind;
}

export const PESTANAS: Pestana[] = [
  /* El subtítulo de Documento NO es igual al de Formato, y esa diferencia es
     deliberada: la promesa original —"no cambian los demás que tengas
     abiertos"— es FALSA. `rules` es un solo objeto en el store, no uno por
     documento: con dos documentos abiertos, cambiar el papel de uno cambia el
     del otro. Lo que sí es cierto es la PERSISTENCIA, y eso es lo que dice.
     Escribir la verdad hace que `ambitoDeAjustes.test.ts` espere tres
     subtítulos distintos en vez de dos, y esa prueba tiene que mirar que cada
     uno NO prometa un aislamiento que el store todavía no garantiza. */
  { id: 'documento', etiqueta: 'Documento', ambito: 'documento', mascotKind: 'reference',
    subtitulo: 'Estos ajustes se guardan con el documento y salen con él al descargarlo.' },
  { id: 'formato', etiqueta: 'Formato', ambito: 'documento', mascotKind: 'ruler',
    subtitulo: 'Estos ajustes se guardan con el documento. No cambian los demás que tengas abiertos.' },
  { id: 'conexion', etiqueta: 'Conexión', ambito: 'app', mascotKind: 'highlighter',
    subtitulo: 'Estos ajustes valen para toda la app, en todos tus documentos.' },
  { id: 'revision', etiqueta: 'Revisión', ambito: 'app', mascotKind: 'strike',
    subtitulo: 'Estos ajustes valen para toda la app, en todos tus documentos.' },
  /* La Fase 6 le dio a App su kind propio, `gear`, dibujado en
   * `EditorialMascot.tsx`. Antes apuntaba a `reference` —el de Documento— para
   * no dejar la mascota en blanco: dos pestañas con la misma cara hacen que la
   * cara deje de ser una señal. */
  { id: 'app', etiqueta: 'App', ambito: 'app', mascotKind: 'gear',
    subtitulo: 'Estos ajustes valen para toda la app, en todos tus documentos.' },
];

export const PESTANA_POR_DEFECTO: PestanaId = 'documento';

/** Busca una pestaña por id. Devuelve la primera si el id no está en el catálogo,
 *  para que un id desconocido no deje la pantalla sin barra de pestañas. */
export function pestanaPorId(id: string | undefined): Pestana {
  return PESTANAS.find((p) => p.id === id) || PESTANAS[0];
}
