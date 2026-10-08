/* WordAPA7 — review: la lista de hallazgos, como función pura.
   Vive FUERA del hook a propósito: `useReviewWorkbench` la usa para pintar el
   workbench y el rail la usa para CONTAR lo que le falta al usuario. Cuando las
   dos cosas eran la misma línea de un hook, el rail solo podía contar
   ortografía y citas fantasma mientras la pantalla abría cinco motores más, y
   el rail llegaba a Revisión & IA con un punto verde y la palabra "Listo".

   Reglas que este módulo no negocia (las mismas que las del hook):
   1. El detector de IA es PROBABILÍSTICO: un ítem de IA propone, la persona
      decide. Aquí solo se declara; ninguna función de este archivo escribe.
   2. Un hallazgo que no se conoce NO se descarta: cae bajo
      "Otro hallazgo del corrector" (`PROOFREAD_SPECS` tiene fila para lo
      declarado y una que recoge lo nuevo).
   3. La página es un dato de la VISTA, no del hallazgo: quien no pagina
      (el rail) pasa un `pageOf` que no existe y recibe `null`. Lo que define
      si algo es un hallazgo es esto, no dónde cae. */

import type { ElementModel, ProofreadFinding } from '../types';
import { PROOFREAD_SPECS, mensajeDelMotor } from './rotulos';
import type { ProofreadSource } from './rotulos';
import { UMBRAL_IA } from './aiPerfil';

/* `PROOFREAD_SPECS` y `ProofreadSource` viven en `lib/rotulos.ts` y se reexportan
   acá. La tabla de reglas y la de rótulos son la misma pregunta en dos pasos —de
   `kind` a `subtype`, de `subtype` a nombre—, y mientras estuvieron en archivos
   distintos cada capa que no alcanzaba a la otra se inventó la suya: el store del
   mapa de marcas tiene sus diez filas y por eso escribía el `snake_case` crudo en
   `localStorage`. La reexportación existe para no romper los imports que ya
   había. */
export { PROOFREAD_SPECS } from './rotulos';
export type { ProofreadSource } from './rotulos';

export type EngineId = 'ai' | 'style' | 'spelling' | 'citations' | 'structure';

/* Alias de compatibilidad: el rediseño de la fase 5 (puerta/recorrido/sala IA)
   nombra al mismo conjunto de motores como `ToolWindowId`. Es el MISMO tipo, no
   un vocabulario paralelo: si mañana cambia `EngineId`, cambia este también. */
export type ToolWindowId = EngineId;

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface AuditItem {
  id: string;
  element_id: string;
  category: EngineId;
  /** Subtipo para agrupar: una fila por subtipo, no una por aparición */
  subtype: string;
  severity: Severity;
  summary: string;
  detail: string;
  originalText: string;
  suggestedText?: string;
  /** Página REAL del elemento, o `null` si no está en el índice */
  pageNumber: number | null;
  aiScore?: number;
  /**
   * Fase a la que pertenece el hallazgo, o `null` si es una regla general.
   * Los H1 son las fases del documento (spec D1), así que esto no es una
   * categoría del motor: es dónde está el elemento dentro del documento.
   */
  phase: string | null;
  /**
   * El hallazgo se informa pero no se puede aplicar (portada). `AGENTS.md` §1
   * dice que la portada original no se muta, así que no hay nada que aceptar.
   */
  readOnly: boolean;
  /**
   * Presente cuando el hallazgo apunta a un elemento que no tiene texto: una
   * figura o una tabla sin leyenda. Antes esto se resolvía poniendo
   * `'[Figura sin rotular]'` en `originalText`, y la vista lo pintaba como si
   * fuera una cita del documento —y tachado, que se lee como "el documento tenía
   * esto y se borró". No había nada que borrar.
   *
   * Cuando está presente, `originalText` es `''`. Es un discriminante cerrado a
   * propósito: los tres estados (tiene texto, no tiene texto, todavía no se sabe)
   * no se pueden confundir.
   */
  sinTexto?: { clase: 'figura' | 'tabla' };
}

/* "Fase" — el vocabulario del backend (`python/modules/phase_scope.py`).
   Vive ACÁ y no en un fetch aparte porque la fase es dato de la VISTA, como la
   página: el workbench y la tira la nombran, y derivarla en dos lugares es
   como un día el rail y la pantalla dejan de contar lo mismo.

   El orden es el del DOCUMENTO, no alfabético: el usuario lee de arriba hacia
   abajo, y ordenar alfabético le desordena la tesis. La portada va primera
   porque es lo primero que se ve, y referencias y anexos al final porque así
   terminan. */
