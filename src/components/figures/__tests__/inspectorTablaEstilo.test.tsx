import { render, screen, fireEvent } from '@testing-library/react';
import { InspectorActivoTabs } from '../InspectorActivoTabs';
import type { ElementModel } from '../../../types';

function tablaElem(): ElementModel {
  return {
    id: 't1',
    type: 'table',
    text: '',
    table_info: {
      element_id: 't1',
      headers: ['A'],
      rows: [['1']],
      table_number: 1,
      style: 'apa',
    },
  } as unknown as ElementModel;
}

describe('InspectorActivoTabs — estilo de tabla', () => {
  it('ofrece la pestaña Estilo a una tabla y muestra el selector', () => {
    render(
      <InspectorActivoTabs elem={tablaElem()} totalFiguras={1} onUpdate={() => {}} onApplyToAll={() => {}} />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Estilo' }));
    expect(screen.getByRole('button', { name: /estilo de tabla: apa/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /vertical/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /horizontal/i })).toBeTruthy();
  });

  it('elegir un preset de tabla llama onUpdate con el style', () => {
    const onUpdate = vi.fn();
    render(
      <InspectorActivoTabs elem={tablaElem()} totalFiguras={1} onUpdate={onUpdate} onApplyToAll={() => {}} />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Estilo' }));
    fireEvent.click(screen.getByRole('button', { name: /estilo de tabla: cebra/i }));
    expect(onUpdate).toHaveBeenCalledWith('t1', { style: 'zebra' });
  });

  it('cambiar orientación a horizontal llama onUpdate con landscape', () => {
    const onUpdate = vi.fn();
    render(
      <InspectorActivoTabs elem={tablaElem()} totalFiguras={1} onUpdate={onUpdate} onApplyToAll={() => {}} />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Estilo' }));
    fireEvent.click(screen.getByRole('button', { name: /horizontal/i }));
    expect(onUpdate).toHaveBeenCalledWith('t1', { orientation: 'landscape' });
  });
});
