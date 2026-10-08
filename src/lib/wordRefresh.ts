/**
 * Lo que el watcher de Word le dice a la persona, deducido del diff y solo del diff.
 *
 * EL PROBLEMA QUE ESTE ARCHIVO EXISTE PARA ARREGLAR
 *
 * El watcher de Word (`App.tsx`) detectaba que el `.docx` cambio y mostraba un
 * toast que decia "el documento esta sincronizado". No reparseaba, no reauditaba
 * y no recargaba nada: la frase describia un trabajo que no se hacia. Es la clase
 * de mentira que no se nota porque suena razonable, y es exactamente la que
 * hace que una app deje de ser creible.
 *
 * La regla que la reemplaza cabe en una linea: **si el diff no lo prueba, no se
 * dice**. Ni "sincronizado", ni "revisado", ni "actualizado". El texto se arma
 * con los conteos que vuelven del backend y nada mas, y por eso hay pruebas que
 * recorren todos los caminos verificando que esas palabras no aparezcan.
 *
 * HAY UN SEGUNDO CASO QUE MAS SE VA A REPETIR, Y NO ES UN ERROR
 *
 * Un `.docx` es un ZIP y Word lo reescribe entero en cada guardado. El watcher de
 * Electron es `fs.watch` con su propio debounce de 600 ms (`electron/main.ts:317`),
 * NO un poll: dispara por evento del sistema de archivos. Leer el archivo en
 * medio de eso es lo NORMAL, no la excepcion: `parse_docx_bytes` revienta con
 * `BadZipFile` y el backend lo traduce a `{listo: false}` en vez de a un 500.
 * Por eso `listo: false` no produce ningun aviso: no hay nada que contar y un
 * error aqui seria mentir de otra manera, culpando al usuario de algo que no
 * hizo.
 *
 * UN `.docx` A MEDIAS ESCRIBIR NO ES UN DOCUMENTO CON MENOS PARRAFOS
 *
 * Esa confusion es el fallo caro. Si "a medias escribir" se tratara como un
 * documento vacio, el diff saldria limpio y la app diria "no cambio nada" — que
 * es una afirmacion, y es falsa: no se pudo mirar. Lo que se sabe cuando el
 * archivo esta a medias es que no se sabe nada.
 *
 * LO QUE ESTE ARCHIVO NO DICE, Y POR QUE LO DICE OTRO
 *
 * El diff solo dice que texto entro: hasta que los motores corren no hay
 * veredicto sobre el, asi que "se reaudito" seria falso y por eso no aparece en
 * `mensajeDeRefresco`. Lo que si se dice, cuando la reauditoria ya corrio, lo
 * arma `mensajeDeReauditoria`, que recibe el conteo que ELLA devolvio. La
 * distincion no es de estilo: lo que el diff cuenta (parrafos que entraron) y
 * lo que la reauditoria cuenta (hallazgos sobre el documento entero) son dos
 * preguntas con dos respuestas, y contestarle a una con la otra es la misma
 * mentira un paso mas adentro.
 *
 * La recarga del documento y los motores NO viven aca: viven en el store y en
 * `App.tsx`, y llegan por `alRefrescar`. Este modulo no conoce el store y por eso
 * se puede probar entero sin app.
 */

import { getApiBase } from '../api/http';
import type { RefrescoResultado } from '../store/types';

export interface ElementoDiff {
  id: string;
  hash: string;
  nuevo: boolean;
}

export interface DiffWord {
  session_id: string;
  /** `false` cuando el archivo se estaba escribiendo: no se pudo mirar. */
  listo: boolean;
  /** Solo con `listo: false`: por que no se pudo. */
  motivo?: string;
  /** Texto del error de transporte, si lo hubo. */
  error?: string;
  /** El documento, o su estructura, cambio algo que el diff si ve. */
  cambiado: boolean;
  hash_estructura: string;
  elementos: ElementoDiff[];
  ids_nuevos: string[];
  ids_eliminados: string[];
}

export type MensajeRefresco = { texto: string; tipo: 'info' | 'success' | 'warning' };

