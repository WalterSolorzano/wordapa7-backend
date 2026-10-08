/* WordAPA7 — Comentario estilo WhatsApp animado para el previsualizador.
 *
 * T20: FUERA DEL ALCANCE DEL LINT DE TOKENS, y aquí está dicho para que el que
 *   llegue no tenga que preguntarlo. Este archivo es la BURBUJA del comentario, y
 *   AGENTS.md §2 exige que un hallazgo aparezca en DOS canales a la vez —el
 *   subrayado inline y la burbuja— y que digan lo mismo. El canal inline es
 *   `ReadingText`, que SÍ está en el alcance del lint; este, su hermano, no:
 *   la guarda cubre media pareja. No es una exención: el veto al color literal
 *   alcanza a este archivo cuando alguien meta el diseño en tokens, y mientras
 *   tanto el que lo lea tiene el aviso delante.
 *
 * Sistema híbrido de comentarios:
 *  - BIBLIOTECA: plantillas instantáneas y variadas (emojis, muletillas IA,
 *    citas fantasma, formato APA, redacción, estructura, positivo).
 *  - IA: el LLM genera frases únicas con contexto + ejemplos (solo para
 *    categorías "de criterio", con tope de llamadas por sesión). Mientras el
 *    LLM escribe se muestra la animación "escribiendo…". Si no hay API key,
 *    tarda demasiado (>45s) o falla, se cae a la biblioteca.
 */

import React, { useState, useEffect, useRef } from 'react';
import { ElementModel } from '../../types';
import { useDocStore } from '../../store/useDocStore';
import { generateChatComment, suggestCaption } from '../../api/backend';
import { findCitationsInText } from '../../lib/citationHighlighter';
import { accentMatchSlice } from '../../lib/accentMatch';
import { buildCommentContext } from '../../lib/commentContext';
import { DocumentMascot, MascotExpression, MascotKind } from './DocumentMascot';
import { PenLine, X, BookOpen, CheckCheck, Sparkles } from 'lucide-react';
import { hashStr } from '../../lib/utils';

// ── DETECCIÓN ────────────────────────────────────────────────────────────────

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2764}\u{2714}\u{2718}\u{2705}\u{274C}\u{2611}]/u;

const CONCLUSION_TRIGGERS = [
  'en conclusion', 'en resumen', 'en sintesis', 'en definitiva',
  'para concluir', 'en ultima instancia', 'para finalizar',
];

const AI_TRIGGERS = [
  'cabe destacar', 'es importante destacar', 'es menester',
  'en el contexto actual', 'no cabe duda', 'huelga decir',
  'vale la pena mencionar', 'en el marco de', 'en primer lugar',
];

const EN_STOP = new Set(['the', 'and', 'of', 'to', 'is', 'are', 'we', 'you',
  'this', 'that', 'with', 'from', 'for', 'our', 'their', 'has', 'have', 'it']);
const ES_STOP = new Set(['de', 'el', 'la', 'los', 'las', 'y', 'que', 'en',
  'por', 'para', 'con', 'del', 'una', 'un', 'se', 'su', 'al']);

const FIRST_PERSON_RE = /\b(yo|nosotros|nosotras|nuestro|nuestra|nuestros|nuestras)\b|\b(?:creo|pienso|considero|opino)\s+que\b/i;
// E4: el mínimo baja a 2 letras para atrapar typos reales del teclado como
// "de de" y "la la". El guard de DUP_STOPWORDS (abajo) evita los falsos
// positivos de stopwords muy frecuentes ("que que", "se se").
const DUPLICATE_RE = /(?<!\p{L})(\p{L}{2,})\s+\1(?!\p{L})/iu;
/** Stopwords cuyas repeticiones suelen ser falsos positivos (no typos del
 *  teclado). "de"/"la" quedan FUERA de esta lista: su repetición SÍ es un
 *  error real que hay que marcar. */
const DUP_STOPWORDS = new Set(['que', 'se']);
const ACRONYM_RE = /\b(?:[A-ZÁÉÍÓÚÑ]\.){2,}/;
const EXCESS_PUNCT_RE = /[!?]{2,}/;

function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Renderiza formateo inline Markdown (_texto_ o *texto*) sin mostrar guiones bajos ni asteriscos crudos. */
export function renderFormattedCommentText(text: string): React.ReactNode {
  if (!text) return null;
  const cleaned = text.replace(/_/g, '');
  const parts = cleaned.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i} style={{ fontStyle: 'italic' }}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

/** Primer fragmento contiguo del texto que disparó el comentario (para resaltarlo). */
function findMatch(text: string, re: RegExp): string | null {
  const m = (text || '').match(re);
  return m ? m[0] : null;
}

/** Primer duplicado de palabra cuyo término NO sea una stopword muy común
 *  (ej. "que que", "se se"). Bajar DUPLICATE_RE a 2 letras atrapa "de de" y
 *  "la la"; este guard evita los falsos positivos de "que/se".
 *  Devuelve el fragmento repetido y la palabra original (con su capitalización). */
