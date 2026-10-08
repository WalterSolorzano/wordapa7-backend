/* WordAPA7 — Utilidades de gestión de versiones y agrupación de proyectos */

export interface ParsedFileName {
  rawName: string;
  projectName: string;
  versionLabel: string;
  isLatestSuggestion?: boolean;
}

/**
 * Analiza un nombre de archivo para extraer el nombre base del proyecto y su etiqueta de versión.
 * Ejemplos:
 * - "Tesis_v2.docx" -> { projectName: "Tesis", versionLabel: "v2" }
 * - "Informe final (1).docx" -> { projectName: "Informe final", versionLabel: "Rev 1" }
 * - "Capitulo 1 - copia.docx" -> { projectName: "Capitulo 1", versionLabel: "Copia" }
 * - "Documento_revisado.docx" -> { projectName: "Documento", versionLabel: "Revisado" }
 */
export function parseDocumentVersion(fileName: string): ParsedFileName {
  const cleanExt = fileName.replace(/\.[^/.]+$/, '').trim();

  // Caso: sufijo con paréntesis numérico tipo (1), (2)
  const parenMatch = cleanExt.match(/^(.*?)\s*\((\d+)\)$/i);
  if (parenMatch) {
    const base = parenMatch[1].replace(/[-_]$/, '').trim();
    return {
      rawName: fileName,
      projectName: base || cleanExt,
      versionLabel: `Rev ${parenMatch[2]}`,
    };
  }

  // Caso: sufijos explícitos de versión v1, v2, v2.1, ver_3
  const vMatch = cleanExt.match(/^(.*?)[-_ ]*(?:v|ver|version)[-_ ]*(\d+(?:\.\d+)?)$/i);
  if (vMatch) {
    const base = vMatch[1].replace(/[-_]$/, '').trim();
    return {
      rawName: fileName,
      projectName: base || 'Proyecto',
      versionLabel: `v${vMatch[2]}`,
    };
  }

  // Caso: sufijos semánticos comunes (final, revisado, copia, corregido)
  const tagMatch = cleanExt.match(/^(.*?)[-_ ]*(final|revisado|corregido|copia|borrador)$/i);
  if (tagMatch) {
    const base = tagMatch[1].replace(/[-_]$/, '').trim();
    const tag = tagMatch[2].toLowerCase();
    const formattedTag = tag.charAt(0).toUpperCase() + tag.slice(1);
    return {
      rawName: fileName,
      projectName: base || 'Proyecto',
      versionLabel: formattedTag,
    };
  }

  return {
    rawName: fileName,
    projectName: cleanExt,
    versionLabel: 'v1',
  };
}

/**
 * Agrupa una lista de pestañas/documentos por su nombre de proyecto.
 */
export function groupTabsByProject<T extends { file_name: string; session_id: string }>(tabs: T[]): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const tab of tabs) {
    const parsed = parseDocumentVersion(tab.file_name);
    if (!groups[parsed.projectName]) {
      groups[parsed.projectName] = [];
    }
    groups[parsed.projectName].push(tab);
  }
  return groups;
}
