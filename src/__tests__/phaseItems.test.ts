import { describe, it, expect } from 'vitest';
import {
  collectAuditItems,
  phaseLabel,
  PHASE_ORDER,
  PHASE_LABELS,
  type AuditSources,
} from '../lib/auditItems';
import type { ProofreadFinding } from '../types';

const base: ProofreadFinding = {
  element_id: 'e1',
  start: 0,
  end: 6,
  excerpt: 'Conocer',
  kind: 'paragraph_words',
  severity: 'warn',
  message: 'verbo impreciso',
  source: 'local',
};

const sources = (findings: ProofreadFinding[]): AuditSources => ({
  elements: [],
  reviewResult: null,
  proofreadFindings: findings,
  citationAuditResult: null,
});

describe('fase en los hallazgos', () => {
  it('un hallazgo sin fase es general, no una fase inventada', () => {
    const items = collectAuditItems(sources([{ ...base }]));
    expect(items).toHaveLength(1);
    expect(items[0].phase).toBeNull();
    expect(items[0].readOnly).toBe(false);
  });

  it('un hallazgo con fase la conserva', () => {
    const items = collectAuditItems(sources([{ ...base, phase: 'metodo' }]));
    expect(items[0].phase).toBe('metodo');
  });

  it('una regla general declarada como "global" se traduce a null', () => {
    // El motor dice "global" para las reglas que no pertenecen a ninguna
    // fase. Para la vista eso es lo mismo que no tener fase: se agrupa
    // aparte, no dentro de una fase inventada.
    const items = collectAuditItems(sources([{ ...base, kind: 'first_person', phase: 'global' }]));
    expect(items[0].phase).toBeNull();
  });

  it('read_only viaja y no se pierde', () => {
    const items = collectAuditItems(sources([
      { ...base, kind: 'portada_title_larga', phase: 'portada', read_only: true },
    ]));
    expect(items[0].readOnly).toBe(true);
  });

  it('un hallazgo de solo lectura no trae texto sugerido', () => {
    // La contraparte de la invariante del motor: no hay nada que aplicar.
    const items = collectAuditItems(sources([
      { ...base, kind: 'portada_title_larga', phase: 'portada', read_only: true },
    ]));
    expect(items[0].suggestedText).toBeUndefined();
  });

  it('las reglas de OBJETIVOS no entran al workbench: viven en su analizador', () => {
    // Si entraran, el motor de Redacción contaría dos veces el mismo verbo y el
    // rail prometería trabajo que la sala de revisión no muestra.
    const items = collectAuditItems(sources([
      { ...base, kind: 'bloom_vague', phase: 'objetivos' },
      { ...base, kind: 'objetivo_sin_variable', phase: 'objetivos' },
      { ...base, kind: 'paragraph_words', phase: 'metodo' },
    ]));
    expect(items).toHaveLength(1);
    expect(items[0].subtype).toBe('largo_parrafo');
  });
});

describe('nombres de fase', () => {
  it('phaseLabel nombra las fases del vocabulario y no rompe con una desconocida', () => {
    expect(phaseLabel('objetivos')).toBe('Objetivos');
    expect(phaseLabel('portada')).toBe('Portada');
    expect(phaseLabel('sin_fase')).toBe('Seccion sin nombre');
    expect(phaseLabel(null)).toBe('Todo el documento');
    expect(phaseLabel('clave_inventada')).toBe('Seccion sin nombre');
  });

  it('el orden de fases es el del documento, no alfabetico', () => {
    expect(PHASE_ORDER[0]).toBe('portada');
    expect(PHASE_ORDER.indexOf('introduccion')).toBeLessThan(
      PHASE_ORDER.indexOf('conclusiones'),
    );
    // Portada es zona protegida y va primera; referencias y anexos, al final.
    expect(PHASE_ORDER.indexOf('referencias')).toBeGreaterThan(
      PHASE_ORDER.indexOf('objetivos'),
    );
  });

  it('toda clave de PHASE_ORDER tiene etiqueta', () => {
    for (const k of PHASE_ORDER) {
      expect(PHASE_LABELS[k], `falta etiqueta para ${k}`).toBeTruthy();
    }
  });
});

describe('los motores que no saben de fase', () => {
  it('el detector de IA declara fase nula, porque es una regla general', () => {
    const items = collectAuditItems({
      elements: [],
      reviewResult: {
        paragraphs: [
          { element_id: 'e9', text: 'x', ai_score: 80, ai_category: 'HIGH' } as never,
        ],
      },
      proofreadFindings: [],
      citationAuditResult: null,
    });
    expect(items).toHaveLength(1);
    expect(items[0].phase).toBeNull();
    expect(items[0].readOnly).toBe(false);
  });
});
