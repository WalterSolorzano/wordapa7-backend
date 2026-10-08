from models import TableModel, CellSpan


def test_table_model_extras_roundtrip():
    t = TableModel(
        element_id="t1",
        headers=["A"],
        rows=[["1"]],
        header_spans=[CellSpan(col=1, row=1)],
        row_spans=[[CellSpan(col=1, row=1)]],
        style="zebra",
        orientation="landscape",
        column_widths=[0.5, 0.5],
    )
    again = TableModel.model_validate(t.model_dump())
    assert again.style == "zebra"
    assert again.orientation == "landscape"
    assert again.column_widths == [0.5, 0.5]
    assert again.header_spans[0].col == 1


def test_table_model_defaults():
    t = TableModel(element_id="t")
    assert t.style is None
    assert t.orientation == "auto"
    assert t.header_spans is None
    assert t.row_spans is None
    assert t.column_widths is None
