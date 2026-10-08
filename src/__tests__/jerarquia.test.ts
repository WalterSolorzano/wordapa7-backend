/**
 * La jerarquía: qué capítulos tiene el documento, y cómo se llaman.
 *
 * El defecto que este archivo viene a cerrar es de NOMBRE, no de navegación. La
 * clave de fase se calculaba con una coincidencia EXACTA contra los rótulos del
 * vocabulario, así que "1. Introducción", "CAPÍTULO 2: MARCO TEÓRICO" y
 * "Metodología de la investigación" caían las tres en `sin_fase`. Y era peor que
 * un nombre feo: el filtro de fase usa la misma clave, o sea que todos los
 * capítulos numerados de una tesis —el caso normal— se fundían en un solo
 * bloque. Para un redactor, la pantalla no decía nada.
 *
 * Y el otro sentido de la palabra "nombre": un H2 que dice "Resultados" a secas
 * es una fase mal nivelada y hay que promoverla; uno que dice "Resultados de la
 * encuesta" lleva un calificador que avisa de que el autor quiso decir algo
 * concreto, y hay que dejarlo quieto. Un motor que promueve los dos es peor que
 * uno que no promueve ninguno.
 */

import { describe, it, expect } from 'vitest';
import { construirJerarquia, crearVocabulario, faseDeTitulo, preambuloDe } from '../lib/jerarquia';
import type { ElementModel } from '../types';

/* Los helpers usan el shape REAL de `ElementModel` (`src/types/index.ts:121`), no
 * un recorte inventado: un headed que no compila no es un headed, es una
 * promesa. El `id` es un contador porque el árbol necesita una clave estable por
 * nodo y un título repetido ("Resultados" dos veces) tiene que ser dos nodos. */
let secuencia = 0;
const id = (): string => `e${++secuencia}`;

const el = (o: Partial<ElementModel> & { type: ElementModel['type']; text: string }): ElementModel =>
  ({
    id: id(),
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
    cita_ids: [],
    needs_review: false,
    auto_applied: false,
    ...o,
  }) as ElementModel;

const h1 = (titulo: string): ElementModel =>
  el({ type: 'heading', heading_level: 1, text: titulo, is_bold: true });
const h2 = (titulo: string): ElementModel =>
  el({ type: 'heading', heading_level: 2, text: titulo, is_bold: true });
const h3 = (titulo: string): ElementModel =>
  el({ type: 'heading', heading_level: 3, text: titulo, is_bold: true });
const parrafo = (texto: string): ElementModel => el({ type: 'paragraph', text: texto });
const figura = (pie: string): ElementModel =>
  el({ type: 'image', text: pie, image_info: { element_id: 'x', file_path: 'a.png', filename: 'a.png' } as never });
const tabla = (pie: string): ElementModel => el({ type: 'table', text: pie });
/** Una cita es un párrafo con `cita_ids`: así es como viajan en el modelo. */
const cita = (texto: string): ElementModel => el({ type: 'paragraph', text: texto, cita_ids: ['c1'] });

