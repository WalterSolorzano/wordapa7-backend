/**
 * EL GUARDIÁN DEL MONTAJE DE LA F5.
 *
 * Existe por el mismo motivo que el de F3 y el de F4, y es un criterio de
 * aceptación, no una comodidad. `components/structure/` terminó con siete
 * componentes probados y cero importadores. `components/figures/` hizo lo
 * mismo. Un trabajo terminado y probado que nadie ve es un trabajo TERMINADO
 * en el papel y guardado en la caja: la diferencia entre las dos cosas es
 * exactamente un importador, y ningún test de comportamiento la mide.
 *
 * Todas las pruebas son negativas, y todas se apoyan en el mismo par: el glob
 * lee los fuentes DEL DISCO y la lista de componentes NO está escrita a mano.
 * Una lista escrita a mano es la tautología que hay que evitar: se agrega un
 * componente, no se monta, y la guarda sigue verde porque no lo conocía.
 *
 * Y hay una guarda más, al final, que vigila lo contrario: que el nombre del
 * componente que esta fase BORRÓ no vuelva. Borrar sin guardar es la mitad de
 * la tarea; la otra mitad es que no regrese disfrazado de comentario.
 */

import { describe, it, expect } from 'vitest';

const FUENTES = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** El fuente SIN comentarios. Un regex no sabe qué es un comentario, y un
 *  guardián que se puede desactivar con un `//` no vigila nada. La lección
 *  viene de `figurasEstaMontada.test.tsx:38-42`: la cabecera del paso explica
 *  el defecto NOMBRANDO el código que ya no está, y una guarda que lee los
 *  comentarios acusa al comentario de ser el defecto. */
const SIN_COMENTARIOS = (f: string) => f
  .replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const CARPETA = '/src/components/referencias/';
const NOMBRES = Object.keys(FUENTES)
  .filter((r) => r.startsWith(CARPETA) && r.endsWith('.tsx') && !r.includes('/__tests__/'))
  .map((r) => r.slice(CARPETA.length).replace(/\.tsx$/, ''));

describe('la superficie de referencias está montada', () => {
  /* La primera guarda, y la que más veces se ha escrito mal en este repo: si
     el glob devuelve vacío, `FUENTES[APP] ?? ''` es cadena vacía, una cadena
     vacía no matchea ninguna regla, y TODAS las guardas de este archivo pasan
     sin haber leído una línea. Por eso se comprueba la cantidad Y que la app
     esté entre los leídos. */
  it('el glob lee de verdad, y App.tsx está entre los leídos', () => {
    expect(Object.keys(FUENTES).length).toBeGreaterThan(100);
    expect(FUENTES['/src/App.tsx']).toBeTruthy();
  });

  it('la carpeta tiene los dos componentes que se esperan', () => {
    /* Y esta lista NO esta vacia a proposito: `NOMBRES` sale del disco, y si el
       glob se rompe la lista queda vacia, el `for` de la guarda siguiente no
       corre ni una vez, y la prueba pasa sin comprobar nada. Hay dos guardas
       aqui que son ciertas de pasar con la lista vacia, y por eso existe esta.
       La primera version del archivo no la tenia, y se cazo mutando el glob a
       `{}`: seis pruebas se cayeron y dos de las ocho seguian verdes. Dos
       verdes sobre un glob vacio es un guardian que no vigila nada. */
    expect(NOMBRES).toHaveLength(7);
    expect(NOMBRES.sort()).toEqual([
      'ManuscriptMentionsAccordion',
      'ReferenceCatalogItem',
      'ReferenceEditModal',
      'ReferenceForm',
      'ReferenceRailFilter',
      'ReferenciaLinea',
      'Step5ReferencesWizard'
    ]);
  });

  /* La guarda de verdad. Para cada componente de la carpeta, su nombre tiene
     que aparecer IMPORTADO en un archivo que no es un test. Antes esto era una
     lista escrita a mano, y una lista escrita a mano no falla cuando se agrega
     un componente que nadie monta. */
  it('cada componente de la carpeta tiene un importador real fuera de las pruebas', () => {
    /* Los importadores se leen del disco también, y se excluyen los `__tests__`
       porque un test que importa el componente para renderizarlo no lo monta en
       la aplicación. `App.tsx` SÍ cuenta: es el importador real del paso. La
       primera versión de esta guarda lo excluía también, y por eso la prueba
       decía que `Step5ReferencesWizard` no lo importaba nadie — la guarda
       mentía, y no por culpa del componente. */
    const IMPORTADORES = Object.entries(FUENTES).filter(([ruta]) => !ruta.includes('/__tests__/'));

    /* Un `for` sobre una lista vacía no itera ni una vez y pasa. Con el glob
       roto, `NOMBRES` queda vacío y esta guarda —y la de tokens de abajo— se
       ponían verdes sin comprobar un solo archivo. Se cazó mutando el glob a
       `{}`. Por eso el preámbulo: lista vacía es FALLA, no aprobado. */
    expect(NOMBRES.length, 'la lista de componentes esta vacia: el glob no leio nada').toBeGreaterThan(0);

    for (const nombre of NOMBRES) {
      /* La expresión exige un `import` del nombre. Un `<Nombre />` en el JSX
         sin import no compila, así que el nombre suelto no alcanza: tiene que
         estar en una sentencia de import, con su `from`. Por eso el patrón
         busca la línea de import y no la palabra: una mención en un comentario
         no cuenta, y para eso está `SIN_COMENTARIOS`. */
      const REGEX = new RegExp(`import[^;]*\\b${nombre}\\b[^;]*from`, 's');
      const quien = IMPORTADORES.filter(([, fuente]) => REGEX.test(SIN_COMENTARIOS(fuente)));
      expect(
        quien.map(([r]) => r),
        `${nombre} no lo importa nadie fuera de las pruebas: esta terminado y guardado`,
      ).not.toHaveLength(0);
    }
  });

  it('App.tsx monta el paso 4 con la ruta nueva, en las dos ramas que lo montan', () => {
    /* Montar el componente a mano en un test no prueba que exista en la app. Y
       son DOS ramas porque la de `split` y la de `edit` son dos caminos
       distintos al mismo paso. */
    const app = FUENTES['/src/App.tsx'];
    const montajes = app.match(/wizardStep === 4 && <Step5ReferencesWizard \/>/g) || [];
    expect(montajes).toHaveLength(2);
    expect(app).toMatch(/from '\.\/components\/referencias\/Step5ReferencesWizard'/);
  });
});

