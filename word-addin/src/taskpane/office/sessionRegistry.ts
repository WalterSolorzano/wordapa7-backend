/**
 * Registro de idempotencia POR SESIÓN del add-in (FASE delta-proactivo T3).
 *
 * Patrón previo: jarvisLive.ts usaba `appliedCaps = new Set<string>()` a nivel
 * de módulo y wordHelper solo captionaba lo uncaptioned. Este registro
 * generaliza ambos: una clave única por acción+elemento evita re-ejecutar
 * escrituras automáticas sobre el mismo contenido en la misma sesión.
 *
 * Memoria-only por diseño: se limpia al recargar el taskpane (nueva sesión).
 */

const applied = new Map<string, number>()

/** True si es la PRIMERA vez esta sesión; false si ya se ejecutó (omitir). */
export function oncePerSession(key: string): boolean {
  if (applied.has(key)) return false
  applied.set(key, Date.now())
  // techo defensivo: sesión no debe crecer sin límite
  if (applied.size > 2000) {
    const oldest = [...applied.entries()].sort((a, b) => a[1] - b[1])[0][0]
    applied.delete(oldest)
  }
  return true
}

/** Solo consulta (no marca). Útil para métricas honestas. */
export function wasApplied(key: string): boolean {
  return applied.has(key)
}

export function resetSessionRegistry(): void {
  applied.clear()
}

export function registrySize(): number {
  return applied.size
}
