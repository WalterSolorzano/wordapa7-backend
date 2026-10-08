"""
WordAPA7 — Plantillas Internas de Estructura de Documento

Define plantillas de estructura académica estándar que pueden aplicarse
desde la UI para organizar los elementos del documento según esquemas
predefinidos (tesina, informe técnico, artículo de investigación, etc.).

Cada plantilla define:
- Secciones obligatorias con heading_level, texto sugerido y orden
- Opciones de numeración (romana / decimal)
- Reglas de page break antes de cada sección principal
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class TemplateSection:
    """Una sección dentro de una plantilla de documento."""
    heading_level: int
    suggested_text: str
    required: bool = True
    page_break_before: bool = True
    numbering_style: str = "decimal"  # "decimal" | "roman"
    sub_sections: List[TemplateSection] = field(default_factory=list)


@dataclass
class DocumentTemplate:
    """Plantilla completa de estructura de documento."""
    name: str
    description: str
    sections: List[TemplateSection]
    default_numbering_style: str = "decimal"
    has_cover_page: bool = True
    has_toc: bool = True
    has_references: bool = True


# ── PLANTILLAS PREDEFINIDAS ───────────────────────────────────────────────────

# Tesina / Monografía académica estándar (formato tesis corta)
TEMPLATE_TESINA = DocumentTemplate(
    name="Tesina / Monografía Académica",
    description="Estructura estándar para tesina de grado: Índice, Introducción, Desarrollo, Conclusión, Referencias",
    has_cover_page=True,
    has_toc=True,
    has_references=True,
    default_numbering_style="decimal",
    sections=[
        TemplateSection(
            heading_level=1,
            suggested_text="Índice",
            page_break_before=False,
            numbering_style="decimal",
        ),
        TemplateSection(
            heading_level=1,
            suggested_text="Introducción",
            page_break_before=True,
            numbering_style="decimal",
            sub_sections=[
                TemplateSection(
                    heading_level=2,
                    suggested_text="Antecedentes",
                    page_break_before=False,
                    numbering_style="decimal",
                ),
                TemplateSection(
                    heading_level=2,
                    suggested_text="Planteamiento del Problema",
                    page_break_before=False,
                    numbering_style="decimal",
                ),
                TemplateSection(
                    heading_level=2,
                    suggested_text="Objetivos",
                    page_break_before=False,
                    numbering_style="decimal",
                ),
                TemplateSection(
                    heading_level=2,
                    suggested_text="Justificación",
                    page_break_before=False,
                    numbering_style="decimal",
                ),
            ],
        ),
        TemplateSection(
            heading_level=1,
            suggested_text="Marco Teórico",
            page_break_before=True,
            numbering_style="decimal",
        ),
        TemplateSection(
            heading_level=1,
            suggested_text="Metodología",
            page_break_before=True,
            numbering_style="decimal",
            sub_sections=[
                TemplateSection(
                    heading_level=2,
                    suggested_text="Tipo de Investigación",
                    page_break_before=False,
                ),
                TemplateSection(
                    heading_level=2,
                    suggested_text="Población y Muestra",
                    page_break_before=False,
                ),
                TemplateSection(
                    heading_level=2,
                    suggested_text="Instrumentos",
                    page_break_before=False,
                ),
            ],
        ),
        TemplateSection(
            heading_level=1,
            suggested_text="Resultados",
            page_break_before=True,
            numbering_style="decimal",
        ),
        TemplateSection(
            heading_level=1,
            suggested_text="Discusión",
            page_break_before=True,
            numbering_style="decimal",
        ),
        TemplateSection(
            heading_level=1,
            suggested_text="Conclusiones",
            page_break_before=True,
            numbering_style="decimal",
        ),
        TemplateSection(
            heading_level=1,
            suggested_text="Referencias Bibliográficas",
            page_break_before=True,
            numbering_style="decimal",
        ),
    ],
)

# Informe técnico / laboratorio
TEMPLATE_INFORME = DocumentTemplate(
    name="Informe Técnico / Laboratorio",
    description="Estructura para informes técnicos: Resumen Ejecutivo, Metodología, Resultados, Recomendaciones",
    has_cover_page=True,
    has_toc=False,
    has_references=True,
    default_numbering_style="decimal",
    sections=[
        TemplateSection(
            heading_level=1,
            suggested_text="Resumen Ejecutivo",
            page_break_before=False,
        ),
        TemplateSection(
            heading_level=1,
            suggested_text="Introducción",
            page_break_before=True,
        ),
        TemplateSection(
            heading_level=1,
            suggested_text="Metodología",
            page_break_before=True,
            sub_sections=[
                TemplateSection(
                    heading_level=2,
                    suggested_text="Diseño",
                    page_break_before=False,
                ),
                TemplateSection(
                    heading_level=2,
                    suggested_text="Procedimiento",
                    page_break_before=False,
                ),
            ],
        ),
        TemplateSection(
            heading_level=1,
            suggested_text="Resultados",
            page_break_before=True,
        ),
        TemplateSection(
            heading_level=1,
            suggested_text="Discusión",
            page_break_before=True,
        ),
        TemplateSection(
            heading_level=1,
            suggested_text="Conclusiones y Recomendaciones",
            page_break_before=True,
        ),
        TemplateSection(
            heading_level=1,
            suggested_text="Referencias",
            page_break_before=True,
        ),
    ],
)

# Artículo de investigación (IMRyD)
TEMPLATE_IMRYD = DocumentTemplate(
    name="Artículo IMRyD (Investigación)",
    description="Estructura IMRyD: Introducción, Métodos, Resultados y Discusión — estándar para artículos científicos",
    has_cover_page=True,
    has_toc=False,
    has_references=True,
    default_numbering_style="decimal",
    sections=[
        TemplateSection(
            heading_level=1,
            suggested_text="Introducción",
            page_break_before=False,
        ),
        TemplateSection(
            heading_level=1,
            suggested_text="Métodos",
            page_break_before=True,
        ),
        TemplateSection(
            heading_level=1,
            suggested_text="Resultados",
            page_break_before=True,
        ),
        TemplateSection(
            heading_level=1,
            suggested_text="Discusión",
            page_break_before=True,
        ),
        TemplateSection(
            heading_level=1,
            suggested_text="Conclusiones",
            page_break_before=True,
        ),
        TemplateSection(
            heading_level=1,
            suggested_text="Referencias",
            page_break_before=True,
        ),
    ],
)

# Ensayo académico
TEMPLATE_ENSAYO = DocumentTemplate(
    name="Ensayo Académico",
    description="Estructura flexible para ensayos: Introducción, Desarrollo temático, Conclusiones",
    has_cover_page=True,
    has_toc=False,
    has_references=True,
    default_numbering_style="decimal",
    sections=[
        TemplateSection(
            heading_level=1,
            suggested_text="Introducción",
            page_break_before=False,
        ),
        TemplateSection(
            heading_level=1,
            suggested_text="Desarrollo",
            page_break_before=True,
            sub_sections=[
                TemplateSection(
                    heading_level=2,
                    suggested_text="Antecedentes",
                    page_break_before=False,
                ),
                TemplateSection(
                    heading_level=2,
                    suggested_text="Análisis",
                    page_break_before=False,
                ),
            ],
        ),
        TemplateSection(
            heading_level=1,
            suggested_text="Conclusiones",
            page_break_before=True,
        ),
        TemplateSection(
            heading_level=1,
            suggested_text="Referencias",
            page_break_before=True,
        ),
    ],
)


# ── REGISTRO DE PLANTILLAS ────────────────────────────────────────────────────

AVAILABLE_TEMPLATES: list[DocumentTemplate] = [
    TEMPLATE_TESINA,
    TEMPLATE_INFORME,
    TEMPLATE_IMRYD,
    TEMPLATE_ENSAYO,
]


def get_template(name: str) -> Optional[DocumentTemplate]:
    """Obtiene una plantilla por nombre."""
    for t in AVAILABLE_TEMPLATES:
        if t.name == name:
            return t
    return None
