/**
 * `setStartupBehavior(load)`: la unica forma de que el panel se abra solo.
 *
 * Se llama desde el taskpane, despues de que la persona ya lo abrio una vez a
 * mano. A partir de ahi Word recuerda abrirlo con cada documento, que es lo que
 * convierte "anda a la pestana WordAPA7" en "ya esta".
 *
 * Best-effort declarado, no accidental: devuelve `false` en un Word viejo sin
 * `Office.addin`, y tambien cuando Word rechaza el pedido. Que el panel no se
 * abra solo es una molestia; que su intento de abrirse solo rompa el arranque
 * del panel es una regresion. Por eso la excepcion se traga y se informa por
 * valor de retorno.
 */

type OficinaGlobal = {
  addin?: { setStartupBehavior?: (valor: unknown) => Promise<void> | void }
  StartupBehavior?: { load?: unknown }
}

export async function activarAperturaAutomaticaDelPanel(): Promise<boolean> {
  try {
    const oficina = (globalThis as unknown as { Office?: OficinaGlobal }).Office
    const setStartupBehavior = oficina?.addin?.setStartupBehavior
    if (typeof setStartupBehavior !== 'function') return false

    const load = oficina?.StartupBehavior?.load
    if (load === undefined) return false

    await setStartupBehavior(load)
    return true
  } catch {
    return false
  }
}

export default activarAperturaAutomaticaDelPanel
