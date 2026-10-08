from __future__ import annotations

from dataclasses import dataclass, field
from xml.sax.saxutils import escape

import fitz

from diagrams.layout import NODE_H, NODE_W, compute_layout
from diagrams.parser import parse_dsl
from diagrams.themes import APA_THEME, DiagramTheme

PAD = 24.0


@dataclass
class RenderResult:
    svg: str = ""
    png: bytes = b""
    width: int = 0
    height: int = 0
    warnings: list[str] = field(default_factory=list)


def _svg_document(spec, lay, theme: DiagramTheme) -> str:
    w = int(lay.width + 2 * PAD)
    h = int(lay.height + 2 * PAD)
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
        f'viewBox="0 0 {w} {h}">',
        f'<rect width="{w}" height="{h}" fill="{theme.paper}"/>',
        '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" '
        f'markerWidth="6" markerHeight="6" orient="auto-start-reverse">'
        f'<path d="M 0 0 L 10 5 L 0 10 z" fill="{theme.edge_stroke}"/></marker></defs>',
    ]
    for (x1, y1, x2, y2), edge in zip(lay.edge_points, spec.edges):
        marker = ' marker-end="url(#arrow)"' if edge.style == "arrow" else ""
        parts.append(
            f'<line x1="{x1 + PAD:.1f}" y1="{y1 + PAD:.1f}" x2="{x2 + PAD:.1f}" '
            f'y2="{y2 + PAD:.1f}" stroke="{theme.edge_stroke}" '
            f'stroke-width="{theme.stroke_width}"{marker}/>'
        )
        if edge.label:
            mx = (x1 + x2) / 2 + PAD
            my = (y1 + y2) / 2 + PAD
            parts.append(
                f'<text x="{mx:.1f}" y="{my:.1f}" font-family="{theme.font_family}" '
                f'font-size="{theme.font_size}" fill="{theme.ink}">{escape(edge.label)}</text>'
            )
    for node in spec.nodes:
        x, y = lay.positions[node.id]
        parts.append(
            f'<rect x="{x + PAD:.1f}" y="{y + PAD:.1f}" width="{NODE_W:.1f}" '
            f'height="{NODE_H:.1f}" rx="4" fill="{theme.node_fill}" '
            f'stroke="{theme.node_stroke}" stroke-width="{theme.stroke_width}"/>'
        )
        parts.append(
            f'<text x="{x + PAD + NODE_W / 2:.1f}" y="{y + PAD + NODE_H / 2:.1f}" '
            f'text-anchor="middle" dominant-baseline="middle" '
            f'font-family="{theme.font_family}" font-size="{theme.font_size}" '
            f'fill="{theme.ink}">{escape(node.label)}</text>'
        )
    parts.append("</svg>")
    return "".join(parts)


def render_diagram(kind: str, dsl: str, theme: DiagramTheme = APA_THEME, dpi: int = 150) -> RenderResult:
    spec = parse_dsl(kind, dsl)
    warnings = list(spec.warnings)
    if not spec.nodes:
        warnings.append("diagrama sin nodos")
    lay = compute_layout(spec)
    warnings.extend(lay.warnings)
    svg = _svg_document(spec, lay, theme)
    page = fitz.open(stream=svg.encode("utf-8"), filetype="svg")
    pix = page[0].get_pixmap(dpi=dpi)
    png = pix.tobytes("png")
    width, height = pix.width, pix.height
    page.close()
    return RenderResult(svg=svg, png=png, width=width, height=height, warnings=warnings)
