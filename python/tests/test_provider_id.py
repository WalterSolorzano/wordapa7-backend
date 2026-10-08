"""Elegir proveedor selecciona proveedor, y la eleccion llega a todos lados.

Dos defectos, ambos del mismo origen: el producto decia que se podia elegir con
quien hablar, y lo que hacia era elegir que clave se le mandaba al PRIMERO de
la lista.

1. `api_key` se inyectaba en la entrada `nvidia_nim` sin mirar de que proveedor
   venga (`_get_active_providers`, `nv_key = custom_key or ...`). Elegias Groq,
   mandabas la key de Groq, se inyectaba en NIM, NIM respondia 401 y la entrada
   entraba en cooldown de 600 s. Y si NIM no estaba configurado, tu key se
   perdia: el proveedor que elegiste no la recibia nunca.

2. `provider_id` lo mandaba UN endpoint de los que llaman al LLM. Los demas iban
   por la cadena completa, con la especialidad como unico criterio. Elegir en la
   UI solo afectaba a la clasificacion.

El inventario de abajo se CONSTRUYE greppeando `execute_with_specialty` en
`python/`, no escrito a mano. El spec de la fase decia dieciocho; el numero
real se verifica en `test_el_inventario_no_esta_escrito_a_mano`.
"""

import re
import subprocess
import sys
from pathlib import Path

import pytest

RAIZ_PYTHON = Path(__file__).resolve().parent.parent
RAIZ = RAIZ_PYTHON.parent
sys.path.insert(0, str(RAIZ_PYTHON))

from classification.llm_classifier import _get_active_providers  # noqa: E402

TODAS_LAS_CLAVES = [
    "NVIDIA_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "CEREBRAS_API_KEY",
    "MISTRAL_API_KEY", "OPENCODEZEN_API_KEY", "ZENMUX_API_KEY", "GEMINI_API_KEY",
    "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "AION_API_KEY",
    "KILOCODE_API_KEY", "OLLAMA_API_KEY", "HUGGINGFACE_API_KEY",
    "MODELSCOPE_API_KEY", "SAMBANOVA_API_KEY", "DASHSCOPE_API_KEY",
    "AGNES_AI_API_KEY",
]

# El orden del catalogo de `proveedoresIA.ts`, que es el de
# `_get_active_providers`. El primero con clave manda cuando no hay eleccion.
CATALOGO = [
    "nvidia_nim", "groq", "openrouter", "cerebras", "mistral", "opencodezen",
    "zenmux", "gemini", "cloudflare", "aion", "kilocode", "ollama_cloud",
    "huggingface",
]

# Las variables de entorno que hacen que un proveedor entre en la cola. Cloudflare
# tiene DOS: sin el id de cuenta su endpoint no se puede construir, asi que
# decir "tiene clave" con una sola seria mentira.
ENV_DE_CADA_UNO = {
    "nvidia_nim": ["NVIDIA_API_KEY"],
    "groq": ["GROQ_API_KEY"],
    "openrouter": ["OPENROUTER_API_KEY"],
    "cerebras": ["CEREBRAS_API_KEY"],
    "mistral": ["MISTRAL_API_KEY"],
    "opencodezen": ["OPENCODEZEN_API_KEY"],
    "zenmux": ["ZENMUX_API_KEY"],
    "gemini": ["GEMINI_API_KEY"],
    "cloudflare": ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
    "aion": ["AION_API_KEY"],
    "kilocode": ["KILOCODE_API_KEY"],
    "ollama_cloud": ["OLLAMA_API_KEY"],
    "huggingface": ["HUGGINGFACE_API_KEY"],
}


@pytest.fixture(autouse=True)
def entorno_limpio(monkeypatch):
    for var in TODAS_LAS_CLAVES:
        monkeypatch.delenv(var, raising=False)
    yield


