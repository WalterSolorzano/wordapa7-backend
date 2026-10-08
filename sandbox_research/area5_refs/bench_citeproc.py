"""Benchmark comparativo: formateador propio (regex + reglas manuales) vs
citeproc-py (CSL) vs formato APA 7 oficial esperado.

Dataset: 15 referencias con casos límite reales del Manual APA 7.
"""
from __future__ import annotations

import json
import sys
import os
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PYTHON_DIR = REPO / "python"
sys.path.insert(0, str(PYTHON_DIR))

# ── DATASET DE PRUEBA ──────────────────────────────────────────────────────
# Cada caso: raw_text (como aparece en un documento), csl_json (equivalente
# estructurado), expected_apa7 (formato correcto según el Manual APA 7).
# Los casos se eligieron para cubrir los edge cases especificados en la tarea.

TEST_CASES = [
    {
        "id": "single_author_journal",
        "raw_text": "García, M. (2023). Análisis de la productividad laboral. Revista de Ingeniería, 45(2), 112-128.",
        "expected": "García, M. (2023). Análisis de la productividad laboral. Revista de Ingeniería, 45(2), 112–128.",
        "csl_json": {
            "id": "garcia2023",
            "type": "article-journal",
            "author": [{"family": "García", "given": "M."}],
            "issued": {"date-parts": [[2023]]},
            "title": "Análisis de la productividad laboral",
            "container-title": "Revista de Ingeniería",
            "volume": "45",
            "issue": "2",
            "page": "112-128",
        },
    },
    {
        "id": "multi_author_3",
        "raw_text": "García, M., López, J., & Pérez, A. (2021). Metodologías ágiles en la gestión de proyectos. Journal of Project Management, 12(3), 45-67. https://doi.org/10.1234/jpm.2021.012",
        "expected": "García, M., López, J., & Pérez, A. (2021). Metodologías ágiles en la gestión de proyectos. Journal of Project Management, 12(3), 45–67. https://doi.org/10.1234/jpm.2021.012",
        "csl_json": {
            "id": "garcia2021",
            "type": "article-journal",
            "author": [
                {"family": "García", "given": "M."},
                {"family": "López", "given": "J."},
                {"family": "Pérez", "given": "A."},
            ],
            "issued": {"date-parts": [[2021]]},
            "title": "Metodologías ágiles en la gestión de proyectos",
            "container-title": "Journal of Project Management",
            "volume": "12",
            "issue": "3",
            "page": "45-67",
            "DOI": "10.1234/jpm.2021.012",
        },
    },
    {
        "id": "multi_author_21_et_al",
        "raw_text": "Anderson, J., Brown, C., Clark, D., Davis, E., Evans, F., Foster, G., Green, H., Hall, I., Irwin, J., Jones, K., King, L., Lewis, M., Miller, N., Nixon, O., Owen, P., Parker, Q., Quinn, R., Roberts, S., Smith, T., Turner, U., & Vance, V. (2020). Large-scale collaborative research in psychology. American Psychologist, 75(1), 1-15.",
        "expected": "Anderson, J., Brown, C., Clark, D., Davis, E., Evans, F., Foster, G., Green, H., Hall, I., Irwin, J., Jones, K., King, L., Lewis, M., Miller, N., Nixon, O., Owen, P., Parker, Q., Quinn, R., Roberts, S., Smith, T., & Vance, V. (2020). Large-scale collaborative research in psychology. American Psychologist, 75(1), 1–15.",
        "csl_json": {
            "id": "anderson2020",
            "type": "article-journal",
            "author": [
                {"family": "Anderson", "given": "J."},
                {"family": "Brown", "given": "C."},
                {"family": "Clark", "given": "D."},
                {"family": "Davis", "given": "E."},
                {"family": "Evans", "given": "F."},
                {"family": "Foster", "given": "G."},
                {"family": "Green", "given": "H."},
                {"family": "Hall", "given": "I."},
                {"family": "Irwin", "given": "J."},
                {"family": "Jones", "given": "K."},
                {"family": "King", "given": "L."},
                {"family": "Lewis", "given": "M."},
                {"family": "Miller", "given": "N."},
                {"family": "Nixon", "given": "O."},
                {"family": "Owen", "given": "P."},
                {"family": "Parker", "given": "Q."},
                {"family": "Quinn", "given": "R."},
                {"family": "Roberts", "given": "S."},
                {"family": "Smith", "given": "T."},
                {"family": "Turner", "given": "U."},
                {"family": "Vance", "given": "V."},
            ],
            "issued": {"date-parts": [[2020]]},
            "title": "Large-scale collaborative research in psychology",
            "container-title": "American Psychologist",
            "volume": "75",
            "issue": "1",
            "page": "1-15",
        },
    },
    {
        "id": "corporate_author",
        "raw_text": "Organización Internacional del Trabajo. (2019). Seguridad y salud en el trabajo. OIT.",
        "expected": "Organización Internacional del Trabajo. (2019). Seguridad y salud en el trabajo. OIT.",
        "csl_json": {
            "id": "oit2019",
            "type": "book",
            "author": [{"literal": "Organización Internacional del Trabajo"}],
            "issued": {"date-parts": [[2019]]},
            "title": "Seguridad y salud en el trabajo",
            "publisher": "OIT",
        },
    },
    {
        "id": "no_date_nd",
        "raw_text": "Smith, J. (s.f.). Estudio preliminar sobre el impacto de las redes sociales. Editorial Académica.",
        "expected": "Smith, J. (n.d.). Estudio preliminar sobre el impacto de las redes sociales. Editorial Académica.",
        "csl_json": {
            "id": "smith_nd",
            "type": "book",
            "author": [{"family": "Smith", "given": "J."}],
            "title": "Estudio preliminar sobre el impacto de las redes sociales",
            "publisher": "Editorial Académica",
        },
    },
    {
        "id": "same_author_year_a",
        "raw_text": "García, M. (2022a). Primera investigación sobre métodos cuantitativos. Revista de Ciencias, 10(1), 5-20.",
        "expected": "García, M. (2022a). Primera investigación sobre métodos cuantitativos. Revista de Ciencias, 10(1), 5–20.",
        "csl_json": {
            "id": "garcia2022a",
            "type": "article-journal",
            "author": [{"family": "García", "given": "M."}],
            "issued": {"date-parts": [[2022]]},
            "year-suffix": "a",
            "title": "Primera investigación sobre métodos cuantitativos",
            "container-title": "Revista de Ciencias",
            "volume": "10",
            "issue": "1",
            "page": "5-20",
        },
    },
    {
        "id": "same_author_year_b",
        "raw_text": "García, M. (2022b). Segunda investigación sobre métodos cualitativos. Revista de Ciencias, 10(2), 21-35.",
        "expected": "García, M. (2022b). Segunda investigación sobre métodos cualitativos. Revista de Ciencias, 10(2), 21–35.",
        "csl_json": {
            "id": "garcia2022b",
            "type": "article-journal",
            "author": [{"family": "García", "given": "M."}],
            "issued": {"date-parts": [[2022]]},
            "year-suffix": "b",
            "title": "Segunda investigación sobre métodos cualitativos",
            "container-title": "Revista de Ciencias",
            "volume": "10",
            "issue": "2",
            "page": "21-35",
        },
    },
    {
        "id": "doi_only",
        "raw_text": "Johnson, R. (2024). Artificial intelligence in modern engineering. Engineering Review, 8, e2024-001. https://doi.org/10.5678/eng.2024.001",
        "expected": "Johnson, R. (2024). Artificial intelligence in modern engineering. Engineering Review, 8, e2024-001. https://doi.org/10.5678/eng.2024.001",
        "csl_json": {
            "id": "johnson2024",
            "type": "article-journal",
            "author": [{"family": "Johnson", "given": "R."}],
            "issued": {"date-parts": [[2024]]},
            "title": "Artificial intelligence in modern engineering",
            "container-title": "Engineering Review",
            "volume": "8",
            "number": "e2024-001",
            "DOI": "10.5678/eng.2024.001",
        },
    },
    {
        "id": "web_source",
        "raw_text": "Ministerio de Educación. (2023, 15 de marzo). Guía para la elaboración de tesis. https://www.minedu.gob.bo/guias-tesis",
        "expected": "Ministerio de Educación. (2023, 15 de marzo). Guía para la elaboración de tesis. https://www.minedu.gob.bo/guias-tesis",
        "csl_json": {
            "id": "minedu2023",
            "type": "webpage",
            "author": [{"literal": "Ministerio de Educación"}],
            "issued": {"date-parts": [[2023, 3, 15]]},
            "title": "Guía para la elaboración de tesis",
            "URL": "https://www.minedu.gob.bo/guias-tesis",
        },
    },
    {
        "id": "book_chapter",
        "raw_text": "Niebel, B. W., & Freivalds, A. (2014). Ingeniería industrial: Métodos, estándares y diseño del trabajo (12.ª ed.). McGraw-Hill.",
        "expected": "Niebel, B. W., & Freivalds, A. (2014). Ingeniería industrial: Métodos, estándares y diseño del trabajo (12.ª ed.). McGraw-Hill.",
        "csl_json": {
            "id": "niebel2014",
            "type": "book",
            "author": [
                {"family": "Niebel", "given": "B. W."},
                {"family": "Freivalds", "given": "A."},
            ],
            "issued": {"date-parts": [[2014]]},
            "title": "Ingeniería industrial: Métodos, estándares y diseño del trabajo",
            "edition": "12",
            "publisher": "McGraw-Hill",
        },
    },
    {
        "id": "translated_work",
        "raw_text": "Freud, S. (1995). La interpretación de los sueños (J. L. López-Ballesteros, Trad.). Editorial Alta (Obra original publicada en 1900)",
        "expected": "Freud, S. (1995). La interpretación de los sueños (J. L. López-Ballesteros, Trans.). Editorial Alta (Original work published 1900)",
        "csl_json": {
            "id": "freud1995",
            "type": "book",
            "author": [{"family": "Freud", "given": "S."}],
            "issued": {"date-parts": [[1995]]},
            "title": "La interpretación de los sueños",
            "translator": [{"family": "López-Ballesteros", "given": "J. L."}],
            "publisher": "Editorial Alta",
            "original-date": {"date-parts": [[1900]]},
        },
    },
    {
        "id": "thesis",
        "raw_text": "Quispe, L. (2022). Análisis ergonómico de puestos de trabajo en la industria textil [Tesis de grado, Universidad Mayor de San Andrés]. Repositorio UMSA.",
        "expected": "Quispe, L. (2022). Análisis ergonómico de puestos de trabajo en la industria textil [Tesis de grado, Universidad Mayor de San Andrés]. Repositorio UMSA.",
        "csl_json": {
            "id": "quispe2022",
            "type": "thesis",
            "author": [{"family": "Quispe", "given": "L."}],
            "issued": {"date-parts": [[2022]]},
            "title": "Análisis ergonómico de puestos de trabajo en la industria textil",
            "genre": "Tesis de grado",
            "publisher": "Universidad Mayor de San Andrés",
            "archive": "Repositorio UMSA",
        },
    },
    {
        "id": "conference_paper",
        "raw_text": "Mamani, R., & Choque, D. (2021, noviembre). Aplicación de machine learning en el control de calidad industrial. Ponencia presentada en el Congreso Internacional de Ingeniería, La Paz, Bolivia.",
        "expected": "Mamani, R., & Choque, D. (2021, noviembre). Aplicación de machine learning en el control de calidad industrial. Ponencia presentada en el Congreso Internacional de Ingeniería, La Paz, Bolivia.",
        "csl_json": {
            "id": "mamani2021",
            "type": "speech",
            "author": [
                {"family": "Mamani", "given": "R."},
                {"family": "Choque", "given": "D."},
            ],
            "issued": {"date-parts": [[2021, 11]]},
            "title": "Aplicación de machine learning en el control de calidad industrial",
            "event": "Congreso Internacional de Ingeniería",
            "event-place": "La Paz, Bolivia",
        },
    },
    {
        "id": "in_press",
        "raw_text": "Vargas, T. (en prensa). Nuevas tendencias en automatización industrial. Revista Boliviana de Tecnología.",
        "expected": "Vargas, T. (in press). Nuevas tendencias en automatización industrial. Revista Boliviana de Tecnología.",
        "csl_json": {
            "id": "vargas_inpress",
            "type": "article-journal",
            "author": [{"family": "Vargas", "given": "T."}],
            "status": "in press",
            "title": "Nuevas tendencias en automatización industrial",
            "container-title": "Revista Boliviana de Tecnología",
        },
    },
    {
        "id": "single_author_book",
        "raw_text": "Hirano, H. (1995). 5 pilares de la fábrica visual: Cómo implementar el 5S en su empresa. Productivity Press.",
        "expected": "Hirano, H. (1995). 5 pilares de la fábrica visual: Cómo implementar el 5S en su empresa. Productivity Press.",
        "csl_json": {
            "id": "hirano1995",
            "type": "book",
            "author": [{"family": "Hirano", "given": "H."}],
            "issued": {"date-parts": [[1995]]},
            "title": "5 pilares de la fábrica visual: Cómo implementar el 5S en su empresa",
            "publisher": "Productivity Press",
        },
    },
]


