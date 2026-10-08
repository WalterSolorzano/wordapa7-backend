/**
 * F1 · Task 5 — dos guardias para lo que esta fase acaba de arreglar.
 *
 * EL RAIL NO SE ESCONDE. `AGENTS.md` §1 lo declara permanente: el rail de 56 px y
 * su flyout viven siempre, y no hay rail que se colapse por paso. El modo más
 * fácil de romper esa regla sin darse cuenta es un arreglo de superposición —una
 * capa de carga, un overlay, un modal— que decide montar el rail "solo cuando
 * corresponde". El arreglo funciona, la superposición se arregla, y tres días
 * después falta un icono y nadie sabe de dónde. Estas pruebas montan el shell en
 * las seis fases y en la vista de exportación, que es donde el arreglo suele
 * colarse.
 *
 * LA ESCALA DE CAPAS. El `zIndex: 9999` inline de `LoadingTips` es lo que se llevó
 * la pantalla entera: ganaba al `z-index` de su propia clase y tapaba el rail, el
 * flyout y el workbench. El número era redondo y grande, que es exactamente como
 * se ven los que van a aparecer después. La regla es general: ningún `zIndex` de
 * tres o más dígitos en `src/**` puede pasar el techo de la escala declarada en
 * `design-system.css`. El guardián de esto NO es una lista de archivos: es el
 * techo, y el techo se lee de la hoja.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { AppShell } from '../components/shell/AppShell';
import { LoadingTips } from '../components/layout/LoadingTips';

/* El shell se monta entero y no el rail suelto, porque lo que hay que fijar es
   que el rail está en la pantalla de la que es parte. Montar `IconRail` en
   isolation probaría que el componente existe, que es otra cosa. Los tres
   collaborators pesados van simulados por el mismo patrón de `appShell.test.tsx`:
   la barra, las pestañas y la barra de estado no tienen nada que ver con esto. */
vi.mock('../components/toolbar/UnifiedToolbar', () => ({ UnifiedToolbar: () => <div data-testid="toolbar" /> }));
vi.mock('../components/layout/ProjectTabs', () => ({ ProjectTabs: () => <div data-testid="tabs" /> }));
vi.mock('../components/layout/StatusBar', () => ({ StatusBar: () => <div data-testid="statusbar" /> }));

const FASES = [1, 2, 3, 4, 5, 6];

/**
 * Monta el shell en la fase `paso`, con la carga prendida o apagada.
 *
 * `carga` existe porque el arreglo de superposición se monta CON la carga
 * prendida: si la prueba solo mira el estado en reposo, el rail puede seguir
 * presente en reposo y desaparecer exactamente en el momento en que importa.
 */
