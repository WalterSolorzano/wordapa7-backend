"""Sonda de proveedores de LLM: cual key hay, cual responde, y con que limites.

Por que vive aca y no en `python/`: `test_packaging.py` falla si aparece un `.py`
suelto en `python/` sin registrar en `py-modules`, y esta es una herramienta de
diagnostico, no codigo de producto. Va en `tools/`.

Por que existe: `get_ai_system_health()` lee CONFIGURACION, no prueba nada. El
2026-09-27|reportaba las tres especialidades en "good" con ocho proveedores
configurados, y al pegarle una peticion a cada uno **ninguno respondia**.

Ojo con una cosa que ya se dio mal una vez: esta sonda tiene que cargar
`.env` como lo hace la app (`main.py:27`, `load_dotenv`). Sin eso lee el entorno
del proceso, que es un subconjunto, y reporta "SIN KEY" de proveedores que si la
tienen en el archivo. La razon de que `tools/llm_probe.py` imports dotenv.

Uso:
    python tools/llm_probe.py            # estado y detalle
    python tools/llm_probe.py --modelos  # que modelos responden en cada uno
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

_RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_RAIZ / "python"))

# La app lee el .env de la raiz; esta sonda tiene que leerlo tambien o mide una
# configuracion que no es la que corre.
try:
    from dotenv import load_dotenv

    load_dotenv(_RAIZ / ".env")
except ImportError:
    print("AVISO: sin python-dotenv, se lee solo el entorno del proceso")

NAV = {"User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"),
       "Accept": "application/json", "Accept-Language": "en-US,en;q=0.9"}

# (id, url, envvar, modelo). El User-Agent de navegador no es cosmetico:
# Cloudflare devuelve "error code: 1010" —una firma de bloqueo por UA— en vez
# del 401 real, y eso manda a buscar un problema de autenticacion que no existe.
TARGETS = {
    "nvidia_nim": ("https://integrate.api.nvidia.com/v1/chat/completions",
                   "NVIDIA_API_KEY", "nvidia/nemotron-3-super-120b-a12b"),
    "groq": ("https://api.groq.com/openai/v1/chat/completions",
             "GROQ_API_KEY", "openai/gpt-oss-120b"),
    "openrouter": ("https://openrouter.ai/api/v1/chat/completions",
                   "OPENROUTER_API_KEY", "meta-llama/llama-3.3-70b-instruct"),
    "cerebras": ("https://api.cerebras.ai/v1/chat/completions",
                 "CEREBRAS_API_KEY", "llama3.1-70b"),
    "mistral": ("https://api.mistral.ai/v1/chat/completions",
                "MISTRAL_API_KEY", "mistral-small-latest"),
    "opencodezen": ("https://opencodezen.io/api/v1/chat/completions",
                    "OPENCODEZEN_API_KEY", "meta-llama/llama-3.3-70b-instruct"),
    "zenmux": ("https://zenmux.ai/api/v1/chat/completions",
               "ZENMUX_API_KEY", "anthropic/claude-opus-5.5"),
    "gemini": ("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent",
               "GEMINI_API_KEY", "gemini-2.5-flash"),
    "cloudflare": ("https://api.cloudflare.com/client/v4/accounts/%s/ai/run/%s",
                   "CLOUDFLARE_API_TOKEN", "@cf/meta/llama-3.1-8b-instruct"),
    "aion": ("https://api.aionlabs.ai/v1/chat/completions",
             "AION_API_KEY", "aion-labs/aion-2.0"),
    "kilocode": ("https://api.kilo.ai/api/gateway/chat/completions",
                 "KILOCODE_API_KEY", "kilo-auto/free"),
}

# Que probar cuando el proveedor responde 404 de MODELO: la key esta bien y lo
# que esta mal es el nombre.
MODELOS_ALTERNATIVOS = {
    "cerebras": ["llama-3.3-70b", "qwen-3-32b", "gpt-oss-120b"],
    "nvidia_nim": ["nvidia/llama-3.1-nemotron-70b-instruct", "qwen/qwen3-235b"],
    "zenmux": ["anthropic/claude-opus-5.5", "openai/gpt-6-luna"],
}


def pega(url, headers, body, timeout=30):
    t0 = time.time()
    try:
        req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                     headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=timeout) as r:
            datos = json.loads(r.read())
        txt = ((datos.get("choices") or [{}])[0].get("message", {}).get("content")
               or datos.get("candidates", [{}])[0]
               .get("content", {}).get("parts", [{}])[0].get("text", ""))
        return "OK", int((time.time() - t0) * 1000), (txt or "")[:24]
    except urllib.error.HTTPError as e:
        return (f"HTTP {e.code}", int((time.time() - t0) * 1000),
                " ".join(e.read().decode("utf-8", "replace").split())[:90])
    except Exception as e:  # noqa: BLE001 — la sonda reporta, no propaga
        return type(e).__name__, int((time.time() - t0) * 1000), str(e)[:90]


def sondea(pid, modelo_override=None):
    url, envvar, modelo = TARGETS[pid]
    if modelo_override:
        modelo = modelo_override
    key = os.getenv(envvar, "")
    if not key:
        return {"estado": "SIN KEY", "ms": 0, "detalle": ""}
    if pid == "gemini":
        url = url % modelo
        h = {**NAV, "x-goog-api-key": key, "Content-Type": "application/json"}
        body = {"contents": [{"parts": [{"text": "di OK"}]}],
                "generationConfig": {"maxOutputTokens": 8}}
    elif pid == "cloudflare":
        acct = os.getenv("CLOUDFLARE_ACCOUNT_ID", "")
        if not acct:
            return {"estado": "SIN ACCOUNT_ID", "ms": 0, "detalle": ""}
        url = url % (acct, modelo)
        h = {**NAV, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        body = {"messages": [{"role": "user", "content": "di OK"}], "max_tokens": 8}
    else:
        h = {**NAV, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        body = {"model": modelo, "messages": [{"role": "user", "content": "di OK"}],
                "max_tokens": 8}
    est, ms, det = pega(url, h, body)
    return {"estado": est, "ms": ms, "detalle": det, "modelo": modelo}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--modelos", action="store_true",
                    help="Probar modelos alternativos en los que fallan")
    args = ap.parse_args()

    from classification.llm_classifier import PROVIDER_CAPACITY

    print(f"{'proveedor':14} {'rpm':>4} {'estado':10} {'ms':>6}  detalle")
    print("-" * 100)
    for pid in TARGETS:
        r = sondea(pid)
        rpm = PROVIDER_CAPACITY.get(pid, {}).get("requests_per_minute", "?")
        print(f"{pid:14} {str(rpm):>4} {r['estado']:10} {r['ms']:>6}  {r['detalle']}")
        if args.modelos and r["estado"] != "OK" and pid in MODELOS_ALTERNATIVOS:
            for alt in MODELOS_ALTERNATIVOS[pid]:
                if alt == r.get("modelo"):
                    continue
                a = sondea(pid, alt)
                marca = "<" if a["estado"] == "OK" else " "
                print(f"{marca} {pid:13} {'':4} {a['estado']:10} {a['ms']:>6}  "
                      f"{alt} :: {a['detalle']}")


if __name__ == "__main__":
    main()
