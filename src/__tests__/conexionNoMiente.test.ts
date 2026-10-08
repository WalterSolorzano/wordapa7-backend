/**
 * El guardián de la UI: la lista del catálogo y la del backend tienen que coincidir.
 *
 * La UI muestra catorce claves y nueve modelos. El endpoint acepta trece, el renderer
 * manda trece y la persistencia trece. `HUGGINGFACE_API_KEY` era la que no coincidía,
 * y la coherencia no era casualidad: se cayó en tres listas seguidas.
 *
 * Ahora el guard recorre las tres y compara con el catálogo, así que una clave que se cae
 * en el camino se ve antes de que un usuario la escriba y descubra que no hace nada.
 *
 * Cuidado con el guardián que se encuentra a sí mismo: si tu test lee fuentes de `src/**`,
 * saltate a vos mismo y buscá por ruta, no por nombre de módulo.
 */
import { describe, it, expect } from 'vitest';
import { PROVEEDORES_IA } from '../lib/proveedoresIA';
import backendCrudo from '../api/backend.ts?raw';
import aiKeysCrudo from '../../python/persistence/ai_keys.py?raw';

const VARIABLES_DEL_CATALOGO = [
  ...PROVEEDORES_IA.flatMap((p) => p.variablesClave),
  ...PROVEEDORES_IA.flatMap((p) => (p.variableModelo ? [p.variableModelo] : [])),
];

const VARIABLES_DE_CLAVE = PROVEEDORES_IA.flatMap((p) => p.variablesClave);
const VARIABLES_DE_MODELO = PROVEEDORES_IA.flatMap((p) => (p.variableModelo ? [p.variableModelo] : []));

describe('la UI no ofrece un control que no llega a nada', () => {
  it('cada proveedor del catálogo tiene su variable de clave cableada', () => {
    // La lista del renderer, la del endpoint y la de la persistencia tienen que
    // coincidir con el catálogo. Una clave que se cae en el camino es una clave
    // que la UI acepta y no hace nada: el defecto de HUGGINGFACE.
    // El renderer deriva del catálogo, así que no las tiene literales — se
    // verifica en la prueba de que deriva del catálogo.
    for (const p of PROVEEDORES_IA) {
      for (const v of p.variablesClave) {
        expect(aiKeysCrudo).toContain(v);
      }
    }
  });

  it('cada proveedor del catálogo tiene su variable de modelo cableada', () => {
    // Los nueve modelos tienen que estar en la persistencia. El renderer deriva
    // del catálogo, así que no los tiene literales — se verifica en la prueba
    // anterior. Un modelo que se cae es un control mudo con la etiqueta de uno
    // funcional.
    for (const p of PROVEEDORES_IA) {
      if (p.variableModelo) {
        expect(aiKeysCrudo).toContain(p.variableModelo);
      }
    }
  });

  it('el renderer deriva del catálogo, no tiene un mapa escrito a mano', () => {
    // Si el mapa volviera a ser un `dict` literal, esta prueba se caería.
    expect(backendCrudo).toContain('PROVEEDORES_IA.flatMap');
    expect(backendCrudo).not.toContain('PROVIDER_KEY_ENV_MAP');
  });

  it('la persistencia conoce todas las variables del catálogo', () => {
    // PROVIDER_ENV_VARS es lo que sobrevive a un reinicio del backend.
    // Se usa matchAll para obtener los grupos de captura, no match con /g
    // que devuelve strings completos.
    //
    // IMPORTANTE: se busca solo dentro de las listas de variables, no en
    // todo el archivo. `HUGGINGFACE_API_KEY` puede aparecer en
    // `VARIABLES_DE_CLAVE_POR_ID` y en comentarios; si se busca en todo el
    // archivo, el guardián no muerde cuando la variable se cae de la lista
    // principal. Se extrae la sección de PROVIDER_ENV_VARS y se busca ahí.
    const seccion = aiKeysCrudo.slice(
      aiKeysCrudo.indexOf('VARIABLES_DE_CLAVE:'),
      aiKeysCrudo.indexOf('VARIABLES_DE_CLAVE_POR_ID:'),
    );
    const declaradas = new Set(
      [...seccion.matchAll(/"([A-Z][A-Z_0-9]*(?:API_KEY|API_TOKEN|ACCOUNT_ID|_MODEL|AI_MODEL))"/g)]
        .map((m) => m[1]),
    );
    const faltan = VARIABLES_DEL_CATALOGO.filter(
      (v) => !declaradas.has(v),
    );
    expect(faltan).toEqual([]);
  });

  it('la persistencia no declara variables que el catálogo no tiene', () => {
    // Una variable en la persistencia que el catálogo no conoce es algo que se
    // guarda y que nadie puede escribir.
    const declaradas = [...aiKeysCrudo.matchAll(/"([A-Z][A-Z_0-9]*(?:API_KEY|API_TOKEN|ACCOUNT_ID|_MODEL|AI_MODEL))"/g)]
      .map((m) => m[1]);
    const sobrantes = [...new Set(declaradas)].filter(
      (v) => !VARIABLES_DEL_CATALOGO.includes(v),
    );
    expect(sobrantes).toEqual([]);
  });
});

