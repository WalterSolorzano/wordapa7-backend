/* WordAPA7 — el mosaico de IA: el documento entero como cuadritos en orden.
 *
 * QUÉ ES. Una fila de bloques, uno por sección (H1), en el orden del documento.
 * Cada bloque tiene DOS variables y ninguna más:
 *
 *   - el ÁREA es su tamaño: cuántos párrafos tiene la sección.
 *   - el COLOR es su intensidad: qué proporción de esos párrafos el detector
 *     marcó como IA.
 *   - el NÚMERO impreso es el porcentaje, y es la misma cifra que el detalle
 *     lateral muestra al abrir la sección. Un número, dos sitios, no dos
 *     métricas para lo mismo.
 *
 * POR QUÉ EL ÁREA ES PROPORCIONAL Y NO UNIFORME. Porque el problema del usuario
 * no es "dónde hay texto sospechoso" sino "corregir páginas inmensas": una
 * sección de tres párrafos al 90% y una de treinta al 40% no pesan lo mismo, y
 * con cuadrados iguales el mapa mentiría sobre dónde está el trabajo. Son dos
 * canales visuales y cada uno carga una variable DISTINTA, que es lo que
 * permite que no compitan entre sí ni con el texto.
 *
 * POR QUÉ CUATRO ESCALONES Y NO UN DEGRADADO. Doce matices no se ordenan de un
 * vistazo. Y los cortes son POR CUARTILES del documento, no absolutos: si toda
 * tu tesis es medio IA tiene que poder leerse neutra, porque el nivel 4 tiene
 * que significar "el peor de TU documento", no "pasó 70".
 *
 * Y DE DÓNDE SALE LA LISTA DE HALLAZGOS. De `auditItems`, la MISMA lista que
 * abre el workbench y que cuenta el rail. No se re-deriva nada acá: un mosaico
 * que contara la IA por su cuenta y un rail que la contara por la suya
 * acabarían mostrando dos números distintos para la misma realidad, que es
 * exactamente lo que `railPending.ts` existe para impedir.
 */

import type { ElementModel } from '../types';
import type { AuditItem } from './auditItems';
import { phaseLabel } from './auditItems';
import { faseDeTitulo } from './jerarquia';

/** Un escalón de la rampa. 1 es lo más bajo; 4 lo más alto. */
export type NivelIa = 1 | 2 | 3 | 4;

/**
 * Los tres cortes de la rampa, en fracción de 0 a 1 y de menor a mayor.
 *
 * Antes eran una constante de este archivo (P30/P60/P90) y nadie podía tocarlos:
 * la calibración era una decisión del código, no del documento. Ahora son un
 * dato —los escribe la pestaña Revisión de Ajustes y viven en localStorage— con
 * una forma de volver atrás, que es la parte que hace falta para que editar una
 * calibración sea una decisión reversible y no una trampa.
 */
export type CortesIa = [number, number, number];

/** La calibración automática: P30, P60 y P90 del PROPIO documento. */
export const CORTES_AUTOMATICOS: CortesIa = [0.3, 0.6, 0.9];

/** Dónde vive una calibración editada. Ausente = automático. */
export const LLAVE_DE_CORTES = 'wordapa7_cortes_ia';

export interface BloqueMosaico {
  /** Clave estable: la fase del backend, o `sin_fase` para lo que no está en
   *  ninguna. Es la que aplica el filtro de fase que ya existe. */
  key: string;
  label: string;
  /** Párrafos de la sección, contados en el documento. */
  parrafos: number;
  /** Párrafos que el detector de IA marcó. */
  marcados: number;
  /** `marcados / parrafos`, de 0 a 1. Es lo que decide el color. */
  proporcion: number;
  nivel: NivelIa;
  /** El elemento donde arranca la sección, para saltar ahí. */
  elementId: string | null;
}

