/**
 * WordAPA7 — T8: el contexto de comentarios tiene UNA construccion.
 * Antes vivia duplicado en PaperCanvas con reglas distintas de styleAuditRun,
 * lo que dejaba subrayados huerfanos cuando solo habia corrido el corrector.
 */
import { describe, it, expect } from 'vitest';
import { buildCommentContext } from '../lib/commentContext';
import type { CommentContextSource } from '../lib/commentContext';
import type { AIReviewResult } from '../api/backend';
import type { ProofreadFinding, ValidationIssue } from '../types';

const base: CommentContextSource = {
  citationAuditResult: null,
  validationIssues: [],
  sugerenciasProactivas: true,
  reviewResult: null,
  proofreadFindings: [],
};

const reviewRun: AIReviewResult = {
  session_id: 's1',
  total_paragraphs: 0,
  ai_avg_score: 0,
  flagged_count: 0,
  spelling_count: 0,
  spelling_status: 'ok',
  paragraphs: [],
  table_signals: [],
  document_signals: [],
};

const finding: ProofreadFinding = {
  element_id: 'p1',
  start: 0,
  end: 2,
  excerpt: 'Yo',
  kind: 'first_person',
  severity: 'info',
  message: 'primera persona',
  source: 'local',
};

const issue: ValidationIssue = {
  rule_id: 'r1',
  severity: 'warning',
  message: 'falta leyenda',
  suggestion: 'agregar Figura N',
};

describe('T8 — buildCommentContext', () => {
  it('sin datos, devuelve un contexto vacío y estable', () => {
    const ctx = buildCommentContext(base);
    expect(ctx.ghostCitations).toEqual([]);
    expect(ctx.orphanReferences).toEqual([]);
    expect(ctx.validationIssues).toEqual([]);
    expect(ctx.styleAuditRun).toBe(false);
  });

  it('marca el análisis de estilo si corrió el corrector, no solo el revisor de IA', () => {
    // ESTE es el caso que fallaba: solo el corrector, sin runAIReview.
    expect(buildCommentContext({ ...base, proofreadFindings: [finding] }).styleAuditRun).toBe(true);
    expect(buildCommentContext({ ...base, reviewResult: reviewRun }).styleAuditRun).toBe(true);
  });

  it('un hallazgo de fase se anuncia en la burbuja igual que uno general', () => {
    // La burbuja NO nombra fases: recibe una bandera, no los hallazgos. Eso está
    // bien, porque entonces no puede contradecir al subrayado. Lo que AGENTS.md
    // §2 sí exige es que un hallazgo de fase se ANUNCIE, no que quede subrayado
    // en un canal y mudo en el otro. Si algún día las reglas de fase tomaran un
    // camino propio, esta aserción es la que lo caza.
    const deFase: ProofreadFinding = {
      element_id: 'e1', start: 0, end: 6, excerpt: 'Conocer',
      kind: 'bloom_vague', severity: 'warn', message: 'verbo impreciso',
      source: 'local', phase: 'objetivos', read_only: false,
    };
    const dePortada: ProofreadFinding = {
      ...deFase, element_id: 'c1', kind: 'portada_title_larga',
      phase: 'portada', read_only: true,
    };
    expect(buildCommentContext({ ...base, proofreadFindings: [deFase] }).styleAuditRun).toBe(true);
    expect(buildCommentContext({ ...base, proofreadFindings: [dePortada] }).styleAuditRun).toBe(true);
  });

  it('propaga citas fantasma y huérfanas', () => {    const ctx = buildCommentContext({
      ...base,
      citationAuditResult: { ghost_citations: [{ key: '(García, 2021)' }], orphan_references: [{ ref: 'x' }] },
    });
    expect(ctx.ghostCitations).toHaveLength(1);
    expect(ctx.orphanReferences).toHaveLength(1);
  });

  it('sin sugerencias proactivas, no inventa listas de validación', () => {
    const ctx = buildCommentContext({ ...base, sugerenciasProactivas: false, validationIssues: [issue] });
    expect(ctx.validationIssues).toEqual([]);
  });

  it('normaliza dentro, no en el llamador: el valor crudo del store da lo mismo', () => {
    // Defecto: el normalizado (`!== false`) vivía en dos de los tres
    // llamadores. Si el store llega sin la tecla, el tercer canal mentiría.
    // Ahora `undefined` se lee como habilitado, igual que en los otros dos.
    expect(buildCommentContext({ ...base, validationIssues: [issue] }).validationIssues).toEqual([issue]);
    expect(buildCommentContext({ ...base, sugerenciasProactivas: undefined, validationIssues: [issue] }).validationIssues).toEqual([issue]);
  });

  it('el interruptor cubre las incidencias de validación, y eso está escrito', () => {
    /* El interruptor se llama "Sugerencias proactivas" y su pista dice "Globos
       con mejoras mientras editás": su alcance REAL, el de siempre, son las
       incidencias de validación APA (leyendas, tablas, jerarquía) que el
       corredor produce. `styleAuditRun` es otra cosa —los detectores de
       redacción, que también encienden la burbuja del corrector— y apagarlo
       dejaría al corrector con su subrayado inline y SIN burbuja: el
      msubrayado-or-something announcement would live in one channel only, que
       es la contradicción que AGENTS.md §2 prohíbe por nombre.

       La unificación de los dos canales tuvo que elegir, y eligió la burbuja
       (defensible: la burbuja y el subrayado del corrector son el MISMO
       hallazgo). Lo que no puede ser es que esa elección sea invisible: por eso
       el alcance del interruptor está escrito en `commentContext.ts` y esta
       prueba lo ata. Para cambiarlo hay que cambiar las dos cosas. */
    const conInterruptor = buildCommentContext({
      ...base,
      sugerenciasProactivas: false,
      validationIssues: [issue],
      proofreadFindings: [finding],
    });
    expect(conInterruptor.validationIssues).toEqual([]);
    // Y el corrector sigue ENCENDIDO a propósito, no por descuido:
    expect(conInterruptor.styleAuditRun).toBe(true);
  });
});