function findDuplicateWord(text: string): { match: string; word: string } | null {
  const re = new RegExp(DUPLICATE_RE.source, 'giu');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text || '')) !== null) {
    const word = m[1].toLowerCase();
    if (!DUP_STOPWORDS.has(word)) return { match: m[0], word: m[1] };
  }
  return null;
}

function isSpanglish(text: string): boolean {
  const words = (text || '').toLowerCase().split(/[^a-záéíóúñ]+/i).filter(Boolean);
  if (words.length < 8) return false;
  let en = 0, es = 0;
  for (const w of words) {
    if (EN_STOP.has(w)) en += 1;
    if (ES_STOP.has(w)) es += 1;
  }
  return en >= 2 && es >= 2;
}

// ── MENSAJES (pools variados) ────────────────────────────────────────────────

interface ChatLine {
  emoji: string;
  text: string;
  fill?: (elem: ElementModel, ctx: WhatsAppContext) => string;
}

export interface WhatsAppContext {
  ghostCitations: any[];
  orphanReferences: any[];
  validationIssues: any[];
  /** True tras ejecutar "Auditar párrafos": habilita los comentarios de
   *  estilo/redacción (primera persona, siglas, spanglish, "cabe destacar"…).
   *  Sin esta bandera solo se muestran fallas ESTRUCTURALES duras (citas
   *  fantasma, validación, emojis, figuras sin leyenda), para no inundar
   *  al usuario con comentarios que él no pidió. */
  styleAuditRun?: boolean;
}

const EMPTY_CTX: WhatsAppContext = { ghostCitations: [], orphanReferences: [], validationIssues: [] };

const EMOJI_COMMENTS: ChatLine[] = [
  { emoji: '', text: 'bro? como quien dice que es esto?' },
  { emoji: '', text: '¿emojis en el Word? se te salió el ChatGPT, bro' },
  { emoji: '', text: 'eso se ve como copiado del chat jaja' },
  { emoji: '', text: 'brou, los emojis quedaron pegados del WhatsApp' },
  { emoji: '', text: '¿esto es una tesis o un post de Facebook? jaja' },
];

const TABLE_EMOJI_COMMENTS: ChatLine[] = [
  { emoji: '', text: 'bro? la tabla tiene emojis de checklist, ¿de dónde salió?' },
  { emoji: '', text: 'eso parece una matriz que te pasó el chat, bro' },
  { emoji: '', text: '¿estos  y  son parte de la norma APA? jaja' },
  { emoji: '', text: 'la tabla quedó con las marquitas de la IA, brou' },
];

const CONCLUSION_COMMENTS: ChatLine[] = [
  { emoji: '', text: 'otro "en resumen"… seguro se puede decir distinto' },
  { emoji: '', text: '"en conclusión" aparece seguido, probá otra forma de cerrar' },
  { emoji: '', text: 'ese cierre suena muy de plantilla, dale un toque propio' },
  { emoji: '', text: 'casi lo dejás tal cual, un pelito de variedad y queda' },
  { emoji: '', text: '¿"en definitiva"? un sinónimo y queda más natural' },
  { emoji: '', text: '"en síntesis"… se nota de dónde salió, cambiala un poco' },
];

const AI_COMMENTS: ChatLine[] = [
  { emoji: '', text: 'eso de "cabe destacar" suena bastante a generador' },
  { emoji: '', text: '"es importante destacar"… capaz lo decís más simple' },
  { emoji: '', text: 'brou, esa frase es clásica de texto generado' },
  { emoji: '', text: 'ese conectivo es muy de robot, otro sonaría más tuyo' },
  { emoji: '', text: '¿lo redactaste vos o lo ayudó el robot? jaja, un toque más natural' },
  { emoji: '', text: 'alguien tradujo esto con IA y se nota el "asimismo".' },
  { emoji: '', text: 'contando cuántos "asimismo" hay en el documento (van 12).' },
];

const GHOST_CITATION_COMMENTS: ChatLine[] = [
  { emoji: '', text: 'esta cita es de pablito? {author} no aparece en la bibliografía', fill: (e, ctx) => `esta cita es de pablito? ${authorOf(ctx, e)} no aparece en la bibliografía` },
  { emoji: '', text: 'esa cita de {author} no tiene dueño en las referencias', fill: (e, ctx) => `esa cita de ${authorOf(ctx, e)} no tiene dueño en las referencias` },
  { emoji: '', text: '¿{author} existe o te lo inventaste?', fill: (e, ctx) => `¿${authorOf(ctx, e)} existe o te lo inventaste?` },
  { emoji: '', text: 'bro, citaste a {author} pero no está en la bibliografía', fill: (e, ctx) => `bro, citaste a ${authorOf(ctx, e)} pero no está en la bibliografía` },
];

const ORPHAN_COMMENTS: ChatLine[] = [
  { emoji: '', text: 'tienes {n} referencia(s) que nunca citaste en el texto', fill: (_e, ctx) => `tienes ${ctx.orphanReferences.length} referencia(s) que nunca citaste en el texto` },
  { emoji: '', text: '{n} referencias sin usar… ¿de adorno?', fill: (_e, ctx) => `${ctx.orphanReferences.length} referencias sin usar… ¿de adorno?` },
  { emoji: '', text: 'algo anda mal: {n} refs que nunca se mencionan', fill: (_e, ctx) => `algo anda mal: ${ctx.orphanReferences.length} refs que nunca se mencionan` },
];

