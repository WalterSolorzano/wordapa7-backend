import { render, screen, fireEvent } from '@testing-library/react';
import { TablaEstiloSelector } from '../components/figures/TablaEstiloSelector';

it('muestra directamente los cuadritos de estilos de tabla con sus etiquetas', () => {
  render(<TablaEstiloSelector onChange={() => {}} />);
  expect(screen.getByRole('button', { name: /estilo de tabla: apa/i })).toBeTruthy();
  expect(screen.getByText('Cuadrícula')).toBeTruthy();
  expect(screen.getByText('Cebra')).toBeTruthy();
  expect(screen.getAllByText(/no APA/i).length).toBeGreaterThan(0);
});

it('elegir un preset llama onChange con su id', () => {
  const onChange = vi.fn();
  render(<TablaEstiloSelector onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: /estilo de tabla: compacto/i }));
  expect(onChange).toHaveBeenCalledWith('compact');
});
