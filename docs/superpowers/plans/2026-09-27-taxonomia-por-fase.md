# Taxonomía por fase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada título de nivel 1 abra un ámbito con sus propios criterios, y que el motor deje de decidir el ámbito de un elemento buscando palabras sueltas en su texto.

**Architecture:** Un módulo nuevo, `python/modules/phase_scope.py`, es la única fuente de verdad: el vocabulario de fases, la comparación de títulos, la construcción del mapa de ámbitos a partir de los H1, el registro de ámbitos por regla (`RULE_SCOPES`) y los criterios de fase. `proactive_auditor` deja de Contains-regex sobre el cuerpo sobre el cuerpo del texto y consulta ese mapa. El hallazgo lleva `phase` y `read_only` hasta la interfaz, donde la fase aparece como línea de contexto y como chip de filtro.

**Tech Stack:** Python 3.11+, FastAPI, Pydantic, pytest. React 18 + TypeScript + Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-27-taxonomia-por-fase-design.md`

## Global Constraints

- La comparación de títulos NUNCA ocurre sobre el cuerpo de un párrafo. Solo sobre el texto de un elemento `type == "heading"` con `heading_level == 1`.
- Un H2 **hereda** el ámbito de su H1 ancestro. No abre ámbito propio, no endurece criterios.
- El contenido anterior al primer H1 pertenece al ámbito `portada`.
- Todo elemento con `is_cover_section` o `type == "portada_block"` fuerza el ámbito `portada`.
- Los criterios de la portada son de **solo lectura**: se construyen sin `suggestion` y con `read_only=True`. Ninguna regla puede escribir en la portada.
- Un hallazgo de portada **aparece en Revisión** si incumple algo; no se descarta por estar en zona protegida.
- `AGENTS.md` §1: la revisión sigue siendo un párrafo a la vez. No reintroducir `ReviewMinimap` ni las tres columnas.
- `AGENTS.md` §1: el conteo de pendientes se deriva UNA sola vez desde `src/lib/railPending.ts` sobre `src/lib/auditItems.ts`. Este trabajo no crea una segunda fuente de conteo.
- `AGENTS.md` §2: la fase se propaga a los dos canales de resaltado porque los dos leen `buildCommentContext`.
- Sin emojis. Solo variables CSS, sin hex. Iconos lucide con `strokeWidth={1.75}`.
- Este trabajo NO toca la calibración de páginas (Task 10b del plan de rediseño), ni `computePages`, ni `FormattingConfig.heading_levels`.
- Pytest corre desde la raíz: `pytest python/tests/ -q`. Vitest corre desde la raíz: `npx vitest run`.

## Review Focus

Cinco clases de entrada que el spec implica y que son las que más probablemente muerden a una persona usándolo. Cada una tiene su test fijo en la tarea dueña.

1. **Un párrafo de Metodología que dice "el objetivo de este trabajo".** Es el espejo exacto del bug: hoy dispara la regla de objetivos. Debe producir cero `bloom_vague`. → Task 3.
2. **Un H1 que no está en el vocabulario** (p. ej. "Agradecimientos"). Su cuerpo lleva reglas generales y nada más; cero hallazgos de fase. → Task 2.
3. **Documento sin ningún H1**, y documento vacío. Todo cae en `portada`; no debe crashear ni inventar fases. → Task 2.
4. **El modo `texts` del endpoint `/api/proofread-batch`**, donde los elementos llegan con `heading_level=None` y `type="paragraph"`. No hay H1, luego no hay fase: solo reglas generales, sin crashear. → Task 6.
5. **Un incumplimiento real de portada** (título de 30 palabras, o terminado en punto). Debe aparecer en Revisión y **sin** botón de aceptar. → Task 4 y Task 8.

---

### Task 1: El módulo de ámbitos y su vocabulario

**Files:**
- Create: `python/modules/phase_scope.py`
- Create: `python/tests/test_phase_scope.py`

**Interfaces:**
- Consumes: nada. Es la base de la que dependen las Task 2 a 7.
- Produces:
  - `GLOBAL: str = "global"`
  - `PORTADA_KEY: str = "portada"`, `NO_PHASE_KEY: str = "sin_fase"`
  - `@dataclass(frozen=True) PhaseConfig(key, label, titles, criteria, read_only=False, paragraph_words=None)`
  - `PHASES: tuple[PhaseConfig, ...]`, `PHASE_BY_KEY: dict[str, PhaseConfig]`
  - `normalize_title(raw: str) -> str`
  - `match_phase(title: str) -> str | None`
  - `RULE_SCOPES: dict[str, str]`

- [ ] **Step 1: Escribí el test que falla**

`python/tests/test_phase_scope.py`:

```python
"""Tests del vocabulario y la comparacion de titulos de fase."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from modules.phase_scope import (  # noqa: E402
    NO_PHASE_KEY,
    PORTADA_KEY,
    normalize_title,
    match_phase,
)


def test_normalize_quita_acentos_numeracion_y_puntos():
    assert normalize_title("3. Objetivos") == "objetivos"
    assert normalize_title("IV. MÉTODO:") == "metodo"
    assert normalize_title("  Discusión  ") == "discusion"
    assert normalize_title("Anexos") == "anexos"


def test_match_titulo_exacto():
    assert match_phase("Objetivos") == "objetivos"
    assert match_phase("METODOLOGÍA") == "metodo"
    assert match_phase("Conclusiones") == "conclusiones"


def test_match_titulo_con_calificador():
    # El calificador no rompe el reconocimiento: el titulo sigue siendo la fase.
    assert match_phase("Resultados de la encuesta") == "resultados"
    assert match_phase("Discusión de los hallazgos") == "discusion"


def test_match_acepta_abstract():
    assert match_phase("Abstract") == "resumen"
    assert match_phase("Resumen") == "resumen"


def test_titulo_desconocido_no_abre_fase():
    assert match_phase("Agradecimientos") is None
    assert match_phase("Analisis de los datos") is None


def test_metodologia_es_nombre_de_fase_y_nunca_disparador_de_objetivos():
    # La palabra "meta" ya no existe en ningun lado del vocabulario de objetivos.
    assert match_phase("Metodologia") == "metodo"
    assert match_phase("Metáfora del sucesso") is None


def test_titulo_vacio_no_abre_fase():
    assert match_phase("") is None
    assert normalize_title("   ") == ""


def test_todo_h1_reconocido_tiene_label():
    for titulo in ("Resumen", "Introduccion", "Marco teorico", "Metodo",
                   "Resultados", "Discusion", "Conclusiones", "Referencias", "Anexos"):
        key = match_phase(titulo)
        assert key is not None, f"{titulo} deberia abrir una fase"
        assert key != NO_PHASE_KEY


def test_portada_reconocida():
    assert match_phase("Titulo") == PORTADA_KEY
    assert match_phase("Portada") == PORTADA_KEY
```

- [ ] **Step 2: Corré el test y confirmá que falla**

Run: `pytest python/tests/test_phase_scope.py -q`
Expected: FAIL con `ModuleNotFoundError: No module named 'modules.phase_scope'`

- [ ] **Step 3: Implementá el módulo**

`python/modules/phase_scope.py`:

```python
"""Ambitos de fase: los H1 abren un ambito y cada ambito tiene sus criterios.

Modulo de una sola fuente de verdad. Antes de este modulo, el alcance de una
regla se deducía del TEXTO del elemento con `any(kw in low_t for kw in ...)`:
"meta" esta dentro de "metodologia", asi que cualquier parrafo sobre
metodologia disparaba la regla de verbos de objetivos. Aqui la comparacion
solo puede ocurrir sobre el TITULO de un H1 (ver `match_phase`), nunca sobre
el cuerpo de un parrafo: el riesgo no se mitiga, se elimina de raiz.

Y como el alcance de una regla es dato y no `if` disperso, `RULE_SCOPES` lo
declara de forma explicita y `test_phase_scope.py` falla si aparece un `kind`
que el auditor emite y nadie declaro. Sin ese test, el alcance vuelve a
inferirse por descuido la proxima vez que alguien agregue una regla.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple

# ── Claves de ambito ─────────────────────────────────────────────────────────

GLOBAL = "global"
PORTADA_KEY = "portada"
NO_PHASE_KEY = "sin_fase"


# ── Fase ────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class PhaseConfig:
    """Un ambito abierto por un H1, con los criterios que le son propios."""

    key: str
    label: str
    titles: Tuple[str, ...]
    criteria: Tuple[str, ...] = ()
    read_only: bool = False
    paragraph_words: Optional[Tuple[int, int]] = None


