/* WordAPA7 — Pantalla de carga estilo videojuego.
 *
 * - Categorías rotativas (no solo frases): verbo de proceso → chiste →
 *   curiosidad APA → (chiste → curiosidad → …). Cada categoría tiene un pool
 *   propio, así nunca se siente repetitivo.
 * - Escala con la duración: <3s → un solo tip; 3-15s → rota cada ~2.8s;
 *   >15s → además muestra un mensaje honesto ("tarda más de lo normal").
 * - Tips contextuales: reacciona al tamaño real del documento y a la hora
 *   (madrugada, domingo a la noche).
 * - La IA puede generar tips frescos en el momento (1 por sesión de carga),
 *   con la biblioteca local como base instantánea y fallback.
 * Los textos van SIN emojis: UI de sistema, no comentarios.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useDocStore } from '../../store/useDocStore';
import { generateLoadingTip } from '../../api/backend';
import { getSizeComment, getTimeOfWeekComment, getFilenameComment } from '../../lib/studentJokes';
import { DocumentMascot, MascotExpression, MascotKind } from './DocumentMascot';
import { Check, Loader2, Sparkles } from 'lucide-react';

// ── BIBLIOTECA LOCAL (frases curadas por categoría; sin emojis) ───────────────

export const PROCESS_VERBS: string[] = [
  'Peleando con las sangrías para que no se salgan de lugar…',
  'Convenciendo a los márgenes de no arruinar la entrega…',
  'Alineando el universo tipográfico antes de que el asesor abra el doc…',
  'Hablándole bonito a Word para que no mueva esa tabla…',
  'Separando títulos de párrafos antes del desastre…',
  'Midiendo márgenes con precisión quirúrgica…',
  'Convirtiendo tus "Enter, Enter, Enter" en sangría de verdad…',
  'Negociando treguas entre imágenes y texto para que no salten de página…',
  'Afinando el interlineado como quien afina una guitarra…',
  'Poniendo los acentos donde debieron haber estado desde el principio…',
  'Enderezando párrafos torcidos que se resisten al formato…',
  'Recordándole a Word que existe la sangría francesa…',
  'Cazando párrafos con alineación justificada rebelde…',
  'Desarmando listas numeradas que Word creó sin permiso…',
  'Borrando los 45 espacios que usaste para centrar el título…',
  'Domando el interlineado antes de que colapse…',
];

export const JOKES: string[] = [
  'Citando cosas que ni tú sabes si existen…',
  'Leyendo tu bibliografía… ojalá no sea todo Wikipedia.',
  'Separando lo que escribiste de lo que copiaste…',
  '"Citando" fuentes que ni el autor recuerda haber leído…',
  'Buscando el autor misterioso que sólo aparece citado una vez…',
  'Detectando el momento exacto donde te quedaste sin ideas y metiste relleno…',
  'Ese título en mayúsculas sostenidas no engaña a nadie…',
  'La conclusión que dice exactamente lo mismo que la introducción…',
  '"Según diversos autores" sin decir cuáles, un clásico de clásicos…',
  'Contando cuántas veces cambiaste de fuente sin querer…',
  'Buscando dónde quedó la coherencia entre página 3 y página 30…',
  'El corrector ortográfico está sudando frío…',
  'Rezándole al santo patrono de los documentos recuperados…',
  'Intentando descifrar qué quisiste decir a las cuatro de la mañana…',
  'Midiendo el pánico previo a presionar "Enviar trabajo"…',
  'La portada está más desnuda que un recién nacido. Vistiéndola…',
];

export const APA_FACTS: string[] = [
  // Base
  'el error más común en trabajos de estudiante: olvidar el DOI. ¿vos lo tenés?',
  'APA 7: la sangría de párrafo va a 0.5 pulgadas. Ni más, ni menos.',
  'dato: en APA 7 la portada de estudiante lleva el curso y el docente.',
  'el "et al." se usa desde 3 autores en la cita, desde el primer uso.',
  'APA 7 ya no pide "Running head" en trabajos de estudiante. Una menos.',
  'las tablas llevan borde solo arriba y abajo. El resto, aire.',
  'el título de la figura va debajo; el de la tabla, arriba.',
  'la 7ma edición de APA salió en 2019. Sí, hace rato.',
  // Primer lote nuevo
  'las tablas no llevan líneas verticales en APA 7.',
  'el título del trabajo va en negrita solo en la portada, no en el cuerpo.',
  'si son 3 o más autores, va "et al." desde la primera cita.',
  'los números de página van arriba a la derecha, siempre.',
  'las figuras llevan la leyenda debajo, las tablas arriba de la tabla.',
  'no hace falta "Ibíd." en APA, eso es otro estilo.',
  'el margen estándar es 2.54 cm en los cuatro lados.',
  'las citas de más de 40 palabras van en bloque, sin comillas.',
  'el nombre del autor en la referencia va apellido primero, luego inicial.',
  'los encabezados de nivel 2 van alineados a la izquierda y en negrita.',
  'no se usa cursiva para enfatizar en el cuerpo del texto, solo en casos específicos.',
  'la lista de referencias va en orden alfabético, no en orden de aparición.',
  // Segundo lote nuevo
  'la sangría francesa va en la segunda línea, no en la primera.',
  '"et al." lleva punto después de "al".',
  'los títulos de nivel 1 van centrados y en negrita, nada más.',
  'el DOI empieza con "https://doi.org/", no con el número pelado.',
  'en APA 7 el año va justo después del autor, no al final.',
  'máximo 20 palabras para citar textual sin sangría de bloque.',
  // Lote expandido
  'en APA 7 se admiten fuentes como Calibri 11, Arial 11, Georgia 11 y Times New Roman 12.',
  'las notas de tabla van con "Nota." en cursiva seguida de punto.',
  'en citas en paréntesis se usa "&" antes del último autor; en narrativa se escribe "y".',
  'los títulos de nivel 3 van alineados a la izquierda, en negrita y en cursiva.',
  'la portada profesional sí lleva encabezado abreviado (running head), la de estudiante no.',
  'las referencias web ya no llevan la frase "Recuperado de", salvo que la fuente cambie en el tiempo.',
  'hasta 20 autores se listan completos en la referencia antes de recurrir a puntos suspensivos.',
  'las comunicaciones personales solo se citan en el texto, no van en la lista de referencias.',
  // Lote reactivo ultra
  'en APA 7 los números del 0 al 9 se escriben con palabras, de 10 en adelante con cifras.',
  'los títulos de tablas van en cursiva justo debajo del número de tabla en negrita.',
  'las citas directas sin número de página requieren señalar el número de párrafo.',
  'el espaciado doble se mantiene en todo el texto, incluyendo la lista de referencias.',
];

// ── MODO: "Te atrapé usando IA" (las delatoras) ─────────────────────────────
export const AI_JOKES: string[] = [
  "contando cuántos 'en conclusión' y 'en resumen' te dejó ChatGPT...",
  "verificando que no hayas dejado un 'claro, aquí tienes tu ensayo' oculto en la página 12...",
  "reescribiendo la frase 'sumérgete en el fascinante mundo' para que suenes como un ser humano...",
  "calculando cuántas veces usaste 'crucial' y 'fundamental' en el mismo párrafo...",
  'revisando que tu marco teórico no alucine autores que no existen...',
  // Lote expandido
  "rastreando palabras como 'innegable', 'intrincado' y 'vibrante'...",
  "comprobando que el ensayo no empiece con 'A lo largo de la historia de la humanidad'...",
  "buscando disculpas de la IA en medio del marco conceptual...",
  "asegurando que las citas no pertenezcan a papers del año 2045...",
  "des-robotizando la redacción para que tu asesor no sospeche...",
  // Lote reactivo ultra
  "detectando el clásico 'en el tapiz de la sociedad moderna'...",
  "neutralizando la frase 'es de suma importancia recalcar que'...",
  "buscando explicaciones redundantes que ChatGPT puso para alargar la entrega...",
  "revisando que la IA no haya citado una tesis que nunca existió...",
];

// ── MODO: El infierno de Word y APA 7 ───────────────────────────────────────
export const WORD_HELL_JOKES: string[] = [
  'peleando a muerte con Word para que la tabla no brinque a la siguiente página...',
  'alineando márgenes con precisión de ingeniero. Ni un milímetro más, ni un milímetro menos.',
  'convenciendo a tu documento de que la imagen va exactamente donde le dijiste que fuera...',
  'buscando líneas viudas y huérfanas para devolverlas con su familia...',
  'aplicando sangría francesa (tranquilo, es la de APA, no la bebida)...',
  'eliminando los 45 espacios en blanco que usaste para centrar el título...',
  // Lote expandido
  'evitando que mover una imagen 1 milímetro mande tres párrafos al abismo...',
  'domando la numeración automática de Word que decidió empezar de nuevo en 1...',
  'borrando esa página en blanco fantasma que Word se niega a eliminar...',
  'rogándole a Word que no cambie el interlineado a su antojo...',
  'deshaciendo saltos de página que aparecieron de la nada...',
  // Lote reactivo ultra
  'impidiendo que Word convierta tu guion en una lista no deseada…',
  'rescatando la última fila de la tabla que quedó cortada al final de la hoja…',
  'luchando contra el salto de sección continuo que rompió la numeración…',
  'exorcizando estilos automáticos que Word inventó sin tu permiso…',
];

// ── MODO: Agotamiento estudiantil y optimización ────────────────────────────
export const STUDENT_JOKES: string[] = [
  'optimizando tu bibliografía a velocidad récord para que por fin puedas ir a dormir...',
  'preparando el documento... total, el profe solo va a leer la introducción y las conclusiones.',
  "evaluando si esa cita de 'Rincón del Vago' realmente cuenta como fuente académica...",
  'calculando la ruta más corta entre este borrador y tu título universitario...',
  'cargando... más rápido de lo que tardaste en decidir entre Arial o Times New Roman.',
  'procesando... porque tu salud mental vale más que pelear con las referencias cruzadas.',
  // Lote expandido
  'formateando mientras te preguntás por qué no empezaste esto hace dos semanas…',
  'calculando cuánto café queda en tu sistema circulatorio…',
  'haciendo que el trabajo parezca de 20 páginas con márgenes limpios y sin trucos…',
  'ayudándote a cruzar la línea de meta antes de que cierre la plataforma…',
  'un documento formateado a tiempo es un paso más hacia la graduación…',
  // Lote reactivo ultra
  'contando cuántas horas faltan para que cierre el aula virtual…',
  'prometemos que esta noche sí vas a dormir más de cuatro horas…',
  'convirtiendo el pánico de entrega en satisfacción académica…',
  'tu esfuerzo vale la pena: el documento va a quedar impecable…',
];

const HONEST_MESSAGES: string[] = [
  // Base
  'esto está tardando más de lo normal — tu doc es grande, tranquilo, seguimos.',
  'paciencia, que el formato fino lleva su tiempo (y tu doc es grande).',
  // Lote nuevo (sin "che")
  'tranquilo, esto es normal en documentos grandes.',
  'seguimos trabajando, no te vayas todavía.',
  'los documentos con muchas tablas tardan un poco más, va en camino.',
  'si esto sigue así unos segundos más, es porque hay bastante que revisar.',
  'no se colgó, solo está siendo minucioso.',
  'último tramo, ya casi.',
  'tu doc tiene bastantes figuras, dale un toque más.',
  'esto no se colgó, solo es más grande de lo normal.',
  'ya casi, prometido.',
  // Lote expandido
  'revisando la estructura a fondo, tu texto lo vale.',
  'un documento extenso toma su tiempo, pero queda impecable.',
  'estamos aplicando las normas página por página, paciencia.',
  'procesando cada sección con cuidado milimétrico…',
  // Lote reactivo ultra
  'analizando referencias complejas y consistencia de citas…',
  'documento de gran calibre: garantizando precisión en cada párrafo…',
];

interface Tip {
  category: 'process' | 'jokes' | 'apa' | 'honest' | 'llm' | 'ai' | 'wordhell' | 'student';
  text: string;
}

// Reacción dinámica e inteligente de la mascota para CADA frase:
// Evalúa el contenido semántico del texto para seleccionar el kind (herramienta),
// expresión facial ('happy' | 'excited' | 'curious' | 'worried' | 'neutral')
// y animación ('mascot-anim-*').
export function getTipReaction(tip: Tip): {
  kind: MascotKind;
  expression: MascotExpression;
  animation: string;
} {
  const t = tip.text.toLowerCase();

  // Casos de pánico / estrés / horas límite / Word rebelde -> worried o excited
  if (t.includes('chatgpt') || t.includes('alucine') || t.includes('delator') || t.includes('tapiz') || t.includes('innegable')) {
    return { kind: 'reference', expression: 'worried', animation: 'mascot-anim-ai' };
  }
  if (t.includes('peleando') || t.includes('abismo') || t.includes('rompió') || t.includes('fantasma') || t.includes('exorcizando')) {
    return { kind: 'strike', expression: 'worried', animation: 'mascot-anim-wordhell' };
  }
  if (t.includes('aula virtual') || t.includes('pánico') || t.includes('sudando') || t.includes('rincón del vago')) {
    return { kind: 'highlighter', expression: 'worried', animation: 'mascot-anim-student' };
  }

  // Casos de rigor métrico APA 7 / márgenes / tablas / sangrías -> ruler curioso o neutral
  if (t.includes('2.54') || t.includes('sangría') || t.includes('milímetro') || t.includes('et al') || t.includes('doi') || t.includes('nivel 3')) {
    return { kind: 'ruler', expression: 'curious', animation: 'mascot-anim-apa' };
  }
  if (t.includes('tabla') || t.includes('figura') || t.includes('interlineado') || t.includes('número')) {
    return { kind: 'ruler', expression: 'happy', animation: 'mascot-anim-apa' };
  }

  // Casos de citas, referencias, bibliografía y libros -> reference
  if (t.includes('referencia') || t.includes('bibliografía') || t.includes('citar') || t.includes('fuente') || t.includes('autor')) {
    return { kind: 'reference', expression: 'curious', animation: 'mascot-anim-llm' };
  }

  // Casos de tachado, corrección de errores, comas y estilo -> strike
  if (t.includes('coma') || t.includes('punto') || t.includes('ortograf') || t.includes('mayúscula') || t.includes('estilo') || t.includes('título')) {
    return { kind: 'strike', expression: 'excited', animation: 'mascot-anim-jokes' };
  }

  // Casos de estudiante, café, trasnoche y motivación -> highlighter o gear
  if (t.includes('café') || t.includes('dormir') || t.includes('título universitario') || t.includes('graduación') || t.includes('meta')) {
    return { kind: 'highlighter', expression: 'excited', animation: 'mascot-anim-student' };
  }
  if (t.includes('engranaje') || t.includes('motor') || t.includes('calibrando') || t.includes('quirúrgica')) {
    return { kind: 'gear', expression: 'happy', animation: 'mascot-anim-process' };
  }

  // Fallback categorial coherente
  const fallbackExpr: Record<Tip['category'], MascotExpression> = {
    process: 'happy',
    jokes: 'excited',
    apa: 'curious',
    honest: 'neutral',
    llm: 'excited',
    ai: 'curious',
    wordhell: 'worried',
    student: 'happy',
  };

  const fallbackKind: Record<Tip['category'], MascotKind> = {
    process: 'highlighter',
    jokes: 'strike',
    apa: 'ruler',
    honest: 'ruler',
    llm: 'reference',
    ai: 'reference',
    wordhell: 'strike',
    student: 'highlighter',
  };

  const fallbackAnim: Record<Tip['category'], string> = {
    process: 'mascot-anim-process',
    jokes: 'mascot-anim-jokes',
    apa: 'mascot-anim-apa',
    honest: 'mascot-anim-honest',
    llm: 'mascot-anim-llm',
    ai: 'mascot-anim-ai',
    wordhell: 'mascot-anim-wordhell',
    student: 'mascot-anim-student',
  };

  return {
    kind: fallbackKind[tip.category],
    expression: fallbackExpr[tip.category],
    animation: fallbackAnim[tip.category],
  };
}

// Etiqueta de "modo" para los sets temáticos (chiste -> comentario con badge).
const MODE_LABEL: Partial<Record<Tip['category'], string>> = {
  ai: " Modo: te atrapé usando IA",
  wordhell: ' Modo: el infierno de Word y APA 7',
  student: ' Modo: agotamiento estudiantil',
};

// Tiempo que cada frase permanece visible. Las de "arte" (honestidad de espera)
// y las temáticas se dejan un poco más porque valen la pena leerlas.
const CATEGORY_DURATION_MS: Record<Tip['category'], number> = {
  process: 4500,
  jokes: 3800,
  apa: 4500,
  honest: 9000,
  llm: 4500,
  ai: 5000,
  wordhell: 4200,
  student: 5000,
};

const LoadingMascotWalkers: React.FC = () => (
  <div className="loading-mascot-walkers" aria-hidden="true">
    <span className="loading-mascot-walker loading-mascot-walker-highlighter">
      <DocumentMascot size={34} kind="highlighter" expression="excited" />
    </span>
    <span className="loading-mascot-walker loading-mascot-walker-ruler">
      <DocumentMascot size={30} kind="ruler" expression="curious" />
    </span>
    <span className="loading-mascot-walker loading-mascot-walker-strike">
      <DocumentMascot size={32} kind="strike" expression="happy" />
    </span>
  </div>
);

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

function tipFor(category: Tip['category']): Tip {
  switch (category) {
    case 'process': return { category, text: pickRandom(PROCESS_VERBS) };
    case 'jokes': return { category, text: pickRandom(JOKES) };
    case 'apa': return { category, text: pickRandom(APA_FACTS) };
    case 'honest': return { category, text: pickRandom(HONEST_MESSAGES) };
    case 'ai': return { category, text: pickRandom(AI_JOKES) };
    case 'wordhell': return { category, text: pickRandom(WORD_HELL_JOKES) };
    case 'student': return { category, text: pickRandom(STUDENT_JOKES) };
    default: return { category: 'process', text: pickRandom(PROCESS_VERBS) };
  }
}

// Secuencia de categorías: arranca seria (proceso), luego intercala los chistes
// temáticos para no abrumar al inicio. Nunca dos iguales seguidas.
const CATEGORY_SEQUENCE: Tip['category'][] = [
  'process', 'jokes', 'apa', 'ai', 'jokes', 'wordhell', 'student', 'apa', 'ai',
];

/* Metadatos visuales de categoría (color de marca y etiqueta profesional, sin
   emojis). La tinta de cada una sale del design system, y `bg` SIEMPRE es el
   mismo token de alfa que usa el resto de la app para esa familia.

   Antes cada categoría traía su propio par: `ai` era #8b5cf6 con su rgba y
   `student` era #6366f1 con el suyo, dos violetas a medio tono de diferencia
   que en pantalla se leían como el mismo color y no como dos. Ahora las dos
   categorías que el sistema de diseño no distingue entre sí comparten
   `--color-engine-ia`, que es lo que además emite el lienzo para un hallazgo
   de IA: el mismo motor no puede verse de dos colores según la pantalla. */