/**
 * Los tres cortes de la rampa, como percentiles del PROPIO documento.
 *
 * No son absolutos a propósito. Con cortes fijos, una tesis corta o muy escrita
 * a mano tendría casi todo en nivel 1 y el mapa no diría nada; y una tesis muy
 * uniforme tendría todo en nivel 4, que es un color de alarma sobre el
 * documento entero y termina no significando nada. Relativos, el nivel 4
 * siempre señala el peor de ESE documento.
 *
 * P90 y no P75 para el tope. Un solo apartado —una sección que sí se sale— es
 * uno de cada diez, no uno de cada cuatro: con el cuartil superior el corte
 * caería por debajo de donde está ese apartado, ningún valor lo alcanzaría y el
 * mapa nunca podría decir "aquí", que es lo único que el escalón 4 tiene que
 * decir.
 *
 * Y son el VALOR POR DEFECTO, no el único valor: la pestaña Revisión los deja
 * escribir, y por eso `repartirNiveles` y `construirMosaico` los reciben como
 * parámetro. Editarlos cambia el mapa a una rampa ABSOLUTA —ya no "el peor de tu
 * documento" sino un porcentaje fijo—, y ese cambio es real, así que la pantalla
 * que lo ofrece lo dice y deja una forma de deshacerlo.
 */
export function cortesPorCuartiles(valores: readonly number[]): CortesIa {
  const v = valores.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return [...CORTES_AUTOMATICOS] as CortesIa;
  const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return [q(0.3), q(0.6), q(0.9)];
}

/**
 * Deja unos cortes en la FORMA que la rampa necesita: tres números de 0 a 1, de
 * menor a mayor. `null` es "automático", que no es un caso de error: es la
 * ausencia de calibración.
 *
 * Ordena porque los tres cortes son un RANGO, no tres campos sueltos: el corte
 * del nivel 2 es el más bajo de los tres, se escriba donde se escriba. Si un
 * campo de Ajustes queda descolgado, guardarlo ordenado deja la rampa
 * coherente en vez de con dos bandas vacías.
 */
export function normalizarCortes(cortes: readonly number[] | null | undefined): CortesIa | null {
  if (!cortes) return null;
  if (cortes.length !== 3) return null;
  if (!cortes.every((x) => Number.isFinite(x))) return null;
  const v = cortes
    .map((x) => Math.min(1, Math.max(0, Math.round(x * 1000) / 1000)))
    .sort((a, b) => a - b);
  return [v[0], v[1], v[2]];
}

/** La calibración guardada, o `null` si nunca se tocó. */
export function cortesDesdeTexto(bruto: string | null | undefined): CortesIa | null {
  if (!bruto) return null;
  try {
    const parsed = JSON.parse(bruto);
    return normalizarCortes(Array.isArray(parsed) ? parsed : null);
  } catch {
    return null;
  }
}

/** Un `localStorage` que no se puede escribir no es una calibración: se pierde y
 *  el store sigue teniendo la que está en memoria. */
export function leerCortesGuardados(): CortesIa | null {
  try {
    return cortesDesdeTexto(localStorage.getItem(LLAVE_DE_CORTES));
  } catch {
    return null;
  }
}

export function guardarCortes(cortes: CortesIa | null): void {
  try {
    if (cortes) localStorage.setItem(LLAVE_DE_CORTES, JSON.stringify(cortes));
    else localStorage.removeItem(LLAVE_DE_CORTES);
  } catch {
    /* sin almacenamiento la calibración vive solo en el store */
  }
}

/** Los cortes que mandan: los escritos, o los cuartiles del documento. */
export function cortesDeLaRampa(
  valores: readonly number[],
  editados: CortesIa | null | undefined,
): CortesIa {
  return editados ? ([...editados] as CortesIa) : cortesPorCuartiles(valores);
}

/**
 * Qué escalones puede alcanzar una rampa, sobre todo el recorrido de 0 a 1.
 *
 * Es la cuenta que impide que la UI diga una cosa y el mapa haga otra. Con los
 * tres cortes en 0.95, las bandas del 2 y del 3 no tienen un solo valor que las
 * alcance: el mapa sale en dos escalones, no en cuatro, y eso hay que poder
 * LEER antes de mirarlo, no descubrirlo en el documento.
 */
export function nivelesAlcanzables(cortes: CortesIa): NivelIa[] {
  const vistos = new Set<NivelIa>();
  for (let i = 0; i <= 1000; i++) vistos.add(nivelDe(i / 1000, cortes));
  return ([...vistos].sort((a, b) => a - b) as NivelIa[]);
}

