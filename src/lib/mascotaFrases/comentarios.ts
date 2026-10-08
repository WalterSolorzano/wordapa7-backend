import { indiceEstable } from './hash';

export const COMENTARIOS_EMOJI: readonly string[] = [
  '¿emojis en el Word? se te salió el ChatGPT, bro',
  'estos emojis huelen a prompt de IA sin editar',
  'el profe va a ver estos emojis y le va a dar algo',
  'un emoji en APA 7… atrevido, pero no pasa',
  'borrá esos emojis antes de que los vea el jurado',
];

export const COMENTARIOS_TABLA_EMOJI: readonly string[] = [
  '¿emojis en una tabla académica? ni de chiste',
  'la tabla no necesita caritas, necesita datos',
  'tabla con emojis = entrega rechazada en 3, 2, 1…',
  'limpiá los emojis de esa tabla, por favor',
];

export const COMENTARIOS_CONCLUSION: readonly string[] = [
  'otro "en resumen"… seguro se puede decir distinto',
  '¿"en conclusión" otra vez? pará un poco',
  'conector quemadísimo: "cabe destacar" es del 2010',
  'tus profes leen "en síntesis" y bostezan',
  'busquemos un conector que no sea de plantilla',
  'este párrafo pide a gritos redacción propia',
];

export const COMENTARIOS_IA: readonly string[] = [
  'eso de "cabe destacar" suena bastante a generador',
  'esta frase tiene olor a GPT recién horneado',
  '¿lo escribiste vos o tu amigo de OpenAI?',
  'redacción sospechosamente robótica por acá',
  'el detector de IA va a tener un festín con esto',
  'ese "es crucial mencionar" no engaña a nadie',
  'un toque de edición humana no le vendría mal',
];

export const COMENTARIOS_CITA_FANTASMA: readonly string[] = [
  'Citaste a {author} pero no está en la bibliografía... ¿se fue sin pagar la cuenta?',
  '{author} anda prófugo de la justicia y de tus referencias.',
  '¿Quién diablos es {author}? ¿Tu primo el que estudia leyes?',
  'Inventaste a {author} sobre la marcha y pensaste que no me iba a dar cuenta.',
  '{author} no aparece ni en el padrón electoral de la bibliografía.',
  'Citaste a {author} pero te olvidaste de agregarlo al final.',
  '¿Quién es {author}? En las referencias no lo conoce nadie.',
];

export const COMENTARIOS_REFERENCIA_HUERFANA: readonly string[] = [
  'Metiste {n} libros en la bibliografía que ni tocaste... puro adorno para el CV.',
  'Esas {n} referencias están ahí paradas como maniquíes en tienda vacía.',
  'Pusiste {n} autores de relleno para impresionar al jurado y te pillé.',
  'Esas {n} referencias nunca entraron al texto... se quedaron esperando en la puerta.',
  '¿Para qué inflaste la bibliografía con {n} textos si ni los abriste en el navegador?',
  'Pusiste {n} en la bibliografía que nunca citaste... ¿estaban de adorno?',
];

export const COMENTARIOS_MAYUSCULAS: readonly string[] = [
  '¿por qué gritás? APA no necesita mayúsculas fijas',
  'todo en mayúsculas… ¿se te trabó el Bloq Mayús?',
  'bajale a las mayúsculas, esto no es Twitter',
];

export const COMENTARIOS_SPANGLISH: readonly string[] = [
  '¿"linkear"? existe "enlazar" en castellano',
  'demasiado Spanglish para una tesis seria',
  'esos anglicismos piden traducción académica',
];

export const COMENTARIOS_DUPLICADOS: readonly string[] = [
  'este párrafo dice casi lo mismo que el anterior',
  'déjà vu: esto ya lo leí dos líneas arriba',
  'estás repitiendo la misma idea con otras palabras',
];

export const COMENTARIOS_PARRAFO_LARGO: readonly string[] = [
  'Este párrafo necesita tanque de oxígeno... ¡pará a respirar!',
  'Más de 200 palabras sin un solo punto y aparte. Casi me asfixio.',
  'Un punto y aparte no cobra peaje, úsalo.',
  'Más de 200 palabras sin respirar… dividilo antes de que nos desmayemos.',
];

export const COMENTARIOS_PRIMERA_PERSONA: readonly string[] = [
  '¿"Yo considero"? Compa, aquí tu opinión no vale nada, vale la ciencia.',
  'Bajale dos cambios al "yo": en APA tú no existes, eres un ente neutral.',
  'Esto es una tesis doctoral, no tu historia destacada de Instagram.',
  'Saca el "nosotros" de ahí antes de que el jurado pregunte quiénes son los otros fantasmas.',
  'Pasa ese verbo a tercera persona antes de que te acusen de exceso de autoestima.',
  '¿"Yo opino"? En APA tú no existes, existe la evidencia.',
];

export const COMENTARIOS_COPYPASTE: readonly string[] = [
  'alguien copió y pegó de PDF, se nota.',
  'cortes de línea raros… olor a copia y pega de internet.',
  'ese formateo roto delata el copy-paste directo.',
];

export const COMENTARIOS_POSITIVOS: readonly string[] = [
  'esta parte está limpia, ni te voy a molestar',
  'bien citado, buen tono… así da gusto',
  'este párrafo se lee solo, excelente trabajo',
  'formato impecable por acá, sigamos',
];

export const COMENTARIOS_TITULO_PUNTO: readonly string[] = [
  'Un punto al final del título... me acaba de dar un microinfarto en el código.',
  'Quítale ese punto al título antes de que el asesor nos tire con una grapadora.',
  'El manual APA 7 acaba de prenderse fuego solo por ese punto en el título.',
  'Los títulos no llevan punto final, compadre, no te pongas poético.',
  'Ese punto al final del encabezado grita pánico a tres cuadras de distancia.',
  'Un punto al final del título... el manual APA 7 llora en una esquina.',
];

export const COMENTARIOS_FRASE_REPETIDA: readonly string[] = [
  'Pusiste "{frase}" {n} veces... ya hasta le agarré cariño de tanto verla.',
  'Si repites "{frase}" una vez más, invocas al fantasma de APA en el cuarto.',
  '¿Te están pagando regalías cada vez que escribes "{frase}" o qué onda?',
  '"{frase}" otra vez... voy a empezar a cobrarte peaje por usarla.',
  'El botón de sinónimos existe, no muerde, prométome que lo vas a tocar.',
  'Pusiste "{frase}" {n} veces... ¿te pagan por mención?',
];

export function comentarioCitaFantasma(author: string, seed = author): string {
  const tpl = COMENTARIOS_CITA_FANTASMA[indiceEstable(seed, COMENTARIOS_CITA_FANTASMA.length)];
  return tpl.replace('{author}', author);
}

export function comentarioReferenciaHuerfana(n: number, seed = `${n}`): string {
  const tpl = COMENTARIOS_REFERENCIA_HUERFANA[indiceEstable(seed, COMENTARIOS_REFERENCIA_HUERFANA.length)];
  return tpl.replace('{n}', `${n}`);
}

export function comentarioTituloPunto(seed = 'titulo_punto'): string {
  return COMENTARIOS_TITULO_PUNTO[indiceEstable(seed, COMENTARIOS_TITULO_PUNTO.length)];
}

export function comentarioFraseRepetida(frase: string, n: number, seed = frase): string {
  const tpl = COMENTARIOS_FRASE_REPETIDA[indiceEstable(seed, COMENTARIOS_FRASE_REPETIDA.length)];
  return tpl.replace('{frase}', frase).replace('{n}', `${n}`);
}
