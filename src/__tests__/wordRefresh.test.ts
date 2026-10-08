/**
 * Lo que el watcher de Word puede decir, y lo que no.
 *
 * `src/App.tsx`-atrase-de-la-linea-del-watcher-atribuia-a-este-watchdog la
 * responsabilidad de avisar, y lo que decia era una frase que el codigo no
 * hacia nada: "el documento esta sincronizado". No reparseaba, no reauditaba,
 * no recargaba nada. Era una mentira en la UI, y de las que no se ven porque
 * suena razonable.
 *
 * Estas pruebas fijan la regla que la reemplaza: **el texto del aviso se deduce
 * del diff y solo del diff**. Si el diff no lo prueba, no se dice.
 *
 * Y fijan el otro caso, que es el que mas veces se va a dar: el watcher
 * dispara por cada evento de escritura y Word reescribe el archivo entero en
 * cada guardado, asi que es NORMAL que el watcher lea el `.docx` a mitad de una
 * escritura. Eso
 * no es un error ni un problema, y por eso no produce un aviso. Un aviso de
 * error por un archivo que se estaba escribiendo es la peor forma de Gastar la
 * confianza de alguien en los mensajes de la app.
 */

import { describe, it, expect, vi } from 'vitest';
import { mensajeDeRefresco, crearRefrescador, type DiffWord } from '../lib/wordRefresh';

const ARCHIVO = 'Tesis.docx';

function diff(over: Partial<DiffWord> = {}): DiffWord {
  return {
    session_id: 's1',
    listo: true,
    cambiado: false,
    hash_estructura: 'h',
    elementos: [],
    ids_nuevos: [],
    ids_eliminados: [],
    ...over,
  };
}

describe('mensajeDeRefresco', () => {
  it('NO DICE NADA cuando el archivo se esta escribiendo a medias', () => {
    // El caso que mas se va a repetir. `listo: false` no es un fallo: es "todavia
    // no". El watcher vuelve a mirar solo.
    const r = mensajeDeRefresco(
      diff({ listo: false, motivo: 'archivo_a_medio_escribir' }),
      ARCHIVO
    );
    expect(r).toBeNull();
  });

  it('NO DICE NADA cuando Word guardo pero no cambio texto ni estructura', () => {
    // Un Ctrl+S que solo toca estilos, una imagen o una propiedad. El diff
    // esta vacio y un "guardado" en pantalla seria ruido: el watcher dispara
    // por cada evento de escritura y eso se convierte en una columna de toasts falsos.
    expect(mensajeDeRefresco(diff(), ARCHIVO)).toBeNull();
  });

  it('NUNCA dice que el documento esta sincronizado', () => {
    // Esta es la prueba de la mentira original. Se recorre TODOS los caminos,
    // incluidos los que hoy no existen, porque la tentacion de volver a
    // escribir esa frase es exactamente la que hace que la app sea creible o no.
    const caminos = [
      diff(),
      diff({ listo: false }),
      diff({ cambiado: true, ids_nuevos: ['a'] }),
      diff({ cambiado: true, ids_nuevos: ['a'], ids_eliminados: ['b'] }),
      diff({ cambiado: true }),
    ];
    for (const d of caminos) {
      const r = mensajeDeRefresco(d, ARCHIVO);
      const texto = r ? r.texto.toLowerCase() : '';
      expect(texto).not.toContain('sincronizado');
      expect(texto).not.toContain('sincroniz');
    }
  });

  it('NUNCA dice que ya se reaudito, porque todavia no se reaudita', () => {
    // El diff no reaudita nada todavia: solo dice que texto entro. Afirmar que
    // los hallazgos se actualizaron seria la misma mentira un paso mas adentro,
    // y mas dificil de detectar porque suena todavia mas razonable.
    const r = mensajeDeRefresco(diff({ cambiado: true, ids_nuevos: ['a', 'b'] }), ARCHIVO);
    expect(r).not.toBeNull();
    const texto = r!.texto.toLowerCase();
    expect(texto).not.toContain('hallazgo');
    expect(texto).not.toContain('revis');
    expect(texto).not.toContain('corregid');
    expect(texto).not.toContain('actualiz');
  });

  it('NUNCA inventa un numero de hallazgos', () => {
    // El texto tiene que poder derivarse de los conteos del diff. Si el numero
    // de hallazgos no viene de ahi, no se escribe: no hay de donde sacarlo.
    const r = mensajeDeRefresco(diff({ cambiado: true, ids_nuevos: ['a', 'b', 'c'] }), ARCHIVO);
    expect(r!.texto).toContain('3');
  });

  it('NUNCA anuncia un resultado que el diff no demuestra', () => {
    const r = mensajeDeRefresco(diff({ cambiado: true, ids_nuevos: ['a', 'b', 'c'] }), ARCHIVO);
    // 3 textos nuevos, 0 eliminados: el mensaje no debe mencionar un borrado
    // que no ocurrio, ni un "0 eliminados" que es ruido.
    expect(r!.texto).not.toContain('0');
    expect(r!.texto).toContain('3');
  });

  it('el archivo A MEDIAS ESCRIBIR produce el MISMO aviso que uno entero', () => {
    // Un archivo a medio escribir no se puede parsear, y por eso el backend
    // responde `listo: false`. Un `.docx` a medio escribir no es un documento
    // con menos parrafos: NO es un documento. Tratarlo como uno vacio haria que
    // la app dijera "no cambio nada" cuando en realidad no pudo mirar.
    const entero = diff({ listo: false });
    expect(mensajeDeRefresco(entero, ARCHIVO)).toBeNull();
  });

  it('un archivo que se borro del disco NO es un archivo a medias', () => {
    // Un 404 es un problema real y con nombre: el archivo no esta. No se
    // confunde con "todavia no", porque "todavia no" es la unica cosa que se
    // reintenta sola.
    const r = mensajeDeRefresco(
      diff({ listo: false, motivo: 'no_existe', error: 'HTTP 404' }),
      ARCHIVO
    );
    expect(r).not.toBeNull();
    expect(r!.texto).toContain(ARCHIVO);
  });
});

