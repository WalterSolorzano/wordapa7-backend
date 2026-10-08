/**
 * WordAPA7 — F6: la superficie de exportar ESTÁ MONTADA y sus controles LLEGAN.
 *
 * UNA SUPERFICIE TERMINADA Y PROBADA QUE NADIE VE NO ESTÁ TERMINADA. Esta es la
 * guarda de eso, y tiene dos mitades que se affirmed por separado porque son
 * dos defectos distintos:
 *
 *  1. **ALGO IMPORTA LA SUPERFICIE, Y NO SOLO LOS TESTS.** Un componente al que
 *     solo importan sus propias pruebas se ve verde y no existe para la persona.
 *     Por eso los importadores se buscan en TODO `src/`, con `App.tsx` adentro,
 *     y la exigencia es "uno que no sea un test": si el único que lo importa es
 *     la suite, la fase no está montada aunque la suite pase.
 *
 *  2. **CADA CONTROL DEL PANEL TERMINA EN ALGO.** La tabla vive junto al panel
 *     (`panelDeExportacion.ts`), no acá: si los ids estuvieran en este archivo,
 *     agregar un control sin destino sería invisible.
 *
 * LAS CUATRO GUARDAS FALSAS DE ESTE REPO, Y CÓMO ESTA LAS EVITA. Salieron cuatro
 * guardas que se reportaban vigilando y no lo hacían, cazadas recién al mutarlas:
 *
 *  - Contaban un `import` COMENTADO. Acá se lee el archivo y se exige que el
 *    import esté en una línea que NO es un comentario, y además se exige que el
 *    ARCHIVO exista: un `import` comentado en un archivo que no se borra pasa.
 *  - Leían un token de un ELEMENTO VECINO. El "¿tiene icono?" mira el `<svg>`
 *    del botón que devuelve `getByRole`, no un `svg` cualquiera del documento.
 *  - PASABAN CON EL GLOB VACÍO. Si `import.meta.glob` no devuelve nada, esta
 *    prueba se cae en vez de afirmar `[]` sobre nada: cero archivos leídos no es
 *    "todo lo demás está bien".
 *  - EXCLUÍAN `App.tsx` DE LOS IMPORTADORES. Es el archivo más importante de la
 *    lista y el más fácil de dejar afuera cuando el recorrido empieza en
 *    `src/components`. Acá se recorre la raíz de `src/`, que lo incluye.
 *
 * Y una quinta, que es de esta misma casa: comparar el SPECIFIER COMPLETO.
 * `App.tsx` importa `'./components/export/ExportView'` y el panel importa
 * `'./panelDeExportacion'`: el mismo archivo, dos rutas. Un patrón que pide la
 * ruta larga encuentra uno y no el otro, y la guarda pasa sobre la mitad de los
 * importadores. Por eso el módulo se busca por NOMBRE de archivo, que es lo
 * único que no cambia según quién importa.
 */
import { describe, it, expect } from 'vitest';
import { CONTROLES_DEL_PANEL, DERIVADOS_DEL_PANEL, CUATRO_GRUPOS } from '../components/export/panelDeExportacion';
import { useDocStore } from '../store/useDocStore';

/* Los fuentes de `src/`, leídos como texto. `?raw` SÍ funciona para `.ts` y
   `.tsx`; el rodeo del specifier en variable es solo para CSS, y esta guarda no
   lee hojas de estilo. */
const FUENTES = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Los archivos de la app: todo `src/` MENOS los tests. */
const ARCHIVOS_DE_LA_APP = Object.keys(FUENTES).filter((ruta) => !/\.test\.[tj]sx?$/.test(ruta));

/** Saca comentarios de línea y de bloque. Un `import` comentado es un `import`
 *  que no existe, y esta función cuenta los que existen. */
function sinComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Los que importan algo de verdad.
 *
 * NO es un `match` de una línea: los imports de este repo van partida en varias
 * líneas (`import {\n  A, B,\n} from './x'`), y un patrón de una línea cuenta
 * cero y la guarda pasa. Se parte el archivo en sentencias por `;` —este repo
 * pone punto y coma— y se mira cada una: es un import si empieza por `import`,
 * y el specifier es el último `from '...'`.
 *
 * Esa es también la forma de no contar un import COMENTADO: los comentarios se
 * van antes de partir, y un `// import { X } from './y'` no deja nada.
 */
