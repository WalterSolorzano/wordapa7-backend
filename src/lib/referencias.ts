/**
 * WordAPA7 — la verdad de una referencia, en un solo lugar.
 *
 * Este archivo existe porque el paso 4 decidía el estado de cada referencia con
 * dos heurísticas que no se podían probar, y porque el repo YA tiene el dato
 * que esas heuristicas trataban de adivinar.
 *
 * 1. EL ESTADO NO SE ADIVINA, SE LEE. `ReferenciaModel.verificada` lo pone un
 *    resolutor real —un DOI contra CrossRef, o una búsqueda que devuelva la obra—
 *    y `fuente_verificacion` dice de dónde salió. El paso 4 lo lee y lo pinta
 *    como "Verificada"/"Sin verificar". Antes, en cambio,
 *    miraba que la referencia tuviera autor y un título de más de cinco
 *    caracteres. Con esos dos criterios:
 *
 *      - un artículo titulado "AI" caía en "Sin verificar", y no es zombie;
 *      - un año `s.f.` —que es una fecha válida de APA 7 para una obra sin
 *        fecha— no era incomplete, pero la heurística buscaba la cadena 's.f.'
 *        en el TEXTO DEL AUTOR y sí lo marcaba;
 *      - y una referencia con autor y título pero jamás contrastada contra nada
 *        salía en el grupo rotulado "Válidas · DOI verificado OK", que es una
 *        etiqueta que el sistema se estaba dando a sí mismo.
 *
 *    Lo que NO se hace es inventar un quinto estado. `incompleta` es para lo que
 *    no se puede escribir; `sin-verificar` es para lo que se puede escribir pero
 *    nadie lo contrastó. Son cosas distintas y se pagan distinto.
 *
 * 2. LO QUE NO SE SABE NO ES `false`. `huerfana` es `boolean | null`, y `null`
 *    significa "la auditoría todavía no corrió". La versión vieja devolvía un
 *    booleano derivado de una búsqueda en el cliente: con autores vacíos el
 *    operando derecho era la cadena `'---'`, que sólo matchea si el texto
 *    contiene tres guiones, así que en el caso real —con `authors[0]` presente—
 *    comparaba el NOMBRE COMPLETO del autor contra el texto del documento,
 *    donde lo que está es el apellido solo. O sea que la señal era casi
 *    siempre falsa, y una referencia citada se pintaba como no citada.
 *
 *    Ahora el dato viene del backend: `citation_matcher.py:158-164` calcula
 *    `never_cited` y lo devuelve en `orphan_references`. Re-derivarlo en el
 *    cliente sería una segunda verdad, y peor: sin la normalización sin tildes
 *    que hace `_normalize_text`, y sin el `SequenceMatcher > 0.8` que hace el
 *    emparejamiento tolerante a abreviaturas.
 *
 * 3. SIN ESTADO, SIN REACT, SIN `any` EN LA FIRMA. Por la misma razón que
 *    `src/lib/figuras.ts` en la F4: una verdad que vive dentro de un `useMemo`
 *    del componente no se puede probar, y la segunda copia que nasce cuando
 *    alguien la necesita en otro lado diverge el primer día que cambia.
 */
import type { MascotExpression } from '../components/layout/EditorialMascot';
import { firstSurname, toKey } from './citationMatcher';
import type { ElementModel, ReferenciaModel } from '../types';

/**
 * Lo que se puede hacer con una referencia, de menos a más.
 *
 * El orden NO es el orden de la dificultad para el usuario: `incompleta` no se
 * arregla sola, y `sin-verificar` sí, con un clic. Por eso `incompleta` es la
 * que aparece primero en la lista de pendientes.
 */
export type EstadoReferencia = 'incompleta' | 'sin-verificar' | 'verificada';

/** Los rótulos. §3.4: ningún identificador interno visible, y "zombie" es el
 *  nombre interno de una categoría del código, no una palabra para la persona
 *  que está escribiendo su tesis. */
export const ROTULO_DE_ESTADO: Record<EstadoReferencia, string> = {
  verificada: 'Verificada',
  'sin-verificar': 'Sin verificar',
  incompleta: 'Incompleta',
};

/** Los tonos. Solo tokens: un color escrito a mano acá es una excepción, y una
 *  excepción es como muere el lint de tokens (`noHardcodedColors.test.ts`). */
export const TONO_DE_ESTADO: Record<EstadoReferencia, string> = {
  verificada: 'var(--color-success)',
  'sin-verificar': 'var(--color-warning)',
  incompleta: 'var(--color-danger)',
};

/** El dato y el veredicto, en la misma vuelta: no hay dos funciones que
 *  puedan discrepar sobre la misma referencia. */
export interface DiagnosticoReferencia {
  estado: EstadoReferencia;
  /** Los campos que faltan, en palabras del autor. Vacío cuando no falta nada:
   *  una referencia "sin verificar" no le falta ningún campo, y presentar eso
   *  como un problema de campos sería inventar un segundo defecto. */
  faltantes: string[];
  /** Del backend. `null` = la auditoría no corrió todavía. */
  huerfana: boolean | null;
}

/** Un autor cuenta si tiene UNA LETRA, no una cadena entera: `['  ']` es la
 *  forma que toma un autor vacío cuando viene de un .docx. */
const hayAutor = (ref: ReferenciaModel): boolean =>
  (ref.authors ?? []).some((a) => (a || '').trim().length > 0);

/** El texto que se puede escribir en el documento. El título va primero porque
 *  es el campo que el autor escribe siempre, y `raw_text` es la red de
 *  seguridad para las referencias que llegaron pegadas del .docx. */
