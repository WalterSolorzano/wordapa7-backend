import { describe, it, expect } from 'vitest';
import {
  bandaRevision, bandaFraseIA, colorDeRevision,
  frasesRevision, frasesIA, fraseDeRevision, fraseDeIA,
} from '../lib/mascotaFrases';

const SIN_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

describe('bandas de revisión', () => {
  it('corta en 90/80/60', () => {
    expect(bandaRevision(90)).toBe('solida');
    expect(bandaRevision(89)).toBe('buena');
    expect(bandaRevision(80)).toBe('buena');
    expect(bandaRevision(79)).toBe('media');
    expect(bandaRevision(60)).toBe('media');
    expect(bandaRevision(59)).toBe('baja');
  });

  it('colorea por banda con tokens, nunca hex', () => {
    for (const s of [95, 85, 70, 40]) expect(colorDeRevision(s)).toMatch(/^var\(--/);
  });

  it('tiene la frase del spec en cada banda', () => {
    expect(frasesRevision.solida).toContain('Esto está sólido, sigue así.');
    expect(frasesRevision.baja).toContain('Así no lo entregues.');
  });
});

describe('bandas de IA', () => {
  it('corta en 20/50/75 y deja limpio lo que no llega a 20', () => {
    expect(bandaFraseIA(19)).toBeNull();
    expect(bandaFraseIA(20)).toBe('bajo');
    expect(bandaFraseIA(49)).toBe('bajo');
    expect(bandaFraseIA(50)).toBe('medio');
    expect(bandaFraseIA(74)).toBe('medio');
    expect(bandaFraseIA(75)).toBe('alto');
  });

  it('tiene la frase del spec en cada banda', () => {
    expect(frasesIA.bajo).toContain('Hay un poco de IA en tu párrafo.');
    expect(frasesIA.alto).toContain('Lo copiaste tal cual, hermano.');
  });
});

describe('selección determinista y sin emojis', () => {
  it('el mismo seed da la misma frase y ninguno lleva emojis', () => {
    const a = fraseDeRevision(85, 'h1-a');
    const b = fraseDeRevision(85, 'h1-a');
    expect(a).toBe(b);
    expect(a).not.toMatch(SIN_EMOJI);
    expect(fraseDeIA(80, 'p-1')).not.toMatch(SIN_EMOJI);
  });

  it('un score limpio no habla', () => {
    expect(fraseDeIA(10, 'p-1')).toBe('');
  });
});
