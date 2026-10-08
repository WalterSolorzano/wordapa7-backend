/**
 * Integración PaperCanvas ↔ TablaRender (Task 10):
 * - una tabla con `table_slice` pinta solo su rebanada, sin leyenda y con "Continúa";
 * - una tabla sin leyenda ofrece el botón de generar y NO gasta tokens al montar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { PaperCanvas } from '../components/layout/PaperCanvas';
import { suggestCaption } from '../api/backend';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn((u: string) => u),
  explainElement: vi.fn(),
  suggestCaption: vi.fn().mockResolvedValue('Leyenda sugerida'),
  rewriteText: vi.fn(),
}));
vi.mock('../api/layout', () => ({ paginateLayout: vi.fn() }));

const tablaBase = {
  element_id: 'tab1',
  headers: ['H'],
  rows: [['fila0'], ['fila1'], ['fila2']],
  caption: '',
  table_number: 1,
  style: 'apa',
};

function montarDoc(extra: Record<string, unknown>) {
  useDocStore.setState({
    doc: {
      session_id: 's1',
      file_name: 't.docx',
      apa_format: 'student',
      elements: [
        {
          id: 'tab1',
          type: 'table',
          text: '',
          table_info: tablaBase,
          ...extra,
        },
      ],
      referencias: [],
      meta: { page_count: 1 },
    } as any,
  });
}

describe('PaperCanvas tabla', () => {
  beforeEach(() => {
    const s = useDocStore.getState();
    if (typeof (s as any).resetForTests === 'function') (s as any).resetForTests();
    vi.clearAllMocks();
  });

  it('una rebanada pinta solo sus filas y marca continuación', () => {
    montarDoc({ table_slice: { start: 1, end: 3 } });
    render(<PaperCanvas />);
    expect(screen.getByText('fila1')).toBeTruthy();
    expect(screen.getByText('fila2')).toBeTruthy();
    expect(screen.queryByText('fila0')).toBeNull();
    expect(screen.getByText(/Continúa/)).toBeTruthy();
  });

  it('sin leyenda ofrece generar y no gasta tokens al montar', () => {
    montarDoc({});
    render(<PaperCanvas />);
    expect(screen.getByRole('button', { name: /generar leyenda con ia/i })).toBeTruthy();
    expect(suggestCaption).not.toHaveBeenCalled();
  });
});
