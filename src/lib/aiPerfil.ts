import type { ElementModel } from '../types';
import type { AIReviewParagraph } from '../api/backend';
import { construirJerarquia, type NodoJerarquia } from './jerarquia';

export const BANDAS_IA = [
  { id: 'baja', label: 'Baja', min: 0, max: 20, color: 'var(--color-text-tertiary)' },
  { id: 'media', label: 'Media', min: 20, max: 50, color: 'var(--color-engine-ia-a40)' },
  { id: 'alta', label: 'Alta', min: 50, max: 75, color: 'var(--color-engine-ia-a65)' },
  { id: 'critica', label: 'Crítica', min: 75, max: Infinity, color: 'var(--color-engine-ia)' },
] as const;

export type IndiceBanda = 0 | 1 | 2 | 3;

/** Banda de severidad de un score 0..100, alineada al motor (LOW<20, MEDIUM>=20, HIGH>=50). */
export function bandaDe(score: number): IndiceBanda {
  if (score < 20) return 0;
  if (score < 50) return 1;
  if (score < 75) return 2;
  return 3;
}

/** Tinte de mancha por banda (el mockup de vista previa usa la rampa violeta). */
export const IA_MANCHA = [
  'var(--ia-mancha-1)', 'var(--ia-mancha-2)', 'var(--ia-mancha-3)', 'var(--ia-mancha-4)',
] as const;

/** Fondo de mancha de un score 0..100 en la rampa violeta de la vista previa. */
export function manchaDe(score: number): string {
  return IA_MANCHA[bandaDe(score)];
}

/** Umbral ÚNICO de alerta de IA (0–100), alineado a la banda `alta`. Espejo de
 *  `AI_UMBRAL` en `python/main.py`; `test_umbral_ia.py` falla si divergen. */
export const UMBRAL_IA = 50;
export const CLAVE_DOC = '__doc__';

export interface ParrafoPerfilIA {
  elementId: string;
  index: number;
  score: number;
  categoria: AIReviewParagraph['ai_category'];
  excerpt: string;
  /** Carril vertical (0..2) para no superponer puntos con scores cercanos. */
  carril: number;
  /** H2 ancestro del párrafo, o `null` si cuelga directo del H1. La lista de
   *  IA-L1 se agrupa por H2; derivarlo en la vista sería una segunda verdad. */
  h2Id: string | null;
  h2Titulo: string | null;
}

export interface FilaPerfilIA {
  h1Id: string;
  titulo: string;
  fase: string | null;
  parrafos: ParrafoPerfilIA[];
  porBanda: [number, number, number, number];
  rigidezMedia: number;
}

export interface PerfilIA {
  filas: FilaPerfilIA[];
  total: number;
  porBanda: [number, number, number, number];
  rigidezMedia: number;
  vozHumana: number;
  enAlerta: number;
  filaMasRigida: FilaPerfilIA | null;
}

