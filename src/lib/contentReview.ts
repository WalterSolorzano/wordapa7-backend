/* WordAPA7 — Revisión de contenido (separada de la revisión de formato APA).
 *
 * Checks heurísticos de calidad académica, separados del validador de formato:
 * objetivos (taxonomía de Bloom), introducción/planteamiento, justificación,
 * hipótesis, metodología, resumen y conclusiones.
 *
 * v1 es 100% local (sin LLM): las reglas que el usuario marcó como "(requiere
 * LLM)" se dejan documentadas pero desactivadas para no gastar tokens.
 */

export interface ContentFinding {
  id: string;
  section: string;
  rule: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  suggestion: string;
  elementIds: string[];
}

export interface ElementLike {
  id: string;
  type?: string;
  text?: string;
  heading_level?: number | null;
}

// ── Taxonomía de Bloom: verbos "prohibidos" (no medibles) ────────────────────

const BLOOM_FORBIDDEN = new Set([
  'conocer', 'entender', 'saber', 'comprender', 'aprender', 'reconocer',
  'memorizar', 'recordar', 'notar', 'percatarse', 'familiarizarse', 'estudiar',
]);

// Verbos medibles por nivel de Bloom (para variedad y jerarquía)
export const BLOOM_LEVELS: { level: number; verbs: string[] }[] = [
  { level: 1, verbs: ['recordar', 'identificar', 'definir', 'listar', 'mencionar', 'nombrar', 'reconocer'] },
  { level: 2, verbs: ['comprender', 'explicar', 'describir', 'resumir', 'interpretar', 'clasificar', 'comparar'] },
  { level: 3, verbs: ['aplicar', 'usar', 'utilizar', 'implementar', 'ejecutar', 'resolver', 'demostrar'] },
  { level: 4, verbs: ['analizar', 'diferenciar', 'organizar', 'relacionar', 'examinar', 'contrastar'] },
  { level: 5, verbs: ['evaluar', 'justificar', 'valorar', 'juzgar', 'criticar', 'priorizar'] },
  { level: 6, verbs: ['crear', 'diseñar', 'desarrollar', 'planear', 'proponer', 'construir', 'elaborar', 'formular'] },
];

export function bloomLevel(verb: string): number | null {
  const v = verb.toLowerCase().replace(/^(me |te |se |le |nos )?/, '');
  for (const lv of BLOOM_LEVELS) {
    if (lv.verbs.some((x) => v.startsWith(x))) return lv.level;
  }
  return null;
}

function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function firstWord(text: string): string {
  const m = (text || '').trim().match(/^[a-zA-ZáéíóúñÁÉÍÓÚÑ]+/);
  return m ? m[0].toLowerCase() : '';
}

function isInfinitive(word: string): boolean {
  return /(ar|er|ir)$/.test(word) && word.length > 3;
}

// ── Agrupación por secciones ─────────────────────────────────────────────────

const SECTION_HEADINGS: { key: string; re: RegExp }[] = [
  { key: 'objetivos', re: /objetiv/ },
  { key: 'introduccion', re: /introduccion|planteamiento|problema/ },
  { key: 'justificacion', re: /justificaci/ },
  { key: 'hipotesis', re: /hipote/ },
  { key: 'metodologia', re: /metodolog/ },
  { key: 'resumen', re: /resumen|abstract/ },
  { key: 'conclusiones', re: /conclu/ },
];

function isHeading(e: ElementLike): boolean {
  return e.type === 'heading' || e.type === 'title';
}

function collectSections(elements: readonly ElementLike[]): Record<string, ElementLike[]> {
  const sections: Record<string, ElementLike[]> = {};
  let current: string | null = null;
  for (const e of elements) {
    const t = normalize(e.text || '');
    if (!t) continue;
    if (isHeading(e)) {
      const hit = SECTION_HEADINGS.find((s) => s.re.test(t));
      current = hit ? hit.key : null;
      continue;
    }
    if (current) (sections[current] = sections[current] || []).push(e);
  }
  return sections;
}

