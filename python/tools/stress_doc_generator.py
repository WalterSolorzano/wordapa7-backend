"""
DocxStressLab: Generador programático de documentos Word (.docx) con casos de estrés APA 7.
Crea archivos de prueba con citas complejas, tablas, figuras, encabezados desordenados
y portadas de prueba para calibrar y verificar la robustez del motor WordAPA7.
"""

import os
from pathlib import Path
from typing import Dict, Any
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT

OUTPUT_DIR = Path("storage/test_samples")

def ensure_output_dir() -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    return OUTPUT_DIR

def generate_stress_citations_doc() -> str:
    """Genera documento con casos límite de citas y bibliografía:
    - Citas parentéticas estándar: (González, 2021)
    - Citas narrativas: Según Martínez y López (2020)...
    - Citas de 3 o más autores: (Rodríguez et al., 2019)
    - Citas institucionales: (Organización Mundial de la Salud [OMS], 2022) / (OMS, 2022)
    - Citas secundarias: (Smith, 2015, como se citó en Pérez, 2020)
    - Citas sin fecha: (García, s.f.)
    - Citas directas cortas y en bloque (>40 palabras)
    - Cita fantasma: (Alonso & Vargas, 2018) -> NO tiene entrada en Referencias
    - Referencia huérfana: Gómez, R. (2019) -> NO está citada en el texto
    """
    doc = Document()
    doc.add_heading("Investigación sobre Impacto de la Inteligencia Artificial", level=1)

    # Párrafo 1: Citas estándar y narrativa
    doc.add_paragraph(
        "El desarrollo tecnológico en el siglo XXI ha transformado los métodos educativos. "
        "Según Martínez y López (2020), la integración de herramientas inteligentes optimiza "
        "el aprendizaje adaptativo en entornos virtuales. Asimismo, diversas investigaciones "
        "confirman una correlación positiva entre interactividad y rendimiento académico (González, 2021)."
    )

    # Párrafo 2: Múltiples autores (et al.) y corporativos
    doc.add_paragraph(
        "Por otro lado, los estudios multidisciplinarios destacan la necesidad de marcos éticos "
        "robustos en la implementación de algoritmos generativos (Rodríguez et al., 2019). "
        "En consonancia con esto, la Organización Mundial de la Salud [OMS] (2022) ha publicado "
        "directrices sobre la gobernanza de datos en aplicaciones de salud digital."
    )

    # Párrafo 3: Cita secundaria y sin fecha
    doc.add_paragraph(
        "En el plano epistemológico, las teorías clásicas de procesamiento de información "
        "(Smith, 2015, como se citó en Pérez, 2020) sustentan los modelos conexionistas modernos. "
        "Adicionalmente, reportes preliminares sugieren que la retención nemotécnica aumenta "
        "cuando se emplean interfaces multimodales (García, s.f.)."
    )

    # Párrafo 4: Cita fantasma (no existe en referencias)
    doc.add_paragraph(
        "Sin embargo, existen posturas escépticas que argumentan una potencial reducción en el "
        "pensamiento crítico debido a la sobreautomatización de tareas analíticas (Alonso & Vargas, 2018)."
    )

    # Párrafo 5: Cita en bloque (>40 palabras)
    doc.add_heading("Marco Teórico y Consideraciones Metodológicas", level=2)
    doc.add_paragraph(
        "La conceptualización del aprendizaje mediado por tecnología requiere una revisión exhaustiva "
        "de las dinámicas sociocognitivas. En palabras de Fernández (2023): "
        "La transformación digital no constituye un mero cambio instrumental, sino una reconfiguración "
        "estructural de las relaciones pedagógicas, donde la cognición distribuida y los entornos "
        "inmersivos redefinen la noción tradicional de aula de clases y autonomía discente. (p. 45)"
    )

    # Sección Referencias
    doc.add_page_break()
    doc.add_heading("Referencias", level=1)

    ref_list = [
        "Fernández, M. A. (2023). Pedagogía digital y cognición distribuida. Editorial Universitaria.",
        "García, J. (s.f.). Interfaces multimodales en el aprendizaje continuo. Recuperado de https://ejemplo.edu/multimodal",
        "Gómez, R. (2019). Evaluación psicométrica de entornos virtuales. Revista de Psicometría, 14(2), 112-128. https://doi.org/10.1000/182", # HUÉRFANA
        "González, P. (2021). Entornos virtuales y aprendizaje adaptativo. Fondo de Cultura Educativa.",
        "Martínez, A., & López, K. (2020). Innovación educativa mediada por algoritmos inteligentes. Revista Latinoamericana de Tecnología Educativa, 18(1), 45-62.",
        "Organización Mundial de la Salud. (2022). Directrices sobre gobernanza de inteligencia artificial en salud. OMS.",
        "Pérez, C. (2020). Fundamentos conexionistas de la educación contemporánea. Ediciones Académicas.",
        "Rodríguez, T., Silva, D., Benítez, M., & Castro, H. (2019). Marcos éticos para la inteligencia artificial generativa. Iberoamerican Journal of Computer Science, 8(3), 200-218.",
    ]

    for ref in ref_list:
        doc.add_paragraph(ref)

    out_path = ensure_output_dir() / "stress_citations.docx"
    doc.save(str(out_path))
    return str(out_path)

