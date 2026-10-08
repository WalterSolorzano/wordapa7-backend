"""Exporta los schemas Pydantic de main.py a TypeScript (fuente unica de verdad).

Clase de bugs que esto mata: drift manual entre models.py y src/types/index.ts
(UpdateElementRequest.table_info perdido, ExplainElementRequest con schema
equivocado). Pipeline: FastAPI/openapi.json -> interfaces .d.ts.

Uso:
    python python/scripts/export_api_types.py [out.ts]

Default out: <repo>/src/types/api-generated.d.ts
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "python"))

HEADER = """\
// AUTO-GENERADO por python/scripts/export_api_types.py — NO editar a mano.
// Fuente de verdad: python/models.py (via openapi()). Regenerar:
//   npm run gen:api-types
"""


def _ts_name(ref: str) -> str:
    return ref.split("/")[-1].replace("−", "_")


def _map_type(schema: dict, schemas: dict) -> str:
    if "$ref" in schema:
        return _ts_name(schema["$ref"])
    if "anyOf" in schema:
        parts = {_map_type(s, schemas) for s in schema["anyOf"]}
        if len(parts) > 1:
            parts.discard("unknown")
        if parts == {"null", "string"}:
            return "string | null"
        return " | ".join(sorted(parts)) or "unknown"
    if "allOf" in schema:
        return " & ".join(_map_type(s, schemas) for s in schema["allOf"])
    if "enum" in schema:
        return " | ".join(json.dumps(v) for v in schema["enum"])
    t = schema.get("type")
    if t == "null":
        return "null"
    if t == "string":
        return "string"
    if t in ("integer", "number"):
        return "number"
    if t == "boolean":
        return "boolean"
    if t == "array":
        return f"Array<{_map_type(schema.get('items', {}), schemas)}>"
    if t == "object":
        extra = schema.get("additionalProperties")
        if isinstance(extra, dict):
            return f"Record<string, {_map_type(extra, schemas)}>"
        return "Record<string, unknown>"
    return "unknown"


def render_interfaces(schemas: dict) -> str:
    out = [HEADER, ""]
    for name, sch in sorted(schemas.items()):
        if not isinstance(sch, dict) or sch.get("type") != "object" and "properties" not in sch:
            # enums / aliases como type union plano
            mapped = _map_type(sch, schemas)
            if mapped != name and mapped != "unknown":
                out.append(f"export type {name} = {mapped}")
                out.append("")
            continue
        out.append(f"export interface {name} {{")
        required = set(sch.get("required", []))
        for prop, pspec in sch.get("properties", {}).items():
            ts_t = _map_type(pspec, schemas)
            opt = "" if prop in required else "?"
            desc = (pspec.get("description") or "").split("\n")[0][:90]
            comment = f"  /** {desc} */\n" if desc else ""
            out.append(f"{comment}  {prop}{opt}: {ts_t}")
        out.append("}")
        out.append("")
    return "\n".join(out)


def generate() -> str:
    from main import app  # noqa: PLC0415 — import tardio a proposito
    spec = app.openapi()
    return render_interfaces(spec.get("components", {}).get("schemas", {}))


def main() -> None:
    ts = generate()
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / "src" / "types" / "api-generated.d.ts"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(ts, encoding="utf-8")
    n = ts.count("export ")
    print(f"[gen:api-types] {len(ts.splitlines())} lineas, {n} exports -> {out}")


if __name__ == "__main__":
    main()
