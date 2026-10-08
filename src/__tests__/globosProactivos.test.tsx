/**
 * EL ESTADO DE CORRIDA DE LOS GLOBOS VIVE EN EL STORE.
 *
 * Al abrir un documento, `documentSlice.uploadFile` dispara tres globos en
 * background: `runProactiveAudits`, `runProactiveAutoCaptioning` y
 * `runProofreadBatch`. Los tres corren solos. El estado de corrida NO puede
 * vivir en una vista: el globo lo dispara `uploadFile`, no la pantalla, y
 * sobrevive a que la pantalla se desmonte. Vive en el store, que es donde los
 * globos viven.
 *
 * LO QUE SE USA ES EL STORE DE VERDAD
 *
 * Reimplementar la cadena dentro del test probaría el test. Lo único que se
 * finge es la red —`api/backend`—, que es lo único que no existe en una
 * prueba. Todo lo demás es el código que corre en la app.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';

/* EL ORDEN DE ESTOS IMPORTES NO ES COSA ESTETICA. `api/backend` importa al store
   y el store importa a `api/backend`: son un ciclo. Si el test importara primero
   a `api/backend`, el store se evaluaría por el otro lado y los slices se
   quedarían con la versión REAL de `api.proofreadBatch` —el mock no se aplica,
   la llamada sale a la red y el `catch { }` se la come en silencio—. Importando
   el store primero, el mock entra antes de que los slices lean el módulo. */
import { useDocStore } from '../store/useDocStore';
import * as api from '../api/backend';

vi.mock('../api/backend', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/backend')>();
  return {
    ...real,
    proofreadBatch: vi.fn(),
    validateCitations: vi.fn(),
    runAIReview: vi.fn(),
    fetchProactiveCaptions: vi.fn(),
  };
});

const corregir = api.proofreadBatch as unknown as ReturnType<typeof vi.fn>;
const citas = api.validateCitations as unknown as ReturnType<typeof vi.fn>;
const estilo = api.runAIReview as unknown as ReturnType<typeof vi.fn>;
const leyendas = api.fetchProactiveCaptions as unknown as ReturnType<typeof vi.fn>;

const DOC = {
  session_id: 's-globo',
  file_name: 'tesis.docx',
  elementos: [{ id: 'e1', type: 'paragraph', text: 'el parrafo uno' }],
  elements: [
    {
      id: 'e1', type: 'paragraph', text: 'el parrafo uno', page_number: 1,
      style_name: 'Normal', alignment: 'left', font_name: 'Times New Roman',
      font_size: 12, is_bold: false, is_italic: false, is_bullet: false,
      left_indent_cm: 0, confidence: 1, is_user_modified: false,
      needs_review: false, auto_applied: false, cita_ids: [],
    },
  ],
  referencias: [],
  meta: { page_count: 1 },
} as never;

/** Un hallazgo de ortografía, con la forma que espera el store. */
const HALLAZGO = {
  element_id: 'e1', start: 3, end: 10, excerpt: 'parrafo', kind: 'ortografia',
  severity: 'error', message: 'Falta tilde', suggestion: 'párrafo',
  source: 'local', phase: 'portada', read_only: true,
};

/** Una promesa que todavía no se resolvió: es lo que hace "un motor corriendo". */
const pendiente = () => new Promise<never>(() => {});

beforeEach(() => {
  vi.clearAllMocks();
  useDocStore.setState({
    doc: DOC,
    reviewResult: null,
    proofreadFindings: [],
    citationAuditResult: null,
    aiIndices: null,
    sugerenciasProactivas: true,
    isAuditing: false,
    motoresAuditando: [],
    dismissedCommentIds: [],
  } as never);
  /* Por defecto, todo el mundo termina: los tests que necesitan un globo en
     vuelo sobrescriben UNO de estos. Escribir el valor por defecto explícito y
     no en el cuerpo de cada test evita que un caso nuevo olvide el andamiaje. */
  corregir.mockResolvedValue({ findings: [HALLAZGO], ai_indices: null });
  citas.mockResolvedValue({ ghost_citations: [], orphan_references: [] });
  estilo.mockResolvedValue({ paragraphs: [], total_paragraphs: 0, findings: [] });
  leyendas.mockResolvedValue({ suggestions: [] });
});

