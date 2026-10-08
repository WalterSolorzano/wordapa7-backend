/**
 * FASE 4 — PdfRestLayer: render pdf.js detrás del HTML.
 *
 * El componente recibe pdfUrl y pageCount, renderiza cada página en un
 * <canvas> con pdf.js, y se posiciona detrás del HTML (z-index menor).
 * Cuando status === 'hidden', se desmonta o baja opacidad a 0.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { PdfRestLayer } from '../components/layout/PdfRestLayer';

// Mock de pdf.js
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 3,
      getPage: vi.fn(() => Promise.resolve({
        getViewport: () => ({ width: 612, height: 792 }),
        render: () => ({ promise: Promise.resolve() }),
      })),
    }),
  })),
}));

describe('PdfRestLayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no renderiza cuando status es hidden', () => {
    let container: HTMLElement;
    act(() => {
      const result = render(
        <PdfRestLayer
          pdfUrl="/api/preview-pdf/test/rest.pdf"
          pageCount={3}
          status="hidden"
        />
      );
      container = result.container;
    });
    expect(container!.firstChild).toBeNull();
  });

  it('renderiza contenedor cuando status es ready', async () => {
    let container: HTMLElement;
    await act(async () => {
      const result = render(
        <PdfRestLayer
          pdfUrl="/api/preview-pdf/test/rest.pdf"
          pageCount={3}
          status="ready"
        />
      );
      container = result.container;
      // Esperar a que se resuelvan los useEffects
      await new Promise((r) => setTimeout(r, 10));
    });
    // El contenedor debería tener al menos un div (el contenedor del canvas)
    expect(container!.querySelector('div')).toBeTruthy();
  });

  it('renderiza loading cuando status es loading', () => {
    let container: HTMLElement;
    act(() => {
      const result = render(
        <PdfRestLayer
          pdfUrl={null}
          pageCount={null}
          status="loading"
        />
      );
      container = result.container;
    });
    expect(container!.querySelector('div')).toBeTruthy();
  });

  it('no renderiza cuando status es idle', () => {
    let container: HTMLElement;
    act(() => {
      const result = render(
        <PdfRestLayer
          pdfUrl={null}
          pageCount={null}
          status="idle"
        />
      );
      container = result.container;
    });
    expect(container!.firstChild).toBeNull();
  });
});