def generate_stress_headings_and_structure_doc() -> str:
    """Genera documento con jerarquía de títulos desordenada (H1 -> H3 -> H2),
    títulos con numeración arábiga y romana, y párrafos en negrita."""
    doc = Document()
    doc.add_heading("Análisis Estructural del Rendimiento Organizacional", level=1)
    doc.add_paragraph("Este estudio examina la eficiencia en la gestión de operaciones.")

    # Título que salta a nivel 3 directamente
    doc.add_heading("1.1. Diagnóstico Inicial de Procesos", level=3)
    doc.add_paragraph("Se evaluaron los tiempos de ciclo en cada una de las líneas de producción.")

    # Título nivel 2 después de nivel 3
    doc.add_heading("Metodología de Optimización", level=2)
    doc.add_paragraph("Se aplicaron principios de manufactura esbelta.")

    # Párrafo en negrita que parece título
    p_bold = doc.add_paragraph()
    run = p_bold.add_run("Resultados de la Implementación Lean")
    run.bold = True
    doc.add_paragraph("La reducción de desperdicios alcanzó un 24.5% en el primer trimestre.")

    out_path = ensure_output_dir() / "stress_headings.docx"
    doc.save(str(out_path))
    return str(out_path)

def generate_stress_tables_and_figures_doc() -> str:
    """Genera documento con tablas con y sin formato APA, celdas numéricas,
    y párrafos que contextualizan datos para probar auto-captioning."""
    doc = Document()
    doc.add_heading("Evaluación Estadística de Variables de Proceso", level=1)
    
    doc.add_paragraph(
        "Como se observa en los datos recolectados durante la fase experimental, "
        "la correlación entre la temperatura de operación y el rendimiento químico "
        "muestra un comportamiento cuadrático significativo."
    )

    # Tabla 1: Tabla de datos experimentales sin formato APA
    table = doc.add_table(rows=4, cols=3)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    
    headers = ["Tratamiento", "Temperatura (°C)", "Rendimiento (%)"]
    for i, h in enumerate(headers):
        table.rows[0].cells[i].text = h

    data = [
        ["T-01 (Control)", "25.0", "78.4"],
        ["T-02 (Medio)", "45.0", "89.2"],
        ["T-03 (Alto)", "65.0", "94.6"],
    ]
    for row_idx, row_data in enumerate(data, start=1):
        for col_idx, val in enumerate(row_data):
            table.rows[row_idx].cells[col_idx].text = val

    doc.add_paragraph(
        "Los resultados de la tabla anterior confirman que la condición T-03 proporciona "
        "la mayor tasa de conversión con un margen de error menor al 1.5%."
    )

    out_path = ensure_output_dir() / "stress_tables_figures.docx"
    doc.save(str(out_path))
    return str(out_path)