const CATEGORY_META: Record<Tip['category'], { label: string; color: string; bg: string }> = {
  process:  { label: 'Procesamiento Activo', color: 'var(--accent-primary)', bg: 'var(--color-accent-a12)' },
  apa:      { label: 'Normas APA 7ma Edición', color: 'var(--color-success)', bg: 'var(--color-success-a12)' },
  ai:       { label: 'Detección Editorial IA', color: 'var(--color-engine-ia)', bg: 'var(--color-engine-ia-a12)' },
  llm:      { label: 'Modelos Inteligentes', color: 'var(--color-engine-ia)', bg: 'var(--color-engine-ia-a12)' },
  wordhell: { label: 'Optimizador de Word', color: 'var(--color-warning)', bg: 'var(--color-warning-a12)' },
  student:  { label: 'Comunidad Estudiantil', color: 'var(--color-engine-ia)', bg: 'var(--color-engine-ia-a12)' },
  jokes:    { label: 'Pausa Académica', color: 'var(--color-engine-tables)', bg: 'var(--color-engine-tables-a12)' },
  honest:   { label: 'Análisis Profundo', color: 'var(--accent-primary)', bg: 'var(--color-accent-a12)' },
};

// Cápsula de progreso interactiva con pulso y gradiente de diseño propio
const CustomProgressCapsule: React.FC = () => (
  <div style={{
    width: '100%',
    maxWidth: '340px',
    height: '8px',
    backgroundColor: 'var(--surface-subtle)',
    borderRadius: 'var(--radius-full)',
    padding: '2px',
    boxSizing: 'border-box',
    border: '1px solid var(--border-subtle)',
    position: 'relative',
    overflow: 'hidden',
    boxShadow: 'var(--shadow-inset)',
  }}>
    <div
      className="custom-loader-track"
      style={{
        height: '100%',
        minWidth: '35%',
        background: 'linear-gradient(90deg, var(--accent-primary) 0%, var(--color-engine-ia) 100%)',
        borderRadius: 'var(--radius-full)',
        boxShadow: '0 0 10px var(--color-accent-a40)',
      }}
    />
  </div>
);

