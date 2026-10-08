"""
WordAPA7 — Detector de patrones de texto generado por IA

Analiza párrafos del documento buscando 12 señales:
1.  Muletillas y frases recurrentes comunes en texto generado por LLM (50+ patrones)
2.  Estructura repetitiva de oraciones (longitud homogénea, 18-32 palabras)
3.  Abuso de punto y coma en un solo párrafo
4.  Párrafos de conclusión genérica ("En conclusión, ... se puede afirmar que ...")
5.  Artefactos de copia web/IA (emojis, markdown, doble guion, puntuación exagerada)
6.  Densidad anormal de conectores formales
7.  Anáfora: aperturas de oración repetidas
8.  Puntuación tipográfica mixta (comillas rectas + curvas)
9.  Diversidad léxica baja (type-token ratio < 0.45)
10. Calcos sintácticos del inglés ("en base a", "llevar a cabo", "tener en cuenta"…)
11. Estructura argumentativa repetitiva (tesis→evidencia→conclusión en cada párrafo)
12. Uniformidad de longitud de palabras (burstiness léxica robótica)

Señales globales de documento:
- Metadatos forenses (velocidad de tipeo, tiempo de edición, revisiones)
- Varianza sintáctica entre párrafos

Retorna un puntaje de riesgo (0-1) y lista de hallazgos categorizados.
"""

import math
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple


def _swb(pattern: str) -> str:
    r"""Spanish word boundary: \b that works with accented characters.
    Uses (?<![\wáéíóúüñÁÉÍÓÚÜÑ]) and (?![\wáéíóúüñÁÉÍÓÚÜÑ]) instead of \b
    to handle edge cases with combining characters."""
    return r'(?<![\wáéíóúüñÁÉÍÓÚÜÑ])' + pattern + r'(?![\wáéíóúüñÁÉÍÓÚÜÑ])'


# Emojis / símbolos de checklist (X etc.) que sobreviven al pegado de chat/IA
EMOJI_CHECKLIST_RE = re.compile(
    r'[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u2764\u2714\u2718\u2705\u274C\u2611]'
)

# Conectores formales que la IA sobre-usa en texto académico.
# Se evalúa la DENSIDAD (conectores por 100 palabras), no apariciones aisladas.
AI_CONNECTORS: List[str] = [
    "sin embargo", "no obstante", "por lo tanto", "asimismo", "además",
    "por consiguiente", "en consecuencia", "en primer lugar", "en segundo lugar",
    "por otro lado", "por otra parte", "en este sentido", "cabe destacar",
    "es importante destacar", "resulta esencial", "vale la pena", "en definitiva",
    "en conclusión", "en resumen", "en síntesis", "de esta manera",
    "de igual forma", "del mismo modo", "de acuerdo con", "en relación con",
    "con respecto a", "a su vez", "es decir", "no cabe duda",
]

# Colores de sombreado web típicos de tablas/copias de ChatGPT (hex de w:shd)
WEB_SHADING_COLORS: set[str] = {
    "F4CCCC", "FFE599", "D9EAD3", "FFF2CC", "D9D2E9", "FCE5CD",
    "CFE2F3", "EAD1DC", "FFFF00", "FF9900", "FF0000", "00B050",
}

# ── PATRONES DE FRASES COMUNES EN TEXTO GENERADO POR IA ──────────────────────

