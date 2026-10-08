import type { ElementModel } from '../types';
import type { AuditItem } from './auditItems';
import { PHASE_ORDER, phaseLabel } from './auditItems';
import { faseDeTitulo } from './jerarquia';

export interface TerminoRepetido {
  termino: string;
  conteo: number;
}

const VACIAS = new Set([
  'para', 'como', 'donde', 'cuando', 'desde', 'hacia', 'entre', 'sobre', 'bajo',
  'este', 'esta', 'estos', 'estas', 'esto', 'esos', 'esas', 'aquel', 'aquella',
  'porque', 'pues', 'sino', 'solo', 'tambien', 'también', 'cada', 'otro', 'otra',
  'otros', 'otras', 'mismo', 'misma', 'toda', 'todo', 'todos', 'todas',
  'ser', 'son', 'fue', 'era', 'han', 'has', 'hay', 'sus', 'del', 'las', 'los',
  'con', 'por', 'que', 'una', 'uno', 'unos', 'unas', 'de', 'la', 'el', 'en',
  'se', 'su', 'al', 'lo', 'es', 'no', 'si', 'ya', 'más', 'mas', 'muy',
]);

const MIN_LARGO = 5;
const MIN_CONTEOS = 3;

function normalizarPalabra(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zñü]/g, '');
}

export function repeticionCuerpo(elements: readonly ElementModel[], topN = 8): TerminoRepetido[] {
  const conteo = new Map<string, { termino: string; conteo: number }>();
  for (const e of elements) {
    const texto = (e as { text?: string }).text || '';
    for (const raw of texto.split(/\s+/)) {
      const clave = normalizarPalabra(raw);
      if (clave.length < MIN_LARGO || VACIAS.has(clave)) continue;
      const prev = conteo.get(clave);
      if (prev) prev.conteo += 1;
      else conteo.set(clave, { termino: clave, conteo: 1 });
    }
  }
  return [...conteo.values()]
    .filter((t) => t.conteo >= MIN_CONTEOS)
    .sort((a, b) => b.conteo - a.conteo || a.termino.localeCompare(b.termino))
    .slice(0, topN);
}

export interface LeyPorFase {
  phase: string;
  label: string;
  items: AuditItem[];
}

const ORDEN_FASE: readonly string[] = PHASE_ORDER;

function indiceFase(phase: string): number {
  const i = ORDEN_FASE.indexOf(phase);
  return i === -1 ? ORDEN_FASE.length : i;
}

/** Leyes de metodología: hallazgos con fase concreta (nunca `global` ni `null`). */
export function leyesPorFase(items: readonly AuditItem[]): LeyPorFase[] {
  const mapa = new Map<string, AuditItem[]>();
  for (const it of items) {
    if (!it.phase || it.phase === 'global') continue;
    const lista = mapa.get(it.phase);
    if (lista) lista.push(it);
    else mapa.set(it.phase, [it]);
  }
  return [...mapa.entries()]
    .sort((a, b) => indiceFase(a[0]) - indiceFase(b[0]))
    .map(([phase, lista]) => ({ phase, label: phaseLabel(phase), items: lista }));
}

/* ── La puerta de estado: cumplimiento, matriz fase × motor ──────────────── */

/** Párrafos de prosa corrida: el denominador de la calificación. No cuenta
 *  títulos, figuras, tablas ni portada; la revisión se mide sobre el cuerpo. */
export function contarParrafos(elements: readonly ElementModel[]): number {
  let n = 0;
  for (const e of elements) {
    if (e.type === 'paragraph' || e.type === 'bullet' || e.type === 'numbered_list') n += 1;
  }
  return n;
}

/**
 * El porcentaje «LISTO PARA PUBLICAR», normalizado por TAMAÑO. La definición
 * vieja (`100 - total*3`) llegaba a 0 con 34 hallazgos y una tesis real (100+)
 * quedaba muerta. La nueva es la ÚNICA: cada hallazgo pesa 200/párrafos, y sin
 * párrafos no hay nada que descontar (100).
 */
export function cumplimiento(hallazgos: number, parrafos: number): number {
  if (!parrafos || parrafos <= 0) return 100;
  const valor = 100 - 200 * (hallazgos / parrafos);
  return Math.max(0, Math.min(100, Math.round(valor)));
}