/**
 * Amplitud mínima para que la rampa diga algo.
 *
 * Cinco puntos porcentuales entre la sección más limpia y la más sospechosa es
 * medio párrafo en una sección de veinte: se ve en el detalle, no en el mapa. Y
 * por debajo de eso el nivel 4 deja de ser "el peor de tu documento" y pasa a
 * ser "tu documento", que es una alarma sobre todo lo que no dice nada.
 */
const AMPLITUD_MINIMA = 0.05;

/**
 * Reparte los niveles, con la regla de que el escalón 4 es una EXCEPCIÓN.
 *
 * Sin esta segunda pasada, un documento donde todas las secciones se parecen
 * sale entero en nivel 4: los percentiles coinciden, todos los valores alcanzan
 * el corte superior, y el mapa entero queda en rojo de alarma. El usuario lee
 * "peligro" veinte veces y no lee nada, que es peor que no tener mapa — la razón
 * por la que se pidió que "mucho color" no se viera "cargado".
 *
 * La guarda mira la amplitud de TODO el documento, no la del percentil alto.
 * Medir la separación entre P75 y la mediana parece más directo, pero con un
 * apartado la mediana se queda abajo, P75 no lo alcanza y el tope mataba
 * justamente el valor que el escalón 4 existe para señalar.
 *
 * Un documento uniforme se lee neutro, que es la lectura honesta: "por aquí no
 * hay diferencia". Y con un SOLO capítulo la guarda no se aplica, porque un punto
 * no tiene amplitud —la tiene en cero por no haber nada que comparar, no porque
 * las secciones sean iguales— y caparlo escondería el único dato que hay.
 */
export function repartirNiveles(
  proporciones: readonly number[],
  editados: CortesIa | null = null,
): NivelIa[] {
  const cortes = cortesDeLaRampa(proporciones, editados);
  const niveles = proporciones.map((p) => nivelDe(p, cortes));
  if (proporciones.length < 2) return niveles;
  const amplitud = Math.max(...proporciones) - Math.min(...proporciones);
  if (amplitud < AMPLITUD_MINIMA) return niveles.map((n) => Math.min(n, 2) as NivelIa);
  return niveles;
}

export function nivelDe(proporcion: number, cortes: CortesIa): NivelIa {
  if (proporcion <= 0) return 1;
  if (proporcion >= cortes[2]) return 4;
  if (proporcion >= cortes[1]) return 3;
  if (proporcion >= cortes[0]) return 2;
  return 1;
}

/** El token del escalón. El color carga UNA variable y el resto va en texto. */
export const tokenDeNivel = (n: NivelIa): string => `var(--ia-nivel-${n})`;

/**
 * Tamaño del bloque en la retícula, en columnas.
 *
 * El mínimo es el piso que pidió el usuario: sin él, una sección de un párrafo
 * queda en un cuadrado de cinco píxeles, que no es un cuadrado sino una mancha.
 * Con el piso, un bloque chico se ve chico —que es la verdad— pero se puede
 * apuntar y hacer clic.
 *
 * `Math.sqrt` y no una proporción lineal porque el ÁREA tiene que ser
 * proporcional a los párrafos: al cuadrado de la raíz, un bloque con cuatro
 * veces los párrafos ocupa el doble de ancho y no el cuádruple de superficie.
 */
export function columnasDeBloque(parrafos: number, maxParrafos: number, minCols = 1, maxCols = 4): number {
  if (parrafos <= 0) return minCols;
  const proporcion = Math.sqrt(parrafos / Math.max(1, maxParrafos));
  const cols = Math.round(minCols + proporcion * (maxCols - minCols));
  return Math.max(minCols, Math.min(maxCols, cols));
}

/**
 * Reparte los bloques en filas, en el orden del documento, sin partir ninguno.
 *
 * El ancho del mosaico no se conoce al construir los datos —depende de la
 * ventana—, así que el corte es por filas de ancho fijo, que es lo que hace
 * cualquier retícula y no deja bloques a la mitad. La última fila se queda con
 * lo que sobre: no se rellena, porque un hueco al final es un hecho del
 * documento y un hueco inventado sería ruido.
 */
