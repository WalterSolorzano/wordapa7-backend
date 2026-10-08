/**
 * F7 Task 3 — el proyecto sobrevive al reinicio, y deja de inventar su nombre.
 *
 * DOS defectos, y son distintos:
 *
 * 1. El nombre del proyecto no sobrevivía. Vivía derivado del nombre del archivo
 *    de la pestaña activa, así que renombrar el archivo renombraba el proyecto y
 *    cerrar la app lo dejaba en nada. Eso no es una entidad: es un prefijo.
 *
 * 2. Sin pestaña, `ExploradorProyecto` imprimía literalmente `'Proyecto APA 7'`.
 *    Un nombre inventado en pantalla es peor que no tener chrome: la persona lee
 *    un nombre y razona sobre un trabajo que no existe.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useDocStore, persistPartialize } from '../store/useDocStore';
import { ExploradorProyecto as ProjectFolderModal } from '../components/project/ExploradorProyecto';
import { crearProyecto } from '../lib/proyecto';

// La subida pega al backend. Lo que se mide en esta tarea es la RUTA, y la ruta
// se lee del archivo antes de hablar con el backend: espiar la API deja que el
// resto de `uploadFile` corra sin red y sin romper el store.
const borrarProyectoEnDisco = vi.fn().mockResolvedValue(undefined);
const crearProyectoEnDisco = vi.fn();
const sincronizarProyecto = vi.fn();

vi.mock('../api/backend', async () => {
  const real = await vi.importActual<typeof import('../api/backend')>('../api/backend');
  return {
    ...real,
    uploadDocxFile: vi.fn().mockResolvedValue({ session_id: 's1', file_name: 'x.docx', elements: [] }),
    borrarProyectoEnDisco: (...a: unknown[]) => borrarProyectoEnDisco(...a),
    crearProyectoEnDisco: (...a: unknown[]) => crearProyectoEnDisco(...a),
    sincronizarProyecto: (...a: unknown[]) => sincronizarProyecto(...a),
  };
});

/** Los avisos que ve la persona. */
const usarToast = vi.fn();

/**
 * Simula cerrar y reabrir la app con la MISMA lógica que la app usa: el
 * `partialize` real del store. Un `partialize` reescrito acá mediría la copia y
 * no la cosa.
 */
function rehidratar() {
  const opt = useDocStore.persist.getOptions();
  const delStore = opt.partialize!(useDocStore.getState());
  const exportado = persistPartialize(useDocStore.getState());
  // Si el `partialize` de las opciones y el exportado divergieran, el test
  // mediría una cosa y la app otra: el modo de fallo que este archivo mata.
  expect(JSON.stringify(exportado)).toBe(JSON.stringify(delStore));
  return JSON.parse(JSON.stringify({ state: delStore, version: opt.version })).state as {
    proyecto: { nombre: string; raiz: string | null; documentos: string[] } | null;
  };
}

const proyectoDePrueba = () =>
  crearProyecto({ nombre: 'Mi tesis', raiz: 'C:\\tesis' });

beforeEach(() => {
  vi.clearAllMocks();
  borrarProyectoEnDisco.mockResolvedValue(undefined);
  borrarProyectoEnDisco.mockClear();
  /* `crearProyectoEnDisco` sin default A PROPOSITO: obliga a cada test que
     abre un proyecto a decir que id devuelve el backend. Un `mockResolvedValue`
     global devolveria siempre el mismo y una prueba que olvide el `await`
     pasaria midiendo el store sin el backend — que es como se cuela un
     `setProyecto` que nadie verifica que registre nada. */
  crearProyectoEnDisco.mockImplementation(async (p: { nombre: string; raiz?: string | null }) =>
    crearProyecto({ nombre: p.nombre, raiz: p.raiz, id: 'srv1' }),
  );
  sincronizarProyecto.mockResolvedValue({ proyecto: null, documentos: [], error: null });
  useDocStore.setState({
    proyecto: null,
    projectImages: [],
    tabs: [],
    activeTabIndex: 0,
    activeFilePath: null,
  });
});

/** Espia los avisos del store sin reemplazarlo. */
function espiarToasts() {
  useDocStore.setState({ showToast: usarToast });
}

