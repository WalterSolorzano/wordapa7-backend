"""El auditor visual NO puede evadir el router de IA.

`visual_auditor.audit_pdf_with_multimodal_llm` hacía `requests.post` directo a
`integrate.api.nvidia.com`. Eso lo dejaba fuera del TokenBucket, de los
cooldowns, del breaker y del presupuesto diario: el cupo se consumía sin
contarse y un 429 no se respetaba. La señal de que eso volvió es una llamada
HTTP directa en la fuente.
"""

from pathlib import Path

FUENTE = (
    Path(__file__).resolve().parent.parent / "modules" / "visual_auditor.py"
).read_text(encoding="utf-8")


def test_no_hay_requests_post_en_el_auditor_visual():
    assert "requests.post(" not in FUENTE, (
        "El auditor visual volvió a llamar a requests.post directo: evade el "
        "rate limiting del router."
    )
    assert "import requests" not in FUENTE, (
        "El auditor visual volvió a importar requests: no debe hacer HTTP propio."
    )


def test_no_hay_url_directa_de_nvidia():
    assert "integrate.api.nvidia.com" not in FUENTE, (
        "El auditor visual volvió a pegarle a la URL de NVIDIA directo en vez "
        "de pasar por execute_with_specialty."
    )


def test_pasa_por_el_router():
    assert "execute_with_specialty" in FUENTE, (
        "El auditor visual debe enrutar la consulta por execute_with_specialty."
    )
