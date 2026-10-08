/**
 * La pestaña App: la versión real, la limpieza que limpia y el reporte que llega.
 *
 * Este archivo es la respuesta a la clase de mentira que el plan vino a matar:
 * una pantalla de Ajustes que afirma cosas que el código no hace. Las tres
 * formas que toma acá son un número de versión escrito a mano, un botón que
 * dice que depuró y no borra nada, y un `mailto:` a un dominio placeholder.
 *
 * Y la cuarta, más chica: una pestaña con la cara de la mascota tomada del
 * decorado en vez de del estado.
 */
import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { version as VERSION_DEL_PAQUETE } from '../../package.json';
import { AppTab, CORREO_DE_SOPORTE, correoDeReporte, sistemaDeEstaMaquina } from '../components/settings/tabs/AppTab';
import { useDocStore } from '../store/useDocStore';
import { useUpdateStore } from '../store/useUpdateStore';

const depurarCache = vi.fn();
vi.mock('../api/backend', () => ({
  depurarCache: (...a: unknown[]) => depurarCache(...a),
}));

const respuesta = (over: Record<string, unknown> = {}) => ({
  status: 'ok',
  sesiones_borradas: 0,
  archivos_temporales: 0,
  bytes: 0,
  message: 'No había nada que borrar: no hay sesiones vencidas ni archivos temporales.',
  ...over,
});

/** El último toast que se mostró, tal como lo ve la persona. */
const ultimoToast = () => {
  const toasts = useDocStore.getState().toasts;
  return toasts.length ? toasts[toasts.length - 1] : null;
};

const montar = async () => {
  let utils!: ReturnType<typeof render>;
  await act(async () => { utils = render(<AppTab />); });
  return utils;
};

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  depurarCache.mockReset();
  depurarCache.mockResolvedValue(respuesta());
  /* OJO: acá NO se pisa `version`. Si el `beforeEach` la fijara, la prueba de la
     versión real no probaría nada: pasaría con cualquier valor, y es exactamente
     el caso que vino a matar. El store arranca con lo que trae `package.json` y
     esta prueba lo mira. */
  useUpdateStore.setState({ state: 'idle', availableVersion: undefined, message: undefined });
  useDocStore.setState({
    theme: 'light',
    toasts: [],
    toastMessage: null,
    aiProviderConfig: { nimUrl: '', useLocal: false, providerId: '' },
  } as never);
});

/* ── La versión ───────────────────────────────────────────────────────────── */

describe('App — la versión que se muestra es la real', () => {
  it('es la de package.json, no un número escrito en la pantalla', () => {
    /* `SettingsMenu.tsx:31` tenía `const VERSION = '1.0.0'` con el paquete en
     * 1.0.65. Esta es la prueba que se cae si alguien vuelve a escribir el
     * número: no mira la pantalla, mira el archivo del que sale. */
    expect(VERSION_DEL_PAQUETE).toMatch(/^\d+\.\d+\.\d+$/);
    render(<AppTab />);
    expect(screen.getByTestId('app-version').textContent).toBe(`Versión ${VERSION_DEL_PAQUETE}`);
  });

  it('el store de actualizaciones no arranca con un número inventado', () => {
    /* El store es de donde lee la pantalla. Un número viejo acá no se ve solo:
     * se propaga a cada "Acerca de" de la app. Esta prueba falla si alguien
     * vuelve a escribir `'1.0.0'` (o cualquier otro número) en el store. */
    expect(useUpdateStore.getState().version).toBe(VERSION_DEL_PAQUETE);
    /* Y no es que el número sea casualidad: es el del paquete. */
    expect(useUpdateStore.getState().version).not.toBe('1.0.0');
  });

  it('la versión viene del store, no de una constante local', async () => {
    useUpdateStore.setState({ version: '9.9.9-prueba' });
    await montar();
    expect(screen.getByTestId('app-version').textContent).toBe('Versión 9.9.9-prueba');
  });

  it('el reporte lleva la MISMA versión que el "Acerca de"', () => {
    /* Si el `mailto:` se armara con una versión propia, el reporte llegaría con
     * un número que no es el de la app que lo mandó. */
    const enlace = correoDeReporte(VERSION_DEL_PAQUETE, 'Linux x64');
    expect(decodeURIComponent(enlace)).toContain(`WordAPA7 ${VERSION_DEL_PAQUETE}`);
  });
});

/* ── "Reportar un problema" ───────────────────────────────────────────────── */

