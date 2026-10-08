/**
 * `onlyCover` no es solo "dibuja la página 1": también APAGA la maquinaria de
 * fondo —medición DOM, repaginado Word COM y export PDF—. Esa maquinaria era
 * la causa de que las miniaturas tardaran y fallaran, así que no puede volver
 * sin que un test lo diga.
 *
 * Es un guard de FUENTE —como el de `coverStudioChrome`— y no un render: los
 * tres efectos y los dos hooks se montan contra un `doc` real, y un render con
 * dobles probaría los dobles, no el cableado. Lo que se vigila es que la
 * condición `onlyCover` siga delante de cada uno.
 */
import { describe, it, expect } from 'vitest';

const PAPER = '../components/layout/PaperCanvas.tsx?raw';

/** El código sin comentarios, para que un texto que *explica* el hook no lo active. */
const sinComentarios = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('onlyCover apaga la maquinaria de fondo', () => {
  it('no mide el DOM y no dispara repaginado COM ni export PDF', async () => {
    const fuente = await import(/* @vite-ignore */ PAPER);
    const codigo = sinComentarios(fuente.default);

    // El efecto de medición sale sin tocar el árbol.
    expect(codigo).toMatch(/if \(!doc \|\| onlyCover\) return;/);
    // El repaginado COM y la capa PDF se piden con `null`, que los dos hooks
    // tratan como "no hay nada que hacer".
    expect(codigo).toContain('useLayoutRepaginate(onlyCover ? null : doc)');
    expect(codigo).toContain('usePdfRestLayer(onlyCover ? null :');
  });
});
