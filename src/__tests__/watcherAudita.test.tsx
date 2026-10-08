/**
 * El watcher de Word cerrando el ciclo: recargar el documento, tirar los
 * hallazgos rancios, re-correr los motores, y decir en el aviso lo que se
 * ENCONTRO.
 *
 * HASTA ACA EL CICLO ESTABA ABIERTO
 *
 * El endpoint ya guardaba en el backend el `.docx` reparseado, asi que despues
 * de un Ctrl+S el servidor tenia el texto nuevo y la pantalla el viejo, y el
 * aviso —que era cierto— describia un trabajo a medias. Estas pruebas fijan el
 * cierre y, sobre todo, fijan QUE NUMERO SE DICE.
 *
 * EL NUMERO DEL AVISO ES EL DE LA REAUDITORIA, NO EL DEL DIFF
 *
 * El diff responde "que texto entro": 3 parrafos nuevos. La reauditoria
 * responde "que hay que revisar en el documento entero": 11 hallazgos. Son dos
 * preguntas distintas, y decir 3 cuando se pregunto por la segunda es la misma
 * mentira que el watcher ya dejo de decir cuando todavia no re-auditaba nada.
 *
 * LO QUE SE PRUEBA CON STORE REAL Y API FICTICIA
 *
 * Aca no se reimplementa el store: se usa el de verdad y se le cambian solo las
 * tres llamadas de red (`recoverSession`, `proofreadBatch`, `validateCitations`).
 * Reimplementar la cadena dentro del test probaria el test. Lo que si se
 * finge es la red, que es lo unico que no existe en la prueba.
 *
 * EL BACKEND ES DE UN SOLO DISPARO, Y EL WATCHER LO RESPETA
 *
 * `/api/refresh-from-word` guarda el documento reparseado antes de devolver el
 * diff, asi que la lectura siguiente responde "no cambio nada" aunque el archivo
 * siga en disco distinto del estado guardado. Por eso la recarga NO se pide
 * usando la ruta: se recarga lo que ya esta guardado. Hay un test que cuenta
 * las lecturas del endpoint, porque el dia que ese numero suba a dos se esta
 * pagando un reparseo entero por cada Ctrl+S.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// `App.tsx` importa los visores de PDF, que piden `DOMMatrix` en el import.
// No se prueba nada de PDF aca: se los cambia por su lugar.
vi.mock('../components/layout/PDFPreview', () => ({ PDFPreview: () => null }));
vi.mock('../components/layout/ReactPDFPreview', () => ({ ReactPDFPreview: () => null }));

vi.mock('../api/backend', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/backend')>();
  return { ...real, recoverSession: vi.fn(), proofreadBatch: vi.fn(), validateCitations: vi.fn() };
});

import { useDocStore } from '../store/useDocStore';
import * as api from '../api/backend';
import { crearRefrescador, mensajeDeReauditoria, type DiffWord } from '../lib/wordRefresh';
import { reauditarTrasRefresco } from '../App';

// EL ORDEN DE ESOS IMPORTES NO ES COSA ESTETICA. `api/backend` importa al store
// y el store importa a `api/backend`: son un ciclo. Si el test importa primero
// a `api/backend`, el store se evalua por el otro lado del ciclo y los slices
// se quedan con la version REAL de `api.proofreadBatch`: el mock no se aplica,
// la llamada sale a la red y el `catch { }` se la come en silencio. Importando el
// store primero, el mock entra antes de que los slices lean el modulo.

const RUTA = 'C:/tesis/Tesis.docx';
const NAME = 'Tesis.docx';

const recuperar = api.recoverSession as unknown as ReturnType<typeof vi.fn>;
const proof = api.proofreadBatch as unknown as ReturnType<typeof vi.fn>;
const citas = api.validateCitations as unknown as ReturnType<typeof vi.fn>;

const doc = (parrafos = 2) =>
  ({
    session_id: 's1',
    file_name: NAME,
    elements: Array.from({ length: parrafos }, (_, i) => ({
      id: `elem_${i}`,
      type: 'paragraph',
      text: `el parrafo ${i}`,
      page_number: 1,
    })),
    meta: { page_count: 1 },
    referencias: [],
  }) as any;

const hallazgo = (id: string) => ({ element_id: id, kind: 'ortografia', match: 'x' }) as any;

const diff = (over: Partial<DiffWord> = {}): DiffWord => ({
  session_id: 's1',
  listo: true,
  cambiado: false,
  hash_estructura: 'h1',
  elementos: [],
  ids_nuevos: [],
  ids_eliminados: [],
  ...over,
});

/** El watcher tal como lo monta `App.tsx`, con su `alRefrescar` de verdad. */
const montar = () => {
  useDocStore.setState({
    doc: doc(),
    tabDocs: { s1: doc() },
    // Un hallazgo viejo: si la recarga falla, este tiene que seguir ahi.
    proofreadFindings: [hallazgo('elem_0')],
    sugerenciasProactivas: true,
    references: [],
  });
  const avisar = vi.fn();
  // El diff del backend: el watcher lo pide una vez y de ahi sale todo. Un solo
  // knob para el backend entero, porque pedir el diff dos veces con respuestas
  // distintas seria una prueba de un backend que no existe.
  const backend = vi.fn().mockResolvedValue(diff());
  const pedir = vi.fn((ruta: string) => backend(ruta));
  const { refrescar } = crearRefrescador({
    pedir,
    avisar,
    archivo: () => RUTA,
    alRefrescar: (d) => reauditarTrasRefresco(d),
    // Reloj inyectado: un temporizador real en una prueba es una espera real.
    esperar: (_ms, fn) => fn(),
  });
  return { avisar, backend, pedir, refrescar };
};