AI_PATTERNS: List[Tuple[str, str, str]] = [
    # Patrones existentes (mantenidos con severidad MEDIUM)
    (_swb(r"en conclusi[oó]n"), "Muletilla común de IA: 'En conclusión'", "MEDIUM"),
    (r"\ben resumen\b", "Muletilla común de IA: 'En resumen'", "LOW"),
    (_swb(r"en s[ií]ntesis"), "Muletilla común de IA: 'En síntesis'", "LOW"),
    (r"\bes importante destacar\b", "Frase recurrente de IA: 'Es importante destacar'", "MEDIUM"),
    (r"\bes fundamental mencionar\b", "Frase recurrente de IA: 'Es fundamental mencionar'", "MEDIUM"),
    (r"\ben primer lugar\b", "Conector frecuente de IA: 'En primer lugar'", "LOW"),
    (r"\bpor otro lado\b", "Conector frecuente de IA: 'Por otro lado'", "LOW"),
    (r"\bpor lo tanto\b", "Conector frecuente de IA: 'Por lo tanto'", "LOW"),
    (r"\ben el contexto actual\b", "Frase genérica de IA: 'En el contexto actual'", "MEDIUM"),
    (r"\ba medida que el mundo\b", "Frase introductoria típica de IA", "MEDIUM"),

    # Nuevos patrones (30+)
    (r"\bcabe mencionar\b", "Muletilla de IA: 'Cabe mencionar'", "MEDIUM"),
    (r"\bno obstante\b", "Conector frecuente en IA: 'No obstante'", "LOW"),
    (r"\bsin embargo\b", "Conector frecuente en IA: 'Sin embargo'", "LOW"),
    (r"\bes menester\b", "Frase arcaica favorecida por IA: 'Es menester'", "HIGH"),
    (_swb(r"a prop[oó]sito"), "Transición típica de IA: 'A propósito'", "MEDIUM"),
    (r"\bcabe resaltar\b", "Muletilla de IA: 'Cabe resaltar'", "MEDIUM"),
    (r"\ben este sentido\b", "Conector frecuente de IA: 'En este sentido'", "LOW"),
    (r"\ben otras palabras\b", "Muletilla de IA: 'En otras palabras'", "LOW"),
    (r"\bvale la pena\b", "Frase recurrente de IA: 'Vale la pena'", "MEDIUM"),
    (r"\ben particular\b", "Conector frecuente de IA: 'En particular'", "LOW"),
    (r"\basimismo\b", "Conector frecuente de IA: 'Asimismo'", "LOW"),
    (r"\bno cabe duda\b", "Frase enfática de IA: 'No cabe duda'", "MEDIUM"),
    (r"\bresulta evidente\b", "Frase enfática de IA: 'Resulta evidente'", "MEDIUM"),
    (r"\bde acuerdo con\b", "Fórmula de cita frecuente en IA", "LOW"),
    (_swb(r"en relaci[oó]n a"), "Conector frecuente de IA", "LOW"),
    (r"\bcon respecto a\b", "Conector frecuente de IA", "LOW"),
    (r"\bpor consiguiente\b", "Conector formal favorecido por IA", "MEDIUM"),
    (r"\ben consecuencia\b", "Conector formal frecuente en IA", "LOW"),
    (r"\bde tal manera\b", "Fórmula explicativa de IA", "MEDIUM"),
    (r"\bpues bien\b", "Muletilla de transición de IA", "MEDIUM"),
    (r"\bahora bien\b", "Conector contrastivo de IA", "LOW"),
    (_swb(r"a continuaci[oó]n"), "Transición de IA", "LOW"),
    (r"\ben definitiva\b", "Cierre favorecido por IA", "MEDIUM"),
    (_swb(r"en u[´']ltima instancia"), "Frase enfática de IA", "HIGH"),
    (_swb(r"en t[eé]rminos generales"), "Generalización de IA", "MEDIUM"),
    (r"\bdesde esta perspectiva\b", "Transición analítica de IA", "MEDIUM"),
    (r"\ben el marco de\b", "Fórmula contextual favorecida por IA", "MEDIUM"),
    (_swb(r"tal como se ha señalado"), "Remisión textual típica de IA", "HIGH"),
    (_swb(r"es preciso señalar"), "Muletilla formal de IA: 'Es preciso señalar'", "HIGH"),
    (r"\bconviene subrayar\b", "Muletilla formal de IA: 'Conviene subrayar'", "HIGH"),
    (r"\bes necesario resaltar\b", "Muletilla formal de IA: 'Es necesario resaltar'", "HIGH"),
    (r"\bcabe destacar\b", "Muletilla formal de IA: 'Cabe destacar'", "MEDIUM"),
    (r"\bhuelga decir\b", "Frase arcaica favorecida por IA", "HIGH"),
    (r"\bresulta interesante\b", "Valoración subjetiva típica de IA", "MEDIUM"),
    (r"\ben el presente trabajo\b", "Fórmula académica genérica de IA", "MEDIUM"),
    (r"\bel presente estudio\b", "Fórmula académica genérica de IA", "MEDIUM"),
    (r"\bse puede observar\b", "Frase descriptiva pasiva de IA", "LOW"),
    (r"\bes relevante mencionar\b", "Muletilla formal de IA", "MEDIUM"),
    (r"\bresulta crucial\b", "Énfasis favorecido por IA", "MEDIUM"),
    (r"\bes ampliamente conocido\b", "Generalización de IA", "MEDIUM"),
    (r"\bno es sorprendente\b", "Valoración subjetiva de IA", "MEDIUM"),
    (_swb(r"como se mencion[oó] anteriormente"), "Remisión textual de IA", "MEDIUM"),
    (_swb(r"en la misma l[ií]nea"), "Transición cohesiva de IA", "LOW"),
]

# Marcadores que cierran o resumen una idea. Uno solo puede ser una decisión
# retórica normal; la combinación o repetición es la señal relevante.
_CLOSURE_MARKERS = re.compile(
    r"\b(?:en conclusión|en resumen|en síntesis|en definitiva|finalmente|"
    r"para concluir|en última instancia)\b",
    re.IGNORECASE,
)
_GENERIC_LANGUAGE = re.compile(
    r"\b(?:es importante|es fundamental|es esencial|resulta crucial|"
    r"resulta evidente|se puede afirmar|se puede decir|se puede concluir|"
    r"los aspectos|el fenómeno|la problemática|el tema|lo anterior)\b",
    re.IGNORECASE,
)
_EVIDENCE_MARKERS = re.compile(
    r"(?:\d|%|\b(?:tabla|figura|muestra|participantes|entrevista|"
    r"coeficiente|p\s*[<=>]|IC\s*=|p\s*=)\b|\([^()]{2,50},\s*(?:19|20)\d{2}[a-z]?\))",
    re.IGNORECASE,
)


def _analyze_sentence_structure(text: str) -> Tuple[float, int, List[str], str]:
    """
    Analiza la estructura de oraciones buscando longitud homogénea.
    La IA tiende a generar oraciones de longitud similar (~20-30 palabras).

    Retorna: (score 0-1, count de oraciones con longitud sospechosa,
              lista de oraciones sospechosas para resaltar en el documento,
              mensaje descriptivo de detalle)
    """
    if not text or len(text.strip()) < 40:
        return 0.0, 0, [], ""

    # Dividir en oraciones por punto
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
    if len(sentences) < 3:
        return 0.0, 0, [], ""

    word_counts = [len(s.split()) for s in sentences if len(s.split()) > 5]

    if len(word_counts) < 3:
        return 0.0, 0, [], ""

    # Calcular cuántas oraciones están en el rango 18-32 palabras
    medium_count = sum(1 for wc in word_counts if 18 <= wc <= 32)
    ratio = medium_count / len(word_counts)

    # Calcular desviación estándar relativa (baja desviación = sospechosa)
    mean = sum(word_counts) / len(word_counts)
    variance = sum((wc - mean) ** 2 for wc in word_counts) / len(word_counts)
    std_dev = variance ** 0.5
    rel_std = std_dev / mean if mean > 0 else 1.0

    # Alta densidad de oraciones medianas + baja variación = sospechoso
    score = 0.0
    if ratio > 0.7:
        score += 0.3
    if ratio > 0.85:
        score += 0.2

    # Baja variación en longitud entre oraciones (patrón típico de cadencia sintética)
    if rel_std < 0.35 and len(word_counts) >= 4:
        score += 0.3
    if rel_std < 0.25 and len(word_counts) >= 5:
        score += 0.2

    # Oraciones sospechosas (las que disparan la señal) para resaltado inline
    if medium_count > 0:
        suspicious = [s for s in sentences if 18 <= len(s.split()) <= 32][:3]
        reported_count = medium_count
        detail = f"Estructura de oraciones homogénea ({reported_count} oraciones de longitud similar, 18-32 palabras cada una)"
    else:
        # Baja variación con longitud uniforme fuera de 18-32 palabras
        suspicious = [s for s in sentences if abs(len(s.split()) - mean) <= max(std_dev, 2.0)][:3]
        reported_count = len(suspicious)
        detail = f"Estructura de oraciones homogénea ({len(word_counts)} oraciones de longitud muy similar, ~{int(round(mean))} palabras cada una)"

    return min(score, 1.0), reported_count, suspicious, detail


