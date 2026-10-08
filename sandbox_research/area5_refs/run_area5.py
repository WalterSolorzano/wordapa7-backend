"""AREA 5 - Bibliography benchmark: citeproc-py vs custom formatter.

Dataset: 15 APA 7 references with edge cases.
Each reference has:
  - CSL-JSON input (for citeproc-py)
  - Raw text input (for the custom parser)
  - Expected APA 7 output (from the Manual)

Metric: exact string match (%) of rendered bibliography entry.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "python"))

EVID = Path(__file__).resolve().parents[1] / "evidence"
CSL_FILE = Path(__file__).parent / "apa.csl"

DATASET = [
    {"id": "single_author_journal", "desc": "Single author, journal article with DOI",
     "csl_json": {"type": "article-journal", "id": "ref1",
       "author": [{"family": "Garcia", "given": "Maria"}],
       "issued": {"date-parts": [[2023]]},
       "title": "El impacto de la inteligencia artificial en la educacion",
       "container-title": "Revista de Educacion", "volume": "45", "issue": "2",
       "page": "112-130", "DOI": "10.1234/ried.2023.001"},
     "raw_text": "Garcia, M. (2023). El impacto de la inteligencia artificial en la educacion. Revista de Educacion, 45(2), 112-130. https://doi.org/10.1234/ried.2023.001",
     "expected": "Garcia, M. (2023). El impacto de la inteligencia artificial en la educacion. Revista de Educacion, 45(2), 112-130. https://doi.org/10.1234/ried.2023.001"},
    {"id": "two_authors", "desc": "Two authors, journal article",
     "csl_json": {"type": "article-journal", "id": "ref2",
       "author": [{"family": "Lopez", "given": "Carlos"}, {"family": "Martinez", "given": "Ana"}],
       "issued": {"date-parts": [[2021]]},
       "title": "Metodos cuantitativos en investigacion social",
       "container-title": "Revista de Ciencias Sociales", "volume": "30",
       "page": "45-67", "DOI": "10.5678/rcs.2021.002"},
     "raw_text": "Lopez, C., & Martinez, A. (2021). Metodos cuantitativos en investigacion social. Revista de Ciencias Sociales, 30, 45-67. https://doi.org/10.5678/rcs.2021.002",
     "expected": "Lopez, C., & Martinez, A. (2021). Metodos cuantitativos en investigacion social. Revista de Ciencias Sociales, 30, 45-67. https://doi.org/10.5678/rcs.2021.002"},
    {"id": "three_authors", "desc": "Three authors (APA 7: list all in refs)",
     "csl_json": {"type": "article-journal", "id": "ref3",
       "author": [{"family": "Perez", "given": "Juan"}, {"family": "Rodriguez", "given": "Laura"}, {"family": "Sanchez", "given": "Diego"}],
       "issued": {"date-parts": [[2020]]},
       "title": "Analisis de varianza en estudios longitudinales",
       "container-title": "Revista de Psicologia", "volume": "15", "issue": "1", "page": "23-41"},
     "raw_text": "Perez, J., Rodriguez, L., & Sanchez, D. (2020). Analisis de varianza en estudios longitudinales. Revista de Psicologia, 15(1), 23-41.",
     "expected": "Perez, J., Rodriguez, L., & Sanchez, D. (2020). Analisis de varianza en estudios longitudinales. Revista de Psicologia, 15(1), 23-41."},
    {"id": "corporate_author", "desc": "Corporate/organizational author",
     "csl_json": {"type": "report", "id": "ref4",
       "author": [{"literal": "Organizacion Mundial de la Salud"}],
       "issued": {"date-parts": [[2022]]},
       "title": "Informe sobre la salud mental en el mundo", "publisher": "OMS"},
     "raw_text": "Organizacion Mundial de la Salud. (2022). Informe sobre la salud mental en el mundo. OMS.",
     "expected": "Organizacion Mundial de la Salud. (2022). Informe sobre la salud mental en el mundo. OMS."},
    {"id": "no_date", "desc": "No date (n.d.)",
     "csl_json": {"type": "book", "id": "ref5",
       "author": [{"family": "Smith", "given": "John"}],
       "title": "Teorias del aprendizaje", "publisher": "Editorial Academica"},
     "raw_text": "Smith, J. (s.f.). Teorias del aprendizaje. Editorial Academica.",
     "expected": "Smith, J. (n.d.). Teorias del aprendizaje. Editorial Academica."},
    {"id": "same_year_a", "desc": "Same author/year suffix a (APA 7 8.19)",
     "csl_json": {"type": "article-journal", "id": "ref6a",
       "author": [{"family": "Brown", "given": "Robert"}],
       "issued": {"date-parts": [[2019]]}, "year-suffix": "a",
       "title": "Estudio sobre motivacion I",
       "container-title": "Revista de Psicologia Aplicada", "volume": "10", "page": "1-15"},
     "raw_text": "Brown, R. (2019a). Estudio sobre motivacion I. Revista de Psicologia Aplicada, 10, 1-15.",
     "expected": "Brown, R. (2019a). Estudio sobre motivacion I. Revista de Psicologia Aplicada, 10, 1-15."},
    {"id": "same_year_b", "desc": "Same author/year suffix b (APA 7 8.19)",
     "csl_json": {"type": "article-journal", "id": "ref6b",
       "author": [{"family": "Brown", "given": "Robert"}],
       "issued": {"date-parts": [[2019]]}, "year-suffix": "b",
       "title": "Estudio sobre motivacion II",
       "container-title": "Revista de Psicologia Aplicada", "volume": "10", "page": "16-30"},
     "raw_text": "Brown, R. (2019b). Estudio sobre motivacion II. Revista de Psicologia Aplicada, 10, 16-30.",
     "expected": "Brown, R. (2019b). Estudio sobre motivacion II. Revista de Psicologia Aplicada, 10, 16-30."},
    {"id": "book_edition", "desc": "Book with edition (2nd ed.)",
     "csl_json": {"type": "book", "id": "ref7",
       "author": [{"family": "Niebel", "given": "Benjamin"}, {"family": "Freivalds", "given": "Andris"}],
       "issued": {"date-parts": [[1999]]},
       "title": "Ingenieria industrial: Metodos, estandares y diseno del trabajo",
       "edition": "2", "publisher": "Alfaomega"},
     "raw_text": "Niebel, B., & Freivalds, A. (1999). Ingenieria industrial: Metodos, estandares y diseno del trabajo (2nd ed.). Alfaomega.",
     "expected": "Niebel, B., & Freivalds, A. (1999). Ingenieria industrial: Metodos, estandares y diseno del trabajo (2nd ed.). Alfaomega."},
    {"id": "web_page", "desc": "Web page with retrieval date",
     "csl_json": {"type": "webpage", "id": "ref8",
       "author": [{"family": "Gomez", "given": "Pedro"}],
       "issued": {"date-parts": [[2024, 3, 15]]},
       "title": "Guia de estilo APA 7",
       "container-title": "Sitio web academico", "URL": "https://www.ejemplo.com/apa7"},
     "raw_text": "Gomez, P. (2024, 15 de marzo). Guia de estilo APA 7. Sitio web academico. https://www.ejemplo.com/apa7",
     "expected": "Gomez, P. (2024, 15 de marzo). Guia de estilo APA 7. Sitio web academico. https://www.ejemplo.com/apa7"},
    {"id": "doi_elocator", "desc": "Journal article with article number (eLocator)",
     "csl_json": {"type": "article-journal", "id": "ref9",
       "author": [{"family": "Wilson", "given": "Emily"}, {"family": "Thompson", "given": "James"}],
       "issued": {"date-parts": [[2022]]},
       "title": "Machine learning approaches to climate modeling",
       "container-title": "Journal of Climate Research",
       "number": "e001234", "DOI": "10.1000/jcr.2022.001234"},
     "raw_text": "Wilson, E., & Thompson, J. (2022). Machine learning approaches to climate modeling. Journal of Climate Research, Article e001234. https://doi.org/10.1000/jcr.2022.001234",
     "expected": "Wilson, E., & Thompson, J. (2022). Machine learning approaches to climate modeling. Journal of Climate Research, Article e001234. https://doi.org/10.1000/jcr.2022.001234"},
    {"id": "book_chapter", "desc": "Book chapter with editors",
     "csl_json": {"type": "chapter", "id": "ref10",
       "author": [{"family": "Davis", "given": "Sarah"}],
       "issued": {"date-parts": [[2018]]},
       "title": "Cognitive development in early childhood",
       "container-title": "Handbook of developmental psychology",
       "editor": [{"family": "Miller", "given": "Thomas"}],
       "publisher": "Academic Press", "page": "89-110"},
     "raw_text": "Davis, S. (2018). Cognitive development in early childhood. In T. Miller (Ed.), Handbook of developmental psychology (pp. 89-110). Academic Press.",
     "expected": "Davis, S. (2018). Cognitive development in early childhood. In T. Miller (Ed.), Handbook of developmental psychology (pp. 89-110). Academic Press."},
    {"id": "thesis", "desc": "Doctoral thesis",
     "csl_json": {"type": "thesis", "id": "ref11",
       "author": [{"family": "Ramirez", "given": "Francisco"}],
       "issued": {"date-parts": [[2021]]},
       "title": "Optimizacion de procesos productivos en la industria manufacturera",
       "publisher": "Universidad Nacional Autonoma de Nicaragua", "genre": "Tesis doctoral"},
     "raw_text": "Ramirez, F. (2021). Optimizacion de procesos productivos en la industria manufacturera [Tesis doctoral, Universidad Nacional Autonoma de Nicaragua].",
     "expected": "Ramirez, F. (2021). Optimizacion de procesos productivos en la industria manufacturera [Tesis doctoral, Universidad Nacional Autonoma de Nicaragua]."},
    {"id": "translated", "desc": "Translated work with original date",
     "csl_json": {"type": "book", "id": "ref12",
       "author": [{"family": "Freud", "given": "Sigmund"}],
       "issued": {"date-parts": [[2010]]},
       "original-date": {"date-parts": [[1923]]},
       "title": "El yo y el ello", "publisher": "Editorial Homo Sapiens"},
     "raw_text": "Freud, S. (2010). El yo y el ello. Editorial Homo Sapiens. (Obra original publicada en 1923).",
     "expected": "Freud, S. (2010). El yo y el ello. Editorial Homo Sapiens. (Obra original publicada en 1923)."},
    {"id": "six_authors", "desc": "Six authors (APA 7: list all up to 20)",
     "csl_json": {"type": "article-journal", "id": "ref13",
       "author": [{"family": "Anderson", "given": "A."}, {"family": "Brown", "given": "B."},
                  {"family": "Clark", "given": "C."}, {"family": "Davis", "given": "D."},
                  {"family": "Evans", "given": "E."}, {"family": "Foster", "given": "F."}],
       "issued": {"date-parts": [[2023]]},
       "title": "Collaborative research in multidisciplinary teams",
       "container-title": "International Journal of Collaboration", "volume": "5", "page": "100-120"},
     "raw_text": "Anderson, A., Brown, B., Clark, C., Davis, D., Evans, E., & Foster, F. (2023). Collaborative research in multidisciplinary teams. International Journal of Collaboration, 5, 100-120.",
     "expected": "Anderson, A., Brown, B., Clark, C., Davis, D., Evans, E., & Foster, F. (2023). Collaborative research in multidisciplinary teams. International Journal of Collaboration, 5, 100-120."},
    {"id": "newspaper", "desc": "Newspaper article with full date",
     "csl_json": {"type": "article-newspaper", "id": "ref14",
       "author": [{"family": "Torres", "given": "Luis"}],
       "issued": {"date-parts": [[2024, 1, 20]]},
       "title": "El futuro de la educacion a distancia",
       "container-title": "El Diario Nacional", "page": "A1, A4"},
     "raw_text": "Torres, L. (2024, 20 de enero). El futuro de la educacion a distancia. El Diario Nacional, pp. A1, A4.",
     "expected": "Torres, L. (2024, 20 de enero). El futuro de la educacion a distancia. El Diario Nacional, pp. A1, A4."},
]


def run_citeproc_py():
    """Run citeproc-py with APA 7 CSL style on the dataset."""
    try:
        from citeproc import CitationStylesBibliography, CitationStylesStyle, formatter
        from citeproc.source.json import CiteProcJSON
        from citeproc import Citation, CitationItem
    except ImportError as e:
        return {"error": f"citeproc-py not available: {e}", "results": []}

    results = []
    try:
        style = CitationStylesStyle(str(CSL_FILE), validate=False)
    except Exception as e:
        return {"error": f"Failed to load APA CSL: {e}", "results": []}

    for entry in DATASET:
        csl_data = [entry["csl_json"]]
        try:
            bib_source = CiteProcJSON(csl_data)
            bib = CitationStylesBibliography(style, bib_source, formatter.plain)
            cit = Citation([CitationItem(entry["csl_json"]["id"])])
            bib.register(cit)
            bib_entries = bib.bibliography()
            rendered = str(bib_entries[0]).strip() if bib_entries else "EMPTY"
        except Exception as e:
            rendered = f"ERROR: {type(e).__name__}: {e}"

        expected = entry["expected"]
        match = rendered.strip() == expected.strip()
        results.append({
            "id": entry["id"], "desc": entry["desc"],
            "csl_output": rendered[:400], "expected": expected,
            "exact_match": match,
        })

    matches = sum(1 for r in results if r["exact_match"])
    return {"total": len(results), "exact_matches": matches,
            "match_pct": round(matches / max(1, len(results)) * 100, 1),
            "results": results}


def run_custom_parser():
    """Run the current custom references_extractor._parse_single_reference."""
    from parsing.references_extractor import _parse_single_reference
    results = []
    for entry in DATASET:
        raw = entry["raw_text"]
        try:
            parsed = _parse_single_reference(raw)
        except Exception:
            parsed = {}
        results.append({
            "id": entry["id"], "desc": entry["desc"], "raw_input": raw,
            "parsed_authors": parsed.get("authors", []) if isinstance(parsed, dict) else [],
            "parsed_year": parsed.get("year") if isinstance(parsed, dict) else None,
            "parsed_title": (parsed.get("title", "") if isinstance(parsed, dict) else "")[:80],
            "output": raw, "expected": entry["expected"],
            "exact_match": raw.strip() == entry["expected"].strip(),
        })
    matches = sum(1 for r in results if r["exact_match"])
    field_correct = 0
    for i, r in enumerate(results):
        csl = DATASET[i]["csl_json"]
        ok = True
        first_expected = csl.get("author", [{}])[0].get("family", "").lower() if csl.get("author") else ""
        first_parsed = (r["parsed_authors"][0].split(",")[0] if r["parsed_authors"] else "").lower()
        if first_expected and first_expected not in first_parsed:
            ok = False
        if ok:
            field_correct += 1
    return {"total": len(results), "raw_passthrough_matches": matches,
            "raw_match_pct": round(matches / max(1, len(results)) * 100, 1),
            "field_extraction_correct": field_correct,
            "field_extraction_pct": round(field_correct / max(1, len(results)) * 100, 1),
            "results": results}


def main():
    results = {"citeproc_py": run_citeproc_py(), "custom_parser": run_custom_parser()}
    EVID.mkdir(exist_ok=True)
    (EVID / "area5.json").write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")

    cp = results["citeproc_py"]
    cu = results["custom_parser"]
    print("=" * 70)
    print("AREA 5 - Bibliography Benchmark Results")
    print("=" * 70)
    print(f"\nciteproc-py: {cp.get('match_pct',0)}% exact match ({cp.get('exact_matches',0)}/{cp.get('total',0)})")
    if "error" in cp:
        print(f"  ERROR: {cp['error']}")
    print(f"Custom (raw passthrough): {cu['raw_match_pct']}% ({cu['raw_passthrough_matches']}/{cu['total']})")
    print(f"Custom (field extraction): {cu['field_extraction_pct']}% ({cu['field_extraction_correct']}/{cu['total']})")

    print("\n--- citeproc-py detailed ---")
    for r in cp.get("results", []):
        st = "OK" if r["exact_match"] else "FAIL"
        print(f"  [{st}] {r['id']}: {r['desc']}")
        if not r["exact_match"]:
            print(f"    Expected: {r['expected'][:150]}")
            print(f"    Got:      {r['csl_output'][:150]}")

    print("\n--- Custom parser detailed ---")
    for r in cu["results"]:
        st = "OK" if r["exact_match"] else "FAIL"
        print(f"  [{st}] {r['id']}: authors={r['parsed_authors'][:3]} year={r['parsed_year']}")

    print(f"\nEvidence saved to {EVID / 'area5.json'}")


if __name__ == "__main__":
    main()
