"""Tests del resolvedor de DOI:.normalize es puro, crossref_to_reference usa un
fixture. Ninguno de los dos toca la red.

Por que existe: `addin_references_store.add_citation` crea una referencia
"fantasma" con `is_draft: True` y el comentario "el usuario podra completarla/
resolver DOI luego". Eso era el resolver.

Y por que NO arregla el plagio: de un DOI sale METADATA (autores, ano, titulo),
que es lo que necesita APA 7, no el TEXTO de la fuente, que es lo que necesita
medir similitud. Son dos problemas distintos. Ver la nota de R-G74 en
`phase_scope`.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from modules.doi_resolver import (  # noqa: E402
    crossref_to_reference,
    normalize_doi,
)
from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

# In-process, sin context manager: no dispara los lifespan events.
client = TestClient(app)

# ── normalize_doi: puro, sin red ─────────────────────────────────────────────


def test_doi_desnudo():
    assert normalize_doi("10.1016/j.educ.2024.001") == "10.1016/j.educ.2024.001"


def test_doi_con_prefijo():
    assert normalize_doi("doi:10.1590/0123-4405") == "10.1590/0123-4405"
    assert normalize_doi("DOI: 10.1590/0123-4405") == "10.1590/0123-4405"


def test_doi_con_url_de_resolutor():
    assert normalize_doi("https://doi.org/10.1590/0123-4405") == "10.1590/0123-4405"
    assert normalize_doi("http://dx.doi.org/10.1590/0123-4405") == "10.1590/0123-4405"
    assert normalize_doi("https://dx.doi.org/10.1590/0123-4405") == "10.1590/0123-4405"


def test_doi_con_espacios_alrededor():
    assert normalize_doi("  10.1016/j.educ.2024.001  ") == "10.1016/j.educ.2024.001"


def test_punto_final_se_corta():
    # Escribir el DOI con punto al final es el error mas comun al pegarlo.
    assert normalize_doi("10.1016/j.educ.2024.001.") == "10.1016/j.educ.2024.001"
    assert normalize_doi("10.1016/j.educ.2024.001,") == "10.1016/j.educ.2024.001"


def test_una_url_que_no_es_de_doi_no_inventa_un_doi():
    # Un link de consulta de Google Scholar o de una revista no es un DOI. Si lo
    # tratáramos como tal, la peticion a CrossRefARIA 404 y el usuario veria un
    # error de red en vez de "esto no es un DOI".
    assert normalize_doi("https://scholar.google.com/citations?user=abc") is None
    assert normalize_doi("https://www.sciencedirect.com/science/article/pii/X") is None
    assert normalize_doi("https://mi-universidad.edu/tesis/123") is None


def test_texto_vacio_o_basura():
    assert normalize_doi("") is None
    assert normalize_doi("hola") is None
    assert normalize_doi("2024") is None


# ── crossref_to_reference: mapeo desde un fixture, sin red ───────────────────

WORK = {
    "DOI": "10.1016/j.educ.2024.001",
    "type": "journal-article",
    "title": ["Desercion estudiantil en el turno nocturno"],
    "container-title": ["Revista de Educacion Superior"],
    "author": [
        {"given": "Ana", "family": "Perez"},
        {"given": "Luis", "family": "Garcia"},
        {"given": "Marta", "family": "Lopez"},
    ],
    "issued": {"date-parts": [[2024, 5, 12]]},
    "volume": "18",
    "issue": "2",
    "page": "45-67",
    "publisher": "Editorial Universitaria",
}


def test_mapea_autores_anio_titulo_y_fuente():
    ref = crossref_to_reference(WORK)
    assert ref["authors"] == ["Perez, A.", "Garcia, L.", "Lopez, M."]
    assert ref["year"] == "2024"
    assert ref["title"] == "Desercion estudiantil en el turno nocturno"
    assert ref["source"] == "Revista de Educacion Superior"
    assert ref["doi_or_url"] == "10.1016/j.educ.2024.001"


def test_tres_autores_en_apa_mas_et_al():
    # APA 7: hasta 20 autores se listan; con mas de 20 va el primero mas et al.
    # Este caso tiene que carryarlos a los tres.
    assert len(crossref_to_reference(WORK)["authors"]) == 3


def test_mas_de_veinte_autores_usa_la_elipsis_de_apa():
    # APA 7: con 21+ autores van los primeros 19, la elipsis y el ULTIMO. La
    # version "el primero y et al." no existe en APA y ademas producia
    # "A., & et al." porque el formateador ponia "&" antes del centinela.
    from modules.addin_references_store import APA_ELLIPSIS
    muchos = dict(WORK, author=[{"given": f"N{i}", "family": f"Ap{i}"} for i in range(25)])
    ref = crossref_to_reference(muchos)
    assert len(ref["authors"]) == 21
    assert ref["authors"][0] == "Ap0, N."
    assert ref["authors"][19] == APA_ELLIPSIS
    assert ref["authors"][20] == "Ap24, N."
    apa = ref["formatted_apa"]
    assert "et al." not in apa
    assert "& et al." not in apa
    assert apa.count(APA_ELLIPSIS) == 1
    assert apa.endswith("Ap24, N. (2024).") or "Ap24, N. (2024)" in apa


def test_conserva_el_doi_sin_arbolito_apa():
    ref = crossref_to_reference(WORK)
    # El DOI crudo, no https://doi.org/: `addin_references_store` ya lo
    # convierte y duplicarlo dejaria el link dos veces en la referencia.
    assert not ref["doi_or_url"].startswith("http")


def test_un_sin_anio_usa_s_f():
    ref = crossref_to_reference({k: v for k, v in WORK.items() if k != "issued"})
    assert ref["year"] == "s.f."


def test_una_obra_sin_autor_no_inventa_uno():
    ref = crossref_to_reference({k: v for k, v in WORK.items() if k != "author"})
    assert ref["authors"] == []
    assert ref["year"] == "2024"


def test_el_resultado_no_es_un_draft():
    # `is_draft` es lo que hace que la referencia aparezca como sugerida y no
    # como definitiva. Resolver un DOI la convierte en definitiva.
    assert crossref_to_reference(WORK)["is_draft"] is False


def test_el_texto_apa_ya_veniene_armado():
    # El formateo es de `addin_references_store`, NO de aca: dos formateadores de
    # APA divergen solos, que es lo que pasó con el catálogo de Bloom.
    ref = crossref_to_reference(WORK)
    assert ref["formatted_apa"].startswith("Perez, A., Garcia, L., & Lopez, M. (2024).")
    assert "Revista de Educacion Superior" in ref["formatted_apa"]


def test_titulo_vacio_no_produce_una_referencia_rota():
    ref = crossref_to_reference({"DOI": "10.1/x", "issued": {"date-parts": [[2020]]}})
    assert ref["title"] == ""
    assert ref["doi_or_url"] == "10.1/x"


# ── El endpoint: la UNICA parte que toca la red ──────────────────────────────

WORK_UNO = {
    "DOI": "10.1016/j.educ.2024.001",
    "type": "journal-article",
    "title": ["Desercion estudiantil en el turno nocturno"],
    "container-title": ["Revista de Educacion Superior"],
    "author": [{"given": "Ana", "family": "Perez"}],
    "issued": {"date-parts": [[2024, 5, 12]]},
}


def test_resuelve_un_doi_y_lo_devuelve_en_la_forma_del_store(monkeypatch):
    from routers import references as addin_router

    async def falso_get(url, **kw):
        class R:
            status_code = 200

            def json(self_inner):
                return {"status": "ok", "message": WORK_UNO}
        return R()

    monkeypatch.setattr(addin_router.httpx, "AsyncClient", _ClienteFalso(falso_get))
    r = client.post("/api/resolve-doi", json={"doi": "https://doi.org/10.1016/j.educ.2024.001"})
    assert r.status_code == 200
    data = r.json()
    # El contrato que lee `documentSlice.resolveDoiReference`: PLANO, con
    # `apa_formatted`. Se devuelve plano porque ese es el que esta en uso.
    assert data["authors"] == ["Perez, A."]
    assert data["title"] == "Desercion estudiantil en el turno nocturno"
    assert data["apa_formatted"].startswith("Perez, A. (2024).")


def test_lo_que_no_es_doi_ni_url_se_rechaza_antes_de_la_red(monkeypatch):
    # Nada de red: se rechaza antes. Un 404 de CrossRef seria un error de red
    # cuando lo que paso es que el usuario pego otra cosa.
    #
    # Este test afirmaba `no_es_doi` con un link de Google Scholar como entrada.
    # Desde que el endpoint tambien resuelve ENLACES WEB (commit f9f360f), un
    # link es una entrada VALIDA —no un rechazo—, asi que la guarda se re-apunta
    # a lo que de verdad no es ni DOI ni URL. De paso deja de hacer red real, que
    # era la razon de que fuera inestable.
    r = client.post("/api/resolve-doi",
                    json={"doi": "Perez, A. (2020). Titulo de revista."})
    assert r.status_code == 400
    assert r.json()["detail"]["codigo"] == "no_es_doi_ni_url"


def test_un_doi_que_crossref_no_conoce_dice_que_no_se_encontro(monkeypatch):
    from routers import references as addin_router

    async def falso_get(url, **kw):
        class R:
            status_code = 404
        return R()

    monkeypatch.setattr(addin_router.httpx, "AsyncClient", _ClienteFalso(falso_get))
    r = client.post("/api/resolve-doi", json={"doi": "10.9999/no-existe-este"})
    assert r.status_code == 404
    assert r.json()["detail"]["codigo"] == "no_resuelto"


def test_guardar_una_referencia_resuelta_pone_el_draft_en_definitiva(monkeypatch):
    from modules import addin_references_store as store
    from routers import references as addin_router

    async def falso_get(url, **kw):
        class R:
            status_code = 200

            def json(self_inner):
                return {"status": "ok", "message": WORK_UNO}
        return R()

    monkeypatch.setattr(addin_router.httpx, "AsyncClient", _ClienteFalso(falso_get))
    limpio()
    # Primero el draft, como lo dejaria `add_citation` al detectar la cita.
    store.add_citation(raw_text="(Perez, 2024)", authors=["Perez, A."], year="2024",
                       citation_type="parentetica", page=None)
    assert any(x.get("is_draft") for x in store.list_references())
    r = client.post("/api/resolve-doi",
                    json={"doi": "10.1016/j.educ.2024.001", "guardar": True})
    assert r.status_code == 200
    assert r.json()["guardada"] is True
    # El draft desaparecio: la referencia ahora es definitiva.
    assert not any(x.get("is_draft") for x in store.list_references())
    limpio()


class _ClienteFalso:
    """Sustituye a `httpx.AsyncClient` para que el test no dependa de internet.

    Se reemplaza el CLIENTE entero y no la funcion de red: asi el endpoint
    ejercita su propio codigo de headers, timeouts y manejo de status, que es
    justo donde viven los errores.
    """

    def __init__(self, get):
        self._get = get

    def __call__(self, *a, **kw):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url, **kw):
        return await self._get(url, **kw)


def limpio():
    from modules.addin_references_store import clear

    clear()


# ── Lote: pegar un bloque y que se arme la lista ────────────────────────────
# Tipo Zotero: se seleccionan 20 papers en el navegador, se copia, se pega.
# El bloque se resuelve ENTERO y lo que falla se reporta uno por uno, porque un
# DOI malo no puede tirar abajo los otros 19.

TRES = {
    "message": {
        "DOI": "10.1000/a", "title": ["Uno"], "container-title": ["Revista A"],
        "author": [{"given": "A", "family": "Uno"}], "issued": {"date-parts": [[2020]]},
    }
}
TRES_B = dict(TRES, message=dict(TRES["message"], DOI="10.1000/b", title=["Dos"]))


def _mock(por_doi, monkeypatch):
    from routers import references as ref_router

    async def get(url, **kw):
        # El DOI va tras "/works/" y CONTIENE "/" ("10.1000/a"), asi que no
        # sirve un rsplit por "/": hay que cortar por el marcador.
        doi = url.split("/works/", 1)[-1]
        clase = type("R", (), {})
        if doi in por_doi:
            r = clase()
            r.status_code = 200
            # CrossRef envuelve en {"status","message"}; el endpoint hace
            # `.get("message")`. Un fixture sin la envoltura hace que el
            # mapeo reciba {} y la referencia salga vacia sin que se note.
            r.json = lambda d=por_doi[doi]: {"status": "ok", "message": d["message"]}
        else:
            r = clase()
            r.status_code = 404
            r.json = lambda: {}
        return r

    monkeypatch.setattr(ref_router.httpx, "AsyncClient", _ClienteFalso(get))


def test_lote_de_dois_todos_validos(monkeypatch):
    _mock({"10.1000/a": TRES, "10.1000/b": TRES_B}, monkeypatch)
    r = client.post("/api/resolve-dois", json={
        "text": "10.1000/a\n10.1000/b"})
    assert r.status_code == 200
    d = r.json()
    assert d["total"] == 2
    assert len(d["resueltas"]) == 2
    assert d["fallidas"] == []
    assert {x["doi_or_url"] for x in d["resueltas"]} == {"10.1000/a", "10.1000/b"}


def test_un_doi_malo_no_tira_abajo_el_lote(monkeypatch):
    # Es lo esencial: 19 papers buenos y 1 malo tiene que dar 19.
    _mock({"10.1000/a": TRES, "10.1000/b": TRES_B}, monkeypatch)
    r = client.post("/api/resolve-dois", json={
        "text": "10.1000/a\n10.9999/no-existe-este\n10.1000/b"})
    d = r.json()
    assert d["total"] == 3
    assert len(d["resueltas"]) == 2
    assert len(d["fallidas"]) == 1
    assert d["fallidas"][0]["codigo"] == "no_resuelto"
    assert d["fallidas"][0]["entrada"] == "10.9999/no-existe-este"


def test_lineas_vacias_no_cuentan(monkeypatch):
    _mock({"10.1000/a": TRES}, monkeypatch)
    r = client.post("/api/resolve-dois", json={"text": "\n\n10.1000/a\n\n  \n"})
    assert r.json()["total"] == 1


def test_un_doi_repetido_se_resuelve_una_vez(monkeypatch):
    # Pegar dos veces el mismo enlace no tiene que duplicar la referencia.
    _mock({"10.1000/a": TRES}, monkeypatch)
    r = client.post("/api/resolve-dois", json={
        "text": "10.1000/a\nhttps://doi.org/10.1000/a\ndoi:10.1000/a"})
    assert r.json()["total"] == 1
    assert len(r.json()["resueltas"]) == 1


def test_una_linea_que_no_es_doi_se_reporta_sin_matar_el_resto(monkeypatch):
    _mock({"10.1000/a": TRES}, monkeypatch)
    r = client.post("/api/resolve-dois", json={
        "text": "Perez, A. (2020). Titulo de revista.\n10.1000/a"})
    d = r.json()
    assert len(d["resueltas"]) == 1
    assert d["fallidas"][0]["codigo"] == "no_es_doi_ni_url"


def test_lote_vacio_no_es_error(monkeypatch):
    r = client.post("/api/resolve-dois", json={"text": "   \n  "})
    assert r.status_code == 200
    d = r.json()
    assert d["total"] == 0
    assert d["resueltas"] == []


def test_el_lote_no_crea_referencias_por_si_solo(monkeypatch):
    # Guardar es opt-in del llamador, igual que en el endpoint de uno.
    _mock({"10.1000/a": TRES}, monkeypatch)
    limpio()
    client.post("/api/resolve-dois", json={"text": "10.1000/a"})
    from modules.addin_references_store import list_references
    assert list_references() == []
    limpio()