PHASES: Tuple[PhaseConfig, ...] = (
    PhaseConfig("resumen", "Resumen", ("resumen", "abstract"),
                criteria=("paragraph_words", "verbo_pasado"), paragraph_words=(150, 250)),
    PhaseConfig(PORTADA_KEY, "Portada", ("titulo", "portada", "title"),
                criteria=("portada_title_larga", "portada_punto_final"), read_only=True),
    PhaseConfig("objetivos", "Objetivos",
                ("objetivos", "objetivo", "proposito", "propositos", "finalidad"),
                criteria=("bloom_verb",)),
    PhaseConfig("introduccion", "Introduccion", ("introduccion",),
                criteria=("paragraph_words",), paragraph_words=(80, 200)),
    PhaseConfig("marco_teorico", "Marco teorico",
                ("marco teorico", "marco referencial", "antecedentes",
                 "revision de literatura"),
                criteria=("paragraph_words", "parafraisis_vs_cita"), paragraph_words=(80, 200)),
    PhaseConfig("metodo", "Metodo",
                ("metodo", "metodologia", "materiales y metodos", "diseño metodologico"),
                criteria=("bloom_verb", "paragraph_words"), paragraph_words=(80, 200)),
    PhaseConfig("resultados", "Resultados", ("resultados", "resultado"),
                criteria=("verbo_pasado",)),
    PhaseConfig("discusion", "Discusion", ("discusion",),
                criteria=("verbo_pasado",)),
    PhaseConfig("conclusiones", "Conclusiones",
                ("conclusiones", "conclusion", "consideraciones finales"),
                criteria=("verbo_pasado",)),
    PhaseConfig("referencias", "Referencias",
                ("referencias", "bibliografia", "works cited")),
    PhaseConfig("anexos", "Anexos",
                ("anexos", "apendice", "apendices"),
                criteria=("portada_title_larga",)),
)

PHASE_BY_KEY: Dict[str, PhaseConfig] = {p.key: p for p in PHASES}


# ── Normalizacion y comparacion de titulos ───────────────────────────────────

_NUM_PREFIX = re.compile(r"^(?:[ivxlcdm]+|\d+(?:\.\d+)*)[.)]?\s+", re.IGNORECASE)
_NON_ALNUM = re.compile(r"[^a-z0-9\s]")
_WS = re.compile(r"\s+")
# "Resultados de la encuesta" -> head "resultados". Se corta por la palabra
# calificador, no por subcadena: "Analisis de los datos" da head "analisis",
# que no esta en el vocabulario, asi que NO abre fase.
_QUALIFIER = re.compile(r"^(?P<head>[a-z0-9]+)\s+(?:de|del|la|el|los|las|para|sobre|y)\s+")


