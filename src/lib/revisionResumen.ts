/* WordAPA7 — derivaciones de REV-L0. Puras y fuera del componente: lo que la
   pantalla pinta y lo que el rail cuenta salen de la MISMA lista (`items`). */
import type { ElementModel } from '../types';
import type { AuditItem, EngineId, Severity } from './auditItems';
import { phaseLabel } from './auditItems';
import { cumplimiento, fasePorElemento } from './informeRevision';
import { objetivosBloom, type ObjetivoBloom } from './contentReview';
import type { EstadoObjetivos } from './mascotaFrases';

export interface ResumenMotor {
  motor: EngineId;
  count: number;
  secciones: number;
  porSeveridad: Record<Severity, number>;
}

/** Una fila por motor OBJETIVO con hallazgos. La IA no vive acá. */
export function resumenMotores(items: readonly AuditItem[]): ResumenMotor[] {
  const porMotor = new Map<EngineId, AuditItem[]>();
  for (const it of items) {
    if (it.category === 'ai') continue;
    const arr = porMotor.get(it.category) ?? [];
    arr.push(it);
    porMotor.set(it.category, arr);
  }
  const orden: EngineId[] = ['spelling', 'style', 'structure', 'citations'];
  return orden
    .filter((m) => porMotor.has(m))
    .map((motor) => {
      const propios = porMotor.get(motor)!;
      const porSeveridad: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
      const fases = new Set<string>();
      for (const it of propios) {
        porSeveridad[it.severity] += 1;
        if (it.phase) fases.add(it.phase);
      }
      return { motor, count: propios.length, secciones: fases.size, porSeveridad };
    });
}

/** Las fases que se grafican como columnas: ni portada (bloqueada), ni objetivos
 *  (panel propio), ni referencias (fase propia), ni anexos/sin_fase. */
export const FASES_GRAFICO = ['introduccion', 'marco_teorico', 'metodo', 'resultados', 'discusion', 'conclusiones', 'resumen'] as const;

export interface CalificacionFase {
  phase: string;
  label: string;
  hallazgos: number;
  parrafos: number;
  calificacion: number;
}

export function calificacionPorFase(
  items: readonly AuditItem[],
  elements: readonly ElementModel[],
): CalificacionFase[] {
  const faseDe = fasePorElemento(elements, items);
  // Se cuentan TODOS los motores objetivos (incluidas las citas), no solo los
  // cuatro de la matriz de calor: la columna de una fase refleja todo lo que
  // REV-L1 muestra al abrirla, porque las dos superficies resuelven la fase con
  // esta MISMA función (`fasePorElemento`): un hallazgo con `phase` propia la
  // conserva y los de estructura/citas —`phase: null`— caen en la fase de su H1.
  const porFase = new Map<string, number>();
  for (const it of items) {
    if (it.category === 'ai') continue;
    const f = it.phase && it.phase !== 'global' ? it.phase : faseDe(it.element_id);
    if (!f) continue;
    porFase.set(f, (porFase.get(f) ?? 0) + 1);
  }
  const parrafosPorFase = new Map<string, number>();
  for (const e of elements) {
    if (e.type !== 'paragraph' && e.type !== 'bullet' && e.type !== 'numbered_list') continue;
    const f = faseDe(e.id);
    if (!f) continue;
    parrafosPorFase.set(f, (parrafosPorFase.get(f) ?? 0) + 1);
  }
  return FASES_GRAFICO
    .filter((phase) => parrafosPorFase.has(phase) || porFase.has(phase))
    .map((phase) => {
      const hallazgos = porFase.get(phase) ?? 0;
      const parrafos = parrafosPorFase.get(phase) ?? 0;
      return { phase, label: phaseLabel(phase), hallazgos, parrafos, calificacion: cumplimiento(hallazgos, parrafos) };
    });
}

export interface ResumenObjetivos {
  general: ObjetivoBloom | null;
  especificos: ObjetivoBloom[];
  medibles: number;
  conVariable: number;
  nivelGeneral: number | null;
  veredicto: string;
  /** Combinación real de fallas: gobierna pastilla, veredicto y frase de la
   *  mascota. `todo_cumple` es un estado de primera clase, no ausencia de daño. */
  estado: EstadoObjetivos;
  /** Todos los objetivos del documento (general + específicos): el denominador
   *  honesto de los KPIs. */
  total: number;
  /** Reparto para la barra de severidad del panel: verbo sin nivel Bloom,
   *  objetivo sin variable declarada, y objetivo medible. */
  porEstado: { noMedibles: number; sinVariable: number; cumplen: number };
}

export function resumenObjetivos(elements: readonly ElementModel[]): ResumenObjetivos {
  const objetivos = objetivosBloom(elements);
  // El general es el que el documento MARCA como general. Si no hay, no se
  // inventa uno con el primero: un específico no es un ancla.
  const general = objetivos.find((o) => o.esGeneral) ?? null;
  const especificos = objetivos.filter((o) => o !== general);
  const esMedible = (o: ObjetivoBloom) => !o.sinVariable && o.nivelActual !== null && !o.tieneDosVerbos;
  const medibles = objetivos.filter(esMedible).length;
  const conVariable = objetivos.filter((o) => !o.sinVariable).length;
  const cumple = (o: ObjetivoBloom) => esMedible(o) && (o.nivelActual ?? 0) >= 4;
  const noCumplen = objetivos.filter((o) => !cumple(o)).length;
  const porEstado = { noMedibles: 0, sinVariable: 0, cumplen: 0 };
  for (const o of objetivos) {
    if (o.nivelActual === null) porEstado.noMedibles += 1;
    else if (o.sinVariable) porEstado.sinVariable += 1;
    else porEstado.cumplen += 1;
  }
  const nGen = general?.nivelActual ?? null;
  const jerarquiaRota = general !== null
    && nGen !== null
    && especificos.some((o) => o.nivelActual !== null && o.nivelActual > nGen);
  let estado: EstadoObjetivos;
  if (objetivos.length === 0) estado = 'sin_objetivos';
  else if (general === null) estado = 'sin_general';
  else if (noCumplen === 0) estado = 'todo_cumple';
  else if (!cumple(general)) estado = 'general_falla';
  else if (jerarquiaRota) estado = 'jerarquia_rota';
  else if (objetivos.some((o) => o.sinVariable)) estado = 'sin_variable';
  else if (objetivos.some((o) => o.tieneDosVerbos)) estado = 'dos_verbos';
  else if (objetivos.some((o) => o.nivelActual === null)) estado = 'verbo_vago';
  else estado = 'nivel_bajo';

  const veredicto = objetivos.length === 0
    ? 'No se detectaron objetivos en el documento'
    : noCumplen === 0
      ? `Los ${objetivos.length} objetivos cumplen el nivel exigido`
      : `${noCumplen} de ${objetivos.length} objetivos no cumplen el nivel exigido`;
  return {
    general,
    especificos,
    medibles,
    conVariable,
    nivelGeneral: nGen,
    veredicto,
    estado,
    total: objetivos.length,
    porEstado,
  };
}