const tieneTexto = (ref: ReferenciaModel): boolean =>
  (ref.title || '').trim().length > 0 || (ref.raw_text || '').trim().length > 0;

/**
 * El estado de UNA referencia, y por qué.
 *
 * `ctx.huerfanas` es el conjunto de `id` que el backend marcó como
 * `never_cited`. Se pasa el conjunto ya armado porque el cálculo es O(1) por
 * referencia y la lista puede tener doscientas.
 */
export function diagnosticoDeReferencia(
  ref: ReferenciaModel,
  ctx?: { huerfanas?: ReadonlySet<string> },
): DiagnosticoReferencia {
  const faltantes: string[] = [];
  if (!hayAutor(ref)) faltantes.push('autores');
  if (!tieneTexto(ref)) faltantes.push('título');

  const estado: EstadoReferencia =
    faltantes.length > 0 ? 'incompleta' : ref.verificada === true ? 'verificada' : 'sin-verificar';

  /* `undefined` y `null` significan lo mismo acá: la auditoría no corrió. La
     diferencia entre "no sé" y "no" es la diferencia entre una etiqueta y un
     dato. */
  const huerfana = ctx?.huerfanas ? ctx.huerfanas.has(ref.id) : null;

  return { estado, faltantes, huerfana };
}

/** Las dos listas de la columna izquierda. El orden de `pendientes` pone al
 *  final lo que no tiene apellido, porque es donde el .docx los pone también y
 *  porque en medio de la lista se esconden. */
export function particionarReferencias(refs: readonly ReferenciaModel[]): {
  verificadas: ReferenciaModel[];
  pendientes: ReferenciaModel[];
} {
  const verificadas: ReferenciaModel[] = [];
  const pendientes: ReferenciaModel[] = [];

  for (const ref of refs) {
    if (diagnosticoDeReferencia(ref).estado === 'verificada') verificadas.push(ref);
    else pendientes.push(ref);
  }

  /* `toKey` baja a minúsculas y quita las tildes, así que "Núñez" y "Nunez"
     ordenan igual. La Stable Array Sort de V8 lo hace bien; el motivo está
     anotado porque `localeCompare` con `sensitivity: 'base'` tampoco y es más
     caro. */
  const porApellido = (a: ReferenciaModel, b: ReferenciaModel): number =>
    firstSurname(a.authors?.[0] ?? '').localeCompare(firstSurname(b.authors?.[0] ?? ''), 'es');

  const sinApellido = pendientes.filter((r) => !(r.authors?.[0] ?? '').trim());
  const conApellido = pendientes.filter((r) => (r.authors?.[0] ?? '').trim());

  verificadas.sort(porApellido);
  return { verificadas, pendientes: [...conApellido.sort(porApellido), ...sinApellido] };
}

/**
 * Los párrafos donde se cita esta referencia.
 *
 * El criterio es el del backend: primer APELLIDO y año. Se excluyen los
 * encabezados —el título de una sección que menciona al autor no es una cita—
 * y la portada, que es zona protegida (`AGENTS.md` §1).
 *
 * El mínimo de tres letras del apellido no es un capricho: con dos, "Li" matchea
 * media pega del documento, y una lista de "menciones" que son todas palabras
 * al azar es peor que no tenerla.
 */
export function parrafosQueCitan(
  ref: ReferenciaModel,
  elementos?: readonly ElementModel[],
): ElementModel[] {
  if (!elementos?.length) return [];

  const apellido = firstSurname(ref.authors?.[0] ?? '');
  if (apellido.length < 3) return [];

  const anio = toKey(ref.year ?? '').replace(/[^0-9]/g, '');

  // Encontrar el índice donde empieza la sección de referencias (si existe)
  let refSectionIndex = -1;
  for (let i = 0; i < elementos.length; i++) {
    const el = elementos[i];
    if (el.type === 'heading') {
      const n = (el.text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      if (/^(referencias?|bibliografia|obras consultadas|works cited)\b/.test(n)) {
        refSectionIndex = i;
        break;
      }
    }
  }

  return elementos.filter((e, idx) => {
    if (e.type === 'heading' || e.is_cover_section) return false;
    // Todo lo que esté después del título de referencias pertenece a la bibliografía
    if (refSectionIndex !== -1 && idx > refSectionIndex) return false;
    const texto = toKey(e.text ?? '');
    if (!texto.includes(apellido)) return false;
    /* Un año vacío no restringe: hay referencias sin año que sí se citan, y
       exigirlo sería declarar huérfana la mitad de la bibliografía. */
    if (!anio) return true;
    return texto.includes(anio);
  });
}

/**
 * La cara de la mascota del paso, y sale del estado de la fase.
 *
 * Es la misma idea que `mascotDePestana.tsx` para las cinco pestañas de
 * Ajustes, con el mismo criterio: la expresión NO se elige por decorado, se
 * deriva de lo que hay que hacer. El `kind` es `reference`, que
 * `EditorialMascot.tsx:84-93` ya dibuja y que hasta ahora ninguna pantalla del
 * editor usaba.
 */
export function expresionDeReferencias(estado: {
  hayDocumento: boolean;
  totalReferencias: number;
  incompletas: number;
  citasSinFuente: number;
}): MascotExpression {
  if (!estado.hayDocumento) return 'worried';
  if (estado.totalReferencias === 0) return 'curious';
  if (estado.incompletas > 0 || estado.citasSinFuente > 0) return 'worried';
  /* La emoción se reserva para el documento de verdad. Con tres referencias en
     orden no hay nada que celebrar, y una mascota que se emociona por tres
     referencias deja de significar algo. */
  return estado.totalReferencias >= 20 ? 'excited' : 'happy';
}