// ── Objetivos (taxonomía de Bloom) ───────────────────────────────────────────

/**
 * Los objetivos, separados en general y específicos.
 *
 * LA SEPARACIÓN SALE DEL DOCUMENTO, NO DE LA POSICIÓN. Antes se asumía «el
 * primero es el general» (`items.length - 1`), que es falso en cuanto el autor
 * escribe el H2 «Objetivos específicos» antes del general o pone el general en
 * su propio H2: la cuenta mentía y el general podía caer entre los específicos.
 * Se agrupa por el H2 que los abre —«general» vs «específic»— y, si el documento
 * no trae H2 que los separe, se conserva la convención (el primero es el
 * general), que es lo que hace un estudiante cuando escribe una lista sola.
 */
export function separarGeneralDeEspecificos(
  elements: readonly ElementLike[],
  planos: readonly ElementLike[],
): { general: ElementLike[]; especificos: ElementLike[] } {
  const general: ElementLike[] = [];
  const especificos: ElementLike[] = [];
  let dentro = false;
  let destino: ElementLike[] | null = null;

  for (const e of elements) {
    const t = normalize(e.text || '');
    if (isHeading(e)) {
      if (!t) continue;
      if (!/objetiv/.test(t)) {
        dentro = false;
        destino = null;
        continue;
      }
      dentro = true;
      if (/general/.test(t)) destino = general;
      else if (/espec/.test(t)) destino = especificos;
      else destino = null; // el H1 «Objetivos» abre la sección, no asigna bando
      continue;
    }
    if (!dentro || !destino) continue;
    if (e.type === 'bullet' || e.type === 'numbered_list' || e.type === 'paragraph') {
      destino.push(e);
    }
  }

  if (general.length === 0 && especificos.length === 0) {
    return { general: planos.slice(0, 1), especificos: planos.slice(1) };
  }
  return { general, especificos };
}

export function reviewObjectives(general: ElementLike[], especificos: ElementLike[]): ContentFinding[] {
  const out: ContentFinding[] = [];
  const items = [...general, ...especificos];

  // Separar general vs específicos por el primer verbo de cada objetivo
  const verbs: { verb: string; elem: ElementLike }[] = [];
  for (const it of items) {
    const text = (it.text || '').trim();
    const first = firstWord(text);
    if (!first) continue;
    if (BLOOM_FORBIDDEN.has(first)) {
      out.push({
        id: `obj-verb-${it.id}`,
        section: 'objetivos',
        rule: 'objetivo_verbo_no_medible',
        severity: 'warning',
        message: `"${first}" no es un verbo medible según la taxonomía de Bloom.`,
        suggestion: 'Probalo con "identificar", "describir", "analizar" o "evaluar".',
        elementIds: [it.id],
      });
    }
    if (!isInfinitive(first)) {
      out.push({
        id: `obj-infin-${it.id}`,
        section: 'objetivos',
        rule: 'objetivo_sin_infinitivo',
        severity: 'warning',
        message: 'Un objetivo empieza con verbo en infinitivo (-ar/-er/-ir).',
        suggestion: 'Arrancá la frase con el verbo: "Analizar…", "Evaluar…", "Proponer…".',
        elementIds: [it.id],
      });
    }
    if (first) verbs.push({ verb: first, elem: it });
  }

  // Mismo verbo repetido entre específicos
  const seen = new Map<string, string[]>();
  for (const { verb, elem } of verbs) {
    const arr = seen.get(verb) || [];
    arr.push(elem.id);
    seen.set(verb, arr);
  }
  for (const [verb, ids] of seen) {
    if (ids.length > 1) {
      out.push({
        id: `obj-dup-${verb}`,
        section: 'objetivos',
        rule: 'objetivo_verbo_repetido',
        severity: 'info',
        message: `Dos o más objetivos empiezan con el mismo verbo ("${verb}").`,
        suggestion: 'Dale variedad: usá sinónimos de nivel similar en cada específico.',
        elementIds: ids,
      });
    }
  }

  // Específico con verbo de nivel más alto que el general
  if (verbs.length >= 2) {
    const general = verbs[0].verb;
    const genLevel = bloomLevel(general);
    if (genLevel) {
      for (let i = 1; i < verbs.length; i++) {
        const lv = bloomLevel(verbs[i].verb);
        if (lv && lv > genLevel) {
          out.push({
            id: `obj-lvl-${verbs[i].elem.id}`,
            section: 'objetivos',
            rule: 'objetivo_nivel_mayor_que_general',
            severity: 'info',
            message: `El específico arranca con "${verbs[i].verb}" (nivel ${lv}) que apunta más alto que el general (${genLevel}).`,
            suggestion: 'Revisá el orden de niveles: lo específico suele venir de lo general.',
            elementIds: [verbs[i].elem.id],
          });
        }
      }
    }
  }

  // Cantidad de específicos fuera de rango (3-5 típico). El número sale de los
  // específicos REALES, no de `items.length - 1`.
  const nEspecificos = especificos.length;
  if (items.length >= 2 && (nEspecificos < 3 || nEspecificos > 5)) {
    out.push({
      id: 'obj-count',
      section: 'objetivos',
      rule: 'objetivos_cantidad',
      severity: 'info',
      message: `Tenés ${nEspecificos} objetivos específicos (lo típico es entre 3 y 5).`,
      suggestion: nEspecificos < 3 ? 'Sumá uno o dos específicos que cubran el general.' : 'Considerá agrupar o recortar específicos redundantes.',
      elementIds: especificos.map((e) => e.id),
    });
  }

  return out;
}

