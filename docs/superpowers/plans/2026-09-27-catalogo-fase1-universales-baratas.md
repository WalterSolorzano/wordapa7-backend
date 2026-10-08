# Catálogo de revisión Fase 1 — las 8 universales baratas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar las ocho reglas universales que no necesitan LLM, como una capa explícita `global` que corre en todo el documento, con su declaración de ámbito y su implementación verificadas por test.

**Architecture:** Hoy las reglas generales viven **sueltas dentro de `audit_elements`** (`first_person`, `ai_phrase`, `ortografia`, `pegado`...), y las de fase en `phase_findings`. Este plan agrega la tercera pata que falta: `global_findings`, en `phase_scope.py`, con la misma firma y la misma simetría que `phase_findings`. La vista no cambia: los hallazgos nuevos salen por `proofreadFindings` como cualquier otro y llegan a Revisión con su fila. Eso es deliberado — `AGENTS.md` §1 dice que la revisión sigue siendo un párrafo a la vez.

**Tech Stack:** Python 3.11+, Pydantic, pytest. React 18 + TypeScript, Vitest (solo para las filas de la vista).

**Spec:** `docs/superpowers/specs/2026-09-27-catalogo-revision-58-reglas-design.md`

## Global Constraints

- Toda regla nueva **declara su ámbito** en `RULE_SCOPES` (`python/modules/phase_scope.py`) y **tiene implementación**. `test_rule_scopes.py` falla si falta cualquiera de las dos.
- Una regla global corre en **todo** el documento, sin importar la fase. No puede mirar el ámbito del elemento: si lo mira, es de fase.
- Tres de las ocho (R-G34, R-G35, R-G63) necesitan **estado de documento**, no de párrafo: una sigla se define una vez, una unidad se compara contra todo el texto, los conectores se cuentan por frecuencia. El estado se calcula **una vez antes del bucle**, como hoy hace `repeat_muletilla`.
- Cero emojis. Solo variables CSS, sin hex. `strokeWidth` = `--icon-stroke`.
- `AGENTS.md` §1: la revisión sigue siendo un párrafo a la vez; el mapa de calor de IA entra en otro ciclo.
- Pytest desde la raíz: `pytest python/tests/ -q`. Vitest: `npx vitest run`.
- No se toca `computePages`, ni `FormattingConfig`, ni la calibración de páginas (Task 10b del plan de rediseño, sigue abierta).

## Review Focus

Cuatro entradas que el spec implica y que son las que más muerden a quien escribe una tesis. Cada una tiene su test en la tarea dueña.

1. **Un párrafo de una sola oración corta** no es un error: R-G11 mide variación, y con menos de 4 oraciones no hay distribución que medir. Un σ sobre 2 oraciones marca todo lo que hay. → Task 2.
2. **Una sigla usada sin definirse nunca** (R-G34) solo es un error en la **primera** aparición del documento. Marcarla en cada párrafo produce una tanda de hallazgos idénticos. → Task 3.
3. **"Sin embargo / Pero / Además" repetidos** (R-G24) ya existe y es global. R-G63 es **frecuencia por mil palabras**, no repetición textual: dos "sin embargo" en un documento corto son normales y tres en 300 palabras no. El umbral tiene que depender del largo real. → Task 4.
4. **Un texto limpio no produce ningún hallazgo nuevo.** Si las ocho reglas+Fase 1 corren sobre un párrafo bien escrito, sale vacío. Una regla global que encuentra algo siempre es un falso positivo. → Task 1.

---

### Task 1: La capa `global_findings` y su guard

**Files:**
- Modify: `python/modules/phase_scope.py`
- Modify: `python/modules/proactive_auditor.py`
- Modify: `python/tests/test_rule_scopes.py`

**Interfaces:**
- Consumes: `mk` de `modules/finding.py`; `RULE_SCOPES` de la Fase de fases.
- Produces:
  - `GlobalContext` (NamedTuple) con `doc_words: int` y `seen_acronyms: frozenset[str]` y `connector_counts: dict[str, int]`
  - `build_global_context(elements) -> GlobalContext`
  - `global_findings(eid, text, ctx, *, mk) -> list[dict]`
  - `GLOBAL_CHECKS: dict[str, Callable]`
  - `audit_elements` llama `global_findings` una vez por párrafo, con el contexto construido una vez antes del bucle.

