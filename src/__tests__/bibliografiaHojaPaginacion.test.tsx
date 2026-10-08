/**
 * La hoja de "Bibliografía completa" reparte por la altura MEDIDA de cada
 * entrada, no por la altura de la lista entera.
 *
 * El defecto que esta prueba fija: `medidorRef` colgaba del wrapper y
 * `children` devolvía un solo nodo (el bloque `APA_LISTA` completo), así que
 * `alturas` quedaba como `[altoTotal]` y el paginador trataba la primera
 * referencia como si midiera toda la bibliografía. La primera hoja recibía una
 * sola entrada aunque cupieran más.
 *
 * Se mockea `getBoundingClientRect`: los `<p>` (una entrada) miden 300 px y
 * cualquier otro nodo mide 3000 px, de modo que medir el bloque entero da un
 * resultado inconfundiblemente distinto de medir cada entrada. La aritmética
 * pura ya tiene su propia prueba en `paginarBibliografia.test.ts`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { Step5ReferencesWizard } from '../components/referencias/Step5ReferencesWizard';
import { useDocStore } from '../store/useDocStore';

const ALTURA_ENTRADA = 300;
const ALTURA_BLOQUE = 3000;

const ref = (id: string) => ({
  id,
  authors: ['Autor, A.'],
  year: '2020',
  title: `Título ${id}`,
  source: '',
  formatted_apa: `Autor, A. (2020). Título ${id}.`,
  raw_text: '',
  verificada: true,
});

const DOC = {
  id: 'd1',
  name: 'tesis.docx',
  elements: [
    { id: 'p1', type: 'paragraph', text: 'Autor (2020) lo demostró.' },
  ],
} as never;

function montar(references: unknown[]) {
  useDocStore.setState({
    references,
    selectedReferenceId: null,
    citationAuditResult: null,
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

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const height = this.tagName === 'P' ? ALTURA_ENTRADA : ALTURA_BLOQUE;
      return {
        x: 0, y: 0, top: 0, left: 0, right: 600, bottom: height,
        width: 600, height, toJSON: () => ({}),
      } as DOMRect;
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HojaBibliografia reparte por altura de cada entrada', () => {
  it('llena la primera hoja con las entradas que caben, no con una sola', () => {
    montar([ref('r1'), ref('r2'), ref('r3'), ref('r4')]);

    const hojas = screen.getAllByTestId('bibliografia-hoja');
    // Dos entradas de 300 px por hoja (300 + 300 + 300 = 900 > 832 útil).
    expect(hojas).toHaveLength(2);

    expect(within(hojas[0]).getAllByText(/^Autor, A\. \(2020\)\./)).toHaveLength(2);
    expect(within(hojas[1]).getAllByText(/^Autor, A\. \(2020\)\./)).toHaveLength(2);
  });
});
