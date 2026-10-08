/**
 * El índice del lienzo muestra la página REAL de cada encabezado, tomada de las
 * mismas páginas que dibuja el lienzo (`paginasPorElemento` sobre `pages`).
 *
 * Antes el número era `hIdx + 3`: una cifra inventada que solo coincidía por
 * casualidad. Esta guarda fija el contrato: el número sale (o es `—`), no se
 * calcula a mano. El cálculo puro vive en `paginasPorElementos.test.ts`.
 *
 * La fuente se lee con `import.meta.glob(?raw)`, no con `node:fs`: el polyfill
 * de browser que corre en vitest no trae `readFileSync`.
 */
import { describe, expect, it } from 'vitest';

const FUENTE = Object.values(
  import.meta.glob('../components/layout/PaperCanvas.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
)[0] as string;

describe('índice del lienzo: página real, no inventada', () => {
  it('toma la página de las páginas que dibuja el lienzo', () => {
    expect(FUENTE).toMatch(/paginasPorElemento/);
    expect(FUENTE).toMatch(/paginaDe\.get\(h\.id\)/);
  });

  it('no inventa la página con el índice del encabezado', () => {
    expect(FUENTE).not.toMatch(/hIdx\s*\+\s*3/);
  });
});
