# API de Contenido y Diagramas para IA Externa — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exponer un núcleo de contenido (`python/content/`) y un motor nativo de diagramas (`python/diagrams/`) para que una IA externa construya un `.docx` APA 7 desde un payload semántico compacto, vía REST, MCP y CLI, sin tocar el motor COM existente.

**Architecture:** Un único núcleo puro (`schema` → `builder` → `emit`) consumido por tres superficies finas (router FastAPI, servidor MCP opcional, CLI). Los diagramas se escriben en un DSL propio, se renderizan a PNG con `networkx` + SVG + `PyMuPDF`, y entran al documento como una figura APA normal (`ImageModel` + `format_apa_figure`), nunca como un elemento nuevo. La emisión reusa `generate_apa7_docx` (python-docx) y aplica el post-proceso COM **solo si Word está disponible**.

**Tech Stack:** Python 3.11+, FastAPI, Pydantic, python-docx, networkx, Pillow, PyMuPDF (`fitz`), pytest. Frontend: React 18 + TypeScript + Zustand (solo Task 10).

**Spec:** `docs/superpowers/specs/2026-10-05-api-contenido-diagramas-design.md`

## Global Constraints

- **Cero dependencias nuevas.** Solo se usan deps ya declaradas (`networkx`, `pillow`, `PyMuPDF`). El servidor MCP importa `mcp`/`fastmcp` de forma diferida y **no** se agrega a ningún `requirements.txt`.
- **COM intacto.** No se modifica `get_active_engine`, el guard de `/api/generate`, `apply_inplace`, la paginación/PDF ni el copiloto existente. La emisión nueva llama a COM **solo si** `get_active_engine() == "COM"` y cae al rebuild puro en caso contrario.
- **Cero emojis** en cualquier string de código, mensaje o log. Usar texto plano.
- **Portada protegida.** `use_original_cover=true` no muta la portada; `computePages` la trata como bloque indivisible. El builder nunca escribe sobre la zona de portada.
- **Ámbitos de fase intactos.** No se infiere ámbito de fase por texto de párrafo; no se toca `RULE_SCOPES`.
- **Numeración continua.** Las figuras/tablas se numeran con `modules.captions.scan_existing`, continuando la serie, nunca reiniciando.
- **Terminal en Windows:** `git` directo está roto por el wrapper `snip.exe`; usar `cmd /c git ...` para todos los comandos git.
- **Verificación baseline antes del commit final:** `npx vitest run`, `npx tsc --noEmit`, `pytest -q python/tests/`, `npm run build`.
- **Commits atómicos, archivo por archivo:** `cmd /c git add <archivo>` explícito; **nunca** `git add -A`.
- Tests de Python viven en `python/tests/`; `conftest.py` inserta `python/` en `sys.path`, así que los imports son `from content.schema import ...` y `from diagrams.parser import ...`.

## Review Focus

Estas cinco clases de entrada las implica el spec pero ningún caso feliz las cubre; cada una tiene su test en la tarea que posee el código:

1. **DSL inválido o `kind` desconocido** (`diagram{kind:"sequence"}` en F1, o una línea sin `>`): el build debe devolver el documento con un warning, nunca lanzar.
2. **Caracteres especiales XML en etiquetas** (`&`, `<`, `>`, tildes): el SVG debe escaparse y rasterizar; un `&` crudo rompería el parseo.
3. **Tabla con `rows` pero sin `headers`**: debe construir un `TableModel` válido con `headers=[]` sin romper.
4. **`use_original_cover=true` sin `original.docx`** en la sesión: el builder/emit no debe intentar mutar portada ni fallar; sintetiza.
5. **`content` vacío**: el build debe producir un `DocumentModel` válido con `elements=[]` (la superficie REST decide el 400), sin excepción en el núcleo.

---

### Task 1: Esquema de contenido (`python/content/schema.py`)

**Files:**
- Create: `python/content/__init__.py`
- Create: `python/content/schema.py`
- Test: `python/tests/test_content_schema.py`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `MetaSpec` (pydantic): `title, author, institution, course, date: str = ""`, `apa_format: str = "student"`, `use_original_cover: bool = False`.
  - `TableSpec`: `caption: str = ""`, `note: str | None = None`, `headers: list[str] = []`, `rows: list[list[str]] = []`.
  - `DiagramPayload`: `kind: str = "flow"`, `dsl: str = ""`, `caption: str = ""`, `note: str | None = None`, `style: str = "standard"`, `width_cm: float = 12.0`, `height_cm: float = 8.0`.
  - `ContentItem`: `h1/h2/h3: str | None`, `p: str | None`, `bullets: list[str] | None`, `numbered: list[str] | None`, `cite: str | None`, `table: TableSpec | None`, `diagram: DiagramPayload | None`, `page_break: bool = False`.
  - `ContentDocument`: `meta: MetaSpec`, `content: list[ContentItem]`, `references: list[str]`.
  - `normalize_item(raw: dict) -> ContentItem` — acepta la forma corta (`{"h1": ...}`, `{"p": ...}`, `{"diagram": {...}}`) y la forma larga (`{"type":"heading","level":1,"text":...}`, `{"type":"paragraph","text":...}`, `{"type":"table",...}`, `{"type":"diagram",...}`).
  - `parse_content_document(payload: dict | ContentDocument) -> ContentDocument` — normaliza `content` ítem por ítem.

- [ ] **Step 1: Write the failing test**

```python
# python/tests/test_content_schema.py
from content.schema import parse_content_document


def test_short_form_roundtrip():
    payload = {
        "meta": {"title": "Tesis", "author": "Ana", "use_original_cover": False},
        "content": [
            {"h1": "Método"},
            {"p": "Texto con tilde.", "cite": "(González, 2021)"},
            {"bullets": ["uno", "dos"]},
            {"diagram": {"kind": "flow", "dsl": "Inicio > Fin", "caption": "Flujo"}},
        ],
        "references": ["González, P. (2021). Obra."],
    }
    doc = parse_content_document(payload)
    assert doc.meta.title == "Tesis"
    assert doc.content[0].h1 == "Método"
    assert doc.content[1].cite == "(González, 2021)"
    assert doc.content[3].diagram.kind == "flow"


def test_long_form_is_normalized():
    payload = {
        "content": [
            {"type": "heading", "level": 2, "text": "Sub"},
            {"type": "paragraph", "text": "Cuerpo"},
        ]
    }
    doc = parse_content_document(payload)
    assert doc.content[0].h2 == "Sub"
    assert doc.content[1].p == "Cuerpo"


def test_unknown_key_is_ignored_not_crashing():
    doc = parse_content_document({"content": [{"p": "ok", "zzz": 1}]})
    assert doc.content[0].p == "ok"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python/tests/test_content_schema.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'content'`

