import { describe, it, expect } from 'vitest';
import { parseDocumentVersion, groupTabsByProject } from '../lib/projectUtils';

describe('projectUtils — Detección inteligente de versiones', () => {
  it('detecta sufijos numéricos con paréntesis (1), (2)', () => {
    const res = parseDocumentVersion('Informe de Investigacion (1).docx');
    expect(res.projectName).toBe('Informe de Investigacion');
    expect(res.versionLabel).toBe('Rev 1');
  });

  it('detecta versiones tipo _v2, -v3.1', () => {
    const res = parseDocumentVersion('Tesis_Arquitectura_v2.docx');
    expect(res.projectName).toBe('Tesis_Arquitectura');
    expect(res.versionLabel).toBe('v2');
  });

  it('detecta etiquetas semánticas de entrega (final, corregido, copia)', () => {
    const res1 = parseDocumentVersion('Capitulo_1_final.docx');
    expect(res1.projectName).toBe('Capitulo_1');
    expect(res1.versionLabel).toBe('Final');

    const res2 = parseDocumentVersion('Marco Teorico - copia.docx');
    expect(res2.projectName).toBe('Marco Teorico');
    expect(res2.versionLabel).toBe('Copia');
  });

  it('agrupa pestañas relacionadas por proyecto', () => {
    const tabs = [
      { session_id: '1', file_name: 'Tesis.docx' },
      { session_id: '2', file_name: 'Tesis_v2.docx' },
      { session_id: '3', file_name: 'Tesis (1).docx' },
      { session_id: '4', file_name: 'Articulo.docx' },
    ];
    const grouped = groupTabsByProject(tabs);
    expect(Object.keys(grouped)).toContain('Tesis');
    expect(Object.keys(grouped)).toContain('Articulo');
    expect(grouped['Tesis'].length).toBe(3);
    expect(grouped['Articulo'].length).toBe(1);
  });
});
