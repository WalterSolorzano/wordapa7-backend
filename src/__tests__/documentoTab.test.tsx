/**
 * La pestaña Documento: el papel y el idioma, que son del archivo.
 *
 * Lo que se prueba acá es lo que no se ve en una captura, y es la parte que
 * hacía que el control fuera de mentira:
 *
 *  - QUE EL TAMAÑO DE HOJA ES UN DATO, NO UNA CONSTANTE. Se escribe en
 *    `rules.page_size`, que es el mismo campo del que lee la paginación del
 *    lienzo (`getPageGeometry`) y del que lee el `.docx`
 *    (`style_engine.aplicar_tamano_pagina`). Antes eran dos cosas distintas: el
 *    CSS decía A4 y el archivo decía el tamaño del original.
 *  - QUE EL LENGUAJE SE ESCRIBE Y LLEGA. Un selector de idioma que no escribe en
 *    el campo que el backend lee es un campo decorativo; esta prueba mira que
 *    escriba en `portada.language`, que es de donde sale el `w:lang`.
 *  - QUE EL PERFIL SE PUEDE ELEGIR DESDE ACÁ. `setSessionProfile` se llamaba
 *    únicamente desde el `<select>` del paso 0 del wizard, así que desde Ajustes
 *    no había forma de cambiar de perfil. Y que los dos perfiles que se ofrecen
 *    son los dos que el backend define, no un perfil institucional inventado.
 *  - QUE EL LÍMITE ESTÁ DICHO. La pestaña promete en su línea de ámbito que los
 *    ajustes viajan con el documento, y eso es cierto de la persistencia pero
 *    FALSO del aislamiento: `rules` es uno en el store. Si el texto dejara de
 *    reconocerlo, esta prueba lo tiene que notar.
 *  - QUE SIN DOCUMENTO NO HAY CAMPOS MUDOS (Review Focus #4).
 *  - QUE LAS TABLAS DE LAS DOS CARAS COINCIDEN. Los tamaños de hoja y los
 *    idiomas están escritos a mano en el cliente y en el backend; si una gana
 *    una entrada o un milímetro la otra, la pantalla y el archivo se contradicen,
 *    que es justo el defecto que esta fase vino a matar.
 */
import React, { act } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DocumentoTab, expresionDeDocumento } from '../components/settings/tabs/DocumentoTab';
import { pestanaPorId } from '../components/settings/tabs';
import { useDocStore } from '../store/useDocStore';
import { getPageGeometry } from '../lib/pageGeometry';
import { TAMANOS_DE_PAPEL, normalizarPageSize, pageSizeEnHtml } from '../lib/pageSizeEnHtml';
import { PORTADA_IDIOMAS } from '../types';

/* Los fuentes del backend se leen con `?raw` y no con `node:fs`: el shim de
 * `nodePolyfills()` de `vite.config.ts` no trae `readFileSync`, así que leer del
 * disco desde un test es un `TypeError` en tiempo de import. `?raw` además
 * entrega el texto sin transformar, que es lo que se quiere comparar.
 *
 * El `.css` NO se puede leer así: `design-system.css?raw` devuelve una cadena
 * vacía en este runner. Los tokens de la hoja se comprueban en
 * `designTokens.test.ts`, que ya tenía un lector de la hoja funcionando. */
import modelosCrudo from '../../python/models.py?raw';
import styleEngineCrudo from '../../python/generation/style_engine.py?raw';

const PESTANA = pestanaPorId('documento');

const makeDoc = (session = 's1') => ({
  session_id: session,
  file_name: `${session}.docx`,
  elements: [{ id: 'e0', type: 'paragraph', text: 'uno', page_number: 1 }],
  meta: { page_count: 1 },
  referencias: [],
}) as never;

const PERFILES = [
  {
    profile_id: 'apa7',
    display_name: 'APA 7a edicion',
    description: 'Norma APA 7: Times New Roman 12, doble espacio.',
    cover_required_fields: ['title', 'author', 'institution'],
    latex_documentclass: 'apa7',
    latex_options: 'stu, 12pt',
    cover_apa_format: 'student',
    rules: { page_size: 'carta' },
  },
  {
    profile_id: 'scientific-journal',
    display_name: 'Revista Cientifica',
    description: 'Interlineado 1.5, titulos a la izquierda.',
    cover_required_fields: ['title', 'author'],
    latex_documentclass: 'article',
    latex_options: '',
    cover_apa_format: 'student',
    rules: { page_size: 'carta' },
  },
] as never[];

