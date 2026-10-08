/**
 * WordAPA7 — Fase 3: utilidades del editor inline (contentEditable).
 *
 * El navegador puede insertar HTML arbitrario en un contentEditable
 * (pegar con formato, autocompletado, arrastrar). El modelo Pydantic es
 * texto plano: toda entrada pasa por sanitizeToPlainText antes de tocar
 * el store. Cero formato arbitrario (spec §3.1 Fase 3).
 */

/** Texto plano desde HTML: quita tags, decodifica entidades, br/div → \n. */
export function sanitizeToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(div|p)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\r/g, '')
    .replace(/\n{2,}/g, '\n')
    .replace(/\n+$/g, '');
}

/** Split de texto plano con clamp defensivo. */
export function splitTextAt(text: string, offset: number): { before: string; after: string } {
  const n = text.length;
  const o = Number.isFinite(offset) ? Math.max(0, Math.min(n, Math.floor(offset))) : 0;
  return { before: text.slice(0, o), after: text.slice(o) };
}

/** textContent normalizado de un contentEditable (un solo nodo de texto). */
export function extractPlainText(el: HTMLElement): string {
  return (el.textContent || '').replace(/\r/g, '');
}
