/**
 * F7 Task 4 — una carpeta es una operación con progreso, no veinte subidas.
 *
 * EL DEFECTO, EN DOS PARTES.
 *
 * `ExploradorProyecto` subía un `.docx` por archivo, en serie, cada uno con su
 * auditoría completa y su `isLoading`: veinte capítulos eran veinte pantallas
 * de carga seguidas, y el overlay de carga no decía qué estaba pasando. Con la
 * entidad del backend, "vincular una carpeta" es UNA operación: el backend
 * relee el disco y devuelve qué encontró.
 *
 * Y la galería: `slice(0, 8)` sin "ver más" dejaba las imágenes de la novena en
 * adelante existentes en el store e invisibles, y `objectFit: cover` recortaba
 * un logo vertical a una banda.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { ExploradorProyecto } from '../components/project/ExploradorProyecto';
import { LoadingTips } from '../components/layout/LoadingTips';
import { crearProyecto } from '../lib/proyecto';
import type { ImagenProyecto } from '../types';

const sincronizarProyecto = vi.fn();
const crearProyectoEnDisco = vi.fn();

vi.mock('../api/backend', async () => {
  const real = await vi.importActual<typeof import('../api/backend')>('../api/backend');
  return {
    ...real,
    sincronizarProyecto: (...a: unknown[]) => sincronizarProyecto(...a),
    crearProyectoEnDisco: (...a: unknown[]) => crearProyectoEnDisco(...a),
  };
});

const proyectoDePrueba = () => crearProyecto({ nombre: 'Mi tesis', raiz: 'C:\\tesis' });

/** Lo que el store dice mientras sincroniza. Se lee DENTRO de la llamada, para
 *  no depender de la velocidad del mock: si el mock resuelve rápido, el
 *  `loadingQue` ya se limpió cuando el test mira. */
let progresoDuranteSync: string | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  progresoDuranteSync = null;
  sincronizarProyecto.mockImplementation(async () => {
    progresoDuranteSync = useDocStore.getState().loadingQue;
    return { proyecto: proyectoDePrueba(), documentos: [], error: null };
  });
  crearProyectoEnDisco.mockImplementation(async (p: { nombre: string; raiz?: string | null }) =>
    crearProyecto({ nombre: p.nombre, raiz: p.raiz, id: 'srv1' }),
  );
  useDocStore.setState({
    proyecto: null,
    projectImages: [],
    tabs: [],
    activeTabIndex: 0,
    activeFilePath: null,
    loadingQue: null,
  });
});

/** Simula la selección de una carpeta con `cantidad` capítulos. */
function abrirCarpetaCon(cantidad: number) {
  const archivos = Array.from({ length: cantidad }, (_, i) =>
    new File([new Uint8Array([1])], `capitulo-${i + 1}.docx`),
  );
  const { container } = render(<ExploradorProyecto onOpenMerge={() => {}} />);
  const input = container.querySelector('input[webkitdirectory]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: archivos } });
}

function imagenDePrueba(n: number): ImagenProyecto {
  return {
    id: `img-${n}`,
    name: `figura-${n}.png`,
    assetId: `asset-${n}`,
    previewUrl: `/api/assets/archivo/asset-${n}`,
  };
}

describe('una carpeta es una operación, no veinte', () => {
  it('veinte capítulos son UNA sincronización, no veinte subidas', async () => {
    // El defecto: un `.docx` por archivo, en serie, cada uno con su auditoría
    // completa y su `isLoading`. La entidad del backend hace que sea una sola
    // llamada a sync.
    await useDocStore.getState().setProyecto(proyectoDePrueba());
    abrirCarpetaCon(20);

    await waitFor(() => {
      expect(sincronizarProyecto).toHaveBeenCalledTimes(1);
    });
    expect(sincronizarProyecto).toHaveBeenCalledWith('srv1');
  });

  it('el progreso dice cuántos documentos hay', async () => {
    // El overlay de carga (F1) ya tiene la prop `que`: el progreso sale por
    // ahí, con el texto que el store escribe. Un spinner mudo obliga a
    // adivinar, y adivinar mientras se espera es la peor manera de esperar.
    await useDocStore.getState().setProyecto(proyectoDePrueba());
    abrirCarpetaCon(20);

    await waitFor(() => {
      expect(progresoDuranteSync).toContain('20');
    });
  });

  it('el overlay muestra el progreso que el store escribe', async () => {
    // El campo del store alimenta la prop `que` del overlay: un solo lugar
    // para el progreso, y el overlay lo dice en vez de inventar un texto.
    useDocStore.setState({ loadingQue: 'Sincronizando carpeta: 20 documentos...' });
    render(<LoadingTips activo />);
    expect(screen.getByText(/Sincronizando carpeta: 20 documentos/)).toBeTruthy();
  });
});

describe('la galería muestra todas las imágenes', () => {
  it('doce imágenes se ven, no las primeras ocho', () => {
    // `slice(0, 8)` sin "ver más" era un recorte invisible: las imágenes de la
    // novena en adelante existían en el store, no se veían, y nadie decía
    // cuántas faltaban.
    useDocStore.setState({
      proyecto: proyectoDePrueba(),
      projectImages: Array.from({ length: 12 }, (_, i) => imagenDePrueba(i + 1)),
    });
    const { container } = render(<ExploradorProyecto onOpenMerge={() => {}} />);
    const galeria = container.querySelector('[data-testid="galeria-imagenes"]') as HTMLElement;
    expect(galeria.children.length).toBe(12);
  });

  it('el logo de la galería no se recorta', () => {
    // `objectFit: cover` sobre un logo vertical lo recorta a una banda y lo
    // que se ve no es el logo. `contain` muestra la imagen entera.
    useDocStore.setState({
      proyecto: proyectoDePrueba(),
      projectImages: [imagenDePrueba(1)],
    });
    const { container } = render(<ExploradorProyecto onOpenMerge={() => {}} />);
    const img = container.querySelector('[data-testid="galeria-imagenes"] img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.style.objectFit).toBe('contain');
  });
});

describe('el vacío total del explorador guía a empezar', () => {
  it('sin documentos ni imágenes muestra un estado vacío con sus acciones', () => {
    // Antes había DOS cajas punteadas apiladas ("Todavía no hay documentos",
    // "No hay imágenes"), que leen como cupos en blanco. En su lugar, un
    // estado vacío que dice la causa y ofrece la salida.
    render(<ExploradorProyecto onOpenMerge={() => {}} />);
    expect(screen.getByTestId('estado-vacio')).toBeTruthy();
    expect(screen.getByRole('button', { name: /vincular carpeta/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /agregar \.docx/i })).toBeTruthy();
    expect(screen.queryByText(/Todavía no hay documentos/i)).toBeNull();
    expect(screen.queryByText(/No hay imágenes registradas/i)).toBeNull();
  });

  it('con documentos pero sin imágenes, no tapa la lista con el vacío total', () => {
    // El vacío guiado es para "no hay NADA", no para esconder la mitad que sí
    // existe: con documentos cargados, se ve la lista y solo la caja de
    // imágenes queda punteada.
    useDocStore.setState({
      proyecto: proyectoDePrueba(),
      tabs: [{ session_id: 's1', file_name: 'Capitulo_v1.docx' }] as never,
      activeTabIndex: 0,
    });
    render(<ExploradorProyecto onOpenMerge={() => {}} />);
    expect(screen.queryByTestId('estado-vacio')).toBeNull();
    expect(screen.getByText(/No hay imágenes registradas/i)).toBeTruthy();
  });
});
