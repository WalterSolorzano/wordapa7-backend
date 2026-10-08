/* WordAPA7 — Cliente HTTP base (sin dependencias de store para evitar ciclos de import)
 *
 * El backend Python puede correr en HTTP o HTTPS (este último cuando hay
 * certificados SSL generados para el Word Add-in, ya que Office.js los
 * requiere). Este módulo detecta automáticamente cuál protocolo usar:
 * intenta HTTPS primero y cae a HTTP si no responde.
 *
 * CRITICAL FIX: El protocolo NO se cachea si ambos (HTTPS y HTTP) fallan.
 * Antes, si el backend no había arrancado todavía, _detectProtocol cacheaba
 * 'http' (fallback) y nunca lo reintentaba. Cuando el backend finalmente
 * arrancaba con HTTPS, todas las peticiones iban a HTTP y fallaban
 * silenciosamente — el bug #1 de "no sube el archivo".
 */

/** Protocolo detectado del backend (cacheado solo tras una detección exitosa). */
let _backendProtocol: 'https' | 'http' | null = null;

/**
 * Detecta si el backend responde por HTTPS o HTTP.
 *
 * SOLO cachea el resultado si una de las dos opciones responde con HTTP 200.
 * Si ambas fallan (backend todavía arrancando), retorna 'http' como
 * fallback temporal PERO NO lo cachea, para que la próxima llamada reintente.
 */
async function _detectProtocol(port: number): Promise<'https' | 'http'> {
  // Si ya detectamos un protocolo que funciona, usarlo (cache válido)
  if (_backendProtocol) return _backendProtocol;

  // Intentar HTTPS primero (con timeout corto de 2s)
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`https://127.0.0.1:${port}/api/health`, {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok || res.status === 200 || res.status === 404) {
      _backendProtocol = 'https';
      console.log('[http] Backend detectado: HTTPS');
      return 'https';
    }
  } catch {
    // HTTPS no disponible (cert no configurado o backend no listo) → intentar HTTP
  }

  // Intentar HTTP (con timeout corto de 2s)
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok || res.status === 200 || res.status === 404) {
      _backendProtocol = 'http';
      console.log('[http] Backend detectado: HTTP');
      return 'http';
    }
  } catch {
    // HTTP tampoco responde — backend probablemente todavía arrancando
  }

  // AMBOS fallaron: retornar 'http' como fallback pero NO cachear,
  // para que la próxima llamada reintente la detección.
  console.log('[http] Backend no responde todavía, reintentando en próxima llamada');
  return 'http';
}

/**
 * Resetea el cache de protocolo. Llamar cuando el backend se reinicia
 * o cuando se sabe que el protocolo puede haber cambiado.
 */
export function resetProtocolCache(): void {
  _backendProtocol = null;
}

export const getApiBase = (): string => {
  const envBase = (import.meta as any).env?.VITE_API_BASE_URL;
  if (envBase) return envBase.replace(/\/+$/, '') + '/api';

  if (!(window as any).electronAPI) {
    // Si estamos en la web en Vercel, apuntar directamente al backend en Render
    if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
      return 'https://wordapa7-fastapi.onrender.com/api';
    }
    return '/api';
  }
  const port = (window as any).electronAPI.getBackendPort();

  // Si ya detectamos el protocolo, usarlo directamente (sin await)
  if (_backendProtocol) {
    return `${_backendProtocol}://127.0.0.1:${port}/api`;
  }

  // Detección inicial asíncrona: por defecto HTTP, y _detectProtocol
  // actualizará el cache para las próximas llamadas.
  _detectProtocol(port).catch(() => {});
  return `http://127.0.0.1:${port}/api`;
};

/**
 * Versión asíncrona de getApiBase() que garantiza haber detectado el
 * protocolo correcto antes de devolver la URL. Usar cuando se necesita
 * la URL correcta inmediatamente (ej: al subir un archivo).
 */
export async function getApiBaseAsync(): Promise<string> {
  const envBase = (import.meta as any).env?.VITE_API_BASE_URL;
  if (envBase) return envBase.replace(/\/+$/, '') + '/api';

  if (!(window as any).electronAPI) {
    if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
      return 'https://wordapa7-fastapi.onrender.com/api';
    }
    return '/api';
  }
  const port = (window as any).electronAPI.getBackendPort();
  const proto = await _detectProtocol(port);
  return `${proto}://127.0.0.1:${port}/api`;
}

/**
 * Resuelve URLs root-relative del backend (p.ej. "/api/images/{session}/{file}").
 * En el navegador (dev) funcionan tal cual; en Electron se sirven desde el esquema
 * "app://" así que hay que apuntarlas al backend Python explícitamente.
 */
export const resolveAssetUrl = (url: string): string => {
  if (!url) return url;
  if (!(window as any).electronAPI) return url;
  if (/^https?:\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url;
  const port = (window as any).electronAPI.getBackendPort();
  const proto = _backendProtocol || 'http';
  return `${proto}://127.0.0.1:${port}${url.startsWith('/') ? '' : '/'}${url}`;
};

/** Listener opcional para el tracing de X-Request-ID (lo registra el store). */
let requestIdListener: ((id: string) => void) | null = null;
export const setRequestIdListener = (fn: ((id: string) => void) | null): void => {
  requestIdListener = fn;
};

/** Wrapper que extrae X-Request-ID para debug tracing sin acoplarse al store. */
export async function fetchWithTrace(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  const rid = res.headers.get('X-Request-ID');
  if (rid) requestIdListener?.(rid);
  return res;
}