// ── Introducción y planteamiento del problema ────────────────────────────────

function reviewIntroduction(sections: ElementLike[], allText: string): ContentFinding[] {
  const out: ContentFinding[] = [];
  const text = sections.map((e) => e.text || '').join(' ');
  const norm = normalize(text);
  const totalWords = allText.split(/\s+/).length;
  const introWords = text.split(/\s+/).length;

  if (!/[¿?]/.test(text) && !/como se|como se pretende|cual es/.test(norm)) {
    out.push({
      id: 'intro-question',
      section: 'introduccion',
      rule: 'intro_sin_pregunta',
      severity: 'warning',
      message: 'No encuentro una pregunta de investigación clara.',
      suggestion: 'Sumá una pregunta (¿cómo…? / ¿cuál…?) que oriente el problema.',
      elementIds: sections.map((e) => e.id),
    });
  }

  const firstSentence = normalize(sections[0]?.text || '');
  if (/segun la rae|segun el diccionario|se define como|definid|definiramos como/.test(firstSentence)) {
    out.push({
      id: 'intro-rae',
      section: 'introduccion',
      rule: 'intro_definicion_diccionario',
      severity: 'info',
      message: 'La introducción arranca con una definición de diccionario.',
      suggestion: 'Mejor presentá el problema de investigación directamente.',
      elementIds: sections[0] ? [sections[0].id] : [],
    });
  }

  if (introWords > 0 && totalWords > 200 && introWords / totalWords < 0.03) {
    out.push({
      id: 'intro-short',
      section: 'introduccion',
      rule: 'intro_demasiado_corta',
      severity: 'info',
      message: `La introducción es cortita (${introWords} palabras) para un documento de ${totalWords}.`,
      suggestion: 'Aportá contexto suficiente antes de plantear el problema.',
      elementIds: sections.map((e) => e.id),
    });
  }

  if (!/se divide en|se estructur|se organiza|en el cap[ií]tulo|el siguiente cap|primero se|consta de/.test(norm)) {
    out.push({
      id: 'intro-roadmap',
      section: 'introduccion',
      rule: 'intro_sin_roadmap',
      severity: 'info',
      message: 'No se menciona cómo se organiza el documento (roadmap).',
      suggestion: 'Una frase del tipo "este trabajo se divide en…" orienta al lector.',
      elementIds: sections.map((e) => e.id),
    });
  }

  return out;
}