def _detect_semicolon_overuse(text: str) -> Tuple[float, int]:
    """
    Detecta uso excesivo de punto y coma en un solo párrafo.
    La IA tiende a abusar del punto y coma para conectar oraciones largas.

    Retorna: (score 0-1, count de punto y coma)
    """
    if not text:
        return 0.0, 0

    semicolon_count = text.count(";") + text.count("；")

    if semicolon_count == 0:
        return 0.0, 0

    word_count = len(text.split())
    if word_count == 0:
        return 0.0, 0

    # Densidad: punto y coma cada 15 palabras o menos = sospechoso
    density = semicolon_count / word_count

    if density > 0.08:
        return 0.8, semicolon_count
    elif density > 0.05:
        return 0.5, semicolon_count
    elif density > 0.03:
        return 0.3, semicolon_count

    return 0.0, semicolon_count


def _detect_generic_conclusion(text: str) -> Tuple[float, List[str]]:
    """
    Detecta párrafos de conclusión genérica típicos de IA.

    Patrones:
    - "En conclusión, ... se puede afirmar que ... es fundamental para ..."
    - "En resumen, ... estos hallazgos demuestran ..."
    - Estructura: marcador de cierre + verbo modal + afirmación genérica

    Retorna: (score 0-1, lista de fragmentos sospechosos)
    """
    if not text or len(text.strip()) < 50:
        return 0.0, []

    text_lower = text.lower()
    findings = []

    # Patrones de conclusión genérica
    conclusion_triggers = [
        r"en conclusi[oó]n\b",
        r"en [uú]ltima instancia\b",
        r"en definitiva\b",
        r"para concluir\b",
        r"finalmente\b",
    ]

    generic_followups = [
        r"se puede afirmar",
        r"se puede decir",
        r"se puede concluir",
        r"es fundamental",
        r"es esencial",
        r"es importante",
        r"resulta evidente",
        r"no cabe duda",
        r"queda demostrado",
        r"se ha demostrado",
        r"los hallazgos sugieren",
        r"los resultados indican",
        r"en [uú]ltimo t[eé]rmino",
    ]

    score = 0.0
    trigger_match = None
    for trigger in conclusion_triggers:
        m = re.search(trigger, text_lower)
        if m and (trigger_match is None or m.start() < trigger_match.start()):
            trigger_match = m

    if trigger_match:
        # El marcador solo no basta: se exige lenguaje genérico cercano y se
        # reduce la señal cuando el cierre contiene evidencia comprobable.
        score += 0.1
        findings.append(f"Incluye marcador de cierre: '{trigger_match.group(0)}'")
        window = text_lower[trigger_match.end():trigger_match.end() + 180]
        followup_match = next((re.search(pattern, window) for pattern in generic_followups
                               if re.search(pattern, window)), None)
        generic_match = _GENERIC_LANGUAGE.search(window)
        has_evidence = bool(_EVIDENCE_MARKERS.search(window))
        if followup_match or generic_match:
            score += 0.25
            phrase = (followup_match or generic_match).group(0)
            findings.append(f"Seguido de lenguaje genérico: '{phrase}'")
        if has_evidence:
            score *= 0.35

    closure_matches = list(_CLOSURE_MARKERS.finditer(text_lower))
    if len(closure_matches) >= 2:
        score += 0.25
        findings.append(f"Repite marcadores de cierre ({len(closure_matches)}) en el mismo párrafo")

    return min(score, 1.0), findings


def _detect_copy_artifacts(text: str) -> Tuple[float, List[Dict[str, Any]]]:
    """
    Detecta artefactos de copia de ChatGPT / páginas web que sobreviven al pegado
    en Word y delatan contenido generado o copiado:
    - Emojis y simbolos de checklist ( X   ⭐)
    - Marcadores Markdown (###, **negrita**, ```, >)
    - Doble guion / guiones largos pegados (--, —, – )
    - Listas inline tipo "1)" "a)" copiadas de chat
    - Multiples signos de exclamacion/interrogacion (!!, ??)
    Retorna: (score 0-1, lista de hallazgos)
    """
    if not text or len(text.strip()) < 10:
        return 0.0, []

    findings: List[Dict[str, Any]] = []
    total = 0.0

    # Emojis / simbolos de checklist (senal fuerte de copia web/IA)
    emoji_matches = list(EMOJI_CHECKLIST_RE.finditer(text))
    if emoji_matches:
        total += min(0.5, 0.1 * len(emoji_matches))
        findings.append({
            "pattern": "copy_emoji",
            "severity": "MEDIUM" if len(emoji_matches) >= 3 else "LOW",
            "detail": f"{len(emoji_matches)} emoji(s)/simbolo(s) de checklist (X) en el texto — tipico de contenido copiado de chat/IA",
            "count": len(emoji_matches),
            "phrase": emoji_matches[0].group(0),
        })

    # Marcadores Markdown
    md = re.search(r'(?:^|\s)(#{1,6}\s|\*\*|```|~~~|> )', text)
    if md:
        total += 0.35
        findings.append({
            "pattern": "markdown_artifact",
            "severity": "HIGH",
            "detail": "Marcador Markdown detectado (###, **, ```) — texto pegado sin formatear desde chat/editor",
            "count": 1,
            "phrase": md.group(0).strip(),
        })

    # Doble guion (pegado de markdown/IA)
    dash = re.search(r'(?<!\w)--(?!\w)|—| – ', text)
    if dash:
        total += 0.2
        findings.append({
            "pattern": "copy_dash",
            "severity": "LOW",
            "detail": "Guion doble/largo (--, —) — artefacto de copia de editores web",
            "count": 1,
            "phrase": dash.group(0).strip(),
        })

    # Signos multiples (!!, ??, !!!)
    multi = re.search(r'[!?]{2,}', text)
    if multi:
        total += 0.25
        findings.append({
            "pattern": "exaggerated_punctuation",
            "severity": "MEDIUM",
            "detail": "Puntuacion exagerada (!!, ??) — tono informal de chat, no academico",
            "count": 1,
            "phrase": multi.group(0),
        })

    return min(total, 1.0), findings


