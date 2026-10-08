"""DSL compacto spec -> docx. Contrato de agentes IA para POST /api/spec.

Solo datos JSON: el agente describe el documento; el motor lo expande al
modelo interno (ElementModel) y genera el .docx con el pipeline existente.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from dataclasses import field as dc_field
from pathlib import Path
from typing import Annotated, Literal, Optional, Union

from models import (
    APARuleSet,
    ElementModel,
    ElementType,
    ImageModel,
    ReferenciaModel,
    TableBorderStyle,
    TableModel,
)
from pydantic import BaseModel, Field, field_validator, model_validator

SPEC_VERSION = "1"

MAX_ELEMENTS = 200
MAX_IMAGES = 50
MAX_ROWS = 500
MAX_COLS = 30
MAX_REFS = 50
MAX_TEXT = 4096

_ILLEGAL_FILENAME = re.compile(r"[^A-Za-z0-9_\-\.]")


class OutputSpec(BaseModel):
    filename: str = "documento_apa.docx"


class CoverSpec(BaseModel):
    """Portada: template de la tienda cover-templates + campos."""
    template: str = ""
    title: str = ""
    author: str = ""
    institution: str = ""
    course: str = ""
    instructor: str = ""
    date: str = ""


class PresetRefs(BaseModel):
    """Nombres de presets (None = default del motor)."""
    table: Optional[str] = None
    heading: Optional[str] = None
    layout: Optional[str] = None


class SpecOptions(BaseModel):
    resolve_doi: bool = False
    # NOTA: sin 'mode'. El flujo spec SIEMPRE usa export_mode="rebuild":
    # 'inplace' solo reformatea el original.docx (que esta en blanco) y
    # retorna sin escribir elementos (bug critico corregido post-review).


class HeadingElement(BaseModel):
    type: Literal["heading"] = "heading"
    level: int = Field(ge=1, le=5)
    text: str = Field(max_length=MAX_TEXT)


class ParagraphElement(BaseModel):
    type: Literal["paragraph"] = "paragraph"
    text: str = Field(max_length=MAX_TEXT)


class TableElement(BaseModel):
    type: Literal["table"] = "table"
    caption: str = ""          # etiqueta visible, p. ej. "Tabla 1"
    title: str = ""
    columns: list[str] = Field(min_length=1, max_length=MAX_COLS)
    rows: list[list[str]] = Field(default_factory=list)
    note: Optional[str] = Field(default=None, max_length=MAX_TEXT)
    repeat_header: bool = True
    preset: Optional[str] = None   # preset table nombrado (override)

    @field_validator("rows")
    @classmethod
    def _rows_limits(cls, v: list[list[str]]) -> list[list[str]]:
        if len(v) > MAX_ROWS:
            raise ValueError(f"LIMIT: maximo {MAX_ROWS} filas")
        for row in v:
            if len(row) > MAX_COLS:
                raise ValueError(f"LIMIT: maximo {MAX_COLS} columnas")
            for cell in row:
                if len(cell) > MAX_TEXT:
                    raise ValueError(f"LIMIT: celda > {MAX_TEXT} chars")
        return v


class FigureElement(BaseModel):
    type: Literal["figure"] = "figure"
    image: str
    caption: str = ""
    title: str = Field(default="", max_length=MAX_TEXT)

    @field_validator("image")
    @classmethod
    def _no_data_uri(cls, v: str) -> str:
        if v.lower().startswith("data:"):
            raise ValueError("URIs data: prohibidos; usa ruta local absoluta")
        return v


class EquipmentCardElement(BaseModel):
    type: Literal["equipment_card"] = "equipment_card"
    number: str = Field(max_length=16)     # p. ej. "A2"
    title: str = Field(max_length=MAX_TEXT)
    image: str
    specs: dict[str, str] = Field(default_factory=dict)

    @field_validator("image")
    @classmethod
    def _no_data_uri(cls, v: str) -> str:
        if v.lower().startswith("data:"):
            raise ValueError("URIs data: prohibidos; usa ruta local absoluta")
        return v


class ReferenceItem(BaseModel):
    apa: Optional[str] = Field(default=None, max_length=MAX_TEXT)
    doi: Optional[str] = None


class ReferencesElement(BaseModel):
    type: Literal["references"] = "references"
    items: list[ReferenceItem] = Field(max_length=MAX_REFS)


ElementUnion = Annotated[
    Union[HeadingElement, ParagraphElement, TableElement, FigureElement,
          EquipmentCardElement, ReferencesElement],
    Field(discriminator="type"),
]


class SpecDocument(BaseModel):
    """Raiz del DSL."""
    spec_version: Literal["1"]
    output: OutputSpec = Field(default_factory=OutputSpec)
    cover: Optional[CoverSpec] = None
    presets: PresetRefs = Field(default_factory=PresetRefs)
    elements: list[ElementUnion] = Field(min_length=1)
    options: SpecOptions = Field(default_factory=SpecOptions)

    @model_validator(mode="after")
    def _global_limits(self) -> "SpecDocument":
        if len(self.elements) > MAX_ELEMENTS:
            raise ValueError(f"LIMIT: maximo {MAX_ELEMENTS} elementos")
        images = sum(1 for e in self.elements
                     if e.type in ("figure", "equipment_card"))
        if images > MAX_IMAGES:
            raise ValueError(f"LIMIT: maximo {MAX_IMAGES} imagenes")
        for i, e in enumerate(self.elements):
            if e.type == "paragraph" and len(e.text) > MAX_TEXT:
                raise ValueError(f"LIMIT: elements[{i}].text > {MAX_TEXT}")
        return self


def sanitize_filename(raw: str) -> str:
    """Quita cualquier ruta/tipo de archivo peligroso; devuelve solo nombre .docx."""
    name = raw.replace("\\", "/").split("/")[-1]
    name = _ILLEGAL_FILENAME.sub("_", name).strip("._") or "documento_apa"
    if not name.lower().endswith(".docx"):
        name += ".docx"
    if len(name) > 120:
        name = name[:116] + ".docx"
    return name


# ── Expansión al modelo interno ──────────────────────────────────────────────


@dataclass
class EquipmentCardItem:
    number: str
    title: str
    image: str
    specs: dict


@dataclass
class TableOverride:
    caption_label: str
    border_style: str


@dataclass
class ExpansionResult:
    elements: list
    rules: "APARuleSet"
    references: list
    equipment_cards: list
    heading_preset: object = None
    table_overrides: list = dc_field(default_factory=list)
    warnings: list = dc_field(default_factory=list)
    filename: str = "documento_apa.docx"


def _table_number(caption: str, fallback: int) -> int:
    """'Tabla 2' -> 2; sin numero -> contador secuencial."""
    m = re.search(r"(\d+)\s*$", caption or "")
    return int(m.group(1)) if m else fallback


async def expand_spec(spec, *, table_def=None, layout_def=None, heading_def=None,
                      storage_dir: Path) -> ExpansionResult:
    """Expande SpecDocument a elementos internos + reglas + anexos + warnings."""
    warnings: list[str] = []
    rules = APARuleSet()

    # El flujo spec es SIEMPRE rebuild: el template esta en blanco y
    # apply_inplace() nunca inserta elementos (retorna temprano).
    rules.export_mode = "rebuild"

    # Preset de layout -> reglas de pagina
    if layout_def:
        rules.margins_cm = layout_def.margins_cm
        rules.font_family = layout_def.font_family
        rules.font_size_pt = layout_def.font_size_pt
        rules.line_spacing = layout_def.line_spacing
        rules.alignment = layout_def.alignment
        rules.paragraph_indent_cm = layout_def.paragraph_indent_cm

    # Preset de tabla global -> reglas de figuras/tablas
    if table_def:
        rules.table_border_style = TableBorderStyle(table_def.border_style)
        rules.table_label_prefix = table_def.table_label_prefix
        rules.figure_label_prefix = table_def.figure_label_prefix

    elements: list[ElementModel] = []
    references: list[ReferenciaModel] = []
    cards: list[EquipmentCardItem] = []
    overrides: list[TableOverride] = []
    n_tables = n_figs = 0

    for i, el in enumerate(spec.elements):
        eid = f"spec-{i}"
        if el.type == "heading":
            elements.append(ElementModel(
                id=eid, type=ElementType.HEADING, heading_level=el.level,
                text=el.text, needs_review=False, confidence=1.0))
        elif el.type == "paragraph":
            elements.append(ElementModel(
                id=eid, type=ElementType.PARAGRAPH, text=el.text,
                needs_review=False, confidence=1.0))
        elif el.type == "table":
            n_tables += 1
            tnum = _table_number(el.caption, n_tables)
            elements.append(ElementModel(
                id=eid, type=ElementType.TABLE, needs_review=False, confidence=1.0,
                table_info=TableModel(element_id=eid, headers=el.columns,
                                      rows=el.rows, caption=el.title,
                                      note=el.note, table_number=tnum)))
            if not el.repeat_header:
                warnings.append(f"elements[{i}]: repeat_header=false no soportado "
                                f"todavia; la cabecera se repite por defecto.")
            if el.preset:
                from preset_store import PresetTypeMismatch, get_preset
                rec = get_preset(el.preset, storage_dir)  # Propaga PresetNotFound
                if rec.type != "table":
                    raise PresetTypeMismatch(el.preset, "table", rec.type)
                overrides.append(TableOverride(
                    caption_label=f"{rules.table_label_prefix} {tnum}",
                    border_style=rec.definition.get("border_style", "apa")))
        elif el.type == "figure":
            if not Path(el.image).exists():
                warnings.append(f"elements[{i}]: imagen no encontrada, "
                                f"se omite: {el.image}")
                continue
            n_figs += 1
            # 'Figura 3' del agente fija el numero; sin digito -> secuencial
            fnum = _table_number(el.caption, n_figs)
            elements.append(ElementModel(
                id=eid, type=ElementType.IMAGE, needs_review=False, confidence=1.0,
                image_info=ImageModel(element_id=eid, file_path=el.image,
                                      filename=Path(el.image).name,
                                      caption=el.title, figure_number=fnum)))
        elif el.type == "equipment_card":
            if not Path(el.image).exists():
                warnings.append(f"elements[{i}]: imagen de tarjeta no encontrada, "
                                f"se omite: {el.image}")
                continue
            cards.append(EquipmentCardItem(number=el.number, title=el.title,
                                           image=el.image, specs=el.specs))
        elif el.type == "references":
            for j, item in enumerate(el.items):
                apa = item.apa
                if not apa and item.doi and spec.options.resolve_doi:
                    from modules.referencias_module import resolve_doi
                    apa = await resolve_doi(item.doi)
                    if not apa:
                        warnings.append(f"elements[{i}].items[{j}]: DOI no "
                                        f"resuelto, se omite: {item.doi}")
                        continue
                if not apa:
                    warnings.append(f"elements[{i}].items[{j}]: falta 'apa' y "
                                    f"resolve_doi=false; referencia omitida.")
                    continue
                references.append(ReferenciaModel(
                    id=f"spec-ref-{i}-{j}", raw_text=apa, formatted_apa=apa,
                    doi_or_url=item.doi))

    return ExpansionResult(
        elements=elements, rules=rules, references=references,
        equipment_cards=cards, heading_preset=heading_def,
        table_overrides=overrides, warnings=warnings,
        filename=sanitize_filename(spec.output.filename))
