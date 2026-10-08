import { describe, it, expect } from 'vitest';
import { migrateDocument } from '../store/useDocStore';

describe('Document Migration to schema_version 2', () => {
  it('should migrate old documents with heading_numbering_style: "none" correctly without losing the value', () => {
    // Simulamos un documento de version 1 con "none"
    const oldDoc = {
      id: 'doc1',
      filename: 'test.docx',
      schema_version: 1, // o undefined
      apa_rules: {
        heading_numbering_style: 'none', // El usuario eligió Sin Numeración
        font_family: 'Arial'
      },
      elements: []
    };

    const migratedDoc = migrateDocument(oldDoc);

    // Debe setear la schema_version a 2
    expect(migratedDoc.schema_version).toBe(2);

    // Debe haber migrado el 'none' a los tres niveles y borrado el original
    expect(migratedDoc.apa_rules.heading_numbering_style_lvl1).toBe('none');
    expect(migratedDoc.apa_rules.heading_numbering_style_lvl2).toBe('none');
    expect(migratedDoc.apa_rules.heading_numbering_style_lvl3).toBe('none');
    expect((migratedDoc.apa_rules as any).heading_numbering_style).toBeUndefined();
  });

  it('should fallback to decimal if not provided', () => {
    const oldDoc = {
      id: 'doc1',
      schema_version: 1,
      apa_rules: {},
      elements: []
    };
    
    const migratedDoc = migrateDocument(oldDoc);
    expect(migratedDoc.apa_rules.heading_numbering_style_lvl1).toBe('decimal');
  });
});
