/**
 * WordAPA7 — el tamaño de hoja, en un solo lugar y con las dos verdades.
 *
 * Hay dos cosas que necesitan el tamaño de papel y que hasta ahora no se
 * hablaban: la hoja del CSS (`.paper`, que leía `210mm` escrito a mano) y la
 * geometría de la paginación (`pageGeometry.ts`, que ya leía `rules.page_size`).
 * Con una en A4 y la otra en Carta, el lienzo mostraba un papel que el `.docx`
 * final no tenía. Nadie lo notó porque los dos tamaños parecían razonables.
 *
 * Este archivo es el puente: traduce `rules.page_size` al atributo
 * `data-page-size` de `<html>`, que es la forma en que el CSS elige el par de
 * medidas. El patrón es el de `data-theme`, que escribe `uiSlice.setTheme`: un
 * atributo en la raíz, y dos pares de tokens declarados siempre.
 *
 * `aplicarPageSizeEnHtml` se llama desde `PaperCanvas` y no desde la pestaña que
 * escribe el valor, por una razón concreta: el atributo tiene que reflejar el
 * documento que se está viendo aunque Ajustes nunca se haya abierto en esa
 * sesión. Si lo escribiera la pestaña, un documento con A4 guardado se abriría
 * con un `data-page-size` de Carta hasta que alguien entrara a Ajustes.
 */
import type { PageSize } from '../types';

/** Los dos tamaños, en milímetros. Deben coincidir con `TAMANOS_DE_PAGINA_MM` de
 *  `python/generation/style_engine.py`: son la misma tabla, en dos idiomas, y
 *  por eso los números están escritos en las dos. `documentoTab.test.tsx` mira
 *  que el backend y el cliente digitan lo mismo. */
export const TAMANOS_DE_PAPEL: {
  valor: PageSize;
  etiqueta: string;
  /** Lo que dice la norma, no lo que mide: es lo que la persona busca. */
  nota: string;
  anchoMm: number;
  altoMm: number;
}[] = [
  {
    valor: 'carta',
    etiqueta: 'Carta',
    nota: '8,5" x 11" — 215,9 x 279,4 mm. El tamaño de APA 7 y el de DESIGN.md.',
    anchoMm: 215.9,
    altoMm: 279.4,
  },
  {
    valor: 'a4',
    etiqueta: 'A4',
    nota: '210 x 297 mm. El tamaño de casi toda Hispanoamérica y Europa.',
    anchoMm: 210,
    altoMm: 297,
  },
];

/** El tamaño por omisión. Carta, y no A4: `DESIGN.md:75`. */
export const PAGE_SIZE_POR_DEFECTO: PageSize = 'carta';

/**
 * Deja el valor en un `PageSize`, o en el default si no es uno.
 *
 * Hace falta porque `rules` puede venir de tres lugares que no seecastigan: el
 * store de esta sesión, un documento guardado antes de que el campo existiera, y
 * el backend con un perfil viejo. Sin esto, `rules.page_size` sin definir lo
 * leería `pageGeometry.ts` como Carta y el selector mostraría ninguna opción
 * elegida, que es un control que parece apagado.
 */
export function normalizarPageSize(v: unknown): PageSize {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'a4') return 'a4';
  /* 'letter' es como el lienzo llamaba a Carta antes de que existiera el campo.
     Aceptarlo es lo que hace que un documento guardado con esa forma abra con
     Carta en vez de quedarse sin opción elegida. */
  if (s === 'carta' || s === 'letter') return 'carta';
  return PAGE_SIZE_POR_DEFECTO;
}

/**
 * Escribe `data-page-size` en `<html>`. Mismo patrón que `data-theme`.
 *
 * Se escribe SIEMPRE, incluso para Carta: sin el atributo, la hoja depende de
 * que el default del CSS sea el correcto, y ese default puede cambiar sin que
 * nadie mire el JS. Con el atributo puesto, lo que dice el documento gana
 * siempre.
 */
export function aplicarPageSizeEnHtml(pageSize: unknown): PageSize {
  const valor = normalizarPageSize(pageSize);
  try {
    document.documentElement.setAttribute('data-page-size', valor);
  } catch {
    /* Sin DOM no hay atributo que escribir: en un test de lógica pura esta
       función tiene que poder correr igual. */
  }
  return valor;
}

/** El tamaño que hay puesto ahora mismo en `<html>`, para leerlo en un test. */
export function pageSizeEnHtml(): string | null {
  try {
    return document.documentElement.getAttribute('data-page-size');
  } catch {
    return null;
  }
}
