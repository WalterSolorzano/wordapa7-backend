"""Dedupe de integrantes en textboxes duplicados (bug portada 4x2)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from parsing.xml_deep_parser import extract_unique_textbox_pairs  # noqa: E402


def _lines():
    return [
        "Br. Alexa Marian Dona Hernandez",
        "Carnet: 2021-0251",
        "Br. Lance Andrew Sobalvarro Padilla",
        "Carnet: 2023-0366",
        "Br. Walter Noel Solorzano Gaitan",
        "Carnet: 2023-0432",
        "Br. Wilmary Eunice Diaz Escorcia",
        "Carnet: 2023-0802",
        # Duplicado (Choice+Fallback o shape repetida)
        "Br. Alexa Marian Dona Hernandez",
        "Carnet: 2021-0251",
        "Br. Lance Andrew Sobalvarro Padilla",
        "Carnet: 2023-0366",
        "Br. Walter Noel Solorzano Gaitan",
        "Carnet: 2023-0432",
        "Br. Wilmary Eunice Diaz Escorcia",
        "Carnet: 2023-0802",
    ]


def test_no_duplicate_members():
    members = extract_unique_textbox_pairs(_lines())
    ids = [m.get("id") for m in members if m.get("role") == "br." and m.get("id")]
    assert len(ids) == len(set(ids)), f"carnets duplicados: {ids}"
    assert len([m for m in members if m.get("role") == "br."]) == 4


def test_single_pass_unchanged():
    lines = _lines()[:8]
    members = extract_unique_textbox_pairs(lines)
    assert len([m for m in members if m.get("role") == "br."]) == 4


def test_paragraph_text_excludes_mc_fallback():
    """El párrafo anfitrión de un textbox NO debe doblar el texto de portada.

    Word guarda el contenido del textbox en mc:Choice (DrawingML) y lo repite
    en mc:Fallback (VML legacy). Leer ambas ramas producía el texto doblado y
    sin separadores: "Br. NombreCarnet: 2022-0215IBr. NombreCarnet: ...".
    """
    import io
    import zipfile
    from xml.etree import ElementTree as ET
    from parsing.docx_parser import _extract_paragraph_text_with_footnotes

    W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    MC = "http://schemas.openxmlformats.org/markup-compatibility/2006"
    WPS = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
    V = "urn:schemas-microsoft-com:vml"

    xml = f"""
    <w:p xmlns:w="{W}" xmlns:mc="{MC}" xmlns:wps="{WPS}" xmlns:v="{V}">
      <w:r>
        <mc:AlternateContent>
          <mc:Choice Requires="wps">
            <w:drawing>
              <wps:txbx>
                <w:txbxContent>
                  <w:p><w:r><w:t>Br. Iv\u00e1n Fernando</w:t></w:r></w:p>
                  <w:p><w:r><w:t>Carnet: 2022-0215I</w:t></w:r></w:p>
                </w:txbxContent>
              </wps:txbx>
            </w:drawing>
          </mc:Choice>
          <mc:Fallback>
            <w:pict>
              <v:shape>
                <v:textbox>
                  <w:txbxContent>
                    <w:p><w:r><w:t>Br. Iv\u00e1n Fernando</w:t></w:r></w:p>
                    <w:p><w:r><w:t>Carnet: 2022-0215I</w:t></w:r></w:p>
                  </w:txbxContent>
                </v:textbox>
              </v:shape>
            </w:pict>
          </mc:Fallback>
        </mc:AlternateContent>
      </w:r>
    </w:p>
    """
    p_elem = ET.fromstring(xml)
    text, _ = _extract_paragraph_text_with_footnotes(p_elem)
    assert text.count("Br. Iv\u00e1n Fernando") == 1, f"texto doblado: {text!r}"
    assert text.count("Carnet: 2022-0215I") == 1, f"texto doblado: {text!r}"
