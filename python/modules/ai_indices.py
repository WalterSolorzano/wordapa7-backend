"""Motor de detección de texto generado por IA — 6 índices de comportamiento.

Basado en patrones de comportamiento (posición, uniformidad, co-ocurrencia),
NO en listas negras de palabras. Las frases sospechosas existen pero solo
suman evidencia; nunca marcan solas.

Índices (0..1, mayor = más "IA"):
- IPP  predictibilidad posicional del conector
- ICS  carga semántica baja del conector (proxy local)
- IVE  uniformidad estructural (CV de longitudes)
- IRF  repetición de familias de patrón por sección
- IEL  baja entropía léxica (TTR + adjetivos genéricos)
- IIN  ausencia de imperfección natural (ortografía/coloquialismos)

Score combinado ponderado → zona: humano | inconcluso | probable_ia | alta_ia.
"""

from __future__ import annotations

import re
import statistics
from typing import Any, Dict, List

# ---------------------------------------------------------------- léxicos
CONNECTORS = [
    "asimismo", "sin embargo", "no obstante", "por consiguiente",
    "en consecuencia", "por lo tanto", "además", "igualmente",
    "por otra parte", "de igual manera", "en definitiva",
]

_HEDGING = re.compile(
    r"\b(es importante|cabe destacar|cabe mencionar|es necesario considerar|"
    r"es fundamental|juega un papel|desempeña un papel)\b",
    re.IGNORECASE,
)
_METATEXT = re.compile(
    r"\b(en este (?:trabajo|documento|sentido)|a continuación|"
    r"como se (?:mencionó|indicó) anteriormente)\b",
    re.IGNORECASE,
)
_BALANCE = re.compile(
    r"\b(por un lado|por otro lado|en primer lugar|en segundo lugar)\b",
    re.IGNORECASE,
)
_GENERIC_ADJ = re.compile(
    r"\b(fundamental|clave|crucial|robusto|óptimo|significativo|"
    "relevante|importante|esencial|integral)\\b",
    re.IGNORECASE,
)

_SENT_SPLIT = re.compile(r"[.!?]+(?:\s|$)")
_WORD = re.compile(r"[a-záéíóúñü]+", re.IGNORECASE)

STOPWORDS = set("""el la los las un una unos unas de del al a en por para con sin
sobre entre y o u que como su sus mi tu se lo le nos me te es son fue fueron ha han
han haya han sido era eran muy más más pero cuando donde quien cual""".split())


def _words(text: str) -> List[str]:
    return _WORD.findall(text or "")


def _sentences(text: str) -> List[str]:
    return [s.strip() for s in _SENT_SPLIT.split(text or "") if s.strip() and len(s.strip()) > 2]