def _detect_connector_density(text: str) -> Tuple[float, int]:
    """
    Detecta densidad anormal de conectores formales (acumulación).
    La IA encadena transiciones formales mucho más que un escritor humano.
    Retorna: (score 0-1, count total de conectores).
    """
    if not text or len(text.split()) < 40:
        return 0.0, 0

    text_lower = text.lower()
    count = 0
    for c in AI_CONNECTORS:
        count += len(re.findall(r'\b' + re.escape(c) + r'\b', text_lower))

    words = len(text.split())
    density = count * 100.0 / words  # conectores por 100 palabras

    if density >= 5:
        return 0.5, count
    elif density >= 3.5:
        return 0.3, count
    elif density >= 2:
        return 0.2, count
    return 0.0, count


def _detect_repeated_openers(text: str) -> Tuple[float, List[str]]:
    """
    Detecta anáfora: aperturas de oración repetidas.
    Los LLM repiten los mismos inicios de oración ("Se puede...", "Es importante...").
    Retorna: (score 0-1, lista de aperturas repetidas).
    """
    if not text or len(text.strip()) < 60:
        return 0.0, []

    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
    if len(sentences) < 3:
        return 0.0, []

    openers: Dict[str, int] = {}
    for s in sentences:
        words = s.split()
        if len(words) < 4:
            continue
        key = " ".join(words[:2]).lower()
        openers[key] = openers.get(key, 0) + 1

    repeated = sorted([k for k, v in openers.items() if v >= 3])
    if repeated:
        return 0.3, repeated[:3]
    return 0.0, []


def _detect_mixed_typography(text: str) -> Tuple[float, Optional[str]]:
    """
    Detecta puntuación tipográfica mixta: comillas rectas + curvas, o
    guiones rectos + en-dash/em-dash en el mismo párrafo. Señal de pegado
    desde editores/chat con diferente tipografía.
    Retorna: (score 0-1, descripción o None).
    """
    if not text or len(text.strip()) < 30:
        return 0.0, None

    has_curly = ('“' in text or '”' in text or '‘' in text or '’' in text)
    has_straight = ('"' in text or "'" in text)
    mixed_quotes = has_curly and has_straight

    has_em_dash = ('—' in text or '–' in text)
    has_hyphen = ('-' in text)
    mixed_dash = has_em_dash and has_hyphen

    if mixed_quotes:
        return 0.15, "Puntuación tipográfica mixta: comillas rectas y curvas combinadas"
    if mixed_dash:
        return 0.1, "Puntuación tipográfica mixta: guiones rectos y em-dash/en-dash combinados"
    return 0.0, None


# ── NUEVAS SEÑALES (9-12) ─────────────────────────────────────────────────────

# Calcos sintácticos del inglés — construcciones que suenan a traducción directa
# Fuente: «El español en contacto» (Lapesa, 1981) + patrones identificados en LLMs
_TRANSLATION_CALQUES: List[Tuple[str, str, str]] = [
    (r"\ben base a\b", "Calco del inglés 'based on': use 'con base en' o 'según'", "MEDIUM"),
    (r"\ba nivel de\b", "Calco del inglés 'at the level of': construcción anglicada", "LOW"),
    (r"\bhacer referencia a\b", "Calco del inglés 'to make reference to': use 'referirse a'", "LOW"),
    (r"\bllevar a cabo\b", "Calco del inglés 'to carry out': favorecido por LLMs que traducen del inglés", "LOW"),
    (r"\btener en cuenta\b", "Calco del inglés 'to take into account': uso excesivo en texto de IA", "LOW"),
    (r"\ben t[eé]rminos de\b", "Calco del inglés 'in terms of': sobreusado en texto académico de IA", "MEDIUM"),
    (r"\bel hecho de que\b", "Calco del inglés 'the fact that': nominalización anglicada frecuente en IA", "MEDIUM"),
    (r"\bdebido a el hecho\b", "Calco del inglés 'due to the fact': perifrástico y típico de IA", "HIGH"),
    (r"\ba trav[eé]s de\b", "Preposición anglicada sobreusada por LLMs: 'a través de' (abuso)", "LOW"),
    (r"\bproveer de\b", "Calco del inglés 'to provide with': use 'proporcionar'", "MEDIUM"),
    (r"\bel mismo\b.{0,20}\bque\b", "Uso anglicado de 'el mismo': calco de 'the same ... as'", "LOW"),
    (r"\benfocado en\b", "Calco del inglés 'focused on': use 'centrado en' o 'orientado a'", "LOW"),
    (r"\bbasado en\b", "Calco del inglés 'based on': sobreusado en texto de IA en español", "LOW"),
    (r"\breferido a\b", "Calco del inglés 'referred to': use 'relacionado con' o 'sobre'", "LOW"),
    (r"\bimpactar (?:en|sobre)\b", "Calco del inglés 'to impact on': 'impactar' es intransitivo en español académico", "MEDIUM"),
]


