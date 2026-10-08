/**
 * Las figuritas del cielo son un CONJUNTO refinado, no cuatro dibujos.
 *
 * Referencia: el estilo visual de Discord. Ahí las figuritas son lo que hace
 * que la pantalla sea un lugar, y funcionan porque son un juego: una sola
 * paleta, un solo grosor de línea, una silueta que se lee a 26 píxeles. Son
 * simpáticas sin ser configuraciones de juguete.
 *
 * Lo que hay hoy en `HomeHero.tsx` no es un juego. Es cuatro funciones que cada
 * una se inventó su propia paleta y su propio grosor:
 *
 *   - El ovni tiene TRES luces en fila: `#ffee58` amarillo, `#ef5350` rojo,
 *     `#66bb6a` verde. Es un semáforo, y un semáforo sobre una nave es juguete.
 *   - El globo tiene un degradado `#ef5350 → #ffa726 → #ffee58`: rojo, naranja y
 *     amarillo, los tres a plena saturación. Es un globo de feria.
 *   - Hay CINCO grosores de línea distintos en cuatro figuritas —1.2, 2.5, 1,
 *     0.8, 2— y dos marrones para las cuerdas y la cesta del globo, que no son
 *     un color de cielo.
 *   - El satélite usa dos azules que no aparecen en ninguna otra figura.
 *
 * Eso es lo que se lee como "de niño": no las figuritas, sino que no se
 * pertenecen. Cuatro objetos dibujados por cuatro manos distintas. La carita
 * del sol era un caso aparte y ya se fue en la Task 1; estas cuatro se quedan,
 * y lo que se arregla es que sean un juego.
 *
 * Y la prueba de la Task 2 anterior, que exigía que NO existieran, estaba mal:
 * el usuario pidió explícitamente mantener los easter eggs. Estas pruebas
 * tienen una guarda que fija que las cuatro siguen ahí, para que nadie repita
 * ese error.
 */

import { describe, it, expect } from 'vitest';
/* El fuente se lee con `?raw`, no con `node:fs`: el shim de `nodePolyfills()`
   de `vite.config.ts` deja `fs` como un objeto sin `readFileSync`, así que
   leer del disco desde un test es un `TypeError` en tiempo de import. `?raw`
   además devuelve el archivo SIN transformar, que es justo lo que estas
   pruebas necesitan: miran el texto escrito, no el que compila. */
import fuente from '../components/layout/HomeHero.tsx?raw';

/**
 * Los objetos con silueta en el cielo. La estrella fugaz NO entra: es luz, no
 * un objeto, y una luz blanca no compite con la paleta de las figuritas.
 */
const FIGURITAS = [
  'drawUFO',
  'drawPaperAirplane',
  'drawHotAirBalloon',
  'drawLightningCloud',
  'drawSatellite',
];

/** El cuerpo de una función, desde su `function` hasta el `}` de columna 0. */
function cuerpoDe(nombre: string): string {
  const i = fuente.indexOf(`function ${nombre}(`);
  expect(i, `no encontré ${nombre}`).toBeGreaterThan(-1);
  for (let j = i; j < fuente.length; j++) {
    if (fuente[j] === '}' && fuente[j - 1] === '\n') {
      return fuente.slice(i, j);
    }
  }
  throw new Error(`no encontré el cierre de ${nombre}`);
}