def _cv(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean = statistics.mean(values)
    if mean == 0:
        return 0.0
    return statistics.pstdev(values) / mean


# ---------------------------------------------------------------- índices
def index_pp(paragraphs: List[str]) -> float:
    """% de conectores en posición inicial absoluta (primeras 3 palabras)."""
    total = 0
    initial = 0
    for p in paragraphs:
        low = (p or "").lower()
        words = low.split()
        for conn in CONNECTORS:
            idx = 0
            while True:
                i = low.find(conn, idx)
                if i < 0:
                    break
                total += 1
                prefix_words = len(low[:i].split())
                if prefix_words <= 3:
                    initial += 1
                idx = i + len(conn)
    return initial / total if total else 0.0


def index_ics(paragraphs: List[str]) -> float:
    """Proxy: conector seguido de generalidad/hedging vs dato concreto."""
    decorative = 0
    total = 0
    for p in paragraphs:
        low = (p or "").lower()
        for conn in CONNECTORS:
            idx = 0
            while True:
                i = low.find(conn, idx)
                if i < 0:
                    break
                tail = low[i + len(conn): i + len(conn) + 90]
                total += 1
                # Generalización/hedging inmediato o ausencia de datos concretos
                has_data = bool(re.search(r"\d|%|\b(19|20)\d{2}\b", tail))
                is_generic = bool(_HEDGING.search(tail[:40])) or len(tail.split()) < 4
                if is_generic or not has_data:
                    decorative += 1
                idx = i + len(conn)
    return decorative / total if total else 0.0


def index_ive(paragraphs: List[str]) -> float:
    """Uniformidad estructural: 1 - CV combinado (normalizado)."""
    sents: List[float] = []
    paras_lens: List[float] = []
    for p in paragraphs:
        paras_lens.append(float(len(_words(p))))
        for s in _sentences(p):
            sents.append(float(len(_words(s))))
    cv_s = _cv(sents)
    cv_p = _cv(paras_lens)
    combined = (cv_s + cv_p) / 2
    # CV humano típico ≥ 0.5; IA < 0.35 → mapear linealmente a 0..1
    return max(0.0, min(1.0, (0.55 - combined) / 0.45))


def index_irf(sections: List[List[str]]) -> float:
    """Familias de patrón co-ocurriendo por sección, repetidas."""
    if not sections:
        return 0.0
    section_scores: List[float] = []
    for sec in sections:
        text = " ".join(sec).lower()
        fams = 0
        if _HEDGING.search(text):
            fams += 1
        if _METATEXT.search(text):
            fams += 1
        if _BALANCE.search(text):
            fams += 1
        if re.search(r"\b(?:primero|segundo|tercero)\b", text):
            fams += 1
        if any(c in text for c in ("en conclusión", "en resumen", "en síntesis")):
            fams += 1
        section_scores.append(min(1.0, fams / 3))
    if len(section_scores) < 2:
        return section_scores[0] * 0.6 if section_scores else 0.0
    # Co-ocurrencia sostenida: media penalizada si no repite en todas
    return min(section_scores) * 0.6 + (sum(section_scores) / len(section_scores)) * 0.4


def index_iel(paragraphs: List[str]) -> float:
    """Baja entropía léxica: TTR bajo + densidad de adjetivos genéricos."""
    all_words: List[str] = []
    generic_hits = 0
    total_adj_like = 0
    for p in paragraphs:
        ws = [w.lower() for w in _words(p)]
        all_words.extend(w for w in ws if w not in STOPWORDS)
        low = p.lower()
        generic_hits += len(_GENERIC_ADJ.findall(low))
        total_adj_like += max(1, len(ws) // 20)
    if not all_words:
        return 0.0
    ttr = len(set(all_words)) / len(all_words)
    generic_density = generic_hits / max(1, total_adj_like)
    score_ttr = max(0.0, min(1.0, (0.55 - ttr) / 0.30))
    score_gen = min(1.0, generic_density / 0.05)
    return score_ttr * 0.6 + score_gen * 0.4


def index_iin(imperfection_signals: int, paragraphs: int) -> float:
    """Ausencia de imperfección natural (señal inversa).

    imperfection_signals: conteo de typos/errores naturales detectados por el
    auditor ortográfico + coloquialismos. Texto largo limpio = sospechoso.
    """
    if paragraphs == 0:
        return 0.0
    density = imperfection_signals / paragraphs
    # Humano: ≥0.05 señales/párrafo. Menor → más sospechoso.
    return max(0.0, min(1.0, (0.06 - density) / 0.06))


WEIGHTS = {"IPP": 0.22, "ICS": 0.13, "IVE": 0.25, "IRF": 0.18, "IEL": 0.14, "IIN": 0.08}


def compute_ai_indices(elements_texts: List[str], imperfection_signals: int = 0) -> Dict[str, Any]:
    """Calcula los 6 índices + score ponderado + zona."""
    paragraphs = [t for t in elements_texts if t and len(t.strip()) > 40]
    if len(paragraphs) < 3:
        return {
            "indices": {k: 0.0 for k in WEIGHTS},
            "score": 0.0,
            "zone": "insuficiente",
        }

    sections: List[List[str]] = []
    current: List[str] = []
    for t in elements_texts:
        if t and len(t.strip()) > 40:
            current.append(t)
        elif current:
            sections.append(current)
            current = []
    if current:
        sections.append(current)

    indices = {
        "IPP": round(index_pp(paragraphs), 3),
        "ICS": round(index_ics(paragraphs), 3),
        "IVE": round(index_ive(paragraphs), 3),
        "IRF": round(index_irf(sections), 3),
        "IEL": round(index_iel(paragraphs), 3),
        "IIN": round(index_iin(imperfection_signals, len(paragraphs)), 3),
    }
    score = sum(indices[k] * w for k, w in WEIGHTS.items())

    elevated = sum(1 for v in indices.values() if v >= 0.6)
    core_cooccur = indices["IPP"] >= 0.6 and indices["IVE"] >= 0.6 and indices["IRF"] >= 0.6

    if score < 0.35:
        zone = "probable_humano"
    elif core_cooccur or elevated >= 3:
        zone = "probable_ia" if score < 0.62 else "alta_ia"
    elif score < 0.5:
        zone = "inconcluso"
    else:
        zone = "probable_ia"

    return {
        "indices": indices,
        "score": round(score, 3),
        "zone": zone,
        "elevated_count": elevated,
        "paragraphs_analyzed": len(paragraphs),
    }