# ============================== el Review Focus #3: la key de Groq a NIM
def test_la_key_de_groq_nunca_llega_a_nim(monkeypatch):
    """La entrada de NVIDIA no puede llevar la key de otro proveedor.

    Este es el defecto exacto: con `custom_key` filling la entrada de NIM sin
    mirar de que proveedor venga, la key de Groq se mandaba a
    `integrate.api.nvidia.com`, contestaban 401, y la entrada de NIM entraba en
    cooldown de 600 s. La prueba mira lo que sale de la funcion, que es lo que
    se manda: si se mira la funcion y no su resultado, el mismo defecto pasaria.
    """
    monkeypatch.setenv("GROQ_API_KEY", "clave-de-groq")

    activos = _get_active_providers("clave-de-groq", None, False, "groq")

    por_id = {p["id"]: p for p in activos}
    assert list(por_id) == ["groq"]
    assert por_id["groq"]["key"] == "clave-de-groq"
    # Y la pregunta directa: hay alguna entrada de NIM_DISPONIBLE que lleve esta
    # clave? Si apareciera, el defecto volvio.
    assert not any(
        p["id"] == "nvidia_nim" and p["key"] == "clave-de-groq" for p in activos
    )


@pytest.mark.parametrize("provider", [c for c in CATALOGO if c != "nvidia_nim"])
def test_la_key_de_cada_proveedor_llega_a_su_propio_proveedor(provider, monkeypatch):
    """Cada proveedor recibe la suya, y la suya es la que se elige.

    El defecto no era solo de NIM: la clave se resolvia por la entrada de NIM y
    de ahi salia para todos. Se recorre el catalogo entero para que un
    proveedor nuevo no pueda repetirlo sin que se note.
    """
    for var in ENV_DE_CADA_UNO[provider]:
        monkeypatch.setenv(var, f"clave-de-{provider}")

    activos = _get_active_providers(f"clave-de-{provider}", None, False, provider)

    assert [p["id"] for p in activos] == [provider]
    assert activos[0]["key"] == f"clave-de-{provider}"


def test_la_key_del_request_no_alimenta_a_ningun_otro_proveedor(monkeypatch):
    """Sin eleccion, la clave del request NO se reparte entre los demas.

    Esta es la mitad que faltaba en la prueba de arriba, y la que hace el
    defecto visible. Con `provider_id` puesto, `_get_active_providers` filtra la
    lista y NIM desaparece del resultado: la prueba anterior pasaria CON el
    defecto puesto, porque nunca llega a construir la entrada de NIM. Era un
    guardian que seProtected a si mismo.

    Sin `provider_id` la situacion es la real: la UI en automatico manda la key
    del proveedor que manda, y si ese es Groq, la entrada de NIM no puede
    construirse con la key de Groq. Antes se construia, porque la inyeccion era
    `custom_key or os.getenv("NVIDIA_API_KEY")` sobre la entrada de NIM sin mirar
    de que proveedor venía.
    """
    monkeypatch.setenv("GROQ_API_KEY", "clave-de-groq")

    activos = _get_active_providers("clave-de-groq")

    por_id = {p["id"]: p for p in activos}
    assert por_id["groq"]["key"] == "clave-de-groq"
    # NIM no tiene su propia clave puesta, asi que no entra: entraria con la
    # de Groq, y ahi esta el 401 con su cooldown de 600 s.
    assert "nvidia_nim" not in por_id, (
        "NIM entro a la cola con la clave de otro proveedor: la inyeccion de "
        "api_key sigue mirando la entrada equivocada"
    )


def test_nvidia_entra_cuando_tiene_la_suya(monkeypatch):
    """El otro lado del mismo par: NIM entra si su clave esta puesta.

    Las dos pruebas juntas son el par. Si NIM no entrara nunca, la de arriba
    pasaria sin el arreglo; si entrara siempre, pasaria con el defecto.
    """
    monkeypatch.setenv("GROQ_API_KEY", "clave-de-groq")
    monkeypatch.setenv("NVIDIA_API_KEY", "clave-de-nvidia")

    activos = _get_active_providers("clave-de-groq")

    por_id = {p["id"]: p for p in activos}
    assert por_id["nvidia_nim"]["key"] == "clave-de-nvidia"
    assert por_id["groq"]["key"] == "clave-de-groq"