describe('el proyecto sobrevive al reinicio', () => {
  it('el nombre y la carpeta vuelven', () => {
    // El defecto: el nombre salía del nombre del archivo, y el archivo se
    // renombra. Cerrar la app volvía a la nada.
    useDocStore.getState().setProyecto(proyectoDePrueba());

    const antes = rehidratar();
    expect(antes.proyecto?.nombre).toBe('Mi tesis');
    expect(antes.proyecto?.raiz).toBe('C:\\tesis');
  });

  it('sin proyecto, la persistencia no inventa uno', () => {
    // El otro lado del mismo defecto: si `proyecto` está `null` y el store
    // rellena un nombre por las dudas, volvió el nombre inventado, ahora por la
    // puerta de la persistencia en vez de por la del render.
    expect(rehidratar().proyecto).toBeNull();
  });

  it('cerrar el proyecto lo borra de verdad, no lo deja a medias', async () => {
    // `await` porque desde la F7 Task 2 `cerrarProyecto` es async: primero
    // borra en el backend y despues en el store. Sin esperarlo, la afirmacion
    // mide el store antes de que la accion haya corrido — que es como se
    // escriben las pruebas que pasan por el motivo equivocado.
    useDocStore.getState().setProyecto(proyectoDePrueba());
    await useDocStore.getState().cerrarProyecto();
    expect(useDocStore.getState().proyecto).toBeNull();
    expect(rehidratar().proyecto).toBeNull();
  });

  it('el proyecto recuerda los documentos que se le agregaron', () => {
    // Un proyecto sin documentos es una etiqueta. Si al cargar una sesion no
    // queda anotada en su proyecto, el proyecto no es un conjunto de sesiones.
    const p = proyectoDePrueba();
    useDocStore.getState().setProyecto(p);
    useDocStore.getState().setProyecto({
      ...useDocStore.getState().proyecto!,
      documentos: [...useDocStore.getState().proyecto!.documentos, 'abc123'],
    });
    expect(rehidratar().proyecto?.documentos).toEqual(['abc123']);
  });

  it('abrir un proyecto lo REGISTRA en el backend', async () => {
    // Sin esto, el proyecto vive solo en indexedDB y no hay contra que
    // sincronizar ni borrar: `cerrarProyecto` borraria una fila que nunca
    // existio, o sea que el borrado responderia "ok" sin borrar nada. Un borrado
    // que dice que si y no borra es peor que uno que falla.
    await useDocStore.getState().setProyecto(proyectoDePrueba());
    expect(crearProyectoEnDisco).toHaveBeenCalledWith({ nombre: 'Mi tesis', raiz: 'C:\\tesis' });
  });

  it('si el backend no responde, el proyecto NO se pierde en memoria', async () => {
    // Perder el nombre del trabajo por un fallo de red es la peor respuesta
    // posible: el aviso dice por que, y el nombre sigue a la vista.
    crearProyectoEnDisco.mockRejectedValueOnce(new Error('sin conexion'));
    espiarToasts();
    await useDocStore.getState().setProyecto(proyectoDePrueba());
    expect(useDocStore.getState().proyecto?.nombre).toBe('Mi tesis');
    expect(usarToast).toHaveBeenCalledWith(expect.stringContaining('sin conexion'), 'warning');
  });

  it('una carpeta es UNA sincronizacion, no una subida por archivo', async () => {
    // El defecto que cierra esta prueba: el Explorador subia un `.docx` por
    // archivo, en serie, cada uno con su auditoria completa y su `isLoading`.
    // Veinte capitulos eran veinte pantallas de carga seguidas. Con la entidad
    // del backend, releer la carpeta es una sola llamada.
    crearProyectoEnDisco.mockImplementation(async (p: { nombre: string; raiz?: string | null }) =>
      crearProyecto({ nombre: p.nombre, raiz: p.raiz, id: 'srv1' }),
    );
    await useDocStore.getState().setProyecto(proyectoDePrueba());
    sincronizarProyecto.mockResolvedValue({
      proyecto: { ...proyectoDePrueba(), id: 'srv1' },
      documentos: ['c1.docx', 'c2.docx', 'c3.docx'],
      error: null,
    });

    const hallados = await useDocStore.getState().sincronizarProyectoActual();

    expect(hallados).toEqual(['c1.docx', 'c2.docx', 'c3.docx']);
    /* UNA llamada para los tres capitulos. Si esto hiciese una por documento,
       el conteo seria tres y el defecto estaria de vuelta. */
    expect(sincronizarProyecto).toHaveBeenCalledTimes(1);
    expect(sincronizarProyecto).toHaveBeenCalledWith('srv1');
  });

  it('una carpeta ilegible avisa y conserva lo que ya habia', async () => {
    // El backend contesta 200 con la lista que conservo y un texto de por que no
    // pudo. Si el store tirara el error, perderia los documentos que SI se
    // pudieron leer: el Explorador quedaria vacio por un fallo de lectura.
    crearProyectoEnDisco.mockImplementation(async (p: { nombre: string; raiz?: string | null }) =>
      crearProyecto({ nombre: p.nombre, raiz: p.raiz, id: 'srv1' }),
    );
    await useDocStore.getState().setProyecto(proyectoDePrueba());
    sincronizarProyecto.mockResolvedValue({
      proyecto: { ...proyectoDePrueba(), id: 'srv1' },
      documentos: ['c1.docx'],
      error: 'No such file or directory',
    });
    espiarToasts();

    const hallados = await useDocStore.getState().sincronizarProyectoActual();

    expect(hallados).toEqual(['c1.docx']);
    expect(usarToast).toHaveBeenCalledWith(expect.stringContaining('No such file'), 'warning');
  });

  it('cerrar el proyecto tambien lo borra del backend', async () => {
    useDocStore.getState().setProyecto({ ...proyectoDePrueba(), id: 'p1' });
    espiarToasts();
    await useDocStore.getState().cerrarProyecto();
    expect(borrarProyectoEnDisco).toHaveBeenCalledWith('p1');
  });

  it('borrar el proyecto que falla se avisa y NO se finge que se borro', async () => {
    // Un borrado que falla y no dice nada deja al usuario creyendo que se borro
    // un proyecto que sigue ahi. Y el store tampoco lo borra en local: si la
    // pantalla queda sin proyecto mientras el backend lo tiene, la proxima
    // lectura lo trae de vuelta sin que la persona entienda por que. Conservar
    // el estado local y avisar el fallo es lo unico que no cuenta dos veces.
    borrarProyectoEnDisco.mockRejectedValueOnce(new Error('sin red'));
    useDocStore.getState().setProyecto(proyectoDePrueba());
    espiarToasts();
    await useDocStore.getState().cerrarProyecto();
    expect(useDocStore.getState().proyecto?.nombre).toBe('Mi tesis');
    expect(usarToast).toHaveBeenCalledWith(expect.stringContaining('sin red'), 'error');
  });
});

