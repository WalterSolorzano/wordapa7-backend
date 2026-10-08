import type { NodoJerarquia } from './jerarquia';
import type { ElementModel } from '../types';

export interface DiagnosticItem {
  id: string;
  nodoId: string;
  tipo: 'binomio' | 'llamada_figura' | 'encuadre';
  mensaje: string;
  gravedad: 'advertencia' | 'sugerencia';
}

export function auditarBinomio(nodos: readonly NodoJerarquia[]): DiagnosticItem[] {
  const items: DiagnosticItem[] = [];
  function revisar(n: NodoJerarquia) {
    if (n.hijos.length === 1) {
      items.push({
        id: `binomio_${n.hijos[0].id}`,
        nodoId: n.hijos[0].id,
        tipo: 'binomio',
        mensaje: `APA 7: "${n.hijos[0].titulo}" es una subdivisión solitaria. Requiere al menos dos subsecciones correlativas o integrarse en el nivel superior.`,
        gravedad: 'advertencia',
      });
    }
    n.hijos.forEach(revisar);
  }
  nodos.forEach(revisar);
  return items;
}

export function auditarLlamadasFiguras(
  capitulo: NodoJerarquia,
  elementos: readonly ElementModel[]
): DiagnosticItem[] {
  const items: DiagnosticItem[] = [];
  const targetId = capitulo.element_id || capitulo.elementoId || capitulo.id;
  const idxInicio = elementos.findIndex((e) => e.id === targetId);
  if (idxInicio === -1) return items;

  let textoCapitulo = '';
  const figuras: { num: number; id: string }[] = [];

  for (let i = idxInicio + 1; i < elementos.length; i++) {
    const el = elementos[i];
    if (el.type === 'heading' && (el.heading_level || 1) <= capitulo.nivel) break;
    if (el.type === 'paragraph' && el.text) {
      textoCapitulo += ' ' + el.text.toLowerCase();
    } else if (el.type === 'image' && el.image_info?.figure_number) {
      figuras.push({ num: el.image_info.figure_number, id: el.id });
    }
  }

  for (const f of figuras) {
    const mencionRegex = new RegExp(`(figura|fig\\.?)\\s*${f.num}\\b`, 'i');
    if (!mencionRegex.test(textoCapitulo)) {
      items.push({
        id: `llamada_fig_${f.id}`,
        nodoId: capitulo.id,
        tipo: 'llamada_figura',
        mensaje: `La Figura ${f.num} no tiene llamada explícita en el texto ("como se muestra en la Figura ${f.num}").`,
        gravedad: 'advertencia',
      });
    }
  }

  return items;
}

export function auditarEncuadre(
  capitulo: NodoJerarquia,
  elementos: readonly ElementModel[]
): boolean {
  const targetId = capitulo.element_id || capitulo.elementoId || capitulo.id;
  const idxInicio = elementos.findIndex((e) => e.id === targetId);
  if (idxInicio === -1) return true;

  for (let i = idxInicio + 1; i < elementos.length; i++) {
    const el = elementos[i];
    if (el.type === 'paragraph' && el.text?.trim()) return true;
    if (el.type === 'heading') return false;
  }
  return true;
}
