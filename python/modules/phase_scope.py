"""Ambitos de fase: los H1 abren un ambito y cada ambito tiene sus criterios.

Este modulo es la UNA fuente de verdad. Antes, el alcance de una regla se
deducia del TEXTO del elemento con `any(kw in low_t for kw in ...)`:
"meta" esta dentro de "metodologia", asi que cualquier parrafo sobre
metodologia disparaba la regla de verbos de objetivos.

Aqui la comparacion solo puede ocurrir sobre el TITULO de un H1 (ver
`match_phase`), nunca sobre el cuerpo de un parrafo. El riesgo no se mitiga
con una lista de palabras mas cuidadosa: se elimina de raiz, porque el punto
de comparacion dejo de ser el cuerpo del texto.

Y como el alcance de una regla es DATO y no un `if` disperso, `RULE_SCOPES`
lo declara explicitamente y `test_rule_scopes.py` falla si el auditor emite
un `kind` que nadie declaro. Sin ese test, el alcance vuelve a inferirse por
descuido la proxima vez que alguien agregue una regla.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Dict, List, NamedTuple, Optional, Sequence, Tuple

# ── Claves de ambito ────────────────────────────────────────────────────────

GLOBAL = "global"
PORTADA_KEY = "portada"
NO_PHASE_KEY = "sin_fase"


# ── Fase ────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class PhaseConfig:
    """Un ambito abierto por un H1, con los criterios que le son propios.

    `read_only` marca los ambitos donde NADIE escribe. La portada es el
    caso: se mide, y cada incumplimiento aparece en Revision, pero ningun
    hallazgo trae `suggestion`, porque no hay nada que la aplicadora pueda
    escribir sin mutar la portada original (AGENTS.md §1, use_original_cover).
    """

    key: str
    label: str
    titles: Tuple[str, ...]
    criteria: Tuple[str, ...] = ()
    read_only: bool = False
    paragraph_words: Optional[Tuple[int, int]] = None


PHASES: Tuple[PhaseConfig, ...] = (
    PhaseConfig("resumen", "Resumen", ("resumen", "abstract"),
                criteria=("paragraph_words", "verbo_pasado"),
                paragraph_words=(150, 250)),
    PhaseConfig(PORTADA_KEY, "Portada", ("titulo", "portada", "title"),
                criteria=("portada_title_larga", "portada_punto_final"),
                read_only=True),
    PhaseConfig("objetivos", "Objetivos",
                ("objetivos", "objetivo", "proposito", "propositos", "finalidad",
                 "objetivo general", "objetivos generales", "objetivo especifico",
                 "objetivos especificos", "objetivos especificos de la investigacion",
                 "objetivos especificos de la investigacion"),
                criteria=("bloom_verb", "objetivo_sin_variable",
                          "objetivo_sin_infinitivo", "objetivo_multi_verbo")),
    PhaseConfig("introduccion", "Introduccion",
                ("introduccion", "introduccion al problema", "planteamiento del problema"),
                criteria=("paragraph_words",), paragraph_words=(80, 200)),
    PhaseConfig("marco_teorico", "Marco teorico",
                ("marco teorico", "marco referencial", "marco de referencia",
                 "antecedentes", "revision de la literatura", "revision teorica",
                 "fundamentacion teorica", "bases teoricas"),
                criteria=("paragraph_words", "parafrasis_vs_cita"),
                paragraph_words=(80, 200)),
    PhaseConfig("metodo", "Metodo",
                ("metodo", "metodologia", "materiales y metodos",
                 "diseno metodologico", "metodologia de la investigacion",
                 "enfoque metodologico"),
                # Sin `bloom_verb`: el verbo medible se juzga SOLO en la fase de
                # Objetivos, que tiene su propio analizador (REV-L2). Un párrafo
                # de método se mide por longitud y por detalle, no por Bloom.
                criteria=("paragraph_words", "metodo_sin_detalle"),
                paragraph_words=(80, 200)),
    PhaseConfig("resultados", "Resultados", ("resultados", "resultado"),
                criteria=("verbo_pasado",)),
    PhaseConfig("discusion", "Discusion", ("discusion", "analisis de resultados"),
                criteria=("verbo_pasado",)),
    PhaseConfig("conclusiones", "Conclusiones",
                ("conclusiones", "conclusion", "consideraciones finales",
                 "consideraciones finales y recomendaciones"),
                criteria=("verbo_pasado",)),
    PhaseConfig("referencias", "Referencias",
                ("referencias", "referencias bibliograficas", "bibliografia",
                 "bibliografia consultada", "works cited"),
                criteria=("apa_ampersand", "apa_doi_forma", "apa_edicion",
                          "apa_et_al", "apa_espaciado", "apa_punto_final")),
    PhaseConfig("anexos", "Anexos",
                ("anexos", "anexo", "apendice", "apendices")),
)

PHASE_BY_KEY: Dict[str, PhaseConfig] = {p.key: p for p in PHASES}


# ── Normalizacion y comparacion de titulos ───────────────────────────────────

# "Capitulo III. Metodologia" -> "Metodologia". Sin esto, ningun titulo de
# tesis con ese prefijo abria fase, y es la forma mas comun en un capitulo.
#
# LOS DIGITOS Y LOS DOS PUNTOS TAMBIEN, y no es una concession: son la forma mas
# comun en la otra convencion de capitulos. "CAPITULO 2: MARCO TEORICO" caia en
# `None` porque el grupo del medio no aceptaba el `2` y porque el cierre no
# aceptaba el `:` — y el frontend SI lo resolvia, con el mismo prefijo y los
# dos admitidos. Dos reglas que deberian ser la misma y no lo eran, y el
# siguiente bug de eso no es un titulo mal leido: es que el mosaico dice una
# fase y el auditor otra, y nadie sabe cual de las dos miente. El patron
# espelado es `PREFIJO_CAPITULO` de `src/lib/jerarquia.ts`.
#
# "Seccion de resultados" sigue intacto: `seccion` exige un espacio y un digito
# o romano despues, y "de" no es ninguno de los dos.
_CHAPTER_PREFIX = re.compile(
    r"^\s*(?:capitulo|capitulo|parte|seccion|unidad|unit)\s+[0-9ivxlcdm]+[.):]?\s+",
    re.IGNORECASE,
)

# El prefijo de numeración se quita SOLO si lo que sigue arranca en mayúscula.
#
# `[ivxlcdm]` acepta m, i, l, d, c, v, x: sin el filtro de mayúscula, "Mi
# metodología" perdía "Mi" y "Mil y una noches" se volvía "y una noches". Con
# el filtro, "3. Objetivos" y "IV. METODO" se siguen limpiando, que es lo
# único que el patrón es para. El comentario anterior afirmaba que el `\s+`
# final bastaba; no bastaba, y este es el arreglo.
_NUM_PREFIX = re.compile(r"^(?:[ivxlcdmIVXLCDM]+|\d+(?:\.\d+)*)[.)]?\s+")
_NON_ALNUM = re.compile(r"[^a-z0-9\s]")
_WS = re.compile(r"\s+")

# "Resultados de la encuesta" -> cabeza "resultados". Se corta por la palabra
# calificador, NO por subcadena: "Analisis de los datos" da cabeza "analisis",
# que no esta en el vocabulario, asi que NO abre fase.
#
# Se toleran hasta DOS palabras modificadoras antes del calificador porque los
# títulos de tesis las traen: "Objetivos específicos de la investigación" tiene
# "específicos" en el medio y sin él la fase se quedaba muda.
_QUALIFIER = re.compile(
    r"^(?P<head>[a-z0-9]+)(?:\s+[a-z0-9]+){0,2}?\s+"
    r"(?:de|del|la|el|los|las|para|sobre|y)\s+"
)


def normalize_title(raw: str) -> str:
    """Minusculas, sin acentos, sin numeracion inicial, sin puntuacion.

    "3. Objetivos" / "IV. METODO:" / "Capitulo III. Metodologia" / "  Discusion  "
      -> "objetivos" / "metodo" / "metodologia" / "discusion"
    """
    text = unicodedata.normalize("NFKD", raw or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.strip()
    text = _CHAPTER_PREFIX.sub(" ", text)
    num = _NUM_PREFIX.match(text)
    if num and text[num.end():num.end() + 1].isupper():
        text = text[num.end():]
    text = text.lower()
    text = _NON_ALNUM.sub(" ", text)
    return _WS.sub(" ", text).strip()


_BY_TITLE: Dict[str, str] = {}
for _cfg in PHASES:
    for _t in _cfg.titles:
        _BY_TITLE[normalize_title(_t)] = _cfg.key


def match_phase(title: str) -> Optional[str]:
    """Clave de fase que abre un H1 con este titulo, o `None`.

    Acepta el titulo exacto o su cabeza cuando el resto es un calificador.
    `None` es una respuesta correcta y frecuente: un H1 que no esta en el
    vocabulario es una seccion cualquiera y no hereda ningun criterio.
    """
    norm = normalize_title(title)
    if not norm:
        return None
    if norm in _BY_TITLE:
        return _BY_TITLE[norm]
    head = _QUALIFIER.match(norm)
    if head:
        return _BY_TITLE.get(head.group("head"))
    return None


def match_phase_exact(title: str) -> Optional[str]:
    """Como `match_phase`, pero SOLO si el titulo ES el nombre de la fase.

    La diferencia es la que separa un error de una decision del autor. Un H2
    que dice "Resultados" a secas es una fase mal nivelada y conviene
    promoverla. Un H2 que dice "Resultados de la encuesta" bajo "Metodo" es
    una subseccion que el autor puso ahi a proposito: el calificador es la
    senal de que quiere decir algo concreto, no la fase genérica.

    Por eso el editor usa ESTA y el auditor usa la otra. El auditor quiere
    medir el cuerpo de la fase, y "Resultados de la encuesta" pertenece a la
    fase Resultados. El editor quiere corregir niveles, y ahi el calificador
    significa lo contrario.
    """
    norm = normalize_title(title)
    if not norm:
        return None
    return _BY_TITLE.get(norm)


REFERENCES_PHASE = "referencias"


def is_references_title(title: str) -> bool:
    """True si este titulo abre la seccion de Referencias / Bibliografia.

    La unica definicion del proyecto. Antes contestaban cuatro lugares con tres
    vocabularios distintos: los dos generadores llevaban su propia lista (y solo
    uno sabia quitar la numeracion, asi que "3. Referencias" se deduplicaba en
    un camino y no en el otro), y el motor de fases conocia un quarto titulo. Un
    generador mas permisivo que el auditor es un bug esperando: uno deduplica
    una seccion que el otro no reconoce, y el resultado es que la bibliografia
    se come el contenido de una seccion del autor.

    Se usa `match_phase_exact` y no `match_phase` a proposito: "Referencias de
    la encuesta" es una seccion de datos, no la bibliografia.
    """
    return match_phase_exact(title) == REFERENCES_PHASE


# ── Ambitos declarados por regla ────────────────────────────────────────────

RULE_SCOPES: Dict[str, str] = {
    # Reglas generales: aplican a TODO el documento, esten donde esten. El
    # detector de IA es el ejemplo canonico: seis marcas de IA son un
    # problema en cualquier fase.
    "first_person": GLOBAL,
    "ai_phrase": GLOBAL,
    "muletilla": GLOBAL,
    "pegado": GLOBAL,
    "ortografia": GLOBAL,
    "repeticion": GLOBAL,
    "persona": GLOBAL,
    "incompleta": GLOBAL,
    "ambigua": GLOBAL,
    "passive_voice": GLOBAL,
    "long_sentence": GLOBAL,
    "ngram_repetition": GLOBAL,
    "bloom_low": GLOBAL,
    # Reglas de fase: solo dentro del ambito que las declara. "fase" significa
    # "el umbral depende de la fase", no una fase en concreto.
    "bloom_vague": "objetivos",
    "objetivo_sin_variable": "objetivos",
    "objetivo_sin_infinitivo": "objetivos",
    "objetivo_multi_verbo": "objetivos",
    "metodo_sin_detalle": "metodo",
    "paragraph_words": "fase",
    "verbo_pasado": "fase",
    "parafrasis_vs_cita": "marco_teorico",
    # Lint APA 7 de la seccion de Referencias: solo dentro de la bibliografia.
    "apa_ampersand": "referencias",
    "apa_doi_forma": "referencias",
    "apa_edicion": "referencias",
    "apa_et_al": "referencias",
    "apa_espaciado": "referencias",
    "apa_punto_final": "referencias",
    "portada_title_larga": PORTADA_KEY,
    "portada_punto_final": PORTADA_KEY,
    # Las ocho universales baratas del spec §12 NO se declaran todas aca: cada
    # una se declara en la misma linea donde se implementa, en `GLOBAL_CHECKS`.
    # Declararlas todas aqui y programarlas mas adelante deja un commit con
    # reglas muertas declaradas, que es justo lo que el guard de
    # `test_toda_regla_global_declarada_tiene_implementacion` prohibe.
}


# ── Criterios de fase ───────────────────────────────────────────────────────

# Verbos imprecisos para un objetivo de investigacion: no dicen QUE se va a
# hacer ni COMO se va a medir. Esta lista es de aqui y no de
# `proactive_auditor`, que la importa: `audit_objective` (proactive_auditor)
# la usa tambien, y dos copias de la misma lista divergen solas.
#
# Ojo con las entradas de varias palabras: "tener idea de" se busca como
# subcadena, asi que "no tener idea de" tambien matchea. Es aceptable porque
# las dos son igual de imprecisas.
VAGUE_VERBS: Tuple[str, ...] = (
    "conocer", "entender", "aprender", "saber", "comprender", "estudiar",
    "familiarizarse", "tener idea de", "estar al tanto de", "darse cuenta de",
)

# Verbos que en una fase de resultados/discusion/conclusion deberian estar en
# pasado, porque en esas fases ya se reporto lo que se hizo.
_PAST_ONLY_VERBS: Tuple[str, ...] = (
    "proponer", "buscar", "describir", "analizar", "evaluar", "determinar",
    "medir", "desarrollar", "aplicar", "comparar",
)

_WORD_SPLIT = re.compile(r"\S+")


def _term_pattern(term: str) -> str:
    """Construye un patrón de palabra exacta o frase con límites seguros.

    Evita que "saber" haga match en "saberes" o que "conocer" haga match
    dentro de textos no objetivos. Si el término contiene espacios, acepta
    uno o más espacios entre palabras.
    """
    normalized = re.escape(term)
    normalized = normalized.replace(r"\ ", r"\s+")
    return rf"(?<![a-záéíóúñü]){normalized}(?![a-záéíóúñü])"


def _find_term(text: str, term: str) -> Optional[re.Match[str]]:
    return re.search(_term_pattern(term), text, re.IGNORECASE)


def _check_bloom_verb(eid: str, text: str, cfg: PhaseConfig, mk) -> List[Dict[str, Any]]:
    low = (text or "").lower()
    for verb in VAGUE_VERBS:
        match = _find_term(low, verb)
        if match:
            pos = match.start()
            end = match.end()
            return [mk(eid, text, pos, end, "bloom_vague", "warn",
                       f'Verbo impreciso "{text[pos:end]}" en la fase '
                       f"{cfg.label}; usa un verbo en infinitivo medible "
                       f"(determinar, medir, evaluar)",
                       suggestion="determinar", phase=cfg.key,
                       read_only=cfg.read_only)]
    return []


def _check_paragraph_words(eid: str, text: str, cfg: PhaseConfig, mk) -> List[Dict[str, Any]]:
    if not cfg.paragraph_words:
        return []
    lo, hi = cfg.paragraph_words
    n = len(_WORD_SPLIT.findall(text or ""))
    if lo <= n <= hi:
        return []
    return [mk(eid, text, 0, len(text or ""), "paragraph_words",
               "info" if n > hi else "warn",
               f"Este parrafo tiene {n} palabras y la fase {cfg.label} pide "
               f"entre {lo} y {hi}",
               phase=cfg.key, read_only=cfg.read_only)]


def _check_objetivo_sin_variable(eid: str, text: str, cfg: PhaseConfig, mk) -> List[Dict[str, Any]]:
    low = (text or "").lower()
    if not low.strip():
        return []

    variable_terms = (
        "variable", "variables", "muestra", "poblacion", "participantes",
        "resultado", "resultados", "efecto", "relacion", "comparacion",
        "indicador", "dimensiones", "frecuencia", "porcentaje", "nivel",
        "instrumento", "procedimiento", "diseño"
    )
    if any(term in low for term in variable_terms):
        return []

    generic_markers = ("proceso", "estudio", "caso", "tema", "situacion")
    if not any(marker in low for marker in generic_markers):
        return []

    if len(_WORD_SPLIT.findall(text or "")) < 6:
        return [mk(eid, text, 0, len(text or ""), "objetivo_sin_variable", "warn",
                   "El objetivo es muy genérico; define la variable, la población o la relación que se medirá.",
                   suggestion="Determinar la relación entre X y Y o el efecto de X sobre Y.",
                   phase=cfg.key, read_only=cfg.read_only)]

    return [mk(eid, text, 0, len(text or ""), "objetivo_sin_variable", "warn",
               "El objetivo no especifica claramente qué variable o constructo se medirá.",
               suggestion="Determinar el efecto de X sobre Y o la relación entre X y Y.",
               phase=cfg.key, read_only=cfg.read_only)]


# Verbos de accion que un objetivo de investigacion puede usar como verbo
# rector. Es una lista BLANCA a proposito: contar cualquier palabra terminada
# en -ar/-er/-ir daria falsos positivos con sustantivos ("lugar", "mujer",
# "taller"), y una ley que dispara de mas deja de ser una ley.
_OBJETIVO_VERBOS: frozenset = frozenset((
    "identificar", "definir", "listar", "mencionar", "nombrar", "reconocer",
    "comprender", "explicar", "describir", "interpretar", "resumir",
    "clasificar", "comparar", "aplicar", "usar", "implementar", "demostrar",
    "calcular", "analizar", "diferenciar", "organizar", "relacionar",
    "examinar", "contrastar", "evaluar", "justificar", "argumentar",
    "valorar", "criticar", "crear", "diseñar", "desarrollar", "construir",
    "proponer", "formular", "elaborar", "planificar", "determinar", "medir",
    "cuantificar", "establecer", "optimizar", "mejorar", "reducir",
    "incrementar", "generar", "validar", "verificar", "diagnosticar",
    "caracterizar", "seleccionar", "escoger", "modelar", "simular",
    "estimar", "comprobar", "corroborar", "sustentar", "fundamentar",
    "presentar", "redactar", "plantear",
))

# Palabras que terminan en -ar/-er/-ir pero NO son verbos: si abren el
# objetivo, no lo hacen con un verbo, y la ley tiene que verlo.
_NO_VERBO_INFINITIVO: frozenset = frozenset((
    "lugar", "lugares", "familiar", "familiares", "escolar", "escolares",
    "profesional", "profesionales", "principal", "principales", "general",
    "generales", "particular", "particulares", "similar", "similares",
    "celular", "hogar", "lunar", "militar", "nuclear", "angular", "mujer",
    "mujeres", "taller", "talleres", "mayor", "mayores", "mejor", "mejores",
    "poder", "deber",
))


def _limpiar_palabra(raw: str) -> str:
    return re.sub(r"[^a-záéíóúñü]", "", (raw or "").lower())


def _es_infinitivo(palabra: str) -> bool:
    return (len(palabra) >= 4
            and palabra.endswith(("ar", "er", "ir"))
            and palabra not in _NO_VERBO_INFINITIVO)


def _check_objetivo_sin_infinitivo(eid: str, text: str, cfg: PhaseConfig, mk) -> List[Dict[str, Any]]:
    palabras = [p for p in (_limpiar_palabra(w) for w in _WORD_SPLIT.findall(text or "")) if p]
    if len(palabras) < 2:
        return []
    if _es_infinitivo(palabras[0]):
        return []
    return [mk(eid, text, 0, len(text or ""), "objetivo_sin_infinitivo", "warn",
               "El objetivo debe abrir con un verbo en infinitivo "
               "(determinar, evaluar, analizar), y empieza con "
               f'"{palabras[0]}".',
               suggestion="Determinar...", phase=cfg.key,
               read_only=cfg.read_only)]


def _check_objetivo_multi_verbo(eid: str, text: str, cfg: PhaseConfig, mk) -> List[Dict[str, Any]]:
    verbos = [p for p in (_limpiar_palabra(w) for w in _WORD_SPLIT.findall(text or ""))
              if p in _OBJETIVO_VERBOS]
    if len(verbos) <= 1:
        return []
    return [mk(eid, text, 0, len(text or ""), "objetivo_multi_verbo", "warn",
               f"El objetivo encadena {len(verbos)} verbos de accion "
               f"({', '.join(verbos)}); la regla pide uno solo.",
               suggestion="Elegí un unico verbo rector para el objetivo.",
               phase=cfg.key, read_only=cfg.read_only)]


def _check_metodo_sin_detalle(eid: str, text: str, cfg: PhaseConfig, mk) -> List[Dict[str, Any]]:
    low = (text or "").lower()
    if not low.strip():
        return []

    method_terms = (
        "muestra", "poblacion", "participantes", "instrumento", "encuesta",
        "entrevista", "cuestionario", "diseño", "procedimiento", "muestreo",
        "variables", "analisis", "estadistico", "cualitativo", "cuantitativo",
        "metodologia", "técnica", "aplicacion"
    )
    if any(term in low for term in method_terms):
        return []

    generic_markers = ("se realizo", "se llevó a cabo", "se aplico", "se hizo", "estudio")
    if not any(marker in low for marker in generic_markers):
        return []

    return [mk(eid, text, 0, len(text or ""), "metodo_sin_detalle", "info",
               "El método es demasiado genérico; especifica muestra, diseño, instrumentos, procedimiento y análisis.",
               suggestion="Diseño: ..., muestra: ..., instrumentos: ..., procedimiento: ..., análisis: ...",
               phase=cfg.key, read_only=cfg.read_only)]


def _check_verbo_pasado(eid: str, text: str, cfg: PhaseConfig, mk) -> List[Dict[str, Any]]:
    low = text.lower()
    for verb in _PAST_ONLY_VERBS:
        match = re.search(rf"(?<![a-záéíóúñü]){re.escape(verb)}(?![a-záéíóúñü])", low)
        if match:
            pos = match.start()
            end = match.end()
            return [mk(eid, text, pos, end, "verbo_pasado", "info",
                       f'"{text[pos:end]}" esta en infinitivo; la fase '
                       f"{cfg.label} ya reporto lo que se hizo, asi que va en pasado",
                       phase=cfg.key, read_only=cfg.read_only)]
    return []


def _check_portada_title_larga(eid: str, text: str, cfg: PhaseConfig, mk) -> List[Dict[str, Any]]:
    n = len(_WORD_SPLIT.findall(text or ""))
    if n <= 20:
        return []
    return [mk(eid, text, 0, len(text or ""), "portada_title_larga", "warn",
               f"El titulo tiene {n} palabras; un titulo de portada no suele "
               f"pasar de 20", phase=cfg.key, read_only=True)]


def _check_portada_punto_final(eid: str, text: str, cfg: PhaseConfig, mk) -> List[Dict[str, Any]]:
    stripped = (text or "").strip()
    if not stripped.endswith("."):
        return []
    return [mk(eid, text, max(0, len(stripped) - 1), len(stripped),
               "portada_punto_final", "info",
               "El titulo de portada no lleva punto final",
               phase=cfg.key, read_only=True)]


# Una cita APA en el cuerpo: (Perez, 2020) o Perez (2020). Su ausencia es lo
# que hace que una atribucion sea sospechosa.
_CITE_RE = re.compile(r"\([^()]{2,60},\s*(?:19|20)\d{2}[a-z]?\)")
_WORD_RE = re.compile(r"\S+")
# Nombres propios que NO son autores citados: propios de la propia institucion,
# paises y el nombre de la disciplina.
_NOT_A_CITED_AUTHOR = {
    "managua", "nicaragua", "universidad", "republica", "ministerio", "instituto",
    "escuela", "facultad", "departamento", "america", "latinoamerica", "espana",
    "estados", "datos", "tabla", "figura", "grafico", "anexo", "capitulo",
}


def _check_parafrasis_vs_cita(eid: str, text: str, cfg: PhaseConfig, mk) -> List[Dict[str, Any]]:
    """Atribucion con forma de autor y sin cita.

    Version minima y honesta: mira un token con forma de apellido (mayuscula
    inicial, no al inicio de oracion, no en la lista de palabras que no son
    autores) y avisa si el parrafo no trae ninguna cita APA. NO decide si la
    parafrasis esta bien: eso es juicio, y lo hace la capa semantica. Esto
    solo dice "mencionaste a alguien y no lo citaste", que es determinista.
    """
    if _CITE_RE.search(text or ""):
        return []
    for m in re.finditer(r"(?<!^)(?<![.!?:;]\s)(?<!¿)([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{3,})", text or ""):
        apellido = m.group(1).lower()
        if apellido in _NOT_A_CITED_AUTHOR:
            continue
        return [mk(eid, text, m.start(1), m.end(1), "parafrasis_vs_cita", "info",
                   f'Mencionas "{m.group(1)}" sin una cita (Autor, año) en el '
                   f"párrafo. En marco teórico, lo que se atribuye a un autor "
                   f"lleva cita o se parafrasea explícito.",
                   phase=cfg.key, read_only=cfg.read_only)]
    return []


# ── Lint APA 7 de la seccion de Referencias ─────────────────────────────────
#
# Seis reglas de FORMA sobre el texto de una entrada de la bibliografia. Ninguna
# decide si la referencia es correcta —eso lo dice la verificacion contra una
# fuente—; dicen que una entrada no sigue la forma que APA 7 fija para ese
# campo. Cada una trae el texto COMPLETO corregido en `suggestion` porque el
# boton "Aceptar" escribe el elemento entero, no el fragmento.
#
# No corren sobre el encabezado de la seccion: `match_phase_exact` ya sabe cual
# es, y sin esa guarda "Referencias" se reportaria a si misma.

_APA_YEAR_RE = re.compile(r"\(\s*(?:1[89]|20)\d{2}[a-z]?\s*\)")
_APA_EDICION_RE = re.compile(r"\(\s*(\d+)\s*(?:a|ª|\.ª|\.)?\s*ed\.?\s*\)", re.IGNORECASE)
_APA_DOI_RE = re.compile(r"10\.\d{4,9}/[^\s,;)\]]+")
_APA_DOI_PREFIJO_RE = re.compile(r"(?:doi\s*:\s*|https?://(?:dx\.)?doi\.org/)", re.IGNORECASE)
_APA_ETAL_RE = re.compile(r"\bet\.?\s*al(?!\.)", re.IGNORECASE)
_APA_DOBLE_ESPACIO_RE = re.compile(r"\S {2,}\S")
_APA_ESPACIO_PUNTUACION_RE = re.compile(r"\s+[.,;:]")


def _es_encabezado_referencias(text: str) -> bool:
    """True si el texto ES el titulo de la seccion de Referencias."""
    return match_phase_exact(text or "") == REFERENCES_PHASE


def _check_apa_ampersand(eid: str, text: str, cfg: PhaseConfig, mk) -> List[Dict[str, Any]]:
    """Entre autores APA 7 usa ``&``, no la conjuncion en espanol."""
    if _es_encabezado_referencias(text):
        return []
    ym = _APA_YEAR_RE.search(text or "")
    if not ym:
        return []
    autores = text[:ym.start()]
    m = re.search(r",?\s+y\s+", autores)
    if not m:
        return []
    union = ", & " if m.group(0).strip().startswith(",") else " & "
    nuevo = autores[:m.start()] + union + autores[m.end():] + text[ym.start():]
    return [mk(eid, text, m.start(), m.end(), "apa_ampersand", "warn",
               'En APA 7 la lista de autores se une con "&", no con "y".',
               suggestion=nuevo, phase=cfg.key, read_only=cfg.read_only)]


def _check_apa_doi_forma(eid: str, text: str, cfg: PhaseConfig, mk) -> List[Dict[str, Any]]:
    """El DOI se escribe como URL canonica ``https://doi.org/...``."""
    if _es_encabezado_referencias(text):
        return []
    m = _APA_DOI_RE.search(text or "")
    if not m:
        return []
    doi = m.group(0).rstrip(".,;")
    canon = "https://doi.org/" + doi
    inicio = m.start()
    for pm in _APA_DOI_PREFIJO_RE.finditer(text, 0, m.end()):
        if pm.end() == m.start():
            inicio = pm.start()
    if text[inicio:m.end()].strip() == canon:
        return []
    nuevo = text[:inicio] + canon + text[m.end():]
    return [mk(eid, text, inicio, m.end(), "apa_doi_forma", "info",
               'El DOI se escribe como "https://doi.org/...", sin "doi:" ni "dx.doi.org".',
               suggestion=nuevo, phase=cfg.key, read_only=cfg.read_only)]


