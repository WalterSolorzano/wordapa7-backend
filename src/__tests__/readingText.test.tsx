/**
 * WordAPA7 — T9: ReadingText es la unica implementacion de los resaltados
   inline. Ningun color hardcodeado: todo sale de MARK_STYLE, que son tokens.
   Y los dos canales (subrayado y burbuja) coinciden: lo que la burbuja
   descarta, el subrayado lo descarta; lo que la burbuja ancla, el subrayado
   lo ancla.
 */
import React from 'react';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ReadingText, collectMarks, MARK_STYLE, type MarkSource } from '../components/review/ReadingText';
import { getWhatsAppComment } from '../components/layout/WhatsAppComment';
import { PaperCanvas } from '../components/layout/PaperCanvas';
import { useDocStore } from '../store/useDocStore';
import { defaultPortada } from '../store/slices/coverSlice';
import type { AIReviewResult, AIReviewParagraph } from '../api/backend';
import type { ElementModel, ProofreadFinding } from '../types';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(),
  explainElement: vi.fn(),
  suggestCaption: vi.fn(),
  generateChatComment: vi.fn(),
  rewriteText: vi.fn(),
}));

// Specifier en variables + import dinamico: si Vite puede analizarlos los pasa
// por vite-plugin-node-polyfills, cuyos shims de browser no traen
// readFileSync. Mismo truco que designTokens.test.ts (T1).
const NODE_FS = 'node:fs';
const NODE_PATH = 'node:path';
const NODE_URL = 'node:url';

let SRC = '';
let CSS = '';

beforeAll(async () => {
  const { readFileSync } = await import(/* @vite-ignore */ NODE_FS);
  const { resolve } = await import(/* @vite-ignore */ NODE_PATH);
  const { fileURLToPath } = await import(/* @vite-ignore */ NODE_URL);
  const testDir = fileURLToPath(import.meta.url).replace(/[^/\\]+$/, '');
  SRC = readFileSync(resolve(testDir, '../components/review/ReadingText.tsx'), 'utf8');
  CSS = readFileSync(resolve(testDir, '../styles/design-system.css'), 'utf8');
});

const CTX_VACIO = {
  ghostCitations: [],
  orphanReferences: [],
  validationIssues: [],
  styleAuditRun: false,
};

const parrafo = (text: string, extra: Partial<AIReviewParagraph> = {}): AIReviewParagraph => ({
  element_id: 'p1',
  index: 0,
  type: 'paragraph',
  text,
  ai_score: 0.5,
  ai_category: 'MEDIUM',
  findings: [],
  spelling: [],
  ...extra,
});

const review = (paragraphs: AIReviewParagraph[]): AIReviewResult => ({
  session_id: 's1',
  total_paragraphs: paragraphs.length,
  ai_avg_score: 0.5,
  flagged_count: 0,
  spelling_count: 0,
  spelling_status: 'ok',
  paragraphs,
  table_signals: [],
  document_signals: [],
});

const elem = (text: string, extra: Partial<ElementModel> = {}): ElementModel => ({
  id: 'p1',
  type: 'paragraph',
  text,
  style_name: 'Normal',
  alignment: 'left',
  font_name: 'Times New Roman',
  font_size: 12,
  is_bold: false,
  is_italic: false,
  is_bullet: false,
  left_indent_cm: 0,
  confidence: 1,
  is_user_modified: false,
  needs_review: false,
  auto_applied: false,
  cita_ids: [],
  ...extra,
});

const hallazgo = (extra: Partial<ProofreadFinding> = {}): ProofreadFinding => ({
  element_id: 'p1',
  start: 0,
  end: 4,
  excerpt: '…texto…',
  kind: 'first_person',
  severity: 'info',
  message: 'primera persona',
  source: 'local',
  ...extra,
});

const fuente = (extra: Partial<MarkSource> = {}): MarkSource => ({
  reviewResult: null,
  proofreadFindings: [],
  commentCtx: CTX_VACIO,
  showCitations: false,
  ...extra,
});

