/**
 * "Verificar bibliografía" tiene dos mitades y las dos se prueban acá:
 *
 *  1. La ACCIÓN del store refleja el veredicto del backend y no inventa uno:
 *     solo pasa a `verificada` lo que el servidor marcó, y conserva el DOI
 *     normalizado que la ficha no tenía.
 *  2. El BOTÓN existe cuando hay referencias y llama a la acción una vez.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Step5ReferencesWizard } from '../components/referencias/Step5ReferencesWizard';
import { useDocStore } from '../store/useDocStore';

const ref = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  authors: ['Hirano, H.'],
  year: '1995',
  title: `Título ${id}`,
  source: 'Editorial',
  raw_text: '',
  formatted_apa: `Hirano, H. (1995). Título ${id}. Editorial.`,
  verificada: false,
  ...extra,
});

const DOC = {
  id: 'd1',
  name: 'tesis.docx',
  elements: [{ id: 'p1', type: 'paragraph', text: 'Hirano (1995) lo demostró.' }],
} as never;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('verifyReferences (acción del store)', () => {
  it('solo marca lo que el backend verificó y agrega el DOI que faltaba', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { id: 'r1', verificada: true, fuente_verificacion: 'doi', doi_or_url: '10.1000/xyz' },
          { id: 'r2', verificada: false, fuente_verificacion: null },
        ],
        verificadas: 1,
        pendientes: 1,
      }),
    }));
    const showToast = vi.fn();
    useDocStore.setState({
      references: [ref('r1'), ref('r2')],
      doc: DOC,
      showToast,
    } as never);

    await useDocStore.getState().verifyReferences();

    const [r1, r2] = useDocStore.getState().references;
    expect(r1.verificada).toBe(true);
    expect(r1.fuente_verificacion).toBe('doi');
    expect(r1.doi_or_url).toBe('10.1000/xyz');
    // La que no matcheó NO se toca: sigue Pendiente.
    expect(r2.verificada).toBeFalsy();
    expect(showToast).toHaveBeenCalledWith('1 verificada(s), 1 sin coincidencia', 'warning');
  });
});

describe('el botón Verificar bibliografía', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aparece con referencias y dispara la acción una sola vez', async () => {
    const verifyReferences = vi.fn().mockResolvedValue(undefined);
    useDocStore.setState({
      references: [ref('r1')],
      selectedReferenceId: 'r1',
      citationAuditResult: null,
      doc: DOC,
      isLoading: false,
      verifyReferences,
      addReference: vi.fn(),
      removeReference: vi.fn(),
      updateReferences: vi.fn(),
      resolveDoiReference: vi.fn(),
      resolveDoisBlock: vi.fn(),
      runCitationAudit: vi.fn(),
      resolveGhostCitation: vi.fn(),
      showToast: vi.fn(),
      setSelectedElementId: vi.fn(),
      setScrollTargetId: vi.fn(),
      setSelectedReferenceId: vi.fn(),
      setWizardStep: vi.fn(),
    } as never);

    render(<Step5ReferencesWizard />);
    const boton = screen.getByRole('button', { name: /verificar bibliografía/i });
    fireEvent.click(boton);

    await waitFor(() => expect(verifyReferences).toHaveBeenCalledTimes(1));
  });
});
