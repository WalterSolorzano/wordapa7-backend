/* WordAPA7 — QUÉ ES UN AJUSTE DE FORMATO, Y POR QUÉ NO.
 *
 * Este archivo es la respuesta a la pregunta "este campo de `APARuleSet`, ¿lo
 * edita la persona?". Y la respuesta no es un sí o un no por campo, es un
 * criterio, escrito una sola vez:
 *
 *     UN AJUSTE ES EDITABLE SI DESVÍARSE DE ÉL ES UNA DECISIÓN DEFENDIBLE.
 *
 * Con ese criterio, de los campos que `APARuleSet` tenía sin ningún control:
 *
 *   - SÍ son ajustes: los márgenes, el espacio antes y después, el prefijo de
 *     "Figura" y de "Tabla", y los estilos de viñeta y de numeración por nivel.
 *     En todos ellos hay instituciones que piden otra cosa, y seguirlas es
 *     defendible.
 *   - NO son ajustes: `doi_as_hyperlink` (en APA 7 el DOI es un enlace
 *     obligatorio, no una preferencia), `inline_text` (los niveles 4 y 5, que
 *     produce el parser y no el autor) y `table_border_style` (lo usa el perfil
 *     `scientific-journal`, o sea es del perfil y no del documento).
 *   - Y uno que el plan daba por ajuste y NO se expone: `reference_hanging_indent_cm`.
 *     Desviarse de la sangría francesa de la bibliografía sí es defendible, pero
 *     NINGÚN generador lee el campo: `referencias_module.py:637` y
 *     `scoped_apply.py:294` tienen las 0,5 pulgadas escritas a mano. Exponerlo
 *     sería un control nuevo que no hace nada, que es exactamente el defecto que
 *     esta fase está mirando. Está en `NO_ES_AJUSTE` con su motivo, que es donde
 *     puede volver a salir cuando el generador lo lea.
 *
 * LA FORMA DE QUE NO SE VUELA MENTIRA. La pestaña no escribe un `data-campo` por
 * su cuenta: escribe el que dice esta lista. Un control que no está declarado acá
 * no se puede renderizar, y `formatoTab.test.tsx` compara las dos direcciones —
 * lo declarado contra lo dibujado, y lo dibujado contra lo declarado— para que
 * las dos mitades no puedan separarse en ninguna.
 */

export type CampoDeFormato = string;

export type ClaseDeAjuste =
  | 'pagina'
  | 'tipografia'
  | 'parrafo'
  | 'listas'
  | 'titulos'
  | 'figuras'
  | 'portada';

export interface OpcionDeAjuste {
  valor: string | number;
  etiqueta: string;
  /** Segunda línea del botón: por qué esa opción, o qué es. */
  nota?: string;
  /** Al elegirla se escribe también esto. La fuente arrastra su cuerpo. */
  escribeAdemas?: Record<string, string | number | boolean>;
}

export interface Ajuste {
  /** El `data-campo` del control. Es la clave con la que el test lo encuentra. */
  clave: string;
  etiqueta: string;
  /** POR QUÉ SÍ ES UN AJUSTE, o por qué se editaba ya. No es decorativo. */
  porQue: string;
  clase: ClaseDeAjuste;
  /** Para los controles que se repiten por nivel: el nivel que muestran. */
  nivel?: 1 | 2 | 3;
  como: 'fijos' | 'opciones' | 'numero' | 'texto' | 'interruptor';
  opciones?: OpcionDeAjuste[];
  min?: number;
  max?: number;
  paso?: number;
  unidad?: string;
  /** Texto de ayuda bajo el control. */
  ayuda?: string;
}

export interface SeccionDeFormato {
  clase: ClaseDeAjuste;
  titulo: string;
  descripcion: string;
}