afterEach(() => {
  act(() => useDocStore.setState({ isAuditing: false, motoresAuditando: [] } as never));
});

describe('el estado de corrida de los globos vive en el store', () => {
  it('con un motor en vuelo, el store lo dice; cuando termina, deja de decirlo', async () => {
    /* El caso central. Un flag de la vista no podría afirmar esto: el globo lo
       dispara `uploadFile`, no la vista, y sobrevive a que la vista se desmonte. */
    let resolver!: () => void;
    corregir.mockImplementation(() => new Promise((res) => { resolver = () => res({ findings: [], ai_indices: null }); }));

    act(() => { void useDocStore.getState().runProofreadBatch(); });
    expect(useDocStore.getState().isAuditing).toBe(true);
    expect(useDocStore.getState().motoresAuditando.length).toBe(1);

    await act(async () => { resolver(); await Promise.resolve(); });
    expect(useDocStore.getState().isAuditing).toBe(false);
    expect(useDocStore.getState().motoresAuditando).toEqual([]);
  });

  it('UN motor que termina NO apaga a los otros dos', async () => {
    /* Si `isAuditing` fuera un booleano, esto no se podría expresar: tres
       motores quedan en vuelo, uno termina, y los otros dos siguen trabajando.
       Con un booleano la pantalla parpadearía "no está corriendo" en medio de
       una auditoría. La lista es la que hace posible el estado honesto. */
    estilo.mockImplementation(() => pendiente());
    leyendas.mockImplementation(() => pendiente());

    /* `runProactiveAudits` anota DOS motores: el de citas y el de estilo se
       lanzan juntos y se apagan juntos, y contarlos como uno mentiría sobre
       cuál de los dos sigue vivo. Con leyendas, son tres en vuelo. */
    act(() => { void useDocStore.getState().runProactiveAudits(); });
    act(() => { void useDocStore.getState().runProactiveAutoCaptioning(); });
    expect(useDocStore.getState().isAuditing).toBe(true);
    expect(useDocStore.getState().motoresAuditando).toHaveLength(3);

    /* El revisor entra, corre y sale: la lista crece a cuatro y vuelve a tres.
       Lo que se afirma es que NO baja de tres: los otros siguen en vuelo. */
    await act(async () => { await useDocStore.getState().runProofreadBatch(); });
    expect(useDocStore.getState().isAuditing).toBe(true);
    expect(useDocStore.getState().motoresAuditando).toHaveLength(3);
    expect(useDocStore.getState().motoresAuditando).not.toContain('ortografía, texto pegado e IA');
  });

  it('UN motor que FALLA también se apaga: el globo se traga el error, el estado no', async () => {
    /* El `catch` silencioso de los globos es lo correcto para un trabajo en
       segundo plano, pero si el `finally` no escribiera el estado, un fallo de
       red dejaría la pantalla diciendo "corriendo" para siempre. Un estado de
       corrida que no se apaga es peor que uno que no existe. */
    corregir.mockRejectedValue(new Error('ECONNREFUSED'));
    await act(async () => { await useDocStore.getState().runProofreadBatch(); });
    expect(useDocStore.getState().isAuditing).toBe(false);
    expect(useDocStore.getState().motoresAuditando).toEqual([]);
  });

  it('sin documento no se anota nada: no hay motor corriendo sobre nada', async () => {
    useDocStore.setState({ doc: null } as never);
    await act(async () => { await useDocStore.getState().runProofreadBatch(); });
    expect(corregir).not.toHaveBeenCalled();
    expect(useDocStore.getState().isAuditing).toBe(false);
  });
});