describe('las figuritas del cielo', () => {
  it('SIGUEN ahí: son el efecto, no un accidente que borrar', () => {
    /* La Task 2 anterior las borró por interpretación propia y fue un error: el
       usuario pidió mantener los easter eggs. Estas son el alma de la pantalla,
       y lo que se pulía era el estilo, no la presencia. */
    for (const f of FIGURITAS) {
      expect(fuente, `${f} no debería haberse borrado`).toContain(`function ${f}(`);
    }
  });

  it('el cielo conserva su ciclo de día y noche y sus objetos de luz', () => {
    /* La otra mitad del "mantén": el ciclo por hora, la luna, la estrella fugaz
       y el satélite. Nada de eso se toca. */
    for (const pieza of [
      'drawCrescentMoon',
      'drawShootingStar',
      'drawSatellite',
      "getSlot",
    ]) {
      expect(fuente, `se perdió ${pieza}`).toContain(pieza);
    }
  });

  it('la paleta de las figuritas está declarada UNA vez y todas la usan', () => {
    /* Este es el arreglo de fondo, y es estructural: cuatro funciones con
       cuatro paletas no son un juego por mucho que se las pula. Un solo lugar
       del archivo dice cómo se ve una figurita. */
    const declaradas = fuente.match(/const FIGURITA[A-Z_]*\s*=\s*\{/g) ?? [];
    expect(
      declaradas.length,
      'la paleta de las figuritas debería estar declarada una vez',
    ).toBe(1);

    for (const f of FIGURITAS) {
      const cuerpo = cuerpoDe(f);
      const hexes = cuerpo.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      expect(
        hexes,
        `${f} tiene ${hexes.length} colores sueltos (${hexes.join(', ')}): ` +
        'una figurita toma su color de la paleta compartida, no del aire',
      ).toEqual([]);
    }
  });

  it('el grosor de línea está declarado UNA vez y todas lo usan', () => {
    /* Cinco grosores distintos en cuatro figuritas es exactamente lo que hace
       que un conjunto parezca un montón de bocetos. */
    const declarados = fuente.match(/trazo:\s*([\d.]+)/g) ?? [];
    expect(
      declarados.length,
      'el grosor de las figuritas debería estar declarado en la paleta',
    ).toBe(1);

    for (const f of FIGURITAS) {
      const sueltos = cuerpoDe(f).match(/lineWidth\s*=\s*([\d.]+)/g) ?? [];
      expect(
        sueltos,
        `${f} se asigna su propio grosor (${sueltos.join(', ')}) en vez de tomar ` +
        'el compartido',
      ).toEqual([]);
    }

    /* La guarda de vacuidad: que el trazo compartido sea un NÚMERO. Si
       `FIGURITA.trazo` fuera `undefined`, las cinco figuras asignarían
       `lineWidth = undefined`, las pruebas de arriba pasarían —porque ninguna
       asigna un literal— y el dibujo saldría con el grosor por defecto del
       navegador. Eso es exactamente la clase de defecto que no se ve. */
    const valor = Number(declarados[0]!.replace('trazo:', ''));
    expect(Number.isFinite(valor), 'el trazo compartido no es un número').toBe(true);
    expect(valor).toBeGreaterThan(0.5);
    expect(valor).toBeLessThan(2);
  });

  it('no hay semáforos: ninguna figurita lleva primaries a plena saturación', () => {
    /* El ovni con tres luces en amarillo, rojo y verde, y el globo con rojo,
       naranja y amarillo: los tres a plena saturación y los tres en la misma
       figura. Es un juguete con luz propia, y es la lectura más literal de
       "de niño" que había en el archivo. */
    for (const f of FIGURITAS) {
      const colores = cuerpoDe(f).match(/rgba?\(([^)]+)\)|#[0-9a-fA-F]{3,8}\b/g) ?? [];
      for (const c of colores) {
        const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        let r: number, g: number, b: number;
        if (m) {
          [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
        } else {
          const hex = c.slice(1);
          const full = hex.length === 3 ? hex.split('').map((x) => x + x).join('') : hex;
          r = parseInt(full.slice(0, 2), 16);
          g = parseInt(full.slice(2, 4), 16);
          b = parseInt(full.slice(4, 6), 16);
        }
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const l = (max + min) / 2 / 255;
        const s = max === min ? 0 : (l > 0.5 ? (max - min) / (510 - max - min) : (max - min) / (max + min));
        expect(
          s,
          `${f} usa ${c}, saturación ${s.toFixed(2)}: por encima de 0.6 un color ` +
          'pura se lee como juguete en vez de como una figurita refinada',
        ).toBeLessThanOrEqual(0.6);
      }
    }
  });
});