def _detect_type_token_ratio(text: str) -> Tuple[float, Optional[str]]:
    """
    Detecta diversidad léxica baja usando el Type-Token Ratio (TTR).

    TTR = tipos_únicos / tokens_totales.
    Un TTR < 0.45 en textos de 80+ palabras sugiere vocabulario repetitivo,
    característico de los LLMs que tienden a reutilizar los mismos términos.

    No se aplica en textos cortos (<80 palabras) donde el TTR es naturalmente
    alto por volumen insuficiente.

    Retorna: (score 0-1, descripción o None).
    """
    if not text:
        return 0.0, None

    # Tokenizar: solo palabras alfanuméricas de 4+ letras para evitar stopwords
    tokens = re.findall(r'\b[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]{4,}\b', text.lower())
    if len(tokens) < 80:
        return 0.0, None

    types = len(set(tokens))
    ttr = types / len(tokens)

    if ttr < 0.35:
        return 0.4, f"Diversidad léxica muy baja (TTR={ttr:.2f}): vocabulario marcadamente repetitivo, típico de texto generado por IA"
    elif ttr < 0.45:
        return 0.25, f"Diversidad léxica baja (TTR={ttr:.2f}): reutilización de términos mayor a lo esperado en texto humano"
    return 0.0, None


def _detect_translation_calques(text: str) -> Tuple[float, List[Dict[str, Any]]]:
    """
    Detecta calcos sintácticos del inglés que delatan texto generado por LLMs
    que operan internamente en inglés y traducen al español.

    Los LLMs entrenados principalmente en inglés producen construcciones que
    son literalmente el equivalente de frases inglesas: 'en base a' (based on),
    'llevar a cabo' (carry out), 'el hecho de que' (the fact that), etc.

    Retorna: (score 0-1, lista de hallazgos).
    """
    if not text or len(text.strip()) < 30:
        return 0.0, []

    text_lower = text.lower()
    findings: List[Dict[str, Any]] = []
    total_score = 0.0
    seen_patterns: set = set()

    for pattern, detail, severity in _TRANSLATION_CALQUES:
        matches = list(re.finditer(pattern, text_lower))
        if matches and pattern not in seen_patterns:
            seen_patterns.add(pattern)
            sev_score = {"LOW": 0.08, "MEDIUM": 0.15, "HIGH": 0.25}
            score_contrib = sev_score.get(severity, 0.1) * min(len(matches), 2)
            total_score += score_contrib
            findings.append({
                "pattern": "translation_calque",
                "severity": severity,
                "detail": detail,
                "count": len(matches),
                "phrase": matches[0].group(0).strip(),
            })

    return min(total_score, 0.8), findings


def _detect_argumentative_pattern(text: str) -> Tuple[float, Optional[str]]:
    """
    Detecta la estructura argumentativa rígida tesis→evidencia→conclusión
    que los LLMs reproducen mecánicamente en cada párrafo.

    Señales de cada fase:
    - Tesis: "En este trabajo / El objetivo / Se propone / Se sostiene que"
    - Evidencia: "Según / De acuerdo con / Como señala / Los datos muestran / Los resultados indican"
    - Conclusión: "Por lo tanto / En conclusión / Esto demuestra / En definitiva / Así pues"

    Un párrafo con las 3 fases comprimidas en < 200 palabras es sospechoso.

    Retorna: (score 0-1, descripción o None).
    """
    if not text or len(text.strip()) < 60:
        return 0.0, None

    text_lower = text.lower()
    words = len(text.split())

    # Solo es relevante en párrafos medianos (no monografías de 500 palabras)
    if words > 250:
        return 0.0, None

    thesis_re = re.compile(
        r'\b(en este (trabajo|estudio|an[aá]lisis)|el objetivo (de|del|es)|'
        r'se propone|se sostiene|se plantea|el presente)\b'
    )
    evidence_re = re.compile(
        r'\b(seg[uú]n|de acuerdo con|como (se[ñn]ala|indica|muestra|afirma)|'
        r'los (datos|resultados|hallazgos|estudios) (muestran|indican|sugieren|demuestran)|'
        r'la investigaci[oó]n (muestra|indica|demuestra))\b'
    )
    conclusion_re = re.compile(
        r'\b(por (lo tanto|consiguiente)|en (conclusi[oó]n|definitiva|s[ií]ntesis)|'
        r'esto (demuestra|indica|confirma|sugiere)|as[ií] pues|por ende)\b'
    )

    has_thesis = bool(thesis_re.search(text_lower))
    has_evidence = bool(evidence_re.search(text_lower))
    has_conclusion = bool(conclusion_re.search(text_lower))

    if has_thesis and has_evidence and has_conclusion:
        return 0.2, (
            "Estructura argumentativa tripartita (tesis→evidencia→conclusión) "
            "comprimida en un solo párrafo — patrón mecánico de LLM"
        )
    # Dos de tres también es leve señal si el párrafo es corto
    if words < 100 and sum([has_thesis, has_evidence, has_conclusion]) >= 2:
        return 0.1, (
            "Dos marcadores de estructura argumentativa rígida en párrafo corto"
        )
    return 0.0, None


def _detect_lexical_burstiness(text: str) -> Tuple[float, Optional[str]]:
    """
    Detecta uniformidad en la longitud de palabras (anti-burstiness léxica).

    Los textos humanos tienen alta varianza en la longitud de sus palabras
    (mezclan monosílabos con polisílabos de forma irregular).
    Los LLMs tienden a producir longitudes más uniformes — señal sutil pero
    estadísticamente significativa en párrafos largos.

    Se mide como desviación estándar relativa de los largos de palabras.
    relStd < 0.45 con >= 60 palabras → uniformidad sospechosa.

    Retorna: (score 0-1, descripción o None).
    """
    if not text:
        return 0.0, None

    tokens = [w for w in re.findall(r'\b[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]+\b', text) if len(w) >= 2]
    if len(tokens) < 60:
        return 0.0, None

    lengths = [len(w) for w in tokens]
    mean_len = sum(lengths) / len(lengths)
    if mean_len == 0:
        return 0.0, None

    variance = sum((l - mean_len) ** 2 for l in lengths) / len(lengths)
    std_dev = variance ** 0.5
    rel_std = std_dev / mean_len

    if rel_std < 0.38:
        return 0.2, (
            f"Uniformidad léxica robótica (relStd={rel_std:.2f}): "
            "los textos humanos muestran mayor varianza en la longitud de palabras"
        )
    elif rel_std < 0.45:
        return 0.1, (
            f"Longitud de palabras levemente uniforme (relStd={rel_std:.2f})"
        )
    return 0.0, None