beforeEach(() => {
  vi.clearAllMocks();
  proof.mockResolvedValue({ findings: [], ai_indices: null });
  citas.mockResolvedValue({ ghost_citations: [], orphan_references: [] });
  recuperar.mockResolvedValue(doc(5));
});

describe('el watcher de Word re-audita', () => {
  it('EL AVISO DICE LO QUE LA REAUDITORIA ENCONTRO, NO LO QUE EL DIFF SUPONIA', async () => {
    // El caso central. El diff dice "3 parrafos nuevos". Si la reauditoria sobre
    // el documento entero encuentra 11, el aviso tiene que decir 11: 3 es la
    // respuesta a otra pregunta, y mezclarlas es la misma mentira que ya se
    // elimino del watcher.
    const { avisar, backend, refrescar } = montar();
    backend.mockResolvedValue(diff({ cambiado: true, ids_nuevos: ['a', 'b', 'c'] }));
    proof.mockResolvedValue({
      findings: Array.from({ length: 11 }, (_, i) => hallazgo(`elem_${i}`)),
      ai_indices: null,
    });

    await refrescar();

    expect(avisar).toHaveBeenCalledTimes(1);
    const texto = avisar.mock.calls[0][0] as string;
    expect(texto).toContain('11');
    expect(texto).not.toContain('3');
  });

  it('LO QUE WORD ESCRIBIO SE VE EN PANTALLA, NO SOLO EN EL BACKEND', async () => {
    // El endpoint ya habia guardado el texto reparseado. Si la pantalla no se
    // recarga, el backend tiene el texto nuevo y la vista el viejo, y el aviso
    // —que seria cierto— describe un trabajo a medias.
    const { refrescar, backend } = montar();
    backend.mockResolvedValue(diff({ cambiado: true, ids_nuevos: ['elem_4'] }));

    await refrescar();

    expect(recuperar).toHaveBeenCalledWith('s1');
    expect(useDocStore.getState().doc!.elements).toHaveLength(5);
    expect(useDocStore.getState().tabDocs.s1.elements).toHaveLength(5);
  });

  it('EL DIFF SE PIDE UNA SOLA VEZ, AUNQUE SE RECARGUE', async () => {
    // El endpoint es de un solo disparo: cuando ve un cambio, guarda el
    // documento reparseado y recien ahi devuelve el diff. Preguntarle otra vez
    // por el mismo guardado gasta un reparseo entero y responde "no cambio
    // nada" — que es cierto y no sirve para nada.
    const { refrescar, backend } = montar();
    backend.mockResolvedValue(diff({ cambiado: true, ids_nuevos: ['elem_4'] }));

    await refrescar();

    expect(backend).toHaveBeenCalledTimes(1);
  });

  it('LOS HALLAZGOS RANCIOS CAEN Y LOS NUEVOS LOS PONEN LOS MOTORES', async () => {
    // El motivo de tirar todo en vez de parchear por id: `element_id` es un
    // indice posicional, asi que el hallazgo de "elem_0" puede estar pegado a un
    // parrafo que ya no es el que se leyo. Conservarlo seria un error visible.
    const { refrescar, backend } = montar();
    backend.mockResolvedValue(diff({ cambiado: true, ids_nuevos: ['elem_4'] }));
    proof.mockResolvedValue({ findings: [hallazgo('elem_2'), hallazgo('elem_3')], ai_indices: null });

    await refrescar();

    const ids = useDocStore.getState().proofreadFindings.map((f) => f.element_id);
    expect(ids).toEqual(['elem_2', 'elem_3']);
  });

  it('UN ARCHIVO A MEDIAS NO REAUDITA NADA', async () => {
    // Un `.docx` a medio escribir no es un documento con menos parrafos: no se
    // pudo mirar. Recargar ahi tiraria el estado guardado para atras.
    const { avisar, backend, refrescar } = montar();
    backend.mockResolvedValue(diff({ listo: false, motivo: 'archivo_a_medio_escribir' }));

    await refrescar();

    expect(recuperar).not.toHaveBeenCalled();
    expect(proof).not.toHaveBeenCalled();
    expect(citas).not.toHaveBeenCalled();
    expect(avisar).not.toHaveBeenCalled();
    // Y los hallazgos que habia siguen ahi, porque nadie los toco.
    expect(useDocStore.getState().proofreadFindings).toHaveLength(1);
  });

  it('UN GUARDADO QUE NO CAMBIO NADA NO REAUDITA NADA', async () => {
    // Un Ctrl+S que solo toca estilos no puede costar una re-auditoria entera y
    // sobre todo no puede vaciar hallazgos: se perderian por un Ctrl+S.
    const { avisar, backend, refrescar } = montar();
    backend.mockResolvedValue(diff());

    await refrescar();

    expect(recuperar).not.toHaveBeenCalled();
    expect(proof).not.toHaveBeenCalled();
    expect(avisar).not.toHaveBeenCalled();
    expect(useDocStore.getState().proofreadFindings).toHaveLength(1);
  });

  it('SI LA RECARGA FALLA, LOS HALLAZGOS VIEJOS SE QUEDAN', async () => {
    // Review Focus #3. Es preferible un hallazgo viejo a una pantalla vacia sin
    // aviso: uno se nota y se corrige, el otro parece que la app perdio el
    // documento. Ademas el hallazgo viejo se puede volver a leer, que es lo que
    // permite decidir si todavia sirve.
    const { avisar, backend, refrescar } = montar();
    backend.mockResolvedValue(diff({ cambiado: true, ids_nuevos: ['elem_4'] }));
    recuperar.mockRejectedValue(new Error('ECONNREFUSED'));

    await refrescar();

    expect(proof).not.toHaveBeenCalled();
    expect(useDocStore.getState().proofreadFindings).toHaveLength(1);
    // El aviso del fallback puede decir lo que el diff vio —eso es cierto— pero
    // no puede afirmar que se re-audito, porque no se re-audito nada.
    const texto = (avisar.mock.calls[0]?.[0] as string) ?? '';
    expect(texto.toLowerCase()).not.toContain('hallazgo');
  });
});