def normalize_title(raw: str) -> str:
    """Minúsculas, sin acentos, sin numeración inicial, sin puntuación.

    "3. Objetivos" / "IV. MÉTODO:" / "  Discusión  " -> "objetivos" / "metodo" / "discusion"
    """
    text = unicodedata.normalize("NFKD", raw or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().strip()
    text = _NUM_PREFIX.sub("", text)
    text = _NON_ALNUM.sub(" ", text)
    return _WS.sub(" ", text).strip()


_BY_TITLE: Dict[str, str] = {}
for _cfg in PHASES:
    for _t in _cfg.titles:
        _BY_TITLE[normalize_title(_t)] = _cfg.key


def match_phase(title: str) -> Optional[str]:
    """Devuelve la clave de fase que abre un H1 con este título, o `None`.

    Acepta el título exacto o su cabeza cuando el resto es un calificador.
    Devolver `None` es la respuesta correcta y frecuente: un H1 que no está
    en el vocabulario es una sección cualquiera y no hereda ningún criterio.
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


# ── Ambitos declarados por regla ─────────────────────────────────────────────

RULE_SCOPES: Dict[str, str] = {
    # Reglas generales: aplican a TODO el documento, esten donde esten.
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
    # Reglas de fase: solo dentro del ambito que las declara.
    "bloom_vague": "objetivos",
    "paragraph_words": "fase",
    "verbo_pasado": "fase",
    "parafraisis_vs_cita": "marco_teorico",
    "portada_title_larga": PORTADA_KEY,
    "portada_punto_final": PORTADA_KEY,
}
```

- [ ] **Step 4: Corré el test y confirmá que pasa**

Run: `pytest python/tests/test_phase_scope.py -q`
Expected: PASS (10 tests)

- [ ] **Step 5: Commiteá**

```bash
git add python/modules/phase_scope.py python/tests/test_phase_scope.py
git commit -m "feat(phase): el vocabulario de fases y la comparacion de titulos

Once fases, lista cerrada. La comparacion solo ocurre sobre el titulo de un
H1, nunca sobre el cuerpo de un parrafo: 'meta' deja de ser un disparador
y 'Metodologia' pasa a ser un nombre de fase.

RULE_SCOPES declara el ambito de cada regla como dato. El test que viene en
la Tarea 3 falla si aparece un kind sin declarar, que es la forma de que el
ambito vuelva a inferirse por descuido."
```

---

### Task 2: El mapa de ámbitos a partir de los H1

**Files:**
- Modify: `python/modules/phase_scope.py` (agregar al final)
- Modify: `python/tests/test_phase_scope.py`

**Interfaces:**
- Consumes: `match_phase`, `PHASE_BY_KEY`, `PORTADA_KEY`, `NO_PHASE_KEY` de la Task 1.
- Produces:
  - `@dataclass(frozen=True) class PhaseSpan(key, label, heading_id, start_index, end_index)`
  - `build_phase_map(elements: Sequence[Any]) -> tuple[dict[str, str], list[PhaseSpan]]`
  - `phase_label(key: str) -> str`
  - `etype(e) -> str` (helper interno, normaliza el enum a string)

- [ ] **Step 1: Escribí los tests que fallan**

Agregar a `python/tests/test_phase_scope.py`:

```python
from models import ElementModel, ElementType  # noqa: E402
from modules.phase_scope import build_phase_map, phase_label  # noqa: E402


def _h(eid, text, level=1, cover=False):
    return ElementModel(id=eid, type=ElementType.HEADING, heading_level=level,
                        text=text, is_cover_section=cover)


def _p(eid, text):
    return ElementModel(id=eid, type=ElementType.PARAGRAPH, text=text)


# ── Review Focus 3: documento sin H1, y documento vacio ──────────────────────

def test_documento_vacio_no_crashea():
    phase_by_id, spans = build_phase_map([])
    assert phase_by_id == {}
    assert spans == []


def test_documento_sin_h1_todo_es_portada():
    els = [_p("a", "Primer parrafo"), _p("b", "Segundo parrafo")]
    phase_by_id, spans = build_phase_map(els)
    # El contenido anterior al primer H1 pertenece a la portada: zona protegida.
    assert phase_by_id["a"] == "portada"
    assert phase_by_id["b"] == "portada"
    assert [s.key for s in spans] == ["portada"]


def test_portada_por_is_cover_section_manda_sobre_el_titulo():
    els = [_h("h0", "Resumen", level=1, cover=True), _p("a", "texto")]
    phase_by_id, _ = build_phase_map(els)
    assert phase_by_id["a"] == "portada"


def test_h1_abre_ambito_y_el_cuerpo_lo_hereda():
    els = [_h("h1", "Objetivos"), _p("a", "Analizar el contexto"), _h("h2", "Metodo"),
           _p("b", "Se aplico una encuesta")]
    phase_by_id, _ = build_phase_map(els)
    assert phase_by_id["a"] == "objetivos"
    assert phase_by_id["b"] == "metodo"


def test_h2_hereda_y_no_abre_ambito_propio():
    # El H2 "Resultados de la encuesta" NO abre 'resultados': es un H2, y
    # D3 dice que un H2 hereda. Este es el caso que el editor promotional a H1.
    els = [_h("h1", "Metodo"), _h("h2", "Resultados de la encuesta", level=2),
           _p("a", "Se obtuvo un 80%")]
    phase_by_id, _ = build_phase_map(els)
    assert phase_by_id["a"] == "metodo"


def test_h1_desconocido_abre_sin_fase():
    # Review Focus 2: un H1 fuera del vocabulario es una seccion cualquiera.
    els = [_h("h1", "Agradecimientos"), _p("a", "Gracias a mi familia")]
    phase_by_id, _ = build_phase_map(els)
    assert phase_by_id["a"] == "sin_fase"


def test_spans_cubren_el_documento_sin_solaparse():
    els = [_h("h1", "Resumen"), _p("a", "x"), _h("h2", "Introduccion"), _p("b", "y"),
           _h("h3", "Agradecimientos"), _p("c", "z")]
    _, spans = build_phase_map(els)
    assert [s.key for s in spans] == ["resumen", "introduccion", "sin_fase"]
    for i, s in enumerate(spans):
        fin = spans[i + 1].start_index if i + 1 < len(spans) else len(els)
        assert s.end_index == fin
    assert spans[0].start_index == 0


def test_phase_label_de_ambito_desconocido_no_crashea():
    assert phase_label("objetivos") == "Objetivos"
    assert phase_label("sin_fase") == "Seccion sin nombre"
    assert phase_label("clave_inventada") == "Seccion sin nombre"
```

- [ ] **Step 2: Corré y confirmá que falla**

Run: `pytest python/tests/test_phase_scope.py -q`
Expected: FAIL con `ImportError: cannot import name 'build_phase_map'`

- [ ] **Step 3: Implementá**

Agregar al final de `python/modules/phase_scope.py`:

```python
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
    raw = getattr(e, "heading_level", None)
    return 1 if raw is None else int(raw)


def build_phase_map(elements: Sequence[Any]) -> Tuple[Dict[str, str], List[PhaseSpan]]:
    """Ámbito de cada elemento, y los tramos que esos ámbitos cubren.

    Reglas, en orden de precedencia:
      1. Todo elemento con `is_cover_section` o tipo `portada_block` es portada.
      2. Un H1 reconocido cambia el ámbito al que su título abra, o a `sin_fase`
         si el título no está en el vocabulario.
      3. Un H2 o H3 **hereda**: no cambian el ámbito (D3).
      4. Antes del primer H1, el ámbito es `portada`.
    """
    phase_by_id: Dict[str, str] = {}
    spans: List[PhaseSpan] = []
    current = PORTADA_KEY
    heading_id = ""
    start_index = 0

    for i, e in enumerate(elements):
        kind = etype(e)
        if getattr(e, "is_cover_section", False) or kind == "portada_block":
            key = PORTADA_KEY
        elif kind == "heading" and _level(e) == 1:
            key = match_phase(getattr(e, "text", "") or "") or NO_PHASE_KEY
        else:
            key = current

        if key != current:
            if spans:
                spans[-1] = _close(spans[-1], i)
            current = key
            heading_id = str(getattr(e, "id", "") or "")
            start_index = i
            spans.append(PhaseSpan(key=key, label=phase_label(key),
                                   heading_id=heading_id, start_index=start_index,
                                   end_index=len(elements)))
        phase_by_id[str(getattr(e, "id", "") or "")] = current

    if spans:
        spans[-1] = _close(spans[-1], len(elements))
    return phase_by_id, spans


def _close(span: PhaseSpan, end_index: int) -> PhaseSpan:
    return PhaseSpan(key=span.key, label=span.label, heading_id=span.heading_id,
                     start_index=span.start_index, end_index=end_index)
```

- [ ] **Step 4: Corré y confirmá que pasa**

Run: `pytest python/tests/test_phase_scope.py -q`
Expected: PASS (18 tests)

- [ ] **Step 5: Commiteá**

```bash
git add python/modules/phase_scope.py python/tests/test_phase_scope.py
git commit -m "feat(phase): el H1 abre el ambito y el H2 lo hereda

build_phase_map recorre los elementos en orden y devuelve el ambito de cada
uno mas los tramos que cubren. El contenido anterior al primer H1 es
portada, un H2 no cambia el ambito, y un H1 fuera del vocabulario abre
'sin_fase': reglas generales y nada mas."
```

---

### Task 3: El auditor consulta el mapa en vez deContains-regex sobre el cuerpo

**Files:**
- Create: `python/modules/finding.py`
- Modify: `python/modules/phase_scope.py` (agregar `phase_findings` y los checks)
- Modify: `python/modules/proactive_auditor.py:360-379` (`_mk`), `:382` (firma), `:400-403` (filtro), `:477-488` (el bloque Bloom)
- Modify: `python/tests/test_proactive_auditor.py`
- Create: `python/tests/test_rule_scopes.py`

**Interfaces:**
- Consumes: `build_phase_map`, `phase_findings` de las Task 1 y 2; `RULE_SCOPES`.
- Produces:
  - `python/modules/finding.py::mk(element_id, text, start, end, kind, severity, message, suggestion=None, *, phase=None, read_only=False) -> Dict[str, Any]`
  - `python/modules/phase_scope.py::phase_findings(phase, eid, text, *, mk) -> list[dict]`
  - Todo hallazgo de `audit_elements` lleva `phase: str` y `read_only: bool`.

- [ ] **Step 1: Escribí los tests que fallan**

En `python/tests/test_proactive_auditor.py`, agregar imports y tests:

```python
from models import ElementModel, ElementType  # noqa: E402
from modules.proactive_auditor import audit_elements  # noqa: E402


def _h(eid, text, level=1):
    return ElementModel(id=eid, type=ElementType.HEADING, heading_level=level, text=text)


def _vague(text, eid="e1"):
    """Parrafo con un verbo impreciso de Bloom, como los de una seccion de objetivos."""
    return _para(text, eid)


# ── Review Focus 1: el espejo exacto del bug ────────────────────────────────

def test_metodologia_en_el_cuerpo_no_dispara_la_regla_de_objetivos():
    # El bug: "meta" esta dentro de "metodologia".
    els = [_h("h1", "Metodologia"), _para("El objetivo de este trabajo fueJL medir la percepcion.")]
    f = audit_elements(els)
    assert _kinds(f, "bloom_vague") == []


def test_metodologia_como_palabra_suelta_tampoco():
    f = audit_elements([_para("La metodologia empleada fue de tipo mixto.")])
    assert _kinds(f, "bloom_vague") == []


def test_bloom_vague_sigue_disparando_dentro_de_objetivos():
    els = [_h("h1", "Objetivos"), _para("Conocer las causas del fenomeno X.")]
    f = audit_elements(els)
    assert len(_kinds(f, "bloom_vague")) == 1


def test_bloom_vague_fuera_de_objetivos_no_dispara():
    # Mismo verbo, fase equivocada: no hay hallazgo.
    els = [_h("h1", "Agradecimientos"), _para("Conocer las causas del phenomenon X.")]
    assert _kinds(audit_elements(els), "bloom_vague") == []


def test_todo_hallazgo_declara_su_fase():
    els = [_h("h1", "Objetivos"), _para("Conocer las causas y ademas hay un erro aqui."),
           _h("h2", "Conclusiones"), _para("En conclusion, se demostrO que Io creo que si.")]
    for f in audit_elements(els):
        assert f["phase"] in {"objetivos", "conclusiones"}, f
        assert isinstance(f["read_only"], bool)


def test_reglas_generales_corrigen_en_cualquier_fase():
    els = [_h("h1", "Agradecimientos"), _para("Yo creo que el proceso fue eviden te.")]
    kinds = {f["kind"] for f in audit_elements(els)}
    assert "first_person" in kinds


def test_h1_no_se_audita_como_parrafo():
    # El H1 es un delimitador: no produce hallazgos propios.
    f = audit_elements([_h("h1", "Objetivos"), _para("Conocer el phenomenon X.")])
    assert all(x["element_id"] == "e1" for x in f)
```

Y crear `python/tests/test_rule_scopes.py`:

```python
"""Toda regla que el auditor emite tiene que DECLARAR su ambito.

Sin este test, el ambito de una regla nueva se infiere del texto otra vez, que
es exactamente el defecto que `phase_scope` vino a eliminar. El fallo imprime
los kinds desconocidos para que declararlos sea un paso mecanico.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models import ElementModel, ElementType  # noqa: E402
from modules.phase_scope import RULE_SCOPES  # noqa: E402
from modules.proactive_auditor import audit_elements  # noqa: E402


def test_todo_kind_emitido_declara_su_ambito():
    els = [
        ElementModel(id="h1", type=ElementType.HEADING, heading_level=1, text="Objetivos"),
        ElementModel(id="e1", type=ElementType.PARAGRAPH,
                     text="Conocer las causas. Yo creo que si. Ademas, el procesO fue evid ente."),
        ElementModel(id="h2", type=ElementType.HEADING, heading_level=1, text="Metodologia"),
        ElementModel(id="e2", type=ElementType.PARAGRAPH,
                     text="La metodologia se aplico en el centro. El objetivO comXun fue vago."),
    ]
    emitidos = {f["kind"] for f in audit_elements(els)}
    desconocidos = sorted(emitidos - set(RULE_SCOPES))
    assert not desconocidos, (
        f"kinds sin ambito declarado: {desconocidos}. "
        f"Agregalos a RULE_SCOPES en modules/phase_scope.py con su ambito real."
    )


def test_reglas_de_objetivos_no_son_generales():
    assert RULE_SCOPES["bloom_vague"] == "objetivos"
```

- [ ] **Step 2: Corré y confirmá que falla**

Run: `pytest python/tests/test_proactive_auditor.py python/tests/test_rule_scopes.py -q`
Expected: FAIL — `test_metodologia_en_el_cuerpo_no_dispara_la_regla_de_objetivos` falla (el bug sigue), y el resto falla por `KeyError: 'phase'`.

- [ ] **Step 3: Extraé `_mk` a `finding.py` para romper el ciclo de import**

`python/modules/finding.py`:

```python
"""Constructor de hallazgos del auditor. Vive solo para que `phase_scope` y
`proactive_auditor` puedan construir hallazgos sin importarse entre si.

`read_only` existe para la Portada: un hallazgo de solo lectura informa de un
incumplimiento pero NUNCA trae `suggestion`, porque no hay nada que la aplicadora
pueda escribir sin mutar la portada original (`AGENTS.md` §1, `use_original_cover`).
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
```

- [ ] **Step 4: Agregá los criterios de fase a `phase_scope.py`**

Agregar al final de `python/modules/phase_scope.py`:

```python
# ── Criterios de fase ───────────────────────────────────────────────────────

VAGUE_VERBS: Tuple[str, ...] = (
    "conocer", "entender", "aprender", "saber", "comprender", "estudiar",
    "investigar", "analizar", "describir", "examinar", "explorar",
)
_PAST_ONLY_VERBS: Tuple[str, ...] = (
    "proponer", "proponeremos", "buscar", "buscaremos", "describir", "describiremos",
    "analizar", "analizaremos", "preguntar", "preguntaremos",
)
_AI_MARKERS: Tuple[str, ...] = (
    "en conclusion", "en resumen", "es importante destacar", "cabe destacar",
    "en el mundo actual", "en la sociedad actual", "en la era actual",
    "desempena un papel fundamental", "no solo sino",
)
_WORD_SPLIT = re.compile(r"\S+")


def _check_bloom_verb(eid: str, text: str, cfg: PhaseConfig, mk) -> List[Dict[str, Any]]:
    low = text.lower()
    for verb in VAGUE_VERBS:
        pos = low.find(verb)
        if pos >= 0:
            return [mk(eid, text, pos, pos + len(verb), "bloom_vague", "warn",
                       f'Verbo impreciso "{text[pos:pos + len(verb)]}" en objetivo; '
                       f"usa un verbo en infinitivo medible (determinar, medir, evaluar)",
                       suggestion="determinar", phase=cfg.key, read_only=cfg.read_only)]
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
               f"entre {lo} y {hi}", phase=cfg.key, read_only=cfg.read_only)]


def _check_verbo_pasado(eid: str, text: str, cfg: PhaseConfig, mk) -> List[Dict[str, Any]]:
    low = text.lower()
    for verb in _PAST_ONLY_VERBS:
        pos = low.find(verb)
        if pos >= 0:
            return [mk(eid, text, pos, pos + len(verb), "verbo_pasado", "info",
                       f'"{text[pos:pos + len(verb)]}" esta en infinitivo; la fase '
                       f"{cfg.label} se redacta en pasado",
                       phase=cfg.key, read_only=cfg.read_only)]
    return []


def _check_portada_title_larga(eid: str, text: str, cfg: PhaseConfig, mk) -> List[Dict[str, Any]]:
    n = len(_WORD_SPLIT.findall(text or ""))
    if n <= 20:
        return []
    return [mk(eid, text, 0, len(text or ""), "portada_title_larga", "warn",
               f"El titulo tiene {n} palabras; un titulo de portada no suele pasar de 20",
               phase=cfg.key, read_only=True)]


def _check_portada_punto_final(eid: str, text: str, cfg: PhaseConfig, mk) -> List[Dict[str, Any]]:
    stripped = (text or "").strip()
    if not stripped.endswith("."):
        return []
    return [mk(eid, text, max(0, len(stripped) - 1), len(stripped), "portada_punto_final",
               "info", "El titulo de portada no lleva punto final",
               phase=cfg.key, read_only=True)]


_CHECKS = {
    "bloom_verb": _check_bloom_verb,
    "paragraph_words": _check_paragraph_words,
    "verbo_pasado": _check_verbo_pasado,
    "portada_title_larga": _check_portada_title_larga,
    "portada_punto_final": _check_portada_punto_final,
}


def phase_findings(phase: str, eid: str, text: str, *, mk) -> List[Dict[str, Any]]:
    """Hallazgos de los criterios de la fase a la que pertenece este elemento.

    Un elemento cuyo ámbito es `sin_fase` no está en ninguna fase del
    vocabulario: no dispara nada. Las reglas generales no pasan por acá.
    """
    cfg = PHASE_BY_KEY.get(phase)
    if cfg is None or not cfg.criteria:
        return []
    out: List[Dict[str, Any]] = []
    for cid in cfg.criteria:
        check = _CHECKS.get(cid)
        if check is not None:
            out.extend(check(eid, text, cfg, mk))
    return out
```

- [ ] **Step 5: Cableá el auditor**

En `python/modules/proactive_auditor.py`:

1. Reemplazá el import de cabecera para traer `mk` y el mapa:

```python
from modules.finding import mk as _mk          # noqa: E402
from modules.phase_scope import (               # noqa: E402
    NO_PHASE_KEY, build_phase_map, phase_findings,
)
```

2. Borrá la definición local de `_mk` (líneas 360-379). **No cambies ninguna llamada**: los ~30 call sites que ya usan `_mk(...)` siguen funcionando con la misma firma.

3. En `audit_elements`, después de `repeat_muletilla = muletilla_count > 3` (línea 398), agregá:

```python
    # Ámbito de fase por elemento. Se calcula UNA vez, antes del bucle: los
    # H1 no se auditan como párrafos, solo delimitan. Sin este mapa, cada regla
    # tendría que volver a deducir su ámbito del texto del elemento.
    phase_by_id, _phase_spans = build_phase_map(elements)
```

4. Dentro del bucle, después de `text = getattr(e, "text", "") or ""` (línea 405), agregá:

```python
        phase = phase_by_id.get(eid, NO_PHASE_KEY)
```

5. **Reemplazá el bloque 477-488 completo** (desde `# -- verbos imprecisos en objetivos / Bloom` hasta el `break` que cierra el `for vv`) por:

```python
        # -- Criterios de la fase a la que pertenece este elemento.
        # Antes esto era `if any(kw in low_t for kw in ("objetivo", ..., "meta"))`:
        # "meta" esta dentro de "metodologia", asi que un parrafo sobre
        # metodologia disparaba la regla de objetivos. Ahora el ámbito viene del
        # H1 que lo contiene, nunca del texto.
        findings.extend(phase_findings(phase, eid, text, mk=_mk))
```

6. **Verificá que `low_t` no quedó huérfano.** Era solo para ese bloque. Corré `grep -n "low_t" python/modules/proactive_auditor.py`: si queda alguna referencia, borrala; si no, no hagas nada.

- [ ] **Step 6: Corré los tests de la tarea**

Run: `pytest python/tests/test_proactive_auditor.py python/tests/test_rule_scopes.py python/tests/test_phase_scope.py -q`
Expected: PASS. Si `test_todo_kind_emitido_declara_su_ambito` falla con una lista de kinds, declaralos en `RULE_SCOPES` con su ámbito real y volver a correr. Ese fallo es el mecanismo funcionando, no un test roto.

- [ ] **Step 7: Corré la suite backend entera**

Run: `pytest python/tests/ -q`
Expected: PASS completa. Si algún test viejo daba por hecho que "metodologia" dispara `bloom_vague`, ese test **codificaba el bug**: actualizalo para que ponga la frase dentro de un H1 "Objetivos".

- [ ] **Step 8: Commiteá**

```bash
git add python/modules/finding.py python/modules/phase_scope.py \
        python/modules/proactive_auditor.py python/tests/test_proactive_auditor.py \
        python/tests/test_rule_scopes.py
git commit -m "fix(audit): el ambito de una regla viene del H1, no del texto

proactive_auditor.py:479 decidia con any(kw in low_t for kw in (..., 'meta'))
sobre el cuerpo de cualquier parrafo. 'meta' esta dentro de 'metodologia',
asi que un parrafo sobre metodologia disparaba la regla de verbos de
objetivos. El ambito ahora se lee del mapa que construye build_phase_map.

_mk se extrae a modules/finding.py para que phase_scope pueda construir
hallazgos sin ciclo de import, y todo hallazgo lleva phase y read_only.

test_rule_scopes falla si el auditor emite un kind que nadie declaro en
RULE_SCOPES: es lo que impide que el ambito vuelva a inferirse por descuido."
```

---

### Task 4: La portada se mide, pero no se escribe

**Files:**
- Modify: `python/tests/test_phase_scope.py`

**Interfaces:**
- Consumes: `phase_findings`, `build_phase_map` de las Task 2 y 3.
- Produces: los criterios `portada_title_larga` y `portada_punto_final` verificados, y la garantía de que un hallazgo de portada no trae `suggestion`.

- [ ] **Step 1: Escribí los tests que fallan**

Agregar a `python/tests/test_phase_scope.py`:

```python
from modules.finding import mk  # noqa: E402
from modules.phase_scope import phase_findings  # noqa: E402


def _f(phase, text, eid="e1"):
    return phase_findings(phase, eid, text, mk=mk)


# ── Review Focus 5: un incumplimiento real de portada ──────────────────────

def test_titulo_largo_es_hallazgo_de_portada():
    out = _f("portada", "Un titulo realmente largo " * 6)
    assert len(out) == 1
    assert out[0]["kind"] == "portada_title_larga"
    assert out[0]["phase"] == "portada"
    assert out[0]["read_only"] is True


def test_titulo_corto_no_es_hallazgo():
    assert _f("portada", "Percepcion de laMEXICANIDAD en estudiantes universitarios") == []


def test_titulo_con_punto_final_es_hallazgo():
    out = _f("portada", "Percepcion de la identidad.")
    assert [f["kind"] for f in out] == ["portada_punto_final"]
    assert out[0]["read_only"] is True


def test_hallazgo_de_portada_nunca_propone_texto():
    # Es la invariante de AGENTS.md §1: `use_original_cover` no puede mutar la
    # portada original. Sin `suggestion` no hay nada que la aplicadora escriba.
    for text in ("Un titulo realmente largo " * 6, "Percepcion de la identidad."):
        for f in _f("portada", text):
            assert "suggestion" not in f, f


def test_sin_fase_no_dispara_ningun_criterio():
    assert _f("sin_fase", "Conocer las causas " * 10) == []


def test_ambito_desconocido_no_dispara_ningun_criterio():
    assert _f("clave_inventada", "Conocer las causas") == []


def test_objetivos_sigue_pudiendo_sugerir():
    # El contraste: solo la portada es de solo lectura.
    out = _f("objetivos", "Conocer las causas del fenomeno")
    assert out and out[0]["kind"] == "bloom_vague"
    assert out[0].get("suggestion") == "determinar"
    assert out[0]["read_only"] is False


def test_portada_no_recibe_los_criterios_de_una_fase_de_prosa():
    # La portada no lleva reglas de prosa: es material, no argumento.
    kinds = {f["kind"] for f in _f("portada", "Conocer las causas " * 8)}
    assert "bloom_vague" not in kinds
```

- [ ] **Step 2: Corré y confirmá que falla**

Run: `pytest python/tests/test_phase_scope.py -q`
Expected: PASS en la mayoría y FAIL en los que dependen de la forma final de los mensajes o del umbral. Ajustá lo que el test revele, sinDebilitar el test: si el criterio existe pero el mensaje no coincide, el mensaje es lo que hay que arreglar.

- [ ] **Step 3: Ajustá `phase_scope.py` hasta que pase**

No cambies los asserts. El umbral de 20 palabras, la supresión de `suggestion` en `read_only` y el `VAGUE_VERBS` local son la especificación; el código se ajusta a ella.

- [ ] **Step 4: Corré la suite**

Run: `pytest python/tests/ -q`
Expected: PASS completa.

- [ ] **Step 5: Commiteá**

```bash
git add python/modules/phase_scope.py python/tests/test_phase_scope.py
git commit -m "test(phase): la portada se mide pero no se escribe

La portada no es 'cero criterios': se mide con criterios de solo lectura y
cada incumplimiento aparece en Revision. Lo protegido es la escritura, no
la observacion. Ningun hallazgo de portada trae 'suggestion', que es lo que
impide que la aplicadora mute la portada original (AGENTS.md §1).

Un hallazgo de portada llega a la interfaz con read_only=True y sin boton de
aceptar: hay algo que corregir a mano, no nada que aplicar."
```

---

### Task 5: El editor usa el mismo vocabulario y no aplana la jerarquía

**Files:**
- Modify: `python/modules/ai_document_editor.py:267-278`
- Modify: `python/tests/test_ai_indices.py` (o el archivo que cubre el editor conversacional)

**Interfaces:**
- Consumes: `match_phase`, `PHASE_BY_KEY` de la Task 1.
- Produces: el bloque de jerarquía de títulos usa el vocabulario y no promueve un H2 si ya existe un H1 de esa fase.

- [ ] **Step 1: Localizá el test del editor**

Run: `grep -rn "jerarquía de títulos\|jerarquia de titulos" python/tests/`
Expected: el archivo que lo cubre. Si no existe ninguno, créalo `python/tests/test_ai_heading_hierarchy.py`.

- [ ] **Step 2: Escribí los tests que fallan**

```python
"""El editor no debe aplanar la jerarquia que el autor construyo.

El bug: `any(sec in text for sec in [...])` sobre el titulo de un HEADING
promovia a Nivel 1 cualquier encabezado que contuviera una palabra del
vocabulario. "Resultados de la encuesta" que el autor anido deliberadamente
como H2 bajo "Metodo" era promovido a H1, y la jerarquia quedaba aplanada.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models import ElementModel, ElementType  # noqa: E402


def _h(eid, text, level):
    return ElementModel(id=eid, type=ElementType.HEADING, heading_level=level, text=text)


def _doc(*elements):
    from models import DocumentModel
    return DocumentModel(elements=list(elements))


def _acciones(doc, instruccion="arregla la jerarquia de titulos"):
    from modules.ai_document_editor import ejecutar_instruccion
    return ejecutar_instruccion(doc, instruccion)["actions"]


def test_promueve_un_h2_que_es_una_fase_real():
    doc = _doc(_h("h1", "Metodo", 1), _h("h2", "Resultados", 2))
    acts = _acciones(doc)
    assert acts == [{"type": "set_type", "element_id": "h2",
                     "element_type": "heading", "level": 1}]


def test_no_promueve_un_h2_que_el_autor_anido_bajo_una_fase():
    # El bug exacto: "Resultados de la encuesta" bajo "Metodo" es un H2 a proposito.
    doc = _doc(_h("h1", "Metodo", 1), _h("h2", "Resultados de la encuesta", 2))
    assert _acciones(doc) == []


def test_no_promueve_si_ya_hay_un_h1_de_esa_fase():
    doc = _doc(_h("h1", "Resultados", 1), _h("h2", "Resultados de la encuesta", 2))
    assert _acciones(doc) == []


def test_no_toca_la_portada():
    doc = _doc(_h("c1", "Titulo", 2))
    # La portada es zona protegida: use_original_cover no puede mutarla.
    assert _acciones(doc) == []


def test_no_promueve_un_h1_desconocido():
    doc = _doc(_h("h1", "Agradecimientos", 2))
    assert _acciones(doc) == []


def test_respuesta_no_afirma_ajustes_cuando_no_hubo_ninguno():
    doc = _doc(_h("h1", "Agradecimientos", 2))
    from modules.ai_document_editor import ejecutar_instruccion
    r = ejecutar_instruccion(doc, "arregla la jerarquia de titulos")
    assert "0 " in r["reply"] or "no se" in r["reply"].lower()
```

- [ ] **Step 3: Corré y confirmá que falla**

Run: `pytest python/tests/test_ai_heading_hierarchy.py -q`
Expected: FAIL en `test_no_promueve_un_h2_que_el_autor_anido_bajo_una_fase` y en `test_no_toca_la_portada`.

- [ ] **Step 4: Reemplazá el bloque 267-278**

```python
    # 3. Revisar jerarquía de títulos
    if any(w in instruction_lower for w in ["jerarquía", "jerarquia", "título", "titulo", "h1", "h2", "h3"]):
        from modules.phase_scope import PHASE_BY_KEY, match_phase

        # Un H1 de esa fase ya presente: promover otro la duplicaría. Antes se
        # comparaba el título contra una lista de subcadenas y se promovía
        # "Resultados de la encuesta" que el autor anidó bajo "Método" a
        # propósito, aplanando la jerarquía que él mismo había construido.
        fases_h1 = {
            match_phase(e.text or "") for e in document.elements
            if e.type == ElementType.HEADING and (e.heading_level or 1) == 1
        }
        fases_h1.discard(None)

        for elem in document.elements:
            if elem.type != ElementType.HEADING or elem.is_cover_section:
                continue
            if (elem.heading_level or 1) == 1:
                continue
            fase = match_phase(elem.text or "")
            if fase is None or fase in fases_h1:
                continue
            # La portada es zona protegida: use_original_cover no la muta y
            # computePages la trata como bloque indivisible (AGENTS.md §1).
            if fase == PORTADA_KEY:
                continue
            fases_h1.add(fase)
            actions.append({"type": "set_type", "element_id": elem.id,
                            "element_type": "heading", "level": 1})
        return {
            "reply": (
                f"Se ajustaron {len(actions)} encabezados al Nivel 1 según APA 7."
                if actions else
                "La jerarquía de títulos ya respeta los Niveles 1 de APA 7; no hubo ajustes."
            ),
            "actions": actions,
        }
```

Y agregá `from modules.phase_scope import PORTADA_KEY` al import de cabecera del módulo, o dejá el import local como arriba y sacá `PORTADA_KEY` de esa línea local. **Verificá que el nombre esté definido**: el import local de arriba solo trae `PHASE_BY_KEY` y `match_phase`, así que agregá `PORTADA_KEY` ahí:

```python
        from modules.phase_scope import PORTADA_KEY, match_phase
```

- [ ] **Step 5: Corré y confirmá que pasa**

Run: `pytest python/tests/test_ai_heading_hierarchy.py -q`
Expected: PASS (6 tests)

- [ ] **Step 6: Commiteá**

```bash
git add python/modules/ai_document_editor.py python/tests/test_ai_heading_hierarchy.py
git commit -m "fix(editor): la jerarquia de titulos usa el vocabulario de fases

El bloque reconocia el titulo con any(sec in text for sec in [...]) sobre
subcadenas y promovia a Nivel 1 cualquier encabezado que la contuviera, lo
que aplanaba la jerarquia que el autor habia construido. Ahora usa
match_phase, no promueve si ya hay un H1 de esa fase, y no toca la portada."
```

---

### Task 6: El endpoint propaga la fase

**Files:**
- Modify: `python/routers/proofread.py:41-45`, `:113-128`
- Modify: `python/tests/test_proofread_batch.py`

**Interfaces:**
- Consumes: `build_phase_map` de la Task 2.
- Produce: la respuesta de `/api/proofread-batch` incluye `phases: [{key, label, start_index, end_index}]` y cada hallazgo trae `phase` y `read_only`.

- [ ] **Step 1: Escribí los tests que fallan**

Agregar a `python/tests/test_proofread_batch.py`:

```python
def test_la_respuesta_publica_los_ambitos_de_fase():
    # TestClient sobre la app; el alcance es que la fase viaje en la respuesta.
    ...


def test_modo_texts_no_inventa_fases():
    # Review Focus 4: en modo `texts` los elementos llegan con
    # heading_level=None y type="paragraph": no hay H1, luego no hay fase.
    from routers.proofread import _build_elements_from_texts
    els = _build_elements_from_texts(["Conocer las causas", "otro texto"], None)
    from modules.phase_scope import build_phase_map
    phase_by_id, spans = build_phase_map(els)
    assert set(phase_by_id.values()) == {"portada"}
    assert all(s.key == "portada" for s in spans)


def test_modo_texts_solo_produce_reglas_generales():
    # Sin H1 no hay fase que dispare `bloom_vague`. El texto lleva el verbo
    # impreciso, pero nadie lo metio en una seccion de objetivos.
    from routers.proofread import _build_elements_from_texts
    from modules.proactive_auditor import audit_elements
    els = _build_elements_from_texts(["Conocer las causas del fenomeno en la UCA"], None)
    kinds = {f["kind"] for f in audit_elements(els)}
    assert "bloom_vague" not in kinds
```

El primer test necesita el cliente HTTP. Usá el patrón que ya exista en
`python/tests/test_proofread_batch.py`; si el archivo solo prueba funciones
puras, agregá un test de `build_phase_map` con un H1 real en vez de levantar la app:

```python
def test_la_respuesta_publica_los_ambitos_de_fase():
    from models import ElementModel, ElementType
    from modules.phase_scope import build_phase_map
    els = [
        ElementModel(id="h1", type=ElementType.HEADING, heading_level=1, text="Objetivos"),
        ElementModel(id="e1", type=ElementType.PARAGRAPH, text="Conocer las causas"),
    ]
    phase_by_id, spans = build_phase_map(els)
    assert phase_by_id["e1"] == "objetivos"
    assert [(s.key, s.label) for s in spans] == [("objetivos", "Objetivos")]
```

- [ ] **Step 2: Corré y confirmá que falla**

Run: `pytest python/tests/test_proofread_batch.py -q`
Expected: FAIL en los tests de `phases` si lo agregaste; los de `build_phase_map` deberían pasar ya.

- [ ] **Step 3: Modificá `_ProofElement` y la respuesta**

En `python/routers/proofread.py`, clase `_ProofElement` (líneas 40-45): agregá `text`, `heading_level` y **dejá `is_cover_section` en `False` explícito** para que `build_phase_map` no rompa:

```python
    def __init__(self, idx: int, text: str, eid: str):
        self.id = eid
        self.type = "paragraph"
        self.text = text
        self.heading_level = None
        self.is_cover_section = False
```

En `proofread_batch`, después de `findings = audit_elements(elements)` (línea 113), agregá:

```python
    # Los ámbitos viajan con la respuesta para que la interfaz pueda nombrar la
    # fase de cada hallazgo. `audit_elements` ya los puso en cada hallazgo.
    from modules.phase_scope import build_phase_map

    _phase_by_id, _spans = build_phase_map(elements)
    phases = [{"key": s.key, "label": s.label,
               "start_index": s.start_index, "end_index": s.end_index}
              for s in _spans]
```

Y en **los tres** `return` de la función (líneas 107, 110 y 128), agregá `"phases": phases` — el de la línea 107 va antes de que exista `phases`, así que en ese return usá `"phases": []`.

El return de la línea 128 queda:

```python
    return {"findings": findings, "used_llm": used_llm,
            "ai_indices": ai_indices, "phases": phases}
```

- [ ] **Step 4: Declaralo en el modelo de respuesta del docstring**

En el docstring de `proofread_batch` (líneas 85-86), cambiá la línea que describe la forma de la respuesta para que incluya `phases`. El comentario de la línea 99 dice que `audit_elements` filtra a párrafos: actualizalo para notar que ahora los H1 se usan como delimitadores aunque no se auditen.

- [ ] **Step 5: Corré y confirmá que pasa**

Run: `pytest python/tests/test_proofread_batch.py -q`
Expected: PASS completa.

- [ ] **Step 6: Commiteá**

```bash
git add python/routers/proofread.py python/tests/test_proofread_batch.py
git commit -m "feat(api): /proofread-batch publica los ambitos de fase

La respuesta ahora trae 'phases' con el tramo que cubre cada ambito, para
que la interfaz pueda nombrar la fase sin volver a derivarla. En modo
'texts' no hay H1, luego no hay fase: solo reglas generales."
```

---

### Task 7: Los tipos del frontend aceptan la fase

**Files:**
- Modify: `src/types/index.ts` (`ProofreadFinding`, y el tipo de respuesta del batch)
- Modify: `src/lib/auditItems.ts` (`AuditItem` + el mapeo de hallazgos del corrector)
- Create: `src/__tests__/phaseItems.test.ts`

**Interfaces:**
- Consumes: la respuesta de la Task 6.
- Produce:
  - `ProofreadFinding.phase?: string`, `ProofreadFinding.read_only?: boolean`
  - `AuditItem.phase: string | null`, `AuditItem.readOnly: boolean`
  - `PHASE_LABELS: Record<string, string>`, `PHASE_ORDER: string[]`, `phaseLabel(key: string | null): string`

- [ ] **Step 1: Escribí el test que falla**

`src/__tests__/phaseItems.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { auditItems, phaseLabel, PHASE_ORDER } from '../lib/auditItems';
import type { ProofreadFinding } from '../types';

const base: ProofreadFinding = {
  element_id: 'e1', start: 0, end: 6, excerpt: 'Conocer',
  kind: 'bloom_vague', severity: 'warn', message: 'verbo impreciso',
  source: 'local',
};

describe('fase en los hallazgos', () => {
  it('un hallazgo sin fase es general, no de una fase inventada', () => {
    const items = auditItems([{ ...base }] as never, [], null);
    expect(items).toHaveLength(1);
    expect(items[0].phase).toBeNull();
    expect(items[0].readOnly).toBe(false);
  });

  it('un hallazgo con fase la conserva', () => {
    const items = auditItems([{ ...base, phase: 'objetivos' }] as never, [], null);
    expect(items[0].phase).toBe('objetivos');
  });

  it('read_only viaja y no se pierde', () => {
    const items = auditItems([{ ...base, kind: 'portada_title_larga',
      phase: 'portada', read_only: true }] as never, [], null);
    expect(items[0].readOnly).toBe(true);
  });

  it('phaseLabel nombra las fases del vocabulario y no rompe con una desconocida', () => {
    expect(phaseLabel('objetivos')).toBe('Objetivos');
    expect(phaseLabel('portada')).toBe('Portada');
    expect(phaseLabel('sin_fase')).toBe('Seccion sin nombre');
    expect(phaseLabel(null)).toBe('Todo el documento');
    expect(phaseLabel('clave_inventada')).toBe('Seccion sin nombre');
  });

  it('el orden de fases es el del documento, no alfabetico', () => {
    expect(PHASE_ORDER[0]).toBe('resumen');
    expect(PHASE_ORDER.indexOf('introduccion')).toBeLessThan(
      PHASE_ORDER.indexOf('conclusiones'),
    );
  });
});
```

- [ ] **Step 2: Corré y confirmá que falla**

Run: `npx vitest run src/__tests__/phaseItems.test.ts`
Expected: FAIL — no existe `phase` en `AuditItem`, ni `phaseLabel`, ni `PHASE_ORDER`.

- [ ] **Step 3: Ampliá `ProofreadFinding`**

En `src/types/index.ts`, dentro de `interface ProofreadFinding`, al final:

```ts
  /** Ámbito de fase (clave de `PHASES` en el backend). Ausente = regla general. */
  phase?: string;
  /** true = solo lectura: se informa, no se aplica nada (portada). */
  read_only?: boolean;
```

Y en el tipo de respuesta del batch, agregá `phases?: Array<{ key: string; label: string; start_index: number; end_index: number }>;`

- [ ] **Step 4: Ampliá `AuditItem` y el mapeo**

En `src/lib/auditItems.ts`, en `interface AuditItem`, al final:

```ts
  /** Fase a la que pertenece el hallazgo, o `null` si es una regla general. */
  phase: string | null;
  /** El hallazgo se informa pero no se puede aplicar (portada). */
  readOnly: boolean;
```

Y agregá cerca de los tipos, con un comentario que explique por qué existe:

```ts
/* "Fase" — el vocabulario del backend (`python/modules/phase_scope.py`).
   Vive ACÁ y no en un fetch aparte porque la fase es dato de la VISTA: el
   hook y la tira la nombran, y la lista de fases no puede quedar en un solo archivo que otro tenga que duplicar. El orden es el del documento, no alfabético:
   el usuario lee de arriba hacia abajo, y un orden alfabético lo desordena. */
export const PHASE_ORDER = [
  'portada', 'resumen', 'introduccion', 'marco_teorico', 'objetivos',
  'metodo', 'resultados', 'discusion', 'conclusiones', 'referencias', 'anexos',
] as const;

export const PHASE_LABELS: Record<string, string> = {
  portada: 'Portada',
  resumen: 'Resumen',
  introduccion: 'Introduccion',
  marco_teorico: 'Marco teorico',
  objetivos: 'Objetivos',
  metodo: 'Metodo',
  resultados: 'Resultados',
  discusion: 'Discusion',
  conclusiones: 'Conclusiones',
  referencias: 'Referencias',
  anexos: 'Anexos',
  sin_fase: 'Seccion sin nombre',
};

/** `null` = el hallazgo es de una regla general, que no pertenece a ninguna fase. */
export function phaseLabel(key: string | null): string {
  if (key === null) return 'Todo el documento';
  return PHASE_LABELS[key] ?? 'Seccion sin nombre';
}
```

En el mapeo que convierte `ProofreadFinding` en `AuditItem`, agregá:

```ts
      phase: f.phase ?? null,
      readOnly: f.read_only === true,
```

Y revisá los otros lugares de `auditItems.ts` que construyen `AuditItem` (los motores de estilo, citas, estructura y el detector de IA): todos necesitan los dos campos nuevos. Cada uno pone `phase: null` salvo que sepa de una fase.

- [ ] **Step 5: Corré y confirmá que pasa**

Run: `npx vitest run`
Expected: PASS. Los tests que construyen `AuditItem` a mano fallarán por los dos campos nuevos: agregales `phase: null, readOnly: false`. Eso es correcto, no es una regresión.

- [ ] **Step 6: Commiteá**

```bash
git add src/types/index.ts src/lib/auditItems.ts src/__tests__/phaseItems.test.ts \
        src/__tests__/
git commit -m "feat(review): la fase viaja del motor a la lista de hallazgos

ProofreadFinding gana phase y read_only; AuditItem gana phase y readOnly.
La fase es dato de la VISTA, como la pagina: la nombra el workbench y la
tira, y no se deriva en dos lugares distintos.

Los motores que no saben de fase ponen phase: null, que es lo correcto: son
reglas generales y no pertenecen a ninguna."
```

---

### Task 8: La fase se ve y se filtra, y lo de solo lectura no se puede aceptar

**Files:**
- Modify: `src/hooks/useReviewWorkbench.ts` (`EngineFilter`, la derivación `visibles`, la acción masiva)
- Modify: `src/components/review/ReviewStrip.tsx`
- Modify: `src/components/review/ReviewWorkbench.tsx`
- Modify: `src/components/review/EngineGroupCard.tsx`
- Modify: `src/components/review/FindingDetail.tsx`
- Modify: `src/lib/commentContext.ts`
- Create: `src/__tests__/reviewPhaseFilter.test.ts`

**Interfaces:**
- Consumes: `AuditItem.phase`, `AuditItem.readOnly`, `phaseLabel`, `PHASE_ORDER` de la Task 7.
- Produce:
  - `export type PhaseFilter = string | 'all'`
  - `useReviewWorkbench()` expone `phaseFilter: PhaseFilter` y `setPhaseFilter: (p: PhaseFilter) => void`, y `allPhases: { key: string; label: string; pending: number }[]`
  - `ReviewStrip` acepta `phaseFilter`, `onPhaseFilter`, `phases`
  - `buildCommentContext` incluye la fase en el contexto que leen los dos canales

- [ ] **Step 1: Escribí el test que falla**

`src/__tests__/reviewPhaseFilter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReviewWorkbench } from '../hooks/useReviewWorkbench';
import { useDocStore } from '../store/useDocStore';

