"""El veredicto del corrector se cachea por ITEM, no por lote.

`refine_with_llm` juntaba hasta sesenta hallazgos en UN prompt. La respuesta que
pide es por item (`[{"i":int,"keep":bool,"suggestion":str|null}]`), asi que la
respuesta del item siete no depende de la del item ocho: el lote es una
optimizacion de rate limit que destruye la granularidad de la cache. Con el
lote entero como clave, doce guardados de Word con un solo parrafo con una tilde
perdida se pagan doce veces completas.

Estas pruebas meten el cliente del router por parametro (`_router`) para no tocar
la red, y vacian `audit_registry._EN_MEMORIA` entre caso y caso porque el
registro es de modulo y vive entre pruebas.

El doble devuelve el CONTENIDO, no una respuesta HTTP: antes el motor pegaba
directo a NIM con `requests.post` y habia que fabricar un objeto con
`raise_for_status` y `json()`. Ahora pasa por `execute_with_specialty`, que ya
desenreda el sobre, asi que el doble solo tiene que devolver la cadena.
"""

import asyncio
import json as _json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models import ElementModel, ElementType  # noqa: E402
from modules import audit_registry  # noqa: E402
from modules import proactive_auditor as pa  # noqa: E402

# Cuatro palabras sin tilde, en un solo parrafo: cada una es un hallazgo
# distinto (texto marcado distinto, contexto distinto) y por lo tanto una
# pregunta distinta al corrector.
_PALABRAS = ["deberia", "tambien", "segun", "ademas"]
TEXTO = " ".join(_PALABRAS)


def _cache_limpia() -> None:
    audit_registry._EN_MEMORIA.clear()


def _post_que_responde(llamadas, contenido):
    """Un cliente del router falso que cuenta cuantas veces lo llamaron.

    Registra el PROMPT, que es lo que viaja: antes se registraba el `json` de la
    peticion y habia que abrir `messages[0]["content"]` para ver los items. El
    motor ya no arma el sobre — eso es del router — asi que el prompt es el
    item.
    """

    async def router(prompt, **kw):
        llamadas.append(prompt)
        return contenido

    return router


class _Eco:
    """Responde un veredicto por cada item del lote, leyendo lo que se le pidio.

    Sirve para probar el tope de coste: hay que poder ver CUANTOS items viajar
    en el prompt, y eso solo se ve mirando el prompt que se mando.
    """

    def __init__(self, llamadas):
        self.llamadas = llamadas

    async def __call__(self, prompt, **kw):
        self.llamadas.append(prompt)
        items = _items_del_prompt(prompt)
        return _json.dumps(
            [{"i": it["i"], "keep": True, "suggestion": None} for it in items]
        )


def _elementos():
    return [ElementModel(id="e1", type=ElementType.PARAGRAPH, text=TEXTO)]


def _hallazgos(n=1, phase="global"):
    out = []
    for i in range(n):
        palabra = _PALABRAS[i % len(_PALABRAS)]
        start = TEXTO.index(palabra)
        out.append({
            "element_id": "e1",
            "start": start,
            "end": start + len(palabra),
            "excerpt": TEXTO[start:start + len(palabra) + 4],
            "kind": "ortografia",
            "severity": "error",
            "message": "Falta tilde",
            "source": "local",
            "phase": phase,
            "read_only": False,
        })
    return out


def _items_del_prompt(prompt):
    return _json.loads(prompt.split("Items: ", 1)[1])


def _refinar(*args, **kw):
    """`refine_with_llm` es `async` desde que paso por el router, y estas
    pruebas son sincronas. El envoltorio es el unico lugar donde se nota."""
    return asyncio.run(pa.refine_with_llm(*args, **kw))


# ------------------------------------------------------------------ el dinero
def test_una_consulta_ya_respondida_no_se_vuelve_a_preguntar():
    """EL DINERO. Doce guardados de Word y un solo parrafo con una tilde perdida.

    Con el lote entero como clave, los doce se pagan completos. Con la clave por
    item, el primero se paga y los once son un acierto de cache.
    """
    llamadas = []
    post = _post_que_responde(llamadas, '[{"i":0,"keep":true,"suggestion":"tilde"}]')

    _cache_limpia()
    _refinar(_hallazgos(1), _elementos(), "k", session_id="s1", _router=post)
    _refinar(_hallazgos(1), _elementos(), "k", session_id="s1", _router=post)

    assert len(llamadas) == 1


