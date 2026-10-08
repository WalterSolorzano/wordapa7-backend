/**
 * Que un hallazgo de un documento que CAMBIO en Word no sobreviva al cambio.
 *
 * LA PREGUNTA QUE ESTE ARCHIVO RESPONDE
 *
 * `element_id` no es un nombre, es un indice posicional: `docx_parser.py:1099`
 * genera `elem_{contador}`. Insertar un parrafo arriba del todo en Word corre
 * TODOS los ids de abajo, cada uno con un texto distinto del que tenia. O sea:
 * `elem_7` sigue existiendo, pero ya no es el mismo parrafo.
 *
 * De ahi sale lo unico que se puede hacer con un hallazgo viejo. No se puede
 * "conservar los de los parrafos que no cambiaron": el criterio de "no cambio"
 * no se puede evaluar por id, y aunque se evaluara por texto, el hallazgo
 * conservado queda pegado al parrafo equivocado, con el subrayado en la frase
 * equivocada y el mensaje de la otra. Es un error que se lee como error de
 * redaccion —la persona cree que escribio mal y corrige algo que estaba
 * bien—, no como error de la app. Peor que mostrar de mas.
 *
 * Por eso la operacion es una sola y es total: caer TODOS. Y lo que no es un
 * hallazgo tambien se va: los descartes (`dismissedCommentIds`) y el mapa de
 * marcas (`wordapa7_marcas_map`) tienen `element_id` adentro de sus claves, asi
 * que sobreviven al cambio igual de rancios que un hallazgo. Un descarte de
 * `elem_7` borrando el hallazgo nuevo de OTRO parrafo es el mismo error, ocho
 * filas mas abajo.
 *
 * POR QUE SE MIDE CON `collectAuditItems` Y NO CON EL STORE
 *
 * Porque el store no es donde se ven los pendientes: el rail y la pantalla de
 * Revision derivan de `collectAuditItems` (`railPending.ts:71-76`), y un
 * hallazgo que queda vivo en el store es un pendiente que NADIE puede cerrar:
 * no hay parrafo al que volver. Un test que solo mira `proofreadFindings`
 * pasaria con un store lleno de fantasmas, que es exactamente el defecto.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDocStore } from '../store/useDocStore';
import { collectAuditItems, AuditSources } from '../lib/auditItems';
import type { ProofreadFinding, ElementModel } from '../types';

const hallazgo = (over: Partial<ProofreadFinding> = {}): ProofreadFinding => ({
  element_id: 'elem_7',
  start: 0,
  end: 5,
  excerpt: 'segun',
  kind: 'ortografia',
  severity: 'error',
  message: 'Falta tilde: según',
  suggestion: 'según',
  source: 'local',
  ...over,
});

const elemento = (id: string, text: string): ElementModel =>
  ({ id, type: 'paragraph', text, page_number: 1 } as unknown as ElementModel);

/** Los MISMOS cuatro campos que arma la pantalla de Revision. */
const fuentes = (): AuditSources => {
  const s = useDocStore.getState();
  return {
    elements: s.doc?.elements ?? [],
    reviewResult: s.reviewResult,
    proofreadFindings: s.proofreadFindings,
    citationAuditResult: s.citationAuditResult,
  };
};

const montarConHallazgos = (
  findings: ProofreadFinding[],
  elements: ElementModel[] = [elemento('elem_0', 'el parrafo que Word toco'), elemento('elem_7', 'otro parrafo')],
) => {
  useDocStore.setState({
    doc: { session_id: 's1', file_name: 'tesis.docx', elements, meta: { page_count: 1 }, referencias: [] } as any,
    tabDocs: {},
    proofreadFindings: findings,
    reviewResult: null,
    citationAuditResult: null,
    aiIndices: null,
    dismissedCommentIds: [],
  });
  return useDocStore.getState().invalidarHallazgosRancios;
};

beforeEach(() => {
  useDocStore.setState({
    doc: null,
    tabDocs: {},
    proofreadFindings: [],
    reviewResult: null,
    citationAuditResult: null,
    aiIndices: null,
    dismissedCommentIds: [],
  });
  try {
    localStorage.removeItem('wordapa7_marcas_map');
  } catch {
    /* noop */
  }
});

