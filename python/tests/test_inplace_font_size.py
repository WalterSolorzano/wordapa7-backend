"""In-place editor debe leer font_size_pt (models.APARuleSet), no font_size.

Bug: inplace_editor.py leía getattr(rules, "font_size", 12) — campo
inexistente en APARuleSet — así que la ruta in-place siempre aplicaba 12pt.
"""
import inspect

from generation import inplace_editor
from models import APARuleSet


def test_rules_field_is_font_size_pt():
    r = APARuleSet(profile_name="student")
    assert hasattr(r, "font_size_pt")
    assert not hasattr(r, "font_size")


def test_inplace_reads_font_size_pt():
    src = inspect.getsource(inplace_editor)
    assert 'getattr(rules, "font_size_pt"' in src
    assert 'getattr(rules, "font_size"' not in src