def test_nvidia_sigue_recibiendo_su_propia_clave(monkeypatch):
    """NVIDIA no pierde nada: es el unico que puede seguir usando `custom_key`.

    El arreglo no es "nadie recibe la clave del request". Es "la recibe el
    proveedor que la pidio". Sin esta mitad, el arreglo seria tapar un defecto
    con otro: NVIDIA, el primero de la lista, se quedaria sin poder usarse con
    la clave que la UI ya mandaba.
    """
    monkeypatch.setenv("NVIDIA_API_KEY", "clave-de-nvidia")

    activos = _get_active_providers("clave-de-nvidia", None, False, "nvidia_nim")

    assert [p["id"] for p in activos] == ["nvidia_nim"]
    assert activos[0]["key"] == "clave-de-nvidia"


def test_la_elecion_sin_clave_no_puede_dejar_sin_motor(monkeypatch):
    """Elegir un proveedor sin clave puesta no lo mete a la cola a disparar un 401.

    La UI deja elegir uno que todavia no tiene clave (`ConexionTab` lo marca
    "(sin clave)"). Con `provider_id` a un proveedor sin clave, la lista queda
    vacia y el router dice que no hay a quien preguntarle: el llamador degrada
    sin red. Lo que NO puede pasar es la cadena completa: ese proveedor caeria
    a preguntar al primero de la lista, que es la eleccion que el usuario
    todavia no hizo.
    """
    monkeypatch.setenv("GROQ_API_KEY", "clave-de-groq")

    # ZenMux no tiene clave: elegirlo no puede devolver la cadena completa.
    # Y el `or providers` que se le ocurriera a alguien como parche, con el
    # elegido sin clave y sin nadie mas en la lista, tampoco se dispara: la
    # lista queda vacia y el router dice que no hay a quien preguntarle.
    with pytest.raises(ValueError, match="Proveedor no configurado"):
        _get_active_providers("clave-de-groq", None, False, "zenmux")


def test_la_elecion_valida_devuelve_solo_el_elegido(monkeypatch):
    """Elegir uno es elegir UNO, aunque haya cinco con clave.

    Sin esta mitad, un `or providers` al final de la funcion pasaria la prueba
    de arriba —porque el otro proveedor tampoco tiene clave— y devolveria la
    cadena entera cuando el elegido si la tiene. Es el caso real: cinco claves
    puestas y la sexta elegida.
    """
    for var in ("NVIDIA_API_KEY", "GROQ_API_KEY", "ZENMUX_API_KEY",
                "AION_API_KEY", "HUGGINGFACE_API_KEY"):
        monkeypatch.setenv(var, f"clave-de-{var.lower()}")

    activos = _get_active_providers("clave-de-aion_api_key", None, False, "aion")

    assert [p["id"] for p in activos] == ["aion"]
    assert len(activos) == 1


def test_sin_elecion_manda_el_primero_con_clave(monkeypatch):
    """Sin eleccion, la cadena completa se arma como siempre.

    El arreglo del punto anterior no puede cambiar esto: es el comportamiento que
    permite que la app funcione con dos claves puestas y ninguna elegida.
    """
    monkeypatch.setenv("ZENMUX_API_KEY", "clave-de-zenmux")
    monkeypatch.setenv("GROQ_API_KEY", "clave-de-groq")

    activos = _get_active_providers()

    assert [p["id"] for p in activos] == ["groq", "zenmux"]
    por_id = {p["id"]: p for p in activos}
    assert por_id["groq"]["key"] == "clave-de-groq"
    assert por_id["zenmux"]["key"] == "clave-de-zenmux"


