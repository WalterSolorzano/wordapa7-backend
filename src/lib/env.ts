/**
 * Utilidades para detección de entorno de ejecución (Web vs Desktop Electron / Local).
 */

export function isElectron(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as any).electron ||
    (window as any).process?.versions?.electron ||
    navigator.userAgent.toLowerCase().includes(' electron/')
  );
}

export function isWeb(): boolean {
  return !isElectron();
}
