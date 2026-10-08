/**
 * La portada no miente, y lo digo con el nombre del componente.
 *
 * Lo que R3 ya cubre es la REGLA: ningun color literal en `src/**`. Eso es
 * necesario y no alcanza, porque cuando algo falla el mensaje es "hay un color
 * suelto en algun lado" y nadie sabe donde. Este test dice el archivo: si
 * `UNICoverPreview` vuelve a tener `BLACK = '#000000'`, el fallo lo nombra.
 *
 * Y el segundo caso es el que la regla de colores no puede ver: un color de
 * papel escrito como si fuera de interfaz. `UNICoverPreview` es una
 * PREVISUALIZACION de una hoja impresa, asi que su tinta es `--paper-ink` y no un
 * `--text-main`: el papel no se oscurece con el tema. Ese token no se puede
 * distinguir de un token cualquiera mirando la regla, asi que se comprueba en
 * este archivo, por nombre.
 */
import { describe, it, expect } from 'vitest';

const PREVIEW = '../components/layout/UNICoverPreview.tsx?raw';
const GEOMETRIA = '../lib/portada/geometria.ts?raw';

/**
 * El codigo SIN COMENTARIOS.
 *
 * Sin esto, este test encuentra hex dentro de los comentarios que *explican* el
 * bug: el comentario de `BLACK` en `UNICoverPreview` menciona `#000000` para
 * decir "esto ya no es un color suelto", y el test lo leeria como si lo fuera.
 * Un test que no puede distinguir un color de un texto que habla de colores no
 * puede vigilar colores: la primera vez que alguien explains el defecto, el
 * test se rompe y alguien "arregla" el comentario.
 */
const sinComentarios = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Los componentes de portada que esta fase toca. */
const COMPONENTES_DE_PORTADA = [
  '../components/layout/UNICoverPreview.tsx?raw',
  '../components/layout/APACoverEditor.tsx?raw',
  '../components/wizard/portada/CarruselPortada.tsx?raw',
  '../components/wizard/portada/MiniaturaRealDePortada.tsx?raw',
  '../components/wizard/portada/HojaDatosPortada.tsx?raw',
  '../components/wizard/CoverEditorPanel.tsx?raw',
  '../lib/portada/geometria.ts?raw',
  '../lib/portada/catalogo.ts?raw',
];

describe('la portada no miente', () => {
  it('ningun componente de portada tiene un color literal', async () => {
    // Lo que R3 ya cubre, pero aqui con el nombre del componente: si
    // `UNICoverPreview` vuelve a tener `BLACK = '#000000'`, este test dice
    // exactamente eso.
    for (const ruta of COMPONENTES_DE_PORTADA) {
      const fuente = await import(/* @vite-ignore */ ruta);
      const nombre = ruta.split('/').pop()!.replace('?raw', '');
      const codigo = sinComentarios(fuente.default);
      expect(codigo, nombre).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(codigo, nombre).not.toMatch(/rgba?\(/);
    }
  });

  it('la tinta de la preview es la del papel, no la de la interfaz', async () => {
    // `--paper-ink`, no `--text-main`. La preview es una hoja impresa: la tinta
    // no cambia con el tema porque el papel no se oscurece. Con `--text-main` la
    // preview sale de un gris distinto al que el `.docx` lleva, que es el
    // defecto de las tres constantes duplicadas en su versión de color.
    const fuente = await import(/* @vite-ignore */ PREVIEW);
    expect(fuente.default).toContain('var(--paper-ink)');
    expect(fuente.default).not.toMatch(/const\s+\w*(BLACK|NEGRO|TINTA)\w*\s*=\s*'var\(--text-/);
  });

  it('la geometria no lleva ni un numero de medida escrito a mano en el componente', async () => {
    /* La preview no puede tener `minHeight: 780px` ni `width: 150px` ni un
       `fontSize: '16pt'`: la altura sale de `mmAPx`, el ancho del logo de su
       fracción del ancho útil, y los puntos de `PT_PORTADA_UNI`. Un numero de
       medida escrito a mano es exactamente lo que separó la preview del
       `.docx`. */
    const fuente = await import(/* @vite-ignore */ PREVIEW);
    const codigo = sinComentarios(fuente.default);
    expect(codigo).not.toMatch(/minHeight:\s*'\d+px'/);
    expect(codigo).not.toMatch(/width:\s*'\d+px'/);
    expect(codigo).not.toMatch(/fontSize:\s*'\d+(\.\d+)?pt'/);
    expect(codigo).not.toMatch(/height:\s*'\d+px'/);
  });

  it('los puntos de la preview salen de la tabla, no de numeros sueltos', async () => {
    // `fontSize` tiene que ser una LLAMADA a `pt(PT_PORTADA_UNI.algo)`. Un
    // numero suelto acá es el bug de los 16 contra los 20,-DNA.
    const fuente = await import(/* @vite-ignore */ PREVIEW);
    const codigo = sinComentarios(fuente.default);
    /* El `fontSize` va dentro de un string con Plantillas: `${pt(...)}px`. Un
       numero suelto ahi es el bug de los 16 contra los 20, medido. */
    const tamanos = [...codigo.matchAll(/fontSize:\s*`([^`]+)`/g)].map((m) => m[1]);
    expect(tamanos.length).toBeGreaterThan(4);
    for (const t of tamanos) {
      expect(t, `un fontSize con un numero dentro: ${t}`).toMatch(/^\$\{pt\(/);
    }
  });

  it('el modulo de geometria no declara colores ni medidas en otro lugar', async () => {
    const fuente = await import(/* @vite-ignore */ GEOMETRIA);
    // Es un modulo de numeros de papel, y un color ahi seria una segunda verdad
    // sobre como se ve la hoja.
    const codigo = sinComentarios(fuente.default);
    expect(codigo).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(codigo).not.toMatch(/rgba?\(/);
    // Y no importa nada: todo es derivado, y un modulo de geometria con estado
    // es un modulo de geometria con dos verdades.
    expect(fuente.default).not.toMatch(/^import /m);
  });
});
