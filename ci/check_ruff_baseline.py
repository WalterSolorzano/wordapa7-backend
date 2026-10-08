"""Gate de ratchet para CI: compara hallazgos ruff contra ci/ruff-baseline.txt.

Reglas (deuda congelada):
  - Par (archivo, codigo) ausente del baseline -> FALLO (error nuevo).
  - Par presente pero conteo mayor que el baseline -> FALLO.
  - Conteo igual o menor -> OK.

Uso: python ci/check_ruff_baseline.py <salida-concise-de-ruff>
El baseline usa rutas con '/' tal como las emite ruff en Linux.
"""
from __future__ import annotations

import re
import sys
from collections import Counter
from pathlib import Path

BASELINE = Path(__file__).resolve().parent / "ruff-baseline.txt"
FINDING = re.compile(r"^(?P<file>.*):(?P<line>\d+):(?P<col>\d+): (?P<code>[FEWI]\d+) ")


def load_baseline() -> Counter:
    counts: Counter = Counter()
    if not BASELINE.exists():
        print(f"FALTA baseline: {BASELINE}", file=sys.stderr)
        sys.exit(2)
    for raw in BASELINE.read_text(encoding="utf-8").splitlines():
        raw = raw.strip()
        if not raw:
            continue
        try:
            file, code, n = raw.rsplit("|", 2)
            counts[(file, code)] = int(n)
        except ValueError:
            print(f"Baseline corrupta: {raw!r}", file=sys.stderr)
            sys.exit(2)
    return counts


def main() -> int:
    if len(sys.argv) != 2:
        print("Uso: check_ruff_baseline.py <ruff-concise-output>", file=sys.stderr)
        return 2

    current: Counter = Counter()
    for raw in Path(sys.argv[1]).read_text(encoding="utf-8").splitlines():
        m = FINDING.match(raw)
        if m:
            # ruff en Windows emite '\\'; normaliza a '/' como el baseline
            current[(m["file"].replace("\\", "/"), m["code"])] += 1

    baseline = load_baseline()
    violations = []
    for (file, code), n in sorted(current.items()):
        allowed = baseline.get((file, code), 0)
        if n > allowed:
            violations.append(f"{file}: {code} x{n} (baseline {allowed})")

    if violations:
        print("NUEVOS hallazgos ruff (superan el baseline congelado):")
        for v in violations:
            print(f"  {v}")
        print("\nArregla estos o, si son aceptables, actualiza ci/ruff-baseline.txt.")
        return 1

    print(f"OK: {sum(current.values())} hallazgos dentro del baseline "
          f"({len(current)} pares).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
