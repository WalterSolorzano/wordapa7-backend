from types import SimpleNamespace

from parsing.docx_parser import runs_mayoria_negrita


def _run(text, bold=False):
    return SimpleNamespace(text=text, bold=bold, italic=False, font=None, name=None)


def test_un_solo_run_negrita_no_es_mayoria():
    runs = [_run("Texto "), _run("importante", bold=True), _run(" normal del párrafo.")]
    assert runs_mayoria_negrita(runs) is False


def test_mayoria_en_negrita_es_titulo():
    runs = [_run("Título ", bold=True), _run("completo ", bold=True), _run("normal")]
    assert runs_mayoria_negrita(runs) is True


def test_runs_sin_texto_no_cuentan():
    assert runs_mayoria_negrita([_run("   "), _run("", bold=True)]) is False


def test_lista_vacia_es_false():
    assert runs_mayoria_negrita([]) is False