def generate_stress_equations_doc() -> str:
    """Genera documento con ecuaciones matemáticas para validar detección y centrado APA 7."""
    doc = Document()
    doc.add_heading("Modelado Matemático y Cinética de Reacciones", level=1)
    doc.add_paragraph("La formulación del modelo de transporte térmico se basa en la ecuación diferencial:")

    # Ecuación 1
    doc.add_paragraph("dQ/dt = -k * A * (dT/dx)   (1)")

    doc.add_paragraph("Donde k representa la conductividad térmica del material. Para sistemas no lineales:")

    # Ecuación 2
    doc.add_paragraph("E_k = (1/2) * m * v^2 + m * g * h   (2)")

    out_path = ensure_output_dir() / "stress_equations.docx"
    doc.save(str(out_path))
    return str(out_path)

def generate_stress_complete_thesis_doc() -> str:
    """Genera documento complejo tipo tesis que combina todos los elementos:
    títulos multinivel, citas complejas, tablas, ecuaciones, figuras y referencias."""
    doc = Document()
    # Portada simulada
    doc.add_heading("UNIVERSIDAD NACIONAL DE INGENIERÍA", level=1)
    doc.add_paragraph("FACULTAD DE CIENCIAS Y SISTEMAS")
    doc.add_paragraph("Tesis de Grado: Optimización de Algoritmos Genéticos en Ambientes Distribuidos")
    doc.add_paragraph("Autor: Juan Pérez Rodríguez\nTutor: Dr. Carlos Mendoza\n15 de marzo de 2026")

    doc.add_page_break()
    doc.add_heading("Introducción y Justificación", level=1)
    doc.add_paragraph(
        "La optimización combinatoria en espacios de alta dimensionalidad representa un reto computacional clásico "
        "(González, 2021). Diversos autores han propuesto esquemas de paralelización para reducir la convergencia prematura "
        "(Martínez & López, 2020; Rodríguez et al., 2019)."
    )

    doc.add_heading("Marco Teórico y Formulación Matemática", level=2)
    doc.add_paragraph("La función de aptitud se define según el modelo de penalización cuadrática:")
    doc.add_paragraph("f(x) = sum(w_i * x_i^2) + lambda * g(x)   (1)")

    doc.add_heading("Resultados Experimentales", level=2)
    doc.add_paragraph("Como se observa en la Tabla 1, los tiempos de procesamiento disminuyeron significativamente:")

    table = doc.add_table(rows=3, cols=3)
    table.rows[0].cells[0].text = "Hilos"
    table.rows[0].cells[1].text = "Tiempo (s)"
    table.rows[0].cells[2].text = "Speedup"
    table.rows[1].cells[0].text = "4"
    table.rows[1].cells[1].text = "120.5"
    table.rows[1].cells[2].text = "1.00x"
    table.rows[2].cells[0].text = "16"
    table.rows[2].cells[1].text = "34.2"
    table.rows[2].cells[2].text = "3.52x"

    doc.add_paragraph("Nota. Resultados promediados tras 50 ejecuciones independientes.")

    doc.add_page_break()
    doc.add_heading("Referencias", level=1)
    doc.add_paragraph("González, P. (2021). Entornos virtuales y aprendizaje adaptativo. Fondo de Cultura Educativa.")
    doc.add_paragraph("Martínez, A., & López, K. (2020). Innovación educativa mediada por algoritmos inteligentes. Revista Latinoamericana de Tecnología Educativa, 18(1), 45-62.")
    doc.add_paragraph("Rodríguez, T., Silva, D., Benítez, M., & Castro, H. (2019). Marcos éticos para la inteligencia artificial generativa. Iberoamerican Journal of Computer Science, 8(3), 200-218.")

    out_path = ensure_output_dir() / "stress_complete_thesis.docx"
    doc.save(str(out_path))
    return str(out_path)

def generate_all_stress_docs() -> Dict[str, str]:
    """Genera todo el lote de documentos de prueba y estrés."""
    return {
        "citations": generate_stress_citations_doc(),
        "headings": generate_stress_headings_and_structure_doc(),
        "tables_figures": generate_stress_tables_and_figures_doc(),
        "equations": generate_stress_equations_doc(),
        "complete_thesis": generate_stress_complete_thesis_doc(),
    }

if __name__ == "__main__":
    generated = generate_all_stress_docs()
    print("Documentos generados con éxito:")
    for k, v in generated.items():
        print(f" - {k}: {v}")
