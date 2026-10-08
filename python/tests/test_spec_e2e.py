"""E2E: spec real -> generacion completa -> descarga con bytes validos."""
import base64
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session", autouse=True)
def _ensure_template():
    """Crea la plantilla APA base una vez (en tests no corre el lifespan)."""
    from config import get_apa7_template_path
    p = get_apa7_template_path()
    if not p.exists():
        from create_template import create_apa7_template
        create_apa7_template(p)


@pytest.fixture
def client():
    """TestClient sin context manager (evita lifespan/COM)."""
    from main import app
    return TestClient(app)


def test_spec_full_generation_and_download(client, tmp_path):
    """Genera un docx real (pipeline COM/LO) y lo descarga."""
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBg"
        "AAAABQABh6FO1AAAAABJRU5ErkJggg==")
    img = tmp_path / "equipo.png"
    img.write_bytes(png)

    spec = {
        "spec_version": "1",
        "output": {"filename": "e2e_prueba.docx"},
        "elements": [
            {"type": "heading", "level": 1, "text": "1. Introduccion"},
            {"type": "paragraph", "text": "Parrafo de prueba E2E."},
            {"type": "table", "caption": "Tabla 1", "title": "Consumo",
             "columns": ["Mes", "kWh"], "rows": [["Enero", "133"]]},
            {"type": "equipment_card", "number": "A1", "title": "Equipo",
             "image": str(img), "specs": {"Potencia": "120 W"}},
        ],
        "presets": {"layout": "layout_uni", "table": "tabla_apa_generica"},
    }
    r = client.post("/api/spec", json=spec)
    assert r.status_code == 200, r.text
    body = r.json()

    # El contrato clave: la sesion sigue viva y el archivo descarga en PK
    dl = client.get(body["download_url"])
    assert dl.status_code == 200
    assert dl.content[:2] == b"PK"
    assert len(dl.content) > 5000

    # CONTRATO DE CONTENIDO: el docx debe llevar lo pedido en el spec
    # (un template vacio ya pesa ~36KB; sin este assert el doc vacio pasa)
    import io
    import re
    import zipfile

    with zipfile.ZipFile(io.BytesIO(dl.content)) as z:
        xml = z.read("word/document.xml").decode("utf-8", "ignore")
    text = re.sub(r"<[^>]+>", "", xml)   # concatena w:t de runs partidos
    assert "1. Introduccion" in text, "heading ausente: docx vacio"
    assert "Parrafo de prueba E2E." in text, "parrafo ausente: docx vacio"
    assert "133" in text, "celda de tabla ausente"
    assert "Enero" in text, "celda de tabla ausente"


def test_spec_cover_scratch_portada_sintetica(client):
    """cover sin template (modo scratch) -> portada sintetica APA 7 real."""
    spec = {
        "spec_version": "1",
        "elements": [
            {"type": "heading", "level": 1, "text": "1. Marco teorico"},
            {"type": "paragraph", "text": "Parrafo tras la portada."},
        ],
        "cover": {
            "title": "Balance del Consumo Electrico",
            "author": "Walter Noel Solorzano",
            "institution": "Universidad Nacional de Ingenieria",
            "course": "Tecnologia y Medio Ambiente",
            "instructor": "Ing. Eva Mairena",
            "date": "02 de octubre de 2026",
        },
    }
    r = client.post("/api/spec", json=spec)
    assert r.status_code == 200, r.text
    dl = client.get(r.json()["download_url"])
    assert dl.status_code == 200
    assert dl.content[:2] == b"PK"

    import io
    import re
    import zipfile
    with zipfile.ZipFile(io.BytesIO(dl.content)) as z:
        xml = z.read("word/document.xml").decode("utf-8", "ignore")
    text = re.sub(r"<[^>]+>", "", xml)
    assert "Balance del Consumo Electrico" in text, "titulo de portada ausente"
    assert "Walter Noel Solorzano" in text, "autor de portada ausente"
    assert "Universidad Nacional de Ingenieria" in text, "institucion ausente"
    assert "1. Marco teorico" in text, "cuerpo ausente"


def test_spec_cover_template_builtin_e2e(client):
    """cover con template builtin -> portada aplicada y cuerpo intacto."""
    spec = {
        "spec_version": "1",
        "elements": [
            {"type": "heading", "level": 1, "text": "2. Marco conceptual"},
            {"type": "paragraph",
             "text": "Parrafo tras portada con template."},
        ],
        "cover": {
            "template": "APA 7 Estudiante",
            "title": "Balance Energetico Vivienda",
            "author": "Walter Noel Solorzano",
            "institution": "Universidad Nacional de Ingenieria",
            "course": "Tecnologia y Medio Ambiente",
            "instructor": "Ing. Eva Mairena",
            "date": "02 de octubre de 2026",
        },
    }
    r = client.post("/api/spec", json=spec)
    assert r.status_code == 200, r.text
    dl = client.get(r.json()["download_url"])
    assert dl.status_code == 200
    assert dl.content[:2] == b"PK"

    import io
    import re
    import zipfile
    with zipfile.ZipFile(io.BytesIO(dl.content)) as z:
        xml = z.read("word/document.xml").decode("utf-8", "ignore")
    text = re.sub(r"<[^>]+>", "", xml)
    assert "Balance Energetico Vivienda" in text, (
        "datos de portada ausentes: template no aplicado")
    assert "2. Marco conceptual" in text, "cuerpo ausente"
    assert "Parrafo tras portada con template." in text
