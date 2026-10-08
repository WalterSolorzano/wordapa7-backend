"""Tests de validación y expansión del DSL spec -> modelo interno."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from pydantic import ValidationError
from spec_dsl import SpecDocument


def _minimal(**over):
    base = {
        "spec_version": "1",
        "elements": [{"type": "heading", "level": 1, "text": "1. Intro"},
                     {"type": "paragraph", "text": "Cuerpo."}],
    }
    base.update(over)
    return base


def test_minimal_spec_parses():
    spec = SpecDocument.model_validate(_minimal())
    assert spec.spec_version == "1" and len(spec.elements) == 2


def test_unknown_version_rejected():
    with pytest.raises(ValidationError):
        SpecDocument.model_validate(_minimal(spec_version="2"))


def test_data_uri_rejected():
    bad = _minimal(elements=[{"type": "figure", "image": "data:image/png;base64,AAA",
                              "caption": "Figura 1", "title": "T"}])
    with pytest.raises(ValidationError):
        SpecDocument.model_validate(bad)


def test_too_many_elements_rejected():
    elems = [{"type": "paragraph", "text": "x"} for _ in range(201)]
    with pytest.raises(ValidationError):
        SpecDocument.model_validate(_minimal(elements=elems))


def test_too_many_rows_rejected():
    table = {"type": "table", "caption": "Tabla 1", "title": "T",
             "columns": ["a"], "rows": [["1"] for _ in range(501)]}
    with pytest.raises(ValidationError):
        SpecDocument.model_validate(_minimal(elements=[table]))


def test_text_over_limit_rejected():
    with pytest.raises(ValidationError):
        SpecDocument.model_validate(
            _minimal(elements=[{"type": "paragraph", "text": "x" * 4097}]))


def test_heading_level_bounds():
    with pytest.raises(ValidationError):
        SpecDocument.model_validate(
            _minimal(elements=[{"type": "heading", "level": 6, "text": "x"}]))


def test_equipment_card_parses():
    spec = SpecDocument.model_validate(_minimal(elements=[
        {"type": "equipment_card", "number": "A1", "title": "Refrigerador",
         "image": "C:/fotos/refri.jpg", "specs": {"Potencia": "120 W"}}]))
    assert spec.elements[0].type == "equipment_card"


# ── Expansión DSL -> ElementModel + reglas ───────────────────────────────────

import asyncio  # noqa: E402

from models import ElementType, TableBorderStyle  # noqa: E402
from preset_store import LayoutPresetDef, TablePresetDef  # noqa: E402
from spec_dsl import expand_spec, sanitize_filename  # noqa: E402


@pytest.fixture
def storage(tmp_path):
    (tmp_path / "presets").mkdir()
    return tmp_path


def _expand(spec, storage, **presets):
    kw = dict(table_def=None, layout_def=None, heading_def=None,
              storage_dir=storage)
    kw.update(presets)
    return asyncio.run(expand_spec(spec, **kw))


def test_filename_traversal_sanitized():
    assert sanitize_filename("../../evil.docx") == "evil.docx"
    assert sanitize_filename("C:\\temp\\x") == "x.docx"
    assert sanitize_filename("ok") == "ok.docx"


def test_expand_heading_and_paragraph(storage):
    spec = SpecDocument.model_validate(_minimal())
    res = _expand(spec, storage)
    assert res.elements[0].type == ElementType.HEADING
    assert res.elements[0].heading_level == 1
    assert res.elements[1].type == ElementType.PARAGRAPH
    assert res.filename == "documento_apa.docx"


def test_expand_table_number_from_caption(storage):
    spec = SpecDocument.model_validate(_minimal(elements=[
        {"type": "table", "caption": "Tabla 2", "title": "Hist",
         "columns": ["Mes", "kWh"], "rows": [["Ene", "133"]],
         "note": "Nota. Elaboracion propia."}]))
    res = _expand(spec, storage)
    tbl = res.elements[0].table_info
    assert tbl.table_number == 2
    assert tbl.headers == ["Mes", "kWh"]
    assert tbl.note.startswith("Nota.")


def test_layout_preset_merges_into_rules(storage):
    spec = SpecDocument.model_validate(_minimal())
    res = _expand(spec, storage,
                  layout_def=LayoutPresetDef(margins_cm=3.0, line_spacing=1.5))
    assert res.rules.margins_cm == 3.0
    assert res.rules.line_spacing == 1.5
    assert res.rules.font_family == "Times New Roman"  # default intacto


def test_table_preset_merges_into_rules(storage):
    spec = SpecDocument.model_validate(_minimal())
    res = _expand(spec, storage, table_def=TablePresetDef(border_style="grid"))
    assert res.rules.table_border_style == TableBorderStyle.GRID
    assert res.rules.table_label_prefix == "Tabla"


def test_missing_image_warns_and_skips(storage):
    spec = SpecDocument.model_validate(_minimal(elements=[
        {"type": "figure", "image": "C:/no_existe/nada.png",
         "caption": "Figura 1", "title": "T"}]))
    res = _expand(spec, storage)
    assert res.elements == []
    assert any("imagen" in w.lower() for w in res.warnings)


def test_equipment_card_collected_not_element(storage, tmp_path):
    img = tmp_path / "refri.jpg"
    img.write_bytes(b"\xff\xd8\xff")          # archivo real (ruta local)
    spec = SpecDocument.model_validate(_minimal(elements=[
        {"type": "equipment_card", "number": "A1", "title": "Refrigerador",
         "image": str(img), "specs": {"Potencia": "120 W"}}]))
    res = _expand(spec, storage)
    assert res.elements == []                  # no entra al loop del motor
    assert len(res.equipment_cards) == 1
    assert res.equipment_cards[0].number == "A1"


def test_doi_without_resolve_warns(storage):
    spec = SpecDocument.model_validate(_minimal(elements=[
        {"type": "references", "items": [{"doi": "10.1000/xyz"}]}]))
    res = _expand(spec, storage)
    assert res.references == []
    assert len(res.warnings) >= 1


def test_figure_number_from_caption(storage, tmp_path):
    """Issue #13: 'Figura 3' del agente fija figure_number, no se ignora."""
    img = tmp_path / "a.png"
    img.write_bytes(b"\x89PNG")
    spec = SpecDocument.model_validate(_minimal(elements=[
        {"type": "figure", "image": str(img),
         "caption": "Figura 3", "title": "Grafico"}]))
    res = _expand(spec, storage)
    assert res.elements[0].image_info.figure_number == 3
    assert res.elements[0].image_info.caption == "Grafico"