- [ ] **Step 1: Escribí el test que falla**

Agregar a `python/tests/test_rule_scopes.py`:

```python
def test_toda_regla_global_declarada_tiene_implementacion():
    """El hermano del guard de criterios: una regla global declarada y sin
    codigo es una regla muerta, y `phase_findings` la ignoraria en silencio."""
    from modules.phase_scope import GLOBAL_CHECKS, RULE_SCOPES

    declaradas = {k for k, v in RULE_SCOPES.items() if v == "global"}
    # Las que ya viven sueltas en `audit_elements` (first_person, ortografia,
    # pegado...) todavia no pasan por `global_findings`: se declaran aca para que
    # el guard las cuente, pero `GLOBAL_CHECKS` no las tiene todavia.
    sueltas = {"first_person", "ai_phrase", "muletilla", "pegado", "ortografia",
               "repeticion", "persona", "incompleta", "ambigua", "passive_voice",
               "long_sentence", "ngram_repetition", "bloom_low"}
    nuevas = declaradas - sueltas
    sin_codigo = sorted(nuevas - set(GLOBAL_CHECKS))
    assert not sin_codigo, f"reglas globales declaradas sin implementacion: {sin_codigo}"


def test_toda_regla_global_implementada_esta_declarada():
    from modules.phase_scope import GLOBAL_CHECKS, RULE_SCOPES

    declaradas = {k for k, v in RULE_SCOPES.items() if v == "global"}
    huerfanas = sorted(set(GLOBAL_CHECKS) - declaradas)
    assert not huerfanas, f"reglas implementadas sin ambito declarado: {huerfanas}"
```

Y a `python/tests/test_phase_scope.py`:

```python
def test_un_texto_limpio_no_produce_hallazgos_globales():
    from modules.phase_scope import GlobalContext, build_global_context, global_findings

    texto = ("La desercion estudiantil se asocia a factores economicos y "
             "familiares segun la literatura revisada. Estos factores se "
             "midieron con una encuesta aplicada a 480 estudiantes.")
    ctx = build_global_context([])
    assert global_findings("e1", texto, ctx, mk=mk) == []


def test_global_findings_no_depende_del_ambito():
    # Una regla global no puede mirar la fase: si lo hiciera, seria de fase.
    import inspect
    from modules.phase_scope import global_findings
    params = set(inspect.signature(global_findings).parameters)
    assert "phase" not in params
```

- [ ] **Step 2: Corré y confirmá que falla**

Run: `pytest python/tests/test_rule_scopes.py python/tests/test_phase_scope.py -q`
Expected: FAIL — `cannot import name 'GlobalContext'`.

- [ ] **Step 3: Implementá el contexto y la capa**

Al final de `python/modules/phase_scope.py`:

```python
# ── Capa 2: reglas globales ─────────────────────────────────────────────────
#
# Las reglas GLOBALES corren en todo el documento, sin importar la fase. No
# pueden recibir el ambito: si lo reciben, son de fase. Viven aca y no sueltas
# dentro de `audit_elements` por la misma razon que las de fase viven en
# `phase_findings`: para que "esta regla existe" sea una fila de un diccionario
# y no un `if` que hay que encontrar.
#
# Estas SI necesitan estado de documento —una sigla se define una vez, una
# unidad se compara contra todo el texto, los conectores se cuentan por
# frecuencia—, asi que reciben un contexto que se calcula UNA vez antes del
# bucle, igual que hoy hace `repeat_muletilla`.

class GlobalContext(NamedTuple):
    """Estado de documento que las reglas globales necesitan.

    `doc_words` es el largo real en palabras, porque las frecuencias de R-G63
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

    Nunca recibe el ambito. Una regla que lo recibiera seria de fase, y la
    confusion entre las dos capas es exactamente el defecto que este modulo
    vino a eliminar.
    """
    out: List[Dict[str, Any]] = []
    for check in GLOBAL_CHECKS.values():
        out.extend(check(eid, text, ctx, mk))
    return out


# Los ids de regla son los del catalogo (spec §12). El `kind` que viaja al
# frontend es el mismo id, con guion bajo, para que la fila de
# `PROOFREAD_SPECS` y el mapa de transparencia hablen del mismo nombre.
GLOBAL_CHECKS: Dict[str, Any] = {}
```