def analyze_ai_risk(text: str, is_technical_domain: bool | None = None) -> Dict[str, Any]:
    """
    Análisis completo de riesgo de texto generado por IA.
    F-08: Incorpora discriminador de dominio temático (is_technical_domain):
    si el texto contiene datos metrológicos o balances técnicos (kWh, kW, V, A, compresor, tensión, etc.),
    relaja las penalizaciones por baja varianza léxica para evitar falsos positivos en ingeniería.

    Retorna:
    {
        "score": float (0.0 a 1.0),
        "findings": [
            {"pattern": str, "severity": str, "detail": str, "count": int},
            ...
        ],
        "category": "LOW" | "MEDIUM" | "HIGH"
    }
    """
    result: Dict[str, Any] = {
        "score": 0.0,
        "findings": [],
        "category": "LOW",
    }

    if not text or len(text.strip()) < 15:
        return result

    text_lower = text.lower()

    # F-08: Detección automática de dominio técnico / metrológico si no se especificó explícitamente
    if is_technical_domain is None:
        tech_terms = re.findall(r'\b(?:kwh|kw|mwh|mw|voltios?|voltaje|tensi[oó]n|amperios?|corriente|potencia|compresor|frecuencia|hz|ohm|resistencia|factor\s+de\s+potencia|transformador|kva)\b', text_lower)
        is_technical_domain = len(tech_terms) >= 2 or (len(tech_terms) >= 1 and bool(re.search(r'\d+[\.,]?\d*\s*(?:kwh|kw|v|a|w|hz)', text_lower)))

    total_score = 0.0
    signal_count = 0

    # 1. Patrones de frases
    phrase_findings: Dict[str, Any] = {}
    for pattern, warning_msg, severity in AI_PATTERNS:
        matches = list(re.finditer(pattern, text_lower))
        if matches:
            key = pattern
            if key not in phrase_findings:
                sev_score = {"LOW": 0.1, "MEDIUM": 0.2, "HIGH": 0.35}
                # Frase real encontrada en el texto (no el patrón regex)
                real_phrase = matches[0].group(0).strip()
                phrase_findings[key] = {
                    "pattern": "phrase",
                    "severity": severity,
                    "detail": warning_msg,
                    "count": len(matches),
                    "phrase": real_phrase,
                    "score": sev_score.get(severity, 0.15) * min(len(matches), 3),
                }

    # Acumular el puntaje de patrones de frases con un tope de 0.35.
    # Muchos patrones solapan con AI_CONNECTORS (señal 6), por lo que sin
    # tope el puntaje de esta señal se infla artificialmente.
    phrase_score_total = 0.0
    for finding in phrase_findings.values():
        result["findings"].append({
            "pattern": finding["pattern"],
            "severity": finding["severity"],
            "detail": finding["detail"],
            "count": finding["count"],
            "phrase": finding.get("phrase", ""),
        })
        phrase_score_total += finding["score"]
        signal_count += 1
    total_score += min(phrase_score_total, 0.35)

    # 2. Estructura de oraciones repetitiva
    struct_score, medium_sentences, suspicious_sentences, struct_detail = _analyze_sentence_structure(text)
    if struct_score > 0.2:
        result["findings"].append({
            "pattern": "sentence_structure",
            "severity": "MEDIUM" if struct_score > 0.5 else "LOW",
            "detail": struct_detail,
            "count": medium_sentences,
            "phrase": suspicious_sentences[0] if suspicious_sentences else "",
            "phrases": suspicious_sentences,
        })
        total_score += struct_score * 0.8
        signal_count += 1

    # 3. Abuso de punto y coma
    semi_score, semi_count = _detect_semicolon_overuse(text)
    if semi_score > 0.2:
        result["findings"].append({
            "pattern": "semicolon_overuse",
            "severity": "HIGH" if semi_score > 0.6 else "MEDIUM",
            "detail": f"Uso excesivo de punto y coma ({semi_count} ocurrencias en el párrafo)",
            "count": semi_count,
        })
        total_score += semi_score * 0.5
        signal_count += 1

    # 4. Conclusión genérica
    conc_score, conc_findings = _detect_generic_conclusion(text)
    if conc_score > 0.2:
        detail_str = "; ".join(conc_findings[:3])
        result["findings"].append({
            "pattern": "generic_conclusion",
            "severity": "HIGH" if conc_score > 0.6 else "MEDIUM",
            "detail": f"Estructura de conclusión genérica: {detail_str}",
            "count": len(conc_findings),
        })
        total_score += conc_score * 0.6
        signal_count += 1

    # 5. Artefactos de copia web/IA (emojis, markdown, doble guion, puntuacion exagerada)
    copy_score, copy_findings = _detect_copy_artifacts(text)
    if copy_score > 0:
        result["findings"].extend(copy_findings)
        total_score += copy_score
        signal_count += 1

    # 6. Densidad de conectores formales (acumulación)
    conn_score, conn_count = _detect_connector_density(text)
    if conn_score > 0.2:
        result["findings"].append({
            "pattern": "connector_density",
            "severity": "MEDIUM" if conn_score > 0.3 else "LOW",
            "detail": f"Densidad alta de conectores formales ({conn_count} conectores, estilado transicional típico de IA)",
            "count": conn_count,
        })
        total_score += conn_score * 0.7
        signal_count += 1

    # 7. Anáfora: aperturas de oración repetidas
    opener_score, openers = _detect_repeated_openers(text)
    if opener_score > 0.2:
        result["findings"].append({
            "pattern": "repeated_openers",
            "severity": "MEDIUM",
            "detail": f"Aperturas de oración repetidas ({', '.join(openers)}) — patrón de redacción de IA",
            "count": len(openers),
            "phrase": openers[0] if openers else "",
            "phrases": openers,
        })
        total_score += opener_score * 0.5
        signal_count += 1

    # 8. Puntuación tipográfica mixta
    typo_score, typo_detail = _detect_mixed_typography(text)
    if typo_score > 0:
        result["findings"].append({
            "pattern": "mixed_typography",
            "severity": "LOW",
            "detail": typo_detail or "Puntuación tipográfica mixta",
            "count": 1,
        })
        total_score += typo_score
        signal_count += 1

    # 9. Diversidad léxica baja (type-token ratio)
    ttr_score, ttr_detail = _detect_type_token_ratio(text)
    if ttr_score > 0 and ttr_detail:
        # F-08: En dominios técnicos de ingeniería, relajar la penalización por repetición de términos
        effective_ttr_score = ttr_score * (0.2 if is_technical_domain else 0.6)
        sev = "LOW" if is_technical_domain else ("HIGH" if ttr_score >= 0.35 else "MEDIUM")
        detail_msg = ttr_detail + (" (Atenuado por dominio técnico de ingeniería/metrología)" if is_technical_domain else "")
        result["findings"].append({
            "pattern": "low_lexical_diversity",
            "severity": sev,
            "detail": detail_msg,
            "count": 1,
            "phrase": "",
        })
        total_score += effective_ttr_score
        signal_count += 1

    # 10. Calcos sintácticos del inglés
    calque_score, calque_findings = _detect_translation_calques(text)
    if calque_score > 0:
        result["findings"].extend(calque_findings)
        total_score += calque_score * 0.7
        signal_count += 1

    # 11. Estructura argumentativa rígida tesis→evidencia→conclusión
    arg_score, arg_detail = _detect_argumentative_pattern(text)
    if arg_score > 0 and arg_detail:
        result["findings"].append({
            "pattern": "argumentative_pattern",
            "severity": "MEDIUM" if arg_score >= 0.2 else "LOW",
            "detail": arg_detail,
            "count": 1,
            "phrase": "",
        })
        total_score += arg_score * 0.6
        signal_count += 1

    # 12. Uniformidad de longitud de palabras (anti-burstiness léxica)
    burst_score, burst_detail = _detect_lexical_burstiness(text)
    if burst_score > 0 and burst_detail:
        # F-08: En dominios técnicos de ingeniería relajar penalización de longitud
        effective_burst_score = burst_score * (0.2 if is_technical_domain else 0.5)
        result["findings"].append({
            "pattern": "lexical_burstiness",
            "severity": "LOW",
            "detail": burst_detail + (" (Atenuado por vocabulario técnico estándar)" if is_technical_domain else ""),
            "count": 1,
            "phrase": "",
        })
        total_score += effective_burst_score
        signal_count += 1

    # Calcular puntaje final (suma ponderada con techo: MÁS evidencia = MÁS riesgo).
    # Antes se promediaba por señal, lo que diluía párrafos con mucha evidencia.
    final_score = min(total_score, 1.0)

    # Categorizar
    if final_score >= 0.5:
        category = "HIGH"
    elif final_score >= 0.2:
        category = "MEDIUM"
    else:
        category = "LOW"

    # Limitar a 16 hallazgos (subido de 12 para acomodar las 4 señales nuevas
    # sin perder los findings de densidad y calcos que son muy informativos).
    result["findings"] = result["findings"][:16]
    result["score"] = round(min(final_score, 1.0), 2)
    result["category"] = category

    return result


