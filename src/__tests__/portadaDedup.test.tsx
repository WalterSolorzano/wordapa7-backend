// Prueba: dedup de bloques de autor duplicados en el preview de portada
import { describe, it, expect } from 'vitest';
import { dedupCoverAuthors } from '../components/layout/PaperCanvas';

describe('dedupCoverAuthors', () => {
  it('colapsa autores duplicados por texto normalizado', () => {
    const a = (text: string) => ({ id: text, type: 'portada_block' as const, is_cover_section: true, text });
    const out = dedupCoverAuthors([a('Br. Iván Álvarez\nCarnet: 2022-0215I'), a('Br. Iván Álvarez\nCarnet: 2022-0215I')] as any);
    expect(out).toHaveLength(1);
  });

  it('conserva autores distintos y descarta vacios', () => {
    const a = (id: string, text: string) => ({ id, type: 'portada_block' as const, is_cover_section: true, text });
    const out = dedupCoverAuthors([
      a('1', 'Br. Iván Álvarez\nCarnet: 2022-0215I'),
      a('2', 'Br. Otra Persona\nCarnet: 2022-9999X'),
      a('3', ''),
      a('4', '   '),
    ] as any);
    expect(out.map(e => e.id)).toEqual(['1', '2']);
  });
});
