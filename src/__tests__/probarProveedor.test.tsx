/**
 * El botón "Probar": una forma de saber si la clave sirve.
 *
 * No existía. `getAiHealth` dice cómo está el token bucket de cada especialidad,
 * no si tu clave funciona: un 401, una cuota agotada y un proveedor que responde
 * rápido se ven igual desde la UI, y la única forma de averiguarlo era gastar
 * una tarea completa del documento.
 *
 * Lo que se afirma acá, y no es lo obvio:
 *
 * - **El resultado se queda en la fila.** No es un toast. Un toast se borra a
 *   los tres segundos, y lo que el usuario necesita ver mientras escribe su
 *   clave es si esa clave sirve. Un aviso que desaparece es un aviso que hay que
 *   volver a provocar.
 * - **Dice lo que costó.** Modelo y milisegundos. Un "anduvo" sin más no dice si
 *   lo que contestó fue un modelo de frontera o uno chico.
 * - **Manda la clave aunque no se haya sincronizado.** El campo tiene un
 *   debounce de 800 ms; sin mandarla, habría una ventana en la que el botón dice
 *   "falta la clave" y el usuario piensa que escribió mal.
 * - **Un fallo dice por qué.** "no contestó" sin más deja al usuario donde
 *   empezó.
 */
import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProbarProveedor } from '../components/settings/tabs/word/ProbarProveedor';
import { ConexionTab } from '../components/settings/tabs/ConexionTab';
import { useDocStore } from '../store/useDocStore';
import { claveDeLocalStorage, PROVEEDORES_IA } from '../lib/proveedoresIA';

const getSideloadStatus = vi.fn();
const repairSideload = vi.fn();
const syncAllProviderKeys = vi.fn();
const probarProveedor = vi.fn();

vi.mock('../api/backend', () => ({
  getSideloadStatus: (...a: unknown[]) => getSideloadStatus(...a),
  repairSideload: (...a: unknown[]) => repairSideload(...a),
  syncAllProviderKeys: (...a: unknown[]) => syncAllProviderKeys(...a),
  probarProveedor: (...a: unknown[]) => probarProveedor(...a),
}));

const ZENMUX = PROVEEDORES_IA.find((p) => p.id === 'zenmux')!;
const OK = { provider_id: 'zenmux', ok: true, status: 200, ms: 412, model: 'z-ai/glm-4.6v-flash-free', motivo: '' };
const FALLA = { provider_id: 'zenmux', ok: false, status: 401, ms: 300, model: 'z-ai/glm-4.6v-flash-free', motivo: 'El proveedor rechazo la consulta. Revisa la clave y el modelo.' };

beforeEach(async () => {
  localStorage.clear();
  vi.restoreAllMocks();
  getSideloadStatus.mockReset().mockResolvedValue({ installed: false, up_to_date: false });
  repairSideload.mockReset().mockResolvedValue({ status: 'ok' });
  syncAllProviderKeys.mockReset().mockResolvedValue({ ok: true, applied: [] });
  probarProveedor.mockReset().mockResolvedValue(OK);
  await act(async () => {
    useDocStore.setState({
      aiProviderConfig: { nimUrl: '', useLocal: false, providerId: '' },
      apiKey: '',
      dismissedCommentIds: [],
    } as never);
  });
});

const clicEnProbar = async (id: string) => {
  const boton = document.getElementById(`probar-${id}`) as HTMLButtonElement;
  await act(async () => { fireEvent.click(boton); });
};

