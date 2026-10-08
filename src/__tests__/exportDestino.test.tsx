import { describe, it, expect, beforeEach } from 'vitest';
import { calcularDestinoPDF } from '../lib/exportDestino';
import { useDocStore } from '../store/useDocStore';

describe('calcularDestinoPDF', () => {
  beforeEach(() => {
    useDocStore.setState({
      proyectos: [],
      doc: null,
    } as any);
  });

  it('sin proyecto activo, destino es null y el flujo es el de siempre', () => {
    const destino = calcularDestinoPDF();
    expect(destino).toBeNull();
  });

  it('con proyecto activo, destino incluye la carpeta Exportados', () => {
    useDocStore.setState({
      proyectos: [
        {
          id: 'p1',
          nombre: 'Tesis',
          carpeta: '/tmp/proyecto1',
          versiones: [
            { id: 'v1', filename: 'Tesis.docx', rutaEnDisco: '', palabras: 100, fechaModificacion: Date.now(), autor: '', esActiva: true },
          ],
          creadoEn: Date.now(),
          cerrado: false,
        },
      ],
      doc: { file_name: 'Tesis.docx' },
    } as any);
    const destino = calcularDestinoPDF();
    expect(destino).toMatch(/Exportados/);
    expect(destino).toMatch(/\.pdf$/);
  });

  it('el nombre del PDF incluye la fecha en formato YYYY-MM-DD', () => {
    useDocStore.setState({
      proyectos: [
        {
          id: 'p1',
          nombre: 'Tesis',
          carpeta: '/tmp/proyecto1',
          versiones: [
            { id: 'v1', filename: 'Tesis.docx', rutaEnDisco: '', palabras: 100, fechaModificacion: Date.now(), autor: '', esActiva: true },
          ],
          creadoEn: Date.now(),
          cerrado: false,
        },
      ],
      doc: { file_name: 'Tesis.docx' },
    } as any);
    const destino = calcularDestinoPDF();
    expect(destino).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