def normalize_output(text: str) -> str:
    """Normaliza para comparación: colapsa espacios, normaliza guiones."""
    import re
    text = re.sub(r'\s+', ' ', text.strip())
    # Normalizar en-dash a hyphen para comparación tolerante
    # text = text.replace('–', '-')
    return text


def fuzzy_match(expected: str, actual: str) -> bool:
    """Match tolerante: compara ignorando diferencias menores de puntuación."""
    e = normalize_output(expected)
    a = normalize_output(actual)
    if e == a:
        return True
    # Tolerar en-dash vs hyphen en rangos de páginas
    e2 = e.replace('–', '-')
    a2 = a.replace('–', '-')
    return e2 == a2


def run_custom_parser():
    """Corre el parser propio (references_extractor._parse_single_reference)."""
    from parsing.references_extractor import _parse_single_reference
    results = []
    for tc in TEST_CASES:
        try:
            parsed = _parse_single_reference(tc["raw_text"])
            # Reconstruir el texto APA desde los campos parseados
            authors = parsed.get("authors", [])
            year = parsed.get("year") or ""
            title = parsed.get("title") or ""
            source = parsed.get("source") or ""
            doi = parsed.get("doi_or_url") or ""

            # Formato básico: Authors (year). Title. Source.
            author_str = ", ".join(authors) if authors else ""
            rendered = f"{author_str} ({year}). {title}."
            if source:
                rendered += f" {source}."
            if doi:
                rendered += f" {doi}"
            rendered = normalize_output(rendered)
            expected = normalize_output(tc["expected"])
            match = fuzzy_match(expected, rendered)
            results.append({
                "id": tc["id"],
                "expected": tc["expected"][:120],
                "actual": rendered[:120],
                "match": match,
                "parsed_fields": parsed,
            })
        except Exception as e:
            results.append({"id": tc["id"], "match": False, "error": str(e)[:200]})
    return results


