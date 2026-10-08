/* WordAPA7 — Chistes de estudiante (contextuales).
 * Categorías que se disparan por contexto real:
 *  - Nombre de archivo (al subir): detecta "final", "definitivo", "v3"…
 *  - Racha / reincidencia (segundo documento en la sesión).
 *  - Tamaño del documento (páginas / figuras / tablas).
 *  - Hora / temporada (madrugada, domingo a la noche).
 * Los mensajes van SIN emojis: son UI de sistema, no comentarios.
 */

import { hashStr } from './utils';

// ── Nombre de archivo ────────────────────────────────────────────────────────

const FILENAME_PATTERN_RE = /(final|definitiv|ultim|_v\d|entrega|\bv2\b|\bv3\b|\b(?:^|_|-)final\b)/i;

const FILENAME_JOKES: string[] = [
  'el clásico de todo estudiante: "final" y una versión más.',
  'ya perdimos la cuenta de cuántos "final" llevás en el nombre.',
  '"definitivo"... por ahora.',
  'esa nomenclatura de archivo ya es parte del folklore universitario.',
  'entre "final" y "FINAL_v3" seguro hubo varias noches sin dormir.',
  'el archivo "final_final_ahora_si_listo.docx" es patrimonio académico.',
  'si le agregás otro "final" al nombre, va a necesitar su propia portada.',
  'tranquilo: nadie entrega la versión 1 de nada.',
];

/** Detector del nombre: devuelve un chiste si parece "versión final eterna". */
export function getFilenameComment(fileName: string): string | null {
  const base = (fileName || '').replace(/\.(docx|doc)$/i, '');
  if (!FILENAME_PATTERN_RE.test(base)) return null;
  return FILENAME_JOKES[hashStr(base) % FILENAME_JOKES.length];
}

// ── Racha / reincidencia (por sesión) ────────────────────────────────────────

const REPEAT_JOKES: string[] = [
  'otra vez por acá... ¿cuántos trabajos tenés pendientes?',
  'segundo documento en la sesión. La productividad te respeta.',
  'ya van varios por hoy... ¿estamos armando una tesis o un expediente?',
  'modo maratón activado: documento que entra, documento que sale con APA impecable.',
  'otro doc más a la cuenta... el título universitario está cada vez más cerca.',
];

/** Incrementa el contador de la sesión y devuelve un chiste si es reincidencia. */
export function getRepeatComment(): string | null {
  let count = Number(sessionStorage.getItem('wordapa7-uploads') || '0');
  count += 1;
  sessionStorage.setItem('wordapa7-uploads', String(count));
  if (count < 2) return null;
  return REPEAT_JOKES[Math.min(count - 2, REPEAT_JOKES.length - 1)];
}

// ── Tamaño del documento ─────────────────────────────────────────────────────

/** Reacción al volumen real del documento. Retorna null si no hay nada llamativo. */
export function getSizeComment(pageCount: number, figureCount: number, tableCount: number): string | null {
  if (pageCount >= 150) return 'esto ya es tesis, no trabajo.';
  if (pageCount >= 100) return 'esto no es un trabajo, es una novela.';
  if (pageCount > 0 && pageCount <= 2) return 'directo al grano, así me gusta.';
  if (figureCount + tableCount >= 30) return 'documento bien ilustrado, eh.';
  return null;
}

// ── Hora / temporada ─────────────────────────────────────────────────────────

const TIME_SLOT_COMMENTS: Array<{ test: (h: number, day: number) => boolean; pool: string[] }> = [
  // Madrugada (1–5)
  {
    test: (h) => h >= 1 && h < 5,
    pool: [
      'madrugada y todavía formateando... el horario sagrado de las entregas.',
      'son las tantas y acá seguimos: el café y la sangría francesa no se rinden.',
      '3 AM y la app te acompaña. El profe no lo va a saber, pero tu entrega sí.',
      'el silencio de la madrugada solo lo rompe el teclado y tu entrega pendiente.',
      'Una entrega a las 3 AM: clásico de todo estudiante.',
      'Madrugada... el horario sagrado de las entregas.',
      'A esta hora solo quedan los valientes y el café.',
    ],
  },
  // Domingo a la noche
  {
    test: (h, day) => day === 0 && h >= 17,
    pool: [
      'domingo a la noche... el horario sagrado de las entregas.',
      'domingo, Word abierto y la ansiedad del lunes. Un clásico.',
      'domingo por la noche: mientras todos descansan, vos pulís el formato.',
      'Domingo a la noche... el horario sagrado de las entregas.',
      'Domingo, Word abierto y ansiedad de lunes. Qué ritual.',
    ],
  },
  // Viernes a la tarde/noche
  {
    test: (h, day) => day === 5 && h >= 15,
    pool: [
      'viernes por la tarde... el profe ya está de finde, vos no.',
      'viernes y con Word abierto: la entrega también tiene su viernes.',
      '¿Viernes y con un Word abierto? Sos un guerrero.',
    ],
  },
  // Lunes temprano
  {
    test: (h, day) => day === 1 && h < 9,
    pool: [
      'lunes temprano y ya estás formateando... respeto total.',
      'lunes a la mañana: el café no terminó de actuar y ya hay sangrías que arreglar.',
      'Lunes temprano y ya estás formateando... respeto.',
      'Lunes 8 AM y el café aún no hace efecto. Igual avanzamos.',
    ],
  },
  // Sábado a la mañana
  {
    test: (h, day) => day === 6 && h < 12,
    pool: [
      'sábado a la mañana y acá estamos: la bibliografía no se hace sola.',
      'sábado temprano, café en mano y un documento que ordenar.',
      'Sábado a la mañana... la bibliografía no se va a hacer sola.',
    ],
  },
  // Entre semana a la noche (>=22h)
  {
    test: (h, day) => day >= 2 && day <= 4 && h >= 22,
    pool: [
      'entre semana a esta hora... esa entrega no se va a formatear sola.',
      'noche de semana y acá: la tesis agradece el sacrificio.',
      'Noche de semana y vos acá. La tesis agradece el sacrificio.',
    ],
  },
  // Después de la medianoche (>=23)
  {
    test: (h) => h >= 23,
    pool: [
      'pasó la medianoche... el formato fino también pasa factura.',
      'medianoche y la app sigue. Ya casi, prometido.',
      'Pasó la medianoche... el formato fino también pasa factura.',
    ],
  },
];

/** Detecta franjas típicas de entrega (madrugada, domingo a la noche). */
export function getTimeOfWeekComment(now: Date = new Date()): string | null {
  const h = now.getHours();
  const day = now.getDay();
  for (const slot of TIME_SLOT_COMMENTS) {
    if (slot.test(h, day)) {
      return slot.pool[Math.floor(Math.random() * slot.pool.length)];
    }
  }
  return null;
}

/** Todas las frases de horario que aplican en este momento (para home hero rotativo). */
export function getTimeSlotPhrases(now: Date = new Date()): string[] {
  const h = now.getHours();
  const day = now.getDay();
  const phrases: string[] = [];
  for (const slot of TIME_SLOT_COMMENTS) {
    if (slot.test(h, day)) {
      phrases.push(slot.pool[Math.floor(Math.random() * slot.pool.length)]);
    }
  }
  return phrases;
}