def test_una_tilde_igual_en_otra_fase_si_se_pregunta():
    """La palabra repetida en Metodo y en Resultados es la misma palabra y son dos
    preguntas distintas: los motores con ambito meten la fase en el prompt. Sin la
    fase en la clave, una contamina a la otra.
    """
    llamadas = []
    post = _post_que_responde(llamadas, '[{"i":0,"keep":true,"suggestion":"tilde"}]')

    _cache_limpia()
    _refinar(_hallazgos(1, phase="metodo"), _elementos(), "k",
       session_id="s1", _router=post)
    _refinar(_hallazgos(1, phase="resultados"), _elementos(), "k",
       session_id="s1", _router=post)

    assert len(llamadas) == 2


def test_un_guardado_que_agrega_un_hallazgo_no_repaga_los_anteriores():
    """La granularidad por item, probada con el caso que la justifica.

    Word inserta un parrafo arriba, aparece un hallazgo nuevo, y el motor entero
    se vuelve a correr. Con el lote entero como clave se pagan los cuatro
    veredictos otra vez; con la clave por item se paga UNO, el que no se sabia.
    """
    llamadas = []
    post = _Eco(llamadas)

    _cache_limpia()
    _refinar(_hallazgos(3), _elementos(), "k", session_id="s1", _router=post)
    assert len(llamadas) == 1
    assert len(audit_registry._EN_MEMORIA) == 3

    _refinar(_hallazgos(4), _elementos(), "k", session_id="s1", _router=post)

    assert len(llamadas) == 2
    # La segunda llamada viaja SOLO con el hallazgo nuevo: el `i` del sobre es la
    # posicion dentro del lote, no dentro de la lista de dudosos.
    assert [it["match"] for it in _items_del_prompt(llamadas[1])] == ["ademas"]


# ------------------------------------------------------------- lo que no cambia
def test_sin_sesion_no_hay_cache():
    """`session_id` vacio tiene que ser EXACTAMENTE lo de hoy.

    El resto de los llamados del repo no pasan sesion, y con registro global un
    documento le devolveria los hallazgos de otro.
    """
    llamadas = []
    post = _post_que_responde(llamadas, '[{"i":0,"keep":true,"suggestion":null}]')

    _cache_limpia()
    _refinar(_hallazgos(1), _elementos(), "k", _router=post)
    _refinar(_hallazgos(1), _elementos(), "k", _router=post)

    assert len(llamadas) == 2
    assert audit_registry._EN_MEMORIA == {}


def test_sin_sesion_todo_se_pregunta_en_un_solo_lote():
    """Y en UN solo lote, como siempre: el tope de 60 items del prompt no cambia."""
    llamadas = []
    post = _Eco(llamadas)

    _cache_limpia()
    out, usado = _refinar(_hallazgos(4), _elementos(), "k", _router=post)

    assert len(llamadas) == 1
    assert len(_items_del_prompt(llamadas[0])) == 4
    assert usado is True
    assert len(out) == 4


def test_un_veredicto_ausente_no_es_un_veredicto_negativo():
    """El corrector no menciono el item. Eso no es "esta mal".

    Un veredicto ausente deja el hallazgo exactamente como estaba: un corrector
    que no hablo no puede borrar lo que el motor local si vio.
    """
    llamadas = []
    post = _post_que_responde(llamadas, "[]")

    _cache_limpia()
    out, usado = _refinar(_hallazgos(1), _elementos(), "k",
       session_id="s1", _router=post)

    assert len(out) == 1
    assert out[0]["kind"] == "ortografia"
    assert usado is True
    # Y tampoco se registro: sin veredicto no hay nada que reusar.
    assert audit_registry._EN_MEMORIA == {}