- [ ] **Step 3: Write minimal implementation**

```python
# python/content/__init__.py
"""Núcleo de contenido: payload semántico -> DocumentModel -> .docx APA 7."""
```

```python
# python/content/schema.py
from __future__ import annotations

from typing import Optional, Union

from pydantic import BaseModel, ConfigDict, Field


class MetaSpec(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str = ""
    author: str = ""
    institution: str = ""
    course: str = ""
    date: str = ""
    apa_format: str = "student"
    use_original_cover: bool = False


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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest python/tests/test_content_schema.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
cmd /c git add python/content/__init__.py python/content/schema.py python/tests/test_content_schema.py
cmd /c git commit -m "feat(api-contenido): esquema de contenido corto y largo"
```

---

### Task 2: Parser del DSL de diagramas (`python/diagrams/parser.py`)

**Files:**
- Create: `python/diagrams/__init__.py`
- Create: `python/diagrams/parser.py`
- Test: `python/tests/test_diagrams_parser.py`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `SUPPORTED_KINDS: tuple[str, ...] = ("flow", "tree", "net")`.
  - `DNode(id: str, label: str)`, `DEdge(source: str, target: str, label: str | None = None, style: str = "arrow")` (`style` ∈ `{"arrow", "line"}`).
  - `DiagramSpec(kind: str, nodes: list[DNode] = [], edges: list[DEdge] = [], direction: str = "TB", warnings: list[str] = [])`.
  - `parse_dsl(kind: str, dsl: str) -> DiagramSpec`. `kind` desconocido → `DiagramSpec(kind=kind, warnings=["kind no soportado: <kind>"])` sin excepción.

- [ ] **Step 1: Write the failing test**

```python
# python/tests/test_diagrams_parser.py
from diagrams.parser import parse_dsl


def test_flow_with_labeled_edge():
    spec = parse_dsl("flow", "Inicio > Medición\nMedición > ¿Válido?\n¿Válido? >|sí| Análisis")
    labels = [n.label for n in spec.nodes]
    assert labels == ["Inicio", "Medición", "¿Válido?", "Análisis"]
    assert spec.edges[-1].label == "sí"
    assert spec.warnings == []


def test_tree_depth_from_dashes():
    spec = parse_dsl("tree", "Diseño\n- Experimental\n-- Grupo control\n-- Grupo tratado")
    ids = [n.label for n in spec.nodes]
    assert ids[0] == "Diseño"
    assert len(spec.edges) == 3
    assert {e.source for e in spec.edges} == {"Diseño", "Experimental"}


def test_net_directed_and_undirected():
    spec = parse_dsl("net", "A -- B\nB -> C")
    assert spec.edges[0].style == "line"
    assert spec.edges[1].style == "arrow"


def test_unknown_kind_warns_without_crashing():
    spec = parse_dsl("sequence", "A -> B")
    assert spec.nodes == []
    assert spec.warnings


def test_flow_line_without_arrow_warns():
    spec = parse_dsl("flow", "Inicio > Fin\nescombros")
    assert len(spec.edges) == 1
    assert any("escombros" in w for w in spec.warnings)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python/tests/test_diagrams_parser.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'diagrams'`

- [ ] **Step 3: Write minimal implementation**

```python
# python/diagrams/__init__.py
"""Motor nativo de diagramas: DSL -> layout -> SVG/PNG en estilo APA."""
```

```python
# python/diagrams/parser.py
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest python/tests/test_diagrams_parser.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
cmd /c git add python/diagrams/__init__.py python/diagrams/parser.py python/tests/test_diagrams_parser.py
cmd /c git commit -m "feat(diagramas): parser determinista del DSL flow/tree/net"
```

---

### Task 3: Tema y layout (`python/diagrams/themes.py`, `python/diagrams/layout.py`)

**Files:**
- Create: `python/diagrams/themes.py`
- Create: `python/diagrams/layout.py`
- Test: `python/tests/test_diagrams_layout.py`

**Interfaces:**
- Consumes: `DiagramSpec`, `DEdge` de Task 2.
- Produces:
  - `DiagramTheme(font_family="Times New Roman", font_size=11, ink="#111827", paper="#ffffff", stroke_width=1.0, node_fill="#ffffff", node_stroke="#111827", edge_stroke="#111827")`; `APA_THEME: DiagramTheme`.
  - `Layout(positions: dict[str, tuple[float, float]], width: float, height: float, edge_points: list[tuple[float, float, float, float]], warnings: list[str])` — `positions` en coordenadas de canvas (y hacia abajo).
  - `compute_layout(spec: DiagramSpec) -> Layout`. Determinista (sin aleatoriedad).

- [ ] **Step 1: Write the failing test**

```python
# python/tests/test_diagrams_layout.py
from diagrams.parser import parse_dsl
from diagrams.layout import compute_layout


def test_flow_layout_is_deterministic():
    spec = parse_dsl("flow", "A > B\nA > C")
    a = compute_layout(spec)
    b = compute_layout(spec)
    assert a.positions == b.positions
    assert a.width > 0 and a.height > 0
    assert a.positions["A"][0] < a.positions["B"][0]  # A a la izquierda de B


def test_tree_root_on_top():
    spec = parse_dsl("tree", "Raíz\n- Hijo")
    lay = compute_layout(spec)
    assert lay.positions["Raíz"][1] < lay.positions["Hijo"][1]


def test_net_layout_has_all_nodes():
    spec = parse_dsl("net", "A -- B\nB -> C")
    lay = compute_layout(spec)
    assert set(lay.positions) == {"A", "B", "C"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python/tests/test_diagrams_layout.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'diagrams.layout'`

- [ ] **Step 3: Write minimal implementation**

```python
# python/diagrams/themes.py
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
```

