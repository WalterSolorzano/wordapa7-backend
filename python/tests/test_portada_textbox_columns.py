"""Carnets y grupo en textboxes SEPARADOS del nombre (portada en columnas).

Bug reportado: en el archivo de estudio del trabajo, el docente va en una
columna a la derecha, intercalado entre los estudiantes. Cada carnet llega en
su propio cuadro de texto y el emparejador lo descartaba: 4 de 5 carnets se
perdian y el grupo tambien.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from parsing.xml_deep_parser import extract_unique_textbox_pairs  # noqa: E402


LINES = [
    "Br. Iv\u00e1n Fernando \u00c1lvarez R\u00edos",
    "Carnet: 2022-0215I",
    "Ing. Juan Carlos Aburto Poveda",
    "Grupo: 3T1 IND",
    "Br. Maynard Dami\u00e1n Orozco Baquedano",
    "Carnet: 2023-0397U",
    "Br. Mar\u00eda del pilar Berm\u00fadez Berm\u00fadez",
    "Carnet: 2023-0451U",
    "Br. Walter Noel Solorzano Gait\u00e1n Carnet: 2023-0432U",
    "Br. Stephani Valeria Castell\u00f3n Borge.",
    "Carnet: 2021-0574I",
]


def test_todos_los_carnets_se_pegan_a_su_estudiante():
    members = extract_unique_textbox_pairs(LINES)
    students = [m for m in members if m.get("role") == "br."]
    assert len(students) == 5, [m.get("name") for m in students]
    ids = {m["name"]: m["id"] for m in students}
    assert ids["Br. Iv\u00e1n Fernando \u00c1lvarez R\u00edos"] == "2022-0215I"
    assert ids["Br. Maynard Dami\u00e1n Orozco Baquedano"] == "2023-0397U"
    assert ids["Br. Mar\u00eda del pilar Berm\u00fadez Berm\u00fadez"] == "2023-0451U"
    assert ids["Br. Walter Noel Solorzano Gait\u00e1n"] == "2023-0432"
    assert ids["Br. Stephani Valeria Castell\u00f3n Borge"] == "2021-0574I"


def test_grupo_se_pega_al_docente():
    members = extract_unique_textbox_pairs(LINES)
    tutores = [m for m in members if m.get("role") == "tutor"]
    assert len(tutores) == 1
    assert tutores[0]["group"] == "3T1 IND"