Y el import que falta arriba del archivo:

```python
from typing import Any, Dict, List, NamedTuple, Optional, Sequence, Tuple
```

- [ ] **Step 4: Declará las ocho reglas en `RULE_SCOPES`**

En `RULE_SCOPES`, después de los globales que ya están:

```python
    # Las ocho universales baratas del spec §12. Sin LLM.
    "g11_variaacion_oracion": GLOBAL,
    "g34_sigla_sin_definir": GLOBAL,
    "g35_unidades_mixtas": GLOBAL,
    "g51_registro_coloquial": GLOBAL,
    "g52_exclamacion": GLOBAL,
    "g53_segunda_persona": GLOBAL,
    "g61_triada": GLOBAL,
    "g63_conectores_densidad": GLOBAL,
```

- [ ] **Step 5: Corré y confirmá que pasa**

Run: `pytest python/tests/test_rule_scopes.py python/tests/test_phase_scope.py -q`
Expected: PASS. `GLOBAL_CHECKS` está vacío todavía, así que el guard de "declarada ⇒ implementada" falla hasta la Task 4: eso es esperado, y por eso la Task 1 no corre el guard todavía.

Si falla, ajustá `GLOBAL_CHECKS` a un dict vacío **temporal** y seguí; la Task 4 lo llena. Anotá el desvío en el ledger.

- [ ] **Step 6: Commiteá**

```bash
git add python/modules/phase_scope.py python/tests/test_rule_scopes.py python/tests/test_phase_scope.py
git commit -m "feat(phase): la capa de reglas globales, y su guard

Las reglas globales vivian sueltas dentro de audit_elements. Viven aca, con
la misma firma que phase_findings, para que 'esta regla existe' sea una fila
de un diccionario y no un if que hay que encontrar.

Reciben un GlobalContext porque tres de las ocho necesitan estado de
documento, no de parrafo: una sigla se define una vez, una unidad se compara
contra todo el texto, los conectores se cuentan por frecuencia.

El guard de 'declarada implica implementada' tiene ahora version para las
reglas globales, que es donde un catálogo nuevo se va a equivocar primero."
```

---

### Task 2: R-G52 y R-G51 — registro y tono

**Files:**
- Modify: `python/modules/phase_scope.py`
- Modify: `python/tests/test_phase_scope.py`

**Interfaces:**
- Consumes: `GlobalContext`, `global_findings` de la Task 1.
- Produces: `GLOBAL_CHECKS["g51_registro_coloquial"]` y `GLOBAL_CHECKS["g52_exclamacion"]`.

- [ ] **Step 1: Escribí los tests que fallan**

```python
def _g(texto, eid="e1", ctx=None):
    from modules.phase_scope import GlobalContext, global_findings
    return global_findings(eid, texto, ctx or GlobalContext(doc_words=200, seen_acronyms=frozenset(), connector_counts={}), mk=mk)


def test_exclamacion_en_prosa_argumental():
    out = _g("Este hallazgo es importante! Hay que revisarlo.")
    assert [f["kind"] for f in out] == ["g52_exclamacion"]
    assert out[0]["phase"] == "global"


def test_registro_coloquial():
    out = _g("O sea, el tema está bueno y pues sirve.")
    kinds = {f["kind"] for f in out}
    assert "g51_registro_coloquial" in kinds


def test_la_exclamacion_dentro_de_una_cita_no_es_un_hallazgo():
    # Citar un texto exclamativo es legitimo: lo que se audita es la prosa
    # argumental propia, no lo citado.
    out = _g('El autor escribe: "este problema es urgente!" en la introduccion.')
    assert [f for f in out if f["kind"] == "g52_exclamacion"] == []


def test_un_registro_formal_no_dispara_ninguna_de_las_dos():
    assert _g("El presente trabajo analiza la desercion estudiantil.") == []
```

- [ ] **Step 2: Corré y confirmá que falla**

Run: `pytest python/tests/test_phase_scope.py -q`
Expected: FAIL — la lista de kinds está vacía.

- [ ] **Step 3: Implementá**

