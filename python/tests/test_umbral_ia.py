"""Un solo umbral de IA: el backend y el frontend no pueden divergir."""
import re
from pathlib import Path


def test_umbral_backend_espeja_frontend():
    raiz = Path(__file__).resolve().parents[2]
    main_py = (raiz / "python" / "main.py").read_text(encoding="utf-8")
    ai_perfil = (raiz / "src" / "lib" / "aiPerfil.ts").read_text(encoding="utf-8")

    backend = re.search(r"^AI_UMBRAL\s*=\s*(\d+)", main_py, re.MULTILINE)
    frontend = re.search(r"export const UMBRAL_IA\s*=\s*(\d+)", ai_perfil)

    assert backend is not None, "main.py debe declarar AI_UMBRAL"
    assert frontend is not None, "aiPerfil.ts debe declarar UMBRAL_IA"
    assert backend.group(1) == frontend.group(1)
