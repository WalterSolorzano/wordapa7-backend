/**
 * WordAPA7 — los módulos APA se declaran UNA vez.
 *
 * El defecto que arregla esta prueba: la lista de "qué se estandariza" vivía
 * escrita dos veces —el menú de la barra (`APAModuleToggles`) y el modal Express
 * (`ExpressQuickTransformModal`)— con dos taxonomías distintas. Y la de la barra
 * además ofrecía cinco módulos cuando el motor solo entiende tres alcances
 * (`python/modules/scoped_apply.py:29`), así que apagar uno de los finos mandaba
 * un alcance inválido, el backend lo rechazaba y la exportación caía al formato
 * completo con un aviso. La pantalla decía una cosa y el motor hacía otra.
 *
 * Ahora la lista es `src/lib/modulosApa.ts` y esta prueba cuida las dos mitades:
 * que los alcances declarados sean EXACTAMENTE los del motor, y que ningún
 * consumidor se escriba su propia lista.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  ALCANCES_DEL_MOTOR,
  GRUPOS_DE_MODULOS,
  MODULOS_APA,
  alcancesDe,
  modulosDe,
} from '../lib/modulosApa';

/* Specifier en variable + import dinámico: si Vite puede analizarlos los pasa
   por `vite-plugin-node-polyfills`, cuyos shims de browser no traen
   `readFileSync` (mismo truco que `exportViewLayout.test.tsx`). */
const NODE_FS = 'node:fs';
const NODE_PATH = 'node:path';
const NODE_URL = 'node:url';
let FUENTES: Record<string, string> = {};

beforeAll(async () => {
  const { readFileSync } = await import(/* @vite-ignore */ NODE_FS);
  const { resolve } = await import(/* @vite-ignore */ NODE_PATH);
  const { fileURLToPath } = await import(/* @vite-ignore */ NODE_URL);
  const testDir = fileURLToPath(import.meta.url).replace(/[^/\\]+$/, '');
  const consumidores = [
    '../components/toolbar/APAModuleToggles.tsx',
    '../components/quick/ExpressQuickTransformModal.tsx',
  ];
  FUENTES = Object.fromEntries(
    consumidores.map((rel) => [rel, readFileSync(resolve(testDir, rel), 'utf8')]),
  );
});

/* Espejo literal de `VALID_SCOPES` en `python/modules/scoped_apply.py`. Si el
 * motor suma o quita un alcance, esta prueba y el motor tienen que moverse
 * juntos; ese es el punto. */
const ALCANCES_DEL_MOTOR_EN_PYTHON = ['texto', 'tablas_imagenes', 'bibliografia'];

describe('módulos APA: una sola declaración', () => {
  it('solo declara alcances que el motor entiende', () => {
    expect([...ALCANCES_DEL_MOTOR].sort()).toEqual([...ALCANCES_DEL_MOTOR_EN_PYTHON].sort());
    for (const m of MODULOS_APA) {
      expect(ALCANCES_DEL_MOTOR_EN_PYTHON).toContain(m.alcance);
    }
  });

  it('ningún id se repite y cada categoría tiene al menos un módulo', () => {
    const ids = MODULOS_APA.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of GRUPOS_DE_MODULOS) {
      expect(modulosDe(g.id).length).toBeGreaterThan(0);
    }
  });

  it('todo módulo cae en una categoría declarada', () => {
    const grupos = GRUPOS_DE_MODULOS.map((g) => g.id);
    for (const m of MODULOS_APA) {
      expect(grupos).toContain(m.grupo);
    }
  });

  it('alcancesDe traduce a alcances del motor, sin duplicados y en orden', () => {
    expect(alcancesDe(['texto', 'texto'])).toEqual(['texto']);
    expect(alcancesDe(MODULOS_APA.map((m) => m.id))).toEqual([...ALCANCES_DEL_MOTOR]);
  });

  it('alcancesDe descarta lo desconocido y entiende los ids viejos', () => {
    // Un estado guardado antes del arreglo: los cinco módulos finos.
    expect(alcancesDe(['titulos', 'tablas', 'imagenes'])).toEqual(['texto', 'tablas_imagenes']);
    expect(alcancesDe(['lo-que-no-existe'])).toEqual([]);
  });

  it('ningún consumidor redeclara la lista: la importa', () => {
    const consumidores = [
      '../components/toolbar/APAModuleToggles.tsx',
      '../components/quick/ExpressQuickTransformModal.tsx',
    ];
    for (const rel of consumidores) {
      const src = FUENTES[rel];
      expect(src).toMatch(/from '.*lib\/modulosApa'/);
      // La lista de alcances no puede volver a escribirse a mano en la pantalla.
      expect(src).not.toMatch(/'tablas_imagenes'/);
    }
  });
});
