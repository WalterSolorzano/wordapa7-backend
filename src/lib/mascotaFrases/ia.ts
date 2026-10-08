import { indiceEstable } from './hash';

export type BandaIA = 'bajo' | 'medio' | 'alto';

/** Banda de frase de IA, alineada a `BANDAS_IA` (cortes 20/50/75). <20 no habla. */
export function bandaFraseIA(score: number): BandaIA | null {
  if (score >= 75) return 'alto';
  if (score >= 50) return 'medio';
  if (score >= 20) return 'bajo';
  return null;
}

export const frasesIA: Record<BandaIA, readonly string[]> = {
  bajo: [
    'Hay un poco de IA en tu párrafo.',
    'Sospechoso, pero el beneficio de la duda te salva.',
    'Una frase robótica se te coló por ahí.',
    'Se te escapó un conector de bot sin querer.',
    'Casi limpio, dale un toquecito más tuyo.',
    'Un humano escribió esto... pero leyó demasiado ChatGPT.',
    'Bordeando la zona segura, no te confíes.',
    'Apenas un suspiro de IA, zafaste por poco.',
    'Ese "en resumen" casi te delata.',
    'Pasa el detector, pero no te hagas el loco.',
  ],
  medio: [
    'Hay un poco de párrafo en tu IA.',
    'Le cambiaste tres palabras al bot para despistar, picarón.',
    'Metiste mano, pero el robot sigue asomando la cabeza.',
    'Mita y mita: mitad tuya, mitad de Sam Altman.',
    'Ese párrafo tiene acento de algoritmo.',
    'Disimulá un poco más ese "juega un papel crucial".',
    'Se nota dónde te dio flojera redactar a ti.',
    'Un poco más humano y casi te creo.',
    'Huele a IA a medio maquillar.',
    'La IA redactó y tú pusiste las comas... mal puestas.',
  ],
  alto: [
    'Lo copiaste tal cual, hermano.',
    'Hermano, el ventilador de mi procesador huele a quemado de tanto ChatGPT.',
    'Te juro que si el profesor aplaude dos veces, este párrafo se apaga solo.',
    'Si pego la oreja a la pantalla puedo escuchar el módem de OpenAI marcando.',
    '¿Al menos le diste las gracias al bot o también lo dejaste en visto?',
    'Sam Altman debería figurar como tu coautor principal en los agradecimientos.',
    'Se escucha el zumbido de los servidores de OpenAI desde acá.',
    'Te faltó ponerle "Generado por ChatGPT" en la portada.',
    'Huele a prompt recién salido del horno.',
    'Ni disimulaste: copiaste hasta el tono condescendiente del bot.',
    '¿Le diste las gracias a la IA al menos?',
    'Esto tiene más silicio que cerebro humano.',
    'El jurado lo pasa por Turnitin y salta la alarma de incendios.',
    'Menos mal que el copy-paste no cobra impuestos.',
    '¿Tu aporte cuál fue? ¿Apretar Ctrl + V?',
  ],
};

export function fraseDeIA(score: number, seed = 'doc'): string {
  const banda = bandaFraseIA(score);
  if (banda === null) return '';
  const lista = frasesIA[banda];
  return lista[indiceEstable(seed, lista.length)];
}