```python
# python/diagrams/layout.py
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


def _place_levels(spec: DiagramSpec, levels: list[list[str]]) -> Layout:
    positions: dict[str, tuple[float, float]] = {}
    for col, group in enumerate(levels):
        for row, node_id in enumerate(group):
            positions[node_id] = (col * (NODE_W + GAP_X), row * (NODE_H + GAP_Y))
    max_cols = max((len(g) for g in levels), default=1)
    width = (len(levels) - 1) * (NODE_W + GAP_X) + NODE_W
    height = (max_cols - 1) * (NODE_H + GAP_Y) + NODE_H
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
            lay = _place_levels(spec, layers)
        elif spec.kind == "flow":
            if nx.is_directed_acyclic_graph(g):
                layers = list(nx.topological_generations(g))
            else:
                layers = [[n] for n in g.nodes]
                lay_warn = "ciclo en flow; layout secuencial"
                lay = _place_levels(spec, layers)
                lay.warnings.append(lay_warn)
                lay.edge_points = _edge_points(spec, lay.positions)
                return lay
            lay = _place_levels(spec, layers)
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest python/tests/test_diagrams_layout.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
cmd /c git add python/diagrams/themes.py python/diagrams/layout.py python/tests/test_diagrams_layout.py
cmd /c git commit -m "feat(diagramas): tema APA y layout determinista"
```

---

### Task 4: Render SVG + PNG (`python/diagrams/render.py`)

**Files:**
- Create: `python/diagrams/render.py`
- Test: `python/tests/test_diagrams_render.py`

**Interfaces:**
- Consumes: `parse_dsl` (Task 2), `compute_layout`, `APA_THEME`, `DiagramTheme` (Task 3).
- Produces:
  - `RenderResult(svg: str, png: bytes, width: int, height: int, warnings: list[str])`.
  - `render_diagram(kind: str, dsl: str, theme: DiagramTheme = APA_THEME, dpi: int = 150) -> RenderResult` — nunca lanza por DSL inválido; devuelve PNG aunque no haya nodos.

- [ ] **Step 1: Write the failing test**

```python
# python/tests/test_diagrams_render.py
import xml.etree.ElementTree as ET

from diagrams.render import render_diagram


def test_render_is_deterministic_and_escapes_xml():
    a = render_diagram("flow", "Inicio > Análisis & Cierre")
    b = render_diagram("flow", "Inicio > Análisis & Cierre")
    assert a.svg == b.svg
    ET.fromstring(a.svg)  # no debe romper: el & debe estar escapado
    assert a.png[:8] == b"\x89PNG\r\n\x1a\n"
    assert a.width > 0 and a.height > 0


def test_render_unknown_kind_returns_png_with_warning():
    r = render_diagram("sequence", "A -> B")
    assert r.warnings
    assert r.png[:8] == b"\x89PNG\r\n\x1a\n"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python/tests/test_diagrams_render.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'diagrams.render'`

- [ ] **Step 3: Write minimal implementation**

```python
# python/diagrams/render.py
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest python/tests/test_diagrams_render.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
cmd /c git add python/diagrams/render.py python/tests/test_diagrams_render.py
cmd /c git commit -m "feat(diagramas): render SVG/PNG con PyMuPDF en estilo APA"
```

---

### Task 5: Builder de contenido (`python/content/builder.py`)

**Files:**
- Create: `python/content/builder.py`
- Test: `python/tests/test_content_builder.py`

**Interfaces:**
- Consumes: `parse_content_document`, `ContentDocument` (Task 1); `render_diagram` (Task 4); `models.{DocumentModel, ElementModel, ElementType, ImageModel, TableModel, ReferenciaModel, PortadaData}`; `modules.captions.scan_existing`.
- Produces:
  - `BuildResult(document: DocumentModel, warnings: list[str])`.
  - `build_content_document(payload: dict | ContentDocument, storage_dir: Path, session_id: str | None = None) -> BuildResult`.
  - Reglas: headings → `ElementType.HEADING` con `heading_level`; `p` (+`cite` concatenado) → `PARAGRAPH`; `bullets` → un `BULLET` por ítem; `numbered` → un `NUMBERED_LIST` por ítem; `table` → `TABLE` con `table_info`; `diagram` → `IMAGE` con PNG escrito en `<storage_dir>/sessions/<sid>/images/` y `image_info.design_style=style`; `page_break` → `PAGE_BREAK`. Numeración de figuras/tablas continúa la serie vía `scan_existing`.

- [ ] **Step 1: Write the failing test**

```python
# python/tests/test_content_builder.py
import uuid

from content.builder import build_content_document
from models import ElementType


def _sid():
    return "t" + uuid.uuid4().hex[:8]


def test_builds_elements_and_numbers_figures(tmp_path):
    payload = {
        "meta": {"title": "Informe", "author": "Ana", "institution": "UNI"},
        "content": [
            {"h1": "Método"},
            {"p": "Cuerpo.", "cite": "(Pérez, 2020)"},
            {"diagram": {"kind": "flow", "dsl": "A > B", "caption": "Fases", "style": "scientific"}},
            {"table": {"caption": "Datos", "rows": [["a", "b"]]}},
            {"diagram": {"kind": "tree", "dsl": "R\n- H", "caption": "Árbol"}},
        ],
    }
    result = build_content_document(payload, tmp_path, session_id=_sid())
    doc = result.document
    types = [e.type for e in doc.elements]
    assert types[0] == ElementType.HEADING
    assert types[1] == ElementType.PARAGRAPH
    figs = [e for e in doc.elements if e.type == ElementType.IMAGE]
    assert [f.image_info.figure_number for f in figs] == [1, 2]
    assert figs[0].image_info.design_style == "scientific"
    tbl = next(e for e in doc.elements if e.type == ElementType.TABLE)
    assert tbl.table_info.table_number == 1


def test_empty_content_is_valid(tmp_path):
    result = build_content_document({"content": []}, tmp_path, session_id=_sid())
    assert result.document.elements == []


def test_unknown_kind_warns_but_still_builds(tmp_path):
    result = build_content_document(
        {"content": [{"diagram": {"kind": "sequence", "dsl": "A -> B"}}]},
        tmp_path, session_id=_sid(),
    )
    assert result.warnings
    assert any(e.type == ElementType.IMAGE for e in result.document.elements)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python/tests/test_content_builder.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'content.builder'`

- [ ] **Step 3: Write minimal implementation**

