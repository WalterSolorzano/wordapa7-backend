/**
 * La pestaña Conexión: elegir proveedor, editar el modelo, y que el
 * complemento de Word tenga un solo mecanismo.
 *
 * Lo que se prueba acá es lo que NO se puede ver en una captura:
 *
 * - QUE LA ELECCIÓN MANDA. Con dos claves puestas, el que se usa es el elegido y
 *   no el primero del orden. Antes `setAiProviderConfig` existía, se persistía,
 *   se mandaba al backend, y no lo escribía nadie: la detección caminaba las
 *   claves en orden fijo. Esta prueba es la que se cae si alguien vuelve a
 *   borrar la elección.
 * - QUE LA PESTAÑA NO ESTÁ MUDA. Sin ninguna clave puesta tiene que DECIRLO, no
 *   mostrar catorce campos vacíos (Review Focus #4). Y apenas hay una clave, los
 *   catorce tienen que estar: un campo que desaparece sin aviso es un control
 *   que se escondió.
 * - QUE EL INDICADOR MIRA. El texto de guardado sale de comparar lo escrito
 *   contra lo leído de vuelta, no de un temporizador. Se rompe el
 *   almacenamiento a propósito y tiene que decir que no pudo guardar.
 * - QUE EL COMPLEMENTO CONSULTA. El mecanismo que sobrevive es el que pregunta
 *   el estado (`sideload-status`), no el que dispara el registro al abrir.
 */
import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ConexionTab } from '../components/settings/tabs/ConexionTab';
import { useDocStore } from '../store/useDocStore';
import {
  PROVEEDORES_IA,
  claveDeLocalStorage,
  leerVariableDeLocalStorage,
  resolverClave,
  proveedorManda,
} from '../lib/proveedoresIA';

const getSideloadStatus = vi.fn();
const repairSideload = vi.fn();
const syncAllProviderKeys = vi.fn();

vi.mock('../api/backend', () => ({
  getSideloadStatus: (...a: unknown[]) => getSideloadStatus(...a),
  repairSideload: (...a: unknown[]) => repairSideload(...a),
  syncAllProviderKeys: (...a: unknown[]) => syncAllProviderKeys(...a),
}));

/** Deja correr el reloj de verdad: la gracia del autoguardado son 800 ms. */
const esperar = (ms: number) => act(async () => {
  await new Promise((r) => setTimeout(r, ms));
});

const CLAVE_NVIDIA = 'clave-nvidia-000';
const CLAVE_GROQ = 'clave-groq-111';
const CLAVE_ZENMUX = 'clave-zenmux-222';

const ponerClave = (variable: string, valor: string) =>
  localStorage.setItem(claveDeLocalStorage(variable), valor);

const montar = async () => {
  let utils!: ReturnType<typeof render>;
  await act(async () => { utils = render(<ConexionTab />); });
  return utils;
};

const selector = () => screen.getByTestId('selector-proveedor') as HTMLSelectElement;
const camposDeClave = () => screen.queryAllByTestId('campo-clave');
const camposDeModelo = () => screen.queryAllByTestId('campo-modelo');

beforeEach(async () => {
  localStorage.clear();
  vi.restoreAllMocks();
  getSideloadStatus.mockReset().mockResolvedValue({
    installed: true, up_to_date: true, path: 'C:/feeds', installed_at: '2026-09-01T10:00:00Z',
  });
  repairSideload.mockReset().mockResolvedValue({ status: 'ok' });
  syncAllProviderKeys.mockReset().mockResolvedValue({ ok: true, applied: [] });
  await act(async () => {
    useDocStore.setState({
      aiProviderConfig: {
        nimUrl: 'http://localhost:8000/v1/chat/completions',
        useLocal: false,
        providerId: '',
      },
      apiKey: '',
      dismissedCommentIds: [],
    } as never);
  });
});