/**
 * El viaje al backend, con los errores traducidos a cosas que el visor sabe
 * leer.
 *
 * Un `404` NO se propaga como excepcion: es el unico error de este camino que
 * significa algo concreto —el archivo no esta donde la app cree— y se traduce a
 * `listo: false, motivo: 'no_existe'` para que el mensaje pueda nombrarlo. La
 * diferencia con "todavia no" es la diferencia entre "reintenta solo" y
 * "decile a la persona que mueva el archivo", y confundirlas hace que un
 * archivo renombrado parezca un glitch de cinco segundos.
 */
export async function refrescarDesdeWord(
  sessionId: string,
  ruta: string
): Promise<DiffWord> {
  const res = await fetch(`${getApiBase()}/refresh-from-word/${sessionId}?ruta=${encodeURIComponent(ruta)}`, {
    method: 'POST',
  });
  if (res.status === 404) {
    return {
      session_id: sessionId,
      listo: false,
      motivo: 'no_existe',
      error: 'HTTP 404',
      cambiado: false,
      hash_estructura: '',
      elementos: [],
      ids_nuevos: [],
      ids_eliminados: [],
    };
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** "3 párrafos nuevos", "1 párrafo nuevo": el plural no es decorativo, es gramática. */
function enPlural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * Que se dice de un diff. `null` es una respuesta valida y es la mayoria de las
 * veces: el watcher dispara por cada evento de escritura y casi siempre no hay
 * nada que contar —un Ctrl+S que solo toca estilos, una imagen— asi que un aviso
 * por guardado seria ruido con forma de informacion.
 */
export function mensajeDeRefresco(diff: DiffWord, nombreArchivo: string): MensajeRefresco | null {
  // Un archivo a medio escribir: todavia no. Se reintenta solo.
  if (!diff.listo) {
    // Un `404` SI es un problema real y con nombre —el archivo no esta ahi— y se
    // dice. Lo que no se hace es distinguir "todavia no" de "no se pudo": el
    // primero se reintenta solo y el segundo no, y mezclarlos hace que un
    // archivo movido de carpeta parezca un glitch.
    if (diff.motivo === 'no_existe' || (diff.error && /404/.test(diff.error))) {
      return {
        texto: `No se encuentra "${nombreArchivo}". Si lo moviste o lo renombraste, actualiza la ruta del documento.`,
        tipo: 'warning',
      };
    }
    return null;
  }

  // Word guardo y no cambio ni un texto ni la estructura de titulos: estilos, una
  // imagen, una propiedad del documento. No hay nada que contar y el aviso
  // seria ruido.
  if (!diff.cambiado) return null;

  const nuevos = diff.ids_nuevos.length;
  const eliminados = diff.ids_eliminados.length;

  if (nuevos === 0 && eliminados === 0) {
    // Solo cambio la estructura: los textos siguen siendo los mismos y las
    // listas de parrafos no cambiaron. Eso pasa cuando alguien mueve o borra un
    // titulo en Word, y es informacion real — un H1 organiza todo lo que tiene
    // debajo— asi que se nombra en vez de inventar un conteo de parrafos.
    return {
      texto: `Word guardó cambios en "${nombreArchivo}": se movieron los títulos.`,
      tipo: 'info',
    };
  }

  const partes: string[] = [];
  if (nuevos > 0) partes.push(enPlural(nuevos, 'párrafo nuevo', 'párrafos nuevos'));
  if (eliminados > 0) partes.push(enPlural(eliminados, 'párrafo eliminado', 'párrafos eliminados'));

  return {
    texto: `Word guardó cambios en "${nombreArchivo}": ${partes.join(' y ')}.`,
    tipo: 'info',
  };
}

/**
 * Que se dice DESPUES de que los motores corrieron, y que se dice con lo que
 * ellos devolvieron.
 *
 * EL NUMERO QUE SE DICE ES `res.hallazgos`, NUNCA `res.nuevos`
 *
 * El diff conto parrafos: "3 parrafos nuevos". La reauditoria conto hallazgos
 * sobre el documento entero: 11. Si el aviso dice 3, esta contestando una
 * pregunta que nadie hizo y callando la que se le hizo — y es exactamente la
 * misma mentira que `mensajeDeRefresco` evita por construccion. El 3 es cierto
 * y no es lo que la persona necesita saber: si guardo y ahora tiene 11
 * pendientes, tiene que leer 11.
 *
 * `hallazgos: null` NO ES CERO. `0` es "se re-audito y no quedo nada"; `null`
 * es "no se re-audito", y sobre eso no se afirma nada. Es la misma distincion
 * que `reusar` devuelve `None` en vez de `[]`.
 */
export function mensajeDeReauditoria(
  res: RefrescoResultado,
  nombreArchivo: string
): MensajeRefresco | null {
  // No se recargo nada: no hay recargado que anunciar. La recarga puede fallar
  // (backend reiniciandose) y en ese caso se avisaria de un trabajo que no
  // ocurrio.
  if (!res.cambiado) return null;
  // No se re-audito: no se dice nada de hallazgos. Ni "0", ni "ninguno".
  if (res.hallazgos === null) return null;

  if (res.hallazgos === 0) {
    return {
      texto: `Word guardó cambios en "${nombreArchivo}": se recargó y la reauditoría no encontró hallazgos.`,
      tipo: 'success',
    };
  }
  return {
    texto: `Word guardó cambios en "${nombreArchivo}": se recargó y la reauditoría encontró ${enPlural(res.hallazgos, 'hallazgo', 'hallazgos')}.`,
    tipo: 'info',
  };
}

export interface RefrescadorDeps {
  /** Llamada al backend. Se inyecta para que la prueba no dependa de la red. */
  pedir: (ruta: string) => Promise<DiffWord>;
  avisar: (texto: string, tipo: 'info' | 'success' | 'warning') => void;
  /** La ruta del archivo que Word tiene abierto, o `null` si no hay. */
  archivo: () => string | null;
  /**
   * Cuanto esperar antes del UN reintento cuando el archivo salio a medias.
   *
   * El watcher de Electron es `fs.watch` con su propio debounce de 600 ms
   * (`electron/main.ts:317-330`), no un poll: dispara por evento del sistema de
   * archivos. Por eso hace falta UN reintento y no un bucle. Un reintento corto
   * cubre el unico caso que de verdad se pierde —el evento llego mientras la
   * ultima escritura de Word seguia en curso— y si ese tambien falla, el
   * documento se vera en el siguiente guardado.
   *
   * Inyectado para que las pruebas no dependan del reloj: un temporizador real
   * en una prueba es una espera real, y una espera real es una prueba que a
   * veces pasa.
   */
  esperar?: (ms: number, fn: () => void) => void;
  /** Se puede poner en 0 para desactivar el reintento. */
  msReintento?: number;
  /**
   * Cerrar el ciclo: recargar el documento, tirar los hallazgos rancios y
   * re-correr los motores. Solo se llama si `diff.cambiado`.
   *
   * `null` es una respuesta valida y es la que se da cuando no hubo nada que
   * recargar: una recarga que fallo deja los hallazgos viejos en su sitio, y
   * preferimos un hallazgo viejo a una pantalla vacia sin aviso — el primero
   * se nota y se corrige, la segunda parece que la app perdio el documento.
   *
   * Lo que devuelve se convierte en el aviso con `mensajeDeReauditoria`, y ese
   * texto lo arma el que audito, no este modulo: aca no se sabe cuantos
   * hallazgos hay, solo que los hay.
   */
  alRefrescar?: (diff: DiffWord) => Promise<RefrescoResultado | null>;
}

export interface Refrescador {
  refrescar: () => Promise<void>;
  /** Si hay un refresco en vuelo, para que la UI pueda no depender de el. */
  pendiente: () => boolean;
}

/**
 * El watcher, con las garantias que un debounce no da.
 *
 * UNA A LA VEZ. El watcher de Electron dispara por evento del sistema de
 * archivos, y releer el `.docx` dos veces en paralelo es leerlo mientras el otro
 * lo esta leyendo: el que llega segundo se lleva un `BadZipFile` que no es real, y el
 * que llega primero pudo haber leido un archivo a medio escribir.
 *
 * PERO SIN PERDER UN GUARDADO. Un Ctrl+S que cae en medio del refresco no se
 * descarta: se marca y se vuelve a mirar cuando el anterior termina. Si se
 * tirara, la pantalla no se enteraria nunca y el fallo seria invisible — que es
 * la peor clase de fallo, porque no hay nada que reportar.
 *
 * UN ERROR NO MUERE EL WATCHER. Si `refrescar` propaga la excepcion, el
 * `useEffect` que lo llama se cae y el watcher deja de existir para el resto de
 * la sesion: Word guarda veinte veces y no pasa absolutamente nada. Un backend
 * que recien arranco no puede dejar la app sin vigilante.
 */
export function crearRefrescador(deps: RefrescadorDeps): Refrescador {
  const esperar = deps.esperar ?? ((ms, fn) => setTimeout(fn, ms));
  const msReintento = deps.msReintento ?? 900;
  let enVuelo = false;
  let hayQueVolverAMirar = false;

  /**
   * Cerrar el ciclo y decir lo que corresponde.
   *
   * Si hubo re-auditoria, el aviso es SUYO: el que cuenta hallazgos ya corrio
   * y su numero es el unico que describe el estado real de la pantalla. El del
   * diff queda de segunda opcion para cuando no se pudo re-auditar, que es
   * distinto de que no hubiera nada que contar.
   */
  async function cerrarYDecir(diff: DiffWord, ruta: string): Promise<void> {
    // El ciclo se cierra SOLO si el diff vio algo. Un Ctrl+S que solo toca
    // estilos no puede costar una re-auditoria entera, y sobre todo no puede
    // vaciar hallazgos: se perderian por un gesto que no cambio una palabra.
    if (diff.cambiado && deps.alRefrescar) {
      const resumen = await deps.alRefrescar(diff);
      const propio = resumen ? mensajeDeReauditoria(resumen, nombreDe(ruta)) : null;
      if (propio) {
        deps.avisar(propio.texto, propio.tipo);
        return;
      }
    }

    const mensaje = mensajeDeRefresco(diff, nombreDe(ruta));
    if (mensaje) deps.avisar(mensaje.texto, mensaje.tipo);
  }

  async function unaPasada(): Promise<void> {
    const ruta = deps.archivo();
    if (!ruta) return;
    try {
      const diff = await deps.pedir(ruta);

      // El archivo salio a medias. NO es un error y NO se avisa: se reintenta
      // una vez y corto. La razon de que haga falta el reintento es que el
      // watcher de Electron dispara por evento del sistema de archivos con un
      // debounce de 600 ms, y un `.docx` de tesis grande puede seguir
      // escribiendose despues de eso. Sin el reintento, ese guardado se pierde
      // entero y el documento no se actualiza hasta el siguiente Ctrl+S.
      if (!diff.listo && diff.motivo !== 'no_existe' && msReintento > 0) {
        await new Promise<void>((resolve) =>
          esperar(msReintento, () => resolve())
        );
        try {
          const segundo = await deps.pedir(ruta);
          // El reintento cierra el ciclo tambien: el guardado que se recupera
          // a la segunda es un guardado real, y dejarlo sin recargar dejaria
          // el texto nuevo en el servidor y el viejo en pantalla.
          if (segundo.listo) await cerrarYDecir(segundo, ruta);
        } catch {
          // El reintento es una cortesia. Si falla, se cae al silencio.
        }
        return;
      }

      await cerrarYDecir(diff, ruta);
    } catch (e) {
      // No se avisa del error de transporte: si el backend esta reiniciandose,
      // sale un toast por cada guardado hasta que alguien lo reinicie a mano.
      // Lo unico que hace falta es no morir y volver a mirar al proximo guardado.
      void e;
    }
  }

  async function refrescar(): Promise<void> {
    if (enVuelo) {
      hayQueVolverAMirar = true;
      return;
    }
    enVuelo = true;
    try {
      do {
        hayQueVolverAMirar = false;
        await unaPasada();
      } while (hayQueVolverAMirar);
    } finally {
      enVuelo = false;
    }
  }

  return { refrescar, pendiente: () => enVuelo };
}

/** El nombre pelado, sin la ruta: una ruta local completa en un toast es ruido
 * y a veces es informacion que no hace falta mostrar. */
function nombreDe(ruta: string): string {
  const partes = ruta.split(/[\\/]/);
  return partes[partes.length - 1] || ruta;
}
