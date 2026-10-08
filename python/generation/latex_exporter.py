"""
WordAPA7 - LaTeX Exporter
Generates semantic LaTeX code from the DocumentModel (Phase 8).
"""

from typing import Optional

from models import DocumentModel, ElementType
from profiles import get_profile


def export_to_latex(doc: DocumentModel, profile_id: Optional[str] = None) -> str:
    """
    Convierte el DocumentModel en un archivo LaTeX compilable, siguiendo la
    clase y opciones del perfil de formato activo (APA7 usa la clase `apa7`,
    revista científica la clase `article`).
    """
    profile = get_profile(profile_id)
    lines = []

    # Preámbulo
    lines.append(rf"\documentclass[{profile.latex_options}]{{{profile.latex_documentclass}}}")
    lines.append(r"\usepackage[utf8]{inputenc}")
    lines.append(r"\usepackage[spanish]{babel}")
    lines.append(r"\usepackage{csquotes}")
    lines.append(r"\usepackage{graphicx}")
    lines.append(r"\usepackage{booktabs}")
    lines.append(r"")

    # Portada
    title = doc.portada.get("fields", {}).get("title", "Título del Documento") if doc.portada else "Título"
    author = doc.portada.get("fields", {}).get("author", "Autor") if doc.portada else "Autor"
    course = doc.portada.get("fields", {}).get("course", "Curso") if doc.portada else ""
    inst = doc.portada.get("fields", {}).get("institution", "Institución") if doc.portada else ""

    lines.append(rf"\title{{{title}}}")
    lines.append(rf"\author{{{author}}}")
    if inst:
        lines.append(rf"\affiliation{{{inst}}}")
    if course:
        lines.append(rf"\course{{{course}}}")

    lines.append(r"\begin{document}")
    lines.append(r"\maketitle")
    lines.append(r"")

    # Cuerpo
    for elem in doc.elements:
        if not elem.text and elem.type not in [ElementType.PAGE_BREAK]:
            continue

        text = elem.text.replace("&", r"\&").replace("%", r"\%").replace("$", r"\$").replace("#", r"\#").replace("_", r"\_") if elem.text else ""

        if elem.type == ElementType.HEADING:
            lvl = elem.heading_level if elem.heading_level else 1
            if lvl == 1:
                lines.append(rf"\section{{{text}}}")
            elif lvl == 2:
                lines.append(rf"\subsection{{{text}}}")
            elif lvl == 3:
                lines.append(rf"\subsubsection{{{text}}}")
            else:
                lines.append(rf"\paragraph{{{text}}}")

        elif elem.type == ElementType.PARAGRAPH:
            lines.append(f"{text}\n")

        elif elem.type == ElementType.TABLE and elem.table_info:
            lines.append(r"\begin{table}[h!]")
            lines.append(rf"\caption{{{elem.table_info.caption}}}")
            lines.append(r"\centering")
            lines.append(r"\begin{tabular}{c c c}")
            lines.append(r"\toprule")
            lines.append(r"Columna 1 & Columna 2 & Columna 3 \\")
            lines.append(r"\midrule")
            lines.append(r"[Contenido extraído del docx] \\")
            lines.append(r"\bottomrule")
            lines.append(r"\end{tabular}")
            lines.append(r"\end{table}")
            lines.append(r"")

    # Referencias (Simplified)
    if doc.referencias:
        lines.append(r"\section{Referencias}")
        lines.append(r"\begin{itemize}")
        for ref in doc.referencias:
            raw = ref.formatted_apa or ref.raw_text or ""
            rt = raw.replace("&", r"\&").replace("%", r"\%").replace("$", r"\$")
            lines.append(rf"\item {rt}")
        lines.append(r"\end{itemize}")

    lines.append(r"\end{document}")

    return "\n".join(lines)
