/**
 * F7 Task 1 - las imagenes del proyecto dejan de morir con la pestana.
 *
 * EL DEFECTO, en dos hechos que se ven leyendo `uiSlice.ts`:
 *
 *  1. `addProjectImage` hacia `URL.createObjectURL(file)` y guardaba el `File`
 *     entero en el store. El blob vive en la memoria de la PESTANA: al cerrar y
 *     reabrir la app, el string `blob:...` que quedo guardado no resuelve. La
 *     galeria se llenaba de imagenes rotas que parecian cargadas, y el `File`
 *     ocupaba la memoria del archivo entero por cada imagen.
 *
 *  2. `removeProjectImage` filtraba y nada mas. No llamaba a
 *     `URL.revokeObjectURL`. Eso es una fuga: cada imagen borrada dejaba su blob
 *     vivo hasta que moria la pestana, y con muchos proyectos se acumula.
 *
 * LO QUE MIDE ESTE ARCHIVO. No mide "que se llame a una funcion": mide que lo
 * que sobrevive al reinicio sea una imagen QUE SE VE. Por eso `rehidratar()`
 * serializa con el `partialize` REAL de `useDocStore` y vuelve a parsearlo - si
 * manana alguien saca `projectImages` del `partialize`, esta prueba se pone roja
 * aunque el tipo siga siendo perfecto.
 *
 * Y el bucle de la persistencia se escribe con la misma clave y el mismo
 * envoltorio `{state, version}` que usa `createJSONStorage`. Un `partialize`
 * inventado en el test seria otra verdad, y mediria la copia y no la cosa.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* EL ORDEN DE ESOS IMPORTES NO ES COSA ESTETICA. `api/backend` importa al store
   y el store importa a `api/backend`: son un ciclo. Si el test importara primero
   a `api/backend`, el store se evaluaria por el otro lado del ciclo y los
   slices se quedarian con la version REAL de `api.subirImagenDeProyecto` - el
   mock no se aplicaria, la llamada sairia a la red y el `catch` se la comeria
   en silencio: test verde con la subida sin correr. */
import { useDocStore, PERSIST_NOMBRE, persistPartialize } from '../store/useDocStore';

vi.mock('../api/backend', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/backend')>();
  return { ...real, subirImagenDeProyecto: vi.fn() };
});

import * as api from '../api/backend';

const subir = api.subirImagenDeProyecto as unknown as ReturnType<typeof vi.fn>;

/* jsdom no implementa estas dos, y la previsualizacion las usa mientras el
   archivo sube. Sin este espia, `URL.createObjectURL` es `undefined` y la
   prueba mide un TypeError en vez del defecto. */
interface Espia {
  /** Los object URL que la app creo durante la prueba. Con el codigo de hoy
   *  tiene que quedar VACIO: esa es la afirmacion de la fase. */
  creados: string[];
  /** Los que se liberaron. */
  revocados: string[];
  restaurar: () => void;
}

function espiarObjectURL(): Espia {
  const creados: string[] = [];
  const revocados: string[] = [];
  let n = 0;
  /* jsdom NO implementa estas dos, asi que `vi.spyOn(URL, 'createObjectURL')`
     tira "does not exist": no hay que espiar una propiedad ausente, hay que
     crearla primero. Y el espia tiene que quedar en `URL` de verdad, porque lo
     que vigila el guardian es el codigo de `uiSlice`, que llama al global. */
  const antes = {
    crear: (URL as any).createObjectURL,
    revocar: (URL as any).revokeObjectURL,
  };
  (URL as any).createObjectURL = () => {
    n += 1;
    const u = `blob:memoria/${n}`;
    creados.push(u);
    return u;
  };
  (URL as any).revokeObjectURL = (u: unknown) => { revocados.push(String(u)); };
  return {
    creados,
    revocados,
    restaurar: () => {
      (URL as any).createObjectURL = antes.crear;
      (URL as any).revokeObjectURL = antes.revocar;
    },
  };
}

/** El object URL que una version VIEJA de la app dejo persistido. */
const BLOB_VIEJO = 'blob:memoria/guardado-por-la-version-anterior';

const archivo = (nombre: string) =>
  new File([new Uint8Array([1, 2, 3])], nombre, { type: 'image/png' });