export const PHASE_ORDER = [
  'portada',
  'resumen',
  'introduccion',
  'marco_teorico',
  'objetivos',
  'metodo',
  'resultados',
  'discusion',
  'conclusiones',
  'referencias',
  'anexos',
] as const;

export const PHASE_LABELS: Record<string, string> = {
  portada: 'Portada',
  resumen: 'Resumen',
  introduccion: 'Introduccion',
  marco_teorico: 'Marco teorico',
  objetivos: 'Objetivos',
  metodo: 'Metodo',
  resultados: 'Resultados',
  discusion: 'Discusion',
  conclusiones: 'Conclusiones',
  referencias: 'Referencias',
  anexos: 'Anexos',
  sin_fase: 'Seccion sin nombre',
};

/**
 * Reglas que pertenecen al ANALIZADOR DE OBJETIVOS (REV-L2), no al workbench.
 *
 * El backend las emite igual —viven en la fase `objetivos` y en `bloom_verb`—,
 * pero el analizador las recalcula desde los elementos con `objetivosBloom`, así
 * que incluirlas acá las contaría dos veces: una con chip propio en el motor de
 * Redacción y otra en su sala. La regla es una sola: estas `kind` no entran a la
 * lista compartida (`reviewItems`), y por eso ni el workbench ni el rail las
 * cuentan; el analizador es su única superficie.
 */
export const OBJETIVOS_KINDS: ReadonlySet<string> = new Set([
  'bloom_vague',
  'bloom_low',
  'objetivo_sin_variable',
  'objetivo_sin_infinitivo',
  'objetivo_multi_verbo',
]);

/**
 * `null` = el hallazgo es de una regla general, que no pertenece a ninguna
 * fase. Una clave desconocida NO se inventa: sale como sección sin nombre.
 */
export function phaseLabel(key: string | null): string {
  if (key === null) return 'Todo el documento';
  return PHASE_LABELS[key] ?? 'Seccion sin nombre';
}

/** `'global'` y `undefined` significan lo mismo: regla general, sin fase. */
function faseDeHallazgo(f: ProofreadFinding): string | null {
  if (!f.phase || f.phase === 'global') return null;
  return f.phase;
}

/* ── Hallazgos del proofreador local ──────────────────────────────────────
   Una fila por `kind`, y la fila es TOTAL: `ProofreadFinding['kind']` es
   `'ortografia' | ... | string`, así que el tipo admite kinds que todavía no
   existen. Un hallazgo que este archivo no conoce NO se descarta: se muestra
   bajo "Otro hallazgo del corrector". Antes se descartaba en silencio, y el
   store ya lo publicaba en el mapa de transparencia (`auditSlice` KIND_LABELS
   → localStorage + StorageEvent): el usuario leía en el lienzo un aviso que
   el panel de Revisión no tenía. Un panel que calla un hallazgo que el lienzo
   enseña rompe la sincronización que AGENTS.md §2 exige entre los dos
   canales. La tabla que hace esa traducción (`PROOFREAD_SPECS`) se reexporta
   desde acá; vive en `lib/rotulos.ts`, junto a los rótulos. */

interface ProofreadRow {
  category: EngineId;
  subtype: string;
  severity: Severity;
  summary: string;
  suggestedText?: string;
}

/* ── La IDENTIDAD de un hallazgo ───────────────────────────────────────────
   `AuditItem.id` no es una etiqueta: es la clave de React del detalle, la que
   filtra `dismissedIds` y la que anota `markedIds`. Con un id POSICIONAL
   (`proact_${element_id}_${idx}`) las tres se rompen en cuanto la lista se
   mueve, y la lista se mueve: una segunda corrida del motor devuelve los
   mismos hallazgos en otro orden, resolver una cita fantasma la corre un
   puesto, y abrir otro documento repite las posiciones. El descarte que la
   persona acaba de hacer se queda apuntando al hallazgo que ocupa ese lugar, y
   el hallazgo de al lado desaparece de la cola sin que nada lo diga.

   La clave es CONTENIDO, y el contenido es lo que no cambia entre corridas:
   el elemento y el tipo para el corrector, el elemento para el revisor, el
   texto citado (con su elemento, porque la misma cita en dos párrafos son dos
   apariciones) para las fantasma, y la referencia entera para las huérfanas. El
   `element_id` va dentro a propósito, no por adorno: sin él, dos apariciones de
   la misma cita en el mismo documento —el caso normal en una tesis— se
   fundirían en un hallazgo, y descartar una se llevaría la otra.

   El último recurso es un índice, y por eso `collectAuditItems` lo usa SOLO
   para desempatar dos hallazgos que de verdad son indistinguibles (el mismo
   elemento, tipo y rango: el mismo hallazgo reportado dos veces). Al ser un
   desempate y no la identidad, cambiar la lista no lo mueve. */
