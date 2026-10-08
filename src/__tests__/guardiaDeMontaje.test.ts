/**
 * F7 — guardián de montaje: nada de lo que esta fase hizo queda huérfano.
 *
 * UNA SUPERFICIE TERMINADA Y PROBADA QUE NADIE VE NO ESTÁ TERMINADA. Este archivo
 * es el que cierra esa frase, y existe porque las cinco guardas falsas que
 * aparecieron en este repo eran todas de este tipo: contaban cosas que no eran.
 *
 * EL GLOB ES EL DE VITE (`import.meta.glob`), Y NO EL DE POWERSHELL. En la F6, un
 * glob de PowerShell no bajo a la raiz de `src/` y no conto `App.tsx` — que era
 * JUSTO el archivo que tenia que estar. Este glob es el mismo que usa Vite para
 * el build, asi que no puede mentir sobre lo que la app compila.
 *
 * `eager: false` da una funcion de carga, no el modulo: importar cada componente
 * de la app en un test los ejecutaria todos. Lo que se lee es el TEXTO del
 * archivo, que es lo que se quiere vigilar: quien importa, y de que modulo.
 */
import { describe, it, expect, beforeAll } from 'vitest';

/* Solo `src/`, y `App.tsx` entra porque el patron `**` incluye la raiz. */
const archivosDeLaApp = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default' });

const nombres = () => Object.keys(archivosDeLaApp).sort();

/* POR QUE EL PARAMETRO ES UNA RUTA, Y POR QUE SE SALTA A SI MISMO.
 *
 * La primera version buscaba la palabra `proyecto` dentro del especificador. Con
 * eso, cambiar el import a `from '../types/proyecto'` —un modulo que NO existe—
 *Seguia dando "la app lo importa", porque `proyecto` aparece en la cadena. La
 * guarda paso con un modulo huerfano: la sexta guarda falsa de esta lista, y la
 * mas reincidente, porque `includes` sobre un nombre de archivo parece una forma
 * razonable de buscar y no lo es.
 *
 * Ahora el parametro es la RUTA y se exige que el especificador TERMINE en esa
 * ruta. Un archivo que se llamara `proyecto.ts` y uno llamado `viejo-proyecto.ts`
 * dejan de ser el mismo modulo.
 *
 * Y EL GUARDIAN SE SALTA A SI MISMO, Y ESTO NO ES REFINAMIENTO. Al corregir lo
 * de arriba, la guarda seguia VERDE con el import roto: este archivo tiene el
 * especificador bueno escrito DENTRO, en los casos de prueba, y se encontraba a
 * si mismo como importador de la app. Un guardian que aparece en la lista que
 * cuenta no puede afirmar nada sobre esa lista —si manana el unico importador
 * real desaparece y queda este archivo, sigue verde—. Es el mismo motivo por el
 * que un contador de lineas no cuenta sus propias lineas de control. */
const ARCHIVO_DEL_GUARDIAN = '/src/__tests__/guardiaDeMontaje.test.ts';

/**
 * El MISMO archivo, leido UNA sola vez.
 *
 * ESTO EXISTE POR UNA FALLA QUE NO ERA DE LOGICA. La primera version hacia las
 * lecturas con `await` en serie, una por archivo, y el guardian se caia por
 * `Test timed out in 5000ms` cuando corria la suite completa: con 127 archivos en
 * paralelo, 130 lecturas secuenciales pasan de los cinco segundos. Isolado
 * pasaba, y en la suite no — o sea que la guarda dependia de la maquina y del
 * orden, que es justo lo que una guarda no puede hacer.
 *
 * `Promise.all` las lee juntas, y ademas hay un chequeo de que la lectura
 * devuelve texto de verdad: si el `?raw` devolviera vacio, un `includes` sobre
 * "" no encuentra nada y el guardian daria "nadie importa nada" — verde por
 * falta de informacion, que es la peor forma de pasar.
 */
