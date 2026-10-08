/**
 * WordAPA7 — Fase 2: repaginación en vivo.
 *
 * Cualquier mutación del doc agenda un POST /api/layout/paginate ~1.5s
 * después (coalescer compartido: 1 en vuelo, nunca encadenado).
 *
 * Guard de eco: aplicar una respuesta cambia doc + layoutEcho; ESE cambio
 * también re-ejecuta este efecto, y ahí no se re-agenda. Como la respuesta
 * es idempotente (Task 7), el bucle converge en ≤2 iteraciones.
 */
import { useEffect, useRef } from 'react';
import { DocumentModel } from '../types';
import { useDocStore } from '../store/useDocStore';
import { paginateLayout } from '../api/layout';
import { createLayoutCoalescer } from './layoutCoalescer';

async function sendPaginate(): Promise<void> {
  const { doc } = useDocStore.getState();
  if (!doc || !doc.session_id || doc.elements.length === 0) return;
  try {
    const resp = await paginateLayout(doc.session_id);
    useDocStore.getState().applyLayoutPagination(resp);
  } catch {
    // Best-effort: backend caído o sin Word → el canvas conserva su medición.
  }
}

/** Singleton de módulo: todas las instancias de PaperCanvas comparten 1 flujo. */
export const layoutCoalescer = createLayoutCoalescer({ delayMs: 1500, send: sendPaginate });

export function useLayoutRepaginate(doc: DocumentModel | null): void {
  const layoutEcho = useDocStore((s) => s.layoutEcho);
  const echoRef = useRef(layoutEcho);
  useEffect(() => {
    if (!doc) return;
    if (layoutEcho !== echoRef.current) {
      echoRef.current = layoutEcho;
      return;                       // eco: respuesta ya aplicada → no re-agendar
    }
    layoutCoalescer.schedule();
  }, [doc, layoutEcho]);
}