```python
# python/content/builder.py
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Union

from models import (
    DocumentModel,
    ElementModel,
    ElementType,
    ImageModel,
    PortadaData,
    ReferenciaModel,
    TableModel,
)

from content.schema import ContentDocument, ContentItem, parse_content_document
from diagrams.render import render_diagram
from modules.captions import scan_existing


@dataclass
class BuildResult:
    document: DocumentModel
    warnings: list[str] = field(default_factory=list)


def _new_id() -> str:
    import uuid

    return uuid.uuid4().hex


def _collect_existing_texts(doc: DocumentModel) -> list[str]:
    texts = []
    for e in doc.elements:
        if e.text:
            texts.append(e.text)
        if e.type == ElementType.IMAGE and e.image_info and e.image_info.caption:
            texts.append(e.image_info.caption)
        if e.type == ElementType.TABLE and e.table_info and e.table_info.caption:
            texts.append(e.table_info.caption)
    return texts


def _heading(level: int, text: str) -> ElementModel:
    return ElementModel(id=_new_id(), type=ElementType.HEADING, heading_level=level, text=text)


def _paragraph(text: str) -> ElementModel:
    return ElementModel(id=_new_id(), type=ElementType.PARAGRAPH, text=text)


def _diagram_element(item: ContentItem, doc: DocumentModel, images_dir: Path, figure_number: int) -> tuple[ElementModel, list[str]]:
    payload = item.diagram
    warnings: list[str] = []
    result = render_diagram(payload.kind, payload.dsl)
    warnings.extend(result.warnings)
    filename = f"diagrama_{figure_number}_{_new_id()[:8]}.png"
    images_dir.mkdir(parents=True, exist_ok=True)
    file_path = images_dir / filename
    file_path.write_bytes(result.png)
    image = ImageModel(
        element_id="",
        file_path=str(file_path),
        filename=filename,
        relative_url=f"/api/images/{doc.session_id}/{filename}",
        caption=payload.caption,
        note=payload.note,
        figure_number=figure_number,
        design_style=payload.style,
        width_cm=payload.width_cm,
        height_cm=payload.height_cm,
    )
    element = ElementModel(id=_new_id(), type=ElementType.IMAGE, image_info=image)
    image.element_id = element.id
    return element, warnings


def _table_element(item: ContentItem, table_number: int) -> ElementModel:
    payload = item.table
    table = TableModel(
        element_id="",
        headers=list(payload.headers),
        rows=[list(r) for r in payload.rows],
        caption=payload.caption,
        note=payload.note,
        table_number=table_number,
    )
    element = ElementModel(id=_new_id(), type=ElementType.TABLE, table_info=table)
    table.element_id = element.id
    return element


def _references(refs: list[str]) -> list[ReferenciaModel]:
    out = []
    for i, raw in enumerate(refs):
        out.append(ReferenciaModel(id=f"ref-{i + 1}", raw_text=raw, formatted_apa=raw, title=raw))
    return out


def build_content_document(
    payload: Union[dict, ContentDocument],
    storage_dir: Path,
    session_id: Optional[str] = None,
) -> BuildResult:
    spec: ContentDocument = parse_content_document(payload)
    sid = session_id or _new_id()
    images_dir = Path(storage_dir) / "sessions" / sid / "images"

    doc = DocumentModel(
        session_id=sid,
        file_name=(spec.meta.title or "documento") + ".docx",
        elements=[],
    )
    doc.meta.autor = spec.meta.author or None
    doc.portada = PortadaData(
        title=spec.meta.title,
        institution=spec.meta.institution,
        course=spec.meta.course or None,
        date=spec.meta.date or None,
        use_original_cover=spec.meta.use_original_cover,
    ).model_dump()

    warnings: list[str] = []
    counters = scan_existing(_collect_existing_texts(doc))
    figure_number = counters["max_figure"] + 1
    table_number = counters["max_table"] + 1

    for item in spec.content:
        if item.page_break:
            doc.elements.append(ElementModel(id=_new_id(), type=ElementType.PAGE_BREAK))
        if item.h1 is not None:
            doc.elements.append(_heading(1, item.h1))
        if item.h2 is not None:
            doc.elements.append(_heading(2, item.h2))
        if item.h3 is not None:
            doc.elements.append(_heading(3, item.h3))
        if item.p is not None:
            text = item.p if not item.cite else f"{item.p} {item.cite}".strip()
            doc.elements.append(_paragraph(text))
        for b in item.bullets or []:
            doc.elements.append(ElementModel(id=_new_id(), type=ElementType.BULLET, text=b))
        for n in item.numbered or []:
            doc.elements.append(ElementModel(id=_new_id(), type=ElementType.NUMBERED_LIST, text=n))
        if item.table is not None:
            doc.elements.append(_table_element(item, table_number))
            table_number += 1
        if item.diagram is not None:
            element, w = _diagram_element(item, doc, images_dir, figure_number)
            warnings.extend(w)
            doc.elements.append(element)
            figure_number += 1

    doc.referencias = _references(spec.references)
    return BuildResult(document=doc, warnings=warnings)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest python/tests/test_content_builder.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
cmd /c git add python/content/builder.py python/tests/test_content_builder.py
cmd /c git commit -m "feat(api-contenido): builder payload->DocumentModel con figuras y tablas"
```

---

### Task 6: Emisión a `.docx` con COM opcional (`python/content/emit.py`)

**Files:**
- Create: `python/content/emit.py`
- Test: `python/tests/test_content_emit.py`

**Interfaces:**
- Consumes: `generate_apa7_docx` (`python/generation/generator.py:832`); `get_doc_converter` (`python/services/doc_converter.py`); `DocumentModel`, `PortadaData`.
- Produces: `emit_docx(doc: DocumentModel, out_path: Path, try_com: bool = True) -> Path`.
  - Siempre llama `generate_apa7_docx(doc, out_path, doc.apa_rules, portada, doc.referencias)`.
  - Si `try_com` y `get_active_engine() == "COM"`, corre `process_and_convert(generated_path=out_path, final_path=out_path, preserve_cover=False, generate_pdf=False, rules=doc.apa_rules)`; si devuelve `(True, path)`, retorna ese path; si no, retorna `out_path`.
  - `get_active_engine()` lanza `RuntimeError` sin Word: se captura y se retorna `out_path` (nunca propaga).

- [ ] **Step 1: Write the failing test**

