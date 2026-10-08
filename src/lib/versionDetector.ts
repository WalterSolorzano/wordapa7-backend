/**
 * Detección de versiones similares de un mismo documento.
 * Lógica pura, sin dependencias, testeable en aislamiento.
 */

/** Quita extensión, sufijos de versión, nombres de personas y normaliza. */
export function normalizarNombreBase(filename: string): string {
  // 1. Quitar extensión
  let name = filename.replace(/\.docx$/i, '');
  // 2. Quitar sufijos numéricos de Windows: " (1)", " (2)", "(1)", etc.
  name = name.replace(/\s*\(\d+\)\s*$/, '');
  // 3. Quitar sufijos de versión comunes (case-insensitive)
  name = name.replace(/[_\s-]+(v\d+|final|definitivo|real|copia|editado|revisado|borrador|draft|nuevo|new|corregido|ultimo|last|\d{4}-\d{2}-\d{2}|\d{8})$/gi, '');
  // 4. Quitar nombre de persona al final: "_Juan", "_María", etc. (palabra con mayúscula)
  name = name.replace(/[_\s-]+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/g, '');
  // 5. Normalizar: lowercase, trim, colapsar espacios/guiones/underscores
  return name.toLowerCase().trim().replace(/[\s_-]+/g, ' ');
}

/** Distancia de Levenshtein — solo para nombres cortos (< 50 chars). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Un par de archivos son versiones del mismo documento si su nombre base es idéntico o distancia ≤ 2. */
export function sonVersionesSimilares(nombreA: string, nombreB: string): boolean {
  const a = normalizarNombreBase(nombreA);
  const b = normalizarNombreBase(nombreB);
  if (a.length < 3 || b.length < 3) return false; // nombres demasiado cortos → no comparar
  return a === b || levenshtein(a, b) <= 2;
}