describe('faseDeTitulo', () => {
  it('un H1 numerado abre su fase, no "Seccion sin nombre"', () => {
    /* El defecto: el match era EXACTO contra los rótulos del vocabulario, así que
     * "1. Introduccion" caía en sin_fase. Y el filtro de fase usa la misma clave,
     * o sea que todos los capítulos numerados se fundían en un bloque. */
    expect(faseDeTitulo('1. Introducción', false)).toBe('introduccion');
    expect(faseDeTitulo('CAPÍTULO 2: MARCO TEÓRICO', false)).toBe('marco_teorico');
  });

  it('un H1 con sufijo sigue abriendo su fase', () => {
    /* El título del caso normal en una tesis, con el capítulo escrito a mano.
     *
     * Y ACÁ ESTÁ EL HUECO QUE DEJO EL PLAN, declarado en vez de escondido: el
     * plan daba por hecho que "Metodología de la investigación" abría la fase
     * `metodo` desde el frontend, y no puede. El backend sí lo sabe —la tupla
     * `titles` de `PhaseConfig` en `python/modules/phase_scope.py:75` contiene
     * literalmente "metodologia de la investigacion"— pero esa tupla NO viaja:
     * el frontend solo tiene `PHASE_LABELS`, que es un rótulo por fase
     * ("Metodo"), y no el vocabulario de alias. Con un rótulo por fase esta
     * función no contesta sin escribir la lista de alias en TypeScript, que
     * sería la sexta copia de la tabla que `phase_scope` ya posee.
     *
     * Los dos casos siguientes son el AGUJAJO del hueco: con el espejo local no
     * hay fase, y con el vocabulario completo que traería el backend sí. Cuando
     * exista el endpoint que exponga `PHASES`, la costura ya está escrita y el
     * resto de la superficie F3 deja de depender de adivinar. Ver el reporte. */
    expect(faseDeTitulo('Metodología de la investigación', false)).toBeNull();
    expect(faseDeTitulo('1. Metodología', false)).toBeNull();
    const delBackend = crearVocabulario([
      { key: 'metodo', label: 'Metodo', titles: ['metodo', 'metodologia', 'metodologia de la investigacion'] },
    ]);
    expect(faseDeTitulo('Metodología de la investigación', false, delBackend)).toBe('metodo');
    expect(faseDeTitulo('1. Metodología', false, delBackend)).toBe('metodo');
    /* Y lo que SÍ se resuelve con el espejo, para que el hueco sea de los alias
     * y no de la regla: un título con un calificador sigue abriendo su fase. */
    expect(faseDeTitulo('Resultados de la encuesta', false)).toBe('resultados');
    expect(faseDeTitulo('Marco de referencia', false)).toBeNull();
  });

  it('en modo estricto, un H2 mal nivelado se distingue de uno deliberado', () => {
    /* El segundo caso tiene calificador: el autor quiso decir algo concreto. */
    expect(faseDeTitulo('Resultados', true)).toBe('resultados');
    expect(faseDeTitulo('Resultados de la encuesta', true)).toBeNull();
  });

  it('el prefijo de numeración no esconde el error de nivel', () => {
    /* "1.1 Resultados" sigue siendo un H2 que dice "Resultados" a secas: quitar
     * el prefijo es parte de normalizar, no una forma de perdonar el nivel. */
    expect(faseDeTitulo('1.1 Resultados', true)).toBe('resultados');
    expect(faseDeTitulo('1.1 Resultados de la encuesta', true)).toBeNull();
  });

  it('un título que no abre ninguna fase devuelve null, no un nombre inventado', () => {
    expect(faseDeTitulo('Agradecimientos', false)).toBeNull();
  });

  it('la comparación es por palabra completa, no por subcadena', () => {
    /* "Introducciones" no es la fase Introducción: es otra sección. Con
     * subcadena, un plural abriría una fase que el backend no abre. */
    expect(faseDeTitulo('Introducciones', false)).toBeNull();
    expect(faseDeTitulo('Introducción', false)).toBe('introduccion');
  });
});

/**
 * LA MISMA REGLA QUE EN PYTHON, Y LA MISMA TABLA.
 *
 * `match_phase` de `python/modules/phase_scope.py` y `faseDeTitulo` de acá
 * tienen que decir lo mismo: son dos copias de una regla, y cuando no coinciden
 * el síntoma no es un título mal leído sino que el mosaico de la revisión dice
 * una fase y el auditor otra, con el usuario mirando las dos a la vez.
 *
 * La tabla de acá es la MISMA de `python/tests/test_phase_scope.py::_PARIDAD`,
 * título por título, y la misma respuesta. Si un lado cambia y el otro no, uno
 * de los dos se pone rojo.
 *
 * LO QUE AÚN DIVERGE Y ESTÁ DECLARADO: los alias. El backend tiene la tupla
 * `titles` de cada fase ("metodologia", "antecedentes", "metodologia de la
 * investigacion") y el espejo local tiene un rótulo por fase, así que
 * "1.1 Antecedentes" da `marco_teorico` en Python y `null` acá. Eso no es un
 * regex roto: es el vocabulario que no viaja, y se cierra con el endpoint que
 * expone `PHASES`, no escribiendo la lista en TypeScript, que sería la sexta
 * copia de una tabla que es de otro.
 */
const PARIDAD: [string, string | null][] = [
  ['1. Introducción', 'introduccion'],
  ['CAPÍTULO 2: MARCO TEÓRICO', 'marco_teorico'],
  ['Capítulo 3. Discusión', 'discusion'],
  ['Sección 3: Resultados', 'resultados'],
  ['Unidad 2: Conclusiones', 'conclusiones'],
  ['IV. METODO', 'metodo'],
  ['Resultados de la encuesta', 'resultados'],
  ['Seccion de resultados', null],
  ['Introducciones', null],
  ['Agradecimientos', null],
];

/** Los tres que dependen de un alias que no viaja, y acá dan `null`. */
const SOLO_ALIAS = [
  '1.1 Antecedentes',
  'Parte 1. Metodología',
  'Metodología de la investigación',
];

