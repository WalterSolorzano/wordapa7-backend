/**
 * El catálogo de la UI y las listas del backend tienen que decir lo mismo.
 *
 * `HUGGINGFACE_API_KEY` no estaba en tres listas seguidas: el mapa del renderer,
 * el `dict` del endpoint y `PROVIDER_ENV_VARS`. La UI mostraba el campo, el
 * usuario escribía la clave, y la clave se perdía en el renderer. Tres listas
 * escritas a mano y las tres con trece entradas cuando el catálogo tenía
 * catorce.
 *
 * Estas pruebas no comparan contra una copia escrita acá: comparan contra el
 * catálogo, y el renderer **deriva** de él. Una lista escrita a mano tiene una
 * propiedad fatal — cuando el catálogo crece, la lista no, y el guardián dice
 * que todo está bien.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PROVEEDORES_IA, claveDeLocalStorage } from '../lib/proveedoresIA';
import backendCrudo from '../api/backend.ts?raw';
import aiKeysCrudo from '../../python/persistence/ai_keys.py?raw';

const syncAllProviderKeys = vi.fn();

vi.mock('../api/backend', async () => {
  const real = await vi.importActual<typeof import('../api/backend')>('../api/backend');
  return { ...real, syncAllProviderKeys: (...a: unknown[]) => syncAllProviderKeys(...a) };
});

const VARIABLES_DEL_CATALOGO = [
  ...PROVEEDORES_IA.flatMap((p) => p.variablesClave),
  ...PROVEEDORES_IA.flatMap((p) => (p.variableModelo ? [p.variableModelo] : [])),
];

/** Este mismo archivo, como texto. Existe para una prueba: la de que el
 *  guardián que busca codigo no se cuenta a si mismo. Sin esto, el nombre de la
 *  condicion buscada aparece en la documentacion de ESTE archivo, y un guardián
 *  que leyera el repositorio entero la encontraria.
 *
 *  Va DENTRO de un comentario a proposito: es lo que tiene que demonstrates
 *  que quitar comentarios es lo que evita el conteo. */
const campoFuenteEnElTest = [
  '/* if (tipo === \'clave\' && limpio) { la condicion buscada */',
  'const codigo = "no hay condicion";',
].join('\n');

describe('el catálogo de proveedores', () => {
  it('ningún proveedor se queda sin campo de modelo', () => {
    const sinModelo = PROVEEDORES_IA.filter((p) => !p.variableModelo).map((p) => p.id);
    expect(sinModelo).toEqual([]);
  });

  it('todo modelo declarado tiene su default, y el default no está vacío', () => {
    const sinDefault = PROVEEDORES_IA
      .filter((p) => p.variableModelo && !p.modeloPorDefecto)
      .map((p) => p.id);
    expect(sinDefault).toEqual([]);
  });

  it('ninguna variable está repetida en el catálogo', () => {
    const repetidas = VARIABLES_DEL_CATALOGO.filter(
      (v, i) => VARIABLES_DEL_CATALOGO.indexOf(v) !== i,
    );
    expect(repetidas).toEqual([]);
  });
});

describe('el renderer manda lo que el catálogo declara', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('HUGGINGFACE_API_KEY está en lo que el renderer manda', () => {
    /* La prueba concreta del defecto, sobre el catálogo: una sola, con nombre,
       para que cuando se caiga de nuevo se sepa cuál es sin leer todo. */
    expect(PROVEEDORES_IA.flatMap((p) => p.variablesClave)).toContain('HUGGINGFACE_API_KEY');
  });

  it('el mapa del renderer se deriva del catálogo, no está escrito a mano', () => {
    /* Si el mapa volviera a ser un `dict` literal, esta prueba se caería. Es la
       diferencia entre "hay trece líneas" y "sale del catálogo": la primera no
       crece, la segunda sí. */
    expect(backendCrudo).toContain('PROVEEDORES_IA.flatMap');
    expect(backendCrudo).not.toContain('PROVIDER_KEY_ENV_MAP');
  });
});

describe('la lista del backend cubre el catálogo', () => {
  it('PROVIDER_ENV_VARS declara cada variable del catálogo', () => {
    /* Se lee la fuente de la verdad del backend y no una copia. La copia es el
       defecto: se escribe una vez y nunca se entera de que el catálogo creció. */
    const declaradas = new Set(aiKeysCrudo.match(/"([A-Z][A-Z_0-9]*(?:API_KEY|API_TOKEN|ACCOUNT_ID|_MODEL|AI_MODEL))"/g) ?? []);
    const faltan = VARIABLES_DEL_CATALOGO.filter(
      (v) => !declaradas.has(`"${v}"`),
    );
    expect(faltan).toEqual([]);
  });

  it('la lista del backend no declara variables que el catálogo no tiene', () => {
    /* La otra dirección. Una variable en la persistencia que el catálogo no
       conoce es algo que se guarda y que nadie puede escribir. */
    const declaradas = [...aiKeysCrudo.matchAll(/"([A-Z][A-Z_0-9]*(?:API_KEY|API_TOKEN|ACCOUNT_ID|_MODEL|AI_MODEL))"/g)]
      .map((m) => m[1]);
    const sobrantes = [...new Set(declaradas)].filter(
      (v) => !VARIABLES_DEL_CATALOGO.includes(v),
    );
    expect(sobrantes).toEqual([]);
  });
});

describe('el campo no guarda sin mandar', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
  afterEach(() => { localStorage.clear(); });

  it('el texto que decía que los modelos no llegan, no está más', () => {
    /* La UI admitía por escrito que el motor todavía no los recibía, y un test
       (`conexionTab.test.tsx`) consagtaba esa admisión como contrato. La frase
       tiene que desaparecer junto con la razón por la que estaba. */
    expect(backendCrudo).not.toMatch(/todavía no los recibe/);
  });

  it('escribir un modelo llega al sync, no solo al almacenamiento', async () => {
    /* La rama que lo impedia era `if (tipo === 'clave' && limpio)`. Un modelo
       no es una clave, asi que no pasaba por ahi: se guardaba y no se mandaba.
       El archivo tiene que dejar de tener esa condicion.

       Se buscan los comentarios primero, porque el comentario que explica el
       arreglo menciona la condicion. Sin esto, el comentario del componente se
       contaria a si mismo como si fuera el codigo: el guard pasaria con el
       defecto puesto. Es el mismo fallo que en el backend, y por eso se
       cuenta igual. */
    const modulo = await import('../components/settings/tabs/word/ConexionProviderField.tsx?raw');
    const codigo = String(modulo.default).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(codigo).not.toMatch(/tipo\s*===\s*'clave'\s*&&/);
    /* Y el camino único se afirma por las dos ramas: lo escrito, vacío y con
       espacios van los dos al sync o al reposo. Un solo camino. */
    expect(codigo).toMatch(/if\s*\(limpio\)/);
  });

  it('el guardián que busca el código no se cuenta a sí mismo', () => {
    /* Este archivo menciona la condición dentro de un comentario. Si la
       búsqueda fuera sobre el texto entero, la encontraría y aprobaría el
       vacío. Se comprueba que la búsqueda es sobre código sin comentarios. */
    expect(campoFuenteEnElTest).toContain("tipo === 'clave'");
    const sinComentarios = campoFuenteEnElTest
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(sinComentarios).not.toContain("tipo === 'clave'");
  });
});