async function textosDeLaApp(): Promise<Map<string, string>> {
  const rutas = nombres().filter((r) => r !== ARCHIVO_DEL_GUARDIAN);
  const textos = await Promise.all(
    rutas.map(async (ruta) => [ruta, await (archivosDeLaApp[ruta] as () => Promise<string>)()] as const),
  );
  return new Map(textos);
}

/** Los importadores de una ruta, sobre el mapa ya leido. */
function importadoresEn(mapa: Map<string, string>, rutaModulo: string): string[] {
  const patron = new RegExp(`from\\s*['"][^'"]*${rutaModulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`);
  return [...mapa.entries()].filter(([, texto]) => patron.test(texto)).map(([r]) => r).sort();
}

describe('el buscador de importadores distingue modulos parecidos', () => {
  /* M14: cambiar el import de `../lib/proyecto` a `../types/proyecto` —que no
     existe— dejo la guarda en verde, porque buscaba la palabra y no la ruta.
     Estos dos casos son el antidoto: se afirma que el buscador REGRESA. Un
     buscador que siempre devuelve lista vacia hace pasar todas las guardas de
     "no hay huerfano", y es por eso que el control va aca y no adentro. */
  it('un especificador que solo comparte la palabra NO cuenta', () => {
    const falso = "import type { Proyecto } from '../types/proyecto';";
    const patron = new RegExp(`from\\s*['"][^'"]*lib/proyecto['"]`);
    expect(patron.test(falso)).toBe(false);
  });

  it('la ruta real SI cuenta', () => {
    const real = "import type { Proyecto } from '../lib/proyecto';";
    const patron = new RegExp(`from\\s*['"][^'"]*lib/proyecto['"]`);
    expect(patron.test(real)).toBe(true);
  });

  it('un archivo que se llama igual pero en otra carpeta NO cuenta', () => {
    const otro = "import { x } from '../../lib/proyectoViejo';";
    const patron = new RegExp(`from\\s*['"][^'"]*lib/proyecto['"]`);
    expect(patron.test(otro)).toBe(false);
  });
});

describe('el glob ve la app entera', () => {
  it('incluye App.tsx y los doce directorios de src', () => {
    // El control del control. Si el glob volviera vacio o parcial, TODAS las
    // consultas de abajo devolverian "nadie importa nada" y pasarian: es la
    // quinta guarda falsa, repetida, y se chequea primero justamente por eso.
    const todos = nombres();
    expect(todos.length).toBeGreaterThan(50);
    expect(todos).toContain('/src/App.tsx');
    expect(todos.some((p) => p === '/src/store/useDocStore.ts')).toBe(true);
    expect(todos.some((p) => p.startsWith('/src/components/shell/'))).toBe(true);
    expect(todos.some((p) => p.startsWith('/src/lib/'))).toBe(true);
  });

  it('el texto leido no viene vacio', () => {
    // Un `?raw` mal configurado devuelve cadena vacia y un `includes` sobre ""
    // da `true` para todo… o para nada, segun como se mire. Esto lo fija.
    const esperado = archivosDeLaApp['/src/App.tsx'] as () => Promise<string>;
    return esperado().then((t) => {
      expect(t.length).toBeGreaterThan(500);
      expect(t).toContain('useDocStore');
    });
  });
});

