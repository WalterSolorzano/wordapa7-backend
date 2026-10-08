# Inicio cinematográfico — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la pantalla de Inicio deje de leerse como la app de un niño y se lea como una herramienta editorial: cielo con luz, sin personajes de dibujos, contenedor con más aire, y sin los rótulos que se repiten en tres lugares.

**Architecture:** `HomeHero.tsx` es un `canvas` 2D con un ciclo de día y noche. No se reescribe la arquitectura —se conserva el canvas, el ciclo por hora y la frase rotativa, que es lo que funciona—: se rediseñan las primitivas de dibujo y se quita el texto que sobra. Cada primitiva de dibujo es una función pura `(ctx, …)` que se puede probar por separado, así que el rediseño se hace reemplazando primitivas, no reescribiendo el bucle.

**Tech Stack:** React 18, TypeScript, Canvas 2D, lucide-react, tokens CSS de `src/styles/design-system.css`.

**Spec:** la conversación de esta sesión (pedido literal del usuario: *"el sol que no tenga carita sino que sea un sol más animado menos niño más profesional más cinematográfico todo, todos los diseños que hay ahi hazlos más cinematográfico y expande un poco ese contenedor"* + *"quita estas cosas de ahi: Portada, cuerpo y referencias / Corrección sin tocar tu contenido / Citas, DOI y referencias cruzadas / Norma APA 7ma Edición / · Motor editorial local / Perfil: — se repite demasiado"*).

## Global Constraints

- **Cero emojis.** Solo iconos de `lucide-react` (`AGENTS.md` §1).
- **Sin literales de color en el código.** Solo `var(--token)`. En `design-system.css` un hex puede *definir* un token; en ningún otro archivo.
- **`strokeWidth` es el valor de `--icon-stroke`** (1.75). `HomeHero.tsx:107,113,119` hoy usan `strokeWidth={2}`: fuera de norma.
- **Cero SVG a mano.** Los iconos son de `lucide-react`.
- **Nada de bounce ni elastic.** Curvas `cubic-bezier(0.16, 1, 0.3, 1)` (DESIGN.md).
- **Cero hilos sueltos.** Ninguna tarea puede dejar texto a medio write ni caracteres CJK.
- Los archivos de `src/components/layout` **no** están hoy en el alcance de `noHardcodedColors.test.ts`. La Task 7 los mete.

## Review Focus

Cinco entradas que la spec calla y que son las que más muerden:

1. **Ventana angosta (1280px o menos).** El canvas se dimensiona con `parentElement.clientWidth/Height` y `drawStars` reparte con `Math.random() * canvas.width`. Con un resize a una caja de ancho 0 (pestaña oculta, o el contenedor todavía sin layout) el `canvas` queda en 0 y las estrellas se apilan en `(0,0)`: un punto blanco arriba a la izquierda. Ninguna prueba hoy lo cubre.
2. **`prefers-reduced-motion`.** Hoy el bucle corre `requestAnimationFrame` siempre, para siempre, con 80 estrellas parpadeando. Una persona con sensibilidad al movimiento reducido no tiene forma de apagarlo. Hoy no hay ninguna rama que lo atienda.
3. **El mensaje rotativo se corta a dos líneas con `minHeight: 86px`.** Al agrandar el contenedor hay que volver a medir: una frase de tres líneas se recorta en silencio y el usuario cree que la app no se cargó. Hoy ninguna prueba mira el overflow.
4. **Un `.docx` sin H1 no tiene fases** y el mapa de IA cae a un solo bloque. Al entrar a Revisión & IA el usuario ve un cuadrado y cree que el detector falló. (Ya anotado; no lo arregla este plan, pero el rediseño no debe empeorarlo.)
5. **Tema oscuro.** `--ia-nivel-1..4` tienen dos variantes y `--paper-white` no se toca. Un rediseño que bajó los contrastes tiene que seguir legible en oscuro: la prueba de contraste es por tema, no una sola.

---

### Task 1: El sol deja de tener cara

**Files:**
- Modify: `src/components/layout/HomeHero.tsx:238-299` (`drawCartoonSun`)
- Test: `src/__tests__/homeHeroSol.test.tsx`