```python
# python/tests/test_content_emit.py
import uuid

from content.builder import build_content_document
from content.emit import emit_docx
from docx import Document


def test_emit_produces_openable_docx(tmp_path):
    result = build_content_document(
        {
            "meta": {"title": "Tesis", "use_original_cover": False},
            "content": [
                {"h1": "Método"},
                {"p": "Cuerpo."},
                {"diagram": {"kind": "flow", "dsl": "A > B", "caption": "Fases"}},
            ],
        },
        tmp_path, session_id="e" + uuid.uuid4().hex[:8],
    )
    out = tmp_path / "salida.docx"
    final = emit_docx(result.document, out, try_com=False)
    assert final.exists()
    opened = Document(str(final))
    assert len(opened.paragraphs) > 0


def test_emit_without_word_falls_back(tmp_path):
    result = build_content_document({"content": [{"p": "x"}]}, tmp_path, session_id="f" + uuid.uuid4().hex[:8])
    out = tmp_path / "s.docx"
    final = emit_docx(result.document, out, try_com=True)
    assert final.exists()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python/tests/test_content_emit.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'content.emit'`

- [ ] **Step 3: Write minimal implementation**

```python
# python/content/emit.py
from __future__ import annotations

from pathlib import Path

from models import DocumentModel, PortadaData

from generation.generator import generate_apa7_docx


def _portada(doc: DocumentModel) -> PortadaData:
    data = doc.portada or {}
    valid = {k: v for k, v in data.items() if k in PortadaData.model_fields}
    return PortadaData(**valid)


def emit_docx(doc: DocumentModel, out_path: Path, try_com: bool = True) -> Path:
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    generate_apa7_docx(doc, out_path, doc.apa_rules, _portada(doc), doc.referencias)

    if not try_com:
        return out_path
    try:
        from services.doc_converter import get_doc_converter

        converter = get_doc_converter()
        if converter.get_active_engine() != "COM":
            return out_path
        ok, final = converter.process_and_convert(
            original_path=out_path,
            generated_path=out_path,
            final_path=out_path,
            preserve_cover=False,
            generate_pdf=False,
            rules=doc.apa_rules,
        )
        if ok and final:
            return Path(final)
    except RuntimeError:
        return out_path
    except Exception:
        return out_path
    return out_path
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest python/tests/test_content_emit.py -v`
Expected: PASS (2 passed). Nota: sin Word, `test_emit_without_word_falls_back` toma la rama `RuntimeError`.

- [ ] **Step 5: Commit**

```bash
cmd /c git add python/content/emit.py python/tests/test_content_emit.py
cmd /c git commit -m "feat(api-contenido): emision docx con COM opcional y fallback puro"
```

---

### Task 7: Superficie REST (`python/routers/content.py`)

**Files:**
- Create: `python/routers/content.py`
- Modify: `python/main.py` (import + `include_router`, junto a los otros routers en :239-300)
- Test: `python/tests/test_content_router.py`

**Interfaces:**
- Consumes: `build_content_document` (Task 5), `emit_docx` (Task 6), `save_session_state`, `STORAGE_DIR`, helpers `_write_export_manifest`/`_artifact_url` de `main` (o reimplementados localmente).
- Produces:
  - Router `content_router` con `POST /api/content/build` que recibe un `dict` (el payload), construye, guarda la sesión, emite el `.docx` a `<STORAGE_DIR>/sessions/<sid>/exports/`, y responde `{"session_id", "download_url", "warnings"}`.
  - `400` si `content` está vacío (mensaje `"El payload no tiene contenido."`).

- [ ] **Step 1: Write the failing test**

```python
# python/tests/test_content_router.py
from fastapi.testclient import TestClient

from main import app


def test_build_endpoint_returns_download_url():
    client = TestClient(app)
    payload = {
        "meta": {"title": "Tesis", "use_original_cover": False},
        "content": [{"h1": "Método"}, {"p": "Cuerpo."}],
    }
    res = client.post("/api/content/build", json=payload)
    assert res.status_code == 200
    body = res.json()
    assert body["session_id"]
    assert body["download_url"].startswith("/api/download-artifact/")
    assert body["warnings"] == []


def test_build_endpoint_rejects_empty_content():
    client = TestClient(app)
    res = client.post("/api/content/build", json={"content": []})
    assert res.status_code == 400
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python/tests/test_content_router.py -v`
Expected: FAIL con `404` en `/api/content/build` (endpoint inexistente).

- [ ] **Step 3: Write minimal implementation**

```python
# python/routers/content.py
from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from config import STORAGE_DIR
from content.builder import build_content_document
from content.emit import emit_docx
from persistence.session_manager import save_session_state

router = APIRouter(tags=["content"])


def _write_manifest(session_dir: Path, artifact_id: str, **data: Any) -> None:
    import json

    exports = session_dir / "exports"
    exports.mkdir(parents=True, exist_ok=True)
    (exports / f"{artifact_id}.json").write_text(
        json.dumps({"artifact_id": artifact_id, **data}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


@router.post("/api/content/build")
async def build_content(payload: dict) -> dict:
    if not (payload.get("content") or []):
        raise HTTPException(status_code=400, detail="El payload no tiene contenido.")

    session_id = str(uuid.uuid4())
    result = build_content_document(payload, STORAGE_DIR, session_id=session_id)
    doc = result.document
    save_session_state(doc, STORAGE_DIR)

    session_dir = Path(STORAGE_DIR) / "sessions" / session_id
    artifact_id = uuid.uuid4().hex[:12]
    out_dir = session_dir / "exports"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{artifact_id}_{doc.file_name}"
    final = emit_docx(doc, out_path, try_com=True)

    _write_manifest(
        session_dir,
        artifact_id,
        file_name=doc.file_name,
        source="content.build",
        warnings=result.warnings,
    )
    return {
        "session_id": session_id,
        "download_url": f"/api/download-artifact/{session_id}/{artifact_id}",
        "warnings": result.warnings,
    }
```

En `python/main.py`, agregar junto a los demás routers:

```python
from routers import content as content_router
app.include_router(content_router.router)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest python/tests/test_content_router.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
cmd /c git add python/routers/content.py python/main.py python/tests/test_content_router.py
cmd /c git commit -m "feat(api-contenido): endpoint REST POST /api/content/build"
```

---

### Task 8: CLI (`python/content/__main__.py`)

**Files:**
- Create: `python/content/__main__.py`
- Test: `python/tests/test_content_cli.py`

**Interfaces:**
- Consumes: `build_content_document` (Task 5), `emit_docx` (Task 6).
- Produces: `python -m content payload.json -o salida.docx`, exit code 0 en éxito, 2 si el archivo de entrada no existe, 1 si falla el parseo JSON. Imprime la ruta final.

- [ ] **Step 1: Write the failing test**