describe('un proyecto sin nombre no se puede crear', () => {
  it('un nombre vacío se rechaza en vez de convertirse en un nombre inventado', () => {
    // ESTA ES LA GUARDA DE `crearProyecto`, y es la que impide que el nombre
    // inventado vuelva por la puerta de atrás: si `crearProyecto` aceptara un
    // nombre vacío, el llamador que "se Forget" de ponerlo volvería a imprimir
    // una cadena vacía en el título, que es el mismo defecto con menos letras.
    expect(() => crearProyecto({ nombre: '' })).toThrow();
    expect(() => crearProyecto({ nombre: '   ' })).toThrow();
  });

  it('el error es al construir, no un nombre raro que se muestra', () => {
    // El fallo tiene que ser ruidoso en el desarrollo y NUNCA llegar a la
    // pantalla: por eso lanza en vez de devolver un objeto con nombre vacío.
    try {
      crearProyecto({ nombre: '' });
      throw new Error('no debería llegar acá');
    } catch (e) {
      expect((e as Error).message).toMatch(/nombre/i);
    }
  });

  it('crearProyecto completa TODOS los campos', () => {
    // Un `Proyecto` armado a mano puede no tener `creado`, y sin `creado` no se
    // puede ordenar nunca. La función existe para que eso sea imposible.
    const p = crearProyecto({ nombre: 'Tesis' });
    expect(p).toEqual({
      id: expect.any(String),
      nombre: 'Tesis',
      raiz: null,
      documentos: [],
      figuras: [],
      creado: expect.any(String),
    });
    expect(p.id.length).toBeGreaterThan(0);
  });

  it('dos proyectos seguidos no comparten id', () => {
    // Si el id saliera de `Date.now()`, dos proyectos abiertos en el mismo
    // milisegundo serían el mismo, y el segundo pisaría al primero.
    const a = crearProyecto({ nombre: 'A' });
    const b = crearProyecto({ nombre: 'B' });
    expect(a.id).not.toBe(b.id);
  });
});

