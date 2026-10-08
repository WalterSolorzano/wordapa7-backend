/* WordAPA7 — la jerarquía del documento: qué capítulos tiene y cómo se llaman.
 *
 * QUÉ ES. El árbol de encabezados H1/H2/H3 con la cuenta de lo que cuelga de
 * cada uno. Lo usan el índice, el pulso y el inspector de rama de la F3, y es
 * la UNICA fuente de verdad de "qué es un capítulo" del frontend.
 *
 * POR QUÉ EXISTE Y NO ESTABA. La clave de fase se calculaba con una coincidencia
 * EXACTA contra los rótulos del vocabulario, así que "1. Introducción",
 * "CAPÍTULO 2: MARCO TEÓRICO" y "Metodología de la investigación" caían los tres
 * en `sin_fase`. Y era peor que un nombre feo: el filtro de fase usa la misma
 * clave, o sea que todos los capítulos numerados de una tesis —el caso normal—
 * se fundían en un solo bloque, en silencio. Para un redactor, la pantalla no
 * decía nada.
 *
 * DOS COSAS QUE ESTE ARCHIVO NO DECIDE.
 *
 * 1. El ÁMBITO no se busca en el cuerpo de un párrafo. La comparación ocurre
 *    SOLO sobre el título de un encabezado, y un H2 hereda el de su H1
 *    ancestro sin abrir ámbito propio (`AGENTS.md` §1). Antes de esta fase el
 *    ámbito se deducía con `any(kw in low_t ...)` y "meta" estaba dentro de
 *    "metodología", así que un párrafo sobre metodología disparaba la regla de
 *    objetivos. Acá no hay ninguna comparación contra texto de párrafo.
 *
 * 2. El VOCABULARIO no se reescribe. `PHASE_LABELS` es el espejo declarado del
 *    backend (`python/modules/phase_scope.py`) y trae UN rótulo por fase, no la
 *    tupla de alias. Escribir aquí la lista de alias sería la sexta copia de la
 *    tabla que el backend ya posee, así que no está escrita: lo que el frontend
 *    no puede contestar contesta `null`, que es una respuesta honesta. Cuando
 *    exista el endpoint que exponga `PHASES`, esta función recibe el
 *    vocabulario completo por parámetro y el hueco desaparece sin tocarla.
 */

import type { ElementModel } from '../types';
import { PHASE_LABELS } from './auditItems';

/* ── El nodo ──────────────────────────────────────────────────────────────── */

/**
 * Una rama del documento.
 *
 * `nivel` es el nivel REAL del encabezado (1 a 5), no un 1|2|3 recortado: el
 * índice muestra una columna que dice "qué nivel tiene este título", y mentirle
 * ahí sería el mismo defecto que esta fase viene a matar. Los H4 y H5 cuelgan
 * igual que los H3 y se ven con su número.
 */
export interface NodoJerarquia {
  /** Clave estable del nodo: el id del elemento que abre la rama. */
  id: string;
  /** El título ÍNTEGRO, tal como lo escribió el autor. Nunca se normaliza. */
  titulo: string;
  nivel: number;
  /** A qué elemento hay que saltar para llegar acá. */
  elementoId: string | null;
  /** Alias compatible con academicRules y diagramas. */
  element_id?: string | null;
  /** Palabras de prosa que cuelgan de la rama, la propia y las de abajo. */
  palabras: number;
  figuras: number;
  tablas: number;
  citas: number;
  hijos: NodoJerarquia[];
  /** La fase abierta por el H1 ancestro, o `null` si no abre ninguna. */
  fase: string | null;
}

/** Lo que hay antes del primer H1: existe, y no es un capítulo. */
export interface Preambulo {
  elementos: number;
  palabras: number;
}

/* ── El nombre de un título ────────────────────────────────────────────────── */

/** El rótulo que NO es una fase: es la ausencia de fase, y no se compara. */
const CLAVE_SIN_FASE = 'sin_fase';

/* "CAPITULO 2: MARCO TEORICO" y "Parte II Marco teorico". El grupo del medio
   acepta dígitos y romanos, y el cierre exige un separador y un espacio: sin
   eso, "Seccion de resultados" perdería la "d" de "de" —el mismo modo de fallo
   que "meta" dentro de "metodología", donde un patrón permisivo se come una
   palabra que era del título. El separador incluye los dos puntos porque
   "CAPÍTULO 2: MARCO TEÓRICO" es una forma de capítulo tan común como la otra,
   y sin él el prefijo se queda pegado y el título no abre ninguna fase. */