```python
# python/tests/test_content_cli.py
import json
import subprocess
import sys
from pathlib import Path

from docx import Document


def test_cli_builds_docx(tmp_path):
    payload_path = tmp_path / "payload.json"
    payload_path.write_text(
        json.dumps({"content": [{"h1": "Método"}, {"p": "Cuerpo."}]}),
        encoding="utf-8",
    )
    out = tmp_path / "out.docx"
    python_dir = Path(__file__).resolve().parents[1]
    res = subprocess.run(
        [sys.executable, "-m", "content", str(payload_path), "-o", str(out)],
        cwd=str(python_dir),
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, res.stderr
    assert out.exists()
    assert len(Document(str(out)).paragraphs) > 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python/tests/test_content_cli.py -v`
Expected: FAIL (returncode != 0, sin módulo `content.__main__`).

- [ ] **Step 3: Write minimal implementation**

```python
# python/content/__main__.py
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from content.builder import build_content_document
from content.emit import emit_docx


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="content", description="Construye un .docx APA 7 desde un payload JSON.")
    parser.add_argument("payload", help="Ruta al JSON de contenido.")
    parser.add_argument("-o", "--output", required=True, help="Ruta del .docx de salida.")
    parser.add_argument("--no-com", action="store_true", help="No usar Word COM aunque esté disponible.")
    args = parser.parse_args(argv)

    payload_path = Path(args.payload)
    if not payload_path.exists():
        print(f"No existe el archivo: {payload_path}", file=sys.stderr)
        return 2
    try:
        payload = json.loads(payload_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"JSON inválido: {exc}", file=sys.stderr)
        return 1

    from config import STORAGE_DIR

    result = build_content_document(payload, STORAGE_DIR)
    for warning in result.warnings:
        print(f"warning: {warning}", file=sys.stderr)
    final = emit_docx(result.document, Path(args.output), try_com=not args.no_com)
    print(str(final))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest python/tests/test_content_cli.py -v`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit**

```bash
cmd /c git add python/content/__main__.py python/tests/test_content_cli.py
cmd /c git commit -m "feat(api-contenido): CLI python -m content build"
```

---

### Task 9: Servidor MCP (`python/mcp_server.py`)

**Files:**
- Create: `python/mcp_server.py`
- Test: `python/tests/test_mcp_server.py`

**Interfaces:**
- Consumes: `ContentDocument`, `parse_content_document` (Task 1), `build_content_document` (Task 5), `render_diagram` (Task 4), `SUPPORTED_KINDS` (Task 2), `config.STORAGE_DIR`.
- Produces:
  - `SCHEMA_HINT: str` — descripción textual del payload y del DSL (lo que la IA externa lee para no gastar tokens).
  - `FIGURES_STYLES: list[str]` — `["standard", "sidebar", "scientific", "corner", "full_width", "multipanel"]`.
  - `content_schema() -> dict` → `{"schema": SCHEMA_HINT, "diagram_kinds": list(SUPPORTED_KINDS), "figure_styles": FIGURES_STYLES}`.
  - `build_document(payload: dict) -> dict` → `{"session_id", "elements": int, "warnings": list}`.
  - `render_diagram_png(kind: str, dsl: str) -> bytes` → PNG.
  - `build_server()` → instancia FastMCP con esas tools; `main()` la corre por stdio.
  - Import diferido: si `mcp`/`fastmcp` no están, `build_server()` lanza `RuntimeError("MCP no instalado")`. Los tests usan `pytest.importorskip`.

- [ ] **Step 1: Write the failing test**

```python
# python/tests/test_mcp_server.py
import pytest

pytest.importorskip("mcp")

from mcp_server import build_document, content_schema, render_diagram_png


def test_content_schema_lists_kinds_and_styles():
    info = content_schema()
    assert "flow" in info["diagram_kinds"]
    assert "scientific" in info["figure_styles"]
    assert "content" in info["schema"]


def test_build_document_tool(tmp_path, monkeypatch):
    import config

    monkeypatch.setattr(config, "STORAGE_DIR", tmp_path)
    out = build_document({"content": [{"h1": "H"}, {"diagram": {"kind": "flow", "dsl": "A > B"}}]})
    assert out["elements"] == 2
    assert out["session_id"]


def test_render_diagram_png_tool():
    png = render_diagram_png("flow", "A > B")
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python/tests/test_mcp_server.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'mcp_server'` (o SKIP si `mcp` no está instalado).

- [ ] **Step 3: Write minimal implementation**

```python
# python/mcp_server.py
from __future__ import annotations

from typing import Any

from config import STORAGE_DIR
from content.builder import build_content_document
from diagrams.parser import SUPPORTED_KINDS
from diagrams.render import render_diagram

FIGURES_STYLES = ["standard", "sidebar", "scientific", "corner", "full_width", "multipanel"]

SCHEMA_HINT = (
    "Payload: {meta:{title,author,institution,course,date,use_original_cover}, "
    "content:[item], references:[str]}. "
    "item corto: {h1|h2|h3, p, cite, bullets:[str], numbered:[str], "
    "table:{caption,note,headers,rows}, diagram:{kind,dsl,caption,note,style,width_cm,height_cm}, page_break}. "
    "DSL: flow 'A > B' y 'A >|etiqueta| B'; tree 'Raíz' luego '- Hijo' y '-- Nieto'; "
    "net 'A -- B' (no dirigido) y 'A -> B' (dirigido)."
)


def content_schema() -> dict[str, Any]:
    return {
        "schema": SCHEMA_HINT,
        "diagram_kinds": list(SUPPORTED_KINDS),
        "figure_styles": FIGURES_STYLES,
    }


def build_document(payload: dict) -> dict[str, Any]:
    result = build_content_document(payload, STORAGE_DIR)
    return {
        "session_id": result.document.session_id,
        "elements": len(result.document.elements),
        "warnings": result.warnings,
    }


def render_diagram_png(kind: str, dsl: str) -> bytes:
    return render_diagram(kind, dsl).png


def build_server():
    try:
        from mcp.server.fastmcp import FastMCP
    except Exception as exc:  # pragma: no cover - entorno sin MCP
        raise RuntimeError("MCP no instalado") from exc

    server = FastMCP("wordapa7-content")

    @server.tool()
    def tool_content_schema() -> dict:
        return content_schema()

    @server.tool()
    def tool_build_document(payload: dict) -> dict:
        return build_document(payload)

    @server.tool()
    def tool_render_diagram(kind: str, dsl: str) -> bytes:
        return render_diagram_png(kind, dsl)

    return server


def main() -> None:
    build_server().run()


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest python/tests/test_mcp_server.py -v`
Expected: PASS (3 passed) si `mcp` está instalado; SKIP en su defecto.