**Interfaces:**
- Consumes: nada.
- Produce: `drawSolCinematico(ctx, cx, cy, r, rotacion, color, alpha)` — mismo aridad que `drawCartoonSun` para que el llamador de la línea ~700 no cambie de forma.

- [ ] **Step 1: Escribí el test que falla**

Una carita son dos óvalos y un arco. El test las busca por lo que produzcan, no por nombre:

```tsx
// src/__tests__/homeHeroSol.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { HomeHero } from '../components/layout/HomeHero';

/** Un contexto 2D falso que registra todo lo que se le pide dibujar. */
function ctxFalso() {
  const ellipse: unknown[] = [];
  const arc: unknown[] = [];
  return {
    ellipse, arc,
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    beginPath: vi.fn(), closePath: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
    fillRect: vi.fn(), clearRect: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    arc: (...a: unknown[]) => arc.push(a),
    ellipse: (...a: unknown[]) => ellipse.push(a),
    createRadialGradient: () => ({ addColorStop: vi.fn() }),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
    set fillStyle(_: unknown) {}, get fillStyle() { return ''; },
    set strokeStyle(_: unknown) {}, get strokeStyle() { return ''; },
    set lineWidth(_: unknown) {}, get lineWidth() { return 1; },
    set lineCap(_: unknown) {}, get lineCap() { return ''; },
    set globalAlpha(_: unknown) {}, get globalAlpha() { return 1; },
    set globalCompositeOperation(_: unknown) {}, get globalCompositeOperation() { return ''; },
  };
}

describe('el sol de Inicio', () => {
  beforeEach(() => {
    // jsdom no tiene `requestAnimationFrame` que sirva ni canvas real: el
    // componente no debe romperse en un entorno sin ninguno de los dos.
    (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame =
      vi.fn(() => 0);
    (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = vi.fn();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ctxFalso()) as never;
  });

  it('NO tiene cara: ni ojos ni boca', () => {
    /* Un sol con ojos y sonrisa es un personaje de dibujos. Es la razón por la
       que la pantalla se leía como de niño, y no es una cuestión de gusto: es
       un registro. */
    render(<HomeHero />);
    const c = (HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>).mock.results[0].value;
    /* Una cara son dos óvalos pequeños y al menos un arco de smile. El cielo y
       la luna también usan arcos, así que la condición es sobre ÓVALOS: el sol
       no dibuja ninguno. */
    expect(c.ellipse).toEqual([]);
  });

  it('el componente monta sin `requestAnimationFrame` y sin `getContext`', () => {
    /* Un `getContext` que devuelve `null` ( Safari sin aceleración, o un
       navegador en modo restringido) no puede romper la pantalla de Inicio:
       la persona igual tiene que poder empezar a trabajar. */
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
    expect(() => render(<HomeHero />)).not.toThrow();
  });
});
```

- [ ] **Step 2: Corré el test y verificá que falla**

Run: `npx vitest run src/__tests__/homeHeroSol.test.tsx`
Expected: FAIL — `c.ellipse` tiene 2 entradas (los dos ojos) y el `not.toThrow` del segundo pasa, pero el primero falla.

- [ ] **Step 3: Reemplazá `drawCartoonSun` por `drawSolCinematico`**

Reemplazá el bloque `src/components/layout/HomeHero.tsx:238-299` por esto. Borra la carita, y con ella los doce rayos gruesos de punta redonda (el propio comentario del código los llama *"12 chunky spiky rays"*): un sol de cine no tiene púas.

```tsx
function drawSolCinematico(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  rotation: number,
  color: string,
  alpha = 1,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(rotation);

  /* La CORONA, que es lo único que hace que un disco se lea como sol. Tres
     paradas: el disco, un halo cercano tibio y un halo lejano que se apaga.
     Es un degradado radial, no un degradado cónico, porque el color de un sol
     baja hacia el borde en todas las direcciones a la vez. */
  const corona = ctx.createRadialGradient(0, 0, r * 0.9, 0, 0, r * 3.2);
  corona.addColorStop(0, 'rgba(255, 226, 150, 0.30)');
  corona.addColorStop(0.35, 'rgba(255, 208, 110, 0.12)');
  corona.addColorStop(1, 'rgba(255, 200, 90, 0)');
  ctx.beginPath();
  ctx.arc(0, 0, r * 3.2, 0, Math.PI * 2);
  ctx.fillStyle = corona;
  ctx.fill();

  /* El disco. Sin púas: las púas son caricatura, y una fuente de luz real no
     tiene bordes. El degradado interior va de un blanco cálido al color que
     le pase el llamador, que es lo que da volumen a un círculo plano. */
  const disco = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  disco.addColorStop(0, 'rgba(255, 253, 240, 0.95)');
  disco.addColorStop(0.65, color);
  disco.addColorStop(1, color);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = disco;
  ctx.fill();

  ctx.restore();
}
```

