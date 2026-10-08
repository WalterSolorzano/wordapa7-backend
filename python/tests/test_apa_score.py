import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from modules.apa_score import compute


def _doc():
    cover = ["UNAN", "Facultad", "Autor", "2026"]
    body = ["Introducci?n", "La producci?n moderna exige an?lisis profundo y continuo. " * 5,
            "1.1. Contexto", "El contexto industrial requiere planificaci?n detallada. " * 5,
            "(Heizer, 2017) afirma que la gesti?n es clave.",
            "Referencias",
            "Heizer, J., & Render, B. (2017). Principios de administraci?n de operaciones. Pearson."]
    return cover + body


def test_doc_bueno_alto():
    r = compute(_doc(), tables=0, figures=0)
    assert r["total"] >= 70
    assert any(c["id"] == "portada" and c["score"] == 100 for c in r["categories"])


def test_sin_portada_baja():
    r = compute(["Texto suelto sin nada"], 0, 0)
    assert r["total"] < 70
    assert r["top_issues"]


def test_captions_faltantes_detectadas():
    d = _doc()
    d.append("Tabla 1")  # 1 tabla declarada visualmente por cliente
    r = compute(d, tables=2, figures=0)  # cliente dice que hay 2 tablas reales
    tf = next(c for c in r["categories"] if c["id"] == "tablasfig")
    assert tf["score"] < 100
