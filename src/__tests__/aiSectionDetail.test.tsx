import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AiSectionDetail } from '../components/review/AiSectionDetail';
import type { FilaPerfilIA } from '../lib/aiPerfil';
import type { AIReviewParagraph } from '../api/backend';

const fila: FilaPerfilIA = {
  h1Id: 'h1', titulo: 'Desarrollo', fase: null, rigidezMedia: 58, porBanda: [0, 1, 0, 1],
  parrafos: [
    { elementId: 'p1', index: 0, score: 82, categoria: 'HIGH', excerpt: 'La transformación digital', carril: 0, h2Id: 'h2a', h2Titulo: 'Marco' },
    { elementId: 'p2', index: 1, score: 34, categoria: 'MEDIUM', excerpt: 'Asimismo', carril: 0, h2Id: 'h2b', h2Titulo: 'Discusión' },
  ],
};
const paragraphs = [
  { element_id: 'p1', index: 0, type: 'paragraph', text: 'La transformación digital ha redefinido', ai_score: 82, ai_category: 'HIGH', findings: [{ phrase: 'La transformación digital', detail: 'Apertura genérica', severity: 'HIGH' }], spelling: [] },
  { element_id: 'p2', index: 1, type: 'paragraph', text: 'Asimismo', ai_score: 34, ai_category: 'MEDIUM', findings: [{ phrase: 'Asimismo', detail: 'Conector formulario', severity: 'MEDIUM' }], spelling: [] },
] as AIReviewParagraph[];

describe('AiSectionDetail (IA-L1)', () => {
  it('lista los párrafos agrupados por H2 y muestra el porqué real', () => {
    render(<AiSectionDetail fila={fila} paragraphs={paragraphs} onBack={vi.fn()} onMark={vi.fn()} />);
    expect(screen.getByText('Marco')).toBeTruthy();
    expect(screen.getByText('Discusión')).toBeTruthy();
    expect(screen.getByText(/Apertura genérica/)).toBeTruthy();
  });

  it('filtra por banda', () => {
    render(<AiSectionDetail fila={fila} paragraphs={paragraphs} onBack={vi.fn()} onMark={vi.fn()} />);
    fireEvent.click(screen.getByText('Medio · 1'));
    expect(screen.queryByText('Párrafo 1')).toBeNull();
    expect(screen.getAllByText(/Párrafo 2/).length).toBeGreaterThan(0);
  });

  it('resuelve el panel derecho desde la banda activa, no desde la selección excluida', () => {
    render(<AiSectionDetail fila={fila} paragraphs={paragraphs} onBack={vi.fn()} onMark={vi.fn()} />);
    expect(screen.getByText('Apertura genérica')).toBeTruthy();
    fireEvent.click(screen.getByText('Medio · 1'));
    expect(screen.queryByText('Apertura genérica')).toBeNull();
    expect(screen.getByText('Conector formulario')).toBeTruthy();
  });

  it('marca para revisar y nunca ofrece Aceptar', () => {
    const onMark = vi.fn();
    render(<AiSectionDetail fila={fila} paragraphs={paragraphs} onBack={vi.fn()} onMark={onMark} />);
    expect(screen.queryByText('Aceptar')).toBeNull();
    fireEvent.click(screen.getByText('Marcar para revisar'));
    expect(onMark).toHaveBeenCalledWith('p1');
  });

  it('resuelve el detalle por identidad cuando el arreglo compacto está desalineado', () => {
    /* El backend emite `paragraphs` COMPACTA (salta títulos cortos, imágenes,
       tablas y párrafos breves), mientras `parrafo.index` es el índice del
       elemento en `doc.elements`. Con `paragraphs[parrafo.index]` el panel leía
       `compactos[2]` (undefined) y caía al estado vacío. */
    const filaDesalineada: FilaPerfilIA = {
      h1Id: 'h1', titulo: 'Desarrollo', fase: null, rigidezMedia: 82, porBanda: [0, 0, 0, 1],
      parrafos: [
        { elementId: 'p2', index: 2, score: 82, categoria: 'HIGH', excerpt: 'La transformación digital', carril: 0, h2Id: null, h2Titulo: null },
      ],
    };
    const compactos = [
      { element_id: 'p2', index: 2, type: 'paragraph', text: 'La transformación digital ha redefinido', ai_score: 82, ai_category: 'HIGH', findings: [{ phrase: 'La transformación digital', detail: 'Apertura genérica', severity: 'HIGH' }], spelling: [] },
      { element_id: 'p9', index: 9, type: 'paragraph', text: 'Otra idea', ai_score: 60, ai_category: 'HIGH', findings: [{ phrase: 'Otra idea', detail: 'Conector formulario', severity: 'MEDIUM' }], spelling: [] },
    ] as AIReviewParagraph[];
    render(<AiSectionDetail fila={filaDesalineada} paragraphs={compactos} onBack={vi.fn()} onMark={vi.fn()} />);
    expect(screen.getByText(/Apertura genérica/)).toBeTruthy();
    expect(screen.queryByText(/Conector formulario/)).toBeNull();
  });
});
