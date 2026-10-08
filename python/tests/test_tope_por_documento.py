"""Tope de llamadas por documento (D10-bis).

Un documento de 300 parrafos con RPM 10-30 haria inviable llamar por parrafo.
El tope corta y se reporta cuantos elementos quedaron sin verificar.
"""

from modules.proactive_auditor import TopeDeLlamadas


def test_tope_corta_y_reporta():
    tope = TopeDeLlamadas(maximo=3)
    permitidas = [tope.permitir() for _ in range(5)]
    assert permitidas == [True, True, True, False, False]
    assert tope.sin_verificar == 2
    assert tope.usadas == 3


def test_sin_tope_configurado_no_corta():
    tope = TopeDeLlamadas(maximo=0)  # 0 = ilimitado
    assert all(tope.permitir() for _ in range(100))
    assert tope.sin_verificar == 0