def _check_apa_edicion(eid: str, text: str, cfg: PhaseConfig, mk) -> List[Dict[str, Any]]:
    """La edicion en espanol se escribe ``(2.ª ed.)``."""
    if _es_encabezado_referencias(text):
        return []
    m = _APA_EDICION_RE.search(text or "")
    if not m:
        return []
    canonico = f"({m.group(1)}.ª ed.)"
    if m.group(0).strip() == canonico:
        return []
    nuevo = text[:m.start()] + canonico + text[m.end():]
    return [mk(eid, text, m.start(), m.end(), "apa_edicion", "info",
               f'La edicion en espanol se escribe "{canonico}".',
               suggestion=nuevo, phase=cfg.key, read_only=cfg.read_only)]


def _check_apa_et_al(eid: str, text: str, cfg: PhaseConfig, mk) -> List[Dict[str, Any]]:
    """``et al.`` lleva punto."""
    if _es_encabezado_referencias(text):
        return []
    m = _APA_ETAL_RE.search(text or "")
    if not m:
        return []
    nuevo = text[:m.start()] + "et al." + text[m.end():]
    return [mk(eid, text, m.start(), m.end(), "apa_et_al", "info",
               '"et al." se escribe con punto.',
               suggestion=nuevo, phase=cfg.key, read_only=cfg.read_only)]


