from __future__ import annotations

from dataclasses import dataclass, field

import networkx as nx

from diagrams.parser import DiagramSpec

NODE_W = 150.0
NODE_H = 48.0
GAP_X = 60.0
GAP_Y = 40.0
NET_CANVAS = 600.0


@dataclass
class Layout:
    positions: dict[str, tuple[float, float]] = field(default_factory=dict)
    width: float = NODE_W
    height: float = NODE_H
    edge_points: list[tuple[float, float, float, float]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _graph(spec: DiagramSpec) -> nx.DiGraph:
    g = nx.DiGraph()
    for n in spec.nodes:
        g.add_node(n.id)
    for e in spec.edges:
        g.add_edge(e.source, e.target)
    return g


def _place_levels(spec: DiagramSpec, levels: list[list[str]], vertical: bool = False) -> Layout:
    positions: dict[str, tuple[float, float]] = {}
    for col, group in enumerate(levels):
        for row, node_id in enumerate(group):
            if vertical:
                positions[node_id] = (row * (NODE_W + GAP_X), col * (NODE_H + GAP_Y))
            else:
                positions[node_id] = (col * (NODE_W + GAP_X), row * (NODE_H + GAP_Y))
    n_cols = len(levels)
    max_rows = max((len(g) for g in levels), default=1)
    if vertical:
        width = (max_rows - 1) * (NODE_W + GAP_X) + NODE_W
        height = (n_cols - 1) * (NODE_H + GAP_Y) + NODE_H
    else:
        width = (n_cols - 1) * (NODE_W + GAP_X) + NODE_W
        height = (max_rows - 1) * (NODE_H + GAP_Y) + NODE_H
    return Layout(positions=positions, width=max(width, NODE_W), height=max(height, NODE_H))


def _edge_points(spec: DiagramSpec, positions: dict[str, tuple[float, float]]) -> list[tuple[float, float, float, float]]:
    pts = []
    for e in spec.edges:
        if e.source in positions and e.target in positions:
            x1, y1 = positions[e.source]
            x2, y2 = positions[e.target]
            pts.append((x1 + NODE_W / 2, y1 + NODE_H / 2, x2 + NODE_W / 2, y2 + NODE_H / 2))
    return pts


def compute_layout(spec: DiagramSpec) -> Layout:
    if not spec.nodes:
        return Layout()
    g = _graph(spec)
    try:
        if spec.kind == "tree":
            root = spec.nodes[0].id
            layers = list(nx.bfs_layers(g, root))
            lay = _place_levels(spec, layers, vertical=True)
        elif spec.kind == "flow":
            if nx.is_directed_acyclic_graph(g):
                layers = list(nx.topological_generations(g))
                lay = _place_levels(spec, layers)
            else:
                layers = [[n] for n in g.nodes]
                lay = _place_levels(spec, layers)
                lay.warnings.append("ciclo en flow; layout secuencial")
                lay.edge_points = _edge_points(spec, lay.positions)
                return lay
        else:
            pos = nx.kamada_kawai_layout(g)
            xs = [p[0] for p in pos.values()]
            ys = [p[1] for p in pos.values()]
            minx, maxx = min(xs), max(xs)
            miny, maxy = min(ys), max(ys)
            spanx = (maxx - minx) or 1.0
            spany = (maxy - miny) or 1.0
            positions = {
                nid: ((x - minx) / spanx * (NET_CANVAS - NODE_W), (y - miny) / spany * (NET_CANVAS - NODE_H))
                for nid, (x, y) in pos.items()
            }
            lay = Layout(positions=positions, width=NET_CANVAS, height=NET_CANVAS)
    except Exception as exc:  # pragma: no cover - defensivo
        lay = Layout()
        lay.warnings.append(f"layout falló: {exc}")
    lay.edge_points = _edge_points(spec, lay.positions)
    return lay
