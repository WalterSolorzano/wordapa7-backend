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