def _check_apa_espaciado(eid: str, text: str, cfg: PhaseConfig, mk) -> List[Dict[str, Any]]:
    """Sin dobles espacios ni espacio antes de puntuacion."""
    if _es_encabezado_referencias(text):
        return []
    m = _APA_DOBLE_ESPACIO_RE.search(text or "") or _APA_ESPACIO_PUNTUACION_RE.search(text or "")
    if not m:
        return []
    nuevo = re.sub(r" {2,}", " ", text)
    nuevo = re.sub(r"\s+([.,;:])", r"\1", nuevo)
    if nuevo == text:
        return []
    return [mk(eid, text, m.start(), m.end(), "apa_espaciado", "info",
               "La entrada tiene espacios de mas.",
               suggestion=nuevo, phase=cfg.key, read_only=cfg.read_only)]


def _check_apa_punto_final(eid: str, text: str, cfg: PhaseConfig, mk) -> List[Dict[str, Any]]:
    """La entrada termina en punto, salvo si cierra en DOI o URL."""
    if _es_encabezado_referencias(text):
        return []
    t = (text or "").rstrip()
    if len(t) < 15 or t.endswith("."):
        return []
    if re.search(r"https?://\S+$", t) or _APA_DOI_RE.search(t[-80:]):
        return []
    return [mk(eid, text, len(t), len(text or ""), "apa_punto_final", "info",
               "Las entradas de la bibliografia terminan en punto.",
               suggestion=t + ".", phase=cfg.key, read_only=cfg.read_only)]