const clave = (...partes: Array<string | number | undefined | null>): string =>
  partes
    .map((p) => (p == null ? '' : String(p)))
    .join('_')
    // Un id es una clave de React y un valor de un `Set`: los separadores que
    // vienen del contenido no pueden reescribir la separación del id.
    .replace(/\s+/g, ' ')
    .trim();

/** Todo kind tiene fila: la tabla cubre los declarados y la última recoge lo
 *  que llegue nuevo. Nunca devuelve `null`: no hay kinds que se pierdan. */
export function proofreadRow(kind: string, f: ProofreadSource): ProofreadRow {
  const spec = PROOFREAD_SPECS[kind] ?? {
    category: 'style' as EngineId,
    subtype: 'otro',
    severity: 'low' as Severity,
    summary: mensajeDelMotor,
  };
  return {
    category: spec.category,
    subtype: spec.subtype,
    severity: spec.severity,
    summary: typeof spec.summary === 'function' ? spec.summary(f) : spec.summary,
    suggestedText: spec.suggestedText,
  };
}

export interface AIReviewParagraph {
  element_id?: string;
  text?: string;
  ai_score?: number;
  ai_category?: string;
}

export interface AuditSources {
  elements: readonly ElementModel[];
  reviewResult: { paragraphs?: AIReviewParagraph[] } | null;
  proofreadFindings: readonly ProofreadFinding[];
  citationAuditResult: {
    ghost_citations?: unknown[];
    orphan_references?: unknown[];
  } | null;
}

/**
 * TODOS los hallazgos del documento, en el orden en que los produce cada motor.
 *
 * `pageOf` es opcional a propósito: el rail solo necesita el CUÁNTO, y para eso
 * la página no existe. Lo que no es opcional es la lista: si el rail y la
 * pantalla dejaran de compartir esta función, el rail volvería a prometer
 * trabajo que la pantalla no muestra.
 */