describe('la verdad de la referencia no se re-deriva en la vista', () => {
  it('el paso lee diagnosticoDeReferencia y no vuelve a la heurística', () => {
    const paso = SIN_COMENTARIOS(FUENTES[`${CARPETA}Step5ReferencesWizard.tsx`]);
    expect(paso).toMatch(/diagnosticoDeReferencia/);
    /* Y no queda ninguna de las dos heurísticas viejas en pie. */
    expect(paso).not.toMatch(/isZombie/);
    expect(paso).not.toMatch(/isOrphan/);
    /* `s.includes(authors?.[0] || '---')` es la línea que con autores vacíos
       comparaba contra la cadena `'---'`. Que la cadena no aparezca ya es una
       prueba de que la comparación por texto se fue. */
    expect(paso).not.toMatch(/'---'/);
  });

  it('los componentes de la carpeta usan tokens canónicos, sin alias legacy', () => {
    /* Extiende el guardián de deuda al resto de la carpeta. `ReferenceForm` es
       el otro que se queda sin pagar si nadie lo mide, y es el que nadie vuelve
       a tocar. */
    const ALIAS = ['--accent-primary', '--text-main', '--text-secondary',
      '--text-muted', '--surface-elevated', '--sidebar-bg', '--surface-subtle'];
    /* La misma trampa que la guarda de importadores: lista vacía, `for` que no
       corre, aprobado sin haber leído nada. */
    expect(NOMBRES.length, 'la lista de componentes esta vacia: el glob no leio nada').toBeGreaterThan(0);
    for (const nombre of NOMBRES) {
      const fuente = SIN_COMENTARIOS(FUENTES[`${CARPETA}${nombre}.tsx`] ?? '');
      for (const alias of ALIAS) {
        expect(fuente.includes(alias), `${nombre} usa el alias legacy ${alias}`).toBe(false);
      }
    }
  });
});