def run_citeproc_py():
    """Corre citeproc-py con el estilo APA 7 CSL."""
    csl_path = Path(__file__).parent / "apa.csl"
    results = []
    try:
        from citeproc import CitationStylesStyle, CitationStylesBibliography
        from citeproc.source.json import CiteProcJSON
        from citeproc.formatter import plain
        from citeproc import Citation

        # Cargar estilo APA
        bib_source = CiteProcJSON([tc["csl_json"] for tc in TEST_CASES])
        bib_style = CitationStylesStyle(str(csl_path), validate=False)
        bibliography = CitationStylesBibliography(bib_style, bib_source, plain)

        for tc in TEST_CASES:
            try:
                citation = Citation([tc["csl_json"]["id"]])
                bibliography.register(citation)

        # Generar bibliografía
        bib_items = []
        for item in bibliography.bibliography():
            # plain() devuelve texto sin HTML
            rendered = str(item)
            bib_items.append(rendered.strip())

        for i, tc in enumerate(TEST_CASES):
            actual = bib_items[i] if i < len(bib_items) else ""
            expected = tc["expected"]
            match = fuzzy_match(normalize_output(expected), normalize_output(actual))
            results.append({
                "id": tc["id"],
                "expected": expected[:120],
                "actual": actual[:120],
                "match": match,
            })

    except Exception as e:
        import traceback
        traceback.print_exc()
        for tc in TEST_CASES:
            results.append({"id": tc["id"], "match": False, "error": str(e)[:200]})
    return results