// ── Justificación ────────────────────────────────────────────────────────────

function reviewJustificacion(sections: ElementLike[]): ContentFinding[] {
  const out: ContentFinding[] = [];
  const text = sections.map((e) => e.text || '').join(' ');
  const norm = normalize(text);

  if (/es importante porque es importante|necesario porque es necesario|importante porque si|porque se necesita/.test(norm)) {
    out.push({
      id: 'just-circular',
      section: 'justificacion',
      rule: 'just_razonamiento_circular',
      severity: 'warning',
      message: 'Esto suena a "es importante porque sí": la razón se repite sin agregar nada.',
      suggestion: 'Sumá una razón concreta: dato, impacto o consecuencia observable.',
      elementIds: sections.map((e) => e.id),
    });
  }

  if (!/(practi|pr[aá]ctic|social|teo|teóric|ambiental|econom|benefici|relevancia|importancia|necesidad)/.test(norm)) {
    out.push({
      id: 'just-relevancia',
      section: 'justificacion',
      rule: 'just_sin_relevancia',
      severity: 'info',
      message: 'Toda justificación se apoya en algo práctico, social o teórico.',
      suggestion: 'Explicitá en qué dimensión aporta (práctica, social y/o teórica).',
      elementIds: sections.map((e) => e.id),
    });
  }

  return out;
}

// ── Hipótesis ────────────────────────────────────────────────────────────────

function reviewHipotesis(sections: ElementLike[]): ContentFinding[] {
  const out: ContentFinding[] = [];
  const text = sections.map((e) => e.text || '').join(' ');
  const norm = normalize(text);

  if (text.trim().endsWith('?')) {
    out.push({
      id: 'hip-pregunta',
      section: 'hipotesis',
      rule: 'hipotesis_como_pregunta',
      severity: 'error',
      message: 'Una hipótesis se afirma, no se pregunta.',
      suggestion: 'Convertila en un enunciado: "la implementación de X reduce Y".',
      elementIds: sections.map((e) => e.id),
    });
  }

  if (!/si .*entonces|variable independiente|variable dependiente|relacion[a-z]* entre|a mayor .* menor|influenci/.test(norm)) {
    out.push({
      id: 'hip-variables',
      section: 'hipotesis',
      rule: 'hipotesis_sin_variables',
      severity: 'warning',
      message: 'No veo las variables de la hipótesis bien diferenciadas.',
      suggestion: 'Clarificá variable independiente y dependiente (o la relación entre ellas).',
      elementIds: sections.map((e) => e.id),
    });
  }

  return out;
}

// ── Metodología ──────────────────────────────────────────────────────────────

function reviewMetodologia(sections: ElementLike[]): ContentFinding[] {
  const out: ContentFinding[] = [];
  const text = sections.map((e) => e.text || '').join(' ');
  const norm = normalize(text);

  if (!/(cualitativ|cuantitativ|mixto|mixta|exploratori|descriptiv|correlacional|experimental|no experimental)/.test(norm)) {
    out.push({
      id: 'met-tipo',
      section: 'metodologia',
      rule: 'metodologia_sin_tipo',
      severity: 'warning',
      message: 'No encuentro el tipo de investigación declarado.',
      suggestion: 'Declará si es cualitativa, cuantitativa, mixta, exploratoria, descriptiva o correlacional.',
      elementIds: sections.map((e) => e.id),
    });
  }

  if (!/(poblaci|muestra)/.test(norm)) {
    out.push({
      id: 'met-poblacion',
      section: 'metodologia',
      rule: 'metodologia_sin_poblacion',
      severity: 'warning',
      message: 'No se define población ni muestra.',
      suggestion: 'Detallá quién/quiénes conforman la población y cómo se tomó la muestra.',
      elementIds: sections.map((e) => e.id),
    });
  }

  if (!/(encuesta|entrevista|cuestionario|escala|observaci|instrumento|ficha|checklist|check list|lista de cotejo)/.test(norm)) {
    out.push({
      id: 'met-instrumentos',
      section: 'metodologia',
      rule: 'metodologia_sin_instrumentos',
      severity: 'info',
      message: 'No se mencionan los instrumentos de recolección.',
      suggestion: 'Especificá con qué instrumento se recolectaron los datos.',
      elementIds: sections.map((e) => e.id),
    });
  }

  return out;
}