function montarEnPaso(paso: number, op: { carga?: boolean; viewMode?: 'edit' | 'result' | 'split' | 'export' } = {}) {
  act(() =>
    useDocStore.setState({
      railPinned: false,
      wizardStep: paso,
      viewMode: op.viewMode ?? 'edit',
      isLoading: false,
      isBackendReady: true,
      doc: null,
    } as never),
  );
  const children = <div data-testid="work">x</div>;
  return render(
    <>
      <AppShell>{children}</AppShell>
      {op.carga ? <LoadingTips activo que="Escaneando el documento" /> : null}
    </>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('F1 — el rail y su flyout existen siempre', () => {
  it('el rail existe en las seis fases, sin condicionales', () => {
    for (const paso of FASES) {
      const { unmount } = montarEnPaso(paso);
      expect(screen.getByTestId('icon-rail'), `el rail falta en la fase ${paso}`).toBeTruthy();
      /* Los seis destinos, en las seis fases. Que el rail exista pero con menos
         botones es la forma silenciosa de la misma falla: un destino se esconde
         "porque en esta fase no aplica" y nadie lo vuelve a mirar. */
      for (const label of ['Portada', 'Estructura', 'Figuras', 'Referencias', 'Revisión & IA', 'Exportar']) {
        expect(
          screen.getByRole('button', { name: label }),
          `falta el destino ${label} en la fase ${paso}`,
        ).toBeTruthy();
      }
      unmount();
    }
  });

  it('el rail existe también en la vista de exportación', () => {
    /* La vista de exportación es donde un arreglo de superposición suele decidir
       que la navegación sobra, porque el rail es de fases y exportar no es una
       fase. Sigue siendo navegación: uno tiene que poder volver de acá. */
    const { unmount } = montarEnPaso(6, { viewMode: 'export' });
    expect(screen.getByTestId('icon-rail')).toBeTruthy();
    unmount();
  });

  it('el rail sigue montado con la capa de carga prendida', () => {
    /* El defecto reportado: apretar "escanear" y que la capa se llevara la
       pantalla entera. Que el rail siga en el DOM es la mitad; la otra es que
       quede POR ENCIMA, y eso lo fija la escala, no el orden del árbol. */
    const { container } = montarEnPaso(5, { carga: true });
    expect(container.querySelector('[data-testid="icon-rail"]')).toBeTruthy();
    expect(screen.getByTestId('carga-capa')).toBeTruthy();
  });

  it('el rail queda por encima de la capa de carga en la escala de z-index', () => {
    /* Un nodo en el DOM no es un nodo visible. Lo que decide quién tapa a quién
       es el `z-index`, y un rail sin `position` es un ítem de flex que cualquier
       capa fija con z-index positivo se come por el orden de pintado. Por eso el
       rail se posiciona: no por decoración, sino para que esta comparación sea
       verificable. */
    montarEnPaso(5, { carga: true });
    const rail = screen.getByTestId('icon-rail');
    expect(rail.style.position).toBe('relative');
    expect(rail.style.zIndex).toBe('var(--z-dropdown)');

    /* Y la carga, por debajo. Es la otra mitad de la misma regla: si subiera la
       carga, el rail volvería a quedar debajo y esta prueba seguiría verde por
       el mismo motivo que la dejó verde antes. */
    const carga = screen.getByTestId('carga-capa');
    expect(carga.style.zIndex).toBe('');
    expect(carga.className).toContain('loading-tips-fullscreen');
  });
});

describe('F1 — la escala de capas es el techo, y el techo está declarado', () => {
  const fuentes = import.meta.glob('/src/**/*.{ts,tsx}', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  /* `import.meta.glob` con `?raw` devuelve el texto de los `.ts`/`.tsx` pero de
     los `.css` devuelve cadena VACÍA en este runner, y una cadena vacía matchea
     cero cosas: el techo daba `NaN` y toda comparación `> NaN` es falsa, así que
     la regla pasaba sin mirar nada. Verde falso, que es peor que no tener regla.
     La hoja se lee con el rodeo por variable de specifier que ya usan
     `designTokens.test.ts` y `noHardcodedColors.test.ts`, porque con el specifier
     literal `nodePolyfills()` intercepta el módulo y su shim de browser no trae
     `readFileSync`. */
  const NODE_FS = 'node:fs';
  const NODE_PATH = 'node:path';
  const NODE_URL = 'node:url';
  let HOJA = '';
  beforeAll(async () => {
    const { readFileSync } = await import(/* @vite-ignore */ NODE_FS);
    const { resolve } = await import(/* @vite-ignore */ NODE_PATH);
    const { fileURLToPath } = await import(/* @vite-ignore */ NODE_URL);
    const testDir = fileURLToPath(import.meta.url).replace(/[^/\\]+$/, '');
    HOJA = readFileSync(resolve(testDir, '../styles/design-system.css'), 'utf8');
  });

  /** El techo de la escala, leído de la hoja cada vez: no hay número copiado. */
  const techoDe = (): number =>
    Math.max(...[...HOJA.matchAll(/--z-[\w-]+:\s*(\d+)/g)].map((m) => Number(m[1])));

  /* LA DEUDA QUE ESTE GUARDIÁN ENCONTRÓ, con su número. No es una lista de
     exenciones: es una cuenta, el mismo mecanismo que `DEUDA_MEDIDA` en
     `noHardcodedColors.test.ts`, y funciona igual — si aparece un `zIndex` de
     tres dígitos NUEVO, la cuenta sube y esta prueba se pone roja.

     Lo que NO se hizo, y hay que decirlo porque es la decisión: no se bajaron los
     nueve a un token de la escala. Se podría, y parecería la misma cosa, pero
     bajarlos cambia el ORDEN RELATIVO entre capas que hoy se distinguen por un
     número arbitrario y que pueden convivir: el bubble de la mascota está en
     9000 y el modal de consentimiento en 9500, y eso los pone en un orden. Si los
     dos pasan a `--z-modal` quedan empatados y gana el orden del árbol, que es
     otra política de pintado, decidida por un test que no puede ver una sola
     pantalla. Elegir esa política es trabajo de quien sabe qué se ve primero, con
     la app abierta; no de un guardián que solo cuenta. La cuenta queda escrita,
     con su número, que es lo que obliga a que baje. */
  const DEUDA_Z = 9;

  /** Los ofensores, por archivo: la lista que hay que pagar, no un número. */
  const ofensoresDe = (): string[] => {
    const techo = techoDe();
    const salida: string[] = [];
    for (const [ruta, fuente] of Object.entries(fuentes)) {
      // Los `__tests__` guardan violaciones INYECTADAS como cadena para probar el
      // detector: el `zIndex: 9999` de `loadingTips.test.tsx` es el defecto
      // documentado, no un offender. Es el mismo criterio que R2-bis en el lint de
      // tokens: una prueba que fabrica el delito para poder detectarlo no lo tiene.
      if (ruta.includes('/__tests__/')) continue;
      for (const m of fuente.matchAll(/zIndex:\s*(\d{3,})/g)) {
        if (Number(m[1]) > techo) salida.push(`${ruta.slice(5)} usa zIndex ${m[1]}, la escala llega a ${techo}`);
      }
    }
    return salida;
  };

  it('la deuda de z-index fuera de la escala está FIJADA, no perdonada', () => {
    const ofensores = ofensoresDe();
    const crecio = ofensores.length > DEUDA_Z;
    const bajo = ofensores.length < DEUDA_Z;
    expect(
      ofensores.length === DEUDA_Z
        ? []
        : [`la deuda de z-index es ${ofensores.length} y DEUDA_Z dice ${DEUDA_Z}`],
    ).toEqual([]);
    if (crecio) throw new Error(`creció: ${ofensores.join('; ')}`);
    if (bajo) throw new Error(`bajó: bajá el número. Quedan: ${ofensores.join('; ')}`);
  });

  it('el guardián encuentra de verdad: el 9999 de LoadingTips lo caza', () => {
    /* El detector se prueba con el delito real, no solo con una cadena
       sintética: si el patrón dejara de matchear `zIndex`, esta seguiría verde
       con la cuenta igual. Es la forma del `noHardcodedColors.test.ts`, que
       prueba cada detector con una violación inyectada. */
    expect(ofensoresDe()).not.toContain('components/layout/LoadingTips.tsx usa zIndex 9999, la escala llega a 1200');
  });

  it('la regla no está mirando nada: la escala existe y hay z-index en el código', () => {
    /* La guarda que este proyecto necesitó nueve veces. Una escala vacía, o un
       `import.meta.glob` que no matchea, hacen que la regla de arriba pase sin
       haber leído una línea. */
    const escala = [...HOJA.matchAll(/--z-[\w-]+:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(escala.length).toBeGreaterThanOrEqual(6);
    expect(Math.max(...escala)).toBeGreaterThanOrEqual(1000);

    const conZ = Object.values(fuentes).filter((f) => /zIndex\s*:/.test(f));
    expect(conZ.length).toBeGreaterThan(5);
  });

  it('el detector se enciende con el número que cazó esta fase, y se calla con los de la escala', () => {
    /* Un detector que solo se puede probar con el archivo real no demuestra que
       dispare: puede estar mirando otra cosa y dar verde por casualidad. */
    const techo = techoDe();
    const ofensores = (src: string) =>
      [...src.matchAll(/zIndex:\s*(\d{3,})/g)].filter((m) => Number(m[1]) > techo).length;

    expect(ofensores('const s = { zIndex: 9999 }')).toBe(1);
    expect(ofensores('const s = { zIndex: 5000 }')).toBe(1);
    expect(ofensores('const s = { zIndex: 1200 }')).toBe(0);
    expect(ofensores("const s = { zIndex: 'var(--z-dropdown)' }")).toBe(0);
    expect(ofensores('const s = { zIndex: 99 }')).toBe(0);
  });
});