describe('nada de la fase F7 quedo huerfano', () => {
  /* El mapa se lee UNA vez para todo el bloque. Leerlo por test multiplicaba por
     ocho las 130 lecturas, y eso es lo que paso del limite de cinco segundos. */
  let mapa: Map<string, string>;
  beforeAll(async () => { mapa = await textosDeLaApp(); });

  it('el mapa leido tiene contenido de verdad', () => {
    /* Si `?raw` devolviera vacio por una mala configuracion, TODAS las consultas
       de abajo darian "nadie importa nada" y pasarian: verde por falta de
       informacion. Este es el control que convierte eso en rojo. */
    expect(mapa.size).toBeGreaterThan(50);
    const app = mapa.get('/src/App.tsx');
    expect(app && app.length).toBeGreaterThan(500);
    expect(app).toContain('useDocStore');
  });

  it('lib/proyecto.ts lo importa la app, no solo un test', () => {
    // `lib/proyecto.ts` es el modelo. Si solo lo importa su propio test, la app
    // no lo usa y el modelo no describe nada: es una superficie terminada y
    // probada que nadie ve.
    const ruta = importadoresEn(mapa, 'lib/proyecto');
    const desdeLaApp = ruta.filter((r) => !r.includes('/__tests__/'));
    expect(desdeLaApp, `lib/proyecto solo lo importan: ${JSON.stringify(ruta)}`).not.toHaveLength(0);
  });

  it('el Explorador vive dentro de la pantalla de proyectos', () => {
    // Antes era una ventana modal que se montaba encima de lo que hubiera. Ahora
    // es contenido de `ProyectosScreen`: una sola superficie de proyecto. Este es
    // el guardián que falla si alguien vuelve a montarlo como modal externo o lo
    // saca de la pantalla donde el rail lleva.
    const ruta = importadoresEn(mapa, 'ExploradorProyecto');
    const desdeLaPantalla = ruta.filter((r) => r.includes('/project/ProyectosScreen'));
    expect(desdeLaPantalla, `el Explorador se importa desde: ${JSON.stringify(ruta)}`).not.toHaveLength(0);
  });

  it('el boton de carpeta de ProjectTabs navega a la pantalla de proyectos', () => {
    // Si vuelve a un `setFolderModalOpen` local, el botón de la barra y el
    // destino del rail pasan a ser dos verdades: uno abre algo y el otro no. El
    // `viewMode` compartido es lo que los ata.
    const texto = mapa.get('/src/components/layout/ProjectTabs.tsx') ?? '';
    expect(texto).toContain("setViewMode('proyectos')");
    expect(texto, 'volvio un estado local para el Explorador').not.toContain('folderModalOpen');
    expect(texto, 'volvio la accion del modal viejo').not.toContain('abrirExplorador');
  });

  it('no queda estado del Explorador modal en el store', () => {
    /* El estado del modal (`exploradorAbierto` y sus acciones) se eliminó: nadie
       lo consume. Un campo sin consumidor es el rastro de una superficie que ya
       no existe, y el próximo que lo lea lo asumirá vigente. */
    const texto = mapa.get('/src/store/slices/uiSlice.ts') ?? '';
    expect(texto).not.toContain('exploradorAbierto');
    expect(texto).not.toContain('alternarExplorador');
    /* `viewMode` sigue en el mismo archivo: la pantalla de proyectos es estado
       de sesión, no del documento, y por ahí la navega el rail. */
    expect(texto).toContain('viewMode');
  });

  it('el proyecto se persiste en el partialize de la app', () => {
    expect(mapa.get('/src/store/useDocStore.ts') ?? '').toContain('proyecto: state.proyecto');
  });

  it('uploadFile escribe la ruta del archivo', () => {
    // El boton "Abrir carpeta" depende de esto. Si `uploadFile` deja de
    // establecerlo, el boton vuelve a ser un boton que no aparece, y ningun otro
    // test lo nota: por eso se lee la fuente y no el comportamiento.
    expect(mapa.get('/src/store/slices/documentSlice.ts') ?? '').toContain('activeFilePath: rutaDelArchivo');
  });

  it('ExploradorProyecto ya no inventa un nombre de proyecto', () => {
    {
      const texto = mapa.get('/src/components/project/ExploradorProyecto.tsx') ?? '';
      /* ESTA GUARDA ENCONTRO UN FALSO POSITIVO Y HAY QUE DECIRLO.
         La primera version hacia `not.toContain('Proyecto APA 7')` sobre el
         archivo entero, y se puso roja: la cadena sigue en el COMENTARIO que
         explica que se elimino. Ese comentario es lo que hay que conservar — un
         repo donde el porque de una correccion desaparece se la vuelve a
         escribir en dos meses—.

         Entonces la afirmacion es sobre CODIGO: se borran los comentarios y se
         busca la cadena en lo que queda. Un `toContain` a pelo habria forced a
         borrar el porque para que la guarda pasara, que es el modo de fallo
         inverso: el guardian mandando sobre la fuente. */
      const soloCodigo = texto
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ');
      expect(soloCodigo).not.toContain('Proyecto APA 7');
      /* Y el control del control: el comentario se sigue leyendo, o sea que la
         guarda no paso por haber borrado la explicacion. */
      expect(texto).toContain('Proyecto APA 7');
    }
  });
});