def run_citeproc_py_in_text():
    """Corre citeproc-py para generar citas en texto (in-text citations)."""
    csl_path = Path(__file__).parent / "apa.csl"
    results = []
    try:
        from citeproc import CitationStylesStyle, CitationStylesBibliography
        from citeproc.source.json import CiteProcJSON
        from citeproc.formatter import plain
        from citeproc import Citation, CitationItem

        bib_source = CiteProcJSON([tc["csl_json"] for tc in TEST_CASES])
        bib_style = CitationStylesStyle(str(csl_path), validate=False)
        bibliography = CitationStylesBibliography(bib_style, bib_source, plain)

        # Registrar todas las citas
        for tc in TEST_CASES:
            citation = Citation([CitationItem(tc["csl_json"]["id"])])
            bibliography.register(citation)

        # Generar citas en texto
        for tc in TEST_CASES:
            try:
                key = tc["csl_json"]["id"]
                citation = Citation([CitationItem(key)])
                rendered = bibliography.cite(citation, plain)
                results.append({
                    "id": tc["id"],
                    "in_text": rendered.strip(),
                })
            except Exception as e:
                results.append({"id": tc["id"], "in_text": f"ERROR: {e}"})

    except Exception as e:
        import traceback
        traceback.print_exc()
    return results


