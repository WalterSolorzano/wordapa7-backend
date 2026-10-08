from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DiagramTheme:
    font_family: str = "Times New Roman"
    font_size: int = 11
    ink: str = "#111827"
    paper: str = "#ffffff"
    stroke_width: float = 1.0
    node_fill: str = "#ffffff"
    node_stroke: str = "#111827"
    edge_stroke: str = "#111827"


APA_THEME = DiagramTheme()
