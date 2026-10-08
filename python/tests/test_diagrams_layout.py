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