export function collectAuditItems(
  sources: AuditSources,
  pageOf?: (elementId: string) => number | null,
): AuditItem[] {
  const { elements, reviewResult, proofreadFindings, citationAuditResult } = sources;
  const out: AuditItem[] = [];
  const byId = new Map(elements.map((e) => [e.id, e]));
  const page = pageOf ?? (() => null);

  /* Dos ids iguales en la MISMA lista serían dos filas con la misma clave de
     React y un descarte compartido: una borra las dos. Ningún motor debería
     producirlos —la clave ya incluye todo lo que distingue un hallazgo de
     otro—, así que esto es una red, no la identidad: si un backend futuro
     duplica un hallazgo, se le da un sufijo y las dos filas siguen siendo
     distinguibles. El sufijo cuenta REPETICIONES de la misma clave, no
     posiciones: la lista puede reordenarse sin que el id se mueva. */
  const vistos = new Set<string>();
  const registrar = (base: string): string => {
    let id = base;
    for (let n = 2; vistos.has(id); n += 1) id = `${base}_${n}`;
    vistos.add(id);
    return id;
  };

  // 1. Detector de IA: párrafos medidos por encima del umbral; los que llegan
  //    sin puntuación entran solo por su categoría, sin inventar un número.
  for (const [idx, p] of (reviewResult?.paragraphs || []).entries()) {
    const score = p.ai_score || 0;
    const medido = score > 0;
    const entra = medido
      ? score >= UMBRAL_IA
      : p.ai_category === 'HIGH' || p.ai_category === 'MEDIUM';
    if (!entra) continue;
    // `ai_score` ausente o cero no es un 60% ni un 50%: es "no medido". Un
    // párrafo puede entrar por `ai_category` con la puntuación sin calcular,
    // y mostrarle un número al usuario sería inventarlo.
    out.push({
      // El elemento es la identidad del párrafo. Solo se recurre al índice
      // cuando el revisor no lo trajo: sin él no hay nada estable, y un id
      // ausente fundiría todos esos párrafos en un hallazgo.
      id: registrar(clave('ai_rev', p.element_id || `origen_${idx}`)),
      element_id: p.element_id || '',
      category: 'ai',
      subtype: 'parrafo_ia',
      severity: score >= 70 ? 'high' : 'medium',
      summary: medido
        ? `Índice de IA ${score}% — rigidez sintética detectada`
        : 'Índice de IA alto — rigidez sintética detectada',
      detail: 'Estructura reiterativa y conectores sintéticos característicos de modelos generativos.',
      originalText: (p.element_id ? byId.get(p.element_id)?.text : '') || p.text || '',
      suggestedText: undefined,
      pageNumber: p.element_id ? page(p.element_id) : null,
      aiScore: medido ? score / 100 : undefined,
      // Los motores que no conocen la fase la declaran nula: son reglas
      // generales y no pertenecen a ninguna (spec D2). 
      phase: null,
      readOnly: false,
    });
  }

  // 2. Hallazgos proactivos locales: TODOS los `kind` que emite el auditor.
  for (const f of proofreadFindings ?? []) {
    // Las reglas de objetivos no se mezclan con el workbench: su superficie es
    // el analizador de Objetivos (REV-L2). Ver `OBJETIVOS_KINDS`.
    if (OBJETIVOS_KINDS.has(String(f.kind))) continue;
    const row = proofreadRow(String(f.kind), f);
    out.push({
      // Elemento + tipo + rango: el tipo porque dos auditores señalan el mismo
      // tramo por motivos distintos, y el rango porque `palabra_repetida`
      // señala la misma palabra en cada repetición. El índice de la lista no
      // entra: cambiar el orden de los motors no cambia qué es qué hallazgo.
      id: registrar(clave('proact', f.element_id, String(f.kind), f.start, f.end)),
      element_id: f.element_id,
      category: row.category,
      subtype: row.subtype,
      severity: row.severity,
      summary: row.summary,
      detail: f.message,
      originalText: (f.element_id ? byId.get(f.element_id)?.text : '') || f.excerpt || '',
      // Un hallazgo de solo lectura nunca trae sugerencia (invariante del
      // motor, `modules/finding.py`), y aquí tampoco se inventa una: no hay
      // nada que la aplicadora pueda escribir sobre la portada.
      suggestedText: f.read_only ? undefined : f.suggestion || row.suggestedText,
      pageNumber: f.element_id ? page(f.element_id) : null,
      phase: faseDeHallazgo(f),
      readOnly: f.read_only === true,
    });
  }

  // 3. Citas fantasma (aparecen en el texto, no en la bibliografía).
  for (const ghost of citationAuditResult?.ghost_citations || []) {
    const g = ghost as {
      element_id?: string;
      citation_text?: string;
      raw_text?: string;
    };
    const texto = g.citation_text || g.raw_text || 'Desconocida';
    out.push({
      // Elemento + texto citado: el elemento porque la misma referencia citada
      // en dos párrafos son dos apariciones que se resuelven por separado.
      id: registrar(clave('ghost_cite', g.element_id, texto)),
      element_id: g.element_id || '',
      category: 'citations',
      subtype: 'cita_fantasma',
      severity: 'critical',
      summary: `Cita "${texto}" ausente en bibliografía`,
      detail: 'Aparece citada en el cuerpo del documento pero no figura en la lista final de referencias.',
      originalText: g.citation_text || '',
      pageNumber: g.element_id ? page(g.element_id) : null,
      // Los motores que no conocen la fase la declaran nula: son reglas
      // generales y no pertenecen a ninguna (spec D2). 
      phase: null,
      readOnly: false,
    });
  }

  // 4. Referencias huérfanas (en la bibliografía, nunca citadas).
  for (const orphan of citationAuditResult?.orphan_references || []) {
    const o = orphan as { authors?: string[]; year?: string | number; raw_text?: string };
    out.push({
      // Sin elemento al que anclarse, la identidad es la referencia entera. La
      // cruda manda porque distingue dos entradas del mismo autor y año; los
      // autores y el año están detrás por si el backend no la manda.
      id: registrar(clave('orphan_ref', o.raw_text || '', (o.authors || []).join(' '), o.year)),
      element_id: '',
      category: 'citations',
      subtype: 'referencia_huerfana',
      severity: 'medium',
      summary: `Referencia "${o.authors?.[0] || 'Autor'} (${o.year || 's.f.'})" no citada en texto`,
      detail: 'Consta en la bibliografía final pero ninguna sección del documento la referencia expresamente.',
      originalText: o.raw_text || '',
      // Sin elemento que anclar: una referencia huérfana vive en la lista
      // final, y la lista no tiene página. `null` antes que la página del
      // último elemento (que era la estimación que se reemplaza aquí).
      pageNumber: null,
      // Las referencias huérfanas pertenecen conceptualmente a la sección de Referencias.
      phase: 'referencias',
      readOnly: false,
    });
  }

  // 5. Estructura y rotulación APA 7.
  /* La leyenda se mira con `trim()`: una leyenda de un punto ES una leyenda, y
     marcar como "sin rotular" algo que tiene un punto de texto es un falso
     positivo que el usuario no puede distinguir de uno real. El aviso es por
     elemento, no por documento: un documento donde todas las figuras ya tienen
     leyenda no produce ninguno. */
  for (const e of elements) {
    if (e.type === 'heading' && e.needs_review) {
      out.push({
        id: registrar(`struct_head_${e.id}`),
        element_id: e.id,
        category: 'structure',
        subtype: 'encabezado',
        severity: 'medium',
        summary: `Encabezado nivel ${e.heading_level || 1} requiere confirmación de jerarquía`,
        detail: 'Verificar que no existan saltos ilegales de nivel (ej. H1 a H3 sin H2 intermedio).',
        originalText: e.text || '',
        pageNumber: page(e.id),
        phase: null,
        readOnly: false,
      });
    } else if (e.type === 'image' && !e.is_cover_section && !(e.image_info?.caption ?? '').trim()) {
      out.push({
        id: registrar(`struct_fig_${e.id}`),
        element_id: e.id,
        category: 'structure',
        subtype: 'figura',
        severity: 'high',
        summary: 'Figura sin rotulación APA 7 (Figura N y Nota)',
        detail: 'Las normas APA 7 exigen numeración secuencial en negrita, título cursivo y nota explicativa.',
        originalText: '',
        sinTexto: { clase: 'figura' },
        suggestedText: `${e.image_info?.figure_number ? `Figura ${e.image_info.figure_number}. ` : 'Figura. '}Descripción de la figura.`,
        pageNumber: page(e.id),
        phase: null,
        readOnly: false,
      });
    } else if (e.type === 'table' && !(e.table_info?.caption ?? '').trim()) {
      out.push({
        id: registrar(`struct_tbl_${e.id}`),
        element_id: e.id,
        category: 'structure',
        subtype: 'tabla',
        severity: 'high',
        summary: 'Tabla sin rotulación reglamentaria APA 7',
        detail: 'Requiere etiqueta "Tabla N" superior y nota al pie con la fuente o especificación.',
        originalText: '',
        sinTexto: { clase: 'tabla' },
        suggestedText: `${e.table_info?.table_number ? `Tabla ${e.table_info.table_number}. ` : 'Tabla. '}Descripción de la tabla.`,
        pageNumber: page(e.id),
        phase: null,
        readOnly: false,
      });
    }
  }

  return out;
}

/**
 * La lista que abre el workbench de Revisión Y la que cuenta el rail, en una
 * sola definición: todos los hallazgos menos los que la persona ya descartó.
 *
 * No filtra por motor a propósito. `AGENTS.md` §1 lista ortografía, estructura,
 * citas y Bloom como motores de Revisión; si la pantalla escondiera uno, el rail
 * volvería a contar trabajo que la pantalla no muestra —la contradicción que el
 * rail no puede cometer—. Antes Step5 recortaba citas y figuras/tablas y el rail
 * las seguía contando: la fase 5 decía "3 pendientes" sobre una pantalla sin
 * nada que aceptar.
 */
export function reviewItems(
  sources: AuditSources,
  pageOf?: (elementId: string) => number | null,
  dismissedIds?: ReadonlySet<string> | readonly string[] | null,
): AuditItem[] {
  const todos = collectAuditItems(sources, pageOf);
  if (!dismissedIds) return todos;
  const dismissed = dismissedIds instanceof Set ? dismissedIds : new Set(dismissedIds);
  if (dismissed.size === 0) return todos;
  return todos.filter((it) => !dismissed.has(it.id));
}
