/**
 * El mosaico de IA: cuatro escalones, área proporcional con piso, y una sola
 * fuente de verdad para los hallazgos.
 *
 * Estas reglas no son de apariencia. Cada una corrige un modo de fallo concreto
 * que un mapa de calor puede tener y que no se ven mirando la pantalla: un
 * degradado que nadie ordena, un área que miente, una lista de fases que se
 * desincroniza del backend, o dos recuentos de IA distintos en la misma app.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  construirMosaico,
  cortesPorCuartiles,
  nivelDe,
  repartirNiveles,
  columnasDeBloque,
  filasDeBloques,
  tokenDeNivel,
  type BloqueMosaico,
  type NivelIa,
} from '../lib/aiMosaic';
import type { ElementModel } from '../types';
import type { AuditItem } from '../lib/auditItems';

const el = (over: Partial<ElementModel> & { id: string; text: string }): ElementModel => ({
  type: 'paragraph',
  style_name: '',
  alignment: 'left',
  font_name: 'Times New Roman',
  font_size: 12,
  is_bold: false,
  is_italic: false,
  is_bullet: false,
  left_indent_cm: 0,
  confidence: 1,
  is_user_modified: false,
  ...over,
} as ElementModel);

const item = (over: Partial<AuditItem> & { element_id: string }): AuditItem => ({
  id: 'i1',
  category: 'ai',
  subtype: 'ai_phrase',
  severity: 'warn',
  summary: '',
  detail: '',
  originalText: '',
  pageNumber: 1,
  phase: 'metodo',
  readOnly: false,
  ...over,
} as AuditItem);

const H1 = (text: string, id: string) => el({ id, text, type: 'heading', heading_level: 1 });
const P = (id: string, phase?: string) =>
  item({ element_id: id, id: `f-${id}`, phase: phase ?? 'metodo' });

/* ── Los cuatro escalones ───────────────────────────────────────────────────── */