Y actualizá el llamador (buscá `drawCartoonSun(` en el bucle de render) a `drawSolCinematico(`.

- [ ] **Step 4: Corré el test y verificá que pasa**

Run: `npx vitest run src/__tests__/homeHeroSol.test.tsx`
Expected: PASS (2).

- [ ] **Step 5: Corré `tsc` y el lint de tokens**

Run: `npx tsc --noEmit && npx vitest run src/__tests__/noHardcodedColors.test.ts`
Expected: sin `error TS`; el lint verde.

- [ ] **Step 6: Commiteá**

```bash
git add src/components/layout/HomeHero.tsx src/__tests__/homeHeroSol.test.tsx
git commit -m "fix(inicio): el sol deja de tener cara y deja de tener púas"
```

---

### Task 2: Fuera los personajes de dibujos

**Files:**
- Modify: `src/components/layout/HomeHero.tsx` — borrar `drawUFO` (344-370), `drawPaperAirplane` (390-413), `drawHotAirBalloon` (414-452), `drawLightningCloud` (453-475), y sus ramas en el `switch`/`case` del bucle.
- Test: `src/__tests__/homeHeroSol.test.tsx` (se extiende)

**Interfaces:**
- Consumes: nada.
- Produce: `EasterEggState['type']` pasa a `'shooting' | 'satellite' | null`.

El criterio no es "todo lo que se mueve se va": la estrella fugaz y el satélite son geometría, se leen como luz y pasan. Un ovni, un globo aerostático, un avión de papel y un rayo con cara son **personajes**, y un personaje animado es exactamente el registro que se pidió quitar. La luna y las nubes se quedan.

- [ ] **Step 1: Escribí el test que falla**

```tsx
// agregá a src/__tests__/homeHeroSol.test.tsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('el cielo no tiene personajes', () => {
  const fuente = readFileSync(
    resolve(__dirname, '../components/layout/HomeHero.tsx'), 'utf8',
  );

  it('no queda ni un personaje de dibujos en el archivo', () => {
    /* Un ovni, un globo y un avión de papel no se vuelven "cinematográficos"
       poniéndoles otra forma: se quedan o se van. La estrella fugaz y el
       satélite no son personajes, y siguen. */
    for (const personaje of ['drawUFO', 'drawHotAirBalloon', 'drawPaperAirplane', 'drawLightningCloud']) {
      expect(fuente, `${personaje} sigue en HomeHero.tsx`).not.toContain(personaje);
    }
  });

  it('lo que queda es luz, no gente', () => {
    expect(fuente).toContain('drawShootingStar');
    expect(fuente).toContain('drawSatellite');
  });
});
```

- [ ] **Step 2: Corré el test y verificá que falla**

Run: `npx vitest run src/__tests__/homeHeroSol.test.tsx`
Expected: FAIL en el primer `expect`, con `drawUFO sigue en HomeHero.tsx`.

- [ ] **Step 3: Borrá las cuatro funciones y sus ramas**

Borrá `drawUFO`, `drawPaperAirplane`, `drawHotAirBalloon` y `drawLightningCloud` completas. En el bucle de render, borrá:
- los `case 'ufo'`, `case 'balloon'`, `case 'plane'`, `case 'lightning'` del `switch`;
- los `case` correspondientes del `draw`;
- los `egg.type = ...` que los asignan. En `HomeHero.tsx:597-606`, la lista `dayTypes` se reduce y `noche` queda con `['shooting','satellite']`:
  ```ts
  const nightTypes: EasterEggState['type'][] = ['shooting', 'satellite'];
  if (slot === 'noche' || slot === 'madrugada') {
    egg.type = Math.random() < 0.5 ? 'shooting' : 'satellite';
  } else if (slot === 'atardecer') {
    egg.type = 'satellite';
  } else {
    /* De día no hay estrella fugaz: no se ve. El satélite sí, y es un objeto
       de luz, no un dibujo. */
    egg.type = 'satellite';
  }
  ```