describe('paridad con el backend', () => {
  it('la tabla de prefijos dice lo mismo que match_phase', () => {
    /* "CAPÍTULO 2: MARCO TEÓRICO" es la fila que ABIÓ la divergencia: acá
       resolvía y el auditor devolvía `None`, porque `_CHAPTER_PREFIX` no
       aceptaba el dígito ni los dos puntos. Arreglado de un lado, esta tabla es
       la que se pone roja si el otro lado vuelve. */
    for (const [titulo, esperado] of PARIDAD) {
      expect(faseDeTitulo(titulo, false), titulo).toBe(esperado);
    }
  });

  it('la divergencia que queda son los alias, y son tres', () => {
    /* No es un test de compatibilidad: es el RECUENTO de lo que todavía no
       viaja. Si uno de estos deja de dar `null` sin que exista el vocabulario
       completo, alguien escribió una copia local de la tabla de alias. */
    for (const titulo of SOLO_ALIAS) {
      expect(faseDeTitulo(titulo, false), titulo).toBeNull();
    }
  });
});

describe('construirJerarquia', () => {
  it('arma un arbol H1 > H2 > H3 y cuenta palabras por rama', () => {
    const arbol = construirJerarquia([
      h1('1. Introducción'),
      parrafo('Quince palabras aqui en el primer capitulo'),
      h2('1.1 Antecedentes'),
      parrafo('Otros quince palabras de antecedentes del trabajo'),
      h3('1.1.1 Uno'),
      parrafo('Detalle de la subseccion uno con sus palabras'),
      h1('2. Metodología'),
      parrafo('Quince palabras del capitulo de metodologia'),
    ]);
    const raices = arbol.filter((n) => n.nivel === 1);
    expect(raices).toHaveLength(2);
    expect(raices[0].palabras).toBeGreaterThan(0);
    expect(raices[0].hijos[0].hijos[0].titulo).toBe('1.1.1 Uno');
  });

  it('el conteo de palabras SUBE: la rama incluye lo que tiene debajo', () => {
    /* Un resumen de la rama que no incluye a los nietos es un resumen de la
     * rama equivocada, y el balance comparativo deja de significar nada. */
    const arbol = construirJerarquia([
      h1('1. Introducción'),
      parrafo('cero uno dos tres cuatro cinco seis siete ocho'),
      h2('1.1 Antecedentes'),
      parrafo('nueve diez once doce trece catorce quince dieciseis'),
    ]);
    expect(arbol[0].palabras).toBe(17);
    expect(arbol[0].hijos[0].palabras).toBe(8);
  });

  it('las viñetas de un H2 son del H2, y el H1 las cuenta a través de él', () => {
    /* El caso reportado: una rama «Objetivos» con dos H2, y el contenido de cada
     * uno (un párrafo y una lista). El contenido cuelga del ÚLTIMO encabezado
     * abierto, así que un H2 no queda vacío por tener prosa de otro nivel: queda
     * vacío SOLO si su prosa va antes. Y el H1 no tiene texto propio: su número
     * es la suma de sus H2, que es lo que un índice tiene que mostrar. Si esto se
     * rompe —un `bullet` que no cuenta, o un H2 que no se reconoce como padre—,
     * la rama Objetivos vuelve a mostrar todo en el H1 y los H2 en cero. */
    const arbol = construirJerarquia([
      h1('Objetivos'),
      h2('Objetivo general'),
      parrafo('Analizar el proceso productivo'),
      h2('Objetivos específicos'),
      el({ type: 'bullet', text: 'Identificar los tiempos muertos' }),
      el({ type: 'numbered_list', text: 'Proponer mejoras con el metodo SCEM' }),
    ]);

    expect(arbol).toHaveLength(1);
    const objetivos = arbol[0];
    expect(objetivos.hijos.map((h) => h.titulo)).toEqual([
      'Objetivo general',
      'Objetivos específicos',
    ]);

    const [general, especificos] = objetivos.hijos;
    expect(general.palabras).toBe(4);       // «Analizar el proceso productivo»
    expect(especificos.palabras).toBe(10);  // la viñeta (4) + la numerada (6)
    expect(objetivos.palabras).toBe(14);    // el H1 suma a sus H2
  });

  it('el texto del encabezado NO cuenta como contenido de su rama', () => {
    /* El título es el rótulo de la rama, no lo que hay adentro: contarlo
     * infla el balance de los capítulos de títulos largos y deja sin poder decir
     * que un capítulo existe pero está vacío. */
    const arbol = construirJerarquia([h1('1. Un título bastante largo de verdad')]);
    expect(arbol[0].palabras).toBe(0);
  });

  it('antes del primer H1 no hay raiz, y el preámbulo queda en su campo', () => {
    /* El ámbito antes del primer H1 es `portada`. Si eso se cuela como raíz, el
     * índice muestra la portada como si fuera un capítulo. */
    const elementos = [parrafo('Texto suelto antes de cualquier encabezado')];
    expect(construirJerarquia(elementos)).toHaveLength(0);
    expect(preambuloDe(elementos)).toEqual({ elementos: 1, palabras: 6 });
  });

  it('el preámbulo existe y se dice, aunque no sea un capítulo', () => {
    /* Existen pero no son un capítulo, y una pantalla que finge que el
     * documento empieza en el primer H1 muestra menos texto del que hay. */
    const elementos = [
      parrafo('uno dos tres cuatro cinco'),
      parrafo('seis siete ocho'),
      h1('1. Introducción'),
      parrafo('nueve diez'),
    ];
    expect(construirJerarquia(elementos)).toHaveLength(1);
    expect(preambuloDe(elementos)).toEqual({ elementos: 2, palabras: 8 });
  });

  it('una cita y una figura cuelgan del nodo correcto, no del primero', () => {
    const arbol = construirJerarquia([
      h1('1. Introducción'),
      figura('Figura 1. Diagrama del proceso'),
      h1('2. Método'),
      cita('(García, 2019)'),
    ]);
    expect(arbol[0].figuras).toBe(1);
    expect(arbol[0].citas).toBe(0);
    expect(arbol[1].citas).toBe(1);
    expect(arbol[1].figuras).toBe(0);
  });

  it('las tablas se cuentan aparte de las figuras', () => {
    const arbol = construirJerarquia([h1('1. Método'), tabla('Tabla 1. Muestra'), figura('Figura 1')]);
    expect(arbol[0].tablas).toBe(1);
    expect(arbol[0].figuras).toBe(1);
  });

  it('un H2 hereda la fase de su H1 y NO abre la suya', () => {
    /* `AGENTS.md` §1: un H2 hereda el ámbito de su H1 ancestro. El árbol lo dice
     * con el mismo atributo, así que una superficie nueva no tiene que saber
     * recorrer ancestros para pintar a qué fase pertenece algo.
     *
     * Y la fase del H1 entra como dato del BACKEND, que es de donde sale en la
     * app: `AuditItem.phase` ya la calculó `match_phase` contra el vocabulario
     * completo. "Metodología" no abre fase con el espejo local —que trae un
     * rótulo por fase, "Metodo", y no el alias "metodologia"—, y por eso la
     * columna de fases conocidas va explícita acá en vez de fingir que el
     * frontend adivina. Ver el hueco documentado en `faseDeTitulo`. */
    const cap = h1('1. Metodología');
    const arbol = construirJerarquia([cap, h2('1.1 Instrumentos')], { [cap.id]: 'metodo' });
    expect(arbol[0].fase).toBe('metodo');
    expect(arbol[0].hijos[0].fase).toBe('metodo');
  });

  it('un H1 que no abre fase tiene fase null, no una fase inventada', () => {
    const arbol = construirJerarquia([h1('1. Marco de la encuesta en el norte')]);
    expect(arbol[0].fase).toBeNull();
    /* El TÍTULO se conserva entero: el nombre que ve la persona es el que ella
     * escribió, no el de la fase. */
    expect(arbol[0].titulo).toBe('1. Marco de la encuesta en el norte');
  });

  it('la fase que ya calculó el backend gana sobre la del título', () => {
    /* El backend manda porque es el que corrió `match_phase` sobre el
     * vocabulario COMPLETO. Un título con alias que el frontend no conoce llega
     * con su fase puesta, y el índice no depende de adivinar. */
    const cap = h1('1. Metodología de la investigación');
    const arbol = construirJerarquia([cap], { [cap.id]: 'metodo' });
    expect(arbol).toHaveLength(1);
    expect(arbol[0].fase).toBe('metodo');
  });

  it('dos capítulos que abren la MISMA fase son dos nodos', () => {
    /* Con la fase como CLAVE de agrupación se fundían en silencio y el mapa no
     * distinguía uno de otro. Con el árbol, la fase es un atributo y cada
     * encabezado es su nodo. */
    const arbol = construirJerarquia([h1('1. Resultados'), h1('2. Resultados del piloto')]);
    expect(arbol).toHaveLength(2);
    expect(arbol[0].fase).toBe('resultados');
    expect(arbol[1].fase).toBe('resultados');
    expect(arbol[0].id).not.toBe(arbol[1].id);
  });

  it('la portada no es un capítulo: lo anterior al primer H1 no cuelga de nadie', () => {
    const arbol = construirJerarquia([
      parrafo('portada'),
      h1('1. Introducción'),
      parrafo('cuerpo'),
    ]);
    expect(arbol[0].palabras).toBe(1);
  });

  it('un salto de nivel cuelga del último nodo, sin inventar un padre', () => {
    /* Un H3 sin H2 es un defecto del documento, y el índice tiene que poder
     * MOSTRARLO: si el árbol lo repara por su cuenta, el defecto
     * desaparece de la pantalla. El nivel sale tal cual. */
    const arbol = construirJerarquia([h1('1. Introducción'), h3('1.0.1 Detalle'), parrafo('texto')]);
    expect(arbol[0].hijos).toHaveLength(1);
    expect(arbol[0].hijos[0].nivel).toBe(3);
  });
});
