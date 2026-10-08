import { indiceEstable } from './hash';

export const FRASES_ACCIONES = {
  analizandoTexto: 'Peleando con las sangrías para que no se salgan de lugar…',
  buscandoReferencias: 'Citando cosas que ni tú sabes si existen…',
  revisandoEstructura: 'Revisando que la estructura no se desmorone como castillo de naipes...',
  magiaFormat: 'Dejámelo a mí: domo el interlineado y las citas antes de que el asesor abra el doc.',
  documentoListo: 'Tu documento sobrevivió a las normas APA 7. Listo para descargar y celebrar.',
  salidaLista: 'Tu documento tiene salida.',
  salidaSubtitulo: 'Elige el formato, revisa una página si lo necesitas y llévatelo contigo.',
};

export function fraseResultadoAuditoria(n: number): string {
  if (n <= 0) {
    return 'Tu texto pasó la revisión: sin marcas de texto generado ni ortografía.';
  }
  return `Encontré ${n} párrafo${n === 1 ? '' : 's'} para revisar. Están marcados sobre el documento.`;
}

export function fraseResultadoReferencias(total: number): string {
  if (total <= 0) {
    return 'Todas las citas ya tienen su referencia en la bibliografía.';
  }
  return `Encontré ${total} coincidencia${total === 1 ? '' : 's'} pendiente. Vamos a resolverlas en Referencias.`;
}

export function fraseResultadoEstructura(issues: number): string {
  if (issues <= 0) {
    return 'La estructura del documento es sólida.';
  }
  return `Encontré ${issues} cosas por mejorar en la estructura del documento.`;
}

export type TipoPortadaMascota = 'original' | 'apa7' | 'uni' | 'pro' | 'custom';

export const FRASES_PORTADAS: Record<TipoPortadaMascota, string> = {
  original: 'Protegiendo logos y formato original del documento',
  apa7: 'Formato oficial APA 7 para entregas académicas',
  uni: 'Estructura universitaria institucional oficial',
  pro: 'Portada profesional con titulación corrida y numeración',
  custom: 'Importa tu propia plantilla Word (.docx)',
};

export function fraseMascotaPortada(tipo?: string): string {
  if (tipo && tipo in FRASES_PORTADAS) {
    return FRASES_PORTADAS[tipo as TipoPortadaMascota];
  }
  return 'Selecciona un estilo de portada';
}