const PREFIJO_CAPITULO = /^\s*(?:capitulo|parte|seccion|unidad)\s+[0-9ivxlcdm]+[.):]?\s+/i;
/* "1. Introducción", "1.1 Antecedentes", "IV. METODO". El separador final es
   opcional porque un número no puede ser una palabra: "2020" es un año, no un
   título que empiece a decir "2020 años de trabajo". El romano SÍ exige
   separador, porque "Mi metodología" empieza con dos letras romanas. */
const PREFIJO_NUMERO = /^\s*\d+(?:\.\d+)*\s*[.):]?\s+/;
const PREFIJO_ROMANO = /^\s*[ivxlcdm]+\s*[.):]\s+/i;

const NO_ALNUM = /[^a-z0-9\s]+/g;
const ESPACIOS = /\s+/g;

/* El vocabulario: rótulo normalizado -> clave de fase. `PHASE_LABELS` es el
   espejo declarado del backend y trae un rótulo por fase. Se construye en la
   PRIMERA llamada, no al evaluar el módulo: `PHASE_LABELS` vive en
   `auditItems.ts`, que importa `aiPerfil.ts`, que importa este archivo; leer la
   tabla durante la evaluación encontraría el ciclo a medio inicializar. Como el
   vocabulario es un dato estable, se memoiza. */
let VOCABULARIO_LOCAL: VocabularioFases | null = null;
function vocabularioLocal(): VocabularioFases {
  if (VOCABULARIO_LOCAL) return VOCABULARIO_LOCAL;
  const m = new Map<string, string>();
  for (const clave of Object.keys(PHASE_LABELS)) {
    if (clave === CLAVE_SIN_FASE) continue;
    m.set(normalizarTitulo(clave), clave);
  }
  VOCABULARIO_LOCAL = m;
  return m;
}

/* ── El vocabulario, como dato ─────────────────────────────────────────────── */

/**
 * Una fase del backend, tal como la expone `phase_scope.PHASES`.
 *
 * `titles` es lo que el espejo local NO tiene: el backend conoce seis formas de
 * decir "Metodología" y el espejo tiene una. Sin esta forma de inyectar el
 * vocabulario completo, la única manera de que el frontend sepa que
 * "Metodología de la investigación" abre la fase `metodo` sería escribir esa
 * lista en TypeScript, que es la sexta copia de la tabla que
 * `python/modules/phase_scope.py:53` ya posee.
 */
export interface FaseDelVocabulario {
  key: string;
  label: string;
  titles?: readonly string[];
}

/** Títulos normalizados -> clave de fase. */
export type VocabularioFases = ReadonlyMap<string, string>;

/** El vocabulario completo, tal como viene del backend. */
export function crearVocabulario(fases: readonly FaseDelVocabulario[]): VocabularioFases {
  const m = new Map<string, string>();
  for (const f of fases) {
    if (f.key === CLAVE_SIN_FASE) continue;
    if (f.label) m.set(normalizarTitulo(f.label), f.key);
    for (const t of f.titles ?? []) {
      const n = normalizarTitulo(t);
      if (n) m.set(n, f.key);
    }
  }
  return m;
}

/** Minúsculas, sin diacríticos, sin puntuación y sin espacios de más. */
function normalizarTitulo(s: string): string {
  return base(s).replace(NO_ALNUM, ' ').replace(ESPACIOS, ' ').trim();
}

/**
 * La base sobre la que se comparan los prefijos: sin acentos y en minúscula.
 *
 * El orden importa: si los prefijos se buscaran sobre el texto crudo,
 * "CAPÍTULO 2: MARCO TEÓRICO" no se le quitaría el prefijo —la I lleva
 * tilde— y el capítulo caería en `sin_fase`, que es el defecto entero de esta
 * fase. Quitar el acento no cambia el título que la persona escribió: eso se
 * guarda aparte, en `NodoJerarquia.titulo`.
 */