describe('filtro por fase', () => {
  it('la fase acota los hallazgos sin tocar el filtro por motor', () => {
    const { result } = renderHook(() => useReviewWorkbench());
    const antes = result.current.allGroups.reduce(
      (n, g) => n + g.subtypes.reduce((m, s) => m + s.items.length, 0), 0);

    act(() => result.current.setPhaseFilter('objetivos'));
    const despues = result.current.allGroups.reduce(
      (n, g) => n + g.subtypes.reduce((m, s) => m + s.items.length, 0), 0);

    // Filtrar por fase puede reducir, nunca romper.
    expect(despues).toBeLessThanOrEqual(antes);
    expect(result.current.phaseFilter).toBe('objetivos');

    act(() => result.current.setPhaseFilter('all'));
    expect(result.current.phaseFilter).toBe('all');
  });

  it('los hallazgos sin fase son los generales y no los pierde el filtro de fase', () => {
    const { result } = renderHook(() => useReviewWorkbench());
    act(() => result.current.setPhaseFilter('objetivos'));
    const todos = result.current.allGroups.flatMap(
      g => g.subtypes.flatMap(s => s.items));
    expect(todos.every(i => i.phase === 'objetivos')).toBe(true);
  });
});

describe('lo de solo lectura no se puede aceptar', () => {
  it('un grupo de solo lectura no ofrece aceptacion masiva', () => {
    // Se prueba sobre la derivacion pura, no sobre el componente.
    const soloLectura = {
      id: 'g1', element_id: 'c1', category: 'structure' as const,
      subtype: 'portada', severity: 'low' as const, summary: 's', detail: 'd',
      originalText: 'x', pageNumber: 1, readOnly: true, phase: 'portada',
    };
    // `accionDeGrupo` es la función que decide si un grupo ofrece "Aceptar todas".
    const { accionDeGrupo } = require('../lib/auditActions');
    expect(accionDeGrupo([soloLectura])).not.toBe('accept');
  });
});
```

Ajustá el primer bloque al patrón con que el archivo de tests existente monta el store; si hay un helper de fixture, usalo en vez de `useDocStore` crudo. El segundo bloque depende de la Task 8.2.

- [ ] **Step 2: Corré y confirmá que falla**

Run: `npx vitest run src/__tests__/reviewPhaseFilter.test.ts`
Expected: FAIL — no existe `phaseFilter` en el hook.

- [ ] **Step 3.1: El filtro, en el hook**

En `src/hooks/useReviewWorkbench.ts`:

```ts
export type PhaseFilter = string | 'all';
```

Al lado de `const [filter, setFilter] = useState<EngineFilter>('all');` (línea 383):

```ts
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('all');
```

Reemplazá la derivación `visibles` (línea 433) por la intersección de los dos filtros:

```ts
  const visibles = useMemo(() => {
    let out = dismissedIds.length
      ? items.filter((it) => !dismissedIds.includes(it.id))
      : items;
    if (filter !== 'all') out = out.filter((i) => i.category === filter);
    if (phaseFilter !== 'all') out = out.filter((i) => i.phase === phaseFilter);
    return out;
  }, [items, dismissedIds, filter, phaseFilter]);
