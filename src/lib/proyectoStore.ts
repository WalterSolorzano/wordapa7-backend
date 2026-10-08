/**
 * Persistencia de proyectos en localStorage.
 * JSON directo — no IndexedDB, no Zustand persist (para no pisar el partialize existente).
 */

export interface VersionDocumento {
  id: string;
  filename: string;
  rutaEnDisco: string;
  palabras: number;
  fechaModificacion: number;
  autor: string;
  esActiva: boolean;
  archivadoEn?: number;
}

export interface Proyecto {
  id: string;
  nombre: string;
  carpeta: string;
  versiones: VersionDocumento[];
  creadoEn: number;
  cerrado: boolean;
}

const CLAVE = 'wordapa7_proyectos_v1';

export function cargarProyectos(): Proyecto[] {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) || '[]');
  } catch {
    return [];
  }
}

export function guardarProyectos(proyectos: Proyecto[]): void {
  localStorage.setItem(CLAVE, JSON.stringify(proyectos));
}