/* El store es un singleton y estos archivos se pisan entre pruebas: la foto se
 * toma al CARGAR el módulo, antes de que corra ninguna prueba, y `Poner` siempre
 * parte de ahí. Sin esto, la segunda prueba arrancaría con el A4 que dejó la
 * primera y "el default es Carta" se verificaría sobre datos ya sucios. */
const REGLAS_DE_FABRICA = { ...useDocStore.getState().rules };
const PORTADA_DE_FABRICA = { ...useDocStore.getState().portada };

const Poner = (extra: Record<string, unknown> = {}) =>
  act(() => {
    useDocStore.setState({
      doc: makeDoc(),
      rules: { ...REGLAS_DE_FABRICA },
      portada: { ...PORTADA_DE_FABRICA },
      profiles: PERFILES,
      activeProfileId: 'apa7',
      toasts: [],
      toastMessage: null,
      ...extra,
    } as never);
  });

const reglas = () => useDocStore.getState().rules;
const portada = () => useDocStore.getState().portada;

beforeEach(() => {
  localStorage.clear();
  Poner();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/* ── El tamaño de hoja ────────────────────────────────────────────────────── */

describe('Documento — el tamaño de hoja es un dato, no una constante', () => {
  it('escribirlo cambia el store Y la geometría del lienzo', () => {
    render(<DocumentoTab />);
    expect(reglas().page_size).toBe('carta');

    act(() => { fireEvent.click(screen.getByTestId('campo-page_size-a4')); });
    expect(reglas().page_size).toBe('a4');

    /* La parte que hace que el control no sea de mentira: la MISMA hoja que
       muestra el lienzo. Si `rules.page_size` no llegara a `getPageGeometry`, el
       selector cambiaría un número que nadie dibuja. */
    const a4 = getPageGeometry({ ...reglas(), page_size: reglas().page_size });
    const carta = getPageGeometry({ ...reglas(), page_size: 'carta' });
    expect(a4.pageW).toBeLessThan(carta.pageW);
    expect(a4.pageH).toBeGreaterThan(carta.pageH);
  });

  it('el botón marcado es el que está elegido, y el otro no', () => {
    render(<DocumentoTab />);
    expect(screen.getByTestId('campo-page_size-carta').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('campo-page_size-a4').getAttribute('aria-pressed')).toBe('false');
    act(() => { fireEvent.click(screen.getByTestId('campo-page_size-a4')); });
    expect(screen.getByTestId('campo-page_size-a4').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('campo-page_size-carta').getAttribute('aria-pressed')).toBe('false');
  });

  it('el texto dice la medida en milímetros que va a tener el archivo', () => {
    render(<DocumentoTab />);
    expect(screen.getByTestId('documento-hoja-efecto').textContent).toMatch(/215\.9 x 279\.4 mm/);
    act(() => { fireEvent.click(screen.getByTestId('campo-page_size-a4')); });
    expect(screen.getByTestId('documento-hoja-efecto').textContent).toMatch(/210 x 297 mm/);
  });

  it('dice que el archivo sale con el papel elegido, no con el que traía', () => {
    render(<DocumentoTab />);
    /* Un documento subido en A4 que descarga en Carta es el caso que hace falta
       que esté escrito: sin esta línea, alguien puede creer que el selector solo
       afecta al lienzo. */
    expect(screen.getByTestId('documento-hoja-efecto').textContent).toMatch(/no con el que traía/);
  });

  it('el DEFAULT es Carta, que es lo que dice DESIGN.md:75', () => {
    /* Si el default fuera A4, el caso por defecto seguiría siendo la
       contradicción que esta fase viene a matar. */
    expect(normalizarPageSize(undefined)).toBe('carta');
    expect(normalizarPageSize('')).toBe('carta');
    expect(normalizarPageSize('letter')).toBe('carta');
    expect(normalizarPageSize('A4')).toBe('a4');
    expect(normalizarPageSize('a4')).toBe('a4');
  });

  it('el default del store es Carta, no A4', () => {
    /* El mismo default, ahora en el store: un `defaultRules` sin `page_size`
       dejaría el selector sin opción elegida con el documento recién abierto. */
    expect(REGLAS_DE_FABRICA.page_size).toBe('carta');
    expect(normalizarPageSize(REGLAS_DE_FABRICA.page_size)).toBe('carta');
  });
});

/* ── El idioma ─────────────────────────────────────────────────────────────── */

describe('Documento — el idioma del documento', () => {
  it('el selector escribe en `portada.language`, que es de donde sale el w:lang', () => {
    render(<DocumentoTab />);
    act(() => { fireEvent.change(screen.getByTestId('campo-language'), { target: { value: 'en-GB' } }); });
    expect(portada().language).toBe('en-GB');
  });

  it('dice para qué sirve, y no lo llama "idioma de la interfaz"', () => {
    render(<DocumentoTab />);
    const ayuda = screen.getByTestId('documento-idioma-efecto').textContent || '';
    expect(ayuda).toMatch(/w:lang/);
    expect(ayuda).toMatch(/corrector de ortografía/);
    expect(screen.getByText(/No es el idioma de la interfaz/)).toBeTruthy();
  });

  it('cambiar el idioma NO toca los elementos del documento', () => {
    render(<DocumentoTab />);
    const antes = useDocStore.getState().doc?.elements.length;
    act(() => { fireEvent.change(screen.getByTestId('campo-language'), { target: { value: 'fr-FR' } }); });
    expect(portada().language).toBe('fr-FR');
    expect(useDocStore.getState().doc?.elements.length).toBe(antes);
  });

  it('la lista de idiomas del cliente es la misma que declara el backend', () => {
    const enunciado = modelosCrudo.match(/language: Literal\[([\s\S]*?)\]\s*=/);
    expect(enunciado, 'models.py ya no declara `language: Literal[...]`').not.toBeNull();
    const delBackend = (enunciado as RegExpMatchArray)[1]
      .split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean)
      .sort();
    expect(PORTADA_IDIOMAS.map((i) => i.valor).sort()).toEqual(delBackend);
  });

  it('la lista de tamaños del cliente es la misma que declara el backend', () => {
    const tabla = styleEngineCrudo.match(/TAMANOS_DE_PAGINA_MM:[^=]*=\s*\{([\s\S]*?)\}/);
    expect(tabla, 'style_engine.py ya no declara TAMANOS_DE_PAGINA_MM').not.toBeNull();
    const delBackend = (tabla as RegExpMatchArray)[1]
      .split('\n')
      .map((line) => line.match(/"(\w+)":\s*\(([\d.]+),\s*([\d.]+)\)/))
      .filter(Boolean)
      .map((m) => ({ valor: (m as RegExpMatchArray)[1], ancho: (m as RegExpMatchArray)[2], alto: (m as RegExpMatchArray)[3] }));
    expect(delBackend.length).toBe(TAMANOS_DE_PAPEL.length);
    for (const t of TAMANOS_DE_PAPEL) {
      const enPython = delBackend.find((d) => d.valor === t.valor);
      expect(enPython, `el backend no declara "${t.valor}"`).toBeTruthy();
      expect(Number(enPython!.ancho)).toBeCloseTo(t.anchoMm, 3);
      expect(Number(enPython!.alto)).toBeCloseTo(t.altoMm, 3);
    }
  });
});

/* ── El perfil de formato ──────────────────────────────────────────────────── */

describe('Documento — el perfil de formato', () => {
  it('cambiar de perfil escribe en el store, y no es un adorno', () => {
    render(<DocumentoTab />);
    expect(screen.getByTestId('campo-perfil-apa7').getAttribute('aria-pressed')).toBe('true');
    act(() => { fireEvent.click(screen.getByTestId('campo-perfil-scientific-journal')); });
    expect(useDocStore.getState().activeProfileId).toBe('scientific-journal');
  });

  it('son los DOS perfiles del backend, y el texto no promete un perfil institucional', () => {
    render(<DocumentoTab />);
    expect(screen.getByTestId('campo-perfil-apa7')).toBeTruthy();
    expect(screen.getByTestId('campo-perfil-scientific-journal')).toBeTruthy();
    /* La descripción de cada uno se muestra: un botón con el nombre del perfil y
       nada más obliga a la persona a acordarse de qué hace. */
    expect(screen.getByText(/Interlineado 1.5/)).toBeTruthy();
    expect(screen.getByText(/no un perfil institucional/)).toBeTruthy();
  });

  it('dice que el selector del asistente es el mismo control, un atajo', () => {
    render(<DocumentoTab />);
    /* El comentario de `Step0QuickStart` decía que su `<select>` era "la única
       forma de cambiar de perfil sin entrar a Ajustes". Con esta pestaña eso es
       falso, y el texto de la pestaña es el que lo corrige. */
    expect(screen.getByTestId('documento-perfil-atajo').textContent).toMatch(/mismo control, no otro/);
  });

  it('sin perfiles del servidor, lo dice en vez de mostrar una lista vacía', () => {
    Poner({ profiles: [] });
    render(<DocumentoTab />);
    expect(screen.getByTestId('documento-perfiles-vacios')).toBeTruthy();
    expect(document.querySelector('[data-campo="activeProfileId"]')).toBeNull();
  });
});

/* ── El límite, dicho ──────────────────────────────────────────────────────── */

describe('Documento — el límite de la promesa, escrito', () => {
  it('la pestaña DICE que con dos documentos abiertos el cambio toca a los dos', () => {
    render(<DocumentoTab />);
    const limite = screen.getByTestId('documento-limite-ambito').textContent || '';
    /* Sin esta línea la pestaña estaría contradiciendo la línea de ámbito de la
       barra, que promete que los ajustes no tocan los demás documentos. */
    expect(limite).toMatch(/se guarda con el documento/);
    expect(limite).toMatch(/con dos documentos abiertos/);
    expect(limite).toMatch(/cambia a los dos/);
  });

  it('el subtítulo de la pestaña NO promete aislamiento entre documentos', () => {
    expect(PESTANA.subtitulo).toMatch(/se guardan con el documento/);
    expect(PESTANA.subtitulo).not.toMatch(/No cambian los demás/i);
  });

  it('y el aviso no dice que nada sea de la app', () => {
    render(<DocumentoTab />);
    expect(screen.getByTestId('documento-globo').textContent).toMatch(/no se guardan en localStorage/);
  });

  it('mover TODOS los controles de Documento no escribe en localStorage', () => {
    const escribir = vi.spyOn(Storage.prototype, 'setItem');
    render(<DocumentoTab />);
    fireEvent.click(screen.getByTestId('campo-page_size-a4'));
    fireEvent.change(screen.getByTestId('campo-language'), { target: { value: 'de-DE' } });
    fireEvent.click(screen.getByTestId('campo-perfil-scientific-journal'));
    expect(escribir).not.toHaveBeenCalled();
    escribir.mockRestore();
  });
});

/* ── Sin documento ─────────────────────────────────────────────────────────── */

describe('Documento — sin documento no hay papel que elegir', () => {
  it('lo dice, y no muestra los campos mudos', () => {
    Poner({ doc: null });
    render(<DocumentoTab />);
    expect(screen.getByTestId('documento-estado').textContent).toMatch(
      /Todavía no hay ningún documento abierto/,
    );
    expect(document.querySelector('[data-campo="page_size"]')).toBeNull();
    expect(document.querySelector('[data-campo="language"]')).toBeNull();
    expect(document.querySelector('.editorial-mascot-expression-worried')).not.toBeNull();
  });

  it('con documento, la cara sale de si el papel es el de la norma', () => {
    render(<DocumentoTab />);
    expect(document.querySelector('.editorial-mascot-expression-happy')).not.toBeNull();
    act(() => { fireEvent.click(screen.getByTestId('campo-page_size-a4')); });
    expect(document.querySelector('.editorial-mascot-expression-curious')).not.toBeNull();
    expect(screen.getByTestId('documento-estado').textContent).toMatch(/se sale de la norma/);
  });

  it('la expresión se puede probar sin renderizar nada', () => {
    expect(expresionDeDocumento({ page_size: 'carta' }, { language: 'es-ES' })).toBe('happy');
    expect(expresionDeDocumento({ page_size: 'a4' }, { language: 'es-ES' })).toBe('curious');
    expect(expresionDeDocumento({ page_size: 'carta' }, {})).toBe('worried');
  });
});
