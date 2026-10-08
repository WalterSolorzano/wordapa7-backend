"""
WordAPA7 — Proyectos: la entidad que agrupa sesiones y nombra un trabajo.

F7 Task 2. Antes "proyecto" no era una entidad: era el prefijo del nombre del
archivo, y `parseDocumentVersion` lo sacaba de ahi. Renombrar el archivo
renombraba el proyecto, y reiniciar el servicio se llevaba el nombre entero.

DOnde vive, Y POR QUE NO HAY OTRO LUGAR

Un proyecto es un CONJUNTO DE SESIONES. Vive en la MISMA base que las sesiones —
`session_manager.DB_PATH`— y su tabla se agrega con `CREATE TABLE IF NOT EXISTS`.

La alternativa era una base propia. Se descarto por una razon concreta: dos bases
son dos verdades y una regla de sincronizacion entre ellas que nadie escribe
despues. Y la operacion de esquema que hace falta para agregar una tabla NO es una
migracion destructiva: es un `CREATE`, que no borra ni una fila. La sesion
guardada de alguien es trabajo hecho, y la regla de este repo es que el
conveniente no puede pesar mas que eso.

El modulo NO tiene una conexion global. `con_storage(storage)` devuelve un store
con su propia ruta: asi el test puede reiniciar el "servicio" —cerrar y volver a
abrir— contra un temporal, y nunca toca el almacenamiento real del usuario.
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# Un proyecto tiene que existir antes de guardar la sesion que lo referencia, asi
# que la sesion no puede tener una FK que la ate: la base de sesiones ya existe
# en las instalaciones y agregar una FK a una tabla poblada es una migracion de
# esquema que SÍ puede fallar. Se declara la relacion en los dos lados y se
# verifica al leer. Es una decision, no un olvido.
ESQUEMA = """
CREATE TABLE IF NOT EXISTS proyectos (
    id          TEXT PRIMARY KEY,
    nombre      TEXT NOT NULL,
    raiz        TEXT,
    documentos  TEXT NOT NULL DEFAULT '[]',
    figuras     TEXT NOT NULL DEFAULT '[]',
    creado      TEXT NOT NULL,
    actualizado TEXT NOT NULL
)
"""


@dataclass
class Proyecto:
    """Un proyecto. El `id` es la identidad: el nombre puede cambiar."""

    id: str
    nombre: str
    raiz: Optional[str] = None
    documentos: list[str] = field(default_factory=list)
    figuras: list[dict] = field(default_factory=list)
    creado: str = ""

    def a_dict(self) -> dict:
        return {
            "id": self.id,
            "nombre": self.nombre,
            "raiz": self.raiz,
            "documentos": list(self.documentos),
            "figuras": list(self.figuras),
            "creado": self.creado,
        }

    @staticmethod
    def desde_dict(data: dict) -> "Proyecto":
        return Proyecto(
            id=str(data["id"]),
            nombre=str(data["nombre"]),
            raiz=data.get("raiz"),
            documentos=list(data.get("documentos") or []),
            figuras=list(data.get("figuras") or []),
            creado=str(data.get("creado") or ""),
        )


@dataclass
class Sync:
    """Lo que un sync encontro.

    `error` NO es cosmetico. Una carpeta que no se puede leer no significa que
    este vacia: significa que no sabemos que hay adentro. Sin este campo, la
    unica forma de sync es sustituir la lista, y sustituirla cuando no se pudo
    leer deja al usuario sin documentos y sin aviso: un proyecto sin documentos
    parece un proyecto vacio, que es la peor lectura posible de un error que
    quiza ni existe."""

    documentos: list[str]
    error: Optional[str] = None


def projects_db_path() -> Path:
    """LA MISMA base que las sesiones.

    Se delega en `session_manager.DB_PATH` en vez de calcular la ruta otra vez:
    dos funciones que arman la misma ruta son dos lugares donde se puede equivocar
    el nombre del archivo, y el nombre del archivo es lo unico que hace que las
    sesiones y los proyectos sean la misma base y no dos bases parecidas.
    """
    from persistence import session_manager

    if session_manager.DB_PATH is None:
        raise RuntimeError(
            "La base de sesiones no esta inicializada. Llamar a con_storage()."
        )
    return session_manager.DB_PATH


class TiendaProyectos:
    """Los proyectos de UN almacenamiento. Sin estado global a proposito."""

    def __init__(self, storage_dir: Path) -> None:
        self._storage = Path(storage_dir)
        # La sesion define la base; el store solo recuerda el storage para poder
        # reconectarse (que es lo que hace el test al "reiniciar").
        from persistence import session_manager

        session_manager.init_db(self._storage)
        self._asegurar_esquema()

    @property
    def raiz(self) -> Path:
        """El almacenamiento de este store. Publico a proposito: es lo que
        permite cerrar y reabrir, que es como se prueba que algo sobrevive."""
        return self._storage

    def _asegurar_esquema(self) -> None:
        conn = sqlite3.connect(str(projects_db_path()))
        try:
            conn.execute(ESQUEMA)
            conn.commit()
        finally:
            conn.close()

    # ── Leer ──────────────────────────────────────────────────────────────

    def listar(self) -> list[Proyecto]:
        conn = sqlite3.connect(str(projects_db_path()))
        try:
            filas = conn.execute(
                "SELECT id, nombre, raiz, documentos, figuras, creado "
                "FROM proyectos ORDER BY actualizado DESC"
            ).fetchall()
        finally:
            conn.close()
        return [
            Proyecto(
                id=f[0],
                nombre=f[1],
                raiz=f[2],
                documentos=json.loads(f[3] or "[]"),
                figuras=json.loads(f[4] or "[]"),
                creado=f[5],
            )
            for f in filas
        ]

    def obtener(self, proyecto_id: str) -> Optional[Proyecto]:
        conn = sqlite3.connect(str(projects_db_path()))
        try:
            f = conn.execute(
                "SELECT id, nombre, raiz, documentos, figuras, creado "
                "FROM proyectos WHERE id = ?",
                (proyecto_id,),
            ).fetchone()
        finally:
            conn.close()
        if f is None:
            return None
        return Proyecto(
            id=f[0],
            nombre=f[1],
            raiz=f[2],
            documentos=json.loads(f[3] or "[]"),
            figuras=json.loads(f[4] or "[]"),
            creado=f[5],
        )

    # ── Escribir ───────────────────────────────────────────────────────────

    def crear(
        self,
        nombre: str,
        raiz: Optional[str],
        documentos: Optional[list[str]] = None,
        figuras: Optional[list[dict]] = None,
    ) -> Proyecto:
        """Un proyecto nuevo.

        Sin nombre NO hay proyecto. La respuesta es una excepcion y no un
        proyecto con nombre vacio: el frontend lanza por lo mismo, y un nombre
        vacio guardado es un titulo invisible en pantalla, que es peor que no
        tener ninguno porque no dice que no lo tiene.
        """
        limpio = (nombre or "").strip()
        if not limpio:
            raise ValueError("Un proyecto necesita un nombre.")
        ahora = datetime.now(timezone.utc).isoformat()
        proyecto = Proyecto(
            id=uuid.uuid4().hex,
            nombre=limpio,
            raiz=raiz,
            documentos=list(documentos or []),
            figuras=list(figuras or []),
            creado=ahora,
        )
        self.guardar(proyecto)
        return proyecto

    def guardar(self, proyecto: Proyecto) -> Proyecto:
        """Guardar por `id`. Volver a guardar el mismo proyecto lo ACTUALIZA, no
        lo duplica: sin esto, un sync repetido multiplicaba el proyecto entero."""
        conn = sqlite3.connect(str(projects_db_path()))
        try:
            conn.execute(
                "INSERT OR REPLACE INTO proyectos "
                "(id, nombre, raiz, documentos, figuras, creado, actualizado) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    proyecto.id,
                    proyecto.nombre,
                    proyecto.raiz,
                    json.dumps(proyecto.documentos),
                    json.dumps(proyecto.figuras),
                    proyecto.creado or datetime.now(timezone.utc).isoformat(),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
            conn.commit()
        finally:
            conn.close()
        return proyecto

    def borrar(self, proyecto_id: str) -> bool:
        conn = sqlite3.connect(str(projects_db_path()))
        try:
            cur = conn.execute("DELETE FROM proyectos WHERE id = ?", (proyecto_id,))
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()

    # ── Sync: releer el disco ─────────────────────────────────────────────

    def sync(self, proyecto: Proyecto) -> Sync:
        """Relee la carpeta del proyecto y deja la lista igual que el disco.

        IDEMPOTENTE POR SUSTITUCION, NO POR UNION. La union —agregar lo que se
        encuentre— es la tentacion, y es la que hace que el lista crezca en cada
        pulsacion: tres capitulos se vuelven seis y el usuario no sabe por que.

        Y ante un error de lectura se CONSERVA lo que habia. Ver `Sync.error`.
        """
        if not proyecto.raiz:
            return Sync(documentos=list(proyecto.documentos), error="El proyecto no tiene carpeta.")
        raiz = Path(proyecto.raiz)
        try:
            entradas = sorted(raiz.iterdir())
        except OSError as e:
            return Sync(documentos=list(proyecto.documentos), error=str(e))

        documentos: list[str] = []
        for entrada in entradas:
            # Un enlace simbolico sale del proyecto: el alcance es la carpeta, y
            # seguir enlaces deja que el contenido de otro disco aparezca como
            # si fuera parte de este trabajo.
            if entrada.is_symlink() or not entrada.is_file():
                continue
            nombre = entrada.name
            if not nombre.lower().endswith(".docx"):
                continue
            # El `~$` es el archivo temporal que Word deja abierto. No es un
            # capitulo, es el rastro de que Word todavia lo tiene abierto.
            if nombre.startswith("~$"):
                continue
            documentos.append(nombre)

        proyecto.documentos = documentos
        self.guardar(proyecto)
        return Sync(documentos=documentos)

    def cerrar(self) -> None:
        """Cerrar es una operacion de proceso, no un acto de gestion.

        No hay conexion abierta —cada metodo abre y cierra la suya, que es lo que
        hace que dos hilos no se pisen—, asi que este metodo existe para que el
        "reinicio" del test sea explicito y no un truco. No hacer trabajo aqui.
        """
        return None


def con_storage(storage_dir: Path) -> TiendaProyectos:
    """El store de proyectos de UN almacenamiento."""
    return TiendaProyectos(storage_dir)


def cerrar() -> None:
    """Olvidar el almacenamiento abierto.

    No hay conexion global que cerrar —cada metodo abre y cierra la suya—, asi
    que esto NO desarma nada: existe para que el aislamiento del test sea
    explicito en vez de depender del orden en que corren las pruebas. Sin esto,
    el `session_manager.DB_PATH` global sobrevive entre tests y uno hereda la
    base del anterior, que es la forma de que un test mida el almacenamiento de
    otro.
    """
    from persistence import session_manager

    session_manager.DB_PATH = None
