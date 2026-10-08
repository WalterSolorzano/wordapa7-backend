import { indiceEstable } from './hash';

export type BandaRevision = 'solida' | 'buena' | 'media' | 'baja';

/** Banda de color del % de revisión: verde ≥90 · azul 80–89 · ámbar 60–79 · rojo <60. */
export function bandaRevision(score: number): BandaRevision {
  if (score >= 90) return 'solida';
  if (score >= 80) return 'buena';
  if (score >= 60) return 'media';
  return 'baja';
}

export function colorDeRevision(score: number): string {
  switch (bandaRevision(score)) {
    case 'solida': return 'var(--color-success)';
    case 'buena': return 'var(--color-accent)';
    case 'media': return 'var(--color-warning)';
    default: return 'var(--color-danger)';
  }
}

export const frasesRevision: Record<BandaRevision, readonly string[]> = {
  solida: [
    'Esto está sólido, sigue así.',
    'Sospechosamente perfecto... ¿seguro lo hiciste tú?',
    'Impecable. Hasta parece que estudiaste.',
    'Aprobado. Ya podés ir tramitando el título.',
    'Ni el revisor más amargado te encuentra un pero acá.',
  ],
  buena: [
    'Vas bien, pero hay tela que cortar.',
    'Casi casi parece una tesis de verdad.',
    'Vas bien, ya casi no me sangran los ojos.',
    'El asesor va a fingir que lo leyó todo y te aprueba.',
    'Falta poco: unos retoques y te graduás con honores de milagro.',
  ],
  media: [
    'Esto pide una pasada en serio.',
    'Pasa raspando, pero con dolor.',
    'Se nota que lo escribiste con sueño y desesperación.',
    'Tiene potencial, pero todavía da un poco de vergüenza ajena.',
    'Un par de arreglos y parecerá que sabías lo que hacías.',
    'No está horrible, pero tampoco para presumir en LinkedIn.',
    'Si el jurado pestañea rápido, capaz y no lo nota.',
    'Si el jurado llega con hambre y rápido para almorzar, capaz y no se dan cuenta.',
    'Está en ese punto donde no te reprueban de inmediato, pero te miran con decepción.',
    'Le faltan cinco minutos de dignidad y queda presentable.',
    'Si pestañean en la página 4 zafamos, pero no mires a nadie a los ojos.',
    'Disfrazalo un poco más, que se note que al menos trasnochaste.',
  ],
  baja: [
    'Yo que tú no presentaba esto.',
    'Dios mío... dale una leída antes de que nos expulsen a los dos.',
    'Si abren este documento en el proyector, yo me hago el que no te conozco.',
    'Voy a fingir un corte de luz para darte tiempo de arreglar esto.',
    'Esto no lo salva ni una veladora a San Judas Tadeo.',
    'El decano va a leer las primeras tres líneas y nos manda a la policía académica.',
    'Dime que subiste el archivo equivocado por favor, te lo suplico.',
    'Ni modo, tocó tramitar la baja temporal antes de que se enteren.',
    'Si le entregas esto al asesor, ni te molestes en llevar café.',
    'El botón de borrar todo no se ve tan mala idea ahora mismo.',
    'Esto no pasa ni como borrador de servilleta.',
    'Tus profes van a llorar, y no de la emoción.',
    '¿Esto es una tesis o una declaración de guerra al jurado?',
  ],
};

/** Estado del analizador de objetivos Bloom. */
export type EstadoObjetivos =
  | 'sin_objetivos'
  | 'sin_general'
  | 'todo_cumple'
  | 'general_falla'
  | 'jerarquia_rota'
  | 'sin_variable'
  | 'dos_verbos'
  | 'verbo_vago'
  | 'nivel_bajo';

export const frasesObjetivos: Record<EstadoObjetivos, readonly string[]> = {
  sin_objetivos: [
    'Todavía no veo objetivos en el documento.',
    'Sin objetivos no hay brújula. Escribí el general y sus específicos.',
  ],
  sin_general: [
    'Hay específicos, pero les falta el ancla: el objetivo general.',
    'Sin objetivo general, los específicos flotan sin jerarquía.',
  ],
  todo_cumple: [
    'Objetivos sólidos: verbo medible y variable a la vista.',
    'El ancla y sus específicos están en nivel. Nada que corregir.',
    'Así se escribe: un verbo medible por objetivo y su variable.',
  ],
  general_falla: [
    'El objetivo general no aguanta el nivel: empezá por ahí.',
    'Si el ancla floja, todo lo que cuelga de ella también.',
  ],
  jerarquia_rota: [
    'Un específico apunta más alto que el general. Ajustá la jerarquía.',
    'Los específicos no pueden superar al ancla: revisá el nivel.',
  ],
  sin_variable: [
    'Falta el objeto de estudio: sin variable, el verbo no se mide.',
    'Un verbo sin variable es una promesa sin forma de comprobarla.',
  ],
  dos_verbos: [
    'Un objetivo, un verbo rector. Soltá el segundo.',
    'Dos verbos en un objetivo es hacer dos tareas a medias.',
  ],
  verbo_vago: [
    '«Conocer» no se mide: ni tú sabés cuándo terminaste.',
    'Ese verbo no deja huella comprobable. Cambialo por uno medible.',
  ],
  nivel_bajo: [
    'El verbo arranca por debajo del nivel que exige la rúbrica.',
    'Subí el verbo a Analizar o más: compréndelo, no lo describas.',
  ],
};

export function fraseDeRevision(score: number, seed = 'doc'): string {
  const lista = frasesRevision[bandaRevision(score)];
  return lista[indiceEstable(seed, lista.length)];
}

export function fraseDeObjetivos(estado: EstadoObjetivos, seed = 'objetivos'): string {
  const lista = frasesObjetivos[estado];
  return lista[indiceEstable(seed, lista.length)];
}

/** Frase de detalle de revisión (ej. REV-L1 RevisionDetail). */
export function fraseDeDetalleRevision(
  pos: number,
  total: number,
  titulo: string,
  accion: 'accept' | 'mark' | 'view' | 'none' | 'resolveGhosts' | 'autoCaption'
): string {
  if (total <= 0) return '';
  const base = `Vas bien: ${pos + 1} de ${total}.`;
  if (accion === 'accept') {
    return `${base} Cierra ${titulo.toLowerCase()} de un golpe.`;
  }
  if (accion === 'mark') {
    return `${base} El detector propone: marca lo que quieras revisar.`;
  }
  return base;
}