/** Los motores con columna en la matriz. Citas vive en su fase (paso 4). */
export type MotorMatriz = 'spelling' | 'structure' | 'style' | 'ai';

export const MOTORES_MATRIZ: readonly MotorMatriz[] = ['spelling', 'structure', 'style', 'ai'];

export interface FilaMatriz {
  phase: string;
  label: string;
  counts: Record<MotorMatriz, number>;
  total: number;
  /** La portada se mide pero no se escribe: su fila lo dice, no ofrece acción. */
  protegida: boolean;
}

/** 0 = sin hallazgos; 1..3 = intensidad relativa al máximo de su columna. */
export function nivelCelda(count: number, max: number): 0 | 1 | 2 | 3 {
  if (count <= 0 || max <= 0) return 0;
  const ratio = count / max;
  if (ratio <= 1 / 3) return 1;
  if (ratio <= 2 / 3) return 2;
  return 3;
}

/**
 * Resuelve la fase de cualquier elemento por el H1 que lo contiene.
 *
 * Antes del primer H1 el ámbito es `portada` (spec D1). Un H1 que no abre fase
 * alguna deja a sus hijos en `sin_fase`, que es una respuesta honesta y no una
 * inventada.
 *
 * `items` es la costura con el backend: un hallazgo que ya trae `phase`
 * —`match_phase` corrió sobre el vocabulario COMPLETO— la presta a toda su
 * rama. Sin ella, «Metodología» caería en `sin_fase` porque el espejo local
 * solo conoce el rótulo «Metodo», y la matriz partiría un capítulo en dos filas.
 */
export function fasePorElemento(
  elements: readonly ElementModel[],
  items: readonly AuditItem[] = [],
): (elementId: string) => string | null {
  const h1De = new Map<string, string>();
  let h1Actual = '';
  for (const el of elements) {
    if (el.type === 'heading' && (el.heading_level ?? 1) === 1) h1Actual = el.id;
    h1De.set(el.id, h1Actual);
  }

  const faseLocal = new Map<string, string | null>();
  for (const el of elements) {
    if (el.type === 'heading' && (el.heading_level ?? 1) === 1) {
      faseLocal.set(el.id, faseDeTitulo(el.text || '', false));
    }
  }

  const faseAprendida = new Map<string, string>();
  for (const it of items) {
    if (!it.phase || it.phase === 'global') continue;
    const h1 = h1De.get(it.element_id);
    if (h1 && !faseAprendida.has(h1)) faseAprendida.set(h1, it.phase);
  }

  return (elementId: string): string | null => {
    if (!h1De.has(elementId)) return null;
    const h1 = h1De.get(elementId) as string;
    if (!h1) return 'portada';
    return faseAprendida.get(h1) ?? faseLocal.get(h1) ?? 'sin_fase';
  };
}

/**
 * Matriz de calor fase × motor: una fila por fase con al menos un hallazgo.
 * La fase de cada hallazgo sale de su elemento (o de la que el backend ya le
 * puso), nunca de buscar palabras en su texto.
 */
export function matrizFaseMotor(
  items: readonly AuditItem[],
  faseDe: (elementId: string) => string | null = () => null,
): FilaMatriz[] {
  const mapa = new Map<string, FilaMatriz>();
  for (const it of items) {
    if (!(MOTORES_MATRIZ as readonly string[]).includes(it.category)) continue;
    const motor = it.category as MotorMatriz;
    const cruda = faseDe(it.element_id) ?? (it.phase && it.phase !== 'global' ? it.phase : null);
    const phase = cruda && cruda !== 'global' ? cruda : 'sin_fase';
    let fila = mapa.get(phase);
    if (!fila) {
      fila = {
        phase,
        label: phaseLabel(phase),
        counts: { spelling: 0, structure: 0, style: 0, ai: 0 },
        total: 0,
        protegida: phase === 'portada',
      };
      mapa.set(phase, fila);
    }
    fila.counts[motor] += 1;
    fila.total += 1;
  }
  return [...mapa.values()].sort((a, b) => indiceFase(a.phase) - indiceFase(b.phase));
}