En `phase_scope.py`, antes de `GLOBAL_CHECKS`:

```python
# R-G52: sin exclamaciones de entusiasmo en prosa argumentativa. "Menor" en el
# catalogo, asi que `info`: se informa y no se aplica.
_EXCLAMATION_RE = re.compile(r"!")

# R-G51: registro coloquial. "Critica" en el catalogo, asi que `error`.
# La lista es cerrada a proposito: un detector de coloquialismo por
# subcadena es el mismo patron que nos mordio con "meta".
_COLOQUIAL = (
    "o sea", "pues", "bueno", "vale", "a ver", "cosa", "chido", "neta",
    "ta", "ta de", "algo asi", "mas o menos", "en el fondo", "se me hace que",
    "la verdad", "nada que ver", "echarle la culpa", "dar en el clavo",
)


def _check_g51_registro_coloquial(eid, text, ctx, mk):
    low = (text or "").lower()
    out = []
    for frase in _COLOQUIAL:
        for m in re.finditer(r"(?<![a-záéíóúñ])" + re.escape(frase) + r"(?![a-záéíóúñ])", low):
            # Dentro de comillas es texto citado, no prosa propia.
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
```

Y dos helpers que hacen falta:

```python
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
```

Y el registro:

```python
GLOBAL_CHECKS.update({
    "g51_registro_coloquial": _check_g51_registro_coloquial,
    "g52_exclamacion": _check_g52_exclamacion,
})
```

- [ ] **Step 4: Corré y confirmá que pasa**

Run: `pytest python/tests/test_phase_scope.py -q`
Expected: PASS.

- [ ] **Step 5: Commiteá**

```bash
git add python/modules/phase_scope.py python/tests/test_phase_scope.py
git commit -m "feat(phase): R-G51 registro coloquial y R-G52 exclamacion

Las dos mas baratas del catalogo, y las dos con la misma trampa: un detector
de coloquialismo o de exclamaciones por subcadena es el mismo patron que nos
mordio con 'meta'. Por eso la lista de coloquialismos es cerrada y las dos
descuentan lo que esta dentro de comillas: citar un texto exclamativo es
legitimo, lo que se audita es la prosa propia.

R-G52 es 'info' y R-G51 es 'error', que es lo que dice el catalogo."
```

---

### Task 3: R-G53 y R-G11 — persona y ritmo

**Files:**
- Modify: `python/modules/phase_scope.py`
- Modify: `python/tests/test_phase_scope.py`

**Interfaces:**
- Produces: `GLOBAL_CHECKS["g53_segunda_persona"]`, `GLOBAL_CHECKS["g11_variaacion_oracion"]`, y el helper `_sentences` (de la Task 2).

- [ ] **Step 1: Escribí los tests que fallan**

```python
def test_segunda_persona_al_lector():
    out = _g("Como veras, el metodo es sencillo.")
    assert "g53_segunda_persona" in {f["kind"] for f in out}


def test_segunda_persona_dentro_de_comilla_no_cuenta():
    out = _g('El autor dice "como veras, esto es facil" y lo critica.')
    assert "g53_segunda_persona" not in {f["kind"] for f in out}


def test_variacion_de_oraciones_por_debajo_del_piso_no_es_hallazgo():
    # Review Focus 1: con menos de 4 oraciones no hay distribucion que medir.
    # sigma sobre dos oraciones marca todo lo que hay en el parrafo.
    out = _g("Se hizo. Se vio. Se dijo. Nada.")
    assert "g11_variacion_oracion" not in {f["kind"] for f in out}


def test_oraciones_todas_iguales_si_es_hallazgo():
    texto = ("El proceso fue lento en la primera etapa del estudio. "
             "El proceso fue lento en la segunda etapa del estudio. "
             "El proceso fue lento en la tercera etapa del estudio. "
             "El proceso fue lento en la cuarta etapa del estudio.")
    out = _g(texto)
    assert "g11_variacion_oracion" in {f["kind"] for f in out}


def test_ritmo_variado_no_es_hallazgo():
    texto = ("La desercion crece. Es un problema serio y con multiples causas "
             "documentadas en la literatura. Los datos del 2024 muestran un "
             "aumento sostenido que nadie explica.")
    assert "g11_variaacion_oracion" not in {f["kind"] for f in _g(texto)}
```

