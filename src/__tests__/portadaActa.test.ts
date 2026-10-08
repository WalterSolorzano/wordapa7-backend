/**
 * Los datos del acta salen de la portada, y una sesion guardada no se pierde.
 *
 * El defecto que se reporto: con "Conservar original" el `.docx` salia sin el
 * autor, sin el profesor asesor y sin el grupo. La causa es que esos tres datos
 * vivian DENTRO de `portada`, y con `use_original_cover: true` el bloque de
 * portada no se toca: no habia de donde sacarlos.
 *
 * La separacion es el arreglo, y arrastra una migracion: `partialize` persiste
 * `portadaProfiles`, y cada perfil es una foto de la portada de la sesion. Un
 * perfil guardado antes del cambio tiene el autor ahi adentro. Si la migracion
 * no existe, ese usuario abre la app y su autor no esta en ningun lado.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

/* `useDocStore` va PRIMERO por el mismo motivo que en `coverStudioChrome`:
   `coverSlice` entra en la cadena de imports del store, y si el test lo pide
   antes, el store se evalua con el modulo de portada a medio construir y
   `createCoverSlice` todavia no existe. */
vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  resolveAssetUrl: vi.fn(),
  fetchWithTrace: vi.fn(),
  triggerDownload: vi.fn(),
}));
import { useDocStore } from '../store/useDocStore';
import { defaultActa, defaultPortada, migrarActaDesdePortada } from '../store/slices/coverSlice';
import type { PortadaData } from '../types';

/** Una portada como la guardaba la app antes de la fase: el acta adentro. */
const portadaVieja = (extra: Record<string, unknown> = {}): PortadaData =>
  ({
    ...defaultPortada,
    author: 'Br. Juan Perez | Carnet: 2023-1029U',
    grupo: '3T1 IND',
    instructor: 'Ing. Carlos Rodriguez',
    ...extra,
  }) as PortadaData;

describe('los datos del acta salen de la portada', () => {
  it('el autor, el grupo y el profesor se leen de una portada vieja', () => {
    const acta = migrarActaDesdePortada(portadaVieja());
    expect(acta.autor).toBe('Br. Juan Perez | Carnet: 2023-1029U');
    expect(acta.grupo).toBe('3T1 IND');
    expect(acta.profesor_asesor).toEqual(['Ing. Carlos Rodriguez']);
  });

  it('el tipo de la portada ya no declara los campos del acta', () => {
    // Si esto falla, alguien los volvio a agregar. Volverian porque el cliente
    // viejo los manda y pydantic los aceptaria en silencio.
    for (const clave of ['author', 'grupo', 'instructor']) {
      expect(clave in defaultPortada).toBe(false);
    }
  });

  it('migrar dos veces no duplica ni pisa lo que ya estaba', () => {
    // Idempotente a proposito: la migracion corre al cargar y en cada cambio de
    // documento, y una que duplica el profesor asesor escribe su nombre dos
    // veces en el `.docx`.
    const una = migrarActaDesdePortada(portadaVieja());
    const dos = migrarActaDesdePortada(portadaVieja(), una);
    expect(dos).toEqual(una);
    expect(dos.profesor_asesor).toHaveLength(1);
  });

  it('un profesor que venia pegado con comas queda como lista', () => {
    // El commit viejo era un string. Un comite de defensa son varias personas,
    // y pegadas con coma el corrector de ortografia subraya la coma.
    const acta = migrarActaDesdePortada(
      portadaVieja({ instructor: 'Ing. Carlos Rodriguez, Lic. Ana Lopez' }),
    );
    expect(acta.profesor_asesor).toEqual(['Ing. Carlos Rodriguez', 'Lic. Ana Lopez']);
  });

  it('lo que ya esta en el acta no se pisa con lo de la portada', () => {
    // El usuario escribio un autor nuevo y todavia esta el viejo en la portada
    // persistida. Gana lo que escribio.
    const acta = migrarActaDesdePortada(portadaVieja(), {
      ...defaultActa,
      autor: 'Br. Ana Perez',
    });
    expect(acta.autor).toBe('Br. Ana Perez');
  });

  it('una portada sin datos del acta no inventa ninguno', () => {
    expect(migrarActaDesdePortada(defaultPortada)).toEqual(defaultActa);
    expect(migrarActaDesdePortada(null)).toEqual(defaultActa);
    expect(migrarActaDesdePortada(undefined)).toEqual(defaultActa);
  });
});

describe('el acta en el store', () => {
  beforeEach(() => {
    useDocStore.setState({ portada: { ...defaultPortada }, acta: { ...defaultActa } });
  });

  it('el store tiene el acta y no la tiene la portada', () => {
    useDocStore.getState().updateActaField('autor', 'Br. Juan Perez');
    const { portada, acta } = useDocStore.getState();
    expect(acta.autor).toBe('Br. Juan Perez');
    expect('author' in portada).toBe(false);
  });

  it('el store migra una portada vieja al acta cuando se le pide', () => {
    useDocStore.getState().migrarActa(portadaVieja());
    expect(useDocStore.getState().acta.profesor_asesor).toEqual(['Ing. Carlos Rodriguez']);
    expect(useDocStore.getState().acta.grupo).toBe('3T1 IND');
  });

  it('escribir el autor NO toca los parrafos de la portada del documento', () => {
    // La razon de que `setActa` no pase por `syncCoverFieldToElements`:
    // esa funcion reescribe el bloque de portada del documento del usuario, y
    // `AGENTS.md` dice que con la portada original ese bloque no se toca ni un
    // caracter. El autor llega al `.docx` por el bloque del acta.
    const elementos = [
      { id: 'c1', type: 'portada_block' as const, text: 'UNIVERSIDAD NACIONAL', is_cover_section: true, needs_review: false, auto_applied: false, cita_ids: [], confidence: 1 },
      { id: 'b1', type: 'paragraph' as const, text: 'Cuerpo', is_cover_section: false, needs_review: false, auto_applied: false, cita_ids: [], confidence: 1 },
    ];
    useDocStore.setState({
      doc: { session_id: 's1', file_name: 'x.docx', elements: elementos } as never,
    });
    const antes = JSON.stringify(useDocStore.getState().doc!.elements);
    useDocStore.getState().updateActaField('autor', 'Br. Juan Perez');
    const despues = useDocStore.getState().doc!.elements;
    expect(JSON.stringify(despues)).toBe(antes);
  });
});
