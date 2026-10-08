import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { getWhatsAppComment, WhatsAppComment } from '../components/layout/WhatsAppComment';
import { useDocStore } from '../store/useDocStore';
import { ElementModel } from '../types';

beforeEach(() => {
  // Resetear el store para evitar interferencia entre archivos de test
  useDocStore.setState({ citationAuditResult: null, validationIssues: [], apiKey: '', doc: null } as any);
});

function mkElem(over: Partial<ElementModel>): ElementModel {
  return {
    id: 'e1',
    type: 'paragraph',
    heading_level: 1,
    list_level: 1,
    text: '',
    style_name: 'Normal',
    alignment: 'left',
    font_name: 'Times New Roman',
    font_size: 12,
    is_bold: false,
    is_italic: false,
    is_bullet: false,
    left_indent_cm: 0,
    confidence: 0.5,
    cita_ids: [],
    ...over,
  } as ElementModel;
}

const NO_CTX = { ghostCitations: [], orphanReferences: [], validationIssues: [] };
// El auditor de estilo solo comenta tras ejecutar "Auditar párrafos".
const AUDITED_CTX = { ...NO_CTX, styleAuditRun: true };

describe('getWhatsAppComment — IA / emojis', () => {
  it('detects checklist emoji in paragraph text', () => {
    const c = getWhatsAppComment(mkElem({ text: '\u2705 Cumple con las normas \u274c' }), NO_CTX);
    expect(c).not.toBeNull();
    expect(c!.kind).toBe('emoji');
  });

  it('detects emojis inside table cells', () => {
    const c = getWhatsAppComment(
      mkElem({
        type: 'table',
        table_info: { element_id: 't1', headers: ['C', 'C'], rows: [['A', '\u2705']], caption: '', table_number: 1 } as any,
      }),
      NO_CTX,
    );
    expect(c).not.toBeNull();
    expect(c!.kind).toBe('table_emoji');
  });

  it('detects "en resumen" and accented "en conclusión"', () => {
    expect(getWhatsAppComment(mkElem({ text: 'En resumen, los datos son claros.' }), AUDITED_CTX)!.kind).toBe('conclusion');
    expect(getWhatsAppComment(mkElem({ text: 'En conclusión, se puede afirmar que…' }), AUDITED_CTX)!.kind).toBe('conclusion');
  });

  it('detects "cabe destacar" as AI phrase', () => {
    expect(getWhatsAppComment(mkElem({ text: 'Cabe destacar que el análisis fue robusto.' }), AUDITED_CTX)!.kind).toBe('ai');
  });

  it('returns null for clean academic text even after audit', () => {
    const c = getWhatsAppComment(
      mkElem({ text: 'La investigación educativa en América Latina mostró resultados significativos durante el estudio.' }),
      AUDITED_CTX,
    );
    expect(c).toBeNull();
  });

  it('does NOT flag style issues before an explicit audit', () => {
    // Sin "Auditar párrafos" no se juzga el estilo: solo fallas estructurales.
    expect(getWhatsAppComment(mkElem({ text: 'En resumen, los datos son claros.' }), NO_CTX)).toBeNull();
    expect(getWhatsAppComment(mkElem({ text: 'Cabe destacar que el análisis fue robusto.' }), NO_CTX)).toBeNull();
    expect(getWhatsAppComment(mkElem({ text: 'Nosotros realizamos el experimento.' }), NO_CTX)).toBeNull();
  });
});

describe('getWhatsAppComment — citas y referencias', () => {
  it('detects a ghost citation attached to the element', () => {
    const ctx = { ghostCitations: [{ element_id: 'e1', authors: ['Pablito', 'García'], raw_text: 'Pablito (2020)' }], orphanReferences: [], validationIssues: [] };
    const c = getWhatsAppComment(mkElem({ id: 'e1', text: 'Según Pablito (2020), los resultados…' }), ctx);
    expect(c).not.toBeNull();
    expect(c!.kind).toBe('ghost_citation');
    expect(c!.text).toMatch(/pablito/i);
  });

  it('detects orphan references over the references heading', () => {
    const ctx = { ghostCitations: [], orphanReferences: [{ id: 'r1' }, { id: 'r2' }], validationIssues: [] };
    const c = getWhatsAppComment(mkElem({ type: 'heading', text: 'Referencias Bibliográficas' }), ctx);
    expect(c).not.toBeNull();
    expect(c!.kind).toBe('orphan_references');
    expect(c!.text).toContain('2');
  });

  it('does not flag orphan references over a normal heading', () => {
    const ctx = { ghostCitations: [], orphanReferences: [{ id: 'r1' }], validationIssues: [] };
    expect(getWhatsAppComment(mkElem({ type: 'heading', text: 'Introducción' }), ctx)).toBeNull();
  });
});