# Criterios que solo tienen sentido sobre el TITULO de la portada, no sobre
# cualquier elemento de ella.
#
# El elemento de portada no es el titulo: `pre_classifier` convierte CADA
# parrafo anterior al limite de portada en `portada_block`, o sea el autor, el
# docente, la fecha y el lugar tambien lo son. Aplicar "el titulo no lleva
# punto final" a todos ellos hacia que cada linea puntuada de la portada fuera
# un hallazgo, y como son de solo lectura el usuario solo los descarta de a
# uno. El flag que decide se llama `is_cover_title` y lo calcula el llamador;
# su nombre viejo (`is_cover`) es exactamente lo que confundo.
_PORTADA_ONLY = {"portada_title_larga", "portada_punto_final"}


_CHECKS = {
    "parafrasis_vs_cita": _check_parafrasis_vs_cita,
    "bloom_verb": _check_bloom_verb,
    "objetivo_sin_variable": _check_objetivo_sin_variable,
    "objetivo_sin_infinitivo": _check_objetivo_sin_infinitivo,
    "objetivo_multi_verbo": _check_objetivo_multi_verbo,
    "metodo_sin_detalle": _check_metodo_sin_detalle,
    "paragraph_words": _check_paragraph_words,
    "verbo_pasado": _check_verbo_pasado,
    "portada_title_larga": _check_portada_title_larga,
    "portada_punto_final": _check_portada_punto_final,
    "apa_ampersand": _check_apa_ampersand,
    "apa_doi_forma": _check_apa_doi_forma,
    "apa_edicion": _check_apa_edicion,
    "apa_et_al": _check_apa_et_al,
    "apa_espaciado": _check_apa_espaciado,
    "apa_punto_final": _check_apa_punto_final,
    # `parafrasis_vs_cita` se vivio DOS TAREAS declarado en `marco_teorico`
    # y en RULE_SCOPES sin entrada aca, y `phase_findings` lo ignoraba en
    # silencio: la fase marco teorico tenia 1 criterio vivo de 2 y nadie lo
    # notaba. `test_criterios_declarados_estan_implementados` es el guard que
    # faltaba; ver la nota de R12 en el ledger.
}