describe('App — reportar un problema', () => {
  it('va a la dirección real, NO a example.com', () => {
    render(<AppTab />);
    const href = (screen.getByTestId('boton-reportar') as HTMLAnchorElement).getAttribute('href') || '';
    expect(href.startsWith(`mailto:${CORREO_DE_SOPORTE}`)).toBe(true);
    expect(CORREO_DE_SOPORTE).toBe('ws692888@gmail.com');
    /* El dominio placeholder de la documentación de RFC es el bug: el botón
     * parecería funcionar y el reporte no lo lee nadie. */
    expect(href).not.toMatch(/example\.(com|org|net)/);
  });

  it('el asunto y el cuerpo van prearmados con la versión y el sistema', () => {
    const enlace = correoDeReporte('1.2.3', 'Win32 · Mozilla/5.0');
    const partes = enlace.split('?');
    const decoded = decodeURIComponent(partes[1] || '');
    expect(decoded).toContain('subject=Reporte de problema');
    expect(decoded).toContain('WordAPA7 1.2.3');
    expect(decoded).toContain('Win32');
    expect(decoded).toContain('Qué pasó');
  });

  it('los saltos de línea del cuerpo no se pierden al codificar', () => {
    /* Un cuerpo todo en una línea es un reporte ilegible: los `\n` tienen que
     * viajar como %0A, que es lo que hace `encodeURIComponent`. */
    const enlace = correoDeReporte('1.0.0', 'Win32');
    expect(enlace).toContain('%0A');
  });

  it('el sistema que se manda no está vacío', () => {
    const sistema = sistemaDeEstaMaquina();
    expect(sistema.length).toBeGreaterThan(3);
    expect(sistema).not.toMatch(/desconocido · desconocido/);
  });
});

/* ── "Depurar caché" ──────────────────────────────────────────────────────── */

describe('App — depurar caché que DEPURA', () => {
  it('el botón llama al endpoint, y no se limita a mostrar un toast', async () => {
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByTestId('boton-depurar-cache'));
    });
    expect(depurarCache).toHaveBeenCalledTimes(1);
  });

  it('el toast DICE QUÉ BORRÓ', async () => {
    depurarCache.mockResolvedValue(respuesta({
      sesiones_borradas: 3,
      archivos_temporales: 12,
      bytes: 2 * 1024 * 1024,
      message: 'Se borraron 3 sesiones vencidas y 12 archivos temporales (2.0 MB).',
    }));
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByTestId('boton-depurar-cache'));
    });
    const toast = ultimoToast();
    expect(toast?.message).toContain('3 sesiones vencidas');
    expect(toast?.message).toContain('12 archivos temporales');
    expect(toast?.type).toBe('success');
  });

  it('si no había nada, DICE que no había nada (no "se depuró")', async () => {
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByTestId('boton-depurar-cache'));
    });
    const toast = ultimoToast();
    expect(toast?.message).toMatch(/No había nada que borrar/);
    expect(toast?.message).not.toMatch(/Caché y sesiones temporales depuradas/);
    expect(toast?.type).toBe('info');
  });

  it('el texto se queda en pantalla, no solo en un toast que se va', async () => {
    depurarCache.mockResolvedValue(respuesta({ message: 'Se borraron 1 sesión vencida (12 KB).', sesiones_borradas: 1 }));
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByTestId('boton-depurar-cache'));
    });
    expect(screen.getByTestId('ultima-limpieza').textContent).toContain('1 sesión vencida');
  });

  it('si el motor no responde, dice que NO se borró nada', async () => {
    /* Distinguir "no había nada" de "no pude mirar" es la diferencia entre un
     * caché que se está limpiando y uno que no. */
    depurarCache.mockRejectedValue(new Error('sin motor'));
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByTestId('boton-depurar-cache'));
    });
    const toast = ultimoToast();
    expect(toast?.type).toBe('error');
    expect(toast?.message).toMatch(/no se borró nada/);
    expect(screen.queryByTestId('ultima-limpieza')).toBeNull();
  });

  it('mientras limpia, el botón no se puede apretar dos veces', async () => {
    let soltar: (v: unknown) => void = () => {};
    depurarCache.mockImplementation(() => new Promise((r) => { soltar = r; }));
    await montar();
    const boton = screen.getByTestId('boton-depurar-cache') as HTMLButtonElement;
    await act(async () => { fireEvent.click(boton); });
    expect((screen.getByTestId('boton-depurar-cache') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { soltar(respuesta()); });
    expect((screen.getByTestId('boton-depurar-cache') as HTMLButtonElement).disabled).toBe(false);
  });
});

/* ── Tema y telemetría ────────────────────────────────────────────────────── */