export const SECCIONES: SeccionDeFormato[] = [
  {
    clase: 'pagina',
    titulo: 'El papel',
    descripcion: 'Cuánto papel blanco queda alrededor del texto. El margen también decide cuánto entra por página, así que el lienzo se vuelve a paginar al cambiarlo.',
  },
  {
    clase: 'tipografia',
    titulo: 'Tipografía',
    descripcion: 'La fuente y el cuerpo del texto. APA 7 admite cualquier fuente con o sin serifa que sea estándar en la disciplina; Times New Roman 12 es la que la norma nombra.',
  },
  {
    clase: 'parrafo',
    titulo: 'Párrafo',
    descripcion: 'Interlineado, alineación, sangría y el espacio que se deja arriba y abajo de cada párrafo.',
  },
  {
    clase: 'listas',
    titulo: 'Listas',
    descripcion: 'La viñeta y la numeración de cada nivel. La jerarquía de tres niveles es la que la norma admite; un cuarto nivel ya no es una lista.',
  },
  {
    clase: 'titulos',
    titulo: 'Títulos por nivel',
    descripcion: 'Negrita, itálica, alineación y numeración de cada nivel de título.',
  },
  {
    clase: 'figuras',
    titulo: 'Figuras, tablas e índice',
    descripcion: 'Con qué palabra arranca el rótulo de una figura y de una tabla, cómo se alinean las imágenes y cómo se arma el índice.',
  },
  {
    clase: 'portada',
    titulo: 'Portada',
    descripcion: 'El formato de la portada APA 7: estudiante o profesional. El resto de los datos de la portada se escriben en el estudio de la portada, no acá.',
  },
];

/* ── Las opciones, una vez ────────────────────────────────────────────────── */

const FUENTES: OpcionDeAjuste[] = [
  { valor: 'Times New Roman', etiqueta: 'Times New Roman', nota: '12 pt · la que nombra APA 7', escribeAdemas: { font_size_pt: 12 } },
  { valor: 'Calibri', etiqueta: 'Calibri', nota: '11 pt', escribeAdemas: { font_size_pt: 11 } },
  { valor: 'Arial', etiqueta: 'Arial', nota: '11 pt', escribeAdemas: { font_size_pt: 11 } },
  { valor: 'Georgia', etiqueta: 'Georgia', nota: '11 pt', escribeAdemas: { font_size_pt: 11 } },
];

const TAMANOS: OpcionDeAjuste[] = [10, 11, 12, 13, 14, 16, 18, 20].map((pt) => ({
  valor: pt,
  etiqueta: `${pt} pt`,
}));

const INTERLINEADOS: OpcionDeAjuste[] = [
  { valor: 1.0, etiqueta: 'Sencillo', nota: '1,0' },
  { valor: 1.5, etiqueta: '1,5 líneas' },
  { valor: 2.0, etiqueta: 'Doble', nota: '2,0 · lo que pide APA 7' },
];

const ALINEACIONES: OpcionDeAjuste[] = [
  { valor: 'left', etiqueta: 'Izquierda', nota: 'lo que pide APA 7' },
  { valor: 'justify', etiqueta: 'Justificado' },
];

const ALINEACIONES_DE_TITULO: OpcionDeAjuste[] = [
  { valor: 'left', etiqueta: 'Izquierda' },
  { valor: 'center', etiqueta: 'Centrado' },
  { valor: 'right', etiqueta: 'Derecha' },
];

const NUMERACIONES_DE_TITULO: OpcionDeAjuste[] = [
  { valor: 'none', etiqueta: 'Sin numerar', nota: 'lo que pide APA 7' },
  { valor: 'decimal', etiqueta: '1. 2. 3.' },
  { valor: 'upperRoman', etiqueta: 'I. II. III.' },
  { valor: 'lowerRoman', etiqueta: 'i. ii. iii.' },
  { valor: 'upperLetter', etiqueta: 'A. B. C.' },
  { valor: 'lowerLetter', etiqueta: 'a. b. c.' },
];

const VIÑETAS: OpcionDeAjuste[] = [
  { valor: 'disc', etiqueta: 'Disco lleno' },
  { valor: 'circle', etiqueta: 'Círculo' },
  { valor: 'square', etiqueta: 'Cuadrado' },
  { valor: 'dash', etiqueta: 'Rayita' },
];

