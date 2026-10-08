"""Matriz de conectividad: cual de las once keys funciona, y con que protocolo.

Cada proveedor se prueba con SU endpoint y SU formato, no con el que habia en
`llm_classifier.py`. Varios estaban mal ahi: Aion apuntaba a `api.aion.ai`
(DNS no resuelve) cuando el real es `api.aionlabs.ai`; Kilo apuntaba a
`kilocode.ai` cuando el real es `kilo.ai/api/gateway`; y la key que estaba en
`CLOUDFLARE_API_TOKEN` no es de Cloudflare Workers AI sino de un gateway con
otro protocolo.

Nunca imprime una key: solo si responde y con que codigo.

    python tools/llm_connect.py
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

_RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_RAIZ / "python"))
try:
    from dotenv import load_dotenv

    load_dotenv(_RAIZ / ".env")
except ImportError:
    pass

NAV = {"User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"),
       "Accept": "application/json", "Accept-Language": "en-US,en;q=0.9"}


def pega(url, headers, body=None, metodo="POST", timeout=40):
    t0 = time.time()
    try:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, headers=headers, method=metodo)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            crudo = r.read()
        ms = int((time.time() - t0) * 1000)
        try:
            d = json.loads(crudo)
        except Exception:  # noqa: BLE001
            return "OK(no-json)", ms, crudo[:70].decode("utf-8", "replace")
        return "OK", ms, json.dumps(d)[:70]
    except urllib.error.HTTPError as e:
        return (f"HTTP {e.code}", int((time.time() - t0) * 1000),
                " ".join(e.read().decode("utf-8", "replace").split())[:80])
    except Exception as e:  # noqa: BLE001
        return type(e).__name__, int((time.time() - t0) * 1000), str(e)[:70]


def openai(modelo, key, base, extra_path="/chat/completions", max_tokens=20):
    """El formato que comparten casi todos: OpenAI-compatible."""
    url = base.rstrip("/") + extra_path
    h = {**NAV, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    return pega(url, h, {"model": modelo, "max_tokens": max_tokens,
                         "messages": [{"role": "user", "content": "di OK"}]})


def catalogo(url, key):
    h = {**NAV, "Authorization": f"Bearer {key}"}
    est, ms, det = pega(url, h, None, "GET")
    if est != "OK":
        return None
    try:
        return [m.get("id") for m in json.loads(det).get("data", [])]
    except Exception:  # noqa: BLE001
        return None


def main():
    print(f"{'proveedor':22} {'estado':10} {'ms':>6}  detalle")
    print("-" * 96)
    res = {}

    def fila(nombre, env, fn):
        key = os.getenv(env, "")
        if not key:
            res[nombre] = ("SIN KEY", 0, "")
            print(f"{nombre:22} {'SIN KEY':10} {0:>6}")
            return None
        est, ms, det = fn(key)
        res[nombre] = (est, ms, det)
        print(f"{nombre:22} {est:10} {ms:>6}  {det}")
        return est == "OK"

    # 1. NVIDIA NIM — el modeloConfigured murio; hay que ver el catalogo vivo.
    def nvidia(key):
        url = "https://integrate.api.nvidia.com/v1/chat/completions"
        h = {**NAV, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        for m in ["nvidia/llama-3.1-nemotron-70b-instruct",
                  "nvidia/llama-3.3-nemotron-super-49b-v1",
                  "meta/llama-3.1-70b-instruct"]:
            est, ms, det = pega(url, h, {"model": m, "max_tokens": 16,
                                         "messages": [{"role": "user", "content": "di OK"}]})
            if est == "OK":
                return "OK", ms, f"modelo={m}"
        return est, ms, det
    fila("nvidia_nim", "NVIDIA_API_KEY", nvidia)

    # 2. Groq — el codigo ya tenia la URL bien; la key era lo que fallaba.
    fila("groq", "GROQ_API_KEY",
         lambda k: openai("openai/gpt-oss-120b", k, "https://api.groq.com/openai/v1"))

    # 3. Gemini por su endpoint OpenAI-compatible (no el nativo de Google).
    def gemini(key):
        return openai("gemini-2.5-flash", key,
                      "https://generativelanguage.googleapis.com/v1beta/openai")
    fila("gemini", "GEMINI_API_KEY", gemini)

    # 4. Aion Labs — el codigo apuntaba a api.aion.ai, que no resuelve.
    def aion(key):
        for m in ["aion-labs/aion-3.0-mini", "aion-labs/aion-2.0"]:
            est, ms, det = openai(m, key, "https://api.aionlabs.ai/v1")
            if est == "OK":
                return "OK", ms, f"modelo={m}"
        return est, ms, det
    fila("aion", "AION_API_KEY", aion)

    # 5. Kilo Code — el codigo apuntaba a kilocode.ai; el real es kilo.ai.
    fila("kilocode", "KILOCODE_API_KEY",
         lambda k: openai("kilo-auto/free", k, "https://api.kilo.ai/api/gateway"))

    # 6. Ollama Cloud.
    def ollama(key):
        for m in ["gpt-oss:20b", "nemotron-3-nano:30b"]:
            est, ms, det = openai(m, key, "https://ollama.com/v1")
            if est == "OK":
                return "OK", ms, f"modelo={m}"
        return est, ms, det
    fila("ollama_cloud", "OLLAMA_API_KEY", ollama)

    # 7. HuggingFace router.
    def hf(key):
        base = "https://router.huggingface.co/v1"
        est, ms, det = openai("meta-llama/Llama-3.1-8B-Instruct", key, base)
        if est != "OK":
            ids = catalogo(base, key) or []
            if ids:
                est2, ms2, det2 = openai(ids[0], key, base)
                return est2, ms2, f"catalogo->{ids[0]}"
        return est, ms, det
    fila("huggingface", "HUGGINGFACE_API_KEY", hf)

    # 8. ModelScope.
    def ms_scope(key):
        for base in ["https://api-inference.modelscope.cn/v1",
                     "https://api.modelscope.cn/v1"]:
            est, ms2, det = openai("Qwen/Qwen2.5-7B-Instruct", key, base)
            if est == "OK":
                return "OK", ms2, f"base={base}"
        return est, ms2, det
    fila("modelscope", "MODELSCOPE_API_KEY", ms_scope)

    # 9. SambaNova.
    fila("sambanova", "SAMBANOVA_API_KEY",
         lambda k: openai("Meta-Llama-3.3-70B-Instruct", k, "https://api.sambanova.ai/v1"))

    # 10. Agnes AI — base desconocida; se prueban las de sk- mas habituales.
    def agnes(key):
        for base in ["https://api.agnes.ai/v1", "https://agnes.ai/api/v1",
                     "https://api.agnesa.ai/v1"]:
            est, ms, det = openai("gpt-4o-mini", key, base)
            if est == "OK":
                return "OK", ms, f"base={base}"
        return est, ms, det
    fila("agnes_ai", "AGNES_AI_API_KEY", agnes)

    # 11. El gateway raro: la key tiene forma de DashScope, no de Cloudflare.
    def dash(key):
        for base in ["https://dash.llm7.io/compatible-mode/v1",
                     "https://dash.llm7.io/v1",
                     "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"]:
            est, ms, det = openai("qwen-plus", key, base)
            if est == "OK":
                return "OK", ms, f"base={base}"
        return est, ms, det
    fila("dash(dashscope)", "DASHSCOPE_API_KEY", dash)

    # Lo que la de Cloudflare Workers AI, por separado: si la key de .env era en
    # realidad la del gateway raro, esto da 401 y no hay proveedor de Cloudflare.
    def cf(key):
        acct = os.getenv("CLOUDFLARE_ACCOUNT_ID", "")
        if not acct:
            return "SIN ACCOUNT_ID", 0, ""
        url = (f"https://api.cloudflare.com/client/v4/accounts/{acct}/ai/run/"
               "@cf/meta/llama-3.1-8b-instruct")
        return pega(url, {**NAV, "Authorization": f"Bearer {key}",
                          "Content-Type": "application/json"},
                    {"messages": [{"role": "user", "content": "di OK"}], "max_tokens": 16})
    fila("cloudflare_wai", "CLOUDFLARE_API_TOKEN", cf)

    vivos = [k for k, v in res.items() if v[0] == "OK"]
    print()
    print(f"RESPONDEN {len(vivos)}/{len(res)}: {', '.join(vivos)}")


if __name__ == "__main__":
    main()