```

`allGroups` (línea 425) debe seguir mostrando TODO para que la barra no se vacíe al filtrar, como ya hace con el motor. Dejá `allGroups` sin filtro de fase y hacé que `groups` (línea 437) use `visibles`. Agregá `allPhases`, que alimenta los chips y NO se filtra a sí mismo:

```ts
  const allPhases = useMemo(() => {
    const n = new Map<string, number>();
    for (const it of items) {
      if (!it.phase) continue;
      n.set(it.phase, (n.get(it.phase) ?? 0) + 1);
    }
    return PHASE_ORDER
      .filter((k) => n.has(k))
      .map((k) => ({ key: k, label: phaseLabel(k), pending: n.get(k) ?? 0 }));
  }, [items]);
```

Exponé `phaseFilter`, `setPhaseFilter` y `allPhases` en `ReviewWorkbenchApi`. Y en el **bucle de "siguiente hallazgo"** (línea 486, el que salta al más crítico), agregá la guarda de fase para que no salte a un hallazgo invisible:

```ts
    if (filter !== 'all' && it.category !== filter) continue;
    if (phaseFilter !== 'all' && it.phase !== phaseFilter) continue;
```

- [ ] **Step 3.2: La acción masiva respeta lo de solo lectura**

Extraé a `src/lib/auditActions.ts` la decisión de qué acción ofrece un grupo, con la guarda explícita:

```ts
/* Un grupo con hallazgos de solo lectura (portada) NO ofrece "Aceptar todas":
   no hay nada que aplicar. `AGENTS.md` §1 protege la portada original, y un
   botón que dice "aceptar" sobre material que no se puede tocar es la forma
   más directa de romperlo. */
