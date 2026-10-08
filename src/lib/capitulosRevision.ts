import type { ElementModel } from '../types';
import type { AuditItem } from './auditItems';

export interface CapituloRevision {
  /** id del elemento H1 que abre el capítulo. */
  id: string;
  titulo: string;
  elementoId: string;
  index: number;
  elementIds: string[];
}

export function construirCapitulos(elements: readonly ElementModel[]): CapituloRevision[] {
  const caps: CapituloRevision[] = [];
  for (const e of elements) {
    const esH1 = e.type === 'heading' && e.heading_level === 1;
    if (esH1) {
      caps.push({
        id: e.id,
        titulo: (e.text || '').trim() || 'Capítulo sin título',
        elementoId: e.id,
        index: caps.length,
        elementIds: [e.id],
      });
    } else if (caps.length > 0) {
      caps[caps.length - 1].elementIds.push(e.id);
    }
  }
  return caps;
}

export function capituloDeElemento(
  caps: readonly CapituloRevision[],
  elementId: string,
): CapituloRevision | null {
  return caps.find((c) => c.elementIds.includes(elementId)) ?? null;
}

export function contarPorCapitulo(
  items: readonly AuditItem[],
  caps: readonly CapituloRevision[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of caps) out[c.id] = 0;
  for (const it of items) {
    const cap = capituloDeElemento(caps, it.element_id);
    if (cap) out[cap.id] += 1;
  }
  return out;
}