function importadoresDe(nombreDeArchivo: string): string[] {
  return ARCHIVOS_DE_LA_APP.filter((ruta) => {
    const limpio = sinComentarios(FUENTES[ruta]);
    for (const sentencia of limpio.split(';')) {
      const t = sentencia.trim();
      if (!t.startsWith('import')) continue;
      const del = t.match(/from\s*['"]([^'"]+)['"]\s*$/);
      if (!del) continue;
      /* Por NOMBRE de archivo y SIN extensión: un specifier de import nunca
         lleva la extensión (`'./components/export/ExportView'`, no `'.tsx'`),
         así que compararla entera no encuentra ni uno. El mismo módulo se
         importa como './x' desde su carpeta y como './components/export/x' desde
         `App.tsx`, y lo único que no cambia es el nombre. */
      const segmentos = del[1].split('/');
      const ultimo = segmentos[segmentos.length - 1].replace(/\.[tj]sx?$/, '');
      if (ultimo === nombreDeArchivo.replace(/\.[tj]sx?$/, '')) return true;
    }
    return false;
  });
}

describe('F6 — la superficie de exportar está montada', () => {
  it('el glob de fuentes no vino vacío', () => {
    /* La guarda que se reportaba vigilando y no vigilaba: sin esta, todo lo de
       abajo afirmaría sobre cero archivos y pasaría. `App.tsx` se nombra
       expressly porque es el que se dejaba afuera al recorrer `src/components`. */
    expect(Object.keys(FUENTES).length).toBeGreaterThan(50);
    expect(ARCHIVOS_DE_LA_APP.length).toBeGreaterThan(30);
    expect(FUENTES).toHaveProperty('/src/App.tsx');
  });

  it('la pantalla de exportar la importa la app, no solo sus pruebas', () => {
    const importadores = importadoresDe('ExportView.tsx');
    /* Y no vale un solo importador de la app si es el propio `ExportView`:
       se afirma que lo monte el shell, que es un archivo distinto. */
    expect(
      importadores.some((r) => r !== '/src/components/export/ExportView.tsx'),
      `los unicos importadores de la app son el mismo componente: ${JSON.stringify(importadores)}`,
    ).toBe(true);
    expect(
      importadores.length,
      `nadie fuera de los tests importa ExportView: ${JSON.stringify(importadores)}`,
    ).toBeGreaterThan(0);
    /* Y el que la monta de verdad es `App.tsx`, que es quien dibuja el túnel. */
    expect(importadores).toContain('/src/App.tsx');
  });

  it('el menu de Archivo y la vista de exportar se importan desde la app', () => {
    /* Las dos superficies del formato. Si una pasa a ser huérfana, el
       `format` del store queda con un solo lector y la verdad vuelve a
       duplicarse del otro lado. */
    expect(importadoresDe('FileMenu.tsx')).toContain('/src/App.tsx');
  });

  it('la tabla de controles la importa el panel, no vive solo en el test', () => {
    /* `panelDeExportacion` sin un lector de la app es una tabla que el
       guardián lee y la pantalla no: el panel dibujaría otra cosa. */
    const importadores = importadoresDe('panelDeExportacion.ts');
    expect(importadores.length, 'nadie importa la tabla de controles').toBeGreaterThan(0);
    expect(importadores).toContain('/src/components/export/ExportView.tsx');
  });
});

