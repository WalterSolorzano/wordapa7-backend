/**
 * El chip de guardado: dice cuándo se guardó, y no promete nada que no haga.
 *
 * CONTEXTO QUE NO SE SABE LEYENDO ESTE ARCHIVO. El backend ya guarda solo:
 * `python/routers/sessions.py` llama a `save_session_state(doc, STORAGE_DIR)` en
 * diez endpoints de mutación. El problema nunca fue que faltara el guardado
 * automático: es que **no se veía**, y al lado había un botón "Guardar" que no
 * guardaba nada — su página decía "el documento se guarda automáticamente" y su
 * único botón era "Exportar".
 *
 * La persona eligió esta variante sobre las otras dos: el chip que ya existe,
 * más la hora. "Guardado hace 2 min" da la misma confianza que un reloj sin
 * agregar un control, y sin recargar la barra.
 *
 * TRES ESTADOS Y POR QUÉ NO SON DOS. `hasUnsavedChanges` solo tiene dos valores,
 * pero con dos el reloj miente: entre una edición y la siguiente, el documento
 * está limpio y el chip diría "Guardado" aunque el guardado no acaba de pasar.
 * El tercer estado —"Guardando…"— es lo que hace que la hora sea cierta.
 *
 * Y LA REGLA DURA: el chip no puede decir "Guardado hace 2 min" sin saber CUÁNDO
 * se guardó. `lastSavedAt` no existe en el store, y se fija con un reloj del
 * cliente, no con la latencia de una llamada: el chip informa de cuándo quedó
 * guardado por última vez, no de cuánto tardó el servidor.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { UnifiedToolbar, tiempoRelativo } from '../components/toolbar/UnifiedToolbar';
import { useDocStore } from '../store/useDocStore';

/* La función pura, probada sola. El componente la ejercita por la vía del reloj,
   pero no llega a los bordes: `null`, el día exacto y el singular. Un reloj que
 * se cuelga con un valor raro no se nota en la prueba del componente, y es
 * justamente en los bordes donde un formato se rompe. */
describe('tiempoRelativo', () => {
  const T0 = new Date('2026-09-27T12:00:00Z').getTime();
  const en = (min: number) => T0 - min * 60_000;

  it('sin hora devuelve null, no cero', () => {
    /* "no lo sé" y "hace 0 min" son respuestas distintas, y la primera es la
       honesta: un reloj que arranca en cero al abrir la app dice que acabás de
       guardar algo que no guardaste. */
    expect(tiempoRelativo(null)).toBeNull();
  });

  it('menos de un minuto es "0 min", no un negativo', () => {
    /* Un reloj que anda con el reloj del cliente y una marca de tiempo del mismo
       reloj puede dar 30 segundos. Con `Math.floor` eso ya es 0; lo que no
       puede ser es -1. */
    expect(tiempoRelativo(T0 - 30_000, T0)).toBe('0 min');
    expect(tiempoRelativo(T0 + 5_000, T0)).toBe('0 min');
  });

  it('minutos, horas y días', () => {
    expect(tiempoRelativo(en(1), T0)).toBe('1 min');
    expect(tiempoRelativo(en(59), T0)).toBe('59 min');
    expect(tiempoRelativo(en(60), T0)).toBe('1 h');
    expect(tiempoRelativo(en(60 * 23), T0)).toBe('23 h');
    expect(tiempoRelativo(en(60 * 24), T0)).toBe('1 día');
    expect(tiempoRelativo(en(60 * 24 * 3), T0)).toBe('3 días');
  });
});

const showToast = vi.fn();
const setShowFileMenu = vi.fn();
const setLiveChatOpen = vi.fn();
const saveSnapshot = vi.fn().mockResolvedValue(undefined);
const saveSnapshotNOW = vi.fn().mockResolvedValue(undefined);