describe('T9 — ReadingText', () => {
  it('no contiene hex literales', () => {
    expect(SRC).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('cada tipo de marca se pinta con variables CSS, nunca con un color fijo', () => {
    for (const style of Object.values(MARK_STYLE)) {
      const colores = Object.values(style).join(' ');
      expect(colores).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(colores).not.toMatch(/rgba?\(/);
    }
    expect(String(MARK_STYLE.spelling.borderBottom)).toContain('var(--color-danger)');
    expect(String(MARK_STYLE.style.borderBottom)).toContain('var(--color-accent)');
  });

  it('el detector de IA usa el token dedicado, para que se lea en oscuro', () => {
    expect(String(MARK_STYLE.ai.backgroundColor)).toContain('var(--mark-ai-bg)');
  });

  it('cada token que MARK_STYLE usa está definido en design-system.css', () => {
    // Un var(--x) sin definir no falla en build: el navegador lo ignora en
    // silencio y el resaltado desaparece. Por eso se comprueba, no se supone.
    const usados = new Set<string>();
    for (const style of Object.values(MARK_STYLE)) {
      for (const v of Object.values(style)) {
        for (const m of String(v).matchAll(/var\((--[a-z0-9-]+)\)/g)) usados.add(m[1]);
      }
    }
    expect(usados.size).toBeGreaterThan(0);
    for (const token of usados) {
      expect(CSS, `${token} no está definido`).toMatch(new RegExp(`${token}\\s*:`));
    }
  });

  it('resalta la ortografía sin partir la palabra', () => {
    const texto = 'El alcance de la campaña alcanze el objetivo.';
    const marcas = collectMarks(texto, fuente({
      reviewResult: review([parrafo(texto, { spelling: [{ word: 'alcanze', suggestions: ['alcance'] }] })]),
    }));
    const m = marcas.find((x) => x.kind === 'spelling');
    expect(m).toBeTruthy();
    expect(texto.slice(m!.start, m!.end)).toBe('alcanze');
  });

  it('encuentra la palabra aunque venga con acentos distintos', () => {
    const texto = 'Se aplicó el ANALISIS a los datos.';
    const marcas = collectMarks(texto, fuente({
      reviewResult: review([parrafo(texto, { spelling: [{ word: 'análisis', suggestions: [] }] })]),
    }));
    const m = marcas.find((x) => x.kind === 'spelling');
    expect(m).toBeTruthy();
    // Y el subrayado cae sobre el texto REAL, con su capitalización.
    expect(texto.slice(m!.start, m!.end)).toBe('ANALISIS');
  });

  it('marca todas las apariciones, no solo la primera', () => {
    const texto = 'Cabe destacar A. Luego, cabe destacar B.';
    const marcas = collectMarks(texto, fuente({
      reviewResult: review([parrafo(texto, { findings: [{ phrase: 'cabe destacar', detail: 'muletilla', severity: 'HIGH' }] })]),
    }));
    expect(marcas.filter((m) => m.kind === 'ai')).toHaveLength(2);
  });

  it('una frase entre paréntesis la deja al motor de citas, no al de IA', () => {
    // '(García 2023)' es una cita mal formada: el motor de citas la diagnostica
    // con su propio color. Pintarla además como patrón de IA sería ruido.
    const texto = 'El autor (García 2023) lo afirma.';
    const marcas = collectMarks(texto, fuente({
      elem: elem(texto),
      showCitations: true,
      reviewResult: review([parrafo(texto, { findings: [{ phrase: '(García 2023)', detail: 'dato', severity: 'LOW' }] })]),
    }));
    expect(marcas).toEqual([]);
  });

  it('un texto sin marcas se renderiza limpio, sin <mark>', () => {
    const { container } = render(
      <ReadingText text="Texto sin observaciones." source={fuente()} />,
    );
    expect(container.querySelectorAll('mark')).toHaveLength(0);
    expect(container.textContent).toBe('Texto sin observaciones.');
  });

  it('el texto acentuado se conserva íntegro tras el resaltado', () => {
    const texto = 'La metodología fue rigurosa según el análisis, según la muestra.';
    const { container } = render(
      <ReadingText text={texto} source={fuente({
        reviewResult: review([parrafo(texto, { spelling: [{ word: 'análisis', suggestions: ['analisis'] }] })]),
      })} />,
    );
    expect(container.textContent).toBe(texto);
  });

  it('un párrafo vacío no inventa marcas', () => {
    expect(collectMarks('', fuente({ elem: elem('') }))).toEqual([]);
    const { container } = render(<ReadingText text="" source={fuente({ elem: elem('') })} />);
    expect(container.querySelectorAll('mark')).toHaveLength(0);
  });
});

describe('T9 — el subrayado y la burbuja dicen lo mismo', () => {
  it('subraya el mismo fragmento que ancla la burbuja', () => {
    const texto = 'En conclusión, el método es válido.';
    const ctx = { ...CTX_VACIO, styleAuditRun: true };
    const comment = getWhatsAppComment(elem(texto), ctx, 0);
    const marcas = collectMarks(texto, fuente({ elem: elem(texto), commentCtx: ctx }));
    const mark = marcas.find((m) => m.kind === 'comment');
    expect(mark).toBeTruthy();
    // Mismo fragmento, mismo texto y mismo ancla que la burbuja del gutter.
    expect(texto.slice(mark!.start, mark!.end).toLowerCase()).toBe('En conclusión'.toLowerCase());
    expect(mark!.title).toBe(comment!.text);
  });

  it('un hallazgo descartado no deja subrayado huérfano', () => {
    // Defecto 1: la burbuja respeta dismissedCommentIds y el subrayado no.
    const texto = 'En conclusión, el método es válido.';
    const base = {
      elem: elem(texto),
      commentCtx: { ...CTX_VACIO, styleAuditRun: true },
    };
    const visible = collectMarks(texto, fuente({ ...base, dismissedCommentIds: [] }));
    const descartado = collectMarks(texto, fuente({ ...base, dismissedCommentIds: ['p1'] }));
    expect(visible.some((m) => m.kind === 'comment')).toBe(true);
    expect(descartado.some((m) => m.kind === 'comment')).toBe(false);
  });

  it('si el fragmento no aparece, ancla el párrafo entero en vez de no marcar', () => {
    const texto = 'Cero filas.';
    const marcas = collectMarks(texto, fuente({
      elem: elem(texto),
      commentCtx: { ...CTX_VACIO, ghostCitations: [{ element_id: 'p1', raw_text: '(Fantasma, 1999)' }] },
    }));
    const comment = marcas.find((m) => m.kind === 'comment');
    expect(comment).toEqual(expect.objectContaining({ start: 0, end: texto.length }));
  });
});

describe('T9 — consolidation de marcas solapadas', () => {
  it('el solapamiento produce un solo <mark>, sin perder el tramo de la izquierda', () => {
    // Tres motores caen sobre rangos que NO coinciden: la cita y el comentario
    // ancla en 13..27, el patrón de IA arranca en 0. Si se consolidara por
    // prioridad en vez de por posición, el "start" se quedaría en 13 y el
    // primer tramo del párrafo quedaría sin marcar.
    const texto = 'El dato duro (García, 2023) sostiene la tesis.';
    const source = fuente({
      elem: elem(texto),
      showCitations: true,
      commentCtx: { ...CTX_VACIO, styleAuditRun: true },
      reviewResult: review([parrafo(texto, { findings: [{ phrase: 'El dato duro (García, 2023)', detail: 'rigidez', severity: 'LOW' }] })]),
    });
    expect(collectMarks(texto, source)).toEqual([
      // Una sola marca, con el rango completo y ganando el motor de mayor
      // prioridad: comment > citation > spelling > style > ai.
      expect.objectContaining({ kind: 'comment', start: 0, end: 27 }),
    ]);
    const { container } = render(<ReadingText text={texto} source={source} />);
    expect(container.textContent).toBe(texto);
    const marks = container.querySelectorAll('mark');
    // Un solo <mark>: dos rangos solapados renderizados aparte duplicarían
    // el texto, que es el defecto que la consolidación viene a matar.
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('El dato duro (García, 2023)');
    expect(marks[0].getAttribute('title')).toContain('Cita APA 7 detectada');
  });
});

describe('T9 — hallazgos del corrector', () => {
  it('un hallazgo que la burbuja no reconoce se marca con el motor de estilo', () => {
    // `styleAuditRun: true` es el estado real de producción apenas hay
    // hallazgos del corrector (buildCommentContext). El motor de estilo tiene
    // que verse ahí, no solo en un fixture con el canal de comentarios apagado.
    // `passive_voice` no tiene gatillo equivalente en getWhatsAppComment, así
    // que nadie lo tapa y el color de estilo llega al lienzo.
    const texto = 'El estudio fue realizado por los investigadores en la región.';
    const source = fuente({
      elem: elem(texto),
      commentCtx: { ...CTX_VACIO, styleAuditRun: true },
      proofreadFindings: [hallazgo({ kind: 'passive_voice', start: 11, end: 24, message: 'voz pasiva: usar activa' })],
    });
    const marcas = collectMarks(texto, source);
    expect(marcas).toHaveLength(1);
    expect(marcas[0]).toEqual(expect.objectContaining({ kind: 'style' }));
    expect(texto.slice(marcas[0].start, marcas[0].end)).toBe('fue realizado');
    expect(marcas[0].title).toBe('voz pasiva: usar activa');

    const { container } = render(<ReadingText text={texto} source={source} />);
    const mark = container.querySelector('mark');
    expect(mark!.getAttribute('style')).toContain('var(--color-accent)');
  });

  it('el diagnóstico del corrector sobrevive cuando la burbuja tapa el mismo rango', () => {
    // En producción `styleAuditRun` está activo apenas hay hallazgos del
    // corrector, así que getWhatsAppComment dispara SU PROPIA burbuja de
    // primera persona sobre el mismo "Yo" (FIRST_PERSON_RE). El comentario
    // gana el rango por prioridad, y antes de arreglado se llevaba el title
    // por delante: el mensaje del corrector quedaba inalcanzable en el lienzo.
    const texto = 'Yo creo que el estudio funciona.';
    const corrector = hallazgo({ start: 0, end: 2, excerpt: 'Yo creo', message: 'primera persona: usar impersonal' });
    const commentCtx = { ...CTX_VACIO, styleAuditRun: true };
    const burbuja = getWhatsAppComment(elem(texto), commentCtx, 0);
    expect(burbuja).not.toBeNull();
    expect(burbuja!.match).toBe('Yo');

    const marcas = collectMarks(texto, fuente({
      elem: elem(texto),
      commentCtx,
      proofreadFindings: [corrector],
    }));
    expect(marcas).toHaveLength(1);
    const mark = marcas[0];
    // El comentario conserva el rango y el color (la burbuja sigue mandando
    // sobre la pinta), pero el title no puede perder el diagnóstico.
    expect(texto.slice(mark.start, mark.end)).toBe('Yo');
    expect(mark.kind).toBe('comment');
    expect(mark.title).toContain(burbuja!.text);
    expect(mark.title).toContain('primera persona: usar impersonal');
  });

  it('el diagnóstico llega al title renderizado, no solo al objeto', () => {
    const texto = 'Yo creo que el estudio funciona.';
    const source = fuente({
      elem: elem(texto),
      commentCtx: { ...CTX_VACIO, styleAuditRun: true },
      proofreadFindings: [hallazgo({ start: 0, end: 2, excerpt: 'Yo creo', message: 'primera persona: usar impersonal' })],
    });
    const { container } = render(<ReadingText text={texto} source={source} />);
    const mark = container.querySelector('mark');
    expect(mark!.textContent).toBe('Yo');
    expect(mark!.getAttribute('title')).toContain('primera persona: usar impersonal');
  });

  it('no duplica el diagnóstico cuando el corrector ya ganó el rango', () => {
    // Sin burbuja que lo tape, la marca ES la del corrector: su title ya es el
    // mensaje, y anotarlo otra vez sería ruido en el tooltip.
    const texto = 'En el marco de la investigación, el modelo se ajusta bien.';
    const marcas = collectMarks(texto, fuente({
      elem: elem(texto),
      proofreadFindings: [hallazgo({ start: 0, end: 34, excerpt: 'En el marco de la investigación' })],
    }));
    expect(marcas).toHaveLength(1);
    expect(marcas[0].title).toBe('primera persona');
  });

  it('un hallazgo de ortografía o de muletilla va a su motor, no al de estilo', () => {
    const texto = 'Re LunezDrive fallo terribly y es un error grave.';
    const marcas = collectMarks(texto, fuente({
      elem: elem(texto),
      proofreadFindings: [
        hallazgo({ kind: 'ortografia', start: 3, end: 12, excerpt: 'LunezDrive' }),
        hallazgo({ kind: 'muletilla', start: 27, end: 39, excerpt: 'es un error' }),
      ],
    }));
    expect(marcas.some((m) => m.kind === 'spelling')).toBe(true);
    expect(marcas.some((m) => m.kind === 'ai')).toBe(true);
    expect(marcas.some((m) => m.kind === 'style')).toBe(false);
  });

  it('los hallazgos de OTROS elementos no se filtran a este párrafo', () => {
    const texto = 'Yo creo que el estudio funciona.';
    const marcas = collectMarks(texto, fuente({
      elem: elem(texto, { id: 'p1' }),
      proofreadFindings: [hallazgo({ element_id: 'otro', start: 0, end: 2, excerpt: 'Yo creo' })],
    }));
    expect(marcas).toEqual([]);
  });

  it('sin offsets válidos, el excerpt localiza el fragmento', () => {
    const texto = 'La metodología de la investigación fue rigurosa.';
    const marcas = collectMarks(texto, fuente({
      elem: elem(texto),
      proofreadFindings: [hallazgo({ start: 900, end: 901, excerpt: '…de la investigación fue…' })],
    }));
    const style = marcas.find((m) => m.kind === 'style');
    expect(texto.slice(style!.start, style!.end)).toBe('de la investigación fue');
  });
});

describe('T9 — el párrafo de la revisión se localize por elemento', () => {
  it('cada párrafo toma SUS hallazgos, no los del primero', () => {
    const p1 = 'Introducción sin nada que corregir.';
    const p2 = 'El alcance alcanze el objetivo.';
    const marcas = collectMarks(p2, fuente({
      elem: elem(p2, { id: 'p2' }),
      reviewResult: review([
        parrafo(p1, { element_id: 'p1' }),
        parrafo(p2, { element_id: 'p2', spelling: [{ word: 'alcanze', suggestions: ['alcance'] }] }),
      ]),
    }));
    expect(marcas).toEqual([expect.objectContaining({ kind: 'spelling' })]);
  });

  it('las citas solo se marcan en bloques de texto, no en un encabezado', () => {
    const texto = 'La OIT (2007) lo define así.';
    const conCita = (type: string) => collectMarks(texto, fuente({
      elem: elem(texto, { type: type as ElementModel['type'] }),
      showCitations: true,
    }));
    expect(conCita('paragraph').some((m) => m.kind === 'citation')).toBe(true);
    expect(conCita('heading').some((m) => m.kind === 'citation')).toBe(false);
  });

  it('un encabezado con comentario de estilo también queda subrayado', () => {
    // `CONCLUSION_TRIGGERS`/`AI_TRIGGERS` en WhatsAppComment no son filtrados
    // por tipo de elemento, así que un título con "en conclusión" recibe
    // burbuja. Si el subrayado dejara fuera a los encabezados, el hallazgo
    // quedaría anunciado y sin marca: la mitad de lo que la Task 8 arregló.
    const texto = 'En conclusiones';
    const enc = elem(texto, { type: 'heading', heading_level: 1 });
    const commentCtx = { ...CTX_VACIO, styleAuditRun: true };
    const burbuja = getWhatsAppComment(enc, commentCtx, 0);
    expect(burbuja).not.toBeNull();

    const marcas = collectMarks(texto, fuente({ elem: enc, commentCtx }));
    const comment = marcas.find((m) => m.kind === 'comment');
    expect(comment).toBeTruthy();
    expect(texto.slice(comment!.start, comment!.end).toLowerCase()).toBe('en conclusion');
    expect(comment!.title).toBe(burbuja!.text);
  });

  it('el comentario NO se subraya en una figura', () => {
    // Una figura sin leyenda SÍ recibe burbuja ("Figura sin rotulación"), pero
    // su `text` no es prosa: no hay fragmento que señalar, subrayarlo sería
    // pintar un rótulo como si fuera una frase.
    const texto = 'Figura 1';
    const figura = elem(texto, { type: 'image', image_info: { relative_url: 'f.png', caption: '', figure_number: 0, alignment: 'center' } as any });
    expect(getWhatsAppComment(figura, CTX_VACIO, 0)).not.toBeNull();
    const marcas = collectMarks(texto, fuente({ elem: figura }));
    expect(marcas.some((m) => m.kind === 'comment')).toBe(false);
  });

  it('un comentario SIN fragmento no pinta el encabezado entero', () => {
    // Las incidencias de validación y las referencias huérfanas llegan sin
    // `match`: no hay fragmento que señalar. En un párrafo el respaldo es
    // marcar el párrafo entero, que es aproximadamente lo que señala la
    // burbuja. En un encabezado no: es un rótulo, y pintarlo entero deja el
    // documento hecho un desastre visual por una incidencia de metadatos.
    const texto = 'Resultados';
    const enc = elem(texto, { type: 'heading', heading_level: 1 });
    const commentCtx = { ...CTX_VACIO, validationIssues: [{ element_id: 'p1', category: 'headings', severity: 'warning', message: 'jerarquía' }] };
    const burbuja = getWhatsAppComment(enc, commentCtx, 0);
    expect(burbuja).not.toBeNull();
    expect(burbuja!.match).toBeUndefined();
    expect(collectMarks(texto, fuente({ elem: enc, commentCtx }))).toEqual([]);
  });

  it('los offsets del corrector no se corren cuando el texto pintado lleva prefijo', () => {
    // Un encabezado se pinta como "1. En conclusiones", pero los offsets del
    // corrector son sobre `elem.text`. Sin reubicar, el subrayado caería dos
    // palabras más adelante: peor que no subrayar.
    const original = 'En conclusiones del estudio';
    const pintado = '1. En conclusiones del estudio';
    const marcas = collectMarks(pintado, fuente({
      elem: elem(original, { type: 'heading', heading_level: 1 }),
      proofreadFindings: [hallazgo({ start: 3, end: 15, excerpt: 'conclusiones' })],
    }));
    expect(marcas).toHaveLength(1);
    expect(pintado.slice(marcas[0].start, marcas[0].end)).toBe('conclusiones');
  });

  it('la reubicación marca cada aparición, no siempre la primera', () => {
    /* T20: `palabra_repetida` señala la MISMA palabra cada vez que se repite, y
       cada hallazgo trae su offset. La reubicación buscaba el fragmento con
       `findAccentAgnostic`, que devuelve SIEMPRE la primera aparición: los tres
       hallazgos caían sobre la misma palabra, la consolidación los fundía en
       una marca y dos de las tres repeticiones quedaban sin señalar — el
       subrayado señalaba algo que el corrector no dijo. */
    const original = 'Tesis de tesis: la tesis';
    const pintado = '1. Tesis de tesis: la tesis';
    const repeticion = (inicio: number) =>
      hallazgo({ kind: 'palabra_repetida', start: inicio, end: inicio + 5, excerpt: 'tesis' });
    const marcas = collectMarks(pintado, fuente({
      elem: elem(original, { type: 'heading', heading_level: 1 }),
      proofreadFindings: [repeticion(0), repeticion(9), repeticion(19)],
    }));
    expect(marcas.map((m) => pintado.slice(m.start, m.end))).toEqual(['Tesis', 'tesis', 'tesis']);
    // Y cada una en SU lugar: la numeración del encabezado no las corre.
    expect(marcas.map((m) => m.start)).toEqual([3, 12, 22]);
  });

  it('sin prefijo, el corrector también marca cada aparición', () => {
    /* El caso normal del corrector, sin headed de por medio: el texto pintado ES
       el original, y por eso las tres repeticiones tienen que salir en su
       sitio. Si este caso se rompiera, la reubicación no sería el problema. */
    const texto = 'Tesis de tesis: la tesis';
    const repeticion = (inicio: number) =>
      hallazgo({ kind: 'palabra_repetida', start: inicio, end: inicio + 5, excerpt: 'tesis' });
    const marcas = collectMarks(texto, fuente({
      elem: elem(texto),
      proofreadFindings: [repeticion(0), repeticion(9), repeticion(19)],
    }));
    expect(marcas.map((m) => m.start)).toEqual([0, 9, 19]);
    expect(marcas.every((m) => m.kind === 'repeat')).toBe(true);
  });
});

describe('T9 — el lienzo consume ReadingText', () => {
  // Sin esto, el defecto 1 seguiría vivo en la app aunque la función lo
  // arreglara: basta con que el lienzo no le pase la lista de descartados.
  beforeEach(() => {
    const texto = 'En conclusión, el método es válido.';
    useDocStore.setState({
      doc: {
        session_id: 's1', file_name: 't.docx', apa_format: 'student', referencias: [],
        meta: { page_count: 1 },
        elements: [elem(texto)],
      },
      portada: { ...defaultPortada },
      // El revisor ya corrió: es lo que habilita el comentario de estilo y,
      // con él, el subrayado que se está comprobando.
      reviewResult: review([parrafo(texto, { element_id: 'p1' })]),
      proofreadFindings: [],
      dismissedCommentIds: [],
    } as any);
  });

  const pintar = () => render(<PaperCanvas />).container.querySelector('#paper-elem-p1');

  it('el lienzo pinta el mismo mark que collectMarks', () => {
    const wrap = pintar();
    const mark = wrap!.querySelector('mark');
    expect(mark).toBeTruthy();
    expect(mark!.textContent).toBe('En conclusión');
    // Y con los tokens, no con el rgba de antes.
    expect(mark!.getAttribute('style')).toContain('var(--severity-warning-soft)');
  });

  it('descartar el comentario saca el subrayado, igual que saca la burbuja', () => {
    useDocStore.setState({ dismissedCommentIds: ['p1'] } as any);
    const wrap = pintar();
    expect(wrap).toBeTruthy();
    expect(wrap!.querySelector('mark')).toBeNull();
  });
});

describe('T9 — el lienzo subraya los ENCABEZADOS', () => {
  // El nivel de arriba prueba que collectMarks marca un encabezado. Este
  // prueba que el usuario lo ve: los encabezados tienen que pasar por
  // ReadingText en PaperCanvas, no renderizarse como texto crudo.
  const montar = (elements: unknown[], extra: Record<string, unknown> = {}) => {
    useDocStore.setState({
      doc: { session_id: 's1', file_name: 't.docx', apa_format: 'student', referencias: [], meta: { page_count: 1 }, elements },
      portada: { ...defaultPortada },
      reviewResult: null,
      proofreadFindings: [],
      dismissedCommentIds: [],
      validationIssues: [],
      ...extra,
    } as any);
    return render(<PaperCanvas />).container;
  };

  const titulo = (texto: string) => elem(texto, { id: 'h1', type: 'heading', heading_level: 1 });

  it('un encabezado con comentario de estilo aparece subrayado en el lienzo', () => {
    // El revisor corrió (habilita el comentario de redacción) y la burbuja
    // existe; el subrayado tiene que existir también.
    const texto = 'En conclusiones';
    const container = montar([titulo(texto)], { reviewResult: review([parrafo(texto, { element_id: 'h1', type: 'heading' })]) });
    const mark = container.querySelector('#paper-elem-h1 mark');
    expect(mark).toBeTruthy();
    // El encabezado se pinta numerado ("1. En conclusiones"): el subrayado cae
    // sobre el fragmento real del texto, no sobre el prefijo.
    expect(mark!.textContent).toBe('En conclusion');
    expect(mark!.getAttribute('style')).toContain('var(--severity-warning-soft)');
  });

  it('un encabezado con incidencia de validación NO queda pintado entero', () => {
    // Sin `match` no hay fragmento que señalar: la burbuja queda sola, que es
    // la decisión de producto, pero el rótulo no se tiñe.
    const container = montar([titulo('Resultados')], {
      validationIssues: [{ element_id: 'h1', category: 'headings', severity: 'warning', message: 'jerarquía', rule_id: 'r1' }],
    });
    const wrap = container.querySelector('#paper-elem-h1');
    expect(wrap).toBeTruthy();
    expect(wrap!.textContent).toContain('Resultados');
    expect(wrap!.querySelector('mark')).toBeNull();
  });

  it('descartar el comentario también limpia el encabezado', () => {
    const texto = 'En conclusiones';
    const container = montar([titulo(texto)], {
      reviewResult: review([parrafo(texto, { element_id: 'h1', type: 'heading' })]),
      dismissedCommentIds: ['h1'],
    });
    expect(container.querySelector('#paper-elem-h1 mark')).toBeNull();
  });

  /* Un título de bibliografía con un emoji: la familia de comentario más
     simple de reproducir y la que no depende del store. El título no se numera
     (`isRefHeading` lo saca de la jerarquía), así que el texto pintado es
     exactamente `elem.text` y el rango del mark coincide sin desplazamiento. */
  const TITULO_CON_EMOJI = 'Referencias \u2705';

  it('el encabezado de REFERENCIAS también pasa por ReadingText', () => {
    /* El título de la bibliografía tiene su propia rama de render (lista de
       referencias estructuradas, sin numeración jerárquica) y esa rama emitía
       `{elem.text}` crudo mientras su hermana de dos líneas más abajo usa
       `ReadingText`. Consecuencia: un "Referencias" con emoji recibía burbuja
       del gutter y NINGÚN subrayado, que es la contradicción entre canales que
       AGENTS.md §2 prohíbe por nombre.

       El caso del emoji y no el de la cita fantasma a propósito: la cita
       fantasma trae un `match` que puede no estar en el texto del título, y en
       ese caso la regla declarada es "el encabezado con comentario sin
       fragmento se queda con la burbuja sola" (`WHOLE_ELEMENT_ANCHOR` excluye
       los encabezados). El emoji sí trae fragmento, así que aquí lo que se
       está probando es exactamente el hueco: un título CON fragmento
       localizable que salía sin subrayado. */
    const container = montar([
      elem(TITULO_CON_EMOJI, { id: 'h1', type: 'heading', heading_level: 1 }),
    ]);
    const wrap = container.querySelector('#paper-elem-h1');
    expect(wrap).toBeTruthy();
    // El texto sigue siendo el del documento...
    expect(wrap!.textContent).toContain('Referencias');
    // ...y ahora además lleva el subrayado del mismo hallazgo que anuncia la
    // burbuja.
    const mark = wrap!.querySelector('mark');
    expect(mark).toBeTruthy();
    expect(mark!.getAttribute('style')).toContain('var(--severity-warning-soft)');
  });

  it('descartar también limpia el título de Referencias', () => {
    // La otra mitad de la sincronía: si el subrayado aparece, tiene que
    // desaparecer con el mismo descarte que saca la burbuja.
    const container = montar(
      [elem(TITULO_CON_EMOJI, { id: 'h1', type: 'heading', heading_level: 1 })],
      { dismissedCommentIds: ['h1'] },
    );
    expect(container.querySelector('#paper-elem-h1 mark')).toBeNull();
  });
});

/* ── La excepción declarada: figuras y tablas NO llevan subrayado ─────────── */

describe('T9 — la excepción a los dos canales está probada, no solo explicada', () => {
  /* `COMMENT_TYPES` deja fuera `image` y `table` a propósito, y está escrito
     en el módulo. Lo que faltaba era que NADA lo afirmara: hoy el único tests
     era el de la figura, y el de la tabla no existía. La próxima persona que
     agregue una familia de comentario sobre una figura no tiene forma de saber
     que la excepción fue elegida y no olvidada — y el forgets más caro de este
     módulo es exactamente ese.

     Los dos lados se prueban: la burbuja EXISTE (o el comentario no se
     anunciaba, y entonces tampoco hay excepción que justificar) y el
     subrayado NO (o el rótulo de la figura se pinta como si fuera una frase,
     que es lo que `COMMENT_TYPES` dice que no se hace). */
  const fig = elem('Figura 1', {
    id: 'f1', type: 'image',
    image_info: { relative_url: 'f.png', caption: '', figure_number: 0, alignment: 'center' } as any,
  });
  const tbl = elem('Tabla 1', {
    id: 't1', type: 'table',
    /* `rows` es una lista de filas (lista de celdas): `getWhatsAppComment` las
       recorre con `forEach` para buscar emojis en las celdas. */
    table_info: { caption: '', table_number: 0, rows: [['x']], columns: 1, headers: ['x'] } as any,
  });
  const SIN_LEYENDA = {
    validationIssues: [
      { element_id: 'f1', category: 'figuras', severity: 'warning', message: 'falta leyenda' },
      { element_id: 't1', category: 'tablas', severity: 'warning', message: 'falta título' },
    ],
  } as any;

  it('una FIGURA sin leyenda recibe burbuja y NO underline: su texto es un rótulo', () => {
    const ctx = { ...CTX_VACIO, ...SIN_LEYENDA };
    const burbuja = getWhatsAppComment(fig, ctx, 0);
    expect(burbuja).not.toBeNull();
    expect(collectMarks('Figura 1', fuente({ elem: fig, commentCtx: ctx })).some((m) => m.kind === 'comment')).toBe(false);
  });

  it('una TABLA sin leyenda recibe burbuja y NO underline: su texto es un rótulo', () => {
    const ctx = { ...CTX_VACIO, ...SIN_LEYENDA };
    const burbuja = getWhatsAppComment(tbl, ctx, 0);
    expect(burbuja).not.toBeNull();
    expect(collectMarks('Tabla 1', fuente({ elem: tbl, commentCtx: ctx })).some((m) => m.kind === 'comment')).toBe(false);
  });

  it('la lista de tipos SIN subrayado es exactamente figuras y tablas', () => {
    /* La otra forma de la misma afirmación, y la que no se rompe al añadir un
       tipo nuevo: todo tipo que NO sea figura o tabla sí lleva subrayado cuando
       tiene comentario. */
    const conComentario = (type: string) => {
      const texto = 'En conclusión, el método es válido.';
      const e = elem(texto, { id: 'x1', type: type as ElementModel['type'] });
      const ctx = { ...CTX_VACIO, styleAuditRun: true };
      return getWhatsAppComment(e, ctx, 0)
        ? collectMarks(texto, fuente({ elem: e, commentCtx: ctx })).some((m) => m.kind === 'comment')
        : true;
    };
    for (const type of ['paragraph', 'bullet', 'numbered_list', 'block_quote', 'heading']) {
      expect(conComentario(type), type).toBe(true);
    }
    expect(conComentario('image')).toBe(false);
    expect(conComentario('table')).toBe(false);
  });
});
