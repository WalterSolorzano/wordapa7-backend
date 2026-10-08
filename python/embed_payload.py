"""
WordAPA7 — Generador de payload de claves embebidas (instalador)

Lee el .env local y empaqueta las claves de los proveedores de IA de forma
ofuscada (XOR + base64, semilla compartida con embedded_secrets.py) dentro de
python/_embedded_payload.json. Ese archivo viaja en el instalador y permite que
la IA funcione sin configuracion, sin que las claves aparezcan en texto plano
en el binario.

Se ejecuta antes de PyInstaller (paso build:backend). Las claves NUNCA se
suben a git: el payload generado esta en .gitignore.
"""

import base64
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "_embedded_payload.json"

try:
    from persistence.ai_keys import VARIABLES_DE_CLAVE as PROVIDERS
except ImportError:
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from persistence.ai_keys import VARIABLES_DE_CLAVE as PROVIDERS


def load_env(path: Path) -> dict:
    env = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    return env


def build_payload(env: dict, *, allow_empty: bool = False) -> dict:
    """Ofusca las claves presentes en `env` y devuelve el payload del instalador.

    Separa la logica de `main()` para poder probarla sin tocar disco. Si no hay
    ninguna clave y `allow_empty` es False, aborta con SystemExit: un payload
    vacio deja el instalador sin IA y no puede pasar el build en silencio.
    """
    from embedded_secrets import SEED

    key = hashlib.sha256(SEED.encode("utf-8")).digest()

    payload = {}
    missing = []
    for name in PROVIDERS:
        val = env.get(name, "")
        if not val:
            missing.append(name)
            continue
        data = val.encode("utf-8")
        enc = bytes(c ^ key[i % len(key)] for i, c in enumerate(data))
        payload[name] = base64.b64encode(enc).decode("ascii")

    if not payload and not allow_empty:
        print("ERROR: _embedded_payload.json saldria vacio. Revisa .env antes de construir el instalador.")
        raise SystemExit(1)
    return payload


def main() -> int:
    env = load_env(ROOT / ".env")
    payload = build_payload(env)

    # Siempre se escribe el archivo (aunque sea vacio) para que PyInstaller
    # no falle por un datas que apunta a un archivo inexistente.
    OUT.write_text(json.dumps(payload), encoding="utf-8")

    if payload:
        print(f"[embed_payload] [OK] {len(payload)} claves ofuscadas -> {OUT.name} (ilegibles en el binario)")
    else:
        print(f"[embed_payload] [WARN] No hay claves en .env; el instalador usara solo heuristica")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
