"""FASE 2 — cortes de página y page_setup con un doc COM falso (sin Word)."""
import sys
import pathlib
import types

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


class FakeRange:
    def __init__(self, start, end):
        self.Start = start
        self.End = end

    def Information(self, code):
        # Página = posición // 100 + 1 (quiebres artificiales en 100 y 200).
        assert code == 3
        return self.Start // 100 + 1


class FakeDoc:
    def Range(self, a, b):
        return FakeRange(a, b)

    class PageSetup:
        PageWidth = 612.0
        PageHeight = 792.0
        TopMargin = 72.0
        BottomMargin = 72.0
        LeftMargin = 72.0
        RightMargin = 72.0

    PageSetup = PageSetup()


def test_cuts_binary_search_multi_pagina():
    from parsing.page_layout_provider import cuts_for_range
    cuts = cuts_for_range(FakeDoc(), FakeRange(0, 250))
    assert cuts == [{"offset": 100, "page": 2},
                    {"offset": 200, "page": 3}]


def test_cuts_parrafo_no_cruza_devuelve_vacio():
    from parsing.page_layout_provider import cuts_for_range
    assert cuts_for_range(FakeDoc(), FakeRange(0, 50)) == []
    assert cuts_for_range(FakeDoc(), FakeRange(10, 11)) == []


def test_cuts_fallo_com_devuelve_vacio():
    from parsing.page_layout_provider import cuts_for_range

    class Broken:
        Start = 0
        End = 500

        def Information(self, code):
            raise RuntimeError("colgado")

    class BrokenDoc:
        def Range(self, a, b):
            raise RuntimeError("colgado")

    assert cuts_for_range(BrokenDoc(), Broken()) == []


def test_page_setup_dict():
    from parsing.page_layout_provider import page_setup_dict
    assert page_setup_dict(FakeDoc()) == {
        "width_pt": 612.0, "height_pt": 792.0,
        "margin_top_pt": 72.0, "margin_bottom_pt": 72.0,
        "margin_left_pt": 72.0, "margin_right_pt": 72.0,
    }


def test_page_setup_fallo_devuelve_none():
    from parsing.page_layout_provider import page_setup_dict
    assert page_setup_dict(object()) is None


# ── FASE 2 fix: paragraph_pages = página de INICIO (rango colapsado) ──────

class _OpenParaRange:
    """Rango ABIERTO del párrafo (250→350, cruza el quiebre en 300).

    Information(3) sobre rango abierto modela el wdActiveEndPageNumber REAL
    de Word: devuelve la página del FIN (4), no la de inicio (3).
    """

    def __init__(self, start, end):
        self.Start = start
        self.End = end

    def Information(self, code):
        assert code == 3
        return self.End // 100 + 1  # fin → 4; inicio real: 3


class _OpenPara:
    """Párrafo falso cuyo .Range es el rango abierto 250→350."""

    def __init__(self, start, end):
        self.Range = _OpenParaRange(start, end)


class _MultiPageDoc:
    """Doc COM falso. Las sondas colapsadas doc.Range(p, p) dan la página
    por POSICIÓN (FakeRange usa Start → coincide con el inicio)."""

    PageSetup = FakeDoc.PageSetup

    def __init__(self):
        self.para = _OpenPara(250, 350)

    @property
    def Paragraphs(self):
        return [self.para]

    def Range(self, a, b):
        return FakeRange(a, b)

    def Repaginate(self):
        pass

    def ComputeStatistics(self, code):
        assert code == 2
        return 4

    def Close(self, SaveChanges=False):
        pass


def _do_paginate_fakes(monkeypatch, doc):
    """Ejecuta COMPageLayoutProvider._do_paginate con pythoncom y Word falsos."""
    fake_pythoncom = types.ModuleType("pythoncom")
    fake_pythoncom.CoInitialize = lambda: None
    fake_pythoncom.CoUninitialize = lambda: None
    monkeypatch.setitem(sys.modules, "pythoncom", fake_pythoncom)

    fake_word = types.SimpleNamespace(
        Visible=True,
        DisplayAlerts=0,
        Documents=types.SimpleNamespace(Open=lambda *a, **k: doc),
    )
    fake_wcs = types.ModuleType("services.word_com_service")
    fake_wcs.get_word_com_service = lambda: types.SimpleNamespace(word=fake_word)
    monkeypatch.setitem(sys.modules, "services.word_com_service", fake_wcs)

    from parsing.page_layout_provider import COMPageLayoutProvider
    return COMPageLayoutProvider()._do_paginate(pathlib.Path("live.docx"), True)


def test_paragraph_pages_usa_inicio_no_fin(monkeypatch):
    """paragraph_pages[i] = página de INICIO (rango colapsado vía _page_at),
    no el FIN wdActiveEndPageNumber del rango abierto. Coherente con
    cuts[].page: el primer corte de un párrafo que cruza es > page_start."""
    result = _do_paginate_fakes(monkeypatch, _MultiPageDoc())
    # Párrafo 250→350 cruza en 300: INICIO = pág 3 (rango abierto daría 4).
    assert result.paragraph_pages == [3]
    assert result.paragraph_cuts == [[{"offset": 50, "page": 4}]]
    # Coherencia interna: page_start 3 con corte "hacia" 4 es visible.
    assert result.paragraph_cuts[0][0]["page"] > result.paragraph_pages[0]
    assert result.total_pages == 4
    assert result.page_setup is not None


def test_do_paginate_sonda_com_falla_propaga_sin_none(monkeypatch):
    """Modo de fallo definido: si la sonda _page_at falla o devuelve None,
    la excepción PROPAGA desde _do_paginate (→ servicio unavailable, igual
    que la sonda abierta previa). Nunca None silencioso en paragraph_pages."""
    class BrokenDoc(_MultiPageDoc):
        def Range(self, a, b):
            raise RuntimeError("colgado")

    with pytest.raises(RuntimeError, match="colgado"):
        _do_paginate_fakes(monkeypatch, BrokenDoc())

    # Sonda COM que "traga" el error y devuelve None → int(None) revienta.
    class NoneDoc(_MultiPageDoc):
        class _NoneRange:
            Start = 0
            End = 0

            def Information(self, code):
                return None

        def Range(self, a, b):
            return NoneDoc._NoneRange()

    with pytest.raises(TypeError):
        _do_paginate_fakes(monkeypatch, NoneDoc())
