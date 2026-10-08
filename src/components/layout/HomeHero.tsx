/* WordAPA7 — Hero de la pantalla de inicio.
 * Frase rotativa animada como título principal (altura fija para que el
 * layout no salte). Personalidad de producto: inteligente, sin redundancias
 * ni texto patronizante. Cero emojis — iconos Lucide únicamente.
 * Canvas animado con escena de tiempo del día (7 slots horarios).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PROCESS_VERBS, JOKES, APA_FACTS, AI_JOKES, WORD_HELL_JOKES, STUDENT_JOKES } from './LoadingTips';
import { getTimeSlotPhrases } from '../../lib/studentJokes';

interface Phrase {
  text: string;
  tag: string;
}

const EXTRA_HERO: Phrase[] = [
  { text: 'De borrador a entrega formal en segundos', tag: 'inicio' },
  { text: 'Corregimos el formato, vos seguís escribiendo', tag: 'inicio' },
  { text: 'De "final_v3.docx" a entrega formal en minutos', tag: 'inicio' },
  { text: 'Sangrías, portada, referencias y citas en orden', tag: 'inicio' },
  { text: 'El infierno de los márgenes termina aquí', tag: 'inicio' },
  { text: 'Tus títulos al nivel correcto, sin discutirle a Word', tag: 'inicio' },
];

/** Frases de contexto horario. */
function getTimeContextPhrases(): Phrase[] {
  const now = new Date();
  const texts = getTimeSlotPhrases(now);
  return texts.map((text) => ({ text, tag: 'hora-especial' }));
}

function fmtPhrase(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (t[0] >= 'a' && t[0] <= 'z') return t[0].toUpperCase() + t.slice(1);
  return t;
}

function buildPool(): Phrase[] {
  const timePhrases = getTimeContextPhrases();
  const process: Phrase[] = PROCESS_VERBS.map((t) => ({ text: fmtPhrase(t.replace(/…$/, '')), tag: 'procesando' }));
  const jokes: Phrase[] = JOKES.map((t) => ({ text: fmtPhrase(t), tag: 'chiste' }));
  const facts: Phrase[] = APA_FACTS.map((t) => ({ text: fmtPhrase(t), tag: 'dato' }));
  const ai: Phrase[] = AI_JOKES.map((t) => ({ text: fmtPhrase(t), tag: 'ai' }));
  const wordhell: Phrase[] = WORD_HELL_JOKES.map((t) => ({ text: fmtPhrase(t), tag: 'wordhell' }));
  const student: Phrase[] = STUDENT_JOKES.map((t) => ({ text: fmtPhrase(t), tag: 'student' }));

  return [...timePhrases, ...EXTRA_HERO, ...process, ...jokes, ...facts, ...ai, ...wordhell, ...student];
}

// Historial para que nunca se repita la misma frase en aperturas consecutivas
const SEEN_STORAGE_KEY = 'wordapa7_seen_hero_phrases';

function getSeenPhrases(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_STORAGE_KEY) || localStorage.getItem(SEEN_STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function recordSeenPhrase(text: string) {
  try {
    const seen = getSeenPhrases();
    seen.add(text);
    // Limitar historial a 30 frases para recircular
    const arr = Array.from(seen).slice(-30);
    sessionStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(arr));
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(arr));
  } catch { /* noop */ }
}

function pickFreshPhrase(pool: Phrase[], currentText?: string): Phrase {
  const seen = getSeenPhrases();
  let available = pool.filter((p) => !seen.has(p.text) && p.text !== currentText);
  if (available.length === 0) {
    // Si ya vimos todas, limpiar historial
    try {
      sessionStorage.removeItem(SEEN_STORAGE_KEY);
      localStorage.removeItem(SEEN_STORAGE_KEY);
    } catch { /* noop */ }
    available = pool.filter((p) => p.text !== currentText);
  }
  const picked = available[Math.floor(Math.random() * available.length)] || pool[0];
  recordSeenPhrase(picked.text);
  return picked;
}

/* `TAG_COLOR` y `PILLARS` se fueron, y no por gusto.
 *
 * `TAG_COLOR` mapeaba siete etiquetas y su único consumidor era
 * `void TAG_COLOR;`: estaba muerto antes de este cambio.
 *
 * `PILLARS` eran tres tarjetas que decían "Portada, cuerpo y referencias",
 * "Corrección sin tocar tu contenido" y "Citas, DOI y referencias cruzadas".
 * El criterio para sacarlas no es que sean Largas ni que ocupen: es que
 * describen lo que la app ya deja ver en cinco pantallas. En el hero —que es
 * la única línea de aire de la pantalla— se leen como publicidad y le quitan
 * el lugar a la escena. Un texto que anuncia la app es ruido en una pantalla
 * cuya función es que la persona empiece a trabajar.
 *
 * También se fueron con ellas los tres `strokeWidth="var(--icon-stroke)"` que traían: la norma
 * del proyecto es el token `--icon-stroke`, que vale 1.75.
 */