def test_un_veredicto_cacheado_tambien_aplica_la_sugerencia():
    """La cache no puede dar un resultado distinto al de la primera vez."""
    llamadas = []
    post = _post_que_responde(llamadas, '[{"i":0,"keep":false,"suggestion":"debería"}]')

    _cache_limpia()
    primera, _ = _refinar(_hallazgos(1), _elementos(), "k",
       session_id="s1", _router=post)
    segunda, _ = _refinar(_hallazgos(1), _elementos(), "k",
       session_id="s1", _router=post)

    assert len(llamadas) == 1
    assert primera[0]["suggestion"] == "debería"
    assert primera[0]["source"] == "llm"
    # El original no se muta al aplicar una sugerencia.
    assert "suggestion" not in _hallazgos(1)[0]
    assert segunda == primera


def test_un_falso_positivo_descartado_tambien_se_descarta_desde_la_cache():
    """Y al reves: lo que se borro, sigue borrado."""
    llamadas = []
    post = _post_que_responde(llamadas, '[{"i":0,"keep":false,"suggestion":null}]')

    _cache_limpia()
    primera, _ = _refinar(_hallazgos(1), _elementos(), "k",
       session_id="s1", _router=post)
    segunda, _ = _refinar(_hallazgos(1), _elementos(), "k",
       session_id="s1", _router=post)

    assert len(llamadas) == 1
    assert primera == []
    assert segunda == []


# ----------------------------------------------- un LLM que no sabe responder
def test_un_llm_que_se_corta_a_la_mitad_no_borra_lo_ya_respondido():
    """Review Focus #2. La respuesta vieja tiene que sobrevivir intacta.

    Un sobre cortado a la mitad no es JSON: se devuelve `findings` intacto y
    `False`, y el registro queda como estaba. El item que ya estaba resuelto no
    se vuelve a preguntar, y el que faltaba no se marca como limpio.
    """
    llamadas = []
    bueno = _post_que_responde(llamadas, '[{"i":0,"keep":true,"suggestion":null}]')
    _cache_limpia()
    _refinar(_hallazgos(2), _elementos(), "k", session_id="s1", _router=bueno)
    assert len(llamadas) == 1

    # Un sobre que cierra el corchete pero no es JSON: el parseo falla.
    cortado = _post_que_responde(llamadas, '[{"i": 0, "keep": tru}]')
    out, usado = _refinar(_hallazgos(2), _elementos(), "k",
       session_id="s1", _router=cortado)

    assert usado is False
    assert out == _hallazgos(2)
    assert len(llamadas) == 2                      # solo se pregunto el item nuevo
    assert len(audit_registry._EN_MEMORIA) == 1    # y el viejo sigue en su lugar

    # Y la tercera vez, el item viejo sigue sin preguntar.
    _refinar(_hallazgos(2), _elementos(), "k", session_id="s1", _router=cortado)
    assert len(llamadas) == 3


def test_un_llm_que_no_devuelve_json_no_toca_el_registro():
    """Texto que no es un sobre. Ni veredicto nuevo ni registro modificado."""
    llamadas = []
    post = _post_que_responde(llamadas, "Perdon, hoy no puedo verificar eso.")

    _cache_limpia()
    out, _ = _refinar(_hallazgos(1), _elementos(), "k",
       session_id="s1", _router=post)

    assert out == _hallazgos(1)
    assert audit_registry._EN_MEMORIA == {}


# ------------------------------------------------------------------- el tope
def test_el_tope_de_lote_sigue_siendo_de_60():
    """El tope duro de coste no se negocia, pero los que no entran NO se registran.

    Un item que no viajo en el prompt no tiene veredicto, y un veredicto que no
    existe no se guarda: si se guardara, el item 61 nunca volveria a preguntarse.
    """
    base = _hallazgos(1)[0]
    muchos = []
    for i in range(61):
        f = dict(base)
        f["excerpt"] = f"{i:03d} {TEXTO}"   # contexto propio: 61 preguntas distintas
        muchos.append(f)

    llamadas = []
    post = _Eco(llamadas)
    _cache_limpia()
    out, _ = _refinar(muchos, _elementos(), "k", session_id="s1", _router=post)

    assert len(_items_del_prompt(llamadas[0])) == 60
    assert len(out) == 61                       # el que no viajo se queda, como siempre
    assert len(audit_registry._EN_MEMORIA) == 60
