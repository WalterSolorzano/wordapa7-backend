import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LecturaProsaSeccion } from '../LecturaProsaSeccion';
import type { NodoJerarquia } from '../../../lib/jerarquia';
import type { ElementModel } from '../../../types';

describe('LecturaProsaSeccion', () => {
  const nodoIntro: NodoJerarquia = {
    id: 'n-intro',
    titulo: '1. Introducción',
    nivel: 1,
    elementoId: 'elem-h1',
    palabras: 250,
    figuras: 1,
    tablas: 0,
    citas: 1,
    fase: 'introduccion',
    hijos: [
      {
        id: 'n-metodo',
        titulo: '1.1 Contexto Previo',
        nivel: 2,
        elementoId: 'elem-h2',
        palabras: 120,
        figuras: 0,
        tablas: 0,
        citas: 0,
        fase: 'introduccion',
        hijos: [],
      },
    ],
  };

  const elementosMock: ElementModel[] = [
    {
      id: 'elem-prev',
      type: 'paragraph',
      text: 'Texto del preámbulo o portada anterior.',
      confidence: 1,
      style_name: 'Normal',
      alignment: 'left',
      font_name: 'Times New Roman',
      font_size: 12,
      is_bold: false,
      is_italic: false,
      is_bullet: false,
      left_indent_cm: 0,
      is_user_modified: false,
      needs_review: false,
      auto_applied: false,
      cita_ids: [],
    },
    {
      id: 'elem-h1',
      type: 'heading',
      heading_level: 1,
      text: '1. Introducción',
      confidence: 1,
      style_name: 'Heading 1',
      alignment: 'center',
      font_name: 'Times New Roman',
      font_size: 12,
      is_bold: true,
      is_italic: false,
      is_bullet: false,
      left_indent_cm: 0,
      is_user_modified: false,
      needs_review: false,
      auto_applied: false,
      cita_ids: [],
    },
    {
      id: 'elem-p1',
      type: 'paragraph',
      text: 'Este es el primer párrafo de encuadre correspondiente a la introducción.',
      confidence: 1,
      style_name: 'Normal',
      alignment: 'left',
      font_name: 'Times New Roman',
      font_size: 12,
      is_bold: false,
      is_italic: false,
      is_bullet: false,
      left_indent_cm: 1.27,
      is_user_modified: false,
      needs_review: false,
      auto_applied: false,
      cita_ids: [],
    },
    {
      id: 'elem-fig1',
      type: 'image',
      text: '',
      image_info: {
        element_id: 'elem-fig1',
        file_path: 'figure1.png',
        filename: 'figure1.png',
        relative_url: '/assets/fig1.png',
        width_cm: 12,
        height_cm: 8,
        caption: 'Diagrama conceptual de la introducción',
        figure_number: 1,
        alignment: 'center',
        wrap_style: 'inline',
        caption_position: 'above',
        constrain_proportions: true,
        design_style: 'standard',
      },
      confidence: 1,
      style_name: 'Normal',
      alignment: 'center',
      font_name: 'Times New Roman',
      font_size: 12,
      is_bold: false,
      is_italic: false,
      is_bullet: false,
      left_indent_cm: 0,
      is_user_modified: false,
      needs_review: false,
      auto_applied: false,
      cita_ids: [],
    },
    {
      id: 'elem-h2',
      type: 'heading',
      heading_level: 2,
      text: '1.1 Contexto Previo',
      confidence: 1,
      style_name: 'Heading 2',
      alignment: 'left',
      font_name: 'Times New Roman',
      font_size: 12,
      is_bold: true,
      is_italic: false,
      is_bullet: false,
      left_indent_cm: 0,
      is_user_modified: false,
      needs_review: false,
      auto_applied: false,
      cita_ids: [],
    },
    {
      id: 'elem-p2',
      type: 'paragraph',
      text: 'Este párrafo pertenece a la subsección 1.1.',
      confidence: 1,
      style_name: 'Normal',
      alignment: 'left',
      font_name: 'Times New Roman',
      font_size: 12,
      is_bold: false,
      is_italic: false,
      is_bullet: false,
      left_indent_cm: 1.27,
      is_user_modified: false,
      needs_review: false,
      auto_applied: false,
      cita_ids: [],
    },
    {
      id: 'elem-next-h1',
      type: 'heading',
      heading_level: 1,
      text: '2. Método',
      confidence: 1,
      style_name: 'Heading 1',
      alignment: 'center',
      font_name: 'Times New Roman',
      font_size: 12,
      is_bold: true,
      is_italic: false,
      is_bullet: false,
      left_indent_cm: 0,
      is_user_modified: false,
      needs_review: false,
      auto_applied: false,
      cita_ids: [],
    },
    {
      id: 'elem-p-next',
      type: 'paragraph',
      text: 'Párrafo del método que no debe aparecer al leer introducción.',
      confidence: 1,
      style_name: 'Normal',
      alignment: 'left',
      font_name: 'Times New Roman',
      font_size: 12,
      is_bold: false,
      is_italic: false,
      is_bullet: false,
      left_indent_cm: 1.27,
      is_user_modified: false,
      needs_review: false,
      auto_applied: false,
      cita_ids: [],
    },
  ];

  it('renderiza únicamente los párrafos e imágenes pertenecientes al capítulo activo', () => {
    render(
      <LecturaProsaSeccion
        seccionActiva={nodoIntro}
        elementos={elementosMock}
      />
    );

    // Debe mostrar encabezado y contenido del capítulo activo
    expect(screen.getByText('1. Introducción')).toBeInTheDocument();
    expect(
      screen.getByText('Este es el primer párrafo de encuadre correspondiente a la introducción.')
    ).toBeInTheDocument();
    expect(screen.getByText('1.1 Contexto Previo')).toBeInTheDocument();
    expect(screen.getByText('Este párrafo pertenece a la subsección 1.1.')).toBeInTheDocument();
    expect(screen.getByText('Diagrama conceptual de la introducción')).toBeInTheDocument();

    // No debe incluir elementos previos ni de capítulos posteriores
    expect(screen.queryByText('Texto del preámbulo o portada anterior.')).toBeNull();
    expect(screen.queryByText('2. Método')).toBeNull();
    expect(
      screen.queryByText('Párrafo del método que no debe aparecer al leer introducción.')
    ).toBeNull();
  });

  it('carga la imagen real de la figura, no un placeholder (bug: no se veían las figuras)', () => {
    const { container } = render(
      <LecturaProsaSeccion
        seccionActiva={nodoIntro}
        elementos={elementosMock}
      />
    );

    // Debe existir un <img> con el asset resuelto de la figura de la sección.
    const imagenes = container.querySelectorAll('img');
    expect(imagenes.length).toBe(1);
    expect(imagenes[0].getAttribute('src')).toBe('/assets/fig1.png');
  });

  it('aplica maquetación editorial tipo libro con tipografía y estilo académico', () => {
    const { container } = render(
      <LecturaProsaSeccion
        seccionActiva={nodoIntro}
        elementos={elementosMock}
      />
    );

    // Contenedor editorial tipo hoja de libro
    const contenedorHoja = container.querySelector('[data-testid="hoja-editorial"]');
    expect(contenedorHoja).toBeInTheDocument();
    // La maquetación debe incluir clases tipográficas de lectura editorial académica (serif / book layout)
    expect(contenedorHoja?.className).toMatch(/serif|font-serif|leading-relaxed/);
  });

  it('maneja de forma limpia una sección vacía cuando el capítulo no tiene párrafos aún', () => {
    const capituloVacio: NodoJerarquia = {
      id: 'n-vacio',
      titulo: '3. Resultados Preliminares',
      nivel: 1,
      elementoId: 'elem-vacio-h1',
      palabras: 0,
      figuras: 0,
      tablas: 0,
      citas: 0,
      fase: null,
      hijos: [],
    };

    const elementosSoloTitulo: ElementModel[] = [
      {
        id: 'elem-vacio-h1',
        type: 'heading',
        heading_level: 1,
        text: '3. Resultados Preliminares',
        confidence: 1,
        style_name: 'Heading 1',
        alignment: 'center',
        font_name: 'Times New Roman',
        font_size: 12,
        is_bold: true,
        is_italic: false,
        is_bullet: false,
        left_indent_cm: 0,
        is_user_modified: false,
        needs_review: false,
        auto_applied: false,
        cita_ids: [],
      },
    ];

    render(
      <LecturaProsaSeccion
        seccionActiva={capituloVacio}
        elementos={elementosSoloTitulo}
      />
    );

    expect(screen.getByText('3. Resultados Preliminares')).toBeInTheDocument();
    expect(screen.getByText(/esta sección aún no contiene párrafos de prosa/i)).toBeInTheDocument();
  });

  it('muestra mensaje amigable cuando no hay sección seleccionada', () => {
    render(
      <LecturaProsaSeccion
        seccionActiva={null}
        elementos={elementosMock}
      />
    );

    expect(screen.getByText(/selecciona un capítulo o sección/i)).toBeInTheDocument();
  });

  it('muestra una lista numerada como contenido, no como vacío', () => {
    const nodo = {
      id: 'h2-1', elementoId: 'h2-1', titulo: 'Objetivos específicos', nivel: 2,
      palabras: 12, figuras: 0, tablas: 0, citas: 0, hijos: [], fase: null,
    } as unknown as NodoJerarquia;
    const elementos = [
      { id: 'h2-1', type: 'heading', text: 'Objetivos específicos', heading_level: 2 },
      { id: 'l1', type: 'numbered_list', text: 'Diseñar el sistema.' },
      { id: 'l2', type: 'numbered_list', text: 'Implementar el plan.' },
      { id: 'h2-2', type: 'heading', text: 'Marco teórico', heading_level: 1 },
    ] as unknown as ElementModel[];
    render(<LecturaProsaSeccion seccionActiva={nodo} elementos={elementos} />);
    expect(screen.queryByText(/no contiene párrafos de prosa/i)).toBeNull();
    expect(screen.getByText('Diseñar el sistema.')).toBeTruthy();
  });

  it('no confunde la sección con un título duplicado anterior (TOC)', () => {
    const nodo = {
      id: 'h2-1', elementoId: 'h2-1', titulo: 'Objetivos específicos', nivel: 2,
      palabras: 8, figuras: 0, tablas: 0, citas: 0, hijos: [], fase: null,
    } as unknown as NodoJerarquia;
    const elementos = [
      { id: 'toc-h', type: 'heading', text: 'Objetivos específicos', heading_level: 2 },
      { id: 'toc-p', type: 'paragraph', text: 'Índice (TOC).' },
      { id: 'h1', type: 'heading', text: 'Objetivos', heading_level: 1 },
      { id: 'h2-1', type: 'heading', text: 'Objetivos específicos', heading_level: 2 },
      { id: 'p1', type: 'paragraph', text: 'El objetivo específico es medir.' },
      { id: 'h1b', type: 'heading', text: 'Marco teórico', heading_level: 1 },
    ] as unknown as ElementModel[];
    render(<LecturaProsaSeccion seccionActiva={nodo} elementos={elementos} />);
    expect(screen.getByText('El objetivo específico es medir.')).toBeTruthy();
  });

  it('previsualiza las tablas de la sección en vez de omitirlas (Anexos)', () => {
    const nodo = {
      id: 'h1-t', elementoId: 'h1-t', titulo: 'Anexos', nivel: 1,
      palabras: 6, figuras: 0, tablas: 1, citas: 0, hijos: [], fase: 'anexos',
    } as unknown as NodoJerarquia;
    const elementos = [
      { id: 'h1-t', type: 'heading', text: 'Anexos', heading_level: 1 },
      {
        id: 'tbl1',
        type: 'table',
        text: '',
        table_info: {
          element_id: 'tbl1',
          headers: ['Variable', 'M'],
          rows: [['Asistencia', '4.6']],
          caption: 'Datos recopilados',
          table_number: 2,
        },
      },
    ] as unknown as ElementModel[];
    render(<LecturaProsaSeccion seccionActiva={nodo} elementos={elementos} />);
    expect(screen.queryByText(/no contiene párrafos de prosa/i)).toBeNull();
    expect(screen.getByText(/Tabla 2\./)).toBeTruthy();
    expect(screen.getByText('Datos recopilados')).toBeTruthy();
    expect(screen.getByText('Asistencia')).toBeTruthy();
  });
});