// Riel de etapas personalizado con arquitectura de 3 fases editoriales
const StageRail: React.FC<{ llmStatus?: string }> = ({ llmStatus }) => {
  const classifying = llmStatus === 'processing';
  const steps = [
    { label: 'Lectura', sub: 'Extracción de estilos', state: classifying ? 'done' : 'active' },
    { label: 'Estructura', sub: 'Títulos y citas', state: classifying ? 'active' : 'pending' },
    { label: 'APA 7', sub: 'Normalización total', state: 'pending' },
  ];
  return (
    <div className="custom-stage-container" role="status" aria-label="Fases del procesamiento">
      {steps.map((s, i) => (
        <React.Fragment key={s.label}>
          {i > 0 && <div className={`custom-stage-connector ${steps[i - 1].state === 'done' ? 'active' : ''}`} />}
          <div className={`custom-stage-card ${s.state}`}>
            <div className="custom-stage-icon">
              {s.state === 'done' ? (
                <Check size={11} strokeWidth="var(--icon-stroke)" />
              ) : s.state === 'active' ? (
                <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <span style={{ width: 6, height: 6, borderRadius: 'var(--radius-full)', backgroundColor: 'var(--text-muted)' }} />
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
              <span className="custom-stage-title">{s.label}</span>
              <span className="custom-stage-sub">{s.sub}</span>
            </div>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};

// ── AMBIENT CANVAS ────────────────────────────────────────────────────────────
// Atmósfera suave sobre la capa de carga. Canvas 2D.
//
// LA PALETA HORARIA SE FUE. Había tres paletas con hex literales dentro de este
// `.tsx`, y la de la tarde y la noche era morada: el usuario la vio y creyó que
// le habían cambiado de pantalla. El comentario que lo justificaba decía que no
// eran tokens de UI porque eran "una capa de dibujo pura", y ese comentario era
// el error —es el fondo que se ve durante la carga—. El fondo ahora sale de
// `--carga-fondo`, que vive en la hoja; el canvas ya no pinta el fondo, solo la
// atmósfera, y su color sale de tokens leídos de la hoja en cada arranque. La
// variación por hora no desaparece como efecto: desaparece como paleta, y lo que
// queda es una atmósfera con el color de la app.
const AmbientCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ── El color, de la hoja ────────────────────────────────────────────────
    /* Se lee con `getComputedStyle` porque un token no es un color: es una
       cadena que el navegador resuelve, y un `CanvasRenderingContext2D` no
       resuelve nada (ver la nota de `CIELO` en `HomeHero.tsx`).

       El RESPALDO no puede ser un `var()`: si el token no estuviera
       declarado, esto devolvería la cadena literal "var(--color-accent-soft)"
       como si fuera un color, el canvas la descartaría en silencio y el
       borrón saldría del color anterior. Por eso son literales, y por eso
       son los mismos valores que la hoja declara para el tema claro. */
    const leerToken = (nombre: string, respaldo: string): string => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
      return v || respaldo;
    };
    const blob = leerToken('--color-accent-soft', 'rgba(79, 124, 255, 0.10)');
    const particle = leerToken('--color-text-tertiary', '#6b6b80');

    // ── Resize helper ────────────────────────────────────────────────────────
    const resize = () => {
      canvas.width = canvas.offsetWidth || window.innerWidth;
      canvas.height = canvas.offsetHeight || window.innerHeight;
    };
    resize();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ── Particles ────────────────────────────────────────────────────────────
    const N = 35;
    type Dot = { x: number; y: number; r: number; speed: number; drift: number };
    const dots: Dot[] = Array.from({ length: N }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 1 + Math.random(),
      speed: 0.00008 + Math.random() * 0.00012,   // fraction of height per ms
      drift: (Math.random() - 0.5) * 0.00004,
    }));

    // ── Blob pulse state ─────────────────────────────────────────────────────
    const blobs = [
      { cx: 0.28, cy: 0.38, rFrac: 0.38, phase: 0 },
      { cx: 0.72, cy: 0.65, rFrac: 0.30, phase: Math.PI },
    ];

    // ── Reduced-motion: single static frame ──────────────────────────────────
    const reducedMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const drawFrame = (elapsed: number) => {
      const W = canvas.width;
      const H = canvas.height;

      /* El FONDO no se pinta acá. Lo pinta `.loading-tips-fullscreen` con
         `--carga-fondo`, y esa es toda la diferencia entre una capa de carga y
         una segunda paleta: el lienzo solo aporta atmósfera encima de un fondo
         que ya es el de la app. */
      ctx.clearRect(0, 0, W, H);

      // Radial blobs (pulsing)
      ctx.fillStyle = blob;
      ctx.globalAlpha = 0.55;
      blobs.forEach(b => {
        const pulse = reducedMotion ? 1 : 0.9 + 0.1 * Math.sin((elapsed / 4000) * Math.PI * 2 + b.phase);
        const r = Math.min(W, H) * b.rFrac * pulse;
        const grad = ctx.createRadialGradient(b.cx * W, b.cy * H, 0, b.cx * W, b.cy * H, r);
        grad.addColorStop(0, blob);
        /* La ultima parada del degradado es TRANSPARENTE, y se escribe con la
         palabra clave y no con `rgba(0,0,0,0)`: las dos son el mismo color y
         la palabra es la que no puede confundirse con un alfa mal escrito. */
      grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(b.cx * W, b.cy * H, r, r * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // Drifting particles (upward + slight horizontal drift)
      ctx.fillStyle = particle;
      dots.forEach(d => {
        const px = ((d.x + d.drift * elapsed) % 1 + 1) % 1;
        const py = ((1 - ((d.y + d.speed * elapsed) % 1)) % 1 + 1) % 1;
        ctx.globalAlpha = 0.55 + 0.45 * py;   // fade near top
        ctx.beginPath();
        ctx.arc(px * W, py * H, d.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    };

    if (reducedMotion) {
      drawFrame(0);
      return () => ro.disconnect();
    }

    let start: number | null = null;
    const loop = (ts: number) => {
      if (start === null) start = ts;
      drawFrame(ts - start);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        opacity: 0.32,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
};

export interface LoadingTipsProps {
  /**
   * Fuerza el estado de la capa y SALTA el store. Sin esto, un componente que
   * lee `isLoading` del store no se puede probar sin montar el store entero, y
   * una capa que no se puede probar es una capa de la que nadie se ocupa. La
   * app lo monta sin props —el store manda— y la Fase 7 lo monta con `que` para
   * decir "Subiendo capitulo-3.docx (3 de 20)".
   */
  activo?: boolean;
  /** QUÉ está pasando. Sin esto la capa dice que algo pasa, y no cuál. */
  que?: string;
}

export const LoadingTips: React.FC<LoadingTipsProps> = ({ activo, que }) => {
  const isLoading = useDocStore((s) => s.isLoading);
  /* F7 Task 4: el progreso que el store escribe. `que` (la prop) sigue ganando
   * —es un forzado de prueba—, pero el store es quien sabe qué está pasando
   *  cuando sincroniza una carpeta o sube documentos. */
  const loadingQue = useDocStore((s) => s.loadingQue);
  const llmStatus = useDocStore((s) => s.llmProgress?.status);
  const apiKey = useDocStore((s) => s.apiKey);
  const aiProviderConfig = useDocStore((s) => s.aiProviderConfig);
  const doc = useDocStore((s) => s.doc);
  const isBackendReady = useDocStore((s) => s.isBackendReady);
  const fileName = (doc as any)?.meta?.file_name || (doc as any)?.file_name || '';

  const [visible, setVisible] = useState(false);
  const [tip, setTip] = useState<Tip>({ category: 'process', text: PROCESS_VERBS[0] });
  const seqIdxRef = useRef(0);
  const startRef = useRef<number>(0);
  const honestyShownRef = useRef(false);
  const llmCalledRef = useRef(false);
  const minDisplayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cuántos segundos lleva la conexión al motor (para ofrecer "Reintentar" / "Continuar")
  const [connectingSecs, setConnectingSecs] = useState(0);
  const connectingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Tiempo mínimo de visibilidad. Bajó de 3500 a 350 porque 3500 era la razón de
     que se viera tanto: una tarea de 180 ms dejaba la pantalla puesta 3.3 s más.
     350 ms alcanza para que una carga instantánea no parpadee, que es lo único
     que este mínimo hacía. Con la barra de proyectos subiendo veinte archivos en
     serie, la cuenta anterior eran setenta segundos de pantalla fija. */
  const MIN_DISPLAY_MS = 350;

  // ── Tip contextual: nombre de archivo + hora + tamaño ──
  const contextualInitialTip = (): Tip | null => {
    const now = new Date();

    // 1. Por nombre de archivo (usamos la detección unificada de studentJokes)
    if (fileName) {
      const filenameJoke = getFilenameComment(fileName);
      if (filenameJoke) {
        return { category: 'jokes', text: filenameJoke };
      }
      const nameLower = fileName.toLowerCase();
      if (/final|tesis|monograf/i.test(nameLower)) {
        const phrases = [
          `"${fileName}" — esto tiene pinta de trabajo final. Vamos con todo.`,
          `Archivo detectado: "${fileName}". Modo tesis activado.`,
          `"${fileName}" — ¿defensa en camino? Tranqui, yo me encargo del formato.`,
          `Documento final detectado. Ajustando precisión milimétrica APA 7.`,
        ];
        return { category: 'jokes', text: phrases[Math.floor(Math.random() * phrases.length)] };
      }
      if (/avance|borrador|draft/i.test(nameLower)) {
        return { category: 'process', text: `"${fileName}" — borrador detectado. Perfecto, vamos puliendo.` };
      }
      if (/investigaci|proyecto/i.test(nameLower)) {
        return { category: 'apa', text: `"${fileName}" — proyecto de investigación. Las referencias son sagradas.` };
      }
      if (/ejercicio|tarea|lab/i.test(nameLower)) {
        return { category: 'jokes', text: `"${fileName}" — ¡un ejercicio! Perfecto para dejar impecable en APA 7.` };
      }
      if (/contabilidad|finanza/i.test(nameLower)) {
        return { category: 'process', text: `"${fileName}" — finanzas con formato APA. Números claros, referencias claras.` };
      }
    }

    // 2. Por hora del día
    const timeComment = getTimeOfWeekComment(now);
    if (timeComment) return { category: 'honest', text: timeComment };

    // 3. Por tamaño del documento
    if (doc) {
      const figCount = doc.elements.filter((e) => e.type === 'image' && e.image_info && (e.image_info.figure_number || 0) > 0).length;
      const tblCount = doc.elements.filter((e) => e.type === 'table').length;
      const sizeComment = getSizeComment(doc.meta?.page_count || 0, figCount, tblCount);
      if (sizeComment) return { category: 'jokes', text: sizeComment };
    }
    return null;
  };

  useEffect(() => {
    /* Mostrar durante arranque del backend (!isBackendReady) o procesamiento de
       documento (isLoading). `activo` pisa las dos cuando viene dado, que es lo
       que permite probar la capa sin montar el store. */
    const shouldShow = activo ?? (isLoading || !isBackendReady);
    if (!shouldShow) {
      if (connectingInterval.current) { clearInterval(connectingInterval.current); connectingInterval.current = null; }
      // Delay hide: garantizar que el usuario aprecie el diseno durante MIN_DISPLAY_MS
      if (visible && startRef.current > 0) {
        const elapsed = Date.now() - startRef.current;
        const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
        if (remaining > 0) {
          minDisplayTimer.current = setTimeout(() => setVisible(false), remaining);
          return;
        }
      }
      setVisible(false);
      honestyShownRef.current = false;
      llmCalledRef.current = false;
      return;
    }

    if (minDisplayTimer.current) { clearTimeout(minDisplayTimer.current); minDisplayTimer.current = null; }
    startRef.current = Date.now();
    seqIdxRef.current = 0;
    const ctx = contextualInitialTip();
    const initTip = ctx || tipFor('process');
    if (!isBackendReady) {
      setTip({ category: 'process', text: ctx?.text || 'Conectando con el motor de procesamiento...' });
    } else {
      setTip(initTip);
    }
    setVisible(true);
    setConnectingSecs(0);
    if (!connectingInterval.current) {
      connectingInterval.current = setInterval(() => setConnectingSecs((s) => s + 1), 1000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isBackendReady, activo]);

  useEffect(() => {
    if (!visible) return;
    // Rotación con duración variable según la categoría de la frase actual
    // (los "comentarios de arte" duran más). Primeros 3s queda la frase seria.
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      if (elapsed < 3000) { timer = setTimeout(tick, 400); return; }

      // Honestidad a los 15s: mensaje especial una sola vez (dura más)
      if (!honestyShownRef.current && elapsed >= 15000) {
        honestyShownRef.current = true;
        const honest = tipFor('honest');
        setTip(honest);
        timer = setTimeout(tick, CATEGORY_DURATION_MS.honest);
        return;
      }

      seqIdxRef.current = (seqIdxRef.current + 1) % CATEGORY_SEQUENCE.length;
      const next = tipFor(CATEGORY_SEQUENCE[seqIdxRef.current]);
      setTip(next);
      timer = setTimeout(tick, CATEGORY_DURATION_MS[next.category]);
    };
    timer = setTimeout(tick, 400);
    return () => clearTimeout(timer);
  }, [visible]);

  // La IA genera un tip fresco cuando la carga ya es larga (>8s), una vez
  useEffect(() => {
    if (!visible || llmCalledRef.current || !apiKey) return;
    llmCalledRef.current = true;
    const iv = setInterval(() => {
      if (Date.now() - startRef.current >= 8000) {
        clearInterval(iv);
        (async () => {
          try {
            const phase = llmStatus === 'processing' ? 'classify' : 'upload';
            const cats: ('process' | 'jokes' | 'apa')[] = ['process', 'jokes', 'apa'];
            const res = await generateLoadingTip(cats[Math.floor(Math.random() * 3)], phase, apiKey, aiProviderConfig);
            if (res && res.text) setTip({ category: 'llm', text: res.text });
          } catch {
            // fallback: se queda con la biblioteca
          }
        })();
      }
    }, 500);
    return () => clearInterval(iv);
  }, [visible, apiKey, llmStatus]);

  if (!visible) return null;

  /* `que` gana sobre el mensaje derivado del estado: quien llama sabe QUÉ está
     pasando y el componente solo sabe que algo pasa. Un spinner mudo obliga a
     adivinar, y adivinar mientras se espera es la peor manera de esperar.
     `loadingQue` (el store) es el segundo en la cadena: lo escribe quien sabe
     qué está pasando, y el overlay lo dice en vez de inventar un texto. */
  const message =
    que ??
    loadingQue ??
    (!isBackendReady
      ? 'Iniciando motor de procesamiento...'
      : llmStatus === 'processing'
      ? 'Clasificando con IA…'
      : 'Procesando documento…');

  // La mascota reacciona reactiva y temáticamente a la frase exacta actual:
  const reaction = getTipReaction(tip);
  const mascotExpr = reaction.expression;
  const mascotKind = reaction.kind;
  const mascotAnim = reaction.animation;

  // Comentario en burbuja: frase limpia en rotación continua sin badges ni categorías raras.
  const renderTipComment = (size: 'sm' | 'lg') => {
    return (
      <div className={`tip-comment tip-comment-${size}`} key={tip.text}>
        <span className="tip-comment-text">
          <span className="tip-comment-marker" aria-hidden="true"></span>
          {tip.text}
        </span>
      </div>
    );
  };

  // ── PANTALLA COMPLETA (tipo juego) mientras arranca el motor ──
  // El usuario NO debe ver el inicio ni barras de "conectando": solo la
  // mascota viva + frases rotativas a pantalla completa. Si el motor tarda
  // mucho (>12s) se ofrece "Reintentar conexión" (sin escape "continuar de
  // todos modos": entrar al inicio con el backend caído no tiene salida).
  if (!isBackendReady) {
    return (
      <div className="loading-tips-fullscreen" data-testid="carga-capa" role="status" aria-live="polite">
        <AmbientCanvas />
        <div className="loading-tips-fullscreen-inner" style={{ gap: '16px' }}>
            <LoadingMascotWalkers />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="mascot-ambient-halo" />
            <div className={mascotAnim} style={{ lineHeight: 0, position: 'relative', zIndex: 2 }}>
              <DocumentMascot size={128} kind={mascotKind} expression={mascotExpr} />
            </div>
          </div>
          <div className="loading-tips-fullscreen-title">{message}</div>
          <CustomProgressCapsule />
          <StageRail llmStatus={llmStatus} />
          {renderTipComment('lg')}
          <div className="loading-tips-dots"><span /><span /><span /></div>

          {connectingSecs >= 12 && (
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                El motor tarda más de lo normal… seguimos intentando.
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => { setConnectingSecs(0); useDocStore.getState().retryBackend(); }}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Loader2 size={13} /> Reintentar conexión
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }


  return (
    <div className="loading-tips-fullscreen loading-tips-fullscreen--minimal" data-testid="carga-capa" role="status" aria-live="polite">
      <AmbientCanvas />
      <LoadingMascotWalkers />
      <div className="loading-minimal-inner" style={{ maxWidth: '620px', gap: '20px' }}>
        {/* Mascota viva con halo de ambientación suave */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="mascot-ambient-halo" />
          <div className={mascotAnim} style={{ lineHeight: 0, position: 'relative', zIndex: 2 }}>
            <DocumentMascot size={108} kind={mascotKind} expression={mascotExpr} />
          </div>
        </div>

        {/* Título de estado + Barra Cápsula de diseño propio */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
          <div className="loading-minimal-title">{message}</div>
          <CustomProgressCapsule />
        </div>

        {/* Fases del procesamiento editorial */}
        <StageRail llmStatus={llmStatus} />

        {/* Tarjeta de consejos editoriales y normas APA 7 */}
        <div className="custom-loading-card">
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--accent-primary)',
            backgroundColor: 'var(--color-accent-a08)',
            padding: '4px 12px',
            borderRadius: 'var(--radius-full)',
            marginBottom: '10px',
            border: '1px solid var(--color-accent-a20)',
          }}>
            <Sparkles size={12} />
            Criterio Editorial APA 7
          </div>
          <div className="loading-minimal-tip" key={tip.text}>
            «{tip.text}»
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingTips;
