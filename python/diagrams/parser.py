from __future__ import annotations

from dataclasses import dataclass, field

SUPPORTED_KINDS = ("flow", "tree", "net")


@dataclass
class DNode:
    id: str
    label: str


@dataclass
class DEdge:
    source: str
    target: str
    label: str | None = None
    style: str = "arrow"


@dataclass
class DiagramSpec:
    kind: str
    nodes: list[DNode] = field(default_factory=list)
    edges: list[DEdge] = field(default_factory=list)
    direction: str = "TB"
    warnings: list[str] = field(default_factory=list)


def _clean_lines(dsl: str) -> list[str]:
    return [ln for ln in (dsl or "").splitlines() if ln.strip() and not ln.strip().startswith("#")]


class _Nodes:
    def __init__(self, spec: DiagramSpec) -> None:
        self._spec = spec
        self._seen: dict[str, DNode] = {}

    def get(self, label: str) -> DNode | None:
        label = label.strip()
        if not label:
            return None
        if label not in self._seen:
            self._seen[label] = DNode(id=label, label=label)
            self._spec.nodes.append(self._seen[label])
        return self._seen[label]


def _parse_flow(lines: list[str], spec: DiagramSpec) -> None:
    nodes = _Nodes(spec)
    for line in lines:
        if ">" not in line:
            spec.warnings.append(f"Línea ignorada (sin '>'): {line}")
            continue
        left, right = line.split(">", 1)
        edge_label = None
        if right.startswith("|"):
            close = right.find("|", 1)
            if close == -1:
                spec.warnings.append(f"Etiqueta sin cerrar: {line}")
                continue
            edge_label = right[1:close].strip()
            right = right[close + 1:]
        src = nodes.get(left)
        dst = nodes.get(right)
        if src and dst:
            spec.edges.append(DEdge(source=src.id, target=dst.id, label=edge_label, style="arrow"))


def _parse_tree(lines: list[str], spec: DiagramSpec) -> None:
    nodes = _Nodes(spec)
    root: DNode | None = None
    stack: list[tuple[int, DNode]] = []
    for line in lines:
        stripped = line.lstrip()
        depth = 0
        while stripped.startswith("-"):
            depth += 1
            stripped = stripped[1:]
        label = stripped.strip()
        if not label:
            spec.warnings.append(f"Etiqueta vacía en árbol: {line!r}")
            continue
        node = nodes.get(label)
        if node is None:
            continue
        if root is None and depth == 0:
            root = node
            stack = [(0, node)]
            continue
        while stack and stack[-1][0] >= depth:
            stack.pop()
        if not stack:
            if root is not None:
                spec.warnings.append(f"Sin padre para '{label}'; se cuelga de la raíz")
                spec.edges.append(DEdge(source=root.id, target=node.id, style="line"))
            else:
                root = node
        else:
            spec.edges.append(DEdge(source=stack[-1][1].id, target=node.id, style="line"))
        stack.append((depth, node))


def _parse_net(lines: list[str], spec: DiagramSpec) -> None:
    nodes = _Nodes(spec)
    for line in lines:
        if "->" in line:
            left, right = line.split("->", 1)
            style = "arrow"
        elif "--" in line:
            left, right = line.split("--", 1)
            style = "line"
        else:
            spec.warnings.append(f"Línea ignorada (sin '--' ni '->'): {line}")
            continue
        src = nodes.get(left)
        dst = nodes.get(right)
        if src and dst:
            spec.edges.append(DEdge(source=src.id, target=dst.id, style=style))


def parse_dsl(kind: str, dsl: str) -> DiagramSpec:
    if kind not in SUPPORTED_KINDS:
        return DiagramSpec(kind=kind, warnings=[f"kind no soportado: {kind}"])
    spec = DiagramSpec(kind=kind)
    lines = _clean_lines(dsl)
    if kind == "flow":
        _parse_flow(lines, spec)
    elif kind == "tree":
        _parse_tree(lines, spec)
    else:
        _parse_net(lines, spec)
    return spec
