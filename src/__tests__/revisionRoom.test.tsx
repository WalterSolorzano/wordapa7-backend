import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RevisionRoom } from '../components/review/RevisionRoom';
import type { AuditItem } from '../lib/auditItems';

const item = (id: string, category: AuditItem['category']): AuditItem =>
  ({ id, element_id: `e${id}`, category, subtype: 'x', severity: 'medium', summary: '', detail: '', originalText: '', pageNumber: 1, phase: null, readOnly: false }) as AuditItem;

describe('RevisionRoom (REV-L0)', () => {
  it('muestra solo la calificación de revisión, sin componente de IA', () => {
    render(<RevisionRoom items={[item('1', 'spelling')]} elements={[] as never} onOpenDetail={vi.fn()} onOpenObjetivos={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByTestId('rev-calificacion')).toBeTruthy();
    expect(screen.queryByTestId('gate-combinado')).toBeNull();
  });

  it('una fila de motor abre REV-L1 filtrada por motor', () => {
    const onOpenDetail = vi.fn();
    render(<RevisionRoom items={[item('1', 'spelling')]} elements={[] as never} onOpenDetail={onOpenDetail} onOpenObjetivos={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('Ortografía'));
    expect(onOpenDetail).toHaveBeenCalledWith({ motor: 'spelling' });
  });

  it('el panel Objetivos abre el analizador', () => {
    const onOpenObjetivos = vi.fn();
    render(<RevisionRoom items={[item('1', 'spelling')]} elements={[] as never} onOpenDetail={vi.fn()} onOpenObjetivos={onOpenObjetivos} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('Analizar objetivos'));
    expect(onOpenObjetivos).toHaveBeenCalled();
  });

  it('replica las leyendas y el panel de fases del mockup (REV-L0)', () => {
    render(<RevisionRoom items={[item('1', 'spelling')]} elements={[] as never} onOpenDetail={vi.fn()} onOpenObjetivos={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText('90+ · «Esto está sólido, sigue así.»')).toBeTruthy();
    expect(screen.getByText('Bloom · nivel 4 exigido')).toBeTruthy();
    expect(screen.getByText(/misma normalización por tamaño/)).toBeTruthy();
  });

  it('omite el sufijo de secciones cuando el motor no declara fase', () => {
    render(<RevisionRoom items={[item('1', 'spelling')]} elements={[] as never} onOpenDetail={vi.fn()} onOpenObjetivos={vi.fn()} onBack={vi.fn()} />);
    expect(screen.queryByText(/secciones/)).toBeNull();
  });
});