// ─── Canvas scene types ───────────────────────────────────────────────────────

type TimeSlot =
  | 'madrugada'   // 0-4
  | 'amanecer'    // 5-6
  | 'manana'      // 7-11
  | 'mediodia'    // 12-14
  | 'tarde'       // 15-17
  | 'atardecer'   // 18-19
  | 'noche';      // 20-23

interface StarDot {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
}

interface EasterEggState {
  type: 'ufo' | 'shooting' | 'plane' | 'balloon' | 'lightning' | 'satellite' | null;
  x: number;
  y: number;
  progress: number; // 0..1
  startTs: number;
  duration: number; // ms
}

function getSlot(h: number): TimeSlot {
  if (h >= 0 && h <= 4) return 'madrugada';
  if (h <= 6) return 'amanecer';
  if (h <= 11) return 'manana';
  if (h <= 14) return 'mediodia';
  if (h <= 17) return 'tarde';
  if (h <= 19) return 'atardecer';
  return 'noche';
}

function isNightSlot(slot: TimeSlot) {
  return slot === 'noche' || slot === 'madrugada';
}

function isDaySlot(slot: TimeSlot) {
  return slot === 'manana' || slot === 'mediodia' || slot === 'tarde';
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────

function drawStars(ctx: CanvasRenderingContext2D, stars: StarDot[], t: number, alpha = 1) {
  stars.forEach((s) => {
    const twinkle = 0.55 + 0.45 * Math.sin(t * s.speed + s.phase);
    ctx.globalAlpha = alpha * twinkle;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    /* Un canvas 2D NO resuelve `var()`: `fillStyle` es un color CSS, no una
       cadena que el navegador interpole. Escribirle un token produce un
       `fillStyle` invalido y el canvas conserva el anterior, asi que el
       relleno salia del color de la figura de abajo. Las paradas de un
       degradado tienen la misma limitacion. Por eso la paleta del cielo es
       una constante de JavaScript y no una escala de tokens: no hay token
       que un `CanvasRenderingContext2D` pueda leer. */
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawCrescentMoon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  angle: number,
  alpha = 1,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  // Moon halo
  const halo = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 2.5);
  halo.addColorStop(0, LUNA.halo[0]);
  halo.addColorStop(1, LUNA.halo[1]);
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.5, 0, Math.PI * 2);
  ctx.fillStyle = halo;
  ctx.fill();

  // Crescent body
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = LUNA.cuerpo;
  ctx.fill();

  // Bite out (shadow circle offset)
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(r * 0.45, -r * 0.1, r * 0.88, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // Wispy clouds near moon
  ctx.globalAlpha = alpha * 0.15;
  ctx.fillStyle = LUNA.nubes;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(
      r * (1.8 + i * 0.9),
      r * (-0.4 + i * 0.3),
      r * (0.6 + i * 0.15),
      r * 0.22,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  ctx.restore();
}

/**
 * El sol: una fuente de luz, no un personaje.
 *
 * Lo que habia antes eran doce puas gruesas de punta redonda (el comentario del
 * código las llamaba "chunky spiky rays"), dos óvalos por ojo y un arco de
 * sonrisa. Eso es un sol de dibujos animados, y el usuario lo identificó como
 * tal al mirar la pantalla: "se ve demasiado de niño". No es una cuestión de
 * gusto ni de saturación, es un registro visual, y lo que lo cambia es dejar de
 * dibujar una cara.
 *
 * Ahora: una CORONA de tres paradas y un disco con degradado interior. Es
 * degradado radial y no lineal porque el color de un sol baja hacia el borde en
 * todas las direcciones a la vez. Y sin púas: una fuente de luz real no tiene
 * bordes, y las púas son la mitad de lo que hace que un sol parezca un dibujo.
 *
 * `homeHeroSol.test.tsx` falla si vuelve a aparecer un óvalo.
 */
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

  // La CORONA, que es lo único que hace que un disco se lea como sol.
  const corona = ctx.createRadialGradient(0, 0, r * 0.9, 0, 0, r * 3.2);
  corona.addColorStop(0, SOL.corona[0]);
  corona.addColorStop(0.35, SOL.corona[1]);
  corona.addColorStop(1, SOL.corona[2]);
  ctx.beginPath();
  ctx.arc(0, 0, r * 3.2, 0, Math.PI * 2);
  ctx.fillStyle = corona;
  ctx.fill();

  // El disco. El degradado interior va de un blanco cálido al color que le pasa
  // el llamador, y es lo que le da volumen a un círculo plano.
  const disco = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  disco.addColorStop(0, SOL.discoAlto[0]);
  disco.addColorStop(0.65, color);
  disco.addColorStop(1, color);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = disco;
  ctx.fill();

  ctx.restore();
}

function drawFluffyCloud(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  tint: string,
  alpha = 1,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = tint;
  ctx.beginPath();
  ctx.arc(cx, cy, scale * 22, 0, Math.PI * 2);
  ctx.arc(cx + scale * 18, cy + scale * 5, scale * 16, 0, Math.PI * 2);
  ctx.arc(cx - scale * 18, cy + scale * 5, scale * 16, 0, Math.PI * 2);
  ctx.arc(cx + scale * 34, cy + scale * 10, scale * 12, 0, Math.PI * 2);
  ctx.arc(cx - scale * 34, cy + scale * 10, scale * 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSkyGradient(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  stops: Cielo,
) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  stops.forEach(([pos, color]) => grad.addColorStop(pos, color));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.1, w / 2, h / 2, h * 0.85);
  vig.addColorStop(0, 'transparent');
  vig.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

// ─── Objetos en el cielo ─────────────────────────────────────────────────────

/**
 * LA PALETA DE LAS FIGURITAS, en un solo lugar. Y el motivo de que esté en un
 * solo lugar es el arreglo entero, no unaomanera de ordenar el código.
 *
 * Antes cada función se inventó sus colores: el ovni llevaba tres luces en
 * amarillo, rojo y verde —un semáforo— y el globo un degradado rojo, naranja y
 * amarillo a plena saturación, que es un globo de feria. Los marrones de las
 * cuerdas no eran un color de cielo. Y había cinco grosores de línea distintos
 * en cuatro figuras. Cuatro objetos dibujados por cuatro manos: eso es lo que
 * se leía como "de niño", y no las figuritas en sí.
 *
 * Ahora es un juego. Un pizarra azulado apagado para la masa, un azul un poco
 * más claro para lo que se le superpone, un marfil cálido para la luz —nunca
 * amarillo saturado—, un borde translúcido frío y un solo grosor de trazo.
 * Todo por debajo de 0.6 de saturación: un color puro se lee como juguete en
 * cuanto tiene una silueta alrededor.
 *
 * `homeHeroFiguritas.test.ts` falla si vuelve a aparecer un hex o un
 * `lineWidth = <número>` dentro de una figurita.
 */

const FIGURITA = {
  masa: '#2f3b57',
  masaTenue: '#46557a',
  luz: '#e8dcc4',
  borde: 'rgba(206, 216, 238, 0.5)',
  sombra: 'rgba(10, 14, 26, 0.22)',
  trazo: 1.1,
} as const;

/**
 * LA PALETA DEL CIELO, en un solo lugar, por la MISMA razón que `FIGURITA`.
 *
 * Y por qué esta paleta NO son tokens de `design-system.css`, cuando todo lo
 * demás del archivo ya lo es: un `CanvasRenderingContext2D` no resuelve
 * `var()`. `ctx.fillStyle` y `grad.addColorStop()` toman un color CSS ya
 * resuelto; ponerles un token produce un valor INVÁLIDO, el contexto lo
 * descarta en silencio y conserva el anterior. O sea: el token no cambiaría
 * el color, y además rompería la escena sin decir nada.
 *
 * La diferencia con el resto de la app es real y no es una exención: el cielo
 * es una ILUSTRACIÓN de la hora del día, no una superficie. No tiene tema
 * claro y oscuro —el amanecer es el mismo con el sol arriba o abajo— así que
 * un token por tema no describiría nada. Lo que sí comparte con el resto es la
 * forma: una constante con nombre, usada por todos los que dibujan cielo, en
 * vez de un hex suelto por función.
 *
 * Los stops van de más oscuro a más claro en las franjas de noche, y al revés
 * en las de día: eso es lo que hace que un degradado de tres o cuatro paradas
 * se lea como un cielo y no como una franja. Amanecer y atardecer comparten
 * el naranja del horizonte a propósito: son el mismo sol a distinta altura, y
 * dos naranjas distintos decían que eran dos momentos distintos.
 */
type Cielo = readonly (readonly [number, string])[];

const CIELO: Record<string, Cielo> = {
  madrugada: [[0, '#050816'], [0.45, '#0a1128'], [1, '#12204a']],
  amanecer: [[0, '#1a0533'], [0.35, '#5c2a6e'], [0.7, '#b04a6e'], [1, '#e5834b']],
  manana: [[0, '#2979ff'], [0.5, '#448aff'], [1, '#82b1ff']],
  mediodia: [[0, '#1565c0'], [0.4, '#1976d2'], [1, '#42a5f5']],
  tarde: [[0, '#0d47a1'], [0.5, '#1565c0'], [1, '#f57c00']],
  atardecer: [[0, '#311b92'], [0.35, '#ad1457'], [0.7, '#e64a19'], [1, '#f57c00']],
  /* Las dos franjas de noche comparten el cielo ENTERO, no por poco: la luna
     se mueve y las estrellas titilan, pero el degradado de fondo es el mismo.
     Estaba escrito dos veces, y por eso podia divergir. */
  noche: [[0, '#050816'], [0.45, '#0a1128'], [1, '#12204a']],
};

/* Los tonos del sol, que son los otros tres colores que el archivo repite: el
   disco, su corona y su halo. Mismo motivo que CIELO. */
const SOL = {
  disco: '#ffd740',
  nucleo: '#ffee58',
  corona: ['rgba(255, 226, 150, 0.30)', 'rgba(255, 208, 110, 0.12)', 'rgba(255, 200, 90, 0)'],
  discoAlto: ['rgba(255, 253, 240, 0.95)'],
} as const;

/* La luna y su halo, que son los dos ultimos colores sueltos del archivo. */
const LUNA = {
  cuerpo: '#e8eaf6',
  nubes: '#c5cae9',
  halo: ['rgba(200, 220, 255, 0.22)', 'rgba(200, 220, 255, 0)'],
  nubeStrip: '#7986cb',
  rayo: 'rgba(229, 131, 75, 0.5)',
} as const;

/* Los colores que solo aparecen una vez y no son familia de nada: el fan de
   rayos del atardecer y las nubes de la tarde. Viven aqui para que el archivo
   no tenga ningun color suelto fuera de una paleta con nombre. */
const TONOS = {
  nubeTarde: '#ffcc80',
  solTarde: '#ffa726',
  /* El alfa del fan de rayos del atardecer, como NUMERO y no como color: el
     codigo lo multiplica por (1 - i / fanCount) para que el rayo se apague
     hacia abajo, y con un `rgba` entero eso no se puede escribir. */
  fanAtardecer: 0.22,
} as const;

function drawUFO(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);

  // La masa: un disco achatado. La silueta se lee antes que el detalle, y a
  // 26 píxeles de ancho el detalle es ruido.
  ctx.beginPath();
  ctx.ellipse(0, 0, 26, 9, 0, 0, Math.PI * 2);
  ctx.fillStyle = FIGURITA.masa;
  ctx.fill();

  // La cúpula, más clara: es lo que da volumen a un disco plano.
  ctx.beginPath();
  ctx.ellipse(0, -6, 13, 9, 0, Math.PI, Math.PI * 2);
  ctx.fillStyle = FIGURITA.masaTenue;
  ctx.fill();

  // UNA luz, no tres. El semáforo de antes era lo más literal de juguete que
  // había en el archivo: tres colores puros en fila sobre una nave.
  ctx.beginPath();
  ctx.arc(0, 5, 3, 0, Math.PI * 2);
  ctx.fillStyle = FIGURITA.luz;
  ctx.fill();

  // El borde, un solo trazo para toda la figura.
  ctx.beginPath();
  ctx.ellipse(0, 0, 26, 9, 0, 0, Math.PI * 2);
  ctx.strokeStyle = FIGURITA.borde;
  ctx.lineWidth = FIGURITA.trazo;
  ctx.stroke();

  ctx.restore();
}

function drawShootingStar(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number) {
  const len = 90 * (1 - progress * 0.4);
  const angle = Math.PI / 6;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const grad = ctx.createLinearGradient(-len, 0, 0, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(255,255,255,0.9)');
  ctx.beginPath();
  ctx.moveTo(-len, 0);
  ctx.lineTo(0, 0);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

function drawPaperAirplane(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  // La más limpia de las cinco ya: un pliegue y nada más. Pasa a la paleta
  // compartida y suelta el azul propio, que era un color que no aparecía en
  // ninguna otra figura.
  ctx.beginPath();
  ctx.moveTo(20, 0);
  ctx.lineTo(-14, -10);
  ctx.lineTo(-8, 0);
  ctx.lineTo(-14, 10);
  ctx.closePath();
  ctx.fillStyle = FIGURITA.masaTenue;
  ctx.fill();
  ctx.strokeStyle = FIGURITA.borde;
  ctx.lineWidth = FIGURITA.trazo;
  ctx.stroke();
  // El pliegue, en la masa y no en el borde: es una arista de la figura, no un
  // adorno.
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.lineTo(20, 0);
  ctx.strokeStyle = FIGURITA.masa;
  ctx.lineWidth = FIGURITA.trazo;
  ctx.stroke();
  ctx.restore();
}

function drawHotAirBalloon(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  /* El degradado va de la masa a la masa clara en vez de rojo, naranja y
     amarillo a plena saturación. Un globo de feria se reconoce por el arcoíris;
     un globo bonito se reconoce por la silueta y por una sola luz. */
  const bg = ctx.createRadialGradient(-8, -18, 4, 0, -15, 28);
  bg.addColorStop(0, FIGURITA.masaTenue);
  bg.addColorStop(0.62, FIGURITA.masa);
  bg.addColorStop(1, FIGURITA.masa);
  ctx.beginPath();
  ctx.arc(0, -18, 26, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = FIGURITA.borde;
  ctx.lineWidth = FIGURITA.trazo;
  ctx.stroke();

  // Dos costuras, no cinco rayas. Cinco era el patrón de toldo.
  ctx.strokeStyle = FIGURITA.sombra;
  ctx.lineWidth = FIGURITA.trazo;
  for (const x0 of [-8, 8]) {
    ctx.beginPath();
    ctx.moveTo(x0 * 1.2, -40);
    ctx.lineTo(x0 * 0.7, 6);
    ctx.stroke();
  }

  // Cuerdas y cesta en la masa, no en dos marrones distintos. El marrón no es
  // un color de cielo.
  ctx.strokeStyle = FIGURITA.borde;
  ctx.lineWidth = FIGURITA.trazo;
  ctx.beginPath();
  ctx.moveTo(-12, 6);
  ctx.lineTo(-8, 18);
  ctx.moveTo(12, 6);
  ctx.lineTo(8, 18);
  ctx.stroke();
  ctx.fillStyle = FIGURITA.masa;
  ctx.fillRect(-9, 18, 18, 11);
  ctx.strokeStyle = FIGURITA.borde;
  ctx.lineWidth = FIGURITA.trazo;
  ctx.strokeRect(-9, 18, 18, 11);
  ctx.restore();
}

function drawLightningCloud(ctx: CanvasRenderingContext2D, x: number, y: number, flash: boolean) {
  ctx.save();
  ctx.translate(x, y);
  // La nube: una masa suave, no tres círculos que se tocan. Tres círculos con
  // radio 20, 15 y 15 dibujados uno encima del otro se leen como una cara.
  ctx.beginPath();
  ctx.moveTo(-22, 10);
  ctx.bezierCurveTo(-30, -6, -14, -16, -2, -10);
  ctx.bezierCurveTo(10, -20, 28, -8, 24, 8);
  ctx.bezierCurveTo(14, 16, -12, 16, -22, 10);
  ctx.closePath();
  ctx.fillStyle = FIGURITA.masa;
  ctx.fill();

  // El rayo en marfil, y el destello es el MISMO color con más opacidad: antes
  // alternaba entre dos amarillos puros y eso es unfoque de dibujo.
  ctx.globalAlpha = flash ? 0.95 : 0.55;
  ctx.beginPath();
  ctx.moveTo(4, 12);
  ctx.lineTo(-4, 26);
  ctx.lineTo(2, 26);
  ctx.lineTo(-6, 42);
  ctx.lineTo(10, 22);
  ctx.lineTo(4, 22);
  ctx.closePath();
  ctx.fillStyle = FIGURITA.luz;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawSatellite(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  // El cuerpo y los paneles en la misma masa, con las líneas en la masa clara.
  // Antes eran dos azules que no aparecían en ninguna otra figura.
  ctx.fillStyle = FIGURITA.masa;
  ctx.fillRect(-8, -5, 16, 10);
  ctx.fillRect(-26, -3, 16, 6);
  ctx.fillRect(10, -3, 16, 6);

  ctx.strokeStyle = FIGURITA.masaTenue;
  ctx.lineWidth = FIGURITA.trazo;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-26 + i * 4, -3);
    ctx.lineTo(-26 + i * 4, 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(10 + i * 4, -3);
    ctx.lineTo(10 + i * 4, 3);
    ctx.stroke();
  }

  // La antena en el borde frío, y un punto de luz: el satélite también tiene
  // que leerse como un objeto del mismo mundo que las otras cuatro.
  ctx.strokeStyle = FIGURITA.borde;
  ctx.lineWidth = FIGURITA.trazo;
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(0, -12);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -14, 3, 0, Math.PI * 2);
  ctx.fillStyle = FIGURITA.luz;
  ctx.fill();
  ctx.restore();
}

// ─── Main component ───────────────────────────────────────────────────────────

export const HomeHero: React.FC = () => {
  const poolRef = useRef<Phrase[]>(buildPool());
  const [phrase, setPhrase] = useState<Phrase>(() => pickFreshPhrase(poolRef.current));
  const [fadeKey, setFadeKey] = useState(0);
  const currentTextRef = useRef(phrase.text);
  currentTextRef.current = phrase.text;

  // ── Phrase rotation ──
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const next = pickFreshPhrase(poolRef.current, currentTextRef.current);
      setPhrase(next);
      setFadeKey((k) => k + 1);
      const isArt =
        next.tag === 'hora-especial' || next.tag === 'contexto' || next.tag === 'ai' || next.tag === 'student';
      timer = setTimeout(tick, isArt ? 14000 : 9000);
    };
    timer = setTimeout(tick, 9000);
    return () => clearTimeout(timer);
  }, []);

  // ── Canvas ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const tRef = useRef(0);
  const lastRef = useRef<number | null>(null);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize handler
    const handleResize = () => {
      if (!canvas.parentElement) return;
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    // Build stars
    const buildStars = (count: number): StarDot[] => {
      return Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height * 0.8,
        r: 0.5 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
        speed: 0.8 + Math.random() * 1.8,
      }));
    };
    const stars = buildStars(80);

    // Easter egg state
    const egg: EasterEggState = {
      type: null,
      x: 0,
      y: 0,
      progress: 0,
      startTs: 0,
      duration: 0,
    };

    let nextEggAt = Date.now() + 8000 + Math.random() * 20000;
    let sunRotation = 0;
    let moonX = 0;

    // Slot
    const currentHour = new Date().getHours();
    const slot = getSlot(currentHour);

    // Clouds state for drifting
    const clouds = [
      { x: 0.1, y: 0.22, scale: 1.0, speed: 0.000012 },
      { x: 0.45, y: 0.15, scale: 0.75, speed: 0.000008 },
      { x: 0.75, y: 0.28, scale: 0.9, speed: 0.000015 },
    ];

    const spawnEgg = (ts: number) => {
      if (isNightSlot(slot)) {
        // Choose from night eggs
        const types: EasterEggState['type'][] = ['ufo', 'shooting', 'satellite'];
        egg.type = types[Math.floor(Math.random() * types.length)];
      } else if (isDaySlot(slot)) {
        const dayTypes: EasterEggState['type'][] = ['plane', 'balloon'];
        if (slot === 'tarde') dayTypes.push('lightning');
        egg.type = dayTypes[Math.floor(Math.random() * dayTypes.length)];
      } else if (slot === 'amanecer') {
        egg.type = Math.random() < 0.5 ? 'shooting' : 'satellite';
      } else {
        egg.type = 'satellite';
      }

      const w = canvas.width;
      const h = canvas.height;

      switch (egg.type) {
        case 'ufo':
          egg.x = w + 40;
          egg.y = h * (0.1 + Math.random() * 0.25);
          egg.duration = 9000;
          break;
        case 'shooting':
          egg.x = w * (0.3 + Math.random() * 0.5);
          egg.y = h * (0.05 + Math.random() * 0.2);
          egg.duration = 1200;
          break;
        case 'plane':
          egg.x = -40;
          egg.y = h * (0.2 + Math.random() * 0.35);
          egg.duration = 8000;
          break;
        case 'balloon':
          egg.x = w * (0.25 + Math.random() * 0.5);
          egg.y = h + 70;
          egg.duration = 10000;
          break;
        case 'lightning':
          egg.x = w * (0.2 + Math.random() * 0.6);
          egg.y = h * (0.12 + Math.random() * 0.2);
          egg.duration = 3500;
          break;
        case 'satellite':
          egg.x = -40;
          egg.y = h * (0.05 + Math.random() * 0.2);
          egg.duration = 12000;
          break;
        default:
          egg.type = null;
          return;
      }
      egg.startTs = ts;
      egg.progress = 0;
    };

    const drawEgg = (ts: number) => {
      if (!egg.type) return;
      const w = canvas.width;
      const h = canvas.height;
      egg.progress = Math.min(1, (ts - egg.startTs) / egg.duration);

      switch (egg.type) {
        case 'ufo': {
          const x = egg.x - egg.progress * (w + 80);
          const bob = Math.sin(ts * 0.0015) * 6;
          const alpha = egg.progress < 0.08
            ? egg.progress / 0.08
            : egg.progress > 0.92
              ? (1 - egg.progress) / 0.08
              : 1;
          ctx.globalAlpha = alpha;
          drawUFO(ctx, x, egg.y + bob);
          ctx.globalAlpha = 1;
          break;
        }
        case 'shooting': {
          const fadeA = egg.progress < 0.1
            ? egg.progress / 0.1
            : egg.progress > 0.8
              ? (1 - egg.progress) / 0.2
              : 1;
          const sx = egg.x + egg.progress * 160;
          const sy = egg.y + egg.progress * 90;
          ctx.globalAlpha = fadeA;
          drawShootingStar(ctx, sx, sy, egg.progress);
          ctx.globalAlpha = 1;
          break;
        }
        case 'plane': {
          const x = egg.x + egg.progress * (w + 80);
          const bob = Math.sin(ts * 0.001) * 4;
          const alpha = egg.progress < 0.05
            ? egg.progress / 0.05
            : egg.progress > 0.95
              ? (1 - egg.progress) / 0.05
              : 1;
          ctx.globalAlpha = alpha;
          drawPaperAirplane(ctx, x, egg.y + bob);
          ctx.globalAlpha = 1;
          break;
        }
        case 'balloon': {
          const y = egg.y - egg.progress * (h + 140);
          const sway = Math.sin(ts * 0.0008) * 8;
          const alpha = egg.progress < 0.06
            ? egg.progress / 0.06
            : egg.progress > 0.9
              ? (1 - egg.progress) / 0.1
              : 1;
          ctx.globalAlpha = alpha;
          drawHotAirBalloon(ctx, egg.x + sway, y);
          ctx.globalAlpha = 1;
          break;
        }
        case 'lightning': {
          const flash = Math.floor(ts * 0.003) % 5 === 0;
          const alpha = egg.progress < 0.08
            ? egg.progress / 0.08
            : egg.progress > 0.85
              ? (1 - egg.progress) / 0.15
              : 1;
          ctx.globalAlpha = alpha;
          drawLightningCloud(ctx, egg.x, egg.y, flash);
          ctx.globalAlpha = 1;
          break;
        }
        case 'satellite': {
          const x = egg.x + egg.progress * (w + 80);
          const alpha = egg.progress < 0.05
            ? egg.progress / 0.05
            : egg.progress > 0.95
              ? (1 - egg.progress) / 0.05
              : 1;
          ctx.globalAlpha = alpha;
          drawSatellite(ctx, x, egg.y);
          ctx.globalAlpha = 1;
          break;
        }
      }

      if (egg.progress >= 1) {
        egg.type = null;
        const baseDelay = isNightSlot(slot)
          ? 45000 + Math.random() * 45000
          : 60000 + Math.random() * 60000;
        nextEggAt = ts + baseDelay;
      }
    };

    const loop = (ts: number) => {
      if (lastRef.current === null) lastRef.current = ts;
      const dt = ts - lastRef.current;
      lastRef.current = ts;
      tRef.current += dt * 0.001;

      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      /* El degradado del cielo, y nada mas. Antes eran siete `case` con sus
         tres o cuatro paradas escritas dentro, y las dos franjas de noche
         tenían el mismo degradado copiado dos veces. Con la paleta en un
         lugar, agregar una franja es una linea en `CIELO` y no un caso nuevo
         que se puede olvidar. */
      drawSkyGradient(ctx, w, h, CIELO[slot] ?? CIELO.manana);

      // ── Slot-specific elements ──
      sunRotation += 0.003;

      switch (slot) {
        case 'madrugada': {
          // Stars + crescent moon
          drawStars(ctx, stars, tRef.current);
          moonX += 0.00008;
          const mxPos = (0.15 + ((moonX * 0.05) % 0.3)) * w;
          drawCrescentMoon(ctx, mxPos, h * 0.2, 28, -0.2);
          // Wispy cloud strips
          ctx.globalAlpha = 0.07;
          ctx.fillStyle = LUNA.nubeStrip;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.ellipse(w * (0.2 + i * 0.3), h * (0.35 + i * 0.08), w * 0.18, h * 0.02, -0.08, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          break;
        }
        case 'amanecer': {
          // Fading stars
          const starAlpha = 0.5;
          drawStars(ctx, stars.slice(0, 40), tRef.current, starAlpha);
          // Half-sun on horizon
          const sunY = h * 0.88;
          const sunR = 34;
          // Long animated rays
          ctx.save();
          ctx.translate(w * 0.5, sunY);
          const rayCount = 16;
          for (let i = 0; i < rayCount; i++) {
            const a = (i / rayCount) * Math.PI * 2 + sunRotation;
            const pulse = 1 + 0.12 * Math.sin(tRef.current * 2 + i);
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * (sunR * 1.1), Math.sin(a) * (sunR * 1.1));
            ctx.lineTo(Math.cos(a) * sunR * 2.5 * pulse, Math.sin(a) * sunR * 2 * pulse);
            ctx.strokeStyle = LUNA.rayo;
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.stroke();
          }
          ctx.restore();
          // Sun circle clipped to horizon
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, w, sunY);
          ctx.clip();
          ctx.beginPath();
          ctx.arc(w * 0.5, sunY, sunR, 0, Math.PI * 2);
          ctx.fillStyle = SOL.disco;
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'manana': {
          // Cartoon sun top-center
          drawSolCinematico(ctx, w * 0.78, h * 0.22, 36, sunRotation, SOL.nucleo);
          // Drifting clouds
          clouds.forEach((c) => {
            c.x = (c.x + c.speed) % 1.2;
            drawFluffyCloud(ctx, c.x * w, c.y * h, c.scale, 'var(--color-text-on-accent)', 0.88);
          });
          break;
        }
        case 'mediodia': {
          // Sun near zenith
          const pulse = 1 + 0.04 * Math.sin(tRef.current * 3);
          drawSolCinematico(ctx, w * 0.5, h * 0.18, 38 * pulse, sunRotation, SOL.disco);
          // Heat shimmer near horizon
          ctx.save();
          ctx.globalAlpha = 0.08;
          for (let i = 0; i < 5; i++) {
            const waveY = h * 0.82 + i * 4;
            const waveAmp = 3;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let x = 0; x < w; x += 4) {
              const y = waveY + Math.sin((x * 0.04) + tRef.current * 2 + i) * waveAmp;
              if (x === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
          ctx.restore();
          // Small cloud
          drawFluffyCloud(ctx, w * 0.2, h * 0.3, 0.7, 'var(--color-text-on-accent)', 0.75);
          break;
        }
        case 'tarde': {
          // Sun lower-right with warm long rays
          drawSolCinematico(ctx, w * 0.82, h * 0.55, 32, sunRotation, TONOS.solTarde);
          // Warm drifting clouds
          clouds.forEach((c) => {
            c.x = (c.x + c.speed * 0.8) % 1.2;
            drawFluffyCloud(ctx, c.x * w, c.y * h, c.scale, TONOS.nubeTarde, 0.72);
          });
          break;
        }
        case 'atardecer': {
          // Large semicircle sun on horizon
          const horizY = h * 0.78;
          const sR = 48;
          // Sunset ray fan
          ctx.save();
          ctx.translate(w * 0.5, horizY);
          const fanCount = 18;
          for (let i = 0; i < fanCount; i++) {
            const a = (i / fanCount) * Math.PI * 2;
            const pulse = 1 + 0.09 * Math.sin(tRef.current + i);
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * (sR * 1.05), Math.sin(a) * (sR * 1.05));
            ctx.lineTo(Math.cos(a) * sR * 3.2 * pulse, Math.sin(a) * sR * 2.2 * pulse);
            ctx.strokeStyle = `rgba(245,124,0,${TONOS.fanAtardecer * (1 - i / fanCount)})`;
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.stroke();
          }
          ctx.restore();
          // Semicircle clip
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, w, horizY);
          ctx.clip();
          ctx.beginPath();
          ctx.arc(w * 0.5, horizY, sR, 0, Math.PI * 2);
          ctx.fillStyle = SOL.disco;
          ctx.fill();
          ctx.restore();
          // First stars appearing
          drawStars(ctx, stars.slice(0, 25), tRef.current, 0.6);
          break;
        }
        case 'noche': {
          // Stars + crescent moon drifting slowly
          drawStars(ctx, stars, tRef.current);
          moonX += 0.00006;
          const mxNight = (0.12 + ((moonX * 0.04) % 0.35)) * w;
          drawCrescentMoon(ctx, mxNight, h * 0.18, 26, -0.15);
          break;
        }
      }

      // ── Easter eggs ──
      const now = Date.now();
      if (!egg.type && now >= nextEggAt) {
        spawnEgg(ts);
      }
      if (egg.type) {
        drawEgg(ts);
      }

      // ── Vignette overlay ──
      drawVignette(ctx, w, h);

      rafRef.current = requestAnimationFrame(loop);
    };

    /* `matchMedia` no es una API con garantía: no está en el jsdom de las
       pruebas y no está en WebViews viejos. La escena del cielo es decorativa,
       así que si la API falta lo correcto es dibujar el fondo y seguir —en
       movimiento, porque no nos dijo que lo quiere apagado— y no romper la
       pantalla de inicio, que es donde la persona decide si sube su tesis. */
    const reduceMotion =
      typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Y si sí lo pidió, un fotograma y nada más: la escena se ve, no se
       mueve. Un cuadro estático es la manera correcta de respetarlo; apagar el
       canvas entero leería como un fallo. */
    if (reduceMotion) {
      // Draw a single static frame
      requestAnimationFrame((ts) => {
        lastRef.current = ts;
        loop(ts);
        cancelAnimationFrame(rafRef.current);
      });
    } else {
      rafRef.current = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    const cleanup = initCanvas();
    return cleanup;
  }, [initCanvas]);

  return (
    <div
      style={{
        textAlign: 'center',
        /* Padding vertical generoso: con seis píxeles arriba y el cielo de dos
           cientos de alto detrás, la frase queda pegada al borde y el
           contenedor se lee como un recorte en vez de como una escena. El
           pedido fue "expande un poco ese contenedor". */
        padding: '44px 24px 52px',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'var(--radius-xl)',
      }}
    >
      {/* Animated time-of-day canvas background */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          display: 'block',
        }}
      />

      {/* Dark overlay for text readability */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--scrim-overlay)',
          borderRadius: 'var(--radius-xl)',
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      />

      {/* Phrase and chips sit above canvas (z-index via position:relative) */}
      <div style={{ position: 'relative' }}>
        {/* Frase principal rotatoria — altura fija para que el layout no salte */}
        <div
          key={fadeKey}
          className="hero-phrase-in"
          style={{
            /* 40px, no 36. El pedido fue que se veía demasiado pequeño, y
               agrandar el contenedor sin agrandar la frase deja más cielo con el
               mismo texto: eso es un fondo vacío. */
            fontSize: '40px',
            fontWeight: 900,
            lineHeight: 1.18,
            letterSpacing: '-0.02em',
            color: 'var(--color-text-on-accent)',
            textShadow: '0 2px 16px var(--color-ink-a55), 0 1px 3px var(--color-ink-a40)',
            margin: '0 auto',
            maxWidth: '960px',
            /* El alto reservado sigue al `line-clamp`: 2 renglones × 40px ×
               1.18 ≈ 95px. Con los 86px de antes, una frase de dos renglones se
               recortaba en silencio y la persona creía que la app no había
               cargado. `homeHeroAire.test.tsx` deriva uno del otro, así que
               cambiar la tipografía sin cambiar esto rompe la prueba. */
            minHeight: '96px',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
          }}
        >
          {phrase.text}
        </div>
      </div>
    </div>
  );
};

export default HomeHero;
