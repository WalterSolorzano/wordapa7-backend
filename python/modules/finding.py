"""Constructor de hallazgos del auditor.

Vive en su propio archivo para que `phase_scope` y `proactive_auditor` puedan
construir hallazgos sin importarse entre si. Antes `_mk` estaba dentro de
`proactive_auditor`, y mover los criterios de fase a otro modulo sin esto habria
sido un ciclo de import.

`read_only` existe para la portada: un hallazgo de solo lectura informa de un
incumplimiento pero NUNCA trae `suggestion`. No es una convencion, es la
invariante: `AGENTS.md` §1 dice que `use_original_cover` no puede mutar la
portada original, y lo unico que la aplicadora puede escribir es lo que este
diccionario le ofrece.
"""

from __future__ import annotations

from typing import Any, Dict, Optional


def mk(element_id: str, text: str, start: int, end: int, kind: str,
       severity: str, message: str, suggestion: Optional[str] = None,
       *, phase: str = "global", read_only: bool = False) -> Dict[str, Any]:
    lo = max(0, start - 25)
    hi = min(len(text), end + 25)
    prefix = ("…" if lo > 0 else "") + text[lo:start]
    core = text[start:end]
    suffix = text[end:hi] + ("…" if hi < len(text) else "")
    f: Dict[str, Any] = {
        "element_id": element_id,
        "start": start,
        "end": end,
        "excerpt": f"{prefix}{core}{suffix}".strip(),
        "kind": kind,
        "severity": severity,
        "message": message,
        "source": "local",
        "phase": phase,
        "read_only": read_only,
    }
    # Un hallazgo de solo lectura jamas propone texto: no puede haber escritura.
    if suggestion and not read_only:
        f["suggestion"] = suggestion
    return f
