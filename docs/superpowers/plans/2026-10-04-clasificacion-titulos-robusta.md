# Clasificación robusta de títulos H1/H2/H3 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el clasificador reconozca títulos con formatos atípicos (mayúsculas sin negrita, solo tamaño de fuente, `CAPITULO I` sin punto) y que lea el `w:outlineLvl` real del DOCX en vez de asumir `9.0`.

**Architecture:** El parser (`docx_parser.py`) extrae hoy `style_name`/`is_bold`/`font_size` pero deja `heading_level=None`. Se agrega la extracción del `outlineLvl` real al `ElementModel`, se propaga a `StyleFingerprint.outline_level` (hoy hardcodeado 9.0) y se amplían las heurísticas de `pre_classifier.py` con reglas conservadoras para los casos atípicos. Todo respeta la disciplina de ámbitos (`phase_scope.py`): el clasificador solo asigna niveles 1/2/3 y nunca infiere ámbito del cuerpo del párrafo.

**Tech Stack:** Python 3.11, `python-docx`/lxml, pytest. Frontend: TypeScript/Vitest (solo verificación de que confía en el nivel).

**Spec:** `docs/superpowers/specs/2026-10-04-clasificacion-titulos-robusta-design.md`

## Global Constraints

- **Nunca** decidir el ámbito de una regla buscando palabras en el cuerpo de un párrafo. El ámbito se decide **solo** con el título de un H1 (`match_phase` en `phase_scope.py`).
- Un H2 hereda el ámbito de su H1 ancestro; no abre ámbito propio.
- `match_phase_exact` (no `match_phase`) para corregir niveles de título.
- La portada se mide pero no se escribe (`read_only=True`); ningún cambio puede romper `use_original_cover` ni la indivisibilidad de portada en `computePages`.
- Cero emojis; solo tokens CSS.
- `pytest.ini`: `testpaths=python/tests`, `pythonpath=python`. Tests `def test_*` síncronos.
- Un commit atómico por tarea, tests verdes antes de commitear.

## Review Focus

1. **Párrafo corto en mayúsculas al inicio de una sección** (p. ej. una línea de cita) no debe promoverse a título por el solo hecho de ser mayúsculas.
2. **`1. Seiri`** (lista numerada de 1 palabra) sigue siendo lista, no encabezado.
3. **Título legítimo solo por tamaño de fuente a la izquierda** debe salir como H1, no como H2 (hoy cae H2).
4. **`CAPITULO I` sin punto final** debe clasificar como H1 sin que `CAPITULO II` o `IV. METODO` cambien de nivel.
5. **Documento sin estilos Heading pero con `w:outlineLvl` real** debe respetar ese outline, no el 9.0 fijo.

Cada línea de arriba queda fijada por un test en la tarea que posee el código.

---

## Estructura de archivos

- `python/parsing/docx_parser.py` — **modificar**. Extraer `outline_level` de `w:outlineLvl` a `ElementModel`.
- `python/models.py` — **modificar**. Agregar campo `outline_level: Optional[int] = None` a `ElementModel`.
- `python/parsing/clustering_classifier.py` — **modificar**. `StyleFingerprint.outline_level` deja de ser 9.0 fijo; lo recibe.
- `python/parsing/pre_classifier.py` — **modificar**. Heurísticas para títulos atípicos.
- `python/tests/test_outline_level_parsing.py` — **nuevo**. Lectura del outline real.
- `python/tests/test_titulos_atipicos.py` — **nuevo**. Los casos del spec.
- `src/__tests__/jerarquia.test.ts` — **verificar** (no modificar): confía en `heading_level`, no re-adivina.

---

### Task 1: Leer `w:outlineLvl` real en el parser

**Files:**
- Modify: `python/models.py` (dataclass `ElementModel`)
- Modify: `python/parsing/docx_parser.py:1038-1090,1135,1353`
- Test: `python/tests/test_outline_level_parsing.py`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `ElementModel.outline_level: Optional[int]` — valor 0..8 del `w:outlineLvl` de Word (`0` = nivel 1), `None` si no está declarado.

- [ ] **Step 1: Escribir el test que falla**

