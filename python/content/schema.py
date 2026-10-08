from __future__ import annotations

from typing import Optional, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator


class MetaSpec(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str = ""
    author: str = ""
    institution: str = ""
    course: str = ""
    date: str = ""
    apa_format: str = "student"
    use_original_cover: bool = False
    # "" => decidir por use_original_cover; "generate_uni_cover" => portada UNI;
    # "generate_apa7_template" => portada APA sintetica.
    cover_mode: str = ""


class TableSpec(BaseModel):
    model_config = ConfigDict(extra="ignore")
    caption: str = ""
    note: Optional[str] = None
    headers: list[str] = Field(default_factory=list)
    rows: list[list[str]] = Field(default_factory=list)


class DiagramPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    kind: str = "flow"
    dsl: str = ""
    caption: str = ""
    note: Optional[str] = None
    style: str = "standard"
    width_cm: float = 12.0
    height_cm: float = 8.0


class ContentItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    h1: Optional[str] = None
    h2: Optional[str] = None
    h3: Optional[str] = None
    p: Optional[str] = None
    bullets: Optional[list[str]] = None
    numbered: Optional[list[str]] = None
    cite: Optional[str] = None
    table: Optional[TableSpec] = None
    diagram: Optional[DiagramPayload] = None
    page_break: bool = False

    @model_validator(mode="after")
    def _exactly_one_type(self) -> "ContentItem":
        fields = {
            "h1": self.h1,
            "h2": self.h2,
            "h3": self.h3,
            "p": self.p,
            "bullets": self.bullets,
            "numbered": self.numbered,
            "table": self.table,
            "diagram": self.diagram,
            "page_break": self.page_break,
        }
        present = [k for k, v in fields.items() if v]
        if len(present) != 1:
            raise ValueError(
                "Cada bloque debe tener exactamente un tipo de contenido "
                f"(encontrados: {', '.join(present) if present else 'ninguno'})."
            )
        if self.cite and not self.p:
            raise ValueError("'cite' solo acompaña a un párrafo ('p').")
        return self


class ContentDocument(BaseModel):
    model_config = ConfigDict(extra="ignore")
    meta: MetaSpec = Field(default_factory=MetaSpec)
    content: list[ContentItem] = Field(default_factory=list)
    references: list[str] = Field(default_factory=list)


def normalize_item(raw: dict) -> ContentItem:
    """Acepta la forma corta y la forma larga (`{"type": ...}`)."""
    if not isinstance(raw, dict):
        return ContentItem()
    if "type" not in raw:
        return ContentItem(**raw)

    kind = raw.get("type")
    if kind == "heading":
        level = int(raw.get("level", 1) or 1)
        key = {1: "h1", 2: "h2"}.get(level, "h3")
        return ContentItem(**{key: raw.get("text", "")})
    if kind == "paragraph":
        return ContentItem(p=raw.get("text", ""), cite=raw.get("cite"))
    if kind == "bullet":
        return ContentItem(bullets=[raw.get("text", "")])
    if kind == "table":
        return ContentItem(table=TableSpec(
            caption=raw.get("caption", ""),
            note=raw.get("note"),
            headers=raw.get("headers", []) or [],
            rows=raw.get("rows", []) or [],
        ))
    if kind == "diagram":
        return ContentItem(diagram=DiagramPayload(**raw))
    if kind == "page_break":
        return ContentItem(page_break=True)
    return ContentItem(p=raw.get("text", ""))


def parse_content_document(payload: Union[dict, ContentDocument]) -> ContentDocument:
    if isinstance(payload, ContentDocument):
        return payload
    data = dict(payload or {})
    raw_items = data.get("content", []) or []
    data["content"] = [normalize_item(i) for i in raw_items]
    return ContentDocument(**data)