describe('sin proyecto, el chrome de proyecto no se monta', () => {
  const montar = () =>
    render(<ProjectFolderModal onOpenMerge={() => {}} />);

  it('el nombre inventado no aparece en pantalla', () => {
    // El defecto: sin pestaña activa el título decía 'Proyecto APA 7'.
    montar();
    expect(document.body.textContent).not.toContain('Proyecto APA 7');
  });

  it('no hay ningún nombre de proyecto en pantalla sin proyecto', () => {
    // Más fuerte que el anterior, y por eso el que manda: no basta con que el
    // relleno haya cambiado de texto, tiene que NO haber un título.
    montar();
    expect(screen.queryByTestId('proyecto-titulo')).toBeNull();
  });

  it('con proyecto, el chrome se monta y dice SU nombre', () => {
    // Y no solo "deja de mentir": cuando hay proyecto, el nombre real está.
    useDocStore.getState().setProyecto(proyectoDePrueba());
    montar();
    expect(screen.getByTestId('proyecto-titulo').textContent).toContain('Mi tesis');
  });

  it('con proyecto pero sin pestaña, el nombre tampoco sale del archivo', () => {
    // El nombre del proyecto y el del archivo son dos cosas. Si el título
    // prefiere el archivo, renombrar el archivo renombra el proyecto, que es
    // exactamente lo que esta tarea vino a cerrar.
    useDocStore.getState().setProyecto(proyectoDePrueba());
    useDocStore.setState({
      tabs: [{ session_id: 's1', file_name: 'Otra cosa_v9.docx' }],
      activeTabIndex: 0,
    } as never);
    montar();
    expect(screen.getByTestId('proyecto-titulo').textContent).toContain('Mi tesis');
    expect(screen.getByTestId('proyecto-titulo').textContent).not.toContain('Otra cosa');
  });
});

describe('el botón de abrir carpeta tiene destino', () => {
  it('subir un archivo con ruta deja esa ruta', () => {
    // El defecto: `activeFilePath` es `null` por defecto y NUNCA se establecía en
    // el camino de subir un archivo desde la app, así que el botón "Abrir
    // carpeta" no aparecía nunca en el modo de uso normal. Solo aparecía si el
    // documento se abría desde el menú contextual de Windows.
    const ruta = 'C:\\tesis\\cap1.docx';
    const archivo = Object.assign(new File([new Uint8Array([1])], 'cap1.docx'), { path: ruta });

    void useDocStore.getState().uploadFile(archivo);

    // La ruta del archivo se conoce ANTES de hablar con el backend, y se
    // escribe antes: un fallo de red no puede borrar el lugar de donde vino el
    // documento.
    expect(useDocStore.getState().activeFilePath).toBe(ruta);
  });

  it('sin ruta en el archivo, la ruta anterior no se borra', () => {
    // Un `File` de navegador no tiene `.path`. Poner `null` sería defendible,
    // pero BORRAR la ruta del documento que se está reemplazando dejaría al
    // usuario sin "Abrir carpeta" sobre el archivo que todavía tiene abierto.
    useDocStore.getState().setActiveFilePath('C:\\tesis\\anterior.docx');
    const archivo = new File([new Uint8Array([1])], 'nuevo.docx');

    void useDocStore.getState().uploadFile(archivo);

    expect(useDocStore.getState().activeFilePath).toBe('C:\\tesis\\anterior.docx');
  });
});