```python
# python/tests/test_outline_level_parsing.py
from docx import Document

from parsing.docx_parser import parse_document


def _docx_con_outline(tmp_path):
    doc = Document()
    p = doc.add_paragraph("Resultados")
    pPr = p._p.get_or_add_pPr()
    ol = pPr.makeelement(
        "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}outlineLvl",
        {"{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val": "0"},
    )
    pPr.append(ol)
    path = tmp_path / "outline.docx"
    doc.save(path)
    return str(path)


def test_lee_outline_lvl_cero_como_valor_crudo(tmp_path):
    elems = parse_document(_docx_con_outline(tmp_path))
    p = next(e for e in elems if e.text.strip() == "Resultados")
    assert p.outline_level == 0


def test_parrafo_sin_outline_tiene_none(tmp_path):
    doc = Document()
    doc.add_paragraph("Texto normal")
    path = tmp_path / "sin.docx"
    doc.save(path)
    elems = parse_document(str(path))
    p = next(e for e in elems if e.text.strip() == "Texto normal")
    assert p.outline_level is None
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m pytest python/tests/test_outline_level_parsing.py -q`
Expected: FAIL con "ElementModel has no attribute 'outline_level'".

- [ ] **Step 3: Agregar el campo al modelo**

En `python/models.py`, dentro de `ElementModel`, junto a `heading_level`:

```python
    outline_level: Optional[int] = None
```

- [ ] **Step 4: Extraer el outline real en el parser**

En `python/parsing/docx_parser.py`, donde se lee `pPr` (zona L1038-1090), agregar la lectura del `w:outlineLvl`:

```python
    W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    outline_level = None
    pPr = paragraph._p.pPr
    if pPr is not None:
        ol = pPr.find(f"{W}outlineLvl")
        if ol is not None:
            val = ol.get(f"{W}val")
            if val is not None and val.isdigit():
                outline_level = int(val)
```

Y pasar `outline_level=outline_level` en las dos construcciones de `ElementModel` (L1135 y L1353).

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `python -m pytest python/tests/test_outline_level_parsing.py -q`
Expected: PASS.

- [ ] **Step 6: Verificar que el parser no rompió nada**

Run: `python -m pytest python/tests/test_docx_parser.py python/tests/test_xml_deep_parser.py -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add python/models.py python/parsing/docx_parser.py python/tests/test_outline_level_parsing.py
git commit -m "feat(parsing): extraer w:outlineLvl real al ElementModel"
```

---

### Task 2: Propagar el outline real a `StyleFingerprint` y usarlo como señal

**Files:**
- Modify: `python/parsing/clustering_classifier.py:33-90`
- Modify: `python/parsing/pre_classifier.py` (Pasada 4, L1543-1547)
- Test: `python/tests/test_outline_level_parsing.py`

**Interfaces:**
- Consumes: `ElementModel.outline_level` de Task 1.
- Produces:
  - `StyleFingerprint(outline_level=<int|None>)` — ya no hardcodea 9.0.
  - Regla previa en `pre_classifier`: si `outline_level` está presente (0..4), es una señal fuerte de nivel (`outline_level + 1`), con prioridad sobre el scoring cuando hay conflicto.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `python/tests/test_outline_level_parsing.py`:

```python
def test_outline_real_gana_sobre_formato_solo_tamano(tmp_path):
    # Parrafo con outlineLvl=0 (nivel 1) pero sin negrita ni centrado.
    from docx import Document
    doc = Document()
    p = doc.add_paragraph("Metodologia")
    pPr = p._p.get_or_add_pPr()
    W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    pPr.append(pPr.makeelement(f"{W}outlineLvl", {f"{W}val": "0"}))
    path = tmp_path / "ol0.docx"
    doc.save(path)
    from parsing.pre_classifier import classify_document
    elems = classify_document(str(path))
    e = next(x for x in elems if x.text.strip() == "Metodologia")
    assert e.heading_level == 1
```

(Ajustar el nombre real de la función de entrada de `pre_classifier` si es `classify_document` u otro; el resto del test no cambia.)

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m pytest python/tests/test_outline_level_parsing.py::test_outline_real_gana_sobre_formato_solo_tamano -q`
Expected: FAIL (cae a párrafo o nivel 2).

- [ ] **Step 3: `StyleFingerprint` recibe el outline**

En `python/parsing/clustering_classifier.py:88`, reemplazar el `outline_level=9.0` fijo por el valor real normalizado:

```python
        # outlineLvl de Word: 0 = nivel 1. Si no hay, 9.0 = "sin outline".
        outline_level=float(el.outline_level) if getattr(el, "outline_level", None) is not None else 9.0,
