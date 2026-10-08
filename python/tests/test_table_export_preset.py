from generation.table_engine import borde_de_preset, borde_efectivo


def test_borde_de_preset():
    assert borde_de_preset("apa") == "apa"
    assert borde_de_preset("compact") == "apa"
    assert borde_de_preset("expanded") == "apa"
    assert borde_de_preset("grid") == "grid"
    assert borde_de_preset("zebra") == "grid"
    assert borde_de_preset(None) == "apa"


def test_borde_efectivo_cae_al_rule_global_sin_estilo():
    # Sin estilo elegido, el borde respeta la regla global (perfil GRID).
    assert borde_efectivo(None, "grid") == "grid"
    assert borde_efectivo(None, "apa") == "apa"
    assert borde_efectivo(None, None) == "apa"
    # Con estilo elegido, el estilo del modelo manda.
    assert borde_efectivo("grid", "apa") == "grid"
    assert borde_efectivo("apa", "grid") == "apa"