describe('Conexión — elegir proveedor es una decisión, no una detección', () => {
  it('con dos claves puestas y groq elegido, la que manda es la de Groq', async () => {
    /* El caso que motivó la fase: con NVIDIA y Groq puestas, el orden fijo
       mandaba siempre la de NVIDIA y no había forma de decir otra cosa. */
    ponerClave('NVIDIA_API_KEY', CLAVE_NVIDIA);
    ponerClave('GROQ_API_KEY', CLAVE_GROQ);
    expect(resolverClave(leerVariableDeLocalStorage, '')).toBe(CLAVE_NVIDIA);
    expect(resolverClave(leerVariableDeLocalStorage, 'groq')).toBe(CLAVE_GROQ);
    expect(proveedorManda(leerVariableDeLocalStorage, 'groq')?.id).toBe('groq');

    /* Y por el camino real: el store, que es lo que viaja al backend. */
    await act(async () => {
      useDocStore.getState().setAiProviderConfig({ providerId: 'groq' });
    });
    expect(useDocStore.getState().aiProviderConfig.providerId).toBe('groq');
    expect(useDocStore.getState().apiKey).toBe(CLAVE_GROQ);
  });

  it('elegir un proveedor SIN clave no deja la app sin motor', async () => {
    /* La elección es una preferencia, no un interruptor: si el elegido no tiene
       clave, se vuelve al primero del orden en vez de mandar vacío. */
    ponerClave('NVIDIA_API_KEY', CLAVE_NVIDIA);
    ponerClave('GROQ_API_KEY', CLAVE_GROQ);
    await act(async () => {
      useDocStore.getState().setAiProviderConfig({ providerId: 'huggingface' });
    });
    expect(useDocStore.getState().aiProviderConfig.providerId).toBe('huggingface');
    expect(useDocStore.getState().apiKey).toBe(CLAVE_NVIDIA);
  });

  it('la elección sobrevive al arranque: se lee antes de que rehidrate el store', async () => {
    /* `apiKey` se inicializa con una IIFE sincrónica al cargar el módulo, antes
       de que `persist` rehidrate desde IndexedDB. Por eso la elección tiene una
       copia en localStorage, y esta prueba es la que dice que esa copia existe
       y se usa. */
    ponerClave('NVIDIA_API_KEY', CLAVE_NVIDIA);
    ponerClave('ZENMUX_API_KEY', CLAVE_ZENMUX);
    await act(async () => {
      useDocStore.getState().setAiProviderConfig({ providerId: 'zenmux' });
    });
    expect(localStorage.getItem('wordapa7-proveedor-elegido')).toBe('zenmux');
    expect(resolverClave(leerVariableDeLocalStorage, 'zenmux')).toBe(CLAVE_ZENMUX);
  });

  it('el selector de la pestaña escribe en el store, y el store manda hacia atrás', async () => {
    ponerClave('NVIDIA_API_KEY', CLAVE_NVIDIA);
    ponerClave('GROQ_API_KEY', CLAVE_GROQ);
    await montar();
    expect(selector().value).toBe('');
    await act(async () => { fireEvent.change(selector(), { target: { value: 'groq' } }); });
    expect(useDocStore.getState().aiProviderConfig.providerId).toBe('groq');
    expect(useDocStore.getState().apiKey).toBe(CLAVE_GROQ);
    expect(screen.getByText(/Ahora consulta Groq/)).toBeTruthy();
  });

  it('un proveedor sin clave aparece marcado como tal, no fingiendo que sirve', async () => {
    ponerClave('NVIDIA_API_KEY', CLAVE_NVIDIA);
    await montar();
    const opciones = within(selector()).getAllByRole('option').map((o) => o.textContent);
    expect(opciones[0]).toMatch(/Automático/);
    expect(opciones.find((o) => o && o.startsWith('Groq'))).toBe('Groq (sin clave)');
  });
});

