import { useDocStore } from '../store/useDocStore';

/**
 * Calcula la ruta de destino del PDF cuando el documento abierto pertenece a un proyecto.
 * Si no hay proyecto activo, retorna null (comportamiento actual: descarga al navegador).
 */
export function calcularDestinoPDF(): string | null {
  const state = useDocStore.getState() as any;
  const proyectos = state.proyectos;
  const doc = state.doc;

  if (!doc?.file_name) return null;

  const proyectoActivo = proyectos.find((p: any) =>
    p.versiones.some((v: any) => v.filename === doc.file_name && v.esActiva)
  );

  if (!proyectoActivo) return null;

  const nombreBase = doc.file_name.replace(/\.docx$/i, '');
  const fecha = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${proyectoActivo.carpeta}/Exportados/${nombreBase}_APA7_${fecha}.pdf`;
}
