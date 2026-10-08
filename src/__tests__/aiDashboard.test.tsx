import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AiDashboard } from '../components/review/AiDashboard';
import type { PerfilIA } from '../lib/aiPerfil';

const par = (elementId: string, score: number): { elementId: string; index: number; score: number; categoria: 'HIGH'; excerpt: string; carril: number; h2Id: null; h2Titulo: null } =>
  ({ elementId, index: 0, score, categoria: 'HIGH', excerpt: 'x', carril: 0, h2Id: null, h2Titulo: null });

const perfil: PerfilIA = {
  filas: [
    { h1Id: 'h1', titulo: 'Marco teórico', fase: 'marco_teorico', porBanda: [1, 1, 1, 1], rigidezMedia: 64, parrafos: [par('p1', 82)] },
    { h1Id: 'h2', titulo: 'Introducción', fase: 'introduccion', porBanda: [2, 1, 1, 0], rigidezMedia: 48, parrafos: [par('p2', 48)] },
  ],
  total: 312, porBanda: [3, 2, 2, 1], rigidezMedia: 22, vozHumana: 78, enAlerta: 3,
  filaMasRigida: null,
};

describe('AiDashboard (IA-L0)', () => {
  it('muestra la voz humana en grande y el riesgo medio', () => {
    render(<AiDashboard perfil={perfil} onOpenSection={vi.fn()} onOpenPreview={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByTestId('ia-voz-humana').textContent).toBe('78%');
    expect(screen.getByText(/riesgo medio de IA/)).toBeTruthy();
  });

  it('toca una fila y entra a su detalle', () => {
    const onOpenSection = vi.fn();
    render(<AiDashboard perfil={perfil} onOpenSection={onOpenSection} onOpenPreview={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('Marco teórico'));
    expect(onOpenSection).toHaveBeenCalledWith('h1');
  });

  it('marca FOCO la peor sección y abre la vista previa', () => {
    const onOpenPreview = vi.fn();
    render(<AiDashboard perfil={perfil} onOpenSection={vi.fn()} onOpenPreview={onOpenPreview} onBack={vi.fn()} />);
    expect(screen.getByText('FOCO')).toBeTruthy();
    fireEvent.click(screen.getByText('Ver en documento'));
    expect(onOpenPreview).toHaveBeenCalled();
  });
});
