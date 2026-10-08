/**
 * WordAPA7 — la hoja de rótulos. Una sola, y sin imports en runtime.
 *
 * Antes había dos: esta tabla y un `KIND_LABELS` de diez filas dentro de
 * `auditSlice.ts`. El backend pasó de diez `kind` a unos treinta, el slice no se
 * enteró, y su `|| f.kind` escribía el `snake_case` crudo en `localStorage` para que
 * `PaperCanvas` lo pintara encima del párrafo. La regla nueva no tenía nombre; la
 * vieja sí, y eran dos verdades.
 *
 * Por eso esto vive acá y no en un hook: un slice del store no puede importar de un
 * hook, y esa imposibilidad fue exactamente lo que produjo la tabla duplicada. Esta
 * hoja no importa nada en runtime, así que cualquiera la puede usar.
 *
 * `PROOFREAD_SPECS` —la tabla que traduce `kind` a `subtype`— también vive acá, y
 * `auditItems.ts` la reexporta para no romper los imports que ya existían. Antes
 * estaba al revés y `rotuloDeKind` tenía que ser `async` para no hacer un ciclo; una
 * función que devuelve una etiqueta no tiene por qué devolver una promesa, y una
 * hoja de rótulos que espera otra hoja es difícil de leer. Los dos tipos que se
 * necesitan son `import type`, que se borra al compilar.
 */

import type { EngineId, Severity } from './auditItems';

/** Las filas: el `subtype` que produce `PROOFREAD_SPECS` y el nombre que se lee.
 *
 *  Subtipo = el `kind` del proofreador NORMALIZADO. El backend emite un
 *  `kind` por hallazgo ('ai_phrase', 'bloom_vague', 'bloom_low'...); sin esta
 *  capa, cada uno sería su propia fila y ninguno tendría etiqueta de usuario.
 *  Toda etiqueta que `PROOFREAD_SPECS` produce tiene fila acá Y en
 *  `SUBTYPE_ACTION` (que sigue en el hook, porque es una decisión de vista):
 *  un subtipo sin acción caería en la del motor, que para IA es 'mark' pero
 *  para un motor objetivo sería 'accept' sobre un hallazgo que nadie ha
 *  revisado. */
export const SUBTYPE_LABELS: Record<string, string> = {
  portada: 'Título de portada',
  largo_parrafo: 'Extensión del párrafo',
  tiempo_verbal: 'Tiempo verbal de la fase',
  parafrasis: 'Paráfrasis o cita',
  registro_coloquial: 'Registro coloquial',
  segunda_persona: 'Segunda persona al lector',
  sigla_sin_definir: 'Sigla sin definir',
  ritmo_oracion: 'Ritmo de las oraciones',
  exclamacion: 'Exclamación en la prosa',
  unidad_mixta: 'Unidad mezclada',
  triada: 'Tríada repetida',
  densidad_conectores: 'Densidad de conectores',
  cifra_sin_cita: 'Cifra sin cita',
  verbatim_sin_comillas: 'Texto copiado sin comillas',
  parrafo_ia: 'Párrafo con índice IA alto',
  frase_ia: 'Frase típica de IA',
  muletilla: 'Muletilla o repetición',
  repeticion: 'Repetición de n-gramas',
  primera_persona: 'Primera persona gramatical',
  mezcla_personas: 'Mezcla de personas gramaticales',
  verbo_bloom: 'Verbo impreciso en objetivo (Bloom)',
  ortografia: 'Falta ortográfica o tilde',
  texto_pegado: 'Texto pegado sin espaciado',
  forma_apa: 'Forma APA de la referencia',
  palabra_repetida: 'Palabra repetida',
  pronombre_ambiguo: 'Pronombre ambiguo',
  voz_pasiva: 'Voz pasiva',
  oracion_larga: 'Oración extensa',
  idea_incompleta: 'Idea incompleta',
  objetivo_generico: 'Objetivo sin variable medible',
  objetivo_verbo: 'Verbo del objetivo (infinitivo único)',
  metodo_generico: 'Método sin detalle',
  otro: 'Otro hallazgo del corrector',
  cita_fantasma: 'Cita ausente en bibliografía',
  referencia_huerfana: 'Referencia nunca citada',
  encabezado: 'Jerarquía de encabezado',
  figura: 'Figura sin rotular',
  tabla: 'Tabla sin rotular',
};