function base(s: string): string {
  return (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/** El título sin la numeración inicial: `1.1 Antecedentes` -> `antecedentes`. */
function sinNumeracion(s: string): string {
  return base(s)
    .replace(PREFIJO_CAPITULO, ' ')
    .replace(PREFIJO_NUMERO, ' ')
    .replace(PREFIJO_ROMANO, ' ')
    .replace(ESPACIOS, ' ')
    .trim();
}

/**
 * Qué fase abre un título, o `null` si no abre ninguna.
 *
 * EL ORDEN IMPORTA: exacto primero, tolerante después. Si el tolerante fuera
 * primero, "Resultados de la encuesta" matchearía `resultados` y el H2
 * deliberado se promovería, que es el Review Focus #2: un motor que promueve
 * los dos casos es peor que uno que no promueve ninguno.
 *
 * - `estricto = false`: exacto; y si falla, se le quita la numeración y se
 *   vuelve a intentar; y si eso tampoco, se compara la PRIMERA palabra contra el
 *   vocabulario, que es lo mismo que hace la cabeza con calificador de
 *   `match_phase` del backend.
 * - `estricto = true`: SOLO la coincidencia exacta (con la numeración ya
 *   quitada, porque quitar la numeración es normalizar y no perdonar el nivel).
 *   Es la diferencia entre un H2 mal nivelado y uno que el autor puso a
 *   propósito, y es la que usa `match_phase_exact` en Python.
 *
 * `null` es una respuesta correcta y frecuente: un capítulo con nombre propio
 * del autor no abre ninguna fase, y devolverle una inventada lo metería en el
 * grupo de otro.
 *
 * `vocabulario` es el dato de entrada, no una constante interna: con el espejo
 * local (un rótulo por fase) esta función contesta `null` para "Metodología" y
 * para "Metodología de la investigación", porque el alias vive solo en Python.
 * Con el vocabulario completo del backend, que es lo que traería
 * `crearVocabulario`, contesta `metodo`. La costura está para que el endpoint no
 * obligue a escribir una lista nueva acá.
 */
export function faseDeTitulo(
  titulo: string,
  estricto: boolean,
  vocabulario: VocabularioFases = vocabularioLocal(),
): string | null {
  const crudo = sinNumeracion(titulo || '');
  if (!crudo) return null;
  const norm = normalizarTitulo(crudo);
  const exacto = vocabulario.get(norm);
  if (exacto) return exacto;
  if (estricto) return null;
  /* La cabeza: la primera palabra del título. "Resultados de la encuesta" abre
     `resultados` porque la cabeza es "Resultados" y el calificador no cambia de
     qué sección se trata. "Analisis de los resultados" NO la abre, porque la
     cabeza es "Analisis" y no está en el vocabulario: es la misma respuesta que
     da `match_phase` del backend, y por eso los dos no se contradicen. */
  const cabeza = norm.split(' ')[0];
  return vocabulario.get(cabeza) ?? null;
}

/* ── El diagnóstico de una rama ───────────────────────────────────────────── */

/**
 * El estado de salud de una rama.
 *
 * `completa` es un estado y no la ausencia de estado: una rama que no tiene
 * nada que reportar tiene que poder decirlo, y `undefined` no lo dice.
 */
export type SaludNodo = 'completa' | 'en-duda' | 'desbalanceada' | 'sin-contenido';

/**
 * La comparación entre hermanas.
 *
 * `null` cuando hay menos de dos: no es un cero ni un 100 %, es la ausencia de
 * una comparación, y es un estado de primera clase porque un documento de un
 * solo capítulo es un documento real.
 */
export interface BalanceRama {
  /** La palabra de la hermana más larga. TODAS las barras usan esta escala. */
  mayor: number;
  /** El porcentaje de cada hermana, en el orden en que se le pasaron. */
  porcentajes: number[];
  /** El título de la hermana más larga, para poder decir contra quién se mide. */
  laMasLarga: string;
}

export interface DiagnosticoRama {
  salud: SaludNodo;
  /** El motivo, EN PALABRAS. Nunca un punto de color suelto. */
  motivo: string;
  balance: BalanceRama | null;
  /** El título del encabezado sospechoso, para que la persona vea cuál. */
  tituloEnDuda: string | null;
}

/**
 * Una rama está desbalanceada cuando tiene menos de quince por ciento de su
 * hermana más larga.
 *
 * El número sale de comparar la fila con sus hermanas, no de un promedio del
 * documento: un capítulo de 80 al lado de uno de 12.000 es un problema de
 * redacción local, y un promedio global lo escondería entre los capítulos que
 * están bien.
 */
export const UMBRAL_DESBALANCE = 0.15;

/**
 * El balance de un grupo de hermanas, o `null` si no hay con qué comparar.
 *
 * La escala es la de la hermana MÁS LARGA del grupo, y no la de cada una: con
 * escala propia cada barra se llenaría y la comparación no diría nada.
 */
export function balanceDe(hermanas: readonly NodoJerarquia[]): BalanceRama | null {
  if (hermanas.length < 2) return null;
  let mayor = 0;
  let laMasLarga = '';
  for (const h of hermanas) {
    if (h.palabras > mayor) {
      mayor = h.palabras;
      laMasLarga = h.titulo;
    }
  }
  const escala = Math.max(1, mayor);
  return {
    mayor,
    porcentajes: hermanas.map((h) => (h.palabras / escala) * 100),
    laMasLarga,
  };
}

/** El encabezado de nivel 2 o más cuyo título, en modo estricto, abre una fase.
 *
 * ESTA ES LA REGLA, y sale de `match_phase_exact` del backend: un H2 que dice
 * "Resultados" a secas es una fase mal puesta; uno que dice "Resultados de la
 * encuesta" lleva un calificador que avisa de que el autor quiso decir algo
 * concreto, y se deja quieto. Promover los dos sería peor que no promover
 * ninguno.
 *
 * NUNCA se decide por heurísticas de texto —"si termina en punto raro, está en
 * duda"—: `AGENTS.md` §1 prohíbe buscar palabras en el cuerpo para decidir el
 * ámbito, porque "meta" estaba dentro de "metodología" y disparaba la regla de
 * objetivos en un párrafo que no la tenía. Acá la comparación es contra el
 * TÍTULO de un encabezado y nada más. */
export function tituloEnDuda(nodo: NodoJerarquia): string | null {
  let culpable: string | null = null;
  const visitar = (n: NodoJerarquia): void => {
    if (culpable) return;
    if (n.nivel >= 2 && faseDeTitulo(n.titulo, true)) culpable = n.titulo;
    for (const h of n.hijos) visitar(h);
  };
  visitar(nodo);
  return culpable;
}

/** El estado de una rama y el motivo, dicho en palabras. */
export function diagnosticoDe(nodo: NodoJerarquia, balance: BalanceRama | null = null): DiagnosticoRama {
  if (nodo.palabras === 0) {
    return {
      salud: 'sin-contenido',
      motivo: 'Sin contenido: el capítulo existe y no tiene nada escrito',
      balance,
      tituloEnDuda: null,
    };
  }
  const enDuda = tituloEnDuda(nodo);
  if (enDuda) {
    return {
      salud: 'en-duda',
      motivo: `En duda: el encabezado dice "${enDuda}" a secas y parece una fase mal nivelada`,
      balance,
      tituloEnDuda: enDuda,
    };
  }
  if (balance && nodo.palabras < balance.mayor * UMBRAL_DESBALANCE) {
    const pct = Math.round((nodo.palabras / Math.max(1, balance.mayor)) * 100);
    return {
      salud: 'desbalanceada',
      motivo: `Desbalanceada: ${pct} % de la rama hermana más larga`,
      balance,
      tituloEnDuda: null,
    };
  }
  return { salud: 'completa', motivo: 'Completa', balance, tituloEnDuda: null };
}

/** El estado de una rama. Atajo de `diagnosticoDe(...).salud`. */
export function saludDe(nodo: NodoJerarquia, balance: BalanceRama | null = null): SaludNodo {
  return diagnosticoDe(nodo, balance).salud;
}

/**
 * El texto del balance de una fila.
 *
 * Con una sola hermana devuelve la ausencia de comparación, DICHA. Un 100 % solo
 * es un bug esperando: parece una nota, y una rama sin comparable no tiene.
 */
export function motivoDe(nodo: NodoJerarquia, balance: BalanceRama | null): string {
  if (!balance) return 'Sin hermanas: no hay con qué comparar';
  const suyas = nodo.palabras.toLocaleString('es-ES');
  const mayor = balance.mayor.toLocaleString('es-ES');
  const pct = Math.round((nodo.palabras / Math.max(1, balance.mayor)) * 100);
  return `${suyas} palabras; la rama más larga tiene ${mayor} ("${balance.laMasLarga}"), o sea ${pct} %`;
}

/**
 * Las filas del índice, en orden, con el balance de sus hermanas ya resuelto.
 *
 * El balance se calcula ENTRE HERMANAS del mismo padre, no contra el capítulo
 * padre: un H2 y un H3 que cuelgan del mismo H1 son las dos ramas que se
 * comparan. Comparar cada hijo contra su padre haría que el índice marcara como
 * desbalanceado un resumen de un solo párrafo.
 */
export function filasDelIndice(raices: readonly NodoJerarquia[]): { nodo: NodoJerarquia; diagnostico: DiagnosticoRama; profundidad: number }[] {
  const filas: { nodo: NodoJerarquia; diagnostico: DiagnosticoRama; profundidad: number }[] = [];
  const recorrer = (hermanos: readonly NodoJerarquia[], profundidad: number): void => {
    const balance = balanceDe(hermanos);
    for (const n of hermanos) {
      filas.push({ nodo: n, diagnostico: diagnosticoDe(n, balance), profundidad });
      recorrer(n.hijos, profundidad + 1);
    }
  };
  recorrer(raices, 0);
  return filas;
}

/* ── El árbol ─────────────────────────────────────────────────────────────── */

/* Los tipos que son PROSA. Un encabezado es el rótulo de su rama, no lo que hay
   adentro: contarlo inflaría el balance de los capítulos de títulos largos y no
   dejaría decir que un capítulo existe y está vacío. Una figura y una tabla
   cuelgan con su conteo propio, que es un dato distinto del de las palabras. */
const ES_PROSA = new Set<ElementModel['type']>([
  'paragraph',
  'bullet',
  'numbered_list',
  'block_quote',
]);

const palabrasDe = (texto: string | undefined): number =>
  (texto || '').trim().split(/\s+/).filter(Boolean).length;

const esFigura = (e: ElementModel): boolean => e.type === 'image' || e.image_info != null;
const esTabla = (e: ElementModel): boolean => e.type === 'table' || e.table_info != null;

/** Fases que ya calculó el backend, por id de elemento. */
export type FasesConocidas = Readonly<Record<string, string>>;

/**
 * El árbol de encabezados del documento.
 *
 * Las palabras SUBEN: un párrafo cuenta para su rama y para todos sus
 * ancestros, porque un resumen de la rama que no incluye lo que tiene debajo
 * es un resumen de otra rama y el balance deja de significar nada.
 *
 * `faseConocida` es el atajo para cuando el backend ya calculó la fase —que es
 * lo normal en un documento con hallazgos—: entra con prioridad sobre la del
 * título, y entonces el frontend no depende de adivinar nada.
 *
 * `vocabulario` es el mismo dato que acepta `faseDeTitulo`, pasado explícito
 * para que quien monte esta superficie pueda darle el completo sin que el
 * árbol lo vuelva a buscar.
 */
export function construirJerarquia(
  elementos: readonly ElementModel[],
  faseConocida: FasesConocidas = {},
  vocabulario: VocabularioFases = vocabularioLocal(),
): NodoJerarquia[] {
  const raices: NodoJerarquia[] = [];
  /* La cadena de ancestros: el último es donde cuelga el contenido. */
  const pila: NodoJerarquia[] = [];
  let fase: string | null = null;
  let hayH1 = false;

  for (const el of elementos) {
    const nivel = el.type === 'heading' ? Math.max(1, el.heading_level ?? 1) : 0;
    if (el.type === 'heading' && nivel >= 1) {
      /* Un encabezado antes del primer H1 es parte del preámbulo, no un
         capítulo: la portada es de solo lectura y no tiene índice. */
      if (nivel === 1) {
        hayH1 = true;
        fase = faseConocida[el.id] ?? faseDeTitulo(el.text, false, vocabulario);
      } else if (!hayH1) {
        continue;
      } else {
        fase = faseConocida[el.id] ?? fase;
      }

      while (pila.length > 0 && pila[pila.length - 1].nivel >= nivel) pila.pop();
      const padre = pila[pila.length - 1] ?? null;
      const nodo: NodoJerarquia = {
        id: el.id,
        titulo: el.text || '',
        nivel,
        elementoId: el.id,
        palabras: 0,
        figuras: 0,
        tablas: 0,
        citas: 0,
        hijos: [],
        fase,
      };
      if (padre) padre.hijos.push(nodo);
      else raices.push(nodo);
      pila.push(nodo);
      continue;
    }

    const destino = pila[pila.length - 1];
    if (!destino) continue;
    if (ES_PROSA.has(el.type)) destino.palabras += palabrasDe(el.text);
    if (esFigura(el)) destino.figuras += 1;
    if (esTabla(el)) destino.tablas += 1;
    destino.citas += el.cita_ids?.length ?? 0;
  }

  subirConteos(raices);
  return raices;
}

/** Las palabras, figuras y citas de una rama, INCLUDING las de sus hijos. */
function subirConteos(nodos: NodoJerarquia[]): void {
  for (const n of nodos) {
    subirConteos(n.hijos);
    for (const h of n.hijos) {
      n.palabras += h.palabras;
      n.figuras += h.figuras;
      n.tablas += h.tablas;
      n.citas += h.citas;
    }
  }
}

/**
 * Lo que hay antes del primer H1.
 *
 * Son elementos que existen y que ninguna raíz contiene, así que el índice
 * tiene que poder decir cuántos son: una pantalla que finge que el documento
 * empieza en el primer capítulo muestra menos texto del que hay.
 */
export function preambuloDe(elementos: readonly ElementModel[]): Preambulo {
  const antes: ElementModel[] = [];
  for (const el of elementos) {
    if (el.type === 'heading' && Math.max(1, el.heading_level ?? 1) === 1) break;
    antes.push(el);
  }
  return {
    elementos: antes.length,
    palabras: antes.filter((e) => ES_PROSA.has(e.type)).reduce((n, e) => n + palabrasDe(e.text), 0),
  };
}

/** La sección que estaba abierta en un punto del documento. */
export interface SeccionVigente {
  /** El H1 vigente, o `null` antes del primer H1. */
  h1: string | null;
  /** El H2 vigente, o `null`. Un H2 hereda su H1 y no abre sección propia. */
  h2: string | null;
  /** `true` para todo lo que está antes del primer H1. */
  enPreambulo: boolean;
}

/**
 * La sección vigente en CADA posición del documento.
 *
 * POR QUÉ UN ARRAY Y NO UN MAP POR `element.id`. Los ids son `elem_N`, un índice
 * posicional que genera el backend (`src/store/slices/auditSlice.ts:150-154`):
 * insertar un párrafo arriba en Word corre TODOS los ids de abajo. Un mapa por id
 * sigue siendo correcto dentro de una pasada —se construye del mismo
 * `doc.elements` que se consulta—, pero la IDENTIDAD que la UI guarda entre
 * pasadas (`selectedElementId`, `setScrollTargetId`) no lo es: después de un
 * refresco, `elem_7` es otro elemento y todo lo que se le colgó a `elem_7` quedó
 * pegado al párrafo equivocado. Es el mismo bug del diff por `element_id` que ya
 * se corrigió recalculando.
 *
 * Un array paralelo al de `elementos` hace la cosa a prueba de refresco por
 * construcción: si los ids corren, la posición que ocupa la figura también se
 * recalcula, y no hay nada que reconciliar. `elementos[i]` y `salida[i]` son el
 * mismo elemento SIEMPRE, porque se llenaron en la misma vuelta.
 *
 * POR QUÉ VIVE ACÁ Y NO EN `figuras.ts`. El recorrido de encabezados ya existe en
 * este archivo, con la regla de que antes del primer H1 hay preámbulo y de que un
 * H3 no abre sección propia. Una segunda vuelta por los encabezados en otro lado
 * es la segunda regla, y las dos reglas se contradicen el primer día que una cambia.
 */
export function seccionesDeElementos(elementos: readonly ElementModel[]): SeccionVigente[] {
  const salida: SeccionVigente[] = [];
  let h1: string | null = null;
  let h2: string | null = null;
  for (const el of elementos) {
    if (el.type === 'heading') {
      const nivel = Math.max(1, el.heading_level ?? 1);
      if (nivel === 1) {
        h1 = (el.text || '').trim();
        h2 = null;                    // un H1 nuevo cierra el H2 anterior
      } else if (nivel === 2 && h1 !== null) {
        h2 = (el.text || '').trim();  // un H2 antes del primer H1 no abre nada
      }
    }
    salida.push({ h1, h2, enPreambulo: h1 === null });
  }
  return salida;
}