const VALIDATION_COMMENTS: Record<string, ChatLine[]> = {
  figuras: [
    { emoji: '', text: '¿y el número o la leyenda de la figura? profe lo pide' },
    { emoji: '', text: 'esta figura no respeta el formato APA, brou' },
  ],
  tablas: [
    { emoji: '', text: 'esa tabla no está en formato APA, brou' },
    { emoji: '', text: '¿título y bordes en la tabla? la profe lo pide' },
  ],
  headings: [
    { emoji: '', text: 'algo raro con este título, bro' },
    { emoji: '', text: 'este heading no respeta la jerarquía' },
  ],
  formato: [
    { emoji: '', text: 'che, esto no respeta el formato APA' },
    { emoji: '', text: 'formato pedido por la profe, brou' },
  ],
  citas: [{ emoji: '', text: 'esta cita tiene algo raro, brou' }],
  referencias: [{ emoji: '', text: 'esto de la bibliografía no cuadra' }],
  consistencia: [{ emoji: '', text: 'inconsistencia por acá, bro' }],
};

const SHOUT_COMMENTS: ChatLine[] = [
  { emoji: '', text: '¿lo escribís todo en mayúsculas? el profe lo va a notar' },
  { emoji: '', text: 'todo en mayúsculas suena a grito, mejor normal' },
  { emoji: '', text: 'bajá un poco el volumen, no es necesario gritar' },
];

const SPANGLISH_COMMENTS: ChatLine[] = [
  { emoji: '', text: '¿inglés y español en la misma frase? una cosa a la vez' },
  { emoji: '', text: '¿"the"? estamos en un trabajo en español, ojo con eso' },
  { emoji: '', text: 'mezcla de idiomas por acá… mejor quedarse en uno' },
];

const DUPLICATE_COMMENTS: ChatLine[] = [
  { emoji: '', text: '¿"la la"? se te pegó el teclado' },
  { emoji: '', text: 'repetiste "{w}" sin querer, seguro', fill: (e) => `repetiste "${findDuplicateWord(e.text || '')?.word || 'la'}" sin querer, seguro` },
  { emoji: '', text: 'ctrl+c y ctrl+v se te fueron de las manos' },
];

const LONG_PARAGRAPH_COMMENTS: ChatLine[] = [
  { emoji: '', text: 'respirá, es un párrafo larguísimo' },
  { emoji: '', text: 'ese párrafo tiene {n} palabras, capaz conviene dividirlo', fill: (e) => `ese párrafo tiene ${(e.text || '').split(/\s+/).length} palabras, capaz conviene dividirlo` },
  { emoji: '', text: 'una sola oración de por vida, brou' },
];

const FIRST_PERSON_COMMENTS: ChatLine[] = [
  { emoji: '', text: '¿"yo" en un paper? en APA se evita' },
  { emoji: '', text: 'primera persona en un trabajo académico? mejor impersonal' },
  { emoji: '', text: 'el "yo/nosotros" en la academia no es lo ideal, probá impersonal' },
];

const ACRONYM_COMMENTS: ChatLine[] = [
  { emoji: '', text: '¿qué es {acr}? definilo en la primera mención', fill: (e) => `¿qué es ${(e.text || '').match(ACRONYM_RE)?.[0] || 'esa sigla'}? definila en la primera mención` },
  { emoji: '', text: 'abreviatura sin definir, conviene aclararla' },
  { emoji: '', text: 'sigla misteriosa por acá… ¿su significado?' },
];

const EXCESS_PUNCT_COMMENTS: ChatLine[] = [
  { emoji: '', text: '¿¡¡?? te emocionaste? un solo signo alcanza' },
  { emoji: '', text: '¿cuántos signos? tranqui, uno solo' },
];

const IMAGE_NO_CAPTION_COMMENTS: ChatLine[] = [
  { emoji: '', text: '¿y la leyenda de la figura?' },
  { emoji: '', text: 'figura sin nota, profe lo pide' },
  { emoji: '', text: 'alguien no le puso título a "Sin título 1" todavía.' },
];

const IMAGE_SOURCE_COMMENTS: ChatLine[] = [
  { emoji: '', text: 'esa imagen pixelada llegó directo de un grupo de WhatsApp.' },
  { emoji: '', text: 'ese gráfico de Excel pegado se ve como se ve, bro.' },
  { emoji: '', text: 'esto lo sacaste del grupo de la facu, ¿no?' },
  { emoji: '', text: 'brou, este screenshot no engaña a nadie.' },
];

const TABLE_STYLE_COMMENTS: ChatLine[] = [
  { emoji: '', text: 'esa tabla tiene más colores que un semáforo.' },
  { emoji: '', text: 'tabla arcoíris… la profe pidió APA, no una feria.' },
  { emoji: '', text: 'los colores de la tabla compiten con el texto, bro.' },
];