describe('la rampa de intensidad', () => {
  it('son cuatro escalones y solo cuatro', () => {
    /* Doce matices no se ordenan de un vistazo. Y el número de escalones es lo
       que hace que la rampa quepa en una palabra: "nivel 3 de 4" o "casi
       seguro". */
    const tokens = ([1, 2, 3, 4] as NivelIa[]).map((n) => tokenDeNivel(n));
    expect(tokens).toEqual([
      'var(--ia-nivel-1)',
      'var(--ia-nivel-2)',
      'var(--ia-nivel-3)',
      'var(--ia-nivel-4)',
    ]);
  });

  it('ningún nivel se salta: de 0 a 1 hay cuatro escalones, no cinco', () => {
    const cortes = cortesPorCuartiles([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
    const vistos = new Set<number>();
    for (let p = 0; p <= 1.0001; p += 0.01) vistos.add(nivelDe(p, cortes));
    expect([...vistos].sort()).toEqual([1, 2, 3, 4]);
  });

  it('cero es el escalón más bajo, no una alarma', () => {
    /* Una sección donde el detector no vio nada no es una advertencia. Si su
       cuadrado se viera levemente rojo, el mapa estaría mintiendo sobre la
       mitad del documento. */
    const cortes: [number, number, number] = [0.34, 0.67, 0.9];
    expect(nivelDe(0, cortes)).toBe(1);
  });

  it('los cortes son del documento, no absolutos', () => {
    /* Con cortes absolutos, el nivel 4 sería "pasó 70" y una tesis uniforme
       entera sería una alarma, que es un color que deja de significar nada.
       Por eso los cortes son cuartiles del documento. */
    const uniforme = cortesPorCuartiles([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    expect(uniforme).toEqual([0.5, 0.5, 0.5]);
  });

  it('un documento UNIFORME se lee neutro, no entero en alarma', () => {
    /* Esta es la razón de la segunda pasada de `repartirNiveles`. Con los
       cuartiles solos, todas las secciones de una tesis uniforme superan el
       corte superior y salen TODAS en nivel 4: veinte cuadros de alarma
       seguidos. El usuario lee "peligro" veinte veces y no lee nada, que es
       justo lo que se pidió evitar al decir "mucho color pero que no se vea
       cargado". */
    expect(repartirNiveles([0.5, 0.5, 0.5, 0.5, 0.5, 0.5])).toEqual([2, 2, 2, 2, 2, 2]);
    expect(repartirNiveles([0, 0, 0, 0, 0, 0])).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('el escalón 4 queda reservado a lo que se sale del resto', () => {
    /* Y sigue reservándose: si hay una sección que sí destaca, tiene que poder
       decir "aquí". El tope no es un freno a la información. */
    const conOutlier = repartirNiveles([0.05, 0.1, 0.08, 0.12, 0.1, 0.9]);
    expect(conOutlier[conOutlier.length - 1]).toBe(4);
  });

  it('un solo capítulo NO se reprime: un punto no tiene amplitud', () => {
    /* La amplitud de un solo capítulo es cero por no tener con qué compararse,
       no porque sea "igual a los demás". Caparlo escondería el único dato que
       hay, que es justo cuando el mapa importa. Con un solo bloque, "el peor
       del documento" es literalmente cierto, así que sale en el escalón 4 y el
       número impreso es el que dice cuánto —ahí está la lectura fina, y para
       eso el detalle existe. */
    expect(repartirNiveles([1])).toEqual([4]);
    expect(repartirNiveles([0.42])).toEqual([4]);
  });

  it('dos capítulos iguales SÍ se reprimen: ahí sí no hay diferencia', () => {
    expect(repartirNiveles([0.5, 0.5])).toEqual([2, 2]);
    /* Y si se diferencian, la rampa vuelve a trabajar: el apartado arriba, el
       otro más abajo. Con dos muestras los percentiles se degeneran, así que
       lo que se afirma es la ORDEN, no el escalón exacto del bajo. */
    const dos = repartirNiveles([0.2, 0.9]);
    expect(dos[1]).toBe(4);
    expect(dos[0]).toBeLessThan(dos[1]);
  });

  it('un documento sin nada marcado no inventa intensidad', () => {
    expect(nivelDe(0, cortesPorCuartiles([]))).toBe(1);
  });
});

/* ── El área ───────────────────────────────────────────────────────────────── */

describe('el área del bloque', () => {
  it('el área es proporcional a los párrafos', () => {
    /* Cuatro veces los párrafos = cuatro veces el área, y por eso el ancho es
       la raíz: si fuera lineal, el bloque grande tendría el cuádruple de
       superficie y el mapa exageraría justo donde hay más que trabajar. */
    const uno = columnasDeBloque(1, 100);
    const cuatro = columnasDeBloque(4, 100);
    expect(cuatro).toBeGreaterThan(uno);
    expect(cuatro).toBeLessThan(uno * 2.1);
  });

  it('un bloque chico tiene un piso: se ve chico pero se puede apuntar', () => {
    /* Sin el piso, una sección de un párrafo queda en cinco píxeles, que no es
       un cuadrado sino una mancha. El piso es lo que hace clicable lo chico. */
    expect(columnasDeBloque(1, 1000)).toBeGreaterThanOrEqual(1);
    expect(columnasDeBloque(1, 1000)).toBe(1);
    expect(columnasDeBloque(2, 1000)).toBe(1);
  });

  it('una sección sin párrafos no colapsa a nada', () => {
    expect(columnasDeBloque(0, 100)).toBeGreaterThanOrEqual(1);
  });

  it('nunca se pasa del máximo', () => {
    expect(columnasDeBloque(100000, 100)).toBeLessThanOrEqual(4);
  });
});

/* ── El reparto en filas ───────────────────────────────────────────────────── */

describe('el mosaico no parte bloques', () => {
  const b = (i: number, parrafos: number): BloqueMosaico => ({
    key: `k${i}`, label: `L${i}`, parrafos, marcados: 0, proporcion: 0, nivel: 1, elementId: null,
  });

  it('respeta el orden del documento', () => {
    /* Ordenar por intensidad perdería la memoria espacial de la tesis: el
       usuario tiene que reconocer "el bloque largo del medio". */
    const bloques = [b(0, 30), b(1, 1), b(2, 10), b(3, 1)];
    const filas = filasDeBloques(bloques, 12);
    expect(filas.flat()).toEqual([0, 1, 2, 3]);
  });

  it('un bloque no cae partido entre dos filas', () => {
    const bloques = [b(0, 30), b(1, 30), b(2, 30), b(3, 30), b(4, 30), b(5, 30)];
    const filas = filasDeBloques(bloques, 12);
    const todos = filas.flat();
    expect(todos.sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(new Set(todos).size).toBe(6);
  });

  it('sin bloques no hay filas', () => {
    expect(filasDeBloques([], 12)).toEqual([]);
  });
});

/* ── La tinta de la rampa ───────────────────────────────────────────────────── */

/* La hoja se lee por DENTRO, con el import dinámico que ya usan
   `designTokens.test.ts` y `noHardcodedColors.test.ts`, y NO con `?raw`.

   Y esto corrige una instrucción del plan de la F3, que decía que `readFileSync`
   no era función y que había que leer todo con `?raw`. Medido en este repo:
   `import hoja from '...css?raw'` devuelve CERO caracteres y
   `import.meta.glob('...css', { query: '?raw' })` también, porque
   `vite.config.ts` pone `css: false` y la cadena de CSS del runner devuelve la
   cadena vacía antes de que el plugin de `?raw` puedaAjarla. Con un `.tsx` el
   mismo `?raw` sí funciona, que es por eso que la guarda de la Task 5 va con
   glob. Para una hoja, el import dinámico con `@vite-ignore` es lo único que
   lee, y es la convención que ya tiene este proyecto para leerla. */
const NODE_FS = 'node:fs';
const NODE_PATH = 'node:path';
const NODE_URL = 'node:url';

let hoja = '';

/** Los tokens declarados en un bloque `:root`, como un mapa. */
function tokensDe(bloque: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const d of bloque.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) m.set(d[1], d[2].trim());
  return m;
}

/* Los dos bloques de tema, LEÍDOS en el `beforeAll` y no al cargar el módulo: la
   hoja llega después, y un `slice` calculado con la cadena vacía daría dos
   bloques vacíos que pasan todos los-formato y no miran ningún token. */
let bloqueClaro = '';
let bloqueOscuro = '';

beforeAll(async () => {
  const { readFileSync } = await import(/* @vite-ignore */ NODE_FS);
  const { resolve } = await import(/* @vite-ignore */ NODE_PATH);
  const { fileURLToPath } = await import(/* @vite-ignore */ NODE_URL);
  const testDir = fileURLToPath(import.meta.url).replace(/[^/\\]+$/, '');
  hoja = readFileSync(resolve(testDir, '../styles/design-system.css'), 'utf8');
  expect(hoja.length, 'la hoja no se pudo leer: las pruebas de la rampa no mirarían nada')
    .toBeGreaterThan(0);
  bloqueClaro = hoja.slice(hoja.indexOf(':root,'), hoja.indexOf(':root[data-theme="dark"]'));
  bloqueOscuro = hoja.slice(hoja.indexOf(':root[data-theme="dark"]'));
});

/** El valor final de un token, following la cadena de `var()`. */
function resolver(tokens: Map<string, string>, token: string): string {
  let valor = tokens.get(token) ?? '';
  for (let i = 0; i < 5; i++) {
    const ref = valor.match(/var\(\s*(--[a-z0-9-]+)\s*\)/);
    if (!ref) break;
    valor = tokens.get(ref[1]) ?? '';
  }
  return valor;
}

/** `rgba(124, 58, 237, 0.40)` -> `[124, 58, 237, 0.4]`. `#7c3aed` -> alfa 1. */
function canales(valor: string): [number, number, number, number] | null {
  const hex = valor.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = valor.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.%]+))?\s*\)$/);
  if (!rgb) return null;
  const alfa = rgb[4] === undefined ? 1 : parseFloat(rgb[4]) / (String(rgb[4]).includes('%') ? 100 : 1);
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), alfa];
}