- [ ] **Step 2: Corré y confirmá que falla**

Run: `pytest python/tests/test_phase_scope.py -q`
Expected: FAIL.

- [ ] **Step 3: Implementá**

```python
# R-G53: segunda persona al lector. "Mayor" en el catalogo.
_READER_RE = re.compile(
    r"(?<![a-záéíóúñ])(?:como veras|como puedes ver|imagina que|imagina how|"
    r"fijate|note que|te|De lo contrario te lo repito)(?![a-záéíóúñ])"
)

# R-G11: variacion en la longitud de oracion. "Menor" en el catalogo. Con menos
# de 4 oraciones no se mide: la desviacion de dos numeros no describe nada, y
# el piso del catalogo (sigma < 3) marca parrafos cortos que estan bien.
_MIN_SENTENCES = 4
_SIGMA_FLOOR = 3.0


def _check_g53_segunda_persona(eid, text, ctx, mk):
    out = []
    for m in _READER_RE.finditer(text or ""):
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
    return [mk(eid, text, 0, len(text or ""), "g11_variaacion_oracion", "info",
              f"Las {len(sents)} oraciones del parrafo miden casi lo mismo "
              f"(desviacion {sigma:.1f}). Una redaccion mecanica tiene latidos "
              f"iguales; alternar la longitud las hace mas leibles",
              phase="global")]


GLOBAL_CHECKS.update({
    "g53_segunda_persona": _check_g53_segunda_persona,
    "g11_variacion_oracion": _check_g11_variacion_oracion,
})
```

- [ ] **Step 4: Corré y confirmá que pasa**

Run: `pytest python/tests/test_phase_scope.py -q`
Expected: PASS.

- [ ] **Step 5: Commiteá**

```bash
git add python/modules/phase_scope.py python/tests/test_phase_scope.py
git commit -m "feat(phase): R-G53 segunda persona y R-G11 ritmo de oracion

R-G11 tiene un piso de 4 oraciones antes de medir: la desviacion de dos
numeros no describe un ritmo, y con el piso del catalogo (sigma < 3) un
parrafo corto bien escrito saldia marcado. Es la Review Focus 1 del plan.

Ambas descartan lo que esta entre comillas, igual que R-G51 y R-G52."
```

---

### Task 4: R-G34, R-G35, R-G61 y R-G63 — las que necesitan estado de documento

**Files:**
- Modify: `python/modules/phase_scope.py`
- Modify: `python/modules/proactive_auditor.py`
- Modify: `python/tests/test_phase_scope.py`

**Interfaces:**
- Consumes: `GlobalContext`, `build_global_context` de la Task 1.
- Produces: las cuatro reglas restantes, y `GlobalContext` con `seen_acronyms` y `connector_counts` **mutables** (hoy `build_global_context` los devuelve vacíos y es solo una cuenta de palabras).

- [ ] **Step 1: Escribí los tests que fallan**