export function filasDeBloques(bloques: readonly BloqueMosaico[], colsPorFila = 12): number[][] {
  if (!bloques.length) return [];
  const maxP = bloques.reduce((m, b) => Math.max(m, b.parrafos), 0);
  const filas: number[][] = [];
  let actual: number[] = [];
  let ancho = 0;
  bloques.forEach((b, i) => {
    const anchoB = columnasDeBloque(b.parrafos, maxP);
    if (ancho + anchoB > colsPorFila && actual.length) {
      filas.push(actual);
      actual = [];
      ancho = 0;
    }
    actual.push(i);
    ancho += anchoB;
  });
  if (actual.length) filas.push(actual);
  return filas;
}

/**
 * Las secciones del documento, en orden.
 *
 * El corte lo hacen los H1, y sólo los H1: un H2 hereda el ámbito de su H1, así
 * que abrir un bloque por H2 rompería la misma regla que usa el resto del
 * producto. Antes del primer H1 hay un bloque, y es la portada.
 *
 * Se cuenta un bloque por SECCIÓN, no por hallazgo: el denominador de la
 * proporción tiene que ser el tamaño de la sección, o el mapa premiaría a las
 * secciones chicas por tener menos ocasión de equivocarse.
 */
export function construirMosaico(
  elements: readonly ElementModel[],
  items: readonly AuditItem[],
  /** La calibración editada en Ajustes. `null` = los cuartiles del documento. */
  cortes: CortesIa | null = null,
): BloqueMosaico[] {
  /* 1. Los párrafos marcados, por ELEMENTO y no por fase.
   *
   * Antes el conteo se guardaba en un mapa por fase, y eso ataba el mosaico a la
   * fase como clave: dos capítulos que abren la misma fase compartían el mismo
   * conjunto, y el mapa no distinguía uno del otro. El elemento es la clave que
   * sí es del documento, y además es la que necesita la cuenta: un bloque cuenta
   * los párrafos SUYOS que el detector marcó, no los que marcó cualquier otro
   * capítulo de la misma fase. Sólo el motor IA, porque este mosaico es de la
   * IA, y dejar que la ortografía opinara sobre la intensidad de la IA haría
   * que el color dijera una cosa y el detector otra. */
  const marcados = new Set<string>();
  for (const it of items) {
    if (it.category !== 'ai') continue;
    if (it.element_id) marcados.add(it.element_id);
  }

  /* 2. Una sección por H1, en el orden del documento.
   *
   * La fase YA NO ES LA CLAVE DE AGRUPACIÓN, que es lo que hacía que dos H1 que
   * abrían la misma fase se fundieran en silencio. Ahora la fase es un atributo
   * de la sección, y cada encabezado es el suyo.
   *
   * Y la fase de la sección la da el backend cuando hay un hallazgo que la
   * traiga: es el dato que `match_phase` ya calculó sobre el vocabulario
   * completo. Solo cuando el capítulo no tiene ningún hallazgo —una sección
   * vacía, que es justo una de las que hay que poder señalar— se recurre al
   * título, con `faseDeTitulo` de `jerarquia`, la misma función que usa el
   * índice de estructura y no una copia local. */
  const secciones: Seccion[] = [];
  const abrir = (key: string, primero: ElementModel | null): Seccion => {
    const seccion: Seccion = { key, elementos: [], primero };
    secciones.push(seccion);
    return seccion;
  };
  /* La sección que está abierta. Se abre con el PRIMER elemento: si es un H1, la
     abre él —una portada escrita como "Portada" es un H1, no un bloque previo— y
     si es contenido, ese contenido es la portada. Abrir la de portada antes de
     tiempo metía un bloque vacío al principio de todos los documentos. */
  let actual: Seccion | null = null;
  for (const el of elements) {
    if (el.type === 'heading' && el.heading_level === 1) {
      actual = abrir(faseDeSeccion(el, elements, items), el);
      continue;
    }
    if (actual === null) actual = abrir('portada', null);
    if (!actual.primero) actual.primero = el;
    actual.elementos.push(el);
  }

  /* 3. El mosaico. Una sección sin párrafos no tiene intensidad: cero de cero
   *    no es "poca IA", es "no hay nada que medir", y se ve como nivel 1. */
  const bloques: BloqueMosaico[] = [];
  for (const s of secciones) {
    const parrafos = s.elementos.filter(cuentaComoParrafo).length;
    const nMarcados = s.elementos.filter((e) => marcados.has(e.id)).length;
    bloques.push({
      key: s.key,
      /* `phaseLabel`, sin el `null` de la versión del filtro: `null` significa
         "sin filtro, todo el documento", que es la etiqueta de un chip, no el
         nombre de un bloque. Para el bloque de portada, el nombre es Portada. */
      label: phaseLabel(s.key),
      parrafos,
      marcados: nMarcados,
      proporcion: parrafos > 0 ? nMarcados / parrafos : 0,
      nivel: 1,
      elementId: s.primero?.id ?? null,
    });
  }

  const niveles = repartirNiveles(bloques.map((b) => b.proporcion), cortes);
  bloques.forEach((b, i) => { b.nivel = niveles[i]; });
  return bloques;
}

