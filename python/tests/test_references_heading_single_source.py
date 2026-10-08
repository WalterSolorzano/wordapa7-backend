"""Una sola definicion de "esto abre la seccion de Referencias".

Habia CUATRO lugares decidiendo lo mismo con TRES vocabularios distintos:

  generator._REF_SECTION_HEADINGS        referencias, bibliografia, referencias bibliograficas
  layered_generator._REF_SECTION_HEADINGS  (copia, y sin quitar la numeracion)
  phase_scope (fase `referencias`)      esos tres + `works cited`
  pre_classifier._LEVEL1_KEYWORDS        referencias, bibliografia (+ 25 mas)

Solo el de phase_scope sabia contestar "Works Cited", y `generator` contestaba
"3. Referencias" mientras `layered_generator` no. Dos copias que ya no coincidian
consigo mismas: la divergencia existia, solo que todavia no habia hecho dano.
"""


import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from generation.generator import _is_references_section_heading as gen_detecta  # noqa: E402
from generation.layered_generator import _is_references_section_heading as lay_detecta  # noqa: E402
from modules.phase_scope import PHASES, match_phase_exact  # noqa: E402

AMBAS = (gen_detecta, lay_detecta)


def _heading(texto):
    return SimpleNamespace(type="heading", text=texto)


def _no_heading(texto):
    return SimpleNamespace(type="paragraph", text=texto)


# ── las dos copias tienen que dar la MISMA respuesta ───────────────────────────

TITULOS = [
    "Referencias",
    "REFERENCIAS",
    "Bibliografía",
    "Referencias bibliográficas",
    "Works Cited",
    "3. Referencias",
    "Referencias:",
    "  Referencias  ",
]


def test_las_dos_copias_coinciden_en_todo_el_vocabulario():
    for t in TITULOS:
        respuestas = {f.__module__: f(_heading(t)) for f in AMBAS}
        assert len(set(respuestas.values())) == 1, (t, respuestas)


def test_una_seccion_de_referencias_solo_se_reconoce_si_es_titulo():
    # El texto solo no alcanza: "Referencias" al final de un parrafo de cuerpo es
    # una frase, no la seccion. Por eso las dos funciones miran el tipo.
    for f in AMBAS:
        assert f(_heading("Referencias")) is True
        assert f(_no_heading("Referencias")) is False


# ── y las dos tienen que coincidir con el vocabulario de fases ────────────────

def test_no_puede_ser_mas_estricto_que_el_vocabulario_de_fases():
    cfg = next(c for c in PHASES if c.key == "referencias")
    assert cfg.titles, "la fase referencias deberia tener titulos"
    for titulo in cfg.titles:
        for f in AMBAS:
            assert f(_heading(titulo)) is True, (titulo, f.__module__)


def test_no_puede_ser_mas_permisivo_que_el_vocabulario_de_fases():
    # Al reves tampoco: si un generador acepta algo que el motor de fases no
    # reconoce, el generador deduplica y el motorietro no. Esa asimetria es
    # exactamente el bug que se reporto.
    for f in AMBAS:
        for titulo in _todos_los_titulos_de_fase():
            if match_phase_exact(titulo) == "referencias":
                continue
            assert f(_heading(titulo)) is False, (titulo, f.__module__)


def _todos_los_titulos_de_fase():
    for c in PHASES:
        for t in c.titles:
            yield t


# ── lo que si es un titulo de otra seccion ───────────────────────────────────

def test_una_seccion_que_empieza_por_referencias_no_es_la_de_referencias():
    # "Referencias de la encuesta" es una seccion del autor con datos propios,
    # no la bibliografia. `match_phase_exact` es el que lo distingue: con
    # `match_phase` seria ambiguso y el generador se comeria su contenido.
    for f in AMBAS:
        assert f(_heading("Referencias de la encuesta")) is False
