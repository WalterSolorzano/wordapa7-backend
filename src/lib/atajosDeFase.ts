/* WordAPA7 — los atajos de fase, en un solo lugar.
 *
 * Existían DOS verdades y no coincidían. `App.tsx` tenía el handler real —
 * `Ctrl+1..5` iban a la fase 1..5 y `Ctrl+6` a la 6— y la paleta DECLARABA
 * `Ctrl+1..5` para fases que no coincidían con esos números, `Ctrl+2` DOS veces
 * para dos comandos, y `Ctrl+6` para dos cosas distintas. Un atajo anotado en
 * una lista y ejecutado en otro no es un atajo: es una promesa.
 *
 * La verdad es la de `App.tsx`, porque el handler es el que se ejecuta siempre,
 * con la paleta abierta o no. Y la regla de acá es que el número del atajo es el
 * número de la fase: no hay tabla que mantener, hay una regla. Si mañana hay una
 * fase 7, su atajo es `Ctrl+7` y no hay que decidir nada.
 *
 * La fase 6 es Exportar. Ojo con esto, que fue el error que había: la paleta
 * llamaba "Ir a Exportar (paso final)" a `setWizardStep(5)`, y la fase 5 es
 * Revisión & IA. El nombre prometía la última pantalla y entregaba la anterior.
 */

/** Cuántas fases tiene el asistente, y a cuál va cada número. */
export const FASES: ReadonlyArray<{ paso: number; etiqueta: string; atajo: string }> = [
  { paso: 1, etiqueta: 'Portada', atajo: 'Ctrl+1' },
  { paso: 2, etiqueta: 'Estructura', atajo: 'Ctrl+2' },
  { paso: 3, etiqueta: 'Figuras y Tablas', atajo: 'Ctrl+3' },
  { paso: 4, etiqueta: 'Referencias', atajo: 'Ctrl+4' },
  { paso: 5, etiqueta: 'Revisión & IA', atajo: 'Ctrl+5' },
  { paso: 6, etiqueta: 'Exportar', atajo: 'Ctrl+6' },
];

/** El atajo de una fase. La regla es una: el número del atajo es el de la fase. */
export function atajoDeFase(paso: number): string {
  return `Ctrl+${paso}`;
}

/** La fase a la que lleva un atajo de fase, o `null` si el número no es una
 *  fase. Es la inversa que el handler de `App.tsx` ya tenía hardcodeada, y por
 *  eso la usan sus pruebas: un número que no es fase tiene que devolver `null` y
 *  no "la fase 1". */
export function faseDeAtajo(numero: string): number | null {
  if (!/^[1-9]$/.test(numero)) return null;
  const paso = Number(numero);
  return FASES.some((f) => f.paso === paso) ? paso : null;
}

/** Etiqueta de fase para la lista de la paleta, sin repetir la tabla dos veces. */
export function etiquetaDeFase(paso: number): string {
  return FASES.find((f) => f.paso === paso)?.etiqueta ?? `Paso ${paso}`;
}
