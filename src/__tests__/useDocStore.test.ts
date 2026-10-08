/**
 * WordAPA7 — Zustand Store Tests
 *
 * Verifica el comportamiento del store useDocStore:
 * - Estado inicial
 * - Actualizaciones de estado
 * - Acciones store sin llamadas API (mocked)
 * - Perfiles de reglas y portada
 * - Wizard answers
 * - Logica de filtrado Quick/Review mode
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDocStore } from '../store/useDocStore';
import { APAFormat, BulletStyle, NumberStyle } from '../types';

// Mock del modulo API
vi.mock('../api/backend', () => ({
  uploadDocxFile: vi.fn(),
  classifyWithLLM: vi.fn(),
  updateElement: vi.fn(),
  reorderElements: vi.fn(),
  validateDocument: vi.fn(),
  generatePreview: vi.fn(),
  listSessions: vi.fn(),
  recoverSession: vi.fn(),
}));

// Resetear el store antes de cada test
beforeEach(() => {
  useDocStore.setState({
    doc: null,
    rules: {
      profile_name: 'APA 7 Estandar',
      is_default: true,
      margins_cm: 2.54,
      font_family: 'Times New Roman',
      font_size_pt: 12,
      line_spacing: 2.0,
      paragraph_indent_cm: 1.27,
      alignment: 'left',
      space_before_pt: 0,
      space_after_pt: 0,
      bullet_style_level1: 'disc' as BulletStyle,
      bullet_style_level2: 'circle' as BulletStyle,
      bullet_style_level3: 'square' as BulletStyle,
      number_style_level1: 'decimal' as NumberStyle,
      number_style_level2: 'lowerLetter' as NumberStyle,
      number_style_level3: 'lowerRoman' as NumberStyle,
      reference_hanging_indent_cm: 1.27,
      doi_as_hyperlink: true,
      figure_label_prefix: 'Figura',
      table_label_prefix: 'Tabla',
      heading_numbering_style_lvl1: 'decimal',
      heading_numbering_style_lvl2: 'decimal',
      heading_numbering_style_lvl3: 'decimal',
      heading_levels: {
        1: { bold: true, italic: false, alignment: 'center', indent_cm: 0, inline_text: false },
        2: { bold: true, italic: false, alignment: 'left', indent_cm: 0, inline_text: false },
        3: { bold: true, italic: true, alignment: 'left', indent_cm: 0, inline_text: false },
        4: { bold: true, italic: false, alignment: 'left', indent_cm: 1.27, inline_text: true },
        5: { bold: true, italic: true, alignment: 'left', indent_cm: 1.27, inline_text: true },
      },
    },
    ruleProfiles: [],
    portada: {
      apa_format: 'student' as APAFormat,
      title: '',
      institution: '',
      course: '',
      date: '',
      running_head: '',
      author_note: '',
    },
    /* El acta va aparte de la portada: el autor es un dato del documento y con
       la portada original conservada uno guardado dentro de la portada no sale.
       Ver el motivo en `python/models.py`. */
    acta: { autor: '', profesor_asesor: [], comite: [], fecha_defensa: '', grupo: '' },
    portadaProfiles: [],
    references: [],
    validationIssues: [],
  });
});

// ── ESTADO INICIAL ────────────────────────────────────────────────────────

describe('useDocStore — estado inicial', () => {
  it('inicia con doc en null', () => {
    const { doc } = useDocStore.getState();
    expect(doc).toBeNull();
  });

  it('inicia con el ruleset APA por defecto', () => {
    const { rules } = useDocStore.getState();
    expect(rules.profile_name).toBe('APA 7 Estandar');
    expect(rules.font_family).toBe('Times New Roman');
    expect(rules.font_size_pt).toBe(12);
    expect(rules.margins_cm).toBe(2.54);
    expect(rules.line_spacing).toBe(2.0);
    expect(rules.paragraph_indent_cm).toBe(1.27);
  });

  it('inicia con portada por defecto en formato student', () => {
    const { portada } = useDocStore.getState();
    expect(portada.apa_format).toBe('student');
    expect(portada.title).toBe('');
  });

  it('inicia con listas vacias de referencias y validacion', () => {
    const { references, validationIssues } = useDocStore.getState();
    expect(references).toHaveLength(0);
    expect(validationIssues).toHaveLength(0);
  });
});

// ── REGLAS ────────────────────────────────────────────────────────────────