const NIVELES = ['--ia-nivel-1', '--ia-nivel-2', '--ia-nivel-3', '--ia-nivel-4'] as const;

describe('la rampa se lee como intensidad, no como alarma', () => {
  it('los cuatro escalones son cuatro tonos DISTINTOS', () => {
    /* El defecto era una rampa monocroma, y una rampa monocroma no ordena: si
     * los cuatro se ven igual no hay escala, hay un fondo. El test falla si los
     * cuatro tienen el mismo tono, que es la forma en que una rampa deja de
     * decir qué escalón es cuál. */
    for (const [tema, bloque] of [['claro', bloqueClaro], ['oscuro', bloqueOscuro]] as const) {
      const tokens = tokensDe(bloque);
      const valores = NIVELES.map((t) => resolver(tokens, t));
      for (const v of valores) expect(v, `${tema}: un escalón sin valor`).not.toBe('');
      expect(new Set(valores).size, `${tema}: ${valores.join(' | ')}`).toBe(4);
      const canalesValidos = valores.map(canales);
      for (const c of canalesValidos) expect(c, 'un escalón no es un color').not.toBeNull();
      expect(new Set(canalesValidos.map((c) => c!.join(','))).size, `${tema}`).toBe(4);
    }
  });

  it('los cuatro son la MISMA tinta en alfa creciente, no cuatro colores', () => {
    /* Cuatro colores distintos se leen como cuatro categorías. Cuatro pasos de
     * una tinta se leen como una cantidad, que es lo que el mosaico afirma. */
    for (const [tema, bloque] of [['claro', bloqueClaro], ['oscuro', bloqueOscuro]] as const) {
      const tokens = tokensDe(bloque);
      const cs = NIVELES.map((t) => canales(resolver(tokens, t))!);
      const tintas = new Set(cs.map((c) => c.slice(0, 3).join(',')));
      expect(tintas.size, `${tema}: la rampa usa más de una tinta`).toBe(1);
      const alfas = cs.map((c) => c[3]);
      for (let i = 1; i < alfas.length; i++) {
        expect(alfas[i], `${tema}: el escalón ${i + 1} no es más marcado que el anterior`)
          .toBeGreaterThan(alfas[i - 1]);
      }
    }
  });

  it('la rampa NO es la tinta del error', () => {
    /* Cuatro tonos de rojo leen como alarma. El detector de IA es
     * probabilístico: propone, y quien decide es la persona. Un mapa donde la
     * mitad del documento está en el color del error no está midiendo
     * intensidad, está señalando un problema que no existe. */
    for (const [tema, bloque] of [['claro', bloqueClaro], ['oscuro', bloqueOscuro]] as const) {
      const tokens = tokensDe(bloque);
      const peligro = canales(resolver(tokens, '--color-danger'))!;
      for (const t of NIVELES) {
        const c = canales(resolver(tokens, t))!;
        expect(c.slice(0, 3), `${tema}: ${t} es el rojo de error`).not.toEqual(peligro.slice(0, 3));
      }
    }
  });

  it('el primer escalón es casi neutro: donde el detector no vio nada no hay alarma', () => {
    for (const [tema, bloque] of [['claro', bloqueClaro], ['oscuro', bloqueOscuro]] as const) {
      const tokens = tokensDe(bloque);
      const primero = canales(resolver(tokens, '--ia-nivel-1'))!;
      expect(primero[3], `${tema}: el escalón 1 ya no es un velo`).toBeLessThanOrEqual(0.12);
    }
  });
});

