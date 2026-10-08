import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBar } from '../components/layout/StatusBar';
import { useDocStore } from '../store/useDocStore';

vi.mock('../api/backend', () => ({
  uploadDocxFile: vi.fn(), updateElement: vi.fn(), getApiBase: vi.fn(),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://x'), fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(), explainElement: vi.fn(), suggestCaption: vi.fn(),
}));
vi.mock('../api/layout', () => ({ paginateLayout: vi.fn() }));

const docWith = (pageCount: number, nElements: number) =>
  ({
    session_id: 's1', file_name: 't.docx',
    elements: Array.from({ length: nElements }, (_, i) => ({
      id: `e${i}`, type: 'paragraph', text: `parrafo ${i}`,
    })),
    meta: { page_count: pageCount },
    referencias: [],
  }) as any;

describe('StatusBar — paginación real', () => {
  beforeEach(() => {
    useDocStore.setState({ doc: null, layoutEcho: 0, wordLayoutUnavailable: false });
  });

  it('muestra meta.page_count (verdad Word), no ceil(elements/14)', () => {
    // 30 elementos → la estimación vieja diría 3; el layout real dice 9.
    useDocStore.setState({ doc: docWith(9, 30) });
    render(<StatusBar />);
    expect(screen.getByText(/Pág\.\s*9/)).toBeTruthy();
  });

  it('sin page_count cae al conteo del lienzo (computePages)', () => {
    useDocStore.setState({ doc: docWith(0, 3) });
    render(<StatusBar />);
    // 3 párrafos cortos caben en una hoja → 1
    expect(screen.getByText(/Pág\.\s*1/)).toBeTruthy();
  });

  it('aviso honesto cuando no hay Word (D-a)', () => {
    useDocStore.setState({ doc: docWith(4, 5), wordLayoutUnavailable: true });
    const { container } = render(<StatusBar />);
    // Los mensajes de warnings viajan en el title del chip (no como texto visible).
    const badge = container.querySelector('span[title*="Se requiere Microsoft Word"]');
    expect(badge).toBeTruthy();
    expect(badge!.getAttribute('title')).toContain('Se requiere Microsoft Word');
  });
});
