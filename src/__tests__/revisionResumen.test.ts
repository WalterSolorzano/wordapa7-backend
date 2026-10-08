import { describe, it, expect } from 'vitest';
import { resumenMotores, calificacionPorFase, resumenObjetivos } from '../lib/revisionResumen';
import type { AuditItem } from '../lib/auditItems';
import type { ElementModel } from '../types';

const item = (id: string, category: AuditItem['category'], phase: string | null, severity: AuditItem['severity'] = 'medium', element_id = 'e'): AuditItem =>
  ({ id, element_id, category, subtype: 'x', severity, summary: '', detail: '', originalText: '', pageNumber: null, phase, readOnly: false }) as AuditItem;

describe('resumenMotores', () => {
  it('cuenta por motor, secciones distintas y mezcla de severidad, sin IA', () => {
    const items = [item('1', 'spelling', 'metodo', 'high'), item('2', 'spelling', 'metodo', 'low', 'e2'), item('3', 'ai', null)];
    const r = resumenMotores(items);
    const ort = r.find((m) => m.motor === 'spelling')!;
    expect(ort.count).toBe(2);
    expect(ort.secciones).toBe(1);
    expect(ort.porSeveridad.high).toBe(1);
    expect(r.some((m) => m.motor === 'ai')).toBe(false);
  });
});

describe('calificacionPorFase', () => {
  it('normaliza por los párrafos de cada fase', () => {
    const elements = [
      { id: 'h', type: 'heading', heading_level: 1, text: 'Método' },
      { id: 'e', type: 'paragraph', heading_level: null, text: 'x' },
    ] as ElementModel[];
    const r = calificacionPorFase([item('1', 'spelling', 'metodo')], elements);
    expect(r[0].phase).toBe('metodo');
    expect(r[0].calificacion).toBe(0); // 1 hallazgo en 1 párrafo
  });
});

describe('resumenObjetivos', () => {
  it('separa general de específicos y cuenta medibles', () => {
    const elements = [
      { id: 'h1', type: 'heading', heading_level: 1, text: 'Objetivos' },
      { id: 'h2g', type: 'heading', heading_level: 2, text: 'Objetivo general' },
      { id: 'g', type: 'paragraph', heading_level: null, text: 'Analizar el impacto de X en Y.' },
      { id: 'h2e', type: 'heading', heading_level: 2, text: 'Objetivos específicos' },
      { id: 'e1', type: 'paragraph', heading_level: null, text: 'Conocer las herramientas.' },
    ] as ElementModel[];
    const r = resumenObjetivos(elements);
    expect(r.general?.verboActual).toBe('analizar');
    expect(r.especificos).toHaveLength(1);
    expect(r.nivelGeneral).toBe(4);
  });
});
