import { StateCreator } from 'zustand';
import { DocState } from '../types';
import { sonVersionesSimilares } from '../../lib/versionDetector';
import { cargarProyectos, guardarProyectos, Proyecto, VersionDocumento } from '../../lib/proyectoStore';
import * as api from '../../api/backend';

export type { Proyecto, VersionDocumento };

export interface NotificacionProyecto {
  visible: boolean;
  filename: string;
  versionesDetectadas: string[];
  modo: 'nuevo' | 'nueva-version';
  proyectoExistenteId?: string;
}

export interface ProyectoSlice {
  proyectos: Proyecto[];
  proyectoActivoId: string | null;
  notificacionProyecto: NotificacionProyecto | null;
  raizConfigurada: string | null;
  _archivosYaPreguntados: Set<string>;
  mostrarNotificacionProyecto: (payload: NotificacionProyecto | null) => void;
  ocultarNotificacionProyecto: () => void;
  crearProyecto: (nombre: string, filename: string) => Promise<void>;
  agregarVersion: (proyectoId: string, filename: string) => Promise<void>;
  marcarVersionActiva: (proyectoId: string, versionId: string) => void;
  restaurarVersion: (proyectoId: string, versionId: string) => Promise<void>;
  cerrarProyecto: (proyectoId?: string) => Promise<void> | void;
  evaluarProyectoParaArchivo: (file: File) => Promise<void>;
  inicializarPapelera: () => Promise<void>;
  _marcarArchivoComoYaPreguntado: (filename: string) => void;
}

function uuid(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const createProyectoSlice: StateCreator<any, [], [], ProyectoSlice> = (set, get) => ({
  proyectos: cargarProyectos(),
  proyectoActivoId: null,
  notificacionProyecto: null,
  raizConfigurada: null,
  _archivosYaPreguntados: new Set<string>(),

  mostrarNotificacionProyecto: (payload) => {
    set({ notificacionProyecto: payload });
  },

  ocultarNotificacionProyecto: () => {
    set({ notificacionProyecto: null });
  },

  crearProyecto: async (nombre: string, _filename: string) => {
    const proyecto: Proyecto = {
      id: uuid(),
      nombre,
      carpeta: '',
      versiones: [],
      creadoEn: Date.now(),
      cerrado: false,
    };
    const proyectos = [...get().proyectos, proyecto];
    set({ proyectos, proyectoActivoId: proyecto.id, notificacionProyecto: null });
    guardarProyectos(proyectos);
  },

  agregarVersion: async (_proyectoId: string, _filename: string) => {
    set({ notificacionProyecto: null });
  },

  marcarVersionActiva: (proyectoId: string, versionId: string) => {
    const proyectos = get().proyectos.map((p: Proyecto) => {
      if (p.id !== proyectoId) return p;
      return {
        ...p,
        versiones: p.versiones.map((v: VersionDocumento) => ({
          ...v,
          esActiva: v.id === versionId,
        })),
      };
    });
    set({ proyectos });
    guardarProyectos(proyectos);
  },

  /* RESTAURAR UNA VERSIÓN ARCHIVADA. El archivo vive en la papelera del
     backend (`_Papelera/<proyecto_id>/<archivo>`); el backend lo copia de
     vuelta a la carpeta del proyecto y recién DESPUÉS de que respondió bien se
     marca la versión como activa en la vista. Marcarla antes mentiría: la
     pantalla diría "activa" con el archivo todavía en la papelera. */
  restaurarVersion: async (proyectoId: string, versionId: string) => {
    const proyecto = get().proyectos.find((p: Proyecto) => p.id === proyectoId);
    const version = proyecto?.versiones.find((v: VersionDocumento) => v.id === versionId);
    if (!version) return;
    try {
      const resp = await fetch('/api/proyectos-archivo/restaurar-version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proyecto_id: proyectoId, archivo: version.filename }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}) as { detail?: string });
        throw new Error(data.detail || 'el backend no devolvió un motivo');
      }
      get().marcarVersionActiva(proyectoId, versionId);
      get().showToast(`Versión restaurada: ${version.filename}`, 'success');
    } catch (e) {
      const detalle = e instanceof Error ? e.message : 'sin conexión con el backend';
      get().showToast(`No se pudo restaurar "${version.filename}": ${detalle}`, 'error');
    }
  },

  cerrarProyecto: async (proyectoId?: string) => {
    if (typeof proyectoId === 'string') {
      const proyectos = get().proyectos.map((p: Proyecto) =>
        p.id === proyectoId ? { ...p, cerrado: true } : p
      );
      set({ proyectos });
      guardarProyectos(proyectos);
      return;
    }
    const actual = get().proyecto;
    if (actual) {
      try {
        await api?.borrarProyectoEnDisco(actual.id);
      } catch (e) {
        const detalle = e instanceof Error ? e.message : 'No se pudo borrar el proyecto';
        get().showToast(`No se pudo borrar "${actual.nombre}": ${detalle}`, 'error');
        return;
      }
    }
    set({ proyecto: null });
  },

  evaluarProyectoParaArchivo: async (file: File) => {
    const { proyectos, mostrarNotificacionProyecto } = get();

    // 1. ¿Ya pertenece a un proyecto existente?
    const yaEnProyecto = proyectos.some((p: Proyecto) =>
      p.versiones.some((v: VersionDocumento) => v.filename === file.name)
    );
    if (yaEnProyecto) return;

    // 2. ¿Hay un proyecto donde alguna versión es similar?
    const proyectoSimilar = proyectos.find((p: Proyecto) =>
      p.versiones.some((v: VersionDocumento) => sonVersionesSimilares(v.filename, file.name))
    );
    if (proyectoSimilar) {
      mostrarNotificacionProyecto({
        visible: true,
        filename: file.name,
        versionesDetectadas: proyectoSimilar.versiones.map((v: VersionDocumento) => v.filename),
        modo: 'nueva-version',
        proyectoExistenteId: proyectoSimilar.id,
      });
      return;
    }

    // 3. ¿No hay proyecto? Mostrar propuesta de crear uno nuevo.
    const yaPregunté = get()._archivosYaPreguntados.has(file.name);
    if (yaPregunté) return;
    get()._marcarArchivoComoYaPreguntado(file.name);

    mostrarNotificacionProyecto({
      visible: true,
      filename: file.name,
      versionesDetectadas: [],
      modo: 'nuevo',
    });
  },

  inicializarPapelera: async () => {
    const raiz = get().raizConfigurada;
    if (!raiz) return;
    try {
      const resp = await fetch('/api/proyectos/purgar-papelera');
      const data = await resp.json();
      if (data.eliminados > 0) {
        get().pushActivityEvent('info', `Papelera: ${data.eliminados} archivo(s) eliminado(s) automáticamente`);
      }
    } catch {
      // no crítico
    }
  },

  _marcarArchivoComoYaPreguntado: (filename: string) => {
    const set = get()._archivosYaPreguntados;
    set.add(filename);
    set({ _archivosYaPreguntados: new Set(set) });
  },
});
