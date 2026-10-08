"""Score global "¿Qué tan APA está?" — cerebro del diagnóstico por áreas.
Entrada: textos del documento + conteos visuales del cliente.
Salida: total 0-100 + categorías con ícono, score y UN problema principal cada una.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List

_H1 = re.compile(r"^(?:\d+\.\s+\S|[ivxlcdm]+\.\s+\S|(?:resumen|abstract|introducci[oó]n|conclusi[oó]n|referencias|bibliograf[ií]a|metodolog[ií]a|resultados|discusi[oó]n|anexos?))$", re.I)
_H2 = re.compile(r"^\d+\.\d+\.?\s+\S")
_TBL_LBL = re.compile(r"^\s*tabla\s+(\d{1,2})\b", re.I)
_FIG_LBL = re.compile(r"^\s*figura\s+(\d{1,2})\b", re.I)
_CITE = re.compile(r"\([A-ZÁÉÍÓÚÑ][^()]{2,50},\s*(?:19|20)\d{2}[a-z]?\)")
_DANGLE = re.compile(r"\b(?:pero|aunque|porque|ya que|sin embargo)\s*\.?\s*$", re.I)
_YO = re.compile(r"\b(creo|pienso|opino|me gusta)\b", re.I)


def _cover_floor(texts: List[str]) -> int:
    for i, t in enumerate(texts[:60]):
        s = (t or "").strip()
        if not s:
            continue
        if _H1.match(s.strip()) or _H2.match(s) or len(s) > 180 or _CITE.search(s):
            return i
    return 0


def compute(texts: List[str], tables: int = 0, figures: int = 0,
            visual: Dict[str, float] | None = None) -> Dict[str, Any]:
    texts = [t or "" for t in texts]
    n = len(texts)
    floor = _cover_floor(texts)

    # ── Portada ──
    cover_score = 100 if floor > 2 else (55 if floor > 0 else 25)
    cover_issue = "" if floor > 2 else "No detecté portada clara al inicio"

    # ── Estructura (jerarquía de títulos) ──
    body = texts[floor:]
    h1 = sum(1 for t in body if _H1.match(t.strip()))
    h2 = sum(1 for t in body if _H2.match(t))
    struct = min(100, (40 if h1 >= 1 else 0) + (35 if h2 >= 1 else 15) + (25 if h1 + h2 >= max(3, n // 120) else 10))
    struct_issue = "" if struct >= 80 else ("Falta jerarquía de subtítulos" if h2 == 0 else "Pocos títulos para la extensión")

    # ── Citas ↔ Referencias ──
    refs_start = -1
    for i, t in enumerate(body):
        if t.strip().lower().rstrip(":") in ("referencias", "bibliografía", "bibliografia"):
            refs_start = i
            break
    citas = sum(len(_CITE.findall(t)) for t in body[:refs_start if refs_start > 0 else n])
    ref_lines = [t for t in (body[refs_start + 1:] if refs_start > -1 else []) if len(t) > 45]
    if citas == 0:
        cit_score, cit_issue = 70, "No encontré citas en el texto"
    elif refs_start == -1:
        cit_score, cit_issue = 20, f"{citas} cita(s) sin sección de referencias"
    else:
        matched = 0
        for m in re.finditer(r"\(([A-ZÁÉÍÓÚÑ][^(),]{2,40}),\s*((?:19|20)\d{2})", " ".join(body[:refs_start])):
            a, y = m.group(1).split()[0].rstrip(","), m.group(2)
            if any(a.lower() in rl.lower() and y in rl for rl in ref_lines):
                matched += 1
        total_pairs = max(citas, 1)
        cit_score = int(min(100, 100 * matched / total_pairs)) if total_pairs else 70
        gap = total_pairs - matched
        cit_issue = "" if gap == 0 else f"{gap} cita(s) sin referencia correspondiente"

    # ── Tablas y Figuras (captions) ──
    tbl_labels = set(int(m.group(1)) for t in body for m in [_TBL_LBL.match(t)] if m)
    fig_labels = set(int(m.group(1)) for t in body for m in [_FIG_LBL.match(t)] if m)
    tscore = 100 if tables == 0 else min(100, 100 * len(tbl_labels) / max(tables, 1))
    fscore = 100 if figures == 0 else min(100, 100 * len(fig_labels) / max(figures, 1))
    tf_score = int((tscore + fscore) / 2)
    tf_issue = "" if tf_score >= 90 else (
        f"Faltan rótulos: {tables - len(tbl_labels)} tabla(s), {figures - len(fig_labels)} figura(s)"
        if tf_score < 90 else "")

    # ── Estilo textual ──
    longs = [t for t in body if len(t) > 200]
    dang = sum(1 for t in body if _DANGLE.search(t))
    yo = sum(1 for t in body if _YO.search(t))
    style = 100
    style_issues: List[str] = []
    if dang:
        style -= min(30, dang * 8); style_issues.append(f"{dang} frase(s) colgantes")
    if yo:
        style -= min(25, yo * 8); style_issues.append("Primera persona académica")
    if longs and n and len(longs) / max(len([t for t in body if t]), 1) > 0.4:
        style -= 10; style_issues.append("Párrafos muy largos (>200)")
    style = max(style, 0)
    style_issue = "; ".join(style_issues[:1])

    cats = [
        {"id": "portada", "label": "Portada", "icon": "cover", "score": cover_score, "issue": cover_issue},
        {"id": "estructura", "label": "Estructura", "icon": "structure", "score": struct, "issue": struct_issue},
        {"id": "citas", "label": "Citas y Refs", "icon": "cite", "score": cit_score, "issue": cit_issue},
        {"id": "tablasfig", "label": "Tablas/Fig.", "icon": "table", "score": tf_score, "issue": tf_issue},
        {"id": "estilo", "label": "Estilo", "icon": "style", "score": style, "issue": style_issue},
    ]
    if visual:
        vf = visual.get("font_ok", 1.0)
        vs = visual.get("size_ok", 1.0)
        vsp = visual.get("spacing_ok", 1.0)
        v = int(100 * (vf * 0.4 + vs * 0.3 + vsp * 0.3))
        vi = ""
        if v < 90:
            parts = []
            if vf < 0.9: parts.append("fuente")
            if vs < 0.9: parts.append("tamaño")
            if vsp < 0.9: parts.append("interlineado")
            vi = "Revisar " + ", ".join(parts)
        cats.append({"id": "formato", "label": "Formato", "icon": "font", "score": v, "issue": vi})

    present = [c for c in cats if c["score"] is not None]
    total = round(sum(c["score"] for c in present) / max(len(present), 1))
    worst = sorted(present, key=lambda c: c["score"])[:3]
    return {
        "total": total,
        "band": "alta" if total >= 85 else ("media" if total >= 60 else "baja"),
        "categories": cats,
        "top_issues": [{"id": c["id"], "label": c["label"], "issue": c["issue"]}
                       for c in worst if c["issue"]],
        "counts": {"paragraphs": n, "headings_h1": h1, "headings_h2": h2,
                   "citations": citas, "references": len(ref_lines),
                   "tables": tables, "figures": figures},
    }
