/* WordAPA7 — Roster Store Persistente para Integrantes y Profesores */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface IntegranteItem {
  id: string;
  nombre: string;
  carnet?: string;
}

export interface ProfesorItem {
  id: string;
  nombre: string;
}

export interface GrupoItem {
  id: string;
  valor: string;
}

interface RosterState {
  integrantes: IntegranteItem[];
  profesores: ProfesorItem[];
  grupos: string[];

  addIntegrante: (nombre: string, carnet?: string) => void;
  removeIntegrante: (id: string) => void;
  addProfesor: (nombre: string) => void;
  removeProfesor: (id: string) => void;
  addGrupo: (valor: string) => void;
  removeGrupo: (valor: string) => void;
}

export const useRosterStore = create<RosterState>()(
  persist(
    (set) => ({
      integrantes: [
        { id: 'int_1', nombre: 'Br. María del Pilar Bermúdez Bermúdez', carnet: '2023-0451U' },
        { id: 'int_2', nombre: 'Br. Walter Noel Solorzano Gaitán', carnet: '2023-0432U' },
        { id: 'int_3', nombre: 'Br. Iván Fernando Álvarez Ríos', carnet: '2022-0215I' },
        { id: 'int_4', nombre: 'Br. Stephani Valeria Castellón Borge', carnet: '2021-0574I' },
        { id: 'int_5', nombre: 'Br. Maynard Damián Orozco Baquedano', carnet: '2023-0397U' },
        { id: 'int_6', nombre: 'Br. Wilmary Eunice Díaz Escorcia', carnet: '2023-0802I' },
        { id: 'int_7', nombre: 'Br. Paulo Antonio Flores Contreras', carnet: '2020-1160U' },
      ],
      profesores: [
        { id: 'prof_1', nombre: 'Ing. Juan Carlos Aburto Poveda' },
        { id: 'prof_2', nombre: 'Ing. Hason Enoc Vivas Pavón' },
      ],
      grupos: ['3T1 IND', '4M6 – IND', '5M1 – CO'],

      addIntegrante: (nombre, carnet) =>
        set((state) => {
          if (!nombre.trim()) return state;
          const exists = state.integrantes.some(
            (i) => i.nombre.toLowerCase() === nombre.trim().toLowerCase()
          );
          if (exists) return state;
          return {
            integrantes: [
              ...state.integrantes,
              { id: `int_${Date.now()}`, nombre: nombre.trim(), carnet: carnet?.trim() },
            ],
          };
        }),

      removeIntegrante: (id) =>
        set((state) => ({
          integrantes: state.integrantes.filter((i) => i.id !== id),
        })),

      addProfesor: (nombre) =>
        set((state) => {
          if (!nombre.trim()) return state;
          const exists = state.profesores.some(
            (p) => p.nombre.toLowerCase() === nombre.trim().toLowerCase()
          );
          if (exists) return state;
          return {
            profesores: [
              ...state.profesores,
              { id: `prof_${Date.now()}`, nombre: nombre.trim() },
            ],
          };
        }),

      removeProfesor: (id) =>
        set((state) => ({
          profesores: state.profesores.filter((p) => p.id !== id),
        })),

      addGrupo: (valor) =>
        set((state) => {
          if (!valor.trim()) return state;
          if (state.grupos.includes(valor.trim())) return state;
          return { grupos: [...state.grupos, valor.trim()] };
        }),

      removeGrupo: (valor) =>
        set((state) => ({
          grupos: state.grupos.filter((g) => g !== valor),
        })),
    }),
    {
      name: 'wordapa7-roster-storage',
    }
  )
);
