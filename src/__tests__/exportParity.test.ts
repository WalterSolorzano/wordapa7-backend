/**
 * Fase 5 — Paridad canvas ↔ docx exportado.
 *
 * Verifica que getPageGeometry (frontend) produce las mismas dimensiones
 * que page_setup_dict (backend) para los mismos inputs (margins_cm,
 * page_size, font_size_pt, line_spacing).
 */
import { describe, it, expect } from 'vitest';
import { getPageGeometry, PT_TO_PX, CM_TO_PX } from '../lib/pageGeometry';
import { normalizarPageSize } from '../lib/pageSizeEnHtml';

describe('Paridad canvas ↔ docx exportado', () => {
  it('Letter: dimensiones coinciden con page_setup_dict', () => {
    const rules = {
      margins_cm: 2.54,
      font_size_pt: 12,
      line_spacing: 2,
      page_size: 'carta' as const,
    };

    const geom = getPageGeometry(rules);

    // page_setup_dict (backend) retorna dimensiones en pt
    // Letter: 612 x 792 pt
    expect(geom.pageW).toBeCloseTo(PT_TO_PX(612), 5);
    expect(geom.pageH).toBeCloseTo(PT_TO_PX(792), 5);

    // Margen: 2.54 cm = 1 inch = 72 pt
    expect(geom.marginPx).toBeCloseTo(CM_TO_PX(2.54), 5);
    expect(geom.marginPx).toBeCloseTo(PT_TO_PX(72), 5);
  });

  it('A4: dimensiones coinciden con page_setup_dict', () => {
    const rules = {
      margins_cm: 2.54,
      font_size_pt: 12,
      line_spacing: 2,
      page_size: 'a4' as const,
    };

    const geom = getPageGeometry(rules);

    // A4: 595 x 842 pt
    expect(geom.pageW).toBeCloseTo(PT_TO_PX(595), 5);
    expect(geom.pageH).toBeCloseTo(PT_TO_PX(842), 5);
  });

  it('margins_cm afecta marginPx correctamente', () => {
    const base = {
      font_size_pt: 12,
      line_spacing: 2,
      page_size: 'carta' as const,
    };

    const geom1 = getPageGeometry({ ...base, margins_cm: 2.54 });
    const geom2 = getPageGeometry({ ...base, margins_cm: 3 });

    expect(geom2.marginPx).toBeGreaterThan(geom1.marginPx);
    expect(geom2.contentW).toBeLessThan(geom1.contentW);
  });

  it('font_size_pt afecta lineHeightPx correctamente', () => {
    const base = {
      margins_cm: 2.54,
      line_spacing: 2,
      page_size: 'carta' as const,
    };

    const geom1 = getPageGeometry({ ...base, font_size_pt: 12 });
    const geom2 = getPageGeometry({ ...base, font_size_pt: 14 });

    expect(geom2.lineHeightPx).toBeGreaterThan(geom1.lineHeightPx);
  });

  it('line_spacing afecta lineHeightPx correctamente', () => {
    const base = {
      margins_cm: 2.54,
      font_size_pt: 12,
      page_size: 'carta' as const,
    };

    const geom1 = getPageGeometry({ ...base, line_spacing: 1 });
    const geom2 = getPageGeometry({ ...base, line_spacing: 2 });

    expect(geom2.lineHeightPx).toBeGreaterThan(geom1.lineHeightPx);
  });

  it('normalizarPageSize: carta y a4 son los únicos valores válidos', () => {
    expect(normalizarPageSize('carta')).toBe('carta');
    expect(normalizarPageSize('a4')).toBe('a4');
    expect(normalizarPageSize('A4')).toBe('a4');
    expect(normalizarPageSize('CARTA')).toBe('carta');
    expect(normalizarPageSize('invalid')).toBe('carta');
  });

  it('page_size inválido default a carta', () => {
    const geom = getPageGeometry({
      margins_cm: 2.54,
      font_size_pt: 12,
      line_spacing: 2,
      page_size: 'invalid' as any,
    });

    // Default a carta: 612 x 792 pt
    expect(geom.pageW).toBeCloseTo(PT_TO_PX(612), 5);
    expect(geom.pageH).toBeCloseTo(PT_TO_PX(792), 5);
  });
});