```python
def test_sigla_sin_definir_en_su_primera_aparicion():
    out = _g("el PIB crecio un 3% durante el periodo.", ctx=_ctx(200))
    assert "g34_sigla_sin_definir" in {f["kind"] for f in out}


def test_sigla_ya_definida_no_se_vuelve_a_marcar():
    # Review Focus 2: marcar la sigla en cada parrafo produce una tanda de
    # hallazgos identicos. Solo la primera aparicion es el error.
    from modules.phase_scope import GlobalContext, global_findings as gf
    ctx = GlobalContext(doc_words=400, seen_acronyms=frozenset({"PIB"}),
                        connector_counts={})
    assert gf("e2", "El PIB seguia creciendo en el segundo trimestre.", ctx, mk=mk) == []


def test_sigla_definida_no_es_hallazgo():
    out = _g("El Producto Interno Bruto (PIB) crecio un 3% durante el periodo.")
    assert "g34_sigla_sin_definir" not in {f["kind"] for f in out}


def test_unidades_mixtas_para_el_mismo_concepto():
    out = _g("Se midieron 5 kg de muestra y luego cinco kilogramos en la segunda tanda.")
    assert "g35_unidades_mixtas" in {f["kind"] for f in out}


def test_una_sola_forma_de_unidad_no_es_hallazgo():
    assert [f for f in _g("Se midieron 5 kg de muestra.") if f["kind"] == "g35_unidades_mixtas"] == []


def test_triada_repetida_como_muletilla():
    texto = ("Es rapido, eficiente y confiable. Es claro, conciso y directo. "
             "Es seguro, estable y veloz.")
    assert "g61_triada" in {f["kind"] for f in _g(texto)}


def test_una_triada_suelta_no_es_hallazgo():
    assert "g61_triada" not in {f["kind"] for f in _g("El sistema es rapido, eficiente y confiable.")}


def test_conectores_por_mil_palabras_y_no_por_repeticion():
    # Review Focus 3: dos "sin embargo" en un documento corto son normales;
    # tres en 300 palabras no. El umbral depende del largo real.
    from modules.phase_scope import GlobalContext, global_findings as gf
    corto = GlobalContext(doc_words=200, seen_acronyms=frozenset(), connector_counts={})
    assert gf("e1", "Sin embargo, A. Sin embargo, B. Sin embargo, C.", corto, mk=mk) != []
    largo = GlobalContext(doc_words=20000, seen_acronyms=frozenset(), connector_counts={})
    assert gf("e1", "Sin embargo, A. Sin embargo, B. Sin embargo, C.", largo, mk=mk) == []


def helper_ctx(n):
    from modules.phase_scope import GlobalContext
    return GlobalContext(doc_words=n, seen_acronyms=frozenset(), connector_counts={})
```

- [ ] **Step 2: Corré y confirmá que falla**

Run: `pytest python/tests/test_phase_scope.py -q`
Expected: FAIL.

- [ ] **Step 3: Implementá**

```python
# R-G34: siglas y acronimos. Se definen la primera vez: "Producto Interno Bruto
# (PIB)". "Mayor" en el catalogo.
_ACRONYM_RE = re.compile(r"\b[A-ZÁÉÍÓÚÑ]{2,6}\b")
_DEFINES_ACRONYM = re.compile(
    r"\b([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s+(?:y|de|del)\s+)?)+"
    r"(?:\s+[a-záéíóúñ]+){0,4}\s*\(\s*([A-ZÁÉÍÓÚÑ]{2,6})\s*\)"
)
# Siglas que no son acronimos: nombres propios en mayusculas, dias, meses.
_NOT_ACRONYM = {
    "TAPA", "U", "N", "S", "I", "II", "III", "IV", "V", "APA", "MSN", "DPI",
}


def _check_g34_sigla_sin_definir(eid, text, ctx, mk):
    texto = text or ""
    definidas = {m.group(2) for m in _DEFINES_ACRONYM.finditer(texto)}
    out = []
    for m in _ACRONYM_RE.finditer(texto):
        sigla = m.group(0)
        if sigla in definidas or sigla in _NOT_ACRONYM:
            continue
        if sigla in ctx.seen_acronyms:
            continue  # ya se reporto en su primera aparicion
        out.append(mk(eid, texto, m.start(), m.end(), "g34_sigla_sin_definir",
                      "medium",
                      f'La sigla "{sigla}" no esta definida. Se define la primera '
                      f"vez: Nombre completo ({sigla}), y despues solo la sigla",
                      phase="global"))
    return out


# R-G35: consistencia de unidades. "Menor".
_UNITS = {
    "kg": "kilogramos", "g": "gramos", "cm": "centimetros", "mm": "milimetros",
    "m": "metros", "km": "kilometros", "l": "litros", "ml": "mililitros",
}
_UNIT_NUMBER_RE = re.compile(
    r"(\d+)\s*(" + "|".join(sorted(_UNITS, key=len, reverse=True)) + r")\b"
)
_UNIT_WORD_RE = re.compile(
    r"\b(" + "|".join(sorted(set(_UNITS.values()), key=len, reverse=True)) + r")\b"
)


def _check_g35_unidades_mixtas(eid, text, ctx, mk):
    texto = (text or "").lower()
    con_numero = {m.group(2): m.start() for m in _UNIT_NUMBER_RE.finditer(texto)}
    con_palabra = {m.group(1): m.start() for m in _UNIT_WORD_RE.finditer(texto)}
    out = []
    for sigla, _ in con_numero.items():
        larga = _UNITS[sigla]
        if larga in con_palabra:
            out.append(mk(eid, text, con_palabra[larga], con_palabra[larga] + len(larga),
                          "g35_unidades_mixtas", "info",
                          f'Alternas "{sigla}" y "{larga}" para lo mismo. Una '
                          f"unidad en todo el documento", phase="global"))
    return out


# R-G61: triadas como muletilla. "Menor".
_TRIPLE_RE = re.compile(
    r"\b([a-záéíóúñ]{4,}),\s+([a-záéíóúñ]{4,})\s+y\s+([a-záéíóúñ]{4,})\b"
)


def _check_g61_triada(eid, text, ctx, mk):
    triadas = [m for m in _TRIPLE_RE.finditer(text or "")]
    if len(triadas) < 3:
        return []
    return [mk(eid, text, triadas[0].start(), triadas[0].end(), "g61_triada", "info",
              f"La estructura 'A, B y C' se repite {len(triadas)} veces en el "
              f"parrafo. Es una muletilla estructural", phase="global")]


# R-G63: densidad de conectores de contraste y adicion. "Menor". Se mide por
# mil palabras del documento, no por repeticion textual: tres "sin embargo" en
# 300 palabras es un problema y en 12.000 no.
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
        for m in re.finditer(r"(?<![a-záéíóúñ])" + re.escape(conector) + r"(?![a-záéíóúñ])", low):
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


GLOBAL_CHECKS.update({
    "g34_sigla_sin_definir": _check_g34_sigla_sin_definir,
    "g35_unidades_mixtas": _check_g35_unidades_mixtas,
    "g61_triada": _check_g61_triada,
    "g63_conectores_densidad": _check_g63_conectores_densidad,
})
```