- Y actualizá el tipo: `type: 'shooting' | 'satellite' | null;`

- [ ] **Step 4: Corré el test y `tsc`**

Run: `npx vitest run src/__tests__/homeHeroSol.test.tsx && npx tsc --noEmit`
Expected: PASS (4); sin `error TS`. Si `tsc` se queja de un `case` que ya no existe, es que quedó una rama: borrala.

- [ ] **Step 5: Commiteá**

```bash
git add src/components/layout/HomeHero.tsx src/__tests__/homeHeroSol.test.tsx
git commit -m "fix(inicio): fuera ovnis, globos, aviones y rayos del cielo"
```

---

### Task 3: El cielo se mueve menos y brilla menos

**Files:**
- Modify: `src/components/layout/HomeHero.tsx:171-181` (`drawStars`), `:557-567` (`buildStars`), y las constantes de velocidad del bucle.
- Test: `src/__tests__/homeHeroCielo.test.tsx`

- [ ] **Step 1: Escribí el test que falla**

```tsx
// src/__tests__/homeHeroCielo.test.tsx
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fuente = readFileSync(
  resolve(__dirname, '../components/layout/HomeHero.tsx'), 'utf8',
);

describe('el cielo se mueve poco', () => {
  it('el parpadeo de las estrellas es de bajo amplitud', () => {
    /* Hoy el twinkler va de 0.10 a 1.0: las estrellas se encienden y se apagan
       como una señal intermitente. Una estrella titila; un cartel de neón
       parpadea. La amplitud tiene que ser pequeña para que sea lo primero. */
    const m = fuente.match(/([\d.]+)\s*\+\s*([\d.]+)\s*\*\s*Math\.sin\(t \* s\.speed/);
    expect(m, 'no encontré la fórmula del parpadeo').toBeTruthy();
    const base = Number(m![1]);
    const amplitud = Number(m![2]);
    expect(base).toBeGreaterThan(0.8);
    expect(amplitud).toBeLessThanOrEqual(0.2);
  });

  it('no hay más de 45 estrellas', () => {
    /* 80 puntos parpadeando en una franja del 80% de la pantalla es ruido de
      _partícula_, no cielo. El contexto es una herramienta: el fondo tiene que
       desaparecer más completo detrás de la tarea. */
    const m = fuente.match(/buildStars\((\d+)\)/);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeLessThanOrEqual(45);
  });

  it('las estrellas son más chicas que antes', () => {
    const m = fuente.match(/r:\s*([\d.]+)\s*\+\s*Math\.random\(\)\s*\*\s*([\d.]+)/);
    expect(m).toBeTruthy();
    expect(Number(m![2])).toBeLessThanOrEqual(1.0);
  });

  it('la velocidad de parpadeo baja', () => {
    const m = fuente.match(/speed:\s*([\d.]+)\s*\+\s*Math\.random\(\)\s*\*\s*([\d.]+)/);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeLessThanOrEqual(0.4);
  });
});
```

- [ ] **Step 2: Corré el test y verificá que falla**

Run: `npx vitest run src/__tests__/homeHeroCielo.test.tsx`
Expected: FAIL en las cuatro: la base del parpadeo es `0.55` (menor que 0.8), la amplitud `0.45` (mayor que 0.2), hay 80 estrellas y el radio llega a 1.9.

- [ ] **Step 3: Ajustá las constantes**

En `drawStars` (línea ~173), reemplazá la fórmula del parpadeo:
```ts
const twinkle = 0.88 + 0.12 * Math.sin(t * s.speed + s.phase);
```

En `buildStars` (línea ~558):
```ts
const buildStars = (count: number): StarDot[] => {
  return Array.from({ length: count }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height * 0.8,
    r: 0.4 + Math.random() * 0.9,
    phase: Math.random() * Math.PI * 2,
    speed: 0.25 + Math.random() * 0.7,
  }));
};
const stars = buildStars(42);
```

- [ ] **Step 4: Corré el test y verificá que pasa**

Run: `npx vitest run src/__tests__/homeHeroCielo.test.tsx`
Expected: PASS (4).

