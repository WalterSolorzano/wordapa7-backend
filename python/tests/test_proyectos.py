"""
F7 Task 2 — el proyecto es una entidad con persistencia, no un prefijo del archivo.

QUE SE ESTA midiendo ACA, Y POR QUE NO EN UN ARCHIVO NUEVO DE LA BASE

Un proyecto es un CONJUNTO DE SESIONES. Si viviera en su propia base, tendriamos
dos lugares donde esta la verdad y una regla para sincronizarlos que nadie
escribe. Vive en la base de sesiones: las tablas se agregan a la MISMA base con
`CREATE TABLE IF NOT EXISTS`, que es la unica operacion de esquema que este repo
usa y la unica que no tira datos.

LA MIGRACION DESTRUCTIVA NO SE HACE Y NO SE NECESITA. Agregar una tabla a una base
SQLite con `CREATE TABLE IF NOT EXISTS` no borra ni una fila de las que estan: es
un `CREATE`, no un `DROP`. El riesgo de la migracion destructiva en este repo no
es teorico —una sesion guardada es trabajo de alguien— asi que el criterio fue el
opuesto de "si se puede, hacerlo": si implica tirar datos, no se hace y se
declara. ACA NO HIZO FALTA.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))


@pytest.fixture
def proyectos(tmp_path):
    """El store de proyectos sobre un storage temporal, no el del usuario."""
    from persistence import proyectos as modulo

    storage = tmp_path / "storage"
    storage.mkdir(parents=True, exist_ok=True)
    yield modulo.con_storage(storage)
    modulo.cerrar()


def _reiniciar(store):
    """Cerrar y volver a abrir el store es lo mas parecido a reiniciar el
    servicio que se puede hacer sin matar el proceso. Devuelve el store nuevo."""
    ruta = store.raiz
    return _modulo().con_storage(ruta)


def _modulo():
    from persistence import proyectos as modulo

    return modulo


def _carpeta(store, nombre):
    """Una carpeta de trabajo dentro del storage del test."""
    d = store.raiz / nombre
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── La entidad ────────────────────────────────────────────────────────────────


def test_un_proyecto_sobrevive_a_reiniciar_el_servicio(proyectos):
    # El defecto: el nombre del proyecto salia del prefijo del nombre del
    # archivo, y el archivo se renombra. Ademas reiniciar el servicio se llevaba
    # el nombre entero. Un proyecto que no sobrevive al reinicio es una etiqueta
    # de sesion, y una etiqueta de sesion no sobrevive a nada.
    proyectos.crear(nombre="Mi tesis", raiz=None)

    reabierto = _reiniciar(proyectos)

    assert [p.nombre for p in reabierto.listar()] == ["Mi tesis"]
    reabierto.cerrar()
    _modulo().cerrar()


def test_el_proyecto_no_toma_el_nombre_del_archivo(proyectos):
    # El nombre es un DATO, no una derivacion. Dos archivos con el mismo nombre
    # base pueden ser dos proyectos distintos, y un proyecto puede tener mas de
    # un archivo: si el nombre se derivara del archivo, estos dos casos no se
    # podrian expresar.
    a = proyectos.crear(nombre="Tesis", raiz=None)
    b = proyectos.crear(nombre="Tesis", raiz=None)
    assert a.id != b.id
    assert a.raiz is None


def test_sin_nombre_no_hay_proyecto(proyectos):
    # El mismo criterio del frontend: sin nombre no hay entidad. Si se aceptara
    # un nombre vacio, alguien terminaria guardando la cadena "" y la pantalla
    # mostraria un titulo invisible en vez de ningun titulo.
    with pytest.raises(ValueError):
        proyectos.crear(nombre="   ", raiz=None)


# ── El sync ───────────────────────────────────────────────────────────────────


def test_sync_relee_el_disco_y_no_duplica(proyectos):
    # El defecto que cierra esta prueba: releer la carpeta dos veces no puede
    # duplicar documentos. Un sync que agrega en vez de sustituir deja la lista
    # creciendo en cada pulsacion, y el usuario ve "6 documentos" cuando tiene 3.
    raiz = _carpeta(proyectos, "caps")
    (raiz / "cap1.docx").write_bytes(b"x")
    (raiz / "cap2.docx").write_bytes(b"x")

    p = proyectos.crear(nombre="Tesis", raiz=str(raiz))
    assert len(proyectos.sync(p).documentos) == 2
    assert len(proyectos.sync(p).documentos) == 2  # idempotente
    # Y sobre lo GUARDADO, que es lo que la proxima lectura va a decir. Ver el
    # comentario de `test_sync_borra_del_disco_lo_que_ya_no_esta`.
    assert proyectos.obtener(p.id).documentos == ["cap1.docx", "cap2.docx"]


def test_sync_borra_del_disco_lo_que_ya_no_esta(proyectos):
    # El otro sentido del idempotente: sync no solo agrega. Si el usuario borro
    # un capitulo de la carpeta, la lista tiene que reflejarlo, o el Explorador
    # muestra documentos que ya no existen.
    #
    # SE AFIRMA SOBRE LO GUARDADO, NO SOBRE LO DEVUELTO. Esta distincion no es
    # estilo: al mutar `sync` para que una por UNION en vez de sustituir, la
    # version anterior de esta prueba seguia en verde. El motivo es que
    # `Sync.documentos` es lo que hay EN DISCO, y en los dos casos es correcto;
    # lo que cambia es la fila guardada, que es lo que la proxima lectura del
    # proyecto va a decir. Una guarda que mira el valor de retorno y no el
    # estado guardado mide la mitad de la cosa.
    raiz = _carpeta(proyectos, "caps2")
    (raiz / "cap1.docx").write_bytes(b"x")
    (raiz / "cap2.docx").write_bytes(b"x")

    p = proyectos.crear(nombre="Tesis", raiz=str(raiz))
    proyectos.sync(p)
    assert proyectos.obtener(p.id).documentos == ["cap1.docx", "cap2.docx"]

    (raiz / "cap2.docx").unlink()
    proyectos.sync(p)

    assert proyectos.obtener(p.id).documentos == ["cap1.docx"]


def test_sync_de_una_carpeta_inexistente_no_borra_lo_que_habia(proyectos):
    # ESTA ES LA TRAMPA DEL SYNC, Y LA QUE HACE FALTA EL TEST.
    # Si la carpeta no se puede leer, la respuesta honesta es "no se que hay
    # adentro". Borrar la lista en ese caso deja al usuario sin documentos y sin
    # aviso, y un proyecto sin documentos parece un proyecto vacio: la peor
    # lectura posible de un error que quizas ni existe.
    raiz = _carpeta(proyectos, "caps3")
    (raiz / "cap1.docx").write_bytes(b"x")

    p = proyectos.crear(nombre="Tesis", raiz=str(raiz))
    proyectos.sync(p)

    import shutil

    shutil.rmtree(raiz)
    resultado = proyectos.sync(p)

    assert resultado.documentos == ["cap1.docx"]
    assert resultado.error, "una carpeta que no se pudo leer tiene que decirlo"


def test_sync_no_sale_de_la_carpeta(proyectos):
    # Un sync que sigue enlaces simbolicos sube a cualquier lado del disco. El
    # alcance del proyecto es su carpeta: lo que hay arriba no le pertenece.
    raiz = _carpeta(proyectos, "caps4")
    fuera = proyectos.raiz / "secreto.docx"
    fuera.write_bytes(b"x")
    try:
        (raiz / "enlace.docx").symlink_to(fuera)
    except (OSError, NotImplementedError):
        pytest.skip("el sistema de archivos no admite enlaces simbolicos")

    p = proyectos.crear(nombre="Tesis", raiz=str(raiz))
    assert "enlace.docx" not in proyectos.sync(p).documentos


def test_sync_ignora_lo_que_no_es_docx(proyectos):
    # Una carpeta de trabajo tiene tambien el `~$cap1.docx` que deja Word
    # abierto, notas en texto y las imagenes del proyecto. Meter eso en la lista
    # de documentos es mostrarle a la persona cosas que no puede abrir.
    raiz = _carpeta(proyectos, "caps5")
    (raiz / "cap1.docx").write_bytes(b"x")
    (raiz / "notas.txt").write_bytes(b"x")
    (raiz / "logo.png").write_bytes(b"x")
    (raiz / "~$cap1.docx").write_bytes(b"x")

    p = proyectos.crear(nombre="Tesis", raiz=str(raiz))
    assert proyectos.sync(p).documentos == ["cap1.docx"]


# ── Vive donde viven las sesiones ─────────────────────────────────────────────


def test_el_proyecto_vive_en_la_misma_base_que_las_sesiones(tmp_path):
    # ESTA ES LA AFIRMACION DE ARQUITECTURA DEL PLAN, Y HAY QUE PROBARLA.
    # "Reusar el mecanismo existente" es una instruccion; esto la convierte en
    # algo que puede romperse sin que nadie se entere. Un segundo archivo .db
    # seria una segunda verdad y una regla de sincronizacion que nadie escribe.
    from persistence import session_manager as sm
    from persistence.proyectos import projects_db_path

    storage = tmp_path / "storage"
    storage.mkdir(parents=True, exist_ok=True)
    sm.init_db(storage)

    assert projects_db_path() == sm.DB_PATH

    from persistence import proyectos as modulo

    modulo.cerrar()
    sm.DB_PATH = None


def test_agregar_la_tabla_no_toca_las_filas_existentes(tmp_path):
    # El motivo por el que NO se hizo una migracion. Con una base ya poblada de
    # sesiones, agregar la tabla de proyectos tiene que dejar las sesiones
    # intactas. Si esto falla, es que alguien escribio un DROP.
    from persistence import session_manager as sm
    from persistence.proyectos import projects_db_path
    import sqlite3

    storage = tmp_path / "storage"
    storage.mkdir(parents=True, exist_ok=True)
    sm.init_db(storage)

    conn = sqlite3.connect(str(sm.DB_PATH))
    conn.execute(
        "INSERT INTO session_data (session_id, data) VALUES ('s1', '{}')"
    )
    conn.commit()
    conn.close()

    from persistence import proyectos as modulo

    modulo.cerrar()  # fuerza el CREATE TABLE al reconectar
    proyecto = modulo.con_storage(storage).crear(nombre="Tesis", raiz=None)

    conn = sqlite3.connect(str(projects_db_path()))
    filas = conn.execute("SELECT session_id FROM session_data").fetchall()
    tablas = {
        r[0]
        for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    }
    conn.close()
    modulo.cerrar()

    assert filas == [("s1",)]
    assert "proyectos" in tablas
    assert proyecto.nombre == "Tesis"
    sm.DB_PATH = None


# ── El router: existe y esta registrado ───────────────────────────────────────


@pytest.fixture
def cliente(tmp_path, monkeypatch):
    """TestClient con el almacenamiento de proyectos en un temporal.

    `STORAGE_DIR` se sustituye por el temporal porque los handlers crean el store
    con esa constante importada. Sin esto, el test escribiria en el
    almacenamiento REAL del usuario, que es justo lo que `conftest.py` existe
    para impedir.
    """
    from fastapi.testclient import TestClient

    from main import app
    import routers.proyectos as rp

    storage = tmp_path / "storage_http"
    storage.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(rp, "STORAGE_DIR", storage)
    return TestClient(app), storage


def test_el_router_esta_registrado(cliente):
    # Un modulo que existe y no esta registrado es una superficie terminada que
    # nadie ve. Esta asercion falla si alguien saca el `include_router` sin
    # sacar el modulo, que es como se rompe un endpoint en silencio.
    http, _ = cliente
    r = http.get("/api/proyectos")
    assert r.status_code == 200
    assert "proyectos" in r.json()


def test_crear_listar_y_sync_por_http(cliente):
    # El camino completo de la API. No es redundante con los tests del store:
    # aquellos affirmation que el DATO se guarda, este que el BOTON llega. Un
    # endpoint con la ruta mal escrita pasa los primeros y falla aca.
    http, storage = cliente
    raiz = storage / "trabajo"
    raiz.mkdir(parents=True, exist_ok=True)
    (raiz / "cap1.docx").write_bytes(b"x")

    creado = http.post("/api/proyectos", json={"nombre": "Mi tesis", "raiz": str(raiz)})
    assert creado.status_code == 200
    pid = creado.json()["id"]

    assert [p["nombre"] for p in http.get("/api/proyectos").json()["proyectos"]] == ["Mi tesis"]

    s = http.post(f"/api/proyectos/{pid}/sync")
    assert s.status_code == 200
    assert s.json()["documentos"] == ["cap1.docx"]
    # Idempotente por HTTP, no solo en el store.
    assert http.post(f"/api/proyectos/{pid}/sync").json()["documentos"] == ["cap1.docx"]

    assert http.delete(f"/api/proyectos/{pid}").status_code == 200
    assert http.get("/api/proyectos").json()["proyectos"] == []


def test_sync_de_un_proyecto_inexistente_da_404(cliente):
    # Un 404 explicito. Lo que NO puede pasar es un 200 con una lista vacia: eso
    # le dice a la persona que su proyecto no tiene documentos cuando en realidad
    # no existe, y el vacio se come el trabajo.
    http, _ = cliente
    assert http.post("/api/proyectos/no-existe/sync").status_code == 404


def test_nombre_en_blanco_da_400(cliente):
    # " " pasa el `min_length=1` de Pydantic porque tiene un caracter, y no es un
    # nombre. Sin esta guarda, se guardaba un proyecto invisible.
    http, _ = cliente
    r = http.post("/api/proyectos", json={"nombre": "   "})
    assert r.status_code == 400
