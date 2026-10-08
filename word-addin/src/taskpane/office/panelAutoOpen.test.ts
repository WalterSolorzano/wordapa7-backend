/**
 * El panel se abre solo a partir de la primera conexion.
 *
 * QUE PROBLEMA RESUELVE. Abrir el panel no se puede desde la app de escritorio:
 * Office.js solo lo abre con un gesto dentro de Word. `setStartupBehavior(load)`
 * es la unica palanca que convierte "abri Word, anda a la pestana WordAPA7 y
 * apreta Panel" en "abri Word y el panel ya esta". Se llama DESDE el add-in, una
 * vez, y queda recordado por Word para los documentos siguientes.
 *
 * LO QUE SE AFIRMA ACA es que es best-effort en los dos sentidos: no rompe en un
 * Word viejo sin la API, y no rompe si Word la rechaza. Un panel que no se abre
 * solo es una molestia; un panel que no abre porque el intento de abrirse solo
 * lanzo una excepcion es una regresion.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { activarAperturaAutomaticaDelPanel } from './panelAutoOpen'

type OficinaFalsa = {
  addin?: { setStartupBehavior?: (v: unknown) => Promise<void> | void }
  StartupBehavior?: { load?: unknown }
}

const conOffice = (oficina: OficinaFalsa) => {
  ;(globalThis as unknown as { Office?: OficinaFalsa }).Office = oficina
}

afterEach(() => {
  delete (globalThis as unknown as { Office?: OficinaFalsa }).Office
})

describe('apertura automatica del panel', () => {
  it('pide a Word que cargue el panel al abrir el documento', async () => {
    const setStartupBehavior = vi.fn().mockResolvedValue(undefined)
    conOffice({ addin: { setStartupBehavior }, StartupBehavior: { load: 'load' } })

    const activado = await activarAperturaAutomaticaDelPanel()

    expect(activado).toBe(true)
    expect(setStartupBehavior).toHaveBeenCalledWith('load')
  })

  it('en un Word viejo sin la API no rompe: devuelve false', async () => {
    conOffice({ addin: {} })

    await expect(activarAperturaAutomaticaDelPanel()).resolves.toBe(false)
  })

  it('sin Office en absoluto no rompe', async () => {
    await expect(activarAperturaAutomaticaDelPanel()).resolves.toBe(false)
  })

  it('si Word rechaza el pedido, no propaga la excepcion', async () => {
    /* Word rechaza `setStartupBehavior` fuera del contexto de add-in soportado.
       Que falle es esperable; que se lleve puesto el arranque del panel, no. */
    conOffice({
      addin: { setStartupBehavior: vi.fn().mockRejectedValue(new Error('no soportado')) },
      StartupBehavior: { load: 'load' },
    })

    await expect(activarAperturaAutomaticaDelPanel()).resolves.toBe(false)
  })
})