// ── Resumen / Abstract ───────────────────────────────────────────────────────

function reviewResumen(sections: ElementLike[], title: string): ContentFinding[] {
  const out: ContentFinding[] = [];
  const text = sections.map((e) => e.text || '').join(' ');
  const words = text.split(/\s+/).filter(Boolean).length;

  if (words > 0 && (words < 150 || words > 250)) {
    out.push({
      id: 'res-longitud',
      section: 'resumen',
      rule: 'resumen_longitud',
      severity: 'info',
      message: `Tu resumen tiene ${words} palabras; el rango típico es 150-250.`,
      suggestion: words < 150 ? 'Amplialo para cubrir método, resultados y conclusión.' : 'Recortalo a lo esencial para quedar dentro de 150-250.',
      elementIds: sections.map((e) => e.id),
    });
  }

  const missing: string[] = [];
  if (!/objetiv/.test(normalize(text))) missing.push('objetivo');
  if (!/m[eé]todo/.test(normalize(text))) missing.push('método');
  if (!/resultad/.test(normalize(text))) missing.push('resultado');
  if (!/conclu/.test(normalize(text))) missing.push('conclusión');
  if (missing.length > 0) {
    out.push({
      id: 'res-componentes',
      section: 'resumen',
      rule: 'resumen_faltan_componentes',
      severity: 'warning',
      message: `Un buen resumen toca objetivo, método, resultado y conclusión — te falta: ${missing.join(', ')}.`,
      suggestion: 'Asegurate de que el resumen mencione esos cuatro componentes.',
      elementIds: sections.map((e) => e.id),
    });
  }

  // Palabras clave que repiten el título
  const kwLine = sections.find((e) => /palabras clave|keywords/.test(normalize(e.text || '')));
  if (kwLine && title) {
    const kwWords = (kwLine.text || '')
      .replace(/palabras clave|keywords/gi, '')
      .split(/[;,.\n]/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length > 3);
    const titleWords = normalize(title).split(/\s+/).filter((w) => w.length > 3);
    const overlap = kwWords.filter((w) => titleWords.includes(w));
    if (overlap.length >= 2) {
      out.push({
        id: 'res-keywords',
        section: 'resumen',
        rule: 'resumen_keywords_repten_titulo',
        severity: 'info',
        message: `Las palabras clave repiten el título (${overlap.join(', ')}).`,
        suggestion: 'Dale variedad: usá términos que no estén en el título.',
        elementIds: [kwLine.id],
      });
    }
  }

  return out;
}

// ── Conclusiones y recomendaciones ───────────────────────────────────────────

function reviewConclusiones(sections: ElementLike[]): ContentFinding[] {
  const out: ContentFinding[] = [];
  const text = sections.map((e) => e.text || '').join(' ');
  const norm = normalize(text);

  if (/se recomienda seguir investigando|se recomienda investigar|futuras investigaciones|se sugiere continuar|quedan pendientes futuros/.test(norm)) {
    out.push({
      id: 'concl-recomendacion',
      section: 'conclusiones',
      rule: 'conclusiones_recomendacion_vaga',
      severity: 'info',
      message: '"Se recomienda seguir investigando" es un poco genérico.',
      suggestion: 'Especificá qué investigar exactamente y con qué enfoque.',
      elementIds: sections.map((e) => e.id),
    });
  }

  return out;
}

