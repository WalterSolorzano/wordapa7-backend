/**
 * Lo que REALMENTE sale a la red cuando se sincronizan las claves.
 *
 * `proveedoresIA.test.ts` lee el texto del módulo y cuenta palabras. Eso tiene
 * un techo: si alguien saca `modelos` del cuerpo pero deja la palabra `modelos`
 * declarada dos líneas más arriba, el guardián ve la palabra, pasa, y el modelo
 * deja de viajar. Ya pasó: el guardián textual de esa clase se usó para
 * justificar un arreglo a medias.
 *
 * Acá se intercepta `fetch` y se mira el cuerpo. No tiene techo: si el modelo
 * no viaja, no viaja, diga lo que diga el texto del módulo.
 *
 * El módulo se importa DE VERDAD, sin mock: un test que mockea la función que
 * está probando no la está probando.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { syncAllProviderKeys } from '../api/backend';
import { claveDeLocalStorage, PROVEEDORES_IA } from '../lib/proveedoresIA';

interface SyncSpy {
  fetch: ReturnType<typeof vi.fn>;
  cuerpo: () => any;
  llamado: () => boolean;
}

/** Intercepta `fetch` y captura el cuerpo del sync. */
function espiarFetch(): SyncSpy {
  const llamadas: any[] = [];
  const f = vi.fn((_url: string, init: any) => {
    llamadas.push(JSON.parse(init.body));
    return Promise.resolve({
      ok: true,
      /* Sin `headers`, `fetchWithTrace` revienta antes de que el cliente vea la
         respuesta. Un doble que no cumple el contrato de `Response` produce
         fallos que no dicen nada de lo que se esta probando. */
      headers: new Headers(),
      json: () => Promise.resolve({ applied: [], count: 0 }),
    } as Response);
  });
  vi.stubGlobal('fetch', f);
  return {
    fetch: f,
    cuerpo: () => llamadas[0] ?? null,
    llamado: () => llamadas.length > 0,
  };
}