const recortar = (t: string, n = 90): string => {
  const s = (t || '').trim().replace(/\s+/g, ' ');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

interface H1Actual {
  id: string;
  titulo: string;
  fase: string | null;
  h2Id: string | null;
  h2Titulo: string | null;
}

const CARRILES = 3;
const SEPARACION_CARRIL = 4;

/** Reparte los párrafos de una fila en carriles para que los puntos cercanos no se pisen. */
function asignarCarriles(parrafos: ParrafoPerfilIA[]): void {
  const ordenados = [...parrafos].sort((a, b) => a.score - b.score);
  const ultimo = Array.from({ length: CARRILES }, () => -Infinity);
  for (const par of ordenados) {
    let c = 0;
    while (c < CARRILES && par.score - ultimo[c] < SEPARACION_CARRIL) c++;
    if (c >= CARRILES) c = 0;
    par.carril = c;
    ultimo[c] = par.score;
  }
}

export function construirPerfilIA(
  paragraphs: readonly AIReviewParagraph[],
  elements: readonly ElementModel[] | null,
): PerfilIA {
  const vacio: PerfilIA = {
    filas: [], total: 0, porBanda: [0, 0, 0, 0], rigidezMedia: 0, vozHumana: 100, enAlerta: 0, filaMasRigida: null,
  };
  if (!paragraphs || paragraphs.length === 0) return vacio;

  const nodos = elements && elements.length ? construirJerarquia(elements) : [];
  const nodoPorElemento = new Map<string, NodoJerarquia>();
  for (const n of nodos) {
    if (n.elementoId) nodoPorElemento.set(n.elementoId, n);
    nodoPorElemento.set(n.id, n);
  }

  const orden: string[] = [];
  const porClave = new Map<string, { h1Id: string; titulo: string; fase: string | null; parrafos: ParrafoPerfilIA[] }>();
  const asegurar = (h1Id: string, titulo: string, fase: string | null) => {
    let fila = porClave.get(h1Id);
    if (!fila) {
      fila = { h1Id, titulo, fase, parrafos: [] };
      porClave.set(h1Id, fila);
      orden.push(h1Id);
    }
    return fila;
  };

  // Una pasada por los elementos fija la fase H1 vigente por índice y siembra una
  // fila por CADA H1 (aunque no tenga párrafos medidos), con identidad de elemento
  // y no por texto: dos H1 homónimos son dos fases distintas.
  const elPorIndex = elements ?? [];
  const h1DeIndex: (H1Actual | null)[] = [];
  let actual: H1Actual | null = null;
  for (const el of elPorIndex) {
    if (el.heading_level === 1) {
      const nodo = nodoPorElemento.get(el.id);
      actual = {
        id: nodo?.id ?? el.id,
        titulo: (nodo?.titulo ?? el.text ?? '').trim(),
        fase: nodo?.fase ?? null,
        h2Id: null,
        h2Titulo: null,
      };
      asegurar(actual.id, actual.titulo || 'Sección sin nombre', actual.fase);
    } else if (el.heading_level === 2 && actual) {
      const conH2: H1Actual = {
        id: actual.id,
        titulo: actual.titulo,
        fase: actual.fase,
        h2Id: el.id,
        h2Titulo: (el.text ?? '').trim() || null,
      };
      actual = conH2;
    }
    h1DeIndex.push(actual);
  }

  for (const p of paragraphs) {
    const h1 = h1DeIndex[p.index] ?? null;
    const fila = h1
      ? asegurar(h1.id, h1.titulo || 'Sección sin nombre', h1.fase)
      : asegurar(CLAVE_DOC, 'Documento completo', null);
    fila.parrafos.push({
      elementId: elPorIndex[p.index]?.id ?? p.element_id,
      index: p.index,
      score: p.ai_score,
      categoria: p.ai_category,
      excerpt: recortar(p.text),
      carril: 0,
      h2Id: h1?.h2Id ?? null,
      h2Titulo: h1?.h2Titulo ?? null,
    });
  }

  const filas: FilaPerfilIA[] = orden.map((clave) => {
    const base = porClave.get(clave)!;
    const porBanda: [number, number, number, number] = [0, 0, 0, 0];
    let suma = 0;
    for (const par of base.parrafos) { porBanda[bandaDe(par.score)]++; suma += par.score; }
    asignarCarriles(base.parrafos);
    return {
      h1Id: clave,
      titulo: base.titulo,
      fase: base.fase,
      parrafos: base.parrafos,
      porBanda,
      rigidezMedia: base.parrafos.length ? Math.round(suma / base.parrafos.length) : 0,
    };
  });

  const porBanda: [number, number, number, number] = [0, 0, 0, 0];
  let sumaTotal = 0;
  for (const f of filas) {
    for (let i = 0; i < 4; i++) porBanda[i] += f.porBanda[i];
    sumaTotal += f.parrafos.reduce((a, p) => a + p.score, 0);
  }
  const total = paragraphs.length;
  const rigidezMedia = total ? Math.round(sumaTotal / total) : 0;
  const filaMasRigida = filas.length ? filas.reduce((a, b) => (b.rigidezMedia > a.rigidezMedia ? b : a)) : null;

  return { filas, total, porBanda, rigidezMedia, vozHumana: 100 - rigidezMedia, enAlerta: porBanda[2] + porBanda[3], filaMasRigida };
}