describe('useDocStore — reglas', () => {
  it('setRules actualiza campos parciales', () => {
    useDocStore.getState().setRules({ font_family: 'Arial', font_size_pt: 11 });

    const { rules } = useDocStore.getState();
    expect(rules.font_family).toBe('Arial');
    expect(rules.font_size_pt).toBe(11);
    expect(rules.line_spacing).toBe(2.0); // no cambia
  });

  it('saveRuleProfile guarda un perfil nuevo', () => {
    useDocStore.getState().saveRuleProfile('Prof. Martinez');

    const { ruleProfiles } = useDocStore.getState();
    expect(ruleProfiles).toHaveLength(1);
    expect(ruleProfiles[0].profile_name).toBe('Prof. Martinez');
    expect(ruleProfiles[0].is_default).toBe(false);
  });

  it('resetRulesToDefault restaura todos los valores', () => {
    useDocStore.getState().setRules({
      font_family: 'Comic Sans',
      font_size_pt: 16,
      line_spacing: 3.0,
    });
    useDocStore.getState().resetRulesToDefault();

    const { rules } = useDocStore.getState();
    expect(rules.font_family).toBe('Times New Roman');
    expect(rules.font_size_pt).toBe(12);
    expect(rules.line_spacing).toBe(2.0);
  });
});

// ── PORTADA ───────────────────────────────────────────────────────────────

describe('useDocStore — portada', () => {
  it('setPortada actualiza campos parciales', () => {
    useDocStore.getState().setPortada({ title: 'Nuevo Titulo', institution: 'UNAN' });
    useDocStore.getState().updateActaField('autor', 'Juan Perez');

    const { portada, acta } = useDocStore.getState();
    expect(portada.title).toBe('Nuevo Titulo');
    expect(portada.institution).toBe('UNAN');
    /* El autor NO pasa por la portada. Es la separacion de la fase: con
       `use_original_cover` el bloque de portada no se toca, asi que un autor
       guardado ahi no llegaba nunca al `.docx`. */
    expect(acta.autor).toBe('Juan Perez');
    expect('author' in portada).toBe(false);
  });

  it('savePortadaProfile guarda un perfil nuevo', () => {
    useDocStore.getState().setPortada({
      title: 'Tesis de Maestria',
      institution: 'UNAM',
      apa_format: 'professional' as APAFormat,
    });
    useDocStore.getState().savePortadaProfile('Tesis UNAM');

    const { portadaProfiles } = useDocStore.getState();
    expect(portadaProfiles).toHaveLength(1);
    expect(portadaProfiles[0].profile_name).toBe('Tesis UNAM');
  });

  it('portada cambia entre student y professional', () => {
    useDocStore.getState().setPortada({ apa_format: 'professional' as APAFormat });

    const { portada } = useDocStore.getState();
    expect(portada.apa_format).toBe('professional');
  });
});

// ── REFERENCIAS ───────────────────────────────────────────────────────────

describe('useDocStore — referencias', () => {
  it('addReference agrega una nueva referencia', () => {
    const ref = {
      id: 'ref_1',
      authors: ['Garcia, J.'],
      year: '2023',
      title: 'Estudio sobre IA',
      source: 'Revista de Tecnologia',
      raw_text: 'Garcia, J. (2023). Estudio sobre IA.',
    };

    useDocStore.getState().addReference(ref);

    const { references } = useDocStore.getState();
    expect(references).toHaveLength(1);
    expect(references[0].id).toBe('ref_1');
  });

  it('removeReference elimina una referencia existente', () => {
    useDocStore.getState().addReference({
      id: 'ref_1',
      authors: ['A'],
      year: '2023',
      title: 'T',
      source: 'S',
      raw_text: 'raw',
    });
    useDocStore.getState().addReference({
      id: 'ref_2',
      authors: ['B'],
      year: '2024',
      title: 'T2',
      source: 'S2',
      raw_text: 'raw2',
    });

    useDocStore.getState().removeReference('ref_1');

    const { references } = useDocStore.getState();
    expect(references).toHaveLength(1);
    expect(references[0].id).toBe('ref_2');
  });

  it('removeReference con id inexistente no falla', () => {
    expect(() => useDocStore.getState().removeReference('no_existe')).not.toThrow();
    expect(useDocStore.getState().references).toHaveLength(0);
  });
});

// Se captura en ambito de modulo, al importar, antes de que ningun test mute el
// store: asi se observa el default real del slice y no el valor que escribe el
// beforeEach. Un setState crea la clave aunque el slice no la declare, asi que
// leerla dentro del test solo se comprobaria a si mismo.
const RAIL_PINNED_DEFAULT = useDocStore.getState().railPinned;

describe('T2 — estado del rail de iconos', () => {
  beforeEach(() => {
    useDocStore.setState({ railPinned: false });
  });

  it('empieza desanclado', () => {
    expect(RAIL_PINNED_DEFAULT).toBe(false);
  });

  it('setRailPinned ancla y desancla el flyout', () => {
    useDocStore.getState().setRailPinned(true);
    expect(useDocStore.getState().railPinned).toBe(true);
    useDocStore.getState().setRailPinned(false);
    expect(useDocStore.getState().railPinned).toBe(false);
  });

  it('ya no expone leftSidebarWidth: el ancho del rail es fijo de 56px', () => {
    expect('leftSidebarWidth' in useDocStore.getState()).toBe(false);
    expect('setLeftSidebarWidth' in useDocStore.getState()).toBe(false);
  });
});