```

- [ ] **Step 4: Regla de outline en `pre_classifier`**

Antes del scoring de la Pasada 3 (o al inicio de la Pasada 4), agregar:

```python
    # Outline real de Word: senal fuerte. 0..4 -> H1..H5. No abre ambito por si
    # sola distinto de lo que ya hace H1; solo corrige el nivel.
    ol = getattr(el, "outline_level", None)
    if ol is not None and 0 <= ol <= 4:
        el.type = "heading"
        el.heading_level = ol + 1
        el.confidence = max(el.confidence, 0.95)
```

(Respetar el guard de longitud ya existente `_apply_native_heading_length_guard`, para que un párrafo largo con outline no se promueva.)

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `python -m pytest python/tests/test_outline_level_parsing.py -q`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add python/parsing/clustering_classifier.py python/parsing/pre_classifier.py python/tests/test_outline_level_parsing.py
git commit -m "feat(parsing): usar outlineLvl real como senal de nivel"
```

---

### Task 3: Heurísticas para títulos atípicos

**Files:**
- Modify: `python/parsing/pre_classifier.py` (zonas L609-637 y L814-821)
- Test: `python/tests/test_titulos_atipicos.py`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: reglas que promueven a heading casos hoy no clasificados, **sin** abrir ámbito por palabras del cuerpo.

- [ ] **Step 1: Escribir los tests que fallan**

```python
# python/tests/test_titulos_atipicos.py
from models import ElementModel
from parsing.pre_classifier import classify_paragraphs  # ajustar al nombre real


def _el(text, *, bold=False, centered=False, font=12.0, italic=False):
    return ElementModel(
        text=text, is_bold=bold, alignment="center" if centered else "left",
        font_size=font, is_italic=italic,
    )


def test_introduccion_mayusculas_sin_negrita_es_h1():
    e = _el("INTRODUCCION", bold=False, centered=False, font=12.0)
    res = classify_paragraphs([e])
    assert res[0].type == "heading"
    assert res[0].heading_level == 1


def test_solo_tamano_grande_izquierda_es_h1():
    e = _el("Metodologia", bold=False, centered=False, font=16.0)
    res = classify_paragraphs([e])
    assert res[0].heading_level == 1


def test_capitulo_i_sin_punto_es_h1():
    e = _el("CAPITULO I", bold=False, centered=False, font=12.0)
    res = classify_paragraphs([e])
    assert res[0].type == "heading"
    assert res[0].heading_level == 1


def test_seiri_sigue_siendo_lista():
    e = _el("1. Seiri", bold=False, centered=False, font=12.0)
    res = classify_paragraphs([e])
    assert res[0].type != "heading"


def test_parrafo_largo_mayusculas_no_se_promueve():
    e = _el("ESTE ES UN PARRAFO COMPLETO EN MAYUSCULAS CON MUCHAS PALABRAS "
             "QUE NO ES UN TITULO DE NINGUNA SECCION", font=12.0)
    res = classify_paragraphs([e])
    assert res[0].type != "heading"
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `python -m pytest python/tests/test_titulos_atipicos.py -q`
Expected: FAIL en los tres primeros; PASS en los dos guardrails (Seiri y párrafo largo). Si los guardrails también fallan, la regla nueva es demasiado agresiva y hay que acotarla antes de seguir.

- [ ] **Step 3: Ampliar las heurísticas**

En la zona de keywords (L609-637), relajar la condición de formato para títulos en mayúsculas **cortos** (≤8 palabras) y sin punto final, exigiendo `_is_all_caps`:

```python
    # Titulos en MAYUSCULAS cortos (INTRODUCCION, METODOLOGIA, RESULTADOS):
    # antes exigian negrita/centrado/tamano. Un titulo real es corto y sin punto.
    if (
        _is_all_caps(texto)
        and len(texto.split()) <= 8
        and not texto.rstrip().endswith(".")
        and not any(ch.isdigit() for ch in texto[:3])
    ):
        return heading_nivel_1(texto)  # helper existente
```

En la zona L814-821 (centered + font>=14 → H1), agregar una rama para **solo tamaño grande a la izquierda**, con guard de longitud:

```python
    # Titulo por solo tamano de fuente (>=15) a la izquierda y corto -> H1.
    # Antes caia a H2 por el scoring. Se exige corto para no promover parrafos.
    if font_size >= 15 and len(texto.split()) <= 10 and not texto.rstrip().endswith("."):
        return heading_nivel_1(texto)