export function accionDeGrupo(items: AuditItem[]): 'accept' | 'mark' | 'none' {
  if (items.length === 0) return 'none';
  const aplicables = items.filter((i) => !i.readOnly);
  if (aplicables.length === 0) return 'none';
  if (items.every((i) => i.category === 'ai')) return 'mark';
  return 'accept';
}
```

Y usá `accionDeGrupo(items)` en el punto que hoy decide la acción del grupo (la línea 349 del hook), en vez de la condición local.

- [ ] **Step 3.3: Los chips de fase en la tira**

En `src/components/review/ReviewStrip.tsx`, agregá a `ReviewStripProps`:

```ts
  phaseFilter: string | 'all';
  onPhaseFilter: (p: string | 'all') => void;
  phases: { key: string; label: string; pending: number }[];
```

Y debajo de la fila de chips de motor, una fila de chips de fase con el mismo `chipStyle` que ya usan (línea 53), con el chip "Todas" primero y `aria-pressed` como los de motor. Los conteos salen de `phases[].pending`, nunca de un re-derivado: la tira ya tiene esa regla escrita en su comentario (líneas 6-8) y no hay que romperla.

- [ ] **Step 3.4: La fase como línea de contexto**

En `src/components/review/EngineGroupCard.tsx` (o `ReviewWorkbench.tsx` donde se pinte el subtipo), sobre el texto del párrafo, una línea chica con `phaseLabel(item.phase)` y, si el hallazgo es de solo lectura, la palabra "solo lectura" al lado. `style` con variables CSS: `var(--text-muted)`, `fontSize: 11`, sin hex.

En `src/components/review/FindingDetail.tsx`, el botón "Aplicar corrección" (línea 240) ya está gateado por `conSugerencia` (línea 146), y un hallazgo de solo lectura nunca trae `suggestedText`: eso ya lo resuelve. Agregá un test de que la puerta es la de `conSugerencia` y no una condición nueva, y que la leyenda de solo lectura aparezca cuando `item.readOnly`.

- [ ] **Step 3.5: La fase en los dos canales**

En `src/lib/commentContext.ts`, `buildCommentContext` incluye la fase en el contexto que arman `ReadingText` y `WhatsAppComment`. Los dos canales leen el mismo objeto, así que la fase aparece en los dos sin trabajo duplicado. `AGENTS.md` §2: si la fase aparece en un canal, aparece en el otro.

- [ ] **Step 4: Corré y confirmá que pasa**

Run: `npx vitest run`
Expected: PASS completa.

- [ ] **Step 5: Verificá en navegador**

Levantá el frontend y abrí un documento que tenga un H1 "Objetivos" y un H1 "Conclusiones". Con Chrome headless por CDP (jsdom no hace layout):

- El chip de "Objetivos" existe y su conteo es el de los hallazgos de esa fase.
- Al activarlo, la lista se acota y "Siguiente hallazgo" no salta a otra fase.
- Un incumplimiento de portada aparece en Revisión **sin** botón de aceptar.
- La fase se lee como línea de contexto sobre el párrafo, y no aparece ninguna columna nueva.

Expected: las cuatro. Si alguna falla, es un bug de esta tarea, no del build.

- [ ] **Step 6: Commiteá**

```bash
git add src/hooks/useReviewWorkbench.ts src/lib/auditActions.ts \
        src/lib/commentContext.ts src/components/review/ \
        src/__tests__/reviewPhaseFilter.test.ts