/** Un capítulo en construcción: su fase, sus elementos y el primero. */
interface Seccion {
  key: string;
  elementos: ElementModel[];
  primero: ElementModel | null;
}

/* Los valores de `AuditItem.phase` que NO son una fase. `global` es una regla
   general y `sin_fase` es la ausencia de fase, y ninguna de las dos dice a qué
   capítulo del documento pertenece un hallazgo. Es la misma regla que aplica
   `faseDeHallazgo` en `auditItems`: "no uses un valor que no significa una
   fase", que no es una tabla y por eso no se importa. */
const NO_ES_FASE = new Set(['global', 'sin_fase']);

/**
 * La fase de la sección que abre este H1.
 *
 * Primero la del backend, si algún hallazgo de la sección la trae: es el dato
 * que el backend ya calculó y que el frontend no tiene con qué reproducirlo. Y
 * si la sección no trae ninguno, la del título, con la función compartida.
 */
function faseDeSeccion(
  encabezado: ElementModel,
  elements: readonly ElementModel[],
  items: readonly AuditItem[],
): string {
  const alcance = alcanceDe(encabezado, elements);
  const fases = new Set<string>();
  for (const it of items) {
    if (!it.phase || NO_ES_FASE.has(it.phase)) continue;
    if (alcance.has(it.element_id)) fases.add(it.phase);
  }
  if (fases.size === 1) return [...fases][0];
  return faseDeTitulo(encabezado.text || '', false) ?? SIN_FASE;
}

/** El H1 y todo lo que cuelga de él, hasta el próximo H1. */
function alcanceDe(encabezado: ElementModel, elements: readonly ElementModel[]): Set<string> {
  const alcance = new Set<string>();
  let abierto = false;
  for (const el of elements) {
    if (el.type === 'heading' && el.heading_level === 1) {
      if (abierto) break;
      if (el.id !== encabezado.id) continue;
      abierto = true;
    }
    if (abierto) alcance.add(el.id);
  }
  return alcance;
}

const cuentaComoParrafo = (e: ElementModel): boolean =>
  e.type === 'paragraph' && (e.text || '').trim().length > 0;

/* ── La clave de fase de un H1 ───────────────────────────────────────────────
 *
 * YA NO ESTÁ AQUÍ. Este archivo tuvo su propia copia —un `Map` de rótulo
 * normalizado a clave y una coincidencia EXACTA— y era la quinta de la misma
 * regla: `PHASE_LABELS` es el espejo declarado del backend
 * (`python/modules/phase_scope.py`), y `jerarquia.ts` es donde vive hoy la
 * comparación, con la numeración y los prefijos de capítulo tolerados. Copiar
 * esa tabla otra vez hacia dentro de este archivo era exactamente lo que el
 * comentario de abajo prohibía y que el archivo incumplía dos pantallas más
 * abajo.
 *
 * Y el nombre de la fase se pide primero al backend: es `match_phase` el que
 * corrió la cuenta, y su resultado viaja en `AuditItem.phase`. Lo que queda acá
 * es el respaldo para el capítulo que no tiene ningún hallazgo.
 */

const SIN_FASE = 'sin_fase';