- [ ] **Step 4: Cableá la capa en `audit_elements`**

En `proactive_auditor.py`, junto a donde ya se calcula `phase_by_id`:

```python
    # Capa de reglas globales: contexto UNA vez, hallazgos por parrafo. Ver
    # `phase_scope.global_findings` para por que vive ahi y no suelta aca.
    global_ctx = build_global_context(elements)
```

Y después de `findings.extend(phase_findings(...))`:

```python
        findings.extend(global_findings(eid, text, global_ctx, mk=_mk))
```

Y en los imports: `GlobalContext`, `build_global_context`, `global_findings`.

- [ ] **Step 5: Corré y confirmá que pasa**

Run: `pytest python/tests/test_phase_scope.py python/tests/test_rule_scopes.py -q`
Expected: PASS, incluido el guard de "global declarada ⇒ implementada", que era el que la Task 1 dejó abierto.

- [ ] **Step 6: Commiteá**

```bash
git add python/modules/phase_scope.py python/modules/proactive_auditor.py python/tests/test_phase_scope.py
git commit -m "feat(phase): R-G34 siglas, R-G35 unidades, R-G61 triadas, R-G63 conectores

Las cuatro que necesitan estado de documento en vez de estado de parrafo.
Por eso GlobalContext existe: una sigla se define una vez y solo su primera
aparicion sin definir es el error; una unidad se compara contra todo el texto;
los conectores se cuentan por frecuencia normalizada, no por repeticion.

Cierra el catalogo de las ocho universales baratas y hace pasar el guard de
'global declarada implica implementada'."
```

---

### Task 5: Las ocho filas en la vista

**Files:**
- Modify: `src/lib/auditItems.ts`
- Modify: `src/hooks/useReviewWorkbench.ts` (`SUBTYPE_ACTION`, `SUBTYPE_LABELS`)
- Create: `src/__tests__/globalRows.test.ts`

**Interfaces:**
- Consumes: los `kind` que emite la Fase 1.
- Produces: una fila por kind en `PROOFREAD_SPECS`, con subtipo y acción. Ninguna aceptable a mano: las ocho son "marcá y corregí vos", y la razón es que las cuatro con `medium`/`error` (coloquialismo, segunda persona, sigla) y las cuatro con `info` (exclamación, ritmo, unidades, tríadas, conectores) ninguna trae un texto corregido que la aplicadora pueda escribir sin decidir por el usuario.

- [ ] **Step 1: Escribí el test que falla**

