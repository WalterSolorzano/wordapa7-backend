"""
Test: El texto de un párrafo no duplica autores por la rama mc:Fallback
de textboxes (Choice + Fallback en AlternateContent).
"""
import sys
import pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from xml.etree import ElementTree as ET


W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006'


def _docx_xml_with_doubled_textbox() -> str:
    return f'''<w:document xmlns:w="{W}" xmlns:mc="{MC}" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:v="urn:schemas-microsoft-com:vml"><w:body>
      <w:p><w:r><w:t>Portada</w:t></w:r></w:p>
      <w:p><mc:AlternateContent>
        <mc:Choice Requires="wps"><w:drawing><wps:wsp><wps:txbx><w:txbxContent><w:p><w:r><w:t>Br. Ivan Alvarez</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp></w:drawing></mc:Choice>
        <mc:Fallback><w:pict><v:shape><v:textbox><w:txbxContent><w:p><w:r><w:t>Br. Ivan Alvarez</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></mc:Fallback>
      </mc:AlternateContent></w:p>
    </w:body></w:document>'''


def test_paragraph_text_not_doubled_by_fallback():
    """El texto del autor NO debe aparecer 2 veces (Choice+Fallback)."""
    from parsing.docx_parser import _extract_paragraph_text_with_footnotes
    root = ET.fromstring(_docx_xml_with_doubled_textbox().encode('utf-8'))
    # El segundo w:p tiene el AlternateContent
    paras = [c for c in root.find(f'{{{W}}}body') if c.tag == f'{{{W}}}p']
    text, _ = _extract_paragraph_text_with_footnotes(paras[1])
    assert text.count('Br. Ivan Alvarez') == 1, f'Esperado 1 vez, got {text.count("Br. Ivan Alvarez")}'
