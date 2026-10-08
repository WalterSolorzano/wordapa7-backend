"""El endpoint /api/normalize-headings tiene que usar EL vocabulario de fases.

Tenia su propia lista (`LEVEL1_PATTERNS`), y eso es el mismo defecto por
tercera puerta: decidir "esto es una fase?" con una lista local en vez de con
`phase_scope`. Consequences verificadas:

  - No conocia `objetivos`, asi que un H2 "Objetivos" no se promovia a H1, la
    fase `objetivos` no abria, y `bloom_vague` no disparaba nunca: la regla que
    este trabajo vino a acotar quedaba muda.
  - No quita numeracion romana, asi que "IV. METODO" daba "iv. metodo" y no
    matcheaba, mientras `normalize_title` si lo resuelve. Los dos caminos
    daban respuestas opuestas sobre el mismo documento.
  - Promovia `recomendaciones`, que no esta en el vocabulario: quedaba H1
    abriendo `sin_fase`.

Ademas `pre_classifier` deja los titulos de tesis mas comunes en su forma mas
comun ("Objetivos especificos", "Capitulo III. Metodologia") sin abrir fase, y
este endpoint es quien las Beria a H1.
"""

import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402
from models import DocumentModel, ElementModel, ElementType  # noqa: E402
from config import STORAGE_DIR  # noqa: E402
from persistence.session_manager import delete_session, save_session_state  # noqa: E402

client = TestClient(app)


def _h(eid, text, level):
    return ElementModel(id=eid, type=ElementType.HEADING, heading_level=level,
                        text=text)


def _sesion(*elements):
    sid = f"norm-{uuid.uuid4().hex[:8]}"
    doc = DocumentModel(session_id=sid, elements=list(elements))
    save_session_state(doc, STORAGE_DIR)
    return sid


def _normaliza(sid):
    resp = client.post("/api/normalize-headings", json={"session_id": sid})
    assert resp.status_code == 200, resp.text
    return {e["id"]: e["heading_level"] for e in resp.json()["elements"]
            if e["type"] == ElementType.HEADING.value}


def _limpia(*sids):
    for s in sids:
        try:
            delete_session(s, STORAGE_DIR)
        except Exception:
            pass


def test_promueve_un_h2_que_es_una_fase_real():
    sid = _sesion(_h("h1", "Metodo", 1), _h("h2", "Resultados", 2))
    try:
        assert _normaliza(sid)["h2"] == 1
    finally:
        _limpia(sid)


def test_promueve_la_forma_mas_comun_del_titulo_de_objetivos():
    # La que el vocabulario no abria y que deja toda la fase muda.
    sid = _sesion(_h("h2", "Objetivos", 2))
    try:
        assert _normaliza(sid)["h2"] == 1
    finally:
        _limpia(sid)


def test_promueve_una_fase_con_calificador():
    sid = _sesion(_h("h2", "Objetivos especificos", 2))
    try:
        assert _normaliza(sid)["h2"] == 1
    finally:
        _limpia(sid)


def test_promuye_un_titulo_con_numeracion_romana():
    # "IV. METODO" no matcheaba porque solo se quitaba la numeracion araba.
    sid = _sesion(_h("h2", "IV. METODO", 2))
    try:
        assert _normaliza(sid)["h2"] == 1
    finally:
        _limpia(sid)


def test_promueve_un_titulo_con_prefijo_de_capitulo():
    sid = _sesion(_h("h2", "Capitulo III. Metodologia", 2))
    try:
        assert _normaliza(sid)["h2"] == 1
    finally:
        _limpia(sid)


def test_no_promueve_un_titulo_que_no_es_una_fase():
    # "Recomendaciones" no esta en el vocabulario: promoverlo lo dejaba
    # abriendo `sin_fase`, que es un H1 que no dice nada.
    sid = _sesion(_h("h2", "Recomendaciones", 2))
    try:
        assert _normaliza(sid)["h2"] != 1
    finally:
        _limpia(sid)


def test_no_promueve_la_portada():
    cover = ElementModel(id="c1", type=ElementType.HEADING, heading_level=3,
                         text="Metodologia", is_cover_section=True)
    sid = _sesion(cover)
    try:
        assert _normaliza(sid)["c1"] == 3
    finally:
        _limpia(sid)


def test_respeta_una_jerarquia_explicita_entre_fases():
    # "Metodologia" ya es H1 y "Resultados" su H2: el autor lo puso asi a
    # proposito, asi que no se aplana.
    sid = _sesion(_h("h1", "Metodologia", 1), _h("h2", "Resultados de la encuesta", 2))
    try:
        niveles = _normaliza(sid)
        assert niveles["h1"] == 1
        assert niveles["h2"] == 2
    finally:
        _limpia(sid)
