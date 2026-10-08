"""La cache de LLM: una vez por lote y una escritura que no se trunca.

Hoy `_load_cache()` y `_save_cache()` se llaman DENTRO de cada
`execute_with_speciality` (`ai_client.py:173, 239, 269`). Un lote de cuarenta
parrafos lee el JSON cuarenta veces y lo reescribe cuarenta veces, y cada
reescritura abre el archivo en modo `"w"`: eso TRUNCA.

Y aqui está el fallo que de verdad cuesta plata. Si el proceso se corta en
medio de un `json.dump` —un Ctrl+C, un cierre de la app, un portatil que se
duerme— el archivo queda en un JSON a medias. La proxima vez, `_load_cache()`
recibe la excepcion y `return {}`: **toda la cache se pierde en silencio**. No
hay error, no hay aviso, no hay nada. Y la siguiente reauditoria vuelve a pagar
el documento entero, con cinco proveedores de free tier y 10-30 RPM.

Que no haya error es justamente lo que lo hace caro. Un error de cache se
diagnostica; una cache que se vacia sola se descubre en la factura.

LAS TRES PROPIEDADES, Y POR QUE CADA UNA TIENE SU TEST:

  - La escritura es ATOMICA: se escribe a un lado y se mueve con `os.replace`.
    O el archivo viejo esta entero, o el nuevo esta entero. Nunca esta a medias.
  - El archivo se lee UNA VEZ, no una por llamada. Cuarenta lecturas del mismo
    JSON no son un problema de velocidad, son una forma de confirmar que el
    archivo no cambio forty veces, que es justo lo que no se quiere.
  - Un LOTE escribe UNA vez. Y un lote es explicito (`lote_cache()`), no un
    temporizador magico: un debounce que depende del reloj decide cuando
    escribir por su cuenta, y la forma de que se pierda una escritura es que
    nadie se acuerde de la ultima.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402

from modules import ai_client  # noqa: E402


@pytest.fixture
def cache_limpia(tmp_path, monkeypatch):
    """Cada prueba con su propio archivo de cache y su memoria vacia.

    La memoria vive a nivel de modulo, asi que sin esto una prueba ve lo que
    escribio la anterior: el fallo aparece en la prueba siguiente, que es la
    forma mas cara de perder el tiempo de un tester.
    """
    archivo = tmp_path / "cache.json"
    monkeypatch.setattr(ai_client, "CACHE_FILE_PATH", archivo)
    _vaciar_memoria()
    yield archivo
    _vaciar_memoria()


def _vaciar_memoria():
    """Vacia lo interno de la cache sin tocar su API. Se hace por `_cache` y por
    los banderas, y no por la via publica, porque la via publica justamente
    DISPARA la carga desde el archivo: usarla para limpiar ensucia la prueba con
    el disco."""
    ai_client._cache.clear()
    ai_client._cache_cargada = False
    ai_client._cache_sucia = False
    ai_client._profundidad_de_lote = 0


def test_una_escritura_a_medias_NO_tumba_la_cache_anterior(tmp_path, monkeypatch):
    """EL FALLO CARO. Sin escritura atomica, un `json.dump` interrupted deja un
    JSON invalido, `_load_cache` lo come con un `except: return {}` y toda la
    cache desaparece sin decir nada. La reauditoria siguiente paga el documento
    entero y nadie sabe por que."""
    archivo = tmp_path / "cache.json"
    monkeypatch.setattr(ai_client, "CACHE_FILE_PATH", archivo)
    _vaciar_memoria()

    ai_client._save_cache({"bueno": "el unico que importa"})

    # Se corta el proceso justo a mitad de la escritura siguiente.
    def dump_que_revienta(*a, **k):
        raise KeyboardInterrupt("se corto la app")

    monkeypatch.setattr(ai_client.json, "dump", dump_que_revienta)
    with pytest.raises(KeyboardInterrupt):
        ai_client._save_cache({"malo": "este nunca debio quedar"})

    # El archivo anterior sigue entero y legible.
    assert json.loads(archivo.read_text(encoding="utf-8")) == {"bueno": "el unico que importa"}
    assert ai_client._load_cache() == {"bueno": "el unico que importa"}


def test_la_escritura_es_atomica_y_no_deja_archivos_basura(tmp_path, monkeypatch):
    """Se escribe a un lado y se mueve con `os.replace`. Si se escribiera
    directo, el archivo real estaria truncado durante toda la escritura, y
    cualquier lector en ese instante —otra pestana, otro proceso— leeria
    basura. Ademas no puede quedar un `.tmp` sin usar: si el proceso muere
    entre el dump y el replace, ese archivo es la unica copia de la respuesta y
    se va a `/tmp` con el sistema."""
    archivo = tmp_path / "cache.json"
    monkeypatch.setattr(ai_client, "CACHE_FILE_PATH", archivo)
    _vaciar_memoria()

    ai_client._save_cache({"a": "1"})
    assert json.loads(archivo.read_text(encoding="utf-8")) == {"a": "1"}
    assert list(tmp_path.iterdir()) == [archivo]


def test_el_archivo_se_lee_una_vez_y_no_una_por_llamada(tmp_path, monkeypatch):
    """Cuarenta parrafos en un lote son cuarenta llamadas. Leer el mismo JSON
    cuarenta veces no cuesta tiempo: cuesta la opcion de que alguien lo cambie
    entre medio, que es exactamente lo que uno no quiere de una cache."""
    archivo = tmp_path / "cache.json"
    archivo.write_text(json.dumps({"x": "1"}), encoding="utf-8")
    monkeypatch.setattr(ai_client, "CACHE_FILE_PATH", archivo)
    _vaciar_memoria()

    lecturas = {"n": 0}
    real_open = open

    def open_que_cuenta(*a, **k):
        if a and a[0] == archivo:
            lecturas["n"] += 1
        return real_open(*a, **k)

    monkeypatch.setattr("builtins.open", open_que_cuenta)

    for _ in range(40):
        assert ai_client._load_cache() == {"x": "1"}
    assert lecturas["n"] == 1


def test_un_lote_escribe_una_sola_vez(tmp_path, monkeypatch):
    """LA REGLA DEL PLAN, y necesita una senal explicita para existir. Un debounce
    que depende del reloj decide por su cuenta cuando volcar, y la forma de que
    se pierda la ultima escritura es que nadie se acuerde de la ultima."""
    archivo = tmp_path / "cache.json"
    monkeypatch.setattr(ai_client, "CACHE_FILE_PATH", archivo)
    _vaciar_memoria()

    escrituras = {"n": 0}
    real_replace = ai_client.os.replace

    def replace_que_cuenta(*a, **k):
        escrituras["n"] += 1
        return real_replace(*a, **k)

    monkeypatch.setattr(ai_client.os, "replace", replace_que_cuenta)

    with ai_client.lote_cache():
        for i in range(40):
            ai_client._save_cache({f"clave_{i}": str(i)})
        # Adentro del lote no se toca el disco: todavia no.
        assert escrituras["n"] == 0

    assert escrituras["n"] == 1
    guardado = json.loads(archivo.read_text(encoding="utf-8"))
    assert len(guardado) == 40


def test_un_lote_anidado_sigue_siendo_una_sola_escritura(tmp_path, monkeypatch):
    """Si un motor abre un lote y llama a otro que abre el suyo, el interior no
    puede volcar: seria la mitad del trabajo por la mitad del beneficio. El
    volteo ocurre cuando el lote de AFUERA cierra, que es el unico momento en
    que nadie puede volver a necesitar la cache en memoria."""
    archivo = tmp_path / "cache.json"
    monkeypatch.setattr(ai_client, "CACHE_FILE_PATH", archivo)
    _vaciar_memoria()

    escrituras = {"n": 0}
    real_replace = ai_client.os.replace
    monkeypatch.setattr(
        ai_client.os, "replace",
        lambda *a, **k: (escrituras.__setitem__("n", escrituras["n"] + 1), real_replace(*a, **k))[1],
    )

    with ai_client.lote_cache():
        ai_client._save_cache({"a": "1"})
        with ai_client.lote_cache():
            ai_client._save_cache({"b": "2"})
        assert escrituras["n"] == 0
    assert escrituras["n"] == 1
    assert json.loads(archivo.read_text(encoding="utf-8")) == {"a": "1", "b": "2"}


def test_un_lote_que_revienta_aun_asienta_lo_que_alcanzo(tmp_path, monkeypatch):
    """El LLM tira excepcion a mitad de lote, tres veces de cuarenta. Las treinta
    y siete respuestas que SI salieron valen plata pagada, y si el volteo se
    pierde por el `raise`, la proxima vez se vuelven a pedir. Por eso el volteo
    va en un `finally`."""
    archivo = tmp_path / "cache.json"
    monkeypatch.setattr(ai_client, "CACHE_FILE_PATH", archivo)
    _vaciar_memoria()

    with pytest.raises(RuntimeError):
        with ai_client.lote_cache():
            ai_client._save_cache({"salio": "esta respuesta se pago"})
            raise RuntimeError("el LLM cayo")

    assert json.loads(archivo.read_text(encoding="utf-8")) == {"salio": "esta respuesta se pago"}


def test_lo_que_se_marca_para_escribir_llega_efectivamente_al_archivo(cache_limpia):
    """`_save_cache` tiene que dejar el estado durable, no solo en memoria: si
    alguien reinicia la app, lo que se pago tiene que seguir ahi. El modo en
    memoria se redobla al cerrar el lote, no antes de cada llamada."""
    ai_client._save_cache({"a": "1"})
    assert json.loads(cache_limpia.read_text(encoding="utf-8")) == {"a": "1"}


def test_el_poda_ocurre_EN_SITIO_y_no_solo_en_el_archivo(tmp_path, monkeypatch):
    """La poda de 5000 entradas reasignaba `cache = dict(...)`, o sea que el
    diccionario en memoria seguia creciendo: el archivo bajaba de 5000 y la
    memoria de arriba no. Con la memoria compartida, la poda tiene que recortar
    la MISMA estructura que se escribe, o se vuelve a crecer en el proximo
    guardado."""
    archivo = tmp_path / "cache.json"
    monkeypatch.setattr(ai_client, "CACHE_FILE_PATH", archivo)
    _vaciar_memoria()

    assert ai_client._CACHE_MAX_ENTRADAS == 5000
    memoria = ai_client._cache_en_memoria()
    for i in range(5100):
        memoria[f"k{i}"] = "v"
    ai_client._save_cache(memoria)

    assert len(ai_client._cache_en_memoria()) == 5000
    assert len(json.loads(archivo.read_text(encoding="utf-8"))) == 5000


def test_lo_que_escribe_una_parte_no_borra_lo_que_escribio_otra(cache_limpia):
    """`llm_classifier` usa el patron "cargar, mutar, guardar" con SU propia
    clave por elemento (`_classification_cache_key`), sobre el MISMO archivo que
    las respuestas de los prompts. Si `_save_cache` remplazara el archivo con el
    diccionario que le pasaron, cada clasificacion borraria las respuestas de
    los motores: dos capas de cache sobre un archivo, una pisando a la otra."""
    ai_client._save_cache({"respuesta_de_prompt": "la del LLM"})
    memoria = ai_client._load_cache()
    memoria["clasificacion_elem_7"] = "heading"
    ai_client._save_cache(memoria)

    guardado = json.loads(cache_limpia.read_text(encoding="utf-8"))
    assert guardado["respuesta_de_prompt"] == "la del LLM"
    assert guardado["clasificacion_elem_7"] == "heading"


def test_un_archivo_que_no_se_puede_leer_no_tira_la_app(cache_limpia):
    """Un JSON a medias de una version anterior, o un archivo escrito por otro.
    La cache es una cache: si no se puede leer, se sigue working sin ella. Pero
    el archivo ilegible NO se pisa con `{}` al primer guardado, porque eso borra
    lo que hubiera y no hacia falta perderlo: se reintenta leer en el proximo
    arranque."""
    cache_limpia.write_text("{esto no es json", encoding="utf-8")
    _vaciar_memoria()

    assert ai_client._load_cache() == {}
    # Y guardar funciona igual, en vez de fallar con la excepcion del JSON.
    ai_client._save_cache({"a": "1"})
    assert json.loads(cache_limpia.read_text(encoding="utf-8")) == {"a": "1"}


def test_EL_DECORADOR_AGRUPA_UN_LOTE_DE_VERDAD(cache_limpia):
    """La prueba de que `en_lote` no es decoracion. Sin ella, `lote_cache` y
    `en_lote` son dos nombres para una misma intención: podrian no agrupar nada y
    los tres lotes reales seguirian reescribiendo el archivo una vez por elemento.

    Y por eso existe el decorador y no un `with`: envolver un bucle de cuarenta
    lineas exigiria reindentar el cuerpo entero, y reindentar a mano un bloque
    largo es la forma mas directa de corromper un archivo sin que nada falle.
    Con el decorador el lote es una linea y el cuerpo no se toca."""
    import asyncio

    escrituras = {"n": 0}
    real_replace = ai_client.os.replace
    monkey = pytest.MonkeyPatch()
    monkey.setattr(
        ai_client.os, "replace",
        lambda *a, **k: (escrituras.__setitem__("n", escrituras["n"] + 1), real_replace(*a, **k))[1],
    )

    @ai_client.en_lote
    async def un_lote():
        for i in range(40):
            ai_client._save_cache({f"k{i}": str(i)})
        return "lo que el lote devuelve"

    try:
        assert asyncio.run(un_lote()) == "lo que el lote devuelve"
    finally:
        monkey.undo()

    assert escrituras["n"] == 1


def test_EL_DECORADOR_IGUAL_PARA_UN_LOTE_QUE_REVIENTA(cache_limpia):
    """La funcion que se decora devuelve `async`. Si se olvidara el `await`, el
    decorador devolveria una coroutine sin ejecutar y el lote pasaria de largo
    con el LLM sin llamar: el error mas silencioso que hay en este archivo, porque
    no falla —solo no agrupa— y el resto de la app sigue andando."""
    import asyncio

    @ai_client.en_lote
    async def explota():
        ai_client._save_cache({"salio": "1"})
        raise RuntimeError("cayo")

    with pytest.raises(RuntimeError):
        asyncio.run(explota())
    assert json.loads(cache_limpia.read_text(encoding="utf-8")) == {"salio": "1"}
