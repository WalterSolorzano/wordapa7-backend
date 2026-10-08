"""Tests del revisor proactivo local (proactive_auditor)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models import ElementModel, ElementType  # noqa: E402
from modules.proactive_auditor import audit_elements, refine_with_llm  # noqa: E402


def _para(text: str, eid: str = "e1") -> ElementModel:
    return ElementModel(id=eid, type=ElementType.PARAGRAPH, text=text)


def _kinds(findings, kind):
    return [f for f in findings if f["kind"] == kind]


def test_first_person_positive():
    f = audit_elements([_para("Yo considero que el metodo funciona.")])
    fp = _kinds(f, "first_person")
    # Pronombre + frase de opinion en la misma clausula se fusionan en uno.
    assert len(fp) == 1
    assert "Yo" in fp[0]["excerpt"]
    assert fp[0]["start"] == 0


def test_first_person_me_not_flagged():
    f = audit_elements([_para("El libro que me recomendaron es bueno.")])
    assert _kinds(f, "first_person") == []


def test_first_person_que_guard():
    # 'que' antes no convierte el match; pero 'lo que nosotros' si es persona.
    f = audit_elements([_para("Esto muestra que la teoria aplica.")])
    assert _kinds(f, "first_person") == []


def test_first_person_in_quotes_ignored():
    f = audit_elements([_para('El autor escribio: "yo afirmo" en 1990.')])
    assert _kinds(f, "first_person") == []


def test_creemos_que_flagged():
    f = audit_elements([_para("Creo que los datos son suficientes.")])
    assert len(_kinds(f, "first_person")) == 1


def test_ai_phrase():
    f = audit_elements([_para("Cabe destacar que el resultado fue positivo.")])
    ai = _kinds(f, "ai_phrase")
    assert len(ai) == 1
    assert ai[0]["excerpt"].lower().startswith("cabe destacar")


def test_ai_phrase_ignores_common_academic_context():
    f = audit_elements([_para("En el contexto de esta investigación, la muestra fue relevante.")])
    assert _kinds(f, "ai_phrase") == []


def test_verbo_pasado_ignores_conjugated_forms():
    els = [_h("h1", "Resultados"),
           _para("Se compararon los datos y se evaluaron los resultados.")]
    assert _kinds(audit_elements(els), "verbo_pasado") == []


def test_bloom_vague_requires_exact_word_or_phrase():
    els = [_h("h1", "Objetivos"),
           _para("Se conoce el fenómeno y se estudia el caso de forma preliminar.")]
    assert _kinds(audit_elements(els), "bloom_vague") == []


def test_missing_space_after_punct():
    f = audit_elements([_para("Termino la frase.Así empieza otra.")])
    p = _kinds(f, "pegado")
    assert any(x["severity"] == "error" for x in p)


def test_duplicate_word():
    f = audit_elements([_para("El resultado final final fue claro.")])
    dup = [x for x in _kinds(f, "pegado") if "duplicada" in x["message"]]
    assert len(dup) == 1


def test_repeated_sentence_openers_offsets():
    text = "Se propusieron mejoras. Se analizó el proceso. Se emplearon herramientas."
    f = audit_elements([_para(text)])
    rep = _kinds(f, "repeticion")
    # Deben detectarse las 3 oraciones que empiezan con "Se"
    assert len(rep) == 3
    assert all("Se" in x["excerpt"] for x in rep)
    assert rep[0]["start"] == 0 and rep[0]["end"] == 2
    assert rep[1]["start"] == 24 and rep[1]["end"] == 26
    assert rep[2]["start"] == 47 and rep[2]["end"] == 49


def test_typo_deberia():
    f = audit_elements([_para("Esto deberia funcionar mejor.")])
    ort = _kinds(f, "ortografia")
    assert len(ort) == 1
    assert ort[0]["suggestion"] == "debería"


def test_no_findings_clean_text():
    f = audit_elements([_para("El análisis de datos confirma la hipótesis planteada por autores previos.")])
    assert f == []


def test_headings_excluded():
    h = ElementModel(id="h1", type=ElementType.HEADING, heading_level=1,
                     text="Nosotros analizamos")
    assert audit_elements([h]) == []


def test_llm_no_key_passthrough(monkeypatch):
    """Sin NINGUNA clave, el motor devuelve los hallazgos como entraron.

    `refine_with_llm` es `async` desde que paso por el router: antes era
    sincrona y pegaba a NIM con `requests.post`, que era justo lo que detenia el
    event loop.

    El "sin ninguna" es la parte importante. La maquina de desarrollo tiene
    claves reales de proveedores en `.env`, y con el router el motor las
    encuentra sola: sin este `monkeypatch`, la prueba saldia a la red de verdad y
    dependia de la cuota de quien la escribiera. Un test que llama a la red es un
    test que falla un martes.
    """
    import asyncio

    for var in ("NVIDIA_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY",
                "CEREBRAS_API_KEY", "MISTRAL_API_KEY", "OPENCODEZEN_API_KEY",
                "ZENMUX_API_KEY", "GEMINI_API_KEY", "CLOUDFLARE_API_TOKEN",
                "CLOUDFLARE_ACCOUNT_ID", "AION_API_KEY", "KILOCODE_API_KEY",
                "OLLAMA_API_KEY", "HUGGINGFACE_API_KEY"):
        monkeypatch.delenv(var, raising=False)

    findings = [{"element_id": "e", "start": 0, "end": 4, "excerpt": "x",
                 "kind": "ortografia", "severity": "error", "message": "m",
                 "source": "local"}]
    out, used = asyncio.run(refine_with_llm(findings, [], ""))
    assert out == findings and used is False


def test_bloom_audit_objective_valid_and_vague():
    from modules.proactive_auditor import audit_objective

    valid = audit_objective("Diseñar un sistema de inventario automatizado.")
    assert valid["is_measurable"] is True
    assert valid["verb_detected"] == "diseñar"
    assert valid["bloom_level"] == "crear"

    vague = audit_objective("Aprender y conocer sobre sistemas de información.")
    assert vague["is_measurable"] is False
    assert "conocer" in vague["vague_verbs_used"]


def test_bloom_objectives_hierarchy_violation():
    from modules.proactive_auditor import audit_objectives_hierarchy

    # General es nivel 4 (Analizar), pero un específico es nivel 6 (Diseñar) -> Incoherencia
    gen = "Analizar los procesos de producción de la empresa."
    specs = [
        "Identificar las etapas del proceso.",  # nivel 1 (Recordar)
        "Diseñar un nuevo modelo de optimización." # nivel 6 (Crear) -> violacion
    ]
    res = audit_objectives_hierarchy(gen, specs)
    assert res["is_coherent"] is False
    assert any("supera nivel del general" in f["title"] for f in res["findings"])


def test_burstiness_score_calculation():
    from modules.proactive_auditor import burstiness_score

    sentences = [
        "Esta es una oración corta.",
        "A continuación se presenta un análisis extremadamente detallado y profundo sobre los diversos factores cuantitativos.",
        "Se midió.",
        "Los resultados obtenidos durante las pruebas de campo en la universidad demostraron la factibilidad técnica del prototipo.",
        "Breve resumen."
    ]
    res = burstiness_score(sentences)
    assert res["burstiness_score"] >= 0.5
    assert "Sospecha IA" not in res["interpretation"]



# ── Ambitos de fase: el H1 manda, no el texto ────────────────────────────────

def _h(eid, text, level=1):
    return ElementModel(id=eid, type=ElementType.HEADING, heading_level=level,
                        text=text)


def test_metodologia_en_el_cuerpo_no_atribuye_a_objetivos():
    # El bug, y su espejo. El parrafo necesita LAS DOS cosas que el bug
    # miraba: una palabra disparadora ("objetivo", y "meta" dentro de
    # "metodologia") y un verbo impreciso. Sin el verbo el test pasaba sin
    # probar nada, porque el bug nunca habria disparado.
    #
    # El verbo medible (bloom_verb) vive SOLO en la fase de objetivos: la fase
    # de metodo ya no lo evalua, asi que aqui no debe salir ningun bloom_vague.
    # Lo que se asserta es que nada se le atribuya a objetivos y que el verbo
    # impreciso no se cuele por el metodo.
    els = [_h("h1", "Metodologia"),
           _para("El objetivo de este trabajo es conocer la percepcion.")]
    f = audit_elements(els)
    assert all(x["phase"] != "objetivos" for x in f), f
    assert _kinds(f, "bloom_vague") == []


def test_metodologia_como_palabra_suelta_no_atribuye_a_objetivos():
    # Sin ningun H1 no hay fase de prosa: el elemento cae en portada y no
    # dispara el criterio de verbos.
    f = audit_elements([_para("La metodologia pretende conocer la percepcion.")])
    assert all(x["phase"] != "objetivos" for x in f), f
    assert _kinds(f, "bloom_vague") == []


def test_bloom_vague_sigue_disparando_dentro_de_objetivos():
    els = [_h("h1", "Objetivos"), _para("Conocer las causas del fenomeno X.")]
    assert len(_kinds(audit_elements(els), "bloom_vague")) == 1


def test_bloom_vague_fuera_de_objetivos_no_dispara():
    # Mismo verbo, ambito equivocado: no hay hallazgo.
    els = [_h("h1", "Agradecimientos"),
           _para("Conocer las causas del fenomeno X.")]
    assert _kinds(audit_elements(els), "bloom_vague") == []


def test_todo_hallazgo_declara_su_fase():
    els = [_h("h1", "Objetivos"),
           _para("Conocer las causas y ademas hay un erro aqui."),
           _h("h2", "Conclusiones"),
           _para("En conclusion se demostro que Io creo que si.")]
    for f in audit_elements(els):
        # "global" es un valor legitimo: son las reglas generales, que no
        # pertenecen a ninguna fase. Lo que NO puede pasar es un hallazgo sin
        # fase declarada.
        assert f["phase"] in {"global", "objetivos", "conclusiones"}, f
        assert isinstance(f["read_only"], bool)


def test_las_reglas_generales_no_tienen_fase():
    els = [_h("h1", "Objetivos"), _para("Yo creo que si.")]
    f = audit_elements(els)
    assert [x["phase"] for x in _kinds(f, "first_person")] == ["global"]


def test_reglas_generales_corrigen_en_cualquier_fase():
    els = [_h("h1", "Agradecimientos"),
           _para("Yo creo que el proceso fue eviden te.")]
    kinds = {f["kind"] for f in audit_elements(els)}
    assert "first_person" in kinds


def test_h1_audita_ortografia_y_punto_final():
    # El H1 delimita fases pero también se audita para ortografía y punto final
    f = audit_elements([_h("h1", "Objetivos."),
                        _para("Conocer el fenomeno X.", "e1")])
    # Heading h1 tiene punto final indebido según APA 7
    h1_findings = [x for x in f if x["element_id"] == "h1"]
    assert any(x["kind"] == "pegado" and "punto final" in x["message"] for x in h1_findings)


def test_referencias_no_disparan_falsos_positivos_de_prosa():
    f = audit_elements([
        _h("h1", "Referencias"),
        _para("Pérez, J. (2020). Estudio en 500 pacientes con prevalencia del 40%. Editorial Médica.", "ref1"),
    ])
    # En fase referencias, no debe marcarse g71_cifra_sin_cita ni g74_verbatim ni first_person
    kinds = {x["kind"] for x in f}
    assert "g71_cifra_sin_cita" not in kinds
    assert "g74_verbatim_sin_comillas" not in kinds