const DOC = {
  session_id: 's1',
  file_name: 'Tesis.docx',
  elements: [],
  session: {},
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-27T12:00:00Z'));
  useDocStore.setState({
    doc: DOC,
    tabs: [],
    activeTabIndex: 0,
    hasUnsavedChanges: false,
    lastSavedAt: null,
    showToast,
    setShowFileMenu,
    setLiveChatOpen,
    saveSnapshot,
  } as never);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Avanza el reloj y deja que React pinte. */
function avanzar(ms: number) {
  act(() => { vi.advanceTimersByTime(ms); });
}

describe('el chip de guardado', () => {
  it('sin documento, no inventa un estado de guardado', () => {
    useDocStore.setState({ doc: null } as never);
    render(<UnifiedToolbar />);
    expect(screen.queryByText(/Guardado/)).toBeNull();
    expect(screen.queryByText(/Sin guardar/)).toBeNull();
  });

  it('documento recién cargado: dice "Guardado" y no una hora inventada', () => {
    /* `lastSavedAt` es `null` cuando no sabemos. Decir "Guardado hace 0 min" sería
       inventar una hora, y el chip no tiene por qué mentir para parecer vivo. */
    render(<UnifiedToolbar />);
    expect(screen.getByText('Guardado')).toBeTruthy();
    expect(screen.queryByText(/hace/)).toBeNull();
  });

  it('NUNCA dice "Sin guardar", porque eso sería mentir', () => {
    /* El chip viejo lo decía, y estaba equivocado: `hasUnsavedChanges` lo levanta
       `pushHistory`, que se llama DESPUÉS de que el servidor ya guardó. La app
       anunciaba "Sin guardar" con el documento en el servidor, en la barra de
       arriba, que es donde nadie perdona una mentira.

       Y no se reemplaza por otro estado de alarma, porque no existe uno: cada
       mutación persiste antes de responder, así que o hay un guardado EN VUELO
       —y eso dice "Guardando…"— o ya está guardado. No hay un tercer estado
       durable, y un "Sin guardar" que se queda pegado es peor que el
       aviso falso que reemplaza. */
    useDocStore.setState({ hasUnsavedChanges: true, isSaving: false, lastSavedAt: Date.now() } as never);
    render(<UnifiedToolbar />);
    expect(screen.queryByText(/Sin guardar/)).toBeNull();
    expect(screen.getByText('Guardado')).toBeTruthy();
  });

  it('"Guardando…" aparece mientras hay un guardado en vuelo', () => {
    /* Con dos estados, entre una edición y la siguiente el documento ya está
       limpio y el chip diría "Guardado" aunque nada se acabara de escribir. El
       tercer estado es lo que hace que "hace 2 min" sea cierto. */
    useDocStore.setState({ lastSavedAt: Date.now(), isSaving: true } as never);
    render(<UnifiedToolbar />);
    expect(screen.getByText('Guardando…')).toBeTruthy();
  });

  it('con `lastSavedAt`, dice hace cuánto', () => {
    const guardado = new Date('2026-09-27T11:58:00Z').getTime();
    useDocStore.setState({ lastSavedAt: guardado, isSaving: false } as never);
    render(<UnifiedToolbar />);
    expect(screen.getByText(/hace 2 min/)).toBeTruthy();
  });

  it('la hora avanza sola, sin que nadie la empuje', () => {
    const guardado = new Date('2026-09-27T12:00:00Z').getTime();
    useDocStore.setState({ lastSavedAt: guardado, isSaving: false } as never);
    render(<UnifiedToolbar />);
    expect(screen.getByText(/hace 0 min/)).toBeTruthy();

    avanzar(60_000);
    expect(screen.getByText(/hace 1 min/)).toBeTruthy();

    avanzar(9 * 60_000);
    expect(screen.getByText(/hace 10 min/)).toBeTruthy();
  });

  it('después de una hora deja de contar minutos', () => {
    /* El reloj arranca dos horas atrás —el `setSystemTime` del `beforeEach` es al
       mediodía— y se avanza una hora, así que al final van TRES. Lo que se
       comprueba es el formato, no la cuenta: "hace 183 min" no informa de nada
       y ocupa más ancho que "hace 3 h". */
    const guardado = new Date('2026-09-27T10:00:00Z').getTime();
    useDocStore.setState({ lastSavedAt: guardado, isSaving: false } as never);
    render(<UnifiedToolbar />);
    avanzar(60 * 60_000);
    expect(screen.getByText(/hace 3 h/)).toBeTruthy();
    expect(screen.queryByText(/hace 18\d min/)).toBeNull();
  });

  it('el `title` explica el guardado automático, sin prometer un botón', () => {
    useDocStore.setState({ lastSavedAt: Date.now(), isSaving: true } as never);
    render(<UnifiedToolbar />);
    const chip = screen.getByText('Guardando…').closest('span');
    expect(chip?.getAttribute('title') || '').toMatch(/guard[aá]ndose|en el servidor/i);
  });

  it('el `title` del guardado explica que el .docx se baja desde Exportar', () => {
    /* El botón "Guardar" del menú decía "se guarda automáticamente" y su única
       acción era Exportar. El chip ahora dice lo mismo pero sin ofrecer una
       acción que no guarda: quien lea "Guardado" entiende que no tiene que
       hacer nada, y si quiere el archivo lo baja desde Exportar. */
    useDocStore.setState({ lastSavedAt: Date.now(), isSaving: false } as never);
    render(<UnifiedToolbar />);
    const chip = screen.getByText('Guardado').closest('span');
    const title = chip?.getAttribute('title') || '';
    /* `/automat/` a secas NO matchea "automáticamente": la palabra lleva acento en
       la á y el patrón no lo cubre. Un test de texto en español tiene que
       aceptar el acento o falla por ortografía, no por comportamiento. */
    expect(title).toMatch(/autom[aá]t/i);
    expect(title).toMatch(/exportar/i);
  });
});

void saveSnapshotNOW;
