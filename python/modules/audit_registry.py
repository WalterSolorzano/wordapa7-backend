"""Lo que ya se le pregunto al LLM, por contenido y por fase.

Este modulo es el corazon del gasto. La persona pidio que los motores baratos
corran sobre todo el documento y que el LLM corra solo sobre lo nuevo; esto es lo
que hace que la segunda mitad de esa frase sea una promesa y no un gasto por cada
Ctrl+S.

LA CLAVE ES `(session_id, hash_del_texto, fase)` Y CADA PARTE ESTA AHI POR UN
MOTIVO CONCRETO:

El TEXTO, porque la cache del LLM ya indexa por `sha256(prompt +
system_prompt)` (`ai_client.py`): para el LLM la identidad de un parrafo ES su
texto. Un registro por `element_id` —que es lo que el plan daba por hecho— no
calzaria con nada, porque `element_id` es `elem_{contador}`, un indice posicional
(`docx_parser.py:1099`) que se corre en uno cada vez que Word inserta algo
arriba. Con esa clave, insertar un parrafo invalidaria el documento entero.

La FASE, porque dos parrafos con el MISMO texto en Metodo y en Resultados no son
la misma pregunta: los motores con ambito meten la fase en el prompt y el
veredicto depende de si en Resultados se esperaba discusion o descripcion de
muestras. Sin la fase en la clave, registrar "Metodo" contaminaba "Resultados" y
se perdia un hallazgo real.

Y la SESION, porque dos documentos en la misma app son dos documentos: devolverle
a alguien los hallazgos de un texto que le pertenece a otra persona es peor que
no devolverle nada.

LO QUE NO ESTA EN LA CLAVE, Y POR QUE

El `element_id`, ya explicado. Y el `hash_estructura`, que el plan pedia y que
SOBRE-invalida: mover un titulo en el capitulo 5 cambia el hash global y con el
se cae el veredicto de los 200 parrafos del capitulo 1, que no se movieron ni de
estructura ni de texto. La FASE resuelta ya es mas precisa que un hash global:
si el titulo de un H1 se renombra, el parrafo de abajo cambia de fase y la clave
cambia sola; si el H1 se movio de lugar sin cambiar de nombre, la fase del
parrafo tampoco cambia y su veredicto sigue valiendo.

UN HALLAZGO NUNCA ES UN ERROR, Y UN ERROR NUNCA ES "LIMPIO"

`registrar` recibe `None` cuando el LLM fallo. Un `[]` significa "el LLM
respondio y no encontro nada", que es la respuesta mas cara de todas: es la que
cuesta una llamada entera y no tiene nada que decir. Si un timeout se guardara
como `[]`, el parrafo quedaria marcado como limpio para siempre y la reauditoria
automatica trataria un fallo de red como un veredicto editorial. Por eso
`None` no se guarda, y por eso hay una prueba que lo fija.

Y LO QUE EL PLAN PEDIA Y ESTE MODULO NO HACE: REUSO DE UNA SOLA VEZ

El plan marcaba cada entrada como consumida al leerla, con el argumento de que si
no "la tabla es una copia del documento y ocupa mas que el documento". El
argumento no se sostiene: consumir una entrada no la borra, asi que la siguiente
auditoria completa la vuelve a guardar y la tabla sigue creciendo exactamente
igual. El efecto real era el contrario del buscado: el SEGUNDO guardado de Word
que no cambia nada volvia a pagar el documento entero, que es justo lo que la
persona pidio evitar.

Un registro que se gasta al leerlo no evita el gasto: lo que lo evita es que exista
una segunda vez. El limite de crecimiento se resuelve con `purgar`, que es un
problema de tamanio y se trata como un problema de tamanio.

DEDONDE VIVE, Y POR QUE EN MEMORIA Y NO EN UN ARCHIVO

En memoria, a proposito. El registro es una cache, y una cache que sobrevive a un
cierre de app sirve para poco: si la sesion se perdio, el documento tambien, y el
LLLM vuelve a tener los contexto completo. Persistirlo significaria escribir un
archivo mas, invalidarlo cuando alguien cambia de documento y decidir que pasa
con las sesiones viejas. El costo de perderlo es un lote de respuestas
recalculadas al abrir de nuevo; el costo de persistirlo es una clase entera de
fallos silenciosos. Si alguna vez hace falta, la que va a doler es la de perder
gasto, no la de disco lleno.
"""

