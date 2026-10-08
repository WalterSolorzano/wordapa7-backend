/* WordAPA7 — qué cara pone la mascota de cada pestaña.
 *
 * La expresión sale del ESTADO, no del decorado. El caso que lo pide: la
 * pestaña Conexión sin ninguna clave puesta no puede mostrar trece campos
 * vacíos; tiene que decirlo, y la forma de decirlo es la cara preocupada.
 *
 * Y sale del estado DE ESA PESTAÑA. Antes había una sola regla para las cinco, y
 * por eso las tres pestañas que no hablan del motor (Documento, Formato y App)
 * calculaban la cara a mano en su propio archivo: cuatro reglas en cuatro
 * lugares, de las cuales tres eran la misma. Acá viven las cinco, y cada
 * pestaña llama a la suya con `expresionDePestana`.
 */
import type { MascotExpression, MascotKind } from '../layout/EditorialMascot';
import { normalizarPageSize } from '../../lib/pageSizeEnHtml';
import type { Pestana } from './tabs';

export interface EstadoDePestana {
  /* ── Lo que pregunta el motor (Conexión y Revisión) ───────────────────── */
  /** Cuántas claves de proveedor hay puestas. El VALOR de la clave no viaja
   *  hasta acá: la función solo necesita saber si hay. */
  clavesDeProveedor?: number;
  /** Si el autor eligió un proveedor. Hoy se detecta por cuál clave está puesta;
   *  la Fase 2 lo vuelve elegible, y esta bandera pasa a leer esa elección. */
  proveedorElegido?: boolean;
  /** Hallazgos ya resueltos en este documento. */
  hallazgosResueltos?: number;

  /* ── Lo que pregunta el documento (Documento y Formato) ───────────────── */
  /** Si hay un documento abierto. Sin documento, ambas pestañas lo dicen. */
  documentoAbierto?: boolean;
  /** `rules.page_size`. */
  pageSize?: string;
  /** `portada.language`. */
  idiomaPortada?: string;
  /** `rules.font_family`. */
  fuente?: string;
  /** `rules.line_spacing`. */
  interlineado?: number;
  /** `rules.alignment`. */
  alineacion?: string;

  /* ── Lo que pregunta la app (App) ─────────────────────────────────────── */
  /** Si el tema está ELEGIDO, no si está en 'light'. Estar en claro es lo que
   *  viene por omisión, y una elección tácita no es una elección. Sale de
   *  `wordapa7-theme` en localStorage, que es donde `setTheme` lo escribe. */
  temaElegido?: boolean;
  /** Si Ajustes se abrió alguna vez en este equipo. Vive en localStorage y lo
   *  escribe `AppTab` al montarse. */
  ajustesAbiertosAlgunaVez?: boolean;
  /** Si hay algo roto de la app: la última comprobación de actualizaciones
   *  terminó en error. Sin esta bandera, "todo anda" sería una afirmación que
   *  nadie comprobó. */
  hayAlgoRoto?: boolean;
}

/** Los kinds que `EditorialMascot` sabe DIBUJAR. Un kind que esté en el union
 *  type pero no en esta tabla no falla: cae en `KIND_SIN_DIBUJO`. */
const KIND_DIBUJADO: Record<string, MascotKind> = {
  highlighter: 'highlighter',
  ruler: 'ruler',
  reference: 'reference',
  strike: 'strike',
  gear: 'gear',
};

export const KIND_SIN_DIBUJO: MascotKind = 'reference';

/** El kind que se dibuja, que no es siempre el kind que pide la pestaña. */
export function kindDePestana(mascotKind: MascotKind): MascotKind {
  return KIND_DIBUJADO[mascotKind] || KIND_SIN_DIBUJO;
}

/* ── Las cinco reglas ─────────────────────────────────────────────────────
 * Cada una es una función aparte, y no un `if` dentro de un switch, porque lo
 * que se prueba es una regla y no un caso: el archivo de pruebas llama a las
 * cinco con el estado que le corresponde a cada una. */

/** Conexión y Revisión: la pregunta es si el motor puede consultar un modelo. */
export function expresionDelMotor(estado: EstadoDePestana): MascotExpression {
  if (!estado.clavesDeProveedor) return 'worried';
  if (!estado.proveedorElegido) return 'curious';
  if (estado.hallazgosResueltos && estado.hallazgosResueltos > 0) return 'happy';
  return 'neutral';
}

/** Documento: la pregunta es si el archivo va a decir lo que dice la pantalla:
 *  hay un tamaño de hoja elegido y hay un idioma. Sin documento, preocupada. */
export function expresionDeDocumento(
  reglas: { page_size?: string },
  portada: { language?: string },
): MascotExpression {
  if (!normalizarPageSize(reglas.page_size)) return 'worried';
  if (!portada.language) return 'worried';
  /* Carta es el default y también lo que dice la norma, así que estar en Carta
     no es estar bien: es estar en lo que venía. La cara curiosa es para cuando
     alguien eligió otra cosa a propósito, que sí es una decisión que se puede
     revisar. */
  if (normalizarPageSize(reglas.page_size) !== 'carta') return 'curious';
  return 'happy';
}

/** Formato: la pregunta es si el documento se sale de APA 7, y eso se cuenta
 *  mirando las tres reglas que la norma fija. Que falte una clave de proveedor
 *  NO dice nada del formato de un documento, y por eso esta pestaña nunca
 *  pregunta por el motor. */
export function expresionDeFormato(rules: {
  font_family: string;
  line_spacing: number;
  alignment: string;
}): MascotExpression {
  if (!rules.font_family) return 'worried';
  const FUENTES_DE_APA = ['Times New Roman', 'Calibri', 'Arial', 'Georgia'];
  const esApa = FUENTES_DE_APA.includes(rules.font_family)
    && rules.line_spacing === 2.0
    && rules.alignment === 'left';
  if (esApa) return 'happy';
  return 'curious';
}

/** App: la pregunta NO es por el motor, porque esta pestaña no configura el
 *  motor. Es si la app está como la dejó quien la usa: hay un tema elegido a
 *  propósito y no hay nada roto. Antes de que Ajustes se abriera una sola vez la
 *  cara es curiosa, que es lo que una pantalla que nunca se vio puede decir. */
export function expresionDeApp(estado: EstadoDePestana): MascotExpression {
  if (estado.temaElegido && !estado.hayAlgoRoto) return 'happy';
  if (!estado.ajustesAbiertosAlgunaVez) return 'curious';
  return 'neutral';
}

/**
 * La cara de la mascota de una pestaña. Recibe la pestaña porque cada una lee su
 * propio estado: las reglas de Conexión y Revisión son las del motor, y las de
 * Documento, Formato y App no tienen nada que ver con las claves de proveedor.
 */
export function expresionDePestana(
  pestana: Pestana,
  estado: EstadoDePestana,
): MascotExpression {
  switch (pestana.id) {
    case 'conexion':
    case 'revision':
      return expresionDelMotor(estado);
    case 'documento':
      if (!estado.documentoAbierto) return 'worried';
      return expresionDeDocumento({ page_size: estado.pageSize }, { language: estado.idiomaPortada });
    case 'formato':
      if (!estado.documentoAbierto) return 'worried';
      return expresionDeFormato({
        font_family: estado.fuente as string,
        line_spacing: estado.interlineado as number,
        alignment: estado.alineacion as string,
      });
    case 'app':
      return expresionDeApp(estado);
    default:
      return 'neutral';
  }
}
