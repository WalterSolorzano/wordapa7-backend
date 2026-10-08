"""Registro de presets de estilo: builtin (repo) + usuario (STORAGE_DIR).

El usuario pisa al builtin en conflicto de nombre. DELETE solo afecta
presets de usuario. Formato JSON por preset con esquema validado por Pydantic.
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

BUILTIN_DIR = Path(__file__).resolve().parent / "presets" / "builtin"
NAME_RE = re.compile(r"^[a-z0-9_\-]{2,64}$")


class TablePresetDef(BaseModel):
    """Definición de preset de tabla (mapea a APARuleSet)."""
    border_style: Literal["apa", "grid"] = "apa"
    table_label_prefix: str = "Tabla"
    figure_label_prefix: str = "Figura"


class LayoutPresetDef(BaseModel):
    """Definición de preset de layout de página (mapea a APARuleSet)."""
    margins_cm: float = 2.54
    font_family: str = "Times New Roman"
    font_size_pt: int = 12
    line_spacing: float = 2.0
    alignment: Literal["left", "justify"] = "left"
    paragraph_indent_cm: float = 1.27


class HeadingLevelPreset(BaseModel):
    """Ajustes de un nivel de heading (None = no tocar)."""
    bold: Optional[bool] = None
    italic: Optional[bool] = None
    alignment: Optional[Literal["left", "center", "right", "justify"]] = None
    size_pt: Optional[float] = None
    page_break_before: Optional[bool] = None
    keep_with_next: Optional[bool] = None
    font_family: Optional[str] = None


class HeadingPresetDef(BaseModel):
    """Preset de headings por nivel ('1'..'5')."""
    levels: dict[str, HeadingLevelPreset] = Field(default_factory=dict)

    @field_validator("levels")
    @classmethod
    def _valid_level_keys(cls, v: dict) -> dict:
        for k in v:
            if k not in {"1", "2", "3", "4", "5"}:
                raise ValueError(f"nivel '{k}' invalido; use 1..5")
        return v


PRESET_TYPES: dict[str, type[BaseModel]] = {
    "table": TablePresetDef,
    "heading": HeadingPresetDef,
    "layout": LayoutPresetDef,
}


class PresetPayload(BaseModel):
    """Cuerpo de POST /api/presets."""
    name: str
    type: Literal["table", "heading", "layout"]
    description: str = ""
    definition: dict = Field(default_factory=dict)
    overwrite: bool = False

    @field_validator("type", mode="before")
    @classmethod
    def _type_cover_readonly(cls, v):
        if v == "cover":
            raise ValueError(
                "type 'cover' es solo lectura: las plantillas de portada se "
                "gestionan en /api/cover-templates; usa table, heading o layout")
        return v

    @field_validator("name")
    @classmethod
    def _valid_name(cls, v: str) -> str:
        if not NAME_RE.match(v):
            raise ValueError("name debe cumplir ^[a-z0-9_\\-]{2,64}$")
        return v


class PresetRecord(BaseModel):
    """Preset validado con origen y marcas temporales."""
    name: str
    type: str
    description: str = ""
    definition: dict = Field(default_factory=dict)
    version: int = 1
    created_at: str = ""
    updated_at: str = ""
    origin: Literal["builtin", "user"] = "builtin"


class PresetNotFound(Exception):
    """Preset inexistente; conserva los nombres disponibles."""

    def __init__(self, name: str, available: list[str]):
        self.name = name
        self.available = available
        super().__init__(f"Preset '{name}' no encontrado.")


class PresetExists(Exception):
    """Preset ya existe y no se pasó overwrite=true."""


class BuiltinDeleteError(Exception):
    """Intento de borrar un preset builtin."""


class PresetTypeMismatch(Exception):
    """Preset existe pero su tipo no coincide con el esperado."""

    def __init__(self, name: str, expected: str, actual: str):
        self.name = name
        self.expected = expected
        self.actual = actual
        super().__init__(
            f"Preset '{name}' es tipo {actual}; se esperaba {expected}.")


def _user_dir(storage_dir: Path) -> Path:
    d = Path(storage_dir) / "presets"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _read_record(path: Path, origin: str) -> PresetRecord:
    data = json.loads(path.read_text(encoding="utf-8"))
    return PresetRecord(**data, origin=origin)


def _validate_definition(preset_type: str, definition: dict) -> dict:
    return PRESET_TYPES[preset_type](**definition).model_dump()


def _iter_all(storage_dir: Path) -> dict[str, tuple[PresetRecord, Path, str]]:
    """name -> (record, path, origin). Usuario pisando builtin.

    Un JSON corrupto no tumba el listado: se omite (get_preset dara 404).
    """
    out: dict[str, tuple[PresetRecord, Path, str]] = {}
    for folder, origin in ((BUILTIN_DIR, "builtin"),
                           (_user_dir(storage_dir), "user")):
        for path in sorted(folder.glob("*.json")):
            try:
                rec = _read_record(path, origin)
            except Exception:
                continue
            out[rec.name] = (rec, path, origin)
    return out


def list_presets(storage_dir: Path, type_filter: str | None = None) -> list[PresetRecord]:
    recs = [r for r, _, _ in _iter_all(storage_dir).values()]
    if type_filter:
        recs = [r for r in recs if r.type == type_filter]
    return sorted(recs, key=lambda r: (r.type, r.name))


def list_names(storage_dir: Path) -> list[str]:
    return sorted(_iter_all(storage_dir).keys())


def get_preset(name: str, storage_dir: Path) -> PresetRecord:
    all_p = _iter_all(storage_dir)
    if not NAME_RE.match(name) or name not in all_p:
        raise PresetNotFound(name, sorted(all_p.keys()))
    rec, _, _ = all_p[name]
    return rec


def save_preset(payload: PresetPayload, storage_dir: Path) -> PresetRecord:
    definition = _validate_definition(payload.type, payload.definition)
    path = _user_dir(storage_dir) / f"{payload.name}.json"
    if not payload.overwrite:
        if path.exists():
            raise PresetExists(payload.name)
        # Nombre builtin sin overwrite -> 409 (override debe ser explicito)
        if (BUILTIN_DIR / f"{payload.name}.json").exists():
            raise PresetExists(payload.name)
    now = time.strftime("%Y-%m-%dT%H:%M:%S")
    created = now
    if path.exists():
        prev = json.loads(path.read_text(encoding="utf-8"))
        created = prev.get("created_at", now)
    data = {"name": payload.name, "type": payload.type,
            "description": payload.description, "definition": definition,
            "version": 1, "created_at": created, "updated_at": now}
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return PresetRecord(**data, origin="user")


def delete_preset(name: str, storage_dir: Path) -> None:
    # NAME_RE rechaza path traversal ("..\\x") antes de tocar disco
    if not NAME_RE.match(name):
        raise PresetNotFound(name, list_names(storage_dir))
    builtin = BUILTIN_DIR / f"{name}.json"
    user = _user_dir(storage_dir) / f"{name}.json"
    if not user.exists():
        if builtin.exists():
            raise BuiltinDeleteError(name)
        raise PresetNotFound(name, list_names(storage_dir))
    user.unlink()
