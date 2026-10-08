import { describe, it, expect } from 'vitest';
import { normalizarNombreBase, sonVersionesSimilares } from '../lib/versionDetector';

describe('normalizarNombreBase', () => {
  it('quita extensión .docx', () => {
    expect(normalizarNombreBase('Tesis.docx')).toBe('tesis');
  });

  it('quita sufijo Windows (1)', () => {
    expect(normalizarNombreBase('Tesis (1).docx')).toBe('tesis');
  });

  it('quita sufijo _final', () => {
    expect(normalizarNombreBase('Tesis_final.docx')).toBe('tesis');
  });

  it('quita sufijo _DEFINITIVO', () => {
    expect(normalizarNombreBase('Tesis_DEFINITIVO.docx')).toBe('tesis');
  });

  it('quita sufijo _v2', () => {
    expect(normalizarNombreBase('Tesis_v2.docx')).toBe('tesis');
  });

  it('quita nombre de persona al final', () => {
    expect(normalizarNombreBase('Tesis_EDITADO_Juan.docx')).toBe('tesis editado');
  });

  it('no quita parte del nombre real si no es sufijo', () => {
    expect(normalizarNombreBase('Metodologia_final.docx')).toBe('metodologia');
  });
});

describe('sonVersionesSimilares', () => {
  it('mismo nombre → similares', () => {
    expect(sonVersionesSimilares('Tesis.docx', 'Tesis.docx')).toBe(true);
  });

  it('con sufijo (1) → similares', () => {
    expect(sonVersionesSimilares('Tesis.docx', 'Tesis (1).docx')).toBe(true);
  });

  it('_final vs _DEFINITIVO → similares', () => {
    expect(sonVersionesSimilares('Tesis_final.docx', 'Tesis_DEFINITIVO.docx')).toBe(true);
  });

  it('nombres distintos → NO similares', () => {
    expect(sonVersionesSimilares('Tesis.docx', 'Informe.docx')).toBe(false);
  });

  it('nombre demasiado corto → NO similares', () => {
    expect(sonVersionesSimilares('ab.docx', 'ac.docx')).toBe(false);
  });

  it('Levenshtein ≤ 2 → similares (typo)', () => {
    expect(sonVersionesSimilares('Tesiss.docx', 'Tesis.docx')).toBe(true);
  });

  it('Levenshtein > 2 → NO similares', () => {
    expect(sonVersionesSimilares('TesisA.docx', 'TesisXYZ.docx')).toBe(false);
  });
});
