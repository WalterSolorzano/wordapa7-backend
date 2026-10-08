/**
 * WordAPA7 — T20: EL LINT DE TOKENS DEL REDISEÑO.
 *
 * Este archivo no es "una prueba más": es la red que convierte en regla lo que
 * hasta aquí era una aspiración escrita en AGENTS.md. Nueve pruebas de este
 * proyecto pasaron veinte tasks sin poder fallar, y dos defectos reales —un
 * fallback muerto que resolvía a 4px donde la spec decía 8px, y un token que no
 * existía y dejaba una marca del minimapa sin color— solo aparecieron leyendo
 * con calma. Ninguno de los dos rompe la compilación. Por eso las reglas viven
 * AQUÍ, y cada detector se prueba contra una violación inyectada.
 *
 * LAS REGLAS (diez, una prueba cada una, para que un rojo diga cuál se rompió):
 *
 *  R1 sin colores literales. Ni hex, ni rgb/rgba/hsl/hsla/oklch/color-mix en el
 *     código del rediseño. Los comentarios NO se miran: un comentario puede y
 *     debe citar el valor que explica por qué dos tokens son el mismo azul. Y se
 *     mira la LÍNEA COMPLETA, no el fragmento: un `var(--x)` en la misma línea
 *     que un `#4f7cff` no absuelve al hex. La versión del brief saltaba la
 *     línea entera, que es justo el agujero que hace que el fuente PAREZCA
 *     correcto.
 *     Tiene DOS excepciones, y las dos son por el MOTOR y no por el nombre del
 *     archivo. La primera es un literal dentro de un `new Set` o de un patrón:
 *     un color que ESTÁ BUSCANDO, que es lo que hace `DesignAuditor`. La
 *     segunda es un literal que va a un `<canvas>` o a un PDF: un
 *     `CanvasRenderingContext2D` no resuelve `var()` y el `StyleSheet` de
 *     `@react-pdf` se serializa a un archivo donde un token no viaja, así que
 *     ahí la alternativa a un literal es un literal en otro lado —y se exige
 *     que esté en una paleta CON NOMBRE, no suelto en cada `fillStyle`.
 *  R2 un specifier en variable nunca lleva fallback. `var(--space-1, 8px)` es
 *     siempre un error: o el token existe (y el fallback es ruido que dice 8px
 *     donde la hoja dice 4px) o no existe (y la referencia está mal escrita). No
 *     hay tercer caso. Este lint encontró UNO vivo en `RailFlyout` después de
 *     diecinueve tasks.
 *  R2-bis la misma regla, pero HONRA la diferencia entre declarar y usar. Dentro
 *     de un bloque `:root` la ley es la de un token. Fuera (`.wa-bubble`, `.btn`)
 *     un `var(--x, valor)` es un literal con un token por delante y su fallback
 *     es su valor: por eso ahí el fallback se permite y lo que no se perdona es
 *     un `var(--x)` SECO de un token que nadie declara. Esta regla encontró tres
 *     tokens que NO EXISTÍBAN en la hoja y que el navegador descartaba en
 *     silencio: `--accent-soft` y `--accent-subtle` (hover y activo de tarjetas,
 *     sin fondo) y `--text-tertiary` (los puntos de "cargando", sin color).
 *  R3 cada token que se usa está DECLARADO en design-system.css. Declarado es
 *     una línea `--token:` dentro de un bloque `:root` (claro u oscuro): buscar
 *     el nombre "en algún lado" daba por definido lo que solo aparecía dentro
 *     del valor de otro token. Un token inexistente no rompe la compilación:
 *     rompe el color en pantalla, que es peor y más difícil de ver.
 *  R4 el radio de borde solo sale de `--radius-*`. Ningún literal.
 *  R5 `strokeWidth` es el valor de `--icon-stroke` (hoy 1.75), leído de la
 *     hoja: si el token cambia, esta regla cambia con él en vez de quedar
 *     mirando un 1.75 escrito a mano en un test.
 *  R6 los iconos son de `lucide-react`. Un `<svg>` escrito a mano puede tener el
 *     grosor que quiera y no lo declara; por eso se prohíbe el elemento, no solo
 *     el `strokeWidth` equivocado.
 *  R7 la hoja de papel es la misma en los dos temas: `--paper-white` es
 *     `#ffffff` y `--paper-ink` es `#111827` en claro Y en oscuro, sin excepción.
 *  R8 un token no se declara a sí mismo. `--x: var(--x)` dentro de `:root` es un
 *     CICLO, y el ciclo es inválido en tiempo de valor calculado: la
 *     declaración es inválida y no la de arriba la salva. No es cosmético: este
 *     lint encontró dos vivos en la hoja, y uno de ellos (`--shadow-card`)
 *     tapaba la declaración válida de arriba, así que TODOS los
 *     `var(--shadow-card)` de la app resolvían a nada, en los dos temas, sin que
 *     nada se viera. Un ciclo se detecta solo si se busca el ciclo: R2 no lo ve,
 *     porque un `var(--x)` sin coma no es un fallback.
 *  R9 el veto al color literal también es para las HOJAS DE ESTILO, no solo para
 *     el código. `design-system.css` es la única hoja donde un hex puede
 *     DEFINIR un token; cualquier otra hoja con literales es una-infacción de la
 *     misma regla, y una segunda hoja viva con hex es lo que hace que un token
 *     "canónico" deje de serlo. La deuda que ya existe en `fluent.css` está
 *     FIJADA por su nombre y su cuenta (ver la prueba): una lista de exenciones
 *     no, porque es así como un lint de tokens se muere.
 *
 * EL ALCANCE, y por qué es una lista y no un `src/**`. Este lint gobierna lo que
 * el rediseño ESCRIBIÓ, que es lo que se puede hacer cumplir sin reescribir de
 * paso el resto del producto. `git diff --diff-filter=A aa03c53^..HEAD` da los
 * archivos que la rama creó; los directorios van enteros para que un archivo
 * NUEVO quede dentro sin que nadie tenga que acordarse. Los archivos reescritos
 * fuera de esos directorios entran por nombre. Lo que la rama solo TOCÓ
 * (PaperCanvas, App.tsx, ProjectTabs, WhatsAppComment, Step0QuickStart,
 * uiSlice) queda FUERA a propósito: arrastrar su deuda literal aquí convertiría
 * esta tarea en un proyecto de reescritura y, peor, haría que alguien metiera
 * una exención silenciosa para que el lint pasara. Esa deuda está nombrada en el
 * reporte de T20, no perdonada en el código.
 *
 * LO QUE QUEDA SIN GOBIERNO, CON SEÑAL EN EL ARCHIVO. Dos archivos se escapan de
 * las reglas y llevan su propio aviso en la primera línea, porque "está fuera
 * de alcance" y "nadie lo sabe" no son lo mismo:
 *   - `src/styles/fluent.css`: segunda hoja viva, importada globalmente desde
 *     `main.tsx`, con color literal. R9 lo ve y su cuenta queda FIJADA con su
 *     nombre; la deuda está en el reporte de T20.
 *   - `src/components/layout/WhatsAppComment.tsx`: la BURBUJA del comentario.
 *     AGENTS.md §2 exige que un hallazgo aparezca en DOS canales a la vez y que
 *     digan lo mismo, y el canal inline es `ReadingText`, que sí está en el
 *     alcance. El hermano de la pareja, no. Eso es un agujero conocido, no una
 *     exención: por eso el aviso está en el archivo.
 *
 * `components/referencias` entró al alcance cuando se reescribió el panel: tenía
 * TRES literales (`#ffffff` en el botón de acento, `#fff` en uno de resolver y
 * un `rgba()` como fallback de `--shadow-sm`) en el elemento más llamativo del
 * panel. No se agregaron porque "el panel está lleno" —una lista de exenciones
 * es exactamente como muere un lint— sino porque se arreglaron y el alcance
 * es lo que impide que vuelvan.
 * `components/settings/tabs` entró con el hub de Ajustes: es la superficie NUEVA
 * de la app y trae ya cuarenta controles entre las cinco pestañas, de las cuales
 * Conexión es la primera. Entra el DIRECTORIO ENTERO, no una lista de archivos,
 * que es la diferencia entre que un archivo nuevo quede vigilado sin que nadie
 * tenga que acordarse y que quede vigilado hasta que alguien lo escriba. No
 * entró "porque es nuevo": entró porque un panel de cuarenta controles escrito
 * desde cero es exactamente donde aparecen un hex copiado de un vecino y un
 * `strokeWidth="2"` que nadie mira, y las dos cosas son más caras encontrarlas
 * en producción que en una prueba.
 *
 * Y por qué NO es `components/settings` entero, que era la tentación: en la raíz
 * de ese directorio estaba `SettingsPreviewStudio.tsx`, con CUARENTA Y CUATRO
 * ofensas (`#fff`, `rgba()`, radios y tres tokens que no existen), y era un
 * archivo con fecha de borrado. Poner el directorio entero antes de tiempo
 * habría puesto el lint en rojo por una deuda que alguien iba a saldar, y un
 * lint rojo es un lint que nadie mira. La deuda quedó NOMBRADA acá —con su
 * archivo y su cuenta— que es el mismo mecanismo que usa `fluent.css`, no una
 * exención silenciosa.
 *
 * SALDADA. La Fase 7 borró `SettingsPreviewStudio.tsx` y `SettingsMenu.tsx`: las
 * veinticuatro ofensas se fueron con el archivo, y ahora la raíz de
 * `components/settings` tiene tres archivos, los tres ya en `ARCHIVOS`. Por eso
 * `DIRECTORIOS` sigue teniendo `components/settings/tabs` y no el directorio
 * padre: no es una excepción que se pueda retirar "después", es que la raíz ya
 * no tiene nada que exceptuar. Si alguien vuelve a poner un panel de ajustes
 * grande en esa raíz, tiene que poner su nombre en `ARCHIVOS` como cualquier
 * otro, y no hay deuda con fecha de borrado que lo tape.
 *
 * La F3 sumó `components/structure` con las DIEZ reglas y no con una cuenta: la
 * superficie es nueva y entra limpia, que es la única forma de que entrar. La
 * F3 lo miró ANTES de escribir los componentes, no después de arreglar lo que
 * salió: un panel nuevo escrito sin red es un panel nuevo con seis colores a
 * mano, y se habría dejado así por no mirar.
 */
