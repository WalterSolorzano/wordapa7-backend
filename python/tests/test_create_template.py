"""Mejora #3: plantilla APA 7 unica y verificada por hash (E-04).

Indices de comportamiento de `ensure_apa7_template`:
1. Archivo ausente -> crea la plantilla y sella su sha256 en sidecar.
2. Sello coincide -> devuelve la ruta sin regenerar (plantilla intacta).
3. Sello no coincide (archivo corrupto o ajeno) -> regenera y vuelve a sellar.
4. Archivo valido sin sello -> lo ADOPTA sellandolo sin regenerar: la
   plantilla esta trackeada en git y regenerarla ensuciaria el arbol.
"""

import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import create_template as ct
import docx
from create_template import create_apa7_template, ensure_apa7_template


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _sidecar(path: Path) -> Path:
    return path.with_name(path.name + ".sha256")


def test_archivo_ausente_crea_y_sella(tmp_path):
    p = tmp_path / "apa7_template.docx"
    assert not p.exists()

    out = ensure_apa7_template(p)

    assert out == p
    assert p.exists()
    docx.Document(str(p))          # es un .docx real y valido
    assert _sidecar(p).exists()
    assert _sidecar(p).read_text(encoding="ascii").strip() == _sha256(p)


def test_sello_valido_no_regenera(tmp_path, monkeypatch):
    p = tmp_path / "apa7_template.docx"
    ensure_apa7_template(p)
    mtime = p.stat().st_mtime_ns

    def _no_regenerar(*_a, **_k):
        raise AssertionError("plantilla sellada intacta no debe regenerarse")

    monkeypatch.setattr(ct, "create_apa7_template", _no_regenerar)
    out = ensure_apa7_template(p)

    assert out == p
    assert p.stat().st_mtime_ns == mtime


def test_corrupcion_regenera_y_re_sella(tmp_path):
    p = tmp_path / "apa7_template.docx"
    ensure_apa7_template(p)
    p.write_bytes(b"esto no es un docx")     # rompe el sello

    out = ensure_apa7_template(p)

    assert out == p
    docx.Document(str(p))                    # vuelve a ser docx valido
    assert _sidecar(p).read_text(encoding="ascii").strip() == _sha256(p)


def test_sin_sello_adopta_sin_regenerar(tmp_path, monkeypatch):
    p = tmp_path / "apa7_template.docx"
    create_apa7_template(p)                  # valida pero sin sello (upgrade)
    calls = []
    real = ct.create_apa7_template

    def _spy(path):
        calls.append(Path(path))
        return real(path)

    monkeypatch.setattr(ct, "create_apa7_template", _spy)
    out = ensure_apa7_template(p)

    assert out == p
    assert calls == [], "adoptar no debe regenerar la plantilla"
    assert _sidecar(p).exists()
    assert _sidecar(p).read_text(encoding="ascii").strip() == _sha256(p)