- [ ] **Step 5: Commiteá**

```bash
git add src/components/layout/HomeHero.tsx src/__tests__/homeHeroCielo.test.tsx
git commit -m "fix(inicio): el cielo titila menos y brilla menos"
```

---

### Task 4: El contenedor respira

**Files:**
- Modify: `src/components/layout/HomeHero.tsx:997-1094` (el `return`).
- Test: `src/__tests__/homeHeroCielo.test.tsx` (se extiende)

- [ ] **Step 1: Escribí el test que falla**

```tsx
// agregá a src/__tests__/homeHeroCielo.test.tsx
describe('el hero tiene aire', () => {
  it('el padding vertical no es de seis píxeles', () => {
    /* `padding: '6px 0 18px'` con un cielo de 200px de alto deja la frase
       pegada al borde de arriba: el contenedor se ve como un recorte, no como
       una escena. Y el pedido fue explícito: "expande un poco ese contenedor". */
    const m = fuente.match(/padding:\s*'([\d.]+)px 0 ([\d.]+)px'/);
    expect(m, 'no encontré el padding del hero').toBeTruthy();
    expect(Number(m![1])).toBeGreaterThanOrEqual(28);
  });

  it('la frase tiene altura para tres renglones, no dos', () => {
    /* Con `WebkitLineClamp: 2` y `minHeight` de dos renglones, una frase larga
       se recorta en silencio y la persona cree que la app no cargó. El alto
       tiene que seguir al `line-clamp`. */
    const m = fuente.match(/WebkitLineClamp:\s*(\d+)/);
    const minH = fuente.match(/minHeight:\s*'(\d+)px'/);
    expect(m).toBeTruthy();
    expect(minH).toBeTruthy();
    const renglones = Number(m![1]);
    const alto = Number(minH![1]);
    // 36px de tipografía, lineHeight 1.18 → ~42px por renglón, con un piso.
    expect(alto).toBeGreaterThanOrEqual(renglones * 42);
  });

  it('el hero declara `prefers-reduced-motion`', () => {
    /* Sin esto, una persona con sensibilidad al movimiento reducido no tiene
       forma de apagarlo: no hay botón, no hay ajuste, y el bucle corre para
       siempre. Es el punto 2 del Review Focus y hoy no existe. */
    expect(fuente).toMatch(/prefers-reduced-motion|matchMedia/);
  });
});
```

- [ ] **Step 2: Corré el test y verificá que falla**

Run: `npx vitest run src/__tests__/homeHeroCielo.test.tsx`
Expected: FAIL en las tres: el padding es `6px`, el `minHeight` de `86px` no alcanza para 2 × 42 = 84 más el margen, y no hay `prefers-reduced-motion` en el archivo.

- [ ] **Step 3: Ampliá el contenedor y agregá el respeto al movimiento reducido**

En el `div` raíz del `return` (línea ~998), cambiá el `padding`:
```tsx
padding: '40px 24px 46px',
```

En el bloque de la frase, cambiá el `minHeight` para que siga al `line-clamp`:
```tsx
minHeight: '96px',
```