const NUMERACIONES: OpcionDeAjuste[] = [
  { valor: 'decimal', etiqueta: '1.' },
  { valor: 'lowerLetter', etiqueta: 'a.' },
  { valor: 'upperLetter', etiqueta: 'A.' },
  { valor: 'lowerRoman', etiqueta: 'i.' },
  { valor: 'upperRoman', etiqueta: 'I.' },
  { valor: 'none', etiqueta: 'Sin numerar' },
];

const ALINEACIONES_DE_IMAGEN: OpcionDeAjuste[] = [
  { valor: 'left', etiqueta: 'Izquierda' },
  { valor: 'center', etiqueta: 'Centrada' },
  { valor: 'right', etiqueta: 'Derecha' },
];

const ESTILOS_DE_IMAGEN: OpcionDeAjuste[] = [
  { valor: 'plain', etiqueta: 'Estándar APA', nota: 'sin marco ni sombra' },
  { valor: 'journal', etiqueta: 'Revista científica', nota: 'con marco fino' },
];

const ESTILOS_DE_INDICE: OpcionDeAjuste[] = [
  { valor: 'apa', etiqueta: 'APA estándar' },
  { valor: 'dotted', etiqueta: 'Con puntos suspensivos' },
  { valor: 'plain', etiqueta: 'Simple' },
];

const FORMATOS_DE_PORTADA: OpcionDeAjuste[] = [
  { valor: 'student', etiqueta: 'Estudiante' },
  { valor: 'professional', etiqueta: 'Profesional' },
];

/* ── La lista: un control por entrada, y nada más ─────────────────────────── */

