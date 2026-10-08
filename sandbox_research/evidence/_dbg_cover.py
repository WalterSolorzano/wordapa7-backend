import io, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "python"))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from tests.test_cover_protection_roundtrip import _variant_plaintext, _variant_table_first, _variant_textbox, _zone
from modules.scoped_apply import apply_scopes

for name, fn, n in (("plaintext", _variant_plaintext, 3), ("table_first", _variant_table_first, 2), ("textbox", _variant_textbox, 2)):
    raw = fn()
    out, summary = apply_scopes(raw, ["texto", "tablas_imagenes"], {})
    ok = _zone(raw, out, n)
    print(name, "zone_ok:", ok, "| guard:", summary.get("cover_guard"), "| tablas:", summary.get("tablas"))
    if not ok:
        from tests.test_cover_protection_roundtrip import _c14n_children
        b = _c14n_children(raw); a = _c14n_children(out)
        for i in range(n):
            if b[i] != a[i]:
                print("  idx", i, "\n   B:", b[i][:150], "\n   A:", a[i][:150])