`src/__tests__/globalRows.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { collectAuditItems, type AuditItem, type AuditSources } from '../lib/auditItems';

const KINDS = [
  'g11_variacion_oracion', 'g34_sigla_sin_definir', 'g35_unidades_mixtas',
  'g51_registro_coloquial', 'g52_exclamacion', 'g53_segunda_persona',
  'g61_triada', 'g63_conectores_densidad',
];

const sources = (kind: string): AuditSources => ({
  elements: [], reviewResult: null,
  proofreadFindings: [{
    element_id: 'e1', start: 0, end: 5, excerpt: 'texto',
    kind, severity: 'warn', message: 'm', source: 'local',
    phase: 'global', read_only: false,
  }],
  citationAuditResult: null,
});

describe('las ocho universales tienen fila propia', () => {
  for (const kind of KINDS) {
    it(`${kind} no cae en "otro" y no trae texto sugerido`, () => {
      const items: AuditItem[] = collectAuditItems(sources(kind));
      expect(items).toHaveLength(1);
      expect(items[0].subtype, `${kind} cae en el fallback`).not.toBe('otro');
      expect(items[0].suggestedText).toBeUndefined();
    });
  }

  it('todas son reglas generales, no de una fase', () => {
    for (const kind of KINDS) {
      expect(collectAuditItems(sources(kind))[0].phase).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Corré y confirmá que falla**

Run: `npx vitest run src/__tests__/globalRows.test.ts`
Expected: FAIL — las ocho caen en `otro`.

- [ ] **Step 3: Agregá las filas**

En `PROOFREAD_SPECS`, después de las de fase:

```ts
  /* Las ocho universales baratas (spec §12). Todas 'mark': ninguna trae un
     texto corregido, y offering una reescritura automatica de prosa argumental
     seria decidir por el usuario. El motor detecta, la persona corrige. */
  g11_variacion_oracion: { category: 'style', subtype: 'ritmo_oracion', severity: 'low', summary: DEL_MOTOR },
  g34_sigla_sin_definir: { category: 'style', subtype: 'sigla_sin_definir', severity: 'medium', summary: DEL_MOTOR },
  g35_unidades_mixtas: { category: 'style', subtype: 'unidad_mixta', severity: 'low', summary: DEL_MOTOR },
  g51_registro_coloquial: { category: 'style', subtype: 'registro_coloquial', severity: 'high', summary: DEL_MOTOR },
  g52_exclamacion: { category: 'style', subtype: 'exclamacion', severity: 'low', summary: DEL_MOTOR },
  g53_segunda_persona: { category: 'style', subtype: 'segunda_persona', severity: 'medium', summary: DEL_MOTOR },
  g61_triada: { category: 'style', subtype: 'triada', severity: 'low', summary: DEL_MOTOR },
  g63_conectores_densidad: { category: 'style', subtype: 'densidad_conectores', severity: 'low', summary: DEL_MOTOR },
```

Y en `useReviewWorkbench.ts`, `SUBTYPE_ACTION` y `SUBTYPE_LABELS`, ocho filas cada uno, todas `'mark'` en la primera tabla, con etiquetas en español.

- [ ] **Step 4: Corré y confirmá que pasa**

Run: `npx vitest run`
Expected: PASS completa. Algún test que construya `AuditItem` a mano va a necesitar `phase` y `readOnly`; agregalos.

- [ ] **Step 5: Corré las tres verificaciones**

```bash
pytest python/tests/ -q
npx vitest run
npm run build
```
Expected: las tres en verde.

- [ ] **Step 6: Commiteá**

```bash
git add src/lib/auditItems.ts src/hooks/useReviewWorkbench.ts src/__tests__/globalRows.test.ts
git commit -m "feat(review): las ocho universales tienen fila, subtipo y etiqueta

Sin fila propia caian en 'Otro hallazgo del corrector' con el kind crudo en el
chip del lienzo. Todas son 'mark': ninguna trae texto corregido, y una
reescritura automatica de prosa argumental seria decidir por el usuario. El
motor detecta, la persona corrige."
```

- [ ] **Step 7: Revisá la rama**

```bash
git log --oneline <base>..HEAD
```
Expected: 5 commits, uno por tarea, cada uno con su test.