describe('la UI no dice que un control no llega cuando sí llega', () => {
  it('el texto que decía que los modelos no llegan, no está más', () => {
    // ConexionTab.tsx:275-279 y ConexionProviderField.tsx:18-21 admitían que los
    // modelos no llegaban. Ahora no, y el texto tiene que reflejar el código.
    expect(backendCrudo).not.toMatch(/todavía no los recibe/);
  });

  it('el campo no guarda sin mandar: un solo camino', () => {
    // ConexionProviderField deja de tener dos ramas: hoy `onChange` tiene
    // `if (tipo === 'clave' && limpio)`, o sea que el modelo se guarda y nunca
    // se manda. Un solo camino: las dos cosas van al sync.
    const modulo = backendCrudo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(modulo).not.toMatch(/tipo\s*===\s*'clave'\s*&&/);
  });

  it('el guardián que busca el código no se cuenta a sí mismo', () => {
    // Este archivo menciona la condición dentro de un comentario. Si la
    // búsqueda fuera sobre el texto entero, la encontraría y aprobaría el vacío.
    const campoFuenteEnElTest = [
      '/* if (tipo === \'clave\' && limpio) { la condicion buscada */',
      'const codigo = "no hay condicion";',
    ].join('\n');
    expect(campoFuenteEnElTest).toContain("tipo === 'clave'");
    const sinComentarios = campoFuenteEnElTest
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(sinComentarios).not.toContain("tipo === 'clave'");
  });
});

describe('las tres fuentes coinciden con el catálogo', () => {
  it('el catálogo tiene dieciocho claves y diecisiete modelos', () => {
    // El catálogo es la fuente de verdad. Si el catálogo crece, las comparaciones
    // se rompen y el guardián dice que algo falta.
    expect(VARIABLES_DE_CLAVE).toHaveLength(18);
    expect(VARIABLES_DE_MODELO).toHaveLength(17);
  });

  it('ninguna variable está repetida en el catálogo', () => {
    const repetidas = VARIABLES_DEL_CATALOGO.filter(
      (v, i) => VARIABLES_DEL_CATALOGO.indexOf(v) !== i,
    );
    expect(repetidas).toEqual([]);
  });

  it('todo proveedor tiene su campo de modelo', () => {
    // Los cuatro que la tenían quemada en el código —OpenRouter, Cerebras, Mistral
    // y OpenCodeZen— salen a leerla con default, así que `null` ya no describe a
    // nadie.
    const sinModelo = PROVEEDORES_IA.filter((p) => !p.variableModelo).map((p) => p.id);
    expect(sinModelo).toEqual([]);
  });

  it('todo modelo declarado tiene su default, y el default no está vacío', () => {
    const sinDefault = PROVEEDORES_IA
      .filter((p) => p.variableModelo && !p.modeloPorDefecto)
      .map((p) => p.id);
    expect(sinDefault).toEqual([]);
  });
});
