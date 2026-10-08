from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from content.builder import build_content_document
from content.emit import emit_docx


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="content", description="Construye un .docx APA 7 desde un payload JSON.")
    parser.add_argument("payload", help="Ruta al JSON de contenido.")
    parser.add_argument("-o", "--output", required=True, help="Ruta del .docx de salida.")
    parser.add_argument("--no-com", action="store_true", help="No usar Word COM aunque esté disponible.")
    args = parser.parse_args(argv)

    payload_path = Path(args.payload)
    if not payload_path.exists():
        print(f"No existe el archivo: {payload_path}", file=sys.stderr)
        return 2
    try:
        payload = json.loads(payload_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"JSON inválido: {exc}", file=sys.stderr)
        return 1

    from config import STORAGE_DIR

    result = build_content_document(payload, STORAGE_DIR)
    for warning in result.warnings:
        print(f"warning: {warning}", file=sys.stderr)
    final = emit_docx(result.document, Path(args.output), try_com=not args.no_com)
    print(str(final))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