def phase_findings(phase: str, eid: str, text: str, *, mk,
                   is_cover_title: bool = False) -> List[Dict[str, Any]]:
    """Hallazgos de los criterios de la fase a la que pertenece este elemento.

    Un elemento en `sin_fase` no esta en ninguna fase del vocabulario y no
    dispara nada. Las reglas generales NO pasan por aca: ya corrieron, y lo
    hacen en todas las fases.

    `is_cover_title` habilita los criterios que son sobre el titulo de portada.
    Lo que cuenta es ser EL TITULO (la primera linea con texto de la portada),
    no estar en la portada: sin esa distincion, cada linea puntuada de la
    portada —el autor, el docente, la fecha— salia reportada como un titulo
    mal escrito.
    """
    cfg = PHASE_BY_KEY.get(phase)
    if cfg is None or not cfg.criteria:
        return []
    out: List[Dict[str, Any]] = []
    for cid in cfg.criteria:
        if cid in _PORTADA_ONLY and not is_cover_title:
            continue
        check = _CHECKS.get(cid)
        if check is not None:
            out.extend(check(eid, text, cfg, mk))
    return out


# ── Mapa de ambitos ─────────────────────────────────────────────────────────

@dataclass(frozen=True)
class PhaseSpan:
    """Un ambito y el rango de elementos que cubre, para poder reportarlo."""

    key: str
    label: str
    heading_id: str
    start_index: int
    end_index: int


def phase_label(key: str) -> str:
    cfg = PHASE_BY_KEY.get(key)
    return cfg.label if cfg else "Seccion sin nombre"


def etype(e: Any) -> str:
    """Tipo del elemento como string, tolerante a enum y a string plano."""
    t = getattr(e, "type", "")
    return str(getattr(t, "value", t) or "")


def _level(e: Any) -> int:
    """Nivel del encabezado. `None` se trata como 1, que es el default real
    de `ElementModel.heading_level`."""
    raw = getattr(e, "heading_level", None)
    return 1 if raw is None else int(raw)


def _close(span: PhaseSpan, end_index: int) -> PhaseSpan:
    return PhaseSpan(key=span.key, label=span.label, heading_id=span.heading_id,
                     start_index=span.start_index, end_index=end_index)


def build_phase_map(elements: Sequence[Any]) -> Tuple[Dict[str, str], List[PhaseSpan]]:
    """Ambito de cada elemento, y los tramos que esos ambitos cubren.

    Precedencia, en este orden:
      1. Todo elemento con `is_cover_section` o tipo `portada_block` es portada.
      2. Un H1 reconocido cambia el ambito al que su titulo abra, o a
         `sin_fase` si el titulo no esta en el vocabulario.
      3. Un H2 o un H3 **hereda**: no cambian el ambito. Por eso el mapa se
         construye solo con H1 y no hay ambiguedad de anidamiento posible.
      4. Antes del primer H1, el ambito es `portada`.
    """
    phase_by_id: Dict[str, str] = {}
    spans: List[PhaseSpan] = []
    current = PORTADA_KEY
    # Un tramo solo se abre si el ambito tiene ALGO dentro. Un documento que
    # arranca con un H1 no tiene un tramo de portada vacio que reportar, y
    # uno con start_index == end_index la interfaz lo pintaria como una fase
    # mas. De ahi el `region_open`: `key != current` no basta para saber que
    # hay un tramo anterior que cerrar.
    region_open = False

    for i, e in enumerate(elements):
        kind = etype(e)
        if getattr(e, "is_cover_section", False) or kind == "portada_block":
            key = PORTADA_KEY
        elif kind == "heading" and _level(e) == 1:
            key = match_phase(getattr(e, "text", "") or "") or NO_PHASE_KEY
        else:
            key = current

        if region_open and key != current:
            spans[-1] = _close(spans[-1], i)
        if not region_open or key != current:
            spans.append(PhaseSpan(key=key, label=phase_label(key),
                                   heading_id=str(getattr(e, "id", "") or ""),
                                   start_index=i, end_index=len(elements)))
            region_open = True

        current = key
        phase_by_id[str(getattr(e, "id", "") or "")] = current

    if spans:
        spans[-1] = _close(spans[-1], len(elements))
    return phase_by_id, spans