```

En el regex de romano (L643-663), aceptar `CAPITULO <romano>` **sin punto final** cuando el texto tras el prefijo está vacío o es solo el numeral, manteniendo la excepción `"1. Seiri"` intacta:

```python
    # CAPITULO I / CAPITULO IV sin punto final.
    if re.match(r"^(CAPITULO|CAPÍTULO)\s+[IVXLC]+$", texto.strip().upper()):
        return heading_nivel_1(texto)
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `python -m pytest python/tests/test_titulos_atipicos.py -q`
Expected: PASS (5 tests).

- [ ] **Step 5: Correr los guardrails existentes**

Run: `python -m pytest python/tests/test_pre_classifier.py python/tests/test_pre_classifier_guards.py python/tests/test_heading_demotion.py python/tests/test_heading_numbering_notation.py -q`
Expected: PASS. Si algo falla, acotar la regla culpable (no tocar los tests salvo que el spec lo pida).

- [ ] **Step 6: Commit**

```bash
git add python/parsing/pre_classifier.py python/tests/test_titulos_atipicos.py
git commit -m "feat(parsing): heuristicas para titulos atipicos (mayusculas, solo tamano, capitulo sin punto)"
```

---

### Task 4: Verificar disciplina de ámbitos y no romper fase

**Files:**
- Test: `python/tests/test_phase_scope.py` (verificar)
- Test: `python/tests/test_rule_scopes.py` (verificar)
- Test: `src/__tests__/jerarquia.test.ts` (verificar)

**Interfaces:**
- Consumes: los niveles producidos por Tasks 1-3.
- Produces: nada (verificación de no-regresión).

- [ ] **Step 1: Correr la suite de fases y reglas**

Run: `python -m pytest python/tests/test_phase_scope.py python/tests/test_rule_scopes.py python/tests/test_normalize_headings_phases.py -q`
Expected: PASS.

- [ ] **Step 2: Agregar un test de que un H2 atípico hereda el ámbito del H1**

Agregar a `python/tests/test_phase_scope.py`:

```python
def test_h2_atipico_hereda_ambito_del_h1():
    from modules.phase_scope import build_phase_map
    elementos = [
        {"type": "heading", "heading_level": 1, "text": "METODOLOGIA"},
        {"type": "heading", "heading_level": 2, "text": "PARTICIPANTES"},
        {"type": "paragraph", "text": "Texto."},
    ]
    mapa = build_phase_map(elementos)
    # El H2 y el parrafo posterior viven en el ambito que abrio el H1.
    assert mapa[2] == mapa[0]
    assert mapa[1] == mapa[0]
```

- [ ] **Step 3: Correr el test para verificar que pasa**

Run: `python -m pytest python/tests/test_phase_scope.py::test_h2_atipico_hereda_ambito_del_h1 -q`
Expected: PASS (la herencia ya existe; el test la fija).

- [ ] **Step 4: Correr el frontend de jerarquía**

Run: `npx vitest run src/__tests__/jerarquia.test.ts`
Expected: PASS (el frontend confía en `heading_level`, no re-adivina).

- [ ] **Step 5: Commit**

```bash
git add python/tests/test_phase_scope.py
git commit -m "test(fases): fijar que un H2 atipico hereda el ambito del H1"
```

---

## Criterios de aceptación (del spec)

- [ ] `ElementModel.outline_level` se lee del `w:outlineLvl` real (0..8) y `None` si falta.
- [ ] `StyleFingerprint.outline_level` ya no es 9.0 fijo.
- [ ] `INTRODUCCION` en mayúsculas sin negrita clasifica H1.
- [ ] Título solo por tamaño de fuente a la izquierda clasifica H1 (no H2).
- [ ] `CAPITULO I` sin punto clasifica H1; `1. Seiri` sigue lista.
- [ ] Párrafo largo en mayúsculas no se promueve.
- [ ] Un H2 atípico hereda el ámbito del H1.
- [ ] Tests: `python -m pytest python/tests/test_outline_level_parsing.py python/tests/test_titulos_atipicos.py python/tests/test_phase_scope.py -q` verde; `npx vitest run src/__tests__/jerarquia.test.ts` verde.
