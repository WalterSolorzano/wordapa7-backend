from models import ElementType

from parsing.clustering_classifier import _demasiado_largo_para_heading
from parsing.pre_classifier import pre_classify_elements, _debe_degradar_heading


def test_heading_largo_por_heuristica_se_degrada_aunque_tenga_estilo(make_element):
    texto = (
        "Se describe el proceso productivo completo de la empresa y sus "
        "etapas principales dentro de la planta de producción actual."
    ) * 2
    elem = make_element(
        elem_id="1", text=texto, elem_type=ElementType.HEADING, heading_level=4,
        style_name="Normal", is_bold=False,
    )
    result = pre_classify_elements([elem])
    assert result[0].type == ElementType.PARAGRAPH


def test_guard_clustering_largo():
    assert _demasiado_largo_para_heading("palabra " * 25) is True
    assert _demasiado_largo_para_heading("Diseño de investigación aplicada") is False


def test_guard_clustering_multi_oracion():
    assert _demasiado_largo_para_heading("Se observó el proceso. Además reduce costos.") is True


def test_degradar_heading_corto_multi_oracion_con_estilo():
    """Un párrafo corto (<25 palabras) con varias oraciones y `style_name`
    ('Normal' es el estilo por defecto de todo cuerpo) NO es un título: la
    heurística de bajo score tiene que degradarlo igual. Antes solo se degradaba
    si el texto pasaba de 25 palabras, así que la señal multi-oración no
    alcanzaba a un heading corto."""
    assert _debe_degradar_heading("El proceso mejora. La planta reduce costos.", "Normal") is True


def test_no_degradar_heading_corto_de_una_oracion_con_estilo():
    """Contraprueba: un heading corto de una sola oración con estilo no se
    degrada solo por tener estilo."""
    assert _debe_degradar_heading("Diseño de investigación aplicada", "Normal") is False


def test_degradar_heading_largo_aunque_tenga_estilo():
    texto = " ".join(["palabra"] * 30)
    assert _debe_degradar_heading(texto, "Normal") is True
