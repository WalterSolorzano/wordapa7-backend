"""
WordAPA7 — Perfiles de formato (config, no código por perfil)

El motor de clasificación es fijo y compartido; cada perfil define SOLO la
configuración de formato: tipografía, espaciado, portada, tablas, LaTeX.

Agregar un perfil nuevo = escribir un objeto FormatProfile, no duplicar
pantallas ni componentes. El perfil "apa7" es el default y el único que
garantiza cobertura 100% de la norma (los otros heredan el mismo motor de
detección de citas, compartido por diseño).
"""

from models import (
    APARuleSet,
    HeadingLevelConfig,
    TableBorderStyle,
)
from pydantic import BaseModel, Field


class FormatProfile(BaseModel):
    profile_id: str
    display_name: str
    description: str
    rules: APARuleSet
    # Campos de portada que el Health Check exige completos antes de descargar
    cover_required_fields: list[str] = Field(default_factory=list)
    # Clase/opciones LaTeX por defecto del perfil
    latex_documentclass: str = "apa7"
    latex_options: str = "stu, 12pt"
    # Formato de portada por defecto (student | professional)
    cover_apa_format: str = "student"


_SJ_HEADINGS = {
    1: HeadingLevelConfig(bold=True, italic=False, alignment="left", inline_text=False),
    2: HeadingLevelConfig(bold=True, italic=False, alignment="left", inline_text=False),
    3: HeadingLevelConfig(bold=True, italic=True, alignment="left", inline_text=False),
    4: HeadingLevelConfig(bold=True, italic=False, alignment="left", indent_cm=0.63, inline_text=True),
    5: HeadingLevelConfig(bold=True, italic=True, alignment="left", indent_cm=0.63, inline_text=True),
}


BUILTIN_PROFILES: dict[str, FormatProfile] = {
    "apa7": FormatProfile(
        profile_id="apa7",
        display_name="APA 7ª edición",
        description="Norma APA 7: Times New Roman 12, doble espacio, sangría de 1.27 cm, "
                    "portada estudiantil o profesional, tablas con solo bordes horizontales.",
        rules=APARuleSet(),
        cover_required_fields=["title", "author", "institution"],
        latex_documentclass="apa7",
        latex_options="stu, 12pt",
        cover_apa_format="student",
    ),
    "scientific-journal": FormatProfile(
        profile_id="scientific-journal",
        display_name="Revista Científica",
        description="Formato de revista científica: interlineado 1.5, sangría de 0.63 cm, "
                    "títulos alineados a la izquierda, tablas con cuadrícula y portada "
                    "profesional minimalista (título, autor, afiliación).",
        rules=APARuleSet(
            profile_name="Revista Científica",
            is_default=False,
            line_spacing=1.5,
            paragraph_indent_cm=0.63,
            heading_levels=_SJ_HEADINGS,
            heading_numbering_style_lvl1="decimal",
            heading_numbering_style_lvl2="decimal",
            heading_numbering_style_lvl3="none",
            figure_label_prefix="Figura",
            table_label_prefix="Tabla",
            table_border_style=TableBorderStyle.GRID,
        ),
        cover_required_fields=["title", "author", "institution"],
        latex_documentclass="article",
        latex_options="12pt",
        cover_apa_format="professional",
    ),
}


def get_profile(profile_id: str | None) -> FormatProfile:
    """Devuelve el perfil por id; fallback seguro a apa7 si es desconocido."""
    if not profile_id:
        return BUILTIN_PROFILES["apa7"]
    return BUILTIN_PROFILES.get(profile_id, BUILTIN_PROFILES["apa7"])


def list_profiles() -> list[FormatProfile]:
    return list(BUILTIN_PROFILES.values())
