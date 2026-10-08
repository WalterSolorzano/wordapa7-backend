"""Posición horizontal de los cuadros de texto de portada (columnas reales).

Bug reportado: en el archivo de estudio del trabajo el docente va en una columna
a la DERECHA, pero el lienzo lo reubica centrado abajo. El parser no guardaba la
posición horizontal del cuadro de texto, así que el render no podía reconstruir
las columnas. `_textbox_anchor_pos_h` lee `wp:positionH/wp:posOffset` (EMU) del
ancla que contiene el `txbxContent`.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lxml import etree  # noqa: E402

from parsing.docx_parser import _textbox_anchor_pos_h  # noqa: E402


_NS = (
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
    'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" '
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
)


def _p(inner: str):
    return etree.fromstring(f'<w:p {_NS}>{inner}</w:p>')


def test_lee_offset_horizontal_del_textbox():
    xml = (
        '<w:r><w:drawing><wp:anchor>'
        '<wp:positionH relativeFrom="column"><wp:posOffset>4442460</wp:posOffset></wp:positionH>'
        '<wps:txbx><w:txbxContent><w:p><w:r><w:t>Ing. Juan Carlos Aburto Poveda</w:t></w:r></w:p></w:txbxContent></wps:txbx>'
        '</wp:anchor></w:drawing></w:r>'
    )
    assert _textbox_anchor_pos_h(_p(xml)) == "4442460"


def test_ignora_ancla_de_imagen_sin_textbox():
    xml = (
        '<w:r><w:drawing><wp:anchor>'
        '<wp:positionH relativeFrom="column"><wp:posOffset>100</wp:posOffset></wp:positionH>'
        '</wp:anchor></w:drawing></w:r>'
    )
    assert _textbox_anchor_pos_h(_p(xml)) is None


def test_parrafo_sin_ancla_devuelve_none():
    assert _textbox_anchor_pos_h(_p('<w:r><w:t>x</w:t></w:r>')) is None
