import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { LienzoEditorialActivo } from '../LienzoEditorialActivo';
import { medidaDeFigura } from '../../../lib/figuras';

describe('LienzoEditorialActivo', () => {
  const defaultProps = {
    figureNumber: 1,
    figureTitle: 'Distribución de frecuencias por estrato socioeconómico',
    figureNote: 'Nota. Adaptado de los datos del censo nacional 2024.',
    imageUrl: 'blob:http://localhost:5173/test-image.png',
    prevParagraph: 'El análisis descriptivo inicial mostró variaciones significativas en los estratos evaluados. A continuación se ilustra este comportamiento.',
    nextParagraph: 'Como se observa en la figura anterior, el estrato medio concentra el mayor porcentaje de participantes, confirmando la hipótesis de muestreo.',
    aiSuggestion: {
      suggestedTitle: 'Distribución porcentual por estratos socioeconómicos (2024)',
      suggestedNote: 'Nota. Elaboración propia a partir del censo nacional 2024.',
      confidence: 0.94
    },
    onRotate: vi.fn(),
    onReplaceImage: vi.fn(),
    onApplyCaption: vi.fn(),
  };

  it('renderiza párrafos anterior y posterior con tipografía serif académica y sangría', () => {
    const { container } = render(<LienzoEditorialActivo {...defaultProps} />);

    const prevEl = screen.getByText(/El análisis descriptivo inicial/i);
    const nextEl = screen.getByText(/Como se observa en la figura anterior/i);

    expect(prevEl).toBeInTheDocument();
    expect(nextEl).toBeInTheDocument();

    // Verificación de clases o estilos serif y sangría
    expect(prevEl.className).toContain('font-serif');
    expect(prevEl.className).toContain('indent-8');
    expect(nextEl.className).toContain('font-serif');
    expect(nextEl.className).toContain('indent-8');

    // Comprobamos el contenedor de lectura cálido
    const canvasContainer = container.querySelector('[data-testid="editorial-reading-canvas"]');
    expect(canvasContainer).toBeInTheDocument();
    expect(canvasContainer).toHaveStyle({ backgroundColor: 'var(--paper-white)' });
  });

  it('renderiza el bloque de la figura con rótulo y título en cursiva según APA 7', () => {
    render(<LienzoEditorialActivo {...defaultProps} />);

    // APA 7: "Figura 1" en negrita, título en cursiva en línea separada
    const labelEl = screen.getByText('Figura 1');
    expect(labelEl).toBeInTheDocument();
    expect(labelEl.className).toContain('font-bold');

    const titleEl = screen.getByText(defaultProps.figureTitle);
    expect(titleEl).toBeInTheDocument();
    expect(titleEl.className).toContain('italic');

    const noteEl = screen.getByText(defaultProps.figureNote);
    expect(noteEl).toBeInTheDocument();
  });

  it('incluye botones rápidos sobre la imagen para rotación y reemplazo', () => {
    const onRotate = vi.fn();
    const onReplaceImage = vi.fn();

    render(
      <LienzoEditorialActivo
        {...defaultProps}
        onRotate={onRotate}
        onReplaceImage={onReplaceImage}
      />
    );

    const rotateBtn = screen.getByRole('button', { name: /rotar/i });
    expect(rotateBtn).toBeInTheDocument();
    fireEvent.click(rotateBtn);
    expect(onRotate).toHaveBeenCalledTimes(1);

    const replaceBtn = screen.getByRole('button', { name: /reemplazar/i });
    expect(replaceBtn).toBeInTheDocument();
    fireEvent.click(replaceBtn);
    expect(onReplaceImage).toHaveBeenCalledTimes(1);
  });

  it('acompaña la sugerencia con una mascota y permite aplicar la leyenda', () => {
    const onApplyCaption = vi.fn();

    render(
      <LienzoEditorialActivo {...defaultProps} onApplyCaption={onApplyCaption} />
    );

    expect(screen.getByTestId('mascota-leyenda-ia')).toBeInTheDocument();
    expect(screen.getByText(/¿Uso esta leyenda\?/i)).toBeInTheDocument();
    expect(screen.getByText(/Distribución porcentual por estratos/i)).toBeInTheDocument();

    const applyBtn = screen.getByRole('button', { name: /aplicar sugerencia/i });
    fireEvent.click(applyBtn);
    expect(onApplyCaption).toHaveBeenCalledWith({
      title: defaultProps.aiSuggestion.suggestedTitle,
      note: defaultProps.aiSuggestion.suggestedNote,
    });
  });

  it('ofrece regenerar la sugerencia desde el globo de la mascota', () => {
    const onRegenerateSuggestion = vi.fn();

    render(
      <LienzoEditorialActivo
        {...defaultProps}
        onRegenerateSuggestion={onRegenerateSuggestion}
      />
    );

    const regenBtn = screen.getByRole('button', { name: /regenerar sugerencia/i });
    fireEvent.click(regenBtn);
    expect(onRegenerateSuggestion).toHaveBeenCalledTimes(1);
  });

  it('sin sugerencia muestra el botón de generar leyenda con IA (opt-in)', () => {
    const onGenerarSuggestion = vi.fn();
    render(
      <LienzoEditorialActivo
        {...defaultProps}
        aiSuggestion={undefined}
        onGenerarSuggestion={onGenerarSuggestion}
      />
    );

    expect(screen.queryByText(/¿Uso esta leyenda\?/i)).toBeNull();
    const generarBtn = screen.getByRole('button', { name: /generar leyenda con ia/i });
    fireEvent.click(generarBtn);
    expect(onGenerarSuggestion).toHaveBeenCalledTimes(1);
  });

  it('edita una celda de tabla y emite el patch de filas', () => {
    const onEditarCeldaTabla = vi.fn();
    render(
      <LienzoEditorialActivo
        {...defaultProps}
        imageUrl={undefined}
        tipo="table"
        tabla={{
          headers: ['Grupo'],
          rows: [['A']],
        }}
        onEditarCeldaTabla={onEditarCeldaTabla}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Editar celda 1-0' }));
    const input = screen.getByRole('textbox', { name: 'Editar celda 1-0' });
    fireEvent.change(input, { target: { value: 'B' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onEditarCeldaTabla).toHaveBeenCalledWith({ rows: [['B']] });
  });

  it('previsualiza una tabla APA 7 a partir de sus encabezados y filas', () => {
    const { container } = render(
      <LienzoEditorialActivo
        {...defaultProps}
        imageUrl={undefined}
        tipo="table"
        tabla={{
          headers: ['Grupo', 'n'],
          rows: [
            ['A', '10'],
            ['B', '20'],
          ],
        }}
      />
    );

    expect(screen.getByText('Tabla 1')).toBeInTheDocument();
    const tabla = container.querySelector('table');
    expect(tabla).toBeInTheDocument();
    expect(screen.getByText('Grupo')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    // El marco de imagen no debe renderizarse cuando hay tabla
    expect(container.querySelector('img')).toBeNull();
  });

  it('pinta la imagen al tamaño declarado del .docx cuando hay width/height', () => {
    const { container } = render(
      <LienzoEditorialActivo {...defaultProps} anchoCm={10} altoCm={5} />
    );

    const img = container.querySelector('img') as HTMLElement;
    expect(img).toBeInTheDocument();

    const esperado = medidaDeFigura({ width_cm: 10, height_cm: 5 });
    expect(esperado.declarada).toBe(true);
    expect(img.style.width).toBe(`${esperado.anchoPx}px`);
    expect(img.style.height).toBe(`${esperado.altoPx}px`);
  });

  it('aplica borde, sombra, esquinas, rotación y volteo declarados en el formato', () => {
    const { container } = render(
      <LienzoEditorialActivo
        {...defaultProps}
        border="strong"
        shadow
        cornerRadius="md"
        rotation={90}
        flipH
      />
    );

    const marco = screen.getByTestId('figura-marco');
    expect(marco.style.border).toContain('var(--color-border-strong)');
    expect(marco.style.borderRadius).toBe('var(--radius-md)');
    expect(marco.style.boxShadow).not.toBe('none');

    const img = container.querySelector('img') as HTMLElement;
    expect(img.style.transform).toContain('rotate(90deg)');
    expect(img.style.transform).toContain('scaleX(-1)');
  });

  it('dibuja la cuadrícula 2x2 con la imagen en (a) y slots vacíos que invitan a importar', () => {
    const onImportSubfigure = vi.fn();
    render(
      <LienzoEditorialActivo
        {...defaultProps}
        designStyle="corner"
        subfiguras={[]}
        onImportSubfigure={onImportSubfigure}
      />
    );

    expect(screen.getByTestId('marco-multipanel')).toBeInTheDocument();
    // (b), (c) y (d) están vacíos; (a) lleva la imagen principal.
    ['(b)', '(c)', '(d)'].forEach((rotulo) => {
      expect(screen.getByRole('button', { name: `Importar subfigura ${rotulo}` })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Importar subfigura (b)' }));
    expect(onImportSubfigure).toHaveBeenCalledWith(1);
  });

  it('dibuja la doble horizontal con dos paneles y muestra la subfigura importada', () => {
    render(
      <LienzoEditorialActivo
        {...defaultProps}
        designStyle="multipanel"
        subfiguras={[{ label: '(b)', title: 'Vista de detalle', url: 'blob:sub-b' }]}
        onImportSubfigure={vi.fn()}
      />
    );

    expect(screen.getByTestId('marco-multipanel')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Importar subfigura (b)' })).toBeNull();
    const subImgs = screen.getAllByRole('img');
    expect(subImgs.length).toBe(2);
  });
});
