"""Notación de numeración de títulos por nivel.

El dominio de `heading_numbering_style_lvlN` se amplía a romanos en ambas cajas
y letras en ambas cajas, y la notación elegida se aplica al componente DEL PROPIO
NIVEL (H1 y H2), no solo al H1. El padre jerárquico de un H2 se mantiene decimal
para no perder la lectura "2.5" cuando el hijo va en romano.
"""

from generation.generator import _build_heading_prefix


def test_h1_romano_mayuscula():
    counters = {1: 3, 2: 0}
    assert _build_heading_prefix(counters, 1, "upperRoman") == "III. "


def test_h1_romano_minuscula():
    counters = {1: 3, 2: 0}
    assert _build_heading_prefix(counters, 1, "lowerRoman") == "iii. "


def test_h1_letra_mayuscula():
    counters = {1: 2, 2: 0}
    assert _build_heading_prefix(counters, 1, "upperLetter") == "B. "


def test_h1_letra_minuscula():
    counters = {1: 2, 2: 0}
    assert _build_heading_prefix(counters, 1, "lowerLetter") == "b. "


def test_estilo_roman_legacy_sigue_funcionando():
    counters = {1: 4, 2: 0}
    assert _build_heading_prefix(counters, 1, "roman") == "IV. "


def test_h2_hereda_decimal_jerarquico():
    counters = {1: 2, 2: 5}
    assert _build_heading_prefix(counters, 2, "decimal") == "2.5. "


def test_h2_romano_ya_no_es_arabigo_forzado():
    """El defecto viejo: en H2 el estilo se ignoraba y siempre salía arábigo."""
    counters = {1: 2, 2: 5}
    assert _build_heading_prefix(counters, 2, "upperRoman") == "2.V. "


def test_h2_letra_se_aplica_al_hijo_y_no_al_padre():
    counters = {1: 3, 2: 2}
    assert _build_heading_prefix(counters, 2, "lowerLetter") == "3.b. "


def test_none_no_numera():
    assert _build_heading_prefix({1: 1, 2: 0}, 1, "none") == ""


def test_h3_no_lleva_numeracion():
    assert _build_heading_prefix({1: 1, 2: 1, 3: 1}, 3, "decimal") == ""


def test_h2_sin_padre_no_inventa_cero():
    assert _build_heading_prefix({1: 0, 2: 1}, 2, "decimal") == ""


# --- Issue 3 de la revisión: la elección explícita no se pisa con la detección ---


def test_eleccion_explicita_gana_a_deteccion_romana():
    """Un H1 que ya dice «IV.» no debe forzar romano si el usuario eligió letras."""
    from generation.generator import _resolver_estilo_de_nivel

    assert _resolver_estilo_de_nivel(1, "upperLetter", "IV. Metodología") == "upperLetter"


def test_deteccion_romana_aplica_solo_en_el_default_ambiguo():
    """Con el nivel en el valor por defecto (decimal), el texto romano se respeta."""
    from generation.generator import _resolver_estilo_de_nivel

    assert _resolver_estilo_de_nivel(1, "decimal", "IV. Metodología") == "roman"


def test_marcador_explicito_gana_siempre():
    from generation.generator import _resolver_estilo_de_nivel

    assert _resolver_estilo_de_nivel(1, "upperLetter", "[ROMAN] Metodología") == "roman"


def test_resolver_no_toca_niveles_mas_profundos():
    from generation.generator import _resolver_estilo_de_nivel

    assert _resolver_estilo_de_nivel(2, "lowerLetter", "IV. Algo") == "lowerLetter"