describe('invalidarHallazgosRancios', () => {
  it('UN HALLAZGO DE UN PARRAFO QUE SE BORRO NO PUEDE SEGUIR PENDIENTE', () => {
    // El caso facil: el elemento desaparecio del documento, asi que el hallazgo
    // ya no tiene texto al que volver y queda en la cola para siempre.
    const invalidar = montarConHallazgos([hallazgo()], [elemento('elem_0', 'el parrafo que Word toco')]);
    expect(collectAuditItems(fuentes()).length).toBe(1);

    invalidar();

    expect(collectAuditItems(fuentes()).length).toBe(0);
  });

  it('TODOS LOS HALLAZGOS CAEN, NO SOLO LOS DEL PARRAFO BORRADO', () => {
    // Review Focus #1, y la razon de ser de esta tarea entera. `elem_7` SIGUE
    // en el documento, asi que cualquier poda por id lo dejaria vivo, pegado a
    // un parrafo que ahora es otro. El id es un indice posicional, no un
    // nombre: conservar un hallazgo por id es un hallazgo en la frase ajena.
    const invalidar = montarConHallazgos([hallazgo()]);
    const idVivo = useDocStore.getState().doc!.elements.some((e) => e.id === 'elem_7');
    expect(idVivo).toBe(true);

    invalidar();

    expect(collectAuditItems(fuentes()).length).toBe(0);
    // Y el elemento sigue existiendo: no se borro nada del documento, solo los
    // hallazgos que ya no saben de que parrafo hablan.
    expect(useDocStore.getState().doc!.elements.some((e) => e.id === 'elem_7')).toBe(true);
  });

  it('CADA MOTOR QUE APORTA A LA LISTA SE QUEDA SIN NADA', () => {
    // La lista de Revision no sale de un solo motor: entra el revisor de IA, el
    // auditor proactivo y la auditoria de citas. Invalidar solo uno deja
    // findings vivos con otro nombre, y la lista sigue mostrando pendientes que
    // nadie puede cerrar.
    const invalidar = montarConHallazgos([hallazgo()]);
    useDocStore.setState({
      reviewResult: {
        total_paragraphs: 1,
        flagged_count: 1,
        paragraphs: [{ element_id: 'elem_7', ai_score: 88, ai_category: 'HIGH', text: 'otro parrafo' }],
      } as any,
      citationAuditResult: { ghost_citations: [{ element_id: 'elem_7', citation_text: '(Smith, 2020)' }], orphan_references: [] } as any,
      aiIndices: { total: 1, high: 1, medium: 0, distribution: {} } as any,
    });
    expect(collectAuditItems(fuentes()).length).toBeGreaterThan(1);

    invalidar();

    const s = useDocStore.getState();
    expect(s.proofreadFindings).toEqual([]);
    expect(s.reviewResult).toBeNull();
    expect(s.citationAuditResult).toBeNull();
    expect(s.aiIndices).toBeNull();
    expect(collectAuditItems(fuentes()).length).toBe(0);
  });

  it('UN DESCARTE VIEJO NO PUEDE SEGUIR BORRANDO EL HALLAZGO NUEVO', () => {
    // La clave de un descarte incluye `element_id` (`auditItems.ts:159`, la misma
    // `clave` que arma la identidad de cada fila). Si sobrevive al refresco, un
    // descarte de `elem_7` sigue apagando el hallazgo que la reauditoria acaba
    // de poner en `elem_7`, y ese ultimo es un parrafo distinto.
    const invalidar = montarConHallazgos([]);
    useDocStore.setState({ dismissedCommentIds: ['proact_elem_7_ortografia_0_5'] });

    invalidar();

    expect(useDocStore.getState().dismissedCommentIds).toEqual([]);
  });

  it('EL MAPA DE MARCAS SE VACIA, NO SE PODA: NO HAY PODA EN NINGUN LADO', () => {
    // `auditSlice.ts:152-156` solo AGREGA entradas a este mapa, indexado por
    // `element_id`. Sin un vaciado explicito, la marca de un parrafo viejo
    // sobrevive y aparece sobre el parrafo que ahora ocupa ese id.
    const invalidar = montarConHallazgos([]);
    localStorage.setItem('wordapa7_marcas_map', JSON.stringify({ elem_7: 'Primera persona' }));

    invalidar();

    expect(localStorage.getItem('wordapa7_marcas_map')).toBeNull();
  });

  it('UN localStorage QUE LANZA NO TIRA LA INVALIDACION', () => {
    // El modo privado y los permisos negados hacen que `localStorage` exista y
    // que cada operacion lance. Si ahi se tirara la accion, los hallazgos rancios
    // sobreviven justo en la maquina donde no hay forma de limpiarlos a mano.
    const quitar = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    try {
      const invalidar = montarConHallazgos([hallazgo()]);

      expect(() => invalidar()).not.toThrow();
      expect(collectAuditItems(fuentes()).length).toBe(0);
    } finally {
      quitar.mockRestore();
    }
  });
});