import { describe, it, expect, beforeAll } from 'vitest';

/* Specifier en variable + import dinámico: con el literal, `nodePolyfills()` de
   vite lo resuelve a su propio shim de browser y `readFileSync` no existe
   (mismo truco que designTokens.test.ts, readingText.test.tsx y compañía). */
const NODE_FS = 'node:fs';
const NODE_PATH = 'node:path';
const NODE_URL = 'node:url';

/* ── El alcance ──────────────────────────────────────────────────────────── */

const DIRECTORIOS = ['components/shell', 'components/review', 'components/referencias', 'components/settings/tabs', 'hooks', 'components/structure'];
/* Los siete directorios que la Fase 1 sumó, y que hoy miran las DIEZ reglas.
 *
   La Fase 1 los sumó solo para R3, y dejó las otras cinco midiendo su deuda con
   una cuenta. El motivo estaba escrito y era bueno: una cuenta por archivo
   comparada con `===` pone el lint en rojo cada vez que alguien toca un archivo
   que ya estaba en deuda, y un lint que grita tanto que nadie lo escucha es un
   lint muerto. Ese problema no se arregla perdonando más, se arregla PAGANDO.
 *
   Y se pagó. Eran 543 ofensas en 32 archivos, y 119 valores DISTINTOS: casi
   todo era el mismo azul al mismo alfa, escrito de veinte maneras. Se pagaron
   con una escala de alfa por familia en `design-system.css`, con la escala de
   radio completada, con los `<svg>` copiados de lucide devueltos a lucide, y
   con los colores de canvas concentrados en paletas con nombre. La cuenta
   cerro en 526, y no en 543: las 17 de diferencia las duplicaba la cuenta vieja.
   
   El resultado es que `comoTexto` corre sobre `ALCANCE` y las diez reglas
   vigilan los doce directorios, sin cuenta y sin excepcion por archivo. Un
   color nuevo rompe la prueba en el momento, no tres meses despues. */
const DIRECTORIOS_R3 = [
  'components/auditor',
  'components/project',
  'components/layout',
  'components/upload',
  'components/wizard',
  'components/inspector',
  'components/export',
  /* La carpeta de figuras entra con la F4, que escribe `ListaContextual` y
     `EscenarioFigura`. Entra ANTES de que exista el primer archivo, porque el
     orden importa: una carpeta creada y usada primero, y sumada al alcance
     despues, es una carpeta donde un color literal no rompio nada durante los
     tres commits en los que estuvo fuera. */
  'components/figures',
];
/* La deuda MEDIDA de las cinco reglas en esos siete directorios YA NO EXISTE, y
   por eso este bloque ya no declara una `DEUDA_MEDIDA`. No se vacio: se pago.

   Eran 543 ofensas en 32 archivos, y el numero era casi todo una sola cosa
   escrita de veinte maneras: el mismo azul al mismo alfa. Se pagaron con una
   ESCALA —familia de color por paso de alfa— declarada una vez en
   `design-system.css` y en los dos temas, no con un token por literal. La
   cuenta cerro en 526 y no en 543, y la diferencia son 17 que la cuenta vieja
   nunca conto: `deudaSinPagar` filtraba por prefijo de directorio sobre una
   lista de rutas que ya traia los siete directorios, asi que los tres archivos
   que estan dentro de un directorio Y ademas en `ARCHIVOS` se contaban dos
   veces. Un numero de deuda que cuenta de mas tambien es un numero que no
   sirve para decidir nada.

   Y la consecuencia de que el mecanismo no exista es la que importa: las cinco
   reglas CORREN ahora sobre los doce directorios, sin excepcion por archivo.
   Un color nuevo en `PaperCanvas.tsx` rompe esta prueba hoy, no dentro de tres
   meses cuando alguien vuelva a tocar el archivo. */
const ARCHIVOS = [
  'components/export/ExportView.tsx',
  'components/toolbar/UnifiedToolbar.tsx',
  'components/toolbar/ToolbarOverflowMenu.tsx',
  'components/wizard/CoverCarouselStudio.tsx',
  'components/wizard/Step5AuditIAWizard.tsx',
  /* El cascarón del hub de Ajustes y su catálogo entran por nombre porque la
     raíz de `components/settings` ya no es un directorio que se pueda agregar de
     una vez (ver la nota de arriba del archivo: el estudio viejo, que era lo que
     lo impedía, se borró en la Fase 7). Los cuerpos de las pestañas sí entran
     con el directorio, así que los de las fases siguientes caen adentro solos. */
  'components/settings/SettingsHub.tsx',
  'components/settings/tabs.ts',
  'components/settings/mascotDePestana.tsx',
  'lib/commentContext.ts',
];
/** La hoja canónica. Los tokens se declaran AQUÍ y en ningún otro sitio. */
const HOJA = 'styles/design-system.css';
/** R9 mira el resto de las hojas de `src`: no es una exención, es la regla. */
const DIR_HOJAS = 'styles';
/** R9, la deuda que ya existe: `fluent.css` con este número de LÍNEAS de color
 *  literal, ya sin contar las dos que están dentro de un comentario (un
 *  comentario puede citar el valor, igual que en el código). Saldarla es trabajo
 *  de otra task —es una hoja importada globalmente desde `main.tsx`—; lo que
 *  hace esta task es que el número NO pueda crecer sin que alguien lo mire.
 *  Cuando baje, hay que bajar este número: es el recordatorio de hacerlo. */
const DEUDA_FLUENT_CSS = 89;

/* ── La hoja: qué está DECLARADO y qué vive dentro de un bloque :root ───────
   El detalle que hace que R2 y R3 no sean reglas de adivinanza. Una hoja de
   estilos tiene dos sitios: los bloques `:root`, donde se DECLARA un token, y
   las reglas de selector (`.wa-bubble`, `.btn`), donde se USA. En un bloque
   `:root` la ley es la de un token: sin fallback, y todo lo que se declara ahí
   es un token. Fuera, un `var(--x, valor)` es un LITERAL con un token por
   delante, y un `--x:` suelto es un custom property de esa regla: no es un token
   de la app, y por eso su `var(--x)` tiene que traer su valor. Esa distinción es
   la que separa "fallback muerto" de "defecto de tema oscuro". */

