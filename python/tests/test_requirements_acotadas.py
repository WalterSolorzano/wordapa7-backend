"""`requirements.txt` no puede dejar que un pin roto rompa el arranque.

QUE PASO, con nombre y apellido. `fastapi>=0.111.0` sin techo dejo entrar la
0.118, cuya metadata exige `starlette<0.49.0`. En la misma maquina habia un
`starlette` nuevo pedido por otro paquete. El resolver no puede satisfacer las
dos cosas, asi que eligio: instalo el starlette nuevo y dejo fastapi
insatisfecho. Resultado: `python python/main.py` moria en el import con
`TypeError: Router.__init__() got an unexpected keyword argument 'on_startup'`,
y el comando de desarrollo del README dejaba de existir.

UN TECHO NO ES TIMIDEZ. Es la unica forma de que el resolver no tenga que elegir
entre dos paquetes: si fastapi esta acotado arriba, su version y la de starlette
se mueven juntas o no se mueven. Sin techo, "actualizar dependencias" es
"descubrir que la app no arranca".

La version con la que se corre y se testea es la 0.141.x (starlette 1.x, sin tope
propio), asi que el techo se ancla ahi.
"""
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

REQUIREMENTS = pathlib.Path(__file__).resolve().parents[2] / "requirements.txt"
LINEAS = [
    linea.strip()
    for linea in REQUIREMENTS.read_text(encoding="utf-8").splitlines()
    if linea.strip() and not linea.strip().startswith("#")
]


def _pines(nombre: str) -> list[str]:
    patron = re.compile(rf"^{re.escape(nombre)}\s*[<>=!~]", re.IGNORECASE)
    return [linea for linea in LINEAS if patron.match(linea)]


class TestFastapiAcotada:
    def test_fastapi_declara_un_techo_de_version(self):
        pines = _pines("fastapi")
        assert pines, "fastapi desaparecio de requirements.txt"
        sin_techo = [p for p in pines if "<" not in p]
        assert not sin_techo, (
            "fastapi sin techo: el resolver puede instalar una version cuya "
            f"starlette sea incompatible y el arranque muere en el import. {sin_techo}"
        )


class TestStarletteSeDeclara:
    def test_starlette_es_una_dependencia_declarada(self):
        """Llega por fastapi, pero el tope real vive en su metadata.

        Declararla deja el pin a la vista de quien lea el archivo, en vez de
        escondido en la metadata de un paquete que igual la puede mover.
        """
        assert _pines("starlette"), "starlette no esta declarada en requirements.txt"
