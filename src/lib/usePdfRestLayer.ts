/**
 * WordAPA7 — Fase 4: capa PDF en reposo.
 *
 * Mismo gate que Fase 2 (1.5s sin tecleo). Tras la pausa, llama
 * POST /api/layout/pdf-export y guarda el estado de la capa PDF.
 * Al detectar una mutación nueva (tecleo), pasa a 'hidden' — la capa
 * PDF se oculta y el HTML manda de nuevo.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { exportLayoutPdf, type LayoutPdfExportResult } from '../api/layout';
import { resolveAssetUrl } from '../api/http';

export type RestLayerStatus = 'idle' | 'loading' | 'ready' | 'hidden';

export interface RestLayerState {
  status: RestLayerStatus;
  pdfUrl: string | null;
  pageCount: number | null;
  reason: string | null;
}

const REST_GATE_MS = 1500;

const INITIAL_STATE: RestLayerState = {
  status: 'idle',
  pdfUrl: null,
  pageCount: null,
  reason: null,
};

export function usePdfRestLayer(sessionId: string | null): { restLayerState: RestLayerState; notifyMutation: () => void } {
  const [restLayerState, setRestLayerState] = useState<RestLayerState>(INITIAL_STATE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef(sessionId);

  // Detectar mutación: si sessionId cambia, pasar a hidden
  useEffect(() => {
    if (sessionId !== sessionIdRef.current) {
      sessionIdRef.current = sessionId;
      setRestLayerState({
        status: 'hidden',
        pdfUrl: null,
        pageCount: null,
        reason: 'Sesión cambiada',
      });
    }
  }, [sessionId]);

  const scheduleExport = useCallback(() => {
    if (!sessionId) return;

    // Limpiar timer anterior
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    setRestLayerState((prev) => ({ ...prev, status: 'loading' }));

    timerRef.current = setTimeout(async () => {
      try {
        const result: LayoutPdfExportResult = await exportLayoutPdf(sessionId);
        if (result.available && result.pdf_url) {
          setRestLayerState({
            status: 'ready',
            /* `pdf_url` es root-relative; en Electron hay que apuntarlo al
               backend (`app://` no lo sirve) o pdf.js no encuentra el archivo. */
            pdfUrl: resolveAssetUrl(result.pdf_url),
            pageCount: result.page_count ?? null,
            reason: result.reason ?? null,
          });
        } else {
          setRestLayerState({
            status: 'hidden',
            pdfUrl: null,
            pageCount: null,
            reason: result.reason ?? 'No se pudo generar el PDF',
          });
        }
      } catch (err: any) {
        setRestLayerState({
          status: 'hidden',
          pdfUrl: null,
          pageCount: null,
          reason: err.message || 'Error al exportar PDF',
        });
      }
    }, REST_GATE_MS);
  }, [sessionId]);

  // Schedule export cuando sessionId cambia
  useEffect(() => {
    if (!sessionId) return;
    scheduleExport();
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [sessionId, scheduleExport]);

  // Notify mutation: pasar a hidden inmediatamente
  const notifyMutation = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setRestLayerState((prev) => ({
      ...prev,
      status: 'hidden',
    }));
  }, []);

  return { restLayerState, notifyMutation };
}
