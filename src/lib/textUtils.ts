import { DocumentModel } from '../types';

/**
 * Convierte un número arábigo entero a notación romana en mayúsculas.
 */
export function toRoman(num: number): string {
  if (num <= 0) return '';
  const lookup: { [key: string]: number } = {
    M: 1000, CM: 900, D: 500, CD: 400,
    C: 100, XC: 90, L: 50, XL: 40,
    X: 10, IX: 9, V: 5, IV: 4, I: 1
  };
  let roman = '';
  let n = num;
  for (const i in lookup) {
    while (n >= lookup[i]) {
      roman += i;
      n -= lookup[i];
    }
  }
  return roman;
}

/**
 * Formatea un contador de título según la notación elegida por nivel.
 * Espejo de `_format_numero` del backend, para que preview y .docx coincidan.
 */
export function aNumero(n: number, estilo: string): string {
  if (estilo === 'upperRoman' || estilo === 'roman') return toRoman(n);
  if (estilo === 'lowerRoman') return toRoman(n).toLowerCase();
  if (estilo === 'upperLetter') return String.fromCharCode(64 + ((n - 1) % 26) + 1);
  if (estilo === 'lowerLetter') return String.fromCharCode(96 + ((n - 1) % 26) + 1);
  return String(n);
}

/**
 * Limpia prefijos numéricos o marcadores de encabezados como [ROMAN], [DECIMAL], 'I.', '1.', etc.
 */
export function cleanHeadingPrefix(text: string): string {
  if (!text) return '';
  let clean = text.trim();
  clean = clean.replace(/^\[(ROMAN|DECIMAL)\]\s*/i, '');
  // Exigir punto tras números romanos [IVXLCDM]+\. para no recortar la 'I' de 'Introducción'
  clean = clean.replace(/^(?:[IVXLCDM]+\.|\d+(?:\.\d+)*\.?)\s*/i, '');
  clean = clean.replace(/^\[(ROMAN|DECIMAL)\]\s*/i, '');
  return clean.trim();
}

/**
 * Migra estructuras de documentos antiguas a versiones de esquema actualizadas.
 */
export function migrateDocument(doc: any): DocumentModel {
  if (!doc) return doc;
  
  // Migration to schema_version 2: Split heading_numbering_style to lvl1, lvl2, lvl3
  if (doc.schema_version !== 2) {
    const defaultNumStyle = doc.apa_rules?.heading_numbering_style ?? 'decimal';
    if (doc.apa_rules) {
      doc.apa_rules.heading_numbering_style_lvl1 = doc.apa_rules.heading_numbering_style_lvl1 ?? defaultNumStyle;
      doc.apa_rules.heading_numbering_style_lvl2 = doc.apa_rules.heading_numbering_style_lvl2 ?? defaultNumStyle;
      doc.apa_rules.heading_numbering_style_lvl3 = doc.apa_rules.heading_numbering_style_lvl3 ?? defaultNumStyle;
      delete doc.apa_rules.heading_numbering_style;
    }
    doc.schema_version = 2;
  }
  
  return doc as DocumentModel;
}