Y en `initCanvas`, al principio de la función (después de `const ctx = canvas.getContext('2d'); if (!ctx) return;`), agregá la salida temprana y la rama de un solo cuadro:
```ts
/* El movimiento reducido no es una preferencia del usuario: es una
   accesibilidad. Una persona con sensibilidad al movimiento reducido no tiene
   forma de apagar este bucle —no hay botón, no hay ajuste— y el bucle corre
   para siempre mientras la pantalla está abierta. Se le dibuja UN cuadro y se
   para: la escena se ve, no se mueve. */
const sinMovimiento =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

Y en el bucle `loop`, al principio del cuerpo, antes de dibujar:
```ts
if (sinMovimiento) {
  dibujarUnCuadro(ctx, /* …los mismos argumentos que el loop ya calcula… */);
  return;
}
```
(Si el `loop` actual calcula estado en varias sub-funciones, llamá a la que ya pinta el cielo una vez con `t = 0` y cortá.)

- [ ] **Step 4: Corré el test y `tsc`**

Run: `npx vitest run src/__tests__/homeHeroCielo.test.tsx && npx tsc --noEmit`
Expected: PASS (7); sin `error TS`.

- [ ] **Step 5: Commiteá**

```bash
git add src/components/layout/HomeHero.tsx src/__tests__/homeHeroCielo.test.tsx
git commit -m "feat(inicio): el hero respira, y respeta prefers-reduced-motion"
```

---

### Task 5: Fuera el texto que se repite

**Files:**
- Modify: `src/components/layout/HomeHero.tsx` — borrar `PILLARS` (105-121) y el bloque que las renderiza (1060-1091); borrar `TAG_COLOR` (92-102) y su `void TAG_COLOR;` (994-995).
- Modify: `src/components/wizard/Step0QuickStart.tsx:570-583` — sacar "Norma APA 7ma Edición", "· Motor editorial local" y el label "Perfil:".
- Test: `src/__tests__/homeHeroSinRuido.test.tsx`

**Interfaces:**
- Consumes: nada.
- Produce: `HomeHero.tsx` sin `PILLARS`, sin `TAG_COLOR`, sin `BookOpen`/`Zap`/`GitBranch` importados.

El `select` de perfiles **se queda**: es un control funcional. Lo que se va es el rótulo que lo anuncia, porque el `select` ya muestra el nombre del perfil elegido y el rótulo agrega una capa de texto que dice lo obvio.

- [ ] **Step 1: Escribí el test que falla**

```tsx
// src/__tests__/homeHeroSinRuido.test.tsx
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const hero = readFileSync(
  resolve(__dirname, '../components/layout/HomeHero.tsx'), 'utf8',
);
const inicio = readFileSync(
  resolve(__dirname, '../components/wizard/Step0QuickStart.tsx'), 'utf8',
);

describe('el texto que se repetía está fuera', () => {
  it('no quedan los tres pilares', () => {
    /* "Portada, cuerpo y referencias", "Corrección sin tocar tu contenido" y
       "Citas, DOI y referencias cruzadas" describen lo que la app ya deja ver
       en cinco pantallas. En el hero no aportan: ocupan la única línea de
       aire y se leen como publicidad. */
    for (const texto of [
      'Portada, cuerpo y referencias',
      'Corrección sin tocar tu contenido',
      'Citas, DOI y referencias cruzadas',
    ]) {
      expect(hero, `"${texto}" sigue en el hero`).not.toContain(texto);
    }
    expect(hero).not.toContain('PILLARS');
  });

  it('no queda la tabla de colores de etiqueta', () => {
    /* `TAG_COLOR` mapping siete etiquetas y hoy su única consumidor es
       `void TAG_COLOR;`: está muerto desde antes de este cambio. */
    expect(hero).not.toContain('TAG_COLOR');
  });

  it('no quedan los rótulos de la franja superior de Inicio', () => {
    expect(inicio).not.toContain('Norma APA 7ma Edición');
    expect(inicio).not.toContain('Motor editorial local');
  });

  it('el selector de perfiles se queda: es un control, no un rótulo', () => {
    /* Quitar el rótulo es limpiar; quitar el control es quitar capacidad. */
    expect(inicio).toContain('apa-profile-select');
  });
});
```

- [ ] **Step 2: Corré el test y verificá que falla**

Run: `npx vitest run src/__tests__/homeHeroSinRuido.test.tsx`
Expected: FAIL en las tres primeras; la cuarta pasa.

- [ ] **Step 3: Borrá lo que sobra**

En `HomeHero.tsx`: borrá el array `PILLARS` completo (105-121), el bloque JSX que lo mapea (1060-1091), `TAG_COLOR` (92-102) y el `// TAG_COLOR kept for potential future use` + `void TAG_COLOR;` (994-995). Quitá de la lista de imports de `lucide-react` los que se quedaron sin uso — `tsc --noEmit` con `noUnusedLocals` te los señala; no los adivines.

En `Step0QuickStart.tsx`: borrá el `<div>` de las líneas 570-578 (el `ShieldCheck` + "Norma APA 7ma Edición" + "· Motor editorial local") y el `<label htmlFor="apa-profile-select">` con su texto "Perfil:" (581-583). **El `<select id="apa-profile-select">` y su `useActiveProfile` se quedan.** Si al borrar el primer `<div>` el `justifyContent: 'space-between'` de la barra queda con un solo hijo, pasá a `justifyContent: 'flex-end'`.