/* ── La construcción ───────────────────────────────────────────────────────── */

describe('las secciones del mosaico', () => {
  const documento = [
    H1('Portada', 'h-portada'),
    el({ id: 'p1', text: 'Título de la tesis' }),
    H1('Metodo', 'h-metodo'),
    el({ id: 'p2', text: 'Uno' }),
    el({ id: 'p3', text: 'Dos' }),
    H1('Resultados', 'h-res'),
    el({ id: 'p4', text: 'Tres' }),
    el({ id: 'p5', text: 'Cuatro' }),
  ];

  it('corta por H1 y en el orden del documento', () => {
    const m = construirMosaico(documento, []);
    expect(m.map((b) => b.label)).toEqual(['Portada', 'Metodo', 'Resultados']);
    expect(m.map((b) => b.parrafos)).toEqual([1, 2, 2]);
  });

  it('un H2 NO abre sección: hereda la de su H1', () => {
    /* La misma regla que usa todo el producto. Si el mosaico abriera por H2,
       "3.1 Instrumentos" sería un bloque propio y el mapa tendría más bloques
       que capítulos, que es donde estos mapas dejan de leerse. */
    const conH2 = [
      H1('Metodo', 'h1'),
      el({ id: 'h2', text: '3.1 Instrumentos', type: 'heading', heading_level: 2 }),
      el({ id: 'p1', text: 'Uno' }),
    ];
    expect(construirMosaico(conH2, []).map((b) => b.label)).toEqual(['Metodo']);
  });

  it('la proporción es sobre el tamaño de la sección, no sobre los hallazgos', () => {
    /* Si el denominador fuera la cantidad de hallazgos, una sección con un solo
       hallazgo en tres párrafos saldría al 100% y una con dos en treinta al
       7%: el mapa premiaría a las secciones chicas por tener menos ocasión de
       equivocarse, que es al revés de lo que sirve para corregir. */
    const m = construirMosaico(documento, [P('p2'), P('p3')]);
    const metodo = m.find((b) => b.label === 'Metodo')!;
    expect(metodo.proporcion).toBe(1);
    expect(metodo.marcados).toBe(2);
  });

  it('cuenta los párrafos con texto, no los renglones vacíos', () => {
    const conVacio = [
      H1('Metodo', 'h1'),
      el({ id: 'p1', text: 'Uno' }),
      el({ id: 'p2', text: '   ' }),
      el({ id: 'p3', text: 'Dos' }),
    ];
    expect(construirMosaico(conVacio, [])[0].parrafos).toBe(2);
  });

  it('SOLO cuenta el motor IA: la ortografía no opinará sobre la IA', () => {
    /* Si el color dijera "cuánta IA hay" y el denominador contara también
       faltas de ortografía, un bloque con muchos errores y poca IA se vería
       rojo sin que el detector de IA haya dicho nada. */
    const m = construirMosaico(documento, [
      P('p2'),
      item({ element_id: 'p3', id: 'ort', category: 'spelling', phase: 'metodo' }),
    ]);
    expect(m.find((b) => b.label === 'Metodo')!.marcados).toBe(1);
  });

  it('una sección sin marcas sale neutra, no roja', () => {
    const m = construirMosaico(documento, [P('p2')]);
    expect(m.find((b) => b.label === 'Resultados')!.proporcion).toBe(0);
    expect(m.find((b) => b.label === 'Resultados')!.nivel).toBe(1);
  });

  it('una sección sin párrafos no revienta: cero de cero es nivel 1', () => {
    const soloTitulos = [H1('Metodo', 'h1'), H1('Resultados', 'h2')];
    const m = construirMosaico(soloTitulos, []);
    for (const b of m) {
      expect(b.proporcion).toBe(0);
      expect(b.nivel).toBe(1);
    }
  });

  it('un H1 que no está en el vocabulario NO desaparece', () => {
    /* Una sección con un nombre propio del autor tiene que verse con su
       nombre genérico. Un bloque que no se ve es peor que uno con el nombre
       feo, y el mapa entero deja de cubrir el documento. */
    const raro = [H1('Marco de la encuesta en el norte', 'h1'), el({ id: 'p1', text: 'Uno' })];
    expect(construirMosaico(raro, []).map((b) => b.label)).toEqual(['Seccion sin nombre']);
  });

  it('cada bloque sabe en qué elemento empezar', () => {
    /* El clic tiene que poder llevar al lugar, no solo filtrar. */
    const m = construirMosaico(documento, []);
    expect(m.find((b) => b.label === 'Resultados')!.elementId).toBe('h-res');
  });
});

