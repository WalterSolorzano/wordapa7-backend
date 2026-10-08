/**
 * "Sin citar" es un grupo propio: una referencia que está en la bibliografía
 * pero no aparece citada en el cuerpo no es lo mismo que una "sin verificar".
 * Antes eso solo se veía como una insignia dentro de Verificadas/Pendientes;
 * ahora hay una pestaña que la separa.
 *
 * La pestaña existe SOLO cuando corrió la auditoría: sin dato de huérfanas no
 * se puede afirmar que una referencia no se cita, y una lista vacía lo fingiría.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Step5ReferencesWizard } from '../components/referencias/Step5ReferencesWizard';
import { useDocStore } from '../store/useDocStore';

const ref = (id: string, authors: string[], year: string, title: string) => ({
  id,
  authors,
  year,
  title,
  source: '',
  formatted_apa: `${authors[0]} (${year}). ${title}.`,
  raw_text: '',
  verificada: true,
});

const DOC = {
  id: 'd1',
  name: 'tesis.docx',
  elements: [
    { id: 'p1', type: 'paragraph', text: 'García (2021) lo demostró.' },
  ],
} as never;

function montar(references: unknown[], auditoria: unknown) {
  useDocStore.setState({
    references,
    selectedReferenceId: 'r1',
    citationAuditResult: auditoria,
    doc: DOC,
    isLoading: false,
    addReference: vi.fn(),
    removeReference: vi.fn(),
    updateReferences: vi.fn(),
    resolveDoiReference: vi.fn().mockResolvedValue(undefined),
    resolveDoisBlock: vi.fn().mockResolvedValue(undefined),
    runCitationAudit: vi.fn(),
    resolveGhostCitation: vi.fn().mockResolvedValue(undefined),
    showToast: vi.fn(),
    setSelectedElementId: vi.fn(),
    setScrollTargetId: vi.fn(),
    setSelectedReferenceId: vi.fn(),
    setWizardStep: vi.fn(),
  } as never);
  return render(<Step5ReferencesWizard />);
}

beforeEach(() => vi.clearAllMocks());

describe('el grupo "Sin citar"', () => {
  it('aparece con su conteo cuando la auditoría marcó huérfanas', () => {
    montar(
      [ref('r1', ['García, A.'], '2021', 'Citada'), ref('r2', ['López, B.'], '2019', 'Sin citar')],
      { orphan_references: [{ id: 'r2' }], ghost_citations: [] },
    );

    const tab = screen.getByRole('tab', { name: /sin citar/i });
    expect(tab.textContent).toMatch(/1/);
  });

  it('al abrirla, muestra la referencia huérfana y no el vacío', () => {
    montar(
      [ref('r1', ['García, A.'], '2021', 'Citada'), ref('r2', ['López, B.'], '2019', 'Sin citar')],
      { orphan_references: [{ id: 'r2' }], ghost_citations: [] },
    );

    fireEvent.click(screen.getByRole('tab', { name: /sin citar/i }));

    expect(screen.queryByText(/grupo de referencias sin citar/i)).toBeNull();
    expect(screen.getByRole('tab', { name: /sin citar/i }).getAttribute('aria-selected')).toBe('true');
  });

  it('NO aparece si la auditoría no corrió: nadie miró, no se puede afirmar', () => {
    montar([ref('r1', ['García, A.'], '2021', 'Citada')], null);

    expect(screen.queryByRole('tab', { name: /sin citar/i })).toBeNull();
  });
});
