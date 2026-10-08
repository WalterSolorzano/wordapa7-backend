"""Limites reales por proveedor y presupuesto diario para no abusar de la cuota.

Los valores salen de la documentacion oficial de cada proveedor (ver spec). Un
valor None = "desconocido": el router entonces es conservador pero no bloquea por
un dato que no tiene. Nunca se inventan numeros.
"""
from __future__ import annotations

import os
import random
import time
from dataclasses import dataclass, field
from email.utils import parsedate_to_datetime
from typing import Dict, Mapping, Optional

# rpm/rph/rpd/tpm/tpd: requests y tokens por minuto/hora/dia. concurrency:
# llamadas simultaneas maximas. fuente/fecha: de donde salio el dato.
LIMITES_REALES: Dict[str, Dict[str, Optional[int]]] = {
    "groq":       {"rpm": 30, "rph": None, "rpd": 1000, "tpm": 8000, "tpd": 200000, "concurrency": 4, "fuente": "console.groq.com/docs/rate-limits", "fecha": "2026-10-04"},
    "openrouter": {"rpm": 20, "rph": None, "rpd": 50,   "tpm": None, "tpd": None,   "concurrency": 2, "fuente": "openrouter.ai/docs/api-reference/limits", "fecha": "2026-10-04"},
    "cerebras":   {"rpm": 5,  "rph": None, "rpd": 1000000, "tpm": 30000, "tpd": 1000000, "concurrency": 2, "fuente": "inference-docs.cerebras.ai/support/rate-limits", "fecha": "2026-10-04"},
    "gemini":     {"rpm": 10, "rph": None, "rpd": None, "tpm": None, "tpd": None,   "concurrency": 2, "fuente": "ai.google.dev/gemini-api/docs/rate-limits", "fecha": "2026-10-04"},
    "cloudflare": {"rpm": 20, "rph": None, "rpd": None, "tpm": None, "tpd": None,   "concurrency": 2, "fuente": "developers.cloudflare.com/workers-ai/platform/limits", "fecha": "2026-10-04"},
    "nvidia_nim": {"rpm": 30, "rph": None, "rpd": None, "tpm": None, "tpd": None,   "concurrency": 4, "fuente": "build.nvidia.com (conservador, doc no accesible)", "fecha": "2026-10-04"},
    "huggingface":{"rpm": 20, "rph": None, "rpd": None, "tpm": None, "tpd": None,   "concurrency": 2, "fuente": "huggingface.co/docs/api-inference/rate-limits", "fecha": "2026-10-04"},
    "mistral":    {"rpm": 10, "rph": None, "rpd": None, "tpm": None, "tpd": None,   "concurrency": 2, "fuente": "conservador (sin doc publica accesible)", "fecha": "2026-10-04"},
    "opencodezen":{"rpm": 10, "rph": None, "rpd": None, "tpm": None, "tpd": None,   "concurrency": 2, "fuente": "conservador", "fecha": "2026-10-04"},
    "zenmux":     {"rpm": 10, "rph": None, "rpd": None, "tpm": None, "tpd": None,   "concurrency": 2, "fuente": "conservador", "fecha": "2026-10-04"},
    "aion":       {"rpm": 15, "rph": None, "rpd": None, "tpm": None, "tpd": 20000,  "concurrency": 2, "fuente": "comentario original: 20K TPD", "fecha": "2026-10-04"},
    "kilocode":   {"rpm": 15, "rph": None, "rpd": None, "tpm": None, "tpd": None,   "concurrency": 2, "fuente": "conservador", "fecha": "2026-10-04"},
    "ollama_cloud":{"rpm": 15, "rph": None, "rpd": None, "tpm": None, "tpd": None,  "concurrency": 2, "fuente": "conservador", "fecha": "2026-10-04"},
    "modelscope": {"rpm": 10, "rph": None, "rpd": None, "tpm": None, "tpd": None,   "concurrency": 2, "fuente": "conservador", "fecha": "2026-10-04"},
    "sambanova":  {"rpm": 10, "rph": None, "rpd": None, "tpm": None, "tpd": None,   "concurrency": 2, "fuente": "conservador", "fecha": "2026-10-04"},
    "dashscope":  {"rpm": 10, "rph": None, "rpd": None, "tpm": None, "tpd": None,   "concurrency": 2, "fuente": "conservador", "fecha": "2026-10-04"},
    "agnes_ai":   {"rpm": 10, "rph": None, "rpd": None, "tpm": None, "tpd": None,   "concurrency": 2, "fuente": "conservador", "fecha": "2026-10-04"},
}


def limite(p_id: str, clave: str, default: Optional[int] = None) -> Optional[int]:
    return LIMITES_REALES.get(p_id, {}).get(clave, default)


def retry_after_s(headers: Mapping[str, str]) -> Optional[float]:
    """Lee el header Retry-After (segundos o fecha HTTP) o el reset de cuota."""
    raw = headers.get("Retry-After") or headers.get("retry-after")
    if raw:
        raw = raw.strip()
        if raw.isdigit():
            return float(raw)
        try:
            cuando = parsedate_to_datetime(raw)
            return max(0.0, cuando.timestamp() - time.time())
        except (TypeError, ValueError):
            pass
    reset = headers.get("x-ratelimit-reset-requests") or headers.get("X-RateLimit-Reset")
    if reset and reset.strip().isdigit():
        return float(reset.strip())
    return None


def backoff_con_jitter(attempt: int, base: float = 1.0, cap: float = 60.0) -> float:
    """Espera exponencial con jitter uniforme, nunca mayor que cap."""
    techo = min(cap, base * (2 ** attempt))
    return random.uniform(0, techo)


def cooldown_para(status: int, headers: Mapping[str, str]) -> float:
    """Cuanto enfriar el proveedor segun el status; honra Retry-After en 429."""
    if status == 429:
        ra = retry_after_s(headers)
        return max(30.0, ra) if ra is not None else 30.0
    if status in (401, 403, 404, 410):
        return 600.0
    return 15.0


@dataclass
class PresupuestoDiario:
    """Registra el consumo del dia por proveedor y raciona.

    El cupo por usuario es una fraccion del free tier (default 45%, pensado para
    2 usuarios por clave dejando ~10% de margen). Configurable por env.
    """
    fraccion_de_cupo: float = field(
        default_factory=lambda: float(os.getenv("AI_CUPO_FRACCION", "0.45"))
    )
    _usado: Dict[str, int] = field(default_factory=dict)
    _dia: str = ""

    def _hoy(self) -> str:
        return time.strftime("%Y-%m-%d")

    def _reset_si_cambio_el_dia(self) -> None:
        hoy = self._hoy()
        if hoy != self._dia:
            self._dia = hoy
            self._usado.clear()

    def cupo(self, p_id: str) -> Optional[int]:
        rpd = limite(p_id, "rpd")
        if rpd is None:
            return None
        return int(rpd * self.fraccion_de_cupo)

    def restante(self, p_id: str) -> Optional[int]:
        self._reset_si_cambio_el_dia()
        cupo = self.cupo(p_id)
        if cupo is None:
            return None
        return max(0, cupo - self._usado.get(p_id, 0))

    def puede(self, p_id: str) -> bool:
        r = self.restante(p_id)
        return r is None or r > 0

    def registrar(self, p_id: str, tokens: int = 0) -> None:
        self._reset_si_cambio_el_dia()
        self._usado[p_id] = self._usado.get(p_id, 0) + 1