describe('Conexión — la pestaña no está muda', () => {
  it('sin ninguna clave lo DICE, y no muestra catorce campos vacíos', async () => {
    await montar();
    const estado = screen.getByTestId('conexion-estado');
    expect(estado.textContent).toMatch(/Todavía no hay ninguna clave/);
    /* El Review Focus #4: un campo que depende de algo que no está tiene que
       decirlo. Y lo que se deja es el camino de entrada, no un muro. */
    expect(camposDeClave()).toHaveLength(1);
    expect(camposDeModelo()).toHaveLength(0);
    /* Y la cara de la mascota sale del estado, no del decorado. */
    const worried = document.querySelector('.editorial-mascot-expression-worried');
    expect(worried).not.toBeNull();
  });

  it('con una clave puesta aparecen las otras, y los modelos', async () => {
    ponerClave('NVIDIA_API_KEY', CLAVE_NVIDIA);
    await montar();
    expect(screen.getByTestId('conexion-estado').textContent).toMatch(/1 clave puesta/);
    /* Dieciocho claves: diecisiete proveedores y el id de cuenta de Cloudflare, que sin
       él su endpoint no se puede construir. */
    expect(camposDeClave()).toHaveLength(18);
    expect(camposDeModelo()).toHaveLength(17);
    expect(document.querySelector('.editorial-mascot-expression-worried')).toBeNull();
  });

  it('las variables de modelo del backend tienen campo: las diecisiete', async () => {
    ponerClave('NVIDIA_API_KEY', CLAVE_NVIDIA);
    await montar();
    const conModelo = PROVEEDORES_IA.filter((p) => p.variableModelo);
    /* Diecisiete, una por proveedor. Nueve ya las leía el backend; cuatro
       —OpenRouter, Cerebras, Mistral y OpenCodeZen— las tenía quemadas en el
       `.py` y salen a leerlas con default. Un `variableModelo: null` hoy
       significaría "esto no se puede cambiar", y eso ya es falso para nadie. */
    expect(conModelo.map((p) => p.variableModelo)).toEqual([
      'NVIDIA_NIM_MODEL', 'GROQ_MODEL', 'OPENROUTER_MODEL', 'CEREBRAS_MODEL',
      'MISTRAL_MODEL', 'OPENCODEZEN_MODEL', 'ZENMUX_MODEL', 'GEMINI_MODEL',
      'CLOUDFLARE_AI_MODEL', 'AION_MODEL', 'KILOCODE_MODEL', 'OLLAMA_MODEL',
      'HUGGINGFACE_MODEL', 'MODELSCOPE_MODEL', 'SAMBANOVA_MODEL',
      'DASHSCOPE_MODEL', 'AGNES_AI_MODEL',
    ]);
    for (const p of conModelo) {
      const id = `campo-${(p.variableModelo as string).toLowerCase().replace(/_/g, '-')}`;
      const campo = document.getElementById(id) as HTMLInputElement | null;
      expect(campo, `${p.variableModelo} no tiene campo`).toBeTruthy();
      expect(campo?.type).toBe('text');
      /* Y el campo dice de dónde sale, con el valor por defecto del backend. */
      const ayuda = campo?.closest('[data-testid="campo-modelo"]')?.textContent || '';
      expect(ayuda).toContain(p.variableModelo as string);
      expect(ayuda).toContain(p.modeloPorDefecto as string);
    }
  });
});