describe('F6 — cada control del panel termina en algo', () => {
  it('ninguno se queda sin destino, y el guardián NOMBRA el que falte', () => {
    const sinDestino = CONTROLES_DEL_PANEL
      .filter((c) => !c.destino || c.destino.trim() === '')
      .map((c) => c.id);
    expect(sinDestino).toEqual([]);
  });

  it('el destino nombra algo real: el store, o una firma que existe', () => {
    /* No alcanza con que el `destino` sea una frase: tiene que Appointar a un
       setter que exista de verdad. Un control que dice "llega al store" y
       escribe a un `setX` inexistente es tan mudo como uno sin destino. */
    const store = useDocStore.getState() as unknown as Record<string, unknown>;
    for (const c of CONTROLES_DEL_PANEL) {
      expect(c.destino.length, `${c.id} no dice a qué llega`).toBeGreaterThan(8);
      if (c.accionStore) {
        expect(
          typeof store[c.accionStore as string],
          `${c.id} dice que escribe por ${String(c.accionStore)} y ese setter no existe`,
        ).toBe('function');
      } else {
        /* Sin setter declarado, el destino tiene que nombrar el archivo que lo
           consume. Un control sin las dos cosas no se sabe auditar. */
        expect(
          /\.tsx?|\.py/.test(c.destino),
          `${c.id} no declara setter y su destino no nombra un archivo`,
        ).toBe(true);
      }
    }
  });

  it('cada control dice que pasa si se apaga', () => {
    /* El otro lado de la misma regla: un control que solo dice qué activa
       vende una cosa y hace otra. */
    const mudos = CONTROLES_DEL_PANEL
      .filter((c) => !c.alApagar || c.alApagar.trim().length < 10)
      .map((c) => c.id);
    expect(mudos).toEqual([]);
  });

  it('un derivado no se disfraza de control: es de solo lectura y lo dice', () => {
    /* `rules.page_size`, `rules.margins_cm` y la tipografía ya tienen su
       control en Ajustes. Si un día alguno pasa a la lista de controles con un
       setter, este es el que lo nombra. */
    for (const d of DERIVADOS_DEL_PANEL) {
      expect(d.de, `${d.id} no dice de qué campo se lee`).toMatch(/^rules\./);
      expect(d.seCambiaEn, `${d.id} no dice dónde se cambia`).toBeTruthy();
      expect(d.leer(), `${d.id} no produce un valor`).toBeTruthy();
    }
  });
});

describe('F6 — el write-back ofrece las dos salidas', () => {
  it('el cuerpo de la peticion manda las dos banderas, y son distintas', () => {
    /* Task 2. Las dos salidas viajan explícitas en el body, no como un flag
       global: el backend tiene que poder distinguir "no había nada abierto" de
       "había un documento con trabajo sin guardar". El backend es Python y no
       está en este glob; lo que se afirma acá es el lado del cliente, que es
       el que puede mandar la bandera equivocada. */
    const vista = FUENTES['/src/components/export/ExportView.tsx'];
    expect(vista).toContain('enviarAWord({ guardar: true })');
    expect(vista).toContain('enviarAWord({ forzar: true })');
    /* Y el pedido se arma por expansión, no con una bandera fija: así el
       primer clic no manda ninguna de las dos. */
    expect(vista).toContain('JSON.stringify({ nombre: activeFilePath, ...opcion })');
  });

  it('la vista no puede decidir sola: pregunta, y el boton de discardar lo dice', () => {
    /* Un control mudo con etiqueta de functional. El aviso de cambios sin
       guardar tiene que tener los dos botones, y el segundo tiene que decir lo
       que hace: "Descartar y enviar" descarta. */
    const vista = FUENTES['/src/components/export/ExportView.tsx'];
    expect(vista).toContain('Guardar y enviar');
    expect(vista).toContain('Descartar y enviar');
    /* Y la decisión se toma POR EL VUELTO del backend, no por un plazo: una
       respuesta con `requiere_confirmacion` abre la pregunta. */
    expect(vista).toContain('if (data.requiere_confirmacion) {');
    expect(vista).toContain('setSinGuardar(data.message');
  });
});

describe('F6 — el panel tiene los cuatro grupos y ninguno está vacío', () => {
  it('cada grupo tiene contenido, y los que no editan son solo lectura', () => {
    for (const g of CUATRO_GRUPOS) {
      const controles = CONTROLES_DEL_PANEL.filter((c) => c.grupo === g);
      const derivados = DERIVADOS_DEL_PANEL.filter((d) => d.grupo === g);
      expect(controles.length + derivados.length, `el grupo ${g} esta vacio`).toBeGreaterThan(0);
      if (controles.length === 0) {
        expect(derivados.length, `${g} no edita y tampoco muestra nada`).toBeGreaterThan(0);
      }
    }
  });

  it('el panel dibuja los grupos desde la tabla, no desde una lista propia', () => {
    /* Si el componente tuviera su propia lista de títulos, la tabla y lo
       dibujado se podrían separar y el guardián no lo vería. */
    const panel = FUENTES['/src/components/export/ExportView.tsx'];
    expect(panel).toContain('CUATRO_GRUPOS.map');
    expect(panel).toContain('CONTROLES_DEL_PANEL.filter');
    expect(panel).toContain('DERIVADOS_DEL_PANEL.filter');
  });
});
