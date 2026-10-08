/**
 * Epic A · las dos acciones de LISTA del catálogo de bibliografía.
 *
 *  - Reordenar alfabéticamente: el orden lo calcula el backend con la clave APA
 *    (apellido sin tildes). La pantalla solo lo pide y lo refleja en el store;
 *    no reordena por su cuenta ni inventa una segunda clave.
 *  - Aviso de estilo mezclado: si el cuerpo mezcla APA y citas numéricas, se
 *    avisa. No se convierte nada: unificar estilos exige los metadatos de cada
 *    fuente, que es otro trabajo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { sortReferences, detectCitationStyle } = vi.hoisted(() => ({
  sortReferences: vi.fn(),
  detectCitationStyle: vi.fn(),
}));

vi.mock('../api/backend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/backend')>();
  return { ...actual, sortReferences, detectCitationStyle };
});

import { Step5ReferencesWizard } from '../components/referencias/Step5ReferencesWizard';
import { useDocStore } from '../store/useDocStore';

const updateReferences = vi.fn();
const showToast = vi.fn();

const REF_A = { id: 'a', authors: ['Zapata, J.'], year: '2020', title: 'Zeta', verificada: true };
const REF_B = { id: 'b', authors: ['Aguilar, M.'], year: '2019', title: 'Alfa', verificada: true };

function montar() {
  useDocStore.setState({
    references: [REF_A, REF_B],
    selectedReferenceId: null,
    citationAuditResult: { ghost_citations: [], orphan_references: [] },
    doc: { id: 'd1', session_id: 's1', elements: [] },
    isLoading: false,
    updateReferences,
    showToast,
    runCitationAudit: vi.fn(),
    addReference: vi.fn(),
    removeReference: vi.fn(),
    resolveDoiReference: vi.fn().mockResolvedValue(undefined),
    resolveDoisBlock: vi.fn().mockResolvedValue(undefined),
    resolveGhostCitation: vi.fn().mockResolvedValue(undefined),
    setSelectedElementId: vi.fn(),
    setScrollTargetId: vi.fn(),
    setSelectedReferenceId: vi.fn(),
    setWizardStep: vi.fn(),
  } as never);
  return render(<Step5ReferencesWizard />);
}

beforeEach(() => {
  vi.clearAllMocks();
  detectCitationStyle.mockResolvedValue({ mixed: false, ieee: 0, vancouver: 0, apa: 0 });
});

describe('reordenar la bibliografía', () => {
  it('pide el orden al backend y lo refleja en el store', async () => {
    const ordenadas = [REF_B, REF_A];
    sortReferences.mockResolvedValue(ordenadas);
    montar();
    fireEvent.click(screen.getByRole('button', { name: /reordenar alfabéticamente/i }));
    await waitFor(() => expect(sortReferences).toHaveBeenCalledWith('s1', [REF_A, REF_B]));
    expect(updateReferences).toHaveBeenCalledWith(ordenadas);
  });

  it('no borra las referencias si el backend responde vacío o falla', async () => {
    sortReferences.mockResolvedValue([]);
    montar();
    fireEvent.click(screen.getByRole('button', { name: /reordenar alfabéticamente/i }));
    await waitFor(() => expect(sortReferences).toHaveBeenCalledWith('s1', [REF_A, REF_B]));
    // Fallback local ordena [REF_B (Aguilar), REF_A (Zapata)] sin vaciar la lista
    expect(updateReferences).toHaveBeenCalledWith([REF_B, REF_A]);
  });
});


describe('aviso de estilo mezclado', () => {
  it('no aparece cuando todo es APA', async () => {
    detectCitationStyle.mockResolvedValue({ mixed: false, ieee: 0, vancouver: 0, apa: 2 });
    montar();
    await waitFor(() => expect(detectCitationStyle).toHaveBeenCalledWith('s1'));
    expect(screen.queryByText(/más de un estilo/i)).toBeNull();
  });

  it('avisa cuando hay más de un estilo', async () => {
    detectCitationStyle.mockResolvedValue({ mixed: true, ieee: 1, vancouver: 0, apa: 1 });
    montar();
    expect(await screen.findByText(/más de un estilo/i)).toBeTruthy();
  });
});
