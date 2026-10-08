// Regresión: la portada original se maqueta en columnas reales.
// El tutor vivía en una columna a la derecha y el lienzo lo centraba abajo.
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PaperCanvas } from '../components/layout/PaperCanvas';
import { useDocStore } from '../store/useDocStore';
import { defaultPortada } from '../store/slices/coverSlice';

const el = (id: string, text: string, anchor: string | null = null) => ({
  id,
  type: 'portada_block',
  is_cover_section: true,
  text,
  alignment: 'center',
  font_name: 'Times New Roman',
  font_size: 12,
  is_bold: false,
  is_italic: false,
  confidence: 1,
  cita_ids: [],
  anchor_pos_h: anchor,
});

const doc = {
  session_id: 's1',
  file_name: 't.docx',
  apa_format: 'student',
  elements: [
    el('h1', 'Área de Conocimiento de Ingeniería y Afines'),
    el('title', 'Optimización del Proceso "Redonditas"'),
    el('elab', 'Elaborado por'),
    el('ivan', 'Br. Iván Fernando Álvarez Ríos\nCarnet: 2022-0215I', '1438275'),
    el('tutor', 'Ing. Juan Carlos Aburto Poveda\nGrupo: 3T1 IND', '4442460'),
    el('maynard', 'Br. Maynard Damián Orozco Baquedano\nCarnet: 2023-0397U', '2924175'),
    el('maria', 'Br. María del pilar Bermúdez Bermúdez\nCarnet: 2023-0451U', '0'),
    el('walter', 'Br. Walter Noel Solorzano Gaitán\nCarnet: 2023-0432U', '-1'),
    el('stephani', 'Br. Stephani Valeria Castellón Borge.\nCarnet: 2021-0574I', '1438275'),
    el('fecha', '25 de junio del año 2025'),
    el('lugar', 'Managua, Nicaragua'),
  ],
  referencias: [],
  meta: { page_count: 1 },
};

describe('portada original en columnas', () => {
  it('coloca al tutor en su columna derecha y no centrado abajo', () => {
    useDocStore.setState({ doc: doc as never, portada: { ...defaultPortada } });
    const { container } = render(<PaperCanvas readOnly />);

    const grids = Array.from(container.querySelectorAll('div')).filter((d) =>
      (d as HTMLElement).style.gridTemplateColumns.includes('repeat(4'),
    );
    expect(grids.length).toBe(1);
    const grid = grids[0] as HTMLElement;
    expect(grid.children.length).toBe(4);

    const col0 = grid.children[0] as HTMLElement;
    const col3 = grid.children[3] as HTMLElement;
    expect(col0.querySelector('#paper-elem-maria')).toBeTruthy();
    expect(col3.querySelector('#paper-elem-tutor')).toBeTruthy();
    expect(col0.querySelector('#paper-elem-tutor')).toBeNull();

    // Cada miembro aparece exactamente una vez.
    ['ivan', 'tutor', 'maynard', 'maria', 'walter', 'stephani'].forEach((id) => {
      expect(container.querySelectorAll(`#paper-elem-${id}`).length).toBe(1);
    });
  });
});
