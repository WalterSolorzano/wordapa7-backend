import { render, screen, fireEvent } from '@testing-library/react';
import { MascotaLeyendaIA } from '../components/figures/MascotaLeyendaIA';

it('sin sugerencia muestra el boton de generar', () => {
  render(<MascotaLeyendaIA onGenerar={() => {}} />);
  expect(screen.getByRole('button', { name: /generar leyenda con ia/i })).toBeTruthy();
});

it('el boton llama onGenerar', () => {
  const onGenerar = vi.fn();
  render(<MascotaLeyendaIA onGenerar={onGenerar} />);
  fireEvent.click(screen.getByRole('button', { name: /generar leyenda con ia/i }));
  expect(onGenerar).toHaveBeenCalled();
});

it('con sugerencia muestra aplicar y regenerar', () => {
  render(
    <MascotaLeyendaIA
      sugerida={{ titulo: 'Serie mensual' }}
      onGenerar={() => {}}
      onAplicar={() => {}}
      onRegenerar={() => {}}
    />,
  );
  expect(screen.getByText('Serie mensual')).toBeTruthy();
  expect(screen.getByRole('button', { name: /aplicar/i })).toBeTruthy();
  expect(screen.getByRole('button', { name: /regenerar/i })).toBeTruthy();
});