git commit -m "feat(review): la fase se nombra arriba y se filtra por chip

Dos cosas y no una: la fase se escribe como linea de contexto sobre el
parrafo que se esta leyendo, y se agregan chips de fase a la tira que ya
existe. El chip filtra; no navega. La revision sigue siendo un parrafo a la
vez.

Un hallazgo de solo lectura no ofrece aceptacion: ni masiva (accionDeGrupo
devuelve 'none' si no hay nada aplicable) ni individual (el boton ya esta
gateado por conSugerencia, y un hallazgo de portada no trae suggestedText).

La fase se propaga a buildCommentContext, asi los dos canales de resaltado
dicen lo mismo (AGENTS.md §2)."
```

---

### Task 9: Enmendar `AGENTS.md` y cerrar

**Files:**
- Modify: `AGENTS.md` §1 y §2

**Interfaces:**
- Consumes: todo lo anterior.
- Produce: las reglas del proyecto que dicen lo mismo que este trabajo, para que el próximo no las contradiga.

- [ ] **Step 1: Leé `AGENTS.md` §1 y §2**

Run: `read AGENTS.md`
Expected: el texto de "Reasignación de Espacio (LAYOUT POR TAREA)" y el de "Sincronización de Comentarios".

- [ ] **Step 2: Agregá a §1**

Después del bloque de "Reasignación de Espacio", agregá:

```markdown
- **Ámbitos de fase y reglas de dos capas**:
  - Los títulos de **nivel 1 son las fases** del documento. Cada fase tiene sus propios criterios; el resto del documento tiene reglas generales. El ámbito de una regla es un dato declarado en `RULE_SCOPES` (`python/modules/phase_scope.py`), y un test falla si el auditor emite un `kind` sin declarar. **NUNCA** decidir el ámbito de un elemento buscando palabras en su texto: `proactive_auditor.py` lo hacía con `any(kw in low_t ...)` y `"meta"` estaba dentro de "me·ta·dología".
  - Un **H2 hereda** el ámbito de su H1 ancestro: no abre ámbito propio ni endurece criterios. El mapa de ámbitos se construye solo con H1, así que no hay anidamiento ambiguo.
  - La comparación de títulos ocurre **solo sobre el texto de un H1**, nunca sobre el cuerpo de un párrafo. Antes del primer H1, el ámbito es `portada`.
  - La **Portada se mide pero no se escribe**: sus criterios son de solo lectura, llegan a Revisión con `read_only=True` y **no ofrecen botón de aceptar**. Que sea zona protegida significa que nadie *escribe* en ella, no que nadie la mire. `use_original_cover` no puede mutar la portada original y `computePages` la trata como bloque indivisible; ninguna regla de fase puede romper ninguna de las dos.
  - La revisión nombra la fase como **línea de contexto** y la deja filtrar por chip, pero **no** la convierte en eje de navegación: sigue siendo un párrafo a la vez. El conteo de los chips de fase se deriva de `auditItems.ts`, nunca de un re-derivado en la tira.
```

- [ ] **Step 3: Agregá a §2**

Al final de "Sincronización de Comentarios", agregá:

```markdown
  - La **fase** de un hallazgo viaja en `buildCommentContext` junto al resto del contexto, porque es parte de lo que el hallazgo dice. Si un canal nombra la fase, el otro la nombra.
```

- [ ] **Step 4: Corré los dos lints y la suite entera**

```bash
pytest python/tests/ -q
npx vitest run
npm run build
```
Expected: las tres en verde. El lint de tokens (`src/__tests__/noHardcodedColors.test.ts`) es parte de `npx vitest run`: si la linea de contexto nueva hardcodea un color, falla ahí.

- [ ] **Step 5: Commiteá**

```bash
git add AGENTS.md
git commit -m "docs(agents): reglas de ambito de fase y de la portada

Deja escrito lo que el proximo tiene que saber: los H1 son fases, el H2
hereda, el ambito de una regla es dato declarado y no se deduce del texto,
y la portada se mide pero no se escribe."
```

- [ ] **Step 6: Revisá la rama completa**

```bash
git log --oneline <base>..HEAD
```
Expected: 9 commits, uno por tarea, cada uno con su test. Si un commit toca archivos de otra tarea, el plan no se respetó y hay que partirlo.