describe('el botón Probar', () => {
  it('pregunta al proveedor que se le pide', async () => {
    render(<ProbarProveedor proveedor={ZENMUX} />);
    await clicEnProbar('zenmux');

    expect(probarProveedor).toHaveBeenCalledTimes(1);
    expect(probarProveedor.mock.calls[0][0]).toBe('zenmux');
  });

  it('el resultado QUEDA en la fila, y dice el modelo y cuanto tardó', async () => {
    /* El punto de todo el componente. Si esto se convierte en un toast, el
       usuario tiene que volver a provocar el aviso para leerlo. */
    render(<ProbarProveedor proveedor={ZENMUX} />);
    await clicEnProbar('zenmux');

    const salida = screen.getByTestId('resultado-zenmux');
    expect(salida.textContent).toContain('Anduvo');
    expect(salida.textContent).toContain('z-ai/glm-4.6v-flash-free');
    expect(salida.textContent).toContain('412');
    /* Y no se borra: el texto sigue ahí después de un rato, sin temporizador. */
    await act(async () => { await new Promise((r) => setTimeout(r, 3200)); });
    expect(screen.getByTestId('resultado-zenmux')).toBeTruthy();
  });

  it('un fallo dice POR QUÉ, no solo que falló', async () => {
    probarProveedor.mockResolvedValue(FALLA);
    render(<ProbarProveedor proveedor={ZENMUX} />);
    await clicEnProbar('zenmux');

    const salida = screen.getByTestId('resultado-zenmux');
    expect(salida.textContent).toContain('401');
    expect(salida.textContent).toContain('Revisa la clave');
  });

  it('manda la clave escrita, sin esperar al autoguardado', async () => {
    /* La ventana de 800 ms del debounce. Sin mandar la clave, el botón diría
       "falta la clave" justo después de que el usuario la escribió. */
    localStorage.setItem(claveDeLocalStorage('ZENMUX_API_KEY'), 'clave-zenmux-123');
    render(<ProbarProveedor proveedor={ZENMUX} />);
    await clicEnProbar('zenmux');

    expect(probarProveedor.mock.calls[0][1]).toBe('clave-zenmux-123');
  });

  it('mientras corre dice "Probando" y no se puede volver a disparar', async () => {
    let liberar!: (v: unknown) => void;
    probarProveedor.mockReturnValue(new Promise((r) => { liberar = r; }));
    render(<ProbarProveedor proveedor={ZENMUX} />);

    let boton!: HTMLButtonElement;
    await act(async () => { boton = document.getElementById('probar-zenmux') as HTMLButtonElement; fireEvent.click(boton); });

    expect(document.getElementById('probar-zenmux')?.textContent).toContain('Probando');
    expect((document.getElementById('probar-zenmux') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { liberar(OK); });
  });

  it('un segundo clic no dispara dos consultas', async () => {
    let liberar!: (v: unknown) => void;
    probarProveedor.mockReturnValue(new Promise((r) => { liberar = r; }));
    render(<ProbarProveedor proveedor={ZENMUX} />);

    await act(async () => { fireEvent.click(document.getElementById('probar-zenmux') as HTMLButtonElement); });
    await act(async () => { fireEvent.click(document.getElementById('probar-zenmux') as HTMLButtonElement); });
    expect(probarProveedor).toHaveBeenCalledTimes(1);
    await act(async () => { liberar(OK); });
  });

  it('el backend caido no rompe la fila: se dice y se sigue', async () => {
    /* `probarProveedor` nunca lanza: devuelve un resultado con el motivo. Si
       tirara, el `finally` dejaría el botón en "Probando" para siempre y la
       fila quedaría muerta sin explicación. */
    probarProveedor.mockResolvedValue({
      provider_id: 'zenmux', ok: false, status: null, ms: 0, model: null,
      motivo: 'No se pudo consultar: sin red',
    });
    render(<ProbarProveedor proveedor={ZENMUX} />);
    await clicEnProbar('zenmux');

    expect(screen.getByTestId('resultado-zenmux').textContent).toContain('sin red');
    expect((document.getElementById('probar-zenmux') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('el botón está montado en la pestaña', () => {
  it('hay un botón por proveedor, en la fila de cada uno', async () => {
    /* "Una superficie terminada y probada que nadie ve no está terminada": el
       botón existe, pero si no estuviera en la pestaña el usuario no lo
       tendría delante. */
    localStorage.setItem(claveDeLocalStorage('NVIDIA_API_KEY'), 'clave-de-prueba');
    await act(async () => { render(<ConexionTab />); });

    const botones = PROVEEDORES_IA
      .filter((p) => document.getElementById(`probar-${p.id}`));
    expect(botones).toHaveLength(PROVEEDORES_IA.length);
  });

  it('el botón de la pestaña dispara el ping del proveedor de esa fila', async () => {
    localStorage.setItem(claveDeLocalStorage('NVIDIA_API_KEY'), 'clave-de-prueba');
    await act(async () => { render(<ConexionTab />); });

    await clicEnProbar('huggingface');

    expect(probarProveedor).toHaveBeenCalledTimes(1);
    expect(probarProveedor.mock.calls[0][0]).toBe('huggingface');
    expect(screen.getByTestId('resultado-huggingface')).toBeTruthy();
  });
});
