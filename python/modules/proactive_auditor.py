"""Revisor proactivo de escritura (capa local, siempre disponible).

Detecta sin red y sin API key:
- primera persona con posición exacta (nunca 'me'/'mi' sueltos)
- muletillas / frases típicas de IA
- texto mal pegado (falta espacio tras puntuación, dobles espacios/puntos,
  palabra duplicada consecutiva)
- ortografía frecuente unívoca ES (diccionario cerrado)

Cada hallazgo trae start/end sobre el texto del elemento para que la UI
pueda citar el fragmento exacto en vez de marcar el párrafo entero.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any, Dict, List, Optional, Tuple
from collections import Counter

from modules.audit_registry import registrar, reusar
from modules.finding import mk
from modules.phase_scope import (  # noqa: E402
    GLOBAL,
    NO_PHASE_KEY,
    PORTADA_KEY,
    build_global_context,
    build_phase_map,
    global_findings,
    phase_findings,
)

_WORD = re.compile(r"[a-záéíóúñü]+", re.IGNORECASE)
_STOPWORDS = set("""el la los las un una unos unas de del al a en por para con sin sobre
entre y o u que como su sus mi tu se lo le nos me te es son fue fueron ha han haya sido
era eran muy más pero cuando donde quien cual""".split())

# ---------------------------------------------------------------- primera persona
# Solo pronombres claros + frases completas de opinión. 'me'/'mi' solos
# generaban falsos positivos ("el libro que me recomendaron").
_FIRST_PERSON = re.compile(
    r"\b(?:yo|nosotros|nosotras|nuestro|nuestra|m[ií])\b"
    r"|(?:creo|pienso|considero|opino)\s+que",
    re.IGNORECASE,
)

_QUOTES = re.compile(r"[«\"“”'‘’]")

# ---------------------------------------------------------------- frases IA (Patrones unívocos de modelos de lenguaje)
_AI_PHRASES = [
    "cabe destacar", "como modelo de lenguaje", "no puedo ayudar", "hasta luego", "sin duda alguna",
    "juega un papel crucial", "desempeña un papel fundamental",
    "en el mundo actual", "en la sociedad actual",
    "desde tiempos inmemoriales", "es importante recalcar que",
    "es menester destacar", "es de suma importancia",
    "un pilar fundamental", "un papel primordial",
    "a modo de conclusión se puede afirmar", "en resumidas cuentas podemos decir",
    "un enfoque holístico", "un análisis profundo", "una mirada detallada",
    "un enfoque exhaustivo", "una comprensión más profunda", "perspectiva holística",
    "marco conceptual", "cuerpo teórico", "panorama amplio",
]

_MULETILLA_START = re.compile(r"^(?:además|asimismo|por otro lado|en primer lugar)\b[,:]?",
                              re.IGNORECASE)

# ---------------------------------------------------------------- Taxonomía de Bloom (Mega-Set)
BLOOM_VERBS = {
    'recordar':   ['citar', 'definir', 'describir', 'enumerar', 'identificar', 'listar', 'nombrar', 'recordar', 'reconocer', 'reproducir', 'señalar'],
    'entender':   ['clasificar', 'comparar', 'contrastar', 'discutir', 'explicar', 'expresar', 'ilustrar', 'interpretar', 'parafrasear', 'resumir', 'traducir'],
    'aplicar':    ['aplicar', 'calcular', 'demostrar', 'dramatizar', 'emplear', 'ejecutar', 'escoger', 'ilustrar', 'practicar', 'resolver', 'usar', 'utilizar'],
    'analizar':   ['analizar', 'categorizar', 'comparar', 'contrastar', 'diferenciar', 'distinguir', 'examinar', 'investigar', 'relacionar', 'separar', 'subdividir'],
    'evaluar':    ['argumentar', 'defender', 'evaluar', 'justificar', 'validar', 'valorar', 'verificar', 'criticar', 'priorizar', 'recomendar', 'seleccionar'],
    'crear':      ['asumir', 'combinar', 'compilar', 'componer', 'construir', 'diseñar', 'desarrollar', 'formular', 'generar', 'integrar', 'inventar', 'planear', 'planificar', 'proponer', 'sintetizar'],
}

BLOOM_LEVELS = {
    'recordar': 1, 'entender': 2, 'aplicar': 3,
    'analizar': 4, 'evaluar': 5, 'crear': 6,
}

# La lista de verbos imprecisos vive en `phase_scope`, que es su dueno: la
# usan el criterio de la fase de objetivos y `audit_objective` mas abajo, y dos
# copias de la misma lista divergen solas. Se reexporta porque el resto del
# modulo —y sus tests— la siguen importando desde aca.
from modules.phase_scope import VAGUE_VERBS  # noqa: E402,F401

# ---------------------------------------------------------------- B1 repetición
_SENT_START_DUP = re.compile(r"^(?:el|la|los|las|un|una|es|se|su|en|al|de)\b", re.IGNORECASE)


def _audit_repeticion(eid: str, text: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    ws = [w.lower() for w in _WORD.findall(text)]
    content = [w for w in ws if w not in _STOPWORDS and len(w) >= 4]
    if len(content) >= 4:
        counts = Counter(content)
        for w, c in counts.items():
            if c >= 3:
                i = text.lower().find(w)
                if i >= 0:
                    orig_word = text[i:i+len(w)]
                    out.append(_mk(eid, text, i, i + len(w), "repeticion", "info",
                                   f'La palabra o marca "{orig_word}" se repite {c} veces en este párrafo. Considera usar pronombres o variaciones.'))
                break
    # Inicios de oración idénticos
    # Encontrar cada oración con su offset inicial exacto en el texto del párrafo
    sent_matches = list(re.finditer(r'(?:^|[.!?]+\s+)(["\'«»¿¡]*\b\w+\b)', text))
    if len(sent_matches) >= 3:
        starts: Dict[str, List[tuple[int, int, str]]] = {}
        for m in sent_matches:
            w_start, w_end = m.span(1)
            raw_w = m.group(1)
            first = raw_w.lower()
            starts.setdefault(first, []).append((w_start, w_end, raw_w))

        for first, occs in starts.items():
            c = len(occs)
            if c >= 3:
                for w_start, w_end, orig_w in occs:
                    out.append(_mk(eid, text, w_start, w_end, "repeticion", "info",
                                   f'{c} oraciones empiezan con "{orig_w}" — varía la apertura'))
                break
    return out


def detect_repeated_ngrams(elements: List[Any]) -> List[Dict[str, Any]]:
    """Detecta frases de 3 a 6 palabras que se repiten 3 o más veces en el documento."""
    out: List[Dict[str, Any]] = []
    ngram_occurrences: Dict[str, List[tuple[str, int, int, str, str]]] = {}  # phrase -> [(eid, start, end, snippet, full_text)]

    for e in elements:
        etype = getattr(getattr(e, "type", None), "value", getattr(e, "type", ""))
        if str(etype) not in ("paragraph", "para"):
            continue
        eid = str(getattr(e, "id", ""))
        text = getattr(e, "text", "") or ""
        word_positions = []
        for m in _WORD.finditer(text):
            word_positions.append((m.group(0), m.start(), m.end()))

        if len(word_positions) < 3:
            continue

        for n in range(3, 7):
            for i in range(len(word_positions) - n + 1):
                window = word_positions[i : i + n]
                phrase_words = [w[0].lower() for w in window]
                if not any(w not in _STOPWORDS and len(w) >= 3 for w in phrase_words):
                    continue
                phrase_key = " ".join(phrase_words)
                start_pos = window[0][1]
                end_pos = window[-1][2]
                snippet = text[start_pos:end_pos]

                if phrase_key not in ngram_occurrences:
                    ngram_occurrences[phrase_key] = []
                ngram_occurrences[phrase_key].append((eid, start_pos, end_pos, snippet, text))

    flagged_keys = sorted(
        [k for k, occurrences in ngram_occurrences.items() if len(occurrences) >= 3],
        key=lambda k: (len(k.split()), len(k)),
        reverse=True,
    )

    # Filtrar subfrases contenidas en frases más largas ya marcadas
    filtered_keys: List[str] = []
    for key in flagged_keys:
        if not any(key != longer and key in longer for longer in filtered_keys):
            filtered_keys.append(key)

    seen_ranges_per_elem: Dict[str, List[tuple[int, int]]] = {}

    for key in filtered_keys:
        if len(out) >= 5:  # Cáp máximo de 5 hallazgos de repetición n-gram por documento
            break
        occurrences = ngram_occurrences[key]
        cnt = len(occurrences)
        for eid, start, end, snippet, full_text in occurrences[:3]:
            if eid not in seen_ranges_per_elem:
                seen_ranges_per_elem[eid] = []
            if any(s <= start and end <= e_pos for s, e_pos in seen_ranges_per_elem[eid]):
                continue
            seen_ranges_per_elem[eid].append((start, end))
            out.append(_mk(
                eid,
                full_text,
                start,
                end,
                "ngram_repetition",
                "warn",
                f'La frase "{snippet}" se repite {cnt} veces en el documento; varía la redacción.',
            ))

    return out


_SPACY_NLP = None
try:
    import spacy
    _SPACY_NLP = spacy.load("es_core_news_sm")
except Exception:
    _SPACY_NLP = None

_SPELL_CHECKER = None
try:
    from spellchecker import SpellChecker
    _SPELL_CHECKER = SpellChecker(language="es")
except Exception:
    _SPELL_CHECKER = None


def _audit_spacy_and_spellchecker(eid: str, text: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if not text or len(text) < 15:
        return out

    if _SPACY_NLP:
        try:
            doc = _SPACY_NLP(text)
            for i, token in enumerate(doc[:-2]):
                if token.lemma_ in ("ser", "haber") and doc[i + 1].pos_ == "VERB" and doc[i + 2].lemma_ == "por":
                    start = token.idx
                    end = doc[i + 2].idx + len(doc[i + 2].text)
                    out.append(_mk(
                        eid, text, start, end, "passive_voice", "info",
                        f'Voz pasiva "{text[start:end]}"; considera usar voz activa e impersonal.'
                    ))

            for sent in doc.sents:
                words_in_sent = [t for t in sent if not t.is_punct]
                if len(words_in_sent) >= 40:
                    start = sent.start_char
                    end = sent.end_char
                    out.append(_mk(
                        eid, text, start, end, "long_sentence", "warn",
                        f'Oración extensa ({len(words_in_sent)} palabras); divide la idea para mejorar la claridad.'
                    ))
        except Exception:
            pass

    return out


# ---------------------------------------------------------------- B2 idea incompleta
_DANGLING_END = re.compile(
    r"\b(?:pero|aunque|sin embargo|no obstante|porque|pues|ya que|dado que|más|menos|etc|etcétera)\s*\.?\s*$",
    re.IGNORECASE,
)


def _audit_incompleta(eid: str, text: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    offset = 0
    for s in sents:
        core = s.rstrip(".!? ")
        if _DANGLING_END.search(core):
            start = text.find(core[-25:], max(0, offset))
            if start >= 0:
                out.append(_mk(eid, text, max(0, len(s) - 18) + offset,
                               min(len(text), len(s) + offset),
                               "incompleta", "warn",
                               "La oración queda colgando tras un conector"))
        if s.count("¿") != s.count("?"):
            out.append(_mk(eid, text, offset, offset + len(s), "incompleta", "error",
                           "Pregunta sin cerrar (falta ?)"))
        if s.count("(") != s.count(")"):
            out.append(_mk(eid, text, offset, offset + len(s), "incompleta", "error",
                           "Paréntesis sin cerrar"))
        offset += len(s) + 1
    return out


# ---------------------------------------------------------------- B4 cambio de persona
_PERSON_MARKS = {
    "1s": re.compile(r"\b(?:yo|mí|conmigo|mío|mis?|estoy|tengo|pienso|creo)\b", re.IGNORECASE),
    "1p": re.compile(r"\b(?:nosotros|nosotras|nuestro|nuestra|nuestros|nuestras)\b", re.IGNORECASE),
    "2": re.compile(r"\b(?:tú|usted|ustedes|te|les|contigo|tu[s]?|estás|piensas)\b", re.IGNORECASE),
}


def _audit_persona(eid: str, text: str) -> List[Dict[str, Any]]:
    found = [k for k, rx in _PERSON_MARKS.items() if rx.search(text)]
    if len(found) >= 2:
        i = 0
        for k in found:
            m = _PERSON_MARKS[k].search(text[i:] or "")
            if m:
                break
        return [_mk(eid, text, 0, min(40, len(text)), "persona", "warn",
                    f"Mezcla de personas gramaticales ({', '.join(found)}) en un mismo párrafo")]
    return []


# ---------------------------------------------------------------- B5 ambigüedad
_AMBIG_PRON = re.compile(r"\b(?:esto|eso|aquello|el cual|la cual|los cuales)\b", re.IGNORECASE)


def _audit_ambigua(eid: str, text: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for m in _AMBIG_PRON.finditer(text):
        prev_words = _words(text[max(0, m.start() - 120):m.start()])
        nouns_before = [w for w in prev_words if len(w) > 4][-6:]
        if len(nouns_before) >= 2:
            out.append(_mk(eid, text, m.start(), m.end(), "ambigua", "info",
                           f'"{m.group(0)}" puede referirse a varios antecedentes cercanos'))
    return out


# ---------------------------------------------------------------- B3 contraste hueco
_CONTRAST = re.compile(r"^\s*(?:pero|sin embargo|no obstante|por el contrario)\b", re.IGNORECASE)
_OPPOSITION = re.compile(
    r"\b(no|nunca|nadie|ningún|ninguna|menos|aunque|problema|falla|limitación|"
    "crisis|pérdida|rechazo|impedimento|dificultad)\\b",
    re.IGNORECASE,
)


def _audit_contrast_hueco(eid: str, text: str) -> List[Dict[str, Any]]:
    """Conector de contraste al inicio SIN señal de oposición en la oración anterior."""
    out: List[Dict[str, Any]] = []
    if _CONTRAST.match(text):
        # Solo marcable por la capa LLM/ventana (necesita oración previa).
        return out
    return out

# ---------------------------------------------------------------- pegado
_MISSING_SPACE = re.compile(r"([a-záéíóúñü])([.:;,])([A-ZÁÉÍÓÚÑ])")
_DOUBLE_SPACE = re.compile(r"\S(  +)\S")
_DOUBLE_PUNCT = re.compile(r"([^\s.!?])[.]{2,}(?![.])")
_DUP_WORD = re.compile(r"\b(\w+) \1\b", re.IGNORECASE)

# ---------------------------------------------------------------- ortografía
_TYPOS: Dict[str, str] = {
    "deberia": "debería", "tambien": "también", "asi": "así",
    "aqui": "aquí", "ademas": "además", "despues": "después",
    "quiza": "quizá", "solucion": "solución", "atencion": "atención",
    "informacion": "información", "investigacion": "investigación",
    "educacion": "educación", "poblacion": "población",
    "analisis": "análisis", "proposito": "propósito",
    "periodo": "período", "practica": "práctica",
    "politica": "política", "tecnologia": "tecnología",
    "economia": "economía", "redaccion": "redacción",
    "metodologia": "metodología", "seccion": "sección",
    "conclusion": "conclusión", "grafico": "gráfico",
    "paginas": "páginas", "parrafo": "párrafo",
    "sintesis": "síntesis", "teoria": "teoría",
    "pagina": "página", "numeros": "números",
    "evaluacion": "evaluación", "produccion": "producción",
    "distribucion": "distribución", "tecnica": "técnica",
    "logistica": "logística", "hipotesis": "hipótesis",
    "estadistica": "estadística", "matematica": "matemática",
    "fisica": "física", "quimica": "química",
    "caracteristica": "característica", "sistematica": "sistemática",
    "especifico": "específico", "especifica": "específica",
    "q": "que", "xq": "porque", "pq": "porque", "xbj": "objeto",
    "atravez": "a través", "asin": "así", "ce": "se", "valla": "valle",
    "haora": "ahora",
}
_TYPOS = {k: v for k, v in _TYPOS.items() if v}  # limpia placeholders
_TYPO_RE = re.compile(
    r"\b(" + "|".join(sorted(re.escape(k) for k in _TYPOS)) + r")\b",
    re.IGNORECASE,
)


def _in_quotes(text: str, pos: int) -> bool:
    """True si pos cae dentro de un tramo entre comillas."""
    count = 0
    for i, ch in enumerate(text):
        if i >= pos:
            break
        if _QUOTES.match(ch):
            count += 1
    return count % 2 == 1


def _words(text: str) -> List[str]:
    return _WORD.findall(text or "")


def _mk(element_id: str, text: str, start: int, end: int, kind: str,
        severity: str, message: str, suggestion: str | None = None,
        **extra: Any) -> Dict[str, Any]:
    # Envoltura de `finding.mk`. Los ~30 call sites de este modulo usan el
    # nombre y la firma de siempre, y por eso el hallazgo ahora lleva `phase` y
    # `read_only` sin que ninguno se haya tocado. `_mk` se vivio aqui para no
    # cambiar 30 lineas; ahora vive en `modules/finding.py` para que
    # `phase_scope` pueda construir hallazgos sin ciclo de import.
    return mk(element_id, text, start, end, kind, severity, message, suggestion,
              **extra)


def _match_phrase(text: str, phrase: str) -> re.Match[str] | None:
    """Coincidencia de frase con límites de palabra, no por subcadena simple."""
    normalized = re.escape(phrase)
    normalized = normalized.replace(r"\ ", r"\s+")
    return re.search(rf"(?<![a-záéíóúñü]){normalized}(?![a-záéíóúñü])", text, re.IGNORECASE)


def audit_elements(elements: List[Any]) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []
    muletilla_count = 0
    muletilla_hits: List[tuple[str, int, int]] = []

    # Pasada 1: muletillas iniciales para detectar repetición global.
    for e in elements:
        etype = getattr(getattr(e, "type", None), "value", getattr(e, "type", ""))
        if str(etype) not in ("paragraph", "para"):
            continue
        text = (getattr(e, "text", "") or "").strip()
        m = _MULETILLA_START.match(text)
        if m:
            muletilla_count += 1
            muletilla_hits.append((str(getattr(e, "id", "")), m.start(), m.end()))

    repeat_muletilla = muletilla_count > 3

    # Ámbito de fase por elemento, calculado UNA vez antes del bucle. Los H1
    # no se auditan como párrafos (el filtro de abajo los excluye): solo
    # delimitan. Sin este mapa cada regla tendría que volver a deducir su
    # ámbito del texto del elemento, que es el defecto que este mapa elimina.
    phase_by_id, _phase_spans = build_phase_map(elements)

    # Capa de reglas GLOBALES: el contexto se calcula UNA vez, antes del bucle,
    # porque R-G63 normaliza por mil palabras del documento entero y R-G34
    # recuerda que siglas ya se reportaron. Ver `phase_scope.global_findings`
    # para por que viven ahi y no sueltas aca.
    global_ctx = build_global_context(elements)

    for e in elements:
        etype = getattr(getattr(e, "type", None), "value", getattr(e, "type", ""))
        if str(etype) not in ("paragraph", "para"):
            continue
        eid = str(getattr(e, "id", ""))
        text = getattr(e, "text", "") or ""
        phase = phase_by_id.get(eid, NO_PHASE_KEY)

        # -- primera persona
        fp_matches = []
        for m in _FIRST_PERSON.finditer(text):
            if _in_quotes(text, m.start()):
                continue
            frag = text[max(0, m.start() - 18):m.start()].lower()
            # Si justo antes viene "que " o "como " y es pronombre no subjetivo
            if re.search(r"\b(?:que|como)\s+$", frag) and m.group(0).lower() in ("mi", "mí", "me"):
                continue
            fp_matches.append(m)

        merged_ranges = []
        for m in fp_matches:
            if not merged_ranges:
                merged_ranges.append([m.start(), m.end()])
            else:
                last = merged_ranges[-1]
                if m.start() <= last[1] + 20:  # "Yo considero que" en la misma cláusula
                    last[1] = max(last[1], m.end())
                else:
                    merged_ranges.append([m.start(), m.end()])

        for s_idx, e_pos in merged_ranges:
            findings.append(_mk(eid, text, s_idx, e_pos, "first_person", "warn",
                                "Primera persona en texto académico; usa redacción impersonal"))

        # -- frases IA
        for phrase in _AI_PHRASES:
            match = _match_phrase(text, phrase)
            if not match:
                continue
            findings.append(_mk(eid, text, match.start(), match.end(), "ai_phrase", "warn",
                                "Frase típica de IA o cliché; reformula con tus palabras"))

        # -- muletillas repetidas
        if repeat_muletilla:
            m = _MULETILLA_START.match(text.strip())
            if m:
                off = len(text) - len(text.lstrip())
                findings.append(_mk(eid, text, off + m.start(), off + m.end(), "muletilla", "info",
                                    "Conector repetido en varios párrafos; varía la transición"))

        # -- texto pegado
        for m in _MISSING_SPACE.finditer(text):
            findings.append(_mk(eid, text, m.start(2), m.end(2), "pegado", "error",
                                "Falta un espacio después del signo",
                                suggestion=" "))
        for m in _DOUBLE_PUNCT.finditer(text):
            findings.append(_mk(eid, text, m.start(), m.end(), "pegado", "warn",
                                "Puntuación duplicada"))
        for m in _DUP_WORD.finditer(text):
            if m.group(1).lower() in {"had", "that"}:  # falsos amigos EN
                continue
            findings.append(_mk(eid, text, m.start(), m.end(), "pegado", "warn",
                                f'Palabra duplicada: "{m.group(1)}"'))
        for m in _DOUBLE_SPACE.finditer(text):
            findings.append(_mk(eid, text, m.start(1), m.end(1), "pegado", "info",
                                "Doble espacio", suggestion=" "))

        # -- ortografía cerrada
        for m in _TYPO_RE.finditer(text):
            correct = _TYPOS[m.group(1).lower()]
            findings.append(_mk(eid, text, m.start(), m.end(), "ortografia", "error",
                                f'Ortografía: "{m.group(0)}" → "{correct}"',
                                suggestion=correct))

        # -- Criterios de la fase a la que pertenece este elemento.
        # Antes esto era `if any(kw in low_t for kw in ("objetivo", ...,
        # "meta"))`: "meta" esta dentro de "metodologia", asi que un parrafo
        # sobre metodologia disparaba la regla de verbos de objetivos, y
        # cualquier parrafo que mencionara "objetivo" tambien. Ahora el ambito
        # viene del H1 que contiene el elemento, nunca de su texto.
        findings.extend(phase_findings(phase, eid, text, mk=_mk))

        # En la fase de referencias / bibliografía, las entradas bibliográficas
        # tienen formato específico (autores, años, títulos, citas). Las reglas
        # globales de prosa narrativa (g71 cifra sin cita, g74 verbatim sin comillas,
        # etc.) o análisis de frases no aplican a entradas bibliográficas.
        if phase != "referencias":
            # -- Reglas globales: corren en TODO el documento, sin importar la
            # fase. Van despues de las de fase y no saben cual es: si lo supieran,
            # serian de fase.
            findings.extend(global_findings(eid, text, global_ctx, mk=_mk))

            # -- B1 repetición / B2 incompleta / B4 persona / B5 ambigüedad
            findings.extend(_audit_repeticion(eid, text))
            findings.extend(_audit_incompleta(eid, text))
            findings.extend(_audit_persona(eid, text))
            findings.extend(_audit_ambigua(eid, text))
            findings.extend(_audit_spacy_and_spellchecker(eid, text))

    # Pasada de portada: los elementos de portada NO son prosa, asi que el
    # filtro de arriba los excluye y no llegan al bucle principal. Pero la
    # portada SE MIDE: si su titulo esta mal, el usuario tiene que verlo en
    # Revision. Los criterios son de solo lectura, nunca traen `suggestion`, y
    # por eso no hay nada que la aplicadora pueda escribir sobre la portada
    # original (AGENTS.md §1, use_original_cover).
    #
    # Solo se mide EL TITULO, que es la primera linea con texto: `pre_classifier`
    # convierte cada parrafo anterior al limite de portada en `portada_block`,
    # asi que el autor, el docente y la fecha tambien son "de portada". Sin este
    # `titulo_visto`, cada linea puntuada de la portada salia reportada como un
    # titulo mal escrito, con el mensaje apuntando a la linea del autor.
    titulo_visto = False
    for e in elements:
        etype_ = str(getattr(getattr(e, "type", None), "value", getattr(e, "type", "")))
        if not (getattr(e, "is_cover_section", False) or etype_ == "portada_block"):
            continue
        eid = str(getattr(e, "id", ""))
        texto = getattr(e, "text", "") or ""
        es_titulo = not titulo_visto and bool(texto.strip())
        if es_titulo:
            titulo_visto = True
        findings.extend(phase_findings(
            phase_by_id.get(eid, PORTADA_KEY), eid, texto, mk=_mk,
            is_cover_title=es_titulo))

    # Pasada de títulos / encabezados (H1, H2, H3...):
    # Se auditan para ortografía cerrada y punto final indebido (APA 7: los títulos no llevan punto final).
    for e in elements:
        etype_ = str(getattr(getattr(e, "type", None), "value", getattr(e, "type", "")))
        if etype_ not in ("heading", "title"):
            continue
        # La portada ya se mide arriba con sus reglas especiales
        if getattr(e, "is_cover_section", False) or etype_ == "portada_block":
            continue
        eid = str(getattr(e, "id", ""))
        texto = getattr(e, "text", "") or ""
        if not texto.strip():
            continue

        # Ortografía cerrada en títulos
        for m in _TYPO_RE.finditer(texto):
            correct = _TYPOS[m.group(1).lower()]
            findings.append(_mk(eid, texto, m.start(), m.end(), "ortografia", "error",
                                f'Ortografía en título: "{m.group(0)}" → "{correct}"',
                                suggestion=correct))

        # Doble espacio / espacio antes de puntuación
        for m in _DOUBLE_SPACE.finditer(texto):
            findings.append(_mk(eid, texto, m.start(1), m.end(1), "pegado", "info",
                                "Doble espacio en título", suggestion=" "))

        # APA 7: Un encabezado no lleva punto final (salvo que sea encabezado de párrafo nivel 4/5)
        level = getattr(e, "heading_level", 1) or 1
        t_strip = texto.rstrip()
        if level <= 3 and t_strip.endswith("."):
            pos = len(t_strip) - 1
            findings.append(_mk(eid, texto, pos, pos + 1, "pegado", "warn",
                                f"Los títulos y encabezados de nivel {level} en APA 7 no llevan punto final.",
                                suggestion=""))

    # Repetición de n-gramas a nivel de documento
    findings.extend(detect_repeated_ngrams(elements))

    # Deduplicar solapamientos de primera persona ("Yo considero que..."
    # matchea pronombre y frase completa de la MISMA cláusula): fusiona
    # hallazgos separados por <=24 chars en uno solo.
    fp_sorted = sorted((f for f in findings if f["kind"] == "first_person"),
                       key=lambda f: f["start"])
    merged_fp: list[Dict[str, Any]] = []
    for f in fp_sorted:
        if merged_fp and f["start"] - merged_fp[-1]["end"] <= 24:
            prev = merged_fp[-1]
            prev["excerpt"] = (prev["excerpt"].split("…")[0] + "…" ) if False else prev["excerpt"]
            prev["end"] = max(prev["end"], f["end"])
            continue
        merged_fp.append(dict(f))
    others = [f for f in findings if f["kind"] != "first_person"]
    return sorted(merged_fp + others, key=lambda f: (f["start"], f["end"]))


# ---------------------------------------------------------------- capa LLM
_LLM_REVIEW_KINDS = {"ortografia", "muletilla"}
# Tope duro de coste: cuantos hallazgos viajan en UN prompt.
_LOTE_MAX = 60
# El contexto que se manda al LLM, y por lo tanto el que entra en la clave.
_CONTEXT_MAX = 160


class TopeDeLlamadas:
    """Limita cuantas llamadas a IA se hacen por documento (D10-bis).

    Un documento de 300 parrafos con RPM 10-30 haria inviable llamar por parrafo;
    el tope corta y se reporta cuantos elementos quedaron sin verificar.

    `maximo <= 0` significa ilimitado: el tope no corta nada y `sin_verificar`
    queda en cero.
    """

    def __init__(self, maximo: int):
        self.maximo = maximo
        self.usadas = 0
        self.sin_verificar = 0

    def permitir(self) -> bool:
        if self.maximo <= 0:
            self.usadas += 1
            return True
        if self.usadas < self.maximo:
            self.usadas += 1
            return True
        self.sin_verificar += 1
        return False


def _match_de(f: Dict[str, Any], text_by_id: Dict[str, str]) -> str:
    """El texto marcado por el hallazgo, tal cual lo va a ver el LLM.

    Vive en su propia funcion para que la clave de cache y el prompt no puedan
    separarse: si uno recortara distinto del otro, la cache devolveria el
    veredicto de OTRA pregunta creyendo que es esta.
    """
    return text_by_id.get(f.get("element_id", ""), "")[f["start"]:f["end"]]


def _clave_de_consulta(f: Dict[str, Any], text_by_id: Dict[str, str]) -> str:
    """La identidad de UNA pregunta al corrector.

    El Lote entero no sirve como clave —un hallazgo nuevo o un corrector distinto
    cambian el prompt y se repaga la llamada completa—, pero la respuesta que se
    pide es POR ITEM. La clave es entonces lo que el LLM vio de ese item: el
    tipo, el texto marcado, el contexto recortado y la fase.

    La FASE va porque la misma palabra repetida en Metodo y en Resultados son dos
    preguntas distintas: los motores con ambito meten la fase en el prompt, y sin
    ella una contamina a la otra.
    """
    crudo = "|".join((
        f.get("kind", ""),
        _match_de(f, text_by_id),
        f.get("excerpt", "")[:_CONTEXT_MAX],
        f.get("phase") or "global",
    ))
    return hashlib.sha256(crudo.encode("utf-8")).hexdigest()


def _aplicar_veredicto(f: Dict[str, Any],
                        veredicto: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """El hallazgo segun lo que dijo el corrector, o `None` si es falso positivo.

    Un veredicto AUSENTE no es un veredicto negativo: sin veredicto (o con un
    sobre vacio) el hallazgo queda exactamente como estaba, porque un corrector
    que no hablo no puede borrar lo que el motor local si vio. El original nunca
    se muta: una sugerencia se aplica sobre una copia.
    """
    if not veredicto:
        return f
    if veredicto.get("keep", True):
        return f
    sugerencia = veredicto.get("suggestion")
    if not sugerencia:
        return None
    g = dict(f)
    g["suggestion"] = str(sugerencia)
    g["source"] = "llm"
    return g


# El prompt del corrector. Vive aca, y no dentro de la llamada, porque es la
# mitad del sistema y tiene que poder compararse con el prompt que mando
# `test_refine_cache` cuando afirma que la clave de cache y el prompt no pueden
# separarse.
SISTEMA_CORRECTOR: str = (
    "Eres corrector experto de español académico. Para cada item decide si es "
    "un error REAL que conviene corregir en un trabajo universitario formal. "
    'Responde SOLO JSON: [{"i":int,"keep":bool,"suggestion":str|null}].'
)


async def refine_with_llm(findings: List[Dict[str, Any]], elements: List[Any],
                          api_key: str = "", session_id: str = "",
                          provider_id: Optional[str] = None,
                          _router: Optional[Any] = None) -> tuple[List[Dict[str, Any]], bool]:
    """Filtra falsos positivos de ortografía/muletillas con el LLM.

    Pasa por `execute_with_specialty`, como los demas motores del producto. Antes
    no pasaba: pegaba directo a `integrate.api.nvidia.com` con `requests.post`,
    con el modelo QUEMADO en el codigo e ignorando `NVIDIA_NIM_MODEL`, y su
    consumidor leia `os.getenv("NVIDIA_API_KEY")` en vez del request. Era el unico
    motor de ortografia del producto y el unico que ignoraba el router, con dos
    consecuencias: un usuario de ZenMux, Aion, Kilo, Ollama Cloud o HuggingFace
    —los cinco que el repo declara vivos— obtenia CERO refinamiento, y el
    `requests.post` sincrono, llamado desde un `async def`, detenia el backend
    entero mientras la red contestaba.

    `api_key` y `provider_id` vienen del REQUEST. La clave es la del proveedor
    que el usuario eligio, no la primera que este en el entorno.

    Nunca lanza: ante cualquier error devuelve (findings intactos, False).
    Solo revisa hallazgos dudosos; first_person/ai_phrase/pegado pasan tal cual.

    `session_id` activa el registro por item (`audit_registry`): lo que ya se le
    pregunto a un item no se vuelve a preguntar. Sin sesion el comportamiento es
    el de siempre, un lote, porque un registro global le devolveria a un
    documento los hallazgos de otro.

    `_router` existe para que las pruebas no toquen la red. Su firma es la de
    `execute_with_specialty`. El `timeout` desaparecio con `requests.post`: los
    tiempos de espera son del router, uno por proveedor, y un numero que
    sobrescribia al de todos era una promise que no podia cumplirse.
    """
    try:
        import json as _json

        if _router is None:
            from modules.ai_client import execute_with_specialty as _router

        text_by_id = {str(getattr(e, "id", "")): (getattr(e, "text", "") or "")
                      for e in elements}
        dubious = [f for f in findings if f.get("kind") in _LLM_REVIEW_KINDS]
        if not dubious:
            return findings, False

        session_id = session_id or ""
        # indice de `dubious` -> hallazgo ya resuelto (o `None` si el corrector lo
        # descarto). Lo que no esta aca todavia no se sabe.
        resueltos: Dict[int, Optional[Dict[str, Any]]] = {}
        # (indice de `dubious`, clave de cache) de lo que hay que preguntar.
        por_preguntar: List[Tuple[int, str]] = []
        for i, f in enumerate(dubious):
            clave = _clave_de_consulta(f, text_by_id)
            guardado = (reusar(session_id, clave, f.get("phase") or "global")
                        if session_id else None)
            if guardado is None:
                por_preguntar.append((i, clave))
            else:
                # Un veredicto ausente no es un veredicto negativo: `_aplicar_veredicto`
                # devuelve el hallazgo intacto ante `None` o ante un sobre vacio.
                resueltos[i] = _aplicar_veredicto(
                    f, guardado[0] if guardado else None)
        if not por_preguntar:
            return _armar(findings, dubious, resueltos), True

        # Tope de llamadas por documento (D10-bis). Por defecto coincide con el
        # techo de lote (`_LOTE_MAX`) para no cambiar el comportamiento actual:
        # hoy un documento hace UNA llamada al router, asi que el tope de lote y
        # el de documento son el mismo numero. `AI_MAX_LLAMADAS_POR_DOC` lo baja
        # cuando haga falta racionar mas agresivo; `_LOTE_MAX` sigue siendo el
        # techo absoluto que nadie sube.
        import os as _os
        tope = TopeDeLlamadas(
            maximo=int(_os.getenv("AI_MAX_LLAMADAS_POR_DOC", str(_LOTE_MAX))))

        payload_items = []
        admitidos = []
        for j, (i, _clave) in enumerate(por_preguntar[:_LOTE_MAX]):
            if not tope.permitir():
                break
            admitidos.append((i, _clave))
            f = dubious[i]
            payload_items.append({
                "i": j,
                "kind": f["kind"],
                "match": _match_de(f, text_by_id),
                "context": f["excerpt"][:_CONTEXT_MAX],
            })
        if not payload_items:
            return _armar(findings, dubious, resueltos), False
        # El prompt del corrector va partido como lo espera el router: la
        # instruccion en el `system_prompt` y los items en el prompt del
        # usuario. El "Items: " es el separador que `test_refine_cache` usa
        # para leer lo que viajo, y no se toco.
        prompt = "Items: " + _json.dumps(payload_items, ensure_ascii=False)
        content = await _router(
            prompt=prompt,
            system_prompt=SISTEMA_CORRECTOR,
            specialty="FAST",
            api_key=api_key,
            provider_id=provider_id,
            temperature=0.1,
            max_tokens=1500,
            json_mode=True,
            # La cache de este motor es la de `audit_registry`, por ITEM. La del
            # router es del LOTE ENTERO, y dejarla activa pagaria el mismo lote
            # dos veces: una por el acierto por item y otra por el acierto del
            # lote. Ademas su clave no lleva la fase, que es justo lo que hace
            # distintas dos preguntas sobre la misma palabra.
            use_cache=False,
        )
        m = re.search(r"\[.*\]", content or "", re.DOTALL)
        if not m:
            return findings, True
        # Si el sobre no es JSON, `_json.loads` revienta y el `except` de abajo
        # devuelve los findings intactos: un LLM que no sabe responder no puede
        # dejar la lista a medias, ni borrar lo que ya estaba en el registro.
        verdicts = {v.get("i"): v for v in _json.loads(m.group(0)) if isinstance(v, dict)}

        asked = admitidos
        for j, v in verdicts.items():
            if not isinstance(j, int) or not 0 <= j < len(asked):
                continue
            i, clave = asked[j]
            f = dubious[i]
            resueltos[i] = _aplicar_veredicto(f, v)
            # Un veredicto que llego se guarda; uno que no llego NO se guarda, que
            # es otra cosa: no hay que volver a pagarlo la proxima, pero tampoco
            # se puede inventar la respuesta.
            if session_id:
                registrar(session_id, clave, f.get("phase") or "global", [v])
        return _armar(findings, dubious, resueltos), True
    except Exception:
        return findings, False


def _armar(findings: List[Dict[str, Any]], dubious: List[Dict[str, Any]],
           resueltos: Dict[int, Optional[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """La lista final: lo que no era dudoso intacto, mas los dudosos resueltos.

    Un indice de `dubious` que no esta en `resueltos` es un item que no viajo en
    el prompt (seccion del tope) o del que no hubo veredicto: se queda tal cual.
    """
    kept_local = [f for f in findings if f.get("kind") not in _LLM_REVIEW_KINDS]
    for i in range(len(dubious)):
        if i in resueltos:
            g = resueltos[i]
            if g is not None:
                kept_local.append(g)
        else:
            kept_local.append(dubious[i])
    return kept_local


# ---------------------------------------------------------------- Mega-Set: Bloom Taxonomy & Quantitative Indicators
def find_bloom_level(verb: str) -> int | None:
    """Devuelve el nivel Bloom (1-6) de un verbo, o None si no se encuentra."""
    verb_lower = verb.lower().strip()
    for level, verbs in BLOOM_VERBS.items():
        if verb_lower in [v.lower() for v in verbs]:
            return BLOOM_LEVELS[level]
    for level, verbs in BLOOM_VERBS.items():
        for v in verbs:
            if v.lower() in verb_lower:
                return BLOOM_LEVELS[level]
    return None


def _phrasal_regex(term: str) -> str:
    normalized = re.escape(term)
    normalized = normalized.replace(r"\ ", r"\s+")
    return rf"(?<![a-záéíóúñü]){normalized}(?![a-záéíóúñü])"


def audit_objective(objective_text: str) -> Dict[str, Any]:
    """Evalúa un objetivo académico individual contra los criterios de Bloom (Mega-Set §2.2)."""
    obj_text = objective_text or ""
    found_level = None
    found_verb = None

    for level, verbs in BLOOM_VERBS.items():
        for v in verbs:
            if re.search(_phrasal_regex(v), obj_text, re.IGNORECASE):
                found_level = level
                found_verb = v
                break
        if found_level:
            break

    vague_found = []
    for v in VAGUE_VERBS:
        if re.search(_phrasal_regex(v), obj_text, re.IGNORECASE):
            vague_found.append(v)

    return {
        "objective": objective_text,
        "bloom_level": found_level,
        "verb_detected": found_verb,
        "is_measurable": found_level is not None and not vague_found,
        "vague_verbs_used": vague_found,
        "severity": "high" if vague_found else ("ok" if found_level else "medium"),
        "recommendation": (
            f"✓ Verbo '{found_verb}' válido (nivel {found_level})"
            if found_level and not vague_found
            else f"✗ Verbos vagos: {', '.join(vague_found)}. Reemplazar por verbos medibles (ej. analizar, diseñar, evaluar)."
            if vague_found
            else "⚠ No se detectó verbo de Bloom accionable. Considerar reformular."
        ),
    }


def audit_objectives_hierarchy(general: str, specifics: List[str]) -> Dict[str, Any]:
    """Audita la jerarquía de coherencia entre objetivo general y específicos (Mega-Set §12).
    
    Regla: Los objetivos específicos NUNCA pueden tener un nivel Bloom superior al general.
    """
    findings = []
    gen_audit = audit_objective(general)
    gen_level = BLOOM_LEVELS.get(gen_audit["bloom_level"], None) if gen_audit["bloom_level"] else None

    if not gen_level:
        findings.append({
            "severity": "high",
            "title": "Objetivo general sin verbo Bloom medible",
            "description": f'El objetivo general "{general}" no usa un verbo medible.',
            "recommendation": "Reformular con un verbo accionable como Analizar, Evaluar, Diseñar o Proponer."
        })

    specific_results = []
    for i, spec in enumerate(specifics, 1):
        sp_audit = audit_objective(spec)
        sp_level = BLOOM_LEVELS.get(sp_audit["bloom_level"], None) if sp_audit["bloom_level"] else None
        
        issue = None
        if not sp_level:
            issue = "Sin verbo Bloom medible"
        elif gen_level and sp_level > gen_level:
            issue = f"Específico nivel {sp_level} supera al general ({gen_level})"
            findings.append({
                "severity": "high",
                "title": f"Objetivo específico #{i} supera nivel del general",
                "description": f'El específico #{i} ({sp_audit["verb_detected"]}) requiere nivel {sp_level}, superior al general (nivel {gen_level}).',
                "recommendation": f"Reformular el específico con un verbo de nivel ≤{gen_level} o elevar el general."
            })
        
        specific_results.append({
            "index": i,
            "text": spec,
            "bloom_level": sp_level,
            "verb_detected": sp_audit["verb_detected"],
            "issue": issue,
        })

    return {
        "general_level": gen_level,
        "specific_results": specific_results,
        "findings": findings,
        "is_coherent": len([f for f in findings if f["severity"] == "high"]) == 0,
    }


def burstiness_score(sentences: List[str]) -> Dict[str, Any]:
    """Calcula la variabilidad en longitud de oraciones (Burstiness) (Mega-Set §6.1)."""
    if not sentences:
        return {"score": 0.5, "interpretation": "sin oraciones"}

    lengths = [len(_words(s)) for s in sentences if len(_words(s)) > 0]
    if len(lengths) < 5:
        return {"score": 0.5, "interpretation": "texto muy corto"}

    avg = sum(lengths) / len(lengths)
    std = (sum((l - avg) ** 2 for l in lengths) / len(lengths)) ** 0.5
    cv = std / avg if avg > 0 else 0

    if cv < 0.15:
        score = 0.1
    elif cv < 0.20:
        score = 0.3
    elif cv < 0.30:
        score = 0.5
    elif cv <= 0.60:
        score = 0.9
    else:
        score = 0.6

    return {
        "burstiness_score": score,
        "cv": round(cv, 3),
        "avg_length": round(avg, 1),
        "std_length": round(std, 1),
        "interpretation": "Probable humano (variación natural)" if score >= 0.7 else "Sospecha IA (longitud muy homogénea)" if score <= 0.3 else "Indeterminado",
    }