describe('la sincronización manda lo que está escrito, y nada más', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('un modelo escrito SALE en el cuerpo, en su campo', async () => {
    localStorage.setItem(claveDeLocalStorage('GROQ_MODEL'), 'llama-3.3-70b');
    const espia = espiarFetch();

    await syncAllProviderKeys();

    expect(espia.llamado()).toBe(true);
    expect(espia.cuerpo().modelos).toMatchObject({ GROQ_MODEL: 'llama-3.3-70b' });
  });

  it('una clave SALE en su campo, y no mezclada con los modelos', async () => {
    localStorage.setItem(claveDeLocalStorage('HUGGINGFACE_API_KEY'), 'hf_123');
    const espia = espiarFetch();

    await syncAllProviderKeys();

    expect(espia.cuerpo().keys).toMatchObject({ HUGGINGFACE_API_KEY: 'hf_123' });
    expect(espia.cuerpo().modelos).toEqual({});
  });

  it('los dos campos viajan juntos cuando los dos están escritos', async () => {
    localStorage.setItem(claveDeLocalStorage('AION_API_KEY'), 'aion_1');
    localStorage.setItem(claveDeLocalStorage('AION_MODEL'), 'aion-labs/aion-3.0-mini');
    const espia = espiarFetch();

    await syncAllProviderKeys();

    expect(espia.cuerpo().keys).toMatchObject({ AION_API_KEY: 'aion_1' });
    expect(espia.cuerpo().modelos).toMatchObject({ AION_MODEL: 'aion-labs/aion-3.0-mini' });
  });

  it('cada variable del catálogo sale por el campo que le toca', async () => {
    /* Se recorre el catálogo entero. Una sola, para que el próximo proveedor que
       se agregue sin cablear se vea. */
    const sinClave: string[] = [];
    const sinModelo: string[] = [];
    for (const p of PROVEEDORES_IA) {
      for (const v of p.variablesClave) localStorage.setItem(claveDeLocalStorage(v), 'k');
      if (p.variableModelo) localStorage.setItem(claveDeLocalStorage(p.variableModelo), 'm');
    }
    const espia = espiarFetch();

    await syncAllProviderKeys();

    const cuerpo = espia.cuerpo();
    for (const p of PROVEEDORES_IA) {
      for (const v of p.variablesClave) if (!(v in cuerpo.keys)) sinClave.push(v);
      if (p.variableModelo && !(p.variableModelo in cuerpo.modelos)) sinModelo.push(p.variableModelo);
    }
    expect({ sinClave, sinModelo }).toEqual({ sinClave: [], sinModelo: [] });
  });

  it('el ping sale con el proveedor que se le pidió, y no con otro', async () => {
    /* Este archivo prueba el cliente de la API de verdad, no un doble. Con un
       doble, mandar `provider_id: ''` pasaria: el doble responde lo que le
       digan y el cuerpo ni se mira. */
    const { probarProveedor } = await import('../api/backend');
    const espia = espiarFetch();

    await probarProveedor('huggingface', 'hf_123');

    expect(espia.llamado()).toBe(true);
    expect(espia.cuerpo().provider_id).toBe('huggingface');
    expect(espia.cuerpo().api_key).toBe('hf_123');
  });

  it('un ping sin clave manda la cadena vacía, no "undefined"', async () => {
    const { probarProveedor } = await import('../api/backend');
    const espia = espiarFetch();

    await probarProveedor('groq');

    expect(espia.cuerpo().api_key).toBe('');
  });

  it('el ping devuelve el cuerpo tal cual, sin inventar un ok', async () => {
    /* La respuesta del ping es un contrato: la UI desarma `ok`, `status`,
       `ms`, `model` y `motivo`. Un cliente que devolviera otra cosa —o que
       rellenara un `ok: true` por su cuenta— haria que un 401 se viera como un
       "anduvo". */
    const { probarProveedor } = await import('../api/backend');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      /* `fetchWithTrace` lee `res.headers.get('X-Request-ID')`. Una respuesta
         sin `headers` no es una respuesta: es un doble incompleto, y el fallo
         que produce —"no se pudo properties of undefined"— no dice nada del
         ping. */
      headers: new Headers(),
      json: () => Promise.resolve({
        provider_id: 'groq', ok: false, status: 401, ms: 120,
        model: 'openai/gpt-oss-120b', motivo: 'Revisa la clave',
      }),
    } as Response)));

    const r = await probarProveedor('groq', 'k');

    expect(r).toEqual({
      provider_id: 'groq', ok: false, status: 401, ms: 120,
      model: 'openai/gpt-oss-120b', motivo: 'Revisa la clave',
    });
  });

  it('un error del backend NO se reporta como que el proveedor anduvo', async () => {
    /* El peor defecto posible de este botón. Un 500 del backend —el Python no
       arrancó, el puerto cambió— tiene que ser un fallo, no un "Anduvo": si
       devuelve `ok: true` con un motivo vacío, la UI le dice al usuario que su
       clave funciona cuando lo que no funciona es la app. */
    const { probarProveedor } = await import('../api/backend');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      status: 500,
      headers: new Headers(),
    } as Response)));

    const r = await probarProveedor('groq', 'k');

    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('500');
  });

  it('si la base no esta disponible, el motivo lo dice y no hay `undefined`', async () => {
    /* El camino de un backend que todavia no arranco. Sin esto, la UI recibe un
       objeto con `model: undefined` y `status: undefined`, que es peor que un
       motivo: no hay nada que mostrarle al usuario. */
    const { probarProveedor } = await import('../api/backend');
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no hay base'))));

    const r = await probarProveedor('groq', 'k');

    expect(r.ok).toBe(false);
    expect(r.motivo).toBeTruthy();
    expect(r.model).toBeNull();
    expect(r.status).toBeNull();
    expect(r.ms).toBe(0);
  });

  it('el backend caido devuelve un motivo, no lanza', async () => {
    /* La UI lo necesita: el boton tiene un `finally` que rehabilita el boton,
       y sin esto se quedaria en "Probando" para siempre con la fila muerta. */
    const { probarProveedor } = await import('../api/backend');
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('sin red'))));

    const r = await probarProveedor('groq', 'k');

    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('sin red');
  });

  it('sin nada escrito no se llama a la red', async () => {
    const espia = espiarFetch();

    await syncAllProviderKeys();

    expect(espia.llamado()).toBe(false);
  });

  it('un valor vacío no se manda: mandar "" es mandar un modelo vacío', async () => {
    localStorage.setItem(claveDeLocalStorage('GROQ_API_KEY'), '   ');
    const espia = espiarFetch();

    await syncAllProviderKeys();

    expect(espia.llamado()).toBe(false);
  });
});
