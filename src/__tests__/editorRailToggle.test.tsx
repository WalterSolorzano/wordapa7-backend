/**
 * WordAPA7 — D1: El toggle del Asistente IA vive en RightSidePanel.
 *
 * El módulo src/components/wizard/EditorRail.tsx fue ELIMINADO por completo
 * (módulo muerto: solo exportaba helpers sin consumidores). Este archivo
 * conserva únicamente la cobertura del toggle accesible del panel lateral;
 * los locks que referenciaban EditorRail murieron con él.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { RightSidePanel } from '../components/activity/RightSidePanel';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(),
  explainElement: vi.fn().mockResolvedValue({ explanation: 'test' }),
  suggestCaption: vi.fn().mockResolvedValue('test caption'),
  syncAllProviderKeys: vi.fn().mockResolvedValue({ ok: true, applied: [] }),
}));

describe('D1 — toggle Asistente IA en RightSidePanel', () => {
  beforeEach(() => {
    useDocStore.setState({
      doc: null,
      forceRightPanelOpen: false,
      selectedElementId: null,
      selectedReferenceId: null,
    });
  });

  it('panel colapsado: botón accesible "Asistente IA" abre el panel y limpia selección', () => {
    useDocStore.setState({
      selectedElementId: 'elem-1',
      selectedReferenceId: 'ref-1',
    });
    render(<RightSidePanel />);
    const btn = screen.getByRole('button', { name: 'Asistente IA' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    const s = useDocStore.getState();
    expect(s.forceRightPanelOpen).toBe(true);
    expect(s.selectedElementId).toBeNull();
    expect(s.selectedReferenceId).toBeNull();
  });
});
