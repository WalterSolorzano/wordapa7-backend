/**
 * WordAPA7 — T1: el token de fondo del resaltado de patrones IA existe en
 * ambos temas. Sin el redefine en oscuro, el subrayado del detector queda
 * invisible sobre superficie oscura (Review Focus #1).
 */
import { describe, it, expect, beforeAll } from 'vitest';

// Specifiers en variables, imports dinámicos: si Vite puede analizarlos los
// pasa por vite-plugin-node-polyfills, cuyos shims de browser no traen
// readFileSync ni fileURLToPath, y su `path.resolve` ni siquiera entiende una
// ruta absoluta de Windows (mismo problema que documenta vite.config.ts).
const NODE_FS = 'node:fs';
const NODE_PATH = 'node:path';
const NODE_URL = 'node:url';

let lightBlock = '';
let darkBlock = '';
/* La hoja entera, no solo los bloques de tema. Los tokens de tamaño de hoja
   viven en un `:root` propio porque el papel no cambia con el tema, así que no
   aparecen en ninguno de los dos bloques de arriba. */
let cssCompleta = '';

beforeAll(async () => {
  const { readFileSync } = await import(/* @vite-ignore */ NODE_FS);
  const { resolve } = await import(/* @vite-ignore */ NODE_PATH);
  const { fileURLToPath } = await import(/* @vite-ignore */ NODE_URL);
  // La ruta se ancla en import.meta.url, no en __dirname (que en este runner
  // apunta a <root>/src) ni en `new URL('../styles/...', import.meta.url)`
  // (que en jsdom resuelve contra http://localhost:3000, no contra file://).
  const testDir = fileURLToPath(import.meta.url).replace(/[^/\\]+$/, '');
  const css = readFileSync(resolve(testDir, '../styles/design-system.css'), 'utf8');
  cssCompleta = css;
  lightBlock = css.slice(css.indexOf(':root,'), css.indexOf(':root[data-theme="dark"]'));
  darkBlock = css.slice(css.indexOf(':root[data-theme="dark"]'));
});

describe('T1 — token --mark-ai-bg', () => {
  it('está definido en el tema claro', () => {
    expect(lightBlock).toMatch(/--mark-ai-bg:\s*[^;]+;/);
  });

  it('está definido en el tema oscuro', () => {
    expect(darkBlock).toMatch(/--mark-ai-bg:\s*[^;]+;/);
  });

  it('los dos valores son distintos, para que el detector se lea en ambos temas', () => {
    const light = lightBlock.match(/--mark-ai-bg:\s*([^;]+);/)?.[1].trim();
    const dark = darkBlock.match(/--mark-ai-bg:\s*([^;]+);/)?.[1].trim();
    expect(light).toBeTruthy();
    expect(dark).toBeTruthy();
    expect(dark).not.toBe(light);
  });
});

/**
 * Los tokens del TAMAÑO DE HOJA. Antes eran `210mm` y `297mm` escritos a mano
 * en `.paper`, que son A4, mientras el lienzo paginaba con Carta y `DESIGN.md:75`
 * pide Carta: tres truths sobre la misma hoja y ninguna mirando a las otras.
 *
 * Lo que se mira acá es la CONTRADICCIÓN, no la existencia del token: que el
 * default sea Carta, que los dos tamaños estén declarados siempre, y que `.paper`
 * lea los tokens en vez de un número. Si alguien vuelve a escribir `210mm` en
 * `.paper`, esto se cae aunque los tokens sigan ahí.
 *
 * La comparación con el backend vive en `documentoTab.test.tsx`, que lee el
 * `.py` con `?raw`: las dos tablas están escritas a mano en dos idiomas.
 */
describe('T2 — el tamaño de hoja', () => {
  it('el DEFAULT es Carta, no A4', () => {
    // DESIGN.md:75 pide 8.5" x 11". Con A4 de default, el caso por defecto
    // seguía siendo el documento que se ve en un papel y se descarga en otro.
    expect(cssCompleta).toMatch(/--paper-width:\s*215\.9mm/);
    expect(cssCompleta).toMatch(/--paper-height:\s*279\.4mm/);
  });

  it('los DOS tamaños están declarados, porque el que no se elige no se borra', () => {
    expect(cssCompleta).toMatch(/--paper-width-a4:\s*210mm/);
    expect(cssCompleta).toMatch(/--paper-height-a4:\s*297mm/);
  });

  it('`.paper` lee los tokens y no un número escrito a mano', () => {
    const bloque = cssCompleta.match(/\.paper\s*\{[^}]*\}/)?.[0] || '';
    expect(bloque).toMatch(/width:\s*var\(--paper-width\)/);
    expect(bloque).toMatch(/min-height:\s*var\(--paper-height\)/);
    expect(bloque).not.toMatch(/\d+mm/);
  });

  it('el que no se elige sale por `data-page-size` en <html>, como el tema', () => {
    // Mismo patrón que `data-theme`: un atributo en la raíz y dos pares de
    // tokens declarados. La diferencia es que el papel NO depende del tema, así
    // que sus tokens viven en un `:root` propio y no en los dos bloques.
    expect(cssCompleta).toMatch(/:root\[data-page-size="a4"\]\s*\{/);
    expect(cssCompleta).toMatch(/:root\[data-page-size="a4"\][^{]*\{[^}]*--paper-width:\s*var\(--paper-width-a4\)/);
    expect(cssCompleta).toMatch(/:root\[data-page-size="a4"\][^{]*\{[^}]*--paper-height:\s*var\(--paper-height-a4\)/);
  });

  it('las medidas no llevan color: el bloque que declara el papel es solo medidas', () => {
    const raiz = cssCompleta.match(/:root\s*\{[^}]*--paper-width:[^}]*\}/)?.[0] || '';
    expect(raiz, 'no se encontró el bloque :root que declara --paper-width').not.toBe('');
    expect(raiz).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(raiz).not.toMatch(/\brgba?\(/);
  });
});
