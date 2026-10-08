import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReviewGate } from '../components/review/ReviewGate';
import type { AuditItem } from '../lib/auditItems';
import type { AIReviewParagraph } from '../api/backend';

const item = (id: string, category: AuditItem['category']): AuditItem =>
  ({ id, element_id: `e${id}`, category, subtype: 'x', severity: 'medium', summary: 's', detail: '', originalText: '', pageNumber: 1, phase: null, readOnly: false }) as AuditItem;

const par = (index: number, score: number): AIReviewParagraph =>
  ({ element_id: `e${index}`, index, type: 'paragraph', text: 'x', ai_score: score, ai_category: 'MEDIUM', findings: [], spelling: [] }) as AIReviewParagraph;

const el = (id: string): { id: string; type: string; text: string } => ({ id, type: 'paragraph', text: 'x' });

const props = (over = {}) => ({
  items: [item('1', 'style')],
  elements: [el('e1')] as never,
  paragraphs: [par(0, 10)] as never,
  isScanning: false,
  onScan: vi.fn(),
  onStartRevision: vi.fn(),
  onOpenAiRoom: vi.fn(),
  ...over,
});

describe('ReviewGate — puerta limpia 70/30', () => {
  it('combina revisión (70) e IA (30) en un solo % coloreado por banda', () => {
    // 1 hallazgo en 1 párrafo => revisión 0; IA voz humana 90 => 0.7*0 + 0.3*90 = 27
    render(<ReviewGate {...props()} />);
    expect(screen.getByTestId('gate-combinado').textContent).toBe('27%');
  });

  it('tiene dos entradas sin cards y separadas', () => {
    render(<ReviewGate {...props()} />);
    expect(screen.getByText('Empezar revisión')).toBeTruthy();
    expect(screen.getByText('Ver mapa de IA')).toBeTruthy();
    expect(screen.queryByTestId('gate-matrix')).toBeNull();
  });

  it('«Ver mapa de IA» se deshabilita sin párrafos en alerta', () => {
    render(<ReviewGate {...props({ paragraphs: [par(0, 10)] })} />);
    const boton = screen.getByText('Ver mapa de IA').closest('button') as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
  });

  it('las entradas navegan a cada sala', () => {
    const onStartRevision = vi.fn();
    const onOpenAiRoom = vi.fn();
    render(<ReviewGate {...props({ paragraphs: [par(0, 80)], onStartRevision, onOpenAiRoom })} />);
    fireEvent.click(screen.getByText('Empezar revisión'));
    fireEvent.click(screen.getByText('Ver mapa de IA'));
    expect(onStartRevision).toHaveBeenCalled();
    expect(onOpenAiRoom).toHaveBeenCalled();
  });

  it('sin revisión ni análisis muestra el estado vacío', () => {
    render(<ReviewGate {...props({ items: [], paragraphs: [] })} />);
    expect(screen.getByText('Aún no hay una revisión')).toBeTruthy();
  });

  it('«Reanalizar documento» dispara el escaneo', () => {
    const onScan = vi.fn();
    render(<ReviewGate {...props({ paragraphs: [par(0, 80)], onScan })} />);
    fireEvent.click(screen.getByText('Reanalizar documento'));
    expect(onScan).toHaveBeenCalled();
  });
});