describe('la API de proyectos no tiene funciones huerfanas', () => {
  /* ESTA GUARDA NACIO DE UN GREP, NO DE UNA IDEA. Al revisar que la fase
     dejara nada colgando, el grep de importadores mostro que tres de las cuatro
     funciones de `api/backend.ts` —listar, crear y sincronizar— estaban escritas
     y no las llamaba NADIE: superficie terminada, probada por el lado de Python,
     y que el frontend no usa. Es literalmente el criterio de aceptacion de la
     fase ("una superficie terminada que nadie ve no esta terminada"), y se
     cumplio por el camino corto.

     La forma de vigilarlo NO es contar la aparicion de la palabra: la propia
     declaracion en `backend.ts` contaria, y con eso la guarda pasaria siempre.
     Hay que distinguir la DECLARACION de la LLAMADA: `export async function X`
     es la primera, y `X(` en cualquier otro archivo es la segunda. */
  let mapa: Map<string, string>;
  beforeAll(async () => { mapa = await textosDeLaApp(); });

  const declaradas = (texto: string) =>
    [...texto.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1]);

  /* EL PUNTO ESTA PERMITIDO A DELANTE, Y NO ES UN DETALLE. La primera version
     uso `[^\\w.]` para no contar la propia declaracion, y con eso `api.X()` —que
     es COMO se llama a la API en todo el repo— no contaba como llamada: la
     guarda declaraba huerfana una funcion que si se usaba. La forma correcta de
     no contar la declaracion es excluir el archivo que la declara, que es lo que
     hace el filtro de arriba, no un Lucky caracter en la expresion. */
  const llamadasFueraDeLaApi = (fn: string) =>
    [...mapa.entries()]
      .filter(([ruta]) => !ruta.endsWith('/api/backend.ts'))
      .filter(([, texto]) => new RegExp(`\\b${fn}\\s*\\(`).test(texto))
      .map(([ruta]) => ruta)
      .sort();

  it('toda funcion de proyecto declarada tiene un consumidor en la app', () => {
    const api = mapa.get('/src/api/backend.ts') ?? '';
    const deProyectos = declaradas(api).filter((n) => /proyecto|Proyecto/i.test(n));
    expect(deProyectos.length, 'no se encontro ninguna funcion de proyecto en la API').toBeGreaterThan(0);

    const huerfanas = deProyectos.filter((fn) => llamadasFueraDeLaApi(fn).length === 0);
    expect(
      huerfanas,
      `estas funciones no las llama nadie: ${JSON.stringify(huerfanas)}`,
    ).toEqual([]);
  });

  it('el control: la guarda distingue declaracion de llamada', () => {
    // Si `llamadasFueraDeLaApi` contara la declaracion, la de arriba no podria
    // fallar nunca. Se afirma con un nombre que SOLO aparece en la declaracion.
    const texto = 'export async function soloDeclarada() { return 1; }';
    expect(declaradas(texto)).toEqual(['soloDeclarada']);
    expect(llamadasFueraDeLaApi('soloDeclarada')).toEqual([]);
  });
});

describe('el catalogo del rail declara los destinos completos', () => {
  it('todo destino declara id y step, y el modulo tiene step null', () => {
    const carga = archivosDeLaApp['/src/components/shell/railItems.ts'] as () => Promise<string>;
    return carga().then((texto) => {
      expect(texto).toContain("id: 'mis-proyectos'");
      expect(texto).toContain("step: null");
    });
  });
});