describe('getWhatsAppComment — validación APA', () => {
  it('maps a figuras validation issue', () => {
    const ctx = { ghostCitations: [], orphanReferences: [], validationIssues: [{ element_id: 'e1', category: 'figuras', message: 'sin número' }] };
    const c = getWhatsAppComment(mkElem({ id: 'e1', text: 'Diagrama del modelo.' }), ctx);
    expect(c).not.toBeNull();
    expect(c!.kind).toBe('validation_figuras');
  });

  it('maps a tablas validation issue', () => {
    const ctx = { ghostCitations: [], orphanReferences: [], validationIssues: [{ element_id: 'e1', category: 'tablas', message: 'sin título' }] };
    expect(getWhatsAppComment(mkElem({ id: 'e1', text: 'Condiciones.' }), ctx)!.kind).toBe('validation_tablas');
  });
});

describe('getWhatsAppComment — estilo de redacción', () => {
  it('flags shouting (ALL CAPS paragraph)', () => {
    const c = getWhatsAppComment(mkElem({ text: 'ESTE TEXTO ESTÁ TODO EN MAYÚSCULAS Y NADIE SABE POR QUÉ' }), AUDITED_CTX);
    expect(c).not.toBeNull();
    expect(c!.kind).toBe('shouting');
  });

  it('does NOT flag an ALL CAPS heading (legítimo)', () => {
    expect(getWhatsAppComment(mkElem({ type: 'heading', text: 'INTRODUCCIÓN' }), AUDITED_CTX)).toBeNull();
  });

  it('detects spanglish', () => {
    const c = getWhatsAppComment(mkElem({ text: 'The estudio fue muy importante and los resultados fueron claros de la investigación' }), AUDITED_CTX);
    expect(c).not.toBeNull();
    expect(c!.kind).toBe('spanglish');
  });

  it('detects a duplicated word', () => {
    const c = getWhatsAppComment(mkElem({ text: 'El estudio estudió estudió la muestra durante el análisis de la investigación' }), AUDITED_CTX);
    expect(c).not.toBeNull();
    expect(c!.kind).toBe('duplicate');
  });

  it('detects "de de" as a 2-letter duplicate (DUPLICATE_RE bajado a 2 letras)', () => {
    const c = getWhatsAppComment(mkElem({ text: 'El análisis de de la muestra resultó ser concluyente en este estudio.' }), AUDITED_CTX);
    expect(c).not.toBeNull();
    expect(c!.kind).toBe('duplicate');
  });

  it('detects "la la" as a 2-letter duplicate', () => {
    const c = getWhatsAppComment(mkElem({ text: 'El resultado de la la prueba fue positivo durante el ensayo.' }), AUDITED_CTX);
    expect(c).not.toBeNull();
    expect(c!.kind).toBe('duplicate');
  });

  it('does NOT flag "que que" (stopword guard evita falsos positivos)', () => {
    // "que" es stopword muy frecuente: su repetición no se reporta como duplicado.
    const c = getWhatsAppComment(mkElem({ text: 'El dato que que se registró fue válido para el análisis.' }), AUDITED_CTX);
    expect(c).toBeNull();
  });

  it('detects first person', () => {
    const c = getWhatsAppComment(mkElem({ text: 'Nosotros realizamos el experimento y luego yo analicé los resultados de la investigación' }), AUDITED_CTX);
    expect(c).not.toBeNull();
    expect(c!.kind).toBe('first_person');
  });

  it('detects an undefined dotted acronym', () => {
    const c = getWhatsAppComment(mkElem({ text: 'El método S.C.E.M. se aplicó durante toda la investigación del proyecto' }), AUDITED_CTX);
    expect(c).not.toBeNull();
    expect(c!.kind).toBe('acronym');
  });
});

describe('getWhatsAppComment — estructura', () => {
  it('flags an image without caption', () => {
    const c = getWhatsAppComment(
      mkElem({ type: 'image', image_info: { element_id: 'i1', file_path: 'a.png', filename: 'a.png', caption: '' } as any }),
      NO_CTX,
    );
    expect(c).not.toBeNull();
    expect(c!.kind).toBe('image_no_caption');
  });
});

describe('WhatsAppComment component', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('renders library comments instantly with structured category and tail', () => {
    const { container } = render(<WhatsAppComment elem={mkElem({ id: 'x', text: '\u2705 Cumple con las normas' })} />);
    expect(container.querySelector('.wa-bubble')).toBeTruthy();
    expect(container.querySelector('.wa-bubble-header')).toBeTruthy();
    expect(container.querySelector('.wa-tail')).toBeTruthy();
  });

  it('renders nothing for clean academic text', () => {
    const { container } = render(
      <WhatsAppComment elem={mkElem({ text: 'La investigación mostró resultados significativos durante el estudio de la muestra.' })} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a positive comment when positive prop is set on a clean element', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <WhatsAppComment
        elem={mkElem({ type: 'heading', text: 'Marco Teórico' })}
        positive
      />,
    );
    act(() => { vi.advanceTimersByTime(2000); });
    rerender(
      <WhatsAppComment
        elem={mkElem({ type: 'heading', text: 'Marco Teórico' })}
        positive
      />,
    );
    const bubble = container.querySelector('.wa-bubble');
    expect(bubble).toBeTruthy();
    expect(container.querySelector('.wa-comment-positive')).toBeTruthy();
    expect(bubble!.textContent).toMatch(/limpia|limpio|corregir|queja|bien|tremendo|molestar|siga/i);
    vi.useRealTimers();
  });
});