# ── Capa 2: reglas globales ─────────────────────────────────────────────────
#
# Las reglas GLOBALES corren en todo el documento, sin importar la fase. No
# pueden recibir el ambito: si lo reciben, son de fase. Viven aca y no sueltas
# dentro de `audit_elements` por la misma razon que las de fase viven en
# `phase_findings`: para que "esta regla existe" sea una fila de un diccionario
# y no un `if` que hay que encontrar en 500 lineas.
#
# Estas SI necesitan estado de documento —una sigla se define una vez, una
# unidad se compara contra todo el texto, los conectores se cuentan por
# frecuencia—, asi que reciben un contexto que se calcula UNA vez antes del
# bucle, igual que hoy hace `repeat_muletilla`.


class GlobalContext(NamedTuple):
    """Estado de documento que las reglas globales necesitan.

    `doc_words` es el largo REAL en palabras, porque las frecuencias de R-G63
    se normalizan por mil palabras: tres "sin embargo" en un documento de 300
    palabras es un problema y en uno de 12.000 no.
    """
    doc_words: int
    seen_acronyms: frozenset
    connector_counts: dict


def build_global_context(elements: Sequence[Any]) -> GlobalContext:
    textos = [(getattr(e, "text", "") or "") for e in elements]
    return GlobalContext(
        doc_words=sum(len(_WORD_SPLIT.findall(t)) for t in textos),
        seen_acronyms=frozenset(),
        connector_counts={},
    )


def global_findings(eid: str, text: str, ctx: GlobalContext, *, mk) -> List[Dict[str, Any]]:
    """Hallazgos de las reglas globales sobre un parrafo.

    Nunca recibe el ambito, y eso no es una omision: una regla que lo recibiera
    seria de fase, y confundir las dos capas es exactamente el defecto que este
    modulo vino a eliminar.
    """
    out: List[Dict[str, Any]] = []
    for check in GLOBAL_CHECKS.values():
        out.extend(check(eid, text, ctx, mk))
    return out


# Los ids son los del catalogo (spec §12) y el `kind` que viaja al frontend es
# el mismo id: asi la fila de `PROOFREAD_SPECS` y el mapa de transparencia
# hablan del mismo nombre.
GLOBAL_CHECKS: Dict[str, Any] = {}


def _in_quoted(text: str, pos: int) -> bool:
    """True si la posicion cae dentro de un tramo entre comillas.

    Citar un texto con exclamaciones o coloquialismos es legitimo. Es la misma
    guarda que usa el corrector para la primera persona, y por el mismo motivo:
    lo que se audita es la prosa de quien escribe, no lo que cita.
    """
    antes = text[:pos]
    if antes.count('"') % 2 == 1:
        return True
    return antes.count("“") > antes.count("”")


def _sentences(text: str) -> List[str]:
    return [s for s in re.split(r"(?<=[.!?])\s+", (text or "").strip()) if s]


# ── R-G51 y R-G52: registro y tono ──────────────────────────────────────────

# R-G52: sin exclamaciones de entusiasmo en prosa argumentativa. "Menor" en el
# catalogo, asi que `info`: se informa y no se aplica.
_EXCLAMATION_RE = re.compile(r"!")

# R-G51: registro coloquial. "Critica" en el catalogo, asi que `error`.
# La lista es CERRADA a proposito, y el match exige limites de palabra: un
# detector de coloquialismo por subcadena a pelo es el mismo patron que nos
# mordio con "meta" dentro de "metodologia", y "bueno" no puede ser "buenotrabajo".
_COLOQUIAL = (
    "o sea", "pues", "bueno", "vale", "a ver", "chido", "neta", "ta de",
    "mas o menos", "en el fondo", "se me hace que", "nada que ver",
    "dar en el clavo", "echar la culpa",
)


def _check_g51_registro_coloquial(eid, text, ctx, mk):
    low = (text or "").lower()
    out = []
    for frase in _COLOQUIAL:
        patron = r"(?<![a-záéíóúñ])" + re.escape(frase) + r"(?![a-záéíóúñ])"
        for m in re.finditer(patron, low):
            if _in_quoted(text, m.start()):
                continue
            out.append(mk(eid, text, m.start(), m.end(), "g51_registro_coloquial",
                          "error", f'Registro coloquial: "{frase}". La prosa '
                          f"argumental va en registro formal", phase="global"))
            break
    return out


def _check_g52_exclamacion(eid, text, ctx, mk):
    out = []
    for m in _EXCLAMATION_RE.finditer(text or ""):
        if _in_quoted(text, m.start()):
            continue
        out.append(mk(eid, text, m.start(), m.end(), "g52_exclamacion", "info",
                      "Una exclamacion en prosa argumental: APA 7 no las usa",
                      phase="global"))
    return out


# Declaradas y programadas en la MISMA linea: ver la nota en RULE_SCOPES sobre
# por que las ocho del catalogo no se declaran todas juntas.
RULE_SCOPES.update({
    "g51_registro_coloquial": GLOBAL,
    "g52_exclamacion": GLOBAL,
})

GLOBAL_CHECKS.update({
    "g51_registro_coloquial": _check_g51_registro_coloquial,
    "g52_exclamacion": _check_g52_exclamacion,
})


# ── R-G53 y R-G11: persona y ritmo ───────────────────────────────────────────

# R-G53: segunda persona al lector. "Mayor" en el catalogo.
_READER_RE = re.compile(
    r"(?<![a-záéíóúñ])(?:como veras|como puedes ver|como veas|imagina que|"
    r"fijate|note que|te lo repito|te lo explico)(?![a-záéíóúñ])"
)

# R-G11: variacion en la longitud de oracion. "Menor" en el catalogo.
#
# El piso de 4 oraciones es lo que separa esta regla de un generador de
# falsos positivos: la desviacion de dos numeros no describe un ritmo, y con el
# umbral del catalogo (sigma < 3) un parrafo corto bien escrito —"Se hizo. Se
# vio. Se dijo."— saldria marcado. Es la Review Focus 1 del plan.
_MIN_SENTENCES = 4
_SIGMA_FLOOR = 3.0


def _check_g53_segunda_persona(eid, text, ctx, mk):
    out = []
    # Se busca en la version en minusculas, como con el coloquialismo: buscar
    # con mayusculas initial en el patron hacia que "Como veras" al inicio de
    # oracion — la forma mas comun — no matcheara nunca.
    low = (text or "").lower()
    for m in _READER_RE.finditer(low):
        if _in_quoted(text, m.start()):
            continue
        out.append(mk(eid, text, m.start(), m.end(), "g53_segunda_persona", "medium",
                      f'"{m.group(0)}": segunda persona al lector. La prosa '
                      f"argumental se dirige al tercero", phase="global"))
    return out


def _check_g11_variacion_oracion(eid, text, ctx, mk):
    sents = _sentences(text)
    if len(sents) < _MIN_SENTENCES:
        return []
    largos = [len(_WORD_SPLIT.findall(s)) for s in sents]
    media = sum(largos) / len(largos)
    sigma = (sum((n - media) ** 2 for n in largos) / len(largos)) ** 0.5
    if sigma >= _SIGMA_FLOOR:
        return []
    return [mk(eid, text, 0, len(text or ""), "g11_variacion_oracion", "info",
              f"Las {len(sents)} oraciones del parrafo miden casi lo mismo "
              f"(desviacion {sigma:.1f} palabras). Una redaccion mecanica tiene "
              f"latidos iguales; alternar la longitud las hace mas leibles",
              phase="global")]


RULE_SCOPES.update({
    "g53_segunda_persona": GLOBAL,
    "g11_variacion_oracion": GLOBAL,
})