from typing import Any, Dict, List, Optional, Set, Tuple

# (session_id, hash_del_texto, fase)
Clave = Tuple[str, str, str]

# Aislado en su propio nombre para que las pruebas puedan vaciarlo sin tocar la
# API del modulo. Vaciar la tabla es una operacion de PRUEBA, no de negocio.
_EN_MEMORIA: Dict[Clave, List[Dict[str, Any]]] = {}


def registrar(
    session_id: str,
    hash_texto: str,
    fase: str,
    hallazgos: Optional[List[Dict[str, Any]]],
) -> None:
    """Guarda el veredicto de un texto en una fase.

    `session_id` va PRIMERO y SIN valor por defecto a proposito: es la parte de la
    clave que, si se olvida, no da error —devuelve los hallazgos de un documento a
    otro— sino que se comporta bien y por eso no se nota. Un default en `""` la
    haria opcional de verdad, y lo opcional en una clave es el error que no se ve.

    `hallazgos = None` significa "el LLM no respondio" y NO SE GUARDA. Un `[]`
    significa "respondio y no encontro nada", y ese si se guarda: es la respuesta
    que evita volver a pagar.

    Sin `session_id` no se guarda nada. El watcher puede disparar sin sesion, y
    un registro global devolveria los hallazgos de un documento a otro.
    """
    if not session_id or not hash_texto or hallazgos is None:
        return
    # Reemplaza, no acumula. Un texto reauditado que ahora tiene menos hallazgos
    # tiene MENOS hallazgos: acumular deja veredictos de una version que ya no
    # existe, y esos son invisibles e intocables — nadie los puede aceptar ni ver,
    # pero cuentan como pendientes.
    _EN_MEMORIA[(session_id, hash_texto, fase)] = list(hallazgos)


def reusar(session_id: str, hash_texto: str, fase: str) -> Optional[List[Dict[str, Any]]]:
    """El veredicto guardado, o `None` si hay que preguntarle al LLM.

    `None` y `[]` se distinguen a proposito: `None` es "falta", `[]` es "esta
    limpio". Quien llama necesita saber cual de los dos es, porque solo uno evita
    la llamada.
    """
    if not session_id or not hash_texto:
        return None
    guardado = _EN_MEMORIA.get((session_id, hash_texto, fase))
    if guardado is None:
        return None
    # Copia: el llamador puede mutar lo que recibe (filtrar, reordenar) y si le
    # dijeramos la lista real, el registro mutaria con el sin que nadie lo pidiera.
    return [dict(h) for h in guardado]


def hay_registro(session_id: str, hash_texto: str, fase: str) -> bool:
    """Si esta la respuesta, sin copiarla. Para cuando solo importa el si o el no."""
    if not session_id or not hash_texto:
        return False
    return (session_id, hash_texto, fase) in _EN_MEMORIA


def purgar(session_id: str, vivos: Set[str]) -> int:
    """Saca las entradas cuyo texto ya no esta en el documento. Devuelve cuantas.

    `vivos` es un conjunto de HASHES, no de claves: dos textos en la misma fase se
    borran por separado, y un purgado que limpiara la fase entera dejaria sin
    registro a un texto que sigue ahi — pagando de nuevo lo ya pagado.

    No toca otras sesiones.
    """
    if not session_id:
        return 0
    a_borrar = [k for k in _EN_MEMORIA if k[0] == session_id and k[1] not in vivos]
    for k in a_borrar:
        del _EN_MEMORIA[k]
    return len(a_borrar)


def limpiar_sesion(session_id: str) -> None:
    """Todo lo de una sesion, sin tocar las demas.

    Para cuando la sesion se cierra o cambia de documento: un veredicto de una
    tesis no puede sobrevivir a que la app abra otra.
    """
    if not session_id:
        return
    for k in [k for k in _EN_MEMORIA if k[0] == session_id]:
        del _EN_MEMORIA[k]
