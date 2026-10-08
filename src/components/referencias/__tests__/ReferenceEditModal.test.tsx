import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReferenceEditModal } from '../ReferenceEditModal';
import type { ReferenciaModel } from '../../../types';

const mockReference: ReferenciaModel = {
  id: 'ref-1',
  authors: ['Morales, E.', 'Gómez, R.'],
  year: '2023',
  title: 'Aprendizaje profundo en la educación superior',
  source: 'Revista de Tecnología Educativa',
  doi_or_url: 'https://doi.org/10.1234/rte.2023.01',
  raw_text: 'Morales, E. & Gómez, R. (2023)...',
  formatted_apa: 'Morales, E., & Gómez, R. (2023). Aprendizaje profundo en la educación superior. Revista de Tecnología Educativa.',
};

describe('ReferenceEditModal', () => {
  it('no renderiza nada cuando isOpen es false', () => {
    const { container } = render(
      <ReferenceEditModal
        reference={mockReference}
        isOpen={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('no renderiza nada cuando reference es null', () => {
    const { container } = render(
      <ReferenceEditModal
        reference={null}
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renderiza todos los campos con los valores de la referencia cuando está abierto', () => {
    render(
      <ReferenceEditModal
        reference={mockReference}
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect((screen.getByLabelText(/autores/i) as HTMLInputElement).value).toBe('Morales, E., Gómez, R.');
    expect((screen.getByLabelText(/año/i) as HTMLInputElement).value).toBe('2023');
    expect((screen.getByLabelText(/título/i) as HTMLInputElement).value).toBe('Aprendizaje profundo en la educación superior');
    expect((screen.getByLabelText(/fuente/i) as HTMLInputElement).value).toBe('Revista de Tecnología Educativa');
    expect((screen.getByLabelText(/doi/i) as HTMLInputElement).value).toBe('https://doi.org/10.1234/rte.2023.01');
  });

  it('ejecuta onClose al hacer clic en el botón de cerrar y cancelar', () => {
    const onClose = vi.fn();
    render(
      <ReferenceEditModal
        reference={mockReference}
        isOpen={true}
        onClose={onClose}
        onSave={vi.fn()}
      />
    );

    const closeBtn = screen.getByRole('button', { name: /cerrar/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    const cancelBtn = screen.getByRole('button', { name: /cancelar/i });
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('ejecuta onClose al presionar la tecla Escape', () => {
    const onClose = vi.fn();
    render(
      <ReferenceEditModal
        reference={mockReference}
        isOpen={true}
        onClose={onClose}
        onSave={vi.fn()}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('permite editar los campos y llama onSave con los datos actualizados', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <ReferenceEditModal
        reference={mockReference}
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByLabelText(/autores/i), {
      target: { value: 'Smith, J.; Williams, K.' },
    });
    fireEvent.change(screen.getByLabelText(/año/i), {
      target: { value: '2024' },
    });
    fireEvent.change(screen.getByLabelText(/título/i), {
      target: { value: 'AI in Higher Education' },
    });
    fireEvent.change(screen.getByLabelText(/fuente/i), {
      target: { value: 'Journal of AI' },
    });
    fireEvent.change(screen.getByLabelText(/doi/i), {
      target: { value: 'https://doi.org/10.1000/182' },
    });

    const saveBtn = screen.getByRole('button', { name: /guardar/i });
    fireEvent.click(saveBtn);

    expect(onSave).toHaveBeenCalledWith({
      authors: ['Smith, J.', 'Williams, K.'],
      year: '2024',
      title: 'AI in Higher Education',
      source: 'Journal of AI',
      doi_or_url: 'https://doi.org/10.1000/182',
      tipo: 'otro',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('guarda el tipo elegido', () => {
    const onSave = vi.fn();
    render(
      <ReferenceEditModal
        reference={mockReference}
        isOpen={true}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );
    fireEvent.change(screen.getByTestId('modal-edit-tipo'), { target: { value: 'libro' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'libro' }));
  });

  it('no contiene emojis en los textos del modal', () => {
    const { container } = render(
      <ReferenceEditModal
        reference={mockReference}
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(container.textContent || '')).toBe(false);
  });
});
