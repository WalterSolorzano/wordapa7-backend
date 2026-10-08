"""Índices de comportamiento IA: humano no marcado, sintético sí."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from modules.ai_indices import compute_ai_indices  # noqa: E402
from models import ElementModel, ElementType  # noqa: E402
from modules.proactive_auditor import audit_elements  # noqa: E402


def _para(t: str, eid: str = "e") -> ElementModel:
    return ElementModel(id=eid, type=ElementType.PARAGRAPH, text=t)


HUMANO = [
    ("h1", "La ciudad triplicó su población en una década. Asimismo, hacia 1920 ya "
           "contaba con tranvía eléctrico, algo poco común en la región, aunque el "
           "costo de mantenimiento generó disputas municipales durante años."),
    ("h2", "El estudio se basó en 47 entrevistas aplicadas entre marzo y junio de "
           "2023 en tres barrios periféricos; la tasa de respuesta fue del 68 por "
           "ciento, cifra baja pero consistente con encuestas previas."),
    ("h3", "Hubo errores: el formulario original contenía erratas que corregimos "
           "tarde. Yo mismo revisé las primeras 20 planillas y me equivoqué en dos "
           "totales, lo que retrasó el análisis una semana completa."),
]

ROBOT = [
    ("r1", "Asimismo, es importante considerar el impacto ambiental. Cabe destacar "
           "que también influyen factores económicos relevantes para el análisis "
           "integral del sistema robusto actual."),
    ("r2", "Es fundamental optimizar los procesos clave. Por un lado, es importante "
           "considerar; por otro lado, cabe destacar lo relevante significativo del "
           "tema central planteado anteriormente en este documento."),
    ("r3", "En conclusión, los aspectos fundamentales son cruciales. Además, resulta "
           "esencial mencionar lo significativo en este sentido, ya que juega un "
           "papel crucial en el mundo actual y desempeña un papel fundamental."),
    ("r4", "En resumen, es importante recalcar lo esencial. Asimismo, cabe destacar "
           "que resulta crucial considerar los aspectos fundamentales clave del caso."),
]


def test_humano_en_zona_baja():
    r = compute_ai_indices([t for _, t in HUMANO], imperfection_signals=4)
    assert r["zone"] in ("probable_humano", "inconcluso"), f"{r}"


def test_sintetico_en_zona_ia():
    r = compute_ai_indices([t for _, t in ROBOT], imperfection_signals=0)
    assert r["zone"] in ("probable_ia", "alta_ia"), f"{r}"
    assert r["indices"]["IPP"] >= 0.25
    assert r["indices"]["IIN"] >= 0.5


def test_asimismo_legitimo_no_flagged():
    # El 'asimismo' humano va a mitad de oración con dato concreto después.
    f = audit_elements([_para(HUMANO[0][1], "h1")])
    ai = [x for x in f if x["kind"] == "ai_phrase"]
    assert ai == [], f"asimismo legítimo marcado: {ai}"


def test_repeticion_detectada():
    t = "El análisis muestra datos claros. El análisis confirma tendencias. El análisis revela patrones consistentes en todos los sectores estudiados."
    f = audit_elements([_para(t)])
    assert any(x["kind"] == "repeticion" for x in f)


def test_incompleta_detectada():
    f = audit_elements([_para("El equipo trabajó duro pero.")])
    assert any(x["kind"] == "incompleta" for x in f)


def test_persona_mezclada():
    f = audit_elements([_para("Nosotros aplicamos la encuesta y tú procesaste los datos.")])
    assert any(x["kind"] == "persona" for x in f)


def test_pregunta_abierta():
    f = audit_elements([_para("¿Cuáles fueron las consecuencias de esta decisión tan compleja para todos")])
    kinds = [x["kind"] for x in f]
    assert "incompleta" in kinds