// ── Orquestador principal ────────────────────────────────────────────────────

export function reviewContent(elements: ElementLike[], title = ''): ContentFinding[] {
  if (!elements || elements.length === 0) return [];
  const sections = collectSections(elements);
  const allText = elements.map((e) => e.text || '').join(' ');

  const objetivos = sections['objetivos'] || [];
  const { general, especificos } = separarGeneralDeEspecificos(elements, objetivos);

  const out: ContentFinding[] = [];
  out.push(...reviewObjectives(general, especificos));
  out.push(...reviewIntroduction(sections['introduccion'] || [], allText));
  out.push(...reviewJustificacion(sections['justificacion'] || []));
  out.push(...reviewHipotesis(sections['hipotesis'] || []));
  out.push(...reviewMetodologia(sections['metodologia'] || []));
  out.push(...reviewResumen(sections['resumen'] || [], title));
  out.push(...reviewConclusiones(sections['conclusiones'] || []));
  return out;
}

export const CONTENT_SECTION_LABELS: Record<string, string> = {
  objetivos: 'Objetivos (Bloom)',
  introduccion: 'Introducción / Planteamiento',
  justificacion: 'Justificación',
  hipotesis: 'Hipótesis',
  metodologia: 'Metodología',
  resumen: 'Resumen / Abstract',
  conclusiones: 'Conclusiones y recomendaciones',
};

// ── Objetivos con nivel Bloom actual y propuesto (para el Informe general) ────

export interface ObjetivoBloom {
  elementId: string;
  texto: string;
  verboActual: string;
  nivelActual: number | null;
  nivelPropuesto: number;
  verboPropuesto: string;
  /** El general abre la sección; los específicos van después. */
  esGeneral: boolean;
  /** Verbos medibles alternativos del nivel propuesto, sin el actual. */
  alternativas: string[];
  /** Un segundo verbo medible dentro de la misma frase (p. ej. «… y describir…»). */
  verboExtra: string | null;
  tieneDosVerbos: boolean;
  /** El objetivo se queda en el verbo sin decir sobre qué actúa. */
  sinVariable: boolean;
  /** Explicación breve, en una frase, de por qué está o no está bien. */
  analisis: string;
}

/** Nivel mínimo que debería alcanzar un objetivo de tesis. */
const NIVEL_OBJETIVO = 4;

/** Verbos medibles que la taxonomía no lista pero el mockup sí ofrece en chips. */
const BLOOM_EXTRA: Record<number, string[]> = { 5: ['determinar', 'establecer'] };

const LEXICO_VERBOS = new Set(BLOOM_LEVELS.flatMap((l) => l.verbs));

/** Palabras de enlace que no cuentan como el objeto de un objetivo. */
const ENLACES = new Set([
  'los', 'las', 'el', 'la', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al',
  'y', 'o', 'u', 'que', 'su', 'sus', 'para', 'por', 'con', 'en', 'se', 'lo',
  'le', 'les', 'como', 'a', 'ante', 'bajo', 'contra', 'desde', 'entre',
  'hacia', 'hasta', 'sin', 'sobre', 'tras', 'the', 'and',
]);

function palabras(texto: string): string[] {
  return (texto.match(/[a-záéíóúñ]+/gi) || []).map((w) => w.toLowerCase());
}

function verboDeNivel(nivel: number): string {
  const fila = BLOOM_LEVELS.find((l) => l.level === nivel);
  return fila ? fila.verbs[0] : '';
}

/** Verbos medibles que aparecen DESPUÉS del primero (no cuentan los enlaces). */
function verbosMedibles(texto: string): string[] {
  return palabras(texto).filter((w, i) => i > 0 && LEXICO_VERBOS.has(w) && isInfinitive(w));
}

/** ¿El objetivo dice sobre qué o quién actúa, o es solo un verbo suelto? */
function tieneObjeto(texto: string): boolean {
  return palabras(texto)
    .slice(1)
    .some((w) => w.length > 3 && !ENLACES.has(w) && !LEXICO_VERBOS.has(w));
}