- [ ] **Step 5: Commit**

```bash
cmd /c git add python/mcp_server.py python/tests/test_mcp_server.py
cmd /c git commit -m "feat(api-contenido): servidor MCP con schema, build y render"
```

---

### Task 10: Acción `add_diagram` en el copiloto (backend + frontend)

**Files:**
- Modify: `python/modules/ai_document_editor.py` (SYSTEM_PROMPT y post-proceso de acciones)
- Modify: `python/routers/sessions.py` (nuevo `POST /api/elements/insert-image`)
- Modify: `src/api/backend.ts` (`LiveChatAction` + `insertImageElement`)
- Modify: `src/store/types.ts` y `src/store/slices/documentSlice.ts` (`insertImageElement`)
- Modify: `src/components/chat/DocumentAIChat.tsx` (`applyActions` rama `add_diagram`)
- Test: `python/tests/test_copilot_diagram.py`

**Interfaces:**
- Consumes: `render_diagram` (Task 4), `scan_existing` (`modules.captions`), `process_live_document_chat` (`modules.ai_document_editor`), `insert_element` (`python/routers/sessions.py:815`).
- Produces:
  - Backend: `process_live_document_chat` reconoce en el JSON del LLM una acción `{"type":"add_diagram","diagram":{"kind","dsl","caption","style"},"element_id"?}` y la **resuelve**: renderiza el PNG en `<STORAGE_DIR>/sessions/<sid>/images/`, calcula `figure_number` con `scan_existing`, y reemplaza la acción por `{"type":"add_diagram","element_id":<after o None>,"image":{file_path,filename,relative_url,caption,note,figure_number,design_style,width_cm,height_cm}}`.
  - Backend endpoint `POST /api/elements/insert-image` (request `InsertImageRequest{session_id, after_element_id, new_element_id, image: dict}`) inserta el párrafo físico con imagen inline tras `after_element_id` y el `ElementModel(type=image)` en el modelo; rechaza zona de portada con 400.
  - Frontend: `LiveChatAction` gana `type:'add_diagram'` y `image?: Partial<ImageModel>`; `applyActions` inserta vía store `insertImageElement(afterId, image)`.

- [ ] **Step 1: Write the failing test**

```python
# python/tests/test_copilot_diagram.py
import uuid

from fastapi.testclient import TestClient

from main import app
from models import DocumentModel, ElementModel, ElementType


def _seed_session(tmp_path, monkeypatch, sid):
    import config
    from persistence.session_manager import save_session_state

    monkeypatch.setattr(config, "STORAGE_DIR", tmp_path)
    doc = DocumentModel(session_id=sid, file_name="d.docx")
    doc.elements = [
        ElementModel(id="e1", type=ElementType.PARAGRAPH, text="Intro"),
    ]
    save_session_state(doc, tmp_path)
    return doc


def test_insert_image_endpoint_appends_image_element(tmp_path, monkeypatch):
    sid = "c" + uuid.uuid4().hex[:8]
    _seed_session(tmp_path, monkeypatch, sid)
    client = TestClient(app)
    res = client.post("/api/elements/insert-image", json={
        "session_id": sid,
        "after_element_id": "e1",
        "new_element_id": "img1",
        "image": {"file_path": "x.png", "filename": "x.png", "caption": "Fig", "figure_number": 1},
    })
    assert res.status_code == 200, res.text
    doc = res.json()
    assert doc["elements"][1]["type"] == "image"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python/tests/test_copilot_diagram.py -v`
Expected: FAIL con `404` (endpoint `/api/elements/insert-image` inexistente).

- [ ] **Step 3: Write minimal implementation (backend)**

En `python/routers/sessions.py`, junto a `InsertElementRequest`:

```python
class InsertImageRequest(BaseModel):
    session_id: str
    after_element_id: str
    new_element_id: str
    image: dict
```

Nuevo endpoint después de `insert_element`:

```python
@router.post("/api/elements/insert-image")
async def insert_image_element(req: InsertImageRequest) -> DocumentModel:
    """Inserta una imagen física (párrafo + inline) y su ElementModel tras
    `after_element_id`. Nunca inserta en zona de portada."""
    from docx import Document
    from docx.shared import Cm
    from docx.oxml import OxmlElement
    from docx.text.paragraph import Paragraph
    from models import ImageModel
    from persistence.session_manager import save_session_snapshot

    doc = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")

    idx = next((i for i, e in enumerate(doc.elements) if e.id == req.after_element_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail=f"Elemento '{req.after_element_id}' no encontrado.")
    target = doc.elements[idx]
    if getattr(target, "is_cover_section", False):
        raise HTTPException(status_code=400, detail="No se puede insertar en la portada.")

    image = ImageModel(**{k: v for k, v in req.image.items() if k in ImageModel.model_fields})

    original = STORAGE_DIR / "sessions" / req.session_id / "original.docx"
    if original.exists():
        d = Document(str(original))
        paragraphs = d.paragraphs
        phys = 0
        for i, elem in enumerate(doc.elements):
            if i == idx:
                break
            et = elem.type.value if hasattr(elem.type, "value") else str(elem.type)
            if et in ("paragraph", "heading", "bullet", "numbered_list", "portada_block"):
                phys += 1
        if phys < len(paragraphs):
            src = paragraphs[phys]
            new_p = OxmlElement("w:p")
            src._p.addnext(new_p)
            new_para = Paragraph(new_p, src._parent)
            new_para.style = src.style
            try:
                if image.file_path:
                    new_para.add_run().add_picture(image.file_path, width=Cm(image.width_cm or 12.0))
            except Exception:
                new_para.add_run("[imagen]")
            d.save(str(original))

    element = ElementModel(
        id=req.new_element_id,
        type=ElementType.IMAGE,
        image_info=image,
        is_user_modified=True,
        confidence=1.0,
    )
    image.element_id = element.id
    doc.elements.insert(idx + 1, element)
    save_session_snapshot(doc, STORAGE_DIR)
    save_session_state(doc, STORAGE_DIR)
    return doc
```

En `python/modules/ai_document_editor.py`:
1. Agregar a `SYSTEM_PROMPT` la acción `add_diagram` con el DSL (una línea por regla, kinds `flow|tree|net`).
2. En `process_live_document_chat`, tras parsear `result`, resolver las acciones `add_diagram`:

```python
def _resolve_diagram_actions(document, result, storage_dir):
    from diagrams.render import render_diagram
    from modules.captions import scan_existing

    texts = []
    for e in document.elements:
        if e.text:
            texts.append(e.text)
        if e.image_info and e.image_info.caption:
            texts.append(e.image_info.caption)
        if e.table_info and e.table_info.caption:
            texts.append(e.table_info.caption)
    figure_number = scan_existing(texts)["max_figure"] + 1

    for action in result.get("actions", []):
        if action.get("type") != "add_diagram":
            continue
        spec = action.get("diagram") or {}
        rendered = render_diagram(spec.get("kind", "flow"), spec.get("dsl", ""))
        filename = f"diagrama_{figure_number}_{document.session_id[:8]}.png"
        images_dir = storage_dir / "sessions" / document.session_id / "images"
        images_dir.mkdir(parents=True, exist_ok=True)
        (images_dir / filename).write_bytes(rendered.png)
        action.pop("diagram", None)
        action["image"] = {
            "file_path": str(images_dir / filename),
            "filename": filename,
            "relative_url": f"/api/images/{document.session_id}/{filename}",
            "caption": spec.get("caption", ""),
            "note": spec.get("note"),
            "figure_number": figure_number,
            "design_style": spec.get("style", "standard"),
            "width_cm": spec.get("width_cm", 12.0),
            "height_cm": spec.get("height_cm", 8.0),
        }
        figure_number += 1
    return result
```

Llamarla desde `process_live_document_chat` antes del `return`, con `storage_dir` importado de `config`. El `_deterministic_chat_fallback` no fabrica diagramas: si la instrucción menciona un diagrama y no hay LLM, devuelve un `reply` que pide el DSL (sin acción).

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest python/tests/test_copilot_diagram.py -v`
Expected: PASS (1 passed)

- [ ] **Step 5: Frontend — tipos y API**

En `src/api/backend.ts`, extender `LiveChatAction`:

```ts
  | 'add_diagram';
  /** Task 10 — imagen ya renderizada por el backend. */
  image?: Partial<import('../types').ImageModel>;
```

Y agregar:

```ts
export async function insertImageElement(
  sessionId: string,
  afterElementId: string,
  newElementId: string,
  image: Partial<import('../types').ImageModel>,
): Promise<DocumentModel> {
  const res = await fetchWithTrace(`${getApiBase()}/elements/insert-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      after_element_id: afterElementId,
      new_element_id: newElementId,
      image,
    }),
  });
  if (!res.ok) throw new Error('Error al insertar la figura');
  return res.json();
}
```

- [ ] **Step 6: Frontend — store**

En `src/store/types.ts`:

```ts
  /** Task 10 — inserta una figura ya renderizada tras `afterId`. */
  insertImageElement: (afterId: string, image: Partial<import('../types').ImageModel>) => Promise<void>;
```

En `src/store/slices/documentSlice.ts`, junto a `splitParagraphAt`:

```ts
  insertImageElement: async (afterId, image) => {
    const { doc, pushHistory } = get();
    if (!doc) return;
    const c = globalThis.crypto as Crypto | undefined;
    const newId = c && typeof c.randomUUID === 'function'
      ? c.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
    try {
      const updated = await api.insertImageElement(doc.session_id, afterId, newId, image);
      pushHistory(updated);
      set({ doc: updated });
    } catch (err: any) {
      get().showToast(err?.message || 'Error al insertar la figura', 'error');
    }
  },
```

- [ ] **Step 7: Frontend — aplicar la acción del copiloto**

En `src/components/chat/DocumentAIChat.tsx`, dentro de `applyActions`, antes del cierre del bucle:

```ts
    } else if (a.type === 'add_diagram' && a.image) {
      const afterId = a.element_id
        || doc?.elements[doc.elements.length - 1]?.id;
      if (afterId) {
        await get().insertImageElement(afterId, a.image);
      }
    }
```

- [ ] **Step 8: Verificación frontend**

Run: `npx tsc --noEmit`
Expected: sin errores.
Run: `npx vitest run src/__tests__/splitParagraphAt.test.ts`
Expected: PASS (no se rompió el patrón de inserción).

- [ ] **Step 9: Commit**

```bash
cmd /c git add python/modules/ai_document_editor.py python/routers/sessions.py python/tests/test_copilot_diagram.py
cmd /c git commit -m "feat(copiloto): accion add_diagram con render en backend"
cmd /c git add src/api/backend.ts src/store/types.ts src/store/slices/documentSlice.ts src/components/chat/DocumentAIChat.tsx
cmd /c git commit -m "feat(copiloto): insertar figura renderizada desde el chat"
```

---

## Verificación final (antes del commit de cierre)

- [ ] `pytest -q python/tests/` — toda la suite en verde (los 14 tests COM siguen skipped sin Word).
- [ ] `npx tsc --noEmit` — sin errores.
- [ ] `npx vitest run` — sin regresiones.
- [ ] `npm run build` — build de producción OK.
- [ ] Prueba manual REST: `curl -X POST localhost:8742/api/content/build -H "Content-Type: application/json" -d @payload.json` y abrir el `download_url`; verificar `Figura 1` y el PNG del diagrama embebido.
- [ ] Prueba manual CLI: `python -m content payload.json -o salida.docx` (desde `python/`) y abrir el `.docx`.
- [ ] Confirmar que `/api/generate`, la edición in-place y el copiloto existente siguen intactos (COM sin cambios).

## Self-Review (completado)

- **Cobertura del spec:** §1-§5 → Tasks 1-6; §6 DSL → Task 2; superficies REST/MCP/CLI → Tasks 7/9/8; §7 WS7 copiloto → Task 10; §10 F1 (flow+tree+net) cubierto. F2-F4 (sequence/timeline/charts/Mermaid) quedan fuera por diseño.
- **Placeholders:** ninguno; cada paso trae código o comando real.
- **Consistencia de tipos:** `DiagramSpec`/`DNode`/`DEdge` (Task 2) usados igual en Tasks 3-4; `BuildResult`/`build_content_document` (Task 5) igual en Tasks 6-9; `render_diagram` (Task 4) igual en Tasks 5 y 10; `LiveChatAction`/`insertImageElement` coherentes en Task 10.
- **Review Focus:** los 5 casos (DSL inválido, XML especial, tabla sin headers, `use_original_cover` sin original, `content` vacío) tienen test en las tareas que poseen el código (Tasks 4/2, 4, 5, 5/6, 1/5/7).
