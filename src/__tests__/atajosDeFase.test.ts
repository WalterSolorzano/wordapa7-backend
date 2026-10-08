/**
 * WordAPA7 — los atajos tienen UNA sola verdad.
 *
 * El problema que este archivo viene a cerrar: la paleta DECLARABA atajos y
 * `App.tsx` los EJECUTABA, y las dos listas no coincidían.
 *
 *  - La paleta ponía `Ctrl+2` en dos comandos ('Ir a Estructura' e 'Ir a
 *    Cuerpo y Formato') que hacían lo mismo.
 *  - La paleta ponía `Ctrl+5` en 'Ir a Exportar (paso final)', y `setWizardStep(5)`
 *    es Revisión & IA. La fase 6 es Exportar. El nombre mentía y el atajo
 *    llevaba a otra pantalla.
 *  - La paleta ponía `Ctrl+6` en 'Abrir túnel de exportación' Y en 'Ir a
 *    Exportar', dos comandos a la misma pantalla.
 *  - `Ctrl+S` y `Ctrl+Shift+S` estaban anotados en la paleta y el handler real
 *    los tenía, pero el `Ctrl+S` de la app se ignoraba a propósito cuando el
 *    túnel estaba abierto, así que "descargar" no siempre descargaba.
 *
 * Por eso el test NO mira los números escritos: mira que la paleta DERIVE el
 * atajo de `atajoDeFase(paso)` y que la acción vaya a ese `paso`. Si mañana
 * alguien agrega un comando con un atajo escrito a mano, la primera cuenta lo
 * ve en el acto.
 *
 * El segundo bloque es contra `App.tsx`: el handler tiene que listar
 * `case '1'`..`case '5'` en un mismo `switch` y un `case '6'` que vaya al
 * túnel. Ese `switch` es la verdad —es lo que se ejecuta con la paleta cerrada
 * también— y la paleta es su sombra.
 */
import { describe, it, expect } from 'vitest';
import { FASES, atajoDeFase, faseDeAtajo, etiquetaDeFase } from '../lib/atajosDeFase';

/* El fuente se lee con `?raw` y no con `node:fs`: el shim de `nodePolyfills()`
   de vite resuelve `readFileSync` a un stub de browser y llamarlo desde un test
   es un `TypeError` en tiempo de import. */
import paletaSrc from '../components/CommandPalette.tsx?raw';
import appSrc from '../App.tsx?raw';

/** Los comandos `goto-<algo>` de la paleta, con su atajo y su acción, tal como
 *  están escritos. Es un `slice` de fuente a propósito: la lista de comandos vive
 *  adentro de un `useMemo` y no sale del componente, y moverla a un módulo solo
 *  para poder probarla sería refactorizar la Fase 2. */
function comandosDeFase(): Array<{ id: string; atajo: string; cuerpo: string }> {
  const out: Array<{ id: string; atajo: string; cuerpo: string }> = [];
  const re = /\{ id: '(goto-[a-z]+)'[^\n]*?shortcut: ([^,]+),(.*?)\},/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(paletaSrc)) !== null) {
    out.push({ id: m[1], atajo: m[2].trim(), cuerpo: m[3] });
  }
  return out;
}

describe('los atajos de la paleta y los del handler son la misma verdad', () => {
  it('la regla es una sola: el número del atajo es el número de la fase', () => {
    for (const f of FASES) {
      expect(atajoDeFase(f.paso)).toBe(`Ctrl+${f.paso}`);
      expect(f.atajo).toBe(atajoDeFase(f.paso));
    }
    expect(FASES.map((f) => f.paso)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('la inversa del handler no inventa fases', () => {
    expect(faseDeAtajo('1')).toBe(1);
    expect(faseDeAtajo('6')).toBe(6);
    // `0` y `7` no son fases: devolver "la fase 1" para un atajo inexistente
    // manda a otro lado, que es peor que no hacer nada.
    expect(faseDeAtajo('0')).toBeNull();
    expect(faseDeAtajo('7')).toBeNull();
    expect(faseDeAtajo('a')).toBeNull();
    expect(etiquetaDeFase(6)).toBe('Exportar');
  });

  it('hay un comando por fase, y CADA atajo de la paleta es el de SU fase', () => {
    const cmds = comandosDeFase();
    // Seis fases, seis comandos. El que falta se ve acá; el que sobra, también.
    expect(cmds.length).toBe(FASES.length);

    for (const f of FASES) {
      const c = cmds.find((x) => x.atajo === `atajoDeFase(${f.paso})`);
      expect(c, `ningún comando declara atajoDeFase(${f.paso})`).toBeTruthy();
    }
  });

  it('ningún atajo de la paleta está escrito a mano, y ninguno se repite', () => {
    const cmds = comandosDeFase();
    const atajos = cmds.map((c) => c.atajo);
    // Escritos a mano es lo que diverge: 'Ctrl+2' en dos comandos no lo detecta
    // nadie hasta que alguien los aprieta.
    for (const a of atajos) expect(a).toMatch(/^atajoDeFase\(\d\)$/);
    expect(new Set(atajos).size).toBe(atajos.length);
  });

  it('cada comando lleva a la fase que anuncia, y Exportar al túnel', () => {
    const cmds = comandosDeFase();
    for (const f of FASES) {
      const c = cmds.find((x) => x.atajo === `atajoDeFase(${f.paso})`)!;
      if (f.paso === 6) {
        // La 6 no va con setWizardStep: el túnel además cierra el modal de
        // descarga. Lo que no puede es abrir otra pantalla.
        expect(c.cuerpo).toContain('openExportTunnel()');
      } else {
        expect(c.cuerpo, c.id).toContain(`setWizardStep(${f.paso})`);
        // Y el nombre no puede decir una fase que no es la que lleva. La
        // expresión va con `new RegExp` porque un literal `/.../` NO interpola
        // `${f.paso}`: se buscaría la cadena de tres signos.
        const otraFase = new RegExp(`setWizardStep\\((?!${f.paso}\\))`);
        expect(c.cuerpo, c.id).not.toMatch(otraFase);
      }
    }
  });

  it('la paleta no dice "Exportar" en un comando que no va a Exportar', () => {
    // El bug concreto: 'Ir a Exportar (paso final)' con `setWizardStep(5)`.
    const cmds = comandosDeFase();
    for (const c of cmds) {
      if (!/Exportar/.test(c.cuerpo)) continue;
      const fase = c.atajo.match(/\d/)?.[0];
      expect(etiquetaDeFase(Number(fase))).toBe('Exportar');
    }
  });

  it('el handler real de App lista las mismas seis fases, y la 6 al túnel', () => {
    // Este es el bloque que hace que el test valga: mira el handler, no una
    // constante del test.
    expect(appSrc).toMatch(/case '1': case '2': case '3': case '4': case '5':/);
    expect(appSrc).toMatch(/case '6':[\s\S]{0,1200}openExportTunnel\(\)/);
    // Y que la fase 6 no aparezca dos veces con distinto destino.
    const seis = appSrc.match(/case '6':/g) || [];
    expect(seis.length).toBe(1);
  });

  it('no quedaron comandos de la paleta que apunten a un flag muerto', () => {
    // `auditorMode` y `stressTestModalOpen` quedaron sin lector con la Fase 7.
    // Si un comando vuelve a escribirlos, alguien tiene que volver a dibujar el
    // componente, y este archivo lo dice en el momento en que se escribe.
    expect(paletaSrc).not.toMatch(/setAuditorMode|setStressTestModalOpen/);
    expect(appSrc).not.toMatch(/setAuditorMode|setStressTestModalOpen/);
  });
});