export const ROTULO_GENERICO = 'Otro hallazgo del corrector';

const avisarFalta = (que: string, clave: string) => {
  if (process.env.NODE_ENV !== 'production') {
    /* Un `warn` y no un `throw`: la regla nueva tiene que verse aunque la tabla no la
       haya alcanzado todavía, y caerse por eso sería peor que mostrarla con un
       nombre feo. El aviso lleva la clave COMPLETA para poder agregar la fila. */
    console.warn(
      `[revisión] ${que} "${clave}" no tiene fila en SUBTYPE_LABELS. ` +
        'Se muestra con el rótulo genérico; agregá la fila.',
    );
  }
};

/**
 * El rótulo de un subtipo, y SIEMPRE uno de usuario.
 *
 * Antes era `SUBTYPE_LABELS[key] || key`, y ese `|| key` es un modo de fallo
 * por omisión: la primera vez que el backend emite una regla que la tabla no
 * conoce, el nombre interno de esa regla aparece en la lista de correcciones.
 * El usuario vio exactamente eso —`g74_verbatim_sin_comillas`— donde debía
 * leer "Texto copiado sin comillas".
 *
 * Un subtipo desconocido no se descarta ni se esconde: se muestra con un
 * nombre legible y se avisa en la consola, que es donde se arregla. La
 * prueba `noSubtipoInternoEnPantalla` verifica que hoy ninguno cae en el
 * rótulo genérico: si uno aparece, falta una fila en `SUBTYPE_LABELS`.
 */
export function rotuloDeSubtipo(key: string): string {
  const etiqueta = SUBTYPE_LABELS[key];
  if (etiqueta) return etiqueta;
  avisarFalta('el subtipo', key);
  return ROTULO_GENERICO;
}

/* ── La tabla que traduce `kind` a `subtype` ─────────────────────────────────
   Vivía en `auditItems.ts` y está acá porque el rótulo de un motor es la
   segunda mitad de la misma pregunta que el rótulo de un subtipo: sin las dos
   tablas en el mismo lugar, la segunda se tiene que inventar (que es lo que
   hacía el store con sus diez filas). `auditItems.ts` la reexporta, así que
   ningún import existente cambia. */

export interface ProofreadSource {
  excerpt?: string;
  message: string;
}

interface ProofreadSpec {
  category: EngineId;
  subtype: string;
  severity: Severity;
  /** Texto fijo de la fila, o el mensaje del motor si este ya lo explica. */
  summary: string | ((f: ProofreadSource) => string);
  suggestedText?: string;
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s);

/** El resumen de una fila cuyo texto lo pone el motor, recortado a 70. Se
 *  exporta porque `auditItems.proofreadRow` lo necesita para el `kind` que la
 *  tabla no conoce, y dos recortes son dos recortes que divergen. */
export const mensajeDelMotor = (f: ProofreadSource) => clip(f.message, 70);

const DEL_MOTOR = mensajeDelMotor;

