import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getFilenameComment,
  getRepeatComment,
  getSizeComment,
  getTimeOfWeekComment,
} from '../lib/studentJokes';

describe('getFilenameComment', () => {
  it('detects "final" in filename', () => {
    expect(getFilenameComment('trabajo_final.docx')).not.toBeNull();
  });

  it('detects "FINAL_v3" and "definitivo" patterns', () => {
    expect(getFilenameComment('TFG_FINAL_v3.docx')).not.toBeNull();
    expect(getFilenameComment('tesis_definitivo.docx')).not.toBeNull();
  });

  it('detects "ultimo_ultimo"', () => {
    expect(getFilenameComment('borrador_ultimo_ultimo.docx')).not.toBeNull();
  });

  it('returns null for a normal filename', () => {
    expect(getFilenameComment('Monografía Redonditas.docx')).toBeNull();
    expect(getFilenameComment('capitulo_1.docx')).toBeNull();
  });
});

describe('getRepeatComment', () => {
  beforeEach(() => { sessionStorage.removeItem('wordapa7-uploads'); });
  afterEach(() => { sessionStorage.removeItem('wordapa7-uploads'); });

  it('returns null on the first upload', () => {
    expect(getRepeatComment()).toBeNull();
  });

  it('returns a joke on the second upload', () => {
    getRepeatComment(); // primera
    const c = getRepeatComment(); // segunda
    expect(c).not.toBeNull();
    expect(c!.length).toBeGreaterThan(0);
  });
});

describe('getSizeComment', () => {
  it('flags very large documents', () => {
    expect(getSizeComment(160, 2, 1)).toMatch(/tesis/i);
    expect(getSizeComment(120, 2, 1)).toMatch(/novela/i);
  });

  it('flags tiny documents', () => {
    expect(getSizeComment(2, 0, 0)).toMatch(/al grano/i);
  });

  it('flags heavily illustrated documents', () => {
    expect(getSizeComment(40, 20, 15)).toMatch(/ilustrado/i);
  });

  it('returns null for normal documents', () => {
    expect(getSizeComment(25, 3, 2)).toBeNull();
  });
});

describe('getTimeOfWeekComment', () => {
  it('returns a late-night comment between 1-5am', () => {
    const c = getTimeOfWeekComment(new Date(2026, 7, 3, 3, 0, 0));
    expect(c).not.toBeNull();
    expect(c!.length).toBeGreaterThan(0);
  });

  it('returns a Sunday night comment', () => {
    // 2026-08-02 es domingo, 21hs
    const c = getTimeOfWeekComment(new Date(2026, 7, 2, 21, 0, 0));
    expect(c).not.toBeNull();
    expect(c).toMatch(/domingo/i);
  });

  it('returns null on a weekday morning', () => {
    // 2026-08-03 es lunes, 10hs
    const c = getTimeOfWeekComment(new Date(2026, 7, 3, 10, 0, 0));
    expect(c).toBeNull();
  });
});