def main():
    print("=" * 80)
    print("BENCHMARK BIBLIOGRAFÍA APA 7: Formateador propio vs citeproc-py")
    print("=" * 80)
    print(f"Dataset: {len(TEST_CASES)} referencias con casos límite")
    print()

    # ── 1. Formateador propio (regex + reglas manuales) ──
    print("── 1. FORMATEADOR PROPIO (regex + reglas manuales) ──")
    custom_results = run_custom_parser()
    custom_pass = sum(1 for r in custom_results if r.get("match", False))
    custom_fail = len(custom_results) - custom_pass
    print(f"   Pasados: {custom_pass}/{len(custom_results)} ({100*custom_pass/len(custom_results):.1f}%)")
    print(f"   Fallados: {custom_fail}")
    for r in custom_results:
        status = "PASS" if r.get("match") else "FAIL"
        err = r.get("error", "")
        print(f"   [{status}] {r['id']}: {err or ''}")
        if not r.get("match") and "actual" in r:
            print(f"     Expected: {r.get('expected', '')[:100]}")
            print(f"     Actual:   {r.get('actual', '')[:100]}")
    print()

    # ── 2. citeproc-py (CSL) ──
    print("── 2. CITEPROC-PY (CSL con apa.csl) ──")
    csl_results = run_citeproc_py()
    csl_pass = sum(1 for r in csl_results if r.get("match", False))
    csl_fail = len(csl_results) - csl_pass
    print(f"   Pasados: {csl_pass}/{len(csl_results)} ({100*csl_pass/len(csl_results):.1f}%)")
    print(f"   Fallados: {csl_fail}")
    for r in csl_results:
        status = "PASS" if r.get("match") else "FAIL"
        err = r.get("error", "")
        print(f"   [{status}] {r['id']}: {err or ''}")
        if not r.get("match") and "actual" in r:
            print(f"     Expected: {r.get('expected', '')[:100]}")
            print(f"     Actual:   {r.get('actual', '')[:100]}")
    print()

    # ── 3. Citas en texto (citeproc-py) ──
    print("── 3. CITAS EN TEXTO (citeproc-py) ──")
    in_text = run_citeproc_py_in_text()
    for r in in_text:
        print(f"   {r['id']}: {r.get('in_text', 'N/A')}")
    print()

    # ── Resumen ──
    print("=" * 80)
    print("RESUMEN")
    print("=" * 80)
    print(f"Formateador propio:  {custom_pass}/{len(TEST_CASES)} exactos ({100*custom_pass/len(TEST_CASES):.1f}%)")
    print(f"citeproc-py (CSL):    {csl_pass}/{len(TEST_CASES)} exactos ({100*csl_pass/len(TEST_CASES):.1f}%)")
    print()

    # Guardar evidencia
    evid = Path(__file__).resolve().parents[1] / "evidence"
    evid.mkdir(exist_ok=True)
    evidence = {
        "test_cases": len(TEST_CASES),
        "custom_formatter": {
            "passed": custom_pass,
            "total": len(TEST_CASES),
            "pct": round(100 * custom_pass / len(TEST_CASES), 1),
            "details": custom_results,
        },
        "citeproc_py": {
            "passed": csl_pass,
            "total": len(TEST_CASES),
            "pct": round(100 * csl_pass / len(TEST_CASES), 1),
            "details": csl_results,
        },
        "in_text_citations": in_text,
    }
    (evid / "area5_refs.json").write_text(json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Evidencia guardada en: {evid / 'area5_refs.json'}")


if __name__ == "__main__":
    main()
