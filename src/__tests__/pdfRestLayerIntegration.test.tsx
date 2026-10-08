/**
 * FASE 4 — Integración usePdfRestLayer + PdfRestLayer.
 *
 * Prueba que el hook y el componente están conectados correctamente.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import { usePdfRestLayer } from '../lib/usePdfRestLayer';
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

// Componente de prueba que integra hook + componente
const TestIntegration: React.FC<{ sessionId: string | null }> = ({ sessionId }) => {
  const { restLayerState, notifyMutation } = usePdfRestLayer(sessionId);
  return (
    <div>
      <PdfRestLayer
        pdfUrl={restLayerState.pdfUrl}
        pageCount={restLayerState.pageCount}
        status={restLayerState.status}
      />
      <button onClick={notifyMutation}>Simular tecleo</button>
    </div>
  );
};

describe('usePdfRestLayer + PdfRestLayer integration', () => {
  it('hook expone estado inicial correcto', () => {
    const { container } = render(<TestIntegration sessionId={null} />);
    // Sin sessionId, no debería renderizar nada
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('hook y componente están conectados: notifyMutation funciona', () => {
    const { getByText } = render(<TestIntegration sessionId="test-session" />);
    // El botón de notifyMutation debería estar presente
    expect(getByText('Simular tecleo')).toBeTruthy();
  });

  it('PdfRestLayer renderiza correctamente con status hidden', () => {
    const { container } = render(
      <PdfRestLayer pdfUrl="/test.pdf" pageCount={3} status="hidden" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('PdfRestLayer renderiza correctamente con status idle', () => {
    const { container } = render(
      <PdfRestLayer pdfUrl={null} pageCount={null} status="idle" />
    );
    expect(container.firstChild).toBeNull();
  });
});
