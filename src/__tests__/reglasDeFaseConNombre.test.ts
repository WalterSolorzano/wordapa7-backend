/**
 * Toda regla de fase tiene nombre legible.
 *
 * `RULE_SCOPES` (`python/modules/phase_scope.py`) es la declaración de qué reglas
 * existen y en qué ámbito aplican: es lo que `test_rule_scopes.py` exige que
 * cubra a todo `kind` que el auditor emite. No estaba exportada al frontend, y
 * copiar la lista a un `.ts` habría sido crear una tercera verdad que diverge sola
 * —justo lo que este trabajo vino a desarmar—, así que este test lee el fuente de
 * Python con `?raw` y extrae las claves de la declaración. Si mañana se declara una
 * regla nueva en Python, esta prueba se entera sin que nadie actualice una lista.
 *
 * Lo que exige: cada `kind` declarado tiene fila en `PROOFREAD_SPECS`, y ese
 * `subtype` tiene nombre en `SUBTYPE_LABELS`. Sin las dos, la regla sale en
 * pantalla como "Otro hallazgo del corrector" —o, antes de la Fase 0, como su
 * propio `snake_case` pintado encima del párrafo.
 */

import { describe, it, expect } from 'vitest';
import fuentePython from '../../python/modules/phase_scope.py?raw';
import { PROOFREAD_SPECS } from '../lib/auditItems';
import { rotuloDeSubtipo, ROTULO_GENERICO } from '../lib/rotulos';

/**
 * Los `kind` declarados en `RULE_SCOPES`.
 *
 * El diccionario se declara una vez y después crece con `RULE_SCOPES.update({...})`
 * en la misma línea donde se implementa cada regla, así que hay que leer las dos
 * formas. Es una lectura de texto, no una importación: si el formato cambia, esto
 * deja de encontrar claves y el guardia de abajo lo dice en vez de pasar en verde
 * por no haber leído nada.
 */
function kindsDeclarados(): string[] {
  const bloques = [
    ...fuentePython.matchAll(/RULE_SCOPES(?::\s*Dict\[[^\]]*\])?\s*(?:=\s*|\.update\s*\()\s*\{([^}]*)\}/g),
  ].map((m) => m[1]);
  const kinds = bloques.flatMap((b) =>
    [...b.matchAll(/"([A-Za-z0-9_]+)":/g)].map((m) => m[1]),
  );
  /* La guarda de que la lectura sirva: sin esto, un cambio de formato en el
     Python deja el bucle sin iteraciones y la prueba pasa por no haber leído. */
  if (kinds.length < 25) {
    throw new Error(
      `Solo se leyeron ${kinds.length} claves de RULE_SCOPES: la lectura del fuente ` +
        'de Python se quedo corta y esta prueba no estaria midiendo nada.',
    );
  }
  return [...new Set(kinds)];
}

describe('toda regla de fase tiene nombre legible', () => {
  it('la lectura de RULE_SCOPES encuentra las reglas que el backend declara', () => {
    /* No es una prueba tautológica: es la guarda de la lectura de arriba, escrita
       como prueba para que se lea sola. Si este número baja, la lectura se
       rompió, y todas las pruebas de este archivo dejan de medir. */
    const kinds = kindsDeclarados();
    expect(kinds.length).toBeGreaterThan(25);
    expect(kinds).toContain('paragraph_words');
    expect(kinds).toContain('portada_punto_final');
  });

  it('ningun kind de RULE_SCOPES cae al rotulo generico', () => {
    const sinNombre: string[] = [];
    for (const kind of kindsDeclarados()) {
      const spec = PROOFREAD_SPECS[kind];
      if (!spec) { sinNombre.push(`${kind} (no esta en PROOFREAD_SPECS)`); continue; }
      if (rotuloDeSubtipo(spec.subtype) === ROTULO_GENERICO) sinNombre.push(`${kind} -> ${spec.subtype}`);
    }
    expect(sinNombre).toEqual([]);
  });

  it('ningun kind declarado por el backend es una fila muerta del frontend', () => {
    /* La otra mitad, y la que el caso anterior no ve: una fila de
       `PROOFREAD_SPECS` que el backend nunca emite no está de más, pero es un
       nombre que el lector nunca va a ver, y confunde a quien lea la tabla
       buscando de dónde sale. Lo más grave es el caso inverso —una regla que se
       emite con otro nombre— y por eso el backend es la fuente. */
    const declarados = new Set(kindsDeclarados());
    const huerfanos = Object.keys(PROOFREAD_SPECS).filter((kind) => !declarados.has(kind));
    expect(huerfanos, `filas que el backend nunca emite: ${huerfanos.join(', ')}`).toEqual([]);
  });

  it('el nombre de una regla de fase no parece un identificador', () => {
    /* El rótulo se lee; la clave no. Si alguno sale con guion bajo, vuelve el
       defecto que el usuario vio. */
    const crudos = kindsDeclarados()
      .map((kind) => PROOFREAD_SPECS[kind])
      .filter((s) => s)
      .map((s) => rotuloDeSubtipo(s!.subtype))
      .filter((r) => /^[a-z0-9]+(_[a-z0-9]+)+$/.test(r));
    expect(crudos, `rótulos que son claves: ${crudos.join(', ')}`).toEqual([]);
  });
});