- [ ] **Step 4: Corré el test, `tsc` y la suite de layout**

Run: `npx vitest run src/__tests__/homeHeroSinRuido.test.tsx src/__tests__/layout.test.tsx && npx tsc --noEmit`
Expected: PASS; sin `error TS`.

- [ ] **Step 5: Commiteá**

```bash
git add src/components/layout/HomeHero.tsx src/components/wizard/Step0QuickStart.tsx src/__tests__/homeHeroSinRuido.test.tsx
git commit -m "refactor(inicio): fuera los rótulos que ya dicen las pantallas"
```

---

### Task 6: El botón "Archivo" — DECISIÓN PENDIENTE DE LA PERSONA

**Files:**
- Modify: `src/components/wizard/Step0QuickStart.tsx:427-447` (el botón "Archivo" del rail de Inicio) y `src/components/toolbar/UnifiedToolbar.tsx:81-99` (el disparador del menú global).
- Test: pendiente de la decisión.

**Interfaces:**
- Consumes: nada.
- Produce: nada.

**El pedido fue** *"quita archivo de la ui superior tambien en la de inicio eso no sirve"*. Y el hallazgo es este: ese menú contiene `Inicio, Nuevo, Abrir, Guardar, Exportar, Actualización` (`FileMenu.tsx:23-28`) más las estadísticas de sesión. **Es el único acceso a "Guardar" y a "Actualización".** Borrarlo entero no es limpiar la barra: es dejar la app sin forma de guardar, y un trabajo de tesis sin guardar es un trabajo perdido.

Por eso esta tarea tiene dos lecturas y **no se ejecuta sin que la persona elija**:

- **Opción A — borrar el DUPLICADO (recomendada).** En Inicio hay una franja propia con branding + "Archivo", y además está la `UnifiedToolbar` global: el mismo menú dos veces en la misma pantalla. Se borra el de Inicio y el global queda como está. Se pierde cero capacidad, y se pierde un duplicado.
- **Opción B — borrar los dos.** Sale también el global, y con él "Guardar" y "Actualización". Eso exige decide dónde viven: mi recomendación es que "Guardar" pase a ser un botón de la `UnifiedToolbar` al lado de "Exportar" (donde el usuario ya lo espera), y "Actualización" a Ajustes. Son dos cambios más, y son una decisión de producto, no una limpieza.

- [ ] **Step 1: Preguntá y esperá la respuesta**

No avances sin respuesta. Presentá las dos opciones con su coste.

- [ ] **Step 2: Ejecutá la opción elegida**

Opción A: borrá el bloque de `Step0QuickStart.tsx:427-447` y el `FileMenu` que se monte desde ahí. `tsc` te va a marcar los imports sin uso.

Opción B: además, sacá el disparador de `UnifiedToolbar.tsx:81-99`, poné "Guardar" junto a "Exportar", y mové "Actualización" a Ajustes.

- [ ] **Step 3: Agregá el test que fija la decisión**

Opción A:
```tsx
it('Inicio no monta su propio "Archivo": el global alcanza', () => {
  /* El duplicado no era una función: era la misma función dos veces en la misma
     pantalla. Con uno alcanza, y "Guardar" sigue teniendo dónde estar. */
  expect(inicio).not.toContain('Archivo: nuevo, abrir, guardar, exportar y sesiones');
});
```

Opción B:
```tsx
it('Guardar sigue siendo alcanzable sin el menú "Archivo"', () => {
  /* Si se borra el menú, "Guardar" tiene que estar en otro lado: el trabajo de
     tesis sin guardar es trabajo perdido. */
  expect(toolbar).toMatch(/Guardar/);
  expect(toolbar).not.toContain('aria-label="Menú Archivo"');
});
```

- [ ] **Step 4: Corré y commiteá**

```bash
npx vitest run src/__tests__/homeHeroSinRuido.test.tsx && npx tsc --noEmit
git add -A && git commit -m "refactor(inicio): el menú Archivo deja de estar duplicado"
```

---

### Task 7: La deuda de tokens del cielo de Inicio queda NOMBRADA

