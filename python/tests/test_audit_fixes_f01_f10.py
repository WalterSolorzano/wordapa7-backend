"""
Pruebas para verificar las soluciones a los hallazgos F-01 a F-10 de la auditoría.
"""

import docx
from classification.ai_detector import analyze_ai_risk
from docx import Document
from docx.oxml.ns import qn
from generation.image_handler import add_apa_equipment_card
from generation.style_engine import format_heading_paragraph, set_run_font
from generation.table_engine import fit_table_to_page, set_table_borders
from models import APARuleSet, ElementModel, ElementType, ReferenciaModel
from modules.citation_engine import extract_citations_from_text
from modules.portada_uni import generate_uni_cover
from modules.referencias_module import format_apa_referencias_section
from parsing.pre_classifier import pre_classify_elements


def test_f01_f02_f05_portada_uni():
    doc = Document()
    autores = [{"nombre": "Estudiante Prueba", "carnet": "2026-0001U"}]
    p_count = generate_uni_cover(
        doc,
        titulo="Proyecto de Ingeniería",
        asignatura="Termodinámica",
        autores=autores,
        tutor="Ing. Tutor",
        grupo="4T1",
        font_family="Times New Roman",
    )
    assert p_count > 0
    # F-01: Header desvinculado en primera página
    assert doc.sections[0].different_first_page_header_footer is True

    # F-02: cantSplit presente en la tabla de autores
    assert len(doc.tables) >= 1
    authors_table = doc.tables[0]
    for row in authors_table.rows:
        trPr = row._tr.find(qn('w:trPr'))
        assert trPr is not None
        assert trPr.find(qn('w:cantSplit')) is not None


def test_f03_heading_styles_linked():
    doc = Document()
    p = doc.add_paragraph()
    rules = APARuleSet(font_family="Times New Roman", font_size_pt=12)
    format_heading_paragraph(p, 1, "Introducción General", rules)
    # F-03: Debe enlazarse con Heading 1 o Título 1 nativo de Word
    assert p.style is not None
    assert "heading" in p.style.name.lower() or "título" in p.style.name.lower()


def test_f04_equipment_card():
    doc = Document()
    specs = {
        "Fabricante": "Siemens",
        "Modelo": "S7-1200",
        "Potencia": "1.5 kW",
        "Tensión": "220 V",
    }
    rules = APARuleSet(font_family="Times New Roman", font_size_pt=12)
    add_apa_equipment_card(doc, fig_num=1, fig_title="Compresor de Aire", img_path="", specs_dict=specs, rules=rules)
    assert len(doc.tables) >= 1
    # Verifica tabla exterior de ficha técnica
    main_tbl = doc.tables[0]
    assert len(main_tbl.rows) == 1
    assert len(main_tbl.columns) == 2


def test_f06_corporate_bracket_citations_and_references():
    text = "De acuerdo con el (Instituto Nicaragüense de Energía [INE], 2026), las tarifas eléctricas aumentaron."
    citations = extract_citations_from_text(text, element_id="p1")
    assert len(citations) == 1
    # F-06: El autor extraído es el nombre formal limpio sin corchetes
    assert citations[0].authors == ["Instituto Nicaragüense de Energía"]
    assert citations[0].year == "2026"

    # Verificar que en la bibliografía final se limpie cualquier corchete espurio
    doc = Document()
    rules = APARuleSet(font_family="Times New Roman", font_size_pt=12)
    ref = ReferenciaModel(
        id="ref1",
        raw_text="Instituto Nicaragüense de Energía [INE]. (2026). Pliego tarifario 2026.",
        authors=["Instituto Nicaragüense de Energía"],
        year="2026",
    )
    format_apa_referencias_section(doc, [ref], rules)
    full_text = "".join(p.text for p in doc.paragraphs)
    assert "[INE]" not in full_text
    assert "Instituto Nicaragüense de Energía. (2026)" in full_text


def test_f07_pre_classifier_no_heading_on_colon_or_cell():
    elem_colon = ElementModel(
        id="e1",
        text="Resultados del balance energético:",
        is_bold=True,
        font_size=14.0,
        alignment="left",
    )
    elem_cell = ElementModel(
        id="e2",
        text="1.1 Potencia nominal",
        is_bold=True,
        is_table_cell=True,
        alignment="left",
    )
    pre_classify_elements([elem_colon, elem_cell])
    assert elem_colon.type == ElementType.PARAGRAPH
    assert elem_cell.type == ElementType.PARAGRAPH


def test_f08_ai_detector_engineering_domain():
    # Texto de ingeniería con unidades de metrología repetidas (típico balance)
    tech_text = (
        "El compresor opera con una potencia de 15.5 kW consumiendo un total de 450 kWh mensuales a una tensión de 220 V. "
        "La corriente registrada es de 35 A con un factor de potencia de 0.85 y una frecuencia de 60 Hz en el transformador de 50 kVA. "
        "Las mediciones de potencia de este compresor demuestran que el consumo en kWh depende directamente de la tensión."
    )
    res = analyze_ai_risk(tech_text)
    # No debe inflar el riesgo a HIGH por repetición de palabras técnicas
    assert res["score"] < 0.5


def test_f09_table_headers_and_split():
    doc = Document()
    tbl = doc.add_table(rows=3, cols=3)
    rules = APARuleSet(font_family="Times New Roman", font_size_pt=12)
    set_table_borders(tbl, "apa")
    fit_table_to_page(tbl, rules)

    # Verificar tblHeader en la primera fila y cantSplit en todas las filas
    trPr_0 = tbl.rows[0]._tr.find(qn('w:trPr'))
    assert trPr_0.find(qn('w:tblHeader')) is not None
    for row in tbl.rows:
        trPr = row._tr.find(qn('w:trPr'))
        assert trPr.find(qn('w:cantSplit')) is not None


def test_f10_set_run_font_removes_theme_attributes():
    doc = Document()
    p = doc.add_paragraph()
    run = p.add_run("Texto de prueba")
    # Inyectar atributos de tema artificiales
    rPr = run._element.get_or_add_rPr()
    rFonts = docx.oxml.OxmlElement('w:rFonts')
    rFonts.set(qn('w:asciiTheme'), 'majorHAnsi')
    rFonts.set(qn('w:hAnsiTheme'), 'majorHAnsi')
    rPr.append(rFonts)

    set_run_font(run, "Times New Roman", 12.0)
    assert qn('w:asciiTheme') not in rFonts.attrib
    assert qn('w:hAnsiTheme') not in rFonts.attrib
    assert rFonts.get(qn('w:ascii')) == "Times New Roman"
    assert rFonts.get(qn('w:hAnsi')) == "Times New Roman"