function alternativasDe(nivel: number, verboActual: string): string[] {
  const base = BLOOM_LEVELS.find((l) => l.level === nivel)?.verbs ?? [];
  const extra = BLOOM_EXTRA[nivel] ?? [];
  return [...base, ...extra].filter((v) => v !== verboActual).slice(0, 3);
}

function analisisDe(o: {
  verboActual: string;
  nivelActual: number | null;
  nivelPropuesto: number;
  tieneDosVerbos: boolean;
  verboExtra: string | null;
  sinVariable: boolean;
}): string {
  if (o.sinVariable) {
    return `«${o.verboActual}» no dice sobre qué actúa: sin objeto de estudio, el nivel no se puede medir.`;
  }
  if (o.tieneDosVerbos && o.verboExtra) {
    return `Tiene dos verbos; «${o.verboExtra}» apunta a otro nivel. Dejá uno solo.`;
  }
  if (o.nivelActual === null) {
    return `«${o.verboActual}» no es un verbo medible en Bloom; probá uno de nivel ${o.nivelPropuesto}.`;
  }
  if (o.nivelActual < o.nivelPropuesto) {
    return `Arranca en nivel ${o.nivelActual}; para una tesis conviene apuntar al ${o.nivelPropuesto}.`;
  }
  return `Nivel ${o.nivelActual}: el verbo sostiene el objetivo.`;
}

/** Reemplaza SOLO el primer verbo, conservando la mayúscula inicial. */
export function reemplazarVerbo(texto: string, nuevo: string): string {
  const m = (texto || '').match(/^([a-zA-ZáéíóúñÁÉÍÓÚÑ]+)/);
  if (!m) return nuevo ? `${nuevo} ${texto}`.trim() : texto;
  const eraMayus = m[1][0] === m[1][0].toUpperCase();
  const verbo = eraMayus ? nuevo.charAt(0).toUpperCase() + nuevo.slice(1) : nuevo;
  return verbo + texto.slice(m[1].length);
}

/**
 * Objetivos del documento con su verbo actual, una propuesta de nivel superior,
 * el análisis de por qué y un set de alternativas para aplicar.
 * Reutiliza la misma separación general/específicos que `reviewContent`, para
 * que el informe y las reglas no cuenten objetivos distintos.
 */
export function objetivosBloom(elements: readonly ElementLike[]): ObjetivoBloom[] {
  if (!elements || elements.length === 0) return [];
  const objetivos = collectSections(elements)['objetivos'] || [];
  if (objetivos.length === 0) return [];
  const { general, especificos } = separarGeneralDeEspecificos(elements, objetivos);
  const generalIds = new Set(general.map((e) => e.id));

  return [...general, ...especificos]
    .map((e) => {
      const texto = (e.text || '').trim();
      const verboActual = firstWord(texto);
      if (!verboActual) return null;
      const nivelActual = bloomLevel(verboActual);
      const nivelPropuesto = nivelActual === null || nivelActual < NIVEL_OBJETIVO ? NIVEL_OBJETIVO : nivelActual;
      const verboExtra: string | null = verbosMedibles(texto)[0] ?? null;
      const parcial: Omit<ObjetivoBloom, 'analisis'> = {
        elementId: e.id,
        texto,
        verboActual,
        nivelActual,
        nivelPropuesto,
        verboPropuesto: nivelPropuesto === nivelActual ? verboActual : verboDeNivel(nivelPropuesto),
        esGeneral: generalIds.has(e.id),
        alternativas: alternativasDe(nivelPropuesto, verboActual),
        verboExtra,
        tieneDosVerbos: verboExtra !== null,
        sinVariable: !tieneObjeto(texto),
      };
      return { ...parcial, analisis: analisisDe(parcial) };
    })
    .filter((x): x is ObjetivoBloom => x !== null);
}