GLOBAL_CHECKS.update({
    "g53_segunda_persona": _check_g53_segunda_persona,
    "g11_variacion_oracion": _check_g11_variacion_oracion,
})


# ── R-G34, R-G35, R-G61, R-G63: las que necesitan estado de documento ───────

# R-G34: siglas y acronimos. Se definen la primera vez: "Producto Interno Bruto
# (PIB)". "Mayor" en el catalogo.
_ACRONYM_RE = re.compile(r"\b[A-ZÁÉÍÓÚÑ]{2,6}\b")
_DEFINES_ACRONYM = re.compile(r"\(\s*([A-ZÁÉÍÓÚÑ]{2,6})\s*\)")
# Siglas que no son acronimos: dias, meses, numeros romanos, y APA que ya es
# una sigla que todo el campo conoce. Sin esta lista, R-G34 marca "IV" en
# cada encabezado numerado del documento.
_NOT_ACRONYM = {"APA", "MSN", "DPI", "DOI", "ISBN", "PDF", "TCA", "I", "II",
                "III", "IV", "V", "VI", "U", "N", "S", "ENE", "ABR", "AGO", "DIC"}


def _check_g34_sigla_sin_definir(eid, text, ctx, mk):
    texto = text or ""
    # Definida en este mismo parrafo: "Producto Interno Bruto (PIB)".
    definidas = {m.group(1) for m in _DEFINES_ACRONYM.finditer(texto)}
    out = []
    for m in _ACRONYM_RE.finditer(texto):
        sigla = m.group(0)
        if sigla in definidas or sigla in _NOT_ACRONYM:
            continue
        if sigla in ctx.seen_acronyms:
            # Ya se reporto en su primera aparicion. Marcarla en cada parrafo
            # produce una tanda de hallazgos identicos, y lo que el autor tiene
            # que hacer es definirse UNA vez.
            continue
        out.append(mk(eid, texto, m.start(), m.end(), "g34_sigla_sin_definir",
                      "medium",
                      f'La sigla "{sigla}" no esta definida. Se define la primera '
                      f"vez: Nombre completo ({sigla}), y despues solo la sigla",
                      phase="global"))
    return out


# R-G35: consistencia de unidades. "Menor". Un numero con sigla y el mismo
# concepto escrito en palabras, en el mismo parrafo.
_UNITS = {
    "kg": "kilogramos", "g": "gramos", "cm": "centimetros", "mm": "milimetros",
    "m": "metros", "km": "kilometros", "l": "litros", "ml": "mililitros",
}
_UNITS_SIGLA = sorted(_UNITS, key=len, reverse=True)
_UNITS_PALABRA = sorted(set(_UNITS.values()), key=len, reverse=True)
_UNIT_SIGLA_RE = re.compile(
    r"(\d+)\s*\b(" + "|".join(_UNITS_SIGLA) + r")\b")
_UNIT_PALABRA_RE = re.compile(r"\b(" + "|".join(_UNITS_PALABRA) + r")\b")


def _check_g35_unidades_mixtas(eid, text, ctx, mk):
    low = (text or "").lower()
    con_sigla = {_UNITS[m.group(2)]: m.start(2)
                 for m in _UNIT_SIGLA_RE.finditer(low)}
    out = []
    for m in _UNIT_PALABRA_RE.finditer(low):
        larga = m.group(1)
        if larga in con_sigla:
            out.append(mk(eid, text, m.start(), m.end(), "g35_unidades_mixtas", "info",
                          f'Alternas "{_UNITS_INV[larga]}" y "{larga}" para lo '
                          f"mismo. Una sola forma de unidad en todo el documento",
                          phase="global"))
            break
    return out


_UNITS_INV = {v: k for k, v in _UNITS.items()}


# R-G61: triadas como muletilla. "Menor". Tres o mas "A, B y C" en el parrafo.
_TRIPLE_RE = re.compile(
    r"\b([a-záéíóúñ]{4,}),\s+([a-záéíóúñ]{4,})\s+y\s+([a-záéíóúñ]{4,})\b")
_TRIPLE_MIN = 3


def _check_g61_triada(eid, text, ctx, mk):
    triadas = list(_TRIPLE_RE.finditer(text or ""))
    if len(triadas) < _TRIPLE_MIN:
        return []
    return [mk(eid, text, triadas[0].start(), triadas[0].end(), "g61_triada", "info",
              f"La estructura 'A, B y C' se repite {len(triadas)} veces en el "
              f"parrafo. Es una muletilla estructural", phase="global")]


# R-G63: densidad de conectores de contraste y adicion. "Menor".
#
# Se mide POR MIL PALABRAS DEL DOCUMENTO, no por repeticion textual: tres "sin
# embargo" en 300 palabras es un problema y en 12.000 no. Es la Review Focus 3
# del plan, y la razon por la que esta regla necesita el contexto.
_DENSITY_CONNECTORS = (
    "sin embargo", "no obstante", "por otro lado", "en consecuencia",
    "por lo tanto", "asimismo", "en conclusion", "ademas", "por consiguiente",
)
_DENSITY_LIMIT_PER_1K = 4.0


def _check_g63_conectores_densidad(eid, text, ctx, mk):
    if ctx.doc_words <= 0:
        return []
    low = (text or "").lower()
    cuenta = 0
    primero = None
    for conector in _DENSITY_CONNECTORS:
        patron = r"(?<![a-záéíóúñ])" + re.escape(conector) + r"(?![a-záéíóúñ])"
        for m in re.finditer(patron, low):
            if _in_quoted(text, m.start()):
                continue
            cuenta += 1
            if primero is None:
                primero = m
    if primero is None:
        return []
    por_1k = cuenta / (ctx.doc_words / 1000.0)
    if por_1k <= _DENSITY_LIMIT_PER_1K:
        return []
    return [mk(eid, text, primero.start(), primero.end(), "g63_conectores_densidad",
               "info",
               f"{cuenta} conectores de contraste en {ctx.doc_words} palabras "
               f"({por_1k:.1f} por cada mil). Varia el conector o quitalo",
               phase="global")]


RULE_SCOPES.update({
    "g34_sigla_sin_definir": GLOBAL,
    "g35_unidades_mixtas": GLOBAL,
    "g61_triada": GLOBAL,
    "g63_conectores_densidad": GLOBAL,
})

GLOBAL_CHECKS.update({
    "g34_sigla_sin_definir": _check_g34_sigla_sin_definir,
    "g35_unidades_mixtas": _check_g35_unidades_mixtas,
    "g61_triada": _check_g61_triada,
    "g63_conectores_densidad": _check_g63_conectores_densidad,
})


# ── R-G71: una cifra afirmada sin cita ──────────────────────────────────────
#
# "Toda afirmacion de dato, cifra o hallazgo de terceros debe llevar cita". Es
# Critica en el catalogo y es de las que un revisor humano detecta de entrada.
#
# NO se reimplementa aqui que es una cita: se usa `citation_engine`, que ya sabe
# distinguir parentetica de narrativa yMultiple y tiene los offsets. Dos
# definiciones de "que es una cita" divergen solas, y esa clase de bug ya
# produjo el falso positivo de "meta" dentro de "metodologia".

# Un porcentaje, o un numero con un orden de magnitud explicito. Un ano suelto no
# cuenta: "el estudio se realizo en 2024" es una fecha de trabajo, no una
# afirmacion que necesite respaldo, y marcarlo llenaria la revision de ruido.
_RG71_CIFRA = re.compile(
    r"(?:\d+(?:[.,]\d+)?\s*%)|"                       # 68%
    r"(?:\d[\d.,]*\s*(?:millones?|miles|%|puntos)\b)|"  # 3 millones
    r"(?:\d[\d.,]*\s*(?:estudiantes|empresas|personas|casos|participantes|"
    r"encuestados?|familias|hogares|estudios|articulos|mujeres|hombres|"
    r"j[oó]venes|adolescentes|docentes|profesores|pacientes|usuarios|"
    r"clientes|alumnos|alumnas|participantes|entrevistas|entrevistados)\b)",
    re.IGNORECASE,
)