export const AJUSTES: Ajuste[] = [
  /* El papel. */
  {
    clave: 'margins_cm',
    etiqueta: 'Márgenes',
    porQue: 'Es un ajuste: hay tesis que piden 3 cm y tesis que piden 2,54, y el generador lo aplica a las cuatro páginas (`style_engine.py:66`).',
    clase: 'pagina',
    como: 'numero',
    min: 1,
    max: 6,
    paso: 0.01,
    unidad: 'cm',
    ayuda: 'Los cuatro lados por igual. Cambiarlos repagina el lienzo al instante.',
  },
  {
    clave: 'space_before_pt',
    etiqueta: 'Espacio antes del párrafo',
    porQue: 'Es un ajuste: con doble interlineado el espacio extra se ve, y hay estilos institucionales que lo piden en cero (`style_engine.py:332`).',
    clase: 'parrafo',
    como: 'numero',
    min: 0,
    max: 72,
    paso: 1,
    unidad: 'pt',
  },
  {
    clave: 'space_after_pt',
    etiqueta: 'Espacio después del párrafo',
    porQue: 'Es un ajuste, por la misma razón que el de antes: se escribe y el generador lo aplica (`style_engine.py:333`).',
    clase: 'parrafo',
    como: 'numero',
    min: 0,
    max: 72,
    paso: 1,
    unidad: 'pt',
  },

  /* Tipografía. */
  {
    clave: 'font_family',
    etiqueta: 'Fuente del texto',
    porQue: 'Es un ajuste: APA 7 admite cualquier fuente estándar de la disciplina, y lo aplica el generador y el lienzo.',
    clase: 'tipografia',
    como: 'fijos',
    opciones: FUENTES,
  },
  {
    clave: 'font_size_pt',
    etiqueta: 'Tamaño del cuerpo',
    porQue: 'Es un ajuste: la norma nombra Times New Roman 12, pero acepta equivalentes, y el tamaño se escribe aparte de la fuente.',
    clase: 'tipografia',
    como: 'opciones',
    opciones: TAMANOS,
  },

  /* Párrafo. */
  {
    clave: 'line_spacing',
    etiqueta: 'Interlineado',
    porQue: 'Es un ajuste: el doble es lo que pide APA 7 y el paso 5 del wizard ya lo dejaba cambiar por si la institución pide otra cosa.',
    clase: 'parrafo',
    como: 'opciones',
    opciones: INTERLINEADOS,
  },
  {
    clave: 'alignment',
    etiqueta: 'Alineación',
    porQue: 'Es un ajuste: APA 7 alinea a la izquierda, y hay revistas que piden justificado. El generador lo aplica.',
    clase: 'parrafo',
    como: 'opciones',
    opciones: ALINEACIONES,
  },
  {
    clave: 'paragraph_indent_cm',
    etiqueta: 'Sangría de primera línea',
    porQue: 'Es un ajuste: la sangría de 1,27 cm es la de APA 7, y este es el ÚNICO lugar donde se cambia. El paso 5 del wizard tenía otro control que no llegaba a ningún lado y se borró.',
    clase: 'parrafo',
    como: 'numero',
    min: 0,
    max: 3,
    paso: 0.05,
    unidad: 'cm',
  },

  /* Listas: los tres niveles, viñeta y numeración. */
  ...([1, 2, 3] as const).flatMap((nivel) => [
    {
      clave: `bullet_style_level${nivel}`,
      etiqueta: `Viñeta del nivel ${nivel}`,
      porQue: 'Es un ajuste: la jerarquía de viñetas de la norma es una recomendación y hay tesis que usan otra (`generator.py:1644`).',
      clase: 'listas' as const,
      nivel,
      como: 'opciones' as const,
      opciones: VIÑETAS,
    },
    {
      clave: `number_style_level${nivel}`,
      etiqueta: `Numeración del nivel ${nivel}`,
      porQue: 'Es un ajuste por la misma razón que la viñeta, y el plan solo lo nombraba para las viñetas: el generador los lee de la misma forma (`generator.py:1656`), así que el criterio da el mismo veredicto para los dos.',
      clase: 'listas' as const,
      nivel,
      como: 'opciones' as const,
      opciones: NUMERACIONES,
    },
  ]),

  /* Títulos: negrita, itálica, alineación y numeración de cada nivel. */
  ...([1, 2, 3] as const).flatMap((nivel) => [
    {
      clave: `heading_levels.${nivel}.bold`,
      etiqueta: `Nivel ${nivel}: negrita`,
      porQue: 'Venía con control en el estudio y el generador lo aplica. El énfasis de un nivel es presentación, y hay guías de institución que lo piden distinto.',
      clase: 'titulos' as const,
      nivel,
      como: 'interruptor' as const,
    },
    {
      clave: `heading_levels.${nivel}.italic`,
      etiqueta: `Nivel ${nivel}: itálica`,
      porQue: 'Lo mismo que la negrita, y al revés: el nivel 3 es negrita con itálica en APA 7, y no todos los estilos lo llevan igual.',
      clase: 'titulos' as const,
      nivel,
      como: 'interruptor' as const,
    },
    {
      clave: `heading_levels.${nivel}.alignment`,
      etiqueta: `Nivel ${nivel}: alineación`,
      porQue: 'Venía con control en el estudio y el generador lo aplica. El nivel 1 va centrado en APA 7, y hay tesis que lo piden a la izquierda.',
      clase: 'titulos' as const,
      nivel,
      como: 'opciones' as const,
      opciones: ALINEACIONES_DE_TITULO,
    },
    {
      clave: `heading_numbering_style_lvl${nivel}`,
      etiqueta: `Nivel ${nivel}: numeración`,
      porQue: 'Venía con control en el estudio y el generador lo aplica. APA 7 NO numera los títulos, y las tesis suelen numerarlos: por eso "sin numerar" es la primera opción.',
      clase: 'titulos' as const,
      nivel,
      como: 'opciones' as const,
      opciones: NUMERACIONES_DE_TITULO,
    },
  ]),

  /* Figuras, tablas e índice. */
  {
    clave: 'figure_label_prefix',
    etiqueta: 'Palabra del rótulo de figura',
    porQue: 'Es un ajuste: la norma dice "Figure" en inglés y "Figura" en español, y el documento puede estar en cualquiera de los dos (`generator.py:1492`).',
    clase: 'figuras',
    como: 'texto',
    ayuda: 'Lo que va antes del número: "Figura 1", "Figure 1", "Fig. 1".',
  },
  {
    clave: 'table_label_prefix',
    etiqueta: 'Palabra del rótulo de tabla',
    porQue: 'Es un ajuste, por la misma razón que el de figura, y el generador lo usa igual (`generator.py:1429`).',
    clase: 'figuras',
    como: 'texto',
    ayuda: 'Lo que va antes del número: "Tabla 1", "Table 1".',
  },
  {
    clave: 'image_alignment',
    etiqueta: 'Alineación de las imágenes',
    porQue: 'Es un ajuste: la norma no dice dónde van las imágenes, y hay estilos que las pegan al margen.',
    clase: 'figuras',
    como: 'opciones',
    opciones: ALINEACIONES_DE_IMAGEN,
  },
  {
    clave: 'image_style',
    etiqueta: 'Estilo de las imágenes',
    porQue: 'Es un ajuste: el marco fino es de revista, no de APA, y el generador lo distingue.',
    clase: 'figuras',
    como: 'opciones',
    opciones: ESTILOS_DE_IMAGEN,
  },
  {
    clave: 'toc_style',
    etiqueta: 'Estilo del índice',
    porQue: 'Venía con control en el estudio y se aplica al índice que genera Word.',
    clase: 'figuras',
    como: 'opciones',
    opciones: ESTILOS_DE_INDICE,
  },

  /* Portada. */
  {
    clave: 'portada.apa_format',
    etiqueta: 'Formato de la portada',
    porQue: 'Es un ajuste: son las dos portadas que la norma define, estudiante y profesional, y elegir una es una decisión del autor.',
    clase: 'portada',
    como: 'opciones',
    opciones: FORMATOS_DE_PORTADA,
  },
];