describe('crearRefrescador', () => {
  it('no dispara dos refrescos a la vez', async () => {
    // El watcher dispara por cada evento de escritura y el refresco relee y
    // reparsea el archivo entero. Dos a la vez es leer el mismo archivo mientras el otro lo
    // esta leyendo, y el que pierde se lleva un `BadZipFile` que no es real.
    //
    // La primera llamada queda colgada a proposito: mientras esta en vuelo, dos
    // disparos mas tienen que poder entrar SIN abrir una lectura en paralelo.
    // Las siguientes se resuelven solas, porque lo que se mide aca es la
    // concurrencia y no cuantas veces se lee.
    let enVuelo = 0;
    let maximoConcurrente = 0;
    let llamadas = 0;
    let liberar: (() => void) | null = null;

    const pedir = vi.fn(() => {
      enVuelo += 1;
      maximoConcurrente = Math.max(maximoConcurrente, enVuelo);
      const numero = ++llamadas;
      if (numero === 1) {
        return new Promise<DiffWord>((r) => {
          liberar = () => {
            enVuelo -= 1;
            r(diff());
          };
        });
      }
      enVuelo -= 1;
      return Promise.resolve(diff());
    });

    const { refrescar, pendiente } = crearRefrescador({
      pedir,
      avisar: vi.fn(),
      archivo: () => ARCHIVO,
    });

    const a = refrescar();
    expect(pendiente()).toBe(true);
    const b = refrescar();
    const c = refrescar();
    expect(maximoConcurrente).toBe(1);

    await Promise.resolve();
    liberar!();
    await Promise.all([a, b, c]);
    expect(maximoConcurrente).toBe(1);
    expect(pendiente()).toBe(false);
  });

  it('VUELVE A MIRAR si el archivo cambio mientras miraba', async () => {
    // Si no, un Ctrl+S que cae en medio del refresco se pierde en silencio y la
    // pantalla nunca se entera: el peor fallo posible, porque no se ve.
    const pedir = vi.fn().mockResolvedValue(diff());
    const { refrescar } = crearRefrescador({
      pedir,
      avisar: vi.fn(),
      archivo: () => ARCHIVO,
      // Reintento apagado para medir SOLO el colapso. Con el reintento prendido
      // este test contaria dos llamadas por pasada y no probaria lo que dice
      // probar: hay dos mecanismos distintos de "mirar otra vez" y confundirlos
      // deja los dos sin probar.
      msReintento: 0,
    });

    const a = refrescar();
    const b = refrescar();
    await Promise.all([a, b]);
    // El segundo disparo no se tira: espera al primero y vuelve a mirar.
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it('UN FALLO NO MUERE EL WATCHER', async () => {
    // Un error de red, un 500, un backend que recien arranco. Si el refresco
    // lanza, el `useEffect` de `App.tsx` se cae y el watcher deja de existir
    // para el resto de la sesion: Word guarda veinte veces y no pasa nada. Por
    // eso el error se reporta y se vuelve a mirar, no se propaga.
    const avisar = vi.fn();
    const pedir = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue(diff({ cambiado: true, ids_nuevos: ['a'] }));

    const { refrescar } = crearRefrescador({ pedir, avisar, archivo: () => ARCHIVO });
    await expect(refrescar()).resolves.not.toThrow();
    // Y el siguiente guardado vuelve a intentarlo.
    await refrescar();
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it('AVISA LO QUE EL DIFF DICE, no lo que el codigo imagina', async () => {
    const avisar = vi.fn();
    const pedir = vi
      .fn()
      .mockResolvedValue(diff({ cambiado: true, ids_nuevos: ['a'], ids_eliminados: [] }));
    const { refrescar } = crearRefrescador({ pedir, avisar, archivo: () => ARCHIVO });
    await refrescar();
    expect(avisar).toHaveBeenCalledTimes(1);
    expect(avisar.mock.calls[0][0]).toContain('1');
  });

  it('NO AVISA NADA cuando el diff no cambio', async () => {
    const avisar = vi.fn();
    const { refrescar } = crearRefrescador({
      pedir: vi.fn().mockResolvedValue(diff()),
      avisar,
      archivo: () => ARCHIVO,
    });
    await refrescar();
    expect(avisar).not.toHaveBeenCalled();
  });

  it('no pide nada si no hay archivo abierto', async () => {
    // El watcher sin `activeFilePath` no tiene contra que mirar. Llamar igual
    // seria un 404 por cada disparo, y un 404 es un problema real, no ruido.
    const pedir = vi.fn();
    const { refrescar } = crearRefrescador({ pedir, avisar: vi.fn(), archivo: () => null });
    await refrescar();
    expect(pedir).not.toHaveBeenCalled();
  });

  it('UN ARCHIVO A MEDIAS SE VUELVE A MIRAR UNA VEZ', async () => {
    // EL CASO QUE SE PIERDE, y el motivo de que exista el reintento.
    //
    // El watcher de Electron es `fs.watch` con debounce de 600 ms, NO un poll: el
    // evento llega por el sistema de archivos. Si la ultima escritura de Word
    // sigue en curso a los 600 ms —una tesis grande, un disco lento, un
    // OneDrive sincronizando— el backend responde "todavia no" y, sin reintento,
    // ese guardado se pierde entero. El documento no se actualiza hasta el
    // siguiente Ctrl+S, y quien lo hizo no tiene por que saber que falto.
    const avisar = vi.fn();
    const pedir = vi
      .fn()
      .mockResolvedValueOnce(diff({ listo: false, motivo: 'archivo_a_medio_escribir' }))
      .mockResolvedValueOnce(diff({ cambiado: true, ids_nuevos: ['a'] }));
    const { refrescar } = crearRefrescador({
      pedir,
      avisar,
      archivo: () => ARCHIVO,
      // Reloj inyectado: un temporizador real en una prueba es una espera real,
      // y una espera real es una prueba que a veces pasa.
      esperar: (_ms, fn) => fn(),
    });

    await refrescar();
    expect(pedir).toHaveBeenCalledTimes(2);
    expect(avisar).toHaveBeenCalledTimes(1);
  });

  it('UN REINTENTO, NO UN BUCLE', async () => {
    // Si el archivo sigue a medias, se deja para el siguiente guardado. Un bucle
    // de reintentos sobre un archivo que Word tiene abierto es estar leyendo
    // basura una y otra vez, y en el caso de un archivo de red o un OneDrive
    // mal montado, insistir empeora el problema en vez de taparlo.
    const pedir = vi.fn().mockResolvedValue(diff({ listo: false }));
    const { refrescar } = crearRefrescador({
      pedir,
      avisar: vi.fn(),
      archivo: () => ARCHIVO,
      esperar: (_ms, fn) => fn(),
    });
    await refrescar();
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it('EL REINTENTO SE PUEDE DESACTIVAR', async () => {
    const pedir = vi.fn().mockResolvedValue(diff({ listo: false }));
    const { refrescar } = crearRefrescador({
      pedir,
      avisar: vi.fn(),
      archivo: () => ARCHIVO,
      esperar: (_ms, fn) => fn(),
      msReintento: 0,
    });
    await refrescar();
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it('UN ARCHIVO QUE NO EXISTE NO SE REINTENTA', async () => {
    // Un 404 no se arregla esperando 900 ms. Reintentar un archivo que no esta es
    // insistir con algo que solo se arregla cuando la persona lo mueva, y cada
    // intento es un 404 en el log del backend.
    const pedir = vi.fn().mockResolvedValue(diff({ listo: false, motivo: 'no_existe' }));
    const { refrescar } = crearRefrescador({
      pedir,
      avisar: vi.fn(),
      archivo: () => ARCHIVO,
      esperar: (_ms, fn) => fn(),
    });
    await refrescar();
    expect(pedir).toHaveBeenCalledTimes(1);
  });
});