describe('Conexión — autoguardado que mira, y ningún botón de guardar', () => {
  it('escribir guarda solo, después de 800 ms, y el indicador lo LEE', async () => {
    await montar();
    expect(screen.queryByRole('button', { name: /Guardar/ })).toBeNull();
    const campo = camposDeClave()[0].querySelector('input') as HTMLInputElement;
    expect(campo.type).toBe('password');

    await act(async () => { fireEvent.change(campo, { target: { value: CLAVE_NVIDIA } }); });
    /* Lo que se está escribiendo todavía NO está guardado. El indicador tiene
       que decir eso —o no decir nada— y no "Guardado": un indicador que afirma
       antes de mirar es exactamente el defecto que este campo arregla. */
    expect(screen.queryByText('Guardado en este equipo')).toBeNull();
    expect(screen.getByText('Guardando')).toBeTruthy();
    /* Todavía no: el autoguardado espera. */
    expect(localStorage.getItem(claveDeLocalStorage('NVIDIA_API_KEY'))).toBeNull();
    await esperar(900);
    expect(localStorage.getItem(claveDeLocalStorage('NVIDIA_API_KEY'))).toBe(CLAVE_NVIDIA);
    expect(screen.getByText('Guardado en este equipo')).toBeTruthy();
    expect(syncAllProviderKeys).toHaveBeenCalled();
    /* Y con la clave ya escrita, la pestaña dejó de estar muda. */
    expect(camposDeClave()).toHaveLength(18);
  });

  it('si el almacenamiento no guarda, el indicador lo DICE', async () => {
    /* El mensaje viejo decía "Guardado" dos segundos después de escribir, sin
       volver a leer nada: afirmaba que se guardó sin mirar. Con el
       almacenamiento roto tiene que decir que no pudo guardar. */
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('sin cuota');
    });
    await montar();
    const campo = camposDeClave()[0].querySelector('input') as HTMLInputElement;
    await act(async () => { fireEvent.change(campo, { target: { value: CLAVE_NVIDIA } }); });
    await esperar(900);
    expect(screen.getByText('No se pudo guardar')).toBeTruthy();
    expect(screen.queryByText('Guardado en este equipo')).toBeNull();
  });

  it('un modelo se guarda Y se manda: ya no es un control mudo', async () => {
    /* Este test consagtaba la deuda como contrato: afirmaba que el modelo NO se
       mandaba y que la UI decía que no se mandaba. Las dos cosas eran verdad
       y las dos eran el defecto. Ahora el endpoint acepta modelos, así que el
       modelo sale. Si alguien vuelve a poner la rama que lo guarda sin mandarlo,
       esto se cae. */
    ponerClave('NVIDIA_API_KEY', CLAVE_NVIDIA);
    await montar();
    syncAllProviderKeys.mockClear();
    const campo = camposDeModelo()[0].querySelector('input') as HTMLInputElement;
    expect(campo.type).toBe('text');
    await act(async () => { fireEvent.change(campo, { target: { value: 'mi-modelo' } }); });
    await esperar(900);
    expect(localStorage.getItem(claveDeLocalStorage('NVIDIA_NIM_MODEL'))).toBe('mi-modelo');
    expect(syncAllProviderKeys).toHaveBeenCalled();
    expect(screen.getByText('Guardado en este equipo')).toBeTruthy();
    /* Y la UI ya no lo niega: la frase era verdad cuando el campo no llegaba. */
    expect(screen.queryByText(/todavía no los recibe/)).toBeNull();
    expect(screen.queryByText(/El motor todavía no los recibe/)).toBeNull();
  });
});

describe('Conexión — diagnosticar de verdad, y un solo complemento', () => {
  it('los radios de nube y de servidor local se cambian, y la URL se escribe', async () => {
    await montar();
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios).toHaveLength(2);
    /* Antes eran `readOnly`: se veían y no se cambiaban. */
    expect(radios.every((r) => !r.readOnly)).toBe(true);
    await act(async () => { fireEvent.click(screen.getByText('Servidor local')); });
    expect(useDocStore.getState().aiProviderConfig.useLocal).toBe(true);
    /* Y con el servidor local activado, el proveedor de la nube no aplica. */
    expect(selector().disabled).toBe(true);

    const url = screen.getByLabelText('Dirección del servidor local') as HTMLInputElement;
    await act(async () => { fireEvent.change(url, { target: { value: 'http://localhost:9999/v1/chat/completions' } }); });
    expect(useDocStore.getState().aiProviderConfig.nimUrl).toBe('http://localhost:9999/v1/chat/completions');
  });

  it('el complemento se CONSULTA al abrir, y se repara con un botón solo', async () => {
    await montar();
    /* El mecanismo que sobrevive es el que pregunta. El del estudio dispara
       `registry-sideload` al abrir, que no consulta nada previo. */
    expect(getSideloadStatus).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('estado-addin').textContent).toBe(
      'Complemento activo y registrado en Office',
    );

    const botones = screen.getAllByRole('button').filter((b) => /Reparar instalaci/.test(b.textContent || ''));
    expect(botones).toHaveLength(1);
    await act(async () => { fireEvent.click(botones[0]); });
    expect(repairSideload).toHaveBeenCalledTimes(1);
    /* Y después de reparar vuelve a preguntar, en vez de afirmar que terminó. */
    expect(getSideloadStatus).toHaveBeenCalledTimes(2);
  });

  it('un estado que no se puede consultar se dice, no se disimula', async () => {
    getSideloadStatus.mockRejectedValue(new Error('sin red'));
    await montar();
    expect(screen.getByTestId('estado-addin').textContent).toBe(
      'No se pudo consultar el registro de Office',
    );
  });
});
