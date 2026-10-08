/**
 * WordAPA7 — T16 (paso 3b): los dos canales de un hallazgo son el MISMO canal.
 *
 * El párrafo que se está leyendo se pinta en dos lugares a la vez: la hoja
 * (`PaperCanvas`) y la tarjeta de lectura (`FocusReadingCard`). Antes cada uno
 * armaba su propio `MarkSource` —seis campos del store que había que mantener
 * sincronizados a mano— y la bandera de citas estaba duplicada: el lienzo la
 * tomaba de su estado local y la tarjeta la fijaba en `true`. Apagar las citas
 * en el lienzo dejaba a la tarjeta subrayándolas: un defecto, dos canales, dos
 * verdades, que es lo que AGENTS.md §2 prohíbe.
 *
 * Estos tests no comprueban que el subrayado funcione (eso lo hace
 * `readingText.test.tsx`): comprueban que los dos canales LÉAN LO MISMO.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { defaultPortada } from '../store/slices/coverSlice';
import { PaperCanvas } from '../components/layout/PaperCanvas';
import { FocusReadingCard } from '../components/review/FocusReadingCard';
import type { AuditItem } from '../hooks/useReviewWorkbench';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(),
  explainElement: vi.fn(),
  suggestCaption: vi.fn(),
}));

const TEXTO = 'El metodo sigue a Garcia (2020) en su diseno experimental.';

const elemento = {
  id: 'e1', type: 'paragraph', text: TEXTO, style_name: 'Normal', alignment: 'left',
  font_name: 'Times New Roman', font_size: 12, is_bold: false, is_italic: false,
  is_bullet: false, left_indent_cm: 0, confidence: 1, is_user_modified: false,
  needs_review: false, auto_applied: false, cita_ids: [],
};

const documento = {
  session_id: 's-3b', file_name: 't.docx', apa_format: 'student',
  elementos: undefined,
  elements: [elemento], referencias: [], meta: { page_count: 1 },
} as never;

const item: AuditItem = {
  id: 'h1', element_id: 'e1', category: 'spelling', subtype: 'ortografia',
  severity: 'medium', summary: 'Ortografía', detail: 'Falta tilde',
  originalText: TEXTO, pageNumber: 1, phase: null, readOnly: false,
};

const store = (showCitationMarks: boolean) => {
  useDocStore.setState({
    doc: documento, portada: { ...defaultPortada }, reviewResult: null,
    proofreadFindings: [], citationAuditResult: null, aiIndices: null,
    validationIssues: [], sugerenciasProactivas: true, dismissedCommentIds: [],
    showCitationMarks,
  } as never);
};

/** Los `<mark>` de citas se distinguen por su token, no por su texto: el mismo
 *  texto puede venir subrayado por el corrector o por el comentario. */
const citasDe = (raiz: HTMLElement): HTMLElement[] =>
  [...raiz.querySelectorAll('mark')].filter((m) =>
    (m.getAttribute('style') || '').includes('severity-info-soft'),
  );

const montarLosDosCanales = () =>
  render(
    <>
      <PaperCanvas />
      <FocusReadingCard item={item} totalFindings={1} />
    </>,
  );

beforeEach(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

/* ── La bandera de citas: un solo interruptor para los dos canales ────────── */

describe('T16 (3b) — la bandera de citas no puede divergir', () => {
  /* No hay ninguna "tira" que se encienda: hoy el resaltado de citas no tiene
     control en la UI, y lo que estos tests hacen es escribir el interruptor del
     store (`showCitationMarks`) y observar los dos canales. El nombre del test
     tiene que decir eso, no un control que no existe. */

  it('con `showCitationMarks` en true, los dos canales subrayan la cita', () => {
    store(true);
    const { container } = montarLosDosCanales();
    // Si esto dejara de ser cierto, el arreglo de un canal rompería el otro:
    // `MARK_STYLE.citation` es la prueba de que el mark es de citas.
    expect(citasDe(container).length).toBeGreaterThan(0);
    expect(citasDe(screen.getByLabelText('Párrafo en revisión')).length).toBeGreaterThan(0);
  });

  it('con `showCitationMarks` en false, NINGÚN canal subraya la cita', () => {
    store(false);
    const { container } = montarLosDosCanales();
    // El caso que motivó el arreglo: la tarjeta fijaba `true` en su propio
    // `MarkSource` y seguía subrayando con el interruptor del store apagado.
    expect(citasDe(container)).toHaveLength(0);
    expect(citasDe(screen.getByLabelText('Párrafo en revisión'))).toHaveLength(0);
  });
});


/* ── Una sola construcción del origen de marcas ──────────────────────────── */

const NODE_FS = 'node:fs';
const NODE_PATH = 'node:path';
const NODE_URL = 'node:url';
let CANAL_HOJA = '';
let CANAL_TARJETA = '';
beforeAll(async () => {
  const { readFileSync } = await import(/* @vite-ignore */ NODE_FS);
  const { resolve } = await import(/* @vite-ignore */ NODE_PATH);
  const { fileURLToPath } = await import(/* @vite-ignore */ NODE_URL);
  const raiz = fileURLToPath(import.meta.url).replace(/[^/\\]+$/, '');
  CANAL_HOJA = readFileSync(resolve(raiz, '../components/layout/PaperCanvas.tsx'), 'utf8');
  CANAL_TARJETA = readFileSync(resolve(raiz, '../components/review/FocusReadingCard.tsx'), 'utf8');
});

describe('T16 (3b) — ningún canal construye su propio origen de marcas', () => {
  it.each([
    ['PaperCanvas', () => CANAL_HOJA],
    ['FocusReadingCard', () => CANAL_TARJETA],
  ])('%s no arma su propio MarkSource', (_nombre, leer) => {
    const src = leer();
    // Un `MarkSource` a mano son seis campos que hay que mantener iguales a
    // mano en los dos archivos: la forma exacta en que divergieron una vez.
    expect(src).not.toMatch(/showCitations:/);
    expect(src).not.toMatch(/buildCommentContext\(/);
    // Y ambos tienen que leer del módulo que los dos comparten.
    expect(src).toMatch(/useMarkSource/);
  });
});