/* ── Lo que NO se edita, y por qué ────────────────────────────────────────── */

export interface NoEsAjuste {
  campo: string;
  porQue: string;
}

export const NO_ES_AJUSTE: NoEsAjuste[] = [
  {
    campo: 'doi_as_hyperlink',
    porQue: 'En APA 7 el DOI va como enlace: es obligatorio, no una preferencia. Un control para esto solo serviría para poder hacer un documento mal.',
  },
  {
    campo: 'inline_text',
    porQue: 'Es el tratamiento de los niveles 4 y 5, que produce el parser cuando reconoce el título y no el autor. Que sea un interruptor significaría dejar escribir un nivel que el documento no tiene.',
  },
  {
    campo: 'table_border_style',
    porQue: 'Lo usa el perfil `scientific-journal` (`python/profiles.py:73`), o sea es del perfil y no del documento. Editarlo acá prometería un cambio que el perfil vuelve a sobrescribir.',
  },
  {
    campo: 'reference_hanging_indent_cm',
    porQue: 'El campo existe y desviarse de él sería defendible, pero NINGÚN generador lo lee: la sangría francesa de la bibliografía está escrita a mano en `referencias_module.py:637` y en `scoped_apply.py:294`. Un control acá cambiaría un número que se pierde, que es un control muerto nuevo. Sale de acá el día que el generador lo lea.',
  },
];

/* ── La ayuda ──────────────────────────────────────────────────────────────── */

export const ajustesDe = (clase: ClaseDeAjuste): Ajuste[] => AJUSTES.filter((a) => a.clase === clase);

/** La etiqueta de un campo, para poder decir qué se restauró sin inventar un
 *  mapa paralelo de nombres. `undefined` si el campo no es un ajuste. */
export const etiquetaDe = (clave: string): string | undefined =>
  AJUSTES.find((a) => a.clave === clave)?.etiqueta;

/** Los campos de `APARuleSet` que esta fase considera ajuste. Sirve para que
 *  `ambitoDeAjustes.test.ts` vea que la pestaña Formato no inventa destinos. */
export const CLAVES_DE_AJUSTE = new Set(AJUSTES.map((a) => a.clave));
