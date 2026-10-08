/**
 * La accion de refresco del store: que recarga el documento cuando Word guardo
 * algo de verdad, y que no toca NADA cuando no lo hay.
 *
 * LA PREGUNTA QUE ESTE ARCHIVO RESPONDE
 *
 * El watcher de Word dispara por cada evento del sistema de archivos, y la
 * mayoria de las veces no hay nada que contar: un Ctrl+S que solo toca estilos, una
 * imagen, un metacampo. Si cada guardado vagara por el store, la app estaria
 * reconstruyendo el documento entero para terminar en el mismo lugar. Peor: si
 * cada guardado tirara los hallazgos, un Ctrl+S perderia el trabajo de la
 * revision por un gesto que no cambio una palabra. Por eso el contrato tiene la
 * palabra "cambiado" y por eso este archivo prueba las dos ramas.
 *
 * LA ACCION RECIBE EL DIFF, NO LA RUTA
 *
 * `/api/refresh-from-word` es de UN solo disparo: cuando ve un cambio, guarda el
 * documento reparseado y recien ahi devuelve el diff. Volver a pegarle al
 * endpoint compara el documento reparseado contra si mismo, responde
 * `cambiado: false` y no recarga nada. Por eso `aplicarRefresco` recibe el diff
 * que el watcher YA tiene y no vuelve a pedirlo, y por eso este archivo no
 * mockea `lib/wordRefresh`: si la accion pegara al endpoint, `recuperar` seria
 * la UNICA llamada de red de esta prueba y estas afirmaciones serian falsas.
 *
 * EL CASO DEL ARCHIVO A MEDIAS ES EL QUE MAS DUELE SI SE IGNORA
 *
 * Un `.docx` se esta reescribiendo entero en cada guardado, asi que leerlo a
 * medias es lo normal y el backend responde `listo: false` en vez de tirar un
 * 500. En ese caso el backend NO guardo nada: recargar el documento seria tirar
 * el estado guardado para atras, y el texto que Word acaba de escribir
 * desapareceria de la pantalla. Un `listo: false` no es "un documento con menos
 * parrafos": es "no se pudo mirar", y no se puede mirar no es motivo para
 * cambiar nada.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// EL ORDEN DE ESOS IMPORTES NO ES COSA ESTETICA. `api/backend` importa al store
// y el store importa a `api/backend`: son un ciclo. Si el test importa primero
// a `api/backend`, el store se evalua por el otro lado del ciclo y los slices
// se quedan con la version REAL de `api.recoverSession`: el mock no se aplica,
// la llamada sale a la red y el `catch {}` se la come en silencio — test verde
// con la recarga sin correr. Importando el store primero, el mock entra antes de
// que los slices lean el modulo.
import { useDocStore } from '../store/useDocStore';
import type { DiffWord } from '../lib/wordRefresh';

vi.mock('../api/backend', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/backend')>();
  return { ...real, recoverSession: vi.fn() };
});

import * as api from '../api/backend';

const recuperar = api.recoverSession as unknown as ReturnType<typeof vi.fn>;

const docViejo = () =>
  ({
    session_id: 's1',
    file_name: 'tesis.docx',
    elements: [{ id: 'elem_0', type: 'paragraph', text: 'el texto viejo', page_number: 1 }],
    meta: { page_count: 1 },
    referencias: [],
  }) as any;

const docNuevo = () =>
  ({
    session_id: 's1',
    file_name: 'tesis.docx',
    elements: [
      { id: 'elem_0', type: 'paragraph', text: 'el texto viejo', page_number: 1 },
      { id: 'elem_1', type: 'paragraph', text: 'el parrafo que Word agrego', page_number: 1 },
    ],
    meta: { page_count: 1 },
    referencias: [],
  }) as any;

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

const montar = () => {
  useDocStore.setState({
    doc: docViejo(),
    tabDocs: { s1: docViejo() },
    proofreadFindings: [],
  });
  return useDocStore.getState().aplicarRefresco;
};

beforeEach(() => {
  vi.clearAllMocks();
  useDocStore.setState({ tabDocs: {}, proofreadFindings: [], references: [] });
});

describe('aplicarRefresco del store', () => {
  it('UN GUARDADO QUE NO CAMBIO NADA NO TOCA NADA', async () => {
    // La razon por la que existe la palabra "cambiado" en el contrato. Un Ctrl+S
    // que solo toca estilos no puede costar una reauditoria entera, y sobre todo
    // no puede vaciar los hallazgos: se perderian por un Ctrl+S.
    const aplicar = montar();

    const r = await aplicar(diff());

    expect(r.cambiado).toBe(false);
    expect(r).toEqual({ listo: true, cambiado: false, nuevos: 0, eliminados: 0, hallazgos: null });
    expect(recuperar).not.toHaveBeenCalled();
    const s = useDocStore.getState();
    expect(s.doc!.elements).toHaveLength(1);
    expect(s.proofreadFindings).toEqual([]);
  });

  it('SIN DOCUMENTO NO SE RECARGA NADA DEL BACKEND', async () => {
    // El watcher dispara eventos del sistema de archivos, no acciones del usuario:
    // puede saltar con la app en Home, sin ninguna sesion abierta. Recargar el
    // documento de una sesion que no esta abierta produce una peticion sin
    // destino.
    useDocStore.setState({ doc: null });
    const aplicar = useDocStore.getState().aplicarRefresco;

    const r = await aplicar(diff({ cambiado: true, ids_nuevos: ['elem_1'] }));

    expect(r).toEqual({ listo: false, cambiado: false, nuevos: 0, eliminados: 0, hallazgos: null });
    expect(recuperar).not.toHaveBeenCalled();
  });

  it('UN ARCHIVO A MEDIAS NO RECARGA NI UN ELEMENTO', async () => {
    // El backend no guardo nada en este caso. Recargar seria tirar el estado
    // guardado para atras y perder de la pantalla el texto recien escrito.
    const aplicar = montar();

    const r = await aplicar(diff({ listo: false, motivo: 'a_medias' }));

    expect(r.listo).toBe(false);
    expect(r.cambiado).toBe(false);
    expect(r.hallazgos).toBeNull();
    expect(recuperar).not.toHaveBeenCalled();
    expect(useDocStore.getState().doc!.elements).toHaveLength(1);
  });

  it('LO QUE WORD AGREGO SE VE EN PANTALLA, EN EL DOC Y EN LA PESTA', async () => {
    const aplicar = montar();
    recuperar.mockResolvedValue(docNuevo());

    const r = await aplicar(diff({ cambiado: true, hash_estructura: 'h2', ids_nuevos: ['elem_1'], ids_eliminados: ['elem_9'] }));

    expect(r).toEqual({ listo: true, cambiado: true, nuevos: 1, eliminados: 1, hallazgos: null });
    const s = useDocStore.getState();
    expect(s.doc!.elements).toHaveLength(2);
    expect(s.tabDocs.s1.elements).toHaveLength(2);
  });

  it('LA RECARGA NO VUELVE A PEDIR EL DIFF AL ENDPOINT DE UN SOLO DISPARO', async () => {
    // La razon de que la accion reciba el diff y no la ruta. Si pegara al
    // endpoint, esa segunda lectura compararia el documento reparseado contra si
    // mismo, responderia `cambiado: false` y la recarga no ocurriria nunca: el
    // backend con el texto nuevo y la pantalla con el viejo. La unica llamada de
    // red de esta rama es `recoverSession`, que es una LECTURA.
    const aplicar = montar();
    recuperar.mockResolvedValue(docNuevo());

    await aplicar(diff({ cambiado: true, ids_nuevos: ['elem_1'] }));

    expect(recuperar).toHaveBeenCalledTimes(1);
    expect(recuperar).toHaveBeenCalledWith('s1');
  });

  it('LA RECARGA PASA POR migrateDocument', async () => {
    // Sin esto, un documento guardado con campos viejos rompe los componentes que
    // leen el esquema actual. Es la misma linea que usa openSession.
    const aplicar = montar();
    recuperar.mockResolvedValue({ ...docNuevo(), schema_version: 1 });

    await aplicar(diff({ cambiado: true }));

    expect(useDocStore.getState().doc!.schema_version).toBe(2);
  });

  it('LAS REFERENCIAS TAMBIEN SON ESTADO DEL DOCUMENTO, Y EL DOCUMENTO CAMBIO', async () => {
    // `openSession` (documentSlice.ts:314) actualiza `references` con las que
    // trae el documento. La recarga recargaba el documento y dejaba esa lista
    // como estaba: si Word agrego o saco una referencia de la bibliografia, el
    // panel de Referencias seguía mostrando las viejas, y el documento en
    // pantalla y el panel se contradecian dentro de la misma app.
    const aplicar = montar();
    useDocStore.setState({
      references: [{ id: 'r1', authors: ['Vieja'], year: 2019, title: 'la que ya no esta', source: 'articulo', doi_or_url: '', raw_text: '', formatted_apa: '' }] as any,
    });
    recuperar.mockResolvedValue({
      ...docNuevo(),
      referencias: [
        { id: 'r1', authors: ['Nueva'], year: 2026, title: 'la que Word agrego', source: 'libro', doi_or_url: '', raw_text: '', formatted_apa: '' },
        { id: 'r2', authors: ['Tercera'], year: 2020, title: 'la segunda', source: 'tesis', doi_or_url: '', raw_text: '', formatted_apa: '' },
      ],
    } as any);

    await aplicar(diff({ cambiado: true }));

    const s = useDocStore.getState();
    expect(s.references.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(s.references[0].authors).toEqual(['Nueva']);
  });

  it('UN GUARDADO QUE NO CAMBIO NADA TAMPOCO TOCA LAS REFERENCIAS', async () => {
    // La otra mitad del contrato: si no hubo cambio, no hay nada rancio que tirar.
    const aplicar = montar();
    useDocStore.setState({
      references: [{ id: 'r1', authors: ['Igual'], year: 2019, title: 'no se toca', source: 'articulo', doi_or_url: '', raw_text: '', formatted_apa: '' }] as any,
    });

    await aplicar(diff());

    expect(useDocStore.getState().references.map((r) => r.id)).toEqual(['r1']);
  });

  it('EL CONTEO DE HALLAZGOS ES null, NO CERO: ESTA TAREA NO REAUDITA', async () => {
    // La reauditoria es de otra tarea. Devolver 0 aca seria una afirmacion sobre
    // algo que no se miro, y el aviso la repetiria: "0 hallazgos" cuando en
    // realidad no se conto ninguno. `null` es "no se conto", que es otra cosa.
    const aplicar = montar();
    recuperar.mockResolvedValue(docNuevo());

    const r = await aplicar(diff({ cambiado: true, ids_nuevos: ['elem_1'] }));

    expect(r.hallazgos).toBeNull();
    expect(r.nuevos).toBe(1);
  });
});
