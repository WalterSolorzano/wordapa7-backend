"""Tests del vocabulario y la comparacion de titulos de fase.

Por que este archivo existe: antes, el alcance de una regla se decidia
buscando palabras en el texto del elemento, y "meta" esta dentro de
"metodologia". Aqui la comparacion solo puede ocurrir sobre el TITULO de un
H1, asi que estos tests fijan WHERE se puede comparar y WHAT cuenta como
mismo titulo.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models import ElementModel, ElementType  # noqa: E402
from modules.finding import mk  # noqa: E402
from modules.proactive_auditor import audit_elements  # noqa: E402
from modules.phase_scope import (  # noqa: E402
    NO_PHASE_KEY,
    phase_findings,
    PORTADA_KEY,
    build_phase_map,
    match_phase,
    match_phase_exact,
    normalize_title,
    phase_label,
)


# ── Normalizacion ───────────────────────────────────────────────────────────

def test_normalize_quita_acentos_numeracion_y_puntos():
    assert normalize_title("3. Objetivos") == "objetivos"
    assert normalize_title("IV. METODO:") == "metodo"
    assert normalize_title("  Discusion  ") == "discusion"
    assert normalize_title("Anexos") == "anexos"


def test_normalize_no_comer_una_palabra_que_empieza_como_numero_romano():
    # "Metodologia" y "Discusion" arrancan con letras que el patron de
    # numeracion romana tambien acepta (m, d). El `\s+` del final es lo que
    # evita que se traguen la primera letra: sin el, "metodologia" se
    # normalizaba a "etodologia" y ninguna fase del documento seellia.
    assert normalize_title("Metodologia") == "metodologia"
    assert normalize_title("Discusion") == "discusion"
    assert normalize_title("Marco teorico") == "marco teorico"
    assert normalize_title("Metodologia del analisis") == "metodologia del analisis"


# ── Comparacion ─────────────────────────────────────────────────────────────

def test_match_titulo_exacto():
    assert match_phase("Objetivos") == "objetivos"
    assert match_phase("METODOLOGIA") == "metodo"
    assert match_phase("Conclusiones") == "conclusiones"


# -- Paridad de prefijos con el frontend -------------------------------------
#
# ESTA TABLA ESTA COPIADA, PALABRA POR PALABRA, en `src/__tests__/jerarquia.test.ts`.
# Es la misma en los dos languages y con la misma respuesta, y esa es toda la
# idea: `match_phase` y `faseDeTitulo` son LA MISMA regla en dos lugares, y cuando
# no lo eran el sintoma no era un titulo mal leido sino que el mosaico de la
# revision decia una fase y el auditor otra.
#
# El caso que abrio la divergencia: "CAPITULO 2: MARCO TEORICO" caia en `None`
# porque `_CHAPTER_PREFIX` no aceptaba el digito ni los dos puntos, y el frontend
# si lo resolvia. La diferencia era de una linea y se arreglo en una linea.
#
# LO QUE SIGUE DIVERGIENDO ESTA DECLARADO Y NO SE ARREGLA ACA: los ALIAS. El
# backend tiene la tupla `titles` de cada fase ("metodologia", "antecedentes",
# "metodologia de la investigacion") y el frontend solo tiene un rotulo por fase.
# `_ALIAS_SIN_VIAJAR` son los titulos que caen en esa diferencia, y la lista es
# corta a proposito: escribirla en TypeScript seria la sexta copia de una tabla
# que es de otro. Se cierra con el endpoint que expone `PHASES`.

_PARIDAD = (
    ("1. Introduccion", "introduccion"),
    ("CAPITULO 2: MARCO TEORICO", "marco_teorico"),
    ("Capitulo 3. Discusion", "discusion"),
    ("Seccion 3: Resultados", "resultados"),
    ("Unidad 2: Conclusiones", "conclusiones"),
    ("IV. METODO", "metodo"),
    ("Resultados de la encuesta", "resultados"),
    ("Seccion de resultados", None),
    ("Introducciones", None),
    ("Agradecimientos", None),
)

# Los tres que dependen de un alias que no viaja al frontend.
_ALIAS_SIN_VIAJAR = (
    ("1.1 Antecedentes", "marco_teorico"),
    ("Parte 1. Metodologia", "metodo"),
    ("Metodologia de la investigacion", "metodo"),
)


def test_prefijos_de_capitulo_con_digitos_y_dos_puntos():
    # El caso que se rompio, escrito con y sin tilde y con el prefijo en las
    # cuatro formas que usa una tesis.
    assert match_phase("CAPÍTULO 2: MARCO TEÓRICO") == "marco_teorico"
    assert match_phase("CAPITULO 2: MARCO TEORICO") == "marco_teorico"
    assert match_phase("Capitulo 2. Marco teorico") == "marco_teorico"
    assert match_phase("Parte 1. Metodologia") == "metodo"
    # Y el editor, que es el que distingue una fase mal puesta de una deliberada,
    # tiene que seguir distinguiendo: quitar la numeracion es normalizar, no
    # perdonar el nivel.
    assert match_phase_exact("1.1 Resultados") == "resultados"
    assert match_phase_exact("1.1 Resultados de la encuesta") is None


def test_seccion_de_no_come_una_palabra_que_empieza_como_prefijo():
    # El modo de fallo que el filtro de mayuscula ya cubria para los romanos,
    # extendido al grupo de capitulo: "de" no es un digito ni un romano, asi que
    # el prefijo no come la palabra y el titulo sigue siendo del autor.
    assert match_phase("Seccion de resultados") is None
    assert match_phase("Parte del documento") is None
    assert match_phase("Unidad de medida") is None


def test_la_tabla_de_paridad_dice_lo_mismo_que_el_frontend():
    # Solo el modo del AUDITOR. El modo estricto del editor es otra pregunta a
    # proposito —"Resultados de la encuesta" es `resultados` para el auditor y
    # `None` para el editor, porque ahi el calificador avisa de que el autor
    # quiso decir algo concreto—, y esa diferencia esta declarada en las dos
    # paredes, no aca.
    for titulo, esperado in _PARIDAD:
        assert match_phase(titulo) == esperado, f"{titulo} abrio otra fase"


def test_los_alias_que_no_viajan_son_tres_y_estan_nombrados():
    # No es un test de compatibilidad: es el RECUENTO de la divergencia que
    # queda. Si alguien agrega un titulo a esta lista, esta pasando algo que no
    # es un alias —y entonces el prefijo volveria a estar roto en un lado—, y si
    # alguien la deja vacia es que el endpoint que expone `PHASES` ya existe y
    # esta tabla hay que borrarla.
    for titulo, esperado in _ALIAS_SIN_VIAJAR:
        assert match_phase(titulo) == esperado, f"{titulo} abrio otra fase"


def test_match_titulo_con_calificador():
    # El calificador no rompe el reconocimiento: el titulo sigue siendo la fase.
    assert match_phase("Resultados de la encuesta") == "resultados"
    assert match_phase("Discusion de los hallazgos") == "discusion"


def test_match_acepta_abstract():
    assert match_phase("Abstract") == "resumen"
    assert match_phase("Resumen") == "resumen"


def test_titulo_desconocido_no_abre_fase():
    assert match_phase("Agradecimientos") is None
    assert match_phase("Analisis de los datos") is None


def test_metodologia_es_nombre_de_fase_y_nunca_disparador_de_objetivos():
    # El bug, escrito al reves: "meta" ya no esta en ningun lado del
    # vocabulario de objetivos, y "Metodologia" solo abre la fase metodo
    # cuando es EL TITULO de un H1.
    assert match_phase("Metodologia") == "metodo"
    assert match_phase("Metafora del sucesso") is None


def test_titulo_vacio_no_abre_fase():
    assert match_phase("") is None
    assert normalize_title("   ") == ""


def test_match_exacto_rechaza_el_calificador():
    # La diferencia entre un error de nivel y una decision del autor.
    assert match_phase_exact("Resultados") == "resultados"
    assert match_phase_exact("Resultados de la encuesta") is None
    assert match_phase_exact("Discusion de los hallazgos") is None
    # Y no coincide con el caso limite: el calificador es lo que decide.
    assert match_phase("Resultados de la encuesta") == "resultados"


def test_match_exacto_no_abre_fase():
    assert match_phase_exact("Agradecimientos") is None
    assert match_phase_exact("") is None


# ── El vocabulario esta completo ────────────────────────────────────────────

def test_toda_fase_del_vocabulario_es_alcanzable():
    for titulo in ("Resumen", "Introduccion", "Marco teorico", "Metodo",
                   "Resultados", "Discusion", "Conclusiones", "Referencias",
                   "Anexos"):
        key = match_phase(titulo)
        assert key is not None, f"{titulo} deberia abrir una fase"
        assert key != NO_PHASE_KEY


def test_portada_reconocida():
    assert match_phase("Titulo") == PORTADA_KEY
    assert match_phase("Portada") == PORTADA_KEY


# ── Mapa de ambitos ─────────────────────────────────────────────────────────

def _h(eid, text, level=1, cover=False):
    return ElementModel(id=eid, type=ElementType.HEADING, heading_level=level,
                        text=text, is_cover_section=cover)


def _p(eid, text):
    return ElementModel(id=eid, type=ElementType.PARAGRAPH, text=text)


# Review Focus: documento sin H1, y documento vacio.

def test_documento_vacio_no_crashea():
    phase_by_id, spans = build_phase_map([])
    assert phase_by_id == {}
    assert spans == []


def test_documento_sin_h1_todo_es_portada():
    # El contenido anterior al primer H1 pertenece a la portada: zona protegida.
    els = [_p("a", "Primer parrafo"), _p("b", "Segundo parrafo")]
    phase_by_id, spans = build_phase_map(els)
    assert phase_by_id["a"] == "portada"
    assert phase_by_id["b"] == "portada"
    assert [s.key for s in spans] == ["portada"]


def test_portada_por_is_cover_section_manda_sobre_el_titulo():
    els = [_h("h0", "Resumen", level=1, cover=True), _p("a", "texto")]
    phase_by_id, _ = build_phase_map(els)
    assert phase_by_id["a"] == "portada"


def test_h1_abre_ambito_y_el_cuerpo_lo_hereda():
    els = [_h("h1", "Objetivos"), _p("a", "Analizar el contexto"),
           _h("h2", "Metodo"), _p("b", "Se aplico una encuesta")]
    phase_by_id, _ = build_phase_map(els)
    assert phase_by_id["a"] == "objetivos"
    assert phase_by_id["b"] == "metodo"


def test_h2_hereda_y_no_abre_ambito_propio():
    # El H2 "Resultados de la encuesta" NO abre 'resultados': es un H2, y un
    # H2 hereda. Este es el caso que el editor de la Tarea 5 promotional a H1.
    els = [_h("h1", "Metodo"), _h("h2", "Resultados de la encuesta", level=2),
           _p("a", "Se obtuvo un 80%")]
    phase_by_id, _ = build_phase_map(els)
    assert phase_by_id["a"] == "metodo"


def test_h2_atipico_hereda_ambito_del_h1():
    # Un H2 que el clasificador reconocio por una senal atipica (outlineLvl de
    # Word, mayusculas cortas, etc.) hereda igual que cualquier H2. El nivel
    # manda, no el estilo que lo delato: aunque su texto sea una fase conocida
    # ("Referencias"), NO abre ambito propio porque es nivel 2.
    els = [_h("h1", "Metodo"), _h("h2", "Referencias", level=2),
           _p("a", "Hermenéutica, M. (2020).")]
    phase_by_id, _ = build_phase_map(els)
    assert phase_by_id["a"] == "metodo"


def test_h1_desconocido_abre_sin_fase():
    # Review Focus: un H1 fuera del vocabulario es una seccion cualquiera.
    els = [_h("h1", "Agradecimientos"), _p("a", "Gracias a mi familia")]
    phase_by_id, _ = build_phase_map(els)
    assert phase_by_id["a"] == "sin_fase"


def test_spans_cubren_el_documento_sin_solaparse():
    els = [_h("h1", "Resumen"), _p("a", "x"), _h("h2", "Introduccion"),
           _p("b", "y"), _h("h3", "Agradecimientos"), _p("c", "z")]
    _, spans = build_phase_map(els)
    assert [s.key for s in spans] == ["resumen", "introduccion", "sin_fase"]
    for i, s in enumerate(spans):
        fin = spans[i + 1].start_index if i + 1 < len(spans) else len(els)
        assert s.end_index == fin
    assert spans[0].start_index == 0


def test_phase_label_de_ambito_desconocido_no_crashea():
    assert phase_label("objetivos") == "Objetivos"
    assert phase_label("sin_fase") == "Seccion sin nombre"
    assert phase_label("clave_inventada") == "Seccion sin nombre"


# ── Criterios de fase: la portada se mide, no se escribe ─────────────────────

def _f(phase, text, eid="e1", is_cover=False):
    return phase_findings(phase, eid, text, mk=mk, is_cover_title=is_cover)


def _portada(text, eid="c1"):
    return _f("portada", text, eid, is_cover=True)


# Review Focus: un incumplimiento real de portada.

def test_titulo_largo_es_hallazgo_de_portada():
    out = _portada("Un titulo realmente largo " * 6)
    assert [f["kind"] for f in out] == ["portada_title_larga"]
    assert out[0]["phase"] == "portada"
    assert out[0]["read_only"] is True


def test_titulo_corto_no_es_hallazgo():
    assert _portada("Percepcion de la identidad en estudiantes universitarios") == []


def test_titulo_con_punto_final_es_hallazgo():
    out = _portada("Percepcion de la identidad.")
    assert [f["kind"] for f in out] == ["portada_punto_final"]
    assert out[0]["read_only"] is True


def test_los_criterios_de_titulo_exigen_el_elemento_de_portada():
    # Sin `is_cover`, el ambito portada tambien cubre "todo lo anterior al
    # primer H1", que en el modo `texts` es el documento entero. Sin esta
    # guarda, cada parrafo terminado en punto seria un titulo mal escrito.
    assert _f("portada", "Un parrafo normal que termina en punto.") == []
    assert _f("portada", "Y otro mas largo todavia " * 6 + "que sigue.") == []


def test_hallazgo_de_portada_nunca_propone_texto():
    # La invariante de AGENTS.md §1: `use_original_cover` no puede mutar la
    # portada original. Sin `suggestion` no hay nada que la aplicadora escriba.
    for text in ("Un titulo realmente largo " * 6, "Percepcion de la identidad."):
        for f in _portada(text):
            assert "suggestion" not in f, f


def test_sin_fase_no_dispara_ningun_criterio():
    assert _f("sin_fase", "Conocer las causas " * 10) == []


def test_ambito_desconocido_no_dispara_ningun_criterio():
    assert _f("clave_inventada", "Conocer las causas") == []


def test_objetivos_sigue_pudiendo_sugerir():
    # El contraste: solo la portada es de solo lectura.
    out = _f("objetivos", "Conocer las causas del fenomeno")
    assert [f["kind"] for f in out] == ["bloom_vague"]
    assert out[0].get("suggestion") == "determinar"
    assert out[0]["read_only"] is False


def test_objetivo_sin_variable_se_reporta():
    out = _f("objetivos", "Determinar el proceso.")
    assert "objetivo_sin_variable" in {f["kind"] for f in out}


# ── Leyes de objetivos en infinitivo y verbo unico (T12) ─────────────────────

def test_objetivo_sin_infinitivo_se_reporta():
    out = _f("objetivos", "La mejora del proceso de produccion.")
    assert "objetivo_sin_infinitivo" in {f["kind"] for f in out}


def test_objetivo_con_infinitivo_no_dispara_sin_infinitivo():
    kinds = {f["kind"] for f in _f("objetivos", "Determinar el efecto de X sobre Y.")}
    assert "objetivo_sin_infinitivo" not in kinds


def test_objetivo_multi_verbo_se_reporta():
    out = _f("objetivos", "Determinar y evaluar el efecto de X sobre Y.")
    assert "objetivo_multi_verbo" in {f["kind"] for f in out}


def test_objetivo_de_un_solo_verbo_no_dispara_multi_verbo():
    kinds = {f["kind"] for f in _f("objetivos", "Analizar las causas de los tiempos improductivos.")}
    assert "objetivo_multi_verbo" not in kinds


def test_metodo_genérico_se_reporta():
    out = _f("metodo", "Se realizó el estudio.")
    assert "metodo_sin_detalle" in {f["kind"] for f in out}


def test_portada_no_recibe_los_criterios_de_una_fase_de_prosa():
    # La portada no lleva reglas de prosa: es material, no argumento.
    kinds = {f["kind"] for f in _portada("Conocer las causas " * 8)}
    assert "bloom_vague" not in kinds


def test_un_titulo_de_portada_mal_escrito_llega_al_auditor():
    # Extremo a extremo: el elemento de portada tiene que salir en Revision.
    els = [ElementModel(id="c1", type=ElementType.PORTADA_BLOCK,
                        text="Percepcion de la identidad.", is_cover_section=True),
           _p("e1", "Un parrafo normal que termina en punto.")]
    f = audit_elements(els)
    portada = [x for x in f if x["phase"] == "portada"]
    assert [x["kind"] for x in portada] == ["portada_punto_final"]
    assert portada[0]["read_only"] is True
    assert "suggestion" not in portada[0]
    # Y el parrafo normal no arrastra ruido de portada.
    assert all(x["phase"] != "portada" or x["element_id"] == "c1" for x in f)


# Review Focus: los criterios de portada solo miran el TITULO.

def test_solo_el_titulo_de_la_portada_se_mide():
    els = [
        ElementModel(id="c1", type=ElementType.PORTADA_BLOCK, is_cover_section=True,
                     text="Percepcion de la identidad en estudiantes universitarios de Managua."),
        ElementModel(id="c2", type=ElementType.PORTADA_BLOCK, is_cover_section=True,
                     text="Br. Juan Carlos Perez Martinez."),
        ElementModel(id="c3", type=ElementType.PORTADA_BLOCK, is_cover_section=True,
                     text="Managua, Nicaragua. Abril 2024."),
    ]
    f = audit_elements(els)
    portada = [x for x in f if x["phase"] == "portada"]
    # Todas las lineas terminan en punto, asi que sin el filtro el mensaje
    # "el titulo no lleva punto final" caeria en el autor y en la fecha.
    assert all(x["element_id"] == "c1" for x in portada), f
    assert [x["kind"] for x in portada] == ["portada_punto_final"]


def test_un_titulo_de_portada_largo_si_se_reporta():
    largo = ("Percepcion de la identidad en estudiantes universitarios de Managua "
             "durante el proceso de admision del turno nocturno en la facultad "
             "de ciencias medicas")
    assert len(largo.split()) > 20, "el caso de prueba tiene que ser largo de verdad"
    els = [ElementModel(id="c1", type=ElementType.PORTADA_BLOCK, is_cover_section=True,
                        text=largo + "."),
           ElementModel(id="c2", type=ElementType.PORTADA_BLOCK, is_cover_section=True,
                        text="Docente: Dr. Martin Perez.")]
    portada = [x for x in audit_elements(els) if x["phase"] == "portada"]
    assert "portada_title_larga" in {x["kind"] for x in portada}
    assert all(x["element_id"] == "c1" for x in portada)


def test_el_flag_se_llama_cover_title_para_que_nadie_lo_reuse():
    # El nombre viejo (`is_cover`) ya causo este bug: decia "es portada" y el
    # criterio lo leia como "es el titulo".
    import inspect
    from modules.phase_scope import phase_findings
    assert "is_cover_title" in inspect.signature(phase_findings).parameters


# ── Capa de reglas globales ─────────────────────────────────────────────────

def test_toda_regla_global_declarada_tiene_implementacion():
    """El hermano del guard de criterios: una regla global declarada y sin
    codigo es una regla muerta, y nadie la notaria — `phase_findings` solo
    recorre los `criteria` de las fases, no estas."""
    from modules.phase_scope import GLOBAL_CHECKS, RULE_SCOPES

    # Las que ya viven sueltas dentro de `audit_elements` todavia no pasan por
    # `global_findings`: se declaran aca para que el guard las cuente.
    sueltas = {"first_person", "ai_phrase", "muletilla", "pegado", "ortografia",
               "repeticion", "persona", "incompleta", "ambigua", "passive_voice",
               "long_sentence", "ngram_repetition", "bloom_low"}
    declaradas = {k for k, v in RULE_SCOPES.items() if v == "global"}
    sin_codigo = sorted((declaradas - sueltas) - set(GLOBAL_CHECKS))
    assert not sin_codigo, f"reglas globales declaradas sin implementacion: {sin_codigo}"


def test_toda_regla_global_implementada_esta_declarada():
    from modules.phase_scope import GLOBAL_CHECKS, RULE_SCOPES

    declaradas = {k for k, v in RULE_SCOPES.items() if v == "global"}
    huerfanas = sorted(set(GLOBAL_CHECKS) - declaradas)
    assert not huerfanas, f"reglas implementadas sin ambito declarado: {huerfanas}"


def test_un_texto_limpio_no_produce_hallazgos_globales():
    # Review Focus 4: una regla global que encuentra algo siempre es un falso
    # positivo. Un parrafo bien escrito tiene que salir vacio.
    from modules.phase_scope import build_global_context, global_findings

    texto = ("La desercion estudiantil se asocia a factores economicos y "
             "familiares segun la literatura revisada. Estos factores se "
             "midieron con una encuesta aplicada a 480 estudiantes.")
    assert global_findings("e1", texto, build_global_context([]), mk=mk) == []


def test_global_findings_no_recibe_el_ambito():
    # Una regla global no puede mirar la fase: si lo hiciera, seria de fase.
    import inspect
    from modules.phase_scope import global_findings
    assert "phase" not in inspect.signature(global_findings).parameters


# ── Reglas globales ──────────────────────────────────────────────────────────

def _g(texto, eid="e1", ctx=None):
    from modules.phase_scope import GlobalContext, global_findings
    return global_findings(
        eid, texto,
        ctx or GlobalContext(doc_words=200, seen_acronyms=frozenset(), connector_counts={}),
        mk=mk)


def test_exclamacion_en_prosa_argumental():
    out = _g("Este hallazgo es importante! Hay que revisarlo.")
    assert [f["kind"] for f in out] == ["g52_exclamacion"]
    assert out[0]["phase"] == "global"


def test_registro_coloquial():
    out = _g("O sea, el tema esta bueno y pues sirve.")
    assert "g51_registro_coloquial" in {f["kind"] for f in out}


def test_la_exclamacion_dentro_de_una_cita_no_es_hallazgo():
    # Citar un texto exclamativo es legitimo: lo que se audita es la prosa
    # argumental propia, no lo citado.
    out = _g('El autor escribe: "este problema es urgente!" en la introduccion.')
    assert [f for f in out if f["kind"] == "g52_exclamacion"] == []


def test_el_coloquialismo_dentro_de_una_cita_no_es_hallazgo():
    out = _g('El autor responde "o sea, esto no funciona" y lo explica.')
    assert "g51_registro_coloquial" not in {f["kind"] for f in out}


def test_un_registro_formal_no_dispara_ninguna_de_las_dos():
    assert _g("El presente trabajo analiza la desercion estudiantil.") == []


def test_una_palabra_que_empieza_igual_no_es_coloquialismo():
    # "bueno" no es "buenotrabajo": el detector no puede ser subcadena a pelo.
    assert "g51_registro_coloquial" not in {f["kind"] for f in _g("El buenotrabajo fue notable.")}


def test_segunda_persona_al_lector():
    assert "g53_segunda_persona" in {f["kind"] for f in _g("Como veras, el metodo es sencillo.")}


def test_segunda_persona_dentro_de_comilla_no_cuenta():
    out = _g('El autor dice "como veras, esto es facil" y lo critica.')
    assert "g53_segunda_persona" not in {f["kind"] for f in out}


def test_variacion_por_debajo_del_piso_no_es_hallazgo():
    # Review Focus 1: con menos de 4 oraciones no hay distribucion que medir.
    # sigma sobre dos numeros no describe un ritmo.
    assert "g11_variacion_oracion" not in {f["kind"] for f in _g("Se hizo. Se vio. Se dijo.")}
    assert "g11_variacion_oracion" not in {f["kind"] for f in _g("Solo una oracion aqui.")}


def test_oraciones_todas_iguales_si_es_hallazgo():
    texto = ("El proceso fue lento en la primera etapa del estudio. "
             "El proceso fue lento en la segunda etapa del estudio. "
             "El proceso fue lento en la tercera etapa del estudio. "
             "El proceso fue lento en la cuarta etapa del estudio.")
    assert "g11_variacion_oracion" in {f["kind"] for f in _g(texto)}


def test_ritmo_variado_no_es_hallazgo():
    texto = ("La desercion crece. Es un problema serio y con multiples causas "
             "documentadas en la literatura. Los datos del 2024 muestran un "
             "aumento sostenido que nadie explica.")
    assert "g11_variacion_oracion" not in {f["kind"] for f in _g(texto)}


def _ctx(n, siglas=frozenset()):
    from modules.phase_scope import GlobalContext
    return GlobalContext(doc_words=n, seen_acronyms=siglas, connector_counts={})


def test_sigla_sin_definir_en_su_primera_aparicion():
    assert "g34_sigla_sin_definir" in {f["kind"] for f in _g("El PIBPIO crecio un 3% durante el periodo.", ctx=_ctx(200))}


def test_sigla_ya_definida_no_se_vuelve_a_marcar():
    # Review Focus 2: marcar la sigla en cada parrafo produce una tanda de
    # hallazgos identicos. Solo la primera aparicion es el error.
    assert _g("El PIB seguia creciendo en el segundo trimestre.", ctx=_ctx(400, frozenset({"PIB"}))) == []


def test_sigla_definida_en_el_mismo_parrafo_no_es_hallazgo():
    out = _g("El Producto Interno Bruto (PIB) crecio un 3% durante el periodo.")
    assert "g34_sigla_sin_definir" not in {f["kind"] for f in out}


def test_unidades_mixtas_para_el_mismo_concepto():
    out = _g("Se midieron 5 kg de muestra y luego cinco kilogramos en la segunda tanda.")
    assert "g35_unidades_mixtas" in {f["kind"] for f in out}


def test_una_sola_forma_de_unidad_no_es_hallazgo():
    out = _g("Se midieron 5 kg de muestra.")
    assert [f for f in out if f["kind"] == "g35_unidades_mixtas"] == []


def test_triada_repetida_como_muletilla():
    texto = ("Es rapido, eficiente y confiable. Es claro, conciso y directo. "
             "Es seguro, estable y veloz.")
    assert "g61_triada" in {f["kind"] for f in _g(texto)}


def test_una_triada_suelta_no_es_hallazgo():
    assert "g61_triada" not in {f["kind"] for f in _g("El sistema es rapido, eficiente y confiable.")}


def test_conectores_por_mil_palabras_y_no_por_repeticion():
    # Review Focus 3: dos "sin embargo" en un documento corto son normales; tres
    # en 300 palabras no. El umbral depende del largo real.
    texto = "Sin embargo, A. Sin embargo, B. Sin embargo, C."
    assert _g(texto, ctx=_ctx(200)) != []
    assert _g(texto, ctx=_ctx(20000)) == []


# ── R-G71: una cifra afirmada sin cita ──────────────────────────────────────

def test_cifra_sin_cita_es_hallazgo():
    out = _g("El 68% de las empresas del sector adopto esta tecnologia en 2024.")
    assert "g71_cifra_sin_cita" in {f["kind"] for f in out}


def test_cifra_con_cita_no_es_hallazgo():
    out = _g("El 68% de las empresas adopto la tecnologia (Perez, 2020).")
    assert "g71_cifra_sin_cita" not in {f["kind"] for f in out}


def test_cita_en_la_oracion_anterior_alcanza():
    # "Segun Perez (2020), el 68% de las empresas..." — la cita abre la oracion
    # y el dato viene despues. Es la forma correcta de citar.
    out = _g("Segun Perez (2020), el 68% de las empresas la adopto.")
    assert "g71_cifra_sin_cita" not in {f["kind"] for f in out}


def test_magnitud_con_unidad_de_terceros_es_hallazgo():
    out = _g("El sector registraba 1200 empresas activas en 2024.")
    assert "g71_cifra_sin_cita" in {f["kind"] for f in out}


def test_la_muestra_propia_no_necesita_cita():
    # R-G71 dice "cifra o hallazgo de TERCEROS". El numero de tu propia
    # encuesta es tu metodo, no un dato ajeno que respaldar.
    for texto in (
        "Se entrevistaron a 480 estudiantes de la universidad.",
        "Estos factores se midieron con una encuesta aplicada a 1200 casos.",
    ):
        assert "g71_cifra_sin_cita" not in {f["kind"] for f in _g(texto)}, texto


def test_dos_cifras_y_una_sola_cita_no_alcanza():
    # La cita cubre su oracion y la siguiente; la tercera sigue sin respaldo.
    texto = ("Segun Perez (2020), el 68% de las empresas la adopto. "
             "El sector crecio 40% ese mismo año. "
             "La_region reporto 15 puntos de crecimiento.")
    assert "g71_cifra_sin_cita" in {f["kind"] for f in _g(texto)}


def test_un_ano_suelto_no_es_una_cifra_afirmada():
    # "2024" dentro de un rango de fechas de un metodo, o un numero de seccion,
    # no es una afirmacion que necesite cita.
    assert "g71_cifra_sin_cita" not in {f["kind"] for f in _g("El estudio se realizo en 2024.")}
    assert "g71_cifra_sin_cita" not in {f["kind"] for f in _g("La seccion 3.2 presenta los datos.")}


def test_una_afirmacion_cualitativa_no_es_hallazgo():
    assert "g71_cifra_sin_cita" not in {f["kind"] for f in _g("La desercion es un problema serio.")}


def test_la_cita_cerca_en_la_misma_oracion_alcanza():
    texto = "El 68% la adopto (Perez, 2020; Lopez, 2021)."
    assert "g71_cifra_sin_cita" not in {f["kind"] for f in _g(texto)}


# ── R-G74-primo: un tramo largo copiado y sin entrecomillar ─────────────────

def test_trozo_copiado_sin_comillas_es_hallazgo():
    texto = ("El phenomenono se define como la ausencia total de esta relacion "
             "entre los factores socioeconómicos y el rendimiento academico del "
             "estudiante en el primer año de la carrera.")
    out = _g(texto)
    assert "g74_verbatim_sin_comillas" in {f["kind"] for f in out}


def test_una_cita_textual_si_lleva_comillas_no_es_hallazgo():
    texto = ('Segun el autor, "la ausencia total de esta relacion entre los '
             'factores socioeconómicos y el rendimiento academico del estudiante '
             'en el primer año de la carrera" es la definicion del phenomenono.')
    assert "g74_verbatim_sin_comillas" not in {f["kind"] for f in _g(texto)}


def test_una_prosa_escrita_en_frases_cortas_no_es_hallazgo():
    texto = ("El phenomenono se define como la relacion entre los factores. "
             "Esta relacion se mide con un indice. El indice se calcula por anualidad. "
             "Su valor va de cero a uno.")
    assert "g74_verbatim_sin_comillas" not in {f["kind"] for f in _g(texto)}


def test_un_parrafo_de_prosa_larga_normal_no_es_hallazgo():
    texto = ("La desercion estudiantil no es un fenomeno reciente en la region. "
             "Los informes del sector education nationally muestran un aumento "
             "sostenido desde 2015 que los investigadores atribuyen a factores "
             "economicos y a laExpansion de la oferta en la educacion superior. "
             "Este trabajo analiza esos factores en el turno nocturno.")
    assert "g74_verbatim_sin_comillas" not in {f["kind"] for f in _g(texto)}


def test_una_ley_o_un_nombre_propio_largo_no_es_hallazgo():
    texto = ("La Ley Organica de la Educacion Superior y su Reglamento interno "
             "establecen los procedimientos que deben seguir las instituciones.")
    assert "g74_verbatim_sin_comillas" not in {f["kind"] for f in _g(texto)}