describe('mensajeDeReauditoria', () => {
  it('CUANDO NO SE REAUDITO NO DICE NADA DE HALLAZGOS', async () => {
    // `null` es "no se conto", que NO es lo mismo que 0. El watcher lo trata
    // como "no hay veredicto": cae al mensaje del diff en vez de inventar un
    // conteo.
    const avisar = vi.fn();
    const { refrescar } = crearRefrescador({
      pedir: vi.fn().mockResolvedValue(diff({ cambiado: true, ids_nuevos: ['a', 'b', 'c'] })),
      avisar,
      archivo: () => RUTA,
      alRefrescar: async () => ({ listo: true, cambiado: true, nuevos: 3, eliminados: 0, hallazgos: null }),
    });

    await refrescar();

    const texto = avisar.mock.calls[0][0] as string;
    expect(texto).toContain('3');
    expect(texto.toLowerCase()).not.toContain('hallazgo');
  });

  it('CERO HALLAZGOS ES "NO ENCONTRO NADA", no "NO SE MIRE"', () => {
    // Los dos `0` se distinguen por la accion que se dice que ocurrio, que es
    // lo unico que los separa: uno Examino y el otro no llego a examinar.
    const r = mensajeDeReauditoria(
      { listo: true, cambiado: true, nuevos: 3, eliminados: 0, hallazgos: 0 },
      NAME
    );
    expect(r).not.toBeNull();
    expect(r!.tipo).toBe('success');
    expect(r!.texto.toLowerCase()).toContain('no encontró');
  });

  it('NUNCA DICE EL CONTEO DEL DIFF', () => {
    const r = mensajeDeReauditoria(
      { listo: true, cambiado: true, nuevos: 3, eliminados: 7, hallazgos: 11 },
      NAME
    );
    expect(r!.texto).toContain('11');
    expect(r!.texto).not.toContain('3');
    expect(r!.texto).not.toContain('7');
  });

  it('SIN RECARGA NO HAY NADA QUE DECIR', () => {
    expect(mensajeDeReauditoria({ listo: false, cambiado: false, nuevos: 0, eliminados: 0, hallazgos: 4 }, NAME)).toBeNull();
  });
});
