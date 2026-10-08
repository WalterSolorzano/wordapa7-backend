from parsing.pre_classifier import _contiene_multiples_oraciones


def test_detecta_dos_oraciones():
    assert _contiene_multiples_oraciones("Se observó el proceso. Además reduce costos.") is True


def test_acronimo_con_puntos_no_es_multi_oracion():
    assert _contiene_multiples_oraciones("Aplicación del Método S.C.E.M.") is False


def test_una_sola_oracion_no_es_multi():
    assert _contiene_multiples_oraciones("Diseño de investigación aplicada.") is False


def test_texto_vacio():
    assert _contiene_multiples_oraciones("") is False
