/**
 * El catálogo de instituciones y de carreras de la portada.
 *
 * Vive acá y no en `CoverEditorPanel.tsx` por una razón concreta: el store
 * necesita resolver el NOMBRE a partir del CÓDIGO, y un catálogo que solo existe
 * en el componente obliga al store a importar un `.tsx` para saber qué nombre
 * corresponde a "UNAN". Un catálogo compartido es dato, no presentación.
 *
 * `codigo` e `id` son la identidad. El nombre es lo que se muestra y lo que se
 * escribe en `portada.institution`; el estado seleccionado guarda el código, y se
 * compara por igualdad EXACTA. La razón entera está en el tipo `PortadaData`: el
 * estado "seleccionado" se derivaba con `String.includes` sobre texto libre, así
 * que con dos instituciones escritas quedaban los dos chips encendidos.
 */
import type { ReactNode } from 'react';

export interface UniversidadPreset {
  id: string;
  codigo: string;
  nombre: string;
  areaDefault: string;
  /** El archivo que sirve `python/main.py`. Con doble letra es un 404. */
  logoUrl?: string;
}

export interface CarreraPreset {
  id: string;
  label: string;
  nombre: string;
  area: string;
  icon?: ReactNode;
}

export const CATALOGO_DE_UNIVERSIDADES: UniversidadPreset[] = [
  {
    id: 'uni',
    codigo: 'UNI',
    nombre: 'Universidad Nacional de Ingeniería',
    areaDefault: 'Área de Conocimiento de Ingeniería y Afines',
    logoUrl: '/api/assets/logo_uni.png',
  },
  {
    id: 'unan',
    codigo: 'UNAN',
    nombre: 'Universidad Nacional Autónoma de Nicaragua (UNAN-Managua)',
    areaDefault: 'Facultad de Ciencias e Ingeniería',
    /* El nombre del archivo es `logo_unan.png` y lo sirve `python/main.py`. La
       versión con doble `a` que estaba antes era un 404: elegías UNAN y no había
       logo, sin error y sin aviso. */
    logoUrl: '/api/assets/logo_unan.png',
  },
];

export const CATALOGO_DE_CARRERAS: CarreraPreset[] = [
  {
    id: 'electronica',
    label: 'Electrónica',
    nombre: 'Ingeniería Electrónica',
    area: 'Área de Conocimiento de Ingeniería y Afines',
  },
  {
    id: 'sistemas',
    label: 'Sistemas',
    nombre: 'Ingeniería en Sistemas',
    area: 'Área de Conocimiento de Ingeniería y Afines',
  },
  {
    id: 'civil',
    label: 'Civil',
    nombre: 'Ingeniería Civil',
    area: 'Facultad de Tecnología de la Construcción',
  },
  {
    id: 'industrial',
    label: 'Industrial',
    nombre: 'Ingeniería Industrial',
    area: 'Facultad de Tecnología de la Industria',
  },
  {
    id: 'quimica',
    label: 'Química',
    nombre: 'Ingeniería Química',
    area: 'Facultad de Ingeniería Química',
  },
];
