import { describe, it, expect } from 'vitest';
import type { ElementModel } from '../../types';
import { buildCoverColumns, parseAnchorEmu, COLUMN_TOLERANCE_EMU } from '../coverColumns';

const m = (id: string, anchor: string | null | undefined): ElementModel =>
  ({ id, text: id, anchor_pos_h: anchor } as unknown as ElementModel);

// Anclas reales del archivo de estudio del trabajo (EMU, wp:positionH).
const IVAN = '1438275';
const TUTOR = '4442460';
const MAYNARD = '2924175';
const MARIA = '0';
const WALTER = '-1';
const STEPHANI = '1438275';

describe('buildCoverColumns', () => {
  it('reconstruye las columnas originales y deja el tutor a la derecha', () => {
    const members = [
      m('ivan', IVAN),
      m('tutor', TUTOR),
      m('maynard', MAYNARD),
      m('maria', MARIA),
      m('walter', WALTER),
      m('stephani', STEPHANI),
    ];
    const cols = buildCoverColumns(members);
    expect(cols.map((c) => c.map((e) => e.id))).toEqual([
      ['maria', 'walter'],
      ['ivan', 'stephani'],
      ['maynard'],
      ['tutor'],
    ]);
  });

  it('agrupa anclas casi iguales dentro de la tolerancia', () => {
    const cols = buildCoverColumns([m('a', '0'), m('b', String(COLUMN_TOLERANCE_EMU - 1))]);
    expect(cols).toHaveLength(1);
  });

  it('separa anclas fuera de la tolerancia', () => {
    const cols = buildCoverColumns([m('a', '0'), m('b', String(COLUMN_TOLERANCE_EMU + 1))]);
    expect(cols).toHaveLength(2);
  });

  it('sin anclas deja una sola columna (fallback)', () => {
    const cols = buildCoverColumns([m('a', null), m('b', undefined)]);
    expect(cols.map((c) => c.map((e) => e.id))).toEqual([['a', 'b']]);
  });

  it('parseAnchorEmu ignora valores vacíos o no numéricos', () => {
    expect(parseAnchorEmu('123')).toBe(123);
    expect(parseAnchorEmu('')).toBeNull();
    expect(parseAnchorEmu(null)).toBeNull();
    expect(parseAnchorEmu('abc')).toBeNull();
  });
});
