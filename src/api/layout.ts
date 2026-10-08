/* WordAPA7 — Fase 2: cliente del endpoint de layout COM en vivo.
 * Módulo aparte de api/backend.ts a propósito: los vi.mock existentes de
 * backend son estrictos en exports; paginateLayout no debe romperlos. */
import { getApiBase } from './http';

export interface WordLineCut { offset: number; page: number }
export interface LayoutElementPage { element_id: string; page_start: number }
export interface LayoutElementCuts { element_id: string; cuts: WordLineCut[] }
export interface LayoutPageSetup {
  width_pt: number; height_pt: number;
  margin_top_pt: number; margin_bottom_pt: number;
  margin_left_pt: number; margin_right_pt: number;
}
export interface LayoutPaginateResult {
  session_id: string;
  available: boolean;
  reason?: string | null;
  provider?: string;
  total_pages?: number | null;
  elements?: LayoutElementPage[];
  line_cuts?: LayoutElementCuts[];
  page_setup?: LayoutPageSetup | null;
  elapsed_ms?: number;
  /**
   * Honesty flag (clave añadida tras el plan, fix de Task 2):
   * - true → materialización falló; layout del original (reason explica).
   * - false + reason → notas informativas del provider.
   * - false + null → limpio.
   */
  degraded?: boolean;
}

/** Repagina la sesión con Word COM (coalescer de 1.5s vive en el hook). */
export async function paginateLayout(sessionId: string): Promise<LayoutPaginateResult> {
  const res = await fetch(`${getApiBase()}/layout/paginate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface LayoutPdfExportResult {
  session_id: string;
  available: boolean;
  provider?: string;
  reason?: string | null;
  pdf_url?: string | null;
  page_count?: number | null;
  elapsed_ms?: number;
}

/** Exporta el PDF de sesión con Word COM (ExportAsFixedFormat). */
export async function exportLayoutPdf(sessionId: string): Promise<LayoutPdfExportResult> {
  const res = await fetch(`${getApiBase()}/layout/pdf-export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