describe('App — los controles que escriben', () => {
  it('el tema arranca en lo GUARDADO, no en lo que dice el store', async () => {
    /* `main.tsx` restaura el tema del almacenamiento antes de pintar, pero
     * `uiSlice.theme` arranca en 'light' y no se vuelve a leer. Mostrar el
     * switch en claro con la pantalla en oscuro sería un control que miente. */
    localStorage.setItem('wordapa7-theme', 'dark');
    useDocStore.setState({ theme: 'light' } as never);
    await montar();
    expect(screen.getByTestId('tema-dark').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('tema-light').getAttribute('aria-pressed')).toBe('false');
  });

  it('elegir tema escribe en el store y en el almacenamiento', async () => {
    await montar();
    await act(async () => { fireEvent.click(screen.getByTestId('tema-dark')); });
    expect(localStorage.getItem('wordapa7-theme')).toBe('dark');
    expect(useDocStore.getState().theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('la telemetría arranca apagada y se prende escribiendo en el almacenamiento', async () => {
    await montar();
    const interruptor = screen.getByTestId('interruptor-telemetria') as HTMLInputElement;
    expect(interruptor.checked).toBe(false);
    expect(screen.getByText('No enviando nada')).toBeTruthy();
    await act(async () => { fireEvent.click(interruptor); });
    expect(localStorage.getItem('wordapa7_telemetry_optin')).toBe('true');
    expect(screen.getByText('Enviando reportes de error')).toBeTruthy();
  });

  it('la telemetría respeta lo que ya estaba decidido', async () => {
    localStorage.setItem('wordapa7_telemetry_optin', 'true');
    await montar();
    expect((screen.getByTestId('interruptor-telemetria') as HTMLInputElement).checked).toBe(true);
  });
});

/* ── La mascota con la cara del estado ────────────────────────────────────── */

describe('App — la mascota y su cara', () => {
  it('es el engranaje, con su kind dibujado', async () => {
    await montar();
    expect(document.querySelector('.editorial-mascot-kind-gear')).not.toBeNull();
    /* Y no es el mismo dibujo de otra pestaña: dos pestañas con la misma cara
     * hacen que la cara deje de ser una señal. */
    expect(document.querySelector('.editorial-mascot-gear-diente')).not.toBeNull();
  });

  it('nunca se abrió Ajustes y no hay tema elegido: curiosa', async () => {
    /* El caso que `main.tsx` provoca: la primera vez que alguien abre Ajustes,
     * el tema es el de omisión y el marcador de "ya lo viste" todavía no está.
     * Las dos cosas son verdad y la cara tiene que poder decir las dos. */
    await montar();
    expect(document.querySelector('.editorial-mascot-expression-curious')).not.toBeNull();
    expect(document.querySelector('.editorial-mascot-expression-happy')).toBeNull();
  });

  it('con el tema elegido y Ajustes ya visto: feliz', async () => {
    localStorage.setItem('wordapa7-theme', 'dark');
    await act(async () => {
      useDocStore.getState().setSettingsHubOpen(true);
      useDocStore.getState().setSettingsHubOpen(false);
    });
    await montar();
    expect(document.querySelector('.editorial-mascot-expression-happy')).not.toBeNull();
    expect(screen.getByTestId('app-estado').textContent).toMatch(/no tiene nada roto/);
  });

  it('con la actualización rota, la cara no es feliz y el texto lo avisa', async () => {
    localStorage.setItem('wordapa7-theme', 'dark');
    useUpdateStore.setState({ state: 'error' });
    await montar();
    expect(document.querySelector('.editorial-mascot-expression-happy')).toBeNull();
    expect(screen.getByTestId('app-estado').textContent).toMatch(/falló/);
  });

  it('sin tema elegido, avisa que el tema es el de omisión', async () => {
    await montar();
    expect(screen.getByTestId('app-estado').textContent).toMatch(/omisión/);
  });
});

/* ── El contenido que la pestaña promete ──────────────────────────────────── */

describe('App — la pestaña no está a medio hacer', () => {
  it('tiene las cinco secciones, y cada una dice qué hace', async () => {
    await montar();
    for (const titulo of ['Tema', 'Telemetría', 'Limpieza', 'Actualización', 'Acerca de WordAPA7']) {
      expect(screen.getByText(titulo)).toBeTruthy();
    }
  });

  it('la actualización es la tarjeta de la app, y está UNA sola vez', async () => {
    /* La del menú Archivo se unifica con esta en la Fase 7: mientras tanto no
     * se agrega una segunda acá, que es como la pantalla terminó con dos. */
    await montar();
    expect(screen.getAllByText('Actualización').length).toBe(1);
    /* La tarjeta renderiza de verdad: sin Electron dice que solo existe en la
     * app de escritorio, y no queda un hueco mudo. */
    expect(screen.getByText(/Solo disponible en la app de escritorio/)).toBeTruthy();
  });
});