/* ── El nombre de la sección ───────────────────────────────────────────────── */

describe('el mosaico no vuelve a decidir qué título abre qué fase', () => {
  it('un H1 NUMERADO ya no sale "Seccion sin nombre"', () => {
    /* El defecto que la F3 vino a matar: el match era EXACTO contra los rótulos,
     * así que "1. Introducción" caía en sin_fase. Y el filtro de fase usa la
     * misma clave, o sea que todos los capítulos numerados de una tesis —el
     * caso normal— se fundían en un bloque sin nombre. */
    const numerado = [
      H1('1. Introducción', 'h1'),
      el({ id: 'p1', text: 'Uno' }),
      H1('2. Discusión', 'h2'),
      el({ id: 'p2', text: 'Dos' }),
    ];
    expect(construirMosaico(numerado, []).map((b) => b.key)).toEqual(['introduccion', 'discusion']);
  });

  it('un H1 con el prefijo de capítulo también abre su fase', () => {
    const conPrefijo = [
      H1('CAPÍTULO 2: MARCO TEÓRICO', 'h1'),
      el({ id: 'p1', text: 'Uno' }),
    ];
    expect(construirMosaico(conPrefijo, []).map((b) => b.key)).toEqual(['marco_teorico']);
  });

  it('DOS H1 de la misma fase son DOS bloques, no uno fundido', () => {
    /* Con la fase como clave de agrupación se perdían: el mapa no distinguía un
     * capítulo del otro y sus párrafos se contaban juntos. La fase pasó a ser un
     * atributo, y cada encabezado es su nodo. */
    const dosCapitulos = [
      H1('Resultados', 'h1'),
      el({ id: 'p1', text: 'Uno' }),
      H1('Resultados del piloto', 'h2'),
      el({ id: 'p2', text: 'Dos' }),
    ];
    const m = construirMosaico(dosCapitulos, []);
    expect(m).toHaveLength(2);
    expect(m[0].elementId).toBe('h1');
    expect(m[1].elementId).toBe('h2');
    /* Y cada uno cuenta SUS párrafos: el segundo no se lleva los del primero. */
    expect(m.map((b) => b.parrafos)).toEqual([1, 1]);
  });

  it('la fase que trajo el hallazgo manda sobre la del título', () => {
    /* `match_phase` del backend conoce el vocabulario completo y el frontend
     * no. Cuando hay un hallazgo que trae la fase, esa es el dato: volver a
     * derivarla del título es la quinta copia de la misma regla. */
    const conAlias = [
      H1('Metodología de la investigación', 'h1'),
      el({ id: 'p1', text: 'Uno' }),
    ];
    expect(construirMosaico(conAlias, []).map((b) => b.key)).toEqual(['sin_fase']);
    expect(construirMosaico(conAlias, [P('p1')]).map((b) => b.key)).toEqual(['metodo']);
  });

  it('un hallazgo de regla general no le inventa una fase a la sección', () => {
    /* `phase: null` es "regla general, sin fase". Si eso contara como una fase,
     * la primera sección del documento se pintaría con la fase de lo que se
     * halló en ella, que es justo el error de la regla general. */
    const soloReglas = [H1('Metodología', 'h1'), el({ id: 'p1', text: 'Uno' })];
    const m = construirMosaico(soloReglas, [
      item({ element_id: 'p1', id: 'g1', phase: null, category: 'ai' }),
    ]);
    expect(m.map((b) => b.key)).toEqual(['sin_fase']);
  });
});
