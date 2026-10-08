"""CLI del Traductor de Rúbrica (motor oculto, 0 tokens).

Uso:
    python -m content.rubric_cli <rubrica.docx|rubrica.xlsx> <documento.docx> [-o informe.json]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="content.rubric_cli",
        description="Informe de cumplimiento de una rúbrica (Word/Excel) sobre un .docx.",
    )
    parser.add_argument("rubric", help="Ruta a la rúbrica (.docx o .xlsx).")
    parser.add_argument("docx", help="Ruta al documento .docx a evaluar.")
    parser.add_argument("-o", "--output", help="Ruta del JSON de salida (por defecto: stdout).")
    args = parser.parse_args(argv)

    rubric = Path(args.rubric)
    docx = Path(args.docx)
    if not rubric.exists():
        print(f"No existe la rúbrica: {rubric}", file=sys.stderr)
        return 2
    if not docx.exists():
        print(f"No existe el documento: {docx}", file=sys.stderr)
        return 2

    from content.rubric import build_rubric_report

    report = build_rubric_report(rubric, docx)
    text = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        out = Path(args.output)
        out.write_text(text, encoding="utf-8")
        print(str(out))
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