def analyze_table_cells(headers: List[str], rows: List[List[str]]) -> Tuple[float, List[Dict[str, Any]]]:
    """
    Analiza celdas de una tabla buscando artefactos de copia web/IA que no
    aparecen en párrafos: emojis de checklist (X), múltiples punto y coma,
    marcadores. Retorna (score 0-1, findings).
    """
    cells: List[str] = []
    cells.extend([str(h) for h in (headers or []) if str(h).strip()])
    for row in (rows or []):
        cells.extend([str(c) for c in row if str(c).strip()])

    # IMPORTANTE: NO filtrar por longitud antes del análisis de emojis —
    # los símbolos de checklist (X) son celdas de 1 carácter.
    if not cells:
        return 0.0, []

    score = 0.0
    findings: List[Dict[str, Any]] = []

    emoji_total = 0
    emoji_cells = 0
    for c in cells:
        matches = list(EMOJI_CHECKLIST_RE.finditer(c))
        if matches:
            emoji_cells += 1
            emoji_total += len(matches)

    if emoji_total > 0:
        score = min(0.8, 0.1 * emoji_total)
        findings.append({
            "pattern": "table_emoji",
            "severity": "HIGH" if emoji_total >= 3 else "MEDIUM",
            "detail": f"{emoji_total} símbolo(s) de checklist (X) en {emoji_cells} celda(s) de la tabla — matriz copiada de chat/IA",
            "count": emoji_total,
            "phrase": "",
        })

    semi_cells = sum(1 for c in cells if str(c).count(";") >= 2)
    if semi_cells >= 2:
        score = min(1.0, score + 0.2)
        findings.append({
            "pattern": "table_semicolon",
            "severity": "LOW",
            "detail": f"{semi_cells} celda(s) con múltiples punto y coma (texto pegado de web)",
            "count": semi_cells,
            "phrase": ";",
        })

    return round(min(score, 1.0), 2), findings


def _categorize_score(score: float) -> str:
    """Categoría de riesgo a partir de un score 0-1."""
    if score >= 0.5:
        return "HIGH"
    elif score >= 0.2:
        return "MEDIUM"
    return "LOW"


