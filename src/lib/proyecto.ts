/* WordAPA7 — el modelo de `Proyecto`.
 *
 * F7 Task 3. Antes "proyecto" no era una entidad: era el prefijo del nombre del
 * archivo, y `parseDocumentVersion` lo sacaba de ahí. Eso hacía que renombrar el
 * archivo renombrara el proyecto, y que cerrar la app lo dejara en nada: el
 * nombre de un trabajo no puede depender del nombre de uno de sus capítulos.
 *
 * ESTE archivo es la verdad del nombre. `ProjectFolderModal` lo muestra, el store
 * lo persiste y `crearProyecto` lo arma. Si el nombre del proyecto aparece
 * derivado de otra cosa en algún lado, ese lugar está mintiendo.
 *
 * El `id` es lo que identifica al proyecto, y NO el nombre: por eso
 * `renombrarProyecto` puede cambiar el nombre sin romper nada.
 */

import type { ImagenProyecto } from '../types';

/** Un proyecto: un nombre, una carpeta de trabajo y las sesiones que contiene. */
export interface Proyecto {
  /** Identidad del proyecto. Un nombre puede cambiar; esto no. */
  id: string;
  nombre: string;
  /** Carpeta de trabajo en disco, o `null` si el proyecto todavía no tiene una. */
  raiz: string | null;
  /** `session_id` de cada documento que pertenece al proyecto. */
  documentos: string[];
  /** Figuras y anexos del proyecto. Los `assetId` son de disco (F7 Task 1). */
  figuras: ImagenProyecto[];
  /** ISO 8601. Cuándo se creó el proyecto. */
  creado: string;
}

/** Lo que hay que dar para abrir un proyecto. El resto lo decide `crearProyecto`. */
export interface ProyectoInicial {
  nombre: string;
  raiz?: string | null;
  id?: string;
  documentos?: string[];
  figuras?: ImagenProyecto[];
  creado?: string;
}

/**
 * Un identificador de proyecto.
 *
 * Es un `crypto.randomUUID` cuando existe, y no un contador ni una fecha: dos
 * proyectos abiertos en el mismo milisegundo tienen que ser dos. Los navegadores
 * viejos y el jsdom no lo tienen, así que cae a `Math.random`, que para esto
 * alcanza — lo que NO alcanzaría es un id predecible, porque el id viaja en la
 * URL de la API y una ruta traversal con un id elegido es una ruta traversal.
 */
function idNuevo(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * Un proyecto nuevo, con TODOS sus campos.
 *
 * Existe para que nadie pueda armar un `Proyecto` a mano y olvidarse de uno: un
 * `creado` que falta es un proyecto cuya antigüedad no se puede ordenar nunca.
 */
export function crearProyecto(inicial: ProyectoInicial): Proyecto {
  const nombre = (inicial.nombre ?? '').trim();
  if (!nombre) {
    /* Sin nombre no hay proyecto, y antes de este tipo la app ponía
       'Proyecto APA 7' en pantalla. Prefiero un error acá, que se ve en el
       desarrollo, a un nombre inventado que se ve en la pantalla de alguien. */
    throw new Error('Un proyecto necesita un nombre.');
  }
  return {
    id: inicial.id ?? idNuevo(),
    nombre,
    raiz: inicial.raiz ?? null,
    documentos: [...(inicial.documentos ?? [])],
    figuras: [...(inicial.figuras ?? [])],
    creado: inicial.creado ?? new Date().toISOString(),
  };
}

/**
 * Una clave de proyecto a partir del nombre del archivo y la carpeta.
 *
 * Se usa para agrupar pestañas por proyecto cuando no se tiene el `id` del
 * proyecto (por ejemplo, en `groupTabsByProject`). La clave es estable: si
 * el archivo se renombra pero la carpeta es la misma, la clave es la misma.
 *
 * Sin la raíz, la clave deriva del nombre del archivo: es lo mejor que se
 * puede hacer, y es lo que se hacía antes. Con la raíz, la clave es la raíz
 * misma: dos archivos en la misma carpeta pertenecen al mismo proyecto,
 * aunque se llamen distinto.
 */
export function projectKeyDe(nombreArchivo: string, raiz: string | null): string {
  if (raiz) {
    return `raiz:${raiz}`;
  }
  const nombre = nombreArchivo.replace(/\.[^/.]+$/, '').trim();
  return `archivo:${nombre}`;
}