const COPYPASTE_COMMENTS: ChatLine[] = [
  { emoji: '', text: 'alguien copió y pegó de PDF, se nota.' },
  { emoji: '', text: 'ctrl+c, ctrl+v, rezar... ese es tu flujo de trabajo, ¿no?' },
  { emoji: '', text: 'este texto tiene más saltos raros que un PDF mal exportado.' },
];

const EQUATION_COMMENTS: ChatLine[] = [
  { emoji: '', text: 'ecuación matemática detectada: centrada y con numeración (1) a la derecha' },
  { emoji: '', text: 'fórmula lista para formato APA 7 con alineación limpia' },
];

const BLOCK_QUOTE_COMMENTS: ChatLine[] = [
  { emoji: '', text: 'cita en bloque de >40 palabras: va sin comillas y con sangría de 1.27 cm' },
  { emoji: '', text: 'cita larga detectada: formateada como bloque independiente según APA 7' },
];

const PROACTIVE_CAPTION_COMMENTS: ChatLine[] = [
  { emoji: '', text: 'la IA le dedujo título y nota APA según el contexto del párrafo' },
  { emoji: '', text: 'leyenda sugerida automáticamente en base al texto adyacente' },
];

const POSITIVE_COMMENTS: ChatLine[] = [
  { emoji: '', text: 'esta parte está limpia, ni te voy a molestar' },
  { emoji: '', text: 'todo bien por acá, seguí así' },
  { emoji: '', text: 'no hay nada que corregir, tremendo' },
  { emoji: '', text: 'limpio. ni una queja, bro' },
];

// Categorías que van al LLM (las de "criterio"); el resto es biblioteca instantánea
const IA_KINDS = new Set([
  'ghost_citation', 'orphan_references', 'shouting', 'spanglish', 'duplicate',
  'long_paragraph', 'first_person', 'acronym', 'excess_punctuation',
  'validation_figuras', 'validation_tablas', 'validation_headings',
  'validation_formato', 'validation_citas', 'validation_referencias',
  'validation_consistencia',
]);

// Tope de llamadas LLM por sesión (el usuario baja lento, no spam de red)
let iaCallCount = 0;
const IA_CALL_CAP = 6;
const iaCache = new Map<string, string>();

function canUseIA(kind: string): boolean {
  return IA_KINDS.has(kind) && iaCallCount < IA_CALL_CAP;
}