> **Ruling de pre-flight (ledger).** Esta task NO agrega `components/layout` al
> alcance del lint. Un `addColorStop` de un degradado no puede recibir un
> `var(--token)` —es geometria pintada, no estilo— y `HomeHero.tsx` tiene mas de
> cuarenta literales de ese tipo. Tokenizarlos pediria un `getComputedStyle` por
> degradado, que es absurdo para un fondo. Se hace lo que ya se hace con
> `fluent.css`: la deuda se escribe en el archivo, con su nombre y su motivo.
> Una lista de exenciones por valor es como muere un lint.

**Files:**
- Modify: `src/__tests__/noHardcodedColors.test.ts` (docblock: la lista de archivos fuera de alcance con su señal).
- Test: el mismo archivo.

- [ ] **Step 1: Escribí la deuda en el archivo del lint**

En el docblock de `src/__tests__/noHardcodedColors.test.ts`, dentro de la lista
*"LO QUE QUEDA SIN GOBIERNO, CON SEÑAL EN EL ARCHIVO"*, agregá:

```
 *   - `src/components/layout/HomeHero.tsx`: el `canvas` del cielo de Inicio.
 *     No esta en el alcance y NO se puede agregar. Un `addColorStop` de un
 *     degradado no acepta un `var(--token)`: es geometria pintada, no estilo, y
 *     el color se resuelve en el momento del dibujado. Tokenizarlo pediria un
 *     `getComputedStyle` por cada degradado, en un archivo con mas de cuarenta,
 *     para pintar un fondo. Es el mismo caso que `fluent.css` y se maneja
 *     igual: nombrado, con su motivo, en vez de con una lista de excepciones.
 *     Lo que SI usa tokens en ese archivo es el texto, los bordes y el velo.
```

- [ ] **Step 2: Corré el lint y confirmá que la cuenta no se movió**

Run: `npx vitest run src/__tests__/noHardcodedColors.test.ts`
Expected: PASS. La prueba R9 sigue contando `styles/fluent.css` como la unica hoja
con literales: **agregar una nota al docblock no cambia ninguna cuenta**, y si el
test falla es porque agregaste algo que el detector lee.

- [ ] **Step 3: Commiteá**

```bash
git add src/__tests__/noHardcodedColors.test.ts
git commit -m "docs(tokens): la deuda del cielo de Inicio queda nombrada"
```

---

## Self-Review

**1. Cobertura de la spec.** Cada punto del pedido literal tiene tarea: el sol
sin cara y las púas → Task 1. "Más cinematográfico, todo" → Tasks 1, 2 y 3.
"Expandir un poco ese contenedor" → Task 4. Los seis rótulos a quitar → Task 5.
"Archivo" en los dos lados → Task 6, con la decisión ya tomada: **opción A, se
borra el duplicado de Inicio y el global queda** (respuesta de la persona).

Los `strokeWidth={2}` fuera de norma: la restricción está en Global Constraints,
pero ninguna task los nombra uno por uno y `noUnusedLocals` NO los marca —una
prop con un valor mal no es un identificador sin usar—. **Van agregados a la
Task 5**, que es donde se borran los pilares que los usaban.

**2. Placeholders.** No hay. Cada step trae el código o la acción exacta. La
Task 6 tiene dos opciones escritas y una respuesta; no es un "TBD".

**3. Consistencia de tipos.** `drawSolCinematico` mantiene la aridad de
`drawCartoonSun` a propósito, para que el llamador no cambie de forma. El tipo
`EasterEggState['type']` se estrecha en la Task 2, después de que los `case`
desaparezcan; si `tsc` se queja de un `case` que ya no existe, es que quedó una
rama. La Task 7 fue reescrita después del pre-flight: ya no agrega el directorio
al lint.

**4. Review Focus.** Los cinco puntos, y qué queda resuelto:

1. Canvas redimensionado a ancho cero apila las estrellas en (0,0) — **NO se
   resuelve en este plan**. Se anota como deuda con nombre.
2. `prefers-reduced-motion` — **resuelto** en la Task 4.
3. `line-clamp` contra `minHeight` — **resuelto** en la Task 4.
4. Documento sin H1 no tiene fases — **NO se resuelve aquí**; ya estaba anotado
   antes de este plan.
5. Contraste por tema — **NO resuelto y es la deuda más grande del plan**. La
   Task 4 agranda el contraste del hero sin que exista una prueba que demuestre
   que sigue legible en oscuro. Tiene que decirse en el commit de la Task 4.
