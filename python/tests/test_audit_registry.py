"""El registro de lo que ya se le pregunto al LLM, por contenido y por fase.

Este es el corazon del gasto. La persona pidio que los motores baratos corran
sobre todo el documento y que el LLM corra solo sobre lo nuevo; esto es lo que
hace que la segunda mitad de esa frase sea una promesa y no un gasto por cada
Ctrl+S.

LA CLAVE ES `(hash_del_texto, fase)` Y NADA MAS, Y CADA PARTE ESTA AHI POR UN
MOTIVO CONCRETO:

El TEXTO, porque la cache del LLM ya indexa por `sha256(prompt +
system_prompt)`: para el LLM la identidad de un parrafo ES su texto. Un registro
por `element_id` — que es lo que el plan daba por hecho — no calzaria con nada,
porque `element_id` es `elem_{contador}`, un indice posicional
(`docx_parser.py:1099`) que se corre en uno cada vez que Word inserta algo
arriba. Con esa clave, insertar un parrafo invalidaria el documento entero.

La FASE, porque dos parrafos con el MISMO texto en Metodo y en Resultados no son
la misma pregunta: el motor con fases mete el ambito en el prompt y devuelve
distinto. Sin la fase en la clave, registrar "Metodo" contaminaria "Resultados".

Y el texto repetido DENTRO de una fase si se guarda una sola vez: es literalmente
la misma pregunta al mismo modelo, con la misma respuesta. Dos entradas
identicas no son dos hallazgos distintos, son la misma respuesta contada dos
veces.

Y NO ESTA EL ID, Y TAMPOCO EL HASH DE ESTRUCTURA.

El plan pedia `hash_estructura` en la clave. Es sobre-invalidante: mover un
titulo en el capitulo 5 cambia el hash global y con el se cae el veredicto de
los 200 parrafos del capitulo 1, que no se movieron ni de estructura ni de
texto. La FASE resuelta ya es mas precisa que un hash global: si el titulo de un
H1 se renombra, el parrafo de abajo cambia de fase y la clave cambia sola.

LO QUE EL PLAN PEDIA Y ESTE ARCHIVO NO HACE: REUSO DE UNA SOLA VEZ.

El plan marcaba cada entrada como consumida al leerla, con el argumento de que si
no "la tabla es una copia del documento y ocupa mas que el documento". El
argumento no se sostiene: consumir la entrada no la borra, asi que la siguiente
auditoria completa la vuelve a guardar y la tabla sigue creciendo igual. Peor:
consumir en la primera lectura hace que el SEGUNDO guardado de Word que no
cambio nada vuelva a pagar el documento entero, que es exactamente lo que la
persona pidio evitar.

El limite de crecimiento se resuelve con `purgar`, que es un problema de
tamanio y se trata como un problema de tamanio.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402

from modules.audit_registry import (  # noqa: E402
    Clave,
    hay_registro,
    purgar,
    registrar,
    reusar,
)
from modules.word_refresh import hash_de_texto  # noqa: E402


@pytest.fixture(autouse=True)
def registro_limpio():
    """Cada prueba arranca vacio. Un registro module-level que sobrevive entre
    pruebas hace que un fallo se aparezca en la prueba siguiente, que es la
    forma mas cara de perder tiempo de un tester."""
    from modules import audit_registry

    audit_registry._EN_MEMORIA.clear()
    yield
    audit_registry._EN_MEMORIA.clear()


def test_un_parrafo_con_el_mismo_texto_reusa_su_resultado():
    """Es el corazon del gasto. Un parrafo cuyo texto no cambio tiene el mismo
    veredicto, y volver a pedirlo al LLM es gastar tokens por una respuesta que
    ya se tiene."""
    registrar("s1", "abc", "metodo", [{"kind": "ortografia", "message": "tilde"}])
    assert reusar("s1", "abc", "metodo") == [{"kind": "ortografia", "message": "tilde"}]


def test_un_parrafo_editado_no_reusa_nada():
    registrar("s1", "abc", "metodo", [{"kind": "ortografia"}])
    assert reusar("s1", "def", "metodo") is None


def test_el_mismo_texto_en_otra_fase_no_reusa():
    """LA PRUEBA QUE MAS IMPORTABA DEL PLAN Y QUE SE HABIA PERDIDO.

    "Se aplicaron las normas APA" en Metodo y en Resultados es el MISMO texto y
    son dos preguntas distintas: el motor con fases mete el ambito en el prompt y
    el veredicto depende de si en Resultados se esperaba discusion. Con la clave
    `(texto)` sola, registrar una contaminaba la otra y se perdia un hallazgo
    real — o se inventaba uno."""
    registrar("s1", "abc", "metodo", [{"kind": "cita", "message": "falta la pagina"}])
    assert reusar("s1", "abc", "resultados") is None
    assert reusar("s1", "abc", "metodo") is not None


def test_la_estructura_invalida_lo_de_abajo():
    """Insertar un H1 en Word cambia la fase de todo lo que esta debajo, aunque
    el texto no se haya movido, y por eso la fase esta en la clave. La version
    de este test usa `hash_estructura`, que sobre-invalida: el plan la pedia y
    no hace falta."""
    registrar("s1", "abc", "antecedentes", [{"kind": "x"}])
    # Se metio un capitulo antes: lo de abajo ahora es otra fase.
    assert reusar("s1", "abc", "metodo") is None


def test_un_parrafo_sin_hallazgos_tambien_se_registra():
    """El caso que hace que la registry sea util y no solo un adorno.

    Si solo se guardaran los parrafos CON hallazgos, cada guardado de Word
    volveria a preguntar al LLM por todos los parrafos limpios —que son la
    mayoria— y la regla de "solo lo nuevo" no cortaria nunca. Un texto limpio es
    una RESPUESTA, y la respuesta mas cara de todas: la que no tiene nada que
    decir."""
    registrar("s1", "abc", "metodo", [])
    assert reusar("s1", "abc", "metodo") == []


def test_UN_ERROR_NUNCA_ES_UN_HALLAZGO_QUE_LLAMA_AL_LLM():
    """Un LLM caido, un timeout, un 429. Si el fallo se guardara como "este
    parrafo esta limpio", el documento quedaria con un error sellado en el
    registro y la reauditoria automatica lo trataria como limpio para siempre.
    Un error tiene que ser `None`, nunca `[]`."""
    registrar("s1", "abc", "metodo", None)
    assert reusar("s1", "abc", "metodo") is None
    assert not hay_registro("s1", "abc", "metodo")


def test_EL_REGISTRO_SOBREVIVE_A_MUCHAS_LECTURAS():
    """DONDE EL PLAN SE EQUIVOCO.

    El plan marcaba cada entrada como consumida al leerla, "para que la tabla no
    crezca sin limite". Consumir no borra, asi que la tabla seguiria creciendo
    igual, y el efecto real era otro: el SEGUNDO guardado de Word que no cambia
    nada volveria a pagar el documento entero. Que es justo lo que la persona
    pidio evitar.

    Un registro que se gasta al leerlo no evita el gasto: lo que lo evita es que
    exista una segunda vez."""
    registrar("s1", "abc", "metodo", [{"kind": "x"}])
    assert reusar("s1", "abc", "metodo") is not None
    assert reusar("s1", "abc", "metodo") is not None
    assert reusar("s1", "abc", "metodo") is not None


def test_EL_REGISTRO_NO_SALTA_DE_UN_CAPITULO_A_OTRO():
    """`session_id` esta en la clave. Dos documentos en la misma app son dos
    documentos: un texto igual en la tesis de otra persona es otra pregunta, y
    reusarla es devolverle a alguien los hallazgos de un texto que le
    pertenece a otro."""
    registrar("s1", "abc", "metodo", [{"kind": "de s1"}])
    assert reusar("s2", "abc", "metodo") is None


def test_una_auditoria_reemplaza_a_la_anterior_no_la_acumula():
    """Si un parrafo se reaudita y ahora tiene menos hallazgos, el registro tiene
    que reflejar lo NUEVO. Acumular deja hallazgos de una version que ya no
    existe, y esos hallazgos son invisibles e intocables: nadie los puede
    aceptar ni ver, pero cuentan como pendientes en el rail."""
    registrar("s1", "abc", "metodo", [{"kind": "a"}, {"kind": "b"}])
    registrar("s1", "abc", "metodo", [{"kind": "a"}])
    assert reusar("s1", "abc", "metodo") == [{"kind": "a"}]


def test_purgar_deja_solo_lo_que_sigue_en_el_documento():
    """El limite de crecimiento, resuelto como lo que es: un problema de
    tamanio. Un parrafo que se borro de Word no se va a volver a preguntar, y su
    veredicto ocupa lugar para siempre si nadie lo saca."""
    registrar("s1", "abc", "metodo", [{"kind": "x"}])
    registrar("s1", "def", "metodo", [{"kind": "y"}])
    registrar("s2", "abc", "metodo", [{"kind": "z"}])

    purgar("s1", vivos={"def"})

    assert reusar("s1", "abc", "metodo") is None
    assert reusar("s1", "def", "metodo") is not None
    # Y no toca otras sesiones.
    assert reusar("s2", "abc", "metodo") is not None


def test_purgar_no_toca_lo_que_misma_fase_tiene_otro_texto():
    """`vivos` es un conjunto de hashes, no de claves. Dos textos en la misma fase
    se borran por separado, y un purgado que limpiera la fase entera dejaria sin
    registro a un texto que sigue ahi — pagando de nuevo lo ya pagado."""
    registrar("s1", "abc", "metodo", [{"kind": "x"}])
    registrar("s1", "def", "metodo", [{"kind": "y"}])
    purgar("s1", vivos={"abc"})
    assert reusar("s1", "def", "metodo") is None
    assert reusar("s1", "abc", "metodo") is not None


def test_el_hash_del_texto_registrado_es_el_contrato_con_el_diff():
    """El registro se llena con `hash_de_texto` del modulo de refresco, no con
    uno propio. Si los dos recortaran distinto, un parrafo "igual" se volveria
    a pagar en cada guardado, y el fallo no se veria en ninguna parte: solo en
    la factura y en el rate limit."""
    from modules import audit_registry, word_refresh

    audit_registry.registrar("s1", word_refresh.hash_de_texto("  Uno  "), "metodo", [{"kind": "x"}])
    assert reusar("s1", hash_de_texto("Uno"), "metodo") is not None


def test_una_clave_se_puede_construir_sin_texto():
    """Los llamadores de la UI no tienen el texto, tienen el hash que ya les dio
    el diff. Que la clave se pueda armar de las dos formas evita que alguien
    hashee dos veces y de dos maneras distintas."""
    c1: Clave = ("s1", hash_de_texto("Uno"), "metodo")
    registrar(c1[0], c1[1], c1[2], [{"kind": "x"}])
    assert reusar(c1[0], c1[1], c1[2]) is not None


def test_registrar_sin_sesion_no_hace_nada_y_no_rompe():
    """El watcher puede disparar sin sesion. Un registro global compartido
    entre sesiones sin `session_id` devolveria los hallazgos de un documento a
    otro, que es peor que no devolver nada."""
    registrar("", "abc", "metodo", [{"kind": "x"}])
    assert reusar("", "abc", "metodo") is None
    assert reusar("s1", "abc", "metodo") is None
