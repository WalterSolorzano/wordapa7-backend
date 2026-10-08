"""
WordAPA7 — Persistencia de claves de IA

Las claves de API guardadas por el usuario en la UI (localStorage) se inyectan
en os.environ via /api/sync-provider-keys. Pero os.environ se pierde cuando el
backend Python se reinicia (watchdog, actualizaciones, crash). Este modulo
persiste las claves en un archivo JSON dentro de STORAGE_DIR para que se
restauren automaticamente al arrancar.
"""

import json
import os
from pathlib import Path

from config import STORAGE_DIR

# Variables de entorno de proveedores soportados (orden estable).
#
# ANTES: trece, todas de clave, y `HUGGINGFACE_API_KEY` no estaba. La UI
# mostraba el campo de HuggingFace, aceptaba la clave y la clave se perdia en
# el renderer; y aunque llegara, no se persistia, asi que desaparecia en cada
# reinicio del backend. Tres listas seguidas y las tres la omitian.
#
# AHORA: el catalogo completo, claves y modelos. Los modelos tambien se
# guardan, porque uno que la UI ofrece y el backend lee, pero que no sobrevive
# al reinicio, funciona en la sesion en que lo escribiste y no en la siguiente.
#
# Esta lista es la que lee el endpoint `/api/sync-provider-keys` para decidir
# que acepta, asi que agregar un proveedor es agregar UNA entrada y no
# acordarse de tres lugares.
VARIABLES_DE_CLAVE: list[str] = [
    "NVIDIA_API_KEY",
    "GROQ_API_KEY",
    "OPENROUTER_API_KEY",
    "CEREBRAS_API_KEY",
    "MISTRAL_API_KEY",
    "OPENCODEZEN_API_KEY",
    "ZENMUX_API_KEY",
    "GEMINI_API_KEY",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "AION_API_KEY",
    "KILOCODE_API_KEY",
    "OLLAMA_API_KEY",
    "HUGGINGFACE_API_KEY",
    "MODELSCOPE_API_KEY",
    "SAMBANOVA_API_KEY",
    "DASHSCOPE_API_KEY",
    "AGNES_AI_API_KEY",
]

VARIABLES_DE_MODELO: list[str] = [
    "NVIDIA_NIM_MODEL",
    "GROQ_MODEL",
    "OPENROUTER_MODEL",
    "CEREBRAS_MODEL",
    "MISTRAL_MODEL",
    "OPENCODEZEN_MODEL",
    "ZENMUX_MODEL",
    "GEMINI_MODEL",
    "CLOUDFLARE_AI_MODEL",
    "AION_MODEL",
    "KILOCODE_MODEL",
    "OLLAMA_MODEL",
    "HUGGINGFACE_MODEL",
    "MODELSCOPE_MODEL",
    "SAMBANOVA_MODEL",
    "DASHSCOPE_MODEL",
    "AGNES_AI_MODEL",
]

# Lo que el endpoint acepta y lo que se persiste. El mismo conjunto, derivado
# de una sola vez: dos listas que "se parecen" son dos listas que un dia no se
# parecen.
PROVIDER_ENV_VARS: list[str] = VARIABLES_DE_CLAVE + VARIABLES_DE_MODELO

# Que variables de entorno necesita cada proveedor, y en que orden. Vive aca y
# no en `llm_classifier` porque `llm_classifier` la lee para armar sus entradas y
# esta la necesita para lo mismo: una tabla de "que clave necesita cada uno" en
# dos lugares es una tabla que un dia no coincide.
#
# Cloudflare tiene DOS porque sin el id de cuenta su endpoint no se puede
# construir. Y el modelo de cada uno va junto, porque el modelo es parte de la
# identidad del proveedor: un ping que dice "esto anda" sin decir con que modelo
# no deja al usuario saber que va a pasar despues.
VARIABLES_DE_CLAVE_POR_ID: dict[str, list[str]] = {
    "nvidia_nim": ["NVIDIA_API_KEY"],
    "groq": ["GROQ_API_KEY"],
    "openrouter": ["OPENROUTER_API_KEY"],
    "cerebras": ["CEREBRAS_API_KEY"],
    "mistral": ["MISTRAL_API_KEY"],
    "opencodezen": ["OPENCODEZEN_API_KEY"],
    "zenmux": ["ZENMUX_API_KEY"],
    "gemini": ["GEMINI_API_KEY"],
    "cloudflare": ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
    "aion": ["AION_API_KEY"],
    "kilocode": ["KILOCODE_API_KEY"],
    "ollama_cloud": ["OLLAMA_API_KEY"],
    "huggingface": ["HUGGINGFACE_API_KEY"],
    "modelscope": ["MODELSCOPE_API_KEY"],
    "sambanova": ["SAMBANOVA_API_KEY"],
    "dashscope": ["DASHSCOPE_API_KEY"],
    "agnes_ai": ["AGNES_AI_API_KEY"],
}

# De todo lo permitido, lo que es una clave. Lo usa el endpoint para no
# distinguir: los dos se escriben igual, se guardan igual y llegan al entorno
# igual.
VARIABLES_QUE_SON_CLAVE = set(VARIABLES_DE_CLAVE)


def _keys_path() -> Path:
    return STORAGE_DIR / "ai_keys.json"


def save_provider_keys(keys: dict) -> None:
    """Persiste en el archivo las variables del catalogo que tengan valor.

    Se filtra por `PROVIDER_ENV_VARS` y no solo por "no vacio": un endpoint que
    acepta cualquier nombre escribiria en disco un `GROQ_MODLEL` — el typo— y
    devolveria que lo aplico. Al filtrar, lo que no es del catalogo no llega a
    ningun lado, que es la unica respuesta honesta a un nombre que no existe.

    Los modelos tambien se guardan. Son variables de entorno como las claves y
    se leen igual, asi que su persistencia es la misma y va en el mismo archivo.
    """
    try:
        clean = {
            k: v for k, v in (keys or {}).items()
            if k in set(PROVIDER_ENV_VARS) and v and str(v).strip()
        }
        if not clean:
            return
        _keys_path().write_text(
            json.dumps(clean, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception as e:
        print(f"[WARN] No se pudieron persistir las claves de IA: {e}")


def load_provider_keys_into_env() -> int:
    """
    Carga las claves guardadas en os.environ (sin sobrescribir las ya presentes,
    por ejemplo las inyectadas por el gestor de entorno de Electron).
    Retorna cuantas claves se aplicaron.
    """
    try:
        if not _keys_path().exists():
            return 0
        data = json.loads(_keys_path().read_text(encoding="utf-8"))
    except Exception as e:
        print(f"[WARN] No se pudieron leer las claves persistidas de IA: {e}")
        return 0

    applied = 0
    for env_var in PROVIDER_ENV_VARS:
        val = str(data.get(env_var, "") or "").strip()
        if val and env_var not in os.environ:
            os.environ[env_var] = val
            applied += 1
    return applied
