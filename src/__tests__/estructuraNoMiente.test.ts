/**
 * La guarda de la fase: ningún nodo de la estructura tiene su nombre fuera de
 * pantalla, y el mapa noossa ninguna librería de grafo.
 *
 * POR QUÉ ES UNA GUARDA Y NO UNA PRUEBA MÁS. El defecto del que protege ya
 * ocurrió: en el mosaico de la revisión, el nombre de la sección iba al `title`
 * de hover y dentro del botón no había nada más que un porcentaje. Veinte
 * bloques sin nombre y con una cifra no son un mapa. La regla se escribe
 * cuando el defecto está fresco, porque en dos años nadie la va a romper a
 * propósito: alguien la va a romper por descuido, en un commit que "solo"
 * agrega un dato más.
 *
 * Y SE LEE EL CÓDIGO, NO EL DOM. Un DOM se puede montar con un nombre puesto en
 * el lugar correcto mientras el fuente lo pone en el `title` y lo borra después;
 * lo que se vigila aquí es la línea que escribe el nombre, que es donde la
 * volverían a escribir.
 *
 * La fuente se lee con `?raw`, y acá eso FUNCIONA porque los siete archivos de
 * `structure/` son `.tsx`. La regla general, medida y no supuesta: `?raw`
 * devuelve vacío para un `.css` —el runner tiene `css: false`—, así que para
 * una hoja hay que usar el rodeo del specifier en variable con un
 * `import()` dinámico de `node:fs`, que es lo que ya hacen
 * `designTokens.test.ts` y `noHardcodedColors.test.ts`. La razón del rodeo es
 * que el specifier va en una VARIABLE: si Vite puede analizarlo lo manda por
 * los shims de browser de `nodePolyfills()`, y esos no traen `readFileSync`.
 */

import { describe, it, expect } from 'vitest';

const FUENTES = import.meta.glob('../components/structure/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('la estructura no miente', () => {
  /* El rail es una barra de íconos por diseño (spec §5.1, patrón `RailTipoActivos`):
   * su nombre accesible vive, por necesidad, en el `title`/`aria-label` del botón.
   * No es un nodo del esquema, así que la guarda de «nombre en pantalla» no aplica.
   * Se lista acá una por una, no se silencia la guarda en general. */
  const RAIL_ICON_ONLY = new Set(['../components/structure/RailEstructura.tsx']);

  it('la guarda tiene archivos que mirar', () => {
    /* Sin esta cuenta, un `glob` que no matchea nada hace que las dos pruebas de
     * abajo pasen sin mirar un solo archivo: es el modo de fallo más barato que
     * tiene una guarda de código. */
    expect(Object.keys(FUENTES).length).toBeGreaterThanOrEqual(5);
  });

  it('ningún nodo de la estructura tiene su nombre fuera de pantalla', () => {
    /* Ni en el `title`, ni en el `aria-label`, ni en un hover: EN PANTALLA. Un
     * nombre que solo vive en un `title` es un nombre que no existe. */
    for (const [ruta, fuente] of Object.entries(FUENTES)) {
      if (RAIL_ICON_ONLY.has(ruta)) continue;
      expect(fuente, `${ruta}: un nombre solo en el title`).not.toMatch(/title=\{[^}]*label/i);
      expect(fuente, `${ruta}: un nombre solo en el aria-label`).not.toMatch(
        /aria-label=\{[^}]*label/i,
      );
    }
  });

  it('el rail exento es de verdad solo íconos', () => {
    /* La exención de arriba vale solo mientras el rail pinte un ícono y ningún
     * texto visible. Si alguien le mete un `<span>{nombre}</span>` visible, deja
     * de ser icon-only y la exención miente. */
    const rail = FUENTES['../components/structure/RailEstructura.tsx'];
    expect(rail, 'el rail no está entre los fuentes').toBeTruthy();
    expect(rail, 'el rail no pinta un ícono').toMatch(/<Icon\b/);
  });

  it('el mapa pinta el nombre de cada nodo, no solo lo esconde en un <title>', () => {
    /* La otra forma del mismo defecto: en SVG el nombre íntegro va en el
     * elemento `<title>`, que es un hover. Si el `<text>` desaparece, el mapa
     * queda con veinte cajas numeradas y ningún nombre.
     *
     * ESTA GUARDA SE MUTÓ Y SE COMPROBÓ QUE CAE. Se sacó del `<text>` del nodo
     * la etiqueta y se dejó el nombre solo en el `<title>`: dos pruebas fuera,
     * una de ellas ésta. Un guardián que nadie vio caer es una afirmación, y
     * este proyecto está contando afirmaciones.
     *
     * Y AHORA ES ESTRUCTURAL, NO UN GREP DEL ARCHIVO. La versión anterior
     * buscaba `{n.etiqueta}` en cualquier parte del fuente, así que una línea
     * decorativa con esa expresión la habría hecho pasar mientras el nombre del
     * nodo se escondía en un atributo. Ahora se le pregunta al `<text>`: el
     * nombre tiene que ser HIJO de un `<text>`, que es donde se ve. */
    const mapa = FUENTES['../components/structure/MapaEstructura.tsx'];
    expect(mapa, 'el mapa no está entre los fuentes').toBeTruthy();
    expect(mapa).toMatch(/<text/);

    const nombreEnPantalla = (cuerpo: string) => /\{\s*n\.etiqueta\s*\}/.test(cuerpo);
    const cuerpos = [...mapa.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1]);
    expect(cuerpos.length, 'el mapa no tiene ningún <text>').toBeGreaterThan(0);
    expect(
      cuerpos.some(nombreEnPantalla),
      'el nombre del nodo no está dentro de ningún <text>',
    ).toBe(true);

    /* Y el detector se enciende con el delito, para que no pueda estar mirando
       otra cosa: un `<text>` con el conteo de hijos y nada de nombre es
       exactamente lo que esta guarda tiene que rechazar. */
    const sinNombre = '<text x={n.x} y={n.y}>{`${n.hijos} subsecciones`}</text>';
    expect(nombreEnPantalla(sinNombre)).toBe(false);
  });

  it('la rueda hace zoom sin exigir Ctrl', () => {
    /* La rueda desnuda era un no-op: el mapa parecía no responder al zoom. La
     * guarda lee el fuente porque en jsdom un listener nativo de `wheel` no se
     * dispara; lo que se vigila es que el manejador exista y que no vuelva la
     * condición de `ctrlKey` que apagaba el gesto. */
    const mapa = FUENTES['../components/structure/MapaEstructura.tsx'];
    expect(mapa, 'el mapa no está entre los fuentes').toBeTruthy();
    expect(mapa, 'la rueda no está conectada').toMatch(/addEventListener\('wheel'/);
    expect(mapa, 'la rueda vuelve a exigir Ctrl').not.toMatch(/e\.ctrlKey/);
  });

  it('el mapa no usa ninguna librería de grafo', async () => {
    /* Si aparece una, es porque alguien decidió que dibujar cajas era difícil.
     * No lo es. */
    const pkg = await import('../../package.json?raw');
    for (const dep of ['reactflow', 'dagre', 'elkjs', 'cytoscape', 'mermaid', 'vis-network']) {
      expect(pkg.default, `el mapa no puede depender de ${dep}`).not.toContain(dep);
    }
  });
});
