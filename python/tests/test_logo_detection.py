"""Test rápido para verificar la detección de logo de portada."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from models import ElementModel, ElementType, ImageModel
from parsing.pre_classifier import pre_classify_elements

def test_logo_not_numbered_as_figure():
    """El logo de la universidad en la portada NO debe recibir número de figura."""
    elements = [
        # Portada: logo de la universidad
        ElementModel(id="1", text="", type=ElementType.IMAGE,
                     style_name="Normal", alignment="center", font_size=12.0,
                     image_info=ImageModel(element_id="1", file_path="logo.png",
                                           filename="logo.png", figure_number=0)),
        # Texto de portada
        ElementModel(id="2", text="Universidad Nacional Autónoma",
                     style_name="Normal", is_bold=True,
                     alignment="center", font_size=14.0),
        ElementModel(id="3", text="Facultad de Ingeniería",
                     style_name="Normal", is_bold=True,
                     alignment="center", font_size=12.0),
        ElementModel(id="4", text="Tema: Análisis de Sistemas",
                     style_name="Normal", alignment="center", font_size=12.0),
        ElementModel(id="5", text="Elaborado por: Juan Pérez",
                     style_name="Normal", alignment="left", font_size=12.0),
        ElementModel(id="6", text="Docente: María López",
                     style_name="Normal", alignment="left", font_size=12.0),
        # Cuerpo: heading + figura real
        ElementModel(id="7", text="Introducción", style_name="Heading 1",
                     is_bold=True, alignment="center", font_size=16.0),
        ElementModel(id="8", text="Este es el texto de la introducción del trabajo.",
                     style_name="Normal", alignment="left", font_size=12.0),
        ElementModel(id="9", text="", type=ElementType.IMAGE,
                     style_name="Normal", alignment="center", font_size=12.0,
                     image_info=ImageModel(element_id="9", file_path="fig1.png",
                                           filename="fig1.png", figure_number=0)),
        ElementModel(id="10", text="Figura 1. Diagrama del sistema",
                     style_name="Normal", alignment="center", font_size=12.0),
    ]

    result = pre_classify_elements(elements)

    # El logo (elemento 1) debe tener figure_number = 0 (no numerado)
    logo = result[0]
    assert logo.image_info.figure_number == 0, (
        f"Logo debería tener figure_number=0, obtenido {logo.image_info.figure_number}"
    )
    assert logo.is_cover_section == True, (
        f"Logo debería ser is_cover_section=True, obtenido {logo.is_cover_section}"
    )
    print(f"[PASS] Logo detectado: figure_number={logo.image_info.figure_number}, is_cover_section={logo.is_cover_section}")

    # La figura real (elemento 9) debe tener figure_number = 1
    fig = result[8]
    assert fig.image_info.figure_number == 1, (
        f"Figura real debería tener figure_number=1, obtenido {fig.image_info.figure_number}"
    )
    print(f"[PASS] Figura real numerada: figure_number={fig.image_info.figure_number}")

    print("\nAll logo detection tests passed!")


def test_logo_on_page1_detected():
    """Logo en página 1 sin keywords de portada explícitas también se detecta."""
    elements = [
        # Logo en página 1
        ElementModel(id="1", text="", type=ElementType.IMAGE,
                     style_name="Normal", alignment="center", font_size=12.0,
                     page_number=1,
                     image_info=ImageModel(element_id="1", file_path="logo.png",
                                           filename="logo.png", figure_number=0)),
        # Título
        ElementModel(id="2", text="Mi Documento",
                     style_name="Normal", is_bold=True,
                     alignment="center", font_size=18.0),
        # Cuerpo
        ElementModel(id="3", text="1. Introducción", style_name="Heading 1",
                     is_bold=True, alignment="left", font_size=14.0),
        ElementModel(id="4", text="Texto del cuerpo del documento.",
                     style_name="Normal", alignment="left", font_size=12.0),
        # Figura real
        ElementModel(id="5", text="", type=ElementType.IMAGE,
                     style_name="Normal", alignment="center", font_size=12.0,
                     page_number=2,
                     image_info=ImageModel(element_id="5", file_path="fig1.png",
                                           filename="fig1.png", figure_number=0)),
    ]

    result = pre_classify_elements(elements)

    logo = result[0]
    assert logo.image_info.figure_number == 0, (
        f"Logo en página 1 debería tener figure_number=0, obtenido {logo.image_info.figure_number}"
    )
    print(f"[PASS] Logo página 1: figure_number={logo.image_info.figure_number}")

    # La figura en página 2 debería ser Figura 1
    fig = result[4]
    assert fig.image_info.figure_number == 1, (
        f"Figura en página 2 debería tener figure_number=1, obtenido {fig.image_info.figure_number}"
    )
    print(f"[PASS] Figura página 2: figure_number={fig.image_info.figure_number}")

    print("\nPage 1 logo test passed!")


def test_first_image_before_body_heading_is_logo():
    """La primera imagen antes del primer heading de cuerpo es un logo."""
    elements = [
        # Imagen sin context de portada ni página 1
        ElementModel(id="1", text="", type=ElementType.IMAGE,
                     style_name="Normal", alignment="center", font_size=12.0,
                     image_info=ImageModel(element_id="1", file_path="img.png",
                                           filename="img.png", figure_number=0)),
        # Heading de cuerpo
        ElementModel(id="2", text="Introducción", style_name="Heading 1",
                     is_bold=True, alignment="center", font_size=16.0),
        # Párrafo
        ElementModel(id="3", text="Texto del cuerpo.",
                     style_name="Normal", alignment="left", font_size=12.0),
        # Figura real
        ElementModel(id="4", text="", type=ElementType.IMAGE,
                     style_name="Normal", alignment="center", font_size=12.0,
                     image_info=ImageModel(element_id="4", file_path="fig1.png",
                                           filename="fig1.png", figure_number=0)),
    ]

    result = pre_classify_elements(elements)

    # La primera imagen debería ser logo (figure_number=0)
    logo = result[0]
    assert logo.image_info.figure_number == 0, (
        f"Primera imagen antes de body heading debería ser logo (figure_number=0), "
        f"obtenido {logo.image_info.figure_number}"
    )
    print(f"[PASS] Primera imagen antes de body heading: figure_number={logo.image_info.figure_number}")

    # La segunda imagen debería ser Figura 1
    fig = result[3]
    assert fig.image_info.figure_number == 1, (
        f"Segunda imagen debería ser Figura 1, obtenido {fig.image_info.figure_number}"
    )
    print(f"[PASS] Segunda imagen: figure_number={fig.image_info.figure_number}")

    print("\nFirst image before body heading test passed!")


if __name__ == "__main__":
    test_logo_not_numbered_as_figure()
    print()
    test_logo_on_page1_detected()
    print()
    test_first_image_before_body_heading_is_logo()
