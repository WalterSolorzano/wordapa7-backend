/**
 * WordAPA7 — el mapa de marcas de `localStorage`.
 *
 * Vive en una hoja propia, y no en `store/slices/auditSlice.ts`, por dos razones
 * y con cualquiera de las dos alcanza. La primera es que lo leen tres: el lienzo,
 * el wizard del cuerpo y el interruptor de marcas de la pestaña Revisión. Tres
 * formas de leerlo son tres formas de que una quede vieja. La segunda es que un
 * slice del store no se puede importar desde un test —al importar `auditSlice` se
 * levanta el store entero y `createAuditSlice` todavía no está definido—, así que
 * la función que decide qué se guarda no se podría probar.
 *
 * El mapa guarda RÓTULOS, no datos del documento. Por eso lleva versión: cuando
 * cambia una tabla de rótulos, el mapa viejo pasa a tener textos que el código ya
 * no produce, y no hay forma de saber cuáles eran para traducirlos. Se descarta y
 * se vuelve a escribir. Sin versión, un `localStorage` viejo se leía para siempre y
 * el lienzo pintaba rótulos que nadie podía cambiar desde la UI.
 */

import { rotuloDeKind, MARCAS_MAP_VERSION } from './rotulos';

export const CLAVE_MARCAS = 'wordapa7_marcas_map';

type MarcasMap = { version: number; marcas: Record<string, string> };

/** El mapa vigente, o `{}` si no hay, si está viejo o si no se puede leer. */
export function leerMarcas(): Record<string, string> {
  try {
    const crudo = localStorage.getItem(CLAVE_MARCAS);
    if (!crudo) return {};
    const leido = JSON.parse(crudo) as Partial<MarcasMap>;
    if (leido?.version !== MARCAS_MAP_VERSION) return {};
    return leido.marcas ?? {};
  } catch {
    return {};
  }
}

/**
 * Escribe el motivo de cada elemento marcado. El rótulo sale de
 * `rotuloDeKind`, que encadena `PROOFREAD_SPECS` y `SUBTYPE_LABELS`: el `|| kind`
 * de antes escribía el `snake_case` crudo y el lienzo lo pintaba encima del
 * párrafo.
 *
 * Un hallazgo sin `element_id` se descarta en vez de usar la clave: `undefined`
 * como clave de objeto se convierte en la cadena `"undefined"`, y eso es un
 * elemento que no existe pintando su marca.
 */
export function escribirMarcas(entradas: readonly { element_id?: string; kind: string }[]): void {
  try {
    const marcas = leerMarcas();
    for (const f of entradas) {
      if (!f.element_id) continue;
      marcas[f.element_id] = rotuloDeKind(f.kind);
    }
    guardar(marcas);
  } catch {
    /* El mapa de transparencia es un extra: si el navegador no deja escribir, la
       revisión sigue sirviendo. Perder las marcas es molesto; perder la revisión
       por las marcas sería peor. */
  }
}

/** Una marca sola, con el rótulo que le pasó quien la produjo. La usa el wizard
 *  del cuerpo, que ya sabe qué hizo y escribe su propia etiqueta en palabras
 *  ("interlineado aplicado"): esa etiqueta NO pasa por `rotuloDeKind` porque no
 *  es un `kind`, y hacerla pasar por la tabla la reduciría al rótulo genérico. */
export function escribirMarca(elementId: string | null, etiqueta: string): void {
  if (!elementId) return;
  try {
    const marcas = leerMarcas();
    marcas[elementId] = etiqueta;
    guardar(marcas);
  } catch {
    /* El mapa de transparencia es un extra: si el navegador no deja escribir, la
       revisión sigue sirviendo. */
  }
}

/** Sacar una marca es escribir el mapa sin ella: el mapa entero se reescribe
 *  con la versión vigente, no se parchea en crudo y se deja sin versión. */
export function borrarMarca(elementId: string): void {
  try {
    const marcas = leerMarcas();
    delete marcas[elementId];
    guardar(marcas);
  } catch {
    /* Igual que en `escribirMarcas`: la marca es un extra. */
  }
}

function guardar(marcas: Record<string, string>): void {
  localStorage.setItem(CLAVE_MARCAS, JSON.stringify({ version: MARCAS_MAP_VERSION, marcas }));
  window.dispatchEvent(new StorageEvent('storage', { key: CLAVE_MARCAS }));
}
