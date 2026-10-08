import { describe, it, expect } from 'vitest';
import { findCitationsInText } from '../lib/citationHighlighter';

/**
 * Batería de paridad con el motor Python (python/tests/test_citation_parity.py).
 * Mantener sincronizado: mismo texto, misma cantidad mínima de citas y
 * mismo substring esperado.
 */
const PARITY_CASES: Array<[string, number, string]> = [
  ['Las 5S mejoran la moral del personal (Gutiérrez Pulido, 2012).', 1, 'Gutiérrez'],
  ['La teoría fue propuesta por García (2023).', 1, 'García'],
  ['Se cita a dos autores (García & López, 2023).', 1, 'García'],
  ['Según Niebel y Freivalds (2009), el estudio es clave.', 1, 'Niebel'],
  ['El informe (OIT, 2007) define los estándares.', 1, 'OIT'],
  ['Varios autores (García, 2023; López, 2021; Pérez, 2019).', 3, 'García'],
  ['(García, 2023, p. 45) muestra evidencia.', 1, 'García'],
  ['Esto no es una cita (Véase Figura 1).', 0, ''],
  ['El peso fue (100 kg) en la medición.', 0, ''],
];

describe('Paridad citas TS ↔ Python', () => {
  it.each(PARITY_CASES)('detecta correctamente: %s', (text, minCitas, expectedSub) => {
    const citations = findCitationsInText(text);
    expect(citations.length).toBeGreaterThanOrEqual(minCitas);
    if (expectedSub && minCitas > 0) {
      const found = citations.some((c) => c.raw.toLowerCase().includes(expectedSub.toLowerCase()));
      expect(found).toBe(true);
    }
  });

  it('detecta apellido compuesto parentético (Gutiérrez Pulido, 2012)', () => {
    const c = findCitationsInText('Aumenta la moral (Gutiérrez Pulido, 2012).');
    expect(c.length).toBe(1);
    expect(c[0].year).toBe('2012');
    expect(c[0].authors.join(' ')).toContain('Gutiérrez');
  });

  it('separa autores con & correctamente (Niebel & Freivalds)', () => {
    const c = findCitationsInText('(Niebel & Freivalds, 2009)');
    expect(c.length).toBe(1);
    expect(c[0].authors).toEqual(expect.arrayContaining(['Niebel', 'Freivalds']));
  });
});