def _metadata_document_signals(forensic_metadata: Optional[Dict[str, Any]]) -> Tuple[float, List[str]]:
    """
    Señales forenses a nivel documento (metadatos del .docx).
    Retorna (boost 0-1 aplicable a todos los párrafos, lista de descripciones).
    """
    if not forensic_metadata:
        return 0.0, []

    signals: List[str] = []
    boost = 0.0

    total_time = forensic_metadata.get("total_editing_time_minutes", 0)
    words = forensic_metadata.get("words", 0)
    rev_count = forensic_metadata.get("revision_count", 0)

    # TotalTime nulo con volumen alto = documento "nacido" de golpe (pegado).
    if total_time == 0 and words >= 800:
        boost = max(boost, 0.3)
        signals.append(f"metadatos: 0 minutos de edición para {words} palabras (contenido pegado/importado)")
    elif total_time and total_time > 0 and words > 500:
        wpm = words / total_time
        if wpm > 80:
            boost = max(boost, 0.4)
            signals.append(f"velocidad de tipeo sobrehumana ({wpm:.0f} WPM en metadatos)")

    # Revisiones sospechosamente bajas para el volumen.
    if rev_count is not None and words >= 3000 and rev_count <= 2:
        boost = max(boost, 0.15)
        signals.append(f"metadatos: solo {rev_count} revisión(es) para {words} palabras (pegado masivo probable)")

    # Creado == modificado a la misma hora redonda = generación de una sola vez.
    created = forensic_metadata.get("created_iso", "")
    modified = forensic_metadata.get("modified_iso", "")
    if created and modified:
        try:
            dt_c = datetime.fromisoformat(created.replace("Z", "+00:00"))
            dt_m = datetime.fromisoformat(modified.replace("Z", "+00:00"))
            delta_min = abs((dt_m - dt_c).total_seconds()) / 60.0
            if delta_min <= 1 and dt_c.minute == 0 and dt_c.second == 0 and words >= 1500:
                boost = max(boost, 0.2)
                signals.append("metadatos: creado y modificado en el mismo minuto a hora redonda (archivo generado de una vez)")
        except Exception:
            pass

    # Referencias sin citas en el cuerpo = contenido pegado con biblioteca decorativa.
    refs = forensic_metadata.get("references_count", 0)
    cites = forensic_metadata.get("in_text_citations", None)
    if cites is not None and refs >= 3 and cites <= 1:
        boost = max(boost, 0.15)
        signals.append(f"documento con {refs} referencias pero solo {cites} cita(s) en el cuerpo (contenido posiblemente pegado)")

    return min(boost, 0.7), signals


def _syntactic_variance_signal(paragraphs: List[str]) -> Tuple[float, Optional[str]]:
    """
    Varianza de longitud entre párrafos. Es una señal GLOBAL (flag de documento),
    no por párrafo: no debe saturar marcando todo. Retorna (boost pequeño, descripción).
    """
    lengths = [len(p.split()) for p in paragraphs if p and len(p.split()) > 5]
    if len(lengths) > 5:
        mean = sum(lengths) / len(lengths)
        if mean > 0:
            variance = sum((l - mean) ** 2 for l in lengths) / len(lengths)
            std_dev = math.sqrt(variance)
            if std_dev < (mean * 0.15):
                return 0.1, "varianza sintáctica robótica (longitud de párrafos demasiado uniforme)"
    return 0.0, None


def analyze_document_ai(
    paragraphs: List[str],
    forensic_metadata: Optional[Dict[str, Any]] = None,
    paragraph_shading: Optional[List[bool]] = None,
    paragraph_web_shading: Optional[List[bool]] = None,
) -> List[Dict[str, Any]]:
    """
    Pipeline unificado de detección de IA a nivel documento.
    Analiza cada párrafo (analyze_ai_risk) y luego aplica señales
    globales (metadatos forenses, varianza sintáctica) consistentes
    con el mismo algoritmo que usa el Revisor.

    Retorna una lista con un dict por párrafo:
      {score: 0-1, category, findings, matches}
    """
    results: List[Dict[str, Any]] = []

    for i, p in enumerate(paragraphs):
        r = analyze_ai_risk(p)
        # Residuos de sombreado (web/IA) por párrafo
        if paragraph_web_shading and i < len(paragraph_web_shading) and paragraph_web_shading[i]:
            r["score"] = min(1.0, r["score"] + 0.5)
            r["findings"].insert(0, {
                "pattern": "web_shading",
                "severity": "HIGH",
                "detail": "Colores de sombreado de tabla web copiados (F4CCCC/FFE599/D9EAD3)",
                "count": 1,
                "phrase": "",
            })
        elif paragraph_shading and i < len(paragraph_shading) and paragraph_shading[i]:
            r["score"] = min(1.0, r["score"] + 0.3)
            r["findings"].insert(0, {
                "pattern": "shading_residue",
                "severity": "MEDIUM",
                "detail": "Residuos de formato web (sombreado sospechoso)",
                "count": 1,
                "phrase": "",
            })
        r["category"] = _categorize_score(r["score"])
        r["matches"] = [f.get("detail", "") for f in r["findings"]]
        results.append(r)

    # Señales globales de metadatos forenses. El boost se APLICA a todos los
    # párrafos para elevar el promedio del documento, pero se CAPTA en 0.15 para
    # no saturar: los párrafos limpios quedan en ~0.15 (LOW, sin badge) y solo
    # los ya sospechosos muestran el finding de metadatos en detalle.
    meta_boost, meta_signals = _metadata_document_signals(forensic_metadata)
    if meta_boost > 0:
        meta_boost = min(meta_boost, 0.15)
        meta_findings = [
            {"pattern": "metadata", "severity": "MEDIUM", "detail": s, "count": 1, "phrase": ""}
            for s in meta_signals
        ]
        for r in results:
            r["score"] = min(1.0, r["score"] + meta_boost)
            if r["score"] > 0.15:  # solo añade el detalle a párrafos ya marcados
                r["findings"] = meta_findings + r["findings"]
            r["category"] = _categorize_score(r["score"])
            r["matches"] = [f.get("detail", "") for f in r["findings"]]

    # Señal global de uniformidad sintáctica (solo refuerza párrafos ya marcados)
    uni_boost, uni_signal = _syntactic_variance_signal(paragraphs)
    if uni_boost > 0 and uni_signal:
        uni_finding = {
            "pattern": "syntactic_variance",
            "severity": "LOW",
            "detail": uni_signal,
            "count": 1,
            "phrase": "",
        }
        for r in results:
            if r["score"] > 0.15:  # solo refuerza, no crea falsos positivos
                r["score"] = min(1.0, r["score"] + uni_boost)
                r["findings"].insert(0, uni_finding)
                r["category"] = _categorize_score(r["score"])
                r["matches"] = [f.get("detail", "") for f in r["findings"]]

    return results
