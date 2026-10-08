"""El generador OpenAPI->TS produce interfaces para los modelos centrales."""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))

from export_api_types import generate, render_interfaces  # noqa: E402


def test_generates_core_models():
    ts = generate()
    assert "export interface DocumentModel" in ts
    assert "export interface ElementModel" in ts


def test_nullable_fields_use_union():
    sch = {
        "type": "object",
        "properties": {"year": {"anyOf": [{"type": "string"}, {"type": "null"}]}},
        "required": [],
    }
    ts = render_interfaces({"X": sch})
    assert "year?: string | null" in ts


def test_refs_resolve_to_names():
    sch = {
        "type": "object",
        "properties": {"elems": {"type": "array", "items": {"$ref": "#/components/schemas/ElementModel"}}},
        "required": ["elems"],
    }
    ts = render_interfaces({"Y": sch})
    assert "elems: Array<ElementModel>" in ts