describe('el paso 4 no tiene panel derecho, y el panel muerto no vuelve', () => {
  /* Esta era la sexta guarda de la primera versión, y decía una cosa incómoda:
     que había un componente de 395 líneas con dos archivos de prueba que
     `RightSidePanel` montaba en una rama a la que no se podía llegar, y que eso
     era una decisión de producto que la fase no tomaba. La fase la tomó, y lo
     que sigue es lo que queda después de tomarla.

     La decisión: el panel se BORRÓ. El paso 4 tiene las cuatro acciones por
     otro camino —resolver DOI, agregar a mano, resolver una cita sin fuente y
     correr la auditoría— y la única que le faltaba, el pegado de un bloque de
     DOI, entró por el modal que el paso ya tenía. Montarlo, en cambio, agregaba
     una tercera columna con una SEGUNDA lista de las mismas referencias, más
     pobre que la del paso: es el defecto que F4 encontró cuando el plan de
     figuras terminó siendo tres columnas. */

  it('el panel derecho NO se monta en el paso 4, y no es un descuido', () => {
    /* La primera mitad de la afirmación. `App.tsx:713` excluye el panel
       derecho de los pasos 4, 5 y 6, y la exclusión es la DECISIÓN: el paso 4
       ya es un taller de dos columnas, y `figurasEstaMontada.test.tsx:143`
       exige esta misma línea porque su tercera columna es la que ya existía. */
    const app = SIN_COMENTARIOS(FUENTES['/src/App.tsx']);
    expect(app, 'App.tsx no esta entre los fuentes leidos').toBeTruthy();
    expect(app).toMatch(
      /wizardStep !== 4 && wizardStep !== 5 && wizardStep !== 6 && !focusMode && <RightSidePanel \/>/,
    );
  });

  it('RightSidePanel no tiene rama de paso 4: la que había no se podía ejecutar', () => {
    /* La segunda mitad. La rama de paso 4 vivía en un componente que la app no
       monta en el paso 4: inalcanzable por construcción, y por eso el panel no
       se le mostraba a nadie. Se midió durante una fase y hoy se mide lo
       contrario. */
    const panel = SIN_COMENTARIOS(FUENTES['/src/components/activity/RightSidePanel.tsx']);
    expect(panel, 'RightSidePanel no esta entre los fuentes leidos').toBeTruthy();
    expect(panel, 'volvio una rama de paso 4 en un panel que no se monta en el paso 4')
      .not.toMatch(/wizardStep === 4/);
  });

  it('el nombre del panel borrado no reaparece: ni archivo, ni import, ni JSX', () => {
    /* La guarda que falta si sólo se borra el archivo. Un `import` comentado
       CUENTA como importador si no se limpian los comentarios primero, y un
       `<Nombre />` en un test cuenta como montaje a medias. Las dos formas de
       guardar el componente sin montarlo se cazan con la misma herramienta: se
       lee TODO lo del disco, pruebas incluidas.

       El nombre se arma con dos trozos a propósito. Esta prueba está en el disco
       como cualquier otro archivo, y si escribiera el nombre entero, la guarda
       se acusaría a sí misma de mantener vivo al componente. */
    const PROHIBIDO = ['Reference', 'sPanel'].join('');
    const rutas = Object.keys(FUENTES);
    expect(rutas.length, 'el glob no leyó nada: esta guarda pasaría en falso').toBeGreaterThan(100);

    /* Ni el archivo. La carpeta se lee del disco, no de una lista escrita a
       mano: una lista escrita a mano no falla cuando el archivo reaparece. */
    expect(
      rutas.filter((r) => r.includes(PROHIBIDO)),
      'volvio un archivo con el nombre del panel borrado',
    ).toEqual([]);

    /* Y el nombre, en ninguna parte del código. Un comentario no cuenta, y por
       eso se leen las fuentes SIN comentarios. */
    expect(
      rutas.filter((r) => SIN_COMENTARIOS(FUENTES[r]).includes(PROHIBIDO)),
      'alguien volvio a nombrar el panel borrado',
    ).toEqual([]);
  });

  it('el bloque de DOI quedó en la pantalla montada, no se perdió con el panel', () => {
    /* Lo que se perdió al borrar el panel no se perdió: el pegado masivo entró
       por el modal que el paso ya tenía. Esta prueba es la que impide que la
       próxima limpieza borre la capacidad y deje el endpoint de lote sin
       pantalla, que es el mismo defecto con otro disfraz. */
    const paso = SIN_COMENTARIOS(FUENTES[`${CARPETA}Step5ReferencesWizard.tsx`]);
    expect(paso).toMatch(/resolveDoisBlock/);
    expect(paso, 'el campo de DOI volvio a ser de una sola linea').toMatch(/<textarea/);
  });
});