export const PROOFREAD_SPECS: Record<string, ProofreadSpec> = {
  // Ortografía y pegado: la corrección es mecánica (objetivos, 'accept').
  ortografia: {
    category: 'spelling',
    subtype: 'ortografia',
    severity: 'high',
    summary: (f) => `Falta ortográfica o tilde: ${f.excerpt ?? ''}`,
  },
  pegado: {
    category: 'spelling',
    subtype: 'texto_pegado',
    severity: 'medium',
    summary: 'Texto pegado sin espaciado correcto',
  },

  /* Lint APA 7 de la bibliografia: forma objetiva y determinista, asi que se
     corrige con "Aceptar". El mensaje lo pone el motor (nombra el campo). */
  apa_ampersand: { category: 'style', subtype: 'forma_apa', severity: 'medium', summary: DEL_MOTOR },
  apa_doi_forma: { category: 'style', subtype: 'forma_apa', severity: 'medium', summary: DEL_MOTOR },
  apa_edicion: { category: 'style', subtype: 'forma_apa', severity: 'low', summary: DEL_MOTOR },
  apa_et_al: { category: 'style', subtype: 'forma_apa', severity: 'low', summary: DEL_MOTOR },
  apa_espaciado: { category: 'style', subtype: 'forma_apa', severity: 'low', summary: DEL_MOTOR },
  apa_punto_final: { category: 'style', subtype: 'forma_apa', severity: 'low', summary: DEL_MOTOR },

  // Redacción y Bloom.
  first_person: {
    category: 'style',
    subtype: 'primera_persona',
    severity: 'medium',
    summary: 'Uso de primera persona gramatical',
  },
  persona: {
    category: 'style',
    subtype: 'mezcla_personas',
    severity: 'medium',
    summary: DEL_MOTOR,
  },
  bloom_vague: {
    category: 'style',
    subtype: 'verbo_bloom',
    severity: 'high',
    summary: 'Verbo impreciso en objetivo académico',
    suggestedText: 'Determinar y analizar de forma rigurosa',
  },
  bloom_low: {
    category: 'style',
    subtype: 'verbo_bloom',
    severity: 'high',
    summary: 'Nivel de Bloom por debajo del objetivo del trabajo',
    suggestedText: 'Determinar y analizar de forma rigurosa',
  },

  // Lo que el detector probabilístico señala: se marca, nunca se aplica.
  ai_phrase: { category: 'ai', subtype: 'frase_ia', severity: 'medium', summary: DEL_MOTOR },
  muletilla: { category: 'ai', subtype: 'muletilla', severity: 'medium', summary: DEL_MOTOR },
  ngram_repetition: { category: 'ai', subtype: 'repeticion', severity: 'medium', summary: DEL_MOTOR },

  /* Detectados con certeza, pero sin corrección automática posible: cuál de
     las tres repeticiones se corta, a qué antecedente apunta "esto", dónde
     partir una oración de 60 palabras, qué idea falta al final. Todos 'mark'
     (la severidad espeja la que emite el auditor: incomplete → 'error',
     long_sentence → 'warn', el resto → 'info'). */
  repeticion: { category: 'style', subtype: 'palabra_repetida', severity: 'low', summary: DEL_MOTOR },
  ambigua: { category: 'style', subtype: 'pronombre_ambiguo', severity: 'low', summary: DEL_MOTOR },
  passive_voice: { category: 'style', subtype: 'voz_pasiva', severity: 'low', summary: DEL_MOTOR },
  long_sentence: { category: 'style', subtype: 'oracion_larga', severity: 'medium', summary: DEL_MOTOR },
  incompleta: { category: 'style', subtype: 'idea_incompleta', severity: 'high', summary: DEL_MOTOR },

  /* Los criterios DE FASE. Sin fila propia caían todos en `otro` —"Otro
     hallazgo del corrector"—, con el `kind` crudo en el mapa de transparencia
     del lienzo (`portada_punto_final` literal en el chip). El subtipo es la
     tercera agrupación de la vista: fase → motor → subtipo.

     Las CLAVES son las que emite el backend, escritas como las escribe
     `python/modules/phase_scope.py`: la fila tiene que responder a la clave que
     LLEGA, no a la que debería llegar.

     `parafrasis_vs_cita` y `g11_variacion_oracion` llegaron dos tareas con doble
     letra desde Python y acá se copiaron tal cual, con esta nota. El backend ya
     las corrigió y esta tabla sigue al backend: una fila escrita con la falta
     sería una fila MUERTA —el backend nunca emitiría esa clave, y el hallazgo
     volvería a salir como "Otro hallazgo del corrector"—, que es exactamente lo
     que la nota decía que había que evitar pero que no se podía evitar desde acá.
     La prueba `reglasDeFaseConNombre` lee `RULE_SCOPES` del fuente de Python y
     falla si las dos vuelven a divergir en cualquier dirección. */
  paragraph_words: { category: 'style', subtype: 'largo_parrafo', severity: 'low', summary: DEL_MOTOR },
  verbo_pasado: { category: 'style', subtype: 'tiempo_verbal', severity: 'low', summary: DEL_MOTOR },
  parafrasis_vs_cita: { category: 'style', subtype: 'parafrasis', severity: 'low', summary: DEL_MOTOR },
  /* Las dos que el backend declara en `RULE_SCOPES` y acá no tenían fila: salían
     como "Otro hallazgo del corrector", que es un nombre honesto para un
     hallazgo del que no sabemos qué es. No es el caso. */
  objetivo_sin_variable: { category: 'style', subtype: 'objetivo_generico', severity: 'medium', summary: DEL_MOTOR },
  /* Las dos leyes de objetivos de T12 son de FASE: el ambito `objetivos` las
     declara en `RULE_SCOPES`. Comparten subtipo `objetivo_verbo`, que
     `SUBTYPE_ACTION` manda a 'mark': el motor sabe que el verbo esta mal, no
     cual poner. */
  objetivo_sin_infinitivo: { category: 'style', subtype: 'objetivo_verbo', severity: 'high', summary: DEL_MOTOR },
  objetivo_multi_verbo: { category: 'style', subtype: 'objetivo_verbo', severity: 'high', summary: DEL_MOTOR },
  metodo_sin_detalle: { category: 'style', subtype: 'metodo_generico', severity: 'low', summary: DEL_MOTOR },
  /* Los dos de portada son de SOLO LECTURA: sin `suggestedText` y con subtipo
     `portada`, que `SUBTYPE_ACTION` manda a 'mark'. Que un hallazgo se informe
     y no se pueda aplicar es la invariante D6, y el subtipo la hace cumplir en
     la vista sin depender del `readOnly` que ya viaja. */
  portada_title_larga: { category: 'structure', subtype: 'portada', severity: 'low', summary: DEL_MOTOR },
  portada_punto_final: { category: 'structure', subtype: 'portada', severity: 'low', summary: DEL_MOTOR },

  /* Las ocho universales baratas del spec §12. Todas 'mark': ninguna trae un
     texto corregido, y una reescritura automática de prosa argumental sería
     decidir por el usuario. El motor detecta, la persona corrige. */
  g11_variacion_oracion: { category: 'style', subtype: 'ritmo_oracion', severity: 'low', summary: DEL_MOTOR },
  g34_sigla_sin_definir: { category: 'style', subtype: 'sigla_sin_definir', severity: 'medium', summary: DEL_MOTOR },
  g35_unidades_mixtas: { category: 'style', subtype: 'unidad_mixta', severity: 'low', summary: DEL_MOTOR },
  g51_registro_coloquial: { category: 'style', subtype: 'registro_coloquial', severity: 'high', summary: DEL_MOTOR },
  g52_exclamacion: { category: 'style', subtype: 'exclamacion', severity: 'low', summary: DEL_MOTOR },
  g53_segunda_persona: { category: 'style', subtype: 'segunda_persona', severity: 'medium', summary: DEL_MOTOR },
  g61_triada: { category: 'style', subtype: 'triada', severity: 'low', summary: DEL_MOTOR },
  g63_conectores_densidad: { category: 'style', subtype: 'densidad_conectores', severity: 'low', summary: DEL_MOTOR },
  /* R-G71 es Critica en el catalogo y por eso va con severidad 'high'. Sigue
     siendo 'mark' y no 'accept': el motor dice que le falta la cita, no sabe
     cual es. */
  g71_cifra_sin_cita: { category: 'citations', subtype: 'cifra_sin_cita', severity: 'high', summary: DEL_MOTOR },
  /* El primo de R-G74, y NO es R-G74: mide un tramo largo sin entrecomillar, no
     similitud contra la fuente, porque el documento solo guarda la entrada
     bibliografica. El mensaje PREGUNTA, no acusa. */
  g74_verbatim_sin_comillas: { category: 'citations', subtype: 'verbatim_sin_comillas', severity: 'low', summary: DEL_MOTOR },
};

/**
 * El rótulo de una regla del corrector, a partir de su `kind`.
 *
 * `PROOFREAD_SPECS` ya traduce `kind` a `subtype`; esta función encadena las dos
 * tablas. No vuelve nunca al `kind`: un `snake_case` en pantalla es un dato interno
 * que se leyó como si fuera texto, y eso ya pasó con `paragraph_words`.
 */
export function rotuloDeKind(kind: string): string {
  const spec = PROOFREAD_SPECS[kind];
  if (!spec) {
    avisarFalta('la regla', kind);
    return ROTULO_GENERICO;
  }
  return rotuloDeSubtipo(spec.subtype);
}

/** La versión del `wordapa7_marcas_map`. Al bumpearla se descarta el mapa viejo. */
export const MARCAS_MAP_VERSION = 2;