def test_sin_elecion_la_key_del_request_alcanza_a_nvidia(monkeypatch):
    """Sin `provider_id`, la clave del request sigue siendo la de NVIDIA.

    Es el camino del clasificador, que es el unico que hoy manda `provider_id`
    y el unico que por lo tanto puede no mandarlo. Con la UI en automatico, la
    key que viaja es la del proveedor que manda, y si ese es NIM tiene que
    funcionar: el arreglo no puede ser "nadie recibe la clave del request".
    """
    monkeypatch.setenv("NVIDIA_API_KEY", "clave-de-nvidia")

    activos = _get_active_providers("clave-de-nvidia")

    por_id = {p["id"]: p for p in activos}
    assert por_id["nvidia_nim"]["key"] == "clave-de-nvidia"


# ======================= el Review Focus #4: provider_id en los dieciocho
def _sitios_que_llaman_al_router():
    """Cada llamada a `execute_with_specialty`, con su archivo y su linea.

    Se BUSCA en el codigo, no se escribe la lista. Una lista escrita a mano
    tiene una propiedad fatal: cuando se agrega un endpoint, la lista no crece
    y el guardian dice que todo esta bien. Es el mismo defecto que el del
    guard que se encontraba a si mismo, y por eso el `test_de_abajo` comprueba
    que esta lista se derivó de verdad.
    """
    sitios = []
    patron = re.compile(r"await\s+execute_with_specialty")
    for ruta in sorted(RAIZ_PYTHON.rglob("*.py")):
        if "tests" in ruta.parts or ".venv" in ruta.parts:
            continue
        for n, linea in enumerate(ruta.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if patron.search(linea):
                sitios.append((ruta.relative_to(RAIZ).as_posix(), n, linea))
    return sitios


SITIOS = _sitios_que_llaman_al_router()

# El grep tambien encuentra la reenviacion del alias `execute_with_fallback`, que
# no es un endpoint: es el MISMO router con otro nombre, y reenvia `*args,
# **kwargs`. Excluirla es correcto, pero excluirla sin decirlo seria una puerta
# que crece: por eso la exclusion se describe con una REGLA y no con una lista
# negra, y `test_la_exclusion_es_solo_el_alias` afirma que lo excluido es
# exactamente el alias.
ES_EL_ALIAS_DEL_ROUTER = (
    lambda ruta_rel, texto: (
        ruta_rel == "python/modules/ai_client.py"
        and "execute_with_specialty" in texto
        and "*args" in texto
        and "**kwargs" in texto
    )
)

SITIOS_DE_ENDPOINT = [s for s in SITIOS if not ES_EL_ALIAS_DEL_ROUTER(s[0], s[2])]


def test_la_exclusion_es_solo_el_alias():
    """Lo que se excluye del inventario es el alias, y nada mas.

    Sin esta prueba, excluir el alias seria una puerta sin candado: cualquier
    otro sitio podria desaparecer del inventario con la misma justificacion y
    las demas pruebas seguirian pasando sin mirarlo. Se cuenta en las dos
    direcciones: lo excluido tiene que ser UNO, y tiene que ser el alias.
    """
    excluidos = [s for s in SITIOS if ES_EL_ALIAS_DEL_ROUTER(s[0], s[2])]
    fuera_del_inventario = [s for s in SITIOS if s not in SITIOS_DE_ENDPOINT]

    assert len(excluidos) == 1, (
        f"la regla de exclusion agarra {len(excluidos)} sitios y solo el alias "
        "del router puede quedar afuera"
    )
    assert fuera_del_inventario == excluidos, (
        "hay sitios que desaparecen del inventario sin que la regla los explique: "
        + "\n  ".join(f"{r}:{n}  {t.strip()}" for r, n, t in fuera_del_inventario)
    )
    assert excluidos[0][0] == "python/modules/ai_client.py"


def test_el_inventario_no_esta_escrito_a_mano():
    """La lista de arriba se deriva del codigo, y eso se comprueba.

    Sin esta prueba, la lista podria volverse una constante escrita a mano y
    seguir "pasando": el guardian seguiria contando los mismos sitios que el
    codigo tiene, y cuando se sumara un endpoint, el numero no se moveria. Un
    guardian que no se mueve cuando la realidad cambia no vigila nada.

    La segunda mitad es la mas importante: si el patron de busqueda dejara de
    encontrar sitios, `SITIOS` estaria vacio y TODAS las pruebas siguientes
    pasarian sin comprobar nada. Un guardian que se queda sin reglas es un
    guardian que aprueba el vacio.

    Y el numero. El spec de la fase decia dieciocho endpoints. El grep da
    diecinueve llamadas al router (2026-10-04: se sumo el motor de vision,
    `visual_auditor.audit_pdf_with_multimodal_llm`, que dejo de pegarle a NVIDIA
    directo), y una de ellas es el alias `execute_with_fallback` del propio
    `ai_client`, que no es un endpoint. O sea que los endpoints reales son
    dieciocho: el motor de vision suma como los demas, aunque hoy no tenga
    llamadores (igual que `check_spelling_with_ia`).
    """
    assert len(SITIOS) == 19, (
        f"el grep encuentra {len(SITIOS)} llamadas a execute_with_specialty y "
        f"eran 19 el 2026-10-04. Si el numero cambio, el spec §12.3 esta mal y "
        "hay que corregirlo, no reescribir el numero para que pase."
    )
    assert len(SITIOS_DE_ENDPOINT) == 18, (
        f"quedan {len(SITIOS_DE_ENDPOINT)} endpoints que llaman al router y el "
        "spec §12.3 dice dieciocho. La diferencia es el alias del router, que "
        "no es un endpoint."
    )
    # Y la derivacion es real: los archivos citados existen y siguen teniendo
    # la llamada en la linea citada.
    for ruta_rel, linea, _ in SITIOS:
        ruta = RAIZ / ruta_rel
        assert ruta.exists(), f"{ruta_rel} no existe"
        lineas_del_archivo = ruta.read_text(encoding="utf-8", errors="replace").splitlines()
        assert re.search(r"await\s+execute_with_specialty", lineas_del_archivo[linea - 1]), (
            f"{ruta_rel}:{linea} ya no es la llamada que el inventario promete"
        )


def _argumentos(texto_crudo: str) -> str:
    """Los argumentos de una llamada, SIN comentarios.

    Es el detalle que hace que este guardian sirva. Un comentario puesto entre
    los argumentos es indistinguible de un argumento para quien solo cuenta
    parentesis: la palabra `provider_id` en un comentario se contaria como si
    fuera el argumento, y el guardian pasaria con el defecto PUESTO. Eso no es
    hipotetico: ocurrio con el comentario que estaba en `doc_auditor`, y la
    mutacion que lo comprobo no lo tumbo.

    Por eso se quitan los comentarios antes de mirar. Solo los comentarios: una
    cadena de texto que contiene la palabra sigue contando, porque ahi si puede
    estar el argumento de verdad.
    """
    return re.sub(r"#.*", "", texto_crudo)


def _cuerpo_que_rodea(ruta_rel, linea, hacia_despues=40):
    """Los argumentos de la llamada que empieza en `linea`.

    Se cuentan parentesis, no se leen N lineas. Leer una ventana fija hacia
    adelante tiene un fallo concreto: si la llamada siguiente del archivo lleva
    `provider_id`, la ventana la encuentra y el sitio pasa aunque no lo mande.
    Ese es un guardian que se salva solo.
    """
    lineas = (RAIZ / ruta_rel).read_text(encoding="utf-8", errors="replace").splitlines()
    fuente = "\n".join(lineas[linea - 1:linea - 1 + hacia_despues])
    return _argumentos(_llamada_completa(fuente, 0))


def test_el_guardian_no_confunde_un_comentario_con_un_argumento():
    """La mitad del guardian anterior, probada sola.

    Si esto falla, cualquier llamada puede "pasar" por tener un comentario que
    hable de `provider_id` en vez de pasarlo. Es la forma exacta en que un
    guardian de este tipo se encuentra a si mismo: no buscando su nombre, sino
    con su propia prosa.
    """
    con_comentario = (
        "response = await execute_with_specialty(\n"
        "    api_key=api_key,\n"
        "    # aqui se pasa provider_id, en serio\n"
        "    temperature=0.2,\n"
        ")"
    )
    argumentos = _argumentos(_llamada_completa(con_comentario, 0))
    assert "provider_id" not in argumentos, (
        "un comentario se esta contando como argumento: el guardian pasaria "
        "aunque la llamada no lo mande"
    )

    con_argumento = (
        "response = await execute_with_specialty(\n"
        "    api_key=api_key,\n"
        '    provider_id=(cfg or {}).get("provider_id") or None,\n'
        ")"
    )
    assert "provider_id" in _argumentos(_llamada_completa(con_argumento, 0))


def test_todos_los_sitios_reenvian_provider_id():
    """Cada llamada al router lleva `provider_id`.

    No se busca la palabra en el archivo: se miran los ARGUMENTOS de la llamada.
    Un archivo puede tener `provider_id` en la firma de su funcion y no pasarlo,
    que es exactamente el defecto de `doc_auditor`.
    """
    sin_provider_id = []
    for ruta_rel, linea, texto in SITIOS_DE_ENDPOINT:
        argumentos = _cuerpo_que_rodea(ruta_rel, linea)
        if "provider_id" not in argumentos:
            sin_provider_id.append(
                f"{ruta_rel}:{linea}  ->  {texto.strip()}\n"
                f"      argumentos: {argumentos.replace(chr(10), ' ').strip()}"
            )

    assert not sin_provider_id, (
        f"estas {len(sin_provider_id)} de {len(SITIOS_DE_ENDPOINT)} llamadas al "
        "router no reenvian provider_id:\n  " + "\n  ".join(sin_provider_id)
    )


def _llamada_completa(fuente, desde):
    """Los argumentos de la llamada, contando parentesis.

    Cortar en el primer `)` no sirve: el primer parentesis que cierra puede estar
    a mitad de los argumentos —`(provider_config or {})`—, y el guardián cortaba
    antes de `provider_id` sin haberlo mirado nunca.
    """
    abre = fuente.index("(", desde)
    nivel = 0
    for i in range(abre, len(fuente)):
        if fuente[i] == "(":
            nivel += 1
        elif fuente[i] == ")":
            nivel -= 1
            if nivel == 0:
                return fuente[abre + 1:i]
    return fuente[abre + 1:]


def test_doc_auditor_reenvia_el_proveedor_que_recibe():
    """El caso que el spec nombra: recibe `provider_id` y no lo pasa.

    `audit_document_structure` recibe un `provider_config` con `nim_url` y
    `use_local` y los pasa al router. Si `provider_id` esta en el mismo
    diccionario y no se pasa, la eleccion de la UI se pierde en el ultimo
    tramo, y es el tramo mas caro: HEAVY, mil tokens, estructura completa.
    """
    import inspect

    from modules import doc_auditor

    fuente = inspect.getsource(doc_auditor.audit_document_structure)
    # La funcion recibe el provider_config...
    assert "provider_config" in inspect.signature(doc_auditor.audit_document_structure).parameters
    # ...y lo pasa al router. Se mira la llamada, no el archivo entero: el
    # nombre "provider_config" aparece en la firma aunque no se pase.
    argumentos = _argumentos(_llamada_completa(fuente, fuente.find("execute_with_specialty")))
    assert "provider_id" in argumentos, (
        "audit_document_structure recibe provider_config con provider_id y no "
        "lo pasa a execute_with_specialty: la eleccion de proveedor se pierde en "
        "la auditoria de estructura. Los argumentos que si pasa son: "
        + argumentos.replace("\n", " ").strip()
    )


def test_el_alias_heredado_tambien_recibe_provider_id():
    """`execute_with_fallback` es el mismo router con otro nombre.

    Reenvia `*args, **kwargs`, asi que lo hereda. Se afirma para que nadie lo
    cambie a una lista de parametros explicita sin acordarse de esto: si alguna
    vez lo hace, la prueba se cae y hay que pasar `provider_id` a mano.
    """
    import inspect

    from modules.ai_client import execute_with_fallback

    assert list(inspect.signature(execute_with_fallback).parameters) == [
        "args", "kwargs",
    ]