interface Hoja {
  /** Todo lo declarado en un bloque `:root` (claro u oscuro). */
  declarados: Set<string>;
  /** Las líneas que caen dentro de un bloque `:root`. */
  raiz: (linea: number) => boolean;
}

const SELECTOR_RAIZ = /^\s*:root\b[^{]*\{/gm;

function analizarHoja(css: string): Hoja {
  const declarados = new Set<string>();
  const rangos: [number, number][] = [];
  for (const m of css.matchAll(SELECTOR_RAIZ)) {
    const abierto = css.indexOf('{', m.index);
    let nivel = 0;
    let cierre = css.length;
    for (let i = abierto; i < css.length; i++) {
      if (css[i] === '{') nivel++;
      else if (css[i] === '}' && --nivel === 0) {
        cierre = i;
        break;
      }
    }
    const lineaDe = (offset: number) => css.slice(0, offset).split('\n').length;
    rangos.push([lineaDe(m.index), lineaDe(cierre)]);
    for (const d of css.slice(abierto + 1, cierre).matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)) {
      declarados.add(d[1]);
    }
  }
  return {
    declarados,
    raiz: (linea) => rangos.some(([a, b]) => linea >= a && linea <= b),
  };
}

/* ── Detectores: funciones puras sobre un trozo de código ───────────────────
   Puras a propósito. Un detector que solo existe metido dentro del `expect` no
   se puede probar con una violación inyectada, que es la mitad del trabajo de
   este archivo. Cada una devuelve la lista de ofensas con su línea, o `[]`. */

interface Ofensa {
  linea: number;
  detalle: string;
}

/** El código sin comentarios. Un comentario puede citar un color; el código no. */
const sinComentarios = (src: string): string =>
  src
    /* El `[^:]` delante de `//` es lo que salva a las URLs: sin él, un
       `https://` dentro de una cadena se comería el resto de la línea. */
    .replace(/\/\*[\s\S]*?\*\//g, (bloque) => bloque.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** R1: un color escrito a mano. Se mira la LÍNEA COMPLETA.
 *
 *  Y dos excepciones, y las dos son de FORMA y no de nombre.
 *
 *  La primera: un literal dentro de un conjunto de comparación o de un patrón
 *  no es un color usado en pantalla, es un color QUE ESTÁ BUSCANDO.
 *  `DesignAuditor.tsx` tiene que escribir `#fff` y `#000` en un `new Set`
 *  para poder detectar que alguien los escribió en un `style`, y R1 los
 *  contaba como offense suyos. Es la clase de deuda que este archivo vino a
 *  matar: una excepción por NOMBRE de archivo se lee como "esto no se mira", y
 *  en un mes el archivo tiene tres colores más y nadie lo nota. La forma no
 *  tiene ese problema: sigue mirando todo, y lo único que salta es la línea
 *  que declara una lista de valores. */
const ES_DECLARACION_DE_VALORES =
  /new\s+(Set|Map)\s*\(|\/\s*\[|new\s+RegExp\(|\bRe\.|\/\^?\[/;

/**
 * Una PALETA DE CANVAS: el color que se le pasa a un `CanvasRenderingContext2D`.
 *
 * Y esto no es una exención por gusto: es una exención por una limitación del
 * navegador, y por eso es la ÚNICA que no se puede cerrar con un token.
 *
 * `ctx.fillStyle`, `ctx.strokeStyle` y `gradient.addColorStop()` toman un color
 * CSS YA RESUELTO. No resuelven `var()`: escribirles un token produce un valor
 * inválido, el contexto lo descarta en silencio y conserva el anterior, así que
 * el color no cambia y además se rompe el dibujo sin decir nada. Lo mismo pasa
 * con el `StyleSheet` de `@react-pdf/renderer`, que se serializa a un PDF donde
 * un token CSS no viaja.
 *
 * O sea: la alternativa a un literal acá NO es un token, es un literal en otro
 * lado. Por eso lo que se exige, en vez de perdonar, es que el color esté en una
 * PALETA CON NOMBRE —`CIELO`, `SOL`, `LUNA`, `FIGURITA`— declarada una vez en el
 * archivo, y no repartido en el `fillStyle` de cada función.
 *
 * La forma del marcador es lo que hace que no sea una lista de archivos: se
 * reconoce un `const NOMBRE = {` cuya primera línea de valor es un color, y una
 * línea de dibujo (`ctx.` o `addColorStop`). Un archivo que empiece a dibujar su
 * UI en un canvas entra en la excepción sin que nadie la nombre, y un archivo
 * que agregue un color suelto FUERA de una paleta con nombre sigue en rojo. La
 * guarda de abajo mide las dos cosas.
 */
const ES_ASIGNACION_DE_CANVAS = /^\s*(?:const|let|var)\s+[A-Z][A-Z0-9_]*\s*(?::[^=]+)?=\s*\{\s*$/;
const ES_LINEA_DE_CANVAS = /\bctx\.[a-zA-Z]+\s*=|addColorStop\s*\(/;
/* El RESPALDO de una lectura de token: el segundo argumento de una llamada que
   lee el token de la hoja con `getComputedStyle`. Es un literal por necesidad —
   el argumento ES el valor por si la hoja no está cargada— y va con el nombre
   del token al lado, que es lo que lo hace legible. La forma que se reconoce es
   la llamada, no el archivo: un `getPropertyValue('--x')` con un color al lado
   cuenta, y el color solo no. */
const ES_RESPALDO_DE_TOKEN = /getPropertyValue\s*\(|leerToken\s*\(/;

function coloresLiterales(codigo: string): Ofensa[] {
  const COLOR =
    /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|\brgba?\(|\bhsla?\(|\boklch\(|\bcolor-mix\(/g;
  const lineas = codigo.split('\n');
  const salida: Ofensa[] = [];
  const abrePaleta = lineas.map((l) => ES_ASIGNACION_DE_CANVAS.test(l));
  /* Dentro de una paleta: -1 es "afuera". Al abrir una vale 0, y la primera
     línea de valor ya cuenta — por eso el incremento va DESPUÉS de mirar. */
  let dentroDePaleta = -1;
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    if (abrePaleta[i]) dentroDePaleta = 0;
    const esValorDePaleta =
      dentroDePaleta >= 0 && /^\s*[a-zA-Z0-9_]+\s*:\s*[^:]/.test(linea);
    /* Una línea en blanco NO corta la paleta: `sinComentarios` convierte un
       comentario en espacios, y una línea que solo tiene espacios no es un
       `clave: valor` — así que sin este caso, un comentario en medio de la
       paleta la hacía terminar y la línea siguiente volvía a estar en rojo. Un
       comentario explica por qué un color está ahí; no puede hacer que el color
       sea delito. */
    const esBlanca = linea.trim() === '';
    if (esValorDePaleta || esBlanca) {
      if (esValorDePaleta) dentroDePaleta++;
    } else if (!abrePaleta[i]) dentroDePaleta = -1;
    if (ES_DECLARACION_DE_VALORES.test(linea)) continue;
    if (esValorDePaleta || ES_LINEA_DE_CANVAS.test(linea)) continue;
    if (ES_RESPALDO_DE_TOKEN.test(linea)) continue;
    for (const m of linea.matchAll(COLOR)) {
      salida.push({ linea: i + 1, detalle: `color literal ${m[0]}` });
    }
  }
  return salida;
}

/** R2: `var(--token, algo)`. El fallback de un specifier en variable. */
function fallbackDeToken(codigo: string, enRaiz?: (linea: number) => boolean): Ofensa[] {
  const re = /var\(\s*--[a-z0-9-]+\s*,/gi;
  return codigo.split('\n').flatMap((linea, i) =>
    [...linea.matchAll(re)]
      .filter(() => !enRaiz || enRaiz(i + 1))
      .map((m) => ({ linea: i + 1, detalle: `fallback en ${m[0].trim()}` })),
  );
}

/**
 * R8: un token que se DECLARA a sí mismo, dentro de un bloque `:root`.
 * `--x: var(--x)` es un ciclo: CSS lo invalida en tiempo de valor calculado, así
 * que la declaración no vale —y como una declaración inválida no borra la de
 * arriba, pero sí se lleva por delante el valor en cualquier consumidor posterior
 * que la espere—. R2 no lo encuentra: un ciclo no lleva coma, así que no es un
 * fallback, y R2-bis salta las líneas de `:root` por construcción.
 *
 * Solo el ciclo DIRECTO. Un ciclo indirecto (`--a: var(--b)` con
 * `--b: var(--a)`) es legal en CSS —se resuelve como valor inicial— y queda
 * fuera de esta regla a propósito: se documenta como tal en vez de fingir que
 * se cubre.
 */
function tokensAutoDeclarados(codigo: string, enRaiz: (linea: number) => boolean): Ofensa[] {
  const salida: Ofensa[] = [];
  codigo.split('\n').forEach((linea, i) => {
    if (!enRaiz(i + 1)) return;
    const d = linea.match(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]*);/);
    if (!d) return;
    const usa = new RegExp(`var\\(\\s*${d[1]}\\s*[,)]`).test(d[2]);
    if (usa) salida.push({ linea: i + 1, detalle: `${d[1]} se declara a sí mismo (ciclo)` });
  });
  return salida;
}

/** Los tokens que el código usa. */
function tokensUsados(codigo: string): Set<string> {
  const usados = new Set<string>();
  for (const m of codigo.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) usados.add(m[1]);
  return usados;
}

/** R3: los tokens que el código usa y la hoja NO declara. */
function tokensSinDeclarar(codigo: string, declarados: Set<string>): string[] {
  return [...tokensUsados(codigo)].filter((t) => !declarados.has(t));
}

/**
 * R2-bis: un `var(--token)` SECO, fuera de todo bloque `:root`, de un token que
 * ningún `:root` declara. Fuera de `:root` el fallback sí es el valor de la
 * regla; lo que no tiene arreglo es un token seco que no existe: no tiene valor
 * en claro ni en oscuro, y en oscuro es una caja sin borde.
 */
function tokensSecosFueraDeRaiz(
  codigo: string,
  declarados: Set<string>,
  enRaiz: (linea: number) => boolean,
): Ofensa[] {
  const salida: Ofensa[] = [];
  codigo.split('\n').forEach((linea, i) => {
    if (enRaiz(i + 1)) return;
    /* SECO = el specifier cierra sin fallback. `var(--a, var(--b))` tiene el
       `--b` seco y el `--a` con valor: los dos se miran por separado. */
    for (const m of linea.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/g)) {
      if (!declarados.has(m[1])) {
        salida.push({ linea: i + 1, detalle: `${m[1]} sin declarar y sin fallback` });
      }
    }
  });
  return salida;
}

/** R4: un radio de borde que no viene de `--radius-*`. */
function radiosLiterales(codigo: string): Ofensa[] {
  const formas = [
    /borderRadius:\s*'([^']*)'/g,
    /borderRadius:\s*"([^"]*)"/g,
    /* El número pelado también: `borderRadius: 8` es tan literal como
       `borderRadius: '8px'`, y en JSX sale solo cuando alguien copia el valor
       de un `border-radius` de CSS. */
    /borderRadius:\s*([0-9.]+)\s*[,}]/g,
    /border-radius:\s*([^;}\n]+)/g,
  ];
  const salida: Ofensa[] = [];
  codigo.split('\n').forEach((linea, i) => {
    for (const re of formas) {
      for (const m of linea.matchAll(re)) {
        if (!/^\s*var\(\s*--radius-/.test(m[1])) {
          salida.push({ linea: i + 1, detalle: `radio literal ${m[1].trim()}` });
        }
      }
    }
  });
  return salida;
}

/** R5: un grosor de icono distinto del token `--icon-stroke`. */
function grosoresDistintos(codigo: string, valorDelToken: number): Ofensa[] {
  const salida: Ofensa[] = [];
  codigo.split('\n').forEach((linea, i) => {
    for (const m of linea.matchAll(/strokeWidth\s*=\s*\{?\s*["']?([\d.]+)/g)) {
      if (Number(m[1]) !== valorDelToken) {
        salida.push({
          linea: i + 1,
          detalle: `strokeWidth ${m[1]} ≠ --icon-stroke ${valorDelToken}`,
        });
      }
    }
  });
  return salida;
}

/**
 * R6: un `<svg>` escrito a mano donde debía haber un icono de lucide-react.
 *
 * Y el "donde debía" es toda la regla, porque no todos los `<svg>` son iconos.
 * Los doce que quedan en el alcance son ILUSTRACIONES: el logo de la app, la
 * mascota, las cuatro miniaturas de plantilla APA y el anillo de "listo". Un
 * logo no viene de lucide —lucide no tiene logos— y una ilustración declara su
 * propio grosor a propósito, que es justo lo que un icono tiene que hacer con
 * `--icon-stroke`.
 *
 * La diferencia se mira por la FORMA del elemento, no por el nombre del
 * archivo: un icono de lucide se usa así, `<Algo size={14} />`, y su equivalente
 * a mano es un `viewBox="0 0 24 24"` con `stroke="currentColor"` y sin nombre
 * propio. Una ilustración se identifica por un `viewBox` que no es el 24 de
 * lucide, o por un `className` o un `aria-label` que la identifican. La
 * excepción es por MARCA y no por una lista de archivos: una lista es una
 * exención que en tres meses tiene veinte archivos más y nadie la vuelve a
 * mirar, que es exactamente el modo de morir que este archivo lleva veinte
 * pruebas documentando.
 */
function svgsAMano(codigo: string): Ofensa[] {
  const lineas = codigo.split('\n');
  const salida: Ofensa[] = [];
  for (let i = 0; i < lineas.length; i++) {
    if (!/<svg[\s>]/.test(lineas[i])) continue;
    /* El HEAD del elemento: del `<svg` hasta el primer `>`, que es donde viven
       los atributos. Un `viewBox` puede estar dos líneas más abajo y es lo que
       dice de qué tamaño es el dibujo, así que mirar solo la línea no alcanza. */
    const head = lineas.slice(i).join('\n').split('>')[0];
    if (esIlustracion(head)) continue;
    salida.push({
      linea: i + 1,
      detalle: 'svg a mano: un icono viene de lucide-react, no se dibuja',
    });
  }
  return salida;
}

const esIlustracion = (head: string): boolean => {
  const viewBox = head.match(/viewBox\s*=\s*["']([^"']*)["']/)?.[1].trim();
  return (
    /className\s*=/.test(head) ||
    /aria-(label|hidden)\s*=/.test(head) ||
    (viewBox !== undefined && viewBox !== '0 0 24 24')
  );
};

/** Los `<svg>` que R6 EXIMIÓ, para poder mirarlos sin abrir los archivos. */
function svgsIlustrados(codigo: string): { linea: number; motivo: string }[] {
  const lineas = codigo.split('\n');
  const salida: { linea: number; motivo: string }[] = [];
  for (let i = 0; i < lineas.length; i++) {
    if (!/<svg[\s>]/.test(lineas[i])) continue;
    const head = lineas.slice(i).join('\n').split('>')[0];
    if (!esIlustracion(head)) continue;
    const viewBox = head.match(/viewBox\s*=\s*["']([^"']*)["']/)?.[1].trim();
    if (/className\s*=/.test(head)) salida.push({ linea: i + 1, motivo: 'className' });
    else if (/aria-(label|hidden)\s*=/.test(head)) salida.push({ linea: i + 1, motivo: 'aria' });
    else if (viewBox !== undefined) salida.push({ linea: i + 1, motivo: `viewBox ${viewBox}` });
  }
  return salida;
}

/* ── Lectura del disco ─────────────────────────────────────────────────────── */

let rutas: string[] = [];
/** El alcance de las DIEZ reglas. Antes eran dos listas: `rutas` para cinco
 *  reglas y esta para R3. Ya no: la deuda se pagó y las dos se fundieron. */
let ALCANCE: string[] = [];
/** El texto CRUDO de este mismo archivo, para la guarda que lo vigila a sí mismo. */
let fuenteDePropio = '';
let declarados = new Set<string>();
let enRaizDeHoja = (_linea: number): boolean => true;
let grosorDeIcono = 0;
let hoja = '';
/** R9: toda hoja de `src/styles` que no sea la canónica, por nombre. */
let otrasHojas: Record<string, string> = {};
let bloquesDeTema: Record<string, string> = {};
let fuenteDe = (_ruta: string): string => '';

beforeAll(async () => {
  const { readdirSync, readFileSync, statSync } = await import(/* @vite-ignore */ NODE_FS);
  const { join, resolve } = await import(/* @vite-ignore */ NODE_PATH);
  const { fileURLToPath } = await import(/* @vite-ignore */ NODE_URL);
  const raiz = resolve(fileURLToPath(import.meta.url).replace(/[^/\\]+$/, ''), '..');

  const recorrer = (dir: string): string[] => {
    const salida: string[] = [];
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) salida.push(...recorrer(ruta));
      else if (/\.tsx?$/.test(nombre)) salida.push(ruta);
    }
    return salida;
  };

  /* Un archivo renombrado hace que `readFileSync` lance y la prueba falle con
     su nombre: el alcance no puede encogerse en silencio. */
  rutas = [
    ...DIRECTORIOS.flatMap((d) => recorrer(join(raiz, d))),
    ...ARCHIVOS.map((a) => join(raiz, a)),
  ].sort();
  /* `ALCANCE` es el alcance de las DIEZ reglas. Antes eran dos listas —`rutas`
     para cinco reglas y `ALCANCE` para R3— porque las cinco de color tenían
     543 ofensas medidas y una cuenta por ARCHIVO y por REGLA comparada con
     `===` ponía el lint en rojo cada vez que alguien tocaba un archivo que ya
     estaba en deuda. Ese era el motivo real de la cuenta, y estaba bien: un
     lint que grita tanto que nadie lo escucha es un lint muerto.

     La deuda se pagó, así que la cuenta se fue con ella. Y sin cuenta, el
     problema que la justificaba ya no existe: una regla en cero no puede
     volverse brittle. Las dos listas se funden en una. */
  ALCANCE = [
    ...DIRECTORIOS.flatMap((d) => recorrer(join(raiz, d))),
    ...DIRECTORIOS_R3.flatMap((d) => recorrer(join(raiz, d))),
    ...ARCHIVOS.map((a) => join(raiz, a)),
  ].sort();
  fuenteDe = (ruta) => readFileSync(ruta, 'utf8');

  hoja = readFileSync(join(raiz, HOJA), 'utf8');
  /* Este mismo archivo, crudo. La guarda de "la deuda no puede volver" tiene
     que mirar el TEXTO donde vive la declaración, no una constante del módulo:
     una constante se puede editar en la misma línea que la verifica, que es la
     forma más común de que una prueba se vuelva tautológica sin que nadie lo
     note. */
  fuenteDePropio = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  /* La hoja se lee SIN comentarios, como el código: un comentario puede citar un
     hex o un `var(--x, 8px)` para explicar una decisión, y leerlo como si fuera
     una declaración es exactamente la asimetría que R1 evita en el código. */
  hoja = sinComentarios(hoja);
  /* Declarado = una línea que DECLARA un token dentro de un bloque `:root`.
     `--text-tertiary` sale dentro del valor de `--text-secondary` y eso no es
     una declaración; un `--x:` dentro de `.wa-bubble` es un custom property de
     esa regla, tampoco. */
  ({ declarados, raiz: enRaizDeHoja } = analizarHoja(hoja));
  grosorDeIcono = Number(hoja.match(/--icon-stroke\s*:\s*([^;]+);/)?.[1].trim());

  /* R9: el resto de las hojas de `src/styles`. Se listan por nombre para que una
     hoja NUEVA con literales sea un archivo más en la lista, y no un forgot. */
  otrasHojas = {};
  for (const nombre of readdirSync(join(raiz, DIR_HOJAS))) {
    if (!nombre.endsWith('.css')) continue;
    const relativa = `${DIR_HOJAS}/${nombre}`;
    if (relativa === HOJA) continue;
    otrasHojas[relativa] = sinComentarios(readFileSync(join(raiz, relativa), 'utf8'));
  }

  /* R7 necesita los dos temas POR SEPARADO: un token puede estar bien en claro
     y haber cambiado en oscuro, que es lo que no puede pasar con la hoja. Los
     bloques se toman por su selector, no por posición. */
  const bloque = (selector: RegExp): string => {
    const desde = hoja.search(selector);
    if (desde < 0) return '';
    const abierto = hoja.indexOf('{', desde);
    let nivel = 0;
    for (let i = abierto; i < hoja.length; i++) {
      if (hoja[i] === '{') nivel++;
      else if (hoja[i] === '}' && --nivel === 0) return hoja.slice(abierto + 1, i);
    }
    return '';
  };
  bloquesDeTema = {
    claro: bloque(/^:root,\s*$/m) || bloque(/^:root\s*\{/m),
    oscuro: bloque(/^:root\[data-theme="dark"\]/m),
  };
});

/* ── Las reglas, sobre el archivo real ─────────────────────────────────────── */

const nombreDe = (ruta: string): string => ruta.split(/[\\/]/).pop() || ruta;

/* La ruta RELATIVA a `src`, que es la clave de `DEUDA_R3`. Un archivo con
   ruta absoluta sería una deuda que nadie puede pagar. */
const claveDe = (ruta: string): string =>
  ruta
    .replace(/\\/g, '/')
    .replace(/^.*?\/src\//, '')
    .replace(/\.tsx?$/, '');

/** Corre un detector sobre un alcance y devuelve una lista legible. */
const comoTextoSobre = (alcance: string[], regla: (codigo: string) => Ofensa[]): string[] =>
  alcance.flatMap((ruta) =>
    regla(sinComentarios(fuenteDe(ruta))).map(
      (o) => `${nombreDe(ruta)}:${o.linea} ${o.detalle}`,
    ),
  );

/** Corre un detector sobre el alcance COMPLETO: los doce directorios.
 *
 *  Antes esta función recorría solo `rutas` y las cinco reglas de color medían
 *  la deuda con una cuenta aparte. Ahora recorren lo mismo que R3, y no hay
 *  cuenta: la deuda se pagó y un literal nuevo rompe la prueba en el momento. */
const comoTexto = (regla: (codigo: string) => Ofensa[]): string[] =>
  comoTextoSobre(ALCANCE, regla);

describe('T20 — el lint de tokens del rediseño', () => {
  it('el alcance existe: sin archivos, estas reglas no mirarían nada', () => {
    /* La guarda que este proyecto necesitó nueve veces. Un alcance que se vacía
       —un directorio renombrado, una lista mal escrita— haría que las reglas
       siguientes PASARAN sin haber leído una línea. */
    expect(rutas.length).toBeGreaterThanOrEqual(20);
    const nombres = rutas.map(nombreDe);
    /* Los que el rediseño creó, para que un archivo nuevo caiga dentro sin que
       nadie tenga que acordarse de añadirlo a una lista. */
    for (const esperado of [
      'ReviewGate.tsx',
      'RevisionRoom.tsx',
      'RevisionDetail.tsx',
      'AiRoom.tsx',
      'AiDashboard.tsx',
      'FocusReadingCard.tsx',
      'ReadingText.tsx',
      'IconRail.tsx',
      'RailFlyout.tsx',
      'AppShell.tsx',
      'useReviewWorkbench.ts',
      'usePageIndex.ts',
      'ExportView.tsx',
      'CoverCarouselStudio.tsx',
    ]) {
      expect(nombres, `${esperado} no está en el alcance del lint`).toContain(esperado);
    }
  });

  it('el alcance de las diez reglas son los doce directorios, y de verdad', () => {
    /* La Fase 1 sumó siete directorios y dejó las cinco reglas de color
       midiendo su deuda aparte, con una cuenta. Hoy las diez miran lo mismo.

       La guarda de vacuidad de arriba dice que el alcance no puede vaciarse;
       esta dice lo contrario: que no puede ACHICAR en silencio, que es la otra
       mitad del mismo problema. Si `DIRECTORIOS_R3` se vaciara, las diez reglas
       pasarían a mirar menos que antes sin que nada se pusiera rojo — y ahora
       que la deuda está pagada, achicar el alcance ya no es "no molestar a
       quien toca un archivo en deuda": es dejar de mirar, y punto. */
    expect(ALCANCE.length).toBeGreaterThan(rutas.length);
    for (const dir of DIRECTORIOS_R3) {
      expect(ALCANCE.some((r) => claveDe(r).startsWith(dir)), dir + ' no llegó al alcance').toBe(true);
    }
  });

  it('R1 — ningún color literal en el código del rediseño', () => {
    expect(comoTexto(coloresLiterales)).toEqual([]);
  });

  it('R1 — la excepcion del canvas no se comio la regla', () => {
    /* La guarda de la guarda, y la que más importa de las tres.

       R1 perdona un color si la línea ES una operación de dibujo (`ctx.` o
       `addColorStop(`) o si está dentro de una paleta con nombre. Las dos cosas
       son excepciones, y una excepción sin guardia es una puerta abierta: un
       archivo podría escribir su UI entera en un canvas y quedaría fuera de la
       regla sin que nadie lo nombrara.

       Lo que mide esta prueba es que la excepción siga siendo CHICA y que cada
       archivo que la usa se nombre de a uno. Si un archivo nuevo empieza a
       dibujar su interfaz en un canvas, el nombre aparece en el rojo y esta
       prueba lo dice: que es la forma en que una excepción avisa antes de ser
       un agujero. */
    const conCanvas = ALCANCE.filter((r) => /getContext\(\s*['"]2d['"]/.test(fuenteDe(r)));
    expect(
      conCanvas.map(nombreDe),
      'la excepcion de canvas se esta comiendo el alcance: un archivo que dibuja entra sin que nadie lo nombre',
    ).toEqual(['HomeHero.tsx', 'LoadingTips.tsx', 'PDFPreview.tsx', 'PdfRestLayer.tsx']);
    /* Y que un color suelto FUERA de una paleta y de una línea de dibujo siga
       en rojo: es el agujero que la excepción abre. */
    expect(coloresLiterales("const s = { color: '#4f7cff' }")).toHaveLength(1);
    /* La paleta tiene que abrir en su propia línea, como la abre `HomeHero`. */
    expect(
      coloresLiterales(['const CIELO = {', "  cielo: '#4f7cff',", '};'].join('\n')),
    ).toHaveLength(0);
    expect(coloresLiterales("ctx.fillStyle = '#4f7cff';")).toHaveLength(0);
    /* Y que la paleta se pueda usar para esconder un literal suelto: la paleta
       tiene que seguir siendo un objeto de clave: valor. Lo que NO se perdona es
       un literal en una línea que no es ni valor de paleta ni de dibujo. */
    expect(
      coloresLiterales(['const PALETA = {', "  a: '#4f7cff',", '};', "const otro = '#4f7cff';"].join('\n')),
    ).toHaveLength(1);
  });

  it('R2 — ningún specifier en variable con fallback', () => {
    expect(comoTexto(fallbackDeToken)).toEqual([]);
    /* Y en la hoja, DENTRO de un bloque :root: ahí la ley es la de un token, y su
       valor no puede ser el valor de esta regla porque la regla es la del token.
       Ojo: esto NO cubre el auto-referenciado —x: var(x) no lleva coma, así que no
       es un fallback y no aparece aquí. Eso es R8. */
    expect(fallbackDeToken(hoja, enRaizDeHoja)).toEqual([]);
  });

  it('R4 — el radio de borde solo sale de --radius-*', () => {
    /* Y que el alcance use radios por token, para que el for de abajo tenga algo
       que mirar y no sea una regla que nunca encuentra nada. */
    expect(rutas.some((r) => /var\(\s*--radius-/.test(fuenteDe(r)))).toBe(true);
    expect(comoTexto(radiosLiterales)).toEqual([]);
  });

  it('R5 — strokeWidth es el valor de --icon-stroke', () => {
    /* El token se resuelve contra la hoja real, no contra un 1.75 copiado. */
    expect(grosorDeIcono).toBe(1.75);
    expect(comoTexto((c) => grosoresDistintos(c, grosorDeIcono))).toEqual([]);
  });

  it('R6 — los iconos vienen de lucide-react, no de un svg a mano', () => {
    expect(comoTexto(svgsAMano)).toEqual([]);
  });

  it('R6 — la excepcion de las ilustraciones no se comio la regla', () => {
    /* La guarda de la guarda. R6 perdona un `<svg>` con `className`, con
       `aria-label` o con un `viewBox` que no es el de lucide, y eso es una
       excepción: las excepciones son el mecanismo por el que un lint se muere,
       y este archivo lleva veinte pruebas documentando por qué.

       El agujero concreto es este: un archivo podría empezar a dibujar ICONOS
       dentro de un `<svg className="lo-que-sea">` y la regla lo perdona sin
       mirar. Esta prueba mide las dos cosas que la mantienen chica: que las
       ilustraciones que quedan son pocas, y que ninguna se identifica con el
       `viewBox` de lucide — porque un svg con `viewBox="0 0 24 24"` dibujado a
       mano ES un icono, y por eso no puede contar como ilustración. */
    const ilustrados = ALCANCE.flatMap((ruta) =>
      svgsIlustrados(sinComentarios(fuenteDe(ruta))).map(
        (s) => `${nombreDe(ruta)}:${s.linea} (${s.motivo})`,
      ),
    );
    /* 20 ilustraciones reales (2026-10-04): las seis fichas esquematicas de
       `InspectorActivoTabs` (48x34), las once de `ImageEditPanel` (siete 48x34 y
       cuatro 36x24), el sello de `DownloadSuccessOverlay` (34x34), la mascota
       editorial y el mapa de estructura. Cuando `components/figures` entro al
       alcance de R3, esas fichas dejaron de ser invisibles y la cuenta llego a 20.
       El tope sube a 24 y NO es una lista de excepciones: la prueba de abajo
       —ningun svg con el viewBox de lucide— es la que impide que la excepcion se
       coma un icono dibujado a mano. */
    expect(ilustrados.length, 'demasiadas ilustraciones: R6 dejaria de mirar').toBeLessThan(24);
    const suspectas = ilustrados.filter((s) => s.includes('viewBox 0 0 24 24'));
    expect(
      suspectas,
      `svg con el viewBox de lucide dibujado a mano: ${suspectas.join(', ')}`,
    ).toEqual([]);
  });

  /* ── El mecanismo de la DEUDA, YA NO EXISTE ──
     Antes aquí había dos pruebas: una que comparaba la deuda medida contra
     `DEUDA_MEDIDA` con igualdad estricta, y una guarda que exigía que esa deuda
     NO estuviera vacía. Las dos se van, y la segunda es la que importa.

     Lo que las reemplaza es la idea de que "una cuenta vacía es una cuenta que
     no vigila nada": si `DEUDA_MEDIDA` se hubiera puesto en cero sin que nadie
     pagara, `deudaSinPagar` compararía cero contra cero y pasaría verde sin
     haber leído una línea. La guarda de "no vacía" era la que impedía eso.

     Cuando la deuda es CERO DE VERDAD —y ahora lo es— esa guarda se INVIERTE:
     no se exige que la cuenta esté viva, se exige que el MECANISMO no exista.
     Reintroducir `DEUDA_MEDIDA`, aunque sea con un número chico y bienintencionado,
     es el error: sería una lista de excepciones disfrazada de cuenta, y volvería
     a ser el lugar donde un color nuevo se esconde. Esta prueba falla si el
     nombre vuelve a declararse. */
  it('la carpeta de figuras esta en el alcance de R3', () => {
    /* Una carpeta nueva fuera de la lista es una carpeta donde un color literal
       no rompe nada. El lint tiene que crecer CON el alcance, no al reves: por eso
       esto es una prueba y no una linea de codigo. Un alcance que se encoge no se
       nota, y un alcance que nunca crece deja de mirar justo el codigo nuevo. */
    expect(DIRECTORIOS_R3).toContain('components/figures');
  });

  it('la deuda se PAGO: el mecanismo de la cuenta no puede volver', () => {
    /* El aviso que este proyecto necesito nueve veces, y la novena vez dice lo
       contrario de las ocho anteriores. Las ocho primeras eran "el alcance no
       puede vaciarse" y "la cuenta no puede vaciarse"; esta es "la cuenta no
       puede VOLVER". Un archivo que declara `DEUDA_MEDIDA` otra vez, aunque sea
       con un numero chico y bienintencionado, esta diciendo que hay oficios que
       no se miran, y eso es exactamente lo que este lint vino a matar.

       Y se lee a si mismo con `readFileSync` sobre su propia URL, que es la
       unica forma de que una prueba sobre su propio texto no dependa de una
       constante que alguien pueda editar en la misma linea que la verifica. */
    const propio = fuenteDePropio;
    expect(propio, 'no se pudo leer este archivo').not.toBe('');
    /* El nombre puede aparecer en un COMENTARIO —este lo nombra para explicar
       por que no existe— pero no puede aparecer declarando nada. Un
       `const DEUDA_MEDIDA` o un `DEUDA_MEDIDA =` es el mecanismo vuelto. */
    const declaraciones = [...propio.matchAll(/^\s*(?:const|let|var)?\s*DEUDA_MEDIDA\b\s*[:=]/gm)];
    expect(
      declaraciones.map((m) => m[0].trim()),
      'volvio a declararse una cuenta de deuda de color: la deuda se pago y una cuenta en cero es una cuenta que no vigila nada',
    ).toEqual([]);
    /* Y que la lectura sirva: si el patrón se rompiera, la prueba pasaría por
       no haber leído. Este archivo nombra `DEUDA_MEDIDA` en varios comentarios,
       así que el nombre tiene que aparecer. */
    expect(propio).toContain('DEUDA_MEDIDA');
  });

  it('R2-bis — fuera de :root, un token sin declarar tiene que traer su valor', () => {
    /* La mitad de la hoja son reglas de selector, y ahí un `var(--x, valor)` es
       un literal con un token por delante. Lo que no puede pasar es un
       `var(--x)` SECO que la hoja no declara en ningún `:root`: eso no tiene
       valor en ningún tema. Es el defecto de la clase "el token no existe", del
       lado de la hoja. */
    const offenses = tokensSecosFueraDeRaiz(hoja, declarados, enRaizDeHoja);
    /* Que no se vacíe: si la hoja no tuviera usos fuera de `:root`, la regla no
       estaría mirando nada. */
    const usosFueraDeRaiz = hoja
      .split('\n')
      .flatMap((linea, i) => (enRaizDeHoja(i + 1) ? [] : [...linea.matchAll(/var\(\s*--[a-z0-9-]+/g)]))
      .length;
    expect(usosFueraDeRaiz).toBeGreaterThan(50);
    expect(offenses).toEqual([]);
  });

  it('R3 — cada token que se usa está declarado en design-system.css', () => {
    /* La ÚNICA de las diez reglas cuyo alcance creció en la Fase 1, y creció
       para entrar en CERO. `ALCANCE` incluye los siete directorios nuevos además
       del alcance viejo, así que esta prueba mira 40 archivos más que antes y no
       acepta ninguno con un token inexistente. */
    const sinDeclarar: string[] = [];
    let total = 0;
    for (const ruta of ALCANCE) {
      /* El MISMO texto para contar y para juzgar: si el conteo pasa por
         `sinComentarios` y el juicio por el fuente crudo, un token citado en un
         comentario cuenta como uso y falla la regla —la asimetría que R1 evita
         al revés, y que hace que la guarda de vacuidad proteja de nada. */
      const codigo = sinComentarios(fuenteDe(ruta));
      const usados = tokensUsados(codigo);
      total += usados.size;
      for (const token of tokensSinDeclarar(codigo, declarados)) {
        sinDeclarar.push(`${nombreDe(ruta)}: ${token}`);
      }
    }
    /* Que no se vacíe: si nadie usara tokens, la regla pasaría por nada. */
    expect(total).toBeGreaterThan(20);
    expect(sinDeclarar).toEqual([]);
  });

  it('R4 — el alcance sigue usando radios por token, o la regla no miraría nada', () => {
    /* La guarda de vacuidad de R4: la regla mide radios literales, y si nadie
       usara radios por token la cuenta de deuda no probaría nada. */
    expect(rutas.some((r) => /var\(\s*--radius-/.test(fuenteDe(r)))).toBe(true);
  });

  it('R5 — el token del grosor del icono se resuelve contra la hoja real', () => {
    /* No contra un 1.75 copiado: si la hoja cambia el token, esto cambia con
       él en vez de quedar mirando un número escrito a mano. */
    expect(grosorDeIcono).toBe(1.75);
  });

  it('R7 — la hoja de papel es la misma en claro y en oscuro', () => {
    /* `--paper-white: #ffffff` y `--paper-ink: #111827` en los DOS temas. El
       papel no se oscurece: es la fidelidad de la norma, no una preferencia. */
    expect(Object.keys(bloquesDeTema)).toEqual(['claro', 'oscuro']);
    for (const [tema, bloque] of Object.entries(bloquesDeTema)) {
      expect(bloque, `no se encontró el bloque :root del tema ${tema}`).not.toBe('');
      expect(bloque, `--paper-white del tema ${tema}`).toMatch(/--paper-white:\s*#ffffff\s*;/);
      expect(bloque, `--paper-ink del tema ${tema}`).toMatch(/--paper-ink:\s*#111827\s*;/);
    }
  });

  it('R8 — ningún token se declara a sí mismo', () => {
    /* Un ciclo es inválido en tiempo de valor calculado: la declaración es
       inválida y todo `var(--x)` que dependa de ella se queda sin valor, sin
       error y sin aviso. Aquí se encontraron DOS vivos, y uno (`--shadow-card`)
       pisaba la declaración válida de arriba. */
    const ciclos = tokensAutoDeclarados(hoja, enRaizDeHoja);
    expect(ciclos).toEqual([]);
    /* Que no se vacíe: si `enRaiz` fallara y no mirara nada, esto pasaría. */
    expect([...declarados].length).toBeGreaterThan(80);
  });

  it('R9 — el veto al color literal también es para las hojas de estilo', () => {
    /* `design-system.css` es la única hoja donde un hex puede definir un token.
       Cualquier otra hoja de `src/styles` con literales es una-infacción de la
       MISMA regla, y una segunda hoja viva con hex es justo lo que hace que un
       token "canónico" deje de serlo.

       La deuda que ya existe NO se perdona con una lista de exenciones —que es
       como un lint de tokens se muere— sino con una cuenta FIJADA y POR NOMBRE:
       una hoja nueva con literales es un archivo más en la lista y rompe la
       prueba; un literal nuevo en una hoja existente mueve la cuenta y rompe la
       prueba; y cuando alguien salde la deuda, la cuenta baja y hay que
       actualizar el número aquí, que es el recordatorio de hacerlo. */
    const conColor = Object.entries(otrasHojas)
      .map(([nombre, css]) => [nombre, coloresLiterales(css).length] as const)
      .filter(([, n]) => n > 0);
    /* La hoja tiene que existir y ser leída: si el listado se vacía, la regla
       pasa por nada. */
    expect(Object.keys(otrasHojas).length).toBeGreaterThan(0);
    expect(conColor.map(([nombre]) => nombre)).toEqual(['styles/fluent.css']);
    expect(conColor[0][1]).toBe(DEUDA_FLUENT_CSS);
  });
});

/* ── El detector contra violaciones inyectadas ────────────────────────────────
   Cada detector se pasa un trozo que lo viola y uno que no. Un detector que solo
   se puede probar con el archivo real no demuestra que dispare: puede estar
   mirando otra cosa y dar verde por casualidad. */

const LIMPIO = [
  "const s = { color: 'var(--color-accent)', borderRadius: 'var(--radius-md)' };",
  'const w = { gap: "var(--space-1)" };',
].join('\n');

describe('T20 — el detector se enciende con una violación y se calla sin ella', () => {
  it('R1: un hex en una línea que YA trae un token también es delito', () => {
    /* El agujero del brief: se saltaba la línea entera si tenía un `var(--`.
       Aquí la misma línea, con el token y el hex, tiene que reportar el hex. */
    expect(coloresLiterales(LIMPIO)).toEqual([]);
    expect(coloresLiterales("const s = { color: 'var(--color-accent)', borderColor: '#4f7cff' };").map((o) => o.detalle))
      .toEqual(['color literal #4f7cff']);
    expect(coloresLiterales("const s = { boxShadow: '0 1px 2px rgba(0,0,0,0.1)' };")).toHaveLength(1);
    expect(coloresLiterales("const s = { backgroundColor: 'var(--paper-white)' };")).toEqual([]);
  });

  it('R1: un comentario puede citar el color; el código no', () => {
    const comentado = '/* el token y el acento son el mismo azul (#4f7cff) */\n' + LIMPIO;
    expect(coloresLiterales(sinComentarios(comentado))).toEqual([]);
  });

  it('R2: el fallback se ve aunque el token exista', () => {
    /* El caso de `RailFlyout`: `--space-1` existe y vale 4px, y el fallback
       decía 8px. El detector no necesita preguntar si el token existe. */
    expect(declarados.has('--space-1')).toBe(true);
    expect(fallbackDeToken(LIMPIO)).toEqual([]);
    expect(fallbackDeToken("gap: 'var(--space-1, 8px)'")).toHaveLength(1);
    expect(fallbackDeToken("border: '1px solid var(--border-strong, var(--color-border-subtle))'")).toHaveLength(1);
    expect(fallbackDeToken("fuente: 'var(--font-sans, system-ui, sans-serif)'")).toHaveLength(1);
  });

  it('R2-bis: dentro de :root el fallback está prohibido; fuera es el valor', () => {
    /* La hoja sintética que separa los dos casos. `--marca: var(--x, 8px)` dentro
       de `:root` es un token; el mismo `var(--x, valor)` dentro de `.wa` es un
       literal con un token por delante, y por eso ahí el fallback se NECESITA. */
    const css = [
      ':root {', // 1
      '  --color-accent: #4f7cff;', // 2
      '  --marca: var(--space-1, 8px);', // 3
      '}', // 4
      '.wa {', // 5
      '  background: var(--surface-elevated, #ffffff);', // 6
      '  color: var(--text-main);', // 7
      '  border-radius: var(--radius-md, 8px);', // 8
      '}', // 9
    ].join('\n');
    const falsa = analizarHoja(css);
    expect(falsa.raiz(2)).toBe(true);
    expect(falsa.raiz(6)).toBe(false);
    /* Dentro de `:root`: un solo fallback, el de la línea 3. */
    expect(fallbackDeToken(css, falsa.raiz).map((o) => o.linea)).toEqual([3]);
    /* Fuera de `:root`: los de las líneas 6 y 8 son el valor de la regla. */
    expect(fallbackDeToken(css, (l) => !falsa.raiz(l)).map((o) => o.linea)).toEqual([6, 8]);
    /* Y lo que no se perdona en ningún sitio: el `var(--text-main)` SECO de la
       línea 7, con `--text-main` sin declarar en ningún `:root`. */
    expect(tokensSecosFueraDeRaiz(css, falsa.declarados, falsa.raiz).map((o) => o.linea)).toEqual([7]);
    /* Con el token declarado, la misma línea deja de ser delito. */
    const conToken = css.replace('  --color-accent: #4f7cff;', '  --color-accent: #4f7cff;\n  --text-main: #1a1a2e;');
    expect(tokensSecosFueraDeRaiz(conToken, analizarHoja(conToken).declarados, analizarHoja(conToken).raiz))
      .toEqual([]);
  });

  it('R3: un token que no existe se reporta, uno que existe no', () => {
    /* El caso del minimapa: `--color-text-tertiary` está declarado;
       `--text-tertiary` sale dentro del valor de otro token y no existe. Un
       patrón que lo diera por definido aprobaría un `var(--x-typo)`. */
    expect(declarados.has('--color-text-tertiary')).toBe(true);
    expect(declarados.has('--text-tertiary')).toBe(false);
    expect(tokensSinDeclarar("color: 'var(--color-text-tertiary)'", declarados)).toEqual([]);
    expect(tokensSinDeclarar("color: 'var(--color-minimapa-que-no-existe)'", declarados)).toEqual([
      '--color-minimapa-que-no-existe',
    ]);
  });

  it('R4: un radio literal se ve; un token de radio, no', () => {
    expect(radiosLiterales(LIMPIO)).toEqual([]);
    expect(radiosLiterales("borderRadius: '4px'")[0].detalle).toBe('radio literal 4px');
    expect(radiosLiterales('border-radius: 12px;')).toHaveLength(1);
    expect(radiosLiterales("borderRadius: 'var(--radius-full)'")).toEqual([]);
  });

  it('R5: cualquier grosor distinto del token se ve', () => {
    expect(grosoresDistintos(LIMPIO, 1.75)).toEqual([]);
    expect(grosoresDistintos('<Check strokeWidth={2} />', 1.75)).toHaveLength(1);
    expect(grosoresDistintos('<Check strokeWidth="3" />', 1.75)).toHaveLength(1);
    expect(grosoresDistintos('<Check strokeWidth={1.75} />', 1.75)).toEqual([]);
  });

  it('R6: un <svg> a mano se ve aunque su grosor sea el correcto', () => {
    /* El grosor correcto no salva el icono: lo que se vigila es de dónde sale,
       y un svg a mano puede cambiarlo sin que nadie lo note. */
    expect(svgsAMano('<Check size={14} strokeWidth={1.75} />')).toEqual([]);
    expect(svgsAMano('<svg width="14" height="14" strokeWidth="2">')).toHaveLength(1);
  });

  it('R8: el ciclo se ve aunque no haya coma, y no se ve fuera de :root', () => {
    /* El caso que R2 no podía ver: `var(--x)` sin coma no es un fallback. Este
       es el defecto que apareció en la hoja, y el que más daño hacía: */
    const css = [
      ':root {', // 1
      '  --color-accent: #4f7cff;', // 2
      '  --shadow-card: 0 8px 28px rgba(0, 0, 0, 0.12);', // 3
      '  --titlebar-bg: var(--titlebar-bg);', // 4  <- el ciclo
      '  --acento: var(--color-accent);', // 5  <- alias sano
      '}', // 6
      '.btn {', // 7
      '  --local: var(--local);', // 8  (ciclo en un custom property, no es token)
      '  color: var(--acento);', // 9
      '}', // 10
    ].join('\n');
    const h = analizarHoja(css);
    /* R2 no lo ve: sin coma no es fallback. Esta es la demostración del hueco. */
    expect(fallbackDeToken(css, h.raiz)).toEqual([]);
    /* R8 sí: solo la línea 4, porque es la única que se declara en `:root`. */
    expect(tokensAutoDeclarados(css, h.raiz).map((o) => o.linea)).toEqual([4]);
    expect(tokensAutoDeclarados(css, h.raiz)[0].detalle).toBe(
      '--titlebar-bg se declara a sí mismo (ciclo)',
    );
    /* Y el alias sano no se toca: un token que apunte a OTRO no es un ciclo. */
    expect(h.declarados.has('--acento')).toBe(true);
  });

  it('R9: el mismo color literal es delito en una hoja que no es la canónica', () => {
    /* La regla es la de R1 aplicada a las hojas: en `design-system.css` un hex
       define un token, y en ninguna otra hoja un hex no define nada. */
    const conColor = 'a { color: #4f7cff; }';
    expect(coloresLiterales(conColor)).toHaveLength(1);
    expect(coloresLiterales(sinComentarios('/* #4f7cff es el acento */\na { color: var(--color-accent); }')))
      .toEqual([]);
    /* Una hoja nueva con literales no se cuela: el listado la nombra. */
    expect(Object.keys(otrasHojas)).toContain('styles/fluent.css');
  });

  it('R4: un radio numérico también es literal', () => {
    /* `borderRadius: 8` sale solo cuando alguien pega el valor de un
       `border-radius` de CSS en un estilo de React, y es tan literal como
       `borderRadius: '8px'`. */
    expect(radiosLiterales("const s = { borderRadius: 8, color: 'red' };")).toHaveLength(1);
    expect(radiosLiterales("const s = { borderRadius: 8 }")).toHaveLength(1);
    expect(radiosLiterales("const s = { borderRadius: 1.5, color: 'red' };")).toHaveLength(1);
    expect(radiosLiterales("const s = { borderRadius: 'var(--radius-sm)' };")).toEqual([]);
  });
});
