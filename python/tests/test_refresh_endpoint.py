"""El endpoint de refresco, y sobre todo el archivo a medio escribir.

`diff_por_elemento` ya tiene sus pruebas en `test_word_refresh.py`. Esto cubre lo
que no se puede probar desde alla: la RUTA, y el caso que mas cuesta money si se
rompe.

EL CASO DEL ZIP. Un `.docx` es un ZIP, y Word lo reescribe entero en cada
guardado. Si el watcher lee el archivo en medio de eso, `zipfile` revienta con
`BadZipFile`. La tentacion es convertirlo en un 500, y el resultado es un error
en la cara de alguien que esta escribiendo: el peor lugar posible para un error
que se resuelve solo con el siguiente Ctrl+S.

Por eso el `BadZipFile` responde `{"listo": false}` y NO es un error. Y la
prueba lo comprueba por lo que NO hace: no levanta excepcion, y dice
explicitamente que todavia no. Un test que solo verifica el codigo de estado
pasaria con un 500 adentro de un `detail`, que es justamente el bug.

Y LA RUTA VIENE DEL FRONTEND. El backend no sabe donde tiene el archivo la
persona: Word escribe sobre el suyo, no sobre la copia de la sesion
(`sessions/<id>/original.docx`). Se valida que sea `.docx` y que exista, porque
es leer un archivo del disco desde un backend de localhost: la confianza es de
proceso, pero "de proceso" no es "sin verificar".
"""

import io
import sys
import zipfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException  # noqa: E402


def _docx_valido(destino: Path) -> Path:
    """Un .docx mínimo pero real: un zip con el content-types que python-docx
    exige. No alcanza con un zip vacío porque `parse_docx_bytes` lo abriría."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
            '</Types>',
        )
        z.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
            '</Relationships>',
        )
        z.writestr(
            "word/document.xml",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            '<w:body><w:p><w:r><w:t>Metodologia</w:t></w:r></w:p></w:body></w:document>',
        )
    destino.write_bytes(buf.getvalue())
    return destino


def test_un_docx_a_medio_escribir_NO_es_un_error(tmp_path, monkeypatch):
    """El caso caro. Word reescribe el archivo entero en cada guardado, y el
    watcher mira cada 5 segundos: la probabilidad de caer en medio de una
    escritura no es cero, es alta."""
    from routers import sessions as S

    roto = tmp_path / "Tesis.docx"
    # bytes que NO son un zip: lo que se ve a mitad de una escritura
    roto.write_bytes(b"PK\x03\x04" + b"\x00" * 200)

    monkeypatch.setattr(S, "load_session_state", lambda sid, d: _doc_minimo())
    monkeypatch.setattr(S, "STORAGE_DIR", tmp_path)

    import asyncio

    r = asyncio.run(S.refresh_from_word("s1", str(roto)))

    # No es un error: es "todavia no".
    assert r["listo"] is False
    assert r["cambiado"] is False
    assert r["motivo"] == "archivo_a_medio_escribir"
    # Y no reporta ningun elemento, para que el llamador no lo lea como "no
    # cambio nada" —que es distinto de "no se pudo mirar".
    assert r["ids_nuevos"] == [] and r["ids_eliminados"] == []


def test_una_ruta_que_no_es_docx_se_rechaza(tmp_path, monkeypatch):
    from routers import sessions as S

    monkeypatch.setattr(S, "load_session_state", lambda sid, d: _doc_minimo())
    monkeypatch.setattr(S, "STORAGE_DIR", tmp_path)

    import asyncio

    otro = tmp_path / "notas.txt"
    otro.write_text("hola")
    with pytest.raises(HTTPException) as e:
        asyncio.run(S.refresh_from_word("s1", str(otro)))
    assert e.value.status_code == 400


def test_una_ruta_que_no_existe_dice_cual_falta(tmp_path, monkeypatch):
    """El error dice el NOMBRE del archivo, no la ruta entera: la ruta local
    completa de una persona no tiene por qué aparecer en un mensaje de error
    que se puede ver en una captura."""
    from routers import sessions as S

    monkeypatch.setattr(S, "load_session_state", lambda sid, d: _doc_minimo())
    monkeypatch.setattr(S, "STORAGE_DIR", tmp_path)

    import asyncio

    with pytest.raises(HTTPException) as e:
        asyncio.run(S.refresh_from_word("s1", str(tmp_path / "NoEsta.docx")))
    assert e.value.status_code == 404
    assert "NoEsta.docx" in str(e.value.detail)
    assert str(tmp_path) not in str(e.value.detail)


def test_una_sesion_inexistente_dice_que_no_encuentra_la_sesion(tmp_path, monkeypatch):
    """No es lo mismo "no existe el archivo" que "no existe la sesión", y el
    llamador reacciona distinto: uno reintenta, el otro abre un documento."""
    from routers import sessions as S

    monkeypatch.setattr(S, "load_session_state", lambda sid, d: None)
    monkeypatch.setattr(S, "STORAGE_DIR", tmp_path)

    import asyncio

    docx = _docx_valido(tmp_path / "Tesis.docx")
    with pytest.raises(HTTPException) as e:
        asyncio.run(S.refresh_from_word("s1", str(docx)))
    assert e.value.status_code == 404


def test_un_docx_valido_llega_al_parser_y_devuelve_el_contrato(tmp_path, monkeypatch):
    """Un docx que Word sí escribió se lee, se parsea con el MISMO parser del
    upload y devuelve el contrato completo. Si el contrato cambia, el frontend
    se entera acá y no en producción."""
    from routers import sessions as S

    monkeypatch.setattr(S, "load_session_state", lambda sid, d: _doc_minimo())
    monkeypatch.setattr(S, "STORAGE_DIR", tmp_path)
    monkeypatch.setattr(S, "save_session_state", lambda doc, d: None)

    docx = _docx_valido(tmp_path / "Tesis.docx")
    docx_antes = _docx_valido(tmp_path / "Antes.docx")
    # El estado guardado tiene el mismo texto que el archivo: no hay cambios.
    monkeypatch.setattr(S, "load_session_state", lambda sid, d: _doc_con_texto("Metodologia"))

    import asyncio

    r = asyncio.run(S.refresh_from_word("s1", str(docx)))
    assert r["listo"] is True
    for clave in ("cambiado", "hash_estructura", "elementos", "ids_nuevos",
                  "ids_eliminados", "session_id"):
        assert clave in r, f"el contrato no declara {clave}"
    assert r["session_id"] == "s1"
    assert r["cambiado"] is False


def _doc_minimo():
    from models import DocumentModel
    return DocumentModel(session_id="s1", file_name="t.docx", elements=[])


def _doc_con_texto(texto: str):
    from models import DocumentModel, ElementModel
    return DocumentModel(
        session_id="s1",
        file_name="t.docx",
        elements=[ElementModel(id="a", type="paragraph", heading_level=None, text=texto)],
    )
