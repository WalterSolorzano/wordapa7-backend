import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AiDocumentPreview } from '../components/review/AiDocumentPreview';
import { PaperCanvas } from '../components/layout/PaperCanvas';
import { useDocStore } from '../store/useDocStore';
import { defaultPortada } from '../store/slices/coverSlice';
import type { AIReviewParagraph } from '../api/backend';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(),
  explainElement: vi.fn(),
  suggestCaption: vi.fn(),
  rewriteText: vi.fn(),
}));

const paragraphs = [
  { element_id: 'p1', index: 0, type: 'paragraph', text: 'uno', ai_score: 82, ai_category: 'HIGH', findings: [], spelling: [] },
] as AIReviewParagraph[];

const baseEl = (id: string, type: string, extra: Record<string, unknown> = {}) => ({
  id,
  type,
  text: `Texto de ${id}`,
  alignment: 'left',
  font_name: 'Times New Roman',
  font_size: 12,
  is_bold: false,
  is_italic: false,
  confidence: 1,
  cita_ids: [],
  ...extra,
});

const makeDoc = (elements: unknown[]) => ({
  session_id: 's1',
  file_name: 't.docx',
  apa_format: 'student',
  elements,
  referencias: [],
  meta: { page_count: 1 },
});

describe('AiDocumentPreview', () => {
  it('muestra la leyenda de bandas y el toggle', () => {
    render(<AiDocumentPreview paragraphs={paragraphs} onClose={vi.fn()} onOpenParagraph={vi.fn()} />);
    expect(screen.getByText('Mostrar manchas')).toBeTruthy();
    expect(screen.getByText('Baja')).toBeTruthy();
    expect(screen.getByText('Crítica')).toBeTruthy();
  });

  it('cerrar vuelve a IA-L0', () => {
    const onClose = vi.fn();
    render(<AiDocumentPreview paragraphs={paragraphs} onClose={onClose} onOpenParagraph={vi.fn()} />);
    fireEvent.click(screen.getByText(/Cerrar vista previa/));
    expect(onClose).toHaveBeenCalled();
  });

  it('clic en un párrafo manchado abre su detalle', () => {
    useDocStore.setState({ doc: makeDoc([baseEl('p1', 'paragraph')]) as never, portada: { ...defaultPortada } });
    const onOpenParagraph = vi.fn();
    const { container } = render(<AiDocumentPreview paragraphs={paragraphs} onClose={vi.fn()} onOpenParagraph={onOpenParagraph} />);
    const el = container.querySelector('[data-element-id="p1"]');
    expect(el).toBeTruthy();
    fireEvent.click(el!);
    expect(onOpenParagraph).toHaveBeenCalledWith('p1');
  });

  it('clic en un párrafo sin mancha no abre nada', () => {
    useDocStore.setState({ doc: makeDoc([baseEl('p2', 'paragraph')]) as never, portada: { ...defaultPortada } });
    const onOpenParagraph = vi.fn();
    const { container } = render(<AiDocumentPreview paragraphs={paragraphs} onClose={vi.fn()} onOpenParagraph={onOpenParagraph} />);
    fireEvent.click(container.querySelector('[data-element-id="p2"]')!);
    expect(onOpenParagraph).not.toHaveBeenCalled();
  });
});

describe('PaperCanvas readOnly — la portada no se escribe', () => {
  it('la portada APA montada es de solo lectura', () => {
    useDocStore.setState({
      doc: makeDoc([baseEl('p1', 'paragraph')]) as never,
      portada: { ...defaultPortada, use_original_cover: false },
    });
    const { container } = render(<PaperCanvas readOnly />);
    expect(container.querySelector('[data-solo-lectura="true"]')).toBeTruthy();
    expect(container.querySelector('input, textarea, [contenteditable="true"]')).toBeNull();
  });

  it('el doble clic en un elemento de portada no abre editor', () => {
    useDocStore.setState({
      doc: makeDoc([baseEl('cv1', 'paragraph', { is_cover_section: true })]) as never,
      portada: { ...defaultPortada },
    });
    const { container } = render(<PaperCanvas readOnly />);
    const el = container.querySelector('#paper-elem-cv1');
    expect(el).toBeTruthy();
    fireEvent.doubleClick(el!);
    expect(container.querySelector('textarea')).toBeNull();
  });
});
