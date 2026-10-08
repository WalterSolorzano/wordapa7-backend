/**
 * WordAPA7 — Fase 4: capa PDF en reposo.
 *
 * Renderiza el PDF de sesión (pdf.js) DETRÁS del texto HTML alineado
 * por página. Cuando status === 'hidden', se desmonta (el HTML manda).
 * La alineación HTML↔PDF usa los mismos offsets de página del layout
 * real (mismo origen de verdad, sin doble predicción).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import type { RestLayerStatus } from '../../lib/usePdfRestLayer';

// Configurar el worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface PdfRestLayerProps {
  pdfUrl: string | null;
  pageCount: number | null;
  status: RestLayerStatus;
}

export const PdfRestLayer: React.FC<PdfRestLayerProps> = ({ pdfUrl, pageCount, status }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Cargar el documento PDF cuando la URL cambia
  useEffect(() => {
    if (status === 'hidden' || status === 'idle') return;
    const loadPdf = async () => {
      if (!pdfUrl) return;
      try {
        const loadingTask = pdfjsLib.getDocument({ url: pdfUrl });
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
        setCurrentPage(1);
      } catch (e: any) {
        console.error('[PdfRestLayer] Error cargando PDF:', e);
      }
    };
    loadPdf();
  }, [pdfUrl, status]);

  // Renderizar la página actual en el canvas
  useEffect(() => {
    if (status === 'hidden' || status === 'idle') return;
    const renderPage = async () => {
      if (!pdfDoc || !canvasRef.current) return;
      try {
        const page = await pdfDoc.getPage(currentPage);
        const scale = 1.0; // Escala base — el canvas se ajusta al contenedor
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (context) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          const renderContext: any = {
            canvasContext: context,
            viewport: viewport,
          };
          await page.render(renderContext).promise;
        }
      } catch (e: any) {
        console.error('[PdfRestLayer] Error renderizando página:', e);
      }
    };
    renderPage();
  }, [pdfDoc, currentPage, status]);

  // No renderizar cuando está hidden o idle
  if (status === 'hidden' || status === 'idle') {
    return null;
  }

  if (status === 'loading') {
    return (
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--canvas-bg)',
          zIndex: 1,
        }}
      >
        <Loader2
          size={24}
          strokeWidth="var(--icon-stroke)"
          style={{ animation: 'spin 1s linear infinite' }}
        />
      </div>
    );
  }

  return (
    <div
      data-testid="pdf-rest-layer"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--canvas-bg)',
        zIndex: 1, // Detrás del HTML (z-index mayor)
        pointerEvents: 'none', // No interceptar clics
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          boxShadow: 'var(--shadow-lg)',
        }}
      />
    </div>
  );
};