function authorOf(ctx: WhatsAppContext, elem: ElementModel): string {
  const g = ctx.ghostCitations.find((c) => c.element_id === elem.id);
  const a = g?.authors?.[0];
  if (a) {
    const parts = String(a).split(',');
    return parts[0]?.trim() || a;
  }
  const raw = String(g?.raw_text || '').match(/^([A-Za-zÁÉÍÓÚÑáéíóúñ''\s\-&]+?)\s*\(/);
  return raw ? raw[1].trim() : 'ese autor';
}

function pickByElement(lines: ChatLine[], id: string, nonce: number): ChatLine {
  let h = 0;
  const seed = `${id}-${nonce}`;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return lines[h % lines.length];
}

export interface WhatsAppCommentData {
  emoji: string;
  text: string;
  kind: string;
  /** Fragmento del texto que disparó el comentario (para resaltarlo en el preview). */
  match?: string;
}

const SHOUT_PHRASE_RE = /[A-ZÁÉÍÓÚÑ]{4,}(?:[ ,.'"·]+[A-ZÁÉÍÓÚÑ]{4,}){0,8}/;

/** Detección de biblioteca: qué comentario merece un elemento (sin LLM). */
export function getWhatsAppComment(
  elem: ElementModel,
  ctx: WhatsAppContext = EMPTY_CTX,
  nonce = 0,
): WhatsAppCommentData | null {
  if (!elem) return null;
  // Portada intocable: ni comentarios. El logo no necesita "leyenda" y los
  // metadatos (carnets, fechas) no son citas. Cero ruido sobre la portada.
  if ((elem as any).is_cover_section) return null;
  const text = elem.text || '';

  const ghost = ctx.ghostCitations?.find((c) => c.element_id === elem.id);
  if (ghost) {
    const l = pickByElement(GHOST_CITATION_COMMENTS, elem.id, nonce);
    return { emoji: l.emoji, text: l.fill ? l.fill(elem, ctx) : l.text, kind: 'ghost_citation', match: ghost.raw_text || findMatch(text, /\([^)]*?\d{4}[^)]*?\)/) || undefined };
  }

  // Cita APA detectada en el texto: confirma al usuario que el sistema la ve
  // y si cumple APA 7 (verde) o tiene un error de formato (ámbar/rojo).
  if (elem.type === 'paragraph' || elem.type === 'bullet' || elem.type === 'numbered_list' || elem.type === 'block_quote') {
    const citations = findCitationsInText(text);
    if (citations.length > 0) {
      const bad = citations.find((c) => c.error);
      if (bad) {
        return {
          emoji: '',
          text: `Detecté esta cita: ${bad.raw}. Ojo: ${bad.error}.`,
          kind: 'citation_error',
          match: bad.raw,
        };
      }
      // Confirmación verde: solo después de una auditoría explícita, para no
      // llenar el documento de "Cita APA detectada" en cada párrafo.
      if (ctx.styleAuditRun) {
        const first = citations[0];
        const authorLabel = first.authors.slice(0, 2).join(' y ') || first.raw;
        return {
          emoji: '',
          text: `Cita APA 7 detectada: ${authorLabel} (${first.year}). Está bien formateada.`,
          kind: 'citation_ok',
          match: first.raw,
        };
      }
    }
  }

  if (elem.type === 'table' && elem.table_info) {
    const cells: string[] = [...(elem.table_info.headers || [])];
    (elem.table_info.rows || []).forEach((row) => cells.push(...(row || [])));
    if (cells.some((c) => EMOJI_RE.test(c || ''))) {
      const l = pickByElement(TABLE_EMOJI_COMMENTS, elem.id, nonce);
      return { emoji: l.emoji, text: l.text, kind: 'table_emoji', match: findMatch(text, EMOJI_RE) || undefined };
    }
  }

  if (EMOJI_RE.test(text)) {
    const l = pickByElement(EMOJI_COMMENTS, elem.id, nonce);
    return { emoji: l.emoji, text: l.text, kind: 'emoji', match: findMatch(text, EMOJI_RE) || undefined };
  }

  if (ctx.validationIssues?.length) {
    const issues = ctx.validationIssues.filter((i) => i.element_id === elem.id);
    if (issues.length) {
      const cat = String(issues[0].category || '').toLowerCase();
      const pool = VALIDATION_COMMENTS[cat] || VALIDATION_COMMENTS.consistencia;
      const l = pickByElement(pool, elem.id, nonce);
      return { emoji: l.emoji, text: l.text, kind: `validation_${cat}` };
    }
  }

  if (elem.type === 'equation') {
    const l = pickByElement(EQUATION_COMMENTS, elem.id, nonce);
    return { emoji: l.emoji, text: l.text, kind: 'equation' };
  }

  if (elem.type === 'block_quote') {
    const l = pickByElement(BLOCK_QUOTE_COMMENTS, elem.id, nonce);
    return { emoji: l.emoji, text: l.text, kind: 'block_quote' };
  }

  // Checks por tipo de elemento (imagen, tabla, copypaste)
  // van antes que triggers genéricos de texto para que el tipo de elemento pese más.
  if (elem.type === 'image' && elem.image_info) {
    const sug = (elem.image_info as any)?.suggested_caption || (elem.image_info as any)?.caption;
    if (sug && sug.trim()) {
      return {
        emoji: '',
        text: `Sugerencia APA 7: "${sug.replace(/\*/g, '').trim()}"`,
        kind: 'proactive_caption'
      };
    }
    if (!(elem.image_info.caption || '').trim()) {
      return {
        emoji: '',
        text: 'Figura sin rotulación formal APA 7. Presiona el botón para asignarle leyenda con IA.',
        kind: 'image_no_caption'
      };
    }
    if (hashStr(elem.id) % 3 === 0) {
      const l = pickByElement(IMAGE_SOURCE_COMMENTS, elem.id, nonce);
      return { emoji: l.emoji, text: l.text, kind: 'image_source' };
    }
  }

  if (elem.type === 'table') {
    const sug = (elem.table_info as any)?.suggested_caption || (elem.table_info as any)?.caption;
    if (sug && sug.trim()) {
      return {
        emoji: '',
        text: `Sugerencia APA 7: "${sug.replace(/\*/g, '').trim()}"`,
        kind: 'proactive_caption'
      };
    }
    if (!(elem.table_info?.caption || '').trim()) {
      return {
        emoji: '',
        text: 'Tabla sin rotulación formal APA 7. Presiona el botón para asignarle leyenda con IA.',
        kind: 'table_no_caption'
      };
    }
    if (hashStr(elem.id) % 4 === 0) {
      const l = pickByElement(TABLE_STYLE_COMMENTS, elem.id, nonce);
      return { emoji: l.emoji, text: l.text, kind: 'table_style' };
    }
  }

  if ((elem.type === 'paragraph' || elem.type === 'bullet') && /(\n\s*\n){2,}/.test(text)) {
    const l = pickByElement(COPYPASTE_COMMENTS, elem.id, nonce);
    return { emoji: l.emoji, text: l.text, kind: 'copypaste' };
  }

  // ── Comentarios de ESTILO/REDACCIÓN: solo tras una auditoría explícita ──
  // (el usuario presionó "Auditar párrafos"). Sin ella no se juzga al
  // estudiante: solo aparecen fallas estructurales reales.
  if (ctx.styleAuditRun && (elem.type === 'paragraph' || elem.type === 'bullet' || elem.type === 'numbered_list' || (elem.type as string) === 'block_quote')) {
    const letters = text.replace(/[^a-zA-ZÁÉÍÓÚÑáéíóúñ]/g, '');

    if (letters.length >= 6 && letters.length / Math.max(1, text.length) > 0.75 && letters === letters.toUpperCase()) {
      const l = pickByElement(SHOUT_COMMENTS, elem.id, nonce);
      return { emoji: l.emoji, text: l.text, kind: 'shouting', match: findMatch(text, SHOUT_PHRASE_RE) || undefined };
    }
    if (isSpanglish(text)) {
      const l = pickByElement(SPANGLISH_COMMENTS, elem.id, nonce);
      const enWord = text.split(/[^a-zA-ZÁÉÍÓÚÑáéíóúñ]+/i).find((w) => w && EN_STOP.has(w.toLowerCase()));
      return { emoji: l.emoji, text: l.text, kind: 'spanglish', match: enWord ? accentMatchSlice(text, enWord) : undefined };
    }
    // E4: duplicados de 2+ letras con guard de stopwords ("que", "se").
    const dup = findDuplicateWord(text);
    if (dup) {
      const l = pickByElement(DUPLICATE_COMMENTS, elem.id, nonce);
      return { emoji: l.emoji, text: l.fill ? l.fill(elem, ctx) : l.text, kind: 'duplicate', match: dup.match };
    }
    if (text.split(/\s+/).length > 60 && !/[.!?]/.test(text.slice(0, Math.floor(text.length * 0.6)))) {
      const l = pickByElement(LONG_PARAGRAPH_COMMENTS, elem.id, nonce);
      return { emoji: l.emoji, text: l.fill ? l.fill(elem, ctx) : l.text, kind: 'long_paragraph' };
    }
    if (FIRST_PERSON_RE.test(text)) {
      const l = pickByElement(FIRST_PERSON_COMMENTS, elem.id, nonce);
      return { emoji: l.emoji, text: l.text, kind: 'first_person', match: findMatch(text, FIRST_PERSON_RE) || undefined };
    }
    if (ACRONYM_RE.test(text)) {
      const l = pickByElement(ACRONYM_COMMENTS, elem.id, nonce);
      return { emoji: l.emoji, text: l.fill ? l.fill(elem, ctx) : l.text, kind: 'acronym', match: findMatch(text, ACRONYM_RE) || undefined };
    }
    if (EXCESS_PUNCT_RE.test(text)) {
      const l = pickByElement(EXCESS_PUNCT_COMMENTS, elem.id, nonce);
      return { emoji: l.emoji, text: l.text, kind: 'excess_punctuation', match: findMatch(text, EXCESS_PUNCT_RE) || undefined };
    }
  }

  const norm = normalize(text);
  if (ctx.styleAuditRun && CONCLUSION_TRIGGERS.some((t) => norm.includes(t))) {
    const l = pickByElement(CONCLUSION_COMMENTS, elem.id, nonce);
    const trigger = CONCLUSION_TRIGGERS.find((t) => norm.includes(t));
    return { emoji: l.emoji, text: l.text, kind: 'conclusion', match: trigger ? accentMatchSlice(text, trigger) : undefined };
  }
  if (ctx.styleAuditRun && AI_TRIGGERS.some((t) => norm.includes(t))) {
    const l = pickByElement(AI_COMMENTS, elem.id, nonce);
    const trigger = AI_TRIGGERS.find((t) => norm.includes(t));
    return { emoji: l.emoji, text: l.text, kind: 'ai', match: trigger ? accentMatchSlice(text, trigger) : undefined };
  }

  const isRefsHeading = elem.type === 'heading' && (norm.includes('referencias') || norm.includes('bibliografia'));
  if (isRefsHeading && ctx.orphanReferences?.length) {
    const l = pickByElement(ORPHAN_COMMENTS, elem.id, nonce);
    return { emoji: l.emoji, text: l.fill ? l.fill(elem, ctx) : l.text, kind: 'orphan_references' };
  }

  return null;
}

// ── COMPONENTE (híbrido biblioteca + IA, con "escribiendo…") ─────────────────

/** Micro-acción que muestra la burbuja según el tipo de comentario. */
function resolveMeta(kind: string): { label: string; icon: React.ReactNode } | null {
  if (kind === 'ghost_citation' || kind === 'orphan_references') return { label: 'Resolver cita', icon: <BookOpen size={11} /> };
  if (kind === 'image_no_caption') return { label: 'Agregar leyenda', icon: <PenLine size={11} /> };
  if (kind === 'positive' || kind === 'citation_ok') return null;
  return { label: 'Revisar', icon: <PenLine size={11} /> };
}

/** Expresión de la mascota según gravedad/tipo (detective / pánico / festivo). */
function mascotFor(kind: string, isPositive: boolean): MascotExpression {
  if (isPositive || kind === 'positive') return 'excited';
  if (kind === 'citation_ok') return 'happy';
  if (kind === 'ghost_citation' || kind === 'orphan_references') return 'curious'; // cara de detective
  if (kind === 'citation_error' || kind === 'shouting') return 'worried'; // pánico cómico
  if (kind && kind.startsWith('validation_')) return 'worried';
  if (kind === 'image_no_caption') return 'curious';
  return 'neutral';
}

function mascotKindFor(kind: string, isPositive: boolean): MascotKind {
  if (isPositive || kind === 'positive' || kind === 'citation_ok') return 'highlighter';
  if (kind === 'ghost_citation' || kind === 'orphan_references' || kind === 'ai') return 'reference';
  if (kind === 'citation_error' || kind === 'shouting' || kind.startsWith('validation_')) return 'strike';
  if (kind === 'image_no_caption' || kind === 'table_no_caption' || kind === 'proactive_caption') return 'ruler';
  return 'highlighter';
}

interface WhatsAppCommentProps {
  elem: ElementModel;
  /** True si este elemento es el "comentario positivo" de una sección limpia. */
  positive?: boolean;
  onHover?: (id: string) => void;
  onLeave?: () => void;
  /** Botón "Resolver": navega y enfoca el panel correspondiente. */
  onResolve?: (comment: WhatsAppCommentData, elem: ElementModel) => void;
  /** "X" / swipe: el usuario ignoró el comentario. */
  onDismiss?: (id: string) => void;
}

function getCategoryDetails(kind: string, isPositive: boolean): { label: string; className: string; icon: React.ReactNode } {
  if (isPositive || kind === 'positive' || kind === 'citation_ok') {
    return { label: 'Cita Verificada APA 7', className: 'wa-bubble-positive', icon: <CheckCheck size={11} color="var(--color-success)" /> };
  }
  if (kind === 'ghost_citation' || kind === 'orphan_references') {
    return { label: 'Alerta Bibliográfica', className: 'wa-bubble-ghost', icon: <BookOpen size={11} color="var(--color-danger)" /> };
  }
  if (kind && (kind.startsWith('validation_') || kind === 'citation_error' || kind === 'shouting')) {
    return { label: 'Formato APA 7', className: 'wa-bubble-warning', icon: <PenLine size={11} color="var(--color-warning)" /> };
  }
  if (kind === 'ai' || kind === 'conclusion') {
    return { label: 'Sugerencia de Redacción IA', className: 'wa-bubble-ai', icon: <Sparkles size={11} color="var(--color-engine-ia)" /> };
  }
  if (kind === 'image_no_caption' || kind === 'table_no_caption' || kind === 'table_emoji') {
    return { label: 'Figuras & Tablas APA 7', className: 'wa-bubble-tables', icon: <BookOpen size={11} color="var(--color-engine-tables)" /> };
  }
  return { label: 'Revisión Editorial', className: '', icon: <PenLine size={11} color="var(--paper-slate2)" /> };
}

export const WhatsAppComment: React.FC<WhatsAppCommentProps> = ({ elem, positive = false, onHover, onLeave, onResolve, onDismiss }) => {
  const citationAudit = useDocStore((s) => s.citationAuditResult);
  const validationIssues = useDocStore((s) => s.validationIssues);
  const proactivas = useDocStore((s) => s.sugerenciasProactivas);
  const reviewResult = useDocStore((s) => s.reviewResult);
  const proofreadFindings = useDocStore((s) => s.proofreadFindings);
  const apiKey = useDocStore((s) => s.apiKey);
  const aiProviderConfig = useDocStore((s) => s.aiProviderConfig);
  const sessionId = useDocStore((s) => s.doc?.session_id || '');

  const nonceRef = useRef<number>(Math.floor(Math.random() * 1e6));
  // MISMA construcción que el subrayado inline del lienzo: si esta burbuja
  // aparece, el resaltado del texto tiene que estar debajo.
  const ctx: WhatsAppContext = buildCommentContext({
    citationAuditResult: citationAudit,
    validationIssues,
    sugerenciasProactivas: proactivas,
    reviewResult,
    proofreadFindings,
  });
  let comment: WhatsAppCommentData | null = getWhatsAppComment(elem, ctx, nonceRef.current);
  let isPositive = false;
  if (!comment && positive) {
    const l = pickByElement(POSITIVE_COMMENTS, `pos-${elem.id}`, nonceRef.current);
    comment = { emoji: l.emoji, text: l.text, kind: 'positive' };
    isPositive = true;
  }

  const useIA = !isPositive && !!comment && canUseIA(comment.kind) && !!apiKey;
  const initialPhase = useIA && !iaCache.has(elem.id) ? 'typing' : 'done';
  const [phase, setPhase] = useState<'typing' | 'done'>(initialPhase);
  const [iaText, setIaText] = useState<string | null>(() => iaCache.get(elem.id) || null);
  const [dismissing, setDismissing] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [swipeDx, setSwipeDx] = useState(0);
  const dragStartX = useRef<number | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!comment || !useIA) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    iaCallCount += 1;
    const cached = iaCache.get(elem.id);
    if (cached) {
      setIaText(cached);
      setPhase('done');
    } else {
      setPhase('typing');
      timer = setTimeout(async () => {
        if (cancelled) return;
        try {
          const res = await Promise.race([
            generateChatComment(sessionId, elem.id, comment!.kind, elem.text || '', apiKey, aiProviderConfig),
            new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 45000)),
          ]);
          if (cancelled) return;
          iaCache.set(elem.id, res);
          setIaText(res);
        } catch {
          // fallback a la biblioteca
        } finally {
          if (!cancelled) setPhase('done');
        }
      }, 900);
    }

    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elem.id, useIA]);

  // Limpieza del timer de dismiss al desmontar
  useEffect(() => () => { if (dismissTimer.current) clearTimeout(dismissTimer.current); }, []);

  if (!comment) return null;

  const display: WhatsAppCommentData = iaText
    ? { emoji: comment.emoji, text: iaText, kind: comment.kind }
    : comment;

  const expression = mascotFor(display.kind, isPositive);
  const mascotKind = mascotKindFor(display.kind, isPositive);
  const action = resolveMeta(display.kind);
  const cat = getCategoryDetails(display.kind, isPositive);

  const triggerDismiss = () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setDismissing(true);
    dismissTimer.current = setTimeout(() => onDismiss?.(elem.id), 480);
  };

  const handleResolve = () => {
    onResolve?.(comment, elem);
    setResolved(true);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => onDismiss?.(elem.id), 1500);
  };

  const handlePointerDown = (e: React.PointerEvent) => { dragStartX.current = e.clientX; };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragStartX.current === null) return;
    const dx = e.clientX - dragStartX.current;
    if (dx > 4) setSwipeDx(Math.min(dx, 90));
  };
  const handlePointerUp = () => {
    if (swipeDx > 55) {
      setSwipeDx(0);
      triggerDismiss();
    } else {
      setSwipeDx(0);
    }
    dragStartX.current = null;
  };

  const bubbleStyle: React.CSSProperties = {
    transform: swipeDx > 0 ? `translateX(${swipeDx}px)` : undefined,
  };

  return (
    <div
      className={`wa-comment${isPositive ? ' wa-comment-positive' : ''}${dismissing ? ' wa-comment-dismissing' : ''}${resolved ? ' wa-comment-resolved' : ''}`}
      aria-label="Comentario de IA"
      onMouseEnter={() => { onHover?.(elem.id); }}
      onMouseLeave={() => { onLeave?.(); }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { setSwipeDx(0); dragStartX.current = null; }}
    >
      {phase === 'typing' ? (
        <div className="wa-bubble wa-bubble-typing" aria-hidden="true" style={bubbleStyle}>
          <div className="wa-typing"><span /><span /><span /></div>
          <span className="wa-time">analizando con IA…</span>
        </div>
      ) : resolved ? (
        /* Cara festiva: el usuario resolvió la alerta desde el botón */
        <div className="wa-bubble wa-bubble-resolved">
          <div className="wa-line">
            <span className="wa-avatar"><DocumentMascot size={24} kind="highlighter" expression="excited" /></span>
            <span className="wa-text">Listo. Te llevé al punto exacto.</span>
          </div>
          <span className="wa-time"><CheckCheck size={10} /> resuelto</span>
        </div>
      ) : (
        <>
          <div className={`wa-bubble ${cat.className}`} style={bubbleStyle}>
            <div className="wa-bubble-header">
              {cat.icon}
              <span>{cat.label}</span>
            </div>
            <div className="wa-line">
              <span className="wa-avatar"><DocumentMascot size={24} kind={mascotKind} expression={expression} /></span>
              <span className="wa-text">{renderFormattedCommentText(display.text)}</span>
            </div>
            <div className="wa-actions">
              {(display.kind === 'image_no_caption' || display.kind === 'table_no_caption' || display.kind === 'proactive_caption') ? (
                <button
                  type="button"
                  className="wa-action"
                  style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--color-text-on-accent)', border: 'none', padding: '3px 8px', borderRadius: 'var(--radius-xs)', fontWeight: 600 }}
                  onClick={async (e) => {
                    e.stopPropagation();
                    const state = useDocStore.getState();
                    state.showToast('Generando leyenda con IA…', 'info');
                    try {
                      const allElems = state.doc?.elements || [];
                      const eIdx = allElems.findIndex((x) => x.id === elem.id);
                      let textCtx = elem.text || '';
                      if (eIdx >= 0) {
                        const neighbors = [allElems[eIdx - 1]?.text, allElems[eIdx + 1]?.text].filter(Boolean);
                        if (neighbors.length > 0) textCtx = neighbors.join(' ');
                      }
                      const rawCaption = await suggestCaption(sessionId, elem.id, textCtx, apiKey);
                      const caption = (rawCaption || '').replace(/\*/g, '').trim();
                      if (elem.type === 'image') {
                        await state.updateElementImage(elem.id, { caption });
                      } else if (elem.type === 'table') {
                        await state.updateElementTable(elem.id, { caption });
                      }
                      state.showToast('Leyenda aplicada correctamente', 'success');
                      const domElem = document.getElementById(`paper-elem-${elem.id}`);
                      if (domElem) domElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      handleResolve();
                    } catch (err: any) {
                      state.showToast('No se pudo generar la leyenda: ' + (err.message || 'Error'), 'error');
                    }
                  }}
                >
                  <Sparkles size={11} /> Aplicar leyenda IA
                </button>
              ) : action ? (
                <button type="button" className="wa-action" onClick={(e) => { e.stopPropagation(); handleResolve(); }}>
                  {action.icon} {action.label}
                </button>
              ) : null}
              <span className="wa-time">WordAPA7</span>
              <button
                type="button"
                className="wa-dismiss"
                onClick={(e) => { e.stopPropagation(); triggerDismiss(); }}
                title="Ignorar comentario"
                aria-label="Ignorar comentario"
              >
                <X size={11} />
              </button>
            </div>
          </div>
          <span className="wa-tail" aria-hidden="true" />
        </>
      )}
    </div>
  );
};

export default WhatsAppComment;