def _g71_frases(texto):
    """(inicio, fin) de cada oracion, para acotar la cobertura de una cita."""
    spans = []
    ini = 0
    for m in re.finditer(r"(?<=[.!?])\s+", texto):
        if m.end() > ini:
            spans.append((ini, m.end()))
        ini = m.end()
    if ini < len(texto):
        spans.append((ini, len(texto)))
    return [(a, b) for a, b in spans if texto[a:b].strip()]


# R-G71 dice "afirmacion de dato, cifra o hallazgo de TERCEROS". El numero de la
# muestra propia no es de terceros: "encuesta aplicada a 480 estudiantes" es el
# metodo del autor y no necesita respaldo externo. Sin esta exclusion R-G71
# inunda la revision de falsos positivos sobre el propio trabajo, que es
# exactamente como una regla de este tipo deja de servir.
_RG71_PROPIO = re.compile(
    r"(?:\besta\s+(?:investigaci[oó]n|tesis|estudio)|"
    r"\bnuestra\s+(?:muestra|investigaci[oó]n|universidad|instituci[oó]n)|"
    r"\bel\s+estudio\b|\bla\s+muestra\b|\beste\s+trabajo\b|"
    r"\bse\s+(?:aplic[oó]|entrevist[oó]|relev[oó]|mid[ioó]|obtuv|"
    r"seleccion|analiz|recolect|registr|aplicaron|entrevistaron|"
    r"seleccionaron|analizamos|recolectamos)|"
    r"\bnuestr[oa]s?\s+datos?\b|\bmuestra\s+propia)",
    re.IGNORECASE,
)


def _check_g71_cifra_sin_cita(eid, text, ctx, mk):
    from modules.citation_engine import extract_citations_from_text

    texto = text or ""
    if not texto.strip():
        return []

    # Una cita cubre SU oracion y la siguiente: "Segun Perez (2020), el 68%..."
    # cita en una y afirma en la otra. Acotado por oracion y no por una ventana
    # de caracteres: con 140 chars de margen, una cita al principio daba por
    # respaldada una cifra de la oracion siguiente, que es el falso negativo
    #peor posible en una regla de citas.
    frases = _g71_frases(texto)
    covered: set = set()
    for c in extract_citations_from_text(texto, eid):
        for i, (a, b) in enumerate(frases):
            if c.start_offset < b and c.end_offset > a:
                covered.update(range(a, b))
                if i + 1 < len(frases):
                    covered.update(range(frases[i + 1][0], frases[i + 1][1]))

    out = []
    for m in _RG71_CIFRA.finditer(texto):
        if any(i in covered for i in range(m.start(), m.end())):
            continue
        frase = next((texto[a:b] for a, b in frases if a <= m.start() < b), texto)
        if _RG71_PROPIO.search(frase):
            continue
        out.append(mk(eid, texto, m.start(), m.end(), "g71_cifra_sin_cita", "error",
                      f'Afirmas "{m.group(0).strip()}" sin una cita que lo respalde. '
                      f"Una cifra de terceros necesita de donde sale: (Autor, anio) "
                      f"en la misma oracion o en la anterior", phase="global"))
    return out


RULE_SCOPES.update({"g71_cifra_sin_cita": GLOBAL})

GLOBAL_CHECKS.update({"g71_cifra_sin_cita": _check_g71_cifra_sin_cita})


# ── R-G74-primo: tramo largo copiado y sin entrecomillar ────────────────────
#
# ESTO NO ES R-G74. R-G74 mide similitud contra el TEXTO de la fuente, y el
# documento solo guarda la entrada bibliografica (autores, ano, titulo, DOI):
# no hay con que comparar. Un detector que se presentara como R-G74 estaria
# midiendo contra el titulo del articulo y vendiendolo como control de plagio,
# que es peor que no tenerlo.
#
# Lo que SI es medible sin las fuentes: un tramo largo que se lee como copiado
# y que no esta entrecomillado ni citada. El mensaje no acusa, PREGUNTA.

# Un solo "chunked" de N palabras seguidas dentro de una sola oracion de oracion. Trece
# palabras seguidas pueden ser una enumeracion legitima; veinticinco ya no.
_RG74_MIN_PALABRAS = 25

# Palabras funcionales: su proporcion distingue prosa propia de un bloque
# citado. En espanol ronda el 45-55% de las palabras de una oracion normal; un
# fragmento copiado de un texto academico tecnico la mantiene, y una frase
# de opinion la rompe.
_FUNC = {
    "de", "la", "el", "los", "las", "un", "una", "unos", "unas", "y", "o", "que",
    "en", "con", "por", "para", "del", "al", "es", "son", "fue", "se", "su",
    "sus", "como", "entre", "sobre", "este", "esta", "esto", "esta", "no", "mas",
    "lo", "le", "les", "nos", "se", "sin", "ante", "cuando", "donde", "porque",
    "the", "and", "of", "to", "in", "is", "are", "that", "for", "with", "as",
}
_RG74_MIN_FUNCIONAL = 0.40


def _check_g74_verbatim_sin_comillas(eid, text, ctx, mk):
    texto = text or ""
    out = []
    for a, b in _g71_frases(texto):
        oracion = texto[a:b]
        # Se mide SOLO lo que esta FUERA de comillas. Una cita textual puede
        # estar embebida en una oracion mas larga, y mirar la oracion entera
        # marcaba la cita como si fuera texto copiado sin entrecomillar, que es
        # lo contrario de la regla.
        medible = _rg74_sin_citas(oracion)
        palabras = re.findall(r"[A-Za-zÁÉÍÓÚÑáéíóúñ]+", medible)
        if len(palabras) < _RG74_MIN_PALABRAS:
            continue
        func = sum(1 for w in palabras if w.lower() in _FUNC)
        if func / len(palabras) < _RG74_MIN_FUNCIONAL:
            continue
        # Una oracion de definicion nominal larga ("Ley Organica de la...")
        # no es texto copiado: no tiene verbo.
        verbos = sum(1 for w in palabras if w.lower() in {
            "es", "son", "fue", "fueron", "se", "tiene", "puede", "debe", "define",
            "representa", "consiste", "implica", "significa"})
        if verbos == 0 and len(palabras) > _RG74_MIN_PALABRAS + 6:
            continue
        out.append(mk(eid, texto, a, b, "g74_verbatim_sin_comillas", "info",
                      f"Esta oracion tiene {len(palabras)} palabras seguidas sin "
                      f"comillas ni cita. Si viene de una fuente, entrecomillala "
                      f"y citala; si es tuya, parafraseala un poco para que se "
                      f"lea como tuya", phase="global"))
    return out


RULE_SCOPES.update({"g74_verbatim_sin_comillas": GLOBAL})

GLOBAL_CHECKS.update({"g74_verbatim_sin_comillas": _check_g74_verbatim_sin_comillas})


_QUOTED_SPAN = re.compile(r"\"[^\"]{3,}\"|\u201c[^\u201d]{3,}\u201d")


def _rg74_sin_citas(fragmento):
    """El fragmento con los tramos citados tapados por espacios.

    Tapar en vez de borrar mantiene los offsets alineados con el texto original,
    que es lo que necesita `mk` para señalar el fragmento exacto.
    """
    return _QUOTED_SPAN.sub(lambda m: " " * len(m.group(0)), fragmento)
