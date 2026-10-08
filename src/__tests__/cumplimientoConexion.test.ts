/* WordAPA7 — guardrails de cumplimiento en la pestaña Conexión.
 *
 * Estos son tests "source-based": leen el archivo y fijan que el aviso existe.
 * No verifican render (no hay DOM), pero sí verifican lo que importa y es
 * frágil: que las palabras concretas que la persona tiene que leer para saber
 * que su texto sale de la máquina no desaparezcan en un refactor.
 *
 * El fuente se lee con `node:fs` en un import dinámico: el shim de
 * `nodePolyfills()` de vite no trae `readFileSync`, y un import estático lo
 * resolvería al stub de browser.
 */
import { describe, expect, it, beforeAll } from 'vitest';

const NODE_FS = 'node:fs';
const NODE_PATH = 'node:path';
const NODE_URL = 'node:url';

let fuente = '';

beforeAll(async () => {
  const { readFileSync } = await import(/* @vite-ignore */ NODE_FS);
  const { resolve } = await import(/* @vite-ignore */ NODE_PATH);
  const { fileURLToPath } = await import(/* @vite-ignore */ NODE_URL);
  const testDir = fileURLToPath(import.meta.url).replace(/[^/\\]+$/, '');
  fuente = readFileSync(
    resolve(testDir, '../components/settings/tabs/ConexionTab.tsx'),
    'utf8',
  );
});

describe('aviso de cumplimiento en la pestana Conexion', () => {
  it('declara que el texto sale a un tercero', () => {
    expect(fuente).toContain('aviso-envio-externo');
    expect(fuente.toLowerCase()).toContain('sale de tu equipo');
  });

  it('el aviso cambia cuando el modo local esta activo', () => {
    expect(fuente).toContain('useLocal');
    // El copy local debe aclarar que no sale nada.
    expect(fuente.toLowerCase()).toContain('no sale');
  });

  it('ofrece la URL de Ollama local como opcion explicita', () => {
    expect(fuente).toContain('localhost:11434');
    expect(fuente).toContain('Ollama');
  });

  it('desambigua ollama_cloud de Ollama local', () => {
    // "Ollama cloud" es un proveedor de nube aparte del Ollama instalado.
    // Si la UI nombra uno, tiene que desambiguar el otro.
    expect(fuente.toLowerCase()).toContain('ollama cloud');
  });
});