/**
 * Simula cerrar y reabrir la app: se escribe el estado con el `partialize` real
 * y se vuelve a leer lo que quedo. Lo que no esta en el `partialize` no vuelve,
 * y eso es exactamente lo que hay que medir.
 */
function rehidratar(): { projectImages: Record<string, unknown>[] } {
  const opt = useDocStore.persist.getOptions();
  /* Se usan el `partialize` EXPORTADO y el de las opciones del store, y se
     comprueba que son el mismo. Si divergieran, el test mediria una cosa y la
     app otra: exactamente el modo de fallo que este archivo vino a matar. */
  const delStore = opt.partialize!(useDocStore.getState());
  const exportado = persistPartialize(useDocStore.getState());
  expect(JSON.stringify(exportado)).toBe(JSON.stringify(delStore));

  const serializado = JSON.stringify({ state: delStore, version: opt.version });
  return JSON.parse(serializado).state as { projectImages: Record<string, unknown>[] };
}

beforeEach(() => {
  vi.clearAllMocks();
  useDocStore.setState({ projectImages: [] });
  subir.mockResolvedValue({ assetId: 'a-1', name: 'logo.png' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('imagenes de proyecto', () => {
  it('la imagen sobrevive a un reinicio del store', async () => {
    const espia = espiarObjectURL();
    try {
      await useDocStore.getState().addProjectImage(archivo('logo.png'));

      /* Ya no se previsualiza con un blob: la preview sale de la URL del asset,
         que es lo unico que sigue resolviendo manana. */
      expect(espia.creados.length, 'la imagen se seguia previsualizando con un blob').toBe(0);

      const antes = rehidratar();
      expect(antes.projectImages).toHaveLength(1);
      expect(antes.projectImages[0].assetId).toBe('a-1');
      expect(antes.projectImages[0].previewUrl).toContain('/api/assets/');
      expect(antes.projectImages[0].previewUrl).not.toContain('blob:');
    } finally {
      espia.restaurar();
    }
  });

  it('el File no queda guardado en el store', async () => {
    const espia = espiarObjectURL();
    try {
      await useDocStore.getState().addProjectImage(archivo('logo.png'));
      /* La FORMA del objeto, no un `toContain` sobre el JSON: un `File` se
         serializa a `{}` en `JSON.stringify`, asi que un
         `not.toContain('lastModified')` pasaria con el `File` adentro. Lo que se
         afirma es que la clave no existe. */
      const img = useDocStore.getState().projectImages[0] as unknown as Record<string, unknown>;
      expect('file' in img).toBe(false);
      expect(JSON.stringify(useDocStore.getState().projectImages)).not.toContain('lastModified');
    } finally {
      espia.restaurar();
    }
  });

  it('nada guarda un blob: en el store de proyecto no hay blob:', async () => {
    const espia = espiarObjectURL();
    try {
      await useDocStore.getState().addProjectImage(archivo('logo.png'));
      subir.mockResolvedValueOnce({ assetId: 'a-2', name: 'figura.png' });
      await useDocStore.getState().addProjectImage(archivo('figura.png'));

      /* Se mira el estado REHIDRATADO. El vivo puede llevar un blob con
         justificacion -una imagen que todavia esta subiendo, y mientras tanto
         no hay nada mas que mostrar- y el que importa es el que sobrevive a
         cerrar la app. Por eso hay dos pruebas distintas: esta y la de borrar. */
      expect(JSON.stringify(rehidratar().projectImages)).not.toContain('blob:');
    } finally {
      espia.restaurar();
    }
  });

  it('borrar una imagen libera el blob', () => {
    const espia = espiarObjectURL();
    try {
      /* El caso en que un blob EXISTE todavia: una imagen de una version vieja
         de la app, que dejo el `object URL` persistido. En la sesion en que se
         actualiza, ese blob sigue vivo, y borrarlo sin revocar seria cambiar
         una fuga por otra. Por eso el `revoke` sigue en el codigo aunque el
         store de hoy no cree ninguno. */
      useDocStore.setState({
        projectImages: [
          { id: 'vIEJA', name: 'logo.png', assetId: '', previewUrl: BLOB_VIEJO },
        ],
      });
      /* Que el store NO lo creo: el espio esta mirando desde antes y sigue
         vacio. Asi se distingue "la app creo un blob" de "el blob ya estaba". */
      expect(espia.creados).toEqual([]);

      useDocStore.getState().removeProjectImage('vIEJA');
      /* Que la revocacion sea la DE ESA URL y no una cualquiera: con
         `toHaveBeenCalled()` pasaria aunque revocara la imagen equivocada. */
      expect(espia.revocados).toEqual([BLOB_VIEJO]);
      expect(useDocStore.getState().projectImages).toHaveLength(0);
    } finally {
      espia.restaurar();
    }
  });

  it('borrar una imagen que ya esta en disco NO intenta revocarla', () => {
    const espia = espiarObjectURL();
    try {
      /* La mitad que importa del caso anterior: la rama del `revoke` no puede
         disparar con cualquier imagen. Si `revokeObjectURL` se llamara con una
         URL de asset, el navegador no hace nada util y el espia lo muestra. */
      useDocStore.setState({
        projectImages: [
          { id: 'nueva', name: 'logo.png', assetId: 'a-9', previewUrl: '/api/assets/archivo/a-9' },
        ],
      });
      useDocStore.getState().removeProjectImage('nueva');
      expect(espia.revocados).toEqual([]);
    } finally {
      espia.restaurar();
    }
  });

  it('borrar una imagen que ya no existe no tira', () => {
    expect(() => useDocStore.getState().removeProjectImage('no-existe')).not.toThrow();
  });

  it('una subida que falla avisa y no deja una imagen rota en la lista', async () => {
    const espia = espiarObjectURL();
    try {
      subir.mockRejectedValueOnce(new Error('el motor no respondio'));
      await expect(useDocStore.getState().addProjectImage(archivo('rota.png'))).resolves.toBeNull();
      /* Sin esto la lista muestra una imagen que no se puede volver a bajar de
         ningun lado: un thumbnail con la miniatura rota y sin forma de
         arreglarlo. */
      expect(useDocStore.getState().projectImages).toHaveLength(0);
      expect(rehidratar().projectImages).toHaveLength(0);
    } finally {
      espia.restaurar();
    }
  });

  it('el id devuelto es el de la imagen que quedo en la lista', async () => {
    const espia = espiarObjectURL();
    try {
      const id = await useDocStore.getState().addProjectImage(archivo('logo.png'));
      expect(id).toBeTruthy();
      expect(useDocStore.getState().projectImages[0].id).toBe(id);
    } finally {
      espia.restaurar();
    }
  });
});

/* ── El guardian de la fase ─────────────────────────────────────────────────
 *
 * No basta con que las pruebas de arriba pasen: si manana alguien mete un
 * `URL.createObjectURL` nuevo en la accion de agregar, estas pruebas siguen en
 * verde porque ejercitan la API, no el codigo. Este bloque lee el fuente y falla
 * si el blob vuelve.
 *
 * Y tiene su propia prueba de lectura, porque un `toContain` que no encuentra
 * nada por un error de lectura -ruta mal escrita, glob vacio- pasa en silencio.
 * Eso es una de las cinco guardas que hubo que mutar en este repo. */
const NODE_FS = 'node:fs';
const NODE_URL = 'node:url';
const NODE_PATH = 'node:path';

const leer = async (relativa: string): Promise<string> => {
  const { readFileSync } = await import(/* @vite-ignore */ NODE_FS);
  const { fileURLToPath } = await import(/* @vite-ignore */ NODE_URL);
  const { resolve, dirname } = await import(/* @vite-ignore */ NODE_PATH);
  const ruta = resolve(dirname(fileURLToPath(import.meta.url)), relativa);
  return readFileSync(ruta, 'utf8');
};

/**
 * El codigo SIN comentarios.
 *
 * Sin esto, este guardian se denies a si mismo: el bloque de `addProjectImage`
 * explica en un comentario por que se dejo de hacer object URL, y ese comentario
 * menciona la funcion prohibida. Un guardián que no puede distinguir "llama a
 * esta cosa" de "explica por que no la llama" no es un guardián: es una prueba
 * de prosa.
 *
 * Es el mismo rodeo que usa `noHardcodedColors.test.ts` con `sinComentarios`, y
 * por el mismo motivo: un comentario puede y debe citar el valor que explica por
 * que dos cosas son iguales. El `[^:]` delante del `//` es lo que salva a las
 * URLs, que si no se comen el resto de la linea.
 */
const sinComentarios = (fuente: string): string =>
  fuente
    .replace(/\/\*[\s\S]*?\*\//g, (bloque) => bloque.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('el guardian: addProjectImage no vuelve a hacer blob', () => {
  it('la lectura sirve: el archivo se lee y las dos acciones siguen ahi', async () => {
    const fuente = await leer('../store/slices/uiSlice.ts');
    expect(fuente.length).toBeGreaterThan(1000);
    expect(fuente, 'la accion de agregar no esta en uiSlice.ts').toContain('addProjectImage:');
    expect(fuente, 'la accion de borrar no esta en uiSlice.ts').toContain('removeProjectImage:');
    /* Y que la accion este en el store de verdad, no solo mentioned en un
       comentario: el texto del fuente no distingue las dos cosas. */
    expect('addProjectImage' in useDocStore.getState()).toBe(true);
  });

  it('el codigo de la accion de agregar no llama a createObjectURL', async () => {
    /* El `partialize` tambien se vigila, y por el mismo motivo: un `blob:` en la
       lista de lo que se persiste es el defecto original, y puede entrar por ahi
       sin que ninguna accion lo llame —basta con que alguien escriba en el
       store. Se mira el texto de la DECLARACION, no el resultado: el resultado
       ya lo mide la prueba de reinicio, con datos de verdad. */
    const fuente = await leer('../store/slices/uiSlice.ts');
    const agregar = cuerpoDeLaAccion(sinComentarios(fuente), 'addProjectImage');
    const borrar = cuerpoDeLaAccion(sinComentarios(fuente), 'removeProjectImage');

    /* Las dos tienen que existir y no estar vacias: si el detector no encuentra
       el bloque, `''` no contiene `createObjectURL` y la regla pasa sin mirar. */
    expect(agregar.length, 'no se encontro el cuerpo de addProjectImage').toBeGreaterThan(0);
    expect(borrar.length, 'no se encontro el cuerpo de removeProjectImage').toBeGreaterThan(0);
    expect(agregar).not.toContain('createObjectURL');
    /* Y el `revokeObjectURL` tiene que estar en la de borrar: sin el, la fuga de
       memoria sigue existiendo aunque ya no se creen blobs. */
    expect(borrar).toContain('revokeObjectURL');
  });

  it('el bloque que decide que se persiste menciona projectImages', async () => {
    /* La otra puerta por la que puede colarse un `blob:`: la lista de lo que se
       guarda. Si `projectImages` sale de ahi, las imagenes mueren con la
       pestana otra vez — y todas las pruebas de arriba pasarian, porque miden
       una imagen que el store todavia tiene en memoria. */
    const fuente = sinComentarios(await leer('../store/useDocStore.ts'));
    const bloque = cuerpoDeLaAccion(fuente, 'persistPartialize');
    expect(bloque.length, 'no se encontro el cuerpo de persistPartialize').toBeGreaterThan(0);
    expect(bloque).toContain('projectImages');
  });

  it('el detector de cuerpos corta en la llave correcta, no en la de un vecino', () => {
    /* Un detector que corta en el primer `}` lee el bloque de OTRO objeto y pasa
       en verde. Este caso pone un `createObjectURL` en un objeto anidado DENTRO
       de la accion que se quiere vigilar: el detector tiene que verlo, porque la
       accion lo sigue conteniendo. */
    const conAnidado = [
      'addProjectImage: (file: File) => {',
      '  const previo = {',
      "    url: URL.createObjectURL(file),",
      '  };',
      '  return previo;',
      '},',
    ].join('\n');
    expect(cuerpoDeLaAccion(conAnidado, 'addProjectImage')).toContain('createObjectURL');

    /* Y el caso inverso: la accion vigilada esta limpia, y la SIGUIENTE tiene el
       blob. Si el detector se pasara de largo, marcaria la siguiente. */
    const vecinoSucio = [
      'addProjectImage: (file: File) => {',
      '  return file;',
      '},',
      'otra: () => {',
      "  const u = URL.createObjectURL(null);",
      '  return u;',
      '},',
    ].join('\n');
    const cuerpo = cuerpoDeLaAccion(vecinoSucio, 'addProjectImage');
    expect(cuerpo).not.toContain('createObjectURL');
  });

  it('el detector cae con una violacion inyectada y con un caso limpio', () => {
    const violacion = [
      'addProjectImage: (file: File) => {',
      "  const url = URL.createObjectURL(file);",
      '  return url;',
      '},',
      'removeProjectImage: (id: string) => {',
      '  URL.revokeObjectURL(id);',
      '},',
    ].join('\n');
    expect(cuerpoDeLaAccion(violacion, 'addProjectImage')).toContain('createObjectURL');
    expect(cuerpoDeLaAccion(violacion, 'removeProjectImage')).toContain('revokeObjectURL');

    /* Y un caso LIMPIO tiene que dar limpio: un detector que siempre falla es
       tan inutil como uno que nunca falla. */
    const limpio = [
      'addProjectImage: (file: File) => {',
      '  return subirImagenDeProyecto(file);',
      '},',
      'removeProjectImage: (id: string) => {',
      '  set((s) => ({ projectImages: s.projectImages.filter((i) => i.id !== id) }));',
      '},',
    ].join('\n');
    expect(cuerpoDeLaAccion(limpio, 'addProjectImage')).not.toContain('createObjectURL');
    expect(cuerpoDeLaAccion(limpio, 'removeProjectImage')).not.toContain('revokeObjectURL');

    /* Y la `const` de flecha, que es la forma que fallo antes: sin esta linea,
       el detector podria volver a mirar solo metodos de objeto y a encontrar
       `''` para `persistPartialize` sin que nadie se entere. */
    const enFlecha = [
      'const persistPartialize = (state: DocState) => ({',
      '  projectImages: state.projectImages,',
      '});',
    ].join('\n');
    expect(cuerpoDeLaAccion(enFlecha, 'persistPartialize')).toContain('projectImages');
    /* Con `export` adelante, que es como esta escrita de verdad. */
    const enFlechaExportada = [
      'export const persistPartialize = (state: DocState) => ({',
      '  projectImages: state.projectImages,',
      '});',
    ].join('\n');
    expect(cuerpoDeLaAccion(enFlechaExportada, 'persistPartialize')).toContain('projectImages');

    /* Y un nombre que NO existe tiene que dar cuerpo vacio, no el cuerpo del
       vecino: si `cuerpoDeLaAccion` devolviera el bloque equivocado, la
       pregunta "existe esta accion?" no tendria forma de NOTAR que falta. */
    expect(cuerpoDeLaAccion(enFlecha, 'noExiste')).toBe('');
  });
});

/**
 * El cuerpo de una accion del slice: desde su declaracion hasta la llave que la
 * cierra, contando la profundidad para no cortar en el primer `}` de un objeto
 * anidado.
 *
 * Reconoce las DOS formas que usa el store. Un metodo de objeto (`nombre: (...) =>
 * {`) y una `const` de flecha (`const nombre = (...) => {`). Solo la primera
 * estaba, y por eso `persistPartialize` —que es una `const`— salia con cuerpo
 * vacio: el detector no encontro lo que buscaba y la prueba que lo vigila paso
 * sin haber leido una linea. Un detector que no encuentra su objetivo tiene que
 * FALLAR, y por eso cada prueba que lo usa mira que el cuerpo no este vacio
 * ademas de mirar lo que hay adentro.
 */
function cuerpoDeLaAccion(fuente: string, nombre: string): string {
  const metodo = fuente.search(new RegExp(`^\\s*${nombre}\\s*:`, 'm'));
  /* El `export` va antes del `const` en `export const persistPartialize`. Sin el
     en el patron, la flecha no se encuentra y el detector devuelve `''` — y una
     guarda que devuelve `''` no falla: pasa. Es el quinto modo de fallo de este
     repo, y esta vez lo produjo el propio detector nuevo. */
  const flecha = fuente.search(
    new RegExp(`^\\s*(?:export\\s+)?(?:const|let|var)\\s+${nombre}\\b`, 'm'),
  );
  const arranque = metodo >= 0 ? metodo : flecha;
  if (arranque < 0) return '';
  const desde = fuente.indexOf('{', arranque);
  if (desde < 0) return '';
  let nivel = 0;
  for (let i = desde; i < fuente.length; i++) {
    if (fuente[i] === '{') nivel++;
    else if (fuente[i] === '}' && --nivel === 0) return fuente.slice(desde, i + 1);
  }
  return fuente.slice(desde);
}

void PERSIST_NOMBRE;